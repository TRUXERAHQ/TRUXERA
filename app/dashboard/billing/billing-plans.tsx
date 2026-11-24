"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  Badge,
  buttonPrimaryClass,
  buttonSecondaryClass,
  Notice,
} from "../ui";
import { BILLING_PLANS, type BillingPlanKey } from "@/src/billing/billing";
import {
  annualSavingsPercent,
  formatAllowance,
  formatPlanPrice,
  planFeatureBullets,
} from "@/src/billing/display";
import type { BillingOverview } from "@/src/prisma/billing-data";
import {
  startBillingCheckoutAction,
  type CheckoutActionState,
} from "../settings/billing-actions";

type BillingInterval = "MONTHLY" | "ANNUAL";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function usagePercent(used: number, limit: unknown): number | null {
  if (typeof limit !== "number" || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

function statusBadgeTone(status: string | null) {
  if (status === "ACTIVE" || status === "TRIAL") return "success" as const;
  if (status === "PAUSED") return "warning" as const;
  return "neutral" as const;
}

function CheckoutButton({
  organizationId,
  plan,
  interval,
  label,
}: {
  organizationId: string;
  plan: BillingPlanKey;
  interval: BillingInterval;
  label: string;
}) {
  const [state, action, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(startBillingCheckoutAction, {});

  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state.url]);

  return (
    <form action={action}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`${buttonPrimaryClass} w-full`}
      >
        {pending ? "Redirecting to secure checkout…" : label}
      </button>
      {state.error && (
        <p className="mt-2 text-center text-xs text-rose-600">{state.error}</p>
      )}
    </form>
  );
}

