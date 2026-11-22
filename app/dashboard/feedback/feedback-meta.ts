import type { BadgeTone } from "../ui";

export function feedbackTypeLabel(type: string) {
  switch (type) {
    case "PRODUCT_SUGGESTION":
      return "Product suggestion";
    case "FEATURE_REQUEST":
      return "Feature request";
    case "UX_UI_FEEDBACK":
      return "UX / UI feedback";
    default:
      return "General feedback";
  }
}

export function feedbackTypeTone(type: string): BadgeTone {
  if (type === "FEATURE_REQUEST") return "info";
  if (type === "UX_UI_FEEDBACK") return "warning";
  return "neutral";
}

export function formatFeedbackDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}
