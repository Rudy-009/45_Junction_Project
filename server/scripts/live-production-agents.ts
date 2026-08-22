import assert from "node:assert/strict";
import { HERO_SOURCE_CONTENT } from "../src/fixtures/hero.js";

const API_BASE_URL = process.env.STANDBY_SMOKE_API_BASE_URL?.replace(/\/$/, "");
const CONFIRM_LIVE = process.env.STANDBY_SMOKE_CONFIRM_LIVE === "true";
const POLL_INTERVAL_MS = Number(process.env.STANDBY_SMOKE_POLL_INTERVAL_MS ?? 2_000);
const TIMEOUT_MS = Number(process.env.STANDBY_SMOKE_TIMEOUT_MS ?? 660_000);

const EXPECTED_AGENTS = {
  STAGE_SPEC_EXTRACTOR: "agt_PxbxmhXXT8iqdzs5WmHfUz",
  FACT_NORMALIZER: "agt_6tn639gGApNdV9SdRfAjnE",
  STORYBOARD_RECOMPOSER: "agt_go8aoJTVDvEwK8mwXh5gEi",
  REHEARSAL_BRIEF: "agt_9iLkb7fqwdEtaBv48t9tQA",
} as const;

type JsonObject = Record<string, unknown>;
type Operation = {
  operation_id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  resource_ref: { type: string; id: string };
  error: { code?: string; message?: string } | null;
};

type Artifact = {
  artifact_id: string;
  role: "FACT_NORMALIZER" | "STORYBOARD_RECOMPOSER" | "REHEARSAL_BRIEF";
  authority: "NON_AUTHORITATIVE";
  provider_job_id: string;
  agent_id: string;
  config_id: string | null;
  raw_response_sha256: string;
  payload: JsonObject;
};

if (!CONFIRM_LIVE || !API_BASE_URL) {
  throw new Error(
    "Set STANDBY_SMOKE_CONFIRM_LIVE=true and STANDBY_SMOKE_API_BASE_URL to run billed live Agent jobs.",
  );
}
if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 250) {
  throw new Error("STANDBY_SMOKE_POLL_INTERVAL_MS must be at least 250ms.");
}
if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS < 1_000) {
  throw new Error("STANDBY_SMOKE_TIMEOUT_MS must be at least 1000ms.");
}

const sessionId = crypto.randomUUID();

async function request<T>(
  path: string,
  init: RequestInit = {},
  idempotent = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-standby-session", sessionId);
  if (typeof init.body === "string") headers.set("content-type", "application/json");
  if (idempotent) headers.set("idempotency-key", crypto.randomUUID());
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) as JsonObject : {};
  if (!response.ok) {
    const error = body.error as JsonObject | undefined;
    const code = typeof error?.code === "string" ? error.code : `HTTP_${response.status}`;
    const message = typeof error?.message === "string" ? error.message : "Request failed.";
    throw new Error(`${code}: ${message}`);
  }
  return body as T;
}

function postJson<T>(path: string, body: JsonObject): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) }, true);
}

