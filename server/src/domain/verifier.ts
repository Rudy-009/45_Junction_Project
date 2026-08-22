import { hashJson } from "../lib/hash.js";
import {
  asFactNumber,
  asFactObject,
  asFactStageZone,
  asFactString,
  effectiveReviewedFacts,
  type EffectiveReviewedFact,
} from "./compiler.js";
import type {
  CueRevision,
  Evidence,
  FactCandidate,
  Finding,
  FindingVerdict,
  InternalReviewSnapshot,
  InternalSourceVersion,
  SourceRole,
  StageZone,
  VerificationResult,
} from "./types.js";

const ROLES: SourceRole[] = ["SCRIPT", "MASTER_CUE", "STAGE_SPEC"];
const QUICK_FACTS = [
  "SCRIPT_TIMING_ANCHOR",
  "QUICK_CHANGE_AVAILABLE_WINDOW",
  "ROUTE_TO_CHANGE",
  "MINIMUM_CHANGE_TIME",
  "ROUTE_TO_ENTRY",
] as const;
const BLOCKING_FACTS = ["BLOCKING_SEQUENCE_COMPLETE", "ROUTE_CAPACITY", "ROUTE_OCCUPANCY"] as const;
const PROP_FACTS = ["PROP_INITIAL_STATE", "PROP_SEQUENCE_COMPLETE", "PROP_REQUIRED_AT", "PROP_MOVE"] as const;

type RangeValue = { min_ms: number; max_ms: number };
type Occupancy = {
  candidate: FactCandidate;
  routeId: string;
  eventId: string;
  entityId: string;
  startMs: number;
  endMs: number;
};

function rangeValue(value: unknown): RangeValue | null {
  const record = asFactObject(value);
  const minMs = asFactNumber(record?.min_ms);
  const maxMs = asFactNumber(record?.max_ms);
  return minMs !== null && maxMs !== null && minMs <= maxMs
    ? { min_ms: minMs, max_ms: maxMs }
    : null;
}

function minimumValue(value: unknown): number | null {
  return asFactNumber(asFactObject(value)?.min_ms);
}

function secondsFromCell(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) * 1000 : null;
}

function relevantCandidates(snapshot: InternalReviewSnapshot, factTypes: readonly string[]): FactCandidate[] {
  return snapshot.frozen_candidates.filter((candidate) => {
    const raw = candidate.reviewed_value ?? candidate.raw_value;
    const normalized = asFactString(asFactObject(raw)?.normalized_fact_type);
    return factTypes.includes(normalized ?? candidate.fact_type);
  });
}

function sourceEvidence(
  role: SourceRole,
  sources: Map<SourceRole, InternalSourceVersion>,
  candidates: FactCandidate[],
  reviewedIds: Set<string>,
  revision: CueRevision,
  useRevision: boolean,
): Evidence {
  const source = sources.get(role);
  const primary = candidates.find((candidate) => candidate.source_role === role);
  if (!source) {
    return {
      role,
      source_id: "missing",
      quote: null,
      locator: null,
      origin: "CONTROLLED_FIXTURE",
      review_status: "MISSING",
    };
  }

  if (role === "MASTER_CUE" && useRevision && revision.patches.length > 0) {
    const row = revision.rows.find((candidate) => candidate.id === "R3");
    return {
      role,
      source_id: source.source_id,
      quote: row ? `R3 환복시간 = ${row.환복시간 ?? ""}` : primary?.quote ?? null,
      locator: "MASTER!D3",
      origin: "USER_PROVIDED",
      review_status: primary && reviewedIds.has(primary.fact_id) ? "REVIEWED" : "UNREVIEWED",
    };
  }

  return {
    role,
    source_id: source.source_id,
    quote: primary?.quote ?? null,
    locator: primary?.locator ?? null,
    origin: source.origin,
    review_status: primary
      ? reviewedIds.has(primary.fact_id) ? "REVIEWED" : "UNREVIEWED"
      : "MISSING",
  };
}

function evidenceFor(
  input: VerifyInput,
  factTypes: readonly string[],
  useRevision = false,
): [Evidence, Evidence, Evidence] {
  const candidates = relevantCandidates(input.snapshot, factTypes);
  const reviewedIds = new Set(input.snapshot.reviewed_fact_ids);
  return ROLES.map((role) =>
    sourceEvidence(role, input.sources, candidates, reviewedIds, input.revision, useRevision),
  ) as [Evidence, Evidence, Evidence];
}

