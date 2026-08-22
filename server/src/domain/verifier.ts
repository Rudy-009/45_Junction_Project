import { HERO_EVENT_LABELS, HERO_STAGE_SNAPSHOTS } from "../fixtures/hero.js";
import { hashJson } from "../lib/hash.js";
import type {
  CueRevision,
  Evidence,
  FactCandidate,
  Finding,
  InternalSourceVersion,
  InternalReviewSnapshot,
  SourceRole,
  VerificationResult,
  WorkspaceEvent,
} from "./types.js";

const REQUIRED_FACTS = [
  "SCRIPT_TIMING_ANCHOR",
  "QUICK_CHANGE_AVAILABLE_WINDOW",
  "ROUTE_TO_CHANGE",
  "MINIMUM_CHANGE_TIME",
  "ROUTE_TO_ENTRY",
] as const;

type RangeValue = { min_ms: number; max_ms: number };

function rangeValue(value: unknown): RangeValue | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.min_ms !== "number" || typeof record.max_ms !== "number") return null;
  return { min_ms: record.min_ms, max_ms: record.max_ms };
}

function minimumValue(value: unknown): number | null {
  if (value === null || typeof value !== "object") return null;
  const min = (value as Record<string, unknown>).min_ms;
  return typeof min === "number" ? min : null;
}

function reviewedValue(candidate: FactCandidate | undefined): unknown {
  if (!candidate) return null;
  return candidate.reviewed_value ?? candidate.raw_value;
}

function secondsFromCell(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) * 1000 : null;
}

function sourceEvidence(
  role: SourceRole,
  sources: Map<SourceRole, InternalSourceVersion>,
  candidates: FactCandidate[],
  reviewedIds: Set<string>,
  revision: CueRevision,
): Evidence {
  const source = sources.get(role);
  const roleCandidates = candidates.filter((candidate) => candidate.source_role === role);
  const primary = roleCandidates[0];
  const roleReviewed = roleCandidates.length > 0 && roleCandidates.every((candidate) => reviewedIds.has(candidate.fact_id));

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

  if (role === "MASTER_CUE") {
    const row = revision.rows.find((candidate) => candidate.id === "R3");
    return {
      role,
      source_id: source.source_id,
      quote: row ? `R3 환복시간 = ${row.환복시간 ?? ""}` : primary?.quote ?? null,
      locator: "MASTER!D3",
      origin: revision.patches.length > 0 ? "USER_PROVIDED" : source.origin,
      review_status: roleReviewed ? "REVIEWED" : "UNREVIEWED",
    };
  }

  return {
    role,
    source_id: source.source_id,
    quote: primary?.quote ?? null,
    locator: primary?.locator ?? null,
    origin: source.origin,
    review_status: roleReviewed ? "REVIEWED" : "UNREVIEWED",
  };
}

