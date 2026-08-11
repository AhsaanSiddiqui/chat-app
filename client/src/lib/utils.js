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
  "image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.heic,.heif,.tif,.tiff,.ico,.avif,.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ods,.zip,.rar,.7z";

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
  return /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|tiff?|ico|avif|pdf|docx?|txt|rtf|odt|xlsx?|csv|ods|zip|rar|7z)$/i.test(
    file.name || ""
  );
}
