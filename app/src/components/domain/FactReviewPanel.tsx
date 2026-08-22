import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  NORMALIZED_FACT_TYPES,
  type FactCandidate,
  type FactNormalizationRecommendation,
  type NormalizedFactType,
  type StageZone,
} from '@/types/standby';
import { cn } from '@/lib/utils';
import { useI18n, type Locale } from '@/lib/i18n';

type ReviewDecision = 'PENDING' | 'REVIEWED' | 'REJECTED';
type ReviewMode = 'RECOMMENDED' | 'CUSTOM';
type EntityDraft = { id: string; entityId: string; kind: 'PERSON' | 'PROP'; zone: StageZone; transition: '' | 'ENTER' | 'EXIT' };
type ReviewDraft = {
  normalizedType: NormalizedFactType;
  fields: Record<string, string | boolean>;
  entities: EntityDraft[];
};

export type FactReviewCommand =
  | {
      fact_id: string;
      decision: 'REVIEWED';
      source: 'UPSTAGE_RECOMMENDATION' | 'CUSTOM';
      corrected_value: unknown;
    }
  | { fact_id: string; decision: 'REJECTED' };

export type NormalizerProvenance = {
  authority: 'NON_AUTHORITATIVE';
  agentId: string;
  configId: string | null;
};

const ZONES: StageZone[] = [
  'STAGE_RIGHT_WING', 'STAGE', 'STAGE_LEFT_WING', 'STAGE_LEFT_CHANGE', 'STAGE_RIGHT_CHANGE',
];
const FIELD_MAP: Partial<Record<NormalizedFactType, string[]>> = {
  SCRIPT_TIMING_ANCHOR: ['exit_event', 'next_entry_event'],
  QUICK_CHANGE_AVAILABLE_WINDOW: ['min_ms', 'max_ms', 'target_row_id', 'target_column'],
  ROUTE_TO_CHANGE: ['min_ms', 'max_ms'],
  MINIMUM_CHANGE_TIME: ['min_ms'],
  ROUTE_TO_ENTRY: ['min_ms', 'max_ms'],
  BLOCKING_SEQUENCE_COMPLETE: ['route_id', 'event_id', 'complete'],
  ROUTE_CAPACITY: ['route_id', 'capacity'],
  ROUTE_OCCUPANCY: ['route_id', 'event_id', 'entity_id', 'start_ms', 'end_ms'],
  PROP_INITIAL_STATE: ['prop_id', 'zone'],
  PROP_SEQUENCE_COMPLETE: ['prop_id', 'through_event_id', 'complete'],
  PROP_REQUIRED_AT: ['event_id', 'prop_id', 'zone'],
  PROP_MOVE: ['event_id', 'sequence_index', 'prop_id', 'from_zone', 'to_zone', 'responsible_party'],
  EVENT_STATE: ['event_id', 'sequence_index', 'label', 'time_min_ms', 'time_max_ms'],
};
const NUMBER_FIELDS = new Set([
  'min_ms', 'max_ms', 'capacity', 'start_ms', 'end_ms', 'sequence_index', 'time_min_ms', 'time_max_ms',
]);
const BOOLEAN_FIELDS = new Set(['complete']);
const ZONE_FIELDS = new Set(['zone', 'from_zone', 'to_zone']);
const OPTIONAL_EMPTY_FIELDS = new Set(['responsible_party']);
const RANGE_RULES: Partial<Record<NormalizedFactType, Array<{
  start: string;
  end: string;
  strict: boolean;
}>>> = {
  QUICK_CHANGE_AVAILABLE_WINDOW: [{ start: 'min_ms', end: 'max_ms', strict: false }],
  ROUTE_TO_CHANGE: [{ start: 'min_ms', end: 'max_ms', strict: false }],
  ROUTE_TO_ENTRY: [{ start: 'min_ms', end: 'max_ms', strict: false }],
  ROUTE_OCCUPANCY: [{ start: 'start_ms', end: 'end_ms', strict: true }],
  EVENT_STATE: [{ start: 'time_min_ms', end: 'time_max_ms', strict: false }],
};

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function draftFor(
  factId: string,
  recommendation: FactNormalizationRecommendation,
): ReviewDraft | null {
  const known = NORMALIZED_FACT_TYPES.find((type) => type === recommendation.normalized_fact_type);
  if (!known) return null;
  const raw = objectValue(recommendation.value);
  const target = objectValue(raw.target);
  const time = objectValue(raw.time_range_ms);
  const snapshot = objectValue(raw.stage_snapshot);
  const fields: Record<string, string | boolean> = {};
  for (const field of FIELD_MAP[known] ?? []) {
    const rawValue = field === 'target_row_id' ? target.row_id
      : field === 'target_column' ? target.column
      : field === 'time_min_ms' ? time.min_ms
      : field === 'time_max_ms' ? time.max_ms
      : raw[field];
    fields[field] = BOOLEAN_FIELDS.has(field) ? rawValue === true : rawValue === undefined ? '' : String(rawValue);
  }
  const entities: EntityDraft[] = Object.entries(snapshot).flatMap(([entityId, stateValue]) => {
    const state = objectValue(stateValue);
    if (!ZONES.includes(state.zone as StageZone)) return [];
    return [{
      id: `${factId}:${entityId}`, entityId, kind: state.kind === 'PROP' ? 'PROP' : 'PERSON', zone: state.zone as StageZone,
      transition: state.transition === 'ENTER' || state.transition === 'EXIT' ? state.transition : '',
    }];
  });
  return { normalizedType: known, fields, entities };
}

