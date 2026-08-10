import React, { useContext, useEffect, useRef, useState } from "react";
import assets from "../assets/assets";
import {
  ATTACHMENT_ACCEPT,
  attachmentLabel,
  formatFileSize,
  formatMessageTime,
  formatSeenTime,
  getAttachmentKind,
  MAX_ATTACHMENT_SIZE,
} from "../lib/utils";
import { AuthContext } from "../../context/AuthContext";
import { ChatContext } from "../../context/ChatContext";
import toast from "react-hot-toast";
import ImageLightbox from "./ImageLightbox";

const resolveSenderId = (senderId) => {
  if (!senderId) return "";
  if (typeof senderId === "object") return String(senderId._id);
  return String(senderId);
};

const FileAttachmentCard = ({ attachment, pending }) => {
  if (!attachment) return null;
  const kind = attachment.kind || "file";
  const href = attachment.url;

  return (
    <div className="px-3 py-2 min-w-[180px] max-w-[260px]">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-black/25 text-[11px] font-semibold uppercase text-white">
          {kind === "pdf"
            ? "PDF"
            : kind === "excel"
              ? "XLS"
              : kind === "doc"
                ? "DOC"
                : kind === "zip"
                  ? "ZIP"
                  : "FILE"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white font-medium">
            {attachment.name || attachmentLabel(kind)}
          </p>
          <p className="text-[11px] text-white/70">
            {pending
              ? "Uploading..."
              : [attachmentLabel(kind), formatFileSize(attachment.size)]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          {href && !pending && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              download={attachment.name}
              className="mt-1 inline-block text-[11px] text-violet-200 underline hover:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const ChatContainer = () => {
  const {
    messages,
    selectedUser,
    selectedGroup,
    setSelectedUser,
    setSelectedGroup,
    sendMessage,
    editMessage,
    deleteMessage,
    getMessages,
    getGroupMessages,
    isOtherUserTyping,
    groupTypingUsers,
    startTyping,
    stopTyping,
    messagesLoading,
  } = useContext(ChatContext);

  const { authUser, onlineUsers } = useContext(AuthContext);

  const scrollEnd = useRef(null);
  const inputRef = useRef(null);
  const [input, setInput] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  const activeChat = selectedGroup || selectedUser;
  const isGroupChat = !!selectedGroup;

  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
    } else if (selectedGroup?._id) {
      getGroupMessages(selectedGroup._id);
    } else {
      return;
    }

    setEditingMessage(null);
    setReplyingTo(null);
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setLightboxImage(null);
    setInput("");
    setMenuOpenId(null);
    stopTyping();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [selectedUser?._id, selectedGroup?._id]);

  useEffect(() => {
    if (scrollEnd.current && !messagesLoading) {
      scrollEnd.current.scrollIntoView({ behavior: "auto" });
    }
  }, [
    messages,
    isOtherUserTyping,
    groupTypingUsers,
    messagesLoading,
    selectedUser?._id,
    selectedGroup?._id,
  ]);

  useEffect(() => {
    const closeMenu = () => setMenuOpenId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) {
        URL.revokeObjectURL(pendingAttachment.previewUrl);
      }
    };
  }, [pendingAttachment?.previewUrl]);

  const findMember = (userId) => {
    if (!userId) return null;
    if (String(userId) === String(authUser._id)) return authUser;
    return (
      selectedGroup?.members?.find(
        (m) => resolveSenderId(m) === String(userId)
      ) || null
    );
  };

  const getSenderProfile = (msg) => {
    if (typeof msg.senderId === "object" && msg.senderId?._id) {
      return msg.senderId;
    }
    const sid = resolveSenderId(msg.senderId);
    if (sid === String(authUser._id)) return authUser;
    if (selectedUser && sid === String(selectedUser._id)) return selectedUser;
    return findMember(sid);
  };

  const getReplyLabel = (msg) => {
    if (!msg) return "";
    if (msg.isDeleted || msg.replyTo?.isDeleted) return "Message deleted";
    if (msg.image || msg.replyTo?.image) return "Photo";
    if (msg.attachment?.name || msg.replyTo?.fileName) {
      return msg.attachment?.name || msg.replyTo?.fileName;
    }
    return msg.text || msg.replyTo?.text || "";
  };

  const getReplySenderName = (reply) => {
    if (!reply?.senderId) return "Message";
    if (resolveSenderId(reply.senderId) === String(authUser._id)) return "You";
    if (isGroupChat) {
      return findMember(reply.senderId)?.fullName || "Member";
    }
    return selectedUser?.fullName || "User";
  };

  const groupTypingLabel = () => {
    if (!groupTypingUsers.length) return "";
    const names = groupTypingUsers
      .map((id) => findMember(id)?.fullName || "Someone")
      .slice(0, 2);
    if (groupTypingUsers.length > 2) {
      return `${names.join(", ")} and others are typing...`;
    }
    if (names.length === 1) return `${names[0]} is typing...`;
    return `${names.join(" and ")} are typing...`;
  };

  const clearPendingAttachment = () => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    stopTyping();

    if (editingMessage) {
      if (!input.trim()) return;
      const ok = await editMessage(editingMessage._id, input.trim());
      if (ok) {
        setEditingMessage(null);
        setInput("");
      }
      return;
    }

    if (pendingAttachment) {
      const replyId = replyingTo?._id;
      const pending = pendingAttachment;
      const caption = input.trim();
      clearPendingAttachment();
      setReplyingTo(null);
      setInput("");

      if (pending.base64Image) {
        sendMessage({
          image: pending.base64Image,
          text: caption || undefined,
          ...(replyId ? { replyTo: replyId } : {}),
        });
        return;
      }

      sendMessage({
        file: pending.file,
        previewUrl: pending.previewUrl,
        fileKind: pending.kind,
        text: caption || undefined,
        ...(replyId ? { replyTo: replyId } : {}),
      });
      return;
    }

    if (!input.trim()) return;

    const text = input.trim();
    const replyId = replyingTo?._id;

    setInput("");
    setReplyingTo(null);

    sendMessage({
      text,
      ...(replyId ? { replyTo: replyId } : {}),
    });
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    if (editingMessage) return;

    if (value.trim()) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const loadAttachment = (file, { base64Image } = {}) => {
    if (!file && !base64Image) return;

    if (editingMessage) {
      toast.error("Finish or cancel editing before attaching a file");
      return;
    }

    if (file && file.size > MAX_ATTACHMENT_SIZE) {
      toast.error("File too large. Maximum size is 600MB.");
      return;
    }

    const kind = file ? getAttachmentKind(file) : "image";

    if (file) {
      const allowed =
        kind !== "file" ||
        /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|tiff?|ico|avif|pdf|docx?|txt|rtf|odt|xlsx?|csv|ods|zip|rar|7z)$/i.test(
          file.name
        );
      if (!allowed) {
        toast.error(
          "Unsupported file. Use images, PDF, Word, Excel, or ZIP."
        );
        return;
      }
    }

    clearPendingAttachment();

    const previewUrl =
      kind === "image" && file && !base64Image
        ? URL.createObjectURL(file)
        : base64Image || null;

    setPendingAttachment({
      file: file || null,
      kind,
      previewUrl,
      base64Image: base64Image || null,
      name: file?.name || "image.jpg",
      size: file?.size || 0,
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSendFile = (e) => {
    const file = e.target.files?.[0];
    if (file) loadAttachment(file);
    e.target.value = "";
  };

  const handlePaste = (e) => {
    if (editingMessage) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;

        if (file.size > MAX_ATTACHMENT_SIZE) {
          toast.error("File too large. Maximum size is 600MB.");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          loadAttachment(file, { base64Image: reader.result });
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const startReply = (msg) => {
    if (msg.isDeleted) return;
    setEditingMessage(null);
    setReplyingTo(msg);
    setMenuOpenId(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const startEdit = (msg) => {
    if (msg.isDeleted || msg.image || msg.attachment?.url) return;
    setReplyingTo(null);
    clearPendingAttachment();
    setEditingMessage(msg);
    setInput(msg.text || "");
    setMenuOpenId(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setInput("");
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleDelete = async (msg) => {
    setMenuOpenId(null);
    if (!window.confirm("Delete this message for everyone?")) return;
    await deleteMessage(msg._id);
    if (editingMessage && String(editingMessage._id) === String(msg._id)) {
      cancelEdit();
    }
    if (replyingTo && String(replyingTo._id) === String(msg._id)) {
      cancelReply();
    }
  };

  const scrollToMessage = (messageId) => {
    if (!messageId) return;
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-violet-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-violet-400"), 1200);
    }
  };

  const closeChat = () => {
    if (selectedGroup) setSelectedGroup(null);
    else setSelectedUser(null);
  };

  if (!activeChat) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 h-full max-md:hidden">
        <img src={assets.logo_icon} className="max-w-[230px]" alt="" />
        <p className="text-lg font-medium text-white">
          Chat anytime, anywhere
        </p>
      </div>
    );
  }

  const headerTitle = isGroupChat ? selectedGroup.name : selectedUser.fullName;
  const headerPic = isGroupChat
    ? selectedGroup.groupPic || assets.avatar_icon
    : selectedUser.profilePic || assets.avatar_icon;
  const showGroupTyping = isGroupChat && groupTypingUsers.length > 0;
  const showDmTyping = !isGroupChat && isOtherUserTyping;

  return (
    <div
      className="flex flex-col h-full overflow-hidden backdrop-blur-lg"
      onPaste={handlePaste}
    >
      <div className="flex items-center gap-3 p-4 border-b border-gray-700 flex-shrink-0">
        <img
          src={headerPic}
          alt=""
          className="w-10 h-10 rounded-full object-cover"
        />

        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{headerTitle}</p>

          {showGroupTyping ? (
            <p className="text-green-400 text-xs italic truncate">
              {groupTypingLabel()}
            </p>
          ) : showDmTyping ? (
            <p className="text-green-400 text-xs italic">typing...</p>
          ) : isGroupChat ? (
            <p className="text-gray-400 text-xs">
              {selectedGroup.members?.length || 0} members
            </p>
          ) : onlineUsers.includes(selectedUser._id) ? (
            <p className="text-green-400 text-xs">Online</p>
          ) : (
            <p className="text-gray-400 text-xs">Offline</p>
          )}
        </div>

        <img
          src={assets.arrow_icon}
          alt=""
          onClick={closeChat}
          className="w-6 cursor-pointer md:hidden"
        />

        <img src={assets.help_icon} alt="" className="w-5 hidden md:block" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messagesLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading messages...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(() => {
              const lastSeenOwnId = !isGroupChat
                ? [...messages]
                    .reverse()
                    .find(
                      (m) =>
                        resolveSenderId(m.senderId) === String(authUser._id) &&
                        m.seen &&
                        !m.isDeleted &&
                        !m.pending &&
                        !String(m._id).startsWith("temp-")
                    )?._id
                : null;

              return messages.map((msg) => {
                const senderId = resolveSenderId(msg.senderId);
                const isMine = senderId === String(authUser._id);
                const isPending =
                  !!msg.pending || String(msg._id).startsWith("temp-");
                const sender = getSenderProfile(msg);
                const avatarSrc = sender?.profilePic || assets.avatar_icon;
                const showSeenTime =
                  !isGroupChat &&
                  isMine &&
                  msg.seen &&
                  msg.seenAt &&
                  String(msg._id) === String(lastSeenOwnId);
                const groupSeenCount = Array.isArray(msg.seenBy)
                  ? msg.seenBy.length
                  : 0;
                const imageUrl =
                  msg.image ||
                  (msg.attachment?.kind === "image" ? msg.attachment.url : "");
                const nonImageAttachment =
                  msg.attachment?.url && msg.attachment?.kind !== "image"
                    ? msg.attachment
                    : msg.attachment?.name && !imageUrl
                      ? msg.attachment
                      : null;
                const canEdit =
                  isMine && !msg.image && !msg.attachment?.url && !msg.isDeleted;

                return (
                  <div
                    key={msg._id}
                    id={`msg-${msg._id}`}
                    className={`flex group items-end gap-2 rounded-lg transition-shadow ${
                      isMine ? "justify-end" : "justify-start"
                    } ${isPending ? "opacity-80" : ""}`}
                  >
                    {!isMine && (
                      <img
                        src={avatarSrc}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-4"
                      />
                    )}

                    <div
                      className={`max-w-lg relative ${
                        isMine ? "items-end" : "items-start"
                      }`}
                    >
                      {isGroupChat && !isMine && (
                        <p className="text-[11px] text-violet-300 mb-0.5 ml-1">
                          {sender?.fullName || "Member"}
                        </p>
                      )}

                      {!msg.isDeleted && !isPending && (
                        <div
                          className={`absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isMine ? "-left-8" : "-right-8"
                          }`}
                        >
                          <button
                            type="button"
                            className="text-gray-300 hover:text-white text-lg px-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(
                                menuOpenId === msg._id ? null : msg._id
                              );
                            }}
                          >
                            ⋮
                          </button>

                          {menuOpenId === msg._id && (
                            <div
                              className={`absolute top-6 z-20 min-w-[110px] rounded-lg bg-gray-900 border border-gray-700 shadow-lg overflow-hidden ${
                                isMine ? "left-0" : "right-0"
                              }`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800"
                                onClick={() => startReply(msg)}
                              >
                                Reply
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800"
                                  onClick={() => startEdit(msg)}
                                >
                                  Edit
                                </button>
                              )}
                              {isMine && (
                                <button
                                  type="button"
                                  className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-800"
                                  onClick={() => handleDelete(msg)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {msg.isDeleted ? (
                        <div
                          className={`px-3 py-2 rounded-xl italic text-gray-400 ${
                            isMine ? "bg-violet-600/40" : "bg-gray-700/60"
                          }`}
                        >
                          This message was deleted
                        </div>
                      ) : (
                        <div
                          className={`rounded-xl overflow-hidden ${
                            isMine ? "bg-violet-600" : "bg-gray-700"
                          }`}
                        >
                          {msg.replyTo?.messageId && (
                            <button
                              type="button"
                              onClick={() =>
                                scrollToMessage(msg.replyTo.messageId)
                              }
                              className={`w-full text-left px-3 pt-2 pb-1 border-l-2 ${
                                isMine
                                  ? "border-violet-200 bg-black/20"
                                  : "border-violet-400 bg-black/20"
                              }`}
                            >
                              <p className="text-[11px] font-medium text-violet-200">
                                {getReplySenderName(msg.replyTo)}
                              </p>
                              <p className="text-[11px] text-gray-300 truncate">
                                {msg.replyTo.isDeleted
                                  ? "Message deleted"
                                  : msg.replyTo.image
                                    ? "Photo"
                                    : msg.replyTo.fileName
                                      ? msg.replyTo.fileName
                                      : msg.replyTo.text || ""}
                              </p>
                            </button>
                          )}

                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt=""
                              onClick={() => setLightboxImage(imageUrl)}
                              className="rounded-lg max-w-[220px] block cursor-zoom-in hover:opacity-95 transition"
                            />
                          ) : null}

                          {nonImageAttachment ? (
                            <FileAttachmentCard
                              attachment={nonImageAttachment}
                              pending={isPending && !nonImageAttachment.url}
                            />
                          ) : null}

                          {msg.text ? (
                            <div className="px-3 py-2 break-words text-white">
                              {msg.text}
                            </div>
                          ) : null}
                        </div>
                      )}

                      <p
                        className={`text-[10px] text-gray-400 mt-1 flex items-center gap-1 ${
                          isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        {msg.isEdited && !msg.isDeleted && (
                          <span className="italic">edited</span>
                        )}
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {isMine && !msg.isDeleted && !isGroupChat && (
                          <span
                            className={`ml-0.5 tracking-tighter ${
                              isPending
                                ? "text-gray-500"
                                : msg.seen
                                  ? "text-sky-400"
                                  : "text-gray-400"
                            }`}
                            title={
                              isPending
                                ? "Sending..."
                                : msg.seen
                                  ? formatSeenTime(msg.seenAt, msg.createdAt)
                                  : "Sent"
                            }
                          >
                            {isPending ? "◷" : msg.seen ? "✓✓" : "✓"}
                          </span>
                        )}
                        {isMine && !msg.isDeleted && isGroupChat && (
                          <span
                            className={`ml-0.5 tracking-tighter ${
                              isPending
                                ? "text-gray-500"
                                : groupSeenCount > 1
                                  ? "text-sky-400"
                                  : "text-gray-400"
                            }`}
                            title={
                              isPending
                                ? "Sending..."
                                : `Seen by ${Math.max(groupSeenCount - 1, 0)}`
                            }
                          >
                            {isPending
                              ? "◷"
                              : groupSeenCount > 1
                                ? "✓✓"
                                : "✓"}
                          </span>
                        )}
                      </p>

                      {showSeenTime && (
                        <p className="text-[10px] text-sky-400 mt-0.5 text-right">
                          {formatSeenTime(msg.seenAt, msg.createdAt)}
                        </p>
                      )}
                    </div>

                    {isMine && (
                      <img
                        src={avatarSrc}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-4"
                      />
                    )}
                  </div>
                );
              });
            })()}

            <div ref={scrollEnd}></div>
          </div>
        )}

        {(showDmTyping || showGroupTyping) && (
          <div className="flex items-end gap-2 mt-2">
            <img
              src={
                isGroupChat
                  ? findMember(groupTypingUsers[0])?.profilePic ||
                    assets.avatar_icon
                  : selectedUser.profilePic || assets.avatar_icon
              }
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="px-3 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm italic">
              {isGroupChat ? groupTypingLabel() : "typing..."}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 p-3 flex-shrink-0">
        {editingMessage && (
          <div className="flex items-center justify-between px-2 pb-2 text-xs text-violet-300">
            <span>Editing message</span>
            <button
              type="button"
              className="text-gray-300 hover:text-white"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        )}

        {replyingTo && !editingMessage && (
          <div className="flex items-start justify-between gap-2 mx-1 mb-2 px-3 py-2 rounded-lg bg-white/10 border-l-4 border-violet-400">
            <div className="min-w-0">
              <p className="text-xs text-violet-300 font-medium">
                Replying to{" "}
                {resolveSenderId(replyingTo.senderId) === String(authUser._id)
                  ? "yourself"
                  : isGroupChat
                    ? findMember(replyingTo.senderId)?.fullName || "member"
                    : selectedUser.fullName}
              </p>
              <p className="text-xs text-gray-300 truncate">
                {getReplyLabel(replyingTo)}
              </p>
            </div>
            <button
              type="button"
              className="text-gray-300 hover:text-white text-sm"
              onClick={cancelReply}
            >
              ✕
            </button>
          </div>
        )}

        {pendingAttachment && !editingMessage && (
          <div className="mx-1 mb-2 p-2 rounded-xl bg-white/10 border border-white/10">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-violet-300">
                {pendingAttachment.kind === "image"
                  ? "Image ready to send"
                  : "File ready to send"}
              </p>
              <button
                type="button"
                className="text-gray-300 hover:text-white text-sm"
                onClick={clearPendingAttachment}
              >
                ✕
              </button>
            </div>

            {pendingAttachment.kind === "image" &&
            (pendingAttachment.previewUrl || pendingAttachment.base64Image) ? (
              <img
                src={
                  pendingAttachment.previewUrl || pendingAttachment.base64Image
                }
                alt="Preview"
                onClick={() =>
                  setLightboxImage(
                    pendingAttachment.previewUrl ||
                      pendingAttachment.base64Image
                  )
                }
                className="max-h-40 rounded-lg object-contain cursor-zoom-in"
              />
            ) : (
              <FileAttachmentCard
                attachment={{
                  name: pendingAttachment.name,
                  size: pendingAttachment.size,
                  kind: pendingAttachment.kind,
                }}
                pending
              />
            )}

            <p className="text-[11px] text-gray-400 mt-2">
              Max 600MB · Press send to share, or ✕ to cancel
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 bg-white/10 rounded-full px-4">
          <input
            ref={inputRef}
            type="text"
            placeholder={
              editingMessage
                ? "Edit your message..."
                : pendingAttachment
                  ? "Add a caption? (optional)"
                  : replyingTo
                    ? "Type a reply..."
                    : "Type a message... (attach files or paste image)"
            }
            className="flex-1 bg-transparent outline-none text-white py-3 placeholder-gray-400"
            value={input}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage(e)}
            onBlur={stopTyping}
          />

          {!editingMessage && (
            <>
              <input
                type="file"
                id="chat-attachment"
                hidden
                accept={ATTACHMENT_ACCEPT}
                onChange={handleSendFile}
              />

              <label htmlFor="chat-attachment" title="Attach file">
                <img
                  src={assets.gallery_icon}
                  alt=""
                  className="w-5 cursor-pointer"
                />
              </label>
            </>
          )}

          <img
            src={assets.send_button}
            alt=""
            className="w-7 cursor-pointer"
            onClick={handleSendMessage}
          />
        </div>
      </div>

      <ImageLightbox
        src={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
};

export default ChatContainer;
