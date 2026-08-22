import type {
  ScriptEventLinks,
  ScriptProjection,
  ScriptProjectionSegment,
  ScriptSidebarEntry,
} from '@/types/script';

export function effectiveScriptEventId(
  segment: ScriptProjectionSegment,
  links: ScriptEventLinks,
  events: Array<{ eventId: string; sceneLabel?: string }>,
): string | null {
  const knownEventIds = new Set(events.map((event) => event.eventId));
  const manual = links[segment.segment_id];
  if (manual && knownEventIds.has(manual)) return manual;
  if (segment.event_id && knownEventIds.has(segment.event_id)) return segment.event_id;
  if (!segment.section_marker) return null;

  const marker = normalizeAnchor(segment.section_marker);
  const matches = events.filter((event) => sceneLabelAnchors(event.sceneLabel).has(marker));
  return matches.length === 1 ? matches[0]?.eventId ?? null : null;
}

function normalizeAnchor(value: string): string {
  return value.normalize('NFKC').toLocaleUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function sceneLabelAnchors(sceneLabel?: string): Set<string> {
  if (!sceneLabel) return new Set();
  return new Set([
    normalizeAnchor(sceneLabel),
    ...sceneLabel.split(/[\/·|,]/).map((part) => normalizeAnchor(part)).filter(Boolean),
  ]);
}

export function buildScriptSidebarEntries(
  projection: ScriptProjection | null,
  events: Array<{ eventId: string; sceneLabel?: string }>,
  links: ScriptEventLinks,
): ScriptSidebarEntry[] {
  if (!projection) return [];
  const segmentsByEvent = new Map<string, ScriptProjectionSegment[]>();
  for (const segment of projection.segments) {
    const eventId = effectiveScriptEventId(segment, links, events);
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
  events: Array<{ eventId: string; sceneLabel?: string }>,
  links: ScriptEventLinks,
): ScriptProjectionSegment[] {
  if (!projection) return [];
  return projection.segments.filter(
    (segment) => !effectiveScriptEventId(segment, links, events),
  );
}
