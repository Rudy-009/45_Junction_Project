import type {
  ScriptEventLinks,
  ScriptProjection,
  ScriptProjectionSegment,
  ScriptSidebarEntry,
} from '@/types/script';

export type ScriptTimelineEvent = {
  eventId: string;
  sceneLabel?: string;
  triggerText?: string;
  entityNames?: string[];
};

export type ScriptLinkRecommendation = {
  segmentId: string;
  eventId: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: Array<'SCENE' | 'SPEAKER' | 'DIALOGUE' | 'SEQUENCE'>;
};

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

function tokens(value: string): Set<string> {
  return new Set(value.normalize('NFKC').toLocaleUpperCase().split(/[^\p{L}\p{N}]+/gu).filter((token) => token.length >= 2));
}

function overlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

export function recommendScriptEventLinks(
  projection: ScriptProjection | null,
  events: ScriptTimelineEvent[],
  links: ScriptEventLinks,
): ScriptLinkRecommendation[] {
  if (!projection || events.length === 0) return [];
  const ordered = [...projection.segments].sort((left, right) => left.sequence_index - right.sequence_index);
  return ordered.flatMap((segment, segmentIndex) => {
    if (effectiveScriptEventId(segment, links, events)) return [];
    const segmentTokens = tokens(`${segment.section_marker ?? ''} ${segment.speaker ?? ''} ${segment.text}`);
    const expectedIndex = ordered.length <= 1
      ? 0
      : Math.round((segmentIndex / (ordered.length - 1)) * (events.length - 1));
    const ranked = events.map((event, eventIndex) => {
      const reasons: ScriptLinkRecommendation['reasons'] = [];
      let score = Math.max(0, 1 - Math.abs(eventIndex - expectedIndex) / Math.max(events.length, 1));
      const sceneOverlap = overlap(tokens(segment.section_marker ?? ''), tokens(event.sceneLabel ?? ''));
      if (sceneOverlap > 0) { score += 5 + sceneOverlap; reasons.push('SCENE'); }
      const speakerMatch = segment.speaker
        ? (event.entityNames ?? []).some((name) => normalizeAnchor(name) === normalizeAnchor(segment.speaker ?? ''))
        : false;
      if (speakerMatch) { score += 4; reasons.push('SPEAKER'); }
      const dialogueOverlap = overlap(segmentTokens, tokens(`${event.sceneLabel ?? ''} ${event.triggerText ?? ''}`));
      if (dialogueOverlap > 0) { score += dialogueOverlap * 2; reasons.push('DIALOGUE'); }
      reasons.push('SEQUENCE');
      return { event, score, reasons };
    }).sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best) return [];
    const semanticReasons = best.reasons.filter((reason) => reason !== 'SEQUENCE').length;
    return [{
      segmentId: segment.segment_id,
      eventId: best.event.eventId,
      confidence: semanticReasons >= 2 ? 'HIGH' : semanticReasons === 1 ? 'MEDIUM' : 'LOW',
      reasons: best.reasons,
    }];
  });
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
