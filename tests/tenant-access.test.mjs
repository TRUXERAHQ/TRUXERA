import assert from "node:assert/strict";
import test from "node:test";
import {
  loadForAccessibleOrganization,
  selectAccessibleOrganization,
} from "../src/auth/tenant-policy.ts";
import { createOrganizationWithOwner } from "../src/prisma/onboarding-service.ts";
import {
  authorizeFleetAccess,
  hasDuplicateUnitNumber,
  isUuid,
} from "../src/trucks/truck-policy.ts";
import { parseTruckInput } from "../src/trucks/truck-validation.ts";
import {
  getDashboardMetrics,
  getTruckCapacityUtilizationPercent,
} from "../src/dashboard/dashboard-metrics.ts";
import {
  canTransitionDeliveryStatus,
  changeDeliveryStatus,
  getAllowedDeliveryStatusTransitions,
} from "../src/fleet/delivery-lifecycle.ts";
import {
  assignDelivery,
  createLoadWithDeliveries,
  endDeliveryAssignment,
  reassignDelivery,
  saveDriver,
  updateLoadDetails,
} from "../src/fleet/operations-service.ts";
import {
  getReassignmentRecommendations,
} from "../src/fleet/reassignment-engine.ts";
import {
  analyzeDeliveryRisk,
  analyzeDeliveryRisksForOrganization,
  riskLevels,
  summarizeDeliveryRisks,
} from "../src/fleet/delivery-risk.ts";
import {
  buildCommandCenter,
  parseCommandCenterFilters,
} from "../src/dashboard/command-center.ts";
import {
  parseDriverInput,
  parseLoadInput,
  parseLoadUpdateInput,
} from "../src/fleet/operations-validation.ts";
import {
  buildDeliveryChain,
  buildRecoveryImpact,
} from "../src/dashboard/delivery-chain.ts";
import {
  buildDownstreamImpact,
  buildWhatHappened,
} from "../src/dashboard/load-impact.ts";
import {
  getOwnFeedback,
  listOwnFeedback,
  parseFeedbackInput,
  submitFeedback,
} from "../src/feedback/feedback-service.ts";

test("driver records can be created and updated through the validated workflow", async () => {
  const drivers = [];
  const repository = {
    async findDriver(id) {
      return drivers.find((driver) => driver.id === id) ?? null;
    },
    async hasDuplicateLicenseNumber(licenseNumber, excludingDriverId) {
      return drivers.some(
        (driver) =>
          driver.id !== excludingDriverId &&
          driver.licenseNumber === licenseNumber,
      );
    },
    async createDriver(input) {
      const driver = { id: "driver-1", ...input };
      drivers.push(driver);
      return driver;
    },
    async updateDriver(id, input) {
      const driver = drivers.find((item) => item.id === id);
      Object.assign(driver, input);
      return driver;
    },
  };
  const createForm = new FormData();
  createForm.set("name", "Asha Patel");
  createForm.set("phone", "+49 111 222");
  createForm.set("licenseNumber", "de-123");
  createForm.set("status", "AVAILABLE");
  const createInput = parseDriverInput(createForm);
  assert.equal("error" in createInput, false);

  const created = await saveDriver(undefined, createInput.input, repository);
  assert.deepEqual(created, { ok: true, value: { id: "driver-1" } });
  assert.equal(drivers[0].licenseNumber, "DE-123");

  const updateForm = new FormData();
  updateForm.set("name", "Asha Patel");
  updateForm.set("phone", "");
  updateForm.set("licenseNumber", "de-123");
  updateForm.set("status", "ON_DUTY");
  const updateInput = parseDriverInput(updateForm);
  assert.equal("error" in updateInput, false);

  const updated = await saveDriver("driver-1", updateInput.input, repository);
  assert.deepEqual(updated, { ok: true, value: { id: "driver-1" } });
  assert.equal(drivers.length, 1);
  assert.equal(drivers[0].status, "ON_DUTY");
});

test("a load and its one-or-more delivery stops are created as one workflow", async () => {
  const form = new FormData();
  form.set("reference", "load-42");
  form.set("customerName", "Northwind");
  form.set("pickupAddress", "1 Warehouse Road");
  form.set("cargoDescription", "Pallets");
  form.set("weightKg", "5000");
  form.append("stopRecipientName", "First recipient");
  form.append("stopReference", "stop-a");
  form.append("stopDestinationAddress", "10 Market Street");
  form.append("stopRecipientName", "Second recipient");
  form.append("stopReference", "stop-b");
  form.append("stopDestinationAddress", "20 Harbor Road");
  const parsed = parseLoadInput(form);
  assert.equal("error" in parsed, false);

  const savedStops = [];
  const events = [];
  const result = await createLoadWithDeliveries(parsed.input, {
    async createLoad(input) {
      assert.equal(input.reference, "LOAD-42");
      return { id: "load-1" };
    },
    async createDelivery(loadId, stopNumber, stop) {
      const delivery = { id: `delivery-${stopNumber}`, loadId, stopNumber, ...stop };
      savedStops.push(delivery);
      return delivery;
    },
    async createInitialStatusEvent(deliveryId) {
      events.push(deliveryId);
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      id: "load-1",
      deliveryIds: ["delivery-1", "delivery-2"],
    },
  });
  assert.deepEqual(savedStops.map((stop) => stop.stopNumber), [1, 2]);
  assert.deepEqual(events, ["delivery-1", "delivery-2"]);
});

function makeDispatchRepository({ truckOrganizationId = "org-a", oldAssignments = [] } = {}) {
  const delivery = {
    id: "delivery-1",
    organizationId: "org-a",
    loadId: "load-1",
    status: "PLANNED",
    weightKg: 5000,
  };
  const truck = {
    id: "truck-1",
    organizationId: truckOrganizationId,
    unitNumber: "TR-1",
    status: "AVAILABLE",
    deactivatedAt: null,
    capacityKg: 10000,
  };
  const driver = {
    id: "driver-1",
    organizationId: "org-a",
    name: "Asha Patel",
    status: "AVAILABLE",
  };
  const assignments = [...oldAssignments];
  const events = [];

  return {
    delivery,
    assignments,
    events,
    async findDelivery(id) {
      return id === delivery.id ? delivery : null;
    },
    async findTruck(id) {
      return id === truck.id ? truck : null;
    },
    async findDriver(id) {
      return id === driver.id ? driver : null;
    },
    async findActiveAssignment(id) {
      return assignments.find(
        (assignment) =>
          assignment.deliveryId === id && assignment.endedAt === null,
      ) ?? null;
    },
    async findActiveResourceAssignments(truckId, driverId) {
      return assignments.filter(
        (assignment) =>
          assignment.endedAt === null &&
          (assignment.truckId === truckId || assignment.driverId === driverId),
      );
    },
    async findActiveAssignmentForEnd(id) {
      const assignment = assignments.find(
        (item) => item.id === id && item.endedAt === null,
      );
      return assignment ? { ...assignment, delivery } : null;
    },
    async createAssignment(input) {
      const assignment = {
        id: `assignment-${assignments.length + 1}`,
        organizationId: "org-a",
        deliveryId: input.deliveryId,
        loadId: delivery.loadId,
        truckId: input.truckId,
        driverId: input.driverId,
        endedAt: null,
      };
      assignments.push(assignment);
      return assignment;
    },
    async updateDeliveryStatus(_id, status) {
      delivery.status = status;
    },
    async endAssignment(id, endedAt, endReason) {
      const assignment = assignments.find((item) => item.id === id);
      assignment.endedAt = endedAt;
      assignment.endReason = endReason;
    },
    async createAssignmentEvent(event) {
      events.push(event);
    },
  };
}

test("dispatch assignments accept only records from the selected organization", async () => {
  const repository = makeDispatchRepository();
  const result = await assignDelivery(
    "org-a",
    "delivery-1",
    "truck-1",
    "driver-1",
    repository,
  );

  assert.equal(result.ok, true);
  assert.equal(repository.assignments.length, 1);
  assert.equal(repository.events[0].toStatus, "ASSIGNED");
});

test("cross-organization truck assignment is rejected without changing delivery", async () => {
  const repository = makeDispatchRepository({ truckOrganizationId: "org-b" });
  const result = await assignDelivery(
    "org-a",
    "delivery-1",
    "truck-1",
    "driver-1",
    repository,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /must belong to this organization/);
  assert.equal(repository.assignments.length, 0);
  assert.equal(repository.events.length, 0);
});

test("active resources on another load cannot be assigned again", async () => {
  const repository = makeDispatchRepository({
    oldAssignments: [
      {
        id: "assignment-other-load",
        organizationId: "org-a",
        deliveryId: "delivery-other",
        loadId: "load-other",
        truckId: "truck-1",
        driverId: "driver-other",
        endedAt: null,
      },
    ],
  });
  const result = await assignDelivery(
    "org-a",
    "delivery-1",
    "truck-1",
    "driver-1",
    repository,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /active assignments on another load/);
  assert.equal(repository.assignments.length, 1);
});

test("active resources may continue a different stop on the same load", async () => {
  const repository = makeDispatchRepository({
    oldAssignments: [
      {
        id: "assignment-same-load",
        organizationId: "org-a",
        deliveryId: "delivery-other-stop",
        loadId: "load-1",
        truckId: "truck-1",
        driverId: "driver-1",
        endedAt: null,
      },
    ],
  });
  const result = await assignDelivery(
    "org-a",
    "delivery-1",
    "truck-1",
    "driver-1",
    repository,
  );

  assert.equal(result.ok, true);
  assert.equal(repository.assignments.length, 2);
});

test("ended assignment history is retained when a delivery is assigned again", async () => {
  const priorAssignment = {
    id: "assignment-old",
    organizationId: "org-a",
    deliveryId: "delivery-1",
    truckId: "truck-1",
    driverId: "driver-1",
    endedAt: new Date("2026-01-01T00:00:00Z"),
    endReason: "Previous route completed",
  };
  const repository = makeDispatchRepository({
    oldAssignments: [priorAssignment],
  });
  const assigned = await assignDelivery(
    "org-a",
    "delivery-1",
    "truck-1",
    "driver-1",
    repository,
  );
  assert.equal(assigned.ok, true);
  assert.equal(repository.assignments.length, 2);
  assert.equal(repository.assignments[0].endReason, "Previous route completed");

  const ended = await endDeliveryAssignment(
    assigned.value.id,
    "Route completed",
    repository,
  );
  assert.equal(ended.ok, true);
  assert.equal(repository.assignments.length, 2);
  assert.equal(repository.assignments[0].id, "assignment-old");
  assert.equal(repository.assignments[1].endReason, "Route completed");
  assert.ok(repository.assignments[1].endedAt instanceof Date);
});

function makeReassignmentRepository({
  truckOrganizationId = "org-a",
  truckStatus = "AVAILABLE",
  truckDeactivatedAt = null,
  capacityKg = 10000,
} = {}) {
  const delivery = {
    id: "delivery-1",
    organizationId: "org-a",
    loadId: "load-1",
    status: "IN_TRANSIT",
    weightKg: 5000,
  };
  const assignments = [
    {
      id: "assignment-current",
      organizationId: "org-a",
      deliveryId: delivery.id,
      loadId: delivery.loadId,
      truckId: "truck-current",
      driverId: "driver-current",
      truckUnitNumber: "TR-1",
      driverName: "Current Driver",
      endedAt: null,
      endReason: null,
    },
  ];
  const truck = {
    id: "truck-replacement",
    organizationId: truckOrganizationId,
    unitNumber: "TR-2",
    status: truckStatus,
    deactivatedAt: truckDeactivatedAt,
    capacityKg,
  };
  const driver = {
    id: "driver-replacement",
    organizationId: "org-a",
    name: "Replacement Driver",
    status: "AVAILABLE",
  };
  const events = [];

  return {
    delivery,
    assignments,
    events,
    async findDeliveryForUpdate(id) {
      return id === delivery.id ? delivery : null;
    },
    async findActiveAssignmentForUpdate(id) {
      return assignments.find(
        (assignment) =>
          assignment.deliveryId === id && assignment.endedAt === null,
      ) ?? null;
    },
    async findTruckForUpdate(id) {
      return id === truck.id ? truck : null;
    },
    async findDriverForUpdate(id) {
      return id === driver.id ? driver : null;
    },
    async findActiveResourceAssignments(truckId, driverId) {
      return assignments
        .filter(
          (assignment) =>
            assignment.endedAt === null &&
            (assignment.truckId === truckId ||
              assignment.driverId === driverId),
        )
        .map((assignment) => ({
          id: assignment.id,
          deliveryId: assignment.deliveryId,
          loadId: assignment.loadId,
          truckId: assignment.truckId,
          driverId: assignment.driverId,
          endedAt: assignment.endedAt,
        }));
    },
    async endAssignment(id, endedAt, endReason) {
      const assignment = assignments.find((item) => item.id === id);
      assignment.endedAt = endedAt;
      assignment.endReason = endReason;
    },
    async createAssignment(input) {
      const assignment = {
        id: `assignment-${assignments.length + 1}`,
        organizationId: "org-a",
        deliveryId: input.deliveryId,
        loadId: delivery.loadId,
        truckId: input.truckId,
        driverId: input.driverId,
        assignedByUserId: input.assignedByUserId,
        endedAt: null,
        endReason: null,
      };
      assignments.push(assignment);
      return assignment;
    },
    async createAssignmentEvent(event) {
      events.push(event);
    },
  };
}

const reassignmentInput = {
  organizationId: "org-a",
  userId: "dispatcher-1",
  deliveryId: "delivery-1",
  currentAssignmentId: "assignment-current",
  truckId: "truck-replacement",
  driverId: "driver-replacement",
  reason: "Current truck unavailable",
};

test("reassignment retains the prior row and records a new active assignment and actor event", async () => {
  const repository = makeReassignmentRepository();
  const result = await reassignDelivery(
    reassignmentInput.organizationId,
    reassignmentInput.userId,
    reassignmentInput.deliveryId,
    reassignmentInput.currentAssignmentId,
    reassignmentInput.truckId,
    reassignmentInput.driverId,
    reassignmentInput.reason,
    repository,
  );

  assert.equal(result.ok, true);
  assert.equal(repository.assignments.length, 2);
  assert.ok(repository.assignments[0].endedAt instanceof Date);
  assert.match(repository.assignments[0].endReason, /Current truck unavailable/);
  assert.equal(repository.assignments[1].endedAt, null);
  assert.equal(repository.assignments[1].assignedByUserId, "dispatcher-1");
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0].actorUserId, "dispatcher-1");
  assert.equal(repository.events[0].fromStatus, "IN_TRANSIT");
  assert.equal(repository.events[0].toStatus, "IN_TRANSIT");
  assert.match(repository.events[0].note, /TR-1.*TR-2/);
  assert.match(repository.events[0].note, /Current truck unavailable/);
});

test("reassignment rejects cross-organization and newly ineligible resources", async () => {
  for (const options of [
    { truckOrganizationId: "org-b" },
    { truckStatus: "MAINTENANCE" },
    { truckDeactivatedAt: new Date() },
    { capacityKg: 4000 },
  ]) {
    const repository = makeReassignmentRepository(options);
    const result = await reassignDelivery(
      reassignmentInput.organizationId,
      reassignmentInput.userId,
      reassignmentInput.deliveryId,
      reassignmentInput.currentAssignmentId,
      reassignmentInput.truckId,
      reassignmentInput.driverId,
      reassignmentInput.reason,
      repository,
    );
    assert.equal(result.ok, false);
    assert.equal(repository.assignments.length, 1);
    assert.equal(repository.events.length, 0);
  }
});

test("reassignment rejects replacement resources with conflicting active work", async () => {
  const repository = makeReassignmentRepository();
  repository.assignments.push({
    id: "assignment-resource-conflict",
    organizationId: "org-a",
    deliveryId: "delivery-other",
    loadId: "load-other",
    truckId: "truck-replacement",
    driverId: "driver-other",
    endedAt: null,
  });
  const result = await reassignDelivery(
    reassignmentInput.organizationId,
    reassignmentInput.userId,
    reassignmentInput.deliveryId,
    reassignmentInput.currentAssignmentId,
    reassignmentInput.truckId,
    reassignmentInput.driverId,
    reassignmentInput.reason,
    repository,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /active assignment on another load/);
  assert.equal(repository.assignments[0].endedAt, null);
  assert.equal(repository.events.length, 0);
});

test("a stale assignment cannot be reassigned after another dispatcher changes it", async () => {
  const repository = makeReassignmentRepository();
  const result = await reassignDelivery(
    reassignmentInput.organizationId,
    reassignmentInput.userId,
    reassignmentInput.deliveryId,
    "older-assignment",
    reassignmentInput.truckId,
    reassignmentInput.driverId,
    reassignmentInput.reason,
    repository,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /assignment changed/);
  assert.equal(repository.assignments.length, 1);
  assert.equal(repository.assignments[0].endedAt, null);
  assert.equal(repository.events.length, 0);
});

