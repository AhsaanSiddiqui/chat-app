import express from "express";
import {protectRoute} from "../middleware/auth.js"
import {
    deleteMessage,
    deleteMessageAttachment,
    editMessage,
    getMessages,
    getUsersForSidebar,
    markMessageAsSeen,
    sendMessage,
} from "../controllers/messageController.js"
import { handleChatUpload } from "../lib/attachments.js"

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUsersForSidebar);
messageRouter.put("/mark/:id", protectRoute, markMessageAsSeen);
messageRouter.put("/edit/:id", protectRoute, editMessage);
messageRouter.delete("/delete/:id", protectRoute, deleteMessage);
messageRouter.delete(
  "/:id/attachments",
  protectRoute,
  deleteMessageAttachment
);
messageRouter.post("/send/:id", protectRoute, handleChatUpload, sendMessage);
messageRouter.get("/:id", protectRoute, getMessages);

export default messageRouter;