export function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <span className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </span>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
