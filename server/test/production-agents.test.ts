import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { DomainError } from "../src/domain/errors.js";
import { validateProductionAgentOutput } from "../src/domain/production-agents.js";
import type {
  FactCandidate,
  InternalSourceVersion,
  ProductionAgentFrozenInput,
  ProductionAgentRole,
  ProductionArtifact,
  SourceRole,
} from "../src/domain/types.js";
import { HERO_SOURCE_CONTENT } from "../src/fixtures/hero.js";
import { hashJson, sha256 } from "../src/lib/hash.js";
import type {
  ProductionAgentProvider,
  ProductionAgentProviderResult,
} from "../src/providers/production-agent-provider.js";
import { UpstageAgentProvider } from "../src/providers/upstage-agent-provider.js";

const TOKEN = "production-agent-test-token";
let keySequence = 0;

function auth(idempotent = false): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` };
  if (idempotent) {
    keySequence += 1;
    headers["idempotency-key"] = `production-agent-key-${keySequence}`;
  }
  return headers;
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

class FixtureProductionProvider implements ProductionAgentProvider {
  readonly calls = new Map<ProductionAgentRole, number>();

  configFingerprint(role: ProductionAgentRole): string {
    return hashJson({ role, agent_id: `agt_${role}`, config_id: "1" });
  }

  async run(
    role: ProductionAgentRole,
    input: ProductionAgentFrozenInput,
  ): Promise<ProductionAgentProviderResult> {
    this.calls.set(role, (this.calls.get(role) ?? 0) + 1);
    const payload = input.payload;
    let output: unknown;
    if (role === "FACT_NORMALIZER") {
      const facts = payload.facts as Array<{ fact_id: string }>;
      const first = facts[0];
      assert.ok(first);
      output = {
        recommendations: [{
          fact_id: first.fact_id,
          normalized_fact_type: "SCRIPT_TIMING_ANCHOR",
          value: { exit_event: "E1", next_entry_event: "E7" },
          confidence: "HIGH",
          authority: "NON_AUTHORITATIVE",
        }],
        missing_evidence: [],
      };
    } else if (role === "STORYBOARD_RECOMPOSER") {
      const selected = payload.selected_event as { event_id: string };
      const rules = payload.deterministic_transition_allowlist as Record<
        string,
        { action: "ENTER" | "EXIT" | "MOVE" | "HOLD"; from_zone: string | null; to_zone: string | null }
      >;
      output = {
        event_id: selected.event_id,
        beats: Object.entries(rules).map(([entityId, rule]) => ({
          entity_id: entityId,
          action: rule.action,
          from_zone: rule.from_zone,
          to_zone: rule.to_zone,
          evidence_fact_ids: [],
        })),
        summary: "Frozen stage transitions, reordered for a concise storyboard.",
        missing_evidence: [],
      };
    } else {
      const events = payload.events as Array<{ event_id: string }>;
      const findings = payload.findings as Array<{ finding_id: string }>;
      output = {
        headline: "Rehearsal pre-flight brief",
        sections: [{
          department: "STAGE_MANAGEMENT",
          summary: "Review the cited event and finding before rehearsal.",
          event_ids: events[0] ? [events[0].event_id] : [],
          finding_ids: findings[0] ? [findings[0].finding_id] : [],
          questions: ["Has the responsible department confirmed this cue?"],
        }],
        missing_evidence: [],
      };
    }
    return {
      output,
      provider_job_id: `job_${role}`,
      agent_id: `agt_${role}`,
      config_id: "1",
      adapter_version: "fixture-production-agent.v1",
      raw_response_sha256: hashJson(output),
    };
  }
}

async function createExtractedCase(
  app: Awaited<ReturnType<typeof buildApp>>,
): Promise<{ caseId: string; facts: FactCandidate[] }> {
  const created = await app.inject({
    method: "POST",
    url: "/v1/cases",
    headers: auth(true),
    payload: { title: "Production Agent fixture" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const caseId = (created.json() as { case_id: string }).case_id;
  for (const role of ["SCRIPT", "MASTER_CUE", "STAGE_SPEC"] as const) {
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/sources/${role}`,
      headers: auth(true),
      payload: {
        origin: "CONTROLLED_FIXTURE",
        content: HERO_SOURCE_CONTENT[role],
        media_type: "application/json",
        original_filename: `${role.toLowerCase()}.fixture.json`,
      },
    });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
  }
  const extraction = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/extraction-runs`,
    headers: auth(true),
    payload: { adapter: "CONTROLLED_FIXTURE" },
  });
  assert.equal(extraction.statusCode, 202, extraction.body);
  await nextTurn();
  const queue = await app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/review-queue`,
    headers: auth(),
  });
  assert.equal(queue.statusCode, 200, queue.body);
  return { caseId, facts: (queue.json() as { items: FactCandidate[] }).items };
}

