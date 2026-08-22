export type SourceRole = "SCRIPT" | "MASTER_CUE" | "STAGE_SPEC";
export type Origin =
  | "REAL_REFERENCE"
  | "USER_PROVIDED"
  | "CONTROLLED_FIXTURE"
  | "MUTATED_FIXTURE";
export type ReviewStatus = "UNREVIEWED" | "REVIEWED" | "REJECTED";
export type FindingVerdict = "VIOLATION" | "REVIEW" | "INSUFFICIENT_EVIDENCE";
export type EventAggregate = "CONSISTENT" | "HAS_FINDING";

export type SourceVersion = {
  contract_version: "standby.source.v1";
  source_id: string;
  case_id: string;
  role: SourceRole;
  sha256: string;
  origin: Origin;
  authority: "UNREVIEWED" | "REVIEWED";
  media_type: string | null;
  original_filename: string | null;
  created_at: string;
};

export type InternalSourceVersion = SourceVersion & {
  content: unknown;
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
  origin: Origin;
  confidence: "HIGH" | "LOW" | "NOT_PROVIDED";
  review_status: ReviewStatus;
};

export type ReviewRecord = {
  review_id: string;
  fact_id: string;
  decision: "REVIEWED" | "REJECTED";
  corrected_value: unknown | null;
  actor_id: string;
  created_at: string;
};

export type ReviewSnapshot = {
  contract_version: "standby.review-snapshot.v1";
  snapshot_id: string;
  case_id: string;
  source_snapshot_digest: string;
  fact_snapshot_digest: string;
  reviewed_fact_ids: string[];
  reviewed_link_ids: string[];
  frozen_by: string;
  frozen_at: string;
};

export type InternalReviewSnapshot = ReviewSnapshot & {
  frozen_candidates: FactCandidate[];
};

export type CellPatch = {
  row_id: string;
  column: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

export type CueRow = Record<string, string> & { id: string };

export type CueRevision = {
  contract_version: "standby.revision.v1";
  revision_id: string;
  case_id: string;
  parent_revision_id: string | null;
  base_source_sha256: string;
  revision_hash: string;
  patches: CellPatch[];
  created_by: string;
  created_at: string;
  rows: CueRow[];
};

export type Evidence = {
  role: SourceRole;
  source_id: string;
  quote: string | null;
  locator: string | null;
  origin: Origin;
  review_status: "UNREVIEWED" | "REVIEWED" | "MISSING";
};

export type Finding = {
  finding_id: string;
  event_id: "E3";
  rule_id: "VR-01";
  verdict: FindingVerdict;
  calculation: {
    available_min_ms: number | null;
    available_max_ms: number | null;
    required_min_ms: number | null;
    required_max_ms: number | null;
  };
  missing_facts: string[];
  evidence: [Evidence, Evidence, Evidence];
  target_locator: { row_id: "R3"; column: "환복시간" };
};

export type VerificationResult = {
  contract_version: "standby.verification.v1";
  verification_run_id: string;
  input_fingerprint: string;
  ruleset_version: "standby.rules.v1";
  result_hash: string;
  findings: Finding[];
};

export type StageZone =
  | "STAGE_RIGHT_WING"
  | "STAGE"
  | "STAGE_LEFT_WING"
  | "STAGE_LEFT_CHANGE";

export type StageEntityState = {
  zone: StageZone;
  transition?: "ENTER" | "EXIT";
};

export type WorkspaceEvent = {
  event_id: string;
  label: string;
  sequence_index: number;
  aggregate: EventAggregate;
  finding_ids: string[];
  stage_snapshot: Record<string, StageEntityState>;
};

export type WorkspaceSnapshot = {
  case_id: string;
  title: string;
  source_snapshot_digest: string;
  sources: SourceVersion[];
  review_snapshot_id: string;
  cue_revision_id: string;
  original_master_cue_sha256: string;
  events: WorkspaceEvent[];
  findings: Finding[];
  verification: VerificationResult;
};

export type Operation = {
  operation_id: string;
  kind: "EXTRACT_SOURCE";
  status: "SUCCEEDED";
  result_source: "CONTROLLED_FIXTURE";
  resource_ref: { type: "extraction_run"; id: string };
};

export type CaseRecord = {
  case_id: string;
  title: string;
  sources: Map<SourceRole, InternalSourceVersion>;
  facts: Map<string, FactCandidate>;
  reviews: ReviewRecord[];
  snapshots: InternalReviewSnapshot[];
  revisions: CueRevision[];
  current_snapshot_id: string | null;
  current_revision_id: string | null;
  verification: VerificationResult | null;
  created_at: string;
};
