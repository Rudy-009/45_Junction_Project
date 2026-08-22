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
  const facts = [
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
  if (content.blocking_sequence) {
    const blocking = objectValue(content.blocking_sequence, "SCRIPT blocking_sequence");
    facts.push(candidate(
      source,
      "fact_script_blocking_complete",
      "BLOCKING_SEQUENCE_COMPLETE",
      {
        route_id: stringValue(blocking.route_id, "blocking route_id"),
        event_id: stringValue(blocking.event_id, "blocking event_id"),
        complete: blocking.complete === true,
      },
      stringValue(blocking.quote, "blocking quote"),
      stringValue(blocking.locator, "blocking locator"),
    ));
  }
  if (content.prop_requirement) {
    const prop = objectValue(content.prop_requirement, "SCRIPT prop_requirement");
    facts.push(candidate(
      source,
      "fact_script_prop_required",
      "PROP_REQUIRED_AT",
      {
        event_id: stringValue(prop.event_id, "prop event_id"),
        prop_id: stringValue(prop.prop_id, "prop prop_id"),
        zone: stringValue(prop.zone, "prop zone"),
      },
      stringValue(prop.quote, "prop quote"),
      stringValue(prop.locator, "prop locator"),
    ));
  }
  return facts;
}

function extractMasterCue(source: InternalSourceVersion): FactCandidate[] {
  const content = objectValue(source.content, "MASTER_CUE content");
  const quickChange = objectValue(content.quick_change, "MASTER_CUE quick_change");
  const facts = [
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
  if (Array.isArray(content.blocking_occupancies)) {
    for (const [index, rawOccupancy] of content.blocking_occupancies.entries()) {
      const occupancy = objectValue(rawOccupancy, `MASTER_CUE blocking_occupancies[${index}]`);
      facts.push(candidate(
        source,
        `fact_cue_occupancy_${index + 1}`,
        "ROUTE_OCCUPANCY",
        {
          route_id: stringValue(occupancy.route_id, "occupancy route_id"),
          event_id: stringValue(occupancy.event_id, "occupancy event_id"),
          entity_id: stringValue(occupancy.entity_id, "occupancy entity_id"),
          start_ms: numberValue(occupancy.start_ms, "occupancy start_ms"),
          end_ms: numberValue(occupancy.end_ms, "occupancy end_ms"),
        },
        stringValue(occupancy.quote, "occupancy quote"),
        stringValue(occupancy.locator, "occupancy locator"),
      ));
    }
  }
  if (content.prop_sequence) {
    const prop = objectValue(content.prop_sequence, "MASTER_CUE prop_sequence");
    facts.push(candidate(
      source,
      "fact_cue_prop_sequence_complete",
      "PROP_SEQUENCE_COMPLETE",
      {
        prop_id: stringValue(prop.prop_id, "prop_sequence prop_id"),
        through_event_id: stringValue(prop.through_event_id, "prop_sequence through_event_id"),
        complete: prop.complete === true,
      },
      stringValue(prop.quote, "prop_sequence quote"),
      stringValue(prop.locator, "prop_sequence locator"),
    ));
  }
  if (Array.isArray(content.prop_moves)) {
    for (const [index, rawMove] of content.prop_moves.entries()) {
      const move = objectValue(rawMove, `MASTER_CUE prop_moves[${index}]`);
      facts.push(candidate(
        source,
        `fact_cue_prop_move_${index + 1}`,
        "PROP_MOVE",
        {
          event_id: stringValue(move.event_id, "prop_move event_id"),
          sequence_index: numberValue(move.sequence_index, "prop_move sequence_index"),
          prop_id: stringValue(move.prop_id, "prop_move prop_id"),
          from_zone: stringValue(move.from_zone, "prop_move from_zone"),
          to_zone: stringValue(move.to_zone, "prop_move to_zone"),
          responsible_party: typeof move.responsible_party === "string" ? move.responsible_party : "",
        },
        stringValue(move.quote, "prop_move quote"),
        stringValue(move.locator, "prop_move locator"),
      ));
    }
  }
  if (Array.isArray(content.event_states)) {
    for (const [index, rawEvent] of content.event_states.entries()) {
      const event = objectValue(rawEvent, `MASTER_CUE event_states[${index}]`);
      facts.push(candidate(
        source,
        `fact_cue_event_${index + 1}`,
        "EVENT_STATE",
        {
          event_id: stringValue(event.event_id, "event_state event_id"),
          sequence_index: numberValue(event.sequence_index, "event_state sequence_index"),
          label: stringValue(event.label, "event_state label"),
          time_range_ms: structuredClone(event.time_range_ms),
          actions: structuredClone(event.actions),
          stage_snapshot: structuredClone(event.stage_snapshot),
        },
        stringValue(event.quote, "event_state quote"),
        stringValue(event.locator, "event_state locator"),
      ));
    }
  }
  return facts;
}

export function extractStageSpec(source: InternalSourceVersion): FactCandidate[] {
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

  const facts = [
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
  if (Array.isArray(content.route_capacities)) {
    for (const [index, rawCapacity] of content.route_capacities.entries()) {
      const capacity = objectValue(rawCapacity, `route_capacities[${index}]`);
      facts.push(candidate(
        source,
        `fact_stage_route_capacity_${index + 1}`,
        "ROUTE_CAPACITY",
        {
          route_id: stringValue(capacity.route_id, "route capacity route_id"),
          capacity: numberValue(capacity.capacity, "route capacity"),
        },
        quote,
        locator,
      ));
    }
  }
  if (Array.isArray(content.initial_state)) {
    for (const [index, rawState] of content.initial_state.entries()) {
      const state = objectValue(rawState, `initial_state[${index}]`);
      if (state.kind !== "PROP") continue;
      facts.push(candidate(
        source,
        `fact_stage_prop_initial_${index + 1}`,
        "PROP_INITIAL_STATE",
        {
          prop_id: stringValue(state.entity_id, "initial prop entity_id"),
          zone: stringValue(state.zone, "initial prop zone"),
        },
        quote,
        locator,
      ));
    }
  }
  return facts;
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

  return [
    ...extractScript(script),
    ...extractMasterCue(masterCue),
    ...extractStageSpec(stageSpec),
  ];
}