export function verifyQuickChange(input: {
  caseId: string;
  sources: Map<SourceRole, InternalSourceVersion>;
  snapshot: InternalReviewSnapshot;
  revision: CueRevision;
}): VerificationResult {
  const candidates = input.snapshot.frozen_candidates;
  const reviewedIds = new Set(input.snapshot.reviewed_fact_ids);
  const reviewedFacts = new Map(
    candidates
      .filter((candidate) => reviewedIds.has(candidate.fact_id))
      .map((candidate) => [candidate.fact_type, candidate]),
  );
  const missingFacts: string[] = REQUIRED_FACTS.filter((factType) => !reviewedFacts.has(factType));

  const evidence: [Evidence, Evidence, Evidence] = [
    sourceEvidence("SCRIPT", input.sources, candidates, reviewedIds, input.revision),
    sourceEvidence("MASTER_CUE", input.sources, candidates, reviewedIds, input.revision),
    sourceEvidence("STAGE_SPEC", input.sources, candidates, reviewedIds, input.revision),
  ];

  let available: RangeValue | null = null;
  let required: RangeValue | null = null;

  if (missingFacts.length === 0) {
    const baseAvailable = rangeValue(reviewedValue(reviewedFacts.get("QUICK_CHANGE_AVAILABLE_WINDOW")));
    const routeToChange = rangeValue(reviewedValue(reviewedFacts.get("ROUTE_TO_CHANGE")));
    const minimumChange = minimumValue(reviewedValue(reviewedFacts.get("MINIMUM_CHANGE_TIME")));
    const routeToEntry = rangeValue(reviewedValue(reviewedFacts.get("ROUTE_TO_ENTRY")));

    if (!baseAvailable || !routeToChange || minimumChange === null || !routeToEntry) {
      missingFacts.push("MALFORMED_REVIEWED_FACT");
    } else {
      available = baseAvailable;
      if (input.revision.patches.length > 0) {
        const row = input.revision.rows.find((candidate) => candidate.id === "R3");
        const patchedMs = row ? secondsFromCell(row.환복시간 ?? "") : null;
        if (patchedMs === null) {
          missingFacts.push("QUICK_CHANGE_AVAILABLE_WINDOW");
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

  let finding: Finding | null = null;
  if (missingFacts.length > 0) {
    finding = {
      finding_id: "finding_e3_vr01",
      event_id: "E3",
      rule_id: "VR-01",
      verdict: "INSUFFICIENT_EVIDENCE",
      calculation: {
        available_min_ms: available?.min_ms ?? null,
        available_max_ms: available?.max_ms ?? null,
        required_min_ms: required?.min_ms ?? null,
        required_max_ms: required?.max_ms ?? null,
      },
      missing_facts: [...new Set(missingFacts)],
      evidence,
      target_locator: { row_id: "R3", column: "환복시간" },
    };
  } else if (available && required && required.min_ms > available.max_ms) {
    finding = {
      finding_id: "finding_e3_vr01",
      event_id: "E3",
      rule_id: "VR-01",
      verdict: "VIOLATION",
      calculation: {
        available_min_ms: available.min_ms,
        available_max_ms: available.max_ms,
        required_min_ms: required.min_ms,
        required_max_ms: required.max_ms,
      },
      missing_facts: [],
      evidence,
      target_locator: { row_id: "R3", column: "환복시간" },
    };
  } else if (available && required && required.max_ms > available.min_ms) {
    finding = {
      finding_id: "finding_e3_vr01",
      event_id: "E3",
      rule_id: "VR-01",
      verdict: "REVIEW",
      calculation: {
        available_min_ms: available.min_ms,
        available_max_ms: available.max_ms,
        required_min_ms: required.min_ms,
        required_max_ms: required.max_ms,
      },
      missing_facts: [],
      evidence,
      target_locator: { row_id: "R3", column: "환복시간" },
    };
  }

  const inputFingerprint = hashJson({
    case_id: input.caseId,
    source_snapshot_digest: input.snapshot.source_snapshot_digest,
    fact_snapshot_digest: input.snapshot.fact_snapshot_digest,
    reviewed_fact_ids: [...input.snapshot.reviewed_fact_ids].sort(),
    revision_hash: input.revision.revision_hash,
    ruleset_version: "standby.rules.v1",
  });
  const findings = finding ? [finding] : [];
  const resultHash = hashJson({ input_fingerprint: inputFingerprint, findings });

  return {
    contract_version: "standby.verification.v1",
    verification_run_id: `verify_${inputFingerprint.slice(0, 16)}`,
    input_fingerprint: inputFingerprint,
    ruleset_version: "standby.rules.v1",
    result_hash: resultHash,
    findings,
  };
}

export function workspaceEvents(verification: VerificationResult): WorkspaceEvent[] {
  const findingIds = verification.findings.map((finding) => finding.finding_id);
  return HERO_EVENT_LABELS.map((label, index) => {
    const eventId = `E${index + 1}`;
    const isE3 = eventId === "E3";
    return {
      event_id: eventId,
      label,
      sequence_index: index,
      aggregate: isE3 && findingIds.length > 0 ? "HAS_FINDING" : "CONSISTENT",
      finding_ids: isE3 ? findingIds : [],
      stage_snapshot: HERO_STAGE_SNAPSHOTS[eventId] ?? {},
    };
  });
}
