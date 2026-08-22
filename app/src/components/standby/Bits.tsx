import type { Origin, Verdict } from "@/lib/standby-data";
import { verdictClass } from "@/lib/standby-data";
import { cn } from "@/lib/utils";

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center border border-border px-2 py-[2px] text-[11px] tracking-tight uppercase",
        verdictClass[verdict],
        className,
      )}
    >
      {verdict}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: Origin }) {
  return (
    <span className="mono inline-flex items-center border border-border bg-muted px-2 py-[2px] text-[10px] tracking-tight text-muted-foreground uppercase">
      {origin}
    </span>
  );
}

export function ReviewBadge({ reviewed, onToggle }: { reviewed: boolean; onToggle?: () => void }) {
  const Comp = onToggle ? "button" : "span";
  return (
    <Comp
      onClick={onToggle}
      className={cn(
        "mono inline-flex items-center border border-border px-2 py-[2px] text-[10px] uppercase",
        reviewed ? "bg-foreground text-background" : "bg-surface text-muted-foreground",
      )}
    >
      {reviewed ? "REVIEWED" : "UNREVIEWED"}
    </Comp>
  );
}

export function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <span className="mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </span>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

export function Btn({
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "black" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-7 items-center border border-border px-3 text-xs transition-colors disabled:opacity-40",
        variant === "black"
          ? "border-foreground bg-foreground text-background hover:bg-muted-foreground"
          : "bg-surface text-foreground hover:bg-muted",
        className,
      )}
    />
  );
}