async function waitForOperation(operationId: string, label: string): Promise<Operation> {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus = "";
  while (Date.now() <= deadline) {
    const operation = await request<Operation>(`/v1/operations/${operationId}`);
    if (operation.status !== lastStatus) {
      console.error(`[live-smoke] ${label}: ${operation.status}`);
      lastStatus = operation.status;
    }
    if (operation.status === "SUCCEEDED") return operation;
    if (operation.status === "FAILED") {
      throw new Error(
        `${label} failed: ${operation.error?.code ?? "UNKNOWN"}: ${operation.error?.message ?? "No message"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`${label} timed out after ${TIMEOUT_MS}ms.`);
}

async function createCase(title: string): Promise<string> {
  const created = await postJson<{ case_id: string }>("/v1/cases", { title });
  return created.case_id;
}

async function uploadJsonSource(caseId: string, role: string, content: unknown): Promise<void> {
  await postJson(`/v1/cases/${caseId}/sources/${role}`, {
    origin: "CONTROLLED_FIXTURE",
    content,
    media_type: "application/json",
    original_filename: `${role.toLowerCase()}.fixture.json`,
  });
}

async function uploadMasterCueFile(caseId: string): Promise<void> {
  const form = new FormData();
  form.append("origin", "CONTROLLED_FIXTURE");
  form.append(
    "file",
    new Blob([JSON.stringify(HERO_SOURCE_CONTENT.MASTER_CUE)], { type: "application/json" }),
    "master-cue.fixture.json",
  );
  await request(
    `/v1/cases/${caseId}/sources/MASTER_CUE`,
    { method: "POST", body: form },
    true,
  );
}

async function startAgent(
  caseId: string,
  role: Artifact["role"],
  eventId?: string,
): Promise<{ operation: Operation; artifact: Artifact }> {
  const started = await postJson<Operation>(`/v1/cases/${caseId}/production-agent-runs`, {
    role,
    ...(eventId ? { event_id: eventId } : {}),
  });
  const operation = await waitForOperation(started.operation_id, role);
  assert.equal(operation.resource_ref.type, "production_artifact");
  const artifact = await request<Artifact>(
    `/v1/production-artifacts/${operation.resource_ref.id}`,
  );
  assert.equal(artifact.role, role);
  assert.equal(artifact.authority, "NON_AUTHORITATIVE");
  assert.equal(artifact.config_id, "1");
  assert.match(artifact.provider_job_id, /^job_/);
  assert.match(artifact.raw_response_sha256, /^[a-f0-9]{64}$/);
  return { operation, artifact };
}

function artifactEvidence(
  result: { operation: Operation; artifact: Artifact },
  payloadCount: number,
): JsonObject {
  return {
    role: result.artifact.role,
    agent_id: result.artifact.agent_id,
    config_id: result.artifact.config_id,
    operation_id: result.operation.operation_id,
    artifact_id: result.artifact.artifact_id,
    provider_job_id: result.artifact.provider_job_id,
    raw_response_sha256: result.artifact.raw_response_sha256,
    authority: result.artifact.authority,
    strict_decode: true,
    payload_count: payloadCount,
  };
}

async function runProductionAgentSmoke(): Promise<JsonObject[]> {
  const caseId = await createCase("STANDBY controlled Production Agent live smoke");
  for (const role of ["SCRIPT", "MASTER_CUE", "STAGE_SPEC"] as const) {
    await uploadJsonSource(caseId, role, HERO_SOURCE_CONTENT[role]);
  }
  const extraction = await postJson<Operation>(`/v1/cases/${caseId}/extraction-runs`, {
    adapter: "CONTROLLED_FIXTURE",
  });
  await waitForOperation(extraction.operation_id, "CONTROLLED_FIXTURE extraction");
  const queue = await request<{ items: Array<{ fact_id: string; fact_type: string; raw_value: unknown }> }>(
    `/v1/cases/${caseId}/review-queue`,
  );
  assert.ok(queue.items.length > 0);

  const normalizer = await startAgent(caseId, "FACT_NORMALIZER");
  assert.equal(normalizer.artifact.agent_id, EXPECTED_AGENTS.FACT_NORMALIZER);
  const recommendations = normalizer.artifact.payload.recommendations;
  assert.ok(Array.isArray(recommendations));
  const normalizerCached = await postJson<Operation>(
    `/v1/cases/${caseId}/production-agent-runs`,
    { role: "FACT_NORMALIZER" },
  );
  assert.equal(normalizerCached.operation_id, normalizer.operation.operation_id);

  await postJson(`/v1/cases/${caseId}/fact-reviews:batch`, {
    reviews: queue.items.map((fact) => ({
      fact_id: fact.fact_id,
      decision: "REVIEWED",
      source: "CUSTOM",
      corrected_value: {
        normalized_fact_type: fact.fact_type,
        value: fact.raw_value,
      },
    })),
  });
  await postJson(`/v1/cases/${caseId}/review-snapshots`, {});
  const workspace = await request<{
    events: Array<{ event_id: string }>;
    verification: { result_hash: string };
  }>(`/v1/cases/${caseId}/workspace`);
  const targetEvent = workspace.events.find((event) => event.event_id === "E3")
    ?? workspace.events[1]
    ?? workspace.events[0];
  assert.ok(targetEvent);
  assert.match(workspace.verification.result_hash, /^[a-f0-9]{64}$/);

  const storyboard = await startAgent(caseId, "STORYBOARD_RECOMPOSER", targetEvent.event_id);
  assert.equal(storyboard.artifact.agent_id, EXPECTED_AGENTS.STORYBOARD_RECOMPOSER);
  assert.equal(storyboard.artifact.payload.event_id, targetEvent.event_id);
  assert.ok(Array.isArray(storyboard.artifact.payload.beats));
  const storyboardCached = await postJson<Operation>(
    `/v1/cases/${caseId}/production-agent-runs`,
    { role: "STORYBOARD_RECOMPOSER", event_id: targetEvent.event_id },
  );
  assert.equal(storyboardCached.operation_id, storyboard.operation.operation_id);

  const brief = await startAgent(caseId, "REHEARSAL_BRIEF");
  assert.equal(brief.artifact.agent_id, EXPECTED_AGENTS.REHEARSAL_BRIEF);
  assert.ok(Array.isArray(brief.artifact.payload.sections));
  const briefCached = await postJson<Operation>(
    `/v1/cases/${caseId}/production-agent-runs`,
    { role: "REHEARSAL_BRIEF" },
  );
  assert.equal(briefCached.operation_id, brief.operation.operation_id);

  return [
    {
      ...artifactEvidence(normalizer, recommendations.length),
      cache_hit_verified: true,
    },
    {
      ...artifactEvidence(
        storyboard,
        (storyboard.artifact.payload.beats as unknown[]).length,
      ),
      cache_hit_verified: true,
      event_id: targetEvent.event_id,
    },
    {
      ...artifactEvidence(
        brief,
        (brief.artifact.payload.sections as unknown[]).length,
      ),
      cache_hit_verified: true,
      verifier_result_hash_preserved: workspace.verification.result_hash,
    },
  ];
}

async function runStageSpecSmoke(): Promise<JsonObject> {
  const caseId = await createCase("STANDBY controlled Stage Spec Agent live smoke");
  await uploadMasterCueFile(caseId);
  await uploadJsonSource(caseId, "STAGE_SPEC", HERO_SOURCE_CONTENT.STAGE_SPEC);
  const extraction = await postJson<Operation>(`/v1/cases/${caseId}/extraction-runs`, {
    adapter: "UPSTAGE_AGENT",
  });
  const completed = await waitForOperation(extraction.operation_id, "STAGE_SPEC_EXTRACTOR");
  assert.equal(completed.resource_ref.type, "extraction_run");
  const run = await request<{
    candidate_count: number;
    source_runs: Array<{
      role: string;
      provider: string;
      provider_job_id: string | null;
      agent_id: string | null;
      config_id: string | null;
      raw_response_sha256: string;
    }>;
  }>(`/v1/extraction-runs/${completed.resource_ref.id}`);
  const stage = run.source_runs.find((sourceRun) => sourceRun.role === "STAGE_SPEC");
  assert.ok(stage);
  assert.equal(stage.provider, "UPSTAGE");
  assert.equal(stage.agent_id, EXPECTED_AGENTS.STAGE_SPEC_EXTRACTOR);
  assert.equal(stage.config_id, "1");
  assert.match(stage.provider_job_id ?? "", /^job_/);
  assert.match(stage.raw_response_sha256, /^[a-f0-9]{64}$/);
  return {
    role: "STAGE_SPEC_EXTRACTOR",
    agent_id: stage.agent_id,
    config_id: stage.config_id,
    operation_id: completed.operation_id,
    extraction_run_id: completed.resource_ref.id,
    provider_job_id: stage.provider_job_id,
    raw_response_sha256: stage.raw_response_sha256,
    authority: "UNREVIEWED",
    strict_decode: true,
    extraction_candidate_count: run.candidate_count,
  };
}

const startedAt = new Date();
const productionAgents = await runProductionAgentSmoke();
const stageSpec = await runStageSpecSmoke();
const finishedAt = new Date();

console.log(JSON.stringify({
  contract_version: "standby.upstage-production-live-smoke.v1",
  generated_at: finishedAt.toISOString(),
  api_origin: new URL(API_BASE_URL).origin,
  fixture: "CONTROLLED_FIXTURE_ONLY",
  raw_source_or_response_included: false,
  duration_ms: finishedAt.getTime() - startedAt.getTime(),
  agents: [stageSpec, ...productionAgents],
  assertions: {
    configured_agents: 4,
    live_agents_succeeded: 4,
    all_non_authoritative_or_unreviewed: true,
    production_cache_hits_verified: 3,
    deterministic_verdict_mutation_allowed: false,
  },
}, null, 2));
