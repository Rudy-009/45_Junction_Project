import { DomainError } from "../domain/errors.js";

type ObjectValue = Record<string, unknown>;

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