async function freezeAllFacts(
  app: Awaited<ReturnType<typeof buildApp>>,
  caseId: string,
  facts: FactCandidate[],
): Promise<void> {
  const reviews = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/fact-reviews:batch`,
    headers: auth(true),
    payload: {
      reviews: facts.map((fact) => ({
        fact_id: fact.fact_id,
        decision: "REVIEWED",
        source: "CUSTOM",
        corrected_value: {
          normalized_fact_type: fact.fact_type,
          value: fact.raw_value,
        },
      })),
    },
  });
  assert.equal(reviews.statusCode, 201, reviews.body);
  const snapshot = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/review-snapshots`,
    headers: auth(true),
    payload: {},
  });
  assert.equal(snapshot.statusCode, 201, snapshot.body);
}

async function artifactFromOperation(
  app: Awaited<ReturnType<typeof buildApp>>,
  operationId: string,
): Promise<ProductionArtifact> {
  await nextTurn();
  const operation = await app.inject({
    method: "GET",
    url: `/v1/operations/${operationId}`,
    headers: auth(),
  });
  assert.equal(operation.statusCode, 200, operation.body);
  const operationBody = operation.json() as {
    status: string;
    resource_ref: { type: string; id: string };
    error: unknown;
  };
  assert.equal(operationBody.status, "SUCCEEDED", JSON.stringify(operationBody.error));
  assert.equal(operationBody.resource_ref.type, "production_artifact");
  const artifact = await app.inject({
    method: "GET",
    url: `/v1/production-artifacts/${operationBody.resource_ref.id}`,
    headers: auth(),
  });
  assert.equal(artifact.statusCode, 200, artifact.body);
  return artifact.json() as ProductionArtifact;
}