function finding(input: {
  id: string;
  eventId: string;
  ruleId: Finding["rule_id"];
  verdict: FindingVerdict;
  calculation: Record<string, unknown>;
  missingFacts?: string[];
  evidence: [Evidence, Evidence, Evidence];
  target: { row_id: string; column: string };
}): Finding {
  return {
    finding_id: input.id,
    event_id: input.eventId,
    rule_id: input.ruleId,
    verdict: input.verdict,
    calculation: input.calculation,
    missing_facts: [...new Set(input.missingFacts ?? [])],
    evidence: input.evidence,
    target_locator: input.target,
  };
}

function quickChangeFinding(input: VerifyInput, facts: EffectiveReviewedFact[]): Finding | null {
  const byType = new Map<string, EffectiveReviewedFact>();
  const missing: string[] = [];
  for (const factType of QUICK_FACTS) {
    const matches = facts.filter((fact) => fact.factType === factType);
    const [match] = matches;
    if (!match) missing.push(factType);
    else if (matches.length > 1) missing.push(`AMBIGUOUS_REVIEWED_FACT:${factType}`);
    else byType.set(factType, match);
  }
  let available: RangeValue | null = null;
  let required: RangeValue | null = null;

  if (missing.length === 0) {
    available = rangeValue(byType.get("QUICK_CHANGE_AVAILABLE_WINDOW")?.value);
    const routeToChange = rangeValue(byType.get("ROUTE_TO_CHANGE")?.value);
    const minimumChange = minimumValue(byType.get("MINIMUM_CHANGE_TIME")?.value);
    const routeToEntry = rangeValue(byType.get("ROUTE_TO_ENTRY")?.value);
    if (!available || !routeToChange || minimumChange === null || !routeToEntry) {
      missing.push("MALFORMED_REVIEWED_FACT");
    } else {
      if (input.revision.patches.length > 0) {
        const row = input.revision.rows.find((candidate) => candidate.id === "R3");
        const patchedMs = row ? secondsFromCell(row.환복시간 ?? "") : null;
        if (patchedMs === null) {
          missing.push("QUICK_CHANGE_AVAILABLE_WINDOW");
          available = null;
        } else {
          available = { min_ms: patchedMs, max_ms: patchedMs };
        }
      }
      required = {
        min_ms: routeToChange.min_ms + minimumChange + routeToEntry.min_ms,
        max_ms: routeToChange.max_ms + minimumChange + routeToEntry.max_ms,
      };
    }
  }

  const availableValue = asFactObject(byType.get("QUICK_CHANGE_AVAILABLE_WINDOW")?.value);
  const targetValue = asFactObject(availableValue?.target);
  const target = {
    row_id: asFactString(targetValue?.row_id) ?? "R3",
    column: asFactString(targetValue?.column) ?? "환복시간",
  };
  const calculation = {
    available_min_ms: available?.min_ms ?? null,
    available_max_ms: available?.max_ms ?? null,
    required_min_ms: required?.min_ms ?? null,
    required_max_ms: required?.max_ms ?? null,
  };
  const evidence = evidenceFor(input, QUICK_FACTS, true);

  if (missing.length > 0) {
    return finding({
      id: "finding_e3_vr01",
      eventId: "E3",
      ruleId: "VR-01",
      verdict: "INSUFFICIENT_EVIDENCE",
      calculation,
      missingFacts: missing,
      evidence,
      target,
    });
  }
  if (available && required && required.min_ms > available.max_ms) {
    return finding({
      id: "finding_e3_vr01",
      eventId: "E3",
      ruleId: "VR-01",
      verdict: "VIOLATION",
      calculation,
      evidence,
      target,
    });
  }
  if (available && required && required.max_ms > available.min_ms) {
    return finding({
      id: "finding_e3_vr01",
      eventId: "E3",
      ruleId: "VR-01",
      verdict: "REVIEW",
      calculation,
      evidence,
      target,
    });
  }
  return null;
}

function occupancyValue(fact: EffectiveReviewedFact): Occupancy | null {
  const value = asFactObject(fact.value);
  const routeId = asFactString(value?.route_id);
  const eventId = asFactString(value?.event_id);
  const entityId = asFactString(value?.entity_id);
  const startMs = asFactNumber(value?.start_ms);
  const endMs = asFactNumber(value?.end_ms);
  return routeId && eventId && entityId && startMs !== null && endMs !== null && startMs < endMs
    ? { candidate: fact.candidate, routeId, eventId, entityId, startMs, endMs }
    : null;
}

