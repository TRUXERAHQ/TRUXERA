import { redirect } from "next/navigation";

// Billing & Plan lives in Settings — this route stays as a stable entry
// point for the navigation item.
export default function BillingPage() {
  redirect("/dashboard/settings");
}
