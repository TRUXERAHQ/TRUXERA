"use client";

import { useActionState, useEffect, useState } from "react";
import {
  BILLING_PLANS,
  type BillingInterval,
  type BillingPlanKey,
} from "@/src/billing/billing";
import {
  formatAllowance,
  formatPlanPrice,
  planFeatureBullets,
} from "@/src/billing/display";
import {
  buttonPrimaryClass,
  buttonSecondaryClass,
  inputClass,
  labelClass,
} from "../dashboard/ui";
import { createOrganizationAction } from "../organization-actions";
import type { OrganizationActionState } from "@/src/auth/action-state";
import {
  startBillingCheckoutAction,
  type CheckoutActionState,
} from "../dashboard/settings/billing-actions";

type WizardStep = "setup" | "plan";

const ONBOARDING_PLANS: BillingPlanKey[] = ["STARTER", "PROFESSIONAL"];

const FLEET_SIZE_OPTIONS = [
  { value: "", label: "Select fleet size (optional)" },
  { value: "1-10", label: "1–10 vehicles" },
  { value: "11-25", label: "11–25 vehicles" },
  { value: "26-50", label: "26–50 vehicles" },
  { value: "51-100", label: "51–100 vehicles" },
  { value: "100+", label: "100+ vehicles" },
] as const;

/** Fleet size only guides the recommended plan — it is never persisted. */
function suggestedPlan(fleetSize: string): BillingPlanKey {
  if (fleetSize === "26-50" || fleetSize === "51-100" || fleetSize === "100+") {
    return "PROFESSIONAL";
  }
  return "STARTER";
}

function ProgressSteps({ current }: { current: WizardStep }) {
  const steps = [
    { key: "setup", label: "Fleet Setup" },
    { key: "plan", label: "Choose Plan" },
    { key: "trial", label: "Start Trial" },
  ] as const;
  const currentIndex = current === "setup" ? 0 : 1;

  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Onboarding progress">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2 sm:gap-3">
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`h-px w-6 sm:w-10 ${
                  done || active ? "bg-indigo-400" : "bg-slate-200"
                }`}
              />
            )}
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-400"
                }`}
                aria-hidden="true"
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={`text-xs font-medium sm:text-sm ${
                  active
                    ? "text-slate-900"
                    : done
                      ? "text-emerald-700"
                      : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PlanCard({
  planKey,
  interval,
  selected,
  onSelect,
}: {
  planKey: BillingPlanKey;
  interval: BillingInterval;
  selected: boolean;
  onSelect: () => void;
}) {
  const plan = BILLING_PLANS[planKey];
  const isRecommended = planKey === "PROFESSIONAL";
  const cents =
    interval === "MONTHLY"
      ? plan.prices?.monthlyCents ?? null
      : plan.prices?.annualCents ?? null;
  const suffix = interval === "MONTHLY" ? "/month" : "/year";
  const bullets = [
    formatAllowance(plan.limits.vehicles, "vehicles"),
    plan.limits.integrations === "unlimited"
      ? "Unlimited integrations"
      : formatAllowance(plan.limits.integrations, "integrations"),
    ...planFeatureBullets(planKey).slice(0, 4),
  ];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex w-full flex-col rounded-xl border p-5 text-left transition-all ${
        selected
          ? "border-indigo-500 bg-indigo-50/50 shadow-md ring-2 ring-indigo-500/30"
          : "border-slate-200 bg-white shadow-sm hover:border-slate-300"
      }`}
    >
      {isRecommended && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Recommended
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {plan.label}
          </h3>
          {interval === "MONTHLY" && (
            <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              7-day free trial
            </span>
          )}
        </div>
        <span
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
          }`}
          aria-hidden="true"
        >
          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        {formatPlanPrice(cents)}
        <span className="ml-1 text-sm font-normal text-slate-500">{suffix}</span>
      </p>
      <ul className="mt-3 flex-1 space-y-1.5">
        {bullets.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm leading-5 text-slate-600"
          >
            <span className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </button>
  );
}

function CheckoutForm({
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
    <form action={action} className="mt-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`${buttonPrimaryClass} w-full py-3 text-base`}
      >
        {pending ? "Redirecting to secure checkout…" : label}
      </button>
      {state.error && (
        <p className="mt-2 text-center text-sm text-rose-600">{state.error}</p>
      )}
    </form>
  );
}

