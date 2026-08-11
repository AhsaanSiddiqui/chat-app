import nodemailer from "nodemailer";

const hasSmtpConfig = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export const canSendEmail = () => hasSmtpConfig();

const getTransporter = () => {
  if (!hasSmtpConfig()) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendSignupOtpEmail = async ({ to, code, accountType }) => {
  const from =
    process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@rocketmessage.app";
  const subject = "Your RocketMessage verification code";
  const modeLabel = accountType === "office" ? "Office" : "Personal";
  const text = `Your ${modeLabel} signup verification code is ${code}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Use this code to finish your <strong>${modeLabel}</strong> RocketMessage signup:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
      <p style="color:#555">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
    </div>
  `;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[signup-otp] SMTP not configured. Code for ${to}: ${code}`);
    return { sent: false, reason: "smtp_not_configured" };
  }

  await transporter.sendMail({ from, to, subject, text, html });
  return { sent: true };
};
