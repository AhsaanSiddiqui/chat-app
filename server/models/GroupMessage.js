import mongoose from "mongoose";

const attachmentSchema = {
  url: { type: String },
  name: { type: String },
  size: { type: Number },
  mimeType: { type: String },
  kind: { type: String },
};

const reactionSchema = {
  emoji: { type: String, required: true },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
};

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
    attachment: attachmentSchema,
    attachments: [attachmentSchema],
    reactions: { type: [reactionSchema], default: [] },
    messageType: {
      type: String,
      enum: ["text", "system"],
      default: "text",
    },
    systemEvent: {
      type: String,
      enum: [
        "group_created",
        "member_added",
        "member_removed",
        "member_left",
        "admin_changed",
      ],
    },
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
      fileName: { type: String },
      isDeleted: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessage;
