import nodemailer from "nodemailer";

const SMTP_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 12000);

const hasSmtpConfig = () =>
  !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    !String(process.env.SMTP_USER).includes("your@") &&
    !String(process.env.SMTP_PASS).includes("your-app-password")
  );

const hasResendConfig = () =>
  !!(process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim());

export const canSendEmail = () => hasResendConfig() || hasSmtpConfig();

const withTimeout = (promise, ms, label = "Email") =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);

const getTransporter = () => {
  if (!hasSmtpConfig()) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: String(process.env.SMTP_PASS).replace(/\s+/g, ""),
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
};

const sendViaResend = async ({ to, subject, html, text }) => {
  const from =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    "RocketMessage <onboarding@resend.dev>";

  const response = await withTimeout(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    }),
    SMTP_TIMEOUT_MS,
    "Resend"
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Resend failed (${response.status})`);
  }
  return true;
};

const sendViaSmtp = async ({ to, from, subject, text, html }) => {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP not configured");
  }

  await withTimeout(
    transporter.sendMail({ from, to, subject, text, html }),
    SMTP_TIMEOUT_MS,
    "SMTP"
  );
  return true;
};

const deliverEmail = async ({ to, subject, text, html }) => {
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "noreply@rocketmessage.app";

  if (!canSendEmail()) {
    return {
      sent: false,
      reason: "smtp_not_configured",
      error:
        "Email not configured. Add RESEND_API_KEY (recommended on Railway) or SMTP_* vars.",
    };
  }

  if (hasResendConfig()) {
    try {
      await sendViaResend({ to, subject, html, text });
      console.log(`[email] Resend sent to ${to}`);
      return { sent: true, provider: "resend" };
    } catch (error) {
      console.error(`[email] Resend failed for ${to}:`, error.message);
      if (!hasSmtpConfig()) {
        return { sent: false, reason: "send_failed", error: error.message };
      }
    }
  }

  if (hasSmtpConfig()) {
    try {
      await sendViaSmtp({ to, from, subject, text, html });
      console.log(`[email] SMTP sent to ${to}`);
      return { sent: true, provider: "smtp" };
    } catch (error) {
      console.error(`[email] SMTP failed for ${to}:`, error.message);
      return { sent: false, reason: "send_failed", error: error.message };
    }
  }

  return {
    sent: false,
    reason: "send_failed",
    error: "No working email provider",
  };
};

export const sendSignupOtpEmail = async ({ to, code, accountType }) => {
  const modeLabel = accountType === "office" ? "Office" : "Personal";
  if (!canSendEmail()) {
    console.log(`[signup-otp] No email provider. Code for ${to}: ${code}`);
  }
  return deliverEmail({
    to,
    subject: "Your RocketMessage verification code",
    text: `Your ${modeLabel} signup verification code is ${code}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">Verify your email</h2>
        <p>Use this code to finish your <strong>${modeLabel}</strong> RocketMessage signup:</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
        <p style="color:#555">This code expires in 10 minutes.</p>
      </div>
    `,
  });
};

export const sendPasswordResetOtpEmail = async ({ to, code }) => {
  if (!canSendEmail()) {
    console.log(`[reset-otp] No email provider. Code for ${to}: ${code}`);
  }
  return deliverEmail({
    to,
    subject: "Reset your RocketMessage password",
    text: `Your password reset code is ${code}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">Reset password</h2>
        <p>Use this code to reset your RocketMessage password:</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
        <p style="color:#555">This code expires in 10 minutes.</p>
      </div>
    `,
  });
};
