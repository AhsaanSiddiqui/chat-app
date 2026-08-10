import mongoose from "mongoose"


const messageSchema = new mongoose.Schema({
   senderId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
   receiverId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
   text: {type: String,},
   image: {type: String,},
   seen: {type: Boolean, default: false},
   seenAt: {type: Date},
   isEdited: {type: Boolean, default: false},
   isDeleted: {type: Boolean, default: false},
   replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      text: { type: String },
      image: { type: String },
      isDeleted: { type: Boolean, default: false },
   },
}, {timestamps: true});

const Message = mongoose.model("Message", messageSchema);

export default Message;