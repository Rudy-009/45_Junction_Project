import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type {
  FactCandidate,
  ReviewSnapshot,
  SourceRole,
  SourceVersion,
  WorkspaceSnapshot,
} from "../src/domain/types.js";
import { HERO_SOURCE_CONTENT } from "../src/fixtures/hero.js";

const TOKEN = "test-token";
let app: FastifyInstance;
let keySequence = 0;

before(async () => {
  app = await buildApp({
    apiToken: TOKEN,
    allowedOrigins: ["http://localhost:5173"],
  });
});

after(async () => {
  await app.close();
});

function headers(idempotent = false): Record<string, string> {
  const result: Record<string, string> = { authorization: `Bearer ${TOKEN}` };
  if (idempotent) {
    keySequence += 1;
    result["idempotency-key"] = `test-key-${keySequence}`;
  }
  return result;
}

function customReview(fact: FactCandidate) {
  return {
    fact_id: fact.fact_id,
    decision: "REVIEWED",
    source: "CUSTOM",
    corrected_value: {
      normalized_fact_type: fact.fact_type,
      value: fact.raw_value,
    },
  };
}

async function createHeroCase() {
  const create = await app.inject({
    method: "POST",
    url: "/v1/cases",
    headers: headers(true),
    payload: { title: "우주비행사가 된 마루" },
  });
  assert.equal(create.statusCode, 201, create.body);
  const caseId = (create.json() as { case_id: string }).case_id;

  const sources = new Map<SourceRole, SourceVersion>();
  for (const role of ["SCRIPT", "MASTER_CUE", "STAGE_SPEC"] as const) {
    const response = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/sources/${role}`,
      headers: headers(true),
      payload: {
        origin: "CONTROLLED_FIXTURE",
        content: HERO_SOURCE_CONTENT[role],
        media_type: "application/json",
        original_filename: `${role.toLowerCase()}.fixture.json`,
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    sources.set(role, response.json() as SourceVersion);
  }

  const extraction = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/extraction-runs`,
    headers: headers(true),
    payload: { adapter: "CONTROLLED_FIXTURE" },
  });
  assert.equal(extraction.statusCode, 202, extraction.body);

  return { caseId, sources };
}

test("health is public but domain endpoints require a valid actor session", async () => {
  const health = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(health.statusCode, 200);

  const unauthorized = await app.inject({ method: "GET", url: "/v1/cases/nope/workspace" });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal((unauthorized.json() as { error: { code: string } }).error.code, "UNAUTHENTICATED");
});

test("reviewed facts require normalized values and failed batches are atomic", async () => {
  const { caseId } = await createHeroCase();
  const queueResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/review-queue`,
    headers: headers(),
  });
  assert.equal(queueResponse.statusCode, 200, queueResponse.body);
  const facts = (queueResponse.json() as { items: FactCandidate[] }).items;
  const first = facts[0];
  const second = facts[1];
  assert.ok(first);
  assert.ok(second);

  const missingNormalizedValue = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/fact-reviews:batch`,
    headers: headers(true),
    payload: {
      reviews: [{ fact_id: first.fact_id, decision: "REVIEWED", source: "CUSTOM" }],
    },
  });
  assert.equal(missingNormalizedValue.statusCode, 422, missingNormalizedValue.body);
  assert.equal(
    (missingNormalizedValue.json() as { error: { code: string } }).error.code,
    "NORMALIZED_FACT_VALUE_REQUIRED",
  );

  const failedBatch = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/fact-reviews:batch`,
    headers: headers(true),
    payload: {
      reviews: [
        customReview(first),
        { fact_id: "fact_missing", decision: "REJECTED" },
      ],
    },
  });
  assert.equal(failedBatch.statusCode, 404, failedBatch.body);

  const afterFailure = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/review-queue`,
    headers: headers(),
  });
  assert.equal(afterFailure.statusCode, 200, afterFailure.body);
  const statuses = new Map(
    (afterFailure.json() as { items: FactCandidate[] }).items.map((fact) => [
      fact.fact_id,
      fact.review_status,
    ]),
  );
  assert.equal(statuses.get(first.fact_id), "UNREVIEWED");
  assert.equal(statuses.get(second.fact_id), "UNREVIEWED");
});

