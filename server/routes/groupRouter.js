import express from "express";
import { protectRoute } from "../middleware/auth.js";
import {
  addGroupMembers,
  createGroup,
  deleteGroupMessage,
  editGroupMessage,
  getGroupById,
  getGroupMessages,
  getMyGroups,
  removeGroupMember,
  sendGroupMessage,
  updateGroup,
} from "../controllers/groupController.js";

const groupRouter = express.Router();

groupRouter.post("/create", protectRoute, createGroup);
groupRouter.get("/my", protectRoute, getMyGroups);
groupRouter.get("/:id", protectRoute, getGroupById);
groupRouter.put("/:id", protectRoute, updateGroup);
groupRouter.post("/:id/members", protectRoute, addGroupMembers);
groupRouter.delete("/:id/members/:userId", protectRoute, removeGroupMember);
groupRouter.get("/:id/messages", protectRoute, getGroupMessages);
groupRouter.post("/:id/messages", protectRoute, sendGroupMessage);
groupRouter.put("/messages/:messageId", protectRoute, editGroupMessage);
groupRouter.delete("/messages/:messageId", protectRoute, deleteGroupMessage);

export default groupRouter;
