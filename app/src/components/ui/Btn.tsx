import { cn } from '@/lib/utils';

export function Btn({
  variant = 'default',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'black' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-7 items-center border border-border px-3 text-xs transition-colors disabled:opacity-40',
        variant === 'black'
          ? 'border-foreground bg-foreground text-background hover:bg-muted-foreground'
          : 'bg-surface text-foreground hover:bg-muted',
        className,
      )}
    />
  );
}
