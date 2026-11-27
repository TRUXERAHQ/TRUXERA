"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { AppNotification } from "@/src/notifications/notifications";
import { Badge, buttonSecondaryClass } from "../ui";
import {
  emitNotificationsChanged,
  isUnread,
  loadReadMap,
  markAllNotificationsRead,
  markNotificationRead,
} from "./read-state";

const subscribe = () => () => {};

function formatTime(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsView({
  notifications,
  timeZone,
}: {
  notifications: AppNotification[];
  timeZone: string;
}) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [readMap, setReadMap] = useState<Record<string, string>>(() =>
    loadReadMap(),
  );

  const unreadCount = notifications.filter((notification) =>
    isUnread(readMap, notification),
  ).length;

  const markRead = (notification: AppNotification) => {
    setReadMap((current) => {
      const next = markNotificationRead(current, notification);
      emitNotificationsChanged();
      return next;
    });
  };

  const markAll = () => {
    setReadMap((current) => {
      const next = markAllNotificationsRead(current, notifications);
      emitNotificationsChanged();
      return next;
    });
  };

  if (notifications.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <p className="mt-4 text-base font-semibold text-[var(--text)]">
          No new notifications
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Operational alerts, recovery activity, and account notices will
          appear here when they need your attention.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          {unreadCount === 0
            ? "You're all caught up."
            : `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`}
        </p>
        <button
          type="button"
          onClick={markAll}
          disabled={unreadCount === 0}
          className={`${buttonSecondaryClass} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Mark all as read
        </button>
      </div>

      <ul className="space-y-2">
        {notifications.map((notification) => {
          const unread = mounted && isUnread(readMap, notification);
          return (
            <li key={notification.id}>
              <div
                className={`flex flex-col gap-3 rounded-[var(--radius)] border bg-[var(--surface)] px-4 py-3 shadow-sm sm:flex-row sm:items-center ${
                  unread ? "border-[var(--primary)]/40" : "border-[var(--border)]"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      unread ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={notification.tone}>
                        {notification.categoryLabel}
                      </Badge>
                      <span
                        className={`text-sm ${
                          unread
                            ? "font-semibold text-[var(--text)]"
                            : "font-medium text-[var(--text-muted)]"
                        }`}
                      >
                        {notification.title}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                      {notification.body}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatTime(notification.updatedAt, timeZone)}
                    </p>
                  </div>
                </div>
                <Link
                  href={notification.href}
                  onClick={() => markRead(notification)}
                  className={`${buttonSecondaryClass} shrink-0 self-start sm:self-center`}
                >
                  Open
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
