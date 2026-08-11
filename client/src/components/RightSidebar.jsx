import React, { useContext, useEffect, useMemo, useState } from "react";
import assets from "../assets/assets";
import { ChatContext } from "../../context/ChatContext";
import { AuthContext } from "../../context/AuthContext";
import ImageLightbox from "./ImageLightbox";
import { getMessageAttachments } from "../lib/utils";

const resolveId = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id);
  return String(value);
};

const RightSidebar = () => {
  const {
    selectedUser,
    selectedGroup,
    messages,
    users,
    addGroupMembers,
    removeGroupMember,
  } = useContext(ChatContext);
  const { logout, onlineUsers, authUser } = useContext(AuthContext);
  const [msgImages, setMsgImages] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [pickedMembers, setPickedMembers] = useState([]);

  const active = selectedGroup || selectedUser;
  const isAdmin =
    selectedGroup &&
    resolveId(selectedGroup.admin) === String(authUser?._id);

  useEffect(() => {
    setMsgImages(
      messages
        .flatMap((msg) => {
          if (msg.isDeleted) return [];
          return getMessageAttachments(msg)
            .filter((file) => file.kind === "image" && file.url)
            .map((file) => file.url);
        })
        .filter(Boolean)
    );
  }, [messages]);

  useEffect(() => {
    setLightboxImage(null);
    setShowAddMembers(false);
    setPickedMembers([]);
  }, [selectedUser?._id, selectedGroup?._id]);

  const memberIds = useMemo(
    () => new Set((selectedGroup?.members || []).map(resolveId)),
    [selectedGroup]
  );

  const addableUsers = useMemo(
    () => users.filter((u) => !memberIds.has(String(u._id))),
    [users, memberIds]
  );

  const togglePick = (id) => {
    setPickedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddMembers = async () => {
    if (!selectedGroup || !pickedMembers.length) return;
    const ok = await addGroupMembers(selectedGroup._id, pickedMembers);
    if (ok) {
      setPickedMembers([]);
      setShowAddMembers(false);
    }
  };

  const handleRemoveOrLeave = async (userId) => {
    if (!selectedGroup) return;
    const isSelf = String(userId) === String(authUser._id);
    const ok = window.confirm(
      isSelf ? "Leave this group?" : "Remove this member from the group?"
    );
    if (!ok) return;
    await removeGroupMember(selectedGroup._id, userId);
  };

  if (!active) return null;

  return (
    <div
      className={`bg-[#8185B2]/10 text-white w-full relative overflow-y-scroll ${
        active ? "max-md:hidden" : ""
      }`}
    >
      {selectedGroup ? (
        <>
          <div className="pt-16 flex flex-col items-center gap-2 text-xs font-light mx-auto">
            <img
              src={selectedGroup.groupPic || assets.avatar_icon}
              alt=""
              className="w-20 aspect-[1/1] rounded-full object-cover"
            />
            <h1 className="px-10 text-xl font-medium mx-auto text-center">
              {selectedGroup.name}
            </h1>
            <p className="px-10 mx-auto text-center text-gray-300">
              {selectedGroup.description ||
                `${selectedGroup.members?.length || 0} members`}
            </p>
          </div>

          <hr className="border-[#fffff50] my-4" />

          <div className="px-5 text-xs">
            <div className="flex items-center justify-between mb-2">
              <p>Members</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddMembers((v) => !v)}
                  className="text-violet-300 hover:text-violet-200"
                >
                  {showAddMembers ? "Done" : "Add"}
                </button>
              )}
            </div>

            {showAddMembers && (
              <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-2 space-y-1 max-h-40 overflow-y-auto">
                {addableUsers.length === 0 ? (
                  <p className="text-gray-500 px-1 py-2">No users to add</p>
                ) : (
                  addableUsers.map((user) => (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => togglePick(user._id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                        pickedMembers.includes(user._id)
                          ? "bg-violet-500/20"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <img
                        src={user.profilePic || assets.avatar_icon}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <span className="truncate">{user.fullName}</span>
                    </button>
                  ))
                )}
                {pickedMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAddMembers}
                    className="mt-1 w-full rounded-lg bg-violet-600 py-1.5 text-white"
                  >
                    Add selected
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {(selectedGroup.members || []).map((member) => {
                const id = resolveId(member);
                const isMemberAdmin = resolveId(selectedGroup.admin) === id;
                const isSelf = id === String(authUser._id);

                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
                  >
                    <div className="relative">
                      <img
                        src={member.profilePic || assets.avatar_icon}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                      />
                      {onlineUsers.includes(id) && (
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[12px]">
                        {member.fullName}
                        {isSelf ? " (You)" : ""}
                      </p>
                      {isMemberAdmin && (
                        <p className="text-[10px] text-violet-300">Admin</p>
                      )}
                    </div>
                    {(isSelf || (isAdmin && !isMemberAdmin)) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOrLeave(id)}
                        className="text-[10px] text-red-300 hover:text-red-200"
                      >
                        {isSelf ? "Leave" : "Remove"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="pt-16 flex flex-col items-center gap-2 text-xs font-light mx-auto">
          <img
            src={selectedUser?.profilePic || assets.avatar_icon}
            alt=""
            className="w-20 aspect-[1/1] rounded-full"
          />
          <h1 className="px-10 text-xl font-medium mx-auto flex items-center gap-2">
            {onlineUsers.includes(selectedUser._id) && (
              <p className="w-2 h-2 rounded-full bg-green-500"></p>
            )}
            {selectedUser.fullName}
          </h1>
          <p className="px-10 mx-auto">{selectedUser.bio}</p>
        </div>
      )}

      <hr className="border-[#fffff50] my-4" />
      <div className="px-5 text-xs pb-20">
        <p>Media</p>
        <div className="mt-2 max-h-[200px] overflow-y-scroll grid grid-cols-2 gap-4 opacity-80">
          {msgImages.map((url, index) => (
            <div
              key={`${url}-${index}`}
              onClick={() => setLightboxImage(url)}
              className="cursor-zoom-in rounded overflow-hidden"
            >
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover rounded-md hover:opacity-90 transition"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => logout()}
        className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-400 to-violet-600 text-white border-none text-sm font-light py-2 px-20 rounded-full cursor-pointer"
      >
        Logout
      </button>

      <ImageLightbox
        src={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
};

export default RightSidebar;
