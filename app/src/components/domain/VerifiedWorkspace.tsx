import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleHelp, ShieldAlert } from 'lucide-react';
import { StageSimulator } from './StageSimulator';
import type { Finding, FindingVerdict, StageZone, WorkspaceSnapshot } from '@/types/standby';
import type { StageEntity, Zone } from '@/types/ui';
import { cn } from '@/lib/utils';
import { useI18n, type MessageKey } from '@/lib/i18n';

const ZONE_LABEL: Record<StageZone, Zone> = {
  STAGE_RIGHT_WING: '상수윙',
  STAGE: '무대',
  STAGE_LEFT_WING: '하수윙',
  STAGE_RIGHT_CHANGE: '상수환복소',
  STAGE_LEFT_CHANGE: '하수환복소',
};

const VERDICT_LABEL: Record<FindingVerdict, MessageKey> = {
  VIOLATION: 'workspace.violation',
  REVIEW: 'workspace.review',
  INSUFFICIENT_EVIDENCE: 'workspace.insufficient',
};

function verdictClass(verdict: FindingVerdict): string {
  if (verdict === 'VIOLATION') return 'border-violation bg-violation-bg text-violation';
  if (verdict === 'REVIEW') return 'border-review bg-review-bg text-review';
  return 'border-insufficient bg-insufficient/10 text-foreground';
}

function VerdictIcon({ verdict }: { verdict: FindingVerdict }) {
  if (verdict === 'VIOLATION') return <ShieldAlert size={14} />;
  if (verdict === 'REVIEW') return <AlertTriangle size={14} />;
  return <CircleHelp size={14} />;
}

function findingSummaryKey(finding: Finding): MessageKey {
  if (finding.rule_id === 'VR-01') return 'workspace.quick';
  if (finding.rule_id === 'VR-02') return 'workspace.route';
  return 'workspace.propContinuity';
}

export function VerifiedWorkspace({ workspace }: { workspace: WorkspaceSnapshot }) {
  const { t } = useI18n();
  const initialEventId = workspace.findings[0]?.event_id ?? workspace.events[0]?.event_id ?? null;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);
  const selectedEvent = workspace.events.find((event) => event.event_id === selectedEventId) ?? null;
  const selectedFinding = workspace.findings.find((finding) =>
    finding.event_id === selectedEventId,
  ) ?? null;
  const entities = useMemo<StageEntity[]>(() => Object.entries(selectedEvent?.stage_snapshot ?? {}).map(
    ([entityId, state]) => ({
      id: entityId,
      label: entityId,
      kind: state.kind === 'PROP' ? 'prop' : 'person',
      zone: ZONE_LABEL[state.zone],
      ...(state.transition ? { transition: state.transition } : {}),
    }),
  ), [selectedEvent]);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <div>
          <span className="text-sm font-medium">{workspace.title}</span>
          <span className="mono ml-3 text-[10px] text-muted-foreground">{workspace.case_id}</span>
        </div>
        <div className="flex items-center gap-3 mono text-[10px]">
          <span>{workspace.verification.ruleset_version}</span>
          <span className="text-muted-foreground">{workspace.verification.result_hash.slice(0, 12)}…</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 basis-0 flex-col border-b border-border">
          <PanelTitle title={t('workspace.stageTitle')} right={selectedEvent ? `${selectedEvent.event_id} · ${selectedEvent.label}` : t('workspace.noEvent')} />
          <div className="min-h-0 flex-1">
            {selectedEvent && entities.length > 0 ? (
              <StageSimulator crossover="UNKNOWN" entities={entities} />
            ) : (
              <div className="flex h-full items-center justify-center bg-background p-6 text-center">
                <div>
                  <CircleHelp className="mx-auto text-insufficient" size={26} />
                  <p className="mt-3 text-sm">{t('workspace.noSnapshot')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('workspace.noSnapshotHelp')}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 basis-0 flex-col">
          <PanelTitle title={t('workspace.findingTitle')} right={selectedFinding ? `${selectedFinding.rule_id} / ${selectedFinding.target_locator.row_id}:${selectedFinding.target_locator.column}` : 'CONSISTENT'} />
          <div className="min-h-0 flex-1 overflow-auto">
            {selectedFinding ? <FindingDetail finding={selectedFinding} /> : (
              <div className="flex h-full items-center justify-center text-sm text-consistent">{t('workspace.consistent')}</div>
            )}
          </div>
        </section>
      </div>

      <VerifiedTimeline workspace={workspace} selectedEventId={selectedEventId} onSelect={setSelectedEventId} />
    </div>
  );
}