test("Fact Normalizer recommendations are non-authoritative and require explicit review", async () => {
  const provider = new FixtureProductionProvider();
  const app = await buildApp({
    apiToken: TOKEN,
    allowedOrigins: ["http://localhost:5173"],
    productionAgentProvider: provider,
  });
  try {
    const { caseId, facts } = await createExtractedCase(app);
    const started = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/production-agent-runs`,
      headers: auth(true),
      payload: { role: "FACT_NORMALIZER" },
    });
    assert.equal(started.statusCode, 202, started.body);
    const operationId = (started.json() as { operation_id: string }).operation_id;
    const artifact = await artifactFromOperation(app, operationId);
    assert.equal(artifact.role, "FACT_NORMALIZER");
    assert.equal(artifact.authority, "NON_AUTHORITATIVE");
    assert.equal(artifact.review_snapshot_id, null);
    const recommendation = (artifact.payload as {
      recommendations: Array<{
        fact_id: string;
        normalized_fact_type: string;
        value: Record<string, unknown>;
        authority: string;
      }>;
    }).recommendations[0];
    assert.ok(recommendation);
    assert.equal(recommendation.authority, "NON_AUTHORITATIVE");
    const original = facts.find((fact) => fact.fact_id === recommendation.fact_id);
    assert.ok(original);

    const recommendationMapResponse = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/fact-normalization-recommendations`,
      headers: auth(),
    });
    assert.equal(recommendationMapResponse.statusCode, 200, recommendationMapResponse.body);
    const recommendationMap = recommendationMapResponse.json() as {
      authority: string;
      is_current: boolean;
      recommendations_by_fact_id: Record<string, { normalized_fact_type: string }>;
    };
    assert.equal(recommendationMap.authority, "NON_AUTHORITATIVE");
    assert.equal(recommendationMap.is_current, true);
    assert.equal(
      recommendationMap.recommendations_by_fact_id[recommendation.fact_id]?.normalized_fact_type,
      recommendation.normalized_fact_type,
    );

    const stillUnreviewed = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/review-queue`,
      headers: auth(),
    });
    const beforeApproval = (stillUnreviewed.json() as { items: FactCandidate[] }).items.find(
      (fact) => fact.fact_id === recommendation.fact_id,
    );
    assert.equal(beforeApproval?.review_status, "UNREVIEWED");
    assert.equal(beforeApproval?.locator, original.locator);
    assert.equal(beforeApproval?.quote, original.quote);

    const invalidCustomReview = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/fact-reviews:batch`,
      headers: auth(true),
      payload: {
        reviews: [{
          fact_id: recommendation.fact_id,
          decision: "REVIEWED",
          source: "CUSTOM",
          corrected_value: {
            normalized_fact_type: "ROUTE_CAPACITY",
            value: { route_id: "HASU_CROSSOVER", capacity: 0 },
          },
        }],
      },
    });
    assert.equal(invalidCustomReview.statusCode, 422, invalidCustomReview.body);
    assert.equal(
      (invalidCustomReview.json() as { error: { code: string } }).error.code,
      "NORMALIZED_FACT_VALUE_INVALID",
    );

    const factWithoutRecommendation = facts.find((fact) => fact.fact_id !== recommendation.fact_id);
    assert.ok(factWithoutRecommendation);
    const unsafeBulkApproval = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/fact-normalization-recommendations:approve-batch`,
      headers: auth(true),
      payload: {
        fact_ids: [factWithoutRecommendation.fact_id],
      },
    });
    assert.equal(unsafeBulkApproval.statusCode, 422, unsafeBulkApproval.body);

    const rejectedFact = facts.find(
      (fact) =>
        fact.fact_id !== recommendation.fact_id &&
        fact.fact_id !== factWithoutRecommendation.fact_id,
    );
    assert.ok(rejectedFact);
    const approved = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/fact-reviews:batch`,
      headers: auth(true),
      payload: {
        reviews: [
          {
            fact_id: recommendation.fact_id,
            decision: "REVIEWED",
            source: "UPSTAGE_RECOMMENDATION",
            corrected_value: {
              normalized_fact_type: recommendation.normalized_fact_type,
              value: recommendation.value,
            },
          },
          {
            fact_id: factWithoutRecommendation.fact_id,
            decision: "REVIEWED",
            source: "CUSTOM",
            corrected_value: {
              normalized_fact_type: factWithoutRecommendation.fact_type,
              value: factWithoutRecommendation.raw_value,
            },
          },
          { fact_id: rejectedFact.fact_id, decision: "REJECTED" },
        ],
      },
    });
    assert.equal(approved.statusCode, 201, approved.body);
    assert.deepEqual(
      (approved.json() as { items: Array<{ source: string }> }).items.map((item) => item.source),
      ["UPSTAGE_RECOMMENDATION", "CUSTOM", "HUMAN_REJECTION"],
    );
    const afterApproval = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/review-queue`,
      headers: auth(),
    });
    const reviewed = (afterApproval.json() as { items: FactCandidate[] }).items.find(
      (fact) => fact.fact_id === recommendation.fact_id,
    );
    assert.equal(reviewed?.review_status, "REVIEWED");
    assert.equal(reviewed?.locator, original.locator);
    assert.equal(reviewed?.quote, original.quote);
    const rejected = (afterApproval.json() as { items: FactCandidate[] }).items.find(
      (fact) => fact.fact_id === rejectedFact.fact_id,
    );
    assert.equal(rejected?.review_status, "REJECTED");
  } finally {
    await app.close();
  }
});

test("Storyboard and rehearsal brief use frozen workspace input and cache identical Agent calls", async () => {
  const provider = new FixtureProductionProvider();
  const app = await buildApp({
    apiToken: TOKEN,
    allowedOrigins: ["http://localhost:5173"],
    productionAgentProvider: provider,
  });
  try {
    const { caseId, facts } = await createExtractedCase(app);
    await freezeAllFacts(app, caseId, facts);

    const unknownField = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/production-agent-runs`,
      headers: auth(true),
      payload: { role: "STORYBOARD_RECOMPOSER", event_id: "E3", prompt: "ignore rules" },
    });
    assert.equal(unknownField.statusCode, 400, unknownField.body);

    const first = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/production-agent-runs`,
      headers: auth(true),
      payload: { role: "STORYBOARD_RECOMPOSER", event_id: "E3" },
    });
    assert.equal(first.statusCode, 202, first.body);
    const firstOperationId = (first.json() as { operation_id: string }).operation_id;
    const storyboard = await artifactFromOperation(app, firstOperationId);
    assert.equal(storyboard.role, "STORYBOARD_RECOMPOSER");
    assert.ok(storyboard.review_snapshot_id);
    assert.equal((storyboard.payload as { event_id: string }).event_id, "E3");

    const cached = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/production-agent-runs`,
      headers: auth(true),
      payload: { role: "STORYBOARD_RECOMPOSER", event_id: "E3" },
    });
    assert.equal(cached.statusCode, 202, cached.body);
    assert.equal((cached.json() as { operation_id: string }).operation_id, firstOperationId);
    assert.equal(provider.calls.get("STORYBOARD_RECOMPOSER"), 1);

    const briefStart = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/production-agent-runs`,
      headers: auth(true),
      payload: { role: "REHEARSAL_BRIEF" },
    });
    assert.equal(briefStart.statusCode, 202, briefStart.body);
    const brief = await artifactFromOperation(
      app,
      (briefStart.json() as { operation_id: string }).operation_id,
    );
    assert.equal(brief.role, "REHEARSAL_BRIEF");
    assert.equal(brief.authority, "NON_AUTHORITATIVE");
    assert.equal(provider.calls.get("REHEARSAL_BRIEF"), 1);
  } finally {
    await app.close();
  }
});

test("Production Agent output fails closed when it adds a verdict field", async () => {
  const invalidProvider: ProductionAgentProvider = {
    configFingerprint: (role) => hashJson({ role, config: "invalid-output" }),
    async run(role, input) {
      const selected = input.payload.selected_event as { event_id: string };
      return {
        output: {
          event_id: selected.event_id,
          beats: [],
          summary: "Invalid because it attempts to add a verdict.",
          missing_evidence: [],
          verdict: "CONSISTENT",
        },
        provider_job_id: `job_${role}`,
        agent_id: `agt_${role}`,
        config_id: null,
        adapter_version: "invalid-output.v1",
        raw_response_sha256: sha256("invalid"),
      };
    },
  };
  const app = await buildApp({
    apiToken: TOKEN,
    allowedOrigins: ["http://localhost:5173"],
    productionAgentProvider: invalidProvider,
  });
  try {
    const { caseId, facts } = await createExtractedCase(app);
    await freezeAllFacts(app, caseId, facts);
    const started = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/production-agent-runs`,
      headers: auth(true),
      payload: { role: "STORYBOARD_RECOMPOSER", event_id: "E3" },
    });
    assert.equal(started.statusCode, 202, started.body);
    await nextTurn();
    const operation = await app.inject({
      method: "GET",
      url: `/v1/operations/${(started.json() as { operation_id: string }).operation_id}`,
      headers: auth(),
    });
    const body = operation.json() as { status: string; error: { code: string } };
    assert.equal(body.status, "FAILED");
    assert.equal(body.error.code, "PRODUCTION_AGENT_RESPONSE_INVALID");
  } finally {
    await app.close();
  }
});

