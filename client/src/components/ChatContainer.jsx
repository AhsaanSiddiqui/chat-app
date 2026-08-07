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
  getMessages,
} = useContext(ChatContext);

  const { authUser, onlineUsers } = useContext(AuthContext);

  const scrollEnd = useRef(null);
  const [input, setInput] = useState("");

  // Get messages when user is selected
  useEffect(() => {
    if (selectedUser) {
      getMessages(selectedUser._id);
    }
  }, [selectedUser]);

  // Auto scroll
  useEffect(() => {
    if (scrollEnd.current) {
      scrollEnd.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Send text message
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!input.trim()) return;

    await sendMessage({
      text: input.trim(),
    });

    setInput("");
  };

  // Send image
  const handleSendImage = (e) => {
    const file = e.target.files[0];

    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please select an image");
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

  if (!selectedUser) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 h-full max-md:hidden">
        <img src={assets.logo_icon} className="max-w-16" alt="" />
        <p className="text-lg font-medium text-white">
          Chat anytime, anywhere
        </p>
      </div>
    );
  }

  return (
     <div className="flex flex-col h-full overflow-hidden backdrop-blur-lg">

    {/* Header */}
    <div className="flex items-center gap-3 p-4 border-b border-gray-700 flex-shrink-0">
      <img
        src={selectedUser.profilePic || assets.avatar_icon}
        alt=""
        className="w-10 h-10 rounded-full"
      />

      <div className="flex-1">
        <p className="text-white font-medium">
          {selectedUser.fullName}
        </p>

     {onlineUsers.includes(selectedUser._id) ? (
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

      <img
        src={assets.help_icon}
        alt=""
        className="w-5 hidden md:block"
      />
    </div>

    {/* Messages */}
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex flex-col gap-3">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${
              msg.senderId === authUser._id
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <div className="max-w-xs">
              {msg.image ? (
                <img
                  src={msg.image}
                  alt=""
                  className="rounded-lg max-w-[220px]"
                />
              ) : (
                <div
                  className={`px-3 py-2 rounded-xl break-words text-white ${
                    msg.senderId === authUser._id
                      ? "bg-violet-600"
                      : "bg-gray-700"
                  }`}
                >
                  {msg.text}
                </div>
              )}

              <p className="text-[10px] text-gray-400 mt-1">
                {formatMessageTime(msg.createdAt)}
              </p>
            </div>
          </div>
        ))}

        <div ref={scrollEnd}></div>
      </div>
    </div>

    {/* Bottom */}
    <div className="border-t border-gray-700 p-3 flex-shrink-0">
      <div className="flex items-center gap-2 bg-white/10 rounded-full px-4">

        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 bg-transparent outline-none text-white py-3 placeholder-gray-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && handleSendMessage(e)
          }
        />

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