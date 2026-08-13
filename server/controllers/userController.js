import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import SignupOtp from "../models/SignupOtp.js";
import PasswordResetOtp from "../models/PasswordResetOtp.js";
import { generateToken } from "../lib/uitls.js";
import cloudinary from "../lib/cloudinary.js";
import {
  canSendEmail,
  sendPasswordResetOtpEmail,
  sendSignupOtpEmail,
} from "../lib/email.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 5;

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  let user = await User.findOne({ email: normalizedEmail });
  if (user) return user;

  // Older accounts may have mixed-case emails stored
  user = await User.findOne({
    email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i") },
  });

  if (user && user.email !== normalizedEmail) {
    user.email = normalizedEmail;
    try {
      await user.save();
    } catch {
      // ignore unique conflicts; login can still proceed with found user
    }
  }

  return user;
};

const createOtpCode = () => String(crypto.randomInt(100000, 1000000));

const hashOtp = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

const getOfficeDomains = () =>
  String(process.env.ALLOWED_OFFICE_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

const validateOfficeSignup = (email, officeInviteCode) => {
  const expectedInvite = process.env.OFFICE_INVITE_CODE;
  if (!expectedInvite) {
    return {
      ok: false,
      message:
        "Office signup is not configured yet. Set OFFICE_INVITE_CODE on the server.",
    };
  }

  if (String(officeInviteCode || "").trim() !== String(expectedInvite).trim()) {
    return { ok: false, message: "Invalid office invite code" };
  }

  const domains = getOfficeDomains();
  if (domains.length) {
    const domain = normalizeEmail(email).split("@")[1] || "";
    if (!domains.includes(domain)) {
      return {
        ok: false,
        message: `Office accounts must use: ${domains.join(", ")}`,
      };
    }
  }

  return { ok: true };
};

const shouldReturnDevCode = () =>
  String(process.env.DEV_RETURN_OTP || "").toLowerCase() === "true" ||
  (!canSendEmail() && process.env.NODE_ENV !== "production");

// Step 1: collect signup details + send email OTP
export const requestSignup = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      bio = "",
      accountType = "personal",
      officeInviteCode = "",
    } = req.body;

    if (!fullName?.trim() || !email?.trim() || !password) {
      return res.json({ success: false, message: "Missing details" });
    }

    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const type = accountType === "office" ? "office" : "personal";
    const normalizedEmail = normalizeEmail(email);

    if (type === "office") {
      const officeCheck = validateOfficeSignup(normalizedEmail, officeInviteCode);
      if (!officeCheck.ok) {
        return res.json({ success: false, message: officeCheck.message });
      }
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.json({ success: false, message: "Account already exists" });
    }

    const code = createOtpCode();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await SignupOtp.deleteMany({ email: normalizedEmail });
    await SignupOtp.create({
      email: normalizedEmail,
      codeHash: hashOtp(code),
      fullName: fullName.trim(),
      passwordHash,
      bio: String(bio || "").trim(),
      accountType: type,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
    });

    const mail = await sendSignupOtpEmail({
      to: normalizedEmail,
      code,
      accountType: type,
    });

    const payload = {
      success: true,
      message: mail.sent
        ? "Verification code sent to your email"
        : mail.error ||
          "Could not send email right now. Use the temporary code below, or configure Resend on Railway.",
      email: normalizedEmail,
      accountType: type,
      emailSent: !!mail.sent,
    };

    // Always surface code when mail fails so signup is not blocked on Railway SMTP issues
    if (shouldReturnDevCode() || !mail.sent) {
      payload.devCode = code;
    }

    return res.json(payload);
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

// Step 2: verify OTP and create account
export const verifySignup = async (req, res) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code) {
      return res.json({
        success: false,
        message: "Email and verification code are required",
      });
    }

    const pending = await SignupOtp.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.json({
        success: false,
        message: "No pending signup found. Please start again.",
      });
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await SignupOtp.deleteMany({ email: normalizedEmail });
      return res.json({
        success: false,
        message: "Code expired. Please request a new one.",
      });
    }

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await SignupOtp.deleteMany({ email: normalizedEmail });
      return res.json({
        success: false,
        message: "Too many attempts. Please request a new code.",
      });
    }

    const matches = pending.codeHash === hashOtp(String(code).trim());
    if (!matches) {
      pending.attempts += 1;
      await pending.save();
      return res.json({ success: false, message: "Invalid verification code" });
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      await SignupOtp.deleteMany({ email: normalizedEmail });
      return res.json({ success: false, message: "Account already exists" });
    }

    const newUser = await User.create({
      fullName: pending.fullName,
      email: pending.email,
      password: pending.passwordHash,
      bio: pending.bio,
      accountType: pending.accountType,
      emailVerified: true,
    });

    await SignupOtp.deleteMany({ email: normalizedEmail });

    try {
      const { attachEmailInvitesOnSignup } = await import(
        "./contactController.js"
      );
      await attachEmailInvitesOnSignup(newUser);
    } catch (e) {
      console.log("attachEmailInvitesOnSignup:", e.message);
    }

    const token = generateToken(newUser._id);
    return res.json({
      success: true,
      userData: newUser,
      token,
      message: "Account created successfully",
    });
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

