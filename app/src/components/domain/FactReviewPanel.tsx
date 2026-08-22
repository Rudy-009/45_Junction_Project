import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  NORMALIZED_FACT_TYPES,
  type FactCandidate,
  type NormalizedFactType,
  type StageZone,
} from '@/types/standby';
import { cn } from '@/lib/utils';
import { useI18n, type Locale } from '@/lib/i18n';

type ReviewDecision = 'PENDING' | 'REVIEWED' | 'REJECTED';
type EntityDraft = { id: string; entityId: string; kind: 'PERSON' | 'PROP'; zone: StageZone; transition: '' | 'ENTER' | 'EXIT' };
type ReviewDraft = {
  decision: ReviewDecision;
  normalizedType: NormalizedFactType | '';
  fields: Record<string, string | boolean>;
  entities: EntityDraft[];
};

export type FactReviewCommand = {
  fact_id: string;
  decision: 'REVIEWED' | 'REJECTED';
  corrected_value?: unknown;
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

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function draftFor(fact: FactCandidate): ReviewDraft {
  const known = NORMALIZED_FACT_TYPES.find((type) => type === fact.fact_type) ?? '';
  const raw = objectValue(fact.raw_value);
  const target = objectValue(raw.target);
  const time = objectValue(raw.time_range_ms);
  const snapshot = objectValue(raw.stage_snapshot);
  const fields: Record<string, string | boolean> = {};
  for (const field of known ? FIELD_MAP[known] ?? [] : []) {
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
      id: crypto.randomUUID(), entityId, kind: state.kind === 'PROP' ? 'PROP' : 'PERSON', zone: state.zone as StageZone,
      transition: state.transition === 'ENTER' || state.transition === 'EXIT' ? state.transition : '',
    }];
  });
  return { decision: 'PENDING', normalizedType: known, fields, entities };
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

