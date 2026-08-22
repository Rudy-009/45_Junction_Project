export type Verdict =
  | "VIOLATION"
  | "REVIEW"
  | "CONSISTENT"
  | "INSUFFICIENT_EVIDENCE"
  | "EDITED";

export const verdictClass: Record<Verdict, string> = {
  VIOLATION: "bg-violation-bg text-violation",
  REVIEW: "bg-review-bg text-review",
  CONSISTENT: "bg-consistent-bg text-consistent",
  INSUFFICIENT_EVIDENCE: "bg-insufficient-bg text-insufficient",
  EDITED: "bg-edited-bg text-edited",
};

export const verdictDot: Record<Verdict, string> = {
  VIOLATION: "bg-violation",
  REVIEW: "bg-review",
  CONSISTENT: "bg-consistent",
  INSUFFICIENT_EVIDENCE: "bg-insufficient",
  EDITED: "bg-edited",
};

export type Origin = "REAL_REFERENCE" | "CONTROLLED_FIXTURE" | "MUTATED_FIXTURE";

export type EvidenceBlock = {
  source: "SCRIPT" | "CUESHEET" | "STAGE_SPEC";
  quote: string;
  locator: string;
  origin: Origin;
  reviewed: boolean;
};

export type StandbyEvent = {
  id: string;
  name: string;
  time: string;
  rowId: string;
  verdict: Verdict;
  finding?: {
    ruleId: string;
    available: string;
    required: string;
    suggestion: string;
    missingFact?: string;
    evidence: EvidenceBlock[];
    targetColumn: string;
  };
};

export const PRODUCTION = {
  title: "우주비행사가 된 마루",
  segment: "긴 암전 S#16 → S#17",
  actors: ["혜원", "은비"],
  prop: "마루가방",
};

const ev = (
  source: EvidenceBlock["source"],
  quote: string,
  locator: string,
  origin: Origin,
  reviewed: boolean,
): EvidenceBlock => ({ source, quote, locator, origin, reviewed });

export const EVENTS: StandbyEvent[] = [
  { id: "E1", name: "퇴장", time: "00:00", rowId: "R1", verdict: "CONSISTENT" },
  { id: "E2", name: "암전 시작", time: "00:04", rowId: "R2", verdict: "CONSISTENT" },
  {
    id: "E3",
    name: "환복소 이동",
    time: "00:08",
    rowId: "R3",
    verdict: "VIOLATION",
    finding: {
      ruleId: "VR-01",
      available: "AVAILABLE 58-62s",
      required: "REQUIRED 66-68s",
      suggestion:
        "환복시간 값을 다시 확인해 주세요. 문서 간 값이 어긋나므로 어떤 값이 맞는지 사용자의 확인이 필요합니다.",
      targetColumn: "환복시간",
      evidence: [
        ev("SCRIPT", "혜원, 하수로 퇴장. (긴 암전)", "S#16 p.42 L.18", "REAL_REFERENCE", true),
        ev("CUESHEET", "LX Q56 암전 58s ~ 62s 유지", "CUE/LX/Q56", "CONTROLLED_FIXTURE", true),
        ev("STAGE_SPEC", "최소 환복시간 60s + 이동 6~8s", "spec.costume.min_change", "CONTROLLED_FIXTURE", false),
      ],
    },
  },
  { id: "E4", name: "의상 환복", time: "00:16", rowId: "R4", verdict: "CONSISTENT" },
  {
    id: "E5",
    name: "소품 인계",
    time: "00:44",
    rowId: "R5",
    verdict: "REVIEW",
    finding: {
      ruleId: "VR-03",
      available: "PROP 마루가방",
      required: "HANDLER 미표기",
      suggestion:
        "마루가방의 좌우 교차 이동 담당자를 지정해 주세요. 기록된 근거만으로는 담당자를 단정할 수 없습니다.",
      targetColumn: "무대_하수",
      evidence: [
        ev("SCRIPT", "은비, 하수에서 마루가방을 들고 등장.", "S#17 p.44 L.03", "REAL_REFERENCE", true),
        ev("CUESHEET", "PROPS: 마루가방 (담당 공란)", "CUE/PROP/P12", "MUTATED_FIXTURE", false),
        ev("STAGE_SPEC", "prop 마루가방 start zone = 상수윙", "spec.initial_state.props[0]", "CONTROLLED_FIXTURE", true),
      ],
    },
  },
  {
    id: "E6",
    name: "크루 동선 해제",
    time: "00:52",
    rowId: "R6",
    verdict: "INSUFFICIENT_EVIDENCE",
    finding: {
      ruleId: "VR-02",
      available: "CAPACITY -",
      required: "CAPACITY ?",
      suggestion:
        "크루 동선 판정을 위해 통로 수용 인원을 입력해 주세요. 현재 근거로는 판정할 수 없습니다.",
      missingFact:
        "이 판정에는 백스테이지 통로의 크루 route capacity가 필요한데 문서에 없습니다.",
      targetColumn: "무대_상수",
      evidence: [
        ev("SCRIPT", "(크루 동선에 대한 지문 없음)", "S#16-S#17", "REAL_REFERENCE", true),
        ev("CUESHEET", "CREW: 2인 대기 (통로 기재 없음)", "CUE/CREW/C04", "CONTROLLED_FIXTURE", false),
        ev("STAGE_SPEC", "crossover = true (capacity 미기재)", "spec.crossover", "CONTROLLED_FIXTURE", true),
      ],
    },
  },
  { id: "E7", name: "재입장", time: "01:02", rowId: "R7", verdict: "CONSISTENT" },
  { id: "E8", name: "소품 복귀", time: "01:10", rowId: "R8", verdict: "CONSISTENT" },
];

