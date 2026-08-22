import { cn } from '@/lib/utils';
import type { Verdict } from '@/types/ui';

export const verdictClass: Record<Verdict, string> = {
  VIOLATION: 'bg-violation-bg text-violation',
  REVIEW: 'bg-review-bg text-review',
  CONSISTENT: 'bg-consistent-bg text-consistent',
  INSUFFICIENT_EVIDENCE: 'bg-insufficient-bg text-insufficient',
  EDITED: 'bg-edited-bg text-edited',
};

export const verdictDot: Record<Verdict, string> = {
  VIOLATION: 'bg-violation',
  REVIEW: 'bg-review',
  CONSISTENT: 'bg-consistent',
  INSUFFICIENT_EVIDENCE: 'bg-insufficient',
  EDITED: 'bg-edited',
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        'mono inline-flex items-center border border-border px-2 py-[2px] text-[11px] tracking-tight uppercase',
        verdictClass[verdict],
        className,
      )}
    >
      {verdict}
    </span>
  );
}

export type Origin = 'REAL_REFERENCE' | 'CONTROLLED_FIXTURE' | 'MUTATED_FIXTURE';

export function OriginBadge({ origin }: { origin: Origin }) {
  return (
    <span className="mono inline-flex items-center border border-border bg-muted px-2 py-[2px] text-[10px] tracking-tight text-muted-foreground uppercase">
      {origin}
    </span>
  );
}

export function ReviewBadge({ reviewed, onToggle }: { reviewed: boolean; onToggle?: () => void }) {
  const Comp = onToggle ? 'button' : 'span';
  return (
    <Comp
      onClick={onToggle}
      className={cn(
        'mono inline-flex items-center border border-border px-2 py-[2px] text-[10px] uppercase',
        reviewed ? 'bg-foreground text-background' : 'bg-surface text-muted-foreground',
      )}
    >
      {reviewed ? 'REVIEWED' : 'UNREVIEWED'}
    </Comp>
  );
}