test("serialized simultaneous reassignment attempts create only one active assignment", async () => {
  const repository = makeReassignmentRepository();
  let queue = Promise.resolve();
  const inTransaction = async (operation) => {
    let release;
    const predecessor = queue;
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await predecessor;
    try {
      return await operation();
    } finally {
      release();
    }
  };
  const attempt = () =>
    inTransaction(() =>
      reassignDelivery(
        reassignmentInput.organizationId,
        reassignmentInput.userId,
        reassignmentInput.deliveryId,
        reassignmentInput.currentAssignmentId,
        reassignmentInput.truckId,
        reassignmentInput.driverId,
        reassignmentInput.reason,
        repository,
      ),
    );

  const results = await Promise.all([attempt(), attempt()]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(repository.assignments.length, 2);
  assert.equal(
    repository.assignments.filter((assignment) => assignment.endedAt === null)
      .length,
    1,
  );
  assert.equal(repository.events.length, 1);
});

test("reassignment recommendations enforce eligibility and stable scoring", () => {
  const delivery = {
    id: "delivery-1",
    organizationId: "org-a",
    loadId: "load-a",
    weightKg: 5000,
  };
  const currentAssignment = {
    id: "assignment-current",
    truckId: "truck-current",
    driverId: "driver-current",
  };
  const trucks = [
    {
      id: "truck-current",
      organizationId: "org-a",
      unitNumber: "TR-1",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: 20000,
    },
    {
      id: "truck-31",
      organizationId: "org-a",
      unitNumber: "TR-31",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: 10000,
    },
    {
      id: "truck-32",
      organizationId: "org-a",
      unitNumber: "TR-32",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: 8000,
    },
    {
      id: "truck-maintenance",
      organizationId: "org-a",
      unitNumber: "TR-33",
      status: "MAINTENANCE",
      deactivatedAt: null,
      capacityKg: 10000,
    },
    {
      id: "truck-out-of-service",
      organizationId: "org-a",
      unitNumber: "TR-39",
      status: "OUT_OF_SERVICE",
      deactivatedAt: null,
      capacityKg: 10000,
    },
    {
      id: "truck-capacity",
      organizationId: "org-a",
      unitNumber: "TR-34",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: 4000,
    },
    {
      id: "truck-archived",
      organizationId: "org-a",
      unitNumber: "TR-35",
      status: "AVAILABLE",
      deactivatedAt: new Date(),
      capacityKg: 10000,
    },
    {
      id: "truck-unknown-capacity",
      organizationId: "org-a",
      unitNumber: "TR-36",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: null,
    },
    {
      id: "truck-other-org",
      organizationId: "org-b",
      unitNumber: "TR-37",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: 10000,
    },
    {
      id: "truck-conflict",
      organizationId: "org-a",
      unitNumber: "TR-38",
      status: "AVAILABLE",
      deactivatedAt: null,
      capacityKg: 10000,
    },
  ];
  const drivers = [
    {
      id: "driver-current",
      organizationId: "org-a",
      name: "Current Driver",
      status: "AVAILABLE",
    },
    {
      id: "driver-a",
      organizationId: "org-a",
      name: "Asha",
      status: "AVAILABLE",
    },
    {
      id: "driver-b",
      organizationId: "org-a",
      name: "Boris",
      status: "ON_DUTY",
    },
    {
      id: "driver-busy",
      organizationId: "org-a",
      name: "Busy Driver",
      status: "AVAILABLE",
    },
    {
      id: "driver-off",
      organizationId: "org-a",
      name: "Off Duty",
      status: "OFF_DUTY",
    },
    {
      id: "driver-other-org",
      organizationId: "org-b",
      name: "Other Organization",
      status: "AVAILABLE",
    },
  ];
  const activeAssignments = [
    {
      id: "assignment-current",
      deliveryId: "delivery-1",
      loadId: "load-a",
      truckId: "truck-current",
      driverId: "driver-current",
      endedAt: null,
    },
    {
      id: "same-load-stop",
      deliveryId: "delivery-2",
      loadId: "load-a",
      truckId: "truck-32",
      driverId: "driver-b",
      endedAt: null,
    },
    {
      id: "other-load-conflict",
      deliveryId: "delivery-3",
      loadId: "load-b",
      truckId: "truck-conflict",
      driverId: "driver-conflict",
      endedAt: null,
    },
    {
      id: "other-load-driver-conflict",
      deliveryId: "delivery-4",
      loadId: "load-b",
      truckId: "truck-conflict",
      driverId: "driver-busy",
      endedAt: null,
    },
  ];
  const input = {
    organizationId: "org-a",
    delivery,
    currentAssignment,
    trucks,
    drivers,
    activeAssignments,
  };

  const result = getReassignmentRecommendations(input);
  const reversed = getReassignmentRecommendations({
    ...input,
    trucks: [...trucks].reverse(),
    drivers: [...drivers].reverse(),
  });
  const candidateKeys = result.candidates.map(
    ({ truck, driver, assessment }) =>
      `${truck.id}:${driver.id}:${assessment.status}`,
  );

  assert.equal(result.eligibleCount, 4);
  assert.equal(result.insufficientDataCount, 2);
  assert.equal(result.recommended.truck.id, "truck-31");
  assert.equal(result.recommended.driver.id, "driver-a");
  assert.deepEqual(
    candidateKeys,
    reversed.candidates.map(
      ({ truck, driver, assessment }) =>
        `${truck.id}:${driver.id}:${assessment.status}`,
    ),
  );
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-current:")));
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-maintenance:")));
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-out-of-service:")));
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-capacity:")));
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-archived:")));
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-other-org:")));
  assert.ok(candidateKeys.every((key) => !key.startsWith("truck-conflict:")));
  assert.ok(candidateKeys.every((key) => !key.includes(":driver-current:")));
  assert.ok(candidateKeys.every((key) => !key.includes(":driver-off:")));
  assert.ok(candidateKeys.every((key) => !key.includes(":driver-busy:")));
  assert.ok(candidateKeys.every((key) => !key.includes(":driver-other-org:")));
  assert.ok(
    result.candidates
      .filter((candidate) => candidate.truck.id === "truck-unknown-capacity")
      .every((candidate) => candidate.assessment.status === "INSUFFICIENT_DATA"),
  );

  const missingWeight = getReassignmentRecommendations({
    ...input,
    delivery: { ...delivery, weightKg: null },
    trucks: [trucks.find((truck) => truck.id === "truck-31")],
    drivers: [drivers.find((driver) => driver.id === "driver-a")],
    activeAssignments: [],
  });
  assert.equal(missingWeight.eligibleCount, 0);
  assert.equal(missingWeight.insufficientDataCount, 1);
  assert.equal(missingWeight.recommended, null);
});

function makeDeliveryRiskInput(overrides = {}) {
  const delivery = {
    id: "delivery-risk",
    organizationId: "org-a",
    loadId: "load-risk",
    status: "IN_TRANSIT",
    riskLevel: "LOW",
    eta: new Date("2026-11-13T00:00:00.000Z"),
    weightKg: 5000,
    ...overrides.delivery,
  };
  const currentTruck = {
    id: "truck-current-risk",
    organizationId: "org-a",
    unitNumber: "TR-1",
    status: "ON_ROUTE",
    deactivatedAt: null,
    capacityKg: 10000,
    ...overrides.currentTruck,
  };
  const currentDriver = {
    id: "driver-current-risk",
    organizationId: "org-a",
    name: "Current Driver",
    status: "AVAILABLE",
    ...overrides.currentDriver,
  };
  const currentAssignment = {
    id: "assignment-current-risk",
    deliveryId: delivery.id,
    truckId: currentTruck.id,
    driverId: currentDriver.id,
    truck: currentTruck,
    driver: currentDriver,
  };
  const replacementTruck = {
    id: "truck-replacement-risk",
    organizationId: "org-a",
    unitNumber: "TR-2",
    status: "AVAILABLE",
    deactivatedAt: null,
    capacityKg: 12000,
    ...overrides.replacementTruck,
  };
  const replacementDriver = {
    id: "driver-replacement-risk",
    organizationId: "org-a",
    name: "Replacement Driver",
    status: "AVAILABLE",
    ...overrides.replacementDriver,
  };
  const activeAssignments = [
    {
      id: currentAssignment.id,
      deliveryId: delivery.id,
      loadId: delivery.loadId,
      truckId: currentTruck.id,
      driverId: currentDriver.id,
      endedAt: null,
    },
    ...(overrides.activeAssignments ?? []),
  ];

  return {
    organizationId: "org-a",
    analyzedAt: new Date("2026-11-12T12:00:00.000Z"),
    delivery,
    currentAssignment,
    assignmentHistory: overrides.assignmentHistory ?? [],
    trucks: [currentTruck, replacementTruck],
    drivers: [currentDriver, replacementDriver],
    activeAssignments,
    events: overrides.events ?? [],
    ...overrides.input,
  };
}

test("delivery risk is low only when current operational signals are sufficient", () => {
  assert.deepEqual(riskLevels, ["LOW", "MEDIUM", "HIGH"]);
  const result = analyzeDeliveryRisk(makeDeliveryRiskInput());
  assert.equal(result.status, "ASSESSED");
  assert.equal(result.riskLevel, "LOW");
  assert.match(result.reasons[0], /No elevated operational risk/);
  assert.ok(result.evidence.some((item) => item.includes("truck TR-1")));
});

test("delivery risk becomes medium for stored risk and verified reassignment history", () => {
  const result = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      delivery: { riskLevel: "MEDIUM" },
      assignmentHistory: [
        {
          endedAt: new Date("2026-11-11T00:00:00.000Z"),
          endReason: "Reassigned from truck TR-0 to truck TR-1.",
        },
      ],
      events: [
        {
          type: "DELIVERY_ATTEMPTED",
          toStatus: null,
          note: null,
        },
        {
          type: "DELIVERY_ATTEMPTED",
          toStatus: null,
          note: null,
        },
      ],
    }),
  );
  assert.equal(result.riskLevel, "MEDIUM");
  assert.ok(result.evidence.some((item) => item.includes("reassignment history")));
  assert.ok(result.reasons.some((reason) => reason.includes("multiple delivery attempts")));
});

test("capacity, unavailable resources, conflicting assignments, and exceptions elevate risk", () => {
  const capacityRisk = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      delivery: { weightKg: 15000 },
    }),
  );
  assert.equal(capacityRisk.riskLevel, "HIGH");
  assert.ok(capacityRisk.reasons.some((reason) => reason.includes("capacity is insufficient")));

  const unavailableRisk = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "OUT_OF_SERVICE" },
      currentDriver: { status: "OFF_DUTY" },
      events: [{ type: "EXCEPTION_REPORTED", toStatus: null, note: "Recorded" }],
    }),
  );
  assert.equal(unavailableRisk.riskLevel, "HIGH");
  assert.ok(unavailableRisk.reasons.some((reason) => reason.includes("truck is deactivated")));
  assert.ok(unavailableRisk.reasons.some((reason) => reason.includes("driver is off duty")));
  assert.ok(unavailableRisk.reasons.some((reason) => reason.includes("reported exception")));

  const conflictingRisk = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      activeAssignments: [{
        id: "other-load-assignment",
        deliveryId: "delivery-other",
        loadId: "load-other",
        truckId: "truck-current-risk",
        driverId: "driver-other",
        endedAt: null,
      }],
    }),
  );
  assert.equal(conflictingRisk.riskLevel, "HIGH");
  assert.ok(conflictingRisk.reasons.some((reason) => reason.includes("conflicting active work")));

  const overdueRisk = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      delivery: {
        status: "IN_TRANSIT",
        eta: new Date("2026-11-12T11:00:00.000Z"),
      },
    }),
  );
  assert.equal(overdueRisk.riskLevel, "HIGH");
  assert.ok(overdueRisk.reasons.some((reason) => reason.includes("stored delivery ETA has passed")));
});

test("missing required capacity evidence yields insufficient data, not a low prediction", () => {
  const result = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { capacityKg: null },
    }),
  );
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.riskLevel, null);
  assert.ok(result.limitations.some((limitation) => limitation.includes("capacity fit cannot be verified")));

  const missingEvents = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      input: { events: null },
    }),
  );
  assert.equal(missingEvents.riskLevel, null);
  assert.ok(missingEvents.limitations.some((limitation) => limitation.includes("event history is unavailable")));
});

test("high risk exposes eligible reassignment candidates without automatic action or confidence", () => {
  const result = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "MAINTENANCE" },
    }),
  );
  assert.equal(result.riskLevel, "HIGH");
  assert.equal(result.intervention.required, true);
  assert.equal(result.intervention.action, "Review reassignment");
  assert.equal(result.intervention.recommended.truckUnitNumber, "TR-2");
  assert.equal(result.reassignmentCandidates.length, 1);
  assert.equal("confidence" in result.intervention, false);
});

test("risk output is deterministic and does not invent external signals", () => {
  const input = makeDeliveryRiskInput({
    delivery: { eta: null },
  });
  const first = analyzeDeliveryRisk(input);
  const second = analyzeDeliveryRisk(input);
  assert.deepEqual(first, second);
  assert.ok(first.limitations.some((limitation) => limitation.includes("ETA-based delay is not assessed")));
  const output = JSON.stringify(first).toLowerCase();
  assert.doesNotMatch(output, /gps|traffic|weather|telematics|eld/);
});

test("risk analysis isolates tenant inputs and summarizes only observed levels", () => {
  const unsafe = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      delivery: { organizationId: "org-b" },
    }),
  );
  assert.equal(unsafe.riskLevel, null);
  assert.deepEqual(unsafe.evidence, []);
  assert.equal(unsafe.intervention.eligibleReassignmentCount, 0);

  const base = makeDeliveryRiskInput();
  const results = analyzeDeliveryRisksForOrganization({
    organizationId: "org-a",
    analyzedAt: base.analyzedAt,
    deliveries: [
      {
        ...base.delivery,
        status: "PLANNED",
        load: { weightKg: base.delivery.weightKg },
      },
      {
        ...base.delivery,
        id: "other-tenant-delivery",
        organizationId: "org-b",
        status: "PLANNED",
        load: { weightKg: base.delivery.weightKg },
      },
    ],
    trucks: base.trucks,
    drivers: base.drivers,
    assignments: [],
    events: [],
  });
  assert.deepEqual(results.map(({ deliveryId }) => deliveryId), ["delivery-risk"]);
  const summary = summarizeDeliveryRisks(results.map(({ analysis }) => analysis));
  assert.equal(summary.LOW, 1);
  assert.equal(summary.HIGH, 0);
  assert.equal(summary.requiringIntervention, 0);
});

function makeLifecycleRepository({
  organizationId = "org-a",
  status = "IN_TRANSIT",
  hasActiveAssignment = true,
} = {}) {
  const delivery = {
    id: "delivery-lifecycle",
    organizationId,
    loadId: "load-lifecycle",
    status,
    deliveredAt: null,
  };
  const assignments = hasActiveAssignment
    ? [
        {
          id: "assignment-lifecycle",
          endedAt: null,
          endReason: null,
        },
      ]
    : [];
  const events = [];

  return {
    delivery,
    assignments,
    events,
    async findDeliveryForUpdate(id) {
      return id === delivery.id ? delivery : null;
    },
    async findActiveAssignmentForUpdate(id) {
      if (id !== delivery.id) return null;
      return assignments.find((assignment) => assignment.endedAt === null) ?? null;
    },
    async updateDeliveryStatus(_id, nextStatus, deliveredAt) {
      delivery.status = nextStatus;
      delivery.deliveredAt = deliveredAt;
    },
    async endAssignment(id, endedAt, endReason) {
      const assignment = assignments.find((item) => item.id === id);
      assignment.endedAt = endedAt;
      assignment.endReason = endReason;
    },
    async createStatusEvent(event) {
      events.push({ type: "STATUS_CHANGED", ...event });
    },
    async createAssignmentEvent(event) {
      events.push({ type: "ASSIGNMENT_CHANGED", ...event });
    },
  };
}

test("delivery lifecycle allows only forward and explicitly terminal transitions", () => {
  const validTransitions = [
    ["PLANNED", "CANCELLED"],
    ["ASSIGNED", "PICKED_UP"],
    ["ASSIGNED", "CANCELLED"],
    ["PICKED_UP", "IN_TRANSIT"],
    ["PICKED_UP", "FAILED"],
    ["IN_TRANSIT", "DELIVERED"],
    ["IN_TRANSIT", "FAILED"],
  ];
  const invalidTransitions = [
    ["PLANNED", "ASSIGNED"],
    ["PLANNED", "IN_TRANSIT"],
    ["ASSIGNED", "DELIVERED"],
    ["DELIVERED", "PLANNED"],
    ["DELIVERED", "IN_TRANSIT"],
    ["FAILED", "ASSIGNED"],
    ["CANCELLED", "PLANNED"],
  ];

  for (const [fromStatus, toStatus] of validTransitions) {
    assert.equal(canTransitionDeliveryStatus(fromStatus, toStatus), true);
  }
  for (const [fromStatus, toStatus] of invalidTransitions) {
    assert.equal(canTransitionDeliveryStatus(fromStatus, toStatus), false);
  }
  assert.deepEqual(getAllowedDeliveryStatusTransitions("PLANNED"), [
    "CANCELLED",
  ]);
});

test("completion records the status event and ends, but retains, the assignment", async () => {
  const repository = makeLifecycleRepository();
  const result = await changeDeliveryStatus(
    "org-a",
    "user-1",
    "delivery-lifecycle",
    "IN_TRANSIT",
    "DELIVERED",
    "Recipient confirmed receipt",
    repository,
  );

  assert.equal(result.ok, true);
  assert.equal(repository.delivery.status, "DELIVERED");
  assert.ok(repository.delivery.deliveredAt instanceof Date);
  assert.equal(repository.assignments.length, 1);
  assert.ok(repository.assignments[0].endedAt instanceof Date);
  assert.match(repository.assignments[0].endReason, /DELIVERED/);
  assert.deepEqual(
    repository.events.map((event) => event.type),
    ["STATUS_CHANGED", "ASSIGNMENT_CHANGED"],
  );
  assert.equal(repository.events[0].actorUserId, "user-1");
  assert.equal(repository.events[0].fromStatus, "IN_TRANSIT");
  assert.equal(repository.events[0].toStatus, "DELIVERED");
  assert.match(repository.events[0].note, /Recipient confirmed receipt/);
});

test("status updates reject cross-tenant delivery and progress without an active assignment", async () => {
  const crossTenant = makeLifecycleRepository({ organizationId: "org-b" });
  const denied = await changeDeliveryStatus(
    "org-a",
    "user-1",
    "delivery-lifecycle",
    "IN_TRANSIT",
    "DELIVERED",
    "",
    crossTenant,
  );
  assert.equal(denied.ok, false);
  assert.equal(crossTenant.events.length, 0);

  const unassigned = makeLifecycleRepository({ hasActiveAssignment: false });
  const rejected = await changeDeliveryStatus(
    "org-a",
    "user-1",
    "delivery-lifecycle",
    "IN_TRANSIT",
    "DELIVERED",
    "",
    unassigned,
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /active truck and driver assignment/);
  assert.equal(unassigned.delivery.status, "IN_TRANSIT");
  assert.equal(unassigned.events.length, 0);
});

