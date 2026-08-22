---
name: STANDBY
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbdad9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  primary: '#000000'
  on-primary: '#ffffff'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  warning: '#8a5a00'
  warning-container: '#ffe08a'
  success: '#1f6b3a'
  success-container: '#cfe9d8'
  unknown: '#747878'
  unknown-container: '#eceded'
  edited: '#3b4cca'
  edited-container: '#dfe3ff'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
typography:
  display-brand: { fontFamily: Inter, fontSize: 20px, fontWeight: '700', lineHeight: 24px, letterSpacing: 0.05em }
  headline-page: { fontFamily: Inter, fontSize: 18px, fontWeight: '600', lineHeight: 24px }
  panel-title:   { fontFamily: Inter, fontSize: 14px, fontWeight: '600', lineHeight: 20px }
  body-main:     { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px }
  data-mono:     { fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: '400', lineHeight: 16px }
  cell-text:     { fontFamily: Inter, fontSize: 12px, fontWeight: '400', lineHeight: 16px }
  label-caps:    { fontFamily: Inter, fontSize: 11px, fontWeight: '600', lineHeight: 16px, letterSpacing: 0.02em }
spacing:
  header-height: 56px
  container-padding: 20px
  panel-gap: 8px
  timeline-height: 132px
  cell-padding-v: 6px
  cell-padding-h: 10px
---

# STANDBY — Design Contract

> **개정 2026-08-22.** 팀 설계 검토 결과를 반영해 전면 개정했다.
> 이전 5단계 헤더, 6항목 사이드바, 좌측 finding 목록, 별도 제안 화면,
> Master v2 재검증 화면, 독립 Final 2D 화면은 **모두 폐기**했다.
> Stitch Lo-Fi 2종도 폐기하고 아래 계약을 유일한 기준으로 삼는다.

## Brand & Style

STANDBY는 공연 제작 검증 워크스페이스다. 시각 언어는 **Technical Blueprint / Compiler IDE**.
밀도 높고, 근거가 붙어 있고, 의도적으로 저채도다.
분석 대시보드나 장식적 디지털 트윈처럼 보이면 실패다.

참조 메타포는 **영상편집기(NLE)**다. 위는 프리뷰, 가운데는 편집 대상, 아래는 트랙.

---

## Canonical Screen Set

P0는 화면 **두 개**뿐이다.

| # | 이름 | 역할 |
|---|---|---|
| 1 | `입력` | 세 문서 업로드 · 역할 확인 · 추출 시작 |
| 2 | `워크스페이스` | 무대 · 큐시트 · 타임라인 3분할. 검증·검토·수정이 전부 여기서 일어난다 |

그 이상의 화면은 편의 기능이며 **보류**다.

---

## 화면 1 — 입력

세 입력을 받고 역할을 확정하는 것 외의 일을 하지 않는다.

- 가로 3분할 소스 카드: `SCRIPT` · `CUESHEET` · `STAGE_SPEC`
- 각 카드: 파일명, revision/hash, origin 배지(`REAL_REFERENCE` / `CONTROLLED_FIXTURE` / `MUTATED_FIXTURE`), `REVIEWED | UNREVIEWED`
- `STAGE_SPEC` 카드는 파일 업로드 대신 **폼 입력**을 허용한다 (아래 무대 최소 입력 참조)
- Primary CTA: `Upstage 추출 시작` → 완료되면 화면 2로 전환
- **제외**: 입력 계약 체크리스트, `Source 교체`, `EXPORT LOG`, revision lineage, 5단계 진행 표시

---

## 화면 2 — 워크스페이스 (메인)

### 레이아웃

```
┌──────────────────────────────────────────────┐  56px
│ STANDBY   [입력] [워크스페이스]   Production │
├──────────────────────────────────────────────┤
│                                              │
│  패널 A  (무대 시뮬레이터 또는 큐시트)         │  ─┐
│                                              │   │ 두 패널
├──────────────────────────────────────────────┤   │ 높이 동일
│                                              │   │ 순서 스왑 가능
│  패널 B  (큐시트 또는 무대 시뮬레이터)         │  ─┘
│                                              │
├──────────────────────────────────────────────┤
│  이벤트 타임라인  E1 … E8                     │  132px
└──────────────────────────────────────────────┘
```

