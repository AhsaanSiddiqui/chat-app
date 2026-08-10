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

  const { socket, axios } = useContext(AuthContext);

  const usersRef = useRef(users);
  const selectedUserRef = useRef(selectedUser);
  const setSelectedUserRef = useRef(setSelectedUser);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    setSelectedUserRef.current = setSelectedUser;
  }, [setSelectedUser]);

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
    try {
      const { data } = await axios.get(`/api/messages/${userId}`);
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const sendMessage = async (messageData) => {
    try {
      const { data } = await axios.post(
        `/api/messages/send/${selectedUser._id}`,
        messageData
      );
      if (data.success) {
        setMessages((preMessages) => [...preMessages, data.newMessage]);
      }
    } catch (error) {
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
      } else {
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

    socket.on("newMessage", onNewMessage);
    socket.on("messageUpdated", onMessageUpdated);
    socket.on("messageDeleted", onMessageDeleted);

    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("messageUpdated", onMessageUpdated);
      socket.off("messageDeleted", onMessageDeleted);
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
  };

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
};
