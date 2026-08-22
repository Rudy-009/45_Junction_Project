import { DomainError } from "../domain/errors.js";

type ObjectValue = Record<string, unknown>;

export const NORMALIZED_FACT_TYPES = [
  "SCRIPT_TIMING_ANCHOR",
  "QUICK_CHANGE_AVAILABLE_WINDOW",
  "ROUTE_TO_CHANGE",
  "MINIMUM_CHANGE_TIME",
  "ROUTE_TO_ENTRY",
  "BLOCKING_SEQUENCE_COMPLETE",
  "ROUTE_CAPACITY",
  "ROUTE_OCCUPANCY",
  "PROP_INITIAL_STATE",
  "PROP_SEQUENCE_COMPLETE",
  "PROP_REQUIRED_AT",
  "PROP_MOVE",
  "EVENT_STATE",
] as const;

const NORMALIZED_FACT_TYPE_SET = new Set<string>(NORMALIZED_FACT_TYPES);
const STAGE_ZONE_SET = new Set([
  "STAGE_RIGHT_WING",
  "STAGE",
  "STAGE_LEFT_WING",
  "STAGE_LEFT_CHANGE",
  "STAGE_RIGHT_CHANGE",
]);
const STAGE_ENTITY_KIND_SET = new Set(["PERSON", "PROP"]);
const STAGE_TRANSITION_SET = new Set(["ENTER", "EXIT"]);

function asObject(value: unknown, label: string): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(422, "CONTRACT_VIOLATION", `${label} must be an object.`);
  }
  return value as ObjectValue;
}
function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DomainError(422, "CONTRACT_VIOLATION", `${label} must be an array.`);
  }
  return value;
}

export function assertStageSpecSemantics(value: unknown): void {
  const stage = asObject(value, "stage spec");
  const routes = asArray(stage.route_times, "route_times");
  for (const [index, routeValue] of routes.entries()) {
    const route = asObject(routeValue, `route_times[${index}]`);
    if (route.from === route.to) {
      throw new DomainError(422, "ROUTE_INVALID", "Route endpoints must be different.");
    }
    if (
      typeof route.min_ms !== "number" ||
      typeof route.max_ms !== "number" ||
      route.min_ms > route.max_ms
    ) {
      throw new DomainError(422, "TIME_RANGE_INVALID", "Route min_ms must not exceed max_ms.");
    }
  }

  if (stage.route_capacities !== undefined) {
    const capacities = asArray(stage.route_capacities, "route_capacities");
    const routeIds = capacities.map((capacityValue, index) => {
      const capacity = asObject(capacityValue, `route_capacities[${index}]`);
      if (typeof capacity.capacity !== "number" || !Number.isInteger(capacity.capacity) || capacity.capacity < 1) {
        throw new DomainError(422, "ROUTE_CAPACITY_INVALID", "Route capacity must be a positive integer.");
      }
      return String(capacity.route_id ?? "");
    });
    if (new Set(routeIds).size !== routeIds.length) {
      throw new DomainError(422, "DUPLICATE_ROUTE_CAPACITY", "Route capacity IDs must be unique.");
    }
  }

  const states = asArray(stage.initial_state, "initial_state");
  const entityIds = states.map((state, index) =>
    String(asObject(state, `initial_state[${index}]`).entity_id ?? ""),
  );
  if (new Set(entityIds).size !== entityIds.length) {
    throw new DomainError(422, "DUPLICATE_ENTITY_ID", "initial_state entity IDs must be unique.");
  }
}

export function assertEventGraphSemantics(value: unknown): void {
  const graph = asObject(value, "event graph");
  const events = asArray(graph.events, "events");
  const eventIds = events.map((event, index) =>
    String(asObject(event, `events[${index}]`).event_id ?? ""),
  );
  const sequenceIndexes = events.map((event, index) =>
    Number(asObject(event, `events[${index}]`).sequence_index),
  );
  if (new Set(eventIds).size !== eventIds.length) {
    throw new DomainError(422, "DUPLICATE_EVENT_ID", "event IDs must be unique.");
  }
  if (new Set(sequenceIndexes).size !== sequenceIndexes.length) {
    throw new DomainError(422, "DUPLICATE_EVENT_SEQUENCE", "event sequence indexes must be unique.");
  }
}

