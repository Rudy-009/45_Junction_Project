export type SourceRole = 'SCRIPT' | 'MASTER_CUE' | 'STAGE_SPEC';
export type ReviewStatus = 'UNREVIEWED' | 'REVIEWED' | 'REJECTED';
export type FindingVerdict = 'VIOLATION' | 'REVIEW' | 'INSUFFICIENT_EVIDENCE';
export type StageZone =
  | 'STAGE_RIGHT_WING'
  | 'STAGE'
  | 'STAGE_LEFT_WING'
  | 'STAGE_LEFT_CHANGE'
  | 'STAGE_RIGHT_CHANGE';

export type FactCandidate = {
  fact_id: string;
  fact_type: string;
  raw_value: unknown;
  reviewed_value: unknown | null;
  source_role: SourceRole;
  source_id: string;
  locator: string;
  quote: string;
  confidence: 'HIGH' | 'LOW' | 'NOT_PROVIDED';
  review_status: ReviewStatus;
};

export type Evidence = {
  role: SourceRole;
  source_id: string;
  quote: string | null;
  locator: string | null;
  origin: 'REAL_REFERENCE' | 'USER_PROVIDED' | 'CONTROLLED_FIXTURE' | 'MUTATED_FIXTURE';
  review_status: 'UNREVIEWED' | 'REVIEWED' | 'MISSING';
};

export type Finding = {
  finding_id: string;
  event_id: string;
  rule_id: 'VR-01' | 'VR-02' | 'VR-03';
  verdict: FindingVerdict;
  calculation: Record<string, unknown>;
  missing_facts: string[];
  evidence: [Evidence, Evidence, Evidence];
  target_locator: { row_id: string; column: string };
};

export type StageEntityState = { kind: 'PERSON' | 'PROP'; zone: StageZone; transition?: 'ENTER' | 'EXIT' };

export type EventGraphEvent = {
  event_id: string;
  sequence_index: number;
  label: string;
  time_range_ms: { min_ms: number; max_ms: number };
  actions: unknown[];
  source_refs: Array<{ source_id: string; role: SourceRole; fact_id: string }>;
};

export type WorkspaceEvent = {
  event_id: string;
  label: string;
  sequence_index: number;
  aggregate: 'CONSISTENT' | 'HAS_FINDING';
  finding_ids: string[];
  stage_snapshot: Record<string, StageEntityState>;
};

export type WorkspaceSnapshot = {
  case_id: string;
  title: string;
  source_snapshot_digest: string;
  sources: Array<{
    role: SourceRole;
    media_type: string | null;
    original_filename: string | null;
    sha256: string;
  }>;
  review_snapshot_id: string;
  cue_revision_id: string | null;
  original_master_cue_sha256: string;
  event_graph: { events: EventGraphEvent[] };
  events: WorkspaceEvent[];
  findings: Finding[];
  verification: {
    verification_run_id: string;
    ruleset_version: string;
    result_hash: string;
  };
};

export type CueCellPatch = {
  row_id: string;
  column: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

export type CueRowOperation =
  | { type: 'DELETE'; row_id: string }
  | { type: 'ADD'; after_row_id: string; row: Record<string, string> & { id: string } };

export type CueRevision = {
  contract_version: 'standby.revision.v1';
  revision_id: string;
  case_id: string;
  parent_revision_id: string | null;
  base_source_sha256: string;
  revision_hash: string;
  patches: CueCellPatch[];
  row_operations?: CueRowOperation[];
  created_by: string;
  created_at: string;
  rows?: Array<Record<string, string> & { id: string }>;
};

export type StoryboardBeat = {
  entity_id: string;
  action: 'ENTER' | 'EXIT' | 'MOVE' | 'HOLD';
  from_zone: StageZone | null;
  to_zone: StageZone | null;
  evidence_fact_ids: string[];
};

export type StoryboardAgentState = {
  status: 'IDLE' | 'RECONSTRUCTING' | 'READY' | 'FAILED';
  summary?: string;
  version?: string;
  eventId?: string;
  authority?: 'NON_AUTHORITATIVE';
  beats?: StoryboardBeat[];
  missingEvidence?: string[];
};

export type FactNormalizationRecommendation = {
  fact_id: string;
  normalized_fact_type: NormalizedFactType;
  value: Record<string, unknown>;
  confidence: 'HIGH' | 'LOW' | 'NOT_PROVIDED';
  authority: 'NON_AUTHORITATIVE';
};

export type FactNormalizerArtifact = {
  contract_version: 'standby.production-artifact.v1';
  artifact_id: string;
  role: 'FACT_NORMALIZER';
  authority: 'NON_AUTHORITATIVE';
  agent_id: string;
  config_id: string | null;
  payload: {
    recommendations: FactNormalizationRecommendation[];
    missing_evidence: string[];
  };
};

export type StoryboardAgentArtifact = {
  contract_version: 'standby.production-artifact.v1';
  artifact_id: string;
  role: 'STORYBOARD_RECOMPOSER';
  authority: 'NON_AUTHORITATIVE';
  agent_id: string;
  config_id: string | null;
  payload: {
    event_id: string;
    beats: StoryboardBeat[];
    summary: string;
    missing_evidence: string[];
  };
};

export const NORMALIZED_FACT_TYPES = [
  'SCRIPT_TIMING_ANCHOR',
  'QUICK_CHANGE_AVAILABLE_WINDOW',
  'ROUTE_TO_CHANGE',
  'MINIMUM_CHANGE_TIME',
  'ROUTE_TO_ENTRY',
  'BLOCKING_SEQUENCE_COMPLETE',
  'ROUTE_CAPACITY',
  'ROUTE_OCCUPANCY',
  'PROP_INITIAL_STATE',
  'PROP_SEQUENCE_COMPLETE',
  'PROP_REQUIRED_AT',
  'PROP_MOVE',
  'EVENT_STATE',
] as const;

export type NormalizedFactType = typeof NORMALIZED_FACT_TYPES[number];
