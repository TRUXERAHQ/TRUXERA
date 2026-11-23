import type { StoredSignal } from "./types.ts";

export type SignalResolutionPolicy = {
  /** Provider keys ordered highest to lowest precedence. Unknown providers rank last. */
  precedence: readonly string[];
  /** Max age of sourceTimestamp to count as fresh. null = no freshness gate. */
  maxSourceAgeMinutes: number | null;
  /**
   * When true, a fresh lower-precedence source may win over a stale
   * higher-precedence source. When false, precedence always wins and
   * staleness is only reported.
   */
  preferFreshness: boolean;
};

export const DEFAULT_SIGNAL_RESOLUTION_POLICY: SignalResolutionPolicy = {
  precedence: [],
  maxSourceAgeMinutes: null,
  preferFreshness: true,
};

const policyRegistry = new Map<string, SignalResolutionPolicy>();

export function registerSignalPolicy(
  signalKind: string,
  policy: Partial<SignalResolutionPolicy>,
): void {
  policyRegistry.set(signalKind, {
    ...DEFAULT_SIGNAL_RESOLUTION_POLICY,
    ...policy,
  });
}

export function getSignalPolicy(signalKind: string): SignalResolutionPolicy {
  return (
    policyRegistry.get(signalKind) ?? DEFAULT_SIGNAL_RESOLUTION_POLICY
  );
}

export function resetSignalPolicies(): void {
  policyRegistry.clear();
}

function signalOrderingKey(signal: StoredSignal): [number, number, number] {
  return [
    signal.sourceTimestamp.getTime(),
    signal.ingestedAt.getTime(),
    signal.sequence ?? 0,
  ];
}

function isNewer(a: StoredSignal, b: StoredSignal): boolean {
  const [aTs, aIn, aSeq] = signalOrderingKey(a);
  const [bTs, bIn, bSeq] = signalOrderingKey(b);
  return aTs > bTs || (aTs === bTs && (aIn > bIn || (aIn === bIn && aSeq > bSeq)));
}

function precedenceRank(providerKey: string, precedence: readonly string[]) {
  const index = precedence.indexOf(providerKey);
  return index === -1 ? precedence.length : index;
}

export type ProviderCandidate = {
  providerKey: string;
  latest: StoredSignal;
  fresh: boolean;
};

/**
 * Reduce raw signals for one (subject, signalKind) to the newest signal per
 * provider. Clock-skewed signals are excluded from candidacy entirely.
 */
export function groupSignalsByProvider(
  signals: StoredSignal[],
  policy: SignalResolutionPolicy,
  now: Date,
): { candidates: ProviderCandidate[]; skewedCount: number } {
  const usable = signals.filter((signal) => !signal.clockSkew);
  const skewedCount = signals.length - usable.length;

  const byProvider = new Map<string, StoredSignal>();
  for (const signal of usable) {
    const existing = byProvider.get(signal.providerKey);
    if (!existing || isNewer(signal, existing)) {
      byProvider.set(signal.providerKey, signal);
    }
  }

  const candidates = [...byProvider.entries()].map(([providerKey, latest]) => {
    const fresh =
      policy.maxSourceAgeMinutes === null ||
      now.getTime() - latest.sourceTimestamp.getTime() <=
        policy.maxSourceAgeMinutes * 60000;
    return { providerKey, latest, fresh };
  });

  candidates.sort(
    (a, b) =>
      precedenceRank(a.providerKey, policy.precedence) -
        precedenceRank(b.providerKey, policy.precedence) ||
      b.latest.sourceTimestamp.getTime() -
        a.latest.sourceTimestamp.getTime() ||
      a.providerKey.localeCompare(b.providerKey),
  );

  return { candidates, skewedCount };
}

export type ResolutionOutcome =
  | { status: "RESOLVED"; winner: ProviderCandidate; stale: boolean }
  | { status: "UNRESOLVED"; reason: "NO_USABLE_SIGNALS" };

/**
 * Pick the winning provider candidate.
 *
 * - preferFreshness=true: highest-precedence *fresh* candidate wins; if none
 *   are fresh, the highest-precedence candidate wins flagged stale.
 * - preferFreshness=false: highest-precedence candidate wins regardless of
 *   freshness (staleness still reported).
 */
export function resolveWinner(
  candidates: ProviderCandidate[],
  policy: SignalResolutionPolicy,
): ResolutionOutcome {
  if (candidates.length === 0) {
    return { status: "UNRESOLVED", reason: "NO_USABLE_SIGNALS" };
  }

  if (policy.preferFreshness && policy.maxSourceAgeMinutes !== null) {
    const fresh = candidates.filter((c) => c.fresh);
    if (fresh.length > 0) {
      return { status: "RESOLVED", winner: fresh[0], stale: false };
    }
    return { status: "RESOLVED", winner: candidates[0], stale: true };
  }

  const winner = candidates[0];
  return { status: "RESOLVED", winner, stale: !winner.fresh };
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function parseSignalValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export type SignalView = {
  signalKind: string;
  value: unknown;
  provenance: string;
  providerKey: string;
  sourceTimestamp: string;
  ingestedAt: string;
  sequence: number | null;
  conflict: boolean;
  stale: boolean;
  clockSkewExcluded: boolean;
  alternatives: Array<{
    providerKey: string;
    value: unknown;
    sourceTimestamp: string;
    provenance: string;
  }>;
};

/**
 * Pure resolution of one (subject, signalKind) candidate set into the
 * trusted current view. Exposed for tests; the Prisma layer adds subject
 * identity fields.
 */
export function resolveSignalView(
  signals: StoredSignal[],
  policy: SignalResolutionPolicy,
  now: Date,
): { view: SignalView | null; skewedCount: number } {
  const { candidates, skewedCount } = groupSignalsByProvider(
    signals,
    policy,
    now,
  );
  const outcome = resolveWinner(candidates, policy);
  if (outcome.status !== "RESOLVED") {
    return { view: null, skewedCount };
  }

  const winner = outcome.winner;
  const winnerParsed = parseSignalValue(winner.latest.value);
  // Alternatives/conflict consider every non-skewed provider candidate:
  // a stale or lower-precedence source that disagrees is still a retained,
  // visible conflict — never silently merged.
  const alternatives = candidates
    .filter((c) => c.providerKey !== winner.providerKey)
    .map((c) => ({
      providerKey: c.providerKey,
      value: parseSignalValue(c.latest.value),
      sourceTimestamp: c.latest.sourceTimestamp.toISOString(),
      provenance: c.latest.provenance,
    }));
  const conflict = alternatives.some((a) => !valuesEqual(a.value, winnerParsed));

  return {
    view: {
      signalKind: winner.latest.signalKind,
      value: winnerParsed,
      provenance: winner.latest.provenance,
      providerKey: winner.providerKey,
      sourceTimestamp: winner.latest.sourceTimestamp.toISOString(),
      ingestedAt: winner.latest.ingestedAt.toISOString(),
      sequence: winner.latest.sequence,
      conflict,
      stale: outcome.stale,
      clockSkewExcluded: skewedCount > 0,
      alternatives,
    },
    skewedCount,
  };
}
