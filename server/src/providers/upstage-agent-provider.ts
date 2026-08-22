import { DomainError } from "../domain/errors.js";
import { extractStageSpec } from "../domain/extraction.js";
import type {
  FactCandidate,
  InternalSourceVersion,
  ProviderRunSummary,
  SourceRole,
} from "../domain/types.js";
import { canonicalJson, hashJson, sha256 } from "../lib/hash.js";
import type { ExtractionProvider, ExtractionProviderResult } from "./extraction-provider.js";

const ADAPTER_VERSION = "upstage-agent.v1";
const DEFAULT_BASE_URL = "https://api.upstage.ai";

type FetchLike = typeof fetch;
type JsonObject = Record<string, unknown>;

export type UpstageAgentProviderConfig = {
  apiKey: string;
  agentIds: Partial<Record<"SCRIPT" | "MASTER_CUE", string>>;
  configIds?: Partial<Record<"SCRIPT" | "MASTER_CUE", string>>;
  baseUrl?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

function objectValue(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(502, "UPSTAGE_RESPONSE_INVALID", `${label} must be an object.`);
  }
  return value as JsonObject;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(502, "UPSTAGE_RESPONSE_INVALID", `${label} is missing.`);
  }
  return value.trim();
}

function responseTextCandidates(job: JsonObject): string[] {
  const output = job.output;
  if (!Array.isArray(output)) return [];
  const values: string[] = [];
  for (const step of output) {
    if (step === null || typeof step !== "object" || Array.isArray(step)) continue;
    const content = (step as JsonObject).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
      const text = (item as JsonObject).text;
      if (typeof text === "string" && text.trim()) values.push(text);
    }
  }
  return values;
}

function locateFact(role: "SCRIPT" | "MASTER_CUE", value: JsonObject): { locator: string; quote: string } {
  const quote = [value.source_quote_raw, value.source_quote, value.quote].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
  );
  const rawLocator = value.locator ?? value.locator_copy ?? value.source_locator;
  const locator =
    typeof rawLocator === "string" && rawLocator.trim()
      ? rawLocator.trim()
      : rawLocator !== null && typeof rawLocator === "object"
        ? canonicalJson(rawLocator)
        : null;
  if (!quote || !locator) {
    throw new DomainError(
      502,
      "UPSTAGE_EVIDENCE_MISSING",
      `${role} fact is missing an exact source locator or quote.`,
    );
  }
  return { locator, quote: quote.trim() };
}

function decodeFacts(
  role: "SCRIPT" | "MASTER_CUE",
  source: InternalSourceVersion,
  payload: JsonObject,
): FactCandidate[] {
  const key = role === "SCRIPT" ? "script_facts" : "cue_facts";
  const rawFacts = payload[key];
  if (!Array.isArray(rawFacts)) {
    throw new DomainError(502, "UPSTAGE_RESPONSE_INVALID", `${key} must be an array.`);
  }
  return rawFacts.map((rawFact, index) => {
    const value = objectValue(rawFact, `${key}[${index}]`);
    const { locator, quote } = locateFact(role, value);
    const rawConfidence = value.confidence;
    const confidence =
      rawConfidence === "HIGH" || rawConfidence === "LOW" ? rawConfidence : "NOT_PROVIDED";
    const factTypeValue = value.fact_type ?? value.record_kind ?? `${role}_FACT`;
    const factType = nonEmptyString(factTypeValue, `${key}[${index}].fact_type`);
    const digest = hashJson({ source_sha256: source.sha256, index, value });
    return {
      fact_id: `fact_${role.toLowerCase()}_${digest.slice(0, 16)}`,
      fact_type: factType,
      raw_value: structuredClone(value),
      reviewed_value: null,
      source_role: role,
      source_id: source.source_id,
      locator,
      quote,
      origin: source.origin,
      confidence,
      review_status: "UNREVIEWED",
    } satisfies FactCandidate;
  });
}

