import { useContext, useEffect, useRef, useState, createContext } from "react";
import { AuthContext } from "./AuthContext";
import { toast } from "react-hot-toast";
import {
  isAppInBackground,
  showChatNotification,
} from "../src/lib/notifications";

export const ChatContext = createContext();

const SELECTED_CHAT_KEY = "quickchat_selected_user_id";
const SELECTED_GROUP_KEY = "quickchat_selected_group_id";

const resolveId = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id);
  return String(value);
};

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedUser, setSelectedUserState] = useState(null);
  const [selectedGroup, setSelectedGroupState] = useState(null);
  const [unseenMessages, setUnseenMessages] = useState({});
  const [unseenGroupMessages, setUnseenGroupMessages] = useState({});
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [groupTypingUsers, setGroupTypingUsers] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const { socket, axios, authUser, ensureSocketConnected } =
    useContext(AuthContext);

  const usersRef = useRef(users);
  const groupsRef = useRef(groups);
  const selectedUserRef = useRef(selectedUser);
  const selectedGroupRef = useRef(selectedGroup);
  const setSelectedUserRef = useRef(null);
  const setSelectedGroupRef = useRef(null);
  const messagesRef = useRef(messages);
  const messageCacheRef = useRef({});
  const groupMessageCacheRef = useRef({});
  const messagesAbortRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const chatRestoredRef = useRef(false);
  const hadAuthUserRef = useRef(false);
  const groupTypingTimeoutsRef = useRef({});

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
  }, [selectedGroup]);

  const setSelectedUser = (user) => {
    if (user) {
      setSelectedGroupState(null);
      localStorage.removeItem(SELECTED_GROUP_KEY);
    }
    setSelectedUserState(user);
  };

  const setSelectedGroup = (group) => {
    if (group) {
      setSelectedUserState(null);
      localStorage.removeItem(SELECTED_CHAT_KEY);
    }
    setSelectedGroupState(group);
  };

  useEffect(() => {
    setSelectedUserRef.current = setSelectedUser;
  }, []);

  useEffect(() => {
    setSelectedGroupRef.current = setSelectedGroup;
  }, []);

  useEffect(() => {
    if (selectedUser?._id) {
      localStorage.setItem(SELECTED_CHAT_KEY, selectedUser._id);
    }
  }, [selectedUser?._id]);

  useEffect(() => {
    if (selectedGroup?._id) {
      localStorage.setItem(SELECTED_GROUP_KEY, selectedGroup._id);
    }
  }, [selectedGroup?._id]);

  useEffect(() => {
    if (!authUser || chatRestoredRef.current) return;
    if (!users.length && !groups.length) return;

    chatRestoredRef.current = true;

    const savedGroupId = localStorage.getItem(SELECTED_GROUP_KEY);
    if (savedGroupId) {
      const foundGroup = groups.find(
        (group) => String(group._id) === String(savedGroupId)
      );
      if (foundGroup) {
        setSelectedGroupState(foundGroup);
        return;
      }
    }

    const savedUserId = localStorage.getItem(SELECTED_CHAT_KEY);
    if (savedUserId) {
      const foundUser = users.find(
        (user) => String(user._id) === String(savedUserId)
      );
      if (foundUser) setSelectedUserState(foundUser);
    }
  }, [users, groups, authUser]);

  useEffect(() => {
    if (authUser) {
      hadAuthUserRef.current = true;
      return;
    }

    setSelectedUserState(null);
    setSelectedGroupState(null);
    setMessages([]);
    setUsers([]);
    setGroups([]);
    setUnseenMessages({});
    setUnseenGroupMessages({});
    messageCacheRef.current = {};
    groupMessageCacheRef.current = {};
    chatRestoredRef.current = false;

    if (hadAuthUserRef.current) {
      localStorage.removeItem(SELECTED_CHAT_KEY);
      localStorage.removeItem(SELECTED_GROUP_KEY);
      hadAuthUserRef.current = false;
    }
  }, [authUser]);

  useEffect(() => {
    const userId = selectedUser?._id;
    if (!userId || messagesLoading) return;
    messageCacheRef.current[userId] = messages;
  }, [messages, selectedUser?._id, messagesLoading]);

  useEffect(() => {
    const groupId = selectedGroup?._id;
    if (!groupId || messagesLoading) return;
    groupMessageCacheRef.current[groupId] = messages;
  }, [messages, selectedGroup?._id, messagesLoading]);

  useEffect(() => {
    setIsOtherUserTyping(false);
    setGroupTypingUsers([]);
    Object.values(groupTypingTimeoutsRef.current).forEach(clearTimeout);
    groupTypingTimeoutsRef.current = {};

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
  }, [selectedUser?._id, selectedGroup?._id]);

  const emitTyping = ({ receiverId, groupId, isTyping }) => {
    if (!socket) return;
    if (groupId) {
      socket.emit("typing", { groupId, isTyping });
      return;
    }
    if (!receiverId) return;
    socket.emit("typing", { receiverId, isTyping });
  };

  const startTyping = () => {
    const targetUserId = selectedUser?._id;
    const targetGroupId = selectedGroup?._id;
    if (!targetUserId && !targetGroupId) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      emitTyping({
        receiverId: targetUserId,
        groupId: targetGroupId,
        isTyping: true,
      });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      emitTyping({
        receiverId: targetUserId,
        groupId: targetGroupId,
        isTyping: false,
      });
    }, 1500);
  };

  const stopTyping = () => {
    const targetUserId = selectedUser?._id;
    const targetGroupId = selectedGroup?._id;
    if (!targetUserId && !targetGroupId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (isTypingRef.current) {
      isTypingRef.current = false;
      emitTyping({
        receiverId: targetUserId,
        groupId: targetGroupId,
        isTyping: false,
      });
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

  const getGroups = async () => {
    try {
      const { data } = await axios.get("/api/groups/my");
      if (data.success) {
        setGroups(data.groups);
        setUnseenGroupMessages(data.unseenMessages || {});
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const createGroup = async ({ name, description, memberIds, groupPic }) => {
    try {
      const { data } = await axios.post("/api/groups/create", {
        name,
        description,
        memberIds,
        groupPic,
      });
      if (data.success) {
        setGroups((prev) => {
          const exists = prev.some(
            (g) => String(g._id) === String(data.group._id)
          );
          return exists ? prev : [data.group, ...prev];
        });
        setSelectedGroup(data.group);
        toast.success("Group created");
        return data.group;
      }
      toast.error(data.message || "Failed to create group");
      return null;
    } catch (error) {
      toast.error(error.message);
      return null;
    }
  };

  const addGroupMembers = async (groupId, memberIds) => {
    try {
      const { data } = await axios.post(`/api/groups/${groupId}/members`, {
        memberIds,
      });
      if (data.success) {
        setGroups((prev) =>
          prev.map((g) =>
            String(g._id) === String(data.group._id) ? data.group : g
          )
        );
        if (String(selectedGroupRef.current?._id) === String(data.group._id)) {
          setSelectedGroupState(data.group);
        }
        toast.success("Members added");
        return true;
      }
      toast.error(data.message || "Failed to add members");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const removeGroupMember = async (groupId, userId) => {
    try {
      const { data } = await axios.delete(
        `/api/groups/${groupId}/members/${userId}`
      );
      if (data.success) {
        const stillMember = data.group.members.some(
          (m) => resolveId(m) === String(authUser._id)
        );

        if (!stillMember) {
          setGroups((prev) =>
            prev.filter((g) => String(g._id) !== String(groupId))
          );
          if (String(selectedGroupRef.current?._id) === String(groupId)) {
            setSelectedGroupState(null);
            setMessages([]);
          }
          toast.success("Left group");
          return true;
        }

        setGroups((prev) =>
          prev.map((g) =>
            String(g._id) === String(data.group._id) ? data.group : g
          )
        );
        if (String(selectedGroupRef.current?._id) === String(data.group._id)) {
          setSelectedGroupState(data.group);
        }
        toast.success("Member removed");
        return true;
      }
      toast.error(data.message || "Failed to remove member");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const makeGroupAdmin = async (groupId, userId) => {
    try {
      const { data } = await axios.post(`/api/groups/${groupId}/admin`, {
        userId,
      });
      if (data.success) {
        setGroups((prev) =>
          prev.map((g) =>
            String(g._id) === String(data.group._id) ? data.group : g
          )
        );
        if (String(selectedGroupRef.current?._id) === String(data.group._id)) {
          setSelectedGroupState(data.group);
        }
        toast.success("Member is now an admin");
        return true;
      }
      toast.error(data.message || "Failed to update admin");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
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

  const getGroupMessages = async (groupId) => {
    if (!groupId) return;

    const cached = groupMessageCacheRef.current[groupId];
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
      const { data } = await axios.get(`/api/groups/${groupId}/messages`, {
        signal: controller.signal,
      });

      if (data.success) {
        groupMessageCacheRef.current[groupId] = data.messages;

        if (String(selectedGroupRef.current?._id) === String(groupId)) {
          setMessages(data.messages);
          setMessagesLoading(false);
        }

        setUnseenGroupMessages((prev) => {
          const next = { ...prev };
          delete next[groupId];
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
      if (String(selectedGroupRef.current?._id) === String(groupId)) {
        setMessagesLoading(false);
      }
      toast.error(error.message);
    }
  };

  const sendMessage = async (messageData) => {
    if (!authUser?._id) return;

    const files = Array.isArray(messageData.files)
      ? messageData.files.filter((f) => f instanceof File)
      : messageData.file instanceof File
        ? [messageData.file]
        : [];
    const hasFiles = files.length > 0;
    const pendingMeta = Array.isArray(messageData.pendingFiles)
      ? messageData.pendingFiles
      : [];

    const buildOptimistic = (extra = {}) => {
      const optimisticAttachments =
        pendingMeta.length > 0
          ? pendingMeta.map((item) => ({
              url:
                item.kind === "image" || item.kind === "audio"
                  ? item.previewUrl || ""
                  : "",
              name: item.name,
              size: item.size,
              mimeType: item.mimeType || "",
              kind: item.kind || "file",
              previewUrl: item.previewUrl || "",
              duration: item.duration || 0,
            }))
          : hasFiles
            ? files.map((file, index) => ({
                url:
                  (file.type?.startsWith("image/") ||
                    file.type?.startsWith("audio/")) &&
                  messageData.previewUrls?.[index]
                    ? messageData.previewUrls[index]
                    : "",
                name: file.name,
                size: file.size,
                mimeType: file.type,
                kind: messageData.fileKinds?.[index] || "file",
              }))
            : [];

      const firstImage =
        optimisticAttachments.find((a) => a.kind === "image" && a.url)?.url ||
        messageData.image ||
        "";

      const optimistic = {
        _id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: messageData.text || "",
        image: firstImage,
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        pending: true,
        ...extra,
      };

      if (optimisticAttachments.length) {
        optimistic.attachments = optimisticAttachments;
        optimistic.attachment = optimisticAttachments[0];
      }

      if (messageData.replyTo) {
        const original = messagesRef.current.find(
          (msg) => String(msg._id) === String(messageData.replyTo)
        );
        if (original) {
          const originalFiles =
            original.attachments?.length
              ? original.attachments
              : original.attachment
                ? [original.attachment]
                : [];
          optimistic.replyTo = {
            messageId: original._id,
            senderId: resolveId(original.senderId),
            text: original.isDeleted ? "" : original.text,
            image: original.isDeleted ? "" : original.image,
            fileName: original.isDeleted
              ? ""
              : originalFiles.length > 1
                ? `${originalFiles.length} files`
                : originalFiles[0]?.name || "",
            isDeleted: !!original.isDeleted,
          };
        }
      }

      return optimistic;
    };

    const postPayload = async (url) => {
      if (hasFiles) {
        const form = new FormData();
        if (messageData.text) form.append("text", messageData.text);
        if (messageData.replyTo) form.append("replyTo", messageData.replyTo);
        if (messageData.attachmentMeta) {
          form.append(
            "attachmentMeta",
            JSON.stringify(messageData.attachmentMeta)
          );
        }
        files.forEach((file) => form.append("files", file));
        return axios.post(url, form, { timeout: 900000 });
      }

      return axios.post(
        url,
        {
          text: messageData.text,
          image: messageData.image,
          replyTo: messageData.replyTo,
        },
        { timeout: messageData.image ? 180000 : 60000 }
      );
    };

    if (selectedGroup?._id) {
      const optimisticMessage = buildOptimistic({
        groupId: selectedGroup._id,
        senderId: {
          _id: authUser._id,
          fullName: authUser.fullName,
          profilePic: authUser.profilePic,
        },
        seenBy: [authUser._id],
      });
      const tempId = optimisticMessage._id;

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const { data } = await postPayload(
          `/api/groups/${selectedGroup._id}/messages`
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
      return;
    }

    if (!selectedUser?._id) return;

    const optimisticMessage = buildOptimistic({
      senderId: authUser._id,
      receiverId: selectedUser._id,
      seen: false,
    });
    const tempId = optimisticMessage._id;

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data } = await postPayload(
        `/api/messages/send/${selectedUser._id}`
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
      const isGroup = !!selectedGroupRef.current?._id;
      const { data } = await axios.put(
        isGroup
          ? `/api/groups/messages/${messageId}`
          : `/api/messages/edit/${messageId}`,
        { text }
      );
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
      const isGroup = !!selectedGroupRef.current?._id;
      const { data } = await axios.delete(
        isGroup
          ? `/api/groups/messages/${messageId}`
          : `/api/messages/delete/${messageId}`
      );
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

  const deleteAttachment = async (messageId, attachmentUrl) => {
    if (!messageId || !attachmentUrl) return false;

    try {
      const isGroup = !!selectedGroupRef.current?._id;
      const { data } = await axios.delete(
        isGroup
          ? `/api/groups/messages/${messageId}/attachments`
          : `/api/messages/${messageId}/attachments`,
        { data: { url: attachmentUrl } }
      );

      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg._id) === String(data.message._id) ? data.message : msg
          )
        );
        return true;
      }

      toast.error(data.message || "Failed to delete attachment");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const reactToMessage = async (messageId, emoji) => {
    if (!messageId || !emoji || String(messageId).startsWith("temp-")) {
      return false;
    }

    try {
      const isGroup = !!selectedGroupRef.current?._id;
      const { data } = await axios.post(
        isGroup
          ? `/api/groups/messages/${messageId}/react`
          : `/api/messages/react/${messageId}`,
        { emoji }
      );

      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg._id) === String(data.message._id) ? data.message : msg
          )
        );
        return true;
      }

      toast.error(data.message || "Failed to react");
      return false;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const notifyNewMessage = (newMessage, { isGroup = false } = {}) => {
    if (!isAppInBackground()) return;

    if (isGroup) {
      const group = groupsRef.current.find(
        (g) => String(g._id) === String(newMessage.groupId)
      );
      const sender =
        typeof newMessage.senderId === "object"
          ? newMessage.senderId
          : usersRef.current.find(
              (u) => String(u._id) === String(newMessage.senderId)
            );

      showChatNotification({
        title: group?.name || "Group message",
        body: newMessage.text
          ? `${sender?.fullName || "Someone"}: ${newMessage.text}`
          : newMessage.image || newMessage.attachment?.kind === "image"
            ? `${sender?.fullName || "Someone"} sent a photo`
            : newMessage.attachment?.name
              ? `${sender?.fullName || "Someone"} sent ${newMessage.attachment.name}`
              : "New group message",
        icon: group?.groupPic || sender?.profilePic || undefined,
        tag: `group-${newMessage.groupId}`,
        onClick: () => {
          if (group) setSelectedGroupRef.current?.(group);
        },
      });
      return;
    }

    const sender = usersRef.current.find(
      (user) => String(user._id) === String(newMessage.senderId)
    );

    const title = sender?.fullName || "New message";
    const body = newMessage.text
      ? newMessage.text
      : newMessage.image || newMessage.attachment?.kind === "image"
        ? "Sent a photo"
        : newMessage.attachment?.name
          ? `Sent ${newMessage.attachment.name}`
          : "New message";

    showChatNotification({
      title,
      body,
      icon: sender?.profilePic || undefined,
      tag: `chat-${newMessage.senderId}`,
      onClick: () => {
        if (sender) setSelectedUserRef.current?.(sender);
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

  const isGroupMessageOpen = (message) => {
    const currentGroup = selectedGroupRef.current;
    if (!currentGroup) return false;
    return String(message.groupId) === String(currentGroup._id);
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

    const onNewGroupMessage = (newMessage) => {
      const groupId = String(newMessage.groupId);

      if (isGroupMessageOpen(newMessage)) {
        setMessages((prev) => {
          if (prev.some((m) => String(m._id) === String(newMessage._id))) {
            return prev;
          }
          return [...prev, newMessage];
        });
        setGroupTypingUsers((prev) =>
          prev.filter((id) => id !== resolveId(newMessage.senderId))
        );
      } else if (groupMessageCacheRef.current[groupId]) {
        groupMessageCacheRef.current[groupId] = [
          ...groupMessageCacheRef.current[groupId],
          newMessage,
        ];
      }

      if (!isGroupMessageOpen(newMessage) && newMessage.messageType !== "system") {
        setUnseenGroupMessages((prev) => ({
          ...prev,
          [groupId]: prev[groupId] ? prev[groupId] + 1 : 1,
        }));
      }

      if (newMessage.messageType !== "system") {
        notifyNewMessage(newMessage, { isGroup: true });
      }
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

    const onGroupMessageUpdated = (updatedMessage) => {
      if (!isGroupMessageOpen(updatedMessage)) return;
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(updatedMessage._id) ? updatedMessage : msg
        )
      );
    };

    const onGroupMessageDeleted = (deletedMessage) => {
      if (!isGroupMessageOpen(deletedMessage)) return;
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

    const onGroupTyping = ({ groupId, senderId, isTyping }) => {
      const currentGroup = selectedGroupRef.current;
      if (!currentGroup || String(currentGroup._id) !== String(groupId)) {
        return;
      }

      const sid = String(senderId);
      if (groupTypingTimeoutsRef.current[sid]) {
        clearTimeout(groupTypingTimeoutsRef.current[sid]);
        delete groupTypingTimeoutsRef.current[sid];
      }

      setGroupTypingUsers((prev) => {
        if (isTyping) {
          return prev.includes(sid) ? prev : [...prev, sid];
        }
        return prev.filter((id) => id !== sid);
      });

      if (isTyping) {
        groupTypingTimeoutsRef.current[sid] = setTimeout(() => {
          setGroupTypingUsers((prev) => prev.filter((id) => id !== sid));
          delete groupTypingTimeoutsRef.current[sid];
        }, 2500);
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

    const onGroupCreated = (group) => {
      setGroups((prev) => {
        if (prev.some((g) => String(g._id) === String(group._id))) return prev;
        return [group, ...prev];
      });
    };

    const onGroupUpdated = (group) => {
      const isMember = group.members.some(
        (m) => resolveId(m) === String(authUser?._id)
      );

      if (!isMember) {
        setGroups((prev) =>
          prev.filter((g) => String(g._id) !== String(group._id))
        );
        if (String(selectedGroupRef.current?._id) === String(group._id)) {
          setSelectedGroupState(null);
          setMessages([]);
        }
        return;
      }

      setGroups((prev) => {
        const exists = prev.some((g) => String(g._id) === String(group._id));
        if (!exists) return [group, ...prev];
        return prev.map((g) =>
          String(g._id) === String(group._id) ? group : g
        );
      });

      if (String(selectedGroupRef.current?._id) === String(group._id)) {
        setSelectedGroupState(group);
      }
    };

    socket.on("newMessage", onNewMessage);
    socket.on("newGroupMessage", onNewGroupMessage);
    socket.on("messageUpdated", onMessageUpdated);
    socket.on("messageDeleted", onMessageDeleted);
    socket.on("groupMessageUpdated", onGroupMessageUpdated);
    socket.on("groupMessageDeleted", onGroupMessageDeleted);
    socket.on("typing", onTyping);
    socket.on("groupTyping", onGroupTyping);
    socket.on("messagesSeen", onMessagesSeen);
    socket.on("groupCreated", onGroupCreated);
    socket.on("groupUpdated", onGroupUpdated);

    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("newGroupMessage", onNewGroupMessage);
      socket.off("messageUpdated", onMessageUpdated);
      socket.off("messageDeleted", onMessageDeleted);
      socket.off("groupMessageUpdated", onGroupMessageUpdated);
      socket.off("groupMessageDeleted", onGroupMessageDeleted);
      socket.off("typing", onTyping);
      socket.off("groupTyping", onGroupTyping);
      socket.off("messagesSeen", onMessagesSeen);
      socket.off("groupCreated", onGroupCreated);
      socket.off("groupUpdated", onGroupUpdated);
    };
  }, [socket, axios, authUser?._id]);

  useEffect(() => {
    if (!authUser) return;

    const syncChatOnActive = () => {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }

      ensureSocketConnected?.();
      getUsers();
      getGroups();

      const selectedId = selectedUserRef.current?._id;
      const selectedGroupId = selectedGroupRef.current?._id;
      if (selectedId) getMessages(selectedId);
      if (selectedGroupId) getGroupMessages(selectedGroupId);
    };

    document.addEventListener("visibilitychange", syncChatOnActive);
    window.addEventListener("focus", syncChatOnActive);

    return () => {
      document.removeEventListener("visibilitychange", syncChatOnActive);
      window.removeEventListener("focus", syncChatOnActive);
    };
  }, [authUser, ensureSocketConnected]);

  const value = {
    messages,
    users,
    groups,
    selectedUser,
    selectedGroup,
    getUsers,
    getGroups,
    getMessages,
    getGroupMessages,
    createGroup,
    addGroupMembers,
    removeGroupMember,
    makeGroupAdmin,
    sendMessage,
    editMessage,
    deleteMessage,
    deleteAttachment,
    reactToMessage,
    setSelectedUser,
    setSelectedGroup,
    unseenMessages,
    setUnseenMessages,
    unseenGroupMessages,
    setUnseenGroupMessages,
    isOtherUserTyping,
    groupTypingUsers,
    startTyping,
    stopTyping,
    messagesLoading,
  };

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
};
