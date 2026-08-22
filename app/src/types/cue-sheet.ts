export type SceneType = 'scene' | 'number';
export type Direction = 'stage_left' | 'stage_right';
export type TriggerType = 'dialogue' | 'scene_change' | 'lighting_cue' | 'sound_cue';
export type ActionType = 'character_enter' | 'character_exit' | 'backstage_crossover' | 'prop_in' | 'prop_out' | 'costume_change';

export interface CueSheetMetadata {
  title: string;
  version: string;
  created_at: string;
  updated_at?: string;
  notes?: string;
}

export interface Venue {
  has_backstage_crossover: boolean;
  backstage_crossover_time_sec?: number;
}

export interface Character {
  id: string;
  name: string;
  actor?: string;
}

export interface Prop {
  id: string;
  name: string;
  is_set_piece?: boolean;
}

export interface Trigger {
  type: TriggerType;
  character_id?: string;
  description?: string;
}

export interface Action {
  type: ActionType;
  character_id?: string;
  direction?: Direction;
  prop_id?: string;
  carried_by?: string;
  from?: Direction;
  to?: Direction;
  costume_change_duration_sec?: number;
  costume_description?: string;
}

export interface CueEvent {
  event_id: string;
  trigger: Trigger;
  actions: Action[];
  notes?: string;
}

export interface Cue {
  cue_id: string;
  scene_number: string;
  scene_type: SceneType;
  estimated_duration_sec?: number;
  backstage_crossover_time_override_sec?: number;
  events: CueEvent[];
  notes?: string;
}

export interface CueSheet {
  metadata: CueSheetMetadata;
  venue: Venue;
  characters: Character[];
  props: Prop[];
  cues: Cue[];
}
