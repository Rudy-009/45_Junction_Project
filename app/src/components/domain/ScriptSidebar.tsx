import { useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n, type MessageKey } from '@/lib/i18n';

const SCRIPT_KIND_LABEL: Record<ScriptExcerptLine['kind'], MessageKey> = {
  DIALOGUE: 'workspace.scriptKind.dialogue',
  STAGE_DIRECTION: 'workspace.scriptKind.stageDirection',
  TRIGGER: 'workspace.scriptKind.trigger',
  NOTE: 'workspace.scriptKind.note',
  SCRIPT_EVIDENCE: 'workspace.scriptKind.evidence',
  EVENT_LABEL: 'workspace.scriptKind.eventLabel',
};

export type ScriptExcerptLine = {
  kind: 'DIALOGUE' | 'STAGE_DIRECTION' | 'TRIGGER' | 'NOTE' | 'SCRIPT_EVIDENCE' | 'EVENT_LABEL';
  text: string;
  speaker?: string;
  locator?: string;
};

export type ScriptSidebarEntry = {
  eventId: string;
  sceneLabel?: string;
  sourceLabel: 'SCRIPT EVIDENCE' | 'MASTER_CUE TRIGGER' | 'REVIEWED EVENT' | 'NO LINKED TEXT';
  lines: ScriptExcerptLine[];
};

export function ScriptSidebar({
  entries,
  selectedEventId,
  onSelectEvent,
}: {
  entries: ScriptSidebarEntry[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !selectedEventId) return;
    const target = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-script-event]') ?? [])]
      .find((element) => element.dataset.scriptEvent === selectedEventId);
    target?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [open, selectedEventId]);

  if (!open) {
    return (
      <aside className="flex w-10 shrink-0 flex-col border-r border-border bg-surface" aria-label={t('workspace.scriptTitle')}>
        <button
          type="button"
          className="flex h-10 items-center justify-center border-b border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setOpen(true)}
          aria-label={t('workspace.scriptShow')}
          title={t('workspace.scriptShow')}
        >
          <PanelLeftOpen size={15} aria-hidden="true" />
        </button>
        <span className="mx-auto mt-3 text-[10px] font-semibold text-muted-foreground [writing-mode:vertical-rl]" aria-hidden="true">
          {t('workspace.scriptTitle')}
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface motion-reduce:transition-none lg:w-80" aria-label={t('workspace.scriptTitle')}>
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div>
          <span className="text-xs font-semibold">{t('workspace.scriptTitle')}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">{entries.length}</span>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setOpen(false)}
          aria-label={t('workspace.scriptHide')}
          title={t('workspace.scriptHide')}
        >
          <PanelLeftClose size={15} aria-hidden="true" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-label={t('workspace.scriptTimeline')}>
        {entries.map((entry) => {
          const selected = entry.eventId === selectedEventId;
          return (
            <button
              key={entry.eventId}
              type="button"
              data-script-event={entry.eventId}
              className={cn(
                'block w-full border-b border-border px-3 py-3 text-left transition-colors duration-150 motion-reduce:transition-none',
                selected ? 'bg-foreground/10 text-foreground' : 'bg-surface hover:bg-muted',
              )}
              onClick={() => onSelectEvent(entry.eventId)}
              aria-current={selected ? 'step' : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] font-semibold">{entry.eventId}</span>
                {entry.sceneLabel && (
                  <span className="truncate text-[10px] text-muted-foreground">{entry.sceneLabel}</span>
                )}
              </div>
              <p className="mt-1 text-[9px] font-semibold tracking-[0.08em] text-muted-foreground">
                {entry.sourceLabel}
              </p>

              {entry.lines.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {entry.lines.map((line, index) => (
                    <div key={`${line.kind}-${line.locator ?? ''}-${index}`}>
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                        <span>{t(SCRIPT_KIND_LABEL[line.kind])}</span>
                        {line.locator && <span className="truncate">{line.locator}</span>}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5">
                        {line.speaker && <span className="font-semibold">{line.speaker}: </span>}
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{t('workspace.scriptMissing')}</p>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