test("stale and repeated completion requests are rejected without duplicate events", async () => {
  const repository = makeLifecycleRepository();
  const completed = await changeDeliveryStatus(
    "org-a",
    "user-1",
    "delivery-lifecycle",
    "IN_TRANSIT",
    "DELIVERED",
    "",
    repository,
  );
  assert.equal(completed.ok, true);

  const stale = await changeDeliveryStatus(
    "org-a",
    "user-2",
    "delivery-lifecycle",
    "IN_TRANSIT",
    "FAILED",
    "",
    repository,
  );
  assert.equal(stale.ok, false);
  assert.match(stale.error, /status changed/);

  const repeated = await changeDeliveryStatus(
    "org-a",
    "user-2",
    "delivery-lifecycle",
    "DELIVERED",
    "DELIVERED",
    "",
    repository,
  );
  assert.equal(repeated.ok, false);
  assert.match(repeated.error, /cannot transition/);
  assert.equal(repository.events.length, 2);
});

test("reassignment rows and events remain in history after delivery completion", async () => {
  const dispatch = makeReassignmentRepository();
  const reassigned = await reassignDelivery(
    reassignmentInput.organizationId,
    reassignmentInput.userId,
    reassignmentInput.deliveryId,
    reassignmentInput.currentAssignmentId,
    reassignmentInput.truckId,
    reassignmentInput.driverId,
    reassignmentInput.reason,
    dispatch,
  );
  assert.equal(reassigned.ok, true);

  const lifecycleRepository = {
    async findDeliveryForUpdate(id) {
      return id === dispatch.delivery.id ? dispatch.delivery : null;
    },
    async findActiveAssignmentForUpdate(id) {
      return dispatch.assignments.find(
        (assignment) =>
          assignment.deliveryId === id && assignment.endedAt === null,
      ) ?? null;
    },
    async updateDeliveryStatus(_id, status, deliveredAt) {
      dispatch.delivery.status = status;
      dispatch.delivery.deliveredAt = deliveredAt;
    },
    endAssignment: (...args) => dispatch.endAssignment(...args),
    async createStatusEvent(event) {
      dispatch.events.push({ type: "STATUS_CHANGED", ...event });
    },
    async createAssignmentEvent(event) {
      dispatch.events.push({ type: "ASSIGNMENT_CHANGED", ...event });
    },
  };
  const completed = await changeDeliveryStatus(
    "org-a",
    "dispatcher-1",
    "delivery-1",
    "IN_TRANSIT",
    "DELIVERED",
    "",
    lifecycleRepository,
  );

  assert.equal(completed.ok, true);
  assert.equal(dispatch.assignments.length, 2);
  assert.ok(dispatch.assignments.every((assignment) => assignment.endedAt));
  assert.match(dispatch.assignments[0].endReason, /Current truck unavailable/);
  assert.match(dispatch.events[0].note, /Reassigned from truck TR-1/);
  assert.ok(dispatch.events.some((event) => event.toStatus === "DELIVERED"));
});

