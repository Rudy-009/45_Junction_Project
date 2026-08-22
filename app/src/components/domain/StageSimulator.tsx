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

  const onStage = byZone('무대');
  const persons = onStage.filter((e) => e.kind === 'person');
  const propsOnStage = onStage.filter((e) => e.kind === 'prop');

  return (
    <div className="relative h-full w-full overflow-auto bg-background p-4">
      <div className="mono absolute top-2 right-2 border border-border bg-surface px-2 py-[2px] text-[10px] text-muted-foreground">
        SCHEMATIC
      </div>

      <Legend />

      <div className="flex h-full min-h-[220px] min-w-[700px] items-stretch gap-0">
        {/* 상수 윙 */}
        <WingBox
          label="상수"
          sub="STAGE LEFT"
          side="left"
          entities={byZone('상수윙')}
        />

        {/* 무대 */}
        <div className="relative flex flex-1 flex-col border-y border-border">
          <span className="mono absolute top-1 left-2 text-[10px] text-muted-foreground">
            무대 / STAGE
          </span>

          <div className="flex flex-1 flex-col items-center justify-center gap-0 p-4 pt-6">
            {/* 인물 줄 */}
            <div className="flex items-end justify-center gap-8">
              {persons.map((e) => (
                <PersonGlyph key={e.id} entity={e} />
              ))}
              {persons.length === 0 && (
                <span className="text-[10px] text-muted-foreground">무대 비어있음</span>
              )}
            </div>

            {/* 소품 줄 (인물에 연결된 소품) */}
            {persons.some((p) => propsOnStage.some((pr) => pr.carriedBy === p.id)) && (
              <div className="flex items-start justify-center gap-8">
                {persons.map((person) => {
                  const carried = propsOnStage.filter((pr) => pr.carriedBy === person.id);
                  return (
                    <div key={person.id} className="flex flex-col items-center">
                      {carried.length > 0 ? (
                        <>
                          <div className="h-3 w-[2px] border-l-[2px] border-dotted border-prop" />
                          <div className="flex items-start justify-center gap-2">
                            {carried.map((prop) => (
                              <PropGlyph key={prop.id} entity={prop} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="h-[44px]" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 소지자 없는 소품 */}
            {(() => {
              const uncarried = propsOnStage.filter((pr) => !pr.carriedBy);
              if (uncarried.length === 0) return null;
              return (
                <div className="mt-2 flex items-center gap-3 border-t border-dashed border-border pt-2">
                  {uncarried.map((prop) => (
                    <PropGlyph key={prop.id} entity={prop} />
                  ))}
                </div>
              );
            })()}
          </div>

          {/* 백스테이지 통로 */}
          <div className="relative h-10 shrink-0 border-t border-border bg-background">
            <span className="mono absolute top-1 left-2 text-[10px] text-muted-foreground">
              백스테이지 · crossover={crossover}
            </span>
            <div className="absolute top-1/2 right-3 left-3 h-0 border-t"
              style={{
                borderStyle: crossover === 'UNKNOWN' ? 'dashed' : 'solid',
                borderColor: crossover === 'false' ? 'var(--color-violation)' : undefined,
              }}
            />
            {crossover === 'false' && (
              <span className="mono absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-[10px] text-violation">
                ✕ 통로 없음
              </span>
            )}
          </div>
        </div>

        {/* 하수 윙 */}
        <WingBox
          label="하수"
          sub="STAGE RIGHT"
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
    <div className="mono absolute top-2 left-2 flex items-center gap-3 border border-border bg-surface px-2 py-[2px] text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full border border-person bg-person/25" />
        사람
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 border border-prop bg-prop/25" />
        소품
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-[2px] w-4 bg-consistent" />
        등장
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-[2px] w-4 border-t-[2px] border-dashed border-violation" />
        퇴장
      </span>
    </div>
  );
}

/** 인물 도형 (무대 위) */
function PersonGlyph({ entity }: { entity: StageEntity }) {
  const isEnter = entity.transition === 'ENTER';
  const isExit = entity.transition === 'EXIT';
  const isLeft = entity.lastDirection === 'stage_left';

  return (
    <div className="flex flex-col items-center gap-1">
      {/* 화살표 (위) */}
      {isEnter && (
        <div className="relative flex w-9 items-center">
          <div className="h-[2px] w-full bg-consistent" />
          {isLeft ? (
            <div className="absolute right-0 h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-consistent" />
          ) : (
            <div className="absolute left-0 h-0 w-0 border-y-[4px] border-r-[7px] border-y-transparent border-r-consistent" />
          )}
        </div>
      )}
      {!isEnter && !isExit && <div className="h-[10px]" />}

      {/* 도형 */}
      <div
        className={cn(
          'h-10 w-10 rounded-full border-2',
          isEnter ? 'border-consistent bg-consistent/15' :
          isExit ? 'border-violation bg-violation/15' :
          'border-person bg-person/15',
        )}
      />
      <span className="text-[11px] font-bold">{entity.label}</span>
    </div>
  );
}

/** 소품 도형 */
function PropGlyph({ entity }: { entity: StageEntity }) {
  const isEnter = entity.transition === 'ENTER';
  const isExit = entity.transition === 'EXIT';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'h-8 w-8 border-2',
          isEnter ? 'border-consistent bg-consistent/15' :
          isExit ? 'border-violation bg-violation/15' :
          'border-prop bg-prop/15',
        )}
      />
      <span className="max-w-[48px] text-center text-[10px] font-bold leading-tight">{entity.label}</span>
    </div>
  );
}

/** 윙 영역 */
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
    <div className="flex w-[130px] shrink-0 flex-col border border-border bg-muted">
      <div className="border-b border-border px-2 py-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mono text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-2">
        {entities.map((e) => (
          <WingEntity key={e.id} entity={e} side={side} />
        ))}
        {entities.length === 0 && (
          <span className="text-[9px] text-muted-foreground">없음</span>
        )}
      </div>
      {extra && extra.length > 0 && (
        <div className="border-t border-border bg-surface p-2">
          <div className="mono mb-1 text-[10px] text-muted-foreground">하수환복소</div>
          <div className="flex flex-col items-center gap-2">
            {extra.map((e) => (
              <WingEntity key={e.id} entity={e} side={side} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 윙에 있는 엔티티 */
function WingEntity({ entity, side }: { entity: StageEntity; side: 'left' | 'right' }) {
  const person = entity.kind === 'person';
  const isExit = entity.transition === 'EXIT';

  return (
    <div className="flex flex-col items-center gap-1">
      {/* 퇴장 화살표 (위) - 인물을 향함 */}
      {isExit && (
        <div className="relative flex w-9 items-center">
          <div className="h-[2px] w-full border-t-[2px] border-dashed border-violation" />
          {side === 'left' ? (
            <div className="absolute left-0 h-0 w-0 border-y-[4px] border-r-[6px] border-y-transparent border-r-violation" />
          ) : (
            <div className="absolute right-0 h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-violation" />
          )}
        </div>
      )}
      {!isExit && <div className="h-[10px]" />}

      {/* 도형 */}
      <div
        className={cn(
          'border-2 opacity-70',
          person ? 'h-10 w-10 rounded-full' : 'h-8 w-8',
          isExit ? 'border-violation bg-violation/15' :
          person ? 'border-person bg-person/15' : 'border-prop bg-prop/15',
        )}
      />
      <span className="text-[10px] font-bold opacity-70">{entity.label}</span>
    </div>
  );
}