function PanelTitle({ title, right }: { title: string; right: string }) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
      <span className="mono text-[10px] tracking-[0.12em] text-muted-foreground">{title}</span>
      <span className="mono text-[10px] text-muted-foreground">{right}</span>
    </div>
  );
}

function FindingDetail({ finding }: { finding: Finding }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-full gap-0 lg:grid-cols-[minmax(260px,0.8fr)_minmax(300px,1fr)_minmax(420px,1.35fr)]">
      <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
        <span className={cn('inline-flex items-center gap-1.5 border px-2 py-1 text-xs', verdictClass(finding.verdict))}>
          <VerdictIcon verdict={finding.verdict} />{t(VERDICT_LABEL[finding.verdict])}
        </span>
        <h2 className="mt-3 text-base font-medium">{t(findingSummaryKey(finding))}</h2>
        <p className="mono mt-2 text-[10px] text-muted-foreground">{finding.finding_id}</p>
        {finding.missing_facts.length > 0 && (
          <div className="mt-4 border border-insufficient bg-insufficient/10 p-3">
            <div className="mono text-[10px] text-muted-foreground">{t('workspace.missing')}</div>
            {finding.missing_facts.map((fact) => <p key={fact} className="mt-1 break-all text-xs">{fact}</p>)}
          </div>
        )}
      </div>

      <div className="border-b border-border p-4 lg:border-r lg:border-b-0">
        <h3 className="mono text-[10px] text-muted-foreground">{t('workspace.calculation')}</h3>
        <dl className="mt-3 grid grid-cols-[minmax(140px,auto)_1fr] border border-border text-xs">
          {Object.entries(finding.calculation).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="mono border-b border-r border-border bg-muted px-2 py-2 text-[10px]">{key}</dt>
              <dd className="break-words border-b border-border px-2 py-2">{Array.isArray(value) ? value.join(', ') : String(value ?? '—')}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="p-4">
        <h3 className="mono text-[10px] text-muted-foreground">{t('workspace.evidence')}</h3>
        <div className="mt-3 grid gap-2">
          {finding.evidence.map((evidence) => (
            <article key={evidence.role} className="border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-[10px] font-semibold">{evidence.role}</span>
                <div className="flex gap-2 mono text-[9px]">
                  <span>{evidence.origin}</span>
                  <span className={evidence.review_status === 'REVIEWED' ? 'text-consistent' : 'text-insufficient'}>{evidence.review_status}</span>
                </div>
              </div>
              <p className="mono mt-2 text-[10px] text-muted-foreground">{evidence.locator ?? t('workspace.locatorMissing')}</p>
              <blockquote className="mt-2 border-l border-border-strong pl-2 text-xs leading-5">{evidence.quote ?? t('workspace.quoteMissing')}</blockquote>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerifiedTimeline({ workspace, selectedEventId, onSelect }: {
  workspace: WorkspaceSnapshot;
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedEventId) return;
    const target = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-event]') ?? [])]
      .find((element) => element.dataset.event === selectedEventId);
    target?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selectedEventId]);
  return (
    <div className="h-32 shrink-0 border-t border-border bg-surface">
      <div className="flex h-7 items-center justify-between border-b border-border px-3">
        <span className="text-[10px] tracking-[0.12em] text-muted-foreground">{t('workspace.timeline')}</span>
        <span className="mono text-[10px] text-muted-foreground">{t('workspace.events', { count: workspace.events.length })}</span>
      </div>
      <div ref={scrollRef} className="h-[calc(100%-28px)] overflow-x-auto overflow-y-hidden p-2">
        <div className="flex h-full min-w-max gap-1">
          {workspace.events.map((event) => {
            const findings = workspace.findings.filter((finding) => finding.event_id === event.event_id);
            const strongest = findings.find((finding) => finding.verdict === 'VIOLATION')
              ?? findings.find((finding) => finding.verdict === 'REVIEW')
              ?? findings[0];
            return (
              <button key={event.event_id} data-event={event.event_id} type="button" onClick={() => onSelect(event.event_id)} className={cn('flex w-40 shrink-0 flex-col justify-between border p-2 text-left', selectedEventId === event.event_id ? 'border-foreground bg-foreground/10' : strongest ? verdictClass(strongest.verdict) : 'border-border bg-background')}>
                <div><span className="mono text-[10px]">{event.event_id}</span><p className="mt-1 truncate text-xs">{event.label}</p></div>
                <div className="flex items-center justify-between mono text-[9px]"><span>{event.aggregate}</span><span>{findings.length > 0 ? `${findings.length} FINDING` : t('workspace.clean')}</span></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
