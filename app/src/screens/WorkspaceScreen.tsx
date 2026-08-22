import { useMemo, useRef, useEffect } from 'react';
import { useCueSheetStore } from '@/store';
import { PanelHeader } from '@/components/ui';
import { StageSimulator } from '@/components/domain';
import type { StageEntity } from '@/types';
import type { CueSheet, CueEvent, Action, Direction } from '@/types/cue-sheet';
import type { Contradiction } from '@/types/validation';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';

// ─── Helpers ───────────────────────────────────────────────

function dirLabel(dir: Direction | undefined): string {
  if (dir === 'stage_left') return '상수';
  if (dir === 'stage_right') return '하수';
  return '';
}

function actionSummary(action: Action, cueSheet: CueSheet): string {
  const charName = action.character_id
    ? cueSheet.characters.find((c) => c.id === action.character_id)?.name ?? ''
    : '';
  const propName = action.prop_id
    ? cueSheet.props.find((p) => p.id === action.prop_id)?.name ?? ''
    : '';
  const dir = dirLabel(action.direction);
  const carriedBy = action.carried_by
    ? cueSheet.characters.find((c) => c.id === action.carried_by)?.name ?? ''
    : '';

  switch (action.type) {
    case 'character_enter': return `${charName} 등장 (${dir})`;
    case 'character_exit': return `${charName} 퇴장 (${dir})`;
    case 'backstage_crossover': return `${charName} ${dirLabel(action.from)}→${dirLabel(action.to)}`;
    case 'prop_in': return `${propName} in${carriedBy ? ` (${carriedBy})` : ''} ${dir}`;
    case 'prop_out': return `${propName} out${carriedBy ? ` (${carriedBy})` : ''} ${dir}`;
    case 'costume_change': return `${charName} 환복 ${action.costume_change_duration_sec ?? 0}s`;
    default: return action.type;
  }
}

function triggerIcon(type: string): string {
  switch (type) {
    case 'dialogue': return '💬';
    case 'scene_change': return '🎬';
    case 'lighting_cue': return '💡';
    case 'sound_cue': return '🔊';
    default: return '⚡';
  }
}

function actionColor(type: Action['type']): string {
  switch (type) {
    case 'character_enter': return 'bg-consistent/20 border-consistent text-consistent';
    case 'character_exit': return 'bg-review/20 border-review text-review';
    case 'backstage_crossover': return 'bg-insufficient/20 border-insufficient text-insufficient';
    case 'prop_in': return 'bg-person/20 border-person text-person';
    case 'prop_out': return 'bg-prop/20 border-prop text-prop';
    case 'costume_change': return 'bg-edited/20 border-edited text-edited';
    default: return 'bg-muted border-border text-foreground';
  }
}

function cellBorderColor(contradictions: Contradiction[]): string {
  if (contradictions.some((c) => c.severity === 'ERROR')) return 'border-violation';
  if (contradictions.some((c) => c.severity === 'WARNING')) return 'border-review';
  return 'border-border';
}

// ─── Main Component ────────────────────────────────────────

