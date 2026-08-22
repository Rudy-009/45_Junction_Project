import type {
  ScriptEventLinks,
  ScriptProjection,
  ScriptProjectionSegment,
  ScriptSidebarEntry,
} from '@/types/script';

export function effectiveScriptEventId(
  segment: ScriptProjectionSegment,
  links: ScriptEventLinks,
  knownEventIds: ReadonlySet<string>,
): string | null {
  const manual = links[segment.segment_id];
  if (manual && knownEventIds.has(manual)) return manual;
  return segment.event_id && knownEventIds.has(segment.event_id) ? segment.event_id : null;
}

export function buildScriptSidebarEntries(
  projection: ScriptProjection | null,
  events: Array<{ eventId: string; sceneLabel?: string }>,
  links: ScriptEventLinks,
): ScriptSidebarEntry[] {
  if (!projection) return [];
  const knownEventIds = new Set(events.map((event) => event.eventId));
  const segmentsByEvent = new Map<string, ScriptProjectionSegment[]>();
  for (const segment of projection.segments) {
    const eventId = effectiveScriptEventId(segment, links, knownEventIds);
    if (!eventId) continue;
    const current = segmentsByEvent.get(eventId) ?? [];
    current.push(segment);
    segmentsByEvent.set(eventId, current);
  }

  return events.map((event) => {
    const segments = segmentsByEvent.get(event.eventId) ?? [];
    return {
      eventId: event.eventId,
      ...(event.sceneLabel ? { sceneLabel: event.sceneLabel } : {}),
      lines: segments.map(({ segment_id, kind, text, speaker, locator }) => ({
        segment_id,
        kind,
        text,
        speaker,
        locator,
      })),
    };
  });
}

export function unlinkedScriptSegments(
  projection: ScriptProjection | null,
  events: Array<{ eventId: string }>,
  links: ScriptEventLinks,
): ScriptProjectionSegment[] {
  if (!projection) return [];
  const knownEventIds = new Set(events.map((event) => event.eventId));
  return projection.segments.filter(
    (segment) => !effectiveScriptEventId(segment, links, knownEventIds),
  );
}
