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
  bytes: Uint8Array | null;
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
  source: "UPSTAGE_RECOMMENDATION" | "CUSTOM" | "HUMAN_REJECTION";
  corrected_value: unknown | null;
  actor_id: string;
  created_at: string;
};

export type FactReviewCommand =
  | {
      fact_id: string;
      decision: "REVIEWED";
      source: "UPSTAGE_RECOMMENDATION" | "CUSTOM";
      corrected_value: unknown;
    }
  | {
      fact_id: string;
      decision: "REJECTED";
      source: "HUMAN_REJECTION";
      corrected_value: null;
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
  event_id: string;
  rule_id: "VR-01" | "VR-02" | "VR-03";
  verdict: FindingVerdict;
  calculation: Record<string, unknown>;
  missing_facts: string[];
  evidence: [Evidence, Evidence, Evidence];
  target_locator: { row_id: string; column: string };
};

export type VerificationResult = {
  contract_version: "standby.verification.v1";
  verification_run_id: string;
  input_fingerprint: string;
  ruleset_version: "standby.rules.v2";
  result_hash: string;
  findings: Finding[];
};

export type StageZone =
  | "STAGE_RIGHT_WING"
  | "STAGE"
  | "STAGE_LEFT_WING"
  | "STAGE_LEFT_CHANGE"
  | "STAGE_RIGHT_CHANGE";

export type StageEntityState = {
  kind: "PERSON" | "PROP";
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

export type EventGraphSourceRef = {
  source_id: string;
  role: SourceRole;
  fact_id: string;
};

export type EventGraphAction =
  | {
      type: "ENTER" | "EXIT";
      entity_id: string;
      zone: StageZone;
      sequence_index: number;
      offset_ms: number;
    }
  | {
      type: "MOVE";
      entity_id: string;
      from: StageZone;
      to: StageZone;
      sequence_index: number;
      offset_ms: number;
      duration_ms: { min_ms: number; max_ms: number };
    }
  | {
      type: "COSTUME_CHANGE";
      actor_id: string;
      zone: StageZone;
      sequence_index: number;
      offset_ms: number;
      duration_ms: { min_ms: number; max_ms: number };
    };

export type EventGraphEvent = {
  event_id: string;
  sequence_index: number;
  label: string;
  time_range_ms: { min_ms: number; max_ms: number };
  actions: EventGraphAction[];
  source_refs: EventGraphSourceRef[];
};

export type EventGraph = {
  contract_version: "standby.event-graph.v1";
  graph_id: string;
  source_snapshot_digest: string;
  compiler_version: "standby.compiler.v1";
  events: EventGraphEvent[];
};

export type WorkspaceSnapshot = {
  case_id: string;
  title: string;
  source_snapshot_digest: string;
  sources: SourceVersion[];
  review_snapshot_id: string;
  cue_revision_id: string | null;
  original_master_cue_sha256: string;
  event_graph: EventGraph;
  events: WorkspaceEvent[];
  findings: Finding[];
  verification: VerificationResult;
};

export type ProductionAgentRole =
  | "FACT_NORMALIZER"
  | "STORYBOARD_RECOMPOSER"
  | "REHEARSAL_BRIEF";

export type ProductionAgentFrozenInput = {
  contract_version: "standby.production-agent-input.v1";
  role: ProductionAgentRole;
  case_id: string;
  review_snapshot_id: string | null;
  source_snapshot_digest: string;
  cue_revision_id: string | null;
  verification_result_hash: string | null;
  payload: Record<string, unknown>;
};

export type FactNormalizationRecommendation = {
  fact_id: string;
  normalized_fact_type: string;
  value: Record<string, unknown>;
  confidence: "HIGH" | "LOW" | "NOT_PROVIDED";
  authority: "NON_AUTHORITATIVE";
};

export type FactNormalizerArtifactPayload = {
  recommendations: FactNormalizationRecommendation[];
  missing_evidence: string[];
};

export type FactNormalizationRecommendationMap = {
  contract_version: "standby.fact-normalization-recommendations.v1";
  artifact_id: string;
  authority: "NON_AUTHORITATIVE";
  input_fingerprint: string;
  is_current: boolean;
  recommendations_by_fact_id: Record<
    string,
    Omit<FactNormalizationRecommendation, "fact_id">
  >;
};

export type StoryboardBeat = {
  entity_id: string;
  action: "ENTER" | "EXIT" | "MOVE" | "HOLD";
  from_zone: StageZone | null;
  to_zone: StageZone | null;
  evidence_fact_ids: string[];
};

export type StoryboardArtifactPayload = {
  event_id: string;
  beats: StoryboardBeat[];
  summary: string;
  missing_evidence: string[];
};

export type RehearsalDepartment =
  | "STAGE_MANAGEMENT"
  | "CAST"
  | "COSTUME"
  | "PROPS"
  | "LIGHTING"
  | "SOUND"
  | "BAND";

export type RehearsalBriefSection = {
  department: RehearsalDepartment;
  summary: string;
  event_ids: string[];
  finding_ids: string[];
  questions: string[];
};

export type RehearsalBriefArtifactPayload = {
  headline: string;
  sections: RehearsalBriefSection[];
  missing_evidence: string[];
};

export type ProductionArtifact = {
  contract_version: "standby.production-artifact.v1";
  artifact_id: string;
  case_id: string;
  role: ProductionAgentRole;
  authority: "NON_AUTHORITATIVE";
  input_fingerprint: string;
  review_snapshot_id: string | null;
  cue_revision_id: string | null;
  provider: "UPSTAGE";
  provider_job_id: string;
  agent_id: string;
  config_id: string | null;
  adapter_version: string;
  raw_response_sha256: string;
  payload:
    | FactNormalizerArtifactPayload
    | StoryboardArtifactPayload
    | RehearsalBriefArtifactPayload;
  created_at: string;
};

export type Operation = {
  operation_id: string;
  kind: "EXTRACT_SOURCE" | "RUN_PRODUCTION_AGENT";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  result_source: "CONTROLLED_FIXTURE" | "UPSTAGE" | "MIXED" | null;
  resource_ref:
    | { type: "extraction_run"; id: string }
    | { type: "production_artifact"; id: string };
  error: { code: string; message: string } | null;
  created_at: string;
  updated_at: string;
};

export type ExtractionAdapter = "CONTROLLED_FIXTURE" | "UPSTAGE_AGENT";

export type ProviderRunSummary = {
  source_id: string;
  role: SourceRole;
  provider: "UPSTAGE" | "CONTROLLED_FIXTURE" | "STANDBY_FORM";
  provider_job_id: string | null;
  agent_id: string | null;
  config_id: string | null;
  adapter_version: string;
  schema_version: "standby.extraction.v1";
  raw_response_sha256: string;
};

export type ExtractionRunRecord = {
  extraction_run_id: string;
  case_id: string;
  adapter: ExtractionAdapter;
  result_source: "CONTROLLED_FIXTURE" | "UPSTAGE" | "MIXED";
  source_runs: ProviderRunSummary[];
  candidate_count: number;
  created_at: string;
};

export type CaseRecord = {
  case_id: string;
  owner_id: string;
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
