/**
 * Customer onboarding checklist — pure, deterministic computation.
 *
 * All state is derived from existing organization records; nothing is
 * stored. An integration is informational only and never required for
 * onboarding completion.
 */

export type OnboardingState = "NOT_STARTED" | "IN_PROGRESS" | "READY";

export type OnboardingCheckCategory =
  | "COMPANY_PROFILE"
  | "FLEET_BASELINE"
  | "OPERATIONAL_BASELINE"
  | "INTEGRATION_READINESS"
  | "USER_ACCESS";

export type OnboardingCheck = {
  key: string;
  category: OnboardingCheckCategory;
  label: string;
  description: string;
  complete: boolean;
  /** Required checks gate the READY state; informational checks do not. */
  required: boolean;
  actionLabel: string | null;
  actionHref: string | null;
};

export type OnboardingIntegrationSummary = {
  providerKey: string;
  displayName: string;
  status: string;
  health: string;
  lastSyncAt: string | null;
};

export type OnboardingFacts = {
  organizationName: string;
  hasOwner: boolean;
  hasAdmin: boolean;
  hasActiveTruck: boolean;
  hasDriver: boolean;
  hasLoad: boolean;
  hasDelivery: boolean;
  integrations: OnboardingIntegrationSummary[];
};

export type OnboardingView = {
  state: OnboardingState;
  checks: OnboardingCheck[];
  nextAction: { label: string; href: string } | null;
};

function orgQuery(organizationId: string) {
  return `organizationId=${encodeURIComponent(organizationId)}`;
}

export function computeOnboardingState(
  facts: OnboardingFacts,
  organizationId: string,
): OnboardingView {
  const q = orgQuery(organizationId);
  const checks: OnboardingCheck[] = [
    {
      key: "company-profile",
      category: "COMPANY_PROFILE",
      label: "Company profile",
      description: `Organization name and workspace settings for ${facts.organizationName}.`,
      complete: facts.organizationName.trim().length > 0,
      required: true,
      actionLabel: null,
      actionHref: null,
    },
    {
      key: "fleet-truck",
      category: "FLEET_BASELINE",
      label: "Truck on file",
      description: "At least one active truck is registered.",
      complete: facts.hasActiveTruck,
      required: true,
      actionLabel: "Add a truck",
      actionHref: `/dashboard/trucks/new?${q}`,
    },
    {
      key: "fleet-driver",
      category: "FLEET_BASELINE",
      label: "Driver on file",
      description: "At least one driver is registered.",
      complete: facts.hasDriver,
      required: true,
      actionLabel: "Add a driver",
      actionHref: `/dashboard/drivers/new?${q}`,
    },
    {
      key: "operations-load",
      category: "OPERATIONAL_BASELINE",
      label: "Load created",
      description: "At least one customer load exists.",
      complete: facts.hasLoad,
      required: true,
      actionLabel: "Create a load",
      actionHref: `/dashboard/loads/new?${q}`,
    },
    {
      key: "operations-delivery",
      category: "OPERATIONAL_BASELINE",
      label: "Delivery recorded",
      description:
        "At least one delivery stop exists. Deliveries are created as stops on a load.",
      complete: facts.hasDelivery,
      required: true,
      actionLabel: "Review loads",
      actionHref: `/dashboard/loads?${q}`,
    },
    {
      key: "integration-readiness",
      category: "INTEGRATION_READINESS",
      label: "Integrations",
      description:
        facts.integrations.length === 0
          ? "No integrations connected. Optional — TRUXERA works with manually maintained fleet data."
          : `${facts.integrations.length} integration${facts.integrations.length === 1 ? "" : "s"} configured.`,
      complete: true,
      required: false,
      actionLabel: null,
      actionHref: null,
    },
    {
      key: "access-owner",
      category: "USER_ACCESS",
      label: "Organization owner",
      description: "The organization has an OWNER membership.",
      complete: facts.hasOwner,
      required: true,
      actionLabel: null,
      actionHref: null,
    },
    {
      key: "access-admin",
      category: "USER_ACCESS",
      label: "Administrative access",
      description:
        "At least one OWNER or ADMIN membership can manage the workspace.",
      complete: facts.hasAdmin,
      required: true,
      actionLabel: null,
      actionHref: null,
    },
  ];

  const requiredComplete = checks.every(
    (check) => !check.required || check.complete,
  );
  const operationalProgress = [
    facts.hasActiveTruck,
    facts.hasDriver,
    facts.hasLoad,
    facts.hasDelivery,
  ].some(Boolean);

  const state: OnboardingState = requiredComplete
    ? "READY"
    : operationalProgress
      ? "IN_PROGRESS"
      : "NOT_STARTED";

  const next = checks.find(
    (check) => check.required && !check.complete && check.actionHref,
  );

  return {
    state,
    checks,
    nextAction: next ? { label: next.actionLabel!, href: next.actionHref! } : null,
  };
}
