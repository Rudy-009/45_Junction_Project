import { useEffect, useRef, useState } from "react";
import { COLUMNS, type Revision, type Row, type Verdict, verdictDot } from "@/lib/standby-data";
import { Btn, PanelHeader } from "./Bits";
import { cn } from "@/lib/utils";

export type CellEdit = { rowId: string; column: string; value: string };

export function CueSheetPanel({
  rows,
  drafts,
  markers,
  selectedRowId,
  focusCell,
  revisions,
  onEdit,
  onDiscardAll,
  onSave,
  onLoadRevision,
}: {
  rows: Row[];
  drafts: Record<string, string>;
  markers: Record<string, Verdict>;
  selectedRowId: string;
  focusCell: { rowId: string; column: string } | null;
  revisions: Revision[];
  onEdit: (e: CellEdit) => void;
  onDiscardAll: () => void;
  onSave: () => void;
  onLoadRevision: (r: Revision) => void;
}) {
  const [extra, setExtra] = useState<string[]>([]);
  const [colMenu, setColMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [hovered, setHovered] = useState<Revision | null>(null);
  const [editing, setEditing] = useState<{ rowId: string; column: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = COLUMNS.filter((c) => c.always || extra.includes(c.key));
  const draftCount = Object.keys(drafts).length;

  useEffect(() => {
    if (!focusCell) return;
    const el = scrollRef.current?.querySelector(
      `[data-cell="${focusCell.rowId}:${focusCell.column}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [focusCell]);

  return (
    <div className="flex h-full flex-col bg-surface">
      <PanelHeader
        title="CUE SHEET · 큐시트"
        right={
          <>
            <div className="relative">
              <Btn onClick={() => setColMenu((v) => !v)}>열 표시 ▾</Btn>
              {colMenu && (
                <div className="absolute right-0 z-30 mt-1 w-44 border border-border bg-elevated">
                  {COLUMNS.map((c) => (
                    <label
                      key={c.key}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1 text-xs",
                        c.always ? "text-muted-foreground" : "cursor-pointer hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={c.always}
                        checked={c.always || extra.includes(c.key)}
                        onChange={() =>
                          setExtra((p) =>
                            p.includes(c.key) ? p.filter((k) => k !== c.key) : [...p, c.key],
                          )
                        }
                      />
                      <span className="mono">{c.key}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <span
              className={cn(
                "mono border border-border px-2 py-[2px] text-[11px]",
                draftCount ? "bg-edited-bg text-edited" : "bg-muted text-muted-foreground",
              )}
            >
              미반영 변경 {draftCount}건
            </span>
            <Btn onClick={onDiscardAll} disabled={!draftCount}>
              모든 변경 취소
            </Btn>
            <Btn variant="black" onClick={onSave} disabled={!draftCount}>
              저장
            </Btn>
            <div className="relative">
              <Btn onClick={() => setHistory((v) => !v)}>히스토리</Btn>
              {history && (
                <div className="absolute top-full right-0 z-30 mt-1 flex">
                  {hovered && (
                    <div className="mr-[-1px] max-h-64 w-64 overflow-auto border border-border bg-elevated p-2">
                      <div className="mono mb-1 text-[10px] text-muted-foreground">
                        변경 셀 미리보기
                      </div>
                      {hovered.changes.map((c, i) => (
                        <div key={i} className="mono border-b border-border py-1 text-[11px]">
                          {c.rowId} · {c.column}
                          <div className="text-muted-foreground">
                            {c.from} → <span className="text-edited">{c.to}</span>
                          </div>
                        </div>
                      ))}
                      {!hovered.changes.length && (
                        <div className="text-[11px] text-muted-foreground">변경 없음</div>
                      )}
                    </div>
                  )}
                  <div className="max-h-64 w-64 overflow-auto border border-border bg-elevated">
                    {revisions.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground">저장 기록 없음</div>
                    )}
                    {revisions.map((r) => (
                      <button
                        key={r.id}
                        onMouseEnter={() => setHovered(r)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => {
                          onLoadRevision(r);
                          setHistory(false);
                        }}
                        className="mono flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1 text-left text-[11px] hover:bg-muted"
                      >
                        <span>{r.savedAt}</span>
                        <span className="text-muted-foreground">{r.changes.length}셀</span>
                        <span className="text-muted-foreground">{r.author}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        }
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-6 border border-border bg-muted p-0" />
              {visible.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, minWidth: c.width }}
                  className="mono border border-border bg-muted px-1 py-1 text-left text-[11px] font-normal text-muted-foreground"
                >
                  {c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const marker = markers[row.id];
              const selected = row.id === selectedRowId;
              return (
                <tr key={row.id} className={cn(selected && "bg-muted")}>
                  <td className="border border-border p-0 text-center align-middle">
                    {marker && marker !== "CONSISTENT" && (
                      <span className={cn("inline-block h-2 w-2 rounded-full", verdictDot[marker])} />
                    )}
                  </td>
                  {visible.map((c) => {
                    const key = `${row.id}:${c.key}`;
                    const edited = key in drafts;
                    const value = (edited ? drafts[key] : row[c.key]) ?? "";
                    const isEditing = editing?.rowId === row.id && editing.column === c.key;
                    const focused = focusCell?.rowId === row.id && focusCell.column === c.key;
                    return (
                      <td
                        key={c.key}
                        data-cell={key}
                        onClick={() => setEditing({ rowId: row.id, column: c.key })}
                        className={cn(
                          "relative cursor-text border border-border px-1 py-1 align-top",
                          edited && "bg-edited-bg text-edited",
                          focused && "outline outline-2 -outline-offset-2 outline-foreground",
                        )}
                      >
                        {edited && (
                          <span
                            className="absolute top-0 left-0 h-0 w-0 border-t-[6px] border-r-[6px] border-t-edited border-r-transparent"
                            aria-hidden
                          />
                        )}
                        {isEditing ? (
                          <input
                            autoFocus
                            defaultValue={value}
                            onBlur={(e) => {
                              onEdit({ rowId: row.id, column: c.key, value: e.target.value });
                              setEditing(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="mono w-full border border-border-strong bg-background px-1 text-xs outline-none"
                          />
                        ) : (
                          <span
                            className={cn(
                              c.key === "환복시간" || c.key === "타임코드" || c.key === "마커"
                                ? "mono"
                                : "",
                            )}
                          >
                            {value}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
