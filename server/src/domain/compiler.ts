import { hashJson } from "../lib/hash.js";
import type {
  EventGraph,
  EventGraphAction,
  FactCandidate,
  Finding,
  InternalReviewSnapshot,
  StageEntityState,
  StageZone,
  WorkspaceEvent,
} from "./types.js";

const STAGE_ZONES = new Set<StageZone>([
  "STAGE_RIGHT_WING",
  "STAGE",
  "STAGE_LEFT_WING",
  "STAGE_LEFT_CHANGE",
  "STAGE_RIGHT_CHANGE",
]);

type ObjectValue = Record<string, unknown>;

export type EffectiveReviewedFact = {
  candidate: FactCandidate;
  factType: string;
  value: unknown;
};

function objectValue(value: unknown): ObjectValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stageZone(value: unknown): StageZone | null {
  return typeof value === "string" && STAGE_ZONES.has(value as StageZone)
    ? value as StageZone
    : null;
}

export function effectiveReviewedFacts(snapshot: InternalReviewSnapshot): EffectiveReviewedFact[] {
  const reviewedIds = new Set(snapshot.reviewed_fact_ids);
  return snapshot.frozen_candidates
    .filter((candidate) => reviewedIds.has(candidate.fact_id))
    .map((candidate) => {
      const reviewed = candidate.reviewed_value ?? candidate.raw_value;
      const reviewedObject = objectValue(reviewed);
      const normalizedType = nonEmptyString(reviewedObject?.normalized_fact_type);
      return {
        candidate,
        factType: normalizedType ?? candidate.fact_type,
        value: reviewedObject && "value" in reviewedObject ? reviewedObject.value : reviewed,
      };
    });
}

function eventAction(value: unknown): EventGraphAction | null {
  const action = objectValue(value);
  if (!action) return null;
  const type = nonEmptyString(action.type);
  const sequenceIndex = nonNegativeInteger(action.sequence_index);
  const offsetMs = nonNegativeInteger(action.offset_ms);
  if (!type || sequenceIndex === null || offsetMs === null) return null;

  if (type === "ENTER" || type === "EXIT") {
    const entityId = nonEmptyString(action.entity_id);
    const zone = stageZone(action.zone);
    return entityId && zone
      ? { type, entity_id: entityId, zone, sequence_index: sequenceIndex, offset_ms: offsetMs }
      : null;
  }

  const duration = objectValue(action.duration_ms);
  const durationMin = nonNegativeInteger(duration?.min_ms);
  const durationMax = nonNegativeInteger(duration?.max_ms);
  if (durationMin === null || durationMax === null || durationMin > durationMax) return null;

  if (type === "MOVE") {
    const entityId = nonEmptyString(action.entity_id);
    const from = stageZone(action.from);
    const to = stageZone(action.to);
    return entityId && from && to
      ? {
          type,
          entity_id: entityId,
          from,
          to,
          sequence_index: sequenceIndex,
          offset_ms: offsetMs,
          duration_ms: { min_ms: durationMin, max_ms: durationMax },
        }
      : null;
  }

  if (type === "COSTUME_CHANGE") {
    const actorId = nonEmptyString(action.actor_id);
    const zone = stageZone(action.zone);
    return actorId && zone
      ? {
          type,
          actor_id: actorId,
          zone,
          sequence_index: sequenceIndex,
          offset_ms: offsetMs,
          duration_ms: { min_ms: durationMin, max_ms: durationMax },
        }
      : null;
  }
  return null;
}

function stageSnapshot(value: unknown): Record<string, StageEntityState> | null {
  const snapshot = objectValue(value);
  if (!snapshot) return null;
  const result: Record<string, StageEntityState> = {};
  for (const [entityId, rawState] of Object.entries(snapshot)) {
    const state = objectValue(rawState);
    const zone = stageZone(state?.zone);
    const kind = state?.kind;
    const transition = state?.transition;
    if (
      !entityId || !zone || (kind !== "PERSON" && kind !== "PROP") ||
      (transition !== undefined && transition !== "ENTER" && transition !== "EXIT")
    ) {
      return null;
    }
    result[entityId] = transition ? { kind, zone, transition } : { kind, zone };
  }
  return result;
}