function parseRolePayload(role: "SCRIPT" | "MASTER_CUE", job: JsonObject): JsonObject {
  const key = role === "SCRIPT" ? "script_facts" : "cue_facts";
  for (const text of responseTextCandidates(job).reverse()) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const object = parsed as JsonObject;
        if (Array.isArray(object[key])) return object;
      }
    } catch {
      // Ignore non-JSON node output and keep looking for the final extraction payload.
    }
  }
  throw new DomainError(502, "UPSTAGE_RESPONSE_INVALID", `No ${key} JSON output was found.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class UpstageAgentProvider implements ExtractionProvider {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly config: UpstageAgentProviderConfig) {
    if (!config.apiKey.trim()) throw new Error("UPSTAGE_API_KEY is required.");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.pollIntervalMs = config.pollIntervalMs ?? 2_000;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  async extract(
    sources: Map<SourceRole, InternalSourceVersion>,
  ): Promise<ExtractionProviderResult> {
    const masterCue = this.requiredFileSource(sources, "MASTER_CUE");
    const script = sources.get("SCRIPT");
    if (script && script.bytes === null) {
      throw new DomainError(409, "SOURCE_FORMAT_INVALID", "SCRIPT must be uploaded as a file.");
    }
    const stageSpec = sources.get("STAGE_SPEC");
    if (stageSpec && stageSpec.bytes !== null) {
      throw new DomainError(409, "SOURCE_FORMAT_INVALID", "STAGE_SPEC must be structured JSON.");
    }

    const [scriptResult, cueResult] = await Promise.all([
      script ? this.extractFile("SCRIPT", script) : Promise.resolve(null),
      this.extractFile("MASTER_CUE", masterCue),
    ]);
    const stageFacts = stageSpec ? extractStageSpec(stageSpec) : [];
    const stageRun: ProviderRunSummary | null = stageSpec
      ? {
          source_id: stageSpec.source_id,
          role: "STAGE_SPEC",
          provider: "STANDBY_FORM",
          provider_job_id: null,
          agent_id: null,
          config_id: null,
          adapter_version: "standby-form.v1",
          schema_version: "standby.extraction.v1",
          raw_response_sha256: hashJson({ source_sha256: stageSpec.sha256, facts: stageFacts }),
        }
      : null;

    return {
      facts: [...(scriptResult?.facts ?? []), ...cueResult.facts, ...stageFacts],
      sourceRuns: [
        ...(scriptResult ? [scriptResult.run] : []),
        cueResult.run,
        ...(stageRun ? [stageRun] : []),
      ],
    };
  }

  private requiredFileSource(
    sources: Map<SourceRole, InternalSourceVersion>,
    role: "SCRIPT" | "MASTER_CUE",
  ): InternalSourceVersion {
    const source = sources.get(role);
    if (!source || source.bytes === null) {
      throw new DomainError(409, "SOURCE_FORMAT_INVALID", `${role} must be uploaded as a file.`);
    }
    return source;
  }

  private async extractFile(
    role: "SCRIPT" | "MASTER_CUE",
    source: InternalSourceVersion,
  ): Promise<{ facts: FactCandidate[]; run: ProviderRunSummary }> {
    const agentId = this.config.agentIds[role];
    if (!agentId) {
      throw new DomainError(503, "UPSTAGE_AGENT_NOT_CONFIGURED", `${role} Agent ID is missing.`);
    }
    const fileId = await this.uploadFile(source);
    const configId = this.config.configIds?.[role] ?? null;
    const job = await this.createJob(agentId, fileId, configId);
    const jobId = nonEmptyString(job.id, "Upstage job id");
    const completedJob = await this.pollJob(jobId);
    const payload = parseRolePayload(role, completedJob);
    const facts = decodeFacts(role, source, payload);
    const run: ProviderRunSummary = {
      source_id: source.source_id,
      role,
      provider: "UPSTAGE",
      provider_job_id: jobId,
      agent_id: agentId,
      config_id: configId,
      adapter_version: ADAPTER_VERSION,
      schema_version: "standby.extraction.v1",
      raw_response_sha256: hashJson(completedJob),
    };
    return { facts, run };
  }

  private async uploadFile(source: InternalSourceVersion): Promise<string> {
    if (source.bytes === null) throw new Error("File source bytes are missing.");
    const form = new FormData();
    form.append(
      "file",
      new Blob([Uint8Array.from(source.bytes).buffer], {
        type: source.media_type ?? "application/octet-stream",
      }),
      source.original_filename ?? `${source.role.toLowerCase()}-${source.sha256.slice(0, 8)}`,
    );
    form.append("purpose", "user_data");
    const response = await this.upstageFetch("/v2/files", { method: "POST", body: form });
    return nonEmptyString(response.id, "Upstage file id");
  }

  private async createJob(
    agentId: string,
    fileId: string,
    configId: string | null,
  ): Promise<JsonObject> {
    return this.upstageFetch("/v2/responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: agentId,
        input: [{ role: "user", content: [{ type: "input_file", file_id: fileId }] }],
        ...(configId ? { config_id: configId } : {}),
      }),
    });
  }

  private async pollJob(jobId: string): Promise<JsonObject> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      const job = await this.upstageFetch(`/v2/responses/${encodeURIComponent(jobId)}`, {
        method: "GET",
      });
      const status = nonEmptyString(job.status, "Upstage job status");
      if (status === "completed") return job;
      if (status === "failed") {
        throw new DomainError(502, "UPSTAGE_JOB_FAILED", "Upstage extraction job failed.");
      }
      if (status !== "queued" && status !== "in_progress") {
        throw new DomainError(502, "UPSTAGE_RESPONSE_INVALID", "Unknown Upstage job status.");
      }
      await delay(this.pollIntervalMs);
    }
    throw new DomainError(504, "UPSTAGE_JOB_TIMEOUT", "Upstage extraction job timed out.");
  }

  private async upstageFetch(path: string, init: RequestInit): Promise<JsonObject> {
    const attempts = init.method === "GET" ? 3 : 1;
    let response: Response | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          headers: { ...init.headers, authorization: `Bearer ${this.config.apiKey}` },
          redirect: "error",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt + 1 >= attempts) {
          throw new DomainError(502, "UPSTAGE_REQUEST_FAILED", "Upstage API request failed.", {
            reason:
              error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network",
          });
        }
        await delay(200 * 2 ** attempt);
        continue;
      }
      if (response.ok) break;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt + 1 >= attempts) break;
      await delay(200 * 2 ** attempt);
    }
    if (!response) {
      throw new DomainError(502, "UPSTAGE_REQUEST_FAILED", "Upstage API request failed.");
    }
    if (!response.ok) {
      throw new DomainError(
        502,
        "UPSTAGE_REQUEST_FAILED",
        `Upstage API request failed with status ${response.status}.`,
        {
        upstream_status: response.status,
        },
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new DomainError(502, "UPSTAGE_RESPONSE_INVALID", "Upstage returned invalid JSON.");
    }
    return objectValue(json, "Upstage response");
  }
}

export function fileSha256(bytes: Uint8Array): string {
  return sha256(bytes);
}
