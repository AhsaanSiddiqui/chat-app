import mongoose from "mongoose";

const passwordResetOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

passwordResetOtpSchema.index({ email: 1 });
passwordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetOtp = mongoose.model(
  "PasswordResetOtp",
  passwordResetOtpSchema
);

export default PasswordResetOtp;
