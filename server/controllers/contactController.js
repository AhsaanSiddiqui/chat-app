import Contact, { sortedPair, otherUserId } from "../models/Contact.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { sendChatInviteEmail } from "../lib/email.js";
import { io, userSocketMap } from "../server.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const emitToUser = (userId, event, payload) => {
  const socketId = userSocketMap[String(userId)];
  if (socketId) io.to(socketId).emit(event, payload);
};

/** Backfill accepted contacts from existing DM history (one-time style sync). */
const syncContactsFromMessages = async (myObjectId) => {
  const peers = await Message.aggregate([
    {
      $match: {
        $or: [{ senderId: myObjectId }, { receiverId: myObjectId }],
        $expr: { $ne: ["$senderId", "$receiverId"] },
      },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ["$senderId", myObjectId] },
            "$receiverId",
            "$senderId",
          ],
        },
      },
    },
  ]);

  for (const row of peers) {
    const peerId = row._id;
    if (!peerId || String(peerId) === String(myObjectId)) continue;
    const pair = sortedPair(myObjectId, peerId);
    const existing = await Contact.findOne(pair);
    if (!existing) {
      await Contact.create({
        ...pair,
        requestedBy: myObjectId,
        status: "accepted",
      });
    } else if (existing.status !== "accepted") {
      existing.status = "accepted";
      existing.inviteEmail = "";
      await existing.save();
    }
  }
};

export const areAcceptedContacts = async (userId1, userId2) => {
  if (String(userId1) === String(userId2)) return true; // Saved Notes
  const pair = sortedPair(userId1, userId2);
  const contact = await Contact.findOne({ ...pair, status: "accepted" }).lean();
  return !!contact;
};