test("Fact Normalizer Agent output fails closed on a malformed canonical value", () => {
  assert.throws(
    () => validateProductionAgentOutput(
      "FACT_NORMALIZER",
      {
        recommendations: [{
          fact_id: "fact_1",
          normalized_fact_type: "ROUTE_OCCUPANCY",
          value: {
            route_id: "HASU_CROSSOVER",
            event_id: "E6",
            entity_id: "hyewon",
            start_ms: 58_000,
            end_ms: 52_000,
          },
          confidence: "HIGH",
          authority: "NON_AUTHORITATIVE",
        }],
        missing_evidence: [],
      },
      {
        fact_ids: new Set(["fact_1"]),
        event_ids: new Set(),
        finding_ids: new Set(),
        storyboard_event_id: null,
        storyboard_entities: new Map(),
      },
    ),
    (error: unknown) => error instanceof DomainError && error.code === "PRODUCTION_AGENT_RESPONSE_INVALID",
  );
});

function source(
  role: SourceRole,
  input: { bytes: Uint8Array | null; content: unknown; mediaType: string | null },
): InternalSourceVersion {
  return {
    contract_version: "standby.source.v1",
    source_id: `source_${role.toLowerCase()}`,
    case_id: "case_stage_agent",
    role,
    sha256: input.bytes ? sha256(input.bytes) : hashJson(input.content),
    origin: "USER_PROVIDED",
    authority: "REVIEWED",
    media_type: input.mediaType,
    original_filename: role === "MASTER_CUE" ? "cue.xlsx" : null,
    created_at: "2026-08-23T00:00:00.000Z",
    content: input.content,
    bytes: input.bytes,
  };
}