export function WorkspaceScreen() {
  const navigate = useNavigate();
  const cueSheet = useCueSheetStore((s) => s.cueSheet);
  const validationResult = useCueSheetStore((s) => s.validationResult);
  const selectedCueId = useCueSheetStore((s) => s.selectedCueId);
  const selectedEventId = useCueSheetStore((s) => s.selectedEventId);
  const selectCue = useCueSheetStore((s) => s.selectCue);
  const selectEvent = useCueSheetStore((s) => s.selectEvent);

  if (!cueSheet) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">큐시트가 로드되지 않았습니다.</p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="mt-4 border border-foreground bg-foreground px-4 py-2 text-sm text-background hover:bg-muted-foreground"
          >
            입력 화면으로
          </button>
        </div>
      </div>
    );
  }

  const selectedCue = cueSheet.cues.find((c) => c.cue_id === selectedCueId) ?? cueSheet.cues[0];
  const selectedEvt = selectedCue?.events.find((e) => e.event_id === selectedEventId) ?? null;

  // Stage entities at selected event
  const entities: StageEntity[] = useMemo(() => {
    if (!selectedCue) return [];
    return buildStageEntities(cueSheet, selectedCue.cue_id, selectedEventId ?? undefined);
  }, [cueSheet, selectedCue, selectedEventId]);

  const crossoverValue = cueSheet.venue.has_backstage_crossover ? 'true' : 'false';

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Top bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <span className="mono text-[11px] text-muted-foreground">
          {cueSheet.metadata.title}
        </span>
        {validationResult && (
          <div className="flex items-center gap-3 text-[11px]">
            {validationResult.errors > 0 && (
              <span className="mono text-violation">🔴 {validationResult.errors} errors</span>
            )}
            {validationResult.warnings > 0 && (
              <span className="mono text-review">🟡 {validationResult.warnings} warnings</span>
            )}
            {validationResult.total_contradictions === 0 && (
              <span className="mono text-consistent">✓ 모순 없음</span>
            )}
          </div>
        )}
      </div>

      {/* Main area: vertical stack */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Stage simulator */}
        <div className="flex h-[260px] shrink-0 flex-col border-b border-border">
          <PanelHeader
            title="STAGE"
            right={
              <span className="mono text-[10px] text-muted-foreground">
                {selectedCue?.scene_number}{selectedEvt ? ` · ${selectedEvt.event_id}` : ''}
              </span>
            }
          />
          <div className="min-h-0 flex-1">
            <StageSimulator crossover={crossoverValue} entities={entities} />
          </div>
        </div>

        {/* Event detail */}
        <div className="flex min-h-0 flex-1 flex-col border-b border-border">
          <PanelHeader
            title={selectedCue ? `${selectedCue.scene_number} · ${selectedCue.scene_type === 'number' ? '넘버' : '씬'}` : '씬 선택'}
            right={
              selectedCue?.notes ? (
                <span className="max-w-[400px] truncate text-[10px] text-muted-foreground">
                  {selectedCue.notes}
                </span>
              ) : undefined
            }
          />
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {selectedEvt ? (
              <EventDetail
                event={selectedEvt}
                cueSheet={cueSheet}
                contradictions={validationResult?.contradictions.filter(
                  (c) => c.event_id === selectedEvt.event_id,
                ) ?? []}
              />
            ) : selectedCue ? (
              <CueOverview
                cue={selectedCue}
                cueSheet={cueSheet}
                contradictions={validationResult?.contradictions.filter(
                  (c) => c.cue_id === selectedCue.cue_id,
                ) ?? []}
              />
            ) : (
              <p className="text-sm text-muted-foreground">이벤트를 선택하세요.</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Timeline (horizontal scroll) */}
      <Timeline
        cueSheet={cueSheet}
        selectedCueId={selectedCue?.cue_id ?? null}
        selectedEventId={selectedEventId}
        contradictions={validationResult?.contradictions ?? []}
        onSelectCue={selectCue}
        onSelectEvent={(cueId, eventId) => {
          selectCue(cueId);
          selectEvent(eventId);
        }}
      />
    </div>
  );
}

// ─── Timeline Component ────────────────────────────────────

