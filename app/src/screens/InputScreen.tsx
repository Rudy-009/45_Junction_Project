import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, UploadCloud } from "lucide-react";
import { Btn, OriginBadge, ReviewBadge } from "@/components/standby/Bits";
import type { Origin } from "@/lib/standby-data";
import { cn } from "@/lib/utils";

type SourceState = { filename: string; hash: string; origin: Origin; reviewed: boolean };

export function InputScreen() {
  const navigate = useNavigate();
  const [script, setScript] = useState<SourceState>({
    filename: "maru_S16-S17_rev7.fdx",
    hash: "sha256:9f21c0ab4e7d…c18a",
    origin: "REAL_REFERENCE",
    reviewed: true,
  });
  const [cuesheet, setCuesheet] = useState<SourceState>({
    filename: "cuesheet_master_v11.xlsx",
    hash: "sha256:41b7de0092fa…7d33",
    origin: "CONTROLLED_FIXTURE",
    reviewed: false,
  });
  const [spec, setSpec] = useState<SourceState>({
    filename: "stage_spec.form",
    hash: "sha256:cc04a71fe8b2…0e59",
    origin: "MUTATED_FIXTURE",
    reviewed: false,
  });

  const [wings, setWings] = useState({ 상수: true, 하수: true });
  const [crossover, setCrossover] = useState<"true" | "false" | "UNKNOWN">("true");
  const [routes, setRoutes] = useState([
    { from: "하수윙", to: "하수환복소", min: "3", max: "4" },
    { from: "하수환복소", to: "무대", min: "3", max: "4" },
  ]);

  const [actors, setActors] = useState([
    { id: "혜원", zone: "무대" },
    { id: "은비", zone: "하수윙" },
  ]);
  const [props, setProps] = useState([{ id: "마루가방", zone: "상수윙" }]);
  const [costumes, setCostumes] = useState([{ actor: "혜원", item: "우주복 B", zone: "하수환복소" }]);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-lg font-medium">입력 · INPUT SOURCES</h1>
        <span className="mono text-[11px] text-muted-foreground">
          우주비행사가 된 마루 / 긴 암전 S#16 → S#17
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SourceCard title="SCRIPT" state={script} onChange={setScript}>
          <Dropzone hint="대본 파일을 끌어다 놓으세요 (.fdx, .pdf)" />
        </SourceCard>

        <SourceCard title="CUESHEET" state={cuesheet} onChange={setCuesheet}>
          <Dropzone hint="큐시트 파일을 끌어다 놓으세요 (.xlsx, .csv)" />
        </SourceCard>

        <SourceCard title="STAGE_SPEC" state={spec} onChange={setSpec}>
          <div className="flex flex-col gap-4 p-3">
            <Field label="wings">
              <div className="flex gap-4">
                {(["상수", "하수"] as const).map((w) => (
                  <label key={w} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={wings[w]}
                      onChange={() => setWings((p) => ({ ...p, [w]: !p[w] }))}
                    />
                    {w}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="crossover (백스테이지 통로)">
              <div className="flex gap-4">
                {(["true", "false", "UNKNOWN"] as const).map((v) => (
                  <label key={v} className="mono flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="crossover"
                      checked={crossover === v}
                      onChange={() => setCrossover(v)}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="route times">
              <div className="flex flex-col gap-1">
                {routes.map((r, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Cell
                      value={r.from}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, from: v } : x)))
                      }
                    />
                    <span className="mono text-xs">→</span>
                    <Cell
                      value={r.to}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, to: v } : x)))
                      }
                    />
                    <span className="mono text-xs">:</span>
                    <Cell
                      w={44}
                      value={r.min}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, min: v } : x)))
                      }
                    />
                    <span className="mono text-xs">–</span>
                    <Cell
                      w={44}
                      value={r.max}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, max: v } : x)))
                      }
                    />
                    <span className="mono text-[10px] text-muted-foreground">sec</span>
                    <button
                      onClick={() => setRoutes((p) => p.filter((_, j) => j !== i))}
                      className="ml-auto border border-border p-1 hover:bg-muted"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Btn
                  className="mt-1 self-start"
                  onClick={() => setRoutes((p) => [...p, { from: "", to: "", min: "", max: "" }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> 경로 추가
                </Btn>
              </div>
            </Field>

            <Field label="initial_state">
              <MiniTable
                caption="actors"
                headers={["id", "start zone"]}
                rows={actors.map((a) => [a.id, a.zone])}
                onChange={(r, c, v) =>
                  setActors((p) =>
                    p.map((x, i) => (i === r ? (c === 0 ? { ...x, id: v } : { ...x, zone: v }) : x)),
                  )
                }
              />
              <MiniTable
                caption="props"
                headers={["id", "start zone"]}
                rows={props.map((a) => [a.id, a.zone])}
                onChange={(r, c, v) =>
                  setProps((p) =>
                    p.map((x, i) => (i === r ? (c === 0 ? { ...x, id: v } : { ...x, zone: v }) : x)),
                  )
                }
              />
              <MiniTable
                caption="costumes"
                headers={["actor", "item", "stored zone"]}
                rows={costumes.map((a) => [a.actor, a.item, a.zone])}
                onChange={(r, c, v) =>
                  setCostumes((p) =>
                    p.map((x, i) =>
                      i === r
                        ? c === 0
                          ? { ...x, actor: v }
                          : c === 1
                            ? { ...x, item: v }
                            : { ...x, zone: v }
                        : x,
                    ),
                  )
                }
              />
            </Field>
          </div>
        </SourceCard>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => navigate({ to: "/workspace" })}
          className="border border-foreground bg-foreground px-5 py-2.5 text-sm text-background hover:bg-muted-foreground"
        >
          Upstage 추출 시작
        </button>
      </div>
    </div>
  );
}

