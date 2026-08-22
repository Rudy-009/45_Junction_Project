import { NORMALIZED_FACT_TYPES, assertNormalizedFactSemantics } from "../contracts/semantic.js";
import { DomainError } from "./errors.js";
import type {
  FactNormalizerArtifactPayload,
  ProductionAgentRole,
  RehearsalBriefArtifactPayload,
  RehearsalDepartment,
  StageZone,
  StoryboardArtifactPayload,
} from "./types.js";

const STAGE_ZONES = new Set<StageZone>([
  "STAGE_RIGHT_WING",
  "STAGE",
  "STAGE_LEFT_WING",
  "STAGE_LEFT_CHANGE",
  "STAGE_RIGHT_CHANGE",
]);
const STORYBOARD_ACTIONS = new Set(["ENTER", "EXIT", "MOVE", "HOLD"] as const);
const DEPARTMENTS = new Set<RehearsalDepartment>([
  "STAGE_MANAGEMENT",
  "CAST",
  "COSTUME",
  "PROPS",
  "LIGHTING",
  "SOUND",
  "BAND",
]);
const NORMALIZED_TYPES = new Set<string>(NORMALIZED_FACT_TYPES);
const FORBIDDEN_NORMALIZED_VALUE_KEYS = new Set([
  "authority",
  "confidence",
  "fact_id",
  "locator",
  "quote",
  "review_status",
  "source_id",
  "source_locator",
  "source_quote",
  "source_quote_raw",
  "verdict",
  "estimated_duration_sec",
  "costume_change_duration_sec",
]);

type ObjectValue = Record<string, unknown>;

export type StoryboardEntityRule = {
  action: "ENTER" | "EXIT" | "MOVE" | "HOLD";
  from_zone: StageZone | null;
  to_zone: StageZone | null;
};

export type ProductionOutputAllowlist = {
  fact_ids: Set<string>;
  event_ids: Set<string>;
  finding_ids: Set<string>;
  storyboard_event_id: string | null;
  storyboard_entities: Map<string, StoryboardEntityRule>;
};

function invalid(message: string): never {
  throw new DomainError(502, "PRODUCTION_AGENT_RESPONSE_INVALID", message);
}

function exactObject(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid(`${label} must be an object.`);
  }
  const object = value as ObjectValue;
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(object).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    return invalid(`${label} contains unsupported fields.`);
  }
  return object;
}

function boundedString(value: unknown, label: string, maxLength = 1_000): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    return invalid(`${label} must be a non-empty bounded string.`);
  }
  return value.trim();
}

function boundedStringArray(
  value: unknown,
  label: string,
  maximum: number,
  allowedValues?: Set<string>,
): string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    return invalid(`${label} must be a bounded array.`);
  }
  const result = value.map((item, index) => boundedString(item, `${label}[${index}]`, 500));
  if (new Set(result).size !== result.length) {
    return invalid(`${label} must not contain duplicates.`);
  }
  if (allowedValues && result.some((item) => !allowedValues.has(item))) {
    return invalid(`${label} contains a value outside the frozen input.`);
  }
  return result;
}

function nullableZone(value: unknown, label: string): StageZone | null {
  if (value === null) return null;
  if (typeof value !== "string" || !STAGE_ZONES.has(value as StageZone)) {
    return invalid(`${label} must be a known stage zone or null.`);
  }
  return value as StageZone;
}

