import { X } from "lucide-react";
import type { StandbyEvent, Verdict } from "@/lib/standby-data";
import { Btn, OriginBadge, ReviewBadge, VerdictBadge } from "./Bits";

export function FindingPopup({
  event,
  verdict,
  onClose,
  onGoto,
  onDecision,
  decided,
}: {
  event: StandbyEvent;
  verdict: Verdict;
  onClose: () => void;
  onGoto: () => void;
  onDecision: () => void;
  decided: boolean;
}) {
  const f = event.finding;

  return (
    <div className="slide-up-panel absolute inset-0 z-40 flex flex-col border-t border-border-strong bg-elevated">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          FINDING · {event.id} {event.name}
        </span>
        <button onClick={onClose} className="border border-border p-1 hover:bg-muted">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!f ? (
          <div className="flex items-center gap-3">
            <VerdictBadge verdict={verdict} />
            <span className="text-sm text-muted-foreground">
              이 이벤트에서 발견된 불일치가 없습니다.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <VerdictBadge verdict={verdict} />
              <span className="mono text-sm">{f.ruleId}</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 border border-border bg-background p-3">
              <span className="mono text-2xl">{f.available}</span>
              <span className="mono text-lg text-muted-foreground">vs</span>
              <span className="mono text-2xl">{f.required}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {f.evidence.map((e) => (
                <div key={e.source} className="border border-border bg-background p-2">
                  <div className="mono mb-2 text-[10px] tracking-[0.14em] text-muted-foreground">
                    EVIDENCE · {e.source}
                  </div>
                  <p className="mb-2 border-l-2 border-border pl-2 text-xs">“{e.quote}”</p>
                  <div className="mono mb-2 text-[10px] text-muted-foreground">{e.locator}</div>
                  <div className="flex flex-wrap gap-1">
                    <OriginBadge origin={e.origin} />
                    <ReviewBadge reviewed={e.reviewed} />
                  </div>
                </div>
              ))}
            </div>

            {f.missingFact && (
              <div className="mono border border-border bg-insufficient-bg p-2 text-xs text-insufficient">
                {f.missingFact}
              </div>
            )}

            <p className="text-sm text-muted-foreground">{f.suggestion}</p>

            <div>
              <Btn variant="black" onClick={onDecision} disabled={decided}>
                {decided ? "DECISION_RECORDED ✓" : "DECISION_RECORDED"}
              </Btn>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <button
          onClick={onGoto}
          className="w-full border border-border-strong bg-background px-3 py-2 text-sm hover:bg-muted"
        >
          이 위치로 이동
        </button>
      </div>
    </div>
  );
}
