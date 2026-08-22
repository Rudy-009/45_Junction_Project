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
  carriedBy?: string; // 소지하고 있는 인물 이름
};

const DEMO: DemoEntity[] = [
  { label: '수연', kind: 'person', action: 'enter', direction: 'stage_left' },
  { label: '은비', kind: 'person', action: 'stay', direction: 'stage_left' },
  { label: '민수', kind: 'person', action: 'exit', direction: 'stage_right' },
  { label: '마루가방', kind: 'prop', action: 'enter', direction: 'stage_left', carriedBy: '수연' },
  { label: '편지', kind: 'prop', action: 'enter', direction: 'stage_left', carriedBy: '수연' },
  { label: '장바구니', kind: 'prop', action: 'stay', direction: 'stage_left', carriedBy: '은비' },
];

// 소지 관계는 carriedBy 필드로 표현

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

          <div className="flex flex-1 flex-col items-center justify-center gap-0 p-6">
            {/* 인물 줄 (상단) */}
            <div className="flex items-center justify-center gap-10">
              {(() => {
                const persons = onStage.filter((e) => e.kind === 'person');
                return persons.map((e) => (
                  <EntityOnStage key={e.label} entity={e} />
                ));
              })()}
            </div>

            {/* 연결선 (인물 → 소품) */}
            <div className="flex items-start justify-center gap-10">
              {(() => {
                const persons = onStage.filter((e) => e.kind === 'person');
                return persons.map((person) => {
                  const carriedProps = onStage.filter(
                    (e) => e.kind === 'prop' && e.carriedBy === person.label,
                  );
                  return (
                    <div key={person.label} className="flex flex-col items-center">
                      {carriedProps.length > 0 && (
                        <>
                          {/* 수직 연결선 */}
                          <div className="h-4 w-[2px] border-l-[2px] border-dotted border-prop" />
                          {/* 소품들 - 가로 배치, 인물 중앙 기준 */}
                          <div className="flex items-start justify-center gap-3">
                            {carriedProps.map((prop) => (
                              <div key={prop.label} className="flex flex-col items-center gap-1">
                                <div
                                  className={cn(
                                    'flex h-9 w-9 items-center justify-center border-2',
                                    prop.action === 'enter' ? 'border-consistent bg-consistent/15' : 'border-prop bg-prop/15',
                                  )}
                                />
                                <span className="max-w-[48px] text-center text-[10px] font-bold leading-tight">{prop.label}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {carriedProps.length === 0 && (
                        <div className="h-[60px]" />
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* 소지되지 않은 소품 (스태프 세팅) */}
            {(() => {
              const uncarried = onStage.filter((e) => e.kind === 'prop' && !e.carriedBy);
              if (uncarried.length === 0) return null;
              return (
                <div className="mt-2 flex items-center gap-4 border-t border-dashed border-border pt-2">
                  <span className="mono text-[9px] text-muted-foreground">스태프</span>
                  {uncarried.map((prop) => (
                    <div key={prop.label} className="flex flex-col items-center gap-1">
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center border-2',
                          prop.action === 'enter' ? 'border-consistent bg-consistent/15' : 'border-prop bg-prop/15',
                        )}
                      />
                      <span className="text-[10px] font-bold">{prop.label}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
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
    <div className="flex flex-col items-center gap-1">
      {/* 화살표 (인물 위) */}
      {isEnter && isLeft && (
        <div className="relative flex w-10 items-center">
          <div className="h-[2px] w-full bg-consistent" />
          <div className="absolute right-0 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-consistent" />
        </div>
      )}
      {isEnter && !isLeft && (
        <div className="relative flex w-10 items-center">
          <div className="h-[2px] w-full bg-consistent" />
          <div className="absolute left-0 h-0 w-0 border-y-[5px] border-r-[8px] border-y-transparent border-r-consistent" />
        </div>
      )}
      {entity.action === 'stay' && (
        <div className="h-[10px]" />
      )}

      {/* Entity - 도형만, 이름 없음 */}
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center border-2',
          person ? 'rounded-full' : '',
          isEnter ? 'border-consistent bg-consistent/15' :
          person ? 'border-person bg-person/15' : 'border-prop bg-prop/15',
        )}
      />
      <span className="text-[11px] font-bold">{entity.label}</span>
    </div>
  );
}

/** 윙에 있는 인물 (퇴장 완료) */
function EntityInWing({ entity }: { entity: DemoEntity }) {
  const person = entity.kind === 'person';
  const isLeft = entity.direction === 'stage_left';

  return (
    <div className="flex flex-col items-center gap-1">
      {/* 화살표 (인물 위) - 퇴장 방향 */}
      {isLeft && (
        <div className="relative flex w-10 items-center">
          <div className="h-[2px] w-full border-t-[2px] border-dashed border-violation" />
          <div className="absolute left-0 h-0 w-0 border-y-[4px] border-r-[6px] border-y-transparent border-r-violation" />
        </div>
      )}
      {!isLeft && (
        <div className="relative flex w-10 items-center">
          <div className="h-[2px] w-full border-t-[2px] border-dashed border-violation" />
          <div className="absolute right-0 h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-violation" />
        </div>
      )}

      {/* Entity - 도형만 */}
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center border-2 opacity-70',
          person ? 'rounded-full' : '',
          'border-violation bg-violation/15',
        )}
      />
      <span className="text-[11px] font-bold opacity-70">{entity.label}</span>
    </div>
  );
}