test("serialized concurrent status updates reject a stale second transition", async () => {
  const repository = makeLifecycleRepository();
  let queue = Promise.resolve();
  const inTransaction = async (operation) => {
    let release;
    const predecessor = queue;
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await predecessor;
    try {
      return await operation();
    } finally {
      release();
    }
  };
  const attempt = (status) =>
    inTransaction(() =>
      changeDeliveryStatus(
        "org-a",
        "user-1",
        "delivery-lifecycle",
        "IN_TRANSIT",
        status,
        "",
        repository,
      ),
    );

  const results = await Promise.all([
    attempt("DELIVERED"),
    attempt("FAILED"),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(repository.events.filter((event) => event.type === "STATUS_CHANGED").length, 1);
  assert.ok(["DELIVERED", "FAILED"].includes(repository.delivery.status));
});

test("safe load updates validate input and leave operational fields unchanged", async () => {
  const formData = new FormData();
  formData.set("customerName", " Northwind Logistics ");
  formData.set("cargoDescription", "Temperature-controlled goods");
  const parsed = parseLoadUpdateInput(formData);
  assert.equal("error" in parsed, false);

  const load = {
    id: "load-1",
    reference: "LD-1",
    pickupAddress: "1 Warehouse Road",
    weightKg: "5000",
    customerName: "Old Customer",
    cargoDescription: null,
  };
  let updatedFields;
  const repository = {
    async findLoad(id) {
      return id === load.id ? { id: load.id } : null;
    },
    async updateLoad(_id, input) {
      updatedFields = input;
      Object.assign(load, input);
    },
  };
  const result = await updateLoadDetails("load-1", parsed.input, repository);

  assert.equal(result.ok, true);
  assert.deepEqual(updatedFields, {
    customerName: "Northwind Logistics",
    cargoDescription: "Temperature-controlled goods",
  });
  assert.equal(load.reference, "LD-1");
  assert.equal(load.pickupAddress, "1 Warehouse Road");
  assert.equal(load.weightKg, "5000");

  formData.set("customerName", "");
  assert.match(parseLoadUpdateInput(formData).error, /customer name/);
});

test("viewer role cannot change delivery status or edit load details", () => {
  assert.equal(
    authorizeFleetAccess(
      { organizationId: "org-a", role: "VIEWER" },
      "org-a",
      true,
    ),
    false,
  );
});

test("fleet write authorization rejects viewer role for reassignment", () => {
  assert.equal(
    authorizeFleetAccess(
      { organizationId: "org-a", role: "VIEWER" },
      "org-a",
      true,
    ),
    false,
  );
});

test("dashboard metrics reflect active fleet, delivery statuses, risks, and distinct active loads", () => {
  const metrics = getDashboardMetrics({
    trucks: [
      { id: "truck-1", status: "AVAILABLE", capacityKg: 10000 },
      { id: "truck-2", status: "MAINTENANCE", capacityKg: null },
      { id: "truck-3", status: "OUT_OF_SERVICE", capacityKg: null },
    ],
    drivers: [
      { status: "AVAILABLE" },
      { status: "ON_DUTY" },
      { status: "INACTIVE" },
    ],
    deliveries: [
      {
        id: "delivery-1",
        loadId: "load-1",
        status: "IN_TRANSIT",
        riskLevel: "HIGH",
        load: { reference: "LD-1", weightKg: 5000 },
      },
      {
        id: "delivery-2",
        loadId: "load-1",
        status: "PLANNED",
        riskLevel: "MEDIUM",
        load: { reference: "LD-1", weightKg: 5000 },
      },
      {
        id: "delivery-3",
        loadId: "load-2",
        status: "DELIVERED",
        riskLevel: "LOW",
        load: { reference: "LD-2", weightKg: null },
      },
      {
        id: "delivery-4",
        loadId: "load-3",
        status: "FAILED",
        riskLevel: "LOW",
        load: { reference: "LD-3", weightKg: null },
      },
    ],
    assignments: [
      { truckId: "truck-1", deliveryId: "delivery-1" },
      { truckId: "truck-1", deliveryId: "delivery-2" },
      { truckId: "truck-2", deliveryId: "delivery-3" },
    ],
  });

  assert.equal(metrics.activeDrivers, 2);
  assert.equal(metrics.activeLoads, 1);
  assert.equal(metrics.activeDeliveries.length, 2);
  assert.equal(metrics.activeAssignments.length, 2);
  assert.equal(metrics.availableTrucks, 1);
  assert.equal(metrics.maintenanceTrucks, 1);
  assert.equal(metrics.outOfServiceTrucks, 1);
  assert.equal(metrics.fleetAvailability, 33);
  assert.equal(metrics.deliveryStatusCounts.DELIVERED, 1);
  assert.equal(metrics.deliveryStatusCounts.FAILED, 1);
  assert.equal(metrics.activeRiskCounts.HIGH, 1);
  assert.equal(metrics.activeRiskCounts.MEDIUM, 1);
  assert.equal(metrics.activeRiskCounts.LOW, 0);
});

test("dashboard metrics represent an empty fleet without inventing an availability percentage", () => {
  const metrics = getDashboardMetrics({
    trucks: [],
    drivers: [],
    deliveries: [],
    assignments: [],
  });

  assert.equal(metrics.fleetAvailability, null);
  assert.equal(metrics.activeLoads, 0);
  assert.equal(metrics.activeDeliveries.length, 0);
});

test("truck capacity utilization is shown only for one active assignment with known load weight", () => {
  const deliveries = new Map([
    ["delivery-1", { load: { reference: "LD-1", weightKg: 7500 } }],
    ["delivery-2", { load: { reference: "LD-2", weightKg: null } }],
  ]);
  const oneAssignment = [{ truckId: "truck-1", deliveryId: "delivery-1" }];

  assert.equal(
    getTruckCapacityUtilizationPercent(
      { capacityKg: 10000 },
      oneAssignment,
      deliveries,
    ),
    75,
  );
  assert.equal(
    getTruckCapacityUtilizationPercent(
      { capacityKg: 10000 },
      [
        ...oneAssignment,
        { truckId: "truck-1", deliveryId: "delivery-2" },
      ],
      deliveries,
    ),
    null,
  );
  assert.equal(
    getTruckCapacityUtilizationPercent(
      { capacityKg: null },
      oneAssignment,
      deliveries,
    ),
    null,
  );
  assert.equal(
    getTruckCapacityUtilizationPercent(
      { capacityKg: 10000 },
      [{ truckId: "truck-1", deliveryId: "delivery-2" }],
      deliveries,
    ),
    null,
  );
});

test("a user with no memberships has no dashboard organization", () => {
  assert.equal(selectAccessibleOrganization([], "untrusted-org"), null);
});

test("an organization request can select only a membership-scoped organization", () => {
  const memberships = [{ id: "org-a" }, { id: "org-b" }];

  assert.equal(selectAccessibleOrganization(memberships, "org-b"), memberships[1]);
  assert.equal(
    selectAccessibleOrganization(memberships, "untrusted-org"),
    memberships[0],
  );
});

test("dashboard reads are skipped without a membership and scoped to an authorized organization", async () => {
  let queriedOrganizationId;
  const noMembership = await loadForAccessibleOrganization(
    [],
    "untrusted-org",
    async (organizationId) => {
      queriedOrganizationId = organizationId;
      return [];
    },
  );
  assert.equal(noMembership.organization, null);
  assert.equal(queriedOrganizationId, undefined);

  const memberships = [{ id: "org-a" }];
  const scoped = await loadForAccessibleOrganization(
    memberships,
    "untrusted-org",
    async (organizationId) => {
      queriedOrganizationId = organizationId;
      return { organizationId };
    },
  );
  assert.equal(scoped.organization, memberships[0]);
  assert.deepEqual(scoped.data, { organizationId: "org-a" });
  assert.equal(queriedOrganizationId, "org-a");
});

test("organization onboarding assigns OWNER once and is safe to retry", async () => {
  const users = new Map();
  const membershipRows = [];
  let nextOrganizationId = 0;
  let createdOrganizations = 0;
  const provisioner = {
    async findMembershipForUser(userId) {
      return users.get(userId) ?? null;
    },
    async createOrganization(name, slug) {
      createdOrganizations += 1;
      return { id: `org-${++nextOrganizationId}`, name, slug };
    },
    async createOwnerMembership(membership) {
      membershipRows.push(membership);
      users.set("user-1", {
        id: membership.organizationId,
        name: "Example Logistics",
      });
    },
  };

  const organization = await createOrganizationWithOwner(
    "user-1",
    "Example Logistics",
    provisioner,
  );
  const retriedOrganization = await createOrganizationWithOwner(
    "user-1",
    "A different submitted name",
    provisioner,
  );

  assert.equal(organization.id, retriedOrganization.id);
  assert.equal(organization.slug, "example-logistics-user-1");
  assert.equal(
    selectAccessibleOrganization([organization], organization.id),
    organization,
  );
  assert.deepEqual(membershipRows, [
    { organizationId: organization.id, userId: "user-1", role: "OWNER" },
  ]);
  assert.equal(createdOrganizations, 1);
});

test("fleet reads and writes require the requested organization's membership and a management role", () => {
  const membership = { organizationId: "org-a", role: "DISPATCHER" };

  assert.equal(authorizeFleetAccess(membership, "org-a"), true);
  assert.equal(authorizeFleetAccess(membership, "org-a", true), true);
  assert.equal(authorizeFleetAccess(membership, "org-b"), false);
  assert.equal(
    authorizeFleetAccess(
      { organizationId: "org-a", role: "VIEWER" },
      "org-a",
      true,
    ),
    false,
  );
  assert.equal(authorizeFleetAccess(null, "org-a"), false);
});

test("unit numbers are checked case-insensitively within the selected organization", () => {
  const trucks = [{ id: "truck-1", unitNumber: "TR-18" }];

  assert.equal(hasDuplicateUnitNumber(trucks, "tr-18"), true);
  assert.equal(hasDuplicateUnitNumber(trucks, "TR-18", "truck-1"), false);
  assert.equal(hasDuplicateUnitNumber(trucks, "TR-19"), false);
});

test("truck input is normalized and invalid VINs, capacities, and statuses are rejected", () => {
  const formData = new FormData();
  formData.set("unitNumber", "  tr-18 ");
  formData.set("vin", "1M8GDM9AXKP042788");
  formData.set("capacityKg", "12500.5");
  formData.set("status", "AVAILABLE");
  formData.set("currentLocation", " Hamburg ");

  assert.deepEqual(parseTruckInput(formData), {
    input: {
      unitNumber: "TR-18",
      vin: "1M8GDM9AXKP042788",
      capacityKg: "12500.5",
      status: "AVAILABLE",
      currentLocation: "Hamburg",
    },
  });

  formData.set("vin", "INVALID");
  assert.match(parseTruckInput(formData).error, /VIN/);
  formData.set("vin", "");
  formData.set("capacityKg", "0");
  assert.match(parseTruckInput(formData).error, /Capacity/);
  formData.set("capacityKg", "12500");
  formData.set("status", "UNAVAILABLE");
  assert.match(parseTruckInput(formData).error, /status/);

  const minimalForm = new FormData();
  minimalForm.set("unitNumber", "TR-19");
  minimalForm.set("status", "AVAILABLE");
  assert.equal(parseTruckInput(minimalForm).input.vin, null);
  assert.equal(parseTruckInput(minimalForm).input.capacityKg, null);
});

test("truck route IDs must be valid UUIDs before reaching a database lookup", () => {
  assert.equal(isUuid("018bcfe5-6800-7000-8000-000000000001"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});

function commandRisk(level, recommended = null) {
  return {
    status: level ? "ASSESSED" : "INSUFFICIENT_DATA",
    riskLevel: level,
    storedRiskLevel: "LOW",
    reasons: [level ? `${level} evidence` : "Insufficient operational evidence."],
    evidence: [],
    limitations: [],
    intervention: {
      required: level === "HIGH",
      action: level === "HIGH" ? "Review reassignment" : null,
      eligibleReassignmentCount: recommended ? 1 : 0,
      insufficientReassignmentDataCount: 0,
      recommended,
      recommendation: null,
    },
    reassignmentCandidates: recommended
      ? [{
          ...recommended,
          capacityUtilizationPercent: 75,
        }]
      : [],
  };
}

function commandDelivery({
  id,
  organizationId = "org-a",
  status = "IN_TRANSIT",
  reference = `DEL-${id}`,
  loadId = `load-${id}`,
  loadOrganizationId = organizationId,
}) {
  return {
    id,
    organizationId,
    loadId,
    reference,
    stopNumber: 1,
    status,
    riskLevel: "LOW",
    eta: null,
    destinationAddress: "1 Test Street",
    load: {
      organizationId: loadOrganizationId,
      reference: `LOAD-${id}`,
      customerName: `Customer ${id}`,
      weightKg: 500,
    },
  };
}

function commandCenterInput(overrides = {}) {
  const now = new Date("2025-01-01T12:00:00.000Z");
  return {
    organizationId: "org-a",
    now,
    filters: parseCommandCenterFilters({}),
    deliveries: [],
    assignments: [],
    events: [],
    analyses: [],
    ...overrides,
  };
}

test("command center prioritizes risk, includes approved recovery options, and aggregates events", () => {
  const high = commandDelivery({ id: "high" });
  const medium = commandDelivery({ id: "medium", status: "ASSIGNED" });
  const lowWithEvent = commandDelivery({ id: "low-event" });
  const low = commandDelivery({ id: "low", status: "PLANNED" });
  const recommended = {
    truckId: "truck-replacement",
    truckUnitNumber: "TR-31",
    driverId: "driver-replacement",
    driverName: "Asha Patel",
  };
  const event = {
    id: "event-low",
    organizationId: "org-a",
    deliveryId: lowWithEvent.id,
    type: "ASSIGNMENT_CHANGED",
    fromStatus: null,
    toStatus: null,
    note: "Reassigned by dispatcher",
    occurredAt: new Date("2025-01-01T11:30:00.000Z"),
  };
  const result = buildCommandCenter(commandCenterInput({
    deliveries: [low, medium, lowWithEvent, high],
    assignments: [{
      id: "assignment-high",
      organizationId: "org-a",
      deliveryId: high.id,
      endedAt: null,
      truck: {
        id: "truck-current",
        organizationId: "org-a",
        unitNumber: "TR-27",
      },
      driver: {
        id: "driver-current",
        organizationId: "org-a",
        name: "Jordan Lee",
      },
      delivery: { organizationId: "org-a" },
    }],
    events: [event],
    analyses: [
      { organizationId: "org-a", deliveryId: high.id, analysis: commandRisk("HIGH", recommended) },
      { organizationId: "org-a", deliveryId: medium.id, analysis: commandRisk("MEDIUM") },
      { organizationId: "org-a", deliveryId: lowWithEvent.id, analysis: commandRisk("LOW") },
      { organizationId: "org-a", deliveryId: low.id, analysis: commandRisk("LOW") },
    ],
  }));

  assert.deepEqual(
    result.items.map((item) => item.deliveryId),
    ["high", "medium", "low-event", "low"],
  );
  assert.equal(result.items[0].assignment.truckUnitNumber, "TR-27");
  assert.deepEqual(result.items[0].risk.intervention.recommended, recommended);
  assert.equal(result.items[2].requiresAttention, true);
  assert.equal(result.items[3].requiresAttention, false);
  assert.deepEqual(result.recentEvents.map((item) => item.id), ["event-low"]);
  assert.equal(result.summary.requiresAttention, 3);
  assert.equal(result.summary.activeAssignments, 1);
});

test("command center filters and event, assignment, and risk data stay organization-scoped", () => {
  const ownDelivery = commandDelivery({ id: "own" });
  const otherDelivery = commandDelivery({
    id: "other",
    organizationId: "org-b",
  });
  const uuidLoad = "018bcfe5-6800-7000-8000-000000000001";
  ownDelivery.loadId = uuidLoad;
  const filters = parseCommandCenterFilters({
    q: "Customer own",
    risk: "HIGH",
    status: "IN_TRANSIT",
    assignmentState: "UNASSIGNED",
    loadId: uuidLoad,
  });
  const result = buildCommandCenter(commandCenterInput({
    filters,
    deliveries: [ownDelivery, otherDelivery],
    assignments: [{
      id: "cross-tenant-assignment",
      organizationId: "org-b",
      deliveryId: ownDelivery.id,
      endedAt: null,
      truck: { id: "truck-b", organizationId: "org-b", unitNumber: "TR-B" },
      driver: { id: "driver-b", organizationId: "org-b", name: "Other Driver" },
      delivery: { organizationId: "org-b" },
    }],
    events: [{
      id: "cross-tenant-event",
      organizationId: "org-b",
      deliveryId: ownDelivery.id,
      type: "STATUS_CHANGED",
      fromStatus: "ASSIGNED",
      toStatus: "IN_TRANSIT",
      note: null,
      occurredAt: new Date("2025-01-01T11:30:00.000Z"),
    }],
    analyses: [
      { organizationId: "org-a", deliveryId: ownDelivery.id, analysis: commandRisk("HIGH") },
      { organizationId: "org-b", deliveryId: ownDelivery.id, analysis: commandRisk("LOW") },
      { organizationId: "org-b", deliveryId: otherDelivery.id, analysis: commandRisk("HIGH") },
    ],
  }));

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].deliveryId, "own");
  assert.equal(result.items[0].risk.riskLevel, "HIGH");
  assert.equal(result.items[0].assignment, null);
  assert.deepEqual(result.items[0].recentEvents, []);
  assert.deepEqual(result.recentEvents, []);

  const otherCustomer = buildCommandCenter(commandCenterInput({
    filters: parseCommandCenterFilters({ q: "Customer other" }),
    deliveries: [ownDelivery, otherDelivery],
    analyses: [
      { organizationId: "org-a", deliveryId: ownDelivery.id, analysis: commandRisk("HIGH") },
      { organizationId: "org-b", deliveryId: otherDelivery.id, analysis: commandRisk("HIGH") },
    ],
  }));
  assert.deepEqual(otherCustomer.items, []);
});

test("command center excludes completed work from the active queue and handles an empty tenant", () => {
  const delivered = commandDelivery({ id: "delivered", status: "DELIVERED" });
  const cancelled = commandDelivery({ id: "cancelled", status: "CANCELLED" });
  const failed = commandDelivery({ id: "failed", status: "FAILED" });
  const terminal = buildCommandCenter(commandCenterInput({
    deliveries: [delivered, cancelled, failed],
    analyses: [
      { organizationId: "org-a", deliveryId: delivered.id, analysis: commandRisk("LOW") },
      { organizationId: "org-a", deliveryId: cancelled.id, analysis: commandRisk("LOW") },
      { organizationId: "org-a", deliveryId: failed.id, analysis: commandRisk("HIGH") },
    ],
  }));

  assert.deepEqual(terminal.items.map((item) => item.deliveryId), ["failed"]);
  assert.equal(terminal.items[0].activeWork, false);
  assert.equal(terminal.summary.openDeliveries, 0);

  const empty = buildCommandCenter(commandCenterInput());
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.recentEvents, []);
  assert.deepEqual(empty.summary, {
    requiresAttention: 0,
    highRisk: 0,
    mediumRisk: 0,
    activeAssignments: 0,
    openDeliveries: 0,
  });
});

test("command center does not offer a reassignment without verified eligibility evidence", () => {
  const delivery = commandDelivery({ id: "uncertain" });
  const analysis = commandRisk("HIGH");
  analysis.intervention.insufficientReassignmentDataCount = 2;
  const result = buildCommandCenter(commandCenterInput({
    deliveries: [delivery],
    analyses: [{
      organizationId: "org-a",
      deliveryId: delivery.id,
      analysis,
    }],
  }));

  assert.equal(result.items[0].risk.intervention.recommended, null);
  assert.equal(
    result.items[0].risk.intervention.insufficientReassignmentDataCount,
    2,
  );
  assert.deepEqual(result.items[0].risk.reassignmentCandidates, []);
});

function chainDelivery(overrides = {}) {
  return {
    id: "delivery-1",
    reference: "DEL-101",
    stopNumber: 1,
    recipientName: null,
    status: "ASSIGNED",
    eta: null,
    deliveryWindowEnd: null,
    deliveredAt: null,
    ...overrides,
  };
}

test("delivery chain orders stops and flags attention and in-progress nodes", () => {
  const nodes = buildDeliveryChain({
    deliveries: [
      chainDelivery({ id: "d2", reference: "DEL-102", stopNumber: 2, status: "PLANNED" }),
      chainDelivery({ id: "d1", reference: "DEL-101", stopNumber: 1 }),
    ],
    loadCustomerName: "Acme Corp",
    riskByDeliveryId: new Map([
      ["d1", { riskLevel: "HIGH" }],
      ["d2", { riskLevel: "LOW" }],
    ]),
    activeAssignmentByDeliveryId: new Map([
      ["d1", { truckUnitNumber: "TRK-202", driverName: "Michael Brooks" }],
    ]),
    timezone: "UTC",
  });

  assert.deepEqual(nodes.map((node) => node.label), ["DEL-101", "DEL-102"]);
  assert.equal(nodes[0].attention, true);
  assert.equal(nodes[0].inProgress, true);
  assert.equal(nodes[0].truckLabel, "TRK-202 · Michael Brooks");
  assert.equal(nodes[0].customer, "Acme Corp");
  assert.equal(nodes[1].attention, false);
  assert.equal(nodes[1].inProgress, false);
  assert.equal(nodes[1].truckLabel, null);
});

test("delivery chain reports projected delay only when window and ETA exist", () => {
  const windowEnd = new Date("2026-11-20T18:00:00.000Z");
  const eta = new Date("2026-11-20T20:00:00.000Z");
  const [node] = buildDeliveryChain({
    deliveries: [
      chainDelivery({ eta, deliveryWindowEnd: windowEnd }),
      chainDelivery({ id: "d2", stopNumber: 2, eta }),
    ],
    loadCustomerName: "Acme Corp",
    riskByDeliveryId: new Map(),
    activeAssignmentByDeliveryId: new Map(),
    timezone: "UTC",
  });

  assert.match(node.projectedDelayLabel, /Projected 2h beyond scheduled window/);
  const [, noWindow] = buildDeliveryChain({
    deliveries: [chainDelivery({ id: "d1", eta }), chainDelivery({ id: "d2", stopNumber: 2, eta })],
    loadCustomerName: "Acme Corp",
    riskByDeliveryId: new Map(),
    activeAssignmentByDeliveryId: new Map(),
    timezone: "UTC",
  });
  assert.equal(noWindow.projectedDelayLabel, null);
});

test("recovery impact uses recorded assignments, events, and honest unavailable states", () => {
  const impact = buildRecoveryImpact({
    delivery: { status: "ASSIGNED", eta: null, deliveredAt: null },
    events: [
      {
        type: "ASSIGNMENT_CHANGED",
        toStatus: "ASSIGNED",
        note: "Assigned to truck TRK-101 and driver James Carter.",
        occurredAt: new Date("2026-11-17T16:32:00.000Z"),
      },
      {
        type: "ASSIGNMENT_CHANGED",
        toStatus: "ASSIGNED",
        note: "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: test",
        occurredAt: new Date("2026-11-17T16:33:00.000Z"),
      },
    ],
    assignments: [
      {
        truck: { unitNumber: "TRK-101" },
        driver: { name: "James Carter" },
        assignedAt: new Date("2026-11-17T16:32:00.000Z"),
        endedAt: new Date("2026-11-17T16:33:00.000Z"),
        endReason: "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: test",
      },
      {
        truck: { unitNumber: "TRK-202" },
        driver: { name: "Michael Brooks" },
        assignedAt: new Date("2026-11-17T16:33:00.000Z"),
        endedAt: null,
        endReason: null,
      },
    ],
    riskLevel: "LOW",
    timezone: "UTC",
  });

  assert.equal(impact.hasDisruption, false);
  assert.equal(impact.stages[0].lines[0], "Truck TRK-101 · James Carter");
  assert.match(impact.stages[2].lines[0], /Reassigned from truck TRK-101/);
  assert.equal(impact.stages[3].lines[0], "Truck TRK-202 · Michael Brooks");
  assert.match(impact.outcomeLabel, /ETA is not recorded/);
});

test("recovery impact flags disruption and measures completion against recorded ETA", () => {
  const eta = new Date("2026-11-18T10:00:00.000Z");
  const deliveredAt = new Date("2026-11-18T11:30:00.000Z");
  const impact = buildRecoveryImpact({
    delivery: { status: "DELIVERED", eta, deliveredAt },
    events: [
      {
        type: "STATUS_CHANGED",
        toStatus: "FAILED",
        note: "Delivery failed.",
        occurredAt: new Date("2026-11-18T09:00:00.000Z"),
      },
    ],
    assignments: [],
    riskLevel: "HIGH",
    timezone: "UTC",
  });

  assert.equal(impact.hasDisruption, true);
  assert.match(impact.stages[1].lines[0], /marked failed/);
  assert.equal(impact.stages[2].lines[0], "No recovery action recorded.");
  assert.match(impact.outcomeLabel, /1h 30m after the projected ETA/);
});

function impactDelivery(overrides = {}) {
  return {
    id: "d1",
    reference: "DEL-101",
    stopNumber: 1,
    recipientName: null,
    status: "ASSIGNED",
    eta: null,
    deliveryWindowEnd: null,
    deliveredAt: null,
    ...overrides,
  };
}

function impactAssignment(overrides = {}) {
  return {
    truckId: "truck-1",
    driverId: "driver-1",
    truck: { unitNumber: "TRK-101" },
    driver: { name: "James Carter" },
    assignedAt: new Date("2026-11-17T16:32:00.000Z"),
    endedAt: null,
    endReason: null,
    ...overrides,
  };
}

function impactInput(overrides = {}) {
  return {
    deliveries: [],
    loadCustomerName: "Acme Distribution",
    riskByDeliveryId: new Map(),
    assignmentsByDeliveryId: new Map(),
    eventsByDeliveryId: new Map(),
    timezone: "UTC",
    ...overrides,
  };
}

test("what happened reports recorded reassignment and honest empty state", () => {
  const deliveries = [
    impactDelivery({ id: "d1", reference: "DEL-101", stopNumber: 1 }),
    impactDelivery({ id: "d2", reference: "DEL-102", stopNumber: 2, status: "PLANNED" }),
  ];
  const assignments = new Map([
    [
      "d1",
      [
        impactAssignment({
          endedAt: new Date("2026-11-17T16:33:00.000Z"),
          endReason:
            "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: coverage",
        }),
        impactAssignment({
          truckId: "truck-2",
          driverId: "driver-2",
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:00.000Z"),
        }),
      ],
    ],
  ]);

  const result = buildWhatHappened(
    impactInput({ deliveries, assignmentsByDeliveryId: assignments }),
  );

  assert.equal(result.hasDisruption, true);
  assert.equal(result.statements.length, 1);
  assert.match(result.statements[0], /DEL-101 was reassigned from truck TRK-101/);
  assert.match(result.statements[0], /to truck TRK-202 · driver Michael Brooks/);
  assert.ok(!result.statements[0].includes("Reason:"));

  const empty = buildWhatHappened(impactInput({ deliveries }));
  assert.equal(empty.hasDisruption, false);
  assert.deepEqual(empty.statements, []);
});

test("what happened ignores automatic assignment ends and clean deliveries", () => {
  const deliveries = [
    impactDelivery({
      id: "d1",
      status: "DELIVERED",
      deliveredAt: new Date("2026-11-18T10:00:00.000Z"),
    }),
  ];
  const assignments = new Map([
    [
      "d1",
      [
        impactAssignment({
          endedAt: new Date("2026-11-18T10:00:00.000Z"),
          endReason: "Delivery status changed to DELIVERED.",
        }),
      ],
    ],
  ]);

  const result = buildWhatHappened(
    impactInput({ deliveries, assignmentsByDeliveryId: assignments }),
  );
  assert.equal(result.hasDisruption, false);
});

test("downstream impact marks later stops as projected and shares as current", () => {
  const deliveries = [
    impactDelivery({ id: "d1", reference: "DEL-101", stopNumber: 1 }),
    impactDelivery({
      id: "d2",
      reference: "DEL-102",
      stopNumber: 2,
      status: "ASSIGNED",
    }),
    impactDelivery({
      id: "d3",
      reference: "DEL-103",
      stopNumber: 3,
      status: "PLANNED",
    }),
  ];
  const assignments = new Map([
    [
      "d1",
      [
        impactAssignment({
          endedAt: new Date("2026-11-17T16:33:00.000Z"),
          endReason: "Assignment ended",
        }),
        impactAssignment({
          truckId: "truck-2",
          driverId: "driver-2",
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:00.000Z"),
        }),
      ],
    ],
    [
      "d2",
      [
        impactAssignment({
          truckId: "truck-2",
          driverId: "driver-2",
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
        }),
      ],
    ],
  ]);
  const risks = new Map([["d1", { riskLevel: "MEDIUM" }]]);

  const { entries } = buildDownstreamImpact(
    impactInput({
      deliveries,
      assignmentsByDeliveryId: assignments,
      riskByDeliveryId: risks,
    }),
  );

  assert.equal(entries.length, 2);
  const d2 = entries.find((entry) => entry.deliveryId === "d2");
  const d3 = entries.find((entry) => entry.deliveryId === "d3");
  assert.equal(d2.state, "current");
  assert.match(d2.reasons.join(" "), /Shares truck TRK-202/);
  assert.equal(d3.state, "projected");
  assert.match(d3.reasons[0], /Later stop on the same load route after DEL-101/);
});

test("downstream impact resolves terminal targets and ignores delivered sources", () => {
  const deliveredSource = [
    impactDelivery({
      id: "d1",
      reference: "DEL-101",
      stopNumber: 1,
      status: "DELIVERED",
      deliveredAt: new Date("2026-11-18T10:00:00.000Z"),
    }),
    impactDelivery({ id: "d2", reference: "DEL-102", stopNumber: 2 }),
  ];
  const sourceAssignments = new Map([
    [
      "d1",
      [
        impactAssignment({
          endedAt: new Date("2026-11-17T16:33:00.000Z"),
          endReason:
            "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: x",
        }),
      ],
    ],
  ]);
  const delivered = buildDownstreamImpact(
    impactInput({
      deliveries: deliveredSource,
      assignmentsByDeliveryId: sourceAssignments,
    }),
  );
  assert.equal(delivered.entries.length, 0);

  const failedSource = [
    impactDelivery({
      id: "d1",
      reference: "DEL-101",
      stopNumber: 1,
      status: "FAILED",
    }),
    impactDelivery({
      id: "d2",
      reference: "DEL-102",
      stopNumber: 2,
      status: "DELIVERED",
      deliveredAt: new Date("2026-11-18T10:00:00.000Z"),
    }),
    impactDelivery({ id: "d3", reference: "DEL-103", stopNumber: 3 }),
  ];
  const failedEvents = new Map([
    [
      "d1",
      [
        {
          type: "STATUS_CHANGED",
          toStatus: "FAILED",
          note: "Delivery marked failed.",
          occurredAt: new Date("2026-11-18T09:00:00.000Z"),
        },
      ],
    ],
  ]);
  const impacted = buildDownstreamImpact(
    impactInput({
      deliveries: failedSource,
      eventsByDeliveryId: failedEvents,
    }),
  );
  assert.equal(impacted.entries.length, 2);
  assert.equal(
    impacted.entries.find((entry) => entry.deliveryId === "d2").state,
    "resolved",
  );
  assert.equal(
    impacted.entries.find((entry) => entry.deliveryId === "d3").state,
    "projected",
  );
});

test("downstream impact ignores resolved historical reassignment on a healthy source", () => {
  const deliveries = [
    impactDelivery({ id: "d1", reference: "DEL-101", stopNumber: 1 }),
    impactDelivery({
      id: "d2",
      reference: "DEL-102",
      stopNumber: 2,
      status: "ASSIGNED",
    }),
  ];
  const assignments = new Map([
    [
      "d1",
      [
        impactAssignment({
          endedAt: new Date("2026-11-17T16:13:00.000Z"),
          endReason: "Assignment ended",
        }),
        impactAssignment({
          endedAt: new Date("2026-11-17T16:33:00.000Z"),
          endReason:
            "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment",
        }),
        impactAssignment({
          truckId: "truck-2",
          driverId: "driver-2",
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:00.000Z"),
        }),
      ],
    ],
    [
      "d2",
      [
        impactAssignment({
          truck: { unitNumber: "TRK-101" },
          driver: { name: "James Carter" },
        }),
      ],
    ],
  ]);
  const risks = new Map([
    ["d1", { riskLevel: "LOW" }],
    ["d2", { riskLevel: "LOW" }],
  ]);

  const whatHappened = buildWhatHappened(
    impactInput({
      deliveries,
      assignmentsByDeliveryId: assignments,
      riskByDeliveryId: risks,
    }),
  );
  assert.equal(whatHappened.hasDisruption, true);
  assert.equal(whatHappened.statements.length, 2);

  const { entries } = buildDownstreamImpact(
    impactInput({
      deliveries,
      assignmentsByDeliveryId: assignments,
      riskByDeliveryId: risks,
    }),
  );
  assert.equal(entries.length, 0);
});

test("recommendation explains only verified eligibility evidence", () => {
  const result = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "MAINTENANCE" },
    }),
  );
  const recommendation = result.intervention.recommendation;

  assert.equal(result.riskLevel, "HIGH");
  assert.ok(recommendation);
  assert.equal(recommendation.truckUnitNumber, "TR-2");
  assert.equal(recommendation.driverName, "Replacement Driver");
  assert.equal(recommendation.capacityUtilizationPercent, 42);
  assert.deepEqual(recommendation.alternatives, []);
  assert.ok(
    recommendation.reasons.some((reason) =>
      reason.includes("TR-2 is available"),
    ),
  );
  assert.ok(
    recommendation.reasons.some((reason) =>
      reason.includes("Replacement Driver is available"),
    ),
  );
  assert.ok(
    recommendation.reasons.some((reason) => reason.includes("capacity")),
  );
  assert.ok(
    recommendation.reasons.some((reason) =>
      reason.includes("No conflicting active assignment"),
    ),
  );
  assert.ok(
    recommendation.reasons.some((reason) =>
      reason.includes("only eligible"),
    ),
  );
});

