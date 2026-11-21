import type { ReactNode } from "react";
import Link from "next/link";

export const buttonPrimaryClass =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700";

export const buttonSecondaryClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50";

export const buttonAccentClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700";

export const buttonDangerClass =
  "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50";

export const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-slate-500";

export const tableClass = "w-full text-left text-sm";
export const tableHeadClass =
  "border-b border-indigo-100 bg-indigo-50/50 text-xs font-medium uppercase tracking-wide text-slate-600";
export const tableCellClass = "py-2.5 pr-4 align-top text-slate-700";
export const tableRowClass =
  "border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
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
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]} ${className}`}
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
  eyebrow: string;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-semibold text-indigo-600">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        )}
        {meta && <div className="mt-1 text-xs text-slate-500">{meta}</div>}
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
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {title && (
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
      )}
      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-slate-500">{hint}</dd>}
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
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
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
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  } as const;
  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}
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
      className="text-sm font-medium text-slate-500 hover:text-slate-900"
    >
      ← {children}
    </Link>
  );
}
