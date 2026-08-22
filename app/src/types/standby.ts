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