test("recommendation ranks multiple eligible candidates and lists alternatives", () => {
  const result = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "MAINTENANCE" },
      input: {
        trucks: [
          {
            id: "truck-current-risk",
            organizationId: "org-a",
            unitNumber: "TR-1",
            status: "ON_ROUTE",
            deactivatedAt: null,
            capacityKg: 10000,
          },
          {
            id: "truck-a",
            organizationId: "org-a",
            unitNumber: "TR-A",
            status: "AVAILABLE",
            deactivatedAt: null,
            capacityKg: 12000,
          },
          {
            id: "truck-b",
            organizationId: "org-a",
            unitNumber: "TR-B",
            status: "AVAILABLE",
            deactivatedAt: null,
            capacityKg: 15000,
          },
        ],
        drivers: [
          {
            id: "driver-current-risk",
            organizationId: "org-a",
            name: "Current Driver",
            status: "AVAILABLE",
          },
          {
            id: "driver-a",
            organizationId: "org-a",
            name: "Driver A",
            status: "AVAILABLE",
          },
          {
            id: "driver-b",
            organizationId: "org-a",
            name: "Driver B",
            status: "ON_DUTY",
          },
        ],
      },
    }),
  );
  const recommendation = result.intervention.recommendation;

  assert.ok(recommendation);
  assert.equal(recommendation.truckUnitNumber, "TR-A");
  assert.equal(recommendation.driverName, "Driver A");
  assert.equal(recommendation.alternatives.length, 3);
  assert.ok(
    recommendation.reasons.some((reason) =>
      reason.includes("Highest-ranked of 4"),
    ),
  );
  assert.ok(
    recommendation.alternatives.every(
      (alternative) =>
        alternative.truckUnitNumber !== "TR-A" ||
        alternative.driverName !== "Driver A",
    ),
  );
});

test("recommendation reports on-duty drivers honestly and respects capacity", () => {
  const onDuty = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "MAINTENANCE" },
      replacementDriver: { status: "ON_DUTY" },
    }),
  );
  assert.ok(onDuty.intervention.recommendation);
  assert.ok(
    onDuty.intervention.recommendation.reasons.some((reason) =>
      reason.includes("Replacement Driver is on duty"),
    ),
  );

  const overweight = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      delivery: { weightKg: 15000 },
      replacementTruck: { capacityKg: 12000 },
    }),
  );
  assert.equal(overweight.intervention.recommendation, null);
  assert.equal(overweight.intervention.eligibleReassignmentCount, 0);
});

test("recommendation excludes conflicting and insufficient-data candidates", () => {
  const conflicted = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "MAINTENANCE" },
      activeAssignments: [
        {
          id: "other-load-truck",
          deliveryId: "delivery-other",
          loadId: "load-other",
          truckId: "truck-replacement-risk",
          driverId: "driver-other",
          endedAt: null,
        },
      ],
    }),
  );
  assert.equal(conflicted.intervention.recommendation, null);
  assert.equal(conflicted.intervention.eligibleReassignmentCount, 0);

  const unknownCapacity = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      currentTruck: { status: "MAINTENANCE" },
      replacementTruck: { capacityKg: null },
    }),
  );
  assert.equal(unknownCapacity.intervention.recommendation, null);
  assert.equal(
    unknownCapacity.intervention.insufficientReassignmentDataCount,
    1,
  );
});

test("historical reassignment alone does not alter the recommendation", () => {
  const withoutHistory = analyzeDeliveryRisk(makeDeliveryRiskInput());
  const withHistory = analyzeDeliveryRisk(
    makeDeliveryRiskInput({
      assignmentHistory: [
        {
          endedAt: new Date("2026-11-11T00:00:00.000Z"),
          endReason:
            "Reassigned from truck TR-0 / driver Old Driver to truck TR-1 / driver Current Driver. Reason: coverage",
        },
      ],
      events: [
        {
          type: "ASSIGNMENT_CHANGED",
          toStatus: "IN_TRANSIT",
          note:
            "Reassigned from truck TR-0 / driver Old Driver to truck TR-1 / driver Current Driver. Reason: coverage",
        },
      ],
    }),
  );

  assert.deepEqual(
    withHistory.intervention.recommendation,
    withoutHistory.intervention.recommendation,
  );
  assert.equal(withHistory.riskLevel, "LOW");
  assert.equal(withoutHistory.riskLevel, "LOW");
});

import { buildRecoveryResult } from "../src/dashboard/recovery-result.ts";

function recoveryAssignment(overrides = {}) {
  return {
    truck: { unitNumber: "TRK-101" },
    driver: { name: "James Carter" },
    assignedAt: new Date("2026-11-17T16:32:00.000Z"),
    endedAt: null,
    endReason: null,
    ...overrides,
  };
}

function recoveryDelivery(overrides = {}) {
  return {
    id: "d1",
    reference: "DEL-101",
    stopNumber: 1,
    status: "ASSIGNED",
    eta: null,
    ...overrides,
  };
}

function recoveryInput(overrides = {}) {
  return {
    delivery: recoveryDelivery(),
    assignments: [],
    events: [],
    riskLevel: "LOW",
    timezone: "UTC",
    ...overrides,
  };
}

test("recovery result reports before, action, and after from recorded history", () => {
  const result = buildRecoveryResult(
    recoveryInput({
      assignments: [
        recoveryAssignment({
          truck: { unitNumber: "TRK-202" },
          driver: { name: "James Carter" },
          assignedAt: new Date("2026-11-17T16:06:00.000Z"),
          endedAt: new Date("2026-11-17T16:13:00.000Z"),
          endReason: "Assignment ended",
        }),
        recoveryAssignment({
          truck: { unitNumber: "TRK-101" },
          driver: { name: "James Carter" },
          assignedAt: new Date("2026-11-17T16:32:00.000Z"),
          endedAt: new Date("2026-11-17T16:33:53.000Z"),
          endReason:
            "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment",
        }),
        recoveryAssignment({
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:53.000Z"),
        }),
      ],
      events: [
        {
          type: "STATUS_CHANGED",
          toStatus: "ASSIGNED",
          note: "Assigned to truck TRK-202 and driver James Carter.",
          occurredAt: new Date("2026-11-17T16:06:00.000Z"),
        },
      ],
    }),
  );

  assert.equal(result.hasRecovery, true);
  const recovery = result.recovery;
  assert.equal(recovery.before.truck, "TRK-101");
  assert.equal(recovery.before.driver, "James Carter");
  assert.equal(recovery.before.status, "ASSIGNED");
  assert.equal(recovery.before.etaLabel, null);
  assert.equal(recovery.action.fromLabel, "TRK-101 · James Carter");
  assert.equal(recovery.action.toLabel, "TRK-202 · Michael Brooks");
  assert.equal(recovery.dispatcherReason, "Dispatcher approved reassignment");
  assert.equal(recovery.after.truck, "TRK-202");
  assert.equal(recovery.after.driver, "Michael Brooks");
  assert.equal(recovery.after.status, "ASSIGNED");
  assert.equal(recovery.after.riskLabel, "low risk");
  assert.equal(recovery.after.hasActiveAssignment, true);
  assert.equal(recovery.outcome, "successful");
  assert.match(recovery.outcomeLabel, /operating normally/);

  const truckRow = recovery.comparison.find((row) => row.metric === "Truck");
  assert.deepEqual(truckRow, {
    metric: "Truck",
    before: "TRK-101",
    after: "TRK-202",
  });
  const riskRow = recovery.comparison.find((row) => row.metric === "Risk");
  assert.equal(riskRow.before, "Not recorded");
  assert.equal(riskRow.after, "low risk");
  assert.match(recovery.etaComparisonLabel, /unavailable/);
  assert.ok(
    recovery.limitations.some((item) => item.includes("Risk before")),
  );
});

test("recovery result does not label unresolved states as successful", () => {
  const baseAssignments = [
    recoveryAssignment({
      endedAt: new Date("2026-11-17T16:33:53.000Z"),
      endReason:
        "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: x",
    }),
    recoveryAssignment({
      truck: { unitNumber: "TRK-202" },
      driver: { name: "Michael Brooks" },
      assignedAt: new Date("2026-11-17T16:33:53.000Z"),
    }),
  ];

  const high = buildRecoveryResult(
    recoveryInput({
      assignments: baseAssignments,
      riskLevel: "HIGH",
    }),
  );
  assert.equal(high.recovery.outcome, "unresolved");

  const failed = buildRecoveryResult(
    recoveryInput({
      delivery: recoveryDelivery({ status: "FAILED" }),
      assignments: baseAssignments,
      riskLevel: "HIGH",
    }),
  );
  assert.equal(failed.recovery.outcome, "unresolved");

  const medium = buildRecoveryResult(
    recoveryInput({
      assignments: baseAssignments,
      riskLevel: "MEDIUM",
    }),
  );
  assert.equal(medium.recovery.outcome, "monitoring");

  const insufficient = buildRecoveryResult(
    recoveryInput({ riskLevel: null }),
  );
  assert.equal(insufficient.hasRecovery, false);
});

test("recovery result handles deliveries without recovery honestly", () => {
  const result = buildRecoveryResult(
    recoveryInput({
      assignments: [
        recoveryAssignment({
          endedAt: new Date("2026-11-17T16:13:00.000Z"),
          endReason: "Assignment ended",
        }),
      ],
    }),
  );
  assert.equal(result.hasRecovery, false);
  assert.equal(result.recovery, null);
});

import { buildMeasureImpact } from "../src/dashboard/measure-impact.ts";

function measureRecovery() {
  return buildRecoveryResult(
    recoveryInput({
      assignments: [
        recoveryAssignment({
          endedAt: new Date("2026-11-17T16:33:53.000Z"),
          endReason:
            "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment",
        }),
        recoveryAssignment({
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:53.000Z"),
        }),
      ],
    }),
  );
}

function measureDelivery(overrides = {}) {
  return {
    id: "d1",
    reference: "DEL-101",
    stopNumber: 1,
    status: "ASSIGNED",
    eta: null,
    deliveredAt: null,
    deliveryWindowStart: null,
    deliveryWindowEnd: null,
    ...overrides,
  };
}

function measureInput(overrides = {}) {
  return {
    recovery: measureRecovery(),
    delivery: measureDelivery(),
    downstreamEntries: [],
    beforeEta: null,
    mileage: null,
    fuel: null,
    labor: null,
    timezone: "UTC",
    ...overrides,
  };
}

function measureMetric(impact, key) {
  return impact.metrics.find((metric) => metric.key === key);
}

test("measure impact reports honest insufficient data without real inputs", () => {
  const impact = buildMeasureImpact(measureInput());
  assert.equal(impact.hasRecovery, true);
  for (const metric of impact.metrics) {
    assert.equal(metric.state, "insufficient", metric.key);
    assert.equal(metric.display, "Insufficient data");
    assert.ok(metric.evidence.length > 0, metric.key);
  }
});

test("measure impact calculates delay improvement and late avoidance from real timing", () => {
  const windowEnd = new Date("2026-11-17T18:00:00.000Z");
  const impact = buildMeasureImpact(
    measureInput({
      delivery: measureDelivery({
        eta: new Date("2026-11-17T18:15:00.000Z"),
        deliveryWindowEnd: windowEnd,
      }),
      beforeEta: new Date("2026-11-17T18:48:00.000Z"),
    }),
  );
  const delay = measureMetric(impact, "projectedDelayImprovement");
  assert.equal(delay.state, "estimated");
  assert.equal(delay.display, "33 min");
  assert.ok(delay.evidence.some((item) => item.includes("48")));

  const avoided = measureMetric(impact, "lateDeliveriesAvoided");
  assert.equal(avoided.state, "estimated");
  assert.equal(avoided.display, "0 deliveries");

  const onTime = buildMeasureImpact(
    measureInput({
      delivery: measureDelivery({
        eta: new Date("2026-11-17T17:30:00.000Z"),
        deliveryWindowEnd: windowEnd,
      }),
      beforeEta: new Date("2026-11-17T18:48:00.000Z"),
    }),
  );
  assert.equal(
    measureMetric(onTime, "lateDeliveriesAvoided").display,
    "1 delivery",
  );
});

test("measure impact does not invent delay or lateness without timing data", () => {
  const impact = buildMeasureImpact(
    measureInput({
      delivery: measureDelivery({
        eta: new Date("2026-11-17T18:15:00.000Z"),
        deliveryWindowEnd: new Date("2026-11-17T18:00:00.000Z"),
      }),
    }),
  );
  assert.equal(
    measureMetric(impact, "projectedDelayImprovement").state,
    "insufficient",
  );
  assert.equal(
    measureMetric(impact, "lateDeliveriesAvoided").state,
    "insufficient",
  );
});

test("measure impact computes mileage, fuel, and benefit only from recorded inputs", () => {
  const withMileage = buildMeasureImpact(
    measureInput({ mileage: { before: 120, after: 80, unit: "mi" } }),
  );
  const miles = measureMetric(withMileage, "avoidedMiles");
  assert.equal(miles.state, "estimated");
  assert.equal(miles.display, "40 mi");

  const withFuel = buildMeasureImpact(
    measureInput({
      mileage: { before: 120, after: 80, unit: "mi" },
      fuel: {
        consumptionPerMile: 0.2,
        pricePerUnit: 4,
        currency: "$",
        distanceDelta: 40,
      },
      labor: { ratePerHour: 30, currency: "$", minutesDelta: 60 },
    }),
  );
  const fuelMetric = measureMetric(withFuel, "fuelImpact");
  assert.equal(fuelMetric.state, "estimated");
  assert.equal(fuelMetric.display, "$32.00");
  const benefit = measureMetric(withFuel, "operationalBenefit");
  assert.equal(benefit.state, "estimated");
  assert.equal(benefit.display, "$62.00");
  assert.ok(benefit.evidence.some((item) => item.includes("Fuel")));
  assert.ok(benefit.evidence.some((item) => item.includes("Driver time")));

  const noFuel = buildMeasureImpact(
    measureInput({ mileage: { before: 120, after: 80, unit: "mi" } }),
  );
  assert.equal(measureMetric(noFuel, "fuelImpact").state, "insufficient");
  assert.equal(
    measureMetric(noFuel, "operationalBenefit").state,
    "insufficient",
  );
});

test("measure impact counts only attributed resolved downstream deliveries as protected", () => {
  const resolvedEntry = {
    deliveryId: "d2",
    label: "DEL-102",
    stopNumber: 2,
    customer: null,
    status: "DELIVERED",
    riskLevel: "LOW",
    truck: "TRK-101",
    driver: "James Carter",
    etaLabel: null,
    projectedDelayLabel: null,
    state: "resolved",
    reasons: ["Later stop on the same load route after DEL-101 (stop 1)."],
    sourceDeliveryIds: ["d1"],
  };
  const impact = buildMeasureImpact(
    measureInput({ downstreamEntries: [resolvedEntry] }),
  );
  const protectedMetric = measureMetric(impact, "deliveriesProtected");
  assert.equal(protectedMetric.state, "actual");
  assert.equal(protectedMetric.display, "1 downstream delivery");
  assert.ok(protectedMetric.evidence.length > 0);

  const impactedEntry = {
    ...resolvedEntry,
    status: "IN_TRANSIT",
    state: "current",
    riskLevel: "HIGH",
  };
  const unresolved = buildMeasureImpact(
    measureInput({ downstreamEntries: [impactedEntry] }),
  );
  assert.equal(
    measureMetric(unresolved, "deliveriesProtected").display,
    "0 downstream deliveries",
  );
});

test("measure impact does not treat risk change or reassignment alone as impact", () => {
  const noRecovery = buildRecoveryResult(
    recoveryInput({
      delivery: recoveryDelivery({ status: "ASSIGNED" }),
      riskLevel: "LOW",
    }),
  );
  const impact = buildMeasureImpact(
    measureInput({ recovery: noRecovery }),
  );
  assert.equal(impact.hasRecovery, false);
  for (const metric of impact.metrics) {
    assert.equal(metric.state, "insufficient", metric.key);
  }

  const withRiskOnly = buildMeasureImpact(
    measureInput({
      recovery: buildRecoveryResult(
        recoveryInput({
          assignments: [
            recoveryAssignment({
              endedAt: new Date("2026-11-17T16:33:53.000Z"),
              endReason:
                "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: x",
            }),
            recoveryAssignment({
              truck: { unitNumber: "TRK-202" },
              driver: { name: "Michael Brooks" },
              assignedAt: new Date("2026-11-17T16:33:53.000Z"),
            }),
          ],
          riskLevel: "LOW",
        }),
      ),
    }),
  );
  assert.equal(
    measureMetric(withRiskOnly, "lateDeliveriesAvoided").state,
    "insufficient",
  );
  assert.equal(
    measureMetric(withRiskOnly, "deliveriesProtected").state,
    "insufficient",
  );
});

