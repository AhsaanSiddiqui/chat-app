import { useContext, useEffect, useRef, useState, createContext } from "react";
import { AuthContext } from "./AuthContext";
import { toast } from "react-hot-toast";
import {
  isAppInBackground,
  showChatNotification,
} from "../src/lib/notifications";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unseenMessages, setUnseenMessages] = useState({});
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const { socket, axios, authUser } = useContext(AuthContext);

  const usersRef = useRef(users);
  const selectedUserRef = useRef(selectedUser);
  const setSelectedUserRef = useRef(setSelectedUser);
  const messagesRef = useRef(messages);
  const messageCacheRef = useRef({});
  const messagesAbortRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    setSelectedUserRef.current = setSelectedUser;
  }, [setSelectedUser]);

  // Keep open-chat cache in sync with live message updates
  useEffect(() => {
    const userId = selectedUser?._id;
    if (!userId || messagesLoading) return;
    messageCacheRef.current[userId] = messages;
  }, [messages, selectedUser?._id, messagesLoading]);

  // Clear typing when switching chats
  useEffect(() => {
    setIsOtherUserTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
  }, [selectedUser?._id]);

  const emitTyping = (receiverId, isTyping) => {
    if (!socket || !receiverId) return;
    socket.emit("typing", { receiverId, isTyping });
  };

  const startTyping = () => {
    if (!selectedUser?._id) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      emitTyping(selectedUser._id, true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      emitTyping(selectedUser._id, false);
    }, 1500);
  };

  const stopTyping = () => {
    if (!selectedUser?._id) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (isTypingRef.current) {
      isTypingRef.current = false;
      emitTyping(selectedUser._id, false);
    }
  };

  const getUsers = async () => {
    try {
      const { data } = await axios.get("/api/messages/users");
      if (data.success) {
        setUsers(data.users);
        setUnseenMessages(data.unseenMessages);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const getMessages = async (userId) => {
    if (!userId) return;

    const cached = messageCacheRef.current[userId];
    if (cached) {
      setMessages(cached);
      setMessagesLoading(false);
    } else {
      setMessages([]);
      setMessagesLoading(true);
    }

    if (messagesAbortRef.current) {
      messagesAbortRef.current.abort();
    }
    const controller = new AbortController();
    messagesAbortRef.current = controller;

    try {
      const { data } = await axios.get(`/api/messages/${userId}`, {
        signal: controller.signal,
      });

      if (data.success) {
        messageCacheRef.current[userId] = data.messages;

        if (String(selectedUserRef.current?._id) === String(userId)) {
          setMessages(data.messages);
          setMessagesLoading(false);
        }

        setUnseenMessages((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    } catch (error) {
      if (
        error.code === "ERR_CANCELED" ||
        error.name === "CanceledError" ||
        error.name === "AbortError"
      ) {
        return;
      }
      if (String(selectedUserRef.current?._id) === String(userId)) {
        setMessagesLoading(false);
      }
      toast.error(error.message);
    }
  };

  const sendMessage = async (messageData) => {
    if (!selectedUser?._id || !authUser?._id) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text || "",
      image: messageData.image || "",
      seen: false,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    if (messageData.replyTo) {
      const original = messagesRef.current.find(
        (msg) => String(msg._id) === String(messageData.replyTo)
      );
      if (original) {
        optimisticMessage.replyTo = {
          messageId: original._id,
          senderId: original.senderId,
          text: original.isDeleted ? "" : original.text,
          image: original.isDeleted ? "" : original.image,
          isDeleted: !!original.isDeleted,
        };
      }
    }

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data } = await axios.post(
        `/api/messages/send/${selectedUser._id}`,
        messageData
      );
      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg._id) === tempId ? data.newMessage : msg
          )
        );
      } else {
        setMessages((prev) =>
          prev.filter((msg) => String(msg._id) !== tempId)
        );
        toast.error(data.message || "Failed to send message");
      }
    } catch (error) {
      setMessages((prev) => prev.filter((msg) => String(msg._id) !== tempId));
      toast.error(error.message);
    }
  };

  const editMessage = async (messageId, text) => {
    try {
      const { data } = await axios.put(`/api/messages/edit/${messageId}`, {
        text,
      });
      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg._id) === String(data.message._id) ? data.message : msg
          )
        );
        return true;
      }
      toast.error(data.message || "Failed to edit message");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      const { data } = await axios.delete(`/api/messages/delete/${messageId}`);
      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg._id) === String(data.message._id) ? data.message : msg
          )
        );
        return true;
      }
      toast.error(data.message || "Failed to delete message");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const notifyNewMessage = (newMessage) => {
    if (!isAppInBackground()) return;

    const sender = usersRef.current.find(
      (user) => String(user._id) === String(newMessage.senderId)
    );

    const title = sender?.fullName || "New message";
    const body = newMessage.text
      ? newMessage.text
      : newMessage.image
        ? "Sent a photo"
        : "New message";

    showChatNotification({
      title,
      body,
      icon: sender?.profilePic || undefined,
      tag: `chat-${newMessage.senderId}`,
      onClick: () => {
        if (sender) {
          setSelectedUserRef.current(sender);
        }
      },
    });
  };

  const isMessageInOpenChat = (message) => {
    const currentSelected = selectedUserRef.current;
    if (!currentSelected) return false;

    return (
      String(message.senderId) === String(currentSelected._id) ||
      String(message.receiverId) === String(currentSelected._id)
    );
  };

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (newMessage) => {
      const currentSelected = selectedUserRef.current;

      if (
        currentSelected &&
        String(newMessage.senderId) === String(currentSelected._id)
      ) {
        newMessage.seen = true;
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        axios.put(`/api/messages/mark/${newMessage._id}`);
        setIsOtherUserTyping(false);
      } else {
        // Keep inactive chat cache fresh so opening it feels instant
        const chatId = String(newMessage.senderId);
        if (messageCacheRef.current[chatId]) {
          messageCacheRef.current[chatId] = [
            ...messageCacheRef.current[chatId],
            newMessage,
          ];
        }

        setUnseenMessages((prevUnseenMessages) => ({
          ...prevUnseenMessages,
          [newMessage.senderId]: prevUnseenMessages[newMessage.senderId]
            ? prevUnseenMessages[newMessage.senderId] + 1
            : 1,
        }));
      }

      notifyNewMessage(newMessage);
    };

    const onMessageUpdated = (updatedMessage) => {
      if (!isMessageInOpenChat(updatedMessage)) return;
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(updatedMessage._id) ? updatedMessage : msg
        )
      );
    };

    const onMessageDeleted = (deletedMessage) => {
      if (!isMessageInOpenChat(deletedMessage)) return;
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(deletedMessage._id) ? deletedMessage : msg
        )
      );
    };

    const onTyping = ({ senderId, isTyping }) => {
      const currentSelected = selectedUserRef.current;
      if (
        currentSelected &&
        String(senderId) === String(currentSelected._id)
      ) {
        setIsOtherUserTyping(!!isTyping);
      }
    };

    const onMessagesSeen = ({ chatUserId, messageIds, seenAt }) => {
      const currentSelected = selectedUserRef.current;
      if (
        !currentSelected ||
        String(currentSelected._id) !== String(chatUserId)
      ) {
        return;
      }

      const idSet = new Set((messageIds || []).map(String));
      const readAt = seenAt || new Date().toISOString();
      setMessages((prev) =>
        prev.map((msg) =>
          idSet.has(String(msg._id))
            ? { ...msg, seen: true, seenAt: msg.seenAt || readAt }
            : msg
        )
      );
    };

    socket.on("newMessage", onNewMessage);
    socket.on("messageUpdated", onMessageUpdated);
    socket.on("messageDeleted", onMessageDeleted);
    socket.on("typing", onTyping);
    socket.on("messagesSeen", onMessagesSeen);

    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("messageUpdated", onMessageUpdated);
      socket.off("messageDeleted", onMessageDeleted);
      socket.off("typing", onTyping);
      socket.off("messagesSeen", onMessagesSeen);
    };
  }, [socket, axios]);

  const value = {
    messages,
    users,
    selectedUser,
    getUsers,
    getMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    setSelectedUser,
    unseenMessages,
    setUnseenMessages,
    isOtherUserTyping,
    startTyping,
    stopTyping,
    messagesLoading,
  };

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
};