function normalizedValue(draft: ReviewDraft): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [field, rawValue] of Object.entries(draft.fields)) {
    if (BOOLEAN_FIELDS.has(field)) value[field] = rawValue === true;
    else if (NUMBER_FIELDS.has(field)) value[field] = Number(rawValue);
    else value[field] = String(rawValue).trim();
  }
  if (draft.normalizedType === 'QUICK_CHANGE_AVAILABLE_WINDOW') {
    value.target = { row_id: value.target_row_id, column: value.target_column };
    delete value.target_row_id;
    delete value.target_column;
  }
  if (draft.normalizedType === 'EVENT_STATE') {
    value.time_range_ms = { min_ms: value.time_min_ms, max_ms: value.time_max_ms };
    delete value.time_min_ms;
    delete value.time_max_ms;
    value.actions = [];
    value.stage_snapshot = Object.fromEntries(draft.entities.map((entity) => [
      entity.entityId.trim(),
      { kind: entity.kind, zone: entity.zone, ...(entity.transition ? { transition: entity.transition } : {}) },
    ]));
  }
  return value;
}

function validationError(draft: ReviewDraft | null, locale: Locale): string | null {
  if (!draft) return locale === 'ko'
    ? '유효한 Upstage 추천값이 없어 승인할 수 없습니다.'
    : 'No valid Upstage recommendation is available.';
  for (const [field, value] of Object.entries(draft.fields)) {
    if (BOOLEAN_FIELDS.has(field)) continue;
    const text = String(value);
    if (text.trim() === '') {
      if (OPTIONAL_EMPTY_FIELDS.has(field)) continue;
      return locale === 'ko' ? `${field} 값이 필요합니다.` : `${field} is required.`;
    }
    if (NUMBER_FIELDS.has(field)) {
      const number = Number(text);
      const minimum = field === 'capacity' ? 1 : 0;
      if (!Number.isSafeInteger(number) || number < minimum) {
        return locale === 'ko'
          ? `${field}는 ${minimum} 이상의 안전한 정수여야 합니다.`
          : `${field} must be a safe integer greater than or equal to ${minimum}.`;
      }
    } else if (text.length > 2_000) {
      return locale === 'ko' ? `${field}는 2,000자 이하여야 합니다.` : `${field} must be 2,000 characters or fewer.`;
    }
  }
  for (const rule of RANGE_RULES[draft.normalizedType] ?? []) {
    const start = Number(draft.fields[rule.start]);
    const end = Number(draft.fields[rule.end]);
    const invalid = rule.strict ? start >= end : start > end;
    if (invalid) {
      return locale === 'ko'
        ? rule.strict
          ? `${rule.start}는 ${rule.end}보다 작아야 합니다.`
          : `${rule.start}는 ${rule.end}보다 클 수 없습니다.`
        : rule.strict
          ? `${rule.start} must be less than ${rule.end}.`
          : `${rule.start} must not exceed ${rule.end}.`;
    }
  }
  if (draft.normalizedType === 'EVENT_STATE') {
    const ids = draft.entities.map((entity) => entity.entityId.trim());
    if (ids.length > 500) return locale === 'ko' ? '무대 엔티티는 500개를 넘을 수 없습니다.' : 'Stage entities cannot exceed 500.';
    if (ids.some((id) => !id)) return locale === 'ko' ? '모든 무대 엔티티에 ID가 필요합니다.' : 'Every stage entity needs an ID.';
    if (ids.some((id) => id.length > 2_000)) return locale === 'ko' ? '무대 엔티티 ID는 2,000자 이하여야 합니다.' : 'Stage entity IDs must be 2,000 characters or fewer.';
    if (new Set(ids).size !== ids.length) return locale === 'ko' ? '무대 엔티티 ID는 중복될 수 없습니다.' : 'Stage entity IDs must be unique.';
  }
  return null;
}

