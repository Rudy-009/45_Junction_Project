# STANDBY — 에이전트 작업 규약

JunctionX Korea 2026 · Upstage 트랙. **Claude Code와 Codex가 같은 저장소에서 병행 작업**한다.
이 파일은 Claude Code의 기준 문서다. Codex는 `AGENTS.md`를 읽으며, 두 파일의 내용은 동일하게 유지한다.
**한쪽을 고치면 반드시 다른 쪽도 같이 고친다.**

---

## 0. 정본은 로컬이다 (2026-08-22 확정)

**Lovable 프로젝트는 동결했다.** 모든 작업은 이 저장소의 `app/`에서 한다.

| | |
|---|---|
| 정본 | 이 저장소 `app/` — 표준 Vite SPA, 의존성 11개 |
| 배포 | https://standby-junctionx.vercel.app (공개) |
| Lovable | `468bba52` 커밋 `2b488673`에서 동결. **되돌아가지 마라** |

Lovable 프로젝트는 `@lovable.dev/vite-tanstack-config`(Nitro + Cloudflare 타깃) 의존이라
로컬·Vercel로 다시 내릴 수 없다. 거기에 변경을 보내면 크레딧을 쓰면서 세 번째 상태를 만든다.

---

## 1. 무엇을 만들고 있나

**STANDBY** — 대본·큐시트·무대 사양 세 문서를 한 공연 순서로 대조해, 시간·동선·상태·큐가
서로 모순되는 지점을 **리허설 전에** 찾아내고 근거와 2D 무대 위에서 재현하는 공연 프리플라이트 검증기.

제품 원칙 세 가지는 어떤 구현에서도 깨면 안 된다.

| 원칙 | 의미 |
|---|---|
| **Verifier first** | 판정은 결정론적 코드가 한다. LLM은 verdict를 바꾸지 못한다 |
| **Evidence always** | 모든 finding은 SCRIPT·CUESHEET·STAGE_SPEC 세 근거를 갖는다 |
| **Human decides** | 최종 판단은 사람. 도구는 근거와 계산만 제시한다 |

**사고를 예측하지 않는다.** verdict는 셋뿐이다 — `VIOLATION` / `REVIEW` / `INSUFFICIENT_EVIDENCE`.
세 번째가 제품의 차별점이다. "모르면 모른다고 말하고, 무엇이 없어서 모르는지 밝힌다."

---

## 2. 저장소 지도

```
app/                    ← 실제 코드. 대부분의 작업이 여기서 일어난다
  src/screens/          InputScreen · WorkspaceScreen
  src/components/standby/  AppHeader Bits StageSimulator CueSheetPanel FindingPopup TimelinePanel
  src/lib/standby-data.ts  시드 데이터 · verdict 토큰 (단일 진실 공급원)
  src/styles.css        디자인 토큰 (다크 전용)

project/PRD_CLAUDE.md   ← 현재 제품 정의. 스펙 충돌 시 이 문서가 우선
project/FEATURE_SPEC_CURRENT.md ← 현재 실제 구현 상태. 완료/미구현 판단의 기준
project/UPSTAGE_PLAYBOOK.md  Upstage Studio 적용법 · smoke test
project/SCRIPT_INTEGRATION.md 대본↔큐시트 연결 검증 결과
project/DOMAIN.md       공연 현업 워크플로우 근거
Lo-Fi/standby/DESIGN.md ← UI 계약. 화면 구성은 이 문서를 따른다
server/                 ← 독립 Fastify backend fixture. 아직 app과 연결되지 않음
contracts/              ← strict JSON Schema 계약과 fixture
```

**스펙이나 기능을 고치기 전에 반드시 `project/PRD_CLAUDE.md`,
`project/FEATURE_SPEC_CURRENT.md`, `Lo-Fi/standby/DESIGN.md`를 읽어라.**

---

## 3. 스택과 명령

