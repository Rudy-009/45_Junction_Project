import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleHelp, ShieldAlert } from 'lucide-react';
import { StageSimulator, type StageMotion } from './StageSimulator';
import { ScriptSidebar } from './ScriptSidebar';
import type {
  CueCellPatch,
  CueRevision,
  CueRowOperation,
  Finding,
  FindingVerdict,
  StageZone,
  StoryboardAgentState,
  WorkspaceSnapshot,
} from '@/types/standby';
import { createStandbyBrowserApi, StandbyApiError } from '@/lib/standby-api';
import type { StageEntity, Zone } from '@/types/ui';
import { cn } from '@/lib/utils';
import { useI18n, type MessageKey } from '@/lib/i18n';
import type { ScriptProjection, ScriptProjectionSegment, ScriptSidebarEntry } from '@/types/script';

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

export function VerifiedWorkspace({
  workspace,
  script,
  scriptEntries,
  unlinkedScriptSegments,
  scriptBusy,
  scriptError,
  onLinkScriptSegment,
  onScriptFile,
  storyboardState,
  onStoryboardRequest,
  onWorkspaceUpdated,
  onMasterCueRefresh,
}: {
  workspace: WorkspaceSnapshot;
  script: ScriptProjection | null;
  scriptEntries: ScriptSidebarEntry[];
  unlinkedScriptSegments: ScriptProjectionSegment[];
  scriptBusy: boolean;
  scriptError: string | null;
  onLinkScriptSegment: (segmentId: string, eventId: string) => void;
  onScriptFile: (file: File) => void;
  storyboardState?: StoryboardAgentState;
  onStoryboardRequest?: (eventId: string) => void;
  onWorkspaceUpdated: (workspace: WorkspaceSnapshot) => void;
  onMasterCueRefresh: (file: File) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const initialEventId = workspace.findings[0]?.event_id ?? workspace.events[0]?.event_id ?? null;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);
  const [stageMotion, setStageMotion] = useState<StageMotion>();
  const selectedEventIndex = workspace.events.findIndex((event) => event.event_id === selectedEventId);
  const selectedEvent = workspace.events.find((event) => event.event_id === selectedEventId) ?? null;
  const previousEvent = selectedEventIndex > 0 ? workspace.events[selectedEventIndex - 1] : null;
  const selectedFinding = workspace.findings.find((finding) =>
    finding.event_id === selectedEventId,
  ) ?? null;
  const entities = useMemo<StageEntity[]>(() => Object.entries(selectedEvent?.stage_snapshot ?? {}).map(
    ([entityId, state]) => {
      const priorState = previousEvent?.stage_snapshot[entityId];
      const directionZone = state.transition === 'ENTER' ? priorState?.zone : state.zone;
      const lastDirection = directionFromZone(directionZone);
      return {
        id: entityId,
        label: entityId,
        kind: state.kind === 'PROP' ? 'prop' : 'person',
        zone: ZONE_LABEL[state.zone],
        ...(state.transition ? { transition: state.transition } : {}),
        ...(lastDirection ? { lastDirection } : {}),
      };
    },
  ), [previousEvent, selectedEvent]);
  const handleSelectEvent = (eventId: string) => {
    if (eventId === selectedEventId) return;

    const nextIndex = workspace.events.findIndex((event) => event.event_id === eventId);
    const adjacentForward = selectedEventIndex >= 0 && nextIndex === selectedEventIndex + 1;
    const nextEvent = workspace.events[nextIndex];
    setStageMotion({
      eventKey: eventId,
      animate: adjacentForward,
      changedEntityIds: adjacentForward && selectedEvent && nextEvent
        ? changedSnapshotEntityIds(selectedEvent.stage_snapshot, nextEvent.stage_snapshot)
        : [],
    });
    setSelectedEventId(eventId);
    onStoryboardRequest?.(eventId);
  };

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <div>
          <span className="text-sm font-medium">{workspace.title}</span>
          <span className="mono ml-3 text-[10px] text-muted-foreground">{workspace.case_id}</span>
        </div>
        <div className="flex items-center gap-3 mono text-[10px]">
          {storyboardState && storyboardState.status !== 'IDLE' && (
            <StoryboardAgentStatus state={storyboardState} />
          )}
          <span>{workspace.verification.ruleset_version}</span>
          <span className="text-muted-foreground">{workspace.verification.result_hash.slice(0, 12)}…</span>
        </div>
      </div>

      {storyboardState?.status === 'READY' && (
        <StoryboardArtifactPanel state={storyboardState} />
      )}

      <div className="flex min-h-0 flex-1">
        <ScriptSidebar
          entries={scriptEntries}
          script={script}
          unlinkedSegments={unlinkedScriptSegments}
          busy={scriptBusy}
          error={scriptError}
          selectedEventId={selectedEventId}
          onScriptFile={onScriptFile}
          onLinkSegment={onLinkScriptSegment}
          onSelectEvent={handleSelectEvent}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <section className="flex min-h-0 flex-1 basis-0 flex-col border-b border-border">
              <PanelTitle title={t('workspace.stageTitle')} right={selectedEvent ? `${selectedEvent.event_id} · ${selectedEvent.label}` : t('workspace.noEvent')} />
              <div className="min-h-0 flex-1">
                {selectedEvent && entities.length > 0 ? (
                  <StageSimulator crossover="UNKNOWN" entities={entities} motion={stageMotion} />
                ) : (
                  <div className="flex h-full items-center justify-center bg-background p-6 text-center">
                    <div>
                      <CircleHelp className="mx-auto text-insufficient" size={26} />
                      <p className="mt-3 text-sm">{t('workspace.noSnapshot')}</p>
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
                <ServerRevisionPanel
                  workspace={workspace}
                  finding={selectedFinding}
                  onWorkspaceUpdated={onWorkspaceUpdated}
                  onMasterCueRefresh={onMasterCueRefresh}
                />
              </div>
            </section>
          </div>

          <VerifiedTimeline workspace={workspace} selectedEventId={selectedEventId} onSelect={handleSelectEvent} />
        </div>
      </div>
    </div>
  );
}

function ServerRevisionPanel({
  workspace,
  finding,
  onWorkspaceUpdated,
  onMasterCueRefresh,
}: {
  workspace: WorkspaceSnapshot;
  finding: Finding | null;
  onWorkspaceUpdated: (workspace: WorkspaceSnapshot) => void;
  onMasterCueRefresh: (file: File) => Promise<boolean>;
}) {
  const { locale } = useI18n();
  const [revisions, setRevisions] = useState<CueRevision[]>([]);
  const [current, setCurrent] = useState<CueRevision | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInput = useRef<HTMLInputElement>(null);
  const target = finding?.target_locator ?? null;
  const canExportXlsx = workspace.sources.some((source) =>
    source.role === 'MASTER_CUE'
      && source.media_type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const currentValue = target && current?.rows
    ? current.rows.find((row) => row.id === target.row_id)?.[target.column]
    : undefined;

  const reload = async () => {
    const api = createStandbyBrowserApi();
    if (!api || !workspace.cue_revision_id) {
      setCurrent(null);
      setRevisions([]);
      return;
    }
    const [list, active] = await Promise.all([
      api.listCueRevisions(workspace.case_id),
      api.getCueRevision(workspace.case_id, workspace.cue_revision_id),
    ]);
    setRevisions(list.items);
    setCurrent(active);
  };

  useEffect(() => {
    setError(null);
    void reload().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Revision history unavailable.');
    });
  }, [workspace.case_id, workspace.cue_revision_id]);

  useEffect(() => {
    setDraft(currentValue ?? '');
  }, [currentValue, target?.column, target?.row_id]);

  const applyChanges = async (patches: CueCellPatch[], rowOperations: CueRowOperation[] = []) => {
    if (!current || (patches.length === 0 && rowOperations.length === 0)) return;
    const api = createStandbyBrowserApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      await api.createCueRevision(workspace.case_id, {
        base_revision_id: current.revision_id,
        base_source_sha256: current.base_source_sha256,
        patches,
        row_operations: rowOperations,
      });
      const nextWorkspace = await api.getWorkspace(workspace.case_id);
      onWorkspaceUpdated(nextWorkspace);
    } catch (saveError) {
      setError(saveError instanceof StandbyApiError
        ? `${saveError.code}: ${saveError.message}`
        : saveError instanceof Error ? saveError.message : 'Revision save failed.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (revisionId: string) => {
    if (!current?.rows) return;
    const api = createStandbyBrowserApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const targetRevision = await api.getCueRevision(workspace.case_id, revisionId);
      const targetRows = targetRevision.rows ?? [];
      const patches: CueCellPatch[] = [];
      for (const row of current.rows) {
        const prior = targetRows.find((candidate) => candidate.id === row.id);
        if (!prior) continue;
        for (const [column, value] of Object.entries(row)) {
          if (column === 'id' || prior[column] === undefined || prior[column] === value) continue;
          patches.push({ row_id: row.id, column, from: value, to: prior[column] });
        }
      }
      await applyChanges(patches);
    } finally {
      setBusy(false);
    }
  };

  const exportXlsx = async () => {
    if (!current) return;
    const api = createStandbyBrowserApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const exported = await api.downloadCueRevision(workspace.case_id, current.revision_id);
      const filename = /filename="([^"]+)"/.exec(exported.disposition ?? '')?.[1] ?? 'master-cue-standby.xlsx';
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'XLSX export failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportDocx = async () => {
    if (!current) return;
    const api = createStandbyBrowserApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const exported = await api.downloadStandardCueDocx(workspace.case_id, current.revision_id);
      downloadBlob(exported.blob, 'standby-standard-cue.docx');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Word export failed.');
    } finally {
      setBusy(false);
    }
  };

  const printPdf = async () => {
    if (!current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError(locale === 'ko' ? '팝업을 허용한 뒤 다시 시도하세요.' : 'Allow popups and try again.');
      return;
    }
    const api = createStandbyBrowserApi();
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const html = await api.getStandardCuePrintHtml(workspace.case_id, current.revision_id);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (exportError) {
      printWindow.close();
      setError(exportError instanceof Error ? exportError.message : 'PDF print failed.');
    } finally {
      setBusy(false);
    }
  };

  const refreshMasterCue = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const changed = await onMasterCueRefresh(file);
      if (!changed) {
        setError(locale === 'ko'
          ? '같은 파일입니다. Upstage를 다시 호출하지 않았습니다.'
          : 'Same file. Upstage was not called again.');
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Refresh failed.');
    } finally {
      setBusy(false);
      if (refreshInput.current) refreshInput.current.value = '';
    }
  };

  const addEvent = async () => {
    if (!current?.rows || !target) return;
    const anchor = current.rows.find((row) => row.id === target.row_id);
    const sheet = /^t_(\d+)_/.exec(target.row_id)?.[1];
    if (!anchor || sheet === undefined) return;
    const row = Object.fromEntries(Object.keys(anchor).map((key) => [key, ''])) as Record<string, string> & { id: string };
    row.id = `t_${sheet}_n_${crypto.randomUUID()}`;
    await applyChanges([], [{ type: 'ADD', after_row_id: anchor.id, row }]);
  };

  const deleteEvent = async () => {
    if (!target) return;
    await applyChanges([], [{ type: 'DELETE', row_id: target.row_id }]);
  };

  return (
    <section className="border-t border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium">{locale === 'ko' ? '큐 수정' : 'Cue edit'}</span>
        <div className="flex items-center gap-2">
          <input
            ref={refreshInput}
            type="file"
            className="hidden"
            accept=".xlsx,.pdf,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void refreshMasterCue(file);
            }}
          />
          <button type="button" disabled={busy} className="border border-border px-2 py-1 text-[10px]" onClick={() => refreshInput.current?.click()}>
            {locale === 'ko' ? '새 파일로 갱신' : 'Refresh file'}
          </button>
          {target && current?.rows?.some((row) => row.id === target.row_id) && (
            <>
              <button type="button" disabled={busy} className="border border-border px-2 py-1 text-[10px]" onClick={() => void addEvent()}>
                {locale === 'ko' ? '이벤트 추가' : 'Add event'}
              </button>
              <button type="button" disabled={busy} className="border border-violation px-2 py-1 text-[10px] text-violation" onClick={() => void deleteEvent()}>
                {locale === 'ko' ? '이벤트 삭제' : 'Delete event'}
              </button>
            </>
          )}
          {canExportXlsx && (
            <button type="button" disabled={busy} className="border border-border px-2 py-1 text-[10px]" onClick={() => void exportXlsx()}>
              {locale === 'ko' ? 'XLSX 내보내기' : 'Export XLSX'}
            </button>
          )}
          <button type="button" disabled={busy || !current} className="border border-border px-2 py-1 text-[10px]" onClick={() => void exportDocx()}>
            {locale === 'ko' ? 'Word 실행본' : 'Word handoff'}
          </button>
          <button type="button" disabled={busy || !current} className="border border-border px-2 py-1 text-[10px]" onClick={() => void printPdf()}>
            {locale === 'ko' ? 'PDF 실행본' : 'PDF handoff'}
          </button>
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer">{locale === 'ko' ? `히스토리 ${revisions.length}` : `History ${revisions.length}`}</summary>
          <div className="mt-2 min-w-64 space-y-1 border border-border bg-background p-2">
            {revisions.slice().reverse().map((revision) => (
              <div key={revision.revision_id} className="flex items-center justify-between gap-3">
                <span className="mono truncate">{revision.revision_id.slice(0, 18)}</span>
                {revision.revision_id !== current?.revision_id && (
                  <button type="button" disabled={busy} className="border border-border px-2 py-1" onClick={() => void restore(revision.revision_id)}>
                    {locale === 'ko' ? '복원' : 'Restore'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
        </div>
      </div>
      {target && currentValue !== undefined ? (
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor="verified-cue-edit">{target.row_id}:{target.column}</label>
          <input
            id="verified-cue-edit"
            className="min-w-0 flex-1 border border-border bg-background px-2 py-1.5 text-xs"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || draft === currentValue}
            className="border border-foreground bg-foreground px-3 py-1.5 text-xs text-background disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void applyChanges([{ row_id: target.row_id, column: target.column, from: currentValue, to: draft }])}
          >
            {locale === 'ko' ? '저장·재검증' : 'Save & verify'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {locale === 'ko' ? '이 finding에는 편집 가능한 원본 셀 위치가 없습니다.' : 'This finding has no editable source-cell locator.'}
        </p>
      )}
      {error && <p className="mt-2 text-[10px] text-violation">{error}</p>}
    </section>
  );
}

function directionFromZone(zone?: StageZone): StageEntity['lastDirection'] {
  if (zone === 'STAGE_RIGHT_WING' || zone === 'STAGE_RIGHT_CHANGE') return 'stage_left';
  if (zone === 'STAGE_LEFT_WING' || zone === 'STAGE_LEFT_CHANGE') return 'stage_right';
  return undefined;
}

function changedSnapshotEntityIds(
  previous: WorkspaceSnapshot['events'][number]['stage_snapshot'],
  next: WorkspaceSnapshot['events'][number]['stage_snapshot'],
): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter((entityId) => {
    const before = previous[entityId];
    const after = next[entityId];
    return !before || !after || before.kind !== after.kind || before.zone !== after.zone;
  });
}

function StoryboardAgentStatus({ state }: { state: StoryboardAgentState }) {
  const label = state.status === 'RECONSTRUCTING'
    ? 'RECONSTRUCTING'
    : state.status === 'READY'
      ? 'READY'
      : 'UNAVAILABLE';

  return (
    <div
      className="storyboard-agent-status flex max-w-[320px] items-center gap-1.5 border border-border px-2 py-1"
      data-status={state.status}
      title={state.summary}
    >
      <span className="storyboard-agent-status__signal h-1.5 w-1.5 bg-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">UPSTAGE STORYBOARD</span>
      <span aria-hidden="true">·</span>
      <span>{label}</span>
      {state.version && <span className="truncate text-muted-foreground">{state.version}</span>}
      {state.status === 'READY' && (
        <span className="text-muted-foreground">
          {(state.beats ?? []).length} BEATS / {(state.missingEvidence ?? []).length} MISSING
        </span>
      )}
      {state.summary && state.status === 'READY' && (
        <span className="max-w-28 truncate text-muted-foreground">{state.summary}</span>
      )}
    </div>
  );
}

function StoryboardArtifactPanel({ state }: { state: StoryboardAgentState }) {
  const { t } = useI18n();
  const beats = state.beats ?? [];
  const missingEvidence = state.missingEvidence ?? [];

  return (
    <section className="shrink-0 border-b border-border bg-surface" aria-label={t('workspace.storyboardTitle')}>
      <div className="flex h-7 items-center justify-between gap-4 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.08em]">{t('workspace.storyboardTitle')}</span>
          {state.authority && <span className="mono text-[9px] text-edited">{state.authority}</span>}
          {state.eventId && <span className="mono text-[9px] text-muted-foreground">{state.eventId}</span>}
        </div>
        {state.summary && <p className="truncate text-[10px] text-muted-foreground">{state.summary}</p>}
      </div>

      <div className="flex min-h-14 gap-1 overflow-x-auto p-2">
        {beats.length === 0 && (
          <div className="flex min-w-48 items-center border border-border bg-background px-2 text-xs text-muted-foreground">
            {t('workspace.storyboardNoBeats')}
          </div>
        )}
        {beats.map((beat, index) => (
          <article key={`${beat.entity_id}-${index}`} className="min-w-52 border border-border bg-background px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="mono truncate text-[10px] font-semibold">{beat.entity_id}</span>
              <span className="mono text-[9px] text-edited">{beat.action}</span>
            </div>
            <p className="mono mt-1 text-[9px] text-muted-foreground">
              {beat.from_zone ?? '—'} → {beat.to_zone ?? '—'}
            </p>
            <p className="mt-1 break-all text-[9px] text-muted-foreground">
              {t('workspace.storyboardFacts')}: {beat.evidence_fact_ids.length > 0 ? beat.evidence_fact_ids.join(', ') : '—'}
            </p>
          </article>
        ))}
        {missingEvidence.map((item, index) => (
          <article key={`${item}-${index}`} className="min-w-52 border border-insufficient bg-insufficient/10 px-2 py-1.5">
            <div className="text-[9px] font-semibold text-insufficient">{t('workspace.storyboardMissing')}</div>
            <p className="mt-1 break-words text-[10px] leading-4">{item}</p>
          </article>
        ))}
      </div>
    </section>
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
              <button key={event.event_id} data-event={event.event_id} type="button" onClick={() => onSelect(event.event_id)} className={cn('timeline-event-cell relative flex w-40 shrink-0 flex-col justify-between overflow-hidden border p-2 text-left', selectedEventId === event.event_id ? 'is-selected border-foreground bg-foreground/10' : strongest ? verdictClass(strongest.verdict) : 'border-border bg-background')}>
                <span className="timeline-playhead" aria-hidden="true" />
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
