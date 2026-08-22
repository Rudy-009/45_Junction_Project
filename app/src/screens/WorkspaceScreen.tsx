import { useMemo } from 'react';
import { useCueSheetStore } from '@/store';
import { PanelHeader } from '@/components/ui';
import { StageSimulator } from '@/components/domain';
import type { StageEntity } from '@/types';
import type { Contradiction } from '@/types/validation';
import { cn } from '@/lib/utils';

export function WorkspaceScreen() {
  const cueSheet = useCueSheetStore((s) => s.cueSheet);
  const validationResult = useCueSheetStore((s) => s.validationResult);
  const selectedCueId = useCueSheetStore((s) => s.selectedCueId);
  const selectCue = useCueSheetStore((s) => s.selectCue);

  if (!cueSheet) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">큐시트가 로드되지 않았습니다.</p>
          <p className="mt-2 text-sm text-muted-foreground">입력 화면에서 큐시트 파일을 업로드해주세요.</p>
        </div>
      </div>
    );
  }

  const selectedCue = cueSheet.cues.find((c) => c.cue_id === selectedCueId) ?? cueSheet.cues[0];
  const cueContradictions = validationResult?.contradictions.filter(
    (c) => c.cue_id === selectedCue?.cue_id
  ) ?? [];

  // Build stage entities from current cue state
  const entities: StageEntity[] = useMemo(() => {
    // TODO: derive from cue sheet state tracking
    return [];
  }, [selectedCue]);

  const crossoverValue = cueSheet.venue.has_backstage_crossover ? 'true' : 'false';

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Top bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <span className="mono text-[11px] text-muted-foreground">
          {cueSheet.metadata.title}
        </span>
        {validationResult && (
          <span className="mono text-[11px] text-muted-foreground">
            검증: {validationResult.errors} errors, {validationResult.warnings} warnings
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: Cue list */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border">
          <PanelHeader title="큐 목록" />
          <div className="min-h-0 flex-1 overflow-auto">
            {cueSheet.cues.map((cue) => {
              const hasError = validationResult?.contradictions.some(
                (c) => c.cue_id === cue.cue_id && c.severity === 'ERROR'
              );
              const hasWarning = validationResult?.contradictions.some(
                (c) => c.cue_id === cue.cue_id && c.severity === 'WARNING'
              );
              const isSelected = cue.cue_id === selectedCue?.cue_id;
              return (
                <button
                  key={cue.cue_id}
                  onClick={() => selectCue(cue.cue_id)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted',
                    isSelected && 'bg-muted',
                  )}
                >
                  {hasError && <span className="h-2 w-2 shrink-0 rounded-full bg-violation" />}
                  {!hasError && hasWarning && <span className="h-2 w-2 shrink-0 rounded-full bg-review" />}
                  {!hasError && !hasWarning && <span className="h-2 w-2 shrink-0 rounded-full bg-consistent" />}
                  <div>
                    <span className="mono">{cue.scene_number}</span>
                    {cue.notes && <span className="ml-2 text-muted-foreground">{cue.notes.slice(0, 30)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Detail */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Stage simulator */}
          <div className="h-[280px] shrink-0 border-b border-border">
            <StageSimulator crossover={crossoverValue} entities={entities} />
          </div>

          {/* Events detail */}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {selectedCue && (
              <>
                <h2 className="mono mb-3 text-sm font-medium">
                  {selectedCue.scene_number} · {selectedCue.scene_type === 'number' ? '넘버' : '씬'}
                </h2>

                {/* Contradictions */}
                {cueContradictions.length > 0 && (
                  <div className="mb-4 flex flex-col gap-2">
                    {cueContradictions.map((c, i) => (
                      <ContradictionCard key={i} contradiction={c} />
                    ))}
                  </div>
                )}

                {/* Events */}
                <div className="flex flex-col gap-3">
                  {selectedCue.events.map((event) => (
                    <div key={event.event_id} className="border border-border bg-surface p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="mono text-[11px] text-muted-foreground">{event.event_id}</span>
                        <span className="mono text-[10px] border border-border px-1 py-[1px] text-muted-foreground">
                          {event.trigger.type}
                        </span>
                        {event.trigger.description && (
                          <span className="text-xs text-muted-foreground">{event.trigger.description}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {event.actions.map((action, ai) => (
                          <span
                            key={ai}
                            className="mono border border-border bg-background px-2 py-1 text-[11px]"
                          >
                            {action.type}
                            {action.character_id && ` · ${cueSheet.characters.find(c => c.id === action.character_id)?.name ?? action.character_id}`}
                            {action.prop_id && ` · ${cueSheet.props.find(p => p.id === action.prop_id)?.name ?? action.prop_id}`}
                            {action.direction && ` · ${action.direction === 'stage_left' ? '상수' : '하수'}`}
                          </span>
                        ))}
                      </div>
                      {event.notes && (
                        <p className="mt-2 text-[11px] text-muted-foreground">{event.notes}</p>
                      )}
                    </div>
                  ))}
                  {selectedCue.events.length === 0 && (
                    <p className="text-sm text-muted-foreground">이 씬에 등록된 이벤트가 없습니다.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContradictionCard({ contradiction }: { contradiction: Contradiction }) {
  const isError = contradiction.severity === 'ERROR';
  return (
    <div
      className={cn(
        'border p-3 text-xs',
        isError ? 'border-violation bg-violation-bg text-violation' : 'border-review bg-review-bg text-review',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="mono font-medium">{contradiction.severity}</span>
        <span className="mono text-[10px]">{contradiction.rule}</span>
      </div>
      <p className="mt-1">{contradiction.description}</p>
    </div>
  );
}
