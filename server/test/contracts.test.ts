import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import type { ValidateFunction } from "ajv";
import { DomainError } from "../src/domain/errors.js";
import {
  NORMALIZED_FACT_TYPES,
  assertEventGraphSemantics,
  assertNormalizedFactSemantics,
  assertStageSpecSemantics,
  assertVerificationSemantics,
} from "../src/contracts/semantic.js";
import { HERO_SOURCE_CONTENT } from "../src/fixtures/hero.js";
import { hashJson } from "../src/lib/hash.js";

const CONTRACT_DIR = path.resolve(import.meta.dirname, "../../contracts");
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as new (options: object) => {
  compile: (schema: object) => ValidateFunction;
};
const addFormats = require("ajv-formats").default as (ajv: object) => void;

async function validator(filename: string): Promise<ValidateFunction> {
  const schema = JSON.parse(await readFile(path.join(CONTRACT_DIR, filename), "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

test("all contract schemas compile under strict Draft 2020-12", async () => {
  for (const filename of [
    "source.v1.schema.json",
    "extraction.v1.schema.json",
    "stage-spec.v1.schema.json",
    "review-snapshot.v1.schema.json",
    "event-graph.v1.schema.json",
    "verification.v1.schema.json",
    "revision.v1.schema.json",
  ]) {
    await validator(filename);
  }
});

test("hero stage spec is structurally and semantically valid", async () => {
  const validate = await validator("stage-spec.v1.schema.json");
  const stageSpec = HERO_SOURCE_CONTENT.STAGE_SPEC;
  assert.equal(validate(stageSpec), true, JSON.stringify(validate.errors));
  assert.doesNotThrow(() => assertStageSpecSemantics(stageSpec));
});

test("semantic validators reject reversed ranges, duplicate events, and duplicate evidence roles", () => {
  assert.throws(
    () =>
      assertStageSpecSemantics({
        route_times: [{ from: "A", to: "B", min_ms: 4000, max_ms: 3000 }],
        initial_state: [],
      }),
    (error: unknown) => error instanceof DomainError && error.code === "TIME_RANGE_INVALID",
  );

  assert.throws(
    () =>
      assertEventGraphSemantics({
        events: [
          { event_id: "E1", sequence_index: 0 },
          { event_id: "E1", sequence_index: 1 },
        ],
      }),
    (error: unknown) => error instanceof DomainError && error.code === "DUPLICATE_EVENT_ID",
  );

  assert.throws(
    () =>
      assertVerificationSemantics({
        findings: [
          {
            evidence: [
              { role: "SCRIPT" },
              { role: "SCRIPT" },
              { role: "STAGE_SPEC" },
            ],
          },
        ],
      }),
    (error: unknown) => error instanceof DomainError && error.code === "EVIDENCE_ROLES_INVALID",
  );

  assert.throws(
    () => assertNormalizedFactSemantics({ normalized_fact_type: "INVENTED", value: {} }),
    (error: unknown) => error instanceof DomainError && error.code === "NORMALIZED_FACT_TYPE_INVALID",
  );
});

const VALID_NORMALIZED_VALUES: Record<(typeof NORMALIZED_FACT_TYPES)[number], object> = {
  SCRIPT_TIMING_ANCHOR: { exit_event: "E1", next_entry_event: "E7" },
  QUICK_CHANGE_AVAILABLE_WINDOW: {
    min_ms: 58_000,
    max_ms: 62_000,
    target: { row_id: "R3", column: "환복시간" },
  },
  ROUTE_TO_CHANGE: { min_ms: 3_000, max_ms: 4_000 },
  MINIMUM_CHANGE_TIME: { min_ms: 60_000 },
  ROUTE_TO_ENTRY: { min_ms: 3_000, max_ms: 4_000 },
  BLOCKING_SEQUENCE_COMPLETE: { route_id: "HASU_CROSSOVER", event_id: "E6", complete: true },
  ROUTE_CAPACITY: { route_id: "HASU_CROSSOVER", capacity: 1 },
  ROUTE_OCCUPANCY: {
    route_id: "HASU_CROSSOVER",
    event_id: "E6",
    entity_id: "hyewon",
    start_ms: 52_000,
    end_ms: 58_000,
  },
  PROP_INITIAL_STATE: { prop_id: "bag", zone: "STAGE_RIGHT_WING" },
  PROP_SEQUENCE_COMPLETE: { prop_id: "bag", through_event_id: "E8", complete: false },
  PROP_REQUIRED_AT: { event_id: "E8", prop_id: "bag", zone: "STAGE" },
  PROP_MOVE: {
    event_id: "E8",
    sequence_index: 7,
    prop_id: "bag",
    from_zone: "STAGE_RIGHT_WING",
    to_zone: "STAGE",
    responsible_party: "runner-1",
  },
  EVENT_STATE: {
    event_id: "E3",
    sequence_index: 2,
    label: "환복소 이동",
    time_range_ms: { min_ms: 16_000, max_ms: 18_000 },
    actions: [
      {
        type: "ENTER",
        entity_id: "hyewon",
        zone: "STAGE_LEFT_CHANGE",
        sequence_index: 0,
        offset_ms: 0,
      },
      {
        type: "MOVE",
        entity_id: "bag",
        from: "STAGE_RIGHT_WING",
        to: "STAGE",
        sequence_index: 1,
        offset_ms: 1_000,
        duration_ms: { min_ms: 2_000, max_ms: 3_000 },
      },
      {
        type: "COSTUME_CHANGE",
        actor_id: "hyewon",
        zone: "STAGE_LEFT_CHANGE",
        sequence_index: 2,
        offset_ms: 4_000,
        duration_ms: { min_ms: 60_000, max_ms: 60_000 },
      },
    ],
    stage_snapshot: {
      hyewon: { kind: "PERSON", zone: "STAGE_LEFT_CHANGE", transition: "EXIT" },
      bag: { kind: "PROP", zone: "STAGE_RIGHT_WING" },
    },
  },
};

test("all normalized fact types enforce their canonical value shape", () => {
  assert.deepEqual(Object.keys(VALID_NORMALIZED_VALUES), [...NORMALIZED_FACT_TYPES]);
  for (const normalizedFactType of NORMALIZED_FACT_TYPES) {
    assert.doesNotThrow(() => assertNormalizedFactSemantics({
      normalized_fact_type: normalizedFactType,
      value: VALID_NORMALIZED_VALUES[normalizedFactType],
    }), normalizedFactType);
  }
});

test("normalized facts reject missing fields, invalid enums, non-finite numbers, and reversed ranges", () => {
  const invalidValues: Array<{ type: (typeof NORMALIZED_FACT_TYPES)[number]; value: object }> = [
    { type: "SCRIPT_TIMING_ANCHOR", value: { exit_event: "E1" } },
    {
      type: "QUICK_CHANGE_AVAILABLE_WINDOW",
      value: { min_ms: 62_000, max_ms: 58_000, target: { row_id: "R3", column: "환복시간" } },
    },
    { type: "ROUTE_TO_CHANGE", value: { min_ms: 3_000, max_ms: Number.POSITIVE_INFINITY } },
    { type: "ROUTE_CAPACITY", value: { route_id: "HASU_CROSSOVER", capacity: 0 } },
    {
      type: "ROUTE_OCCUPANCY",
      value: { route_id: "R", event_id: "E6", entity_id: "actor", start_ms: 2, end_ms: 2 },
    },
    { type: "PROP_INITIAL_STATE", value: { prop_id: "bag", zone: "DRESSING_ROOM" } },
    {
      type: "PROP_MOVE",
      value: {
        event_id: "E8",
        sequence_index: 1.5,
        prop_id: "bag",
        from_zone: "STAGE_RIGHT_WING",
        to_zone: "STAGE",
        responsible_party: "runner-1",
      },
    },
    {
      type: "EVENT_STATE",
      value: {
        ...VALID_NORMALIZED_VALUES.EVENT_STATE,
        time_range_ms: { min_ms: 18_000, max_ms: 16_000 },
      },
    },
    {
      type: "EVENT_STATE",
      value: {
        ...VALID_NORMALIZED_VALUES.EVENT_STATE,
        actions: [{
          type: "MOVE",
          entity_id: "bag",
          from: "STAGE_RIGHT_WING",
          to: "STAGE",
          sequence_index: 1,
          offset_ms: 0,
          duration_ms: { min_ms: 4_000, max_ms: 3_000 },
        }],
      },
    },
    {
      type: "EVENT_STATE",
      value: {
        ...VALID_NORMALIZED_VALUES.EVENT_STATE,
        stage_snapshot: { hyewon: { kind: "ACTOR", zone: "STAGE" } },
      },
    },
  ];

  for (const invalidFact of invalidValues) {
    assert.throws(
      () => assertNormalizedFactSemantics({
        normalized_fact_type: invalidFact.type,
        value: invalidFact.value,
      }),
      (error: unknown) => error instanceof DomainError && error.code === "NORMALIZED_FACT_VALUE_INVALID",
      invalidFact.type,
    );
  }

  assert.throws(
    () => assertNormalizedFactSemantics({
      normalized_fact_type: "MINIMUM_CHANGE_TIME",
      value: { min_ms: 60_000, verdict: "CONSISTENT" },
    }),
    (error: unknown) => error instanceof DomainError && error.code === "NORMALIZED_FACT_VALUE_INVALID",
  );
});

test("strict schemas reject an action without required timing and a finding without 3 evidence blocks", async () => {
  const graphValidator = await validator("event-graph.v1.schema.json");
  const graph = {
    contract_version: "standby.event-graph.v1",
    graph_id: "graph_fixture",
    source_snapshot_digest: hashJson("sources"),
    compiler_version: "compiler.v1",
    events: [
      {
        event_id: "E3",
        sequence_index: 2,
        label: "환복소 이동",
        time_range_ms: { min_ms: 8000, max_ms: 8000 },
        actions: [
          {
            type: "COSTUME_CHANGE",
            actor_id: "hyewon",
            zone: "STAGE_LEFT_CHANGE",
            sequence_index: 0,
            offset_ms: 0
          }
        ],
        source_refs: [{ source_id: "source_1", role: "SCRIPT", fact_id: "fact_1" }]
      }
    ]
  };
  assert.equal(graphValidator(graph), false);

  const verificationValidator = await validator("verification.v1.schema.json");
  const verification = {
    contract_version: "standby.verification.v1",
    verification_run_id: "verify_fixture",
    input_fingerprint: hashJson("input"),
    ruleset_version: "rules.v1",
    result_hash: hashJson("result"),
    findings: [
      {
        finding_id: "finding_1",
        event_id: "E3",
        rule_id: "VR-01",
        verdict: "VIOLATION",
        calculation: {},
        missing_facts: [],
        evidence: [],
        target_locator: { row_id: "R3", column: "환복시간" }
      }
    ]
  };
  assert.equal(verificationValidator(verification), false);
});
