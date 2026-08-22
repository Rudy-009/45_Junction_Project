import type { FactCandidate, InternalSourceVersion, SourceRole } from "./types.js";

type ObjectValue = Record<string, unknown>;

function objectValue(value: unknown, label: string): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as ObjectValue;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function candidate(
  source: InternalSourceVersion,
  factId: string,
  factType: string,
  rawValue: unknown,
  quote: string,
  locator: string,
): FactCandidate {
  return {
    fact_id: factId,
    fact_type: factType,
    raw_value: rawValue,
    reviewed_value: null,
    source_role: source.role,
    source_id: source.source_id,
    locator,
    quote,
    origin: source.origin,
    confidence: "NOT_PROVIDED",
    review_status: "UNREVIEWED",
  };
}

function extractScript(source: InternalSourceVersion): FactCandidate[] {
  const content = objectValue(source.content, "SCRIPT content");
  const anchor = objectValue(content.timing_anchor, "SCRIPT timing_anchor");
  return [
    candidate(
      source,
      "fact_script_timing_anchor",
      "SCRIPT_TIMING_ANCHOR",
      {
        exit_event: stringValue(anchor.exit_event, "SCRIPT exit_event"),
        next_entry_event: stringValue(anchor.next_entry_event, "SCRIPT next_entry_event"),
      },
      stringValue(anchor.quote, "SCRIPT quote"),
      stringValue(anchor.locator, "SCRIPT locator"),
    ),
  ];
}

function extractMasterCue(source: InternalSourceVersion): FactCandidate[] {
  const content = objectValue(source.content, "MASTER_CUE content");
  const quickChange = objectValue(content.quick_change, "MASTER_CUE quick_change");
  return [
    candidate(
      source,
      "fact_cue_available_window",
      "QUICK_CHANGE_AVAILABLE_WINDOW",
      {
        min_ms: numberValue(quickChange.available_min_ms, "available_min_ms"),
        max_ms: numberValue(quickChange.available_max_ms, "available_max_ms"),
        target: quickChange.target,
      },
      stringValue(quickChange.quote, "MASTER_CUE quote"),
      stringValue(quickChange.locator, "MASTER_CUE locator"),
    ),
  ];
}

function extractStageSpec(source: InternalSourceVersion): FactCandidate[] {
  const content = objectValue(source.content, "STAGE_SPEC content");
  const routes = content.route_times;
  if (!Array.isArray(routes) || routes.length < 2) {
    throw new Error("STAGE_SPEC route_times must contain two routes");
  }
  const outbound = objectValue(routes[0], "route_times[0]");
  const inbound = objectValue(routes[1], "route_times[1]");
  const sourceEvidence = objectValue(content.source_evidence, "STAGE_SPEC source_evidence");
  const quote = stringValue(sourceEvidence.quote, "STAGE_SPEC quote");
  const locator = stringValue(sourceEvidence.locator, "STAGE_SPEC locator");

  return [
    candidate(
      source,
      "fact_stage_route_to_change",
      "ROUTE_TO_CHANGE",
      {
        min_ms: numberValue(outbound.min_ms, "route_to_change min_ms"),
        max_ms: numberValue(outbound.max_ms, "route_to_change max_ms"),
      },
      quote,
      locator,
    ),
    candidate(
      source,
      "fact_stage_minimum_change",
      "MINIMUM_CHANGE_TIME",
      { min_ms: numberValue(content.minimum_change_ms, "minimum_change_ms") },
      quote,
      locator,
    ),
    candidate(
      source,
      "fact_stage_route_to_entry",
      "ROUTE_TO_ENTRY",
      {
        min_ms: numberValue(inbound.min_ms, "route_to_entry min_ms"),
        max_ms: numberValue(inbound.max_ms, "route_to_entry max_ms"),
      },
      quote,
      locator,
    ),
  ];
}

export function extractControlledFixture(
  sources: Map<SourceRole, InternalSourceVersion>,
): FactCandidate[] {
  const script = sources.get("SCRIPT");
  const masterCue = sources.get("MASTER_CUE");
  const stageSpec = sources.get("STAGE_SPEC");
  if (!script || !masterCue || !stageSpec) {
    throw new Error("SCRIPT, MASTER_CUE and STAGE_SPEC are required");
  }

  return [...extractScript(script), ...extractMasterCue(masterCue), ...extractStageSpec(stageSpec)];
}
