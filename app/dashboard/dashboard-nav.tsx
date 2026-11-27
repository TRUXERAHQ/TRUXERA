"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isUnread,
  loadReadMap,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationLike,
} from "./notifications/read-state";

type IconName =
  | "grid"
  | "calendar"
  | "chart"
  | "clock"
  | "truck"
  | "users"
  | "box"
  | "dispatch"
  | "message"
  | "support"
  | "help"
  | "settings"
  | "billing"
  | "account"
  | "bell";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>
    ),
    chart: <path d="M3 3v18h18M8 16v-5M13 16V8M18 16v-8" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>
    ),
    truck: (
      <>
        <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="17" cy="19" r="2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.6 3.5 5.5" />
      </>
    ),
    box: (
      <>
        <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5M12 13v8" />
      </>
    ),
    dispatch: (
      <>
        <path d="M5 17h14M7 17l1.5-6h7L17 17" />
        <circle cx="8" cy="19" r="1.5" />
        <circle cx="16" cy="19" r="1.5" />
        <path d="M9 11V7h4v4" />
      </>
    ),
    message: <path d="M4 5h16v11H8l-4 4V5z" />,
    support: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M5.6 5.6l3 3M18.4 5.6l-3 3M5.6 18.4l3-3M18.4 18.4l-3-3" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.7" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    billing: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

type Leaf = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
};

type NavNode =
  | ({ kind: "link" } & Leaf)
  | {
      kind: "dropdown";
      id: string;
      label: string;
      icon: IconName;
      activeIds: string[];
      menuAlign?: "left" | "right";
      children: Leaf[];
    };

const linkIdle =
  "flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-2 text-sm font-medium transition-colors border-[var(--nav-item-border)] bg-[var(--nav-item-bg)] text-[var(--nav-item-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]";
