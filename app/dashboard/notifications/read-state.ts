const STORAGE_KEY = "truxera-notifications-read";
export const NOTIFICATIONS_CHANGED_EVENT = "truxera:notifications-changed";

export type NotificationLike = {
  id: string;
  updatedAt: string;
};

export function loadReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function persistReadMap(readMap: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readMap));
  } catch {
    // Storage may be unavailable (private mode); read state stays in memory.
  }
}

export function isUnread(
  readMap: Record<string, string>,
  notification: NotificationLike,
) {
  const readAt = readMap[notification.id];
  return !readAt || readAt < notification.updatedAt;
}

export function markNotificationRead(
  readMap: Record<string, string>,
  notification: NotificationLike,
) {
  const next = {
    ...readMap,
    [notification.id]: new Date().toISOString(),
  };
  persistReadMap(next);
  return next;
}

export function markAllNotificationsRead(
  readMap: Record<string, string>,
  notifications: NotificationLike[],
) {
  const now = new Date().toISOString();
  const next = { ...readMap };
  for (const notification of notifications) {
    next[notification.id] = now;
  }
  persistReadMap(next);
  return next;
}

export function emitNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
