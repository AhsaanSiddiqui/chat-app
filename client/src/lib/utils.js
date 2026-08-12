export function formatMessageTime(date) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatSeenTime(seenAt, sentAt) {
  if (!seenAt) return "";

  const seen = new Date(seenAt);
  const sent = sentAt ? new Date(sentAt) : null;
  const time = formatMessageTime(seen);

  if (!sent) return `Seen ${time}`;

  const diffMs = Math.max(0, seen.getTime() - sent.getTime());
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return `Seen ${time}`;
  if (diffMins < 60) return `Seen ${time} (+${diffMins}m)`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Seen ${time} (+${diffHours}h)`;

  const diffDays = Math.floor(diffHours / 24);
  return `Seen ${time} (+${diffDays}d)`;
}

export const MAX_ATTACHMENT_SIZE = 600 * 1024 * 1024; // 600MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 20;

export const ATTACHMENT_ACCEPT =
  "image/*,audio/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.heic,.heif,.tif,.tiff,.ico,.avif,.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ods,.zip,.rar,.7z,.webm,.ogg,.mp3,.m4a,.wav,.aac,.opus";

export const MAX_VOICE_SECONDS = 300; // 5 minutes

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatFileSize(bytes = 0) {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getAttachmentKind(file) {
  const name = (file?.name || "").toLowerCase();
  const mime = (file?.type || "").toLowerCase();

  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|tiff?|ico|avif)$/.test(name)
  ) {
    return "image";
  }
  if (
    mime.startsWith("audio/") ||
    /\.(webm|ogg|mp3|m4a|wav|aac|opus)$/.test(name)
  ) {
    return "audio";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("msword") ||
    /\.(docx?|rtf|odt|txt)$/.test(name)
  ) {
    return "doc";
  }
  if (
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    /\.(xlsx?|csv|ods)$/.test(name)
  ) {
    return "excel";
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    /\.(zip|rar|7z)$/.test(name)
  ) {
    return "zip";
  }
  return "file";
}

export function attachmentLabel(kind) {
  switch (kind) {
    case "image":
      return "Photo";
    case "audio":
      return "Voice message";
    case "pdf":
      return "PDF";
    case "doc":
      return "Document";
    case "excel":
      return "Spreadsheet";
    case "zip":
      return "Archive";
    default:
      return "File";
  }
}

export function getMessageAttachments(msg) {
  if (!msg) return [];
  if (Array.isArray(msg.attachments) && msg.attachments.length) {
    return msg.attachments;
  }
  if (msg.attachment?.url || msg.attachment?.name) {
    return [msg.attachment];
  }
  if (msg.image) {
    return [
      {
        url: msg.image,
        name: "image.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        size: 0,
      },
    ];
  }
  return [];
}

export function isAllowedAttachmentFile(file) {
  if (!file) return false;
  const kind = getAttachmentKind(file);
  if (kind !== "file") return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|tiff?|ico|avif|pdf|docx?|txt|rtf|odt|xlsx?|csv|ods|zip|rar|7z|webm|ogg|mp3|m4a|wav|aac|opus)$/i.test(
    file.name || ""
  );
}

export const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export function trimUrlTrailingPunctuation(url = "") {
  let cleaned = url;
  let trailing = "";
  while (/[.,!?;:)"'\]]$/.test(cleaned)) {
    trailing = cleaned.slice(-1) + trailing;
    cleaned = cleaned.slice(0, -1);
  }
  return { cleaned, trailing };
}

export function toHref(url = "") {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Unique http(s)/www links found in plain text, in order of appearance. */
export function extractUrlsFromText(text = "") {
  if (!text) return [];
  const found = [];
  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const { cleaned } = trimUrlTrailingPunctuation(match[0]);
    if (cleaned) found.push(cleaned);
  }
  return found;
}

export function linkDisplayHost(url = "") {
  try {
    return new URL(toHref(url)).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

export {
  MESSAGE_REACTIONS,
  QUICK_REACTIONS,
  summarizeReactions,
  formatSystemMessageText,
} from "./reactions";
