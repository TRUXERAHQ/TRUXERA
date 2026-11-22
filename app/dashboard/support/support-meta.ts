import type { BadgeTone } from "../ui";

export function supportStatusLabel(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "In Progress";
    case "WAITING_FOR_CUSTOMER":
      return "Waiting for Customer";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    default:
      return "Open";
  }
}

export function supportStatusTone(status: string): BadgeTone {
  if (status === "RESOLVED") return "success";
  if (status === "IN_PROGRESS" || status === "WAITING_FOR_CUSTOMER") {
    return "warning";
  }
  if (status === "OPEN") return "info";
  return "neutral";
}

export function supportPriorityLabel(priority: string) {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

export function supportPriorityTone(priority: string): BadgeTone {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "NORMAL") return "info";
  return "neutral";
}

export function supportCategoryLabel(category: string) {
  switch (category) {
    case "TECHNICAL_ISSUE":
      return "Technical Issue";
    case "DATA_ISSUE":
      return "Data Issue";
    case "ACCOUNT_ACCESS":
      return "Account & Access";
    case "FLEET_OPERATIONS":
      return "Fleet Operations";
    default:
      return "Other";
  }
}

export function supportRelatedKindLabel(kind: string) {
  switch (kind) {
    case "DELIVERY":
      return "Delivery";
    case "TRUCK":
      return "Truck";
    case "DRIVER":
      return "Driver";
    default:
      return "Load";
  }
}

export function formatSupportDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}