function assertSafeNormalizedValue(value: unknown, depth = 0): void {
  if (depth > 12) return invalid("Fact normalization value is nested too deeply.");
  if (Array.isArray(value)) {
    if (value.length > 500) return invalid("Fact normalization value contains an oversized array.");
    value.forEach((item) => assertSafeNormalizedValue(item, depth + 1));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const object = value as ObjectValue;
  if (Object.keys(object).length > 200) {
    return invalid("Fact normalization value contains too many fields.");
  }
  for (const [key, child] of Object.entries(object)) {
    if (FORBIDDEN_NORMALIZED_VALUE_KEYS.has(key)) {
      return invalid("Fact normalization value attempts to alter protected provenance or verdict fields.");
    }
    assertSafeNormalizedValue(child, depth + 1);
  }
}

function factNormalizer(
  value: unknown,
  allowlist: ProductionOutputAllowlist,
): FactNormalizerArtifactPayload {
  const output = exactObject(value, "Fact normalizer output", ["recommendations", "missing_evidence"]);
  if (!Array.isArray(output.recommendations) || output.recommendations.length > 500) {
    return invalid("recommendations must be a bounded array.");
  }
  const seen = new Set<string>();
  const recommendations = output.recommendations.map((raw, index) => {
    const item = exactObject(raw, `recommendations[${index}]`, [
      "fact_id",
      "normalized_fact_type",
      "value",
      "confidence",
      "authority",
    ]);
    const factId = boundedString(item.fact_id, `recommendations[${index}].fact_id`, 200);
    if (!allowlist.fact_ids.has(factId) || seen.has(factId)) {
      return invalid("Fact normalization references an unknown or duplicate fact_id.");
    }
    seen.add(factId);
    const normalizedFactType = boundedString(
      item.normalized_fact_type,
      `recommendations[${index}].normalized_fact_type`,
      100,
    );
    if (!NORMALIZED_TYPES.has(normalizedFactType)) {
      return invalid("Fact normalization contains an unsupported normalized_fact_type.");
    }
    if (item.authority !== "NON_AUTHORITATIVE") {
      return invalid("Fact normalization authority must be NON_AUTHORITATIVE.");
    }
    const rawConfidence = item.confidence;
    if (
      rawConfidence !== "HIGH" &&
      rawConfidence !== "LOW" &&
      rawConfidence !== "NOT_PROVIDED"
    ) {
      return invalid("Fact normalization confidence is invalid.");
    }
    const confidence = rawConfidence as "HIGH" | "LOW" | "NOT_PROVIDED";
    const normalizedValue = exactObject(item.value, `recommendations[${index}].value`, Object.keys(
      item.value !== null && typeof item.value === "object" && !Array.isArray(item.value)
        ? item.value as ObjectValue
        : {},
    ));
    if (JSON.stringify(normalizedValue).length > 16_384) {
      return invalid("Fact normalization value is too large.");
    }
    assertSafeNormalizedValue(normalizedValue);
    try {
      assertNormalizedFactSemantics({
        normalized_fact_type: normalizedFactType,
        value: normalizedValue,
      });
    } catch {
      return invalid("Fact normalization value does not satisfy the normalized fact contract.");
    }
    return {
      fact_id: factId,
      normalized_fact_type: normalizedFactType,
      value: structuredClone(normalizedValue),
      confidence,
      authority: "NON_AUTHORITATIVE" as const,
    };
  });
  return {
    recommendations,
    missing_evidence: boundedStringArray(
      output.missing_evidence,
      "missing_evidence",
      50,
    ),
  };
}

function storyboard(
  value: unknown,
  allowlist: ProductionOutputAllowlist,
): StoryboardArtifactPayload {
  const output = exactObject(value, "Storyboard output", [
    "event_id",
    "beats",
    "summary",
    "missing_evidence",
  ]);
  const eventId = boundedString(output.event_id, "event_id", 200);
  if (!allowlist.storyboard_event_id || eventId !== allowlist.storyboard_event_id) {
    return invalid("Storyboard event_id does not match the requested frozen event.");
  }
  if (!Array.isArray(output.beats) || output.beats.length > 100) {
    return invalid("beats must be a bounded array.");
  }
  const seenEntities = new Set<string>();
  const beats = output.beats.map((raw, index) => {
    const item = exactObject(raw, `beats[${index}]`, [
      "entity_id",
      "action",
      "from_zone",
      "to_zone",
      "evidence_fact_ids",
    ]);
    const entityId = boundedString(item.entity_id, `beats[${index}].entity_id`, 200);
    const rule = allowlist.storyboard_entities.get(entityId);
    if (!rule || seenEntities.has(entityId)) {
      return invalid("Storyboard references an unknown or duplicate entity_id.");
    }
    seenEntities.add(entityId);
    if (typeof item.action !== "string" || !STORYBOARD_ACTIONS.has(item.action as never)) {
      return invalid("Storyboard action is invalid.");
    }
    const action = item.action as StoryboardEntityRule["action"];
    const fromZone = nullableZone(item.from_zone, `beats[${index}].from_zone`);
    const toZone = nullableZone(item.to_zone, `beats[${index}].to_zone`);
    if (action !== rule.action || fromZone !== rule.from_zone || toZone !== rule.to_zone) {
      return invalid("Storyboard beat does not match the deterministic stage transition.");
    }
    return {
      entity_id: entityId,
      action,
      from_zone: fromZone,
      to_zone: toZone,
      evidence_fact_ids: boundedStringArray(
        item.evidence_fact_ids,
        `beats[${index}].evidence_fact_ids`,
        20,
        allowlist.fact_ids,
      ),
    };
  });
  return {
    event_id: eventId,
    beats,
    summary: boundedString(output.summary, "summary", 2_000),
    missing_evidence: boundedStringArray(output.missing_evidence, "missing_evidence", 50),
  };
}

function rehearsalBrief(
  value: unknown,
  allowlist: ProductionOutputAllowlist,
): RehearsalBriefArtifactPayload {
  const output = exactObject(value, "Rehearsal brief output", [
    "headline",
    "sections",
    "missing_evidence",
  ]);
  if (!Array.isArray(output.sections) || output.sections.length > 20) {
    return invalid("sections must be a bounded array.");
  }
  const sections = output.sections.map((raw, index) => {
    const section = exactObject(raw, `sections[${index}]`, [
      "department",
      "summary",
      "event_ids",
      "finding_ids",
      "questions",
    ]);
    if (typeof section.department !== "string" || !DEPARTMENTS.has(section.department as never)) {
      return invalid("Rehearsal brief department is invalid.");
    }
    return {
      department: section.department as RehearsalDepartment,
      summary: boundedString(section.summary, `sections[${index}].summary`, 2_000),
      event_ids: boundedStringArray(
        section.event_ids,
        `sections[${index}].event_ids`,
        100,
        allowlist.event_ids,
      ),
      finding_ids: boundedStringArray(
        section.finding_ids,
        `sections[${index}].finding_ids`,
        100,
        allowlist.finding_ids,
      ),
      questions: boundedStringArray(section.questions, `sections[${index}].questions`, 50),
    };
  });
  return {
    headline: boundedString(output.headline, "headline", 500),
    sections,
    missing_evidence: boundedStringArray(output.missing_evidence, "missing_evidence", 50),
  };
}

export function validateProductionAgentOutput(
  role: ProductionAgentRole,
  value: unknown,
  allowlist: ProductionOutputAllowlist,
): FactNormalizerArtifactPayload | StoryboardArtifactPayload | RehearsalBriefArtifactPayload {
  if (role === "FACT_NORMALIZER") return factNormalizer(value, allowlist);
  if (role === "STORYBOARD_RECOMPOSER") return storyboard(value, allowlist);
  return rehearsalBrief(value, allowlist);
}