프런트는 Vite + React 19 + TypeScript + Tailwind v4 + TanStack Router (code-based routes)다.
`app/`은 하드코딩 fixture와 인메모리 상태로 동작한다. 별도 `server/` 수직 슬라이스가 있지만
프런트와 연결되지 않았고 실제 Upstage 호출도 아직 없다.

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build      # tsc -b && vite build
```

```bash
cd server
npm install
npm run typecheck
npm test
npm run build
```

배포: `npx vercel deploy --prod --yes` (프로젝트 루트가 아니라 `app/`에서)

> Lovable에서 이식했지만 `@lovable.dev/vite-tanstack-config`·Nitro·shadcn/ui 의존은 **전부 제거**했다.
> 되돌리지 마라. 이 앱에 SSR·서버 라우트·Radix가 필요한 이유는 없다.

---

## 4. 절대 깨면 안 되는 UI 불변식

`Lo-Fi/standby/DESIGN.md`의 계약이다. 리팩터링 중 실수로 무너지기 쉬우니 특히 주의한다.

1. **화면은 두 개뿐이다** — `입력`, `워크스페이스`. 세 번째 화면을 만들지 마라
2. **패널 A/B 높이는 동일하다** (`flex-1 basis-0`). 스왑해도 레이아웃이 흔들리면 안 된다
3. **팝업은 아래 패널만 덮는다.** 위 패널은 항상 보인다
4. **`이 위치로 이동` 후에도 해당 셀의 finding 마커가 남아야 한다**
5. **편집은 저장 전까지 verdict를 바꾸지 않는다** (pending edit)
6. **원본 hash는 절대 변하지 않는다.** 편집은 그 위의 revision layer다
7. **가로 스크롤은 큐시트 패널 내부에만.** 페이지 전체는 절대 안 된다
8. **`INSUFFICIENT_EVIDENCE` 회색이 비활성처럼 보이면 안 된다.** 의도된 상태다
9. **모서리 0px, 그림자 없음, 1px 경계.** 색은 verdict와 person/prop 인코딩에만
10. **사람=원+cyan, 소품=사각형+amber.** 도형과 색 **둘 다**로 구분한다 (색각 접근성)

### 명시적 금지 목록

5단계 헤더 · 사이드바 · 좌측 finding 목록 · PROPOSAL Option A/B/C · 병렬 3버튼 ·
별도 Final 2D 화면 · revision lineage 패널 · EXPORT LOG · Zoom 슬라이더 ·
Ctrl+F 검색 · JSON raw 뷰 · 실제 건축 도면 · 라이트모드 토글 ·
**시뮬레이터 드래그앤드롭** · **노드 이동 애니메이션**

---

## 5. 남은 작업 (우선순위)

| # | 작업 | 파일 | 비고 |
|---|---|---|---|
| **P0** | **재생 동기화** | `WorkspaceScreen` | 재생 시 타임라인·큐시트 스크롤·무대가 함께 진행 |
| P1 | 이벤트 **더블클릭 = 해당 셀로 이동** | `TimelinePanel` | 단일 클릭은 팝업 유지. `이 위치로 이동` 버튼도 유지 |
| P1 | 큐시트가 **위 패널일 때 팝업 유지** | `WorkspaceScreen` | 아래가 무대면 닫을 이유가 없다. 패널 전환 강제 금지 |
| P1 | 엔티티 **라벨 인라인 편집** | `StageSimulator` | 클릭 → input, Enter 커밋, Esc 취소 |
| **P1** | **XLSX export** | `CueSheetPanel` | **받은 엑셀을 그대로 돌려준다.** 아래 참조 |
| P2 | 히스토리 **복원** 명시 | `CueSheetPanel` | 현재 로드는 되나 "복원" 의미가 UI에 드러나지 않음 |
| P2 | XLSX import | `InputScreen` | dropzone은 이미 있다. 파싱은 Upstage 경로 |
| P2 | 재검증(refresh) 버튼 | `WorkspaceScreen` | 원본 hash 비교 후 바뀐 문서만 재추출 |
| P2 | 파급효과 표시 | `WorkspaceScreen` | 셀 편집 시 영향받는 이벤트 카드에 표시 |

이벤트별 무대 스냅샷은 구현 완료됐다. 현재 남은 P0는 재생 동기화이며,
완료 여부를 바꿀 때는 `project/FEATURE_SPEC_CURRENT.md`도 함께 갱신한다.

### 이벤트별 무대 스냅샷 — P0 사양

**애니메이션이 아니라 정적 스냅샷이다.** 연출자가 알고 싶은 것은 결과 상태이지 이동 과정이 아니다.

```ts
type Transition = "ENTER" | "EXIT";
type EntityStateAtEvent = { zone: Zone; transition?: Transition };
type StageSnapshots = Record<EventId, Record<EntityId, EntityStateAtEvent>>;
```

| `transition` | 표시 |
|---|---|
| `ENTER` | 무대 쪽(안쪽) 화살표 + `등장` |
| `EXIT` | 윙 쪽(바깥쪽) 화살표 + `퇴장` |
| 없음 | 화살표 없음 — 그냥 그 자리에 있다 |

**왜 transition이 필요한가**: E6에서 퇴장했어도 E7·E8·E9에서 똑같이 윙에 서 있다.
정적 스냅샷만으로는 *언제* 퇴장했는지 알 수 없다.

**화살표 방향은 `무대 쪽 / 윙 쪽`으로 정의한다.** 좌/우 절대방향으로 정의하면
상수(화면 왼쪽)와 하수(오른쪽)에서 서로 뒤집혀 혼동한다.

`ENTER`/`EXIT`는 `--enter: #22c55e` / `--exit: #ef4444`를 쓴다. MVP에서 색각 대응은 범위 밖이다.
verdict 색은 저채도 파스텔이라 정상 시야에서 구분되지만, **방향과 라벨이 여전히 주 신호**다.
(접근성을 다룰 때는 단일 색 + 방향·채움·라벨 3중 인코딩으로 되돌린다 — 측정상 보색 쌍은 존재하지 않는다.)