const linkActive =
  "nav-active flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-2 text-sm font-semibold transition-colors border-transparent bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] shadow-sm";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function DashboardNav({
  orgQuery,
  organizationId,
  activeSection,
}: {
  orgQuery: string;
  organizationId: string;
  activeSection: string;
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navRef = useRef<HTMLElement>(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/notifications?summary=1&organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setUnreadCount(0);
        return;
      }
      const data = (await response.json()) as {
        notifications?: NotificationLike[];
      };
      const readMap = loadReadMap();
      setUnreadCount(
        (data.notifications ?? []).filter((notification) =>
          isUnread(readMap, notification),
        ).length,
      );
    } catch {
      setUnreadCount(0);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount, pathname]);

  useEffect(() => {
    const onChanged = () => void refreshUnreadCount();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [refreshUnreadCount]);

  const href = (path: string) => `${path}?${orgQuery}`;

  const nodes: NavNode[] = [
    {
      kind: "link",
      id: "dashboard",
      label: "Dashboard",
      icon: "grid",
      href: href("/"),
    },
    {
      kind: "link",
      id: "command-center",
      label: "Command Center",
      icon: "grid",
      href: href("/dashboard/command-center"),
    },
    {
      kind: "link",
      id: "loads",
      label: "Loads",
      icon: "box",
      href: href("/dashboard/loads"),
    },
    {
      kind: "link",
      id: "dispatch",
      label: "Dispatch",
      icon: "dispatch",
      href: href("/dashboard/dispatch"),
    },
    {
      kind: "link",
      id: "trucks",
      label: "Fleet",
      icon: "truck",
      href: href("/dashboard/trucks"),
    },
    {
      kind: "link",
      id: "drivers",
      label: "Drivers",
      icon: "users",
      href: href("/dashboard/drivers"),
    },
    {
      kind: "dropdown",
      id: "reports",
      label: "Reports",
      icon: "chart",
      activeIds: ["daily-summary", "executive-report"],
      children: [
        {
          id: "daily-summary",
          label: "Daily Summary",
          icon: "calendar",
          href: href("/dashboard/daily-summary"),
        },
        {
          id: "executive-report",
          label: "Executive Report",
          icon: "chart",
          href: href("/dashboard/executive-report"),
        },
      ],
    },
    {
      kind: "link",
      id: "operational-history",
      label: "History",
      icon: "clock",
      href: href("/dashboard/operational-history"),
    },
    {
      kind: "dropdown",
      id: "help",
      label: "Help",
      icon: "help",
      activeIds: ["help", "support", "feedback"],
      menuAlign: "right",
      children: [
        {
          id: "help",
          label: "Help",
          icon: "help",
          href: href("/dashboard/help"),
        },
        {
          id: "support",
          label: "Support",
          icon: "support",
          href: href("/dashboard/support"),
        },
        {
          id: "feedback",
          label: "Feedback",
          icon: "message",
          href: href("/dashboard/feedback"),
        },
      ],
    },
    {
      kind: "link",
      id: "notifications",
      label: "Notifications",
      icon: "bell",
      href: href("/dashboard/notifications"),
    },
    {
      kind: "link",
      id: "settings",
      label: "Settings",
      icon: "settings",
      href: href("/dashboard/settings"),
    },
    {
      kind: "link",
      id: "billing",
      label: "Billing",
      icon: "billing",
      href: href("/dashboard/billing"),
    },
    {
      kind: "link",
      id: "account",
      label: "Account",
      icon: "account",
      href: href("/dashboard/account"),
    },
  ];

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenMenu(null);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const isActive = (node: NavNode) =>
    node.kind === "link"
      ? activeSection === node.id
      : node.activeIds.includes(activeSection);

  const mobileLinkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
      active
        ? "nav-active border-transparent bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-active-text)]"
        : "border-[var(--nav-item-border)] bg-[var(--nav-item-bg)] text-[var(--nav-item-text)]"
    }`;

  const unreadBadge =
    unreadCount > 0 ? (
      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--nav-active-bg)] px-1 text-[10px] font-bold leading-none text-[var(--nav-active-text)]">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  const renderLeaf = (leaf: Leaf, mobile = false) => {
    const active = activeSection === leaf.id;
    return (
      <Link
        key={leaf.id}
        href={leaf.href}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          setOpenMenu(null);
          setMobileOpen(false);
        }}
        className={
          mobile
            ? mobileLinkClass(active)
            : `flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                  : "text-[var(--nav-item-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]"
              }`
        }
      >
        <NavIcon name={leaf.icon} />
        {leaf.label}
        {leaf.id === "notifications" ? unreadBadge : null}
      </Link>
    );
  };

  const toggleAccordion = (id: string) => {
    setOpenAccordions((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  return (
    <>
      {/* Desktop nav */}
      <nav
        ref={navRef}
        aria-label="Primary navigation"
        className="hidden flex-nowrap items-center justify-center gap-x-1 border-t border-[var(--header-border)] bg-[var(--header-bg)] px-4 py-2 backdrop-blur xl:flex [overflow-x:clip]"
      >
        {nodes.map((node) => {
          if (node.kind === "link") {
            const active = isActive(node);
            return (
              <Link
                key={node.id}
                href={node.href}
                aria-current={active ? "page" : undefined}
                className={active ? linkActive : linkIdle}
              >
                <span className="hidden min-[1536px]:inline-flex">
                  <NavIcon name={node.icon} />
                </span>
                {node.label}
                {node.id === "notifications" ? unreadBadge : null}
              </Link>
            );
          }

          const open = openMenu === node.id;
          const active = isActive(node);
          return (
            <div key={node.id} className="relative shrink-0">
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpenMenu(open ? null : node.id)}
                className={active ? linkActive : linkIdle}
              >
                <span className="hidden min-[1536px]:inline-flex">
                  <NavIcon name={node.icon} />
                </span>
                {node.label}
                <Chevron open={open} />
              </button>
              {open && (
                <div
                  role="menu"
                  className={`absolute top-full z-30 mt-1 max-h-[calc(100vh-7rem)] min-w-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--elevated)] py-1 shadow-lg ${
                    node.menuAlign === "right" ? "right-0" : "left-0"
                  }`}
                >
                  {node.children.map((child) => {
                    const childActive = activeSection === child.id;
                    return (
                      <Link
                        key={child.id}
                        href={child.href}
                        role="menuitem"
                        aria-current={childActive ? "page" : undefined}
                        onClick={() => setOpenMenu(null)}
                        className={`flex items-center gap-2 px-3.5 py-2 text-sm transition-colors ${
                          childActive
                            ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                            : "text-[var(--text)] hover:bg-[var(--nav-hover-bg)]"
                        }`}
                      >
                        <NavIcon name={child.icon} />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mobile hamburger bar */}
      <div className="flex items-center justify-end px-4 py-2 xl:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileOpen((value) => !value)}
          className="flex h-9 items-center gap-2 rounded-lg border border-[var(--nav-item-border)] bg-[var(--nav-item-bg)] px-3 text-sm font-medium text-[var(--nav-item-text)] transition-colors hover:bg-[var(--nav-hover-bg)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            {mobileOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-20 bg-black/40 xl:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          id="mobile-nav-drawer"
          className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-y-auto border-t border-[var(--border)] bg-[var(--app-bg)] p-4 xl:hidden"
        >
          <nav aria-label="Mobile navigation" className="mx-auto max-w-md space-y-4">
            {nodes.map((node) => {
              if (node.kind === "link") {
                return (
                  <div key={node.id}>{renderLeaf(node, true)}</div>
                );
              }
              const expanded = openAccordions.includes(node.id);
              const active = isActive(node);
              return (
                <div key={node.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleAccordion(node.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "nav-active border-transparent bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-active-text)]"
                        : "border-[var(--nav-item-border)] bg-[var(--nav-item-bg)] text-[var(--nav-item-text)]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <NavIcon name={node.icon} />
                      {node.label}
                    </span>
                    <Chevron open={expanded} />
                  </button>
                  {expanded && (
                    <div className="mt-2 space-y-1.5 pl-4">
                      {node.children.map((child) =>
                        renderLeaf(child, true),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}

export default DashboardNav;
