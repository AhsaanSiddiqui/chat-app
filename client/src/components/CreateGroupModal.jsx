import React, { useContext, useMemo, useState } from "react";
import { ChatContext } from "../../context/ChatContext";
import { AuthContext } from "../../context/AuthContext";
import assets from "../assets/assets";
import toast from "react-hot-toast";

const CreateGroupModal = ({ open, onClose }) => {
  const { users, createGroup } = useContext(ChatContext);
  const { authUser } = useContext(AuthContext);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [groupPic, setGroupPic] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const candidates = useMemo(
    () =>
      users.filter(
        (user) =>
          String(user._id) !== String(authUser?._id) &&
          user.fullName.toLowerCase().includes(search.toLowerCase())
      ),
    [users, authUser?._id, search]
  );

  if (!open) return null;

  const toggleMember = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handlePic = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setGroupPic(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const reset = () => {
    setName("");
    setDescription("");
    setSelectedIds([]);
    setSearch("");
    setGroupPic("");
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Group name is required");
      return;
    }
    if (selectedIds.length < 1) {
      toast.error("Select at least one member");
      return;
    }

    setSubmitting(true);
    const group = await createGroup({
      name: name.trim(),
      description: description.trim(),
      memberIds: selectedIds,
      groupPic: groupPic || undefined,
    });
    setSubmitting(false);

    if (group) {
      reset();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15151d] text-white shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">New group</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer">
              <img
                src={groupPic || assets.avatar_icon}
                alt=""
                className="h-14 w-14 rounded-full object-cover border border-white/10"
              />
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handlePic}
              />
            </label>
            <div className="flex-1 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
                maxLength={60}
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
                maxLength={120}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">
              Add members ({selectedIds.length})
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              className="mb-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-violet-500/50"
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="px-2 py-3 text-xs text-gray-500">No users found</p>
              ) : (
                candidates.map((user) => {
                  const selected = selectedIds.includes(user._id);
                  return (
                    <button
                      key={user._id}
                      type="button"
                      onClick={() => toggleMember(user._id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                        selected
                          ? "bg-violet-500/20 border border-violet-500/30"
                          : "hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <img
                        src={user.profilePic || assets.avatar_icon}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <span className="flex-1 truncate text-sm">
                        {user.fullName}
                      </span>
                      {selected && (
                        <span className="text-xs text-violet-300">✓</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium hover:bg-violet-500 disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
