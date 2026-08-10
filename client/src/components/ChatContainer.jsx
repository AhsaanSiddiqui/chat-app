import React, { useContext, useEffect, useRef, useState } from "react";
import assets from "../assets/assets";
import { formatMessageTime } from "../lib/utils";
import { AuthContext } from "../../context/AuthContext";
import { ChatContext } from "../../context/ChatContext";
import toast from "react-hot-toast";

const ChatContainer = () => {
  const {
    messages,
    selectedUser,
    setSelectedUser,
    sendMessage,
    editMessage,
    deleteMessage,
    getMessages,
    isOtherUserTyping,
    startTyping,
    stopTyping,
  } = useContext(ChatContext);

  const { authUser, onlineUsers } = useContext(AuthContext);

  const scrollEnd = useRef(null);
  const [input, setInput] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);

  useEffect(() => {
    if (selectedUser) {
      getMessages(selectedUser._id);
      setEditingMessage(null);
      setInput("");
      setMenuOpenId(null);
      stopTyping();
    }
  }, [selectedUser]);

  useEffect(() => {
    if (scrollEnd.current) {
      scrollEnd.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOtherUserTyping]);

  useEffect(() => {
    const closeMenu = () => setMenuOpenId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!input.trim()) return;

    stopTyping();

    if (editingMessage) {
      const ok = await editMessage(editingMessage._id, input.trim());
      if (ok) {
        setEditingMessage(null);
        setInput("");
      }
      return;
    }

    await sendMessage({
      text: input.trim(),
    });

    setInput("");
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

  const handleSendImage = (e) => {
    const file = e.target.files[0];

    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }

    if (editingMessage) {
      toast.error("Finish or cancel editing before sending an image");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onloadend = async () => {
      await sendMessage({
        image: reader.result,
      });

      e.target.value = "";
    };

    reader.readAsDataURL(file);
  };

  const startEdit = (msg) => {
    if (msg.isDeleted || msg.image) return;
    setEditingMessage(msg);
    setInput(msg.text || "");
    setMenuOpenId(null);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setInput("");
  };

  const handleDelete = async (msg) => {
    setMenuOpenId(null);
    if (!window.confirm("Delete this message for everyone?")) return;
    await deleteMessage(msg._id);
    if (editingMessage && String(editingMessage._id) === String(msg._id)) {
      cancelEdit();
    }
  };

  if (!selectedUser) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 h-full max-md:hidden">
        <img src={assets.logo_icon} className="max-w-[230px]" alt="" />
        <p className="text-lg font-medium text-white">
          Chat anytime, anywhere
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden backdrop-blur-lg">
      <div className="flex items-center gap-3 p-4 border-b border-gray-700 flex-shrink-0">
        <img
          src={selectedUser.profilePic || assets.avatar_icon}
          alt=""
          className="w-10 h-10 rounded-full"
        />

        <div className="flex-1">
          <p className="text-white font-medium">{selectedUser.fullName}</p>

          {isOtherUserTyping ? (
            <p className="text-green-400 text-xs italic">typing...</p>
          ) : onlineUsers.includes(selectedUser._id) ? (
            <p className="text-green-400 text-xs">Online</p>
          ) : (
            <p className="text-gray-400 text-xs">Offline</p>
          )}
        </div>

        <img
          src={assets.arrow_icon}
          alt=""
          onClick={() => setSelectedUser(null)}
          className="w-6 cursor-pointer md:hidden"
        />

        <img src={assets.help_icon} alt="" className="w-5 hidden md:block" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            const isMine = String(msg.senderId) === String(authUser._id);
            const avatarSrc = isMine
              ? authUser.profilePic || assets.avatar_icon
              : selectedUser.profilePic || assets.avatar_icon;

            return (
              <div
                key={msg._id}
                className={`flex group items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
              >
                {!isMine && (
                  <img
                    src={avatarSrc}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-4"
                  />
                )}

                <div className={`max-w-xs relative ${isMine ? "items-end" : "items-start"}`}>
                  {isMine && !msg.isDeleted && (
                    <div className="absolute -top-1 -left-8 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          className="absolute left-0 top-6 z-20 min-w-[110px] rounded-lg bg-gray-900 border border-gray-700 shadow-lg overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!msg.image && (
                            <button
                              type="button"
                              className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800"
                              onClick={() => startEdit(msg)}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-800"
                            onClick={() => handleDelete(msg)}
                          >
                            Delete
                          </button>
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
                  ) : msg.image ? (
                    <img
                      src={msg.image}
                      alt=""
                      className="rounded-lg max-w-[220px]"
                    />
                  ) : (
                    <div
                      className={`px-3 py-2 rounded-xl break-words text-white ${
                        isMine ? "bg-violet-600" : "bg-gray-700"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  <p
                    className={`text-[10px] text-gray-400 mt-1 ${
                      isMine ? "text-right" : "text-left"
                    }`}
                  >
                    {msg.isEdited && !msg.isDeleted && (
                      <span className="mr-1 italic">edited</span>
                    )}
                    {formatMessageTime(msg.createdAt)}
                  </p>
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
          })}

          <div ref={scrollEnd}></div>
        </div>

        {isOtherUserTyping && (
          <div className="flex items-end gap-2 mt-2">
            <img
              src={selectedUser.profilePic || assets.avatar_icon}
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="px-3 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm italic">
              typing...
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

        <div className="flex items-center gap-2 bg-white/10 rounded-full px-4">
          <input
            type="text"
            placeholder={
              editingMessage ? "Edit your message..." : "Type a message..."
            }
            className="flex-1 bg-transparent outline-none text-white py-3 placeholder-gray-400"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage(e)}
            onBlur={stopTyping}
          />

          {!editingMessage && (
            <>
              <input
                type="file"
                id="image"
                hidden
                accept="image/*"
                onChange={handleSendImage}
              />

              <label htmlFor="image">
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
    </div>
  );
};

export default ChatContainer;
