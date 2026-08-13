import express from "express";
import {protectRoute} from "../middleware/auth.js"
import {
    deleteMessage,
    deleteMessageAttachment,
    editMessage,
    getMessages,
    getUsersForSidebar,
    inviteUserByEmail,
    lookupUserByEmail,
    acceptContact,
    declineContact,
    markMessageAsDelivered,
    markMessageAsPlayed,
    markMessageAsSeen,
    reactToMessage,
    sendMessage,
    logCallActivity,
} from "../controllers/messageController.js"
import { handleChatUpload } from "../lib/attachments.js"

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUsersForSidebar);
messageRouter.get("/lookup", protectRoute, lookupUserByEmail);
messageRouter.post("/invite", protectRoute, inviteUserByEmail);
messageRouter.put("/contacts/:contactId/accept", protectRoute, acceptContact);
messageRouter.put("/contacts/:contactId/decline", protectRoute, declineContact);
messageRouter.put("/mark/:id", protectRoute, markMessageAsSeen);
messageRouter.put("/delivered/:id", protectRoute, markMessageAsDelivered);
messageRouter.put("/played/:id", protectRoute, markMessageAsPlayed);
messageRouter.put("/edit/:id", protectRoute, editMessage);
messageRouter.post("/react/:id", protectRoute, reactToMessage);
messageRouter.post("/call-log", protectRoute, logCallActivity);
messageRouter.delete("/delete/:id", protectRoute, deleteMessage);
messageRouter.delete(
  "/:id/attachments",
  protectRoute,
  deleteMessageAttachment
);
messageRouter.post("/send/:id", protectRoute, handleChatUpload, sendMessage);
messageRouter.get("/:id", protectRoute, getMessages);

export default messageRouter;