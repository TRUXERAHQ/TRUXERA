export type HelpSectionId =
  | "start-here"
  | "v1-operations"
  | "v2-connected-fleet"
  | "account-admin"
  | "troubleshooting";

export type HelpStatus = "v1" | "v2" | "coming-soon";

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "note"; text: string };

export type HelpChapter = {
  slug: string;
  section: HelpSectionId;
  title: string;
  summary: string;
  status: HelpStatus;
  blocks: HelpBlock[];
  action?: { label: string; href: string };
};

export type HelpSection = {
  id: HelpSectionId;
  title: string;
  description: string;
};

export const helpSections: HelpSection[] = [
  {
    id: "start-here",
    title: "Start Here",
    description:
      "Understand what TRUXERA is, how it works, and the ideas behind the platform.",
  },
  {
    id: "v1-operations",
    title: "V1 Fleet Operations",
    description:
      "Step-by-step guidance for every major fleet operations feature available today.",
  },
  {
    id: "v2-connected-fleet",
    title: "V2 Connected Fleet Intelligence",
    description:
      "Planned guidance for connected fleet data, integrations, and live operational signals.",
  },
  {
    id: "account-admin",
    title: "Account & Administration",
    description:
      "Organizations, roles, permissions, and account-level areas.",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description:
      "Common issues, data problems, access issues, and when to contact support.",
  },
];

const p = (text: string): HelpBlock => ({ type: "p", text });
const h3 = (text: string): HelpBlock => ({ type: "h3", text });
const steps = (items: string[]): HelpBlock => ({ type: "steps", items });
const list = (items: string[]): HelpBlock => ({ type: "list", items });
const note = (text: string): HelpBlock => ({ type: "note", text });