export const COLUMNS = [
  { key: "마커", width: 92, always: true },
  { key: "무대_상수", width: 168, always: true },
  { key: "무대_하수", width: 168, always: true },
  { key: "환복시간", width: 108, always: true },
  { key: "의상", width: 140, always: true },
  { key: "조명", width: 128, always: true },
  { key: "음향", width: 128, always: true },
  { key: "크루", width: 120, always: false },
  { key: "타임코드", width: 110, always: false },
  { key: "비고", width: 200, always: false },
];

export type Row = Record<string, string> & { id: string };

export const ROWS: Row[] = [
  { id: "R1", 마커: "E1 / Q54", 무대_상수: "-", 무대_하수: "혜원 퇴장", 환복시간: "-", 의상: "우주복 A", 조명: "LX Q54", 음향: "SFX 12", 크루: "-", 타임코드: "00:00", 비고: "S#16 종료" },
  { id: "R2", 마커: "E2 / Q56", 무대_상수: "-", 무대_하수: "-", 환복시간: "-", 의상: "-", 조명: "LX Q56 암전", 음향: "SFX 13", 크루: "2인 대기", 타임코드: "00:04", 비고: "암전 58-62s" },
  { id: "R3", 마커: "E3 / Q56a", 무대_상수: "-", 무대_하수: "혜원 → 하수환복소", 환복시간: "58s", 의상: "우주복 A 해제", 조명: "-", 음향: "-", 크루: "드레서 1", 타임코드: "00:08", 비고: "3-4s 이동" },
  { id: "R4", 마커: "E4", 무대_상수: "-", 무대_하수: "환복 진행", 환복시간: "60s", 의상: "우주복 B", 조명: "-", 음향: "-", 크루: "드레서 1", 타임코드: "00:16", 비고: "min 60s" },
  { id: "R5", 마커: "E5 / P12", 무대_상수: "마루가방 대기", 무대_하수: "은비 인계", 환복시간: "-", 의상: "-", 조명: "-", 음향: "SFX 14", 크루: "미표기", 타임코드: "00:44", 비고: "좌우 교차" },
  { id: "R6", 마커: "E6 / C04", 무대_상수: "크루 해제", 무대_하수: "-", 환복시간: "-", 의상: "-", 조명: "-", 음향: "-", 크루: "?", 타임코드: "00:52", 비고: "capacity 미상" },
  { id: "R7", 마커: "E7 / Q58", 무대_상수: "-", 무대_하수: "혜원 재입장", 환복시간: "-", 의상: "우주복 B", 조명: "LX Q58", 음향: "SFX 15", 크루: "-", 타임코드: "01:02", 비고: "S#17 시작" },
  { id: "R8", 마커: "E8", 무대_상수: "마루가방 복귀", 무대_하수: "-", 환복시간: "-", 의상: "-", 조명: "-", 음향: "-", 크루: "런크루 1", 타임코드: "01:10", 비고: "-" },
];

