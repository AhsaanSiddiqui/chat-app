import mongoose from "mongoose";

const signupOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    fullName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    bio: { type: String, default: "" },
    accountType: {
      type: String,
      enum: ["personal", "office"],
      default: "personal",
    },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

signupOtpSchema.index({ email: 1 });
signupOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SignupOtp = mongoose.model("SignupOtp", signupOtpSchema);

export default SignupOtp;