function ExtractedFields({ value }: { value: unknown }) {
  const { t } = useI18n();
  const raw = objectValue(value);
  const fields = Object.entries(raw).filter(([key]) => !['source_quote_raw', 'source_quote', 'quote'].includes(key));
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] border border-border text-xs">
      {fields.map(([key, fieldValue]) => (
        <div key={key} className="contents">
          <dt className="mono border-b border-r border-border bg-muted px-2 py-1.5 text-[10px]">{key}</dt>
          <dd className="min-w-0 break-words border-b border-border px-2 py-1.5">
            {fieldValue !== null && typeof fieldValue === 'object'
              ? t('review.structured')
              : String(fieldValue ?? '')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function FactReviewPanel({
  facts,
  recommendations,
  normalizer,
  busy,
  initialMode,
  onSubmit,
}: {
  facts: FactCandidate[];
  recommendations: FactNormalizationRecommendation[];
  normalizer: NormalizerProvenance | null;
  busy: boolean;
  initialMode: 'RECOMMENDED' | 'CUSTOM';
  onSubmit: (reviews: FactReviewCommand[]) => void;
}) {
  const { locale, t } = useI18n();
  const [mode] = useState<ReviewMode>(initialMode);
  const recommendationByFact = useMemo(() => new Map(
    recommendations.map((recommendation) => [recommendation.fact_id, recommendation]),
  ), [recommendations]);
  const recommendedDrafts = useMemo<Record<string, ReviewDraft | null>>(() =>
    Object.fromEntries(facts.map((fact) => {
      const recommendation = recommendationByFact.get(fact.fact_id);
      return [fact.fact_id, recommendation ? draftFor(fact.fact_id, recommendation) : null];
    })),
  [facts, recommendationByFact]);
  const [customDrafts, setCustomDrafts] = useState<Record<string, ReviewDraft | null>>(() =>
    Object.fromEntries(facts.map((fact) => {
      const recommendation = recommendationByFact.get(fact.fact_id);
      return [fact.fact_id, recommendation ? draftFor(fact.fact_id, recommendation) : null];
    })),
  );
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(() =>
    Object.fromEntries(facts.map((fact) => [fact.fact_id, 'PENDING'])),
  );
  const activeDrafts = mode === 'RECOMMENDED' ? recommendedDrafts : customDrafts;
  const pending = Object.values(decisions).filter((decision) => decision === 'PENDING').length;
  const draftErrors = useMemo(() => Object.fromEntries(
    facts.map((fact) => [
      fact.fact_id,
      validationError(activeDrafts[fact.fact_id] ?? null, locale),
    ]),
  ), [activeDrafts, facts, locale]);
  const hasErrors = facts.some((fact) =>
    decisions[fact.fact_id] === 'REVIEWED' && Boolean(draftErrors[fact.fact_id]),
  );

  const patchCustomDraft = (factId: string, patch: Partial<ReviewDraft>) => {
    setCustomDrafts((current) => {
      const existing = current[factId];
      return existing ? { ...current, [factId]: { ...existing, ...patch } } : current;
    });
  };

  const setDecision = (factId: string, decision: ReviewDecision) => {
    setDecisions((current) => ({ ...current, [factId]: decision }));
  };

  const approveAllCustom = () => {
    setDecisions((current) => Object.fromEntries(facts.map((fact) => {
      const draft = customDrafts[fact.fact_id] ?? null;
      return [
        fact.fact_id,
        validationError(draft, locale) === null ? 'REVIEWED' : current[fact.fact_id] ?? 'PENDING',
      ];
    })));
  };

  const submit = () => {
    if (hasErrors) return;
    const reviews = facts.flatMap((fact): FactReviewCommand[] => {
      const decision = decisions[fact.fact_id];
      if (!decision || decision === 'PENDING') return [];
      if (decision === 'REJECTED') return [{ fact_id: fact.fact_id, decision: 'REJECTED' }];
      const draft = activeDrafts[fact.fact_id] ?? null;
      if (!draft || validationError(draft, locale)) return [];
      return [{
        fact_id: fact.fact_id,
        decision: 'REVIEWED',
        source: mode === 'RECOMMENDED' ? 'UPSTAGE_RECOMMENDATION' : 'CUSTOM',
        corrected_value: { normalized_fact_type: draft.normalizedType, value: normalizedValue(draft) },
      }];
    });
    onSubmit(reviews);
  };

  return (
    <section className="mt-6 border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-4">
        <div>
          <h2 className="text-base font-medium">{t('review.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('review.help')}</p>
          {normalizer && (
            <details className="mt-2 text-[10px] text-muted-foreground">
              <summary className="mono cursor-pointer text-edited">
                UPSTAGE STUDIO · {normalizer.authority}
              </summary>
              <div className="mono mt-1 break-all pl-2">
                Agent {normalizer.agentId} · Config {normalizer.configId ?? 'latest'}
              </div>
            </details>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t('review.mode')} : {mode === 'RECOMMENDED' ? t('review.recommended') : t('review.custom')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'CUSTOM' && (
            <button
              type="button"
              disabled={busy}
              onClick={approveAllCustom}
              className="flex items-center gap-1 border border-consistent px-3 py-1.5 text-xs text-consistent disabled:opacity-45"
            >
              <Check size={12} /> {t('review.approveAll')}
            </button>
          )}
          <span className="mono text-[11px] text-muted-foreground">{facts.length - pending}/{facts.length} DECIDED</span>
        </div>
      </div>

      <div className="divide-y divide-border">
        {facts.map((fact) => {
          const recommendation = recommendationByFact.get(fact.fact_id) ?? null;
          const draft = activeDrafts[fact.fact_id] ?? null;
          const decision = decisions[fact.fact_id] ?? 'PENDING';
          const fields = draft ? FIELD_MAP[draft.normalizedType] ?? [] : [];
          return (
            <article key={fact.fact_id} className="grid gap-4 p-4 xl:grid-cols-[220px_1fr_1fr]">
              <div>
                <div className="mono text-[10px] text-muted-foreground">{fact.source_role}</div>
                <div className="mt-1 break-all text-sm font-medium">{fact.fact_type}</div>
                <div className="mono mt-2 text-[10px] text-muted-foreground">{fact.locator}</div>
                <blockquote className="mt-2 border-l border-border-strong pl-2 text-xs leading-5">{fact.quote}</blockquote>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy || !draft || Boolean(draftErrors[fact.fact_id])} onClick={() => setDecision(fact.fact_id, 'REVIEWED')} className={cn('flex items-center gap-1 border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40', decision === 'REVIEWED' ? 'border-consistent text-consistent' : 'border-border')}><Check size={12} /> {t('review.approve')}</button>
                  <button type="button" disabled={busy} onClick={() => setDecision(fact.fact_id, 'REJECTED')} className={cn('flex items-center gap-1 border px-2 py-1 text-xs disabled:opacity-40', decision === 'REJECTED' ? 'border-violation text-violation' : 'border-border')}><X size={12} /> {t('review.reject')}</button>
                </div>
              </div>

              <div>
                <div className="mono mb-2 text-[10px] text-muted-foreground">{t('review.extracted')}</div>
                <ExtractedFields value={fact.raw_value} />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="mono text-[10px] text-muted-foreground">{t('review.agentRecommendation')}</span>
                  {recommendation?.confidence && (
                    <span className="mono text-[9px] text-muted-foreground">{recommendation.confidence}</span>
                  )}
                </div>
                <div className={cn(
                  'mono mt-1 border px-2 py-2 text-xs',
                  draft ? 'border-edited bg-edited-bg text-edited' : 'border-insufficient text-insufficient',
                )}>
                  {draft?.normalizedType ?? t('review.noRecommendation')}
                </div>

                {draft && <div className="mt-3 grid grid-cols-2 gap-2">
                  {fields.map((field) => (
                    <label key={field} className={field === 'label' || field === 'responsible_party' ? 'col-span-2' : ''}>
                      <span className="mono text-[10px] text-muted-foreground">{field}</span>
                      {BOOLEAN_FIELDS.has(field) ? (
                        <input type="checkbox" checked={draft.fields[field] === true} disabled={busy || mode === 'RECOMMENDED'} onChange={(event) => patchCustomDraft(fact.fact_id, { fields: { ...draft.fields, [field]: event.target.checked } })} className="ml-2" />
                      ) : ZONE_FIELDS.has(field) ? (
                        <select value={String(draft.fields[field] ?? '')} disabled={busy || mode === 'RECOMMENDED'} onChange={(event) => patchCustomDraft(fact.fact_id, { fields: { ...draft.fields, [field]: event.target.value } })} className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs"><option value="">zone 선택</option>{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select>
                      ) : (
                        <input type={NUMBER_FIELDS.has(field) ? 'number' : 'text'} min={NUMBER_FIELDS.has(field) ? field === 'capacity' ? 1 : 0 : undefined} max={NUMBER_FIELDS.has(field) ? Number.MAX_SAFE_INTEGER : undefined} step={NUMBER_FIELDS.has(field) ? 1 : undefined} value={String(draft.fields[field] ?? '')} disabled={busy || mode === 'RECOMMENDED'} onChange={(event) => patchCustomDraft(fact.fact_id, { fields: { ...draft.fields, [field]: event.target.value } })} className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs" />
                      )}
                    </label>
                  ))}
                </div>}

                {draft?.normalizedType === 'EVENT_STATE' && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[10px] text-muted-foreground">{t('review.stageSnapshot')}</span>
                      {mode === 'CUSTOM' && <button type="button" disabled={busy} onClick={() => patchCustomDraft(fact.fact_id, { entities: [...draft.entities, { id: crypto.randomUUID(), entityId: '', kind: 'PERSON', zone: 'STAGE', transition: '' }] })} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] disabled:opacity-40"><Plus size={10} /> {t('review.addEntity')}</button>}
                    </div>
                    {draft.entities.map((entity) => (
                      <div key={entity.id} className="mt-2 grid grid-cols-[1fr_70px_1fr_90px_24px] gap-1">
                        <input disabled={busy || mode === 'RECOMMENDED'} value={entity.entityId} placeholder="entity ID" onChange={(event) => patchCustomDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, entityId: event.target.value } : item) })} className="border border-border bg-background px-2 py-1 text-xs" />
                        <select disabled={busy || mode === 'RECOMMENDED'} value={entity.kind} onChange={(event) => patchCustomDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, kind: event.target.value as EntityDraft['kind'] } : item) })} className="border border-border bg-background px-1 text-[10px]"><option>PERSON</option><option>PROP</option></select>
                        <select disabled={busy || mode === 'RECOMMENDED'} value={entity.zone} onChange={(event) => patchCustomDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, zone: event.target.value as StageZone } : item) })} className="border border-border bg-background px-1 text-[10px]">{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select>
                        <select disabled={busy || mode === 'RECOMMENDED'} value={entity.transition} onChange={(event) => patchCustomDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, transition: event.target.value as EntityDraft['transition'] } : item) })} className="border border-border bg-background px-1 text-[10px]"><option value="">{t('review.keep')}</option><option>ENTER</option><option>EXIT</option></select>
                        {mode === 'CUSTOM' ? <button type="button" disabled={busy} onClick={() => patchCustomDraft(fact.fact_id, { entities: draft.entities.filter((item) => item.id !== entity.id) })} className="border border-border disabled:opacity-40"><X size={11} /></button> : <span />}
                      </div>
                    ))}
                  </div>
                )}
                {draftErrors[fact.fact_id] && <p className="mt-2 text-xs text-violation">{draftErrors[fact.fact_id]}</p>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border p-4">
        <p className="text-xs text-muted-foreground">{pending > 0 ? t('review.pending', { count: pending }) : t('review.allDecided')}</p>
        <button type="button" disabled={busy || pending > 0 || hasErrors} onClick={submit} className="border border-foreground bg-foreground px-5 py-2.5 text-sm text-background disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground">{busy ? t('review.freezing') : t('review.run')}</button>
      </div>
    </section>
  );
}