function SourceCard({
  title,
  state,
  onChange,
  children,
}: {
  title: string;
  state: SourceState;
  onChange: (s: SourceState) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col border border-border bg-surface">
      <header className="border-b border-border px-3 py-2">
        <div className="mono text-[11px] tracking-[0.14em] text-muted-foreground">{title}</div>
        <div className="mt-1 text-sm">{state.filename}</div>
        <div className="mono mt-1 text-[10px] text-muted-foreground">{state.hash}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <OriginBadge origin={state.origin} />
          <ReviewBadge
            reviewed={state.reviewed}
            onToggle={() => onChange({ ...state, reviewed: !state.reviewed })}
          />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Dropzone({ hint }: { hint: string }) {
  const [over, setOver] = useState(false);
  return (
    <div className="p-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
        }}
        className={cn(
          "flex h-40 flex-col items-center justify-center gap-2 border border-dashed border-border text-center",
          over ? "bg-muted" : "bg-background",
        )}
      >
        <UploadCloud className="h-5 w-5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{hint}</span>
        <span className="mono text-[10px] text-muted-foreground">DROP / CLICK</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Cell({
  value,
  onChange,
  w = 96,
}: {
  value: string;
  onChange: (v: string) => void;
  w?: number;
}) {
  return (
    <input
      value={value}
      style={{ width: w }}
      onChange={(e) => onChange(e.target.value)}
      className="mono border border-border bg-background px-1 py-[2px] text-xs outline-none focus:border-foreground"
    />
  );
}

function MiniTable({
  caption,
  headers,
  rows,
  onChange,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
  onChange: (row: number, col: number, value: string) => void;
}) {
  return (
    <div className="mb-2">
      <div className="mono mb-1 text-[10px] text-muted-foreground">{caption}</div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="mono border border-border bg-muted px-1 py-[2px] text-left text-[10px] font-normal text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className="border border-border p-0">
                  <input
                    value={c}
                    onChange={(e) => onChange(ri, ci, e.target.value)}
                    className="w-full bg-surface px-1 py-[2px] text-xs outline-none focus:bg-muted"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