function PlanCard({
  planKey,
  interval,
  currentPlan,
  organizationId,
  checkoutEnabled,
  effectiveMonthlyCents,
  effectiveAnnualCents,
}: {
  planKey: BillingPlanKey;
  interval: BillingInterval;
  currentPlan: BillingPlanKey;
  organizationId: string;
  checkoutEnabled: boolean;
  effectiveMonthlyCents: number | null;
  effectiveAnnualCents: number | null;
}) {
  const plan = BILLING_PLANS[planKey];
  const isCurrent = currentPlan === planKey;
  const isRecommended = planKey === "PROFESSIONAL";
  const isEnterprise = planKey === "ENTERPRISE";
  const savings = annualSavingsPercent(planKey);

  // Current plan displays its effective (possibly grandfathered) terms.
  const displayMonthly = isCurrent
    ? (effectiveMonthlyCents ?? plan.prices?.monthlyCents ?? null)
    : (plan.prices?.monthlyCents ?? null);
  const displayAnnual = isCurrent
    ? (effectiveAnnualCents ?? plan.prices?.annualCents ?? null)
    : (plan.prices?.annualCents ?? null);
  const isCustomPrice =
    isEnterprise ||
    (displayMonthly === null && displayAnnual === null) ||
    plan.prices === null;

  const price =
    interval === "MONTHLY"
      ? formatPlanPrice(displayMonthly)
      : formatPlanPrice(displayAnnual);
  const priceSuffix =
    interval === "MONTHLY" ? "/month" : "/year billed annually";
  const ctaPrice =
    interval === "MONTHLY" ? displayMonthly : displayAnnual;
  const ctaLabel = isCustomPrice
    ? null
    : `Subscribe — ${formatPlanPrice(ctaPrice)}${interval === "MONTHLY" ? "/mo" : "/yr"}`;

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 transition-shadow ${
        isCurrent
          ? "border-emerald-300 bg-emerald-50/30 shadow-sm"
          : isRecommended
            ? "border-blue-400 bg-blue-50/50 shadow-md ring-1 ring-blue-300"
            : "border-slate-200 bg-white shadow-sm"
      }`}
    >
      {isRecommended && !isCurrent && (
        <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          Recommended
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">
            {plan.label}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {plan.description}
          </p>
        </div>
        {isCurrent && <Badge tone="success">Current plan</Badge>}
      </div>

      <div className="mt-5">
        {isCustomPrice ? (
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            Custom
          </p>
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            {price}
            <span className="ml-1 text-sm font-normal text-slate-500">
              {priceSuffix}
            </span>
          </p>
        )}
        {interval === "ANNUAL" && savings !== null && !isCustomPrice && (
          <p className="mt-1.5 text-xs font-semibold text-emerald-700">
            Save {savings}% vs monthly billing
          </p>
        )}
        {isCurrent &&
          (displayMonthly !== plan.prices?.monthlyCents ||
            displayAnnual !== plan.prices?.annualCents) && (
            <p className="mt-1.5 text-xs font-medium text-slate-500">
              Custom pricing applies to your subscription.
            </p>
          )}
      </div>

      <dl className="mt-5 space-y-2 border-t border-slate-200/70 pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Active vehicles</dt>
          <dd className="font-medium text-slate-800">
            {formatAllowance(plan.limits.vehicles, "vehicles")}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Integrations</dt>
          <dd className="font-medium text-slate-800">
            {plan.limits.integrations === "unlimited"
              ? "Unlimited"
              : formatAllowance(plan.limits.integrations, "integrations")}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 flex-1 space-y-2">
        {planFeatureBullets(planKey).map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm leading-6 text-slate-600"
          >
            <span className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-6 min-h-[2.75rem]">
        {isCurrent ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-800">
            This is your current plan
          </p>
        ) : isEnterprise ? (
          <Link
            href="/dashboard/support"
            className={`${buttonSecondaryClass} block w-full text-center`}
          >
            Contact Sales
          </Link>
        ) : checkoutEnabled && ctaLabel ? (
          <CheckoutButton
            organizationId={organizationId}
            plan={planKey}
            interval={interval}
            label={ctaLabel}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-2.5 text-center text-sm text-slate-400">
            Checkout unavailable
          </p>
        )}
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: unknown;
}) {
  const percent = usagePercent(used, limit);
  const limitText =
    typeof limit === "number"
      ? `/ ${limit}`
      : limit === "custom"
        ? " / Custom"
        : limit === "unlimited"
          ? " · Unlimited"
          : "";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <dt className="text-slate-500">{label}</dt>
        <dd className="font-medium text-slate-800">
          {used}
          <span className="font-normal text-slate-400">{limitText}</span>
        </dd>
      </div>
      {percent !== null && (
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} usage`}
        >
          <div
            className={`h-full rounded-full ${
              percent >= 90 ? "bg-rose-500" : "bg-indigo-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function BillingPlansView({
  organizationId,
  billing,
  canAdminister,
  accountActive,
}: {
  organizationId: string;
  billing: BillingOverview;
  canAdminister: boolean;
  accountActive: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const checkoutEnabled =
    billing.providerConnected && canAdminister && accountActive;

  const priceSummary = billing.prices.custom
    ? billing.plan === "TRIAL"
      ? "Trial — no charge"
      : "Custom pricing"
    : [
        billing.prices.monthlyCents !== null
          ? `${formatPlanPrice(billing.prices.monthlyCents)}/month`
          : null,
        billing.prices.annualCents !== null
          ? `${formatPlanPrice(billing.prices.annualCents)}/year billed annually`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const trialStart = formatDate(billing.trialStartAt);
  const trialEnd = formatDate(billing.trialEndAt);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Current subscription summary */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-cyan-50/50 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-[3px] bg-indigo-500"
              />
              Current plan
            </h2>
            <Badge tone="info">{billing.planLabel}</Badge>
            {billing.subscriptionStatusLabel && (
              <Badge tone={statusBadgeTone(billing.subscriptionStatus)}>
                {billing.subscriptionStatusLabel}
              </Badge>
            )}
            {billing.grandfatheredPricing && (
              <Badge tone="neutral">Custom pricing</Badge>
            )}
            {!billing.configured && <Badge tone="neutral">Trial</Badge>}
          </div>
          {priceSummary && (
            <p className="mt-1.5 text-sm font-medium text-slate-700">
              {priceSummary}
            </p>
          )}
        </div>

        <div className="grid gap-6 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <UsageMeter
            label="Active vehicles"
            used={billing.usage.vehicles}
            limit={billing.limits.vehicles}
          />
          <UsageMeter
            label="Integrations"
            used={billing.usage.integrations}
            limit={billing.limits.integrations}
          />
          <div>
            <p className="text-sm text-slate-500">Trial period</p>
            <p className="mt-0.5 text-sm font-medium text-slate-800">
              {trialStart || trialEnd
                ? `${trialStart ?? "—"} → ${trialEnd ?? "—"}`
                : "None"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Billing provider</p>
            <p className="mt-0.5 text-sm font-medium text-slate-800">
              {billing.billingProvider === "stripe"
                ? "Stripe"
                : billing.billingProvider === "paddle"
                  ? "Paddle"
                  : billing.providerConnected
                    ? "Connected"
                    : "Not connected"}
            </p>
          </div>
        </div>
      </section>

      {!accountActive && (
        <Notice tone="warning">
          This organization is suspended. Billing changes are unavailable
          until the account is reactivated.
        </Notice>
      )}

      {!billing.providerConnected && accountActive && (
        <Notice tone="info">
          Online checkout is currently unavailable. Plan details below reflect
          your organization&apos;s current catalog — billing changes will be
          available once checkout is enabled.
        </Notice>
      )}

      {/* Plan selection */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Plans
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose the plan that fits your fleet.
            </p>
          </div>
          <div
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label="Billing interval"
          >
            {(["MONTHLY", "ANNUAL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                aria-pressed={interval === value}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  interval === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {value === "MONTHLY" ? "Monthly" : "Annual"}
                {value === "ANNUAL" && (
                  <span className="ml-1.5 text-xs font-semibold text-emerald-700">
                    −20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {interval === "ANNUAL" && (
          <p className="mt-3 text-sm font-medium text-emerald-700">
            Save 20% with annual billing
          </p>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {(["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const).map((key) => (
            <PlanCard
              key={key}
              planKey={key}
              interval={interval}
              currentPlan={billing.plan}
              organizationId={organizationId}
              checkoutEnabled={checkoutEnabled}
              effectiveMonthlyCents={
                key === billing.plan ? billing.prices.monthlyCents : null
              }
              effectiveAnnualCents={
                key === billing.plan ? billing.prices.annualCents : null
              }
            />
          ))}
        </div>

        {billing.providerConnected && !canAdminister && accountActive && (
          <p className="mt-4 text-sm text-slate-500">
            Only organization owners and admins can manage billing.
          </p>
        )}
      </section>
    </div>
  );
}