export function compileEventGraph(snapshot: InternalReviewSnapshot): {
  graph: EventGraph;
  stageSnapshots: Record<string, Record<string, StageEntityState>>;
} {
  const eventFacts = effectiveReviewedFacts(snapshot).filter((fact) => fact.factType === "EVENT_STATE");
  const stageSnapshots: Record<string, Record<string, StageEntityState>> = {};
  const events = eventFacts.flatMap((fact) => {
    const value = objectValue(fact.value);
    const eventId = nonEmptyString(value?.event_id);
    const label = nonEmptyString(value?.label);
    const sequenceIndex = nonNegativeInteger(value?.sequence_index);
    const time = objectValue(value?.time_range_ms);
    const minMs = nonNegativeInteger(time?.min_ms);
    const maxMs = nonNegativeInteger(time?.max_ms);
    const snapshotValue = stageSnapshot(value?.stage_snapshot);
    const rawActions = Array.isArray(value?.actions) ? value.actions : [];
    const actions = rawActions.map(eventAction);
    if (
      !eventId || !label || sequenceIndex === null || minMs === null || maxMs === null ||
      minMs > maxMs || !snapshotValue || actions.some((action) => action === null)
    ) {
      return [];
    }
    stageSnapshots[eventId] = snapshotValue;
    return [{
      event_id: eventId,
      sequence_index: sequenceIndex,
      label,
      time_range_ms: { min_ms: minMs, max_ms: maxMs },
      actions: actions as EventGraphAction[],
      source_refs: [{
        source_id: fact.candidate.source_id,
        role: fact.candidate.source_role,
        fact_id: fact.candidate.fact_id,
      }],
    }];
  }).sort((a, b) => a.sequence_index - b.sequence_index || a.event_id.localeCompare(b.event_id));

  const graphSeed = {
    source_snapshot_digest: snapshot.source_snapshot_digest,
    reviewed_event_fact_ids: eventFacts.map((fact) => fact.candidate.fact_id).sort(),
    events,
  };
  return {
    graph: {
      contract_version: "standby.event-graph.v1",
      graph_id: `graph_${hashJson(graphSeed).slice(0, 16)}`,
      source_snapshot_digest: snapshot.source_snapshot_digest,
      compiler_version: "standby.compiler.v1",
      events,
    },
    stageSnapshots,
  };
}

export function workspaceEvents(
  graph: EventGraph,
  stageSnapshots: Record<string, Record<string, StageEntityState>>,
  findings: Finding[],
): WorkspaceEvent[] {
  const knownEventIds = new Set(graph.events.map((event) => event.event_id));
  const events = [...graph.events];
  for (const finding of findings) {
    if (!knownEventIds.has(finding.event_id)) {
      knownEventIds.add(finding.event_id);
      events.push({
        event_id: finding.event_id,
        sequence_index: Number.MAX_SAFE_INTEGER,
        label: finding.event_id,
        time_range_ms: { min_ms: 0, max_ms: 0 },
        actions: [],
        source_refs: [],
      });
    }
  }
  return events
    .sort((a, b) => a.sequence_index - b.sequence_index || a.event_id.localeCompare(b.event_id))
    .map((event, index) => {
      const findingIds = findings
        .filter((finding) => finding.event_id === event.event_id)
        .map((finding) => finding.finding_id);
      return {
        event_id: event.event_id,
        label: event.label,
        sequence_index: event.sequence_index === Number.MAX_SAFE_INTEGER ? index : event.sequence_index,
        aggregate: findingIds.length > 0 ? "HAS_FINDING" : "CONSISTENT",
        finding_ids: findingIds,
        stage_snapshot: stageSnapshots[event.event_id] ?? {},
      };
    });
}

export function asFactObject(value: unknown): ObjectValue | null {
  return objectValue(value);
}

export function asFactString(value: unknown): string | null {
  return nonEmptyString(value);
}

export function asFactNumber(value: unknown): number | null {
  return nonNegativeNumber(value);
}

export function asFactStageZone(value: unknown): StageZone | null {
  return stageZone(value);
}