function validationError(draft: ReviewDraft, locale: Locale): string | null {
  if (draft.decision !== 'REVIEWED') return null;
  if (!draft.normalizedType) return locale === 'ko' ? '정규화 유형을 선택하세요.' : 'Select a normalized type.';
  for (const [field, value] of Object.entries(draft.fields)) {
    if (BOOLEAN_FIELDS.has(field)) continue;
    if (String(value).trim() === '') return locale === 'ko' ? `${field} 값이 필요합니다.` : `${field} is required.`;
    if (NUMBER_FIELDS.has(field) && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return locale === 'ko' ? `${field}는 0 이상의 숫자여야 합니다.` : `${field} must be a non-negative number.`;
    }
  }
  if (draft.normalizedType === 'EVENT_STATE') {
    const ids = draft.entities.map((entity) => entity.entityId.trim());
    if (ids.some((id) => !id)) return locale === 'ko' ? '모든 무대 엔티티에 ID가 필요합니다.' : 'Every stage entity needs an ID.';
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

export function FactReviewPanel({ facts, busy, onSubmit }: {
  facts: FactCandidate[];
  busy: boolean;
  onSubmit: (reviews: FactReviewCommand[]) => void;
}) {
  const { locale, t } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>(() =>
    Object.fromEntries(facts.map((fact) => [fact.fact_id, draftFor(fact)])),
  );
  const pending = Object.values(drafts).filter((draft) => draft.decision === 'PENDING').length;
  const errors = useMemo(() => Object.fromEntries(
    Object.entries(drafts).map(([factId, draft]) => [factId, validationError(draft, locale)]),
  ), [drafts, locale]);
  const hasErrors = Object.values(errors).some(Boolean);

  const patchDraft = (factId: string, patch: Partial<ReviewDraft>) => {
    setDrafts((current) => {
      const existing = current[factId];
      return existing ? { ...current, [factId]: { ...existing, ...patch } } : current;
    });
  };

  const submit = () => {
    if (hasErrors) return;
    const reviews = facts.flatMap((fact): FactReviewCommand[] => {
      const draft = drafts[fact.fact_id];
      if (!draft || draft.decision === 'PENDING') return [];
      if (draft.decision === 'REJECTED') return [{ fact_id: fact.fact_id, decision: 'REJECTED' }];
      return [{
        fact_id: fact.fact_id,
        decision: 'REVIEWED',
        corrected_value: { normalized_fact_type: draft.normalizedType, value: normalizedValue(draft) },
      }];
    });
    onSubmit(reviews);
  };

  return (
    <section className="mt-6 border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="text-base font-medium">{t('review.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('review.help')}</p>
        </div>
        <span className="mono text-[11px] text-muted-foreground">{facts.length - pending}/{facts.length} DECIDED</span>
      </div>

      <div className="divide-y divide-border">
        {facts.map((fact) => {
          const draft = drafts[fact.fact_id];
          if (!draft) return null;
          const fields = draft.normalizedType ? FIELD_MAP[draft.normalizedType] ?? [] : [];
          return (
            <article key={fact.fact_id} className="grid gap-4 p-4 xl:grid-cols-[220px_1fr_1fr]">
              <div>
                <div className="mono text-[10px] text-muted-foreground">{fact.source_role}</div>
                <div className="mt-1 break-all text-sm font-medium">{fact.fact_type}</div>
                <div className="mono mt-2 text-[10px] text-muted-foreground">{fact.locator}</div>
                <blockquote className="mt-2 border-l border-border-strong pl-2 text-xs leading-5">{fact.quote}</blockquote>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => patchDraft(fact.fact_id, { decision: 'REVIEWED' })} className={cn('flex items-center gap-1 border px-2 py-1 text-xs', draft.decision === 'REVIEWED' ? 'border-consistent text-consistent' : 'border-border')}><Check size={12} /> {t('review.approve')}</button>
                  <button type="button" onClick={() => patchDraft(fact.fact_id, { decision: 'REJECTED' })} className={cn('flex items-center gap-1 border px-2 py-1 text-xs', draft.decision === 'REJECTED' ? 'border-violation text-violation' : 'border-border')}><X size={12} /> {t('review.reject')}</button>
                </div>
              </div>

              <div>
                <div className="mono mb-2 text-[10px] text-muted-foreground">{t('review.extracted')}</div>
                <ExtractedFields value={fact.raw_value} />
              </div>

              <div className={cn(draft.decision !== 'REVIEWED' && 'opacity-45')}>
                <label className="mono block text-[10px] text-muted-foreground">{t('review.normalizedType')}</label>
                <select value={draft.normalizedType} disabled={draft.decision !== 'REVIEWED'} onChange={(event) => {
                  const normalizedType = event.target.value as NormalizedFactType | '';
                  const next = normalizedType ? draftFor({ ...fact, fact_type: normalizedType }) : null;
                  patchDraft(fact.fact_id, { normalizedType, fields: next?.fields ?? {}, entities: normalizedType === 'EVENT_STATE' ? draft.entities : [] });
                }} className="mt-1 w-full border border-border bg-background px-2 py-2 text-xs">
                  <option value="">{t('review.selectType')}</option>
                  {NORMALIZED_FACT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {fields.map((field) => (
                    <label key={field} className={field === 'label' || field === 'responsible_party' ? 'col-span-2' : ''}>
                      <span className="mono text-[10px] text-muted-foreground">{field}</span>
                      {BOOLEAN_FIELDS.has(field) ? (
                        <input type="checkbox" checked={draft.fields[field] === true} disabled={draft.decision !== 'REVIEWED'} onChange={(event) => patchDraft(fact.fact_id, { fields: { ...draft.fields, [field]: event.target.checked } })} className="ml-2" />
                      ) : ZONE_FIELDS.has(field) ? (
                        <select value={String(draft.fields[field] ?? '')} disabled={draft.decision !== 'REVIEWED'} onChange={(event) => patchDraft(fact.fact_id, { fields: { ...draft.fields, [field]: event.target.value } })} className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs"><option value="">zone 선택</option>{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select>
                      ) : (
                        <input type={NUMBER_FIELDS.has(field) ? 'number' : 'text'} min={NUMBER_FIELDS.has(field) ? 0 : undefined} value={String(draft.fields[field] ?? '')} disabled={draft.decision !== 'REVIEWED'} onChange={(event) => patchDraft(fact.fact_id, { fields: { ...draft.fields, [field]: event.target.value } })} className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs" />
                      )}
                    </label>
                  ))}
                </div>

                {draft.normalizedType === 'EVENT_STATE' && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[10px] text-muted-foreground">{t('review.stageSnapshot')}</span>
                      <button type="button" onClick={() => patchDraft(fact.fact_id, { entities: [...draft.entities, { id: crypto.randomUUID(), entityId: '', kind: 'PERSON', zone: 'STAGE', transition: '' }] })} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px]"><Plus size={10} /> {t('review.addEntity')}</button>
                    </div>
                    {draft.entities.map((entity) => (
                      <div key={entity.id} className="mt-2 grid grid-cols-[1fr_70px_1fr_90px_24px] gap-1">
                        <input value={entity.entityId} placeholder="entity ID" onChange={(event) => patchDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, entityId: event.target.value } : item) })} className="border border-border bg-background px-2 py-1 text-xs" />
                        <select value={entity.kind} onChange={(event) => patchDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, kind: event.target.value as EntityDraft['kind'] } : item) })} className="border border-border bg-background px-1 text-[10px]"><option>PERSON</option><option>PROP</option></select>
                        <select value={entity.zone} onChange={(event) => patchDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, zone: event.target.value as StageZone } : item) })} className="border border-border bg-background px-1 text-[10px]">{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select>
                        <select value={entity.transition} onChange={(event) => patchDraft(fact.fact_id, { entities: draft.entities.map((item) => item.id === entity.id ? { ...item, transition: event.target.value as EntityDraft['transition'] } : item) })} className="border border-border bg-background px-1 text-[10px]"><option value="">{t('review.keep')}</option><option>ENTER</option><option>EXIT</option></select>
                        <button type="button" onClick={() => patchDraft(fact.fact_id, { entities: draft.entities.filter((item) => item.id !== entity.id) })} className="border border-border"><X size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {errors[fact.fact_id] && <p className="mt-2 text-xs text-violation">{errors[fact.fact_id]}</p>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border p-4">
        <p className="text-xs text-muted-foreground">{pending > 0 ? t('review.pending', { count: pending }) : t('review.allDecided')}</p>
        <button type="button" disabled={busy || hasErrors} onClick={submit} className="border border-foreground bg-foreground px-5 py-2.5 text-sm text-background disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground">{busy ? t('review.freezing') : t('review.run')}</button>
      </div>
    </section>
  );
}
