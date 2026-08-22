import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { StandbyEvent, Verdict } from "@/lib/standby-data";
import { verdictClass } from "@/lib/standby-data";
import { cn } from "@/lib/utils";

export function TimelinePanel({
  events,
  verdicts,
  currentId,
  onSelect,
  onPrev,
  onNext,
  onPlay,
}: {
  events: StandbyEvent[];
  verdicts: Record<string, Verdict>;
  currentId: string;
  onSelect: (e: StandbyEvent) => void;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
}) {
  return (
    <div className="flex h-[132px] shrink-0 flex-col border-t border-border bg-surface">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          EVENT TIMELINE · 이벤트
        </span>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="border border-border bg-surface p-1 hover:bg-muted">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={onPlay} className="border border-border bg-surface p-1 hover:bg-muted">
            <Play className="h-3.5 w-3.5" />
          </button>
          <button onClick={onNext} className="border border-border bg-surface p-1 hover:bg-muted">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-1 overflow-x-auto bg-background p-2">
        {events.map((e) => {
          const v = verdicts[e.id] ?? e.verdict;
          const active = e.id === currentId;
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e)}
              className={cn(
                "relative flex w-[136px] shrink-0 flex-col justify-between border border-border p-2 text-left",
                active ? "bg-foreground text-background" : "bg-surface hover:bg-muted",
              )}
            >
              {active && (
                <span className="absolute top-0 -left-px h-full w-[2px] bg-violation" aria-hidden />
              )}
              <div className="flex items-center justify-between">
                <span className="mono text-[11px]">{e.id}</span>
                <span className="mono text-[10px] opacity-70">{e.time}</span>
              </div>
              <div className="text-xs">{e.name}</div>
              <span
                className={cn(
                  "mono w-full border border-border px-1 py-[1px] text-[9px] tracking-tight",
                  verdictClass[v],
                )}
              >
                {v}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
