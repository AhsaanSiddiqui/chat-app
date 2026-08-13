import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Null while inviting an email that has not signed up yet
    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviteEmail: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

// One accepted/pending link between two registered users
contactSchema.index(
  { userA: 1, userB: 1 },
  {
    unique: true,
    partialFilterExpression: { userB: { $type: "objectId" } },
  }
);

// One pending email invite per inviter + email
contactSchema.index(
  { requestedBy: 1, inviteEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { inviteEmail: { $gt: "" } },
  }
);

export const sortedPair = (id1, id2) => {
  const a = String(id1);
  const b = String(id2);
  return a < b
    ? { userA: id1, userB: id2 }
    : { userA: id2, userB: id1 };
};

export const otherUserId = (contact, myId) => {
  const me = String(myId);
  if (String(contact.userA) === me) return contact.userB;
  return contact.userA;
};

const Contact = mongoose.model("Contact", contactSchema);

export default Contact;