import { buildRecoveryReport } from "../src/dashboard/recovery-report.ts";

function reportDelivery(overrides = {}) {
  return {
    id: "d1",
    reference: "DEL-101",
    stopNumber: 1,
    recipientName: "Acme Distribution",
    status: "ASSIGNED",
    eta: null,
    deliveredAt: null,
    deliveryWindowEnd: null,
    ...overrides,
  };
}

function reportAssignment(overrides = {}) {
  return {
    truckId: "t1",
    driverId: "dr1",
    truck: { unitNumber: "TRK-101" },
    driver: { name: "James Carter" },
    assignedAt: new Date("2026-11-17T16:32:00.000Z"),
    endedAt: new Date("2026-11-17T16:33:53.000Z"),
    endReason:
      "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment",
    ...overrides,
  };
}

function reportInput(overrides = {}) {
  const recoveryResult = buildRecoveryResult(
    recoveryInput({
      assignments: [
        reportAssignment(),
        reportAssignment({
          truckId: "t2",
          driverId: "dr2",
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:53.000Z"),
          endedAt: null,
          endReason: null,
        }),
      ],
      riskLevel: "LOW",
    }),
  );
  const measureImpact = buildMeasureImpact(
    measureInput({ recovery: recoveryResult }),
  );
  return {
    load: { reference: "LOAD-1001", customerName: "Acme Distribution" },
    delivery: reportDelivery(),
    timezone: "UTC",
    assignments: [
      reportAssignment(),
      reportAssignment({
        truckId: "t2",
        driverId: "dr2",
        truck: { unitNumber: "TRK-202" },
        driver: { name: "Michael Brooks" },
        assignedAt: new Date("2026-11-17T16:33:53.000Z"),
        endedAt: null,
        endReason: null,
      }),
    ],
    events: [],
    riskLevel: "LOW",
    currentRecommendation: null,
    recoveryResult,
    measureImpact,
    downstreamEntries: [],
    ...overrides,
  };
}

test("recovery report composes a real recovery into all sections", () => {
  const report = buildRecoveryReport(reportInput());
  assert.equal(report.hasRecovery, true);
  assert.equal(report.header.loadReference, "LOAD-1001");
  assert.equal(report.header.customerName, "Acme Distribution");
  assert.equal(report.header.deliveryLabel, "DEL-101");
  assert.equal(report.header.outcome, "successful");
  assert.ok(report.header.recoveryAtLabel);

  assert.ok(
    report.whatHappened.some((line) => line.includes("reassigned")),
  );
  assert.equal(report.downstream.hasAffected, false);

  assert.equal(report.recommendation.historical, "Not recorded");
  assert.equal(report.recommendation.current, null);

  assert.equal(report.action.fromLabel, "TRK-101 · James Carter");
  assert.equal(report.action.toLabel, "TRK-202 · Michael Brooks");
  assert.equal(
    report.action.dispatcherReason,
    "Dispatcher approved reassignment",
  );

  assert.equal(report.result.before.truck, "TRK-101");
  assert.equal(report.result.after.truck, "TRK-202");
  assert.equal(report.result.after.riskLabel, "low risk");
  assert.match(report.result.outcomeLabel, /operating normally/);

  assert.equal(report.impact.length, 7);
  assert.ok(
    report.impact.every((metric) => metric.state === "insufficient"),
  );

  assert.ok(report.summary.length >= 3);
  assert.ok(
    report.summary.some((line) => line.includes("TRK-101")),
  );
  assert.ok(
    report.summary.some((line) =>
      line.includes("insufficient"),
    ),
  );
  const allText = JSON.stringify(report);
  assert.ok(!allText.includes("saved $"));
  assert.ok(!allText.includes("fuel saved"));
});

test("recovery report does not fabricate a report without recovery", () => {
  const report = buildRecoveryReport(
    reportInput({
      recoveryResult: buildRecoveryResult(
        recoveryInput({ riskLevel: "LOW" }),
      ),
      measureImpact: buildMeasureImpact(
        measureInput({
          recovery: buildRecoveryResult(
            recoveryInput({ riskLevel: "LOW" }),
          ),
        }),
      ),
    }),
  );
  assert.equal(report.hasRecovery, false);
  assert.equal(report.header.outcome, null);
  assert.equal(report.action, null);
  assert.equal(report.result, null);
  assert.ok(
    report.summary.some((line) =>
      line.includes("No recovery action"),
    ),
  );
});

test("recovery report labels current recommendation without rewriting history", () => {
  const report = buildRecoveryReport(
    reportInput({
      currentRecommendation: {
        truckUnitNumber: "TRK-202",
        driverName: "Michael Brooks",
        reasons: ["Truck is available."],
      },
    }),
  );
  assert.equal(report.recommendation.historical, "Not recorded");
  assert.equal(
    report.recommendation.current.truckUnitNumber,
    "TRK-202",
  );
});

test("recovery report reports unresolved outcome truthfully", () => {
  const recoveryResult = buildRecoveryResult(
    recoveryInput({
      delivery: recoveryDelivery({ status: "FAILED" }),
      assignments: [
        reportAssignment(),
        reportAssignment({
          truckId: "t2",
          driverId: "dr2",
          truck: { unitNumber: "TRK-202" },
          driver: { name: "Michael Brooks" },
          assignedAt: new Date("2026-11-17T16:33:53.000Z"),
          endedAt: null,
          endReason: null,
        }),
      ],
      riskLevel: "HIGH",
    }),
  );
  const report = buildRecoveryReport(
    reportInput({
      recoveryResult,
      measureImpact: buildMeasureImpact(
        measureInput({ recovery: recoveryResult }),
      ),
      delivery: reportDelivery({ status: "FAILED" }),
      riskLevel: "HIGH",
    }),
  );
  assert.equal(report.header.outcome, "unresolved");
  assert.match(report.result.outcomeLabel, /unresolved/i);
});

import { buildAssignmentVehicleReport } from "../src/dashboard/assignment-report.ts";

function avAssignment(overrides = {}) {
  return {
    id: overrides.id ?? "a1",
    truckId: "t1",
    driverId: "dr1",
    assignedAt: new Date("2026-11-17T16:32:00.000Z"),
    endedAt: new Date("2026-11-17T16:33:53.000Z"),
    endReason:
      "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment",
    truck: {
      unitNumber: "TRK-101",
      vin: "1XKWD49X1EJ000001",
      capacityKg: 20000,
      status: "AVAILABLE",
    },
    driver: { name: "James Carter", status: "ON_DUTY" },
    ...overrides,
  };
}

function avDelivery(overrides = {}) {
  return { reference: "DEL-101", stopNumber: 1, ...overrides };
}

