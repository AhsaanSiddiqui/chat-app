import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import {
  cleanupUploadedFiles,
  normalizeAttachmentsPayload,
  removeAttachmentFromMessage,
  removeTempFile,
  uploadManyAttachments,
} from "../lib/attachments.js";
import { io, userSocketMap } from "../server.js";

const emitToGroupMembers = (memberIds, event, payload, exceptUserId = null) => {
  memberIds.forEach((memberId) => {
    if (exceptUserId && String(memberId) === String(exceptUserId)) return;
    const socketId = userSocketMap[String(memberId)];
    if (socketId) io.to(socketId).emit(event, payload);
  });
};

const ensureMember = (group, userId) =>
  group.members.some((id) => String(id) === String(userId));

const ensureAdmin = (group, userId) => String(group.admin) === String(userId);

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
      members: uniqueMembers,
    });

    const populated = await Group.findById(group._id)
      .populate("members", "-password")
      .populate("admin", "-password");

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

    const groups = await Group.find({ members: userId })
      .populate("members", "-password")
      .populate("admin", "-password")
      .sort({ updatedAt: -1 });

    const unseenMessages = {};

    await Promise.all(
      groups.map(async (group) => {
        const count = await GroupMessage.countDocuments({
          groupId: group._id,
          senderId: { $ne: userId },
          seenBy: { $nin: [userId] },
          isDeleted: false,
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
    const group = await Group.findById(req.params.id)
      .populate("members", "-password")
      .populate("admin", "-password");

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

    const populated = await Group.findById(group._id)
      .populate("members", "-password")
      .populate("admin", "-password");

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
    memberIds.forEach((id) => existing.add(String(id)));
    group.members = [...existing];
    await group.save();

    const populated = await Group.findById(group._id)
      .populate("members", "-password")
      .populate("admin", "-password");

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

    if (String(group.admin) === String(targetId)) {
      return res.json({
        success: false,
        message: "Admin cannot be removed. Transfer admin first or delete group.",
      });
    }

    group.members = group.members.filter(
      (id) => String(id) !== String(targetId)
    );
    await group.save();

    const populated = await Group.findById(group._id)
      .populate("members", "-password")
      .populate("admin", "-password");

    emitToGroupMembers(
      [...group.members.map(String), String(targetId)],
      "groupUpdated",
      populated
    );

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
    }).select("_id");

    if (unseen.length) {
      const ids = unseen.map((m) => m._id);
      await GroupMessage.updateMany(
        { _id: { $in: ids } },
        { $addToSet: { seenBy: userId } }
      );

      emitToGroupMembers(group.members, "groupMessagesSeen", {
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
      ...(replyData ? { replyTo: replyData } : {}),
    });

    const populated = await GroupMessage.findById(message._id).populate(
      "senderId",
      "-password"
    );

    group.updatedAt = new Date();
    await group.save();

    emitToGroupMembers(group.members, "newGroupMessage", populated, senderId);

    res.json({ success: true, newMessage: populated });
  } catch (error) {
    await cleanupUploadedFiles(req.files);
    if (req.file?.path) await removeTempFile(req.file.path);
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

    const group = await Group.findById(message.groupId);
    if (!group || !ensureMember(group, userId)) {
      return res.json({ success: false, message: "Not a group member" });
    }

    if (!Array.isArray(message.reactions)) {
      message.reactions = [];
    }

    const existingIndex = message.reactions.findIndex(
      (reaction) =>
        String(reaction.userId) === String(userId) && reaction.emoji === emoji
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions.push({ emoji, userId });
    }

    message.markModified("reactions");
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