### 시뮬레이터는 읽기 전용이다

드래그앤드롭 편집은 폐기했다. E6에서 퇴장한 배우를 E9에서 끌어오면 **새 이벤트를 만드는 행위**가 되고,
트리거도 이벤트 번호도 정할 수 없다. 편집 경로가 둘이 되면 원본 불변 모델이 깨진다.

> **편집은 큐시트에서만. 시뮬레이터는 결과를 비추는 거울이다.**

### XLSX export가 왜 P1인가

`DOMAIN.md`는 경쟁 도구가 전부 **자기 툴로 이주**를 요구한다고 진단했고, STANDBY의 차별점을
*"아무것도 안 바꿔도 됨"*으로 잡았다. 그런데 지금 앱은 엑셀을 **먹기만 하고 돌려주지 않는다.**
돌려주지 못하면 STANDBY가 종착지가 되고, 종착지가 된다는 건 곧 이주 요구다.

export 규칙 — 자세한 계약은 `project/PRD_CLAUDE.md` §10:

1. 원본 파일과 hash는 변하지 않는다. export는 **항상 새 파일**
2. 사람이 고친 셀만 바뀐다. 열 구성·시트 이름·서식을 재배치하지 않는다
3. **verdict를 문서에 쓰지 않는다.** 큐시트는 실행 문서지 검증 리포트가 아니다
4. export → import 왕복 시 같은 fact가 나와야 한다

### Refresh 관련 불변식 (깨면 원칙이 무너진다)

- **hash가 그대로면 Upstage를 재호출하지 않는다.** 크레딧이 refresh 빈도만큼 소모된다
- **refresh가 만든 새 fact는 자동으로 판정에 들어가지 않는다.** `UNREVIEWED`로 대기하고
  사람이 승인해야 반영된다. 승인 전에는 `INSUFFICIENT_EVIDENCE`로 남는 것이 올바른 동작이다

---

## 6. 협업 규약 — Claude Code ↔ Codex

같은 파일을 동시에 고치면 충돌한다. **작업 전 아래를 지킨다.**

1. **파일 단위로 나눠 잡는다.** 한 에이전트가 한 파일을 소유한 채 작업하고, 끝나면 놓는다
2. **`standby-data.ts`는 공유 자원이다.** 여기를 고칠 때는 짧게, 한 번에, 다른 작업과 겹치지 않게
3. **작업 시작 전 `git status`로 다른 에이전트의 미커밋 변경을 확인한다**
4. **커밋은 작게.** 한 커밋 = 위 표의 한 항목
5. **끝날 때마다 `npm run typecheck && npm run build`를 돌린다.** 깨진 채로 넘기지 않는다
6. 스펙에 없는 기능을 임의로 추가하지 않는다. 필요하면 먼저 `project/PRD_CLAUDE.md`를 고친다

### 역할 분담 제안

- **Claude Code** — 상태 모델·상호작용 로직 (재생 동기화, P1 팝업/전환 규칙)
- **Codex** — 표현 계층 (라벨 편집, 히스토리 복원 UI, 타임라인 인터랙션)

겹치는 파일은 `WorkspaceScreen.tsx`뿐이다. **이 파일은 Claude Code가 소유**하고,
Codex는 컴포넌트 내부만 건드리는 것으로 시작한다.

---

## 7. 데모에서 절대 죽으면 안 되는 흐름

```
E3 카드 클릭 → 팝업 (VIOLATION · 58-62s vs 66-68s · 근거 3개)
  → 이 위치로 이동 → 큐시트 R3 환복시간 셀
  → 58s를 70s로 수정 → 저장
  → E3가 VIOLATION → CONSISTENT 로 뒤집힘
```

**이 한 흐름이 데모의 전부다.** 어떤 리팩터링도 이걸 깨면 안 된다.
바꿨다면 반드시 브라우저에서 직접 이 흐름을 끝까지 실행해 확인한다.
