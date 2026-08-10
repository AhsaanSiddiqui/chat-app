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