- **패널 A와 B는 높이가 같다.** 그래야 순서를 바꿔도 레이아웃이 흔들리지 않는다
- 헤더 우측에 **스왑 버튼**. 큐시트와 비교하려면 큐시트를 위로, 무대와 비교하려면 무대를 위로
- 좌측 사이드바 없음. 상단 탭 2개로 화면을 오간다
- **finding 목록을 위한 별도 영역은 두지 않는다**

### 패널 — 무대 시뮬레이터

MVP는 **도면이 아니라 네모**다. 목적은 정밀 계측이 아니라 **육안 확인**이다.

```
        ┌─────────────────────────┐
  상수  │                         │  하수
  WING  │        무대 (STAGE)      │  WING
        │                         │
        └─────────────────────────┘
              백스테이지 통로 ○/✕
```

- 무대는 단순 사각형. 좌우에 **상수 / 하수 날개**
- 두 날개 사이 **백스테이지 통로 유무**를 선/점선/차단선으로 표시
- 사람은 **원**, 소품은 **사각형**, 라벨은 이름
- 좌표 보간 금지. 존 안에서의 정확한 위치를 지어내지 않는다
- 배지: `SCHEMATIC · 좌우 구분만 · 실측 아님`

> 실제 도면과 좌표 계산은 **향후 제품 단계**다. 대도구 반출입 인력 산정에는 필요하지만 MVP 범위가 아니다.

#### 읽기 전용이다 — 드래그앤드롭을 만들지 마라 ★

시뮬레이터에서 노드를 끌어다 배치하는 기능은 **검토 후 폐기했다.** 이유:

- E6에서 퇴장한 은비를 E9에서 무대로 끌어오면, 그건 **새 이벤트를 만드는 행위**다
- 그 이벤트의 트리거는 무엇인가? 번호는 9인가 10인가? 답할 수 없다
- 시뮬레이터가 **이벤트 생성자**가 되면 큐시트(JSON)와 동시 수정이 필요해져 상태가 꼬인다
- 원본 불변 + revision layer 모델이 깨진다. 편집 경로가 두 개가 되기 때문이다

> **편집은 큐시트에서만 한다. 시뮬레이터는 그 결과를 비추는 거울이다.**
> 큐시트를 고치면 시뮬레이터가 즉시 반영한다. 그 반대 방향은 없다.

초기 배치(`initial_state`)도 마찬가지다. 큐시트가 제대로 작성돼 있으면 거기서 나온다.
시뮬레이터에서 손으로 세팅하지 않는다.

#### 이벤트별 상태 — 애니메이션이 아니라 스냅샷 ★

**이동 애니메이션을 만들지 마라.** 검토 후 폐기했다.

연출자가 알고 싶은 것은 *"은비가 지금 어디 있지"*(결과 상태)이지
*"은비가 어떻게 걸어갔지"*(이동 과정)가 아니다.
E1을 보다가 E6으로 점프하면 애니메이션은 어차피 순간이동이 되고,
움직이는 노드는 윙 안에서 목록으로 정렬할 수도 없다.

대신 **각 이벤트는 그 시점의 정적 스냅샷**을 보여준다. 이벤트를 바꾸면 노드가 즉시 재배치된다.

#### 노드 상태 3종

정적 스냅샷만으로는 *"언제 퇴장했는지"*를 알 수 없다 —
E6에서 퇴장했어도 E7·E8·E9에서 똑같이 윙에 서 있기 때문이다.
그래서 **그 이벤트에서 일어난 동작**을 노드에 표시한다.

