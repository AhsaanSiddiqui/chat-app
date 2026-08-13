import React, { useContext, useEffect, useMemo, useState } from "react";
import assets from "../assets/assets";
import { ChatContext } from "../../context/ChatContext";
import { AuthContext } from "../../context/AuthContext";
import ImageLightbox from "./ImageLightbox";
import ConfirmModal from "./ConfirmModal";
import {
  attachmentLabel,
  extractUrlsFromText,
  formatFileSize,
  getMessageAttachments,
  linkDisplayHost,
  toHref,
} from "../lib/utils";

const resolveId = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
};

const getAdminIdSet = (group) => {
  if (!group) return new Set();
  const fromAdmins = (group.admins || []).map(resolveId).filter(Boolean);
  if (fromAdmins.length) return new Set(fromAdmins);
  const single = resolveId(group.admin);
  return new Set(single ? [single] : []);
};

const fileBadge = (kind) => {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "excel":
      return "XLS";
    case "doc":
      return "DOC";
    case "zip":
      return "ZIP";
    case "audio":
      return "VOICE";
    default:
      return "FILE";
  }
};

const RightSidebar = () => {
  const {
    selectedUser,
    selectedGroup,
    messages,
    users,
    addGroupMembers,
    removeGroupMember,
    makeGroupAdmin,
  } = useContext(ChatContext);
  const { logout, onlineUsers, authUser } = useContext(AuthContext);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [pickedMembers, setPickedMembers] = useState([]);
  const [mediaTab, setMediaTab] = useState("media"); // media | files | links
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const active = selectedGroup || selectedUser;
  const adminIds = useMemo(
    () => getAdminIdSet(selectedGroup),
    [selectedGroup]
  );
  const isAdmin = adminIds.has(String(authUser?._id));

  const { mediaImages, mediaFiles, chatLinks } = useMemo(() => {
    const images = [];
    const files = [];
    const links = [];
    const seenHrefs = new Set();

    messages.forEach((msg) => {
      if (msg.isDeleted) return;
      if (msg.messageType === "system") return;

      getMessageAttachments(msg).forEach((file) => {
        if (!file?.url) return;
        if (file.kind === "image") images.push(file);
        else files.push(file);
      });

      extractUrlsFromText(msg.text || "").forEach((url) => {
        const href = toHref(url);
        const key = href.toLowerCase();
        if (seenHrefs.has(key)) return;
        seenHrefs.add(key);
        links.push({
          url,
          href,
          host: linkDisplayHost(url),
          messageId: msg._id,
          createdAt: msg.createdAt,
        });
      });
    });

    // Newest shared links first
    links.reverse();

    return { mediaImages: images, mediaFiles: files, chatLinks: links };
  }, [messages]);

  const mediaImageUrls = useMemo(
    () => mediaImages.map((file) => file.url).filter(Boolean),
    [mediaImages]
  );

  useEffect(() => {
    setLightboxImage(null);
    setLightboxIndex(0);
    setShowAddMembers(false);
    setPickedMembers([]);
    setMediaTab("media");
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

  const closeConfirm = () => {
    if (confirmLoading) return;
    setConfirmDialog(null);
  };

  const runConfirm = async () => {
    if (!confirmDialog?.action) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.action();
      setConfirmDialog(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleRemoveOrLeave = (userId) => {
    if (!selectedGroup) return;
    const isSelf = String(userId) === String(authUser._id);
    setConfirmDialog({
      title: isSelf ? "Leave group" : "Remove member",
      message: isSelf
        ? "Are you sure you want to leave this group?"
        : "Remove this member from the group?",
      confirmLabel: isSelf ? "Leave" : "Remove",
      danger: true,
      action: () => removeGroupMember(selectedGroup._id, userId),
    });
  };

  const handleMakeAdmin = (userId, memberName) => {
    if (!selectedGroup) return;
    setConfirmDialog({
      title: "Make admin",
      message: `Make ${memberName || "this member"} a group admin?`,
      confirmLabel: "Make admin",
      danger: false,
      action: () => makeGroupAdmin(selectedGroup._id, userId),
    });
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
                const isMemberAdmin = adminIds.has(id);
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
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {isAdmin && !isMemberAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            handleMakeAdmin(id, member.fullName)
                          }
                          className="text-[11px] font-medium text-violet-300 hover:text-violet-200"
                        >
                          Make admin
                        </button>
                      )}
                      {(isSelf || (isAdmin && !isMemberAdmin)) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOrLeave(id)}
                          className="text-[11px] text-red-300 hover:text-red-200"
                        >
                          {isSelf ? "Leave" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="pt-16 flex flex-col items-center gap-2 text-xs font-light mx-auto">
          {selectedUser?.isSavedNotes ||
          String(selectedUser?._id) === String(authUser?._id) ? (
            <>
              <div
                className="w-20 aspect-[1/1] rounded-full
                bg-amber-500/20 border border-amber-400/30
                flex items-center justify-center text-3xl"
                aria-hidden
              >
                📝
              </div>
              <h1 className="px-10 text-xl font-medium mx-auto">
                Saved Notes
              </h1>
              <p className="px-10 mx-auto text-center text-gray-400">
                Message yourself to keep passwords, ideas, links, and other
                important notes — only you can see this chat.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      <hr className="border-[#fffff50] my-4" />
      <div className="px-3 text-xs pb-20">
        <div className="flex items-center gap-2 mb-3 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => setMediaTab("media")}
            className={`rounded-full px-3 py-1 transition ${
              mediaTab === "media"
                ? "bg-violet-500/30 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Media ({mediaImages.length})
          </button>
          <button
            type="button"
            onClick={() => setMediaTab("files")}
            className={`rounded-full px-3 py-1 transition ${
              mediaTab === "files"
                ? "bg-violet-500/30 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Files ({mediaFiles.length})
          </button>
          <button
            type="button"
            onClick={() => setMediaTab("links")}
            className={`rounded-full px-3 py-1 transition ${
              mediaTab === "links"
                ? "bg-violet-500/30 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Links ({chatLinks.length})
          </button>
        </div>

        {mediaTab === "media" ? (
          mediaImages.length === 0 ? (
            <p className="text-gray-500 py-2">No media yet</p>
          ) : (
            <div className="max-h-[260px] overflow-y-scroll grid grid-cols-2 gap-3 opacity-90">
              {mediaImages.map((file, index) => (
                <div
                  key={`${file.url}-${index}`}
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxImage(file.url);
                  }}
                  className="cursor-zoom-in rounded overflow-hidden aspect-square"
                >
                  <img
                    src={file.url}
                    alt={file.name || ""}
                    className="h-full w-full object-cover rounded-md hover:opacity-90 transition"
                  />
                </div>
              ))}
            </div>
          )
        ) : mediaTab === "files" ? (
          mediaFiles.length === 0 ? (
            <p className="text-gray-500 py-2">No files yet</p>
          ) : (
            <div className="max-h-[260px] overflow-y-auto space-y-2">
              {mediaFiles.map((file, index) => (
                <a
                  key={`${file.url}-${index}`}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  download={file.name}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 hover:bg-white/10 transition"
                  title="Open / download"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-[10px] font-semibold text-violet-200">
                    {fileBadge(file.kind)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-white">
                      {file.name || attachmentLabel(file.kind)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {[attachmentLabel(file.kind), formatFileSize(file.size)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="text-[10px] text-violet-300 flex-shrink-0">
                    Open
                  </span>
                </a>
              ))}
            </div>
          )
        ) : chatLinks.length === 0 ? (
          <p className="text-gray-500 py-2">No links yet</p>
        ) : (
          <div className="max-h-[260px] overflow-y-auto space-y-2">
            {chatLinks.map((link, index) => (
              <a
                key={`${link.href}-${index}`}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 hover:bg-white/10 transition"
                title={link.href}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-[10px] font-semibold text-sky-200">
                  URL
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-white">{link.host}</p>
                  <p className="truncate text-[10px] text-sky-300/90">
                    {link.url}
                  </p>
                </div>
                <span className="text-[10px] text-violet-300 flex-shrink-0">
                  Open
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => logout()}
        className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-400 to-violet-600 text-white border-none text-sm font-light py-2 px-20 rounded-full cursor-pointer"
      >
        Logout
      </button>

      <ImageLightbox
        src={lightboxImage}
        images={mediaImageUrls}
        startIndex={lightboxIndex}
        onClose={() => {
          setLightboxImage(null);
          setLightboxIndex(0);
        }}
      />

      <ConfirmModal
        open={!!confirmDialog}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        loading={confirmLoading}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      />
    </div>
  );
};

export default RightSidebar;
