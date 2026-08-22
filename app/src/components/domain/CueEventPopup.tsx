import { X } from 'lucide-react';
import type { Action, Cue, CueEvent, CueSheet, Direction } from '@/types/cue-sheet';
import type { Contradiction } from '@/types/validation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

function directionLabel(direction: Direction | undefined, locale: 'ko' | 'en') {
  if (direction === 'stage_left') return locale === 'ko' ? '상수' : 'Stage Left';
  if (direction === 'stage_right') return locale === 'ko' ? '하수' : 'Stage Right';
  return '—';
}
function actionLabel(action: Action, cueSheet: CueSheet, locale: 'ko' | 'en') {
  const character = action.character_id
    ? cueSheet.characters.find((item) => item.id === action.character_id)?.name ?? action.character_id
    : '';
  const prop = action.prop_id
    ? cueSheet.props.find((item) => item.id === action.prop_id)?.name ?? action.prop_id
    : '';
  const direction = directionLabel(action.direction, locale);
  if (locale === 'en') {
    if (action.type === 'character_enter') return `${character} enters from ${direction}`;
    if (action.type === 'character_exit') return `${character} exits to ${direction}`;
    if (action.type === 'backstage_crossover') return `${character} ${directionLabel(action.from, locale)} → ${directionLabel(action.to, locale)}`;
    if (action.type === 'prop_in') return `${prop} in from ${direction}`;
    if (action.type === 'prop_out') return `${prop} out to ${direction}`;
    return `${character} costume change`;
  }
  if (action.type === 'character_enter') return `${character} ${direction} 등장`;
  if (action.type === 'character_exit') return `${character} ${direction} 퇴장`;
  if (action.type === 'backstage_crossover') return `${character} ${directionLabel(action.from, locale)} → ${directionLabel(action.to, locale)}`;
  if (action.type === 'prop_in') return `${prop} ${direction} 반입`;
  if (action.type === 'prop_out') return `${prop} ${direction} 반출`;
  return `${character} 환복`;
}

function StatusToken({ severity, count }: { severity: 'ERROR' | 'WARNING'; count: number }) {
  return (
    <span className={cn(
      'border px-2 py-1 text-[10px]',
      severity === 'ERROR'
        ? 'border-violation bg-violation-bg text-violation'
        : 'border-review bg-review-bg text-review',
    )}>
      {severity === 'ERROR' ? 'ERROR' : 'ACTION REQUIRED'} {count}
    </span>
  );
}

export function CueEventPopup({
  cue,
  event,
  cueSheet,
  contradictions,
  onClose,
  onGoto,
}: {
  cue: Cue;
  event: CueEvent;
  cueSheet: CueSheet;
  contradictions: Contradiction[];
  onClose: () => void;
  onGoto: () => void;
}) {
  const { locale } = useI18n();
  const errors = contradictions.filter((item) => item.severity === 'ERROR');
  const warnings = contradictions.filter((item) => item.severity === 'WARNING');
  const copy = locale === 'ko' ? {
    title: 'EVENT 상세',
    trigger: '트리거',
    actions: '액션',
    findings: '확인 항목',
    noAction: '기록된 액션 없음',
    goto: '이 Event로 이동',
  } : {
    title: 'EVENT DETAIL',
    trigger: 'Trigger',
    actions: 'Actions',
    findings: 'Findings',
    noAction: 'No recorded action',
    goto: 'Go to this Event',
  };

  return (
    <div className="slide-up-panel absolute inset-0 z-40 flex flex-col border-t border-border-strong bg-elevated">
      <header className="flex min-h-10 shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <div className="min-w-0">
          <span className="text-[10px] tracking-[0.12em] text-muted-foreground">{copy.title}</span>
          <p className="mt-0.5 truncate text-xs">
            <span className="font-semibold">{event.event_id}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            {cue.scene_number}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={locale === 'ko' ? '닫기' : 'Close'} className="border border-border p-1.5 hover:bg-muted">
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-wrap gap-2">
          {errors.length > 0 && <StatusToken severity="ERROR" count={errors.length} />}
          {warnings.length > 0 && <StatusToken severity="WARNING" count={warnings.length} />}
          {contradictions.length === 0 && (
            <span className="border border-consistent/50 px-2 py-1 text-[10px] text-consistent">OK</span>
          )}
          <span className="border border-border px-2 py-1 text-[10px] text-muted-foreground">{event.trigger.type}</span>
        </div>

        <section className="mt-4 border border-border bg-background p-3">
          <h3 className="text-[10px] text-muted-foreground">{copy.trigger}</h3>
          <p className="mt-2 text-sm leading-5">{event.trigger.description || '—'}</p>
        </section>

        <section className="mt-3">
          <h3 className="text-[10px] text-muted-foreground">{copy.actions} · {event.actions.length}</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {event.actions.map((action, index) => (
              <article key={`${action.type}-${index}`} className="border border-border bg-background p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-[9px]">{action.type}</span>
                </div>
                <p className="mt-2 text-xs leading-5">{actionLabel(action, cueSheet, locale)}</p>
              </article>
            ))}
            {event.actions.length === 0 && (
              <div className="border border-border bg-background p-3 text-xs text-muted-foreground">{copy.noAction}</div>
            )}
          </div>
        </section>

        <section className="mt-4">
          <h3 className="text-[10px] text-muted-foreground">{copy.findings} · {contradictions.length}</h3>
          <div className="mt-2 grid gap-2">
            {contradictions.map((finding, index) => (
              <article key={`${finding.rule}-${index}`} className={cn(
                'border p-3',
                finding.severity === 'ERROR'
                  ? 'border-violation bg-violation-bg'
                  : 'border-review bg-review-bg',
              )}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-[10px]', finding.severity === 'ERROR' ? 'text-violation' : 'text-review')}>
                    {finding.severity === 'ERROR' ? 'ERROR' : 'ACTION REQUIRED'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{finding.rule}</span>
                </div>
                <p className="mt-2 text-xs leading-5">{finding.description}</p>
                {Object.keys(finding.details).length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-px border border-border bg-border text-[10px]">
                    {Object.entries(finding.details).map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="bg-muted px-2 py-1 text-muted-foreground">{key}</dt>
                        <dd className="break-all bg-background px-2 py-1">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-border p-2">
        <button type="button" onClick={onGoto} className="w-full border border-foreground bg-foreground px-3 py-2.5 text-sm font-medium text-background hover:bg-muted-foreground">
          {copy.goto}
        </button>
      </footer>
    </div>
  );
}
