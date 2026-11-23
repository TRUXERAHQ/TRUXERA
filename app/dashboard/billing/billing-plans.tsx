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

function CheckoutButton({
  organizationId,
  plan,
  interval,
  label,
  disabled,
}: {
  organizationId: string;
  plan: BillingPlanKey;
  interval: BillingInterval;
  label: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(startBillingCheckoutAction, {});

  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state.url]);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <button
        type="submit"
        disabled={pending || disabled}
        className={buttonPrimaryClass}
      >
        {pending ? "Redirecting…" : label}
      </button>
      {state.error && (
        <span className="mt-1 block text-xs text-rose-600">{state.error}</span>
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

  const price =
    interval === "MONTHLY"
      ? formatPlanPrice(plan.prices?.monthlyCents ?? null)
      : formatPlanPrice(plan.prices?.annualCents ?? null);
  const priceSuffix =
    interval === "MONTHLY" ? "/month" : "/year billed annually";

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        isRecommended
          ? "border-blue-300 bg-blue-50/40 shadow-sm"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{plan.label}</h3>
        <div className="flex gap-1.5">
          {isCurrent && <Badge tone="success">Current plan</Badge>}
          {isRecommended && !isCurrent && (
            <Badge tone="info">Recommended</Badge>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">{plan.description}</p>

      <div className="mt-4">
        {isEnterprise || plan.prices === null ? (
          <p className="text-2xl font-semibold text-slate-900">Custom</p>
        ) : (
          <p className="text-2xl font-semibold text-slate-900">
            {price}
            <span className="text-sm font-normal text-slate-500">
              {" "}
              {priceSuffix}
            </span>
          </p>
        )}
        {interval === "ANNUAL" && savings !== null && !isEnterprise && (
          <p className="mt-1 text-xs font-medium text-emerald-700">
            Save {savings}% with annual billing
          </p>
        )}
        {isCurrent && (effectiveMonthlyCents !== null || effectiveAnnualCents !== null) &&
          ((interval === "MONTHLY" && effectiveMonthlyCents !== plan.prices?.monthlyCents) ||
            (interval === "ANNUAL" && effectiveAnnualCents !== plan.prices?.annualCents)) && (
            <p className="mt-1 text-xs text-slate-500">
              Custom pricing applies to your subscription.
            </p>
          )}
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Vehicles</dt>
          <dd className="font-medium text-slate-800">
            {formatAllowance(plan.limits.vehicles, "vehicles")}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Integrations</dt>
          <dd className="font-medium text-slate-800">
            {plan.limits.integrations === "unlimited"
              ? "Unlimited"
              : formatAllowance(plan.limits.integrations, "integrations")}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 flex-1 space-y-1.5">
        {planFeatureBullets(planKey).map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm text-slate-600"
          >
            <span className="mt-0.5 text-emerald-600" aria-hidden="true">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isCurrent ? (
          <p className="text-center text-sm text-slate-500">
            This is your current plan.
          </p>
        ) : isEnterprise ? (
          <Link
            href="/dashboard/support"
            className={`${buttonSecondaryClass} block w-full text-center`}
          >
            Contact Sales
          </Link>
        ) : checkoutEnabled ? (
          <CheckoutButton
            organizationId={organizationId}
            plan={planKey}
            interval={interval}
            label={`Subscribe — ${price}${interval === "MONTHLY" ? "/mo" : "/yr"}`}
          />
        ) : (
          <p className="text-center text-sm text-slate-500">
            Online checkout is currently unavailable.
          </p>
        )}
      </div>
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

  const usageLine = (label: string, used: number, limitText: string) => (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">
        {used} <span className="text-slate-400">{limitText}</span>
      </dd>
    </div>
  );

  const vehicleLimit =
    typeof billing.limits.vehicles === "number"
      ? `/ ${billing.limits.vehicles}`
      : billing.limits.vehicles === "custom"
        ? " / Custom"
        : billing.limits.vehicles === "unlimited"
          ? " · Unlimited"
          : "";
  const integrationLimit =
    typeof billing.limits.integrations === "number"
      ? `/ ${billing.limits.integrations}`
      : billing.limits.integrations === "custom"
        ? " / Custom"
        : billing.limits.integrations === "unlimited"
          ? " · Unlimited"
          : "";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Current plan summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Current plan
          </h2>
          <Badge tone="info">{billing.planLabel}</Badge>
          {billing.subscriptionStatusLabel && (
            <Badge
              tone={
                billing.subscriptionStatus === "ACTIVE" ||
                billing.subscriptionStatus === "TRIAL"
                  ? "success"
                  : billing.subscriptionStatus === "PAUSED"
                    ? "warning"
                    : "neutral"
              }
            >
              {billing.subscriptionStatusLabel}
            </Badge>
          )}
          {billing.grandfatheredPricing && (
            <Badge tone="neutral">Custom pricing</Badge>
          )}
          {!billing.configured && <Badge tone="neutral">Trial</Badge>}
        </div>

        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {usageLine("Active vehicles", billing.usage.vehicles, vehicleLimit)}
          {usageLine(
            "Connected integrations",
            billing.usage.integrations,
            integrationLimit,
          )}
          {billing.trialStartAt || billing.trialEndAt ? (
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Trial period</dt>
              <dd className="font-medium text-slate-800">
                {billing.trialStartAt?.slice(0, 10)} →{"n"}
                {billing.trialEndAt?.slice(0, 10)}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Billing provider</dt>
            <dd className="font-medium text-slate-800">
              {billing.providerConnected
                ? billing.providerKey === "stripe"
                  ? "Stripe"
                  : (billing.providerKey ?? "Connected")
                : "Not connected"}
            </dd>
          </div>
        </dl>
      </section>

      {!accountActive && (
        <Notice tone="warning">
          This organization is suspended. Billing changes are unavailable
          until the account is reactivated.
        </Notice>
      )}

      {/* Plan selector */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Plans</h2>
            <p className="text-sm text-slate-500">
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
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  interval === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {value === "MONTHLY" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </div>

        {interval === "ANNUAL" && (
          <p className="mt-3 text-sm font-medium text-emerald-700">
            Save 20% with annual billing
          </p>
        )}

        <div className="mt-5 grid gap-5 md:grid-cols-3">
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

        {!checkoutEnabled && (
          <p className="mt-4 text-sm text-slate-500">
            {billing.providerConnected
              ? "Only organization owners and admins can manage billing."
              : "Online checkout is currently unavailable."}
          </p>
        )}
      </section>
    </div>
  );
}
