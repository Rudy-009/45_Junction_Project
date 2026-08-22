import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FileText, Link2, PanelLeftClose, PanelLeftOpen, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type {
  ScriptExcerptLine,
  ScriptProjection,
  ScriptProjectionSegment,
  ScriptSidebarEntry,
} from '@/types/script';

const SCRIPT_KIND_LABEL: Record<ScriptExcerptLine['kind'], MessageKey> = {
  DIALOGUE: 'workspace.scriptKind.dialogue',
  STAGE_DIRECTION: 'workspace.scriptKind.stageDirection',
};

export function ScriptSidebar({
  entries,
  script,
  unlinkedSegments,
  busy,
  error,
  selectedEventId,
  onSelectEvent,
  onScriptFile,
  onLinkSegment,
}: {
  entries: ScriptSidebarEntry[];
  script: ScriptProjection | null;
  unlinkedSegments: ScriptProjectionSegment[];
  busy: boolean;
  error: string | null;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onScriptFile: (file: File) => void;
  onLinkSegment: (segmentId: string, eventId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkedEntries = entries.filter((entry) => entry.lines.length > 0);

  useEffect(() => {
    if (!open || !selectedEventId) return;
    const target = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-script-event]') ?? [])]
      .find((element) => element.dataset.scriptEvent === selectedEventId);
    target?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [entries, open, selectedEventId]);

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
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onScriptFile(file);
        }}
      />

      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold">{t('workspace.scriptTitle')}</span>
          {script && (
            <span className="ml-2 text-[10px] text-muted-foreground">
              {t('workspace.scriptSegments', { count: script.segments.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-40"
            onClick={() => inputRef.current?.click()}
            aria-label={script ? t('workspace.scriptReplace') : t('workspace.scriptConnect')}
            title={script ? t('workspace.scriptReplace') : t('workspace.scriptConnect')}
          >
            <Upload size={14} aria-hidden="true" />
          </button>
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
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-label={t('workspace.scriptTimeline')}>
        {busy && <ScriptLoading />}

        {!script && !busy ? (
          <div className="flex min-h-full flex-col items-center justify-center px-5 py-8 text-center">
            <FileText size={22} className="text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm">{t('workspace.scriptUnconnected')}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('workspace.scriptFormat')}</p>
            <button
              type="button"
              className="mt-4 flex items-center gap-2 border border-foreground bg-foreground px-3 py-2 text-xs text-background hover:bg-muted-foreground"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={13} aria-hidden="true" />
              {t('workspace.scriptConnect')}
            </button>
            {error && <p className="mt-3 text-xs leading-5 text-violation" role="alert">{error}</p>}
          </div>
        ) : script ? (
          <>
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <p className="truncate text-[10px] font-medium" title={script.source.filename}>
                {script.source.filename}
              </p>
              <p className="mono mt-1 text-[9px] text-muted-foreground" title={script.source.sha256}>
                UPSTAGE · {script.authority} · SHA-256 {script.source.sha256.slice(0, 12)}…
              </p>
              {error && <p className="mt-2 text-xs leading-5 text-violation" role="alert">{error}</p>}
            </div>

            {linkedEntries.length === 0 && (
              <p className="border-b border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
                {t('workspace.scriptNoLinkedEvents')}
              </p>
            )}

            {linkedEntries.map((entry) => {
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
                  <p className="mt-1 text-[9px] font-semibold tracking-[0.08em] text-muted-foreground">SCRIPT</p>
                  <div className="mt-2 space-y-2">
                    {entry.lines.map((line) => <ScriptLine key={line.segment_id} line={line} />)}
                  </div>
                </button>
              );
            })}

            {unlinkedSegments.length > 0 && (
              <section aria-label={t('workspace.scriptPending')}>
                <div className="border-b border-border bg-muted px-3 py-2">
                  <span className="text-[10px] font-semibold">{t('workspace.scriptPending')}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">{unlinkedSegments.length}</span>
                </div>
                {unlinkedSegments.map((segment) => (
                  <article key={segment.segment_id} className="border-b border-border px-3 py-3">
                    <ScriptLine line={segment} />
                    <button
                      type="button"
                      disabled={!selectedEventId}
                      className="mt-2 flex items-center gap-1.5 border border-border px-2 py-1 text-[10px] hover:border-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => selectedEventId && onLinkSegment(segment.segment_id, selectedEventId)}
                    >
                      <Link2 size={11} aria-hidden="true" />
                      {selectedEventId
                        ? t('workspace.scriptLinkCurrent', { event: selectedEventId })
                        : t('workspace.scriptSelectEvent')}
                    </button>
                  </article>
                ))}
              </section>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function ScriptLine({ line }: { line: ScriptExcerptLine }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        <span>{t(SCRIPT_KIND_LABEL[line.kind])}</span>
        {line.locator && <span className="truncate">{line.locator}</span>}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5">
        {line.speaker && <span className="font-semibold">{line.speaker}: </span>}
        {line.text}
      </p>
    </div>
  );
}

function ScriptLoading() {
  const { t } = useI18n();
  return (
    <div className="border-b border-border px-3 py-4" role="status" aria-live="polite">
      <div className="script-loading-wordmark brand-mono" aria-label="STANDBY">
        {'STANDBY'.split('').map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            aria-hidden="true"
            className="standby-loading-letter"
            style={{ '--standby-letter-index': index } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('workspace.scriptParsing')}</p>
    </div>
  );
}
