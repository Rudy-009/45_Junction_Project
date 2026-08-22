import type {
  Action,
  Cue,
  CueEvent,
  CueSheet,
  Character,
  Prop,
  Trigger,
} from '@/types/cue-sheet';

const SCENE_TYPES = new Set(['scene', 'number', 'dark']);
const TRIGGER_TYPES = new Set(['dialogue', 'scene_change', 'lighting_cue', 'sound_cue']);
const ACTION_TYPES = new Set([
  'character_enter',
  'character_exit',
  'backstage_crossover',
  'prop_in',
  'prop_out',
  'costume_change',
]);
const DIRECTIONS = new Set(['stage_left', 'stage_right']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isOptionalDirection(value: unknown) {
  return value === undefined || (typeof value === 'string' && DIRECTIONS.has(value));
}

function isCharacter(value: unknown): value is Character {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && isOptionalString(value.actor);
}

function isProp(value: unknown): value is Prop {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.is_set_piece === undefined || typeof value.is_set_piece === 'boolean');
}

function isTrigger(value: unknown): value is Trigger {
  return isRecord(value)
    && typeof value.type === 'string'
    && TRIGGER_TYPES.has(value.type)
    && isOptionalString(value.character_id)
    && isOptionalString(value.description);
}

function isAction(value: unknown): value is Action {
  return isRecord(value)
    && typeof value.type === 'string'
    && ACTION_TYPES.has(value.type)
    && isOptionalString(value.character_id)
    && isOptionalDirection(value.direction)
    && isOptionalString(value.prop_id)
    && isOptionalString(value.carried_by)
    && isOptionalDirection(value.from)
    && isOptionalDirection(value.to)
    && isOptionalString(value.costume_description);
}

function isEvent(value: unknown): value is CueEvent {
  return isRecord(value)
    && typeof value.event_id === 'string'
    && isTrigger(value.trigger)
    && Array.isArray(value.actions)
    && value.actions.every(isAction)
    && isOptionalString(value.notes);
}

function isCue(value: unknown): value is Cue {
  return isRecord(value)
    && typeof value.cue_id === 'string'
    && typeof value.scene_number === 'string'
    && typeof value.scene_type === 'string'
    && SCENE_TYPES.has(value.scene_type)
    && isOptionalNumber(value.backstage_crossover_time_override_sec)
    && Array.isArray(value.events)
    && value.events.every(isEvent)
    && isOptionalString(value.notes);
}

function isCueSheet(value: unknown): value is CueSheet {
  return isRecord(value)
    && isRecord(value.metadata)
    && typeof value.metadata.title === 'string'
    && typeof value.metadata.version === 'string'
    && typeof value.metadata.created_at === 'string'
    && isOptionalString(value.metadata.updated_at)
    && isOptionalString(value.metadata.notes)
    && isRecord(value.venue)
    && typeof value.venue.has_backstage_crossover === 'boolean'
    && isOptionalNumber(value.venue.backstage_crossover_time_sec)
    && Array.isArray(value.characters)
    && value.characters.every(isCharacter)
    && Array.isArray(value.props)
    && value.props.every(isProp)
    && Array.isArray(value.cues)
    && value.cues.every(isCue);
}

export function parseCueSheetJson(text: string, locale: 'ko' | 'en'): CueSheet {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(locale === 'ko' ? 'JSON 파일 형식이 올바르지 않습니다.' : 'The JSON file format is invalid.');
  }

  if (!isCueSheet(value)) {
    throw new Error(locale === 'ko'
      ? 'STANDBY 큐시트 JSON 구조가 아닙니다. metadata, venue, characters, props, cues를 확인하세요.'
      : 'This is not a STANDBY cue-sheet JSON. Check metadata, venue, characters, props, and cues.');
  }

  return value;
}
