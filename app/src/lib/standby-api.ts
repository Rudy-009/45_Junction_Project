export type SourceRole = "SCRIPT" | "MASTER_CUE" | "STAGE_SPEC";
export type SourceOrigin = "REAL_REFERENCE" | "USER_PROVIDED" | "CONTROLLED_FIXTURE";
export type ExtractionAdapter = "CONTROLLED_FIXTURE" | "UPSTAGE_AGENT";
export type OperationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type SourceVersion = {
  source_id: string;
  case_id: string;
  role: SourceRole;
  sha256: string;
  origin: SourceOrigin | "MUTATED_FIXTURE";
  authority: "UNREVIEWED" | "REVIEWED";
  media_type: string | null;
  original_filename: string | null;
};

export type ExtractionOperation = {
  operation_id: string;
  status: OperationStatus;
  result_source: "CONTROLLED_FIXTURE" | "UPSTAGE" | "MIXED" | null;
  resource_ref: { type: "extraction_run"; id: string };
  error: { code: string; message: string } | null;
};

export type FactCandidate = {
  fact_id: string;
  fact_type: string;
  raw_value: unknown;
  reviewed_value: unknown | null;
  source_role: SourceRole;
  source_id: string;
  locator: string;
  quote: string;
  confidence: "HIGH" | "LOW" | "NOT_PROVIDED";
  review_status: "UNREVIEWED" | "REVIEWED" | "REJECTED";
};

type ApiErrorBody = {
  error?: { code?: string; message?: string; request_id?: string; details?: unknown };
};

export class StandbyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
  }
}

export type StandbyApiOptions = {
  baseUrl: string;
  getAccessToken: () => string | Promise<string>;
  fetchImpl?: typeof fetch;
};

export class StandbyApi {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: StandbyApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  createCase(title: string) {
    return this.request<{ case_id: string; title: string; created_at: string }>("/v1/cases", {
      method: "POST",
      body: JSON.stringify({ title }),
      idempotent: true,
    });
  }

  uploadSourceFile(
    caseId: string,
    role: "SCRIPT" | "MASTER_CUE",
    file: File,
    origin: SourceOrigin = "USER_PROVIDED",
  ) {
    const form = new FormData();
    form.append("origin", origin);
    form.append("file", file);
    return this.request<SourceVersion>(`/v1/cases/${caseId}/sources/${role}`, {
      method: "POST",
      body: form,
      idempotent: true,
    });
  }

  uploadStageSpec(caseId: string, content: unknown, origin: SourceOrigin = "USER_PROVIDED") {
    return this.request<SourceVersion>(`/v1/cases/${caseId}/sources/STAGE_SPEC`, {
      method: "POST",
      body: JSON.stringify({ origin, content, media_type: "application/json" }),
      idempotent: true,
    });
  }

  startExtraction(caseId: string, adapter: ExtractionAdapter = "UPSTAGE_AGENT") {
    return this.request<ExtractionOperation>(`/v1/cases/${caseId}/extraction-runs`, {
      method: "POST",
      body: JSON.stringify({ adapter }),
      idempotent: true,
    });
  }

  getOperation(operationId: string) {
    return this.request<ExtractionOperation>(`/v1/operations/${operationId}`);
  }

  async waitForOperation(
    operationId: string,
    options: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<ExtractionOperation> {
    const intervalMs = options.intervalMs ?? 1_000;
    const deadline = Date.now() + (options.timeoutMs ?? 180_000);
    while (Date.now() <= deadline) {
      options.signal?.throwIfAborted();
      const operation = await this.getOperation(operationId);
      if (operation.status === "SUCCEEDED") return operation;
      if (operation.status === "FAILED") {
        throw new StandbyApiError(
          502,
          operation.error?.code ?? "EXTRACTION_FAILED",
          operation.error?.message ?? "Extraction failed.",
          null,
        );
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = globalThis.setTimeout(resolve, intervalMs);
        options.signal?.addEventListener(
          "abort",
          () => {
            globalThis.clearTimeout(timeout);
            reject(options.signal?.reason ?? new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
    throw new StandbyApiError(504, "OPERATION_TIMEOUT", "Extraction did not finish in time.", null);
  }

  getReviewQueue(caseId: string) {
    return this.request<{ items: FactCandidate[]; next_cursor: null }>(
      `/v1/cases/${caseId}/review-queue`,
    );
  }

  reviewFacts(
    caseId: string,
    reviews: Array<{
      fact_id: string;
      decision: "REVIEWED" | "REJECTED";
      corrected_value?: unknown;
    }>,
  ) {
    return this.request<{ items: unknown[] }>(`/v1/cases/${caseId}/fact-reviews:batch`, {
      method: "POST",
      body: JSON.stringify({ reviews }),
      idempotent: true,
    });
  }

  freezeReviewSnapshot(caseId: string) {
    return this.request<{ snapshot_id: string; reviewed_fact_ids: string[] }>(
      `/v1/cases/${caseId}/review-snapshots`,
      { method: "POST", body: "{}", idempotent: true },
    );
  }

  getWorkspace<T = unknown>(caseId: string) {
    return this.request<T>(`/v1/cases/${caseId}/workspace`);
  }

  private async request<T>(
    path: string,
    init: RequestInit & { idempotent?: boolean } = {},
  ): Promise<T> {
    const token = await this.options.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (typeof init.body === "string") headers.set("content-type", "application/json");
    if (init.idempotent) headers.set("idempotency-key", crypto.randomUUID());
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    const json = (await response.json()) as T & ApiErrorBody;
    if (!response.ok) {
      throw new StandbyApiError(
        response.status,
        json.error?.code ?? "API_ERROR",
        json.error?.message ?? "STANDBY API request failed.",
        json.error?.request_id ?? null,
      );
    }
    return json;
  }
}