export type Revision = {
  id: string;
  savedAt: string;
  author: string;
  changes: { rowId: string; column: string; from: string; to: string }[];
  rows: Row[];
};

// ─── 무대 스냅샷 ────────────────────────────────────────────────────
// 이벤트별 정적 스냅샷이다. 이동 애니메이션은 만들지 않는다.
// transition은 무대 출입만 표시한다. 백스테이지 내 이동(윙↔환복소, 윙↔윙)은
// zone 변화로 이미 드러나므로 마커를 붙이지 않는다.

export type Zone = "상수윙" | "무대" | "하수윙" | "하수환복소";
export type Transition = "ENTER" | "EXIT";
export type EntityKind = "person" | "prop";

export type EntityDef = { id: string; label: string; kind: EntityKind };
export type EntityStateAtEvent = { zone: Zone; transition?: Transition };

export const ENTITIES: EntityDef[] = [
  { id: "hyewon", label: "혜원", kind: "person" },
  { id: "eunbi", label: "은비", kind: "person" },
  { id: "bag", label: "마루가방", kind: "prop" },
];

/** initial_state — 큐시트에서 도출한다. 시뮬레이터에서 손으로 세팅하지 않는다. */
export const INITIAL_STATE: Record<string, Zone> = {
  hyewon: "무대",
  eunbi: "하수윙",
  bag: "상수윙",
};

const at = (
  hyewon: EntityStateAtEvent,
  eunbi: EntityStateAtEvent,
  bag: EntityStateAtEvent,
): Record<string, EntityStateAtEvent> => ({ hyewon, eunbi, bag });

export const STAGE_SNAPSHOTS: Record<string, Record<string, EntityStateAtEvent>> = {
  // 혜원이 무대에서 하수로 빠진다
  E1: at({ zone: "하수윙", transition: "EXIT" }, { zone: "하수윙" }, { zone: "상수윙" }),
  E2: at({ zone: "하수윙" }, { zone: "하수윙" }, { zone: "상수윙" }),
  // 백스테이지 내 이동 — 무대 출입이 아니므로 마커 없음
  E3: at({ zone: "하수환복소" }, { zone: "하수윙" }, { zone: "상수윙" }),
  E4: at({ zone: "하수환복소" }, { zone: "하수윙" }, { zone: "상수윙" }),
  // 마루가방 좌우 교차 — 이동 담당자 미표기가 VR-03 REVIEW의 근거다
  E5: at({ zone: "하수환복소" }, { zone: "하수윙" }, { zone: "하수윙" }),
  E6: at({ zone: "하수환복소" }, { zone: "하수윙" }, { zone: "하수윙" }),
  // 혜원·은비 동시 재입장
  E7: at(
    { zone: "무대", transition: "ENTER" },
    { zone: "무대", transition: "ENTER" },
    { zone: "하수윙" },
  ),
  // 은비가 가방을 들고 들어온다
  E8: at({ zone: "무대" }, { zone: "무대" }, { zone: "무대", transition: "ENTER" }),
};

/** 특정 이벤트 시점의 엔티티 상태 목록. 시뮬레이터의 유일한 입력이다. */
export function stageAt(eventId: string): (EntityDef & EntityStateAtEvent)[] {
  const snap = STAGE_SNAPSHOTS[eventId];
  return ENTITIES.map((e) => ({
    ...e,
    ...(snap?.[e.id] ?? { zone: INITIAL_STATE[e.id] ?? "무대" }),
  }));
}
