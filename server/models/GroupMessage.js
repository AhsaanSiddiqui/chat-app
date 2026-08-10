import mongoose from "mongoose";

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String },
    image: { type: String },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      text: { type: String },
      image: { type: String },
      isDeleted: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessage;
