import { Link } from "@tanstack/react-router";

export function AppHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-baseline gap-3">
        <span className="mono text-base tracking-[0.28em]">STANDBY</span>
        <span className="mono text-[10px] text-muted-foreground">
          PRE-FLIGHT VERIFICATION v0.9
        </span>
      </div>

      <nav className="flex h-8 items-stretch border border-border">
        <Link
          to="/"
          className="flex items-center px-4 text-xs text-foreground hover:bg-muted"
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-foreground text-background hover:bg-foreground" }}
        >
          입력
        </Link>
        <Link
          to="/workspace"
          className="flex items-center border-l border-border px-4 text-xs text-foreground hover:bg-muted"
          activeProps={{ className: "bg-foreground text-background hover:bg-foreground" }}
        >
          워크스페이스
        </Link>
      </nav>
    </header>
  );
}
