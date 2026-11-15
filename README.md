This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database

Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon PostgreSQL connection string. Keep `.env` private; it is ignored by Git.

Infer the existing database schema into Prisma's contract without modifying the database, then emit the typed contract:

```bash
npx prisma contract infer --output src/prisma/contract.prisma
npx prisma contract emit
```

## Authentication

TRUXERA uses Auth.js with Google OAuth and JWT-backed sessions. Google identities are matched to persistent records in the existing `User` model; no auth tables or database migration are needed.

Configure `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` in the private `.env` file or your deployment secret manager. Register `http://localhost:3000/api/auth/callback/google` as the local Google OAuth callback URL, and use the equivalent HTTPS callback URL for production. Never commit `.env` or print its values.

Authenticated users without memberships are directed to organization onboarding. Organization creation adds the creator with the existing `OWNER` role; dashboard reads are limited to organizations linked to the signed-in user through `Membership`.

## Fleet management

The organization-scoped truck register is available at `/dashboard/trucks`. Owners, admins, and dispatchers can add and update trucks, and archive or reactivate them without deleting operational records. Archiving is blocked while a truck has a current assignment.

The current `Truck` contract supports unit number, VIN, operational status, capacity in kilograms, current location, and the archive timestamp. License plate, vehicle type, and notes are not fields in the current contract and are therefore not collected.

## Drivers, loads, and dispatch

The organization-scoped workflow continues at `/dashboard/drivers`, `/dashboard/loads`, and `/dashboard/dispatch`. Owners, admins, and dispatchers can maintain driver records, create a load with one or more delivery stops, and assign planned deliveries to available trucks and drivers. Read access is limited to organization members.

Dispatch assignment changes are recorded as separate `DispatchAssignment` and `DeliveryEvent` rows. Ending an assignment retains its history; a later assignment creates a new row. New delivery stops use the contract defaults of `PLANNED` and `LOW`; the workflow does not calculate an ETA or predict risk.

Active deliveries can be reassigned by an owner, admin, or dispatcher. Recommendations are deterministic: known capacity fit ranks first, followed by truck availability, driver availability (AVAILABLE before ON_DUTY), fewer active stops for the same load, and stable truck/driver identifiers. An active assignment on another load is treated as a resource conflict because the schema has no route or time-window data to prove otherwise. Missing load weight or truck capacity is marked insufficient data and cannot be approved. Reassignment ends the prior assignment, creates a new assignment, and records an `ASSIGNMENT_CHANGED` event in the same transaction.

Delivery lifecycle changes are restricted to `ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED`, with `FAILED` allowed from `PICKED_UP` or `IN_TRANSIT` and `CANCELLED` allowed before pickup. Assignment creation owns the `PLANNED → ASSIGNED` transition. Completion, failure, and cancellation are terminal; terminal changes close any active assignment while preserving its row and append delivery/assignment events. Load editing is limited to customer and cargo description; reference, pickup, weight, and delivery stops remain unchanged after creation.

Delivery risk analysis is derived at read time and never writes the stored `riskLevel`. The existing enum supports only `LOW`, `MEDIUM`, and `HIGH`; no `CRITICAL` level is inferred. `HIGH` is raised by a stored HIGH value, failed delivery or failure event, inconsistent active assignment state, unavailable assigned truck/driver, insufficient known truck capacity, cross-load resource conflict, passed stored ETA on an incomplete delivery, or a recorded exception. `MEDIUM` is raised by a stored MEDIUM value, recorded reassignment, or multiple delivery-attempt events. `LOW` is used only when no elevated signal exists and required assignment/capacity evidence is available; otherwise the analysis reports insufficient data. Missing ETA is disclosed and ETA-based delay is not assessed. High-risk cases may show eligible alternatives from the deterministic reassignment engine, but reassignment still requires dispatcher approval. No GPS, traffic, weather, telematics, prediction confidence, or ML/LLM signals are generated.

## Dispatcher Command Center

The organization-scoped Dispatcher Command Center is available at `/dashboard/command-center`. It combines the existing delivery-risk analysis, active assignments, lifecycle state, and recent operational events into a prioritized queue, with filters for risk, status, assignment, truck, driver, load, attention, and delivery/load/customer search. Summary metrics and activity are derived from the selected organization's database records. A recommended alternative links back to the existing dispatch approval workflow; the command center never reassigns automatically.

Risk remains deterministic and evidence-backed, not an ML score or ETA prediction. The page does not create GPS, traffic, weather, telematics, or confidence data. Completed and cancelled deliveries are excluded from active work; failed deliveries remain visible for follow-up. No schema change or migration is required.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
