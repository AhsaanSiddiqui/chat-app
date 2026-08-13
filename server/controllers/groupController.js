import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import {
  applyAttachmentMeta,
  cleanupUploadedFiles,
  normalizeAttachmentsPayload,
  removeAttachmentFromMessage,
  removeTempFile,
  uploadManyAttachments,
} from "../lib/attachments.js";
import { applyOneReactionPerUser } from "../lib/reactions.js";
import { io, userSocketMap } from "../server.js";

const emitToGroupMembers = (memberIds, event, payload, exceptUserId = null) => {
  const safePayload =
    payload && typeof payload.toObject === "function"
      ? payload.toObject()
      : payload;

  memberIds.forEach((memberId) => {
    if (exceptUserId && String(memberId) === String(exceptUserId)) return;
    const socketId = userSocketMap[String(memberId)];
    if (socketId) io.to(socketId).emit(event, safePayload);
  });
};

const resolveId = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
};

const ensureMember = (group, userId) =>
  group.members.some((id) => resolveId(id) === String(userId));

const getAdminIds = (group) => {
  const fromAdmins = (group.admins || []).map(resolveId).filter(Boolean);
  if (fromAdmins.length) return [...new Set(fromAdmins)];
  const single = resolveId(group.admin);
  return single ? [single] : [];
};

const ensureAdmin = (group, userId) =>
  getAdminIds(group).includes(String(userId));

const syncAdmins = (group, adminIds = []) => {
  const unique = [...new Set(adminIds.map(String).filter(Boolean))];
  group.admins = unique;
  const current = resolveId(group.admin);
  group.admin = unique.includes(current) ? current : unique[0] || group.admin;
};

const populateGroup = (query) =>
  query
    .populate("members", "-password")
    .populate("admin", "-password")
    .populate("admins", "-password");