// Sidebar: only Saved Notes + accepted contacts (+ pending incoming)
export const getUsersForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;
    const myObjectId = new mongoose.Types.ObjectId(String(userId));

    await syncContactsFromMessages(myObjectId);

    const me = await User.findById(userId).select("-password").lean();

    const [accepted, pendingIncoming, pendingOutgoing] = await Promise.all([
      Contact.find({
        status: "accepted",
        $or: [{ userA: myObjectId }, { userB: myObjectId }],
      }).lean(),
      Contact.find({
        status: "pending",
        $or: [{ userA: myObjectId }, { userB: myObjectId }],
        requestedBy: { $ne: myObjectId },
      })
        .populate("requestedBy", "fullName email profilePic bio")
        .lean(),
      Contact.find({
        status: "pending",
        requestedBy: myObjectId,
      }).lean(),
    ]);

    const contactIds = accepted
      .map((c) => otherUserId(c, userId))
      .filter((id) => String(id) !== String(userId));

    const contactUsers = contactIds.length
      ? await User.find({ _id: { $in: contactIds } })
          .select("-password")
          .lean()
      : [];

    const [unseenCounts, lastMessages] = await Promise.all([
      Message.aggregate([
        {
          $match: {
            receiverId: myObjectId,
            seen: false,
            $expr: { $ne: ["$senderId", "$receiverId"] },
          },
        },
        { $group: { _id: "$senderId", count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        {
          $match: {
            $or: [{ senderId: myObjectId }, { receiverId: myObjectId }],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$senderId", myObjectId] },
                "$receiverId",
                "$senderId",
              ],
            },
            lastMessageAt: { $first: "$createdAt" },
          },
        },
      ]),
    ]);

    const unseenMessages = {};
    unseenCounts.forEach((row) => {
      unseenMessages[String(row._id)] = row.count;
    });

    const lastMap = {};
    lastMessages.forEach((row) => {
      lastMap[String(row._id)] = row.lastMessageAt;
    });

    const users = contactUsers
      .map((user) => ({
        ...user,
        lastMessageAt: lastMap[String(user._id)] || null,
      }))
      .sort((a, b) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return String(a.fullName || "").localeCompare(String(b.fullName || ""));
      });

    const savedNotes = me
      ? {
          ...me,
          fullName: "Saved Notes",
          bio: "Your private space for important notes",
          isSavedNotes: true,
          lastMessageAt: lastMap[String(userId)] || null,
        }
      : null;

    const incomingInvites = pendingIncoming
      .map((c) => {
        const from = c.requestedBy;
        if (!from || typeof from !== "object") return null;
        return {
          contactId: c._id,
          from,
          createdAt: c.createdAt,
        };
      })
      .filter(Boolean);

    const outgoingInviteEmails = pendingOutgoing
      .filter((c) => c.inviteEmail)
      .map((c) => c.inviteEmail);

    const outgoingPendingIds = pendingOutgoing
      .filter((c) => c.userB && String(c.userA) !== String(c.userB))
      .map((c) => otherUserId(c, userId))
      .filter(Boolean)
      .map(String);

    res.json({
      success: true,
      users: savedNotes ? [savedNotes, ...users] : users,
      unseenMessages,
      incomingInvites,
      outgoingPendingIds,
      outgoingInviteEmails,
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const lookupUserByEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!EMAIL_RE.test(email)) {
      return res.json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (email === normalizeEmail(req.user.email)) {
      return res.json({
        success: true,
        found: false,
        isSelf: true,
        message: "That's your own email",
      });
    }

    const user = await User.findOne({ email }).select("-password").lean();
    if (!user) {
      return res.json({ success: true, found: false, email });
    }

    const pair = sortedPair(req.user._id, user._id);
    const contact = await Contact.findOne(pair).lean();

    return res.json({
      success: true,
      found: true,
      user,
      contactStatus: contact?.status || null,
      contactId: contact?._id || null,
      invitedByMe:
        contact && String(contact.requestedBy) === String(req.user._id),
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

/** Invite registered user (internal) or email (external). */
export const inviteUserByEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(email)) {
      return res.json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (email === normalizeEmail(req.user.email)) {
      return res.json({
        success: false,
        message: "You can't invite yourself",
      });
    }

    const existing = await User.findOne({ email }).select("-password").lean();

    // ---- Registered user: internal contact request (Teams-style) ----
    if (existing) {
      const pair = sortedPair(req.user._id, existing._id);
      let contact = await Contact.findOne(pair);

      if (contact?.status === "accepted") {
        return res.json({
          success: true,
          alreadyRegistered: true,
          alreadyContact: true,
          user: existing,
          message: "Already in your contacts — open chat",
        });
      }

      if (
        contact?.status === "pending" &&
        String(contact.requestedBy) === String(req.user._id)
      ) {
        return res.json({
          success: true,
          pending: true,
          user: existing,
          message: "Invite already sent — waiting for them to accept",
        });
      }

      // They invited you → auto-accept
      if (
        contact?.status === "pending" &&
        String(contact.requestedBy) !== String(req.user._id)
      ) {
        contact.status = "accepted";
        await contact.save();
        emitToUser(existing._id, "contactUpdated", {
          type: "accepted",
          userId: String(req.user._id),
        });
        return res.json({
          success: true,
          alreadyRegistered: true,
          accepted: true,
          user: existing,
          message: "Contact request accepted — you can chat now",
        });
      }

      if (contact?.status === "declined") {
        contact.status = "pending";
        contact.requestedBy = req.user._id;
        contact.inviteEmail = "";
        await contact.save();
      } else if (!contact) {
        contact = await Contact.create({
          ...pair,
          requestedBy: req.user._id,
          status: "pending",
        });
      }

      emitToUser(existing._id, "contactInvite", {
        contactId: String(contact._id),
        from: {
          _id: req.user._id,
          fullName: req.user.fullName,
          email: req.user.email,
          profilePic: req.user.profilePic,
        },
      });

      return res.json({
        success: true,
        pending: true,
        alreadyRegistered: true,
        user: existing,
        message: `Invite sent to ${existing.fullName} on QuickChat`,
      });
    }

    // ---- Not registered: email invite + pending by email ----
    let contact = await Contact.findOne({
      requestedBy: req.user._id,
      inviteEmail: email,
      status: "pending",
    });

    if (!contact) {
      contact = await Contact.findOneAndUpdate(
        {
          requestedBy: req.user._id,
          inviteEmail: email,
        },
        {
          $set: {
            userA: req.user._id,
            userB: null,
            requestedBy: req.user._id,
            inviteEmail: email,
            status: "pending",
          },
        },
        { upsert: true, new: true }
      );
    }

    const clientBase = (
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    ).replace(/\/$/, "");

    const signupUrl = `${clientBase}/login?email=${encodeURIComponent(email)}&signup=1`;
    const inviterName = req.user.fullName || "A QuickChat user";

    const result = await sendChatInviteEmail({
      to: email,
      inviterName,
      signupUrl,
    });

    if (!result.sent) {
      return res.json({
        success: false,
        message:
          result.error ||
          "Could not send invite email. Check SMTP settings.",
        signupUrl,
      });
    }

    return res.json({
      success: true,
      invited: true,
      email,
      message: `Invite email sent to ${email}`,
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const acceptContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = await Contact.findById(contactId);
    if (!contact || contact.status !== "pending") {
      return res.json({ success: false, message: "Invite not found" });
    }

    const me = String(req.user._id);
    const involved =
      String(contact.userA) === me ||
      (contact.userB && String(contact.userB) === me);
    if (!involved || String(contact.requestedBy) === me) {
      return res.json({ success: false, message: "Not allowed" });
    }

    contact.status = "accepted";
    contact.inviteEmail = "";
    await contact.save();

    const otherId = otherUserId(contact, me);
    const other = await User.findById(otherId).select("-password").lean();

    emitToUser(otherId, "contactUpdated", {
      type: "accepted",
      userId: me,
      user: {
        _id: req.user._id,
        fullName: req.user.fullName,
        email: req.user.email,
        profilePic: req.user.profilePic,
      },
    });

    return res.json({
      success: true,
      user: other,
      message: "Contact added",
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

export const declineContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = await Contact.findById(contactId);
    if (!contact || contact.status !== "pending") {
      return res.json({ success: false, message: "Invite not found" });
    }

    const me = String(req.user._id);
    const involved =
      String(contact.userA) === me ||
      (contact.userB && String(contact.userB) === me);
    if (!involved || String(contact.requestedBy) === me) {
      return res.json({ success: false, message: "Not allowed" });
    }

    contact.status = "declined";
    await contact.save();

    const otherId = otherUserId(contact, me);
    emitToUser(otherId, "contactUpdated", {
      type: "declined",
      userId: me,
    });

    return res.json({ success: true, message: "Invite declined" });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

/** After signup: attach email invites to the new user as pending incoming. */
export const attachEmailInvitesOnSignup = async (newUser) => {
  const email = normalizeEmail(newUser.email);
  if (!email) return;

  const pending = await Contact.find({
    inviteEmail: email,
    status: "pending",
  });

  for (const c of pending) {
    const inviterId = c.requestedBy;
    if (String(inviterId) === String(newUser._id)) continue;
    const pair = sortedPair(inviterId, newUser._id);
    await Contact.findOneAndUpdate(
      pair,
      {
        $set: {
          ...pair,
          requestedBy: inviterId,
          status: "pending",
          inviteEmail: "",
        },
      },
      { upsert: true, new: true }
    );
    await Contact.deleteOne({ _id: c._id });

    emitToUser(newUser._id, "contactInvite", {
      from: { _id: inviterId },
    });
    emitToUser(inviterId, "contactUpdated", {
      type: "inviteLinked",
      userId: String(newUser._id),
    });
  }
};