export const helpChapters: HelpChapter[] = [
  // ── Start Here ──────────────────────────────────────────────────────────
  {
    slug: "what-is-truxera",
    section: "start-here",
    title: "What is TRUXERA?",
    summary:
      "The core product idea: an intelligent fleet operations platform that detects risk, recommends recovery, and records what actually happened.",
    status: "v1",
    blocks: [
      p("TRUXERA is an intelligent fleet operations platform for trucking companies. It helps operations teams detect operational risk early, predict disruption, recommend concrete recovery actions, support execution of recovery decisions, measure the operational impact of those actions, and generate a clear operational record of what happened."),
      h3("The problem it addresses"),
      p("Fleet disruptions — a truck breakdown, a delayed delivery, a driver issue — rarely stay isolated. One affected delivery can put later stops, customer commitments, and available trucks and drivers under pressure. TRUXERA keeps the operational picture in one place so dispatchers can see what is happening, what is at risk, and what can be done about it."),
      h3("What TRUXERA is not"),
      list([
        "It is not a transport management system (TMS) and does not replace your existing dispatch or planning software.",
        "It does not invent ETAs, fuel figures, mileage, or savings — every value shown comes from data your team records.",
        "It does not execute recovery automatically. Recommendations require dispatcher review and approval.",
      ]),
      h3("The workflow"),
      p("Every TRUXERA workflow follows the same loop: Detect → Predict → Recommend → Recover → Measure Impact → Generate Summary. Each stage is covered in its own chapter in this section."),
    ],
  },
  {
    slug: "core-idea",
    section: "start-here",
    title: "The TRUXERA Core Idea",
    summary:
      "One continuous loop: detect risk, recommend recovery, measure the result, and keep a factual operational record.",
    status: "v1",
    blocks: [
      p("Most fleet tools show you the state of operations. TRUXERA is built around a tighter loop: it continuously evaluates recorded operational data, surfaces what needs attention, recommends a recovery path, records the decision a dispatcher actually took, and measures what changed afterward."),
      h3("Why the loop matters"),
      list([
        "Detection without recommendation leaves the dispatcher to figure out the fix alone.",
        "Recommendation without measurement leaves you unable to say whether recovery worked.",
        "An operational record without evidence turns into anecdote. TRUXERA keeps the factual chain: what was detected, what was recommended, what was executed, and what was measured.",
      ]),
      p("The result is a control center where every recommendation can be traced back to recorded data, and every recovery result can be inspected rather than assumed."),
    ],
  },
  {
    slug: "how-truxera-works",
    section: "start-here",
    title: "How TRUXERA Works",
    summary:
      "How recorded fleet data flows through detection, risk analysis, recommendations, and reporting.",
    status: "v1",
    blocks: [
      p("TRUXERA works from the operational records your team maintains: trucks, drivers, loads, deliveries, and assignment history. It does not collect telemetry on its own in V1 — the quality of TRUXERA's analysis depends on the quality of the records you keep."),
      h3("From records to insight"),
      steps([
        "Your team records fleet resources (trucks, drivers) and customer loads with their delivery stops.",
        "Deliveries are assigned to a truck and driver. Every assignment is recorded with timestamps.",
        "Delivery status updates (planned, picked up, in transit, delivered, failed, cancelled) are recorded as they happen.",
        "TRUXERA evaluates the recorded state of each delivery — status, timing signals, and assignment continuity — and assigns a risk level: LOW, MEDIUM, HIGH, or insufficient data.",
        "When risk or disruption is detected, TRUXERA can recommend an alternative truck and driver for reassignment.",
        "A dispatcher reviews and approves or declines the action. The decision and its reason are recorded.",
        "After execution, TRUXERA compares recorded before/after state and reports measured impact — only where the data supports it.",
        "Summaries and reports are generated from the same recorded history, so reports and the live view never disagree.",
      ]),
      note("Honest-data principle: where TRUXERA lacks the inputs to compute something — an ETA, a delay projection, an impact metric — it shows “Insufficient data” or “Not recorded” instead of estimating."),
    ],
  },
  {
    slug: "workflow",
    section: "start-here",
    title: "Detect → Predict → Recommend → Recover → Measure Impact → Generate Summary",
    summary:
      "The six-stage TRUXERA workflow and what each stage produces.",
    status: "v1",
    blocks: [
      p("The workflow is the backbone of the product. Each stage has a distinct output, and the stages are deliberately separate so that a recommendation is never mistaken for an executed action, and an executed action is never mistaken for a proven result."),
      h3("The six stages"),
      steps([
        "Detect — TRUXERA continuously evaluates recorded delivery state and flags deliveries that need attention: status changes, failed deliveries, and disruption signals.",
        "Predict — recorded signals are evaluated deterministically to produce a risk level (LOW, MEDIUM, HIGH) or an explicit “insufficient data” result. There are no black-box scores.",
        "Recommend — when a delivery is at risk, TRUXERA recommends a concrete recovery: an alternative available truck and driver, with the reasons behind the choice.",
        "Recover — a dispatcher reviews the recommendation and approves, modifies, or declines it. Approved reassignments execute through the normal assignment flow, with the reason recorded.",
        "Measure Impact — after a recovery action, TRUXERA compares recorded before/after state: assignment continuity, status, risk, ETA where recorded, and projected delay where supported.",
        "Generate Summary — Daily Summary, Executive Report, and Operational History compile the same recorded events into operational narratives and audit timelines.",
      ]),
      h3("Stage boundaries matter"),
      list([
        "A risk level is not a recommendation.",
        "A recommendation is not an executed recovery — nothing changes until a dispatcher acts.",
        "An executed reassignment is not automatically a successful recovery — the result is reported as successful, monitoring, unresolved, or insufficient data based on recorded evidence.",
        "Measured impact is only shown where the underlying data exists.",
      ]),
    ],
  },
  {
    slug: "risk-recommendations-recovery",
    section: "start-here",
    title: "Understanding Risk, Recommendations & Recovery",
    summary:
      "The precise meaning of TRUXERA's core terms — and what each one does and does not claim.",
    status: "v1",
    blocks: [
      h3("Risk"),
      p("Risk is TRUXERA's deterministic assessment of a delivery's current recorded state: LOW, MEDIUM, HIGH, or insufficient data. It is computed from recorded inputs — delivery status, assignment state, and timing signals your team enters. It is a statement about recorded evidence, not a prediction of the future."),
      h3("Recommendation"),
      p("A recommendation is TRUXERA's proposed recovery for an at-risk delivery: typically an alternative truck and driver pair that is available and compatible, plus the recorded reasons for the suggestion. A recommendation is advisory. It changes nothing until a dispatcher approves an action in Dispatch."),
      h3("Recovery action"),
      p("A recovery action is what actually happened: an assignment change executed by a dispatcher, with an optional recorded reason. TRUXERA records the before and after resources, the timestamp, and who acted."),
      h3("Recovery result"),
      p("The recovery result classifies what the recorded evidence shows after the action: successful, monitoring, unresolved, or insufficient data. “Recovery executed — monitoring” means the action ran but the recorded state does not yet confirm a final outcome. A reassignment alone never implies success."),
      h3("Measured impact"),
      p("Measured impact compares recorded before/after values for metrics the data supports — for example assignment continuity, delivery status, and risk level. Metrics without reliable inputs are shown as “Insufficient data” rather than estimated."),
    ],
  },
  {
    slug: "truxera-intelligence",
    section: "start-here",
    title: "TRUXERA Intelligence Explained",
    summary:
      "What “intelligence” means in TRUXERA today — deterministic, explainable, and honest about its limits.",
    status: "v1",
    blocks: [
      p("TRUXERA's intelligence is deliberately constrained. Every assessment traces back to recorded operational data and a documented, deterministic rule set. There are no opaque scores and no invented numbers."),
      h3("What intelligence does today"),
      list([
        "Evaluates delivery state against recorded signals to assign risk levels.",
        "Identifies affected downstream stops when a disruption is recorded.",
        "Recommends alternative trucks and drivers for at-risk deliveries, with reasons.",
        "Compares before/after recorded state to report recovery results and measurable impact.",
        "Composes operational summaries and history from recorded events only.",
      ]),
      h3("What intelligence does not do"),
      list([
        "It does not access live vehicle telemetry, GPS, or ELD data in V1 — those integrations are planned for V2.",
        "It does not predict ETAs it cannot support with recorded data.",
        "It does not act on its own — every operational change requires a dispatcher decision.",
        "It does not learn from or score individual drivers.",
      ]),
      note("As V2 connected-fleet integrations arrive, more signals (live position, ELD status, TMS events) will feed the same honest-evaluation pipeline — the workflow and its stage boundaries stay the same."),
    ],
  },

  // ── V1 Fleet Operations ────────────────────────────────────────────────
  {
    slug: "dashboard",
    section: "v1-operations",
    title: "Dashboard",
    summary: "The home view: KPIs, delivery status distribution, attention queue, fleet monitor, and recovery intelligence.",
    status: "v1",
    blocks: [
      p("The Dashboard is the first screen after sign-in. It gives an at-a-glance view of fleet operational health and links into every workflow area."),
      h3("What you see"),
      list([
        "KPI row — counts such as active assignments, open deliveries, and risk exposure, computed from recorded data.",
        "Delivery status rail — the current distribution of delivery states with a proportional status bar.",
        "Attention Required — deliveries currently flagged by risk level, ordered so critical items are visible first.",
        "Fleet Overview and Delivery Monitor — registered trucks and the deliveries currently in motion.",
        "TRUXERA Recovery Intelligence — the live pipeline state: how many deliveries are at each risk level and how many have eligible recovery options.",
      ]),
      h3("Typical workflow"),
      steps([
        "Open the Dashboard to see what needs attention right now.",
        "Use Attention Required or Delivery Monitor to jump into a specific delivery.",
        "Review the TRUXERA Recovery Intelligence panel to see how much of the fleet is at risk and how many recoveries are available.",
      ]),
      note("Every number on the Dashboard is computed from recorded operational data. If a metric cannot be computed, the UI says so rather than estimating."),
    ],
  },
  {
    slug: "command-center",
    section: "v1-operations",
    title: "Command Center",
    summary: "The operations control center: risk queue, statistics, and TRUXERA recommendations.",
    status: "v1",
    blocks: [
      p("Command Center is the dispatcher-focused view of operational risk. It prioritizes what needs attention and surfaces TRUXERA's recovery recommendations in context."),
      h3("What you see"),
      list([
        "Operational statistics — active assignments, open deliveries, and risk counts, each semantically colored (green healthy, amber attention, red critical).",
        "Attention queue — deliveries flagged MEDIUM or HIGH risk, with the recorded reasons for the flag and any data limitations.",
        "TRUXERA recommendation block — when a queued delivery has an eligible recovery, the recommended truck/driver and reasons are shown. This is a recommendation only; execution happens in Dispatch after approval.",
      ]),
      h3("Typical workflow"),
      steps([
        "Scan the attention queue from highest risk downward.",
        "Open a flagged delivery to review its detail page.",
        "If TRUXERA recommends a recovery, review the recommendation and reasons, then proceed to Dispatch to approve or decline.",
      ]),
    ],
  },
  {
    slug: "loads-deliveries",
    section: "v1-operations",
    title: "Loads & Deliveries",
    summary: "Creating loads, managing delivery stops, and reading the full delivery detail page.",
    status: "v1",
    blocks: [
      h3("Creating a load"),
      steps([
        "Go to Loads and choose New load (requires a fleet-management role: Owner, Admin, or Dispatcher).",
        "Enter the load reference, customer, pickup address, and optional cargo description and weight.",
        "Add one or more delivery stops — each needs a destination address; recipient and delivery reference are optional.",
        "Submit. The load and all its deliveries are created together; every stop begins as Planned with a Low risk level. No ETA is generated.",
      ]),
      h3("The load detail page"),
      list([
        "Load header — reference, customer, pickup, cargo, and weight.",
        "Delivery stops — each stop's status, risk, assignment, ETA (only if recorded), and projected delay where supported.",
        "Delivery Chain — the operational sequence of stops for the load.",
        "What Happened and Downstream Impact — recorded disruptions and the later stops they affect.",
        "TRUXERA Recommendation, Recovery Result, Measure Impact, and the Automatic Recovery Report — the recovery lifecycle for each delivery, where recorded.",
        "Assignment & Vehicle Report — truck/driver assignment history, continuity, and timeline for a delivery.",
        "Operational history — the factual event timeline for the delivery.",
      ]),
      h3("Editing a load"),
      p("Load reference, pickup details, weight, and delivery stops are fixed after creation because they affect operational planning and assignment history. Customer name and cargo description can be edited from the load's edit page."),
    ],
  },
  {
    slug: "dispatch-assignment",
    section: "v1-operations",
    title: "Dispatch & Assignment",
    summary: "Assigning trucks and drivers to deliveries and approving recovery reassignments.",
    status: "v1",
    blocks: [
      p("Dispatch is the workspace where deliveries get their truck and driver — both for first assignment and for approved recovery reassignments."),
      h3("Making an assignment"),
      steps([
        "Open Dispatch and select an unassigned or flagged delivery.",
        "Review the current assignment (if any), the delivery's risk state, and TRUXERA's recommendation when present.",
        "Choose an available truck and driver, optionally record a reason, and approve the assignment.",
        "The assignment is recorded with a timestamp; it appears in the delivery's assignment history immediately.",
      ]),
      h3("Approving a recovery"),
      steps([
        "When TRUXERA recommends a recovery for an at-risk delivery, the recommendation appears in Dispatch with its reasons.",
        "Review the recommended truck and driver and the recorded rationale.",
        "Approve the reassignment — or decline it. Declining changes nothing; the delivery keeps its current assignment.",
        "If you approve, you may record why the reassignment is happening; the reason is preserved in history.",
      ]),
      h3("Ending an assignment"),
      p("Assignments can be ended when a delivery completes or the resource pair is no longer valid. Ending an assignment is a recorded operational event — it is not itself a recovery outcome."),
      note("Dispatch actions require a fleet-management role (Owner, Admin, or Dispatcher). Read-only roles can view but not change assignments."),
    ],
  },
  {
    slug: "fleet",
    section: "v1-operations",
    title: "Fleet — Trucks",
    summary: "Registering trucks, viewing status and capacity, and managing the active fleet.",
    status: "v1",
    blocks: [
      h3("The Fleet list"),
      list([
        "Each truck card shows unit number, status badge, capacity, current location, assigned driver, current load, and — when a single active assignment exists — a factual capacity-utilization bar.",
        "Available and healthy states are visually distinct from attention and out-of-service states.",
      ]),
      h3("Adding a truck"),
      steps([
        "Go to Fleet → New truck (Owner, Admin, or Dispatcher only).",
        "Enter unit number (must be unique in the organization), VIN, capacity in kg, operational status, and optional current location.",
        "Save. The truck becomes available for assignment according to its status.",
      ]),
      h3("Truck details & lifecycle"),
      list([
        "The truck detail page shows recorded details and the current assignment.",
        "Trucks can be edited by fleet managers; unit numbers must remain unique.",
        "A truck can be removed from the active fleet (archived). Its records and assignment history are preserved; it can be returned to the active fleet later.",
      ]),
      note("TRUXERA does not track live vehicle position or diagnostics in V1. Current location is a manually recorded field."),
    ],
  },
  {
    slug: "drivers",
    section: "v1-operations",
    title: "Drivers",
    summary: "Managing driver records, statuses, and viewing current assignments.",
    status: "v1",
    blocks: [
      h3("The Drivers list"),
      p("Each driver card shows name, license number, status badge, phone, and availability state. Statuses such as on duty, off duty, on leave, and out of service are visually distinct."),
      h3("Adding a driver"),
      steps([
        "Go to Drivers → New driver (Owner, Admin, or Dispatcher only).",
        "Enter name, phone, license number, and status.",
        "Save. The driver becomes available for assignment according to status.",
      ]),
      h3("Driver details"),
      list([
        "The driver detail page shows recorded contact and license information plus current assignments.",
        "Driver records can be edited by fleet managers.",
        "Assignment history for a driver is visible through delivery assignment records.",
      ]),
      note("TRUXERA does not track hours-of-service or duty clocks in V1. Driver status is a recorded field, not a live signal."),
    ],
  },
  {
    slug: "risk-disruption",
    section: "v1-operations",
    title: "Risk & Disruption",
    summary: "How TRUXERA detects risk and disruption, and what the risk levels mean.",
    status: "v1",
    blocks: [
      p("Risk and disruption detection is the Detect and Predict stages of the workflow, computed deterministically from recorded delivery data."),
      h3("Risk levels"),
      list([
        "LOW (green) — the delivery's recorded state is healthy.",
        "MEDIUM (amber) — the delivery needs monitoring or has an attention signal.",
        "HIGH (red) — the delivery has a critical recorded signal and should be reviewed.",
        "Insufficient data — TRUXERA lacks the recorded inputs needed to assess risk. This is an honest state, not a hidden LOW.",
      ]),
      h3("Disruption signals"),
      list([
        "Delivery status changes — failed, cancelled, or stalled states recorded by your team.",
        "Assignment changes — ended or replaced assignments recorded in history.",
        "Projected delay — shown only where recorded timing data supports it.",
        "Downstream impact — later stops on the same load that are affected or potentially affected by a recorded disruption.",
      ]),
      note("Risk is evaluated from what your team records. TRUXERA does not infer delays, ETAs, or positions that were never entered."),
    ],
  },
  {
    slug: "recovery-workflow",
    section: "v1-operations",
    title: "Recovery Workflow",
    summary: "How a TRUXERA recommendation becomes an executed, recorded recovery action.",
    status: "v1",
    blocks: [
      p("The recovery workflow is the Recommend → Recover stages: TRUXERA proposes, a dispatcher decides, and the decision is recorded."),
      h3("End to end"),
      steps([
        "TRUXERA detects a delivery that needs attention and evaluates eligible recovery options from currently available trucks and drivers.",
        "A recommendation appears — the proposed truck/driver pair plus the recorded reasons (availability, status, compatibility).",
        "The dispatcher reviews the recommendation in Command Center or Dispatch, alongside the delivery's current risk and assignment state.",
        "The dispatcher approves the reassignment (optionally with a reason), makes a different assignment, or declines.",
        "The executed change is recorded as an assignment event with timestamp, before/after resources, and reason.",
        "TRUXERA then evaluates the recovery result from recorded state — successful, monitoring, unresolved, or insufficient data.",
      ]),
      h3("What approval does and does not mean"),
      list([
        "Approval executes a reassignment — it does not guarantee the delivery will succeed.",
        "The recovery result is determined afterward from recorded evidence, not assumed at approval time.",
        "Declining a recommendation leaves the delivery and its assignment unchanged.",
      ]),
    ],
  },
  {
    slug: "recovery-results",
    section: "v1-operations",
    title: "Recovery Results",
    summary: "How TRUXERA classifies what happened after a recovery action.",
    status: "v1",
    blocks: [
      p("After a recovery action, TRUXERA reports a Recovery Result on the delivery's detail page — a factual classification derived from recorded before/after state."),
      h3("The four outcomes"),
      list([
        "Successful — recorded evidence supports that the recovery resolved the disruption.",
        "Monitoring — the action executed but recorded state does not yet confirm a final outcome. This is a normal intermediate state.",
        "Unresolved — recorded evidence shows the disruption persists or the delivery failed.",
        "Insufficient data — there is not enough recorded evidence to classify the outcome.",
      ]),
      h3("Reading a result"),
      list([
        "The result panel shows before recovery, the recovery action (from → to, timestamp, dispatcher reason), and after recovery.",
        "A comparison table shows recorded before/after values for supported metrics.",
        "Limitations are listed explicitly so you know what the classification cannot claim.",
      ]),
      note("A recovery action being executed is never, by itself, displayed as a successful recovery. The outcome badge reflects recorded evidence only."),
    ],
  },
  {
    slug: "measure-impact",
    section: "v1-operations",
    title: "Measure Impact",
    summary: "How TRUXERA measures the operational impact of a recovery — and stays honest when data is missing.",
    status: "v1",
    blocks: [
      p("Measure Impact compares recorded state before and after a recovery action, metric by metric. It only reports what the data supports."),
      h3("How it works"),
      steps([
        "TRUXERA identifies the recovery boundary — the recorded moment the reassignment executed.",
        "For each supported metric, it compares the recorded before value with the recorded after value.",
        "Each metric is labeled Actual, Estimated, or Insufficient data, with expandable evidence showing which records were used.",
        "If no recovery action exists for the delivery, the panel explains that there is no before/after boundary to measure.",
      ]),
      h3("Honest by design"),
      list([
        "Metrics without reliable inputs show “Insufficient data” — never a guessed number.",
        "Estimated values are labeled as estimates and show their evidence.",
        "Impact is operational only: assignment continuity, status, risk, timing signals. TRUXERA does not claim fuel, mileage, or cost savings in V1.",
      ]),
    ],
  },
  {
    slug: "daily-summary",
    section: "v1-operations",
    title: "Daily Summary",
    summary: "The end-of-day operational recap generated from recorded events.",
    status: "v1",
    blocks: [
      p("Daily Summary answers “what happened operationally today?” using only recorded data for the selected day."),
      h3("What it contains"),
      list([
        "Operations snapshot — completed, currently assigned, failed, and recovery-action counts.",
        "Risk & disruption — deliveries by risk level and projected delay signals.",
        "Recovery activity — successful, monitoring, and unresolved recovery outcomes for the day.",
        "Operational outcomes — grouped delivery outcomes.",
        "Daily automatic summary — a system-generated narrative composed from the same recorded events.",
      ]),
      note("The summary is regenerated from recorded history — it never contains estimates or data that was not recorded."),
    ],
  },
  {
    slug: "executive-reports",
    section: "v1-operations",
    title: "Executive Reports",
    summary: "Period-based executive reporting with comparison to the previous equivalent period.",
    status: "v1",
    blocks: [
      p("Executive Report provides a period view of operational performance: outcomes, recovery activity, assignment changes, and measurable impact — plus a comparison against the previous equivalent period."),
      h3("What it contains"),
      list([
        "Reporting period and executive overview metrics.",
        "Risk & disruption distribution for the period.",
        "Recovery performance — successful, monitoring, unresolved, and no-action deliveries.",
        "Assignment activity and measurable impact where recorded.",
        "Comparison with the previous equivalent period — deltas shown only when the underlying data supports them; unavailable comparisons are stated honestly.",
        "Executive summary narrative generated from recorded events.",
      ]),
      note("Comparisons never imply improvement the data does not support. Where periods are incompatible or data is missing, the report says so."),
    ],
  },
  {
    slug: "operational-history",
    section: "v1-operations",
    title: "Operational History",
    summary: "The audit timeline of recorded operational events across the fleet.",
    status: "v1",
    blocks: [
      p("Operational History is the factual event log: what happened, when, to which delivery, with which truck and driver, and what changed."),
      h3("What each entry shows"),
      list([
        "Event type and timestamp.",
        "Load, delivery, truck, and driver references.",
        "A factual description of the recorded change.",
        "Recovery outcome where one is defined — and “Not recorded” for historical recommendations that were never captured.",
        "Impact information only where recorded data supports it.",
      ]),
      h3("Filtering"),
      p("History can be filtered by load, delivery, truck, driver, event type, recovery outcome, and free text. Filters only narrow recorded events — they never fabricate them."),
      note("History is append-only operational fact. A recorded reassignment appears as an assignment event; it does not appear as a successful recovery unless the recorded outcome supports that."),
    ],
  },

  // ── V2 Connected Fleet Intelligence ────────────────────────────────────
  {
    slug: "tms-integration",
    section: "v2-connected-fleet",
    title: "TMS Integration",
    summary: "Planned: importing loads, orders, and customer data from your transport management system.",
    status: "v2",
    blocks: [
      p("Coming in V2. TRUXERA V1 works from records your team enters directly. A planned TMS integration would allow loads, customers, and order references to flow in from your existing transport management system instead of being entered manually."),
      note("This capability is not yet implemented. There are no TMS connection settings in the product today."),
    ],
  },
  {
    slug: "eld-integration",
    section: "v2-connected-fleet",
    title: "ELD Integration",
    summary: "Planned: electronic logging device data for hours-of-service and duty status signals.",
    status: "v2",
    blocks: [
      p("Coming in V2. A planned ELD integration would bring electronic logging device signals — duty status and hours-related data — into TRUXERA so driver availability reflects recorded device state rather than manual status entry."),
      note("This capability is not yet implemented. TRUXERA does not receive ELD data today."),
    ],
  },
  {
    slug: "gps-telematics",
    section: "v2-connected-fleet",
    title: "GPS & Telematics",
    summary: "Planned: live vehicle position and telematics signals for trucks.",
    status: "v2",
    blocks: [
      p("Coming in V2. A planned GPS/telematics integration would provide live vehicle position and vehicle signals, replacing manually recorded locations with real operational data."),
      note("This capability is not yet implemented. Truck location in V1 is a manually recorded field."),
    ],
  },
  {
    slug: "automated-data-ingestion",
    section: "v2-connected-fleet",
    title: "Automated Data Ingestion",
    summary: "Planned: continuous automated import of operational events from connected systems.",
    status: "v2",
    blocks: [
      p("Coming in V2. A planned ingestion layer would continuously import operational events — dispatch updates, status changes, position reports — so TRUXERA's detection and risk evaluation run on fresh data rather than periodic manual entry."),
      note("This capability is not yet implemented."),
    ],
  },
  {
    slug: "real-time-signals",
    section: "v2-connected-fleet",
    title: "Real-Time Vehicle & Delivery Signals",
    summary: "Planned: live signals feeding risk detection as events happen.",
    status: "v2",
    blocks: [
      p("Coming in V2. With connected data sources, TRUXERA plans to evaluate risk from real-time signals — vehicle movement, delivery milestones, and exception events — rather than only from manually recorded status updates."),
      note("This capability is not yet implemented. V1 risk evaluation uses recorded status and assignment data."),
    ],
  },
  {
    slug: "eta-delay-updates",
    section: "v2-connected-fleet",
    title: "ETA & Delay Updates",
    summary: "Planned: computed ETAs and delay projections from live fleet data.",
    status: "v2",
    blocks: [
      p("Coming in V2. TRUXERA deliberately does not show ETAs or projected delays it cannot support with recorded data. A planned V2 capability would compute ETA and delay updates from connected position and schedule data — always labeled by its data quality."),
      note("This capability is not yet implemented. Where V1 shows “Not recorded” for ETA, that is the honest state, not a placeholder for a hidden estimate."),
    ],
  },
  {
    slug: "integration-setup",
    section: "v2-connected-fleet",
    title: "Integration Setup",
    summary: "Planned: connecting TMS, ELD, GPS, and telematics providers.",
    status: "v2",
    blocks: [
      p("Coming in V2. Planned setup flows would let an organization connect its TMS, ELD provider, GPS/telematics feed, and other systems, map fields, and verify the connection before data flows into TRUXERA."),
      note("This capability is not yet implemented. There is no integration settings area in the product today."),
    ],
  },
  {
    slug: "integration-monitoring",
    section: "v2-connected-fleet",
    title: "Integration Monitoring & Errors",
    summary: "Planned: health monitoring, sync status, and error handling for integrations.",
    status: "v2",
    blocks: [
      p("Coming in V2. Planned monitoring would show each integration's sync status, last successful sync, and any errors — so operations teams can trust that TRUXERA's data is fresh and complete."),
      note("This capability is not yet implemented."),
    ],
  },
  {
    slug: "connected-data-sync",
    section: "v2-connected-fleet",
    title: "Connected Data & Sync Status",
    summary: "Planned: visibility into what data TRUXERA has received and how fresh it is.",
    status: "v2",
    blocks: [
      p("Coming in V2. A planned data-status view would show which signals TRUXERA has received, from which source, and how current they are — extending today's honest “insufficient data” states to show exactly which input is missing."),
      note("This capability is not yet implemented."),
    ],
  },
  {
    slug: "live-fleet-data",
    section: "v2-connected-fleet",
    title: "Using TRUXERA with Live Fleet Data",
    summary: "Planned: the same workflow powered by continuous live signals instead of manual records.",
    status: "v2",
    blocks: [
      p("Coming in V2. The Detect → Predict → Recommend → Recover → Measure Impact → Generate Summary workflow is designed to work the same way with live fleet data — the difference is that detection and prediction would run on continuous signals rather than periodically updated records. Recommendations, dispatcher approval, and honest impact measurement stay unchanged."),
      note("This capability is not yet implemented. Everything described in the V1 chapters works today from your team's recorded data."),
    ],
  },

  // ── Account & Administration ───────────────────────────────────────────
  {
    slug: "organization-workspace",
    section: "account-admin",
    title: "Organization & Workspace",
    summary: "How TRUXERA organizes data by organization and how to switch between them.",
    status: "v1",
    blocks: [
      p("TRUXERA is organization-scoped: every truck, driver, load, delivery, and report belongs to exactly one organization. Your user can belong to multiple organizations."),
      h3("Switching organizations"),
      steps([
        "If you belong to more than one organization, an organization switcher appears in the top bar.",
        "Choose the organization and select Switch — every page reloads in that organization's context.",
        "All operational data, permissions, and reports are scoped to the selected organization. Nothing leaks across organizations.",
      ]),
      note("If you only see one organization, the switcher is hidden. If you need access to another organization, ask an administrator of that organization to add you."),
    ],
  },
  {
    slug: "roles-permissions",
    section: "account-admin",
    title: "Roles & Permissions",
    summary: "What each membership role can do in TRUXERA.",
    status: "v1",
    blocks: [
      p("Every member of an organization has a role that determines what they can change. Permissions are enforced on the server — the interface simply reflects them."),
      h3("Roles"),
      list([
        "Owner — full access, including fleet management actions.",
        "Admin — full access, including fleet management actions.",
        "Dispatcher — can manage fleet operations: create/edit loads, trucks, and drivers; make and end assignments; approve recoveries.",
        "Driver — read-oriented operational access; cannot perform fleet-management writes.",
        "Viewer — read-only access to operational data.",
      ]),
      h3("What this means in practice"),
      list([
        "Fleet-management actions (adding trucks/drivers/loads, editing records, assigning resources, ending assignments, archiving trucks) require Owner, Admin, or Dispatcher.",
        "Read-only roles can view dashboards, reports, history, and detail pages but cannot change operational records.",
        "You cannot access data for an organization you are not a member of — organization scoping is enforced for every request.",
      ]),
    ],
  },
  {
    slug: "settings",
    section: "account-admin",
    title: "Settings",
    summary: "Organization and workspace settings — planned area.",
    status: "coming-soon",
    blocks: [
      p("The Settings area is part of the TRUXERA navigation structure but is not yet available. When released, it will cover organization and workspace configuration."),
      note("This capability is not yet implemented — the Settings page currently shows a coming-soon notice."),
    ],
  },
  {
    slug: "billing",
    section: "account-admin",
    title: "Billing",
    summary: "Subscription, plan, and invoice management — planned area.",
    status: "coming-soon",
    blocks: [
      p("The Billing area is part of the TRUXERA navigation structure but is not yet available. When released, it will cover subscription plan, invoices, and billing management for the organization."),
      note("This capability is not yet implemented — the Billing page currently shows a coming-soon notice."),
    ],
  },
  {
    slug: "account",
    section: "account-admin",
    title: "Account",
    summary: "Personal profile, security, and account preferences — planned area.",
    status: "coming-soon",
    blocks: [
      p("The Account area is part of the TRUXERA navigation structure but is not yet available. When released, it will cover your personal profile, security settings, and account preferences."),
      note("This capability is not yet implemented — the Account page currently shows a coming-soon notice."),
    ],
  },
  {
    slug: "common-issues",
    section: "troubleshooting",
    title: "Common Issues",
    summary: "Frequent questions about day-to-day TRUXERA use.",
    status: "v1",
    blocks: [
      h3("A delivery shows “Insufficient data” for risk"),
      p("TRUXERA could not compute a risk level from the recorded inputs. Check that the delivery has an assignment and that status updates have been recorded. Insufficient data is an honest state — it is not the same as low risk."),
      h3("A metric shows “Not recorded”"),
      p("The value was never recorded — for example an ETA that no one entered. TRUXERA only displays recorded data; it does not estimate missing values."),
      h3("I can't see the New/Edit buttons"),
      p("Fleet-management actions require an Owner, Admin, or Dispatcher role. If you believe you should have that role, ask an organization administrator."),
      h3("A page shows an error or fails to load"),
      p("Refresh once. If the problem persists, note the page and what you were doing and contact support via the Support section."),
    ],
  },
  {
    slug: "data-sync-issues",
    section: "troubleshooting",
    title: "Data & Sync Issues",
    summary: "Why TRUXERA shows stale or missing operational data.",
    status: "v1",
    blocks: [
      p("In V1, TRUXERA has no external data feeds — all operational data comes from records your team enters. “Sync issues” therefore mean the underlying records need attention."),
      h3("Checklist"),
      list([
        "Confirm you are viewing the correct organization — data is strictly organization-scoped.",
        "Confirm the relevant status updates and assignments were actually recorded (check Operational History for the delivery).",
        "If a delivery looks wrong, verify its load, stops, and assignment records on the detail page.",
        "If records appear missing entirely, contact support — do not re-enter data until you know whether the original records exist.",
      ]),
      note("V2 integrations (TMS, ELD, GPS) will add automated sync with monitoring and error states; until then, data freshness depends on your team's record-keeping."),
    ],
  },
  {
    slug: "integration-issues",
    section: "troubleshooting",
    title: "Integration Issues",
    summary: "Integration-related questions — mostly “not yet” in V1.",
    status: "v1",
    blocks: [
      p("TRUXERA V1 does not connect to external systems. There are no TMS, ELD, GPS, or telematics integrations to troubleshoot today."),
      list([
        "If you expected live vehicle or ELD data: that capability is planned for V2 — see the V2 Connected Fleet Intelligence chapters.",
        "If a third-party tool claims to integrate with TRUXERA, verify it with support before relying on it.",
        "Data entry mistakes are the most common “integration” issue in V1 — double-check recorded fields on the source record.",
      ]),
    ],
  },
  {
    slug: "account-access-issues",
    section: "troubleshooting",
    title: "Account & Access Issues",
    summary: "Sign-in, organization access, and permission problems.",
    status: "v1",
    blocks: [
      h3("I can't sign in"),
      p("Use the same credentials you signed up with. If sign-in fails repeatedly, use the support channel and include the email address on the account."),
      h3("I don't see an organization"),
      p("Organizations are created during onboarding. If you were invited to an organization but see nothing, confirm with the administrator that your membership was added, then sign out and back in."),
      h3("I can't edit or assign anything"),
      p("Write actions require an Owner, Admin, or Dispatcher role. Viewers and Drivers have read-oriented access by design."),
      h3("I'm in the wrong organization"),
      p("Use the organization switcher in the top bar if you belong to more than one organization."),
    ],
  },
  {
    slug: "contact-support",
    section: "troubleshooting",
    title: "When to Contact Support",
    summary: "What to include when you reach out for help.",
    status: "v1",
    blocks: [
      p("The Support area in the navigation is where customer support, technical issues, and ticket tracking will live. Until it is enabled, reach out through your TRUXERA contact channel."),
      h3("Include this when contacting support"),
      list([
        "The organization you were working in.",
        "The page or feature where the problem occurred.",
        "What you expected to happen vs. what happened.",
        "Any error message shown, verbatim.",
        "The load, delivery, truck, or driver reference involved, if applicable.",
      ]),
      note("Never send passwords or secrets. TRUXERA staff will never ask for your password."),
    ],
    action: { label: "Contact Support", href: "/dashboard/support" },
  },
];

export function getHelpChapter(slug: string) {
  return helpChapters.find((chapter) => chapter.slug === slug);
}

export function chaptersInSection(section: HelpSectionId) {
  return helpChapters.filter((chapter) => chapter.section === section);
}
