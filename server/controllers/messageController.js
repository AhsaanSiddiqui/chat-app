import Message from "../models/Message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js"
import {
    cleanupUploadedFiles,
    normalizeAttachmentsPayload,
    removeAttachmentFromMessage,
    removeTempFile,
    uploadManyAttachments,
} from "../lib/attachments.js";
import { io, userSocketMap } from "../server.js"

//  Get all users except the logged in user
export const getUsersForSidebar = async (req, res) => {
    try {
        const userId = req.user._id;

        const filteredUsers = await User.find({
            _id: { $ne: userId },
        }).select("-password");

        const unseenMessages = {};

        const promises = filteredUsers.map(async (user) => {
            const messages = await Message.find({
                senderId: user._id,
                receiverId: userId,
                seen: false,
            });

            if (messages.length > 0) {
                unseenMessages[user._id] = messages.length;
            }
        });

        await Promise.all(promises);

        res.json({
            success: true,
            users: filteredUsers,
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
                { seen: true, seenAt }
            );

            const senderSocketId = userSocketMap[String(selectedUserId)];
            if (senderSocketId) {
                io.to(senderSocketId).emit("messagesSeen", {
                    chatUserId: String(myId),
                    messageIds: ids.map(String),
                    seenAt,
                });
            }
        }

        const updatedMessages = messages.map((m) => {
            const obj = m.toObject();
            if (
                String(obj.senderId) === String(selectedUserId) &&
                String(obj.receiverId) === String(myId)
            ) {
                obj.seen = true;
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

        let message = existing;
        if (!existing.seen) {
            const seenAt = new Date();
            message = await Message.findByIdAndUpdate(
                id,
                { seen: true, seenAt },
                { new: true }
            );
        }

        if (message) {
            const senderSocketId = userSocketMap[String(message.senderId)];
            if (senderSocketId) {
                io.to(senderSocketId).emit("messagesSeen", {
                    chatUserId: String(message.receiverId),
                    messageIds: [String(message._id)],
                    seenAt: message.seenAt,
                });
            }
        }

        res.json({ success: true });
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
            io.to(receiverSocketId).emit("newMessage", newMessage)
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
