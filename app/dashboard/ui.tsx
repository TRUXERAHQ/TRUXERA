import type { ReactNode } from "react";
import Link from "next/link";

export const buttonPrimaryClass =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--nav-active-text)] shadow-sm transition-colors hover:bg-[var(--primary-hover)]";

export const buttonSecondaryClass =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition-colors hover:bg-[var(--surface-2)]";

export const buttonAccentClass =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600";

export const buttonDangerClass =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:border-red-400 hover:bg-red-100";

export const inputClass =
  "mt-1 block w-full rounded-[var(--radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]";

export const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]";

export const tableClass = "w-full text-left text-sm";
export const tableHeadClass =
  "border-b border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]";
export const tableCellClass = "py-2.5 pr-4 align-top text-[var(--text)]";
export const tableRowClass =
  "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

const badgeTones: Record<BadgeTone, string> = {
  neutral:
    "border-[var(--tone-neutral-border)] bg-[var(--tone-neutral-bg)] text-[var(--tone-neutral-text)]",
  success:
    "border-[var(--tone-success-border)] bg-[var(--tone-success-bg)] text-[var(--tone-success-text)]",
  warning:
    "border-[var(--tone-warning-border)] bg-[var(--tone-warning-bg)] text-[var(--tone-warning-text)]",
  danger:
    "border-[var(--tone-danger-border)] bg-[var(--tone-danger-bg)] text-[var(--tone-danger-text)]",
  info: "border-[var(--tone-info-border)] bg-[var(--tone-info-bg)] text-[var(--tone-info-text)]",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function riskTone(riskLevel: string | null): BadgeTone {
  if (riskLevel === "HIGH") return "danger";
  if (riskLevel === "MEDIUM") return "warning";
  if (riskLevel === "LOW") return "success";
  return "neutral";
}

export function recoveryTone(outcome: string | null): BadgeTone {
  if (outcome === "successful") return "success";
  if (outcome === "monitoring") return "warning";
  if (outcome === "unresolved") return "danger";
  return "neutral";
}

export function statusTone(status: string): BadgeTone {
  if (status === "DELIVERED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "CANCELLED") return "neutral";
  if (status === "IN_TRANSIT" || status === "PICKED_UP") return "info";
  return "neutral";
}

export function resourceStatusTone(status: string): BadgeTone {
  if (status === "AVAILABLE") return "success";
  if (
    status === "ON_ROUTE" ||
    status === "ON_DUTY" ||
    status === "ASSIGNED"
  ) {
    return "info";
  }
  if (
    status === "MAINTENANCE" ||
    status === "OFF_DUTY" ||
    status === "ON_LEAVE"
  ) {
    return "warning";
  }
  if (status === "OUT_OF_SERVICE") return "danger";
  return "neutral";
}

export function dataQualityTone(state: string): BadgeTone {
  if (state === "actual") return "success";
  if (state === "estimated") return "info";
  return "neutral";
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="text-sm font-semibold text-[var(--primary)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-4xl font-bold tracking-tight text-[var(--text)]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {description}
          </p>
        )}
        {meta && (
          <div className="mt-1 text-xs text-[var(--text-muted)]">{meta}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-sm ${className}`}
    >
      {title || description ? (
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
          {title && (
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--text)]">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-[3px] bg-[var(--primary)]"
              />
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const statTones = {
  default:
    "border-[var(--border)] border-l-[var(--primary)] bg-[var(--primary-soft)]",
  info: "border-[var(--tone-info-border)] border-l-[var(--tone-info-text)] bg-[var(--tone-info-bg)]",
  success:
    "border-[var(--tone-success-border)] border-l-[var(--tone-success-text)] bg-[var(--tone-success-bg)]",
  warning:
    "border-[var(--tone-warning-border)] border-l-[var(--tone-warning-text)] bg-[var(--tone-warning-bg)]",
  danger:
    "border-[var(--tone-danger-border)] border-l-[var(--tone-danger-text)] bg-[var(--tone-danger-bg)]",
} as const;

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof statTones;
}) {
  return (
    <div className={`rounded-[var(--radius)] border border-l-2 px-4 py-3 ${statTones[tone]}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-bold text-[var(--text)]">{value}</dd>
      {hint && (
        <dd className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</dd>
      )}
    </div>
  );
}

export function StatGrid({
  children,
  columns = "lg:grid-cols-6",
}: {
  children: ReactNode;
  columns?: string;
}) {
  return (
    <dl className={`grid gap-3 sm:grid-cols-2 ${columns}`}>{children}</dl>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: "border-[var(--tone-info-border)] bg-[var(--tone-info-bg)] text-[var(--tone-info-text)]",
    warning:
      "border-[var(--tone-warning-border)] bg-[var(--tone-warning-bg)] text-[var(--tone-warning-text)]",
    danger:
      "border-[var(--tone-danger-border)] bg-[var(--tone-danger-bg)] text-[var(--tone-danger-text)]",
    success:
      "border-[var(--tone-success-border)] bg-[var(--tone-success-bg)] text-[var(--tone-success-text)]",
  } as const;
  return (
    <p
      className={`rounded-[var(--radius)] border px-4 py-3 text-sm ${tones[tone]}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
    >
      ← {children}
    </Link>
  );
}