test("unreviewed facts abstain, reviewed facts violate, and a 70s revision clears E3", async () => {
  const { caseId, sources } = await createHeroCase();

  const queueResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/review-queue`,
    headers: headers(),
  });
  assert.equal(queueResponse.statusCode, 200, queueResponse.body);
  const queue = queueResponse.json() as { items: FactCandidate[] };
  assert.equal(queue.items.length, 20);
  assert.ok(queue.items.every((fact) => fact.review_status === "UNREVIEWED"));

  const unreviewedSnapshotResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/review-snapshots`,
    headers: headers(true),
    payload: {},
  });
  assert.equal(unreviewedSnapshotResponse.statusCode, 201, unreviewedSnapshotResponse.body);

  const abstainedResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/workspace`,
    headers: headers(),
  });
  assert.equal(abstainedResponse.statusCode, 200, abstainedResponse.body);
  const abstained = abstainedResponse.json() as WorkspaceSnapshot;
  assert.deepEqual(
    abstained.findings.map((finding) => [finding.rule_id, finding.verdict]),
    [
      ["VR-01", "INSUFFICIENT_EVIDENCE"],
      ["VR-02", "INSUFFICIENT_EVIDENCE"],
      ["VR-03", "INSUFFICIENT_EVIDENCE"],
    ],
  );
  assert.ok(abstained.findings.every((finding) => finding.evidence.length === 3));

  const reviewsResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/fact-reviews:batch`,
    headers: headers(true),
    payload: {
      reviews: queue.items.map(customReview),
    },
  });
  assert.equal(reviewsResponse.statusCode, 201, reviewsResponse.body);

  const reviewedSnapshotResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/review-snapshots`,
    headers: headers(true),
    payload: {},
  });
  assert.equal(reviewedSnapshotResponse.statusCode, 201, reviewedSnapshotResponse.body);
  const reviewedSnapshot = reviewedSnapshotResponse.json() as ReviewSnapshot;
  assert.equal(reviewedSnapshot.reviewed_fact_ids.length, 20);
  assert.match(reviewedSnapshot.fact_snapshot_digest, /^[a-f0-9]{64}$/);

  const violationResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/workspace`,
    headers: headers(),
  });
  assert.equal(violationResponse.statusCode, 200, violationResponse.body);
  const violation = violationResponse.json() as WorkspaceSnapshot;
  const quickViolation = violation.findings.find((finding) => finding.rule_id === "VR-01");
  assert.equal(quickViolation?.verdict, "VIOLATION");
  assert.deepEqual(quickViolation?.calculation, {
    available_min_ms: 58000,
    available_max_ms: 62000,
    required_min_ms: 66000,
    required_max_ms: 68000,
  });
  assert.deepEqual(
    quickViolation?.evidence.map((evidence) => evidence.role),
    ["SCRIPT", "MASTER_CUE", "STAGE_SPEC"],
  );
  assert.ok(quickViolation?.evidence.every((evidence) => evidence.review_status === "REVIEWED"));
  assert.equal(violation.findings.find((finding) => finding.rule_id === "VR-02")?.verdict, "VIOLATION");
  assert.equal(violation.findings.find((finding) => finding.rule_id === "VR-03")?.verdict, "REVIEW");
  assert.equal(violation.event_graph.events.length, 8);
  assert.equal(violation.events.length, 8);

  const minimumChangeFact = queue.items.find(
    (fact) => fact.fact_type === "MINIMUM_CHANGE_TIME",
  );
  assert.ok(minimumChangeFact);
  const rejectionResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/fact-reviews:batch`,
    headers: headers(true),
    payload: {
      reviews: [{ fact_id: minimumChangeFact.fact_id, decision: "REJECTED" }],
    },
  });
  assert.equal(rejectionResponse.statusCode, 201, rejectionResponse.body);

  const frozenSnapshotResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/workspace`,
    headers: headers(),
  });
  assert.equal(frozenSnapshotResponse.statusCode, 200, frozenSnapshotResponse.body);
  const frozenSnapshot = frozenSnapshotResponse.json() as WorkspaceSnapshot;
  assert.equal(frozenSnapshot.verification.result_hash, violation.verification.result_hash);
  assert.equal(frozenSnapshot.findings.find((finding) => finding.rule_id === "VR-01")?.verdict, "VIOLATION");

  const rejectedSnapshotResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/review-snapshots`,
    headers: headers(true),
    payload: {},
  });
  assert.equal(rejectedSnapshotResponse.statusCode, 201, rejectedSnapshotResponse.body);
  const rejectedSnapshot = rejectedSnapshotResponse.json() as ReviewSnapshot;
  assert.notEqual(rejectedSnapshot.fact_snapshot_digest, reviewedSnapshot.fact_snapshot_digest);

  const insufficientResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/workspace`,
    headers: headers(),
  });
  assert.equal(insufficientResponse.statusCode, 200, insufficientResponse.body);
  assert.equal(
    (insufficientResponse.json() as WorkspaceSnapshot).findings.find(
      (finding) => finding.rule_id === "VR-01",
    )?.verdict,
    "INSUFFICIENT_EVIDENCE",
  );

  const restoreReviewResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/fact-reviews:batch`,
    headers: headers(true),
    payload: {
      reviews: [customReview(minimumChangeFact)],
    },
  });
  assert.equal(restoreReviewResponse.statusCode, 201, restoreReviewResponse.body);

  const restoredSnapshotResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/review-snapshots`,
    headers: headers(true),
    payload: {},
  });
  assert.equal(restoredSnapshotResponse.statusCode, 201, restoredSnapshotResponse.body);
  const restoredSnapshot = restoredSnapshotResponse.json() as ReviewSnapshot;
  assert.equal(restoredSnapshot.fact_snapshot_digest, reviewedSnapshot.fact_snapshot_digest);

  const originalHash = sources.get("MASTER_CUE")?.sha256;
  assert.equal(violation.original_master_cue_sha256, originalHash);
  const revisionKey = headers(true);
  const revisionPayload = {
    base_revision_id: violation.cue_revision_id,
    base_source_sha256: originalHash,
    patches: [{ row_id: "R3", column: "환복시간", from: "58s", to: "70s" }],
  };
  const revisionResponse = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/cue-revisions`,
    headers: revisionKey,
    payload: revisionPayload,
  });
  assert.equal(revisionResponse.statusCode, 201, revisionResponse.body);
  const revision = revisionResponse.json() as { revision_id: string; base_source_sha256: string };
  assert.equal(revision.base_source_sha256, originalHash);
  assert.notEqual(revision.revision_id, violation.cue_revision_id);

  const revisionListResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/cue-revisions`,
    headers: headers(),
  });
  assert.equal(revisionListResponse.statusCode, 200, revisionListResponse.body);
  const revisionItems = (revisionListResponse.json() as { items: Array<{ revision_id: string; rows?: unknown }> }).items;
  assert.equal(revisionItems.length, 2);
  assert.equal(revisionItems.some((item) => "rows" in item), false);

  const revisionDetailResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/cue-revisions/${revision.revision_id}`,
    headers: headers(),
  });
  assert.equal(revisionDetailResponse.statusCode, 200, revisionDetailResponse.body);
  const revisionDetail = revisionDetailResponse.json() as { rows: Array<Record<string, string>> };
  const expectedPatch = revisionPayload.patches[0];
  assert.equal(
    revisionDetail.rows.find((row) => row.id === expectedPatch.row_id)?.[expectedPatch.column],
    expectedPatch.to,
  );

  const repeatedRevision = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/cue-revisions`,
    headers: revisionKey,
    payload: revisionPayload,
  });
  assert.equal(repeatedRevision.statusCode, 201, repeatedRevision.body);
  assert.deepEqual(repeatedRevision.json(), revisionResponse.json());

  const consistentResponse = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/workspace`,
    headers: headers(),
  });
  assert.equal(consistentResponse.statusCode, 200, consistentResponse.body);
  const consistent = consistentResponse.json() as WorkspaceSnapshot;
  assert.equal(consistent.findings.some((finding) => finding.rule_id === "VR-01"), false);
  assert.equal(consistent.findings.find((finding) => finding.rule_id === "VR-02")?.verdict, "VIOLATION");
  assert.equal(consistent.findings.find((finding) => finding.rule_id === "VR-03")?.verdict, "REVIEW");
  assert.equal(consistent.events.find((event) => event.event_id === "E3")?.aggregate, "CONSISTENT");
  assert.equal(consistent.original_master_cue_sha256, originalHash);
  assert.notEqual(consistent.cue_revision_id, violation.cue_revision_id);
});

test("an idempotency key cannot be reused with another payload", async () => {
  const key = headers(true);
  const first = await app.inject({
    method: "POST",
    url: "/v1/cases",
    headers: key,
    payload: { title: "first" },
  });
  assert.equal(first.statusCode, 201);

  const second = await app.inject({
    method: "POST",
    url: "/v1/cases",
    headers: key,
    payload: { title: "second" },
  });
  assert.equal(second.statusCode, 409);
  assert.equal((second.json() as { error: { code: string } }).error.code, "IDEMPOTENCY_KEY_REUSED");
});