test("assignment report shows current, history, changes, and continuity", () => {
  const report = buildAssignmentVehicleReport({
    delivery: avDelivery(),
    timezone: "UTC",
    assignments: [
      avAssignment({
        id: "a0",
        truckId: "t0",
        driverId: "dr0",
        assignedAt: new Date("2026-11-17T16:06:00.000Z"),
        endedAt: new Date("2026-11-17T16:13:00.000Z"),
        endReason: "Assignment ended",
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "James Carter", status: "ON_DUTY" },
      }),
      avAssignment({ id: "a1" }),
      avAssignment({
        id: "a2",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-17T16:33:53.000Z"),
        endedAt: null,
        endReason: null,
        truck: {
          unitNumber: "TRK-202",
          vin: "2XKWD49X1EJ000002",
          capacityKg: 22000,
          status: "AVAILABLE",
        },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
  });

  assert.equal(report.hasAssignments, true);
  assert.equal(report.current.truck, "TRK-202");
  assert.equal(report.current.driver, "Michael Brooks");
  assert.equal(report.current.vinLabel, "2XKWD49X1EJ000002");
  assert.equal(report.current.capacityLabel, "22000 kg");
  assert.equal(report.current.truckStatusLabel, "available");

  assert.equal(report.history.length, 3);
  assert.equal(report.history[0].state, "ended");
  assert.equal(report.history[2].state, "current");
  assert.equal(report.history[1].endReason.includes("Reassigned"), true);

  assert.equal(report.changes.length, 2);
  assert.equal(report.changes[1].fromLabel, "TRK-101 · James Carter");
  assert.equal(report.changes[1].toLabel, "TRK-202 · Michael Brooks");
  assert.equal(report.changes[1].reason, "Dispatcher approved reassignment");
  assert.equal(report.changes[1].sameResources, false);

  assert.equal(report.continuity.kind, "both");
  assert.match(report.continuity.label, /both changed/);

  const events = report.timeline.map((entry) => entry.event);
  assert.ok(events.includes("Assigned — current"));
  assert.ok(events.includes("Reassigned"));
  assert.ok(events.includes("Assignment ended"));
});

test("assignment report handles single assignment and empty history honestly", () => {
  const single = buildAssignmentVehicleReport({
    delivery: avDelivery(),
    timezone: "UTC",
    assignments: [
      avAssignment({
        endedAt: null,
        endReason: null,
        truck: {
          unitNumber: "TRK-101",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
      }),
    ],
  });
  assert.equal(single.continuity.kind, "single");
  assert.equal(single.changes.length, 0);
  assert.equal(single.current.vinLabel, "Not recorded");
  assert.equal(single.current.capacityLabel, "Not recorded");

  const empty = buildAssignmentVehicleReport({
    delivery: avDelivery({ reference: "DEL-102", stopNumber: 2 }),
    timezone: "UTC",
    assignments: [],
  });
  assert.equal(empty.hasAssignments, false);
  assert.equal(empty.current, null);
  assert.equal(empty.continuity.kind, "none");
  assert.equal(empty.history.length, 0);
  assert.equal(empty.timeline.length, 0);
});

test("assignment report does not label reassignment as recovery or risk", () => {
  const report = buildAssignmentVehicleReport({
    delivery: avDelivery(),
    timezone: "UTC",
    assignments: [
      avAssignment({
        id: "a0",
        assignedAt: new Date("2026-11-17T16:06:00.000Z"),
        endedAt: new Date("2026-11-17T16:13:00.000Z"),
        endReason: "Assignment ended",
      }),
      avAssignment({ id: "a1" }),
      avAssignment({
        id: "a2",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-17T16:33:53.000Z"),
        endedAt: null,
        endReason: null,
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
  });
  const serialized = JSON.stringify(report).toLowerCase();
  assert.ok(!serialized.includes("recovery successful"));
  assert.ok(!serialized.includes("high risk"));
  assert.ok(!serialized.includes("recommend"));
  assert.ok(report.changes[0].fromLabel.includes("TRK-101"));
});

import {
  buildDailyOperationsSummary,
  operationalDayBounds,
} from "../src/dashboard/daily-summary.ts";

function dsAssignment(overrides = {}) {
  return {
    id: overrides.id ?? "a1",
    truckId: overrides.truckId ?? "t1",
    driverId: overrides.driverId ?? "dr1",
    assignedAt: overrides.assignedAt ?? new Date("2026-11-17T16:32:00.000Z"),
    endedAt: overrides.endedAt ?? null,
    endReason: overrides.endReason ?? null,
    truck: overrides.truck ?? {
      unitNumber: "TRK-101",
      vin: null,
      capacityKg: null,
      status: "AVAILABLE",
    },
    driver: overrides.driver ?? { name: "James Carter", status: "ON_DUTY" },
  };
}

function dsDelivery(overrides = {}) {
  const delivery = {
    id: overrides.id ?? "d1",
    loadId: overrides.loadId ?? "load-1",
    loadReference: overrides.loadReference ?? "LOAD-1001",
    customerName: overrides.customerName ?? "Acme Freight",
    reference: overrides.reference ?? "DEL-101",
    stopNumber: overrides.stopNumber ?? 1,
    recipientName: overrides.recipientName ?? null,
    status: overrides.status ?? "ASSIGNED",
    eta: overrides.eta ?? null,
    deliveredAt: overrides.deliveredAt ?? null,
    createdAt:
      "createdAt" in overrides
        ? overrides.createdAt
        : new Date("2026-11-17T15:00:00.000Z"),
    deliveryWindowStart: overrides.deliveryWindowStart ?? null,
    deliveryWindowEnd: overrides.deliveryWindowEnd ?? null,
  };
  return {
    delivery,
    assignments: overrides.assignments ?? [],
    events: overrides.events ?? [],
    riskLevel: overrides.riskLevel ?? "LOW",
    projectedDelay: overrides.projectedDelay ?? false,
    downstreamEntries: overrides.downstreamEntries ?? [],
  };
}

function dsSummary({ date = "2026-11-17", timezone = "UTC", deliveries = [] }) {
  return buildDailyOperationsSummary({ date, timezone, deliveries });
}

const reassignReason =
  "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment";

function recoveredPair(prefix) {
  return [
    dsAssignment({
      id: `${prefix}-old`,
      endedAt: new Date("2026-11-17T11:00:00.000Z"),
      endReason: reassignReason,
    }),
    dsAssignment({
      id: `${prefix}-new`,
      truckId: "t2",
      driverId: "dr2",
      assignedAt: new Date("2026-11-17T11:00:00.000Z"),
      endedAt: null,
      truck: {
        unitNumber: "TRK-202",
        vin: null,
        capacityKg: null,
        status: "AVAILABLE",
      },
      driver: { name: "Michael Brooks", status: "AVAILABLE" },
    }),
  ];
}

test("daily summary aggregates a populated day across multiple deliveries", () => {
  const recovered = dsDelivery({
    id: "d1",
    reference: "DEL-101",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T15:00:00.000Z"),
    assignments: [
      dsAssignment({
        id: "a0",
        truckId: "t0",
        driverId: "dr0",
        assignedAt: new Date("2026-11-17T16:06:00.000Z"),
        endedAt: new Date("2026-11-17T16:13:00.000Z"),
        endReason: "Assignment ended",
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "James Carter", status: "ON_DUTY" },
      }),
      dsAssignment({
        id: "a1",
        truckId: "t1",
        driverId: "dr1",
        assignedAt: new Date("2026-11-17T16:20:00.000Z"),
        endedAt: new Date("2026-11-17T16:33:53.000Z"),
        endReason: reassignReason,
      }),
      dsAssignment({
        id: "a2",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-17T16:33:53.000Z"),
        endedAt: null,
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
    events: [
      {
        type: "STATUS_CHANGED",
        toStatus: "ASSIGNED",
        note: null,
        occurredAt: new Date("2026-11-17T16:33:53.000Z"),
      },
    ],
  });
  const plain = dsDelivery({
    id: "d2",
    reference: "DEL-102",
    stopNumber: 2,
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
    assignments: [
      dsAssignment({
        id: "b0",
        assignedAt: new Date("2026-11-17T11:00:00.000Z"),
        endedAt: null,
      }),
    ],
  });

  const summary = dsSummary({ deliveries: [recovered, plain] });

  assert.equal(summary.scopeCount, 2);
  assert.equal(summary.snapshot.completed, 0);
  assert.equal(summary.snapshot.currentlyAssigned, 2);
  assert.equal(summary.snapshot.withRecoveryAction, 1);
  assert.equal(summary.snapshot.withoutRecoveryAction, 1);

  assert.equal(summary.riskSummary.low, 2);
  assert.equal(summary.riskSummary.high, 0);
  assert.equal(summary.riskSummary.medium, 0);

  assert.equal(summary.recovery.actionsExecuted, 1);
  assert.equal(summary.recovery.deliveriesWithRecovery, 1);
  assert.equal(summary.recovery.outcomes.successful, 1);
  assert.equal(summary.recovery.outcomes.monitoring, 0);
  assert.equal(summary.recovery.noAction, 1);

  assert.equal(summary.assignmentActivity.transitions, 2);
  assert.equal(summary.assignmentActivity.deliveriesWithChanges, 1);
  assert.equal(summary.assignmentActivity.truckAndDriverChanges, 2);
  assert.equal(summary.assignmentActivity.assignmentsCreated, 4);
  assert.equal(summary.assignmentActivity.unchanged, 1);

  assert.ok(
    summary.impact.metrics.every((metric) => metric.state === "insufficient"),
  );
  assert.ok(
    summary.impact.metrics.every(
      (metric) => metric.display === "Insufficient data",
    ),
  );

  const del101 = summary.deliveries.find((row) => row.label === "DEL-101");
  const del102 = summary.deliveries.find((row) => row.label === "DEL-102");
  assert.equal(del101.recoveryState, "successful");
  assert.equal(del101.currentAssignmentLabel, "TRK-202 · Michael Brooks");
  assert.equal(del102.recoveryState, "none");
  assert.equal(del102.impactState, "notApplicable");

  assert.match(summary.narrative, /2 deliveries were in scope/);
  assert.ok(
    summary.events.some((event) => event.kind === "Recovery reassignment"),
  );
});

test("daily summary respects the operational timezone day boundary", () => {
  const bounds = operationalDayBounds("2026-11-17", "America/New_York");
  assert.equal(bounds.start.toISOString(), "2026-11-17T05:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-11-18T05:00:00.000Z");

  const delivery = dsDelivery({
    id: "tz1",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    events: [
      {
        type: "EXCEPTION_REPORTED",
        toStatus: null,
        note: "Delay noted",
        occurredAt: new Date("2026-11-18T02:30:00.000Z"),
      },
    ],
  });

  const ny17 = dsSummary({
    date: "2026-11-17",
    timezone: "America/New_York",
    deliveries: [delivery],
  });
  const ny18 = dsSummary({
    date: "2026-11-18",
    timezone: "America/New_York",
    deliveries: [delivery],
  });
  const utc17 = dsSummary({
    date: "2026-11-17",
    timezone: "UTC",
    deliveries: [delivery],
  });
  const utc18 = dsSummary({
    date: "2026-11-18",
    timezone: "UTC",
    deliveries: [delivery],
  });

  assert.equal(ny17.scopeCount, 1);
  assert.equal(ny18.scopeCount, 0);
  assert.equal(utc17.scopeCount, 0);
  assert.equal(utc18.scopeCount, 1);
});

test("daily summary handles a delivery spanning multiple days", () => {
  const spanning = dsDelivery({
    id: "span1",
    reference: "DEL-200",
    status: "DELIVERED",
    createdAt: new Date("2026-11-16T09:00:00.000Z"),
    deliveredAt: new Date("2026-11-18T18:00:00.000Z"),
    events: [
      {
        type: "STATUS_CHANGED",
        toStatus: "DELIVERED",
        note: null,
        occurredAt: new Date("2026-11-18T18:00:00.000Z"),
      },
    ],
  });

  const day16 = dsSummary({ date: "2026-11-16", deliveries: [spanning] });
  const day17 = dsSummary({ date: "2026-11-17", deliveries: [spanning] });
  const day18 = dsSummary({ date: "2026-11-18", deliveries: [spanning] });

  assert.equal(day16.scopeCount, 1);
  assert.equal(day17.scopeCount, 0);
  assert.equal(day18.scopeCount, 1);
  assert.equal(day18.snapshot.completed, 1);
});

test("daily summary keeps current risk independent of reassignment history", () => {
  const reassignedLow = dsDelivery({
    id: "r1",
    reference: "DEL-R1",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
    assignments: [
      dsAssignment({
        id: "ra0",
        endedAt: new Date("2026-11-17T12:00:00.000Z"),
        endReason: reassignReason,
      }),
      dsAssignment({
        id: "ra1",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-17T12:00:00.000Z"),
        endedAt: null,
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
  });
  const high = dsDelivery({
    id: "r2",
    reference: "DEL-R2",
    status: "IN_TRANSIT",
    riskLevel: "HIGH",
    createdAt: new Date("2026-11-17T10:30:00.000Z"),
  });

  const summary = dsSummary({ deliveries: [reassignedLow, high] });
  assert.equal(summary.riskSummary.low, 1);
  assert.equal(summary.riskSummary.high, 1);
  assert.equal(summary.riskSummary.medium, 0);
  const row = summary.deliveries.find((item) => item.label === "DEL-R1");
  assert.equal(row.riskLevel, "LOW");
  assert.equal(row.recoveryState, "successful");
});

test("daily summary does not count historical assignment changes outside the day", () => {
  const delivery = dsDelivery({
    id: "hist1",
    reference: "DEL-H1",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-10T09:00:00.000Z"),
    assignments: [
      dsAssignment({
        id: "h0",
        assignedAt: new Date("2026-11-10T10:00:00.000Z"),
        endedAt: new Date("2026-11-10T12:00:00.000Z"),
        endReason: "Assignment ended",
      }),
      dsAssignment({
        id: "h1",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-10T12:00:00.000Z"),
        endedAt: null,
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
    events: [
      {
        type: "EXCEPTION_REPORTED",
        toStatus: null,
        note: "Noted",
        occurredAt: new Date("2026-11-17T09:00:00.000Z"),
      },
    ],
  });

  const summary = dsSummary({ date: "2026-11-17", deliveries: [delivery] });
  assert.equal(summary.scopeCount, 1);
  assert.equal(summary.assignmentActivity.transitions, 0);
  assert.equal(summary.assignmentActivity.assignmentsCreated, 0);
  assert.equal(summary.assignmentActivity.deliveriesWithChanges, 0);
  assert.equal(summary.assignmentActivity.unchanged, 1);
});

test("daily summary keeps recovery outcomes distinct and never assumes success", () => {
  const failed = dsDelivery({
    id: "f1",
    reference: "DEL-F1",
    status: "FAILED",
    riskLevel: "HIGH",
    createdAt: new Date("2026-11-17T08:00:00.000Z"),
    assignments: recoveredPair("f"),
  });
  const monitoring = dsDelivery({
    id: "m1",
    reference: "DEL-M1",
    status: "ASSIGNED",
    riskLevel: "MEDIUM",
    createdAt: new Date("2026-11-17T08:30:00.000Z"),
    assignments: recoveredPair("m"),
  });

  const summary = dsSummary({ deliveries: [failed, monitoring] });
  assert.equal(summary.recovery.outcomes.unresolved, 1);
  assert.equal(summary.recovery.outcomes.monitoring, 1);
  assert.equal(summary.recovery.outcomes.successful, 0);
  assert.equal(summary.recovery.deliveriesWithRecovery, 2);
});

test("daily summary aggregates only attributed impact and preserves insufficient states", () => {
  const protectedEntry = {
    deliveryId: "target-1",
    label: "DEL-105",
    stopNumber: 3,
    customer: null,
    status: "ASSIGNED",
    riskLevel: "LOW",
    truck: null,
    driver: null,
    etaLabel: null,
    projectedDelayLabel: null,
    state: "resolved",
    reasons: [],
    sourceDeliveryIds: ["d1"],
  };
  const unattributedEntry = {
    ...protectedEntry,
    deliveryId: "target-2",
    label: "DEL-106",
    sourceDeliveryIds: ["other-delivery"],
  };
  const recovered = dsDelivery({
    id: "d1",
    reference: "DEL-101",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
    downstreamEntries: [protectedEntry, unattributedEntry],
    assignments: recoveredPair("i"),
  });
  const recoveredNoEntries = dsDelivery({
    id: "d2",
    reference: "DEL-102",
    stopNumber: 2,
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T10:30:00.000Z"),
    assignments: recoveredPair("j"),
  });

  const summary = dsSummary({ deliveries: [recovered, recoveredNoEntries] });
  const protectedMetric = summary.impact.metrics.find(
    (metric) => metric.key === "deliveriesProtected",
  );
  assert.equal(protectedMetric.state, "actual");
  assert.equal(protectedMetric.display, "1 deliveries");
  assert.equal(
    protectedMetric.coverage,
    "1 of 2 recovered deliveries measurable.",
  );

  for (const key of [
    "lateDeliveriesAvoided",
    "projectedDelayImprovement",
    "avoidedMiles",
    "driverTimeImpact",
    "fuelImpact",
    "operationalBenefit",
  ]) {
    const metric = summary.impact.metrics.find((item) => item.key === key);
    assert.equal(metric.state, "insufficient", key);
    assert.equal(metric.display, "Insufficient data", key);
  }

  assert.equal(summary.downstreamAffected.length, 1);
  assert.equal(summary.downstreamAffected[0].label, "DEL-105");
});

test("daily summary contains no dispatcher feedback or manual scoring", () => {
  const delivery = dsDelivery({
    id: "nf1",
    status: "ASSIGNED",
    riskLevel: "LOW",
    assignments: recoveredPair("n"),
  });
  const summary = dsSummary({ deliveries: [delivery] });
  const serialized = JSON.stringify(summary).toLowerCase();
  for (const key of [
    '"feedback"',
    '"rating"',
    '"score"',
    '"comment"',
    '"review"',
  ]) {
    assert.ok(!serialized.includes(key), key);
  }
});

test("daily summary reports an honest empty-day state", () => {
  const old = dsDelivery({
    id: "old1",
    reference: "DEL-OLD",
    createdAt: new Date("2026-11-10T09:00:00.000Z"),
    deliveredAt: new Date("2026-11-10T18:00:00.000Z"),
    events: [
      {
        type: "STATUS_CHANGED",
        toStatus: "DELIVERED",
        note: null,
        occurredAt: new Date("2026-11-10T18:00:00.000Z"),
      },
    ],
  });
  const summary = dsSummary({ date: "2026-11-20", deliveries: [old] });
  assert.equal(summary.scopeCount, 0);
  assert.equal(summary.snapshot.completed, 0);
  assert.equal(summary.recovery.actionsExecuted, 0);
  assert.equal(summary.assignmentActivity.transitions, 0);
  assert.match(summary.narrative, /No deliveries with recorded activity/);
  assert.ok(summary.impact.metrics.every((m) => m.state === "insufficient"));
});

import {
  buildExecutiveReport,
  previousPeriodAnchor,
  resolvePeriodBounds,
} from "../src/dashboard/executive-report.ts";

test("executive report resolves weekly and monthly period bounds", () => {
  const week = resolvePeriodBounds("week", "2026-11-18", "UTC");
  assert.equal(week.startDate, "2026-11-16");
  assert.equal(week.endDateExclusive, "2026-11-23");
  assert.equal(week.label, "Week: Nov 16 – Nov 22, 2026");

  const month = resolvePeriodBounds("month", "2026-11", "UTC");
  assert.equal(month.startDate, "2026-11-01");
  assert.equal(month.endDateExclusive, "2026-12-01");
  assert.equal(month.label, "Month: November 2026");

  assert.equal(previousPeriodAnchor("week", "2026-11-18"), "2026-11-11");
  assert.equal(previousPeriodAnchor("month", "2026-11"), "2026-10");
  assert.equal(previousPeriodAnchor("month", "2026-01"), "2025-12");
});

test("executive report handles DST week boundaries in the operational timezone", () => {
  const bounds = resolvePeriodBounds("week", "2025-11-01", "America/New_York");
  assert.equal(bounds.startDate, "2025-10-27");
  assert.equal(bounds.endDateExclusive, "2025-11-03");
  assert.equal(bounds.start.toISOString(), "2025-10-27T04:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2025-11-03T05:00:00.000Z");
});

test("executive report aggregates a full week of activity", () => {
  const monday = dsDelivery({
    id: "w1",
    reference: "DEL-W1",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-16T09:00:00.000Z"),
    assignments: [
      dsAssignment({
        id: "w1a",
        endedAt: new Date("2026-11-16T10:00:00.000Z"),
        endReason:
          "Reassigned from truck TRK-101 / driver James Carter to truck TRK-202 / driver Michael Brooks. Reason: Dispatcher approved reassignment",
      }),
      dsAssignment({
        id: "w1b",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-16T10:00:00.000Z"),
        endedAt: null,
        truck: {
          unitNumber: "TRK-202",
          vin: null,
          capacityKg: null,
          status: "AVAILABLE",
        },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
  });
  const friday = dsDelivery({
    id: "w2",
    reference: "DEL-W2",
    stopNumber: 2,
    status: "IN_TRANSIT",
    riskLevel: "MEDIUM",
    createdAt: new Date("2026-11-20T09:00:00.000Z"),
    assignments: recoveredPair("w"),
  });
  const outside = dsDelivery({
    id: "w3",
    reference: "DEL-W3",
    stopNumber: 3,
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-24T09:00:00.000Z"),
  });

  const report = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [monday, friday, outside],
  });

  assert.equal(report.scopeCount, 2);
  assert.equal(report.periodLabel, "Week: Nov 16 – Nov 22, 2026");
  assert.equal(report.recovery.actionsExecuted, 2);
  assert.equal(report.recovery.outcomes.successful, 1);
  assert.equal(report.recovery.outcomes.monitoring, 1);
  assert.equal(report.riskSummary.medium, 1);
  assert.equal(report.riskSummary.low, 1);
  assert.equal(report.assignmentActivity.transitions, 2);
  assert.equal(report.assignmentActivity.deliveriesWithChanges, 2);
  assert.equal(report.assignmentActivity.assignmentsCreated, 4);
  assert.equal(report.deliveries.length, 2);
  assert.match(report.narrative, /2 deliveries in scope/);
});

test("executive report aggregates a full month", () => {
  const early = dsDelivery({
    id: "m1",
    reference: "DEL-M1",
    status: "DELIVERED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-02T09:00:00.000Z"),
    deliveredAt: new Date("2026-11-02T18:00:00.000Z"),
    events: [
      {
        type: "STATUS_CHANGED",
        toStatus: "DELIVERED",
        note: null,
        occurredAt: new Date("2026-11-02T18:00:00.000Z"),
      },
    ],
  });
  const late = dsDelivery({
    id: "m2",
    reference: "DEL-M2",
    stopNumber: 2,
    status: "FAILED",
    riskLevel: "HIGH",
    createdAt: new Date("2026-11-28T09:00:00.000Z"),
    assignments: recoveredPair("m"),
  });
  const december = dsDelivery({
    id: "m3",
    reference: "DEL-M3",
    stopNumber: 3,
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-12-01T09:00:00.000Z"),
  });

  const report = buildExecutiveReport({
    kind: "month",
    anchor: "2026-11",
    timezone: "UTC",
    deliveries: [early, late, december],
  });

  assert.equal(report.scopeCount, 2);
  assert.equal(report.snapshot.completed, 1);
  assert.equal(report.snapshot.failed, 1);
  assert.equal(report.recovery.outcomes.unresolved, 1);
  assert.equal(report.riskSummary.high, 1);
});

test("executive report respects operational timezone week boundaries", () => {
  const delivery = dsDelivery({
    id: "tz1",
    reference: "DEL-TZ",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    events: [
      {
        type: "EXCEPTION_REPORTED",
        toStatus: null,
        note: "Delay",
        occurredAt: new Date("2026-11-23T02:00:00.000Z"),
      },
    ],
  });

  const ny = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "America/New_York",
    deliveries: [delivery],
  });
  const utc = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [delivery],
  });

  assert.equal(ny.scopeCount, 1);
  assert.equal(utc.scopeCount, 0);
});

test("executive report compares against the previous equivalent period", () => {
  const currentWeek = dsDelivery({
    id: "c1",
    reference: "DEL-C1",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
  });
  const prevA = dsDelivery({
    id: "p1",
    reference: "DEL-P1",
    stopNumber: 2,
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-10T09:00:00.000Z"),
  });
  const prevB = dsDelivery({
    id: "p2",
    reference: "DEL-P2",
    stopNumber: 3,
    status: "DELIVERED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-11T09:00:00.000Z"),
    deliveredAt: new Date("2026-11-11T18:00:00.000Z"),
  });

  const report = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [currentWeek, prevA, prevB],
  });

  assert.equal(report.comparison.available, true);
  assert.equal(report.comparison.previousLabel, "Week: Nov 9 – Nov 15, 2026");
  const scopeRow = report.comparison.rows.find(
    (row) => row.label === "Deliveries in scope",
  );
  assert.equal(scopeRow.current, 1);
  assert.equal(scopeRow.previous, 2);
  assert.equal(scopeRow.delta, -1);
  const completed = report.comparison.rows.find(
    (row) => row.label === "No recovery action",
  );
  assert.ok(completed);
});

test("executive report handles an empty period honestly", () => {
  const report = buildExecutiveReport({
    kind: "month",
    anchor: "2030-01",
    timezone: "UTC",
    deliveries: [
      dsDelivery({
        id: "old",
        createdAt: new Date("2026-11-10T09:00:00.000Z"),
      }),
    ],
  });
  assert.equal(report.scopeCount, 0);
  assert.match(report.narrative, /No operational activity/);
  assert.equal(report.comparison.available, true);
});

test("executive report flags deliveries without timestamps as partial coverage", () => {
  const untimestamped = dsDelivery({
    id: "u1",
    reference: "DEL-U1",
    createdAt: null,
    assignments: [],
    events: [],
  });
  const normal = dsDelivery({
    id: "n1",
    reference: "DEL-N1",
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
  });
  const report = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [untimestamped, normal],
  });
  assert.equal(report.scopeCount, 1);
  assert.equal(report.recordsWithoutTimestamps, 1);
});

test("executive report preserves impact classification and never fabricates values", () => {
  const entry = {
    deliveryId: "t1",
    label: "DEL-T1",
    stopNumber: 2,
    customer: null,
    status: "ASSIGNED",
    riskLevel: "LOW",
    truck: null,
    driver: null,
    etaLabel: null,
    projectedDelayLabel: null,
    state: "resolved",
    reasons: [],
    sourceDeliveryIds: ["d1"],
  };
  const recovered = dsDelivery({
    id: "d1",
    reference: "DEL-101",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
    downstreamEntries: [entry],
    assignments: recoveredPair("x"),
  });
  const report = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [recovered],
  });
  const protectedMetric = report.impact.metrics.find(
    (metric) => metric.key === "deliveriesProtected",
  );
  assert.equal(protectedMetric.state, "actual");
  const fuel = report.impact.metrics.find(
    (metric) => metric.key === "fuelImpact",
  );
  assert.equal(fuel.state, "insufficient");
  assert.equal(fuel.display, "Insufficient data");
  const benefit = report.impact.metrics.find(
    (metric) => metric.key === "operationalBenefit",
  );
  assert.equal(benefit.state, "insufficient");
  assert.ok(!JSON.stringify(report.impact).includes("$"));
});

test("executive report contains no scoring, ranking, or dispatcher feedback", () => {
  const delivery = dsDelivery({
    id: "s1",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
    assignments: recoveredPair("s"),
  });
  const report = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [delivery],
  });
  const serialized = JSON.stringify(report).toLowerCase();
  for (const key of [
    '"feedback"',
    '"rating"',
    '"score"',
    '"rank"',
    '"comment"',
    '"best truck"',
    '"best driver"',
  ]) {
    assert.ok(!serialized.includes(key), key);
  }
  assert.ok(!serialized.includes("saved $"));
});

test("executive report scopes strictly to provided organization deliveries", () => {
  const mine = dsDelivery({
    id: "org-a-1",
    reference: "DEL-A1",
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
  });
  const report = buildExecutiveReport({
    kind: "week",
    anchor: "2026-11-18",
    timezone: "UTC",
    deliveries: [mine],
  });
  assert.equal(report.scopeCount, 1);
  assert.deepEqual(
    report.deliveries.map((row) => row.label),
    ["DEL-A1"],
  );
});

import { buildOperationalHistory } from "../src/dashboard/operational-history.ts";

const ohLoads = [
  {
    id: "load-1",
    reference: "LOAD-1001",
    createdAt: new Date("2026-11-17T14:00:00.000Z"),
  },
];

function ohHistory({ deliveries = [], loads = ohLoads, timezone = "UTC", filters = {} } = {}) {
  return buildOperationalHistory({ deliveries, loads, timezone, filters });
}

test("operational history emits factual entries for a recovered delivery", () => {
  const recovered = dsDelivery({
    id: "d1",
    reference: "DEL-101",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T15:00:00.000Z"),
    assignments: recoveredPair("h"),
    events: [
      {
        type: "STATUS_CHANGED",
        toStatus: "ASSIGNED",
        note: "Dispatcher approved reassignment",
        occurredAt: new Date("2026-11-17T17:00:00.000Z"),
      },
    ],
  });
  const history = ohHistory({ deliveries: [recovered] });
  const types = history.entries.map((entry) => entry.type);

  assert.ok(types.includes("LOAD_CREATED"));
  assert.ok(types.includes("DELIVERY_CREATED"));
  assert.ok(types.includes("ASSIGNMENT_CREATED"));
  assert.ok(types.includes("RECOVERY_ACTION"));
  assert.ok(types.includes("DELIVERY_EVENT"));
  assert.ok(types.includes("IMPACT_MEASURED"));

  const loadEntries = history.entries.filter(
    (entry) => entry.type === "LOAD_CREATED",
  );
  assert.equal(loadEntries.length, 1);

  const recovery = history.entries.find(
    (entry) => entry.type === "RECOVERY_ACTION",
  );
  assert.ok(recovery);
  assert.match(recovery.description, /Historical recommendation: Not recorded/);
  assert.equal(recovery.outcome, "successful");
  assert.match(recovery.description, /TRK-101 · James Carter → TRK-202 · Michael Brooks/);

  const impact = history.entries.find(
    (entry) => entry.type === "IMPACT_MEASURED",
  );
  assert.ok(impact);
  assert.ok(impact.impactMetrics.length > 0);
  assert.ok(
    impact.impactMetrics.every(
      (metric) =>
        metric.state === "actual" ||
        metric.state === "estimated" ||
        metric.state === "insufficient",
    ),
  );
});

test("operational history orders newest first with deterministic ties", () => {
  const a = dsDelivery({
    id: "d1",
    reference: "DEL-A",
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
    assignments: recoveredPair("a"),
  });
  const b = dsDelivery({
    id: "d2",
    reference: "DEL-B",
    stopNumber: 2,
    createdAt: new Date("2026-11-18T10:00:00.000Z"),
    assignments: recoveredPair("b"),
  });
  const desc = ohHistory({ deliveries: [a, b] });
  const asc = ohHistory({ deliveries: [a, b], filters: { order: "asc" } });

  const descTimes = desc.entries.map((entry) => entry.timestamp.getTime());
  assert.deepEqual(
    descTimes,
    [...descTimes].sort((x, y) => y - x),
  );
  const ascTimes = asc.entries.map((entry) => entry.timestamp.getTime());
  assert.deepEqual(
    ascTimes,
    [...ascTimes].sort((x, y) => x - y),
  );
  assert.notEqual(desc.entries[0].id, asc.entries[0].id);

  const idsDesc = desc.entries.map((entry) => entry.id);
  const idsAsc = asc.entries.map((entry) => entry.id);
  assert.equal(new Set(idsDesc).size, idsDesc.length);
  assert.equal(new Set(idsAsc).size, idsAsc.length);
});

test("operational history filters by date range in the operational timezone", () => {
  const early = dsDelivery({
    id: "d1",
    reference: "DEL-EARLY",
    createdAt: new Date("2026-11-16T15:00:00.000Z"),
    assignments: recoveredPair("e"),
  });
  const late = dsDelivery({
    id: "d2",
    reference: "DEL-LATE",
    stopNumber: 2,
    createdAt: new Date("2026-11-20T15:00:00.000Z"),
    assignments: recoveredPair("l"),
  });
  const history = ohHistory({
    deliveries: [early, late],
    timezone: "America/New_York",
    filters: { from: "2026-11-17", to: "2026-11-19" },
  });

  assert.ok(history.entries.length > 0);
  assert.ok(
    history.entries.every(
      (entry) =>
        entry.deliveryLabel !== "DEL-EARLY" ||
        entry.timestamp.getTime() >=
          new Date("2026-11-17T05:00:00.000Z").getTime(),
    ),
  );
  assert.ok(
    history.entries.every(
      (entry) =>
        entry.timestamp.getTime() < new Date("2026-11-20T05:00:00.000Z").getTime(),
    ),
  );
});

test("operational history filters by load, delivery, truck, driver, type, outcome, and search", () => {
  const recovered = dsDelivery({
    id: "d1",
    reference: "DEL-101",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T15:00:00.000Z"),
    assignments: recoveredPair("f"),
  });
  const plain = dsDelivery({
    id: "d2",
    reference: "DEL-102",
    stopNumber: 2,
    status: "ASSIGNED",
    riskLevel: "MEDIUM",
    createdAt: new Date("2026-11-17T16:00:00.000Z"),
    assignments: [
      dsAssignment({
        id: "p1",
        truckId: "t9",
        driverId: "dr9",
        truck: { unitNumber: "TRK-999", vin: null, capacityKg: null, status: "AVAILABLE" },
        driver: { name: "Sam Driver", status: "ON_DUTY" },
      }),
    ],
  });

  const byLoad = ohHistory({
    deliveries: [recovered, plain],
    filters: { loadId: "load-1" },
  });
  assert.ok(byLoad.entries.length > 0);

  const byDelivery = ohHistory({
    deliveries: [recovered, plain],
    filters: { deliveryId: "d2" },
  });
  assert.ok(byDelivery.entries.every((entry) => entry.deliveryId === "d2" || entry.type === "LOAD_CREATED"));

  const byTruck = ohHistory({
    deliveries: [recovered, plain],
    filters: { truckId: "t9" },
  });
  assert.ok(byTruck.entries.every((entry) => entry.truckId === "t9"));
  assert.ok(byTruck.entries.some((entry) => entry.truckLabel === "TRK-999"));

  const byDriver = ohHistory({
    deliveries: [recovered, plain],
    filters: { driverId: "dr9" },
  });
  assert.ok(byDriver.entries.every((entry) => entry.driverId === "dr9"));

  const byType = ohHistory({
    deliveries: [recovered, plain],
    filters: { type: "RECOVERY_ACTION" },
  });
  assert.ok(byType.entries.every((entry) => entry.type === "RECOVERY_ACTION"));
  assert.ok(byType.entries.length >= 1);

  const byOutcome = ohHistory({
    deliveries: [recovered, plain],
    filters: { outcome: "successful" },
  });
  assert.ok(byOutcome.entries.every((entry) => entry.outcome === "successful"));

  const bySearch = ohHistory({
    deliveries: [recovered, plain],
    filters: { q: "sam driver" },
  });
  assert.ok(bySearch.entries.length > 0);
  assert.ok(bySearch.entries.every((entry) => entry.driverLabel === "Sam Driver"));
});

test("operational history preserves historical assignment resources and never implies recovery success", () => {
  const reassignedOnly = dsDelivery({
    id: "d1",
    reference: "DEL-R",
    status: "FAILED",
    riskLevel: "HIGH",
    createdAt: new Date("2026-11-17T15:00:00.000Z"),
    assignments: recoveredPair("r"),
  });
  const history = ohHistory({ deliveries: [reassignedOnly] });
  const recovery = history.entries.find(
    (entry) => entry.type === "RECOVERY_ACTION",
  );
  assert.ok(recovery);
  assert.equal(recovery.outcome, "unresolved");

  const created = history.entries.find(
    (entry) => entry.type === "ASSIGNMENT_CREATED" && entry.truckLabel === "TRK-202",
  );
  assert.ok(created);

  const highRiskDelivery = dsDelivery({
    id: "d2",
    reference: "DEL-H",
    stopNumber: 2,
    status: "IN_TRANSIT",
    riskLevel: "HIGH",
    createdAt: new Date("2026-11-17T15:30:00.000Z"),
    assignments: [
      dsAssignment({
        id: "h1",
        endedAt: new Date("2026-11-17T16:00:00.000Z"),
        endReason: "Assignment ended",
      }),
      dsAssignment({
        id: "h2",
        truckId: "t2",
        driverId: "dr2",
        assignedAt: new Date("2026-11-17T16:00:00.000Z"),
        endedAt: null,
        truck: { unitNumber: "TRK-202", vin: null, capacityKg: null, status: "AVAILABLE" },
        driver: { name: "Michael Brooks", status: "AVAILABLE" },
      }),
    ],
  });
  const h2 = ohHistory({ deliveries: [highRiskDelivery] });
  assert.ok(
    !h2.entries.some(
      (entry) => entry.type === "RECOVERY_ACTION" && entry.deliveryId === "d2",
    ),
  );
  assert.ok(
    h2.entries.some(
      (entry) => entry.type === "ASSIGNMENT_ENDED" && entry.deliveryId === "d2",
    ),
  );
});

test("operational history has honest empty and filtered-empty states", () => {
  const history = ohHistory({ deliveries: [] });
  assert.equal(history.totalEntries, 0);
  assert.equal(history.entries.length, 0);

  const filtered = ohHistory({
    deliveries: [
      dsDelivery({
        id: "d1",
        reference: "DEL-1",
        createdAt: new Date("2026-11-17T15:00:00.000Z"),
      }),
    ],
    filters: { q: "no-such-thing" },
  });
  assert.equal(filtered.totalEntries > 0, true);
  assert.equal(filtered.entries.length, 0);
});

test("operational history contains no dispatcher feedback or scoring fields", () => {
  const recovered = dsDelivery({
    id: "d1",
    reference: "DEL-101",
    status: "ASSIGNED",
    riskLevel: "LOW",
    createdAt: new Date("2026-11-17T15:00:00.000Z"),
    assignments: recoveredPair("n"),
  });
  const history = ohHistory({ deliveries: [recovered] });
  const serialized = JSON.stringify(history);
  const banned = ["rating", "comment", "feedback", "score", "rank"];
  for (const key of Object.keys(history.entries[0] ?? {})) {
    assert.ok(!banned.includes(key.toLowerCase()));
  }
  assert.ok(!/dispatcherRating|manualScore|performanceScore/i.test(serialized));
});

function makeFeedbackRows() {
  return [];
}

function makeFeedbackRepository(rows) {
  return {
    async createFeedback(scope, input) {
      const record = {
        id: `feedback-${rows.length + 1}`,
        organizationId: scope.organizationId,
        userId: scope.userId,
        type: input.type,
        subject: input.subject,
        message: input.message,
        rating: input.rating,
        createdAt: new Date("2026-11-22T12:00:00.000Z"),
        updatedAt: new Date("2026-11-22T12:00:00.000Z"),
      };
      rows.push(record);
      return record;
    },
    async listFeedbackForUser(scope) {
      return rows.filter(
        (row) =>
          row.organizationId === scope.organizationId &&
          row.userId === scope.userId,
      );
    },
    async findFeedbackForUser(scope, feedbackId) {
      return (
        rows.find(
          (row) =>
            row.organizationId === scope.organizationId &&
            row.userId === scope.userId &&
            row.id === feedbackId,
        ) ?? null
      );
    },
  };
}

function feedbackForm(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

test("feedback submission creates a scoped record through the validated workflow", async () => {
  const rows = makeFeedbackRows();
  const repository = makeFeedbackRepository(rows);
  const form = feedbackForm({
    type: "FEATURE_REQUEST",
    subject: "Export loads to CSV",
    message: "It would help to export the load list for weekly reviews.",
    rating: "4",
  });
  const parsed = parseFeedbackInput(form);
  assert.equal("error" in parsed, false);

  const result = await submitFeedback(
    { userId: "user-1", organizationId: "org-a" },
    parsed.input,
    repository,
  );
  assert.deepEqual(result, { ok: true, value: { id: "feedback-1" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organizationId, "org-a");
  assert.equal(rows[0].userId, "user-1");
  assert.equal(rows[0].type, "FEATURE_REQUEST");
  assert.equal(rows[0].rating, 4);
});

test("feedback input requires type, subject, and message", () => {
  assert.ok("error" in parseFeedbackInput(feedbackForm({ subject: "x", message: "y" })));
  assert.ok("error" in parseFeedbackInput(feedbackForm({ type: "GENERAL_FEEDBACK", message: "y" })));
  assert.ok("error" in parseFeedbackInput(feedbackForm({ type: "GENERAL_FEEDBACK", subject: "x" })));
  assert.ok(
    "error" in
      parseFeedbackInput(
        feedbackForm({
          type: "GENERAL_FEEDBACK",
          subject: "x".repeat(201),
          message: "y",
        }),
      ),
  );
});

test("feedback rating is optional and bounded to 1 through 5", () => {
  const base = { type: "GENERAL_FEEDBACK", subject: "s", message: "m" };
  const unrated = parseFeedbackInput(feedbackForm(base));
  assert.equal("error" in unrated, false);
  assert.equal(unrated.input.rating, null);

  const rated = parseFeedbackInput(feedbackForm({ ...base, rating: "5" }));
  assert.equal("error" in rated, false);
  assert.equal(rated.input.rating, 5);

  for (const rating of ["0", "6", "2.5", "abc"]) {
    assert.ok(
      "error" in parseFeedbackInput(feedbackForm({ ...base, rating })),
      `rating ${rating} should be rejected`,
    );
  }
});

test("feedback type must be one of the supported categories", () => {
  assert.equal(
    "error" in
      parseFeedbackInput(
        feedbackForm({
          type: "SUPPORT_TICKET",
          subject: "s",
          message: "m",
        }),
      ),
    true,
  );
  for (const type of [
    "PRODUCT_SUGGESTION",
    "FEATURE_REQUEST",
    "UX_UI_FEEDBACK",
    "GENERAL_FEEDBACK",
  ]) {
    assert.equal(
      "error" in parseFeedbackInput(feedbackForm({ type, subject: "s", message: "m" })),
      false,
      `${type} should be accepted`,
    );
  }
});

test("feedback history returns only the requesting user's own records", async () => {
  const rows = makeFeedbackRows();
  const repository = makeFeedbackRepository(rows);
  const scopeA = { userId: "user-1", organizationId: "org-a" };
  const scopeB = { userId: "user-2", organizationId: "org-a" };

  await submitFeedback(scopeA, {
    type: "GENERAL_FEEDBACK",
    subject: "mine",
    message: "my feedback",
    rating: null,
  }, repository);
  await submitFeedback(scopeB, {
    type: "GENERAL_FEEDBACK",
    subject: "theirs",
    message: "their feedback",
    rating: null,
  }, repository);

  const mine = await listOwnFeedback(scopeA, repository);
  assert.equal(mine.ok, true);
  assert.equal(mine.value.length, 1);
  assert.equal(mine.value[0].subject, "mine");
});

test("feedback detail cannot be read across users or organizations", async () => {
  const rows = makeFeedbackRows();
  const repository = makeFeedbackRepository(rows);
  const owner = { userId: "user-1", organizationId: "org-a" };
  const otherUser = { userId: "user-2", organizationId: "org-a" };
  const otherOrg = { userId: "user-1", organizationId: "org-b" };

  const created = await submitFeedback(owner, {
    type: "GENERAL_FEEDBACK",
    subject: "private",
    message: "only mine",
    rating: null,
  }, repository);
  const id = created.value.id;

  const own = await getOwnFeedback(owner, id, repository);
  assert.equal(own.ok, true);
  assert.equal(own.value.subject, "private");

  const other = await getOwnFeedback(otherUser, id, repository);
  assert.equal(other.ok, true);
  assert.equal(other.value, null);

  const crossOrg = await getOwnFeedback(otherOrg, id, repository);
  assert.equal(crossOrg.ok, true);
  assert.equal(crossOrg.value, null);
});

test("feedback operations reject missing user or organization scope", async () => {
  const repository = makeFeedbackRepository(makeFeedbackRows());
  const emptyScope = { userId: "", organizationId: "" };

  const submitted = await submitFeedback(emptyScope, {
    type: "GENERAL_FEEDBACK",
    subject: "s",
    message: "m",
    rating: null,
  }, repository);
  assert.equal(submitted.ok, false);

  const listed = await listOwnFeedback(emptyScope, repository);
  assert.equal(listed.ok, false);

  const detail = await getOwnFeedback(emptyScope, "feedback-1", repository);
  assert.equal(detail.ok, false);
});

import {
  canAdministerOrganizationSettings,
  isSupportedTimeZone,
  parseOrganizationSettingsInput,
} from "../src/settings/organization-settings.ts";

test("organization settings input validates name and timezone", () => {
  const valid = parseOrganizationSettingsInput({
    name: "  Acme Freight  ",
    timezone: "America/Chicago",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.input.name, "Acme Freight");
  assert.equal(valid.input.timezone, "America/Chicago");

  for (const name of ["", "x", "a".repeat(101), 42, null]) {
    const result = parseOrganizationSettingsInput({
      name,
      timezone: "UTC",
    });
    assert.equal(result.ok, false);
  }

  for (const timezone of ["", "Mars/Olympus", "not-a-zone", 7, null]) {
    const result = parseOrganizationSettingsInput({
      name: "Acme Freight",
      timezone,
    });
    assert.equal(result.ok, false);
  }
});

test("organization settings timezone and admin role checks", () => {
  assert.equal(isSupportedTimeZone("UTC"), true);
  assert.equal(isSupportedTimeZone("Europe/London"), true);
  assert.equal(isSupportedTimeZone("Fake/Zone"), false);

  assert.equal(canAdministerOrganizationSettings("OWNER"), true);
  assert.equal(canAdministerOrganizationSettings("ADMIN"), true);
  assert.equal(canAdministerOrganizationSettings("DISPATCHER"), false);
  assert.equal(canAdministerOrganizationSettings("DRIVER"), false);
  assert.equal(canAdministerOrganizationSettings("VIEWER"), false);
  assert.equal(canAdministerOrganizationSettings(null), false);
});
