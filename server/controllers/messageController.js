import Message from "../models/Message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js"
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

        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: selectedUserId },
                { senderId: selectedUserId, receiverId: myId },
            ]
        })
        await Message.updateMany({ senderId: selectedUserId, receiverId: myId },
            { seen: true });
        res.json({ success: true, messages })


    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}

// api to mark message as seen using message id
export const markMessageAsSeen = async (req, res) => {
    try {
        const { id } = req.params;
        await Message.findByIdAndUpdate(id, { seen: true })
        res.json({ success: true })
    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}

// send message to selected user
export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body;
        const receiverId = req.params.id;
        const senderId = req.user._id;

        let imageUrl;
        if (image) {
            const uploadResponse = await cloudinary.uploader.upload(image)
            imageUrl = uploadResponse.secure_url;
        }
        const newMessage = await Message.create({
            senderId,
            receiverId,
            text,
            image: imageUrl
        })

        // Emit the new message to the receiver's socket 
        const receiverSocketId = userSocketMap[String(receiverId)];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage)
        }


        res.json({ success: true, newMessage })
    } catch (error) {
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
