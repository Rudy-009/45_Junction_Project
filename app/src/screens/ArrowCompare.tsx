import { cn } from '@/lib/utils';

/**
 * 화살표 방향 UI 비교 - 전체 무대 레이아웃 포함
 * 
 * 규칙:
 * - 등장: 인물이 무대에 있고, 화살표가 상수/하수에서 인물을 향함 (실선, 초록)
 * - 퇴장: 인물이 윙에 있고, 화살표가 인물을 향함 (점선, 빨강)
 * - 유지: 무대에 있음, 화살표 없음
 */

type DemoEntity = {
  label: string;
  kind: 'person' | 'prop';
  action: 'enter' | 'exit' | 'stay';
  direction: 'stage_left' | 'stage_right';
};

const DEMO: DemoEntity[] = [
  { label: '수연', kind: 'person', action: 'enter', direction: 'stage_left' },
  { label: '은비', kind: 'person', action: 'stay', direction: 'stage_left' },
  { label: '민수', kind: 'person', action: 'exit', direction: 'stage_right' },
  { label: '마루가방', kind: 'prop', action: 'enter', direction: 'stage_right' },
];

export function ArrowCompare() {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="mb-2 text-lg font-medium">화살표 UI 비교 — 전체 무대 레이아웃</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        수연: 상수에서 등장 / 은비: 무대 유지 / 민수: 하수로 퇴장 / 마루가방: 하수에서 진입
      </p>

      <div className="flex flex-col gap-10">
        <FullStageDemo title="Option B — 실선/점선 화살표" entities={DEMO} />
      </div>
    </div>
  );
}

function FullStageDemo({ title, entities }: { title: string; entities: DemoEntity[] }) {
  const onStage = entities.filter((e) => e.action === 'enter' || e.action === 'stay');
  const exitedLeft = entities.filter((e) => e.action === 'exit' && e.direction === 'stage_left');
  const exitedRight = entities.filter((e) => e.action === 'exit' && e.direction === 'stage_right');
  const enteredFromLeft = entities.filter((e) => e.action === 'enter' && e.direction === 'stage_left');
  const enteredFromRight = entities.filter((e) => e.action === 'enter' && e.direction === 'stage_right');

  return (
    <section className="border border-border p-6">
      <h2 className="mono mb-4 text-sm font-medium">{title}</h2>

      <div className="flex min-h-[320px] items-stretch gap-0">
        {/* 상수 윙 */}
        <div className="flex w-[140px] shrink-0 flex-col border border-border bg-muted">
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-medium">상수</div>
            <div className="mono text-[10px] text-muted-foreground">STAGE LEFT</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3">
            {exitedLeft.map((e) => (
              <EntityInWing key={e.label} entity={e} />
            ))}
            {exitedLeft.length === 0 && (
              <span className="text-[10px] text-muted-foreground">대기 없음</span>
            )}
          </div>
        </div>

        {/* 무대 */}
        <div className="relative flex flex-1 flex-col border-y border-border">
          <div className="mono absolute top-2 left-3 text-[10px] text-muted-foreground">
            무대 / STAGE
          </div>

          <div className="flex flex-1 items-center justify-center gap-8 p-8">
            {onStage.map((e) => (
              <EntityOnStage key={e.label} entity={e} />
            ))}
          </div>

          {/* 백스테이지 통로 */}
          <div className="relative h-12 shrink-0 border-t border-border bg-background">
            <span className="mono absolute top-1 left-2 text-[10px] text-muted-foreground">
              백스테이지 통로
            </span>
            <div className="absolute top-1/2 right-3 left-3 h-0 border-t border-solid border-border-strong" />
          </div>
        </div>

        {/* 하수 윙 */}
        <div className="flex w-[140px] shrink-0 flex-col border border-border bg-muted">
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-medium">하수</div>
            <div className="mono text-[10px] text-muted-foreground">STAGE RIGHT</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3">
            {exitedRight.map((e) => (
              <EntityInWing key={e.label} entity={e} />
            ))}
            {exitedRight.length === 0 && (
              <span className="text-[10px] text-muted-foreground">대기 없음</span>
            )}
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="mt-4 flex items-center gap-6 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-8 bg-consistent" />
          <div className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-consistent" />
          <span className="text-xs text-muted-foreground">등장 (실선, 인물을 향함)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-8 border-t-[2px] border-dashed border-violation" />
          <div className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-violation" />
          <span className="text-xs text-muted-foreground">퇴장 (점선, 인물을 향함)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border border-border bg-surface" />
          <span className="text-xs text-muted-foreground">유지 (화살표 없음)</span>
        </div>
      </div>
    </section>
  );
}

