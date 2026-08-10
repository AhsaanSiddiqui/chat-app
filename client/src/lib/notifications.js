export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showChatNotification({ title, body, icon, tag, onClick }) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body,
      icon: icon || "/icons.svg",
      tag: tag || "quickchat-message",
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch (error) {
    console.log("Notification error:", error);
  }
}

export function isAppInBackground() {
  return document.hidden || !document.hasFocus();
}
