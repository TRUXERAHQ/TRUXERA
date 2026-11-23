import assert from "node:assert/strict";
import test from "node:test";
import { computeOnboardingState } from "../src/onboarding/onboarding.ts";
import { canAdministerOrganizationSettings } from "../src/settings/organization-settings.ts";
import { canManageFleet, authorizeFleetAccess } from "../src/trucks/truck-policy.ts";

const ORG_ID = "3f8a2c1e-9b4d-4e6f-8a1b-2c3d4e5f6a7b";

function facts(overrides = {}) {
  return {
    organizationName: "Acme Logistics",
    hasOwner: true,
    hasAdmin: true,
    hasActiveTruck: false,
    hasDriver: false,
    hasLoad: false,
    hasDelivery: false,
    integrations: [],
    ...overrides,
  };
}

test("empty organization is NOT_STARTED with fleet next action", () => {
  const view = computeOnboardingState(facts(), ORG_ID);
  assert.equal(view.state, "NOT_STARTED");
  const incomplete = view.checks.filter((c) => c.required && !c.complete);
  assert.deepEqual(
    incomplete.map((c) => c.key),
    ["fleet-truck", "fleet-driver", "operations-load", "operations-delivery"],
  );
  assert.equal(view.nextAction.label, "Add a truck");
  assert.ok(view.nextAction.href.includes(`/dashboard/trucks/new`));
  assert.ok(view.nextAction.href.includes(`organizationId=${ORG_ID}`));
});

test("company profile and access checks pass for a fresh org", () => {
  const view = computeOnboardingState(facts(), ORG_ID);
  const byKey = Object.fromEntries(view.checks.map((c) => [c.key, c]));
  assert.equal(byKey["company-profile"].complete, true);
  assert.equal(byKey["access-owner"].complete, true);
  assert.equal(byKey["access-admin"].complete, true);
});

test("partial setup is IN_PROGRESS with deterministic next action", () => {
  const view = computeOnboardingState(
    facts({ hasActiveTruck: true, hasDriver: true }),
    ORG_ID,
  );
  assert.equal(view.state, "IN_PROGRESS");
  assert.equal(view.nextAction.label, "Create a load");
  assert.ok(view.nextAction.href.includes("/dashboard/loads/new"));
});

test("truck only still IN_PROGRESS; next action is driver", () => {
  const view = computeOnboardingState(facts({ hasActiveTruck: true }), ORG_ID);
  assert.equal(view.state, "IN_PROGRESS");
  assert.equal(view.nextAction.label, "Add a driver");
});

test("fully configured organization is READY with no next action", () => {
  const view = computeOnboardingState(
    facts({
      hasActiveTruck: true,
      hasDriver: true,
      hasLoad: true,
      hasDelivery: true,
    }),
    ORG_ID,
  );
  assert.equal(view.state, "READY");
  assert.equal(view.nextAction, null);
  assert.ok(view.checks.every((c) => c.complete));
});

test("integrations are informational and never gate readiness", () => {
  const withIntegrations = computeOnboardingState(
    facts({
      hasActiveTruck: true,
      hasDriver: true,
      hasLoad: true,
      hasDelivery: true,
      integrations: [
        {
          providerKey: "samsara",
          displayName: "Samsara",
          status: "ERROR",
          health: "ERROR",
          lastSyncAt: null,
        },
      ],
    }),
    ORG_ID,
  );
  assert.equal(withIntegrations.state, "READY");
  const integrationCheck = withIntegrations.checks.find(
    (c) => c.key === "integration-readiness",
  );
  assert.equal(integrationCheck.required, false);
  assert.equal(integrationCheck.complete, true);
});

test("integrations do not substitute for fleet or operational baseline", () => {
  const view = computeOnboardingState(
    facts({
      integrations: [
        {
          providerKey: "mcleod-track-and-trace",
          displayName: "McLeod",
          status: "CONNECTED",
          health: "HEALTHY",
          lastSyncAt: "2026-03-01T00:00:00Z",
        },
      ],
    }),
    ORG_ID,
  );
  assert.equal(view.state, "NOT_STARTED");
});

test("missing owner or admin blocks READY deterministically", () => {
  const noOwner = computeOnboardingState(
    facts({
      hasOwner: false,
      hasActiveTruck: true,
      hasDriver: true,
      hasLoad: true,
      hasDelivery: true,
    }),
    ORG_ID,
  );
  assert.equal(noOwner.state, "IN_PROGRESS");
  const noAdmin = computeOnboardingState(
    facts({
      hasAdmin: false,
      hasActiveTruck: true,
      hasDriver: true,
      hasLoad: true,
      hasDelivery: true,
    }),
    ORG_ID,
  );
  assert.equal(noAdmin.state, "IN_PROGRESS");
});

test("empty organization name blocks READY", () => {
  const view = computeOnboardingState(
    facts({
      organizationName: "   ",
      hasActiveTruck: true,
      hasDriver: true,
      hasLoad: true,
      hasDelivery: true,
    }),
    ORG_ID,
  );
  assert.equal(view.state, "IN_PROGRESS");
});

test("checklist exposes no mutation and uses existing role gates", () => {
  // Viewing is available to any org member; mutations reuse existing roles.
  assert.equal(canAdministerOrganizationSettings("OWNER"), true);
  assert.equal(canAdministerOrganizationSettings("ADMIN"), true);
  assert.equal(canAdministerOrganizationSettings("DISPATCHER"), false);
  assert.equal(canAdministerOrganizationSettings("VIEWER"), false);
  assert.equal(canManageFleet("DISPATCHER"), true);
  assert.equal(canManageFleet("VIEWER"), false);
  // Cross-tenant membership never authorizes access.
  assert.equal(
    authorizeFleetAccess(
      { organizationId: "other-org", role: "OWNER" },
      ORG_ID,
    ),
    false,
  );
  assert.equal(authorizeFleetAccess(null, ORG_ID), false);
});
