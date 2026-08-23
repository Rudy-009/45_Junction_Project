import { effectiveScriptEventId } from '@/lib/script-projection';
import type { CueSheet } from '@/types/cue-sheet';
import type { ScriptEventLinks, ScriptProjection } from '@/types/script';

const HEADERS = [
  'CUE_ID', 'SCENE', 'EVENT_ID', 'TRIGGER_TYPE', 'TRIGGER', 'ACTION', 'ENTITY',
  'DIRECTION', 'NOTES', 'SCRIPT_KIND', 'SPEAKER', 'SCRIPT_TEXT', 'SCRIPT_LOCATOR',
] as const;

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function actionEntity(action: CueSheet['cues'][number]['events'][number]['actions'][number]) {
  return action.prop_id ?? action.character_id ?? '';
}

function actionDirection(action: CueSheet['cues'][number]['events'][number]['actions'][number]) {
  if (action.from || action.to) return `${action.from ?? ''}>${action.to ?? ''}`;
  return action.direction ?? '';
}

export function cueSheetCsv(cueSheet: CueSheet, script: ScriptProjection | null, links: ScriptEventLinks) {
  const events = cueSheet.cues.flatMap((cue) => cue.events.map((event) => ({
    eventId: event.event_id,
    sceneLabel: cue.scene_number,
  })));
  const scriptByEvent = new Map<string, ScriptProjection['segments']>();
  for (const segment of script?.segments ?? []) {
    const eventId = effectiveScriptEventId(segment, links, events);
    if (!eventId) continue;
    const current = scriptByEvent.get(eventId) ?? [];
    current.push(segment);
    scriptByEvent.set(eventId, current);
  }

  const rows: string[][] = [];
  for (const cue of cueSheet.cues) {
    for (const event of cue.events) {
      const actions = event.actions.length > 0 ? event.actions : [null];
      const segments = scriptByEvent.get(event.event_id) ?? [null];
      const rowCount = Math.max(actions.length, segments.length);
      for (let index = 0; index < rowCount; index += 1) {
        const action = actions[index] ?? null;
        const segment = segments[index] ?? null;
        rows.push([
          cue.cue_id,
          cue.scene_number,
          event.event_id,
          event.trigger.type,
          event.trigger.description ?? '',
          action?.type ?? '',
          action ? actionEntity(action) : '',
          action ? actionDirection(action) : '',
          event.notes ?? cue.notes ?? '',
          segment?.kind ?? '',
          segment?.speaker ?? '',
          segment?.text ?? '',
          segment?.locator ?? '',
        ]);
      }
    }
  }

  return `\uFEFF${[HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