export function assertVerificationSemantics(value: unknown): void {
  const verification = asObject(value, "verification");
  const findings = asArray(verification.findings, "findings");
  for (const [index, findingValue] of findings.entries()) {
    const finding = asObject(findingValue, `findings[${index}]`);
    const evidence = asArray(finding.evidence, `findings[${index}].evidence`);
    const roles = evidence.map((item, evidenceIndex) =>
      String(asObject(item, `evidence[${evidenceIndex}]`).role ?? ""),
    );
    const expected = ["MASTER_CUE", "SCRIPT", "STAGE_SPEC"];
    if ([...new Set(roles)].sort().join(",") !== expected.join(",")) {
      throw new DomainError(
        422,
        "EVIDENCE_ROLES_INVALID",
        "Every finding must contain exactly SCRIPT, MASTER_CUE and STAGE_SPEC evidence.",
      );
    }
  }
}

export function assertNormalizedFactSemantics(value: unknown): void {
  if (value === null) {
    normalizedValueInvalid("REVIEWED facts require a normalized fact envelope.");
  }
  const envelope = asObject(value, "corrected_value");
  if (
    typeof envelope.normalized_fact_type !== "string" ||
    !NORMALIZED_FACT_TYPE_SET.has(envelope.normalized_fact_type)
  ) {
    throw new DomainError(422, "NORMALIZED_FACT_TYPE_INVALID", "Unknown normalized fact type.");
  }
  const envelopeKeys = Object.keys(envelope);
  if (
    envelopeKeys.length !== 2 ||
    !envelopeKeys.includes("normalized_fact_type") ||
    !envelopeKeys.includes("value")
  ) {
    normalizedValueInvalid(
      "Normalized fact envelope must contain only normalized_fact_type and value.",
    );
  }

  const factType = envelope.normalized_fact_type as typeof NORMALIZED_FACT_TYPES[number];
  const factValue = normalizedObject(envelope.value, `${factType}.value`);
  validateNormalizedFactValue(factType, factValue);
}

function normalizedValueInvalid(message: string): never {
  throw new DomainError(422, "NORMALIZED_FACT_VALUE_INVALID", message);
}

function normalizedObject(value: unknown, label: string): ObjectValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return normalizedValueInvalid(`${label} must be an object.`);
  }
  return value as ObjectValue;
}

function exactNormalizedObject(
  value: unknown,
  label: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): ObjectValue {
  const object = normalizedObject(value, label);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const missingKeys = requiredKeys.filter((key) => !(key in object));
  const unexpectedKeys = Object.keys(object).filter((key) => !allowedKeys.has(key));
  if (missingKeys.length > 0 || unexpectedKeys.length > 0) {
    return normalizedValueInvalid(`${label} fields do not match the normalized fact contract.`);
  }
  return object;
}

function normalizedString(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > 2_000 ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    return normalizedValueInvalid(`${label} must be a bounded string${allowEmpty ? "" : " with content"}.`);
  }
  return value;
}

function normalizedInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return normalizedValueInvalid(`${label} must be a finite integer greater than or equal to ${minimum}.`);
  }
  return value as number;
}

function normalizedBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    return normalizedValueInvalid(`${label} must be a boolean.`);
  }
  return value;
}

function normalizedZone(value: unknown, label: string): string {
  if (typeof value !== "string" || !STAGE_ZONE_SET.has(value)) {
    return normalizedValueInvalid(`${label} must be a canonical stage zone.`);
  }
  return value;
}

function normalizedRange(value: unknown, label: string): { min_ms: number; max_ms: number } {
  const range = exactNormalizedObject(value, label, ["min_ms", "max_ms"]);
  const minMs = normalizedInteger(range.min_ms, `${label}.min_ms`);
  const maxMs = normalizedInteger(range.max_ms, `${label}.max_ms`);
  if (minMs > maxMs) {
    return normalizedValueInvalid(`${label}.min_ms must not exceed max_ms.`);
  }
  return { min_ms: minMs, max_ms: maxMs };
}

