import express from "express";
import { protectRoute } from "../middleware/auth.js";
import {
  addGroupMembers,
  createGroup,
  deleteGroupMessage,
  deleteGroupMessageAttachment,
  editGroupMessage,
  getGroupById,
  getGroupMessages,
  getMyGroups,
  makeGroupAdmin,
  reactToGroupMessage,
  removeGroupMember,
  sendGroupMessage,
  updateGroup,
} from "../controllers/groupController.js";
import { handleChatUpload } from "../lib/attachments.js";

const groupRouter = express.Router();

groupRouter.post("/create", protectRoute, createGroup);
groupRouter.get("/my", protectRoute, getMyGroups);
groupRouter.get("/:id", protectRoute, getGroupById);
groupRouter.put("/:id", protectRoute, updateGroup);
groupRouter.post("/:id/members", protectRoute, addGroupMembers);
groupRouter.post("/:id/admin", protectRoute, makeGroupAdmin);
groupRouter.delete("/:id/members/:userId", protectRoute, removeGroupMember);
groupRouter.get("/:id/messages", protectRoute, getGroupMessages);
groupRouter.post(
  "/:id/messages",
  protectRoute,
  handleChatUpload,
  sendGroupMessage
);
groupRouter.put("/messages/:messageId", protectRoute, editGroupMessage);
groupRouter.post(
  "/messages/:messageId/react",
  protectRoute,
  reactToGroupMessage
);
groupRouter.delete(
  "/messages/:messageId/attachments",
  protectRoute,
  deleteGroupMessageAttachment
);
groupRouter.delete("/messages/:messageId", protectRoute, deleteGroupMessage);

export default groupRouter;
