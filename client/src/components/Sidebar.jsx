import React, { useContext, useEffect, useState } from "react";
import assets from "../assets/assets";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { ChatContext } from "../../context/ChatContext";

const Sidebar = () => {

const {
  getUsers,
  users,
  selectedUser,
  setSelectedUser,
  unseenMessages,
  setUnseenMessages,
} = useContext(ChatContext);

  const { authUser, logout, onlineUsers } = useContext(AuthContext);

  const [input, setInput] = useState()

  const navigate = useNavigate();

  const filteredUsers = input ? users.filter((user)=>user.fullName.toLowerCase().includes(input.toLowerCase())) : users;

  useEffect(()=>{
    getUsers();
  },[])

 return (
  <div
    className={`h-full bg-[#0d0d12]/80 border-r border-white/10 text-white
    flex flex-col overflow-hidden
    ${selectedUser ? "max-md:hidden" : ""}`}
  >

    {/* Header */}
    <div className="px-5 pt-5">

      <div className="flex items-center justify-between mb-6">

        <div className="flex items-center gap-2">
          <img
          onClick={() => navigate("/")}
            src={assets.logo_icon}
            alt="QuickChat"
            className="h-10 cursor-pointer"
          />

          {/* <h1 className="text-lg font-semibold tracking-tight">
            QuickChat
          </h1> */}
        </div>

        {/* <button
          className="w-8 h-8 rounded-full flex items-center justify-center
          hover:bg-white/10 transition"
        >
          <span className="text-lg text-gray-400">⋮</span>
        </button> */}

      </div>

      {/* Logged in user */}
      <div onClick={() => navigate("/profile")}
       className="flex items-center gap-3 p-3 rounded-xl border border-gray-700 
             bg-white/5 cursor-pointer hover:bg-white/10 transition mb-3">

        <div className="relative">

          <img
            src={authUser?.profilePic || assets.avatar_icon}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />

          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5
            bg-green-500 border-2 border-[#0d0d12] rounded-full"
          ></span>

        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {authUser?.fullName}
          </p>

          <p className="text-[11px] text-green-400 mt-0.5">
            Active now
          </p>
        </div>

      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 px-3 h-10 rounded-xl
        bg-[#211b3b] border border-white/[0.05]
        focus-within:border-violet-500/40 transition"
      >

        <img
          src={assets.search_icon}
          alt=""
          className="w-4 opacity-60"
        />

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          type="text"
          placeholder="Search conversations..."
          className="flex-1 bg-transparent outline-none
          text-xs text-white placeholder:text-gray-500"
        />

      </div>

    </div>

    {/* Users */}
    <div className="flex-1 overflow-y-auto px-3 mt-5">

      <p className="px-2 mb-2 text-[11px] uppercase tracking-wider
        text-gray-500 font-medium">
        Messages
      </p>

      <div className="space-y-1">

        {filteredUsers.map((user, index) => (

          <div
            key={index}
            onClick={() => {
              setSelectedUser(user);

              setUnseenMessages((prev) => ({
                ...prev,
                [user._id]: 0,
              }));
            }}
            className={`group relative flex items-center gap-3
              px-3 py-2.5 rounded-xl cursor-pointer transition-all

              ${
                selectedUser?._id === user._id
                  ? "bg-violet-500/15 border border-violet-500/20"
                  : "hover:bg-white/[0.05] border border-transparent"
              }`}
          >

            {/* Avatar */}
            <div className="relative flex-shrink-0">

              <img
                src={user?.profilePic || assets.avatar_icon}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />

              {onlineUsers.includes(user._id) && (
                <span
                  className="absolute bottom-0 right-0 w-2.5 h-2.5
                  bg-green-500 border-2 border-[#0d0d12]
                  rounded-full"
                ></span>
              )}

            </div>

            {/* User info */}
            <div className="flex-1 min-w-0">

              <div className="flex items-center justify-between">

                <p className="text-sm font-medium truncate">
                  {user.fullName}
                </p>

                {unseenMessages[user._id] > 0 && (
                  <span
                    className="ml-2 min-w-5 h-5 px-1.5
                    flex items-center justify-center
                    rounded-full bg-violet-500
                    text-[10px] font-semibold"
                  >
                    {unseenMessages[user._id]}
                  </span>
                )}

              </div>

              <p
                className={`text-[11px] mt-0.5 ${
                  onlineUsers.includes(user._id)
                    ? "text-green-400"
                    : "text-gray-500"
                }`}
              >
                {onlineUsers.includes(user._id)
                  ? "Online"
                  : "Offline"}
              </p>

            </div>

          </div>

        ))}

      </div>

    </div>

    {/* Bottom */}
    <div className="p-4 border-t border-white/[0.06]">

      <button
        onClick={() => logout()}
        className="w-full h-10 rounded-xl
        text-sm text-gray-400
        hover:text-white hover:bg-red-500/10
        transition"
      >
        Logout
      </button>

    </div>

  </div>
);
};

export default Sidebar;
