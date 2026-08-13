import React, { useContext, useEffect, useState } from "react";
import assets from "../assets/assets";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { ChatContext } from "../../context/ChatContext";
import CreateGroupModal from "./CreateGroupModal";

const Sidebar = () => {
  const {
    getUsers,
    getGroups,
    users,
    groups,
    selectedUser,
    selectedGroup,
    setSelectedUser,
    setSelectedGroup,
    unseenMessages,
    setUnseenMessages,
    unseenGroupMessages,
    setUnseenGroupMessages,
  } = useContext(ChatContext);

  const { authUser, logout, onlineUsers } = useContext(AuthContext);

  const [input, setInput] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const navigate = useNavigate();

  const filteredGroups = input
    ? groups.filter((group) =>
        group.name.toLowerCase().includes(input.toLowerCase())
      )
    : groups;

  const q = input.trim().toLowerCase();
  const savedNotesUser =
    users.find((u) => u.isSavedNotes) ||
    (authUser?._id
      ? {
          _id: authUser._id,
          fullName: "Saved Notes",
          bio: "Your private space for important notes",
          profilePic: authUser.profilePic || "",
          isSavedNotes: true,
        }
      : null);
  const otherUsers = users.filter(
    (u) => !u.isSavedNotes && String(u._id) !== String(authUser?._id)
  );
  const filteredOthers = q
    ? otherUsers.filter((user) => {
        const name = (user.fullName || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : otherUsers;
  const myName = (authUser?.fullName || "").toLowerCase();
  const myEmail = (authUser?.email || "").toLowerCase();
  const showSavedNotes =
    !!savedNotesUser &&
    (!q ||
      "saved notes".includes(q) ||
      q.includes("note") ||
      q.includes("saved") ||
      q.includes("own") ||
      myName.includes(q) ||
      myEmail.includes(q) ||
      savedNotesUser.fullName.toLowerCase().includes(q));
  const filteredUsers = showSavedNotes
    ? [savedNotesUser, ...filteredOthers]
    : filteredOthers;

  useEffect(() => {
    if (authUser) {
      getUsers();
      getGroups();
    }
  }, [authUser]);

  const hasOpenChat = !!(selectedUser || selectedGroup);

  return (
    <div
      className={`h-full bg-[#0d0d12]/80 border-r border-white/10 text-white
    flex flex-col overflow-hidden
    ${hasOpenChat ? "max-md:hidden" : ""}`}
    >
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <img
              onClick={() => navigate("/")}
              src={assets.logo_icon}
              alt="QuickChat"
              className="h-10 cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCreateGroup(true)}
            title="New group"
            className="h-8 w-8 rounded-full flex items-center justify-center
            bg-violet-600/80 hover:bg-violet-500 transition text-lg leading-none"
          >
            +
          </button>
        </div>

        <div
          onClick={() => navigate("/profile")}
          className="flex items-center gap-3 p-3 rounded-xl border border-gray-700 
             bg-white/5 cursor-pointer hover:bg-white/10 transition mb-3"
        >
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
            <p className="text-sm font-medium truncate">{authUser?.fullName}</p>
            <p className="text-[11px] text-green-400 mt-0.5">Active now</p>
          </div>
        </div>

        <div
          className="flex items-center gap-2 px-3 h-10 rounded-xl
        bg-[#211b3b] border border-white/[0.05]
        focus-within:border-violet-500/40 transition"
        >
          <img src={assets.search_icon} alt="" className="w-4 opacity-60" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type="text"
            placeholder="Search by name or email..."
            className="flex-1 bg-transparent outline-none
          text-xs text-white placeholder:text-gray-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 mt-5">
        <div className="flex items-center justify-between px-2 mb-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
            Groups
          </p>
          <button
            type="button"
            onClick={() => setShowCreateGroup(true)}
            className="text-[11px] text-violet-300 hover:text-violet-200"
          >
            New
          </button>
        </div>

        <div className="space-y-1 mb-5">
          {filteredGroups.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-500">
              No groups yet — create one
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div
                key={group._id}
                onClick={() => {
                  setSelectedGroup(group);
                  setUnseenGroupMessages((prev) => ({
                    ...prev,
                    [group._id]: 0,
                  }));
                }}
                className={`group relative flex items-center gap-3
              px-3 py-2.5 rounded-xl cursor-pointer transition-all

              ${
                selectedGroup?._id === group._id
                  ? "bg-violet-500/15 border border-violet-500/20"
                  : "hover:bg-white/[0.05] border border-transparent"
              }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={group?.groupPic || assets.avatar_icon}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{group.name}</p>
                    {unseenGroupMessages[group._id] > 0 && (
                      <span
                        className="ml-2 min-w-5 h-5 px-1.5
                    flex items-center justify-center
                    rounded-full bg-violet-500
                    text-[10px] font-semibold"
                      >
                        {unseenGroupMessages[group._id]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5 text-gray-500">
                    {group.members?.length || 0} members
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <p
          className="px-2 mb-2 text-[11px] uppercase tracking-wider
        text-gray-500 font-medium"
        >
          Messages
        </p>

        <div className="space-y-1">
          {filteredUsers.map((user) => (
            <div
              key={user._id}
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
              <div className="relative flex-shrink-0">
                {user.isSavedNotes ? (
                  <div
                    className="w-10 h-10 rounded-full object-cover
                    bg-amber-500/20 border border-amber-400/30
                    flex items-center justify-center text-lg"
                    aria-hidden
                  >
                    📝
                  </div>
                ) : (
                  <img
                    src={user?.profilePic || assets.avatar_icon}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                )}

                {!user.isSavedNotes && onlineUsers.includes(user._id) && (
                  <span
                    className="absolute bottom-0 right-0 w-2.5 h-2.5
                  bg-green-500 border-2 border-[#0d0d12]
                  rounded-full"
                  ></span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{user.fullName}</p>

                  {!user.isSavedNotes && unseenMessages[user._id] > 0 && (
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
                    user.isSavedNotes
                      ? "text-amber-300/80"
                      : onlineUsers.includes(user._id)
                        ? "text-green-400"
                        : "text-gray-500"
                  }`}
                >
                  {user.isSavedNotes
                    ? "Only you"
                    : onlineUsers.includes(user._id)
                      ? "Online"
                      : "Offline"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

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

      <CreateGroupModal
        open={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
      />
    </div>
  );
};

export default Sidebar;
