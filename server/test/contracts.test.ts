import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import type { ValidateFunction } from "ajv";
import { DomainError } from "../src/domain/errors.js";
import {
  assertEventGraphSemantics,
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