export const resendSignupOtp = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!normalizedEmail) {
      return res.json({ success: false, message: "Email is required" });
    }

    const pending = await SignupOtp.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.json({
        success: false,
        message: "No pending signup found. Please start again.",
      });
    }

    const code = createOtpCode();
    pending.codeHash = hashOtp(code);
    pending.expiresAt = new Date(Date.now() + OTP_TTL_MS);
    pending.attempts = 0;
    await pending.save();

    const mail = await sendSignupOtpEmail({
      to: normalizedEmail,
      code,
      accountType: pending.accountType,
    });

    const payload = {
      success: true,
      message: mail.sent
        ? "New verification code sent"
        : mail.error ||
          "Could not send email right now. Use the temporary code below.",
      emailSent: !!mail.sent,
    };

    if (shouldReturnDevCode() || !mail.sent) {
      payload.devCode = code;
    }

    return res.json(payload);
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

// Legacy direct signup blocked — force OTP flow
export const signup = async (_req, res) => {
  return res.json({
    success: false,
    message: "Please verify your email with the code sent to continue signup",
  });
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(401).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const userData = await findUserByEmail(email);

    if (!userData) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      String(password),
      userData.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = generateToken(userData._id);

    res.json({
      success: true,
      userData,
      token,
      message: "Login successful",
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!normalizedEmail) {
      return res.json({ success: false, message: "Email is required" });
    }

    const user = await findUserByEmail(normalizedEmail);

    // Same response whether user exists (avoid account enumeration)
    const genericMessage =
      "If an account exists for this email, a reset code has been sent.";

    if (!user) {
      return res.json({
        success: true,
        message: genericMessage,
        email: normalizedEmail,
        emailSent: false,
      });
    }

    const code = createOtpCode();
    await PasswordResetOtp.deleteMany({ email: normalizedEmail });
    await PasswordResetOtp.create({
      email: normalizedEmail,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
    });

    const mail = await sendPasswordResetOtpEmail({
      to: normalizedEmail,
      code,
    });

    const payload = {
      success: true,
      message: mail.sent
        ? "Password reset code sent to your email"
        : mail.error ||
          "Could not send email. Use the temporary code below to reset.",
      email: normalizedEmail,
      emailSent: !!mail.sent,
    };

    if (shouldReturnDevCode() || !mail.sent) {
      payload.devCode = code;
    }

    return res.json(payload);
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code || !newPassword) {
      return res.json({
        success: false,
        message: "Email, code, and new password are required",
      });
    }

    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const pending = await PasswordResetOtp.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.json({
        success: false,
        message: "No reset request found. Please request a new code.",
      });
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await PasswordResetOtp.deleteMany({ email: normalizedEmail });
      return res.json({
        success: false,
        message: "Code expired. Please request a new one.",
      });
    }

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await PasswordResetOtp.deleteMany({ email: normalizedEmail });
      return res.json({
        success: false,
        message: "Too many attempts. Please request a new code.",
      });
    }

    if (pending.codeHash !== hashOtp(String(code).trim())) {
      pending.attempts += 1;
      await pending.save();
      return res.json({ success: false, message: "Invalid verification code" });
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      await PasswordResetOtp.deleteMany({ email: normalizedEmail });
      return res.json({ success: false, message: "Account not found" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(newPassword), salt);
    user.email = normalizedEmail;
    await user.save();

    await PasswordResetOtp.deleteMany({ email: normalizedEmail });

    const token = generateToken(user._id);
    return res.json({
      success: true,
      userData: user,
      token,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.log(error.message);
    return res.json({ success: false, message: error.message });
  }
};

export const checkAuth = (req, res) => {
  res.json({ success: true, user: req.user });
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic, bio, fullName } = req.body;

    const userId = req.user._id;
    let updatedUser;

    if (!profilePic) {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { bio, fullName },
        { new: true }
      );
    } else {
      const upload = await cloudinary.uploader.upload(profilePic);

      updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePic: upload.secure_url, bio, fullName },
        { new: true }
      );
    }
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