const formatNameList = (names = []) => {
  if (!names.length) return "someone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

const createGroupSystemMessage = async ({
  groupId,
  actorId,
  text,
  systemEvent,
  notifyMemberIds = [],
}) => {
  const message = await GroupMessage.create({
    groupId,
    senderId: actorId,
    text,
    messageType: "system",
    systemEvent,
    seenBy: [actorId],
  });

  const populated = await GroupMessage.findById(message._id).populate(
    "senderId",
    "-password"
  );

  await Group.findByIdAndUpdate(groupId, { updatedAt: new Date() });

  const recipients = [
    ...new Set((notifyMemberIds || []).map(String).filter(Boolean)),
  ];
  emitToGroupMembers(recipients, "newGroupMessage", populated);

  return populated;
};

const getUserNameMap = async (ids = []) => {
  const users = await User.find({ _id: { $in: ids } }).select("fullName");
  const map = {};
  users.forEach((user) => {
    map[String(user._id)] = user.fullName || "Someone";
  });
  return map;
};

export const createGroup = async (req, res) => {
  try {
    const { name, description = "", memberIds = [], groupPic } = req.body;
    const adminId = req.user._id;

    if (!name?.trim()) {
      return res.json({ success: false, message: "Group name is required" });
    }

    const uniqueMembers = [
      ...new Set([String(adminId), ...memberIds.map(String)]),
    ];

    if (uniqueMembers.length < 2) {
      return res.json({
        success: false,
        message: "Select at least one member besides yourself",
      });
    }

    let picUrl = "";
    if (groupPic) {
      const upload = await cloudinary.uploader.upload(groupPic);
      picUrl = upload.secure_url;
    }

    const group = await Group.create({
      name: name.trim(),
      description,
      groupPic: picUrl,
      admin: adminId,
      admins: [adminId],
      members: uniqueMembers,
    });

    const populated = await populateGroup(Group.findById(group._id));

    const nameMap = await getUserNameMap(uniqueMembers);
    const actorName = nameMap[String(adminId)] || "Someone";
    const otherNames = uniqueMembers
      .filter((id) => String(id) !== String(adminId))
      .map((id) => nameMap[String(id)] || "Someone");

    await createGroupSystemMessage({
      groupId: group._id,
      actorId: adminId,
      text: `${actorName} created group "${group.name}" and added ${formatNameList(otherNames)}`,
      systemEvent: "group_created",
      notifyMemberIds: uniqueMembers,
    });

    emitToGroupMembers(uniqueMembers, "groupCreated", populated);

    res.json({ success: true, group: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await populateGroup(
      Group.find({ members: userId })
    ).sort({ updatedAt: -1 });

    const unseenMessages = {};

    await Promise.all(
      groups.map(async (group) => {
        const count = await GroupMessage.countDocuments({
          groupId: group._id,
          senderId: { $ne: userId },
          seenBy: { $nin: [userId] },
          isDeleted: false,
          messageType: { $ne: "system" },
        });
        if (count > 0) unseenMessages[group._id] = count;
      })
    );

    res.json({ success: true, groups, unseenMessages });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getGroupById = async (req, res) => {
  try {
    const group = await populateGroup(Group.findById(req.params.id));

    if (!group) {
      return res.json({ success: false, message: "Group not found" });
    }

    if (!ensureMember(group, req.user._id)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    res.json({ success: true, group });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.json({ success: false, message: "Group not found" });
    }

    if (!ensureAdmin(group, req.user._id)) {
      return res.json({ success: false, message: "Only admin can update group" });
    }

    const { name, description, groupPic } = req.body;
    if (name?.trim()) group.name = name.trim();
    if (description !== undefined) group.description = description;

    if (groupPic) {
      const upload = await cloudinary.uploader.upload(groupPic);
      group.groupPic = upload.secure_url;
    }

    await group.save();

    const populated = await populateGroup(Group.findById(group._id));

    emitToGroupMembers(group.members, "groupUpdated", populated);

    res.json({ success: true, group: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const addGroupMembers = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.json({ success: false, message: "Group not found" });
    }

    if (!ensureAdmin(group, req.user._id)) {
      return res.json({ success: false, message: "Only admin can add members" });
    }

    const { memberIds = [] } = req.body;
    const existing = new Set(group.members.map(String));
    const newlyAdded = memberIds
      .map(String)
      .filter((id) => id && !existing.has(id));

    if (!newlyAdded.length) {
      return res.json({ success: false, message: "No new members to add" });
    }

    newlyAdded.forEach((id) => existing.add(id));
    group.members = [...existing];
    await group.save();

    const populated = await populateGroup(Group.findById(group._id));

    const nameMap = await getUserNameMap([
      req.user._id,
      ...newlyAdded,
    ]);
    const actorName = nameMap[String(req.user._id)] || "Someone";
    const addedNames = newlyAdded.map(
      (id) => nameMap[String(id)] || "Someone"
    );

    await createGroupSystemMessage({
      groupId: group._id,
      actorId: req.user._id,
      text: `${actorName} added ${formatNameList(addedNames)}`,
      systemEvent: "member_added",
      notifyMemberIds: group.members,
    });

    emitToGroupMembers(group.members, "groupUpdated", populated);

    res.json({ success: true, group: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const removeGroupMember = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.json({ success: false, message: "Group not found" });
    }

    const targetId = req.params.userId;
    const requesterId = req.user._id;
    const isSelf = String(targetId) === String(requesterId);

    if (!isSelf && !ensureAdmin(group, requesterId)) {
      return res.json({
        success: false,
        message: "Only admin can remove members",
      });
    }

    if (!ensureMember(group, targetId)) {
      return res.json({ success: false, message: "User is not a group member" });
    }

    const adminIds = getAdminIds(group);
    const targetIsAdmin = adminIds.includes(String(targetId));

    if (targetIsAdmin && adminIds.length === 1) {
      return res.json({
        success: false,
        message:
          "The only admin cannot leave or be removed. Make someone else admin first.",
      });
    }

    const nameMap = await getUserNameMap([requesterId, targetId]);
    const actorName = nameMap[String(requesterId)] || "Someone";
    const targetName = nameMap[String(targetId)] || "Someone";

    group.members = group.members.filter(
      (id) => resolveId(id) !== String(targetId)
    );

    if (targetIsAdmin) {
      syncAdmins(
        group,
        adminIds.filter((id) => id !== String(targetId))
      );
    }

    await group.save();

    const populated = await populateGroup(Group.findById(group._id));

    const remainingAndTarget = [
      ...group.members.map(String),
      String(targetId),
    ];

    const systemText = isSelf
      ? `${targetName} left`
      : `${actorName} removed ${targetName}`;

    await createGroupSystemMessage({
      groupId: group._id,
      actorId: requesterId,
      text: systemText,
      systemEvent: isSelf ? "member_left" : "member_removed",
      notifyMemberIds: remainingAndTarget,
    });

    emitToGroupMembers(remainingAndTarget, "groupUpdated", populated);

    res.json({ success: true, group: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const makeGroupAdmin = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.json({ success: false, message: "Group not found" });
    }

    if (!ensureAdmin(group, req.user._id)) {
      return res.json({
        success: false,
        message: "Only admin can promote members",
      });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.json({ success: false, message: "Member is required" });
    }

    if (!ensureMember(group, userId)) {
      return res.json({
        success: false,
        message: "User must be a group member",
      });
    }

    const adminIds = getAdminIds(group);
    if (adminIds.includes(String(userId))) {
      return res.json({
        success: false,
        message: "User is already an admin",
      });
    }

    const nameMap = await getUserNameMap([req.user._id, userId]);
    const actorName = nameMap[String(req.user._id)] || "Someone";
    const newAdminName = nameMap[String(userId)] || "Someone";

    syncAdmins(group, [...adminIds, userId]);
    await group.save();

    const populated = await populateGroup(Group.findById(group._id));

    await createGroupSystemMessage({
      groupId: group._id,
      actorId: req.user._id,
      text: `${actorName} made ${newAdminName} an admin`,
      systemEvent: "admin_changed",
      notifyMemberIds: group.members,
    });

    emitToGroupMembers(group.members, "groupUpdated", populated);

    res.json({ success: true, group: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group || !ensureMember(group, userId)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    const messages = await GroupMessage.find({ groupId })
      .populate("senderId", "-password")
      .sort({ createdAt: 1 });

    const unseen = await GroupMessage.find({
      groupId,
      senderId: { $ne: userId },
      seenBy: { $nin: [userId] },
      messageType: { $ne: "system" },
    }).select("_id");

    if (unseen.length) {
      const ids = unseen.map((m) => m._id);
      await GroupMessage.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { seenBy: userId, deliveredTo: userId } }
      );

      emitToGroupMembers(group.members, "groupMessagesDelivered", {
        groupId: String(groupId),
        userId: String(userId),
        messageIds: ids.map(String),
      });
      emitToGroupMembers(group.members, "groupMessagesSeen", {
        groupId: String(groupId),
        userId: String(userId),
        messageIds: ids.map(String),
      });
    }

    const undelivered = await GroupMessage.find({
      groupId,
      senderId: { $ne: userId },
      deliveredTo: { $nin: [userId] },
      messageType: { $ne: "system" },
    }).select("_id");

    if (undelivered.length) {
      const ids = undelivered.map((m) => m._id);
      await GroupMessage.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { deliveredTo: userId } }
      );
      emitToGroupMembers(group.members, "groupMessagesDelivered", {
        groupId: String(groupId),
        userId: String(userId),
        messageIds: ids.map(String),
      });
    }

    res.json({ success: true, messages });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const groupId = req.params.id;
    const senderId = req.user._id;
    const { text, image, replyTo } = req.body;
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    const group = await Group.findById(groupId);
    if (!group || !ensureMember(group, senderId)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    let attachments = [];
    let imageUrl = "";

    if (uploadedFiles.length) {
      attachments = await uploadManyAttachments(uploadedFiles);
      attachments = applyAttachmentMeta(attachments, req.body.attachmentMeta);
      const normalized = normalizeAttachmentsPayload(attachments);
      attachments = normalized.attachments;
      imageUrl = normalized.imageUrl;
    } else if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
      attachments = [
        {
          url: imageUrl,
          name: "image.jpg",
          size: 0,
          mimeType: "image/jpeg",
          kind: "image",
        },
      ];
    }

    if (!text?.trim() && !attachments.length) {
      return res.json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    let replyData;
    if (replyTo) {
      const original = await GroupMessage.findById(replyTo);
      if (original) {
        const originalFiles =
          original.attachments?.length
            ? original.attachments
            : original.attachment
              ? [original.attachment]
              : [];
        replyData = {
          messageId: original._id,
          senderId: original.senderId,
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

    const message = await GroupMessage.create({
      groupId,
      senderId,
      text: text || "",
      image: imageUrl,
      ...(attachments.length
        ? {
            attachments,
            attachment: attachments[0],
          }
        : {}),
      seenBy: [senderId],
      deliveredTo: [senderId],
      ...(replyData ? { replyTo: replyData } : {}),
    });

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    group.updatedAt = new Date();
    await group.save();

    // Mark delivered for currently online members (except sender)
    const onlineMemberIds = group.members
      .map(String)
      .filter((id) => id !== String(senderId) && userSocketMap[id]);

    if (onlineMemberIds.length) {
      await GroupMessage.findByIdAndUpdate(message._id, {
        $addToSet: { deliveredTo: { $each: onlineMemberIds } },
      });
      const refreshed = await GroupMessage.findById(message._id).populate(
        "senderId",
        "-password"
      );
      emitToGroupMembers(group.members, "newGroupMessage", refreshed, senderId);
      emitToGroupMembers(group.members, "groupMessagesDelivered", {
        groupId: String(groupId),
        userId: "online-batch",
        messageIds: [String(message._id)],
        deliveredTo: refreshed.deliveredTo,
      });
      return res.json({ success: true, newMessage: refreshed });
    }

    emitToGroupMembers(group.members, "newGroupMessage", populated, senderId);

    res.json({ success: true, newMessage: populated });
  } catch (error) {
    await cleanupUploadedFiles(req.files);
    if (req.file?.path) await removeTempFile(req.file.path);
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const markGroupMessageDelivered = async (req, res) => {
  try {
    const message = await GroupMessage.findById(req.params.messageId);
    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    const group = await Group.findById(message.groupId);
    if (!group || !ensureMember(group, req.user._id)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    if (String(message.senderId) === String(req.user._id)) {
      return res.json({ success: true, message });
    }

    const updated = await GroupMessage.findByIdAndUpdate(
      message._id,
      { $addToSet: { deliveredTo: req.user._id } },
      { new: true }
    ).populate("senderId", "-password");

    emitToGroupMembers(group.members, "groupMessagesDelivered", {
      groupId: String(message.groupId),
      userId: String(req.user._id),
      messageIds: [String(message._id)],
      deliveredTo: updated.deliveredTo,
    });

    res.json({ success: true, message: updated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const markGroupMessagePlayed = async (req, res) => {
  try {
    const message = await GroupMessage.findById(req.params.messageId);
    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    const group = await Group.findById(message.groupId);
    if (!group || !ensureMember(group, req.user._id)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    const hasAudio =
      (message.attachments || []).some((a) => a.kind === "audio") ||
      message.attachment?.kind === "audio";
    if (!hasAudio) {
      return res.json({
        success: false,
        message: "Only voice messages can be marked played",
      });
    }

    const updated = await GroupMessage.findByIdAndUpdate(
      message._id,
      {
        $addToSet: {
          playedBy: req.user._id,
          seenBy: req.user._id,
          deliveredTo: req.user._id,
        },
      },
      { new: true }
    ).populate("senderId", "-password");

    emitToGroupMembers(group.members, "groupMessagesPlayed", {
      groupId: String(message.groupId),
      userId: String(req.user._id),
      messageIds: [String(message._id)],
      playedBy: updated.playedBy,
    });
    emitToGroupMembers(group.members, "groupMessagesSeen", {
      groupId: String(message.groupId),
      userId: String(req.user._id),
      messageIds: [String(message._id)],
    });

    res.json({ success: true, message: updated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const editGroupMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const message = await GroupMessage.findById(req.params.messageId);

    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    if (String(message.senderId) !== String(req.user._id)) {
      return res.json({ success: false, message: "Not allowed" });
    }

    if (message.messageType === "system") {
      return res.json({ success: false, message: "Cannot edit this message" });
    }

    if (message.isDeleted || (message.image && !message.text)) {
      return res.json({ success: false, message: "Cannot edit this message" });
    }

    if (message.attachment?.url && !message.text) {
      return res.json({ success: false, message: "Cannot edit this message" });
    }

    if (message.attachments?.length && !message.text) {
      return res.json({ success: false, message: "Cannot edit this message" });
    }

    message.text = text.trim();
    message.isEdited = true;
    await message.save();

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    const group = await Group.findById(message.groupId);
    if (group) {
      emitToGroupMembers(group.members, "groupMessageUpdated", populated);
    }

    res.json({ success: true, message: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const deleteGroupMessage = async (req, res) => {
  try {
    const message = await GroupMessage.findById(req.params.messageId);

    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    if (String(message.senderId) !== String(req.user._id)) {
      return res.json({ success: false, message: "Not allowed" });
    }

    if (message.messageType === "system") {
      return res.json({ success: false, message: "Cannot delete system messages" });
    }

    message.text = "";
    message.image = "";
    message.attachment = undefined;
    message.attachments = [];
    message.reactions = [];
    message.isDeleted = true;
    message.isEdited = false;
    await message.save();

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    const group = await Group.findById(message.groupId);
    if (group) {
      emitToGroupMembers(group.members, "groupMessageDeleted", populated);
    }

    res.json({ success: true, message: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const deleteGroupMessageAttachment = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { url } = req.body;
    const message = await GroupMessage.findById(messageId);

    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    if (String(message.senderId) !== String(req.user._id)) {
      return res.json({ success: false, message: "Not allowed" });
    }

    if (message.isDeleted) {
      return res.json({ success: false, message: "Message already deleted" });
    }

    let result;
    try {
      result = removeAttachmentFromMessage(message, url);
    } catch (error) {
      return res.json({ success: false, message: error.message });
    }

    await message.save();

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    const group = await Group.findById(message.groupId);
    if (group) {
      emitToGroupMembers(
        group.members,
        result.fullyDeleted ? "groupMessageDeleted" : "groupMessageUpdated",
        populated
      );
    }

    res.json({
      success: true,
      message: populated,
      fullyDeleted: result.fullyDeleted,
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

const isValidReactionEmoji = (emoji) => {
  if (!emoji || typeof emoji !== "string") return false;
  const value = emoji.trim();
  if (!value || value.length > 16) return false;
  if (/^[a-zA-Z0-9\s.,!?]{2,}$/.test(value)) return false;
  return (
    /[^\u0000-\u007F]/.test(value) ||
    ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏", "✅", "❌", "👌"].includes(
      value
    )
  );
};

export const reactToGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!isValidReactionEmoji(emoji)) {
      return res.json({ success: false, message: "Invalid reaction" });
    }

    const message = await GroupMessage.findById(messageId);
    if (!message) {
      return res.json({ success: false, message: "Message not found" });
    }

    if (message.isDeleted) {
      return res.json({
        success: false,
        message: "Cannot react to deleted message",
      });
    }

    if (message.messageType === "system") {
      return res.json({
        success: false,
        message: "Cannot react to system messages",
      });
    }

    const group = await Group.findById(message.groupId);
    if (!group || !ensureMember(group, userId)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    applyOneReactionPerUser(message, userId, emoji);
    await message.save();

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    emitToGroupMembers(group.members, "groupMessageUpdated", populated);

    res.json({ success: true, message: populated });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