| 상태 | 표시 | 의미 |
|---|---|---|
| `ENTER` | **무대 쪽(안쪽) 화살표** + `등장` | 이 이벤트에서 등장했다 |
| `EXIT` | **윙 쪽(바깥쪽) 화살표** + `퇴장` | 이 이벤트에서 퇴장했다 |
| (없음) | 화살표 없음 | 그냥 그 자리에 있다 |

**화살표 방향은 좌/우 절대방향이 아니라 `무대 쪽 / 윙 쪽`으로 정의한다.**
상수는 화면 왼쪽, 하수는 오른쪽에 그려지므로 절대방향으로 정의하면 양쪽이 반대가 되어 혼동한다.
어느 윙에서 들고 나는지는 **노드가 놓인 위치로 이미 드러난다.**

#### 등장·퇴장 색

MVP 기준으로 **색각 대응은 범위 밖**이며, 관례적인 초록/빨강을 쓴다.

| 상태 | 색 | 방향 | 라벨 |
|---|---|---|---|
| `ENTER` | `--enter: #22c55e` | 무대 쪽(안쪽) | `등장` |
| `EXIT` | `--exit: #ef4444` | 윙 쪽(바깥쪽) | `퇴장` |

verdict 색(`CONSISTENT` #7ee2a8 · `VIOLATION` #ff8a80)은 저채도 파스텔이라
위 고채도와 정상 시야에서 구분된다. 그래도 **방향과 텍스트 라벨이 주 신호**다 —
무대 패널의 빨간 화살표가 "퇴장"인지 "위반"인지 순간 헷갈릴 여지를 없앤다.

> 참고: 색각이상까지 만족시키려면 두 색을 쓸 수 없다는 측정 결과가 있다.
> 팔레트에서 색각이상·WCAG를 함께 통과하는 색상대는 210°–288° 하나뿐이고,
> 그 안의 두 색은 deuteranopia에서 상호 ΔE 11.9로 구분되지 않는다.
> 제품화 단계에서 접근성을 다룰 때 **단일 색 + 방향·채움·라벨 3중 인코딩**으로 되돌린다.

### 패널 — 큐시트

**읽기 전용이 아니다. 수정과 확인이 가능해야 한다.**

- 원본 표 형태를 유지한 표 뷰. 선택된 이벤트의 행을 하이라이트
- **hero 구간에 걸리는 열만 기본 표시**. 17열 전체를 펼치면 무너진다
  - 기본: `마커` `무대_상수` `무대_하수` `환복시간` `의상` `조명` `음향`
  - `열 표시` 토글로 나머지 열 확장
- 행 좌측 **gutter에 finding 마커** (🔴 / 🟡 / ⬜)
- 셀 편집 가능. 편집한 셀은 즉시 **`edited` 색 배경 + 좌상단 삼각 마커**
- 패널 헤더: `저장` 버튼 + `히스토리` 버튼 + `미반영 변경 N건` 배지
- 편집 취소 경로 두 개
  - 셀 단위 `되돌리기`
  - 상단 `모든 변경 취소`

### 패널 — 이벤트 타임라인

**보기 전용이다. 여기서 편집하지 않는다.**

- `E1` ~ `E8` 카드가 가로 일렬. 영상편집기의 트랙 클립처럼 배치
- 각 카드는 이벤트명과 **상태 색**을 가진다
- 좌우 스크롤, `이전 / 재생 / 다음` 컨트롤. **Zoom 없음**
- 현재 이벤트는 검은 채움 + 재생 헤드 세로선

### Finding 팝업

**타임라인 카드를 클릭하면 팝업이 위로 올라온다.**

- 팝업은 **패널 B(아래 패널)를 덮는다.** 패널 A는 계속 보인다
- 사용자는 그 카드가 궁금해서 누른 것이므로 아래가 가려져도 무방하다
- 비교 대상을 바꾸려면 **스왑**으로 원하는 패널을 위에 둔다
- 팝업 구성
  1. verdict 배지 + rule ID
  2. 계산: `AVAILABLE 58–62s` vs `REQUIRED 66–68s`
  3. Evidence Trace **정확히 3개** — `SCRIPT` · `CUESHEET` · `STAGE_SPEC` (각 quote + locator + origin + review state)
  4. 제안 문구 — *"이런 상황이 예상되니 확인이 필요합니다"* 수준. 단일 정답을 확정하지 않는다
  5. `DECISION_RECORDED` 단일 액션
  6. **하단 고정: `이 위치로 이동`**
- `이 위치로 이동` → 팝업이 닫히고 큐시트 해당 셀로 스크롤·선택
  - **이동 후에도 해당 셀에 finding 마커가 남아 있어야 한다.** 팝업이 닫혀도 근거가 붙어 있어야 수정할 수 있다

### 히스토리

`저장` 버튼 옆. 데스크톱 컨텍스트 메뉴처럼 뜨는 스크롤 리스트.

- 항목: 저장 시각, 변경 셀 수, 저장자
- **호버 → 미리보기**: 그 저장에서 바뀐 셀만 목록으로 우측에 표시
- **클릭 → 진입**: 해당 시점 상태로 큐시트를 연다
- 웹에서 우클릭은 브라우저 메뉴와 충돌하므로 **쓰지 않는다**

---

## 상태 색

색은 verdict에만 쓴다. 그 외 전부 그레이스케일.

| 상태 | 색 | 의미 |
|---|---|---|
| `VIOLATION` | 빨강 | 명시된 값이 수학적으로 양립하지 않음 |
| `REVIEW` | 앰버 | 범위가 겹치거나 문서가 다르게 말함 |
| `CONSISTENT` | 초록 | 검토된 제약 범위에서 blocker 0 |
| **`INSUFFICIENT_EVIDENCE`** | **회색** | **판정에 필요한 값이 문서에 없음** |
| `EDITED` | 파랑 | 저장되지 않은 사용자 편집 |

> **회색이 제품의 차별점이다.** 비활성처럼 보이면 안 된다.
> 회색 카드의 팝업은 반드시 *"이 판정에는 X가 필요한데 문서에 없습니다"*를 명시한다.

`CONSISTENT` 초록은 **서버 검증을 통과한 뒤에만** 칠한다.
open finding이 있는 동안 무대 패널은 `EVIDENCE PREVIEW` 모드이며 `FINAL`이라 부르지 않는다.

---

## Components

### Status Token

대문자 모노스페이스, 사각 외곽선. Origin과 Authority는 **별도 토큰**이며 합치지 않는다.

### Technical Table

연회색 헤더, 굵은 라벨, 1px 구분선. 셀 패딩 6/10px.
선택 행은 검은 외곽선. 편집 셀은 `edited-container` 배경.

### Buttons

- Primary: 검정 배경 / 흰 글씨
- Secondary: 흰 배경 / 검정 1px
- Tertiary: 배경 없음 / 호버 시 밑줄
- 결정 UI는 **`DECISION_RECORDED` 하나**. 병렬 3버튼을 두지 않는다

### Shapes & Elevation

모서리 0px. 그림자 없음. 깊이는 톤 레이어와 1px 경계로만 표현한다.
팝업만 예외로 1px 검정 테두리 + 배경 딤 처리.

---

## Layout & Spacing

- 1600×1280 기준 캔버스, 데스크톱 우선
- 헤더 56px, 타임라인 132px, 나머지를 패널 A/B가 균등 분할
- 8px 그리드. 밀집 표 내부만 4px 허용
- 큐시트는 가로 스크롤 허용. **페이지 전체는 가로 스크롤 금지**

## 명시적 제외

5단계 헤더 · 6항목 사이드바 · 좌측 finding 목록 · PROPOSAL Option A/B/C ·
병렬 3버튼 · 별도 Final 2D 화면 · Master v2 재검증 화면 · revision lineage 패널 ·
`EXPORT LOG` · `Source 교체` · 입력 계약 체크리스트 · Zoom 슬라이더 ·
Ctrl+F 검색 · JSON raw 뷰 · 실제 도면 · 연속 scrub 애니메이션
