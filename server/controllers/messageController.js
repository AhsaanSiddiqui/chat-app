import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js"
import {
  cleanupUploadedFiles,
  normalizeAttachmentsPayload,
  applyAttachmentMeta,
  removeAttachmentFromMessage,
  removeTempFile,
  uploadManyAttachments,
} from "../lib/attachments.js";
import { applyOneReactionPerUser } from "../lib/reactions.js";
import { io, userSocketMap } from "../server.js"

//  Get all users except the logged in user
export const getUsersForSidebar = async (req, res) => {
    try {
        const userId = req.user._id;
        const myObjectId = new mongoose.Types.ObjectId(String(userId));

        const filteredUsers = await User.find({
            _id: { $ne: userId },
        }).select("-password").lean();

        const [unseenCounts, lastMessages] = await Promise.all([
            Message.aggregate([
                {
                    $match: {
                        receiverId: myObjectId,
                        seen: false,
                    },
                },
                {
                    $group: {
                        _id: "$senderId",
                        count: { $sum: 1 },
                    },
                },
            ]),
            Message.aggregate([
                {
                    $match: {
                        $or: [
                            { senderId: myObjectId },
                            { receiverId: myObjectId },
                        ],
                    },
                },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $eq: ["$senderId", myObjectId] },
                                "$receiverId",
                                "$senderId",
                            ],
                        },
                        lastMessageAt: { $first: "$createdAt" },
                    },
                },
            ]),
        ]);

        const unseenMessages = {};
        unseenCounts.forEach((row) => {
            unseenMessages[String(row._id)] = row.count;
        });

        const lastMap = {};
        lastMessages.forEach((row) => {
            lastMap[String(row._id)] = row.lastMessageAt;
        });

        const users = filteredUsers
            .map((user) => ({
                ...user,
                lastMessageAt: lastMap[String(user._id)] || null,
            }))
            .sort((a, b) => {
                const ta = a.lastMessageAt
                    ? new Date(a.lastMessageAt).getTime()
                    : 0;
                const tb = b.lastMessageAt
                    ? new Date(b.lastMessageAt).getTime()
                    : 0;
                if (tb !== ta) return tb - ta;
                return String(a.fullName || "").localeCompare(
                    String(b.fullName || "")
                );
            });

        res.json({
            success: true,
            users,
            unseenMessages,
        });

    } catch (error) {
        console.log(error.message);
        res.json({
            success: false,
            message: error.message,
        });
    }
};

