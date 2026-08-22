import type { Direction } from './cue-sheet';

export type Verdict = 'VIOLATION' | 'REVIEW' | 'CONSISTENT' | 'INSUFFICIENT_EVIDENCE' | 'EDITED';

export interface CellEdit {
  rowId: string;
  column: string;
  value: string;
}

export interface Revision {
  id: string;
  savedAt: string;
  author: string;
  changes: { rowId: string; column: string; from: string; to: string }[];
}

export type Zone = '상수윙' | '무대' | '하수윙' | '하수환복소';
export type Transition = 'ENTER' | 'EXIT';

export interface StageEntity {
  id: string;
  label: string;
  kind: 'person' | 'prop';
  zone: Zone;
  transition?: Transition;
  lastDirection?: Direction;
  carriedBy?: string; // 소지하고 있는 인물 ID
  connector?: { to: Zone; reviewed: boolean };
}

export interface CharacterState {
  on_stage: boolean;
  last_exit_direction: Direction | null;
  last_exit_cue: string | null;
  last_exit_scene: string | null;
}

export interface PropState {
  on_stage: boolean;
  last_direction: Direction | null;
  last_cue: string | null;
  last_scene: string | null;
}
