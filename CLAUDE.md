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
  src/components/domain/ StageSimulator
  src/components/layout/ AppHeader
  src/components/ui/    Badge · Btn · PanelHeader
  src/store/            legacy cue-sheet-schema Zustand 상태
  src/validator/        legacy JSON 로컬 검증기
  src/styles.css        디자인 토큰 (다크 전용)

project/PRD_CLAUDE.md   ← 현재 제품 정의. 스펙 충돌 시 이 문서가 우선
project/FEATURE_SPEC_CURRENT.md ← 현재 실제 구현 상태. 완료/미구현 판단의 기준
project/UPSTAGE_PLAYBOOK.md  Upstage Studio 적용법 · smoke test
project/SCRIPT_INTEGRATION.md 대본↔큐시트 연결 검증 결과
project/DOMAIN.md       공연 현업 워크플로우 근거
Lo-Fi/standby/DESIGN.md ← UI 계약. 화면 구성은 이 문서를 따른다
server/                 ← Fastify backend · Upstage ingestion · reviewed fact compiler · verifier
contracts/              ← strict JSON Schema와 normalized review 계약
```

**스펙이나 기능을 고치기 전에 반드시 `project/PRD_CLAUDE.md`,
`project/FEATURE_SPEC_CURRENT.md`, `Lo-Fi/standby/DESIGN.md`를 읽어라.**

---

## 3. 스택과 명령

프런트는 Vite + React 19 + TypeScript + Tailwind v4 + TanStack Router (code-based routes)다.
`app/` 입력 화면은 개발 환경에서 server API를 호출하지만 review→workspace는 아직 legacy 상태와 분리돼 있다.
`server/`는 실제 Upstage 합성 live smoke와 reviewed fact compiler·VR-01/02/03 통제 fixture를 통과했다.

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
11. **Script Sidebar는 워크스페이스 내부의 접이식 읽기 전용 보조 패널만 허용한다.** MASTER_CUE의
    dialogue·stage direction·trigger·note에서만 구성하며 timeline 선택과 양방향으로 위치를 맞춘다

### 명시적 금지 목록

5단계 헤더 · 전역 내비게이션/다목적 사이드바 · 좌측 finding 목록 · PROPOSAL Option A/B/C · 병렬 3버튼 ·
별도 Final 2D 화면 · revision lineage 패널 · EXPORT LOG · Zoom 슬라이더 ·
Ctrl+F 검색 · JSON raw 뷰 · 실제 건축 도면 · 라이트모드 토글 ·
**시뮬레이터 드래그앤드롭** · **연속 scrub/비인접 event 경로 애니메이션** ·
Agent가 만든 좌표·실제 blocking 경로 · 반복/bounce/particle motion · **Script 업로드 입력 복원**

---

## 5. 남은 작업 (우선순위)

| # | 작업 | 파일 | 비고 |
|---|---|---|---|
| **P0** | **외부 운영 provision** | Railway + Supabase + Vercel | 코드·image는 완료. 프로젝트 생성, secret/public env, live smoke 필요 |
| **P0** | **실제 reference fidelity** | QA gold fact | 한국어 대본·17열 Master Cue의 locator·critical token을 원문 대조 |
| **P0** | **Upstage Agent 4종 live smoke** | Studio + provider + review/workspace | Studio Config #1 저장과 서버 배선은 구현. 실제 Agents API 응답·strict decode·fallback을 Agent별로 검증해야 함 |
| **P0** | **인접 snapshot semantic transition** | `StageSimulator` `WorkspaceScreen` | 180–360ms, jump/back·reduced-motion·Agent 실패는 정적 fallback |
| P1 | XLSX export | 새 adapter/서비스 | 원본 sheet·열·서식을 보존한 새 파일 |
| P2 | refresh gate | source/store/workspace | 동일 hash 재호출 금지, 새 fact는 UNREVIEWED |
| P2 | revision·영속성 | store/DB | 원본 hash 위 append-only patch와 복원 |
| P2 | 재생 동기화·파급효과 | `WorkspaceScreen` | 실제 event graph가 연결된 뒤 구현 |

M3 코드 경계는 완료됐다. Supabase JWT·case owner 검사·Railway image/config와
review→snapshot→workspace E2E가 연결됐다. 외부 Railway/Supabase provision과 실제 원본 fidelity는 아직 남아 있다.
정적 Vercel SPA에 Upstage key나 정적 API token을 넣어 이 순서를 우회하지 않는다.
완료 여부를 바꿀 때는 `project/FEATURE_SPEC_CURRENT.md`도 같은 PR에서 갱신한다.

### 이벤트별 무대 스냅샷과 의미 전환 — P0 사양

**정본은 이벤트별 정적 스냅샷이다.** motion은 실제 이동 경로나 새 상태를 만들지 않고, 시간순으로
인접한 두 verified snapshot의 차이만 짧게 보여 준다.

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

허용 motion 계약:

- 인접 event에서 바뀐 entity만 180–360ms, 한 전환 총 600ms 이하
- 비인접 jump/back은 정적 교체 또는 180ms 이하 crossfade
- `prefers-reduced-motion`은 항상 정적 교체
- Storyboard Recomposer는 reviewed action의 의미 순서만 `NON_AUTHORITATIVE`로 추천. event/entity/zone/fact
  allowlist를 벗어나면 거절하고 정적 snapshot으로 fallback
- timeline 클릭은 cached storyboard를 즉시 선택하며 Agent job을 동기 대기하지 않음

추가 Agent 신뢰 계약:

- Stage Spec Extractor의 fact는 항상 `UNREVIEWED`
- Fact Normalizer 추천 type/value는 `NON_AUTHORITATIVE`; 추천값은 읽기 전용, 직접 수정은 Agent-fixed type에서
  값만 편집한다. type 오류는 추천 거절로 처리하고 `모두 승인`도 사람의 명시적 bulk review 기록을 남긴다
- Rehearsal Brief는 기존 finding/evidence만 요약하고 새 finding·verdict·안전 결론을 만들지 않음
- Storyboard의 `beats`와 `missing_evidence`는 읽기 전용 `NON_AUTHORITATIVE` 보조 결과다. 정적 snapshot과
  deterministic verdict가 정본이며 Agent 결과가 이를 만들거나 바꾸지 못한다
- 네 Agent 모두 Agent/Config/job/input/output hash provenance와 cache key를 남기며 live smoke 전 완료형으로 말하지 않음

현재 Studio/서버 연결 상태 (Config는 모두 `#1`, **live smoke는 아직 대기**):

