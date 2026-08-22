import { useMemo, useState } from "react";
import {
  EVENTS,
  ROWS,
  stageAt,
  type Revision,
  type Row,
  type StandbyEvent,
  type Verdict,
} from "@/lib/standby-data";
import { Btn, PanelHeader } from "@/components/standby/Bits";
import { StageSimulator } from "@/components/standby/StageSimulator";
import { CueSheetPanel, type CellEdit } from "@/components/standby/CueSheetPanel";
import { TimelinePanel } from "@/components/standby/TimelinePanel";
import { FindingPopup } from "@/components/standby/FindingPopup";

function parseSeconds(v: string) {
  const m = /(\d+)/.exec(v ?? "");
  return m ? Number(m[1]) : NaN;
}

export function WorkspaceScreen() {
  const [stageOnTop, setStageOnTop] = useState(true);
  const [rows, setRows] = useState<Row[]>(ROWS);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(
    Object.fromEntries(EVENTS.map((e) => [e.id, e.verdict])),
  );
  const [currentId, setCurrentId] = useState("E3");
  const [popupEventId, setPopupEventId] = useState<string | null>(null);
  const [focusCell, setFocusCell] = useState<{ rowId: string; column: string } | null>(null);
  const [decided, setDecided] = useState<Record<string, boolean>>({});

  const current = EVENTS.find((e) => e.id === currentId) ?? EVENTS[0]!;
  const popupEvent = EVENTS.find((e) => e.id === popupEventId) ?? null;

  const markers = useMemo(() => {
    const m: Record<string, Verdict> = {};
    for (const e of EVENTS) m[e.rowId] = verdicts[e.id] ?? e.verdict;
    return m;
  }, [verdicts]);

  const selectEvent = (e: StandbyEvent) => {
    setCurrentId(e.id);
    setPopupEventId(e.id);
    setFocusCell(null);
  };

  const step = (dir: number) => {
    const i = EVENTS.findIndex((e) => e.id === currentId);
    const next = EVENTS[Math.min(EVENTS.length - 1, Math.max(0, i + dir))]!;
    setCurrentId(next.id);
    if (popupEventId) setPopupEventId(next.id);
  };

  const onEdit = ({ rowId, column, value }: CellEdit) => {
    const row = rows.find((r) => r.id === rowId)!;
    setDrafts((p) => {
      const key = `${rowId}:${column}`;
      const next = { ...p };
      if (value === row[column]) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const onSave = () => {
    const changes = Object.entries(drafts).map(([key, to]) => {
      const [rowId = "", column = ""] = key.split(":");
      const row = rows.find((r) => r.id === rowId);
      return { rowId, column, from: row?.[column] ?? "", to };
    });
    const nextRows = rows.map((r) => {
      const patch: Record<string, string> = {};
      for (const c of changes) if (c.rowId === r.id) patch[c.column] = c.to;
      return { ...r, ...patch };
    });
    setRows(nextRows);
    setDrafts({});
    setRevisions((p) => [
      {
        id: `rev-${p.length + 1}`,
        savedAt: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
        author: "operator@standby",
        changes,
        rows: nextRows,
      },
      ...p,
    ]);
    reverify(nextRows);
  };

  const reverify = (nextRows: Row[]) => {
    const r3 = nextRows.find((r) => r.id === "R3");
    const secs = parseSeconds(r3?.["환복시간"] ?? "");
    setVerdicts((p) => ({
      ...p,
      E3: !Number.isNaN(secs) && secs >= 66 ? "CONSISTENT" : "VIOLATION",
    }));
  };

  const loadRevision = (rev: Revision) => {
    setRows(rev.rows);
    setDrafts({});
    reverify(rev.rows);
  };

  const stagePanel = (
    <div className="flex h-full flex-col bg-surface">
      <PanelHeader
        title="STAGE SIMULATOR · 무대 시뮬레이터"
        right={
          <span className="mono text-[11px] text-muted-foreground">
            {current.id} · {current.name}
          </span>
        }
      />
      <div className="min-h-0 flex-1">
        <StageSimulator crossover="true" entities={stageAt(current.id)} />
      </div>
    </div>
  );

  const cuePanel = (
    <CueSheetPanel
      rows={rows}
      drafts={drafts}
      markers={markers}
      selectedRowId={current.rowId}
      focusCell={focusCell}
      revisions={revisions}
      onEdit={onEdit}
      onDiscardAll={() => setDrafts({})}
      onSave={onSave}
      onLoadRevision={loadRevision}
    />
  );

  const top = stageOnTop ? stagePanel : cuePanel;
  const bottom = stageOnTop ? cuePanel : stagePanel;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <span className="mono text-[11px] text-muted-foreground">
          우주비행사가 된 마루 · 긴 암전 S#16 → S#17
        </span>
        <Btn onClick={() => setStageOnTop((v) => !v)}>패널 전환</Btn>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 basis-0 overflow-hidden border-b border-border">{top}</div>
        <div className="relative min-h-0 flex-1 basis-0 overflow-hidden">
          {bottom}
          {popupEvent && (
            <>
              <div
                className="absolute inset-0 z-30 bg-black/50"
                onClick={() => setPopupEventId(null)}
              />
              <FindingPopup
                event={popupEvent}
                verdict={verdicts[popupEvent.id] ?? popupEvent.verdict}
                decided={!!decided[popupEvent.id]}
                onDecision={() => setDecided((p) => ({ ...p, [popupEvent.id]: true }))}
                onClose={() => setPopupEventId(null)}
                onGoto={() => {
                  setFocusCell({
                    rowId: popupEvent.rowId,
                    column: popupEvent.finding?.targetColumn ?? "마커",
                  });
                  setCurrentId(popupEvent.id);
                  setPopupEventId(null);
                }}
              />
            </>
          )}
        </div>
      </div>

      <TimelinePanel
        events={EVENTS}
        verdicts={verdicts}
        currentId={currentId}
        onSelect={selectEvent}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onPlay={() => step(1)}
      />
    </div>
  );
}