test("Upstage extraction uses the configured STAGE_SPEC Agent and keeps facts unreviewed", async () => {
  const uploadedNames: string[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v2/files")) {
      assert.ok(init?.body instanceof FormData);
      const file = init.body.get("file");
      assert.ok(file instanceof File);
      uploadedNames.push(file.name);
      return Response.json({ id: `file_${uploadedNames.length}` });
    }
    if (url.endsWith("/v2/responses") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { model: string; config_id?: string };
      if (body.model === "agt_stage") assert.equal(body.config_id, "cfg_stage");
      return Response.json({ id: `job_${body.model}` });
    }
    if (url.includes("job_agt_stage")) {
      return Response.json({
        id: "job_agt_stage",
        status: "completed",
        output: [{ content: [{ text: JSON.stringify({
          stage_facts: [{
            fact_type: "MINIMUM_CHANGE_TIME",
            locator: "/minimum_change_ms",
            source_quote_raw: "60000",
            min_ms: 60000,
          }],
        }) }] }],
      });
    }
    if (url.includes("job_agt_cue")) {
      return Response.json({
        id: "job_agt_cue",
        status: "completed",
        output: [{ content: [{ text: JSON.stringify({
          cue_facts: [{
            fact_type: "CUE_TRIGGER",
            locator: "MASTER!A1",
            source_quote_raw: "LIGHT GO",
          }],
        }) }] }],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new UpstageAgentProvider({
    apiKey: "secret-test-key",
    agentIds: { MASTER_CUE: "agt_cue", STAGE_SPEC: "agt_stage" },
    configIds: { STAGE_SPEC: "cfg_stage" },
    fetchImpl: mockFetch,
    pollIntervalMs: 0,
    timeoutMs: 1_000,
  });
  const sources = new Map<SourceRole, InternalSourceVersion>([
    ["MASTER_CUE", source("MASTER_CUE", {
      bytes: Uint8Array.from([0x50, 0x4b, 1, 2]),
      content: null,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })],
    ["STAGE_SPEC", source("STAGE_SPEC", {
      bytes: null,
      content: HERO_SOURCE_CONTENT.STAGE_SPEC,
      mediaType: "application/json",
    })],
  ]);

  const result = await provider.extract(sources);

  assert.equal(result.facts.length, 2);
  assert.ok(result.facts.every((fact) => fact.review_status === "UNREVIEWED"));
  const stageRun = result.sourceRuns.find((run) => run.role === "STAGE_SPEC");
  assert.equal(stageRun?.provider, "UPSTAGE");
  assert.equal(stageRun?.agent_id, "agt_stage");
  assert.ok(uploadedNames.includes("stage_spec.upstage.xlsx"));
});

test("Upstage Instruct output decodes JSON text and polls with include[]=all", async () => {
  const expected = {
    headline: "Rehearsal brief",
    sections: [],
    missing_evidence: ["No reviewed findings"],
  };
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v2/files")) return Response.json({ id: "file_brief" });
    if (url.endsWith("/v2/responses") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { model: string; config_id?: string };
      assert.equal(body.model, "agt_brief");
      assert.equal(body.config_id, "cfg_brief");
      return Response.json({ id: "job_brief" });
    }
    const pollUrl = new URL(url);
    assert.equal(pollUrl.pathname.endsWith("/v2/responses/job_brief"), true);
    assert.equal(pollUrl.searchParams.get("include[]"), "all");
    return Response.json({
      id: "job_brief",
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(expected) }] }],
    });
  };
  const provider = new UpstageAgentProvider({
    apiKey: "secret-test-key",
    agentIds: {},
    productionAgentIds: { REHEARSAL_BRIEF: "agt_brief" },
    productionConfigIds: { REHEARSAL_BRIEF: "cfg_brief" },
    fetchImpl: mockFetch,
    pollIntervalMs: 0,
    timeoutMs: 1_000,
  });

  const result = await provider.run("REHEARSAL_BRIEF", {
    contract_version: "standby.production-agent-input.v1",
    role: "REHEARSAL_BRIEF",
    case_id: "case_brief",
    review_snapshot_id: "snapshot_1",
    source_snapshot_digest: sha256("sources"),
    cue_revision_id: null,
    verification_result_hash: sha256("verification"),
    payload: { events: [], findings: [], output_authority: "NON_AUTHORITATIVE" },
  });

  assert.deepEqual(result.output, expected);
  assert.equal(result.provider_job_id, "job_brief");
});