function Timeline({
  cueSheet,
  selectedCueId,
  selectedEventId,
  contradictions,
  onSelectCue,
  onSelectEvent,
}: {
  cueSheet: CueSheet;
  selectedCueId: string | null;
  selectedEventId: string | null;
  contradictions: Contradiction[];
  onSelectCue: (id: string) => void;
  onSelectEvent: (cueId: string, eventId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected event
  useEffect(() => {
    if (!selectedEventId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-event="${selectedEventId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedEventId]);

  return (
    <div className="flex h-[180px] shrink-0 flex-col border-t border-border bg-surface">
      {/* Timeline header */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          EVENT TIMELINE
        </span>
        <span className="mono text-[10px] text-muted-foreground">
          ← 가로 스크롤 →
        </span>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full items-stretch gap-0 p-2">
          {cueSheet.cues.map((cue) => {
            const isCueSelected = cue.cue_id === selectedCueId;
            const cueContradictions = contradictions.filter((c) => c.cue_id === cue.cue_id);
            const hasError = cueContradictions.some((c) => c.severity === 'ERROR');
            const hasWarning = cueContradictions.some((c) => c.severity === 'WARNING');

            return (
              <div key={cue.cue_id} className="flex h-full shrink-0 flex-col">
                {/* Cue label */}
                <button
                  onClick={() => {
                    onSelectCue(cue.cue_id);
                  }}
                  className={cn(
                    'mono mb-1 flex items-center gap-1 border px-2 py-0.5 text-[10px]',
                    isCueSelected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-muted text-muted-foreground hover:bg-background',
                  )}
                >
                  {hasError && <span className="h-1.5 w-1.5 rounded-full bg-violation" />}
                  {!hasError && hasWarning && <span className="h-1.5 w-1.5 rounded-full bg-review" />}
                  {cue.scene_number}
                </button>

                {/* Events row */}
                <div className="flex min-h-0 flex-1 items-stretch gap-[2px]">
                  {cue.events.length > 0 ? (
                    cue.events.map((event) => {
                      const evtContradictions = contradictions.filter(
                        (c) => c.event_id === event.event_id,
                      );
                      const isSelected = event.event_id === selectedEventId;
                      return (
                        <EventCell
                          key={event.event_id}
                          event={event}
                          cueId={cue.cue_id}
                          cueSheet={cueSheet}
                          contradictions={evtContradictions}
                          isSelected={isSelected}
                          onClick={() => onSelectEvent(cue.cue_id, event.event_id)}
                        />
                      );
                    })
                  ) : (
                    <div className="flex w-16 shrink-0 items-center justify-center border border-dashed border-border text-[9px] text-muted-foreground">
                      empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Event Cell (timeline block) ───────────────────────────

function EventCell({
  event,
  cueId: _cueId,
  cueSheet,
  contradictions,
  isSelected,
  onClick,
}: {
  event: CueEvent;
  cueId: string;
  cueSheet: CueSheet;
  contradictions: Contradiction[];
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-event={event.event_id}
      onClick={onClick}
      className={cn(
        'flex w-[120px] shrink-0 flex-col justify-between border p-1.5 text-left transition-all',
        isSelected
          ? 'border-foreground bg-foreground/10 ring-1 ring-foreground'
          : cn('hover:bg-muted', cellBorderColor(contradictions)),
      )}
    >
      {/* Top: trigger */}
      <div className="flex items-center gap-1">
        <span className="text-[11px]">{triggerIcon(event.trigger.type)}</span>
        <span className="mono truncate text-[9px] text-muted-foreground">
          {event.trigger.description?.slice(0, 20) ?? event.trigger.type}
        </span>
      </div>

      {/* Middle: actions preview */}
      <div className="my-1 flex flex-wrap gap-[2px]">
        {event.actions.slice(0, 3).map((action, i) => (
          <span
            key={i}
            className={cn('border px-1 py-[0px] text-[8px]', actionColor(action.type))}
          >
            {action.type === 'character_enter' ? '▶' :
             action.type === 'character_exit' ? '◀' :
             action.type === 'prop_in' ? '📦+' :
             action.type === 'prop_out' ? '📦-' :
             action.type === 'backstage_crossover' ? '↔' :
             action.type === 'costume_change' ? '👔' : '?'}
            {action.character_id
              ? cueSheet.characters.find((c) => c.id === action.character_id)?.name?.charAt(0) ?? ''
              : ''}
          </span>
        ))}
        {event.actions.length > 3 && (
          <span className="text-[8px] text-muted-foreground">+{event.actions.length - 3}</span>
        )}
      </div>

      {/* Bottom: status */}
      <div className="flex items-center justify-between">
        <span className="mono text-[8px] text-muted-foreground">
          {event.actions.length}act
        </span>
        {contradictions.length > 0 && (
          <span className={cn(
            'mono text-[8px]',
            contradictions.some((c) => c.severity === 'ERROR') ? 'text-violation' : 'text-review',
          )}>
            ⚠{contradictions.length}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Event Detail Panel ────────────────────────────────────

function EventDetail({
  event,
  cueSheet,
  contradictions,
}: {
  event: CueEvent;
  cueSheet: CueSheet;
  contradictions: Contradiction[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="mono text-sm font-medium">{event.event_id}</span>
        <span className="text-lg">{triggerIcon(event.trigger.type)}</span>
        <span className="mono border border-border px-2 py-[1px] text-[11px] text-muted-foreground">
          {event.trigger.type}
        </span>
      </div>

      {/* Trigger description */}
      {event.trigger.description && (
        <div className="border-l-2 border-border pl-3">
          <p className="text-sm">
            {event.trigger.character_id &&
              cueSheet.characters.find((c) => c.id === event.trigger.character_id)?.name + ': '}
            {event.trigger.description}
          </p>
        </div>
      )}

      {/* Contradictions */}
      {contradictions.length > 0 && (
        <div className="flex flex-col gap-2">
          {contradictions.map((c, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2 border p-3 text-xs',
                c.severity === 'ERROR' ? 'border-violation bg-violation-bg' : 'border-review bg-review-bg',
              )}
            >
              <span className={cn('mono shrink-0 font-medium', c.severity === 'ERROR' ? 'text-violation' : 'text-review')}>
                {c.severity}
              </span>
              <p className={c.severity === 'ERROR' ? 'text-violation' : 'text-review'}>
                {c.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div>
        <h3 className="mono mb-2 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          ACTIONS ({event.actions.length})
        </h3>
        <div className="flex flex-col gap-2">
          {event.actions.map((action, i) => (
            <div
              key={i}
              className={cn('flex items-center gap-3 border p-2.5', actionColor(action.type))}
            >
              <span className="mono text-sm font-medium">{i + 1}</span>
              <span className="text-xs">{actionSummary(action, cueSheet)}</span>
            </div>
          ))}
          {event.actions.length === 0 && (
            <p className="text-xs text-muted-foreground">액션 없음 (마커/대사 이벤트)</p>
          )}
        </div>
      </div>

      {/* Notes */}
      {event.notes && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {event.notes}
        </p>
      )}
    </div>
  );
}

// ─── Cue Overview (no event selected) ─────────────────────

function CueOverview({
  cue,
  cueSheet: _cueSheet,
  contradictions,
}: {
  cue: CueEvent extends never ? never : { cue_id: string; scene_number: string; scene_type: string; events: CueEvent[]; notes?: string; estimated_duration_sec?: number };
  cueSheet: CueSheet;
  contradictions: Contradiction[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="mono text-base font-medium">{cue.scene_number}</h2>
        <span className="mono border border-border px-2 py-[1px] text-[10px] text-muted-foreground">
          {cue.scene_type === 'number' ? '넘버' : '씬'}
        </span>
        <span className="mono text-[11px] text-muted-foreground">
          {cue.events.length} events
        </span>
      </div>

      {cue.notes && (
        <p className="text-sm text-muted-foreground">{cue.notes}</p>
      )}

      {contradictions.length > 0 && (
        <div>
          <h3 className="mono mb-2 text-[11px] text-muted-foreground">모순 {contradictions.length}건</h3>
          <div className="flex flex-col gap-1">
            {contradictions.map((c, i) => (
              <div key={i} className={cn('text-xs', c.severity === 'ERROR' ? 'text-violation' : 'text-review')}>
                ⚠ {c.description}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mono mb-2 text-[11px] text-muted-foreground">이벤트 요약</h3>
        <div className="flex flex-col gap-1">
          {cue.events.map((event, i) => (
            <div key={event.event_id} className="flex items-center gap-2 text-xs">
              <span className="mono w-5 text-[10px] text-muted-foreground">{i + 1}</span>
              <span>{triggerIcon(event.trigger.type)}</span>
              <span className="text-muted-foreground">
                {event.trigger.description?.slice(0, 40) ?? event.trigger.type}
              </span>
              <span className="mono text-[10px] text-muted-foreground">{event.actions.length}act</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Stage Entity Builder ──────────────────────────────────

function buildStageEntities(
  cueSheet: CueSheet,
  upToCueId: string,
  upToEventId?: string,
): StageEntity[] {
  type EntityState = {
    on_stage: boolean;
    last_direction: Direction | null;
    transition?: StageEntity['transition'];
  };

  const charState: Record<string, EntityState> = {};
  const propState: Record<string, EntityState> = {};

  for (const char of cueSheet.characters) {
    charState[char.id] = { on_stage: false, last_direction: null };
  }
  for (const prop of cueSheet.props) {
    propState[prop.id] = { on_stage: false, last_direction: null };
  }

  let done = false;
  for (const cue of cueSheet.cues) {
    if (done) break;
    for (const event of cue.events) {
      for (const state of Object.values(charState)) state.transition = undefined;
      for (const state of Object.values(propState)) state.transition = undefined;

      for (const action of event.actions) {
        switch (action.type) {
          case 'character_enter':
            if (action.character_id && charState[action.character_id]) {
              charState[action.character_id].on_stage = true;
              charState[action.character_id].last_direction = action.direction ?? null;
              charState[action.character_id].transition = 'ENTER';
            }
            break;
          case 'character_exit':
            if (action.character_id && charState[action.character_id]) {
              charState[action.character_id].on_stage = false;
              charState[action.character_id].last_direction = action.direction ?? null;
              charState[action.character_id].transition = 'EXIT';
            }
            break;
          case 'backstage_crossover':
            if (action.character_id && charState[action.character_id]) {
              charState[action.character_id].last_direction = action.to ?? null;
            }
            break;
          case 'prop_in':
            if (action.prop_id && propState[action.prop_id]) {
              propState[action.prop_id].on_stage = true;
              propState[action.prop_id].last_direction = action.direction ?? null;
              propState[action.prop_id].transition = 'ENTER';
            }
            break;
          case 'prop_out':
            if (action.prop_id && propState[action.prop_id]) {
              propState[action.prop_id].on_stage = false;
              propState[action.prop_id].last_direction = action.direction ?? null;
              propState[action.prop_id].transition = 'EXIT';
            }
            break;
        }
      }
      if (upToEventId && event.event_id === upToEventId) { done = true; break; }
    }
    if (!done && cue.cue_id === upToCueId) break;
  }

  const entities: StageEntity[] = [];

  for (const char of cueSheet.characters) {
    const state = charState[char.id];
    if (state.on_stage) {
      entities.push({
        id: char.id,
        label: char.name,
        kind: 'person',
        zone: '무대',
        transition: state.transition,
      });
    } else if (state.last_direction) {
      entities.push({
        id: char.id,
        label: char.name,
        kind: 'person',
        zone: state.last_direction === 'stage_left' ? '상수윙' : '하수윙',
        transition: state.transition,
      });
    }
  }

  for (const prop of cueSheet.props) {
    const state = propState[prop.id];
    if (state.on_stage) {
      entities.push({
        id: prop.id,
        label: prop.name,
        kind: 'prop',
        zone: '무대',
        transition: state.transition,
      });
    } else if (state.last_direction) {
      entities.push({
        id: prop.id,
        label: prop.name,
        kind: 'prop',
        zone: state.last_direction === 'stage_left' ? '상수윙' : '하수윙',
        transition: state.transition,
      });
    }
  }

  return entities;
}