// Get all messages for selected user
export const getMessages = async (req, res) => {
    try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;

        const [messages, unseen] = await Promise.all([
            Message.find({
                $or: [
                    { senderId: myId, receiverId: selectedUserId },
                    { senderId: selectedUserId, receiverId: myId },
                ],
            }),
            Message.find({
                senderId: selectedUserId,
                receiverId: myId,
                seen: false,
            }).select("_id"),
        ]);

        if (unseen.length > 0) {
            const ids = unseen.map((m) => m._id);
            const seenAt = new Date();
            await Message.updateMany(
                { _id: { $in: ids } },
                {
                    seen: true,
                    seenAt,
                    delivered: true,
                    deliveredAt: seenAt,
                }
            );

            const senderSocketId = userSocketMap[String(selectedUserId)];
            if (senderSocketId) {
                io.to(senderSocketId).emit("messagesDelivered", {
                    chatUserId: String(myId),
                    messageIds: ids.map(String),
                    deliveredAt: seenAt,
                });
                io.to(senderSocketId).emit("messagesSeen", {
                    chatUserId: String(myId),
                    messageIds: ids.map(String),
                    seenAt,
                });
            }
        }

        // Also mark any undelivered as delivered when chat is opened
        const undelivered = await Message.find({
            senderId: selectedUserId,
            receiverId: myId,
            delivered: false,
        }).select("_id");
        if (undelivered.length) {
            const ids = undelivered.map((m) => m._id);
            const deliveredAt = new Date();
            await Message.updateMany(
                { _id: { $in: ids } },
                { delivered: true, deliveredAt }
            );
            const senderSocketId = userSocketMap[String(selectedUserId)];
            if (senderSocketId) {
                io.to(senderSocketId).emit("messagesDelivered", {
                    chatUserId: String(myId),
                    messageIds: ids.map(String),
                    deliveredAt,
                });
            }
        }

        const updatedMessages = messages.map((m) => {
            const obj = m.toObject();
            if (
                String(obj.senderId) === String(selectedUserId) &&
                String(obj.receiverId) === String(myId)
            ) {
                obj.delivered = true;
                obj.seen = true;
                if (!obj.deliveredAt) obj.deliveredAt = new Date();
                if (!obj.seenAt) obj.seenAt = new Date();
            }
            return obj;
        });

        res.json({ success: true, messages: updatedMessages });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// api to mark message as seen using message id
export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await Message.findById(id);

        if (!existing) {
            return res.json({ success: false, message: "Message not found" });
        }

        if (String(existing.receiverId) !== String(req.user._id)) {
            return res.json({ success: false, message: "Not allowed" });
        }

        const now = new Date();
        const updates = {};
        if (!existing.delivered) {
            updates.delivered = true;
            updates.deliveredAt = existing.deliveredAt || now;
        }
        if (!existing.seen) {
            updates.seen = true;
            updates.seenAt = now;
        }

        const message = Object.keys(updates).length
            ? await Message.findByIdAndUpdate(id, updates, { new: true })
            : existing;

        const senderSocketId = userSocketMap[String(message.senderId)];
        if (senderSocketId) {
            if (updates.delivered) {
                io.to(senderSocketId).emit("messagesDelivered", {
                    chatUserId: String(message.receiverId),
                    messageIds: [String(message._id)],
                    deliveredAt: message.deliveredAt,
                });
            }
            if (updates.seen) {
                io.to(senderSocketId).emit("messagesSeen", {
                    chatUserId: String(message.receiverId),
                    messageIds: [String(message._id)],
                    seenAt: message.seenAt,
                });
            }
        }

        res.json({ success: true, message });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

export const markMessageAsDelivered = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await Message.findById(id);
        if (!existing) {
            return res.json({ success: false, message: "Message not found" });
        }
        if (String(existing.receiverId) !== String(req.user._id)) {
            return res.json({ success: false, message: "Not allowed" });
        }

        if (existing.delivered) {
            return res.json({ success: true, message: existing });
        }

        const deliveredAt = new Date();
        const message = await Message.findByIdAndUpdate(
            id,
            { delivered: true, deliveredAt },
            { new: true }
        );

        const senderSocketId = userSocketMap[String(message.senderId)];
        if (senderSocketId) {
            io.to(senderSocketId).emit("messagesDelivered", {
                chatUserId: String(message.receiverId),
                messageIds: [String(message._id)],
                deliveredAt,
            });
        }

        res.json({ success: true, message });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

export const markMessageAsPlayed = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await Message.findById(id);
        if (!existing) {
            return res.json({ success: false, message: "Message not found" });
        }
        if (String(existing.receiverId) !== String(req.user._id)) {
            return res.json({ success: false, message: "Not allowed" });
        }

        const hasAudio = (existing.attachments || []).some(
            (a) => a.kind === "audio"
        ) || existing.attachment?.kind === "audio";
        if (!hasAudio) {
            return res.json({
                success: false,
                message: "Only voice messages can be marked played",
            });
        }

        const now = new Date();
        const updates = { played: true, playedAt: existing.playedAt || now };
        if (!existing.delivered) {
            updates.delivered = true;
            updates.deliveredAt = existing.deliveredAt || now;
        }
        if (!existing.seen) {
            updates.seen = true;
            updates.seenAt = existing.seenAt || now;
        }

        const message = await Message.findByIdAndUpdate(id, updates, {
            new: true,
        });

        const senderSocketId = userSocketMap[String(message.senderId)];
        if (senderSocketId) {
            io.to(senderSocketId).emit("messagesPlayed", {
                chatUserId: String(message.receiverId),
                messageIds: [String(message._id)],
                playedAt: message.playedAt,
            });
            if (!existing.seen) {
                io.to(senderSocketId).emit("messagesSeen", {
                    chatUserId: String(message.receiverId),
                    messageIds: [String(message._id)],
                    seenAt: message.seenAt,
                });
            }
            if (!existing.delivered) {
                io.to(senderSocketId).emit("messagesDelivered", {
                    chatUserId: String(message.receiverId),
                    messageIds: [String(message._id)],
                    deliveredAt: message.deliveredAt,
                });
            }
        }

        res.json({ success: true, message });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// send message to selected user
export const sendMessage = async (req, res) => {
    try {
        const { text, image, replyTo } = req.body;
        const receiverId = req.params.id;
        const senderId = req.user._id;
        const uploadedFiles = Array.isArray(req.files) ? req.files : [];

        let attachments = [];
        let imageUrl = "";

        if (uploadedFiles.length) {
            attachments = await uploadManyAttachments(uploadedFiles);
            attachments = applyAttachmentMeta(
                attachments,
                req.body.attachmentMeta
            );
            const normalized = normalizeAttachmentsPayload(attachments);
            attachments = normalized.attachments;
            imageUrl = normalized.imageUrl;
        } else if (image) {
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
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
            const original = await Message.findById(replyTo);
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

        const newMessage = await Message.create({
            senderId,
            receiverId,
            text: text || "",
            image: imageUrl,
            ...(attachments.length
                ? {
                      attachments,
                      attachment: attachments[0],
                  }
                : {}),
            ...(replyData ? { replyTo: replyData } : {}),
        })

        // Emit the new message to the receiver's socket 
        const receiverSocketId = userSocketMap[String(receiverId)];
        if (receiverSocketId) {
            const payload =
                typeof newMessage.toObject === "function"
                    ? newMessage.toObject()
                    : newMessage;
            io.to(receiverSocketId).emit("newMessage", payload);
            // Online receiver ⇒ delivered once pushed to their socket
            const deliveredAt = new Date();
            const deliveredMessage = await Message.findByIdAndUpdate(
                newMessage._id,
                { delivered: true, deliveredAt },
                { new: true }
            );
            const senderSocketId = userSocketMap[String(senderId)];
            if (senderSocketId) {
                io.to(senderSocketId).emit("messagesDelivered", {
                    chatUserId: String(receiverId),
                    messageIds: [String(newMessage._id)],
                    deliveredAt,
                });
            }
            return res.json({
                success: true,
                newMessage: deliveredMessage || newMessage,
            });
        }

        res.json({ success: true, newMessage })
    } catch (error) {
        await cleanupUploadedFiles(req.files);
        if (req.file?.path) await removeTempFile(req.file.path);
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}

const emitToChatUsers = (message, event, payload) => {
    const senderSocketId = userSocketMap[String(message.senderId)];
    const receiverSocketId = userSocketMap[String(message.receiverId)];

    if (senderSocketId) io.to(senderSocketId).emit(event, payload);
    if (receiverSocketId) io.to(receiverSocketId).emit(event, payload);
};

// Edit a text message
export const editMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        const userId = req.user._id;

        if (!text?.trim()) {
            return res.json({ success: false, message: "Message text is required" });
        }

        const message = await Message.findById(id);
        if (!message) {
            return res.json({ success: false, message: "Message not found" });
        }

        if (String(message.senderId) !== String(userId)) {
            return res.json({ success: false, message: "You can only edit your own messages" });
        }

        if (message.isDeleted) {
            return res.json({ success: false, message: "Deleted messages cannot be edited" });
        }

        if (message.image && !message.text) {
            return res.json({ success: false, message: "Image messages cannot be edited" });
        }

        if (message.attachment?.url && !message.text) {
            return res.json({ success: false, message: "File messages cannot be edited" });
        }

        if (message.attachments?.length && !message.text) {
            return res.json({ success: false, message: "File messages cannot be edited" });
        }

        message.text = text.trim();
        message.isEdited = true;
        await message.save();

        emitToChatUsers(message, "messageUpdated", message);

        res.json({ success: true, message });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Soft-delete a message
export const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message) {
            return res.json({ success: false, message: "Message not found" });
        }

        if (String(message.senderId) !== String(userId)) {
            return res.json({ success: false, message: "You can only delete your own messages" });
        }

        message.text = "";
        message.image = "";
        message.attachment = undefined;
        message.attachments = [];
        message.reactions = [];
        message.isDeleted = true;
        message.isEdited = false;
        await message.save();

        emitToChatUsers(message, "messageDeleted", message);

        res.json({ success: true, message });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

// Delete a single attachment from a message
export const deleteMessageAttachment = async (req, res) => {
    try {
        const { id } = req.params;
        const { url } = req.body;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message) {
            return res.json({ success: false, message: "Message not found" });
        }

        if (String(message.senderId) !== String(userId)) {
            return res.json({
                success: false,
                message: "You can only delete your own attachments",
            });
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

        if (result.fullyDeleted) {
            emitToChatUsers(message, "messageDeleted", message);
        } else {
            emitToChatUsers(message, "messageUpdated", message);
        }

        res.json({ success: true, message, fullyDeleted: result.fullyDeleted });
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
    return /[^\u0000-\u007F]/.test(value) || ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏", "✅", "❌", "👌"].includes(value);
};

// Toggle emoji reaction on a DM message
export const reactToMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { emoji } = req.body;
        const userId = req.user._id;

        if (!isValidReactionEmoji(emoji)) {
            return res.json({ success: false, message: "Invalid reaction" });
        }

        const message = await Message.findById(id);
        if (!message) {
            return res.json({ success: false, message: "Message not found" });
        }

        if (message.isDeleted) {
            return res.json({ success: false, message: "Cannot react to deleted message" });
        }

        const isParticipant =
            String(message.senderId) === String(userId) ||
            String(message.receiverId) === String(userId);

        if (!isParticipant) {
            return res.json({ success: false, message: "Not allowed" });
        }

        applyOneReactionPerUser(message, userId, emoji);
        await message.save();

        emitToChatUsers(message, "messageUpdated", message);

        res.json({ success: true, message });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

const CALL_STATUSES = new Set([
    "answered",
    "missed",
    "declined",
    "cancelled",
    "busy",
    "unavailable",
]);

/** Persist a 1:1 call activity bubble in the DM thread (deduped by callId). */
export const logCallActivity = async (req, res) => {
    try {
        const {
            callerId,
            calleeId,
            callId,
            callType = "audio",
            status,
            duration = 0,
        } = req.body;

        if (!callerId || !calleeId || !callId || !CALL_STATUSES.has(status)) {
            return res.json({ success: false, message: "Invalid call log" });
        }

        const me = String(req.user._id);
        if (me !== String(callerId) && me !== String(calleeId)) {
            return res.json({ success: false, message: "Not allowed" });
        }

        if (String(callerId) === String(calleeId)) {
            return res.json({ success: false, message: "Invalid participants" });
        }

        const existing = await Message.findOne({ callId: String(callId) });
        if (existing) {
            if (
                status === "answered" &&
                existing.call?.status !== "answered" &&
                Number(duration) > 0
            ) {
                existing.call = {
                    callType: callType === "video" ? "video" : "audio",
                    status: "answered",
                    duration: Math.max(0, Math.floor(Number(duration) || 0)),
                };
                existing.text = "";
                await existing.save();
                emitToChatUsers(existing, "messageUpdated", existing);
                return res.json({ success: true, newMessage: existing });
            }
            return res.json({ success: true, newMessage: existing });
        }

        const newMessage = await Message.create({
            senderId: callerId,
            receiverId: calleeId,
            text: "",
            messageType: "call",
            callId: String(callId),
            call: {
                callType: callType === "video" ? "video" : "audio",
                status,
                duration: Math.max(0, Math.floor(Number(duration) || 0)),
            },
            delivered: true,
            deliveredAt: new Date(),
            seen: false,
        });

        const callerSocket = userSocketMap[String(callerId)];
        const calleeSocket = userSocketMap[String(calleeId)];
        if (callerSocket) io.to(callerSocket).emit("newMessage", newMessage);
        if (calleeSocket) io.to(calleeSocket).emit("newMessage", newMessage);

        res.json({ success: true, newMessage });
    } catch (error) {
        if (error?.code === 11000 && req.body?.callId) {
            const existing = await Message.findOne({
                callId: String(req.body.callId),
            });
            if (existing) {
                return res.json({ success: true, newMessage: existing });
            }
        }
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};
