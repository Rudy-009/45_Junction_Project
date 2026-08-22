import { cn } from '@/lib/utils';
import type { Zone, StageEntity } from '@/types';

export type { StageEntity as Entity };

export function StageSimulator({
  crossover,
  entities,
}: {
  crossover: 'true' | 'false' | 'UNKNOWN';
  entities: StageEntity[];
}) {
  const byZone = (z: Zone) => entities.filter((e) => e.zone === z);

  return (
    <div className="relative h-full w-full overflow-auto bg-background p-6">
      <div className="mono absolute top-3 right-3 border border-border bg-surface px-2 py-[2px] text-[10px] text-muted-foreground">
        SCHEMATIC · 좌우 구분만 · 실측 아님
      </div>

      <Legend />

      <div className="flex h-full min-h-[240px] min-w-[760px] items-stretch gap-0">
        <WingBox label="상수" sub="STAGE RIGHT" side="left" entities={byZone('상수윙')} />

        <div className="relative flex flex-1 flex-col border-y border-border">
          <div className="relative flex flex-1 items-center justify-center bg-surface">
            <span className="mono absolute top-2 left-2 text-[10px] text-muted-foreground">
              무대 / STAGE
            </span>
            <div className="flex flex-wrap items-center justify-center gap-4 p-4">
              {byZone('무대').map((e) => (
                <EntityGlyph key={e.id} entity={e} onStage />
              ))}
            </div>
          </div>

          <div className="relative h-14 shrink-0 border-t border-border bg-background">
            <span className="mono absolute top-1 left-2 text-[10px] text-muted-foreground">
              백스테이지 통로 · crossover={crossover}
            </span>
            <div className="absolute top-1/2 right-3 left-3 flex items-center">
              <div
                className={cn(
                  'h-0 w-full border-t',
                  crossover === 'true' && 'border-solid border-border-strong',
                  crossover === 'UNKNOWN' && 'border-dashed border-muted-foreground',
                  crossover === 'false' && 'border-solid border-violation',
                )}
              />
              {crossover === 'false' && (
                <span className="mono absolute left-1/2 -translate-x-1/2 bg-background px-2 text-[11px] text-violation">
                  ✕ 통로 없음
                </span>
              )}
            </div>
          </div>
        </div>

        <WingBox
          label="하수"
          sub="STAGE LEFT"
          side="right"
          entities={byZone('하수윙')}
          extra={byZone('하수환복소')}
        />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mono absolute top-3 left-3 flex items-center gap-3 border border-border bg-surface px-2 py-[2px] text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full border border-person bg-person/25" />
        사람
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 border border-prop bg-prop/25" />
        소품
      </span>
      <span className="text-enter">▸ 등장</span>
      <span className="text-exit">◂ 퇴장</span>
    </div>
  );
}

function WingBox({
  label,
  sub,
  side,
  entities,
  extra,
}: {
  label: string;
  sub: string;
  side: 'left' | 'right';
  entities: StageEntity[];
  extra?: StageEntity[];
}) {
  return (
    <div className="flex w-48 shrink-0 flex-col border border-border bg-muted">
      <div className="border-b border-border px-2 py-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mono text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <div className="flex flex-1 flex-col items-start gap-2 p-2">
        {entities.map((e) => (
          <EntityGlyph key={e.id} entity={e} wingSide={side} />
        ))}
      </div>
      {extra && extra.length > 0 && (
        <div className="border-t border-border bg-surface p-2">
          <div className="mono mb-1 text-[10px] text-muted-foreground">하수환복소</div>
          <div className="flex flex-col items-start gap-2">
            {extra.map((e) => (
              <EntityGlyph key={e.id} entity={e} wingSide={side} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EntityGlyph({
  entity,
  onStage,
  wingSide,
}: {
  entity: StageEntity;
  onStage?: boolean;
  wingSide?: 'left' | 'right';
}) {
  const person = entity.kind === 'person';
  const transition = entity.transition;
  const towardStage = onStage ? '▴' : wingSide === 'left' ? '▸' : '◂';
  const towardWing = onStage ? '▾' : wingSide === 'left' ? '◂' : '▸';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center border text-[10px]',
          person
            ? 'rounded-full border-person bg-person/20 text-person'
            : 'border-prop bg-prop/20 text-prop',
        )}
        aria-label={person ? '사람' : '소품'}
      >
        {person ? '●' : '■'}
      </div>
      {entity.connector && (
        <div
          className={cn(
            'h-0 w-6 border-t',
            entity.connector.reviewed
              ? 'border-solid border-border-strong'
              : 'border-dashed border-muted-foreground',
          )}
        />
      )}
      <span className="text-xs whitespace-nowrap">{entity.label}</span>
      {transition && (
        <span
          className={cn(
            'mono flex items-center gap-0.5 border px-1 text-[10px] whitespace-nowrap',
            transition === 'ENTER'
              ? 'border-enter text-enter'
              : 'border-exit text-exit',
          )}
        >
          <span aria-hidden>{transition === 'ENTER' ? towardStage : towardWing}</span>
          {transition === 'ENTER' ? '등장' : '퇴장'}
        </span>
      )}
    </div>
  );
}