function blockingFinding(input: VerifyInput, facts: EffectiveReviewedFact[]): Finding | null {
  const completeFact = facts.find((fact) => fact.factType === "BLOCKING_SEQUENCE_COMPLETE");
  const completeValue = asFactObject(completeFact?.value);
  const routeId = asFactString(completeValue?.route_id);
  const complete = completeValue?.complete === true;
  const capacityFact = facts.find((fact) => {
    if (fact.factType !== "ROUTE_CAPACITY") return false;
    return asFactString(asFactObject(fact.value)?.route_id) === routeId;
  });
  const capacity = asFactNumber(asFactObject(capacityFact?.value)?.capacity);
  const rawOccupancies = facts.filter((fact) => fact.factType === "ROUTE_OCCUPANCY");
  const occupancies = rawOccupancies.map(occupancyValue);
  const validOccupancies = occupancies.filter((value): value is Occupancy => value !== null)
    .filter((value) => value.routeId === routeId);
  const missing: string[] = [];
  if (!routeId || !complete) missing.push("BLOCKING_SEQUENCE_COMPLETE");
  if (capacity === null || !Number.isInteger(capacity) || capacity < 1) missing.push("ROUTE_CAPACITY");
  if (rawOccupancies.length < 2) missing.push("ROUTE_OCCUPANCY");
  if (occupancies.some((value) => value === null)) missing.push("MALFORMED_REVIEWED_FACT");
  const evidence = evidenceFor(input, BLOCKING_FACTS);
  const defaultEvent = asFactString(completeValue?.event_id) ?? validOccupancies.at(-1)?.eventId ?? "E6";

  if (missing.length > 0) {
    return finding({
      id: "finding_e6_vr02",
      eventId: defaultEvent,
      ruleId: "VR-02",
      verdict: "INSUFFICIENT_EVIDENCE",
      calculation: { route_id: routeId, capacity, maximum_occupancy: null },
      missingFacts: missing,
      evidence,
      target: { row_id: defaultEvent, column: "동선" },
    });
  }

  const points = validOccupancies.flatMap((occupancy) => [
    { time: occupancy.endMs, kind: "END" as const, occupancy },
    { time: occupancy.startMs, kind: "START" as const, occupancy },
  ]).sort((a, b) => a.time - b.time || (a.kind === "END" ? -1 : 1));
  const active = new Map<string, Occupancy>();
  let maximum = 0;
  let conflict: { time: number; active: Occupancy[] } | null = null;
  for (const point of points) {
    if (point.kind === "END") active.delete(point.occupancy.candidate.fact_id);
    else active.set(point.occupancy.candidate.fact_id, point.occupancy);
    maximum = Math.max(maximum, active.size);
    if (capacity !== null && active.size > capacity && !conflict) {
      conflict = { time: point.time, active: [...active.values()] };
    }
  }
  if (!conflict || capacity === null) return null;
  const eventId = conflict.active.at(-1)?.eventId ?? defaultEvent;
  return finding({
    id: `finding_${eventId.toLowerCase()}_vr02`,
    eventId,
    ruleId: "VR-02",
    verdict: "VIOLATION",
    calculation: {
      route_id: routeId,
      capacity,
      maximum_occupancy: maximum,
      conflict_at_ms: conflict.time,
      entity_ids: conflict.active.map((occupancy) => occupancy.entityId).sort(),
    },
    evidence,
    target: { row_id: eventId, column: "동선" },
  });
}

function crossesSides(from: StageZone, to: StageZone): boolean {
  return (
    (from === "STAGE_RIGHT_WING" && to === "STAGE_LEFT_WING") ||
    (from === "STAGE_LEFT_WING" && to === "STAGE_RIGHT_WING")
  );
}

