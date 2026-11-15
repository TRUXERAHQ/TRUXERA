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
  assert.ok(result.reasons.some((reason) => reason.includes("reassignment history")));
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
