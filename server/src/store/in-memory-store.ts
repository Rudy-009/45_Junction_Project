import { extractControlledFixture } from "../domain/extraction.js";
import { DomainError } from "../domain/errors.js";
import { assertStageSpecSemantics } from "../contracts/semantic.js";
import type {
  CaseRecord,
  CellPatch,
  CueRevision,
  CueRow,
  FactCandidate,
  InternalReviewSnapshot,
  Operation,
  Origin,
  ReviewRecord,
  ReviewSnapshot,
  SourceRole,
  SourceVersion,
  WorkspaceSnapshot,
} from "../domain/types.js";
import { verifyQuickChange, workspaceEvents } from "../domain/verifier.js";
import { canonicalJson, hashJson } from "../lib/hash.js";

const ROLES: SourceRole[] = ["SCRIPT", "MASTER_CUE", "STAGE_SPEC"];

type IdempotencyRecord = {
  fingerprint: string;
  response: unknown;
};

function cloneRows(rows: CueRow[]): CueRow[] {
  return rows.map((row) => ({ ...row }));
}

function cueRows(content: unknown): CueRow[] {
  if (content === null || typeof content !== "object") {
    throw new DomainError(422, "CONTRACT_VIOLATION", "MASTER_CUE content must be an object.");
  }
  const rows = (content as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new DomainError(422, "CONTRACT_VIOLATION", "MASTER_CUE rows are required.");
  }
  return rows.map((row, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new DomainError(422, "CONTRACT_VIOLATION", `MASTER_CUE row ${index} is invalid.`);
    }
    const values = Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    );
    if (!values.id) {
      throw new DomainError(422, "CONTRACT_VIOLATION", `MASTER_CUE row ${index} has no id.`);
    }
    return values as CueRow;
  });
}