export default function OnboardingWizard() {
  const [step, setStep] = useState<WizardStep>("setup");
  const [orgName, setOrgName] = useState("");
  const [fleetSize, setFleetSize] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [plan, setPlan] = useState<BillingPlanKey>("STARTER");
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [orgState, orgAction, orgPending] = useActionState<
    OrganizationActionState,
    FormData
  >(createOrganizationAction, {});

  // Once the organization exists, move to plan selection and preselect a
  // plan from the optional fleet-size hint.
  useEffect(() => {
    if (orgState.organizationId) {
      setOrganizationId(orgState.organizationId);
      setPlan(suggestedPlan(fleetSize));
      setStep("plan");
    }
  }, [orgState.organizationId, fleetSize]);

  const selectedPlan = BILLING_PLANS[plan];
  const priceCents =
    interval === "MONTHLY"
      ? selectedPlan.prices?.monthlyCents ?? null
      : selectedPlan.prices?.annualCents ?? null;
  const isTrialCheckout = interval === "MONTHLY";

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-slate-900 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            TRUXERA
          </p>
          <div className="mt-4">
            <ProgressSteps current={step} />
          </div>
        </header>

        {step === "setup" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Set Up Your Fleet
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Create your organization to get started with TRUXERA&apos;s
              intelligent fleet operations platform.
            </p>

            <form action={orgAction} className="mt-8 space-y-5">
              <div>
                <label htmlFor="organization-name" className={labelClass}>
                  Organization name
                </label>
                <input
                  id="organization-name"
                  name="name"
                  autoComplete="organization"
                  required
                  minLength={2}
                  maxLength={100}
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  aria-invalid={Boolean(orgState.error)}
                  aria-describedby={
                    orgState.error ? "organization-error" : undefined
                  }
                  className={inputClass}
                  placeholder="Acme Logistics"
                />
                {orgState.error && (
                  <p
                    id="organization-error"
                    role="alert"
                    className="mt-2 text-sm text-rose-600"
                  >
                    {orgState.error}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="fleet-size" className={labelClass}>
                  Fleet size{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <select
                  id="fleet-size"
                  name="fleetSize"
                  value={fleetSize}
                  onChange={(event) => setFleetSize(event.target.value)}
                  className={inputClass}
                >
                  {FLEET_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  Helps us suggest the right plan — you can change it any time.
                </p>
              </div>

              <button
                type="submit"
                disabled={orgPending}
                className={`${buttonPrimaryClass} w-full py-3 text-base disabled:cursor-wait disabled:opacity-60`}
              >
                {orgPending ? "Creating organization…" : "Continue"}
              </button>
            </form>
          </section>
        ) : (
          organizationId && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Choose your plan
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {orgName || "Your organization"} is ready. Pick the plan that
                fits your fleet — you can change it later.
              </p>

              <div className="mt-6 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
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

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {ONBOARDING_PLANS.map((planKey) => (
                  <PlanCard
                    key={planKey}
                    planKey={planKey}
                    interval={interval}
                    selected={plan === planKey}
                    onSelect={() => setPlan(planKey)}
                  />
                ))}
              </div>

              {isTrialCheckout ? (
                <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
                  <p className="text-sm font-semibold text-slate-900">
                    7-day free trial · Card required · $0 charged today
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Your payment method is collected securely. You won&apos;t be
                    charged during your trial. If you don&apos;t cancel before
                    the trial ends, your selected plan will begin
                    automatically.
                  </p>
                  <CheckoutForm
                    organizationId={organizationId}
                    plan={plan}
                    interval={interval}
                    label={`Start 7-Day Free Trial — ${formatPlanPrice(priceCents)}/mo`}
                  />
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Cancel anytime before your trial ends.
                  </p>
                </div>
              ) : (
                <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedPlan.label} — {formatPlanPrice(priceCents)}
                    /year billed annually
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Secure checkout powered by Paddle. You&apos;ll confirm
                    payment details before your subscription begins.
                  </p>
                  <CheckoutForm
                    organizationId={organizationId}
                    plan={plan}
                    interval={interval}
                    label="Continue to secure checkout"
                  />
                </div>
              )}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setStep("setup")}
                  className={`${buttonSecondaryClass} text-sm`}
                >
                  ← Back to organization setup
                </button>
              </div>
            </section>
          )
        )}
      </div>
    </main>
  );
}