function propFinding(input: VerifyInput, facts: EffectiveReviewedFact[]): Finding | null {
  const initialFact = facts.find((fact) => fact.factType === "PROP_INITIAL_STATE");
  const requiredFact = facts.find((fact) => fact.factType === "PROP_REQUIRED_AT");
  const completeFact = facts.find((fact) => fact.factType === "PROP_SEQUENCE_COMPLETE");
  const initial = asFactObject(initialFact?.value);
  const required = asFactObject(requiredFact?.value);
  const complete = asFactObject(completeFact?.value);
  const propId = asFactString(required?.prop_id) ?? asFactString(initial?.prop_id);
  const initialZone = asFactStageZone(initial?.zone);
  const requiredZone = asFactStageZone(required?.zone);
  const eventId = asFactString(required?.event_id) ?? "E8";
  const throughEventId = asFactString(complete?.through_event_id);
  const missing: string[] = [];
  if (!propId || !initialZone) missing.push("PROP_INITIAL_STATE");
  if (!propId || !requiredZone) missing.push("PROP_REQUIRED_AT");
  if (!throughEventId || complete?.complete !== true) missing.push("PROP_SEQUENCE_COMPLETE");
  const evidence = evidenceFor(input, PROP_FACTS);
  if (missing.length > 0) {
    return finding({
      id: `finding_${eventId.toLowerCase()}_vr03`,
      eventId,
      ruleId: "VR-03",
      verdict: "INSUFFICIENT_EVIDENCE",
      calculation: { prop_id: propId, initial_zone: initialZone, required_zone: requiredZone, observed_zone: null },
      missingFacts: missing,
      evidence,
      target: { row_id: eventId, column: "소품" },
    });
  }

  const moves = facts
    .filter((fact) => fact.factType === "PROP_MOVE")
    .map((fact) => ({ fact, value: asFactObject(fact.value) }))
    .filter(({ value }) => asFactString(value?.prop_id) === propId)
    .sort((a, b) => (asFactNumber(a.value?.sequence_index) ?? Number.MAX_SAFE_INTEGER) -
      (asFactNumber(b.value?.sequence_index) ?? Number.MAX_SAFE_INTEGER));
  let zone = initialZone;
  for (const move of moves) {
    const from = asFactStageZone(move.value?.from_zone);
    const to = asFactStageZone(move.value?.to_zone);
    const moveEventId = asFactString(move.value?.event_id) ?? eventId;
    if (!from || !to) {
      return finding({
        id: `finding_${moveEventId.toLowerCase()}_vr03`,
        eventId: moveEventId,
        ruleId: "VR-03",
        verdict: "INSUFFICIENT_EVIDENCE",
        calculation: { prop_id: propId, observed_zone: zone },
        missingFacts: ["MALFORMED_REVIEWED_FACT"],
        evidence,
        target: { row_id: moveEventId, column: "소품" },
      });
    }
    if (zone !== from || (crossesSides(from, to) && !asFactString(move.value?.responsible_party))) {
      return finding({
        id: `finding_${moveEventId.toLowerCase()}_vr03`,
        eventId: moveEventId,
        ruleId: "VR-03",
        verdict: "REVIEW",
        calculation: {
          prop_id: propId,
          observed_zone: zone,
          declared_from_zone: from,
          declared_to_zone: to,
          responsible_party: asFactString(move.value?.responsible_party),
        },
        evidence,
        target: { row_id: moveEventId, column: "소품" },
      });
    }
    zone = to;
  }
  if (zone !== requiredZone) {
    return finding({
      id: `finding_${eventId.toLowerCase()}_vr03`,
      eventId,
      ruleId: "VR-03",
      verdict: "REVIEW",
      calculation: { prop_id: propId, observed_zone: zone, required_zone: requiredZone },
      evidence,
      target: { row_id: eventId, column: "소품" },
    });
  }
  return null;
}

type VerifyInput = {
  caseId: string;
  sources: Map<SourceRole, InternalSourceVersion>;
  snapshot: InternalReviewSnapshot;
  revision: CueRevision;
};

export function verifyProduction(input: VerifyInput): VerificationResult {
  const facts = effectiveReviewedFacts(input.snapshot);
  const findings = [
    quickChangeFinding(input, facts),
    blockingFinding(input, facts),
    propFinding(input, facts),
  ].filter((value): value is Finding => value !== null);
  const inputFingerprint = hashJson({
    case_id: input.caseId,
    source_snapshot_digest: input.snapshot.source_snapshot_digest,
    fact_snapshot_digest: input.snapshot.fact_snapshot_digest,
    reviewed_fact_ids: [...input.snapshot.reviewed_fact_ids].sort(),
    revision_hash: input.revision.revision_hash,
    ruleset_version: "standby.rules.v2",
  });
  return {
    contract_version: "standby.verification.v1",
    verification_run_id: `verify_${inputFingerprint.slice(0, 16)}`,
    input_fingerprint: inputFingerprint,
    ruleset_version: "standby.rules.v2",
    result_hash: hashJson({ input_fingerprint: inputFingerprint, findings }),
    findings,
  };
}