| Agent | Agent ID | 상태 |
|---|---|---|
| Stage Spec Extractor | `agt_PxbxmhXXT8iqdzs5WmHfUz` | Studio 저장 · 서버 배선 구현 |
| Fact Normalizer | `agt_6tn639gGApNdV9SdRfAjnE` | Studio 저장 · 서버 배선 구현 |
| Storyboard Recomposer | `agt_go8aoJTVDvEwK8mwXh5gEi` | Studio 저장 · 서버 배선 구현 |
| Rehearsal Brief | `agt_9iLkb7fqwdEtaBv48t9tQA` | Studio 저장 · 서버 배선 구현 |

### Script Sidebar — 허용되는 유일한 사이드바

- 새 입력이나 별도 화면이 아니라 **워크스페이스 내부의 접이식 읽기 전용 패널**이다
- 별도 Script 파일을 업로드하지 않는다. MASTER_CUE에 이미 있는 dialogue·stage direction·trigger·note만
  event별 대본 발췌로 구성한다
- timeline event를 선택하면 해당 발췌로 스크롤하고 강조한다. 발췌를 선택하면 같은 event로 이동한다
- 원문을 생성·수정하거나 fact·snapshot·verdict authority를 얻지 않는다

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
2. **공유 자원은 `domain/types.ts`, `domain/compiler.ts`, `domain/verifier.ts`, `WorkspaceScreen.tsx`다.** 소유자를 먼저 정한다
3. **작업 시작 전 `git status`로 다른 에이전트의 미커밋 변경을 확인한다**
4. **커밋은 작게.** 한 커밋 = 위 표의 한 항목
5. **끝날 때마다 `npm run typecheck && npm run build`를 돌린다.** 깨진 채로 넘기지 않는다
6. 스펙에 없는 기능을 임의로 추가하지 않는다. 필요하면 먼저 `project/PRD_CLAUDE.md`를 고친다

### 역할 분담

고정 역할표를 두지 않는다. 작업 시작 시 PR 단위로 파일 소유권을 선언한다.
백엔드 contract 변경과 프런트 projection 변경을 동시에 할 때는 API response fixture를 먼저 고정한다.

---

## 7. 데모에서 절대 죽으면 안 되는 흐름

```
세 입력 → Upstage 추출 → UNREVIEWED fact 검토·승인 → snapshot freeze
  → reviewed 8-event graph → VR-01/02/03 finding + 근거 3종
  → 타임라인 사건 선택 → 같은 시점 큐·무대 상태 + cached semantic transition 재현
  → 기존 finding 근거만 사용하는 rehearsal brief 확인
```

UI를 바꿨다면 브라우저에서 같은 case ID의 이 흐름을 끝까지 실행하고, 승인 전에는 세 규칙 모두
`INSUFFICIENT_EVIDENCE`인지 확인한다. 운영 완료라고 소개하려면 Railway/Supabase live smoke 증거도 필요하다.