/** 무대 위 인물 (등장 or 유지) */
function EntityOnStage({ entity }: { entity: DemoEntity }) {
  const person = entity.kind === 'person';
  const isLeft = entity.direction === 'stage_left';
  const isEnter = entity.action === 'enter';

  return (
    <div className="flex items-center gap-0">
      {/* 상수에서 등장 화살표: 왼쪽에서 인물을 향함 */}
      {isEnter && isLeft && (
        <div className="relative mr-2 flex w-10 items-center">
          <div className="h-[2px] w-full bg-consistent" />
          <div className="absolute right-0 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-consistent" />
        </div>
      )}

      {/* Entity */}
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center border-2 text-xs font-medium',
            person ? 'rounded-full' : '',
            isEnter ? 'border-consistent bg-consistent/15' : 'border-border bg-surface',
            person ? 'text-person' : 'text-prop',
          )}
        >
          {entity.label.length > 2 ? entity.label.charAt(0) : entity.label}
        </div>
        <span className="text-[11px]">{entity.label}</span>
        {isEnter && (
          <span className="mono text-[9px] text-consistent">
            {isLeft ? '상수' : '하수'}에서 등장
          </span>
        )}
      </div>

      {/* 하수에서 등장 화살표: 오른쪽에서 인물을 향함 */}
      {isEnter && !isLeft && (
        <div className="relative ml-2 flex w-10 items-center">
          <div className="h-[2px] w-full bg-consistent" />
          <div className="absolute left-0 h-0 w-0 border-y-[5px] border-r-[8px] border-y-transparent border-r-consistent" />
        </div>
      )}
    </div>
  );
}

/** 윙에 있는 인물 (퇴장 완료) */
function EntityInWing({ entity }: { entity: DemoEntity }) {
  const person = entity.kind === 'person';
  const isLeft = entity.direction === 'stage_left';

  return (
    <div className="flex items-center gap-0">
      {/* 상수 퇴장: 화살표가 왼쪽 윙의 인물을 향함 (오른쪽에서 화살표 진입) */}
      {isLeft && (
        <div className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center border-2 text-xs font-medium opacity-70',
                person ? 'rounded-full' : '',
                'border-violation bg-violation/15',
                person ? 'text-person' : 'text-prop',
              )}
            >
              {entity.label.length > 2 ? entity.label.charAt(0) : entity.label}
            </div>
            <span className="text-[11px] opacity-70">{entity.label}</span>
            <span className="mono text-[9px] text-violation">상수로 퇴장</span>
          </div>
          <div className="relative ml-1 flex w-8 items-center">
            <div className="h-[2px] w-full border-t-[2px] border-dashed border-violation" />
            <div className="absolute left-0 h-0 w-0 border-y-[4px] border-r-[6px] border-y-transparent border-r-violation" />
          </div>
        </div>
      )}

      {/* 하수 퇴장: 화살표가 오른쪽 윙의 인물을 향함 (왼쪽에서 화살표 진입) */}
      {!isLeft && (
        <div className="flex items-center">
          <div className="relative mr-1 flex w-8 items-center">
            <div className="h-[2px] w-full border-t-[2px] border-dashed border-violation" />
            <div className="absolute right-0 h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-violation" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center border-2 text-xs font-medium opacity-70',
                person ? 'rounded-full' : '',
                'border-violation bg-violation/15',
                person ? 'text-person' : 'text-prop',
              )}
            >
              {entity.label.length > 2 ? entity.label.charAt(0) : entity.label}
            </div>
            <span className="text-[11px] opacity-70">{entity.label}</span>
            <span className="mono text-[9px] text-violation">하수로 퇴장</span>
          </div>
        </div>
      )}
    </div>
  );
}
