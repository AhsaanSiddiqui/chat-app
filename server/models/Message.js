import mongoose from "mongoose"

const attachmentSchema = {
   url: { type: String },
   name: { type: String },
   size: { type: Number },
   mimeType: { type: String },
   kind: { type: String }, // image | pdf | doc | excel | zip | file
};

const messageSchema = new mongoose.Schema({
   senderId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
   receiverId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
   text: {type: String,},
   image: {type: String,},
   attachment: attachmentSchema, // legacy single
   attachments: [attachmentSchema],
   seen: {type: Boolean, default: false},
   seenAt: {type: Date},
   isEdited: {type: Boolean, default: false},
   isDeleted: {type: Boolean, default: false},
   replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      text: { type: String },
      image: { type: String },
      fileName: { type: String },
      isDeleted: { type: Boolean, default: false },
   },
}, {timestamps: true});

const Message = mongoose.model("Message", messageSchema);

export default Message;