export class InMemoryStore {
  private readonly cases = new Map<string, CaseRecord>();
  private readonly operations = new Map<string, Operation>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private sequence = 0;

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence.toString().padStart(4, "0")}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  withIdempotency<T>(scope: string, key: string, input: unknown, create: () => T): T {
    const fingerprint = hashJson(input);
    const mapKey = `${scope}:${key}`;
    const existing = this.idempotency.get(mapKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DomainError(
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "The idempotency key was already used with a different request.",
        );
      }
      return existing.response as T;
    }

    const response = create();
    this.idempotency.set(mapKey, { fingerprint, response });
    return response;
  }

  createCase(title: string): { case_id: string; title: string; created_at: string } {
    const caseId = this.id("case");
    const createdAt = this.now();
    this.cases.set(caseId, {
      case_id: caseId,
      title,
      sources: new Map(),
      facts: new Map(),
      reviews: [],
      snapshots: [],
      revisions: [],
      current_snapshot_id: null,
      current_revision_id: null,
      verification: null,
      created_at: createdAt,
    });
    return { case_id: caseId, title, created_at: createdAt };
  }

  uploadSource(input: {
    caseId: string;
    role: SourceRole;
    origin: Origin;
    content: unknown;
    mediaType: string | null;
    originalFilename: string | null;
  }): SourceVersion {
    const record = this.getCase(input.caseId);
    if (input.role === "STAGE_SPEC") {
      assertStageSpecSemantics(input.content);
    }
    const sha256 = hashJson(input.content);
    const existing = record.sources.get(input.role);
    if (existing) {
      if (existing.sha256 === sha256) return this.publicSource(existing);
      throw new DomainError(
        409,
        "SOURCE_SLOT_LOCKED",
        `${input.role} already has an immutable source in this case.`,
      );
    }

    const source = {
      contract_version: "standby.source.v1" as const,
      source_id: this.id("source"),
      case_id: record.case_id,
      role: input.role,
      sha256,
      origin: input.origin,
      authority: "REVIEWED" as const,
      media_type: input.mediaType,
      original_filename: input.originalFilename,
      created_at: this.now(),
      content: structuredClone(input.content),
    };
    record.sources.set(input.role, source);

    if (input.role === "MASTER_CUE") {
      const rows = cueRows(input.content);
      const baseRevision: CueRevision = {
        contract_version: "standby.revision.v1",
        revision_id: `rev_source_${sha256.slice(0, 12)}`,
        case_id: record.case_id,
        parent_revision_id: null,
        base_source_sha256: sha256,
        revision_hash: sha256,
        patches: [],
        created_by: "source-upload",
        created_at: source.created_at,
        rows,
      };
      record.revisions.push(baseRevision);
      record.current_revision_id = baseRevision.revision_id;
    }

    return this.publicSource(source);
  }

  runExtraction(caseId: string): { operation: Operation; facts: FactCandidate[] } {
    const record = this.getCase(caseId);
    const missingRoles = ROLES.filter((role) => !record.sources.has(role));
    if (missingRoles.length > 0) {
      throw new DomainError(409, "SOURCE_SLOT_MISSING", "All three source roles are required.", {
        missing_roles: missingRoles,
      });
    }

    if (record.facts.size === 0) {
      try {
        for (const fact of extractControlledFixture(record.sources)) {
          record.facts.set(fact.fact_id, fact);
        }
      } catch (error) {
        throw new DomainError(422, "EXTRACTION_FIXTURE_INVALID", "Fixture extraction failed.", {
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    const runId = `extract_${this.sourceSnapshotDigest(record).slice(0, 16)}`;
    const operation: Operation = {
      operation_id: this.id("operation"),
      kind: "EXTRACT_SOURCE",
      status: "SUCCEEDED",
      result_source: "CONTROLLED_FIXTURE",
      resource_ref: { type: "extraction_run", id: runId },
    };
    this.operations.set(operation.operation_id, operation);
    return { operation, facts: [...record.facts.values()] };
  }

  getOperation(operationId: string): Operation {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new DomainError(404, "RESOURCE_NOT_FOUND", "Operation not found.");
    }
    return operation;
  }

  getReviewQueue(caseId: string): { items: FactCandidate[]; next_cursor: null } {
    const record = this.getCase(caseId);
    return { items: [...record.facts.values()], next_cursor: null };
  }

  reviewFacts(input: {
    caseId: string;
    actorId: string;
    reviews: Array<{
      fact_id: string;
      decision: "REVIEWED" | "REJECTED";
      corrected_value: unknown | null;
    }>;
  }): { items: ReviewRecord[] } {
    const record = this.getCase(input.caseId);
    const created: ReviewRecord[] = [];
    for (const review of input.reviews) {
      const fact = record.facts.get(review.fact_id);
      if (!fact) {
        throw new DomainError(404, "RESOURCE_NOT_FOUND", `Fact ${review.fact_id} not found.`);
      }
      fact.review_status = review.decision;
      fact.reviewed_value = review.corrected_value;
      const reviewRecord: ReviewRecord = {
        review_id: this.id("review"),
        fact_id: fact.fact_id,
        decision: review.decision,
        corrected_value: review.corrected_value,
        actor_id: input.actorId,
        created_at: this.now(),
      };
      record.reviews.push(reviewRecord);
      created.push(reviewRecord);
    }
    return { items: created };
  }

  createReviewSnapshot(caseId: string, actorId: string): ReviewSnapshot {
    const record = this.getCase(caseId);
    if (record.sources.size !== ROLES.length || record.facts.size === 0) {
      throw new DomainError(409, "GATE_MISSING_INPUT", "Extraction must finish before snapshot freeze.");
    }
    const frozenCandidates = structuredClone([...record.facts.values()]).sort((a, b) =>
      a.fact_id.localeCompare(b.fact_id),
    );
    const snapshot: ReviewSnapshot = {
      contract_version: "standby.review-snapshot.v1",
      snapshot_id: this.id("snapshot"),
      case_id: caseId,
      source_snapshot_digest: this.sourceSnapshotDigest(record),
      fact_snapshot_digest: hashJson(frozenCandidates),
      reviewed_fact_ids: [...record.facts.values()]
        .filter((fact) => fact.review_status === "REVIEWED")
        .map((fact) => fact.fact_id)
        .sort(),
      reviewed_link_ids: [],
      frozen_by: actorId,
      frozen_at: this.now(),
    };
    const internalSnapshot: InternalReviewSnapshot = {
      ...snapshot,
      frozen_candidates: frozenCandidates,
    };
    record.snapshots.push(internalSnapshot);
    record.current_snapshot_id = snapshot.snapshot_id;
    this.verifyCurrent(record);
    return snapshot;
  }

  createRevision(input: {
    caseId: string;
    actorId: string;
    baseRevisionId: string;
    baseSourceSha256: string;
    patches: CellPatch[];
  }): CueRevision {
    const record = this.getCase(input.caseId);
    const current = this.currentRevision(record);
    if (record.current_revision_id !== input.baseRevisionId) {
      throw new DomainError(412, "VERSION_PRECONDITION_FAILED", "Cue revision is stale.", {
        current_revision_id: record.current_revision_id,
      });
    }
    if (current.base_source_sha256 !== input.baseSourceSha256) {
      throw new DomainError(409, "SOURCE_HASH_MISMATCH", "Original MASTER_CUE hash does not match.");
    }
    if (input.patches.length === 0) {
      throw new DomainError(422, "CONTRACT_VIOLATION", "At least one cell patch is required.");
    }

    const rows = cloneRows(current.rows);
    for (const patch of input.patches) {
      const row = rows.find((candidate) => candidate.id === patch.row_id);
      if (!row || !(patch.column in row)) {
        throw new DomainError(422, "CELL_LOCATOR_INVALID", "Cell patch target does not exist.", {
          row_id: patch.row_id,
          column: patch.column,
        });
      }
      if (row[patch.column] !== String(patch.from ?? "")) {
        throw new DomainError(412, "VERSION_PRECONDITION_FAILED", "Cell value changed since edit began.", {
          row_id: patch.row_id,
          column: patch.column,
          current: row[patch.column],
        });
      }
      row[patch.column] = String(patch.to ?? "");
    }

    const createdAt = this.now();
    const revisionHash = hashJson({
      base_source_sha256: current.base_source_sha256,
      parent_revision_id: current.revision_id,
      patches: input.patches,
      rows,
    });
    const revision: CueRevision = {
      contract_version: "standby.revision.v1",
      revision_id: `rev_${revisionHash.slice(0, 16)}`,
      case_id: record.case_id,
      parent_revision_id: current.revision_id,
      base_source_sha256: current.base_source_sha256,
      revision_hash: revisionHash,
      patches: input.patches,
      created_by: input.actorId,
      created_at: createdAt,
      rows,
    };
    record.revisions.push(revision);
    record.current_revision_id = revision.revision_id;
    if (record.current_snapshot_id) this.verifyCurrent(record);
    return revision;
  }

  getWorkspace(caseId: string): WorkspaceSnapshot {
    const record = this.getCase(caseId);
    const snapshot = this.currentSnapshot(record);
    const revision = this.currentRevision(record);
    const verification = record.verification;
    if (!verification) {
      throw new DomainError(409, "VERIFICATION_NOT_RUN", "Freeze a review snapshot first.");
    }
    const masterCue = record.sources.get("MASTER_CUE");
    if (!masterCue) {
      throw new DomainError(409, "SOURCE_SLOT_MISSING", "MASTER_CUE is missing.");
    }

    return {
      case_id: record.case_id,
      title: record.title,
      source_snapshot_digest: snapshot.source_snapshot_digest,
      sources: ROLES.map((role) => record.sources.get(role))
        .filter((source) => source !== undefined)
        .map((source) => this.publicSource(source)),
      review_snapshot_id: snapshot.snapshot_id,
      cue_revision_id: revision.revision_id,
      original_master_cue_sha256: masterCue.sha256,
      events: workspaceEvents(verification),
      findings: verification.findings,
      verification,
    };
  }

  private verifyCurrent(record: CaseRecord): void {
    const snapshot = this.currentSnapshot(record);
    const revision = this.currentRevision(record);
    record.verification = verifyQuickChange({
      caseId: record.case_id,
      sources: record.sources,
      snapshot,
      revision,
    });
  }

  private currentSnapshot(record: CaseRecord): InternalReviewSnapshot {
    const snapshot = record.snapshots.find((candidate) => candidate.snapshot_id === record.current_snapshot_id);
    if (!snapshot) {
      throw new DomainError(409, "GATE_UNREVIEWED_FACTS", "No frozen review snapshot exists.");
    }
    return snapshot;
  }

  private currentRevision(record: CaseRecord): CueRevision {
    const revision = record.revisions.find((candidate) => candidate.revision_id === record.current_revision_id);
    if (!revision) {
      throw new DomainError(409, "SOURCE_SLOT_MISSING", "MASTER_CUE revision is missing.");
    }
    return revision;
  }

  private sourceSnapshotDigest(record: CaseRecord): string {
    return hashJson(
      ROLES.map((role) => {
        const source = record.sources.get(role);
        return { role, sha256: source?.sha256 ?? null };
      }),
    );
  }

  private publicSource(source: SourceVersion): SourceVersion {
    return {
      contract_version: source.contract_version,
      source_id: source.source_id,
      case_id: source.case_id,
      role: source.role,
      sha256: source.sha256,
      origin: source.origin,
      authority: source.authority,
      media_type: source.media_type,
      original_filename: source.original_filename,
      created_at: source.created_at,
    };
  }

  private getCase(caseId: string): CaseRecord {
    const record = this.cases.get(caseId);
    if (!record) {
      throw new DomainError(404, "RESOURCE_NOT_FOUND", "Case not found.");
    }
    return record;
  }
}

export function idempotencyBody(value: unknown): string {
  return canonicalJson(value);
}