function validateEventAction(value: unknown, label: string): void {
  const action = normalizedObject(value, label);
  const type = action.type;
  if (type === "ENTER" || type === "EXIT") {
    const exact = exactNormalizedObject(action, label, [
      "type",
      "entity_id",
      "zone",
      "sequence_index",
      "offset_ms",
    ]);
    normalizedString(exact.entity_id, `${label}.entity_id`);
    normalizedZone(exact.zone, `${label}.zone`);
    normalizedInteger(exact.sequence_index, `${label}.sequence_index`);
    normalizedInteger(exact.offset_ms, `${label}.offset_ms`);
    return;
  }
  if (type === "MOVE") {
    const exact = exactNormalizedObject(action, label, [
      "type",
      "entity_id",
      "from",
      "to",
      "sequence_index",
      "offset_ms",
      "duration_ms",
    ]);
    normalizedString(exact.entity_id, `${label}.entity_id`);
    normalizedZone(exact.from, `${label}.from`);
    normalizedZone(exact.to, `${label}.to`);
    normalizedInteger(exact.sequence_index, `${label}.sequence_index`);
    normalizedInteger(exact.offset_ms, `${label}.offset_ms`);
    normalizedRange(exact.duration_ms, `${label}.duration_ms`);
    return;
  }
  if (type === "COSTUME_CHANGE") {
    const exact = exactNormalizedObject(action, label, [
      "type",
      "actor_id",
      "zone",
      "sequence_index",
      "offset_ms",
      "duration_ms",
    ]);
    normalizedString(exact.actor_id, `${label}.actor_id`);
    normalizedZone(exact.zone, `${label}.zone`);
    normalizedInteger(exact.sequence_index, `${label}.sequence_index`);
    normalizedInteger(exact.offset_ms, `${label}.offset_ms`);
    normalizedRange(exact.duration_ms, `${label}.duration_ms`);
    return;
  }
  normalizedValueInvalid(`${label}.type is not a supported event action.`);
}

function validateStageSnapshot(value: unknown, label: string): void {
  const snapshot = normalizedObject(value, label);
  if (Object.keys(snapshot).length > 500) {
    normalizedValueInvalid(`${label} contains too many entities.`);
  }
  for (const [entityId, rawState] of Object.entries(snapshot)) {
    normalizedString(entityId, `${label} entity_id`);
    const state = exactNormalizedObject(rawState, `${label}.${entityId}`, ["kind", "zone"], [
      "transition",
    ]);
    if (typeof state.kind !== "string" || !STAGE_ENTITY_KIND_SET.has(state.kind)) {
      normalizedValueInvalid(`${label}.${entityId}.kind must be PERSON or PROP.`);
    }
    normalizedZone(state.zone, `${label}.${entityId}.zone`);
    if (
      state.transition !== undefined &&
      (typeof state.transition !== "string" || !STAGE_TRANSITION_SET.has(state.transition))
    ) {
      normalizedValueInvalid(`${label}.${entityId}.transition must be ENTER or EXIT.`);
    }
  }
}

