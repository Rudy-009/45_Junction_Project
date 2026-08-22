import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import type { ValidateFunction } from "ajv";
import { assertEventGraphSemantics, assertVerificationSemantics } from "../src/contracts/semantic.js";
import { compileEventGraph, workspaceEvents } from "../src/domain/compiler.js";
import { extractControlledFixture } from "../src/domain/extraction.js";
import type {
  CueRevision,
  FactCandidate,
  InternalReviewSnapshot,
  InternalSourceVersion,
  SourceRole,
} from "../src/domain/types.js";
import { verifyProduction } from "../src/domain/verifier.js";
import { HERO_ROWS, HERO_SOURCE_CONTENT } from "../src/fixtures/hero.js";
import { hashJson } from "../src/lib/hash.js";

const CONTRACT_DIR = path.resolve(import.meta.dirname, "../../contracts");
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as new (options: object) => {
  compile: (schema: object) => ValidateFunction;
};

async function contractValidator(filename: string): Promise<ValidateFunction> {
  const schema = JSON.parse(await readFile(path.join(CONTRACT_DIR, filename), "utf8")) as object;
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function source(role: SourceRole): InternalSourceVersion {
  const content = structuredClone(HERO_SOURCE_CONTENT[role]);
  return {
    contract_version: "standby.source.v1",
    source_id: `source_${role.toLowerCase()}`,
    case_id: "case_m2",
    role,
    sha256: hashJson(content),
    origin: "CONTROLLED_FIXTURE",
    authority: "REVIEWED",
    media_type: "application/json",
    original_filename: `${role.toLowerCase()}.fixture.json`,
    created_at: "2026-08-22T00:00:00.000Z",
    content,
    bytes: null,
  };
}

function fixture() {
  const sources = new Map<SourceRole, InternalSourceVersion>([
    ["SCRIPT", source("SCRIPT")],
    ["MASTER_CUE", source("MASTER_CUE")],
    ["STAGE_SPEC", source("STAGE_SPEC")],
  ]);
  const facts = extractControlledFixture(sources);
  return { sources, facts };
}

function snapshot(facts: FactCandidate[], reviewed = true): InternalReviewSnapshot {
  return {
    contract_version: "standby.review-snapshot.v1",
    snapshot_id: "snapshot_m2",
    case_id: "case_m2",
    source_snapshot_digest: hashJson("m2-sources"),
    fact_snapshot_digest: hashJson(facts),
    reviewed_fact_ids: reviewed ? facts.map((fact) => fact.fact_id).sort() : [],
    reviewed_link_ids: [],
    frozen_by: "test-user",
    frozen_at: "2026-08-22T00:00:00.000Z",
    frozen_candidates: structuredClone(facts),
  };
}

function revision(): CueRevision {
  const sourceHash = hashJson(HERO_SOURCE_CONTENT.MASTER_CUE);
  return {
    contract_version: "standby.revision.v1",
    revision_id: "revision_m2",
    case_id: "case_m2",
    parent_revision_id: null,
    base_source_sha256: sourceHash,
    revision_hash: sourceHash,
    patches: [],
    created_by: "source-upload",
    created_at: "2026-08-22T00:00:00.000Z",
    rows: structuredClone(HERO_ROWS),
  };
}

test("M2 abstains on every rule until facts are reviewed", async () => {
  const { sources, facts } = fixture();
  const frozen = snapshot(facts, false);
  const verification = verifyProduction({ caseId: "case_m2", sources, snapshot: frozen, revision: revision() });
  assert.deepEqual(
    verification.findings.map((finding) => [finding.rule_id, finding.verdict]),
    [
      ["VR-01", "INSUFFICIENT_EVIDENCE"],
      ["VR-02", "INSUFFICIENT_EVIDENCE"],
      ["VR-03", "INSUFFICIENT_EVIDENCE"],
    ],
  );
  assert.ok(verification.findings.every((finding) => finding.evidence.length === 3));
  const emptyGraph = compileEventGraph(frozen).graph;
  assert.equal(emptyGraph.events.length, 0);
  const graphValidator = await contractValidator("event-graph.v1.schema.json");
  assert.equal(graphValidator(emptyGraph), true, JSON.stringify(graphValidator.errors));
});

test("M2 compiles eight reviewed events and reproduces all three deterministic findings", async () => {
  const { sources, facts } = fixture();
  const frozen = snapshot(facts);
  const first = verifyProduction({ caseId: "case_m2", sources, snapshot: frozen, revision: revision() });
  const second = verifyProduction({ caseId: "case_m2", sources, snapshot: frozen, revision: revision() });
  assert.equal(first.result_hash, second.result_hash);
  assert.deepEqual(
    first.findings.map((finding) => [finding.rule_id, finding.verdict, finding.event_id]),
    [
      ["VR-01", "VIOLATION", "E3"],
      ["VR-02", "VIOLATION", "E6"],
      ["VR-03", "REVIEW", "E8"],
    ],
  );
  assert.ok(first.findings.every((finding) =>
    finding.evidence.map((evidence) => evidence.role).join(",") === "SCRIPT,MASTER_CUE,STAGE_SPEC" &&
    finding.evidence.every((evidence) => evidence.review_status === "REVIEWED")
  ));

  const compiled = compileEventGraph(frozen);
  const graphValidator = await contractValidator("event-graph.v1.schema.json");
  const verificationValidator = await contractValidator("verification.v1.schema.json");
  assert.equal(graphValidator(compiled.graph), true, JSON.stringify(graphValidator.errors));
  assert.equal(verificationValidator(first), true, JSON.stringify(verificationValidator.errors));
  assert.doesNotThrow(() => assertEventGraphSemantics(compiled.graph));
  assert.doesNotThrow(() => assertVerificationSemantics(first));
  assert.equal(compiled.graph.events.length, 8);
  assert.deepEqual(compiled.graph.events.map((event) => event.event_id), ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);
  const events = workspaceEvents(compiled.graph, compiled.stageSnapshots, first.findings);
  assert.equal(events.find((event) => event.event_id === "E3")?.finding_ids.length, 1);
  assert.equal(events.find((event) => event.event_id === "E6")?.finding_ids.length, 1);
  assert.equal(events.find((event) => event.event_id === "E8")?.finding_ids.length, 1);
});

test("M2 preserves tight review and a clean control without false positives", () => {
  const { sources, facts } = fixture();
  const tightFacts = structuredClone(facts);
  const available = tightFacts.find((fact) => fact.fact_type === "QUICK_CHANGE_AVAILABLE_WINDOW");
  assert.ok(available);
  available.raw_value = { ...(available.raw_value as object), min_ms: 62000, max_ms: 70000 };
  const tight = verifyProduction({
    caseId: "case_m2",
    sources,
    snapshot: snapshot(tightFacts),
    revision: revision(),
  });
  assert.equal(tight.findings.find((finding) => finding.rule_id === "VR-01")?.verdict, "REVIEW");

  const cleanFacts = structuredClone(facts);
  const minimum = cleanFacts.find((fact) => fact.fact_type === "MINIMUM_CHANGE_TIME");
  const capacity = cleanFacts.find((fact) => fact.fact_type === "ROUTE_CAPACITY");
  assert.ok(minimum && capacity);
  minimum.raw_value = { min_ms: 45000 };
  capacity.raw_value = { route_id: "HASU_CROSSOVER", capacity: 2 };
  cleanFacts.push({
    fact_id: "fact_cue_prop_move_clean",
    fact_type: "PROP_MOVE",
    raw_value: {
      event_id: "E8",
      sequence_index: 7,
      prop_id: "bag",
      from_zone: "STAGE_RIGHT_WING",
      to_zone: "STAGE",
      responsible_party: "runner-1",
    },
    reviewed_value: null,
    source_role: "MASTER_CUE",
    source_id: "source_master_cue",
    locator: "MASTER!H8",
    quote: "runner-1이 마루가방을 무대로 이동",
    origin: "CONTROLLED_FIXTURE",
    confidence: "NOT_PROVIDED",
    review_status: "REVIEWED",
  });
  const clean = verifyProduction({
    caseId: "case_m2",
    sources,
    snapshot: snapshot(cleanFacts),
    revision: revision(),
  });
  assert.deepEqual(clean.findings, []);
});

test("M2 fails closed on ambiguous quick-change facts and invalid stage zones", () => {
  const { sources, facts } = fixture();
  const ambiguousFacts = structuredClone(facts);
  const duplicate = structuredClone(
    ambiguousFacts.find((fact) => fact.fact_type === "MINIMUM_CHANGE_TIME"),
  );
  assert.ok(duplicate);
  duplicate.fact_id = "fact_stage_minimum_change_duplicate";
  ambiguousFacts.push(duplicate);
  const ambiguous = verifyProduction({
    caseId: "case_m2",
    sources,
    snapshot: snapshot(ambiguousFacts),
    revision: revision(),
  });
  const quickChange = ambiguous.findings.find((finding) => finding.rule_id === "VR-01");
  assert.equal(quickChange?.verdict, "INSUFFICIENT_EVIDENCE");
  assert.ok(quickChange?.missing_facts.includes("AMBIGUOUS_REVIEWED_FACT:MINIMUM_CHANGE_TIME"));

  const invalidZoneFacts = structuredClone(facts);
  const initial = invalidZoneFacts.find((fact) => fact.fact_type === "PROP_INITIAL_STATE");
  assert.ok(initial);
  initial.raw_value = { prop_id: "bag", zone: "DRESSING_ROOM_UNKNOWN" };
  const invalidZone = verifyProduction({
    caseId: "case_m2",
    sources,
    snapshot: snapshot(invalidZoneFacts),
    revision: revision(),
  });
  assert.equal(
    invalidZone.findings.find((finding) => finding.rule_id === "VR-03")?.verdict,
    "INSUFFICIENT_EVIDENCE",
  );
});
