import path from "path";
import fs from "fs/promises";
import multer from "multer";
import os from "os";
import cloudinary from "./cloudinary.js";

export const MAX_FILE_SIZE = 600 * 1024 * 1024; // 600MB
export const MAX_FILES_PER_MESSAGE = 20;

const ALLOWED_EXTENSIONS = new Set([
  // images
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".ico",
  ".avif",
  // docs
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
  ".odt",
  // excel / sheets
  ".xls",
  ".xlsx",
  ".csv",
  ".ods",
  // archives
  ".zip",
  ".rar",
  ".7z",
  // voice / audio
  ".webm",
  ".ogg",
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".opus",
]);

export const getExtension = (fileName = "") => {
  const ext = path.extname(fileName).toLowerCase();
  return ext;
};

export const isAllowedAttachment = (fileName = "", mimeType = "") => {
  const ext = getExtension(fileName);
  if (ALLOWED_EXTENSIONS.has(ext)) return true;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("audio/")) return true;
  return false;
};

export const getFileKind = (mimeType = "", fileName = "") => {
  const ext = getExtension(fileName);
  const mime = mimeType.toLowerCase();

  if (
    mime.startsWith("image/") ||
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
      ".svg",
      ".heic",
      ".heif",
      ".tif",
      ".tiff",
      ".ico",
      ".avif",
    ].includes(ext)
  ) {
    return "image";
  }
  if (
    mime.startsWith("audio/") ||
    [".webm", ".ogg", ".mp3", ".m4a", ".wav", ".aac", ".opus"].includes(ext)
  ) {
    return "audio";
  }
  if (mime === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("msword") ||
    [".doc", ".docx", ".rtf", ".odt", ".txt"].includes(ext)
  ) {
    return "doc";
  }
  if (
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    [".xls", ".xlsx", ".csv", ".ods"].includes(ext)
  ) {
    return "excel";
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("x-rar") ||
    mime.includes("x-7z") ||
    [".zip", ".rar", ".7z"].includes(ext)
  ) {
    return "zip";
  }
  return "file";
};

export const uploadAttachmentToCloudinary = async (file) => {
  const { path: filePath, originalname, mimetype, size } = file;

  if (!isAllowedAttachment(originalname, mimetype)) {
    throw new Error(
      "Unsupported file type. Use images, audio, PDF, Word, Excel, or ZIP."
    );
  }

  if (size > MAX_FILE_SIZE) {
    throw new Error("File too large. Maximum size is 600MB.");
  }

  const kind = getFileKind(mimetype, originalname);
  // Cloudinary treats many audio formats under "video"
  const resourceType =
    kind === "image" ? "image" : kind === "audio" ? "video" : "raw";

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: resourceType,
    folder: "quickchat/attachments",
    use_filename: true,
    unique_filename: true,
  });

  return {
    url: result.secure_url,
    name: originalname,
    size,
    mimeType: mimetype || "application/octet-stream",
    kind,
  };
};

export const removeTempFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
};

export const cleanupUploadedFiles = async (files = []) => {
  await Promise.all(files.map((file) => removeTempFile(file?.path)));
};

export const uploadManyAttachments = async (files = []) => {
  const uploaded = [];
  for (const file of files) {
    try {
      uploaded.push(await uploadAttachmentToCloudinary(file));
    } finally {
      await removeTempFile(file.path);
    }
  }
  return uploaded;
};

const firstImageUrl = (attachments = []) =>
  attachments.find((item) => item.kind === "image")?.url || "";

export const normalizeAttachmentsPayload = (attachments = []) => {
  if (!attachments.length) {
    return { attachments: [], attachment: undefined, imageUrl: "" };
  }
  return {
    attachments,
    attachment: attachments[0],
    imageUrl: firstImageUrl(attachments),
  };
};

/** Merge client-provided meta (e.g. voice duration) onto uploaded attachments. */
export const applyAttachmentMeta = (attachments = [], metaRaw) => {
  let meta = metaRaw;
  if (typeof metaRaw === "string") {
    try {
      meta = JSON.parse(metaRaw);
    } catch {
      meta = [];
    }
  }
  if (!Array.isArray(meta) || !meta.length) return attachments;

  return attachments.map((item, index) => {
    const entry = meta[index] || {};
    const duration = Number(entry.duration);
    return {
      ...item,
      ...(Number.isFinite(duration) && duration > 0
        ? { duration: Math.round(duration) }
        : {}),
      ...(entry.kind && !item.kind ? { kind: entry.kind } : {}),
    };
  });
};

export const listMessageAttachments = (message) => {
  if (Array.isArray(message.attachments) && message.attachments.length) {
    return message.attachments.map((item) =>
      typeof item.toObject === "function" ? item.toObject() : { ...item }
    );
  }
  if (message.attachment?.url || message.attachment?.name) {
    const item =
      typeof message.attachment.toObject === "function"
        ? message.attachment.toObject()
        : { ...message.attachment };
    return [item];
  }
  if (message.image) {
    return [
      {
        url: message.image,
        name: "image.jpg",
        size: 0,
        mimeType: "image/jpeg",
        kind: "image",
      },
    ];
  }
  return [];
};

/** Remove one attachment by URL. Returns { fullyDeleted: boolean }. */
export const removeAttachmentFromMessage = (message, attachmentUrl) => {
  if (!attachmentUrl) {
    throw new Error("Attachment url is required");
  }

  const current = listMessageAttachments(message);
  const next = current.filter((item) => String(item.url) !== String(attachmentUrl));

  if (next.length === current.length) {
    throw new Error("Attachment not found");
  }

  const normalized = normalizeAttachmentsPayload(next);
  message.attachments = normalized.attachments;
  message.image = normalized.imageUrl || "";

  if (normalized.attachment) {
    message.attachment = normalized.attachment;
  } else {
    message.set("attachment", undefined);
  }

  const hasText = !!message.text?.trim();
  if (!normalized.attachments.length && !hasText) {
    message.text = "";
    message.image = "";
    message.set("attachment", undefined);
    message.attachments = [];
    message.isDeleted = true;
    message.isEdited = false;
    return { fullyDeleted: true };
  }

  message.isEdited = true;
  return { fullyDeleted: false };
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^\w.\-() ]+/g, "_")}`;
    cb(null, safe);
  },
});

export const chatFileUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_MESSAGE,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedAttachment(file.originalname, file.mimetype)) {
      return cb(
        new Error(
          "Unsupported file type. Use images, audio, PDF, Word, Excel, or ZIP."
        )
      );
    }
    cb(null, true);
  },
}).array("files", MAX_FILES_PER_MESSAGE);

export const handleChatUpload = (req, res, next) => {
  chatFileUpload(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.json({
          success: false,
          message: "File too large. Maximum size is 600MB.",
        });
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.json({
          success: false,
          message: `You can upload up to ${MAX_FILES_PER_MESSAGE} files at once.`,
        });
      }
      return res.json({ success: false, message: err.message });
    }

    return res.json({
      success: false,
      message: err.message || "File upload failed",
    });
  });
};