function validateNormalizedFactValue(
  factType: typeof NORMALIZED_FACT_TYPES[number],
  value: ObjectValue,
): void {
  if (factType === "SCRIPT_TIMING_ANCHOR") {
    const exact = exactNormalizedObject(value, factType, ["exit_event", "next_entry_event"]);
    normalizedString(exact.exit_event, `${factType}.exit_event`);
    normalizedString(exact.next_entry_event, `${factType}.next_entry_event`);
    return;
  }

  if (
    factType === "QUICK_CHANGE_AVAILABLE_WINDOW" ||
    factType === "ROUTE_TO_CHANGE" ||
    factType === "ROUTE_TO_ENTRY"
  ) {
    const required = factType === "QUICK_CHANGE_AVAILABLE_WINDOW"
      ? ["min_ms", "max_ms", "target"]
      : ["min_ms", "max_ms"];
    const exact = exactNormalizedObject(value, factType, required);
    const minMs = normalizedInteger(exact.min_ms, `${factType}.min_ms`);
    const maxMs = normalizedInteger(exact.max_ms, `${factType}.max_ms`);
    if (minMs > maxMs) {
      normalizedValueInvalid(`${factType}.min_ms must not exceed max_ms.`);
    }
    if (factType === "QUICK_CHANGE_AVAILABLE_WINDOW") {
      const target = exactNormalizedObject(exact.target, `${factType}.target`, ["row_id", "column"]);
      normalizedString(target.row_id, `${factType}.target.row_id`);
      normalizedString(target.column, `${factType}.target.column`);
    }
    return;
  }

  if (factType === "MINIMUM_CHANGE_TIME") {
    const exact = exactNormalizedObject(value, factType, ["min_ms"]);
    normalizedInteger(exact.min_ms, `${factType}.min_ms`);
    return;
  }

  if (factType === "BLOCKING_SEQUENCE_COMPLETE") {
    const exact = exactNormalizedObject(value, factType, ["route_id", "event_id", "complete"]);
    normalizedString(exact.route_id, `${factType}.route_id`);
    normalizedString(exact.event_id, `${factType}.event_id`);
    normalizedBoolean(exact.complete, `${factType}.complete`);
    return;
  }

  if (factType === "ROUTE_CAPACITY") {
    const exact = exactNormalizedObject(value, factType, ["route_id", "capacity"]);
    normalizedString(exact.route_id, `${factType}.route_id`);
    normalizedInteger(exact.capacity, `${factType}.capacity`, 1);
    return;
  }

  if (factType === "ROUTE_OCCUPANCY") {
    const exact = exactNormalizedObject(value, factType, [
      "route_id",
      "event_id",
      "entity_id",
      "start_ms",
      "end_ms",
    ]);
    normalizedString(exact.route_id, `${factType}.route_id`);
    normalizedString(exact.event_id, `${factType}.event_id`);
    normalizedString(exact.entity_id, `${factType}.entity_id`);
    const startMs = normalizedInteger(exact.start_ms, `${factType}.start_ms`);
    const endMs = normalizedInteger(exact.end_ms, `${factType}.end_ms`);
    if (startMs >= endMs) {
      normalizedValueInvalid(`${factType}.start_ms must be less than end_ms.`);
    }
    return;
  }

  if (factType === "PROP_INITIAL_STATE") {
    const exact = exactNormalizedObject(value, factType, ["prop_id", "zone"]);
    normalizedString(exact.prop_id, `${factType}.prop_id`);
    normalizedZone(exact.zone, `${factType}.zone`);
    return;
  }

  if (factType === "PROP_SEQUENCE_COMPLETE") {
    const exact = exactNormalizedObject(value, factType, ["prop_id", "through_event_id", "complete"]);
    normalizedString(exact.prop_id, `${factType}.prop_id`);
    normalizedString(exact.through_event_id, `${factType}.through_event_id`);
    normalizedBoolean(exact.complete, `${factType}.complete`);
    return;
  }

  if (factType === "PROP_REQUIRED_AT") {
    const exact = exactNormalizedObject(value, factType, ["event_id", "prop_id", "zone"]);
    normalizedString(exact.event_id, `${factType}.event_id`);
    normalizedString(exact.prop_id, `${factType}.prop_id`);
    normalizedZone(exact.zone, `${factType}.zone`);
    return;
  }

  if (factType === "PROP_MOVE") {
    const exact = exactNormalizedObject(value, factType, [
      "event_id",
      "sequence_index",
      "prop_id",
      "from_zone",
      "to_zone",
      "responsible_party",
    ]);
    normalizedString(exact.event_id, `${factType}.event_id`);
    normalizedInteger(exact.sequence_index, `${factType}.sequence_index`);
    normalizedString(exact.prop_id, `${factType}.prop_id`);
    normalizedZone(exact.from_zone, `${factType}.from_zone`);
    normalizedZone(exact.to_zone, `${factType}.to_zone`);
    normalizedString(exact.responsible_party, `${factType}.responsible_party`, true);
    return;
  }

  const exact = exactNormalizedObject(value, factType, [
    "event_id",
    "sequence_index",
    "label",
    "time_range_ms",
    "actions",
    "stage_snapshot",
  ]);
  normalizedString(exact.event_id, `${factType}.event_id`);
  normalizedInteger(exact.sequence_index, `${factType}.sequence_index`);
  normalizedString(exact.label, `${factType}.label`);
  normalizedRange(exact.time_range_ms, `${factType}.time_range_ms`);
  if (!Array.isArray(exact.actions) || exact.actions.length > 500) {
    normalizedValueInvalid(`${factType}.actions must be a bounded array.`);
  }
  exact.actions.forEach((action, index) => validateEventAction(action, `${factType}.actions[${index}]`));
  validateStageSnapshot(exact.stage_snapshot, `${factType}.stage_snapshot`);
}
