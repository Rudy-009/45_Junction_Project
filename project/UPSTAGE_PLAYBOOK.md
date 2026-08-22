# STANDBY × Upstage Mastery Playbook

검증 기준일: **2026-08-23**

목적: Upstage의 기능을 많이 붙이는 것이 아니라, STANDBY에서 **각 기능이 꼭 해야 하는 일과 하면 안 되는 일**을 고정한다.

> **한 문장 결론**<br>
> **An AI tool analyzing scripts and cue sheets to detect blocking conflicts, tight quick-changes, and missing props, visualizing the production on a 2D stage simulator to prevent stage errors.**

무대 사양은 이 문장에 적힌 검출과 시뮬레이션을 가능하게 하는 세 번째 입력이다. 마스터 큐시트와 부서별 사본의 변경 누락 비교는 유효하지만, STANDBY 전체가 아니라 **cue synchronization·revision consistency 모듈**이다.

이 문서는 공식 Upstage 문서·제품 페이지·공식 사례를 기준으로 작성했다. 2026-08-22 프로젝트 계정의
저장 Config #1로 합성 PDF/XLSX smoke는 통과했지만, 실제 공연 원본과 한국어 복합 레이아웃의 추출
정확도는 아직 검증하지 않았다. `🧪` 표시는 해당 조건의 라이브 검증 전에는 확정 사실처럼 발표하지 않는다.

2026-08-23 멘토링 후 **Stage Spec Extractor · Fact Normalizer · Storyboard Recomposer · Rehearsal Brief**
네 Agent를 Studio Config `#1`로 저장했고 서버 provider·strict contract·API 배선도 구현했다. 다만 새 네 Agent의
실제 live job과 raw response는 아직 검증하지 않았다. **Studio 설정 완료·서버 배선 구현·live smoke 대기**로
구분하며 운영 검증 또는 Upstage 활용 완료라고 발표하지 않는다.

---

## 0. 먼저 바로잡을 것

### 현재 공개 Studio의 실행 노드는 네 개다

```text
Parse → Classify → Extract → Instruct
```

- `Parse`: 문서를 HTML·Markdown 등 구조화 텍스트로 변환
- `Classify`: 문서 유형을 분류하고 필요하면 파일·페이지를 분할
- `Extract`: 유형별 schema에 맞춰 필드를 구조화
- `Instruct`: 앞 단계 결과를 요약·변환·비교·검토·판정

공식 Studio 노드 문서는 이 네 개를 명시한다. `Validate`라는 별도 자동 실행 노드는 현재 공개 문서에 없다. 보험 사례에서 말하는 Validate는 **Table View에서 사람이 결과를 검토·수정하는 운영 단계**이고, business-rule validation은 Instruct가 담당한다.

- [Studio 노드 공식 문서](https://console.upstage.ai/docs/studio/key-features)
- [Run, Review, Ground truth, Quick Tune](https://console.upstage.ai/docs/studio/feedback-loop)

행사 자동 전사본은 5개 노드와 Webhook을 언급하지만, 현재 공개 제품 페이지는 Webhook과 MCP에 `coming soon`을 표시한다. 따라서 행사 전용 기능인지 전사 오류인지 멘토에게 확인하기 전에는 의존하지 않는다.

- [Studio 제품 페이지](https://www.upstage.ai/products/studio)

### STANDBY에서 지켜야 할 역할 분리

| 담당 | 잘하는 일 | 맡기지 않을 일 |
|---|---|---|
| **Parse** | 대본·표·무대 사양의 구조와 원문 위치 복원 | 손글씨 수정 의도 판정, CAD geometry 확정, 특정 셀 좌표 보장 |
| **Classify** | 섞인 파일을 대본/큐시트/무대 사양/기타로 분류·분할 | 사용자가 이미 역할을 지정한 파일을 장식적으로 재분류 |
| **Extract** | 문서별 서식을 `ScriptFact`·`CueFact`·`StageFact`로 정규화 | 없는 이름·cue ID·시간·경로 추측, 원문 고쳐 쓰기 |
| **Instruct / Solar** | 애매한 사건 연결 후보 설명, 중립적 확인 질문 생성 | blocking·환복·소품 위험의 최종 판정 |
| **후처리 Agent** | reviewed event를 재배열한 storyboard 후보와 기존 finding의 리허설 brief 생성 | 새 event·좌표·경로·finding·verdict 생성, source 수정 |
| **우리 코드** | 사건 compile, 시간·경로·상태 검증, 2D 상태 재생, provenance 보존 | 누락된 사실을 모델 추론으로 메우기 |
| **사람** | 최신본·정답·실제 안전 여부 확정 | 모든 필드를 처음부터 수작업으로 재입력 |

핵심 원칙은 이것이다.

> **Upstage가 증거를 구조화하고, 코드는 precision을 지키고, Instruct는 recall을 보조하며, 사람이 authority를 가진다.**

---

## 1. Upstage 제품을 고르는 법

| 제품/기능 | 정확한 용도 | STANDBY 판단 |
|---|---|---|
| **Document OCR** | 글자와 word bbox가 필요한 단순 OCR | Parse word 좌표가 부족할 때 특정 crop의 보조 수단 |
| **Document Parse** | 레이아웃·표·차트·읽기 순서를 HTML/Markdown으로 복원 | **필수**. 대본·큐시트·무대 사양의 역할별 canonical source를 만드는 frontend compiler |
| **Document Classify** | 사용자 정의 유형으로 문서 분류 | 역할 미지정 bundle일 때 사용. 고정 슬롯이면 역할별 job/config로 대체 가능 |
| **Information Extract** | JSON Schema에 맞춰 반복 필드와 표를 추출 | **필수**. ScriptFact·CueFact·StageFact를 유형별 schema로 추출하고 field location 확보 |
| **Solar Pro 4** | 장문 추론, structured output, tool calling | 의미가 조금 다른 event-link 후보 설명이나 확인 문장 생성에 선택 사용 |
| **Studio** | 위 단계를 no-code Agent로 조합·검토·버전 관리·API 배포 | **핵심 제출물**. 심사 30점의 중심 |
| **Agents API** | Studio Agent를 파일 업로드와 비동기 job으로 실행 | 앱 연결에 사용. 현재 공개 방식은 polling |
| **Table View / Ground truth** | 추출값을 원문과 비교·수정하고 정답 확정 | 추출 QA와 장기 개선에 사용 |
| **Quick Tune** | 반복 수정 패턴을 보고 field description 개선 제안 | 장기 운영 설명. 모델 재학습으로 표현하지 않음 |
| **Embedding / File Search** | 많은 문서에서 의미 검색·RAG | 대본 전체 검색 확장에는 가능, 48시간 MVP에서는 제외 |

### Agent 팀이 쓰는 두 가지 공식 도구

Upstage는 standalone Parse·Extract·Schema Generation·Classify API를 MCP tool로 노출하는 공식 오픈소스 서버를 제공한다. MCP-compatible coding Agent가 실험 fixture를 빠르게 돌릴 때 유용하다.

- [Upstage 공식 MCP server](https://github.com/UpstageAI/mcp-upstage-server)
- [Upstage 공식 Document Parse skill](https://github.com/UpstageAI/upstage-extensions-hub/tree/main/skills/upstage-document-parse)

이 MCP server는 **standalone API용 개발 도구**다. 제품 페이지에서 `coming soon`이라고 표시된 **Studio workflow의 MCP integration**과는 다른 것이므로, 둘을 같은 기능이라고 발표하지 않는다. 해커톤 제출물의 핵심은 여전히 Studio Agent다.

### Parse와 Extract의 차이

- Parse의 질문: **“문서에 무엇이 어디 순서로 쓰였는가?”**
- Extract의 질문: **“우리가 정의한 필드로 무엇을 꺼낼 것인가?”**

Parse 응답은 `table` element 전체 좌표는 보장하지만 `cells[].coordinates` 계약은 보장하지 않는다. standalone Extract의 `location=true`, `location_granularity=all`은 field 근거를 주지만, **Studio Jobs에서 배열 item 좌표가 유지되는지는 🧪 hard gate**다. 통과 전에는 page + source quote + table element 좌표만 약속한다.

- [Parse 출력 이해](https://console.upstage.ai/docs/capabilities/parse/understanding-output)
- [Extract 위치 좌표](https://console.upstage.ai/docs/capabilities/extract/location-coordinates)

### confidence와 accuracy의 차이

Extract confidence는 `low/high`인 **모델의 자기 확신**이다. 실제 정답률이 아니다. 낮으면 사람에게 보내는 routing signal로만 쓰고, “high이므로 맞다”고 판정하지 않는다.

- [Extract confidence 공식 설명](https://console.upstage.ai/docs/capabilities/extract/confidence)

---

## 2. 권장 제품 정의

### Hero job

> 대본이 요구하는 사건, 큐시트가 지시하는 실행, 무대가 허용하는 물리 조건을 하나의 공연 순서로 맞춰 보고, 배우 동선·퀵체인지·소품 상태가 꼬이는 순간을 리허설 전에 찾아 2D 무대에서 재생한다.

### 입력과 출력

입력:

- 대본 1개: PDF 또는 이미지
- 큐시트 1개: XLSX, PDF 또는 이미지
- 무대 사양 1개: zone·출입구·crossover·환복 위치·명시된 route time을 담은 PDF 또는 이미지

출력:

- `BLOCKING_CONFLICT`, `QUICK_CHANGE_TIGHT`, `POSSIBLE_PROP_GAP` finding과 계산 근거
- 시간순으로 정렬된 배우·소품·cue 상태와 2D 무대 시뮬레이션
- 대본·큐시트·무대 사양의 page + source quote; 🧪 Studio Jobs location gate 통과 시 element/word coordinates
- `VIOLATION`, `REVIEW`, `INSUFFICIENT`를 구분하는 판정과 사람의 검토 상태

48시간 MVP의 좁은 세로 조각:

- 한 장면과 전후 전환의 `exit → change → prop move/handoff → re-entry → prop use` 사건만 compile한다.
- hero 사건 8개를 2D 타임라인에서 step/play할 수 있게 한다.
- 명시·검토된 fact만 사용해 blocking·quick-change·prop rule 세 개를 끝까지 증명한다.
- 세 rule 각각 conflict fixture와 clean control을 가지고, 하나라도 빠지면 canonical statement를 구현 완료형으로 발표하지 않는다.

MVP에서도 하지 않는 것:

- 공연 사고 확률 예측 또는 안전 인증
- 명시되지 않은 시간·경로·소품 이동 생성
- AI의 물리 위험 최종 판정
- 전체 공연·모든 부서 지원
- 한글 빨간펜 의미 자동 확정, Slack, Webhook, 로그인, 권한 시스템

### 왜 이 구성이 Upstage에 적합한가

공식 기업대출 사례도 여러 종류의 서류를 `Parse → Classify → Extract → Instruct`로 처리한 뒤 문서 간 누락과 충돌을 검토한다. STANDBY는 금액·사업자번호 대신 등장·퇴장, cue, route, 환복, 소품 상태를 공통 사건으로 연결한다. 다만 물리 판정과 2D simulation은 Studio가 아니라 검토된 fact를 받는 STANDBY 코드가 담당한다.

- [Upstage 공식 다문서 교차검증 사례](https://www.upstage.ai/use-cases/corporate-loan-document-automation)

---

## 3. 권장 Agent 구조

```text
한 case: script.pdf + cuesheet.xlsx + stage-spec.pdf
                         │
                         ▼
             Parse — 구조·원문 위치
                         │
                         ▼
              Classify — Split by file
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
     script          cuesheet          stage_spec
       │                 │                 │
       ▼                 ▼                 ▼
  ScriptFact         CueFact           StageFact
       └─────────────────┬─────────────────┘
                         ▼
               Fact Normalizer
       NON_AUTHORITATIVE normalized 추천
                         │
                         ▼
       Instruct(조건부) — LINK_CANDIDATE·검토 설명
                         │
                         ▼
          사람 review + fact·event-link·topology 승인
                         │
                         ▼
       STANDBY compiler + deterministic verifier
                         │
                         ▼
          finding + source trace + 2D simulator
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
 Storyboard Recomposer        Rehearsal Brief
 semantic transition 후보     기존 근거의 확인 brief
```

### 3-1. 추가 네 Agent — Studio 설정·서버 배선 구현, live smoke 대기

기존 Script/Master Cue Extractor를 없애거나 하나의 만능 Agent로 합치지 않는다. 추가 범위는 아래 네 개로
고정한다. Agent 수를 늘리는 것이 목적이 아니라 **입력 전 stage constraint → 검증 뒤 event 이해 → 리허설
전달**까지 Upstage의 책임 구간을 넓히는 것이 목적이다.

| Agent | Agent ID | Config | 검증 상태 |
|---|---|---:|---|
| Stage Spec Extractor | `agt_PxbxmhXXT8iqdzs5WmHfUz` | `1` | Studio 저장 · 서버 배선 구현 · live smoke 대기 |
| Fact Normalizer | `agt_6tn639gGApNdV9SdRfAjnE` | `1` | Studio 저장 · 서버 배선 구현 · live smoke 대기 |
| Storyboard Recomposer | `agt_go8aoJTVDvEwK8mwXh5gEi` | `1` | Studio 저장 · 서버 배선 구현 · live smoke 대기 |
| Rehearsal Brief | `agt_9iLkb7fqwdEtaBv48t9tQA` | `1` | Studio 저장 · 서버 배선 구현 · live smoke 대기 |

#### A. Stage Spec Extractor

| 항목 | 계약 |
|---|---|
| 입력 | 사용자가 확인한 stage-spec 문서, 또는 현재 폼 JSON을 원본 hash와 분리된 임시 전송 문서로 변환한 것 |
| 출력 | `stage_facts`: crossover, route time/capacity, minimum change, initial state와 각 locator·source quote |
| trigger | case의 source extraction 시작. Agent/Config가 없거나 strict decode가 실패하면 현재 deterministic form extractor로 fallback |
| cache | `stage source SHA-256 + Agent ID + Config ID + 실제 request-body hash` |
| trust | 모든 결과는 `UNREVIEWED`. 좌표·CAD geometry·실제 이동 경로·안전 verdict를 만들지 않으며 사람 승인 전 compiler가 읽지 않음 |

#### B. Fact Normalizer

| 항목 | 계약 |
|---|---|
| 입력 | Script/Master Cue/Stage Spec Extractor가 만든 raw fact, source ref, 허용된 normalized fact schema/version |
| 출력 | source fact별 `NON_AUTHORITATIVE` `normalized_fact_type`·field value 추천과 recommendation reason |
| trigger | 역할별 extraction이 모두 성공한 뒤 review queue를 열기 전 |
| cache | `raw fact-set digest + normalized schema version + Agent ID + Config ID + input hash` |
| trust | strict semantic validation을 통과해도 자동 승인하지 않음. review state·source·verdict 변경 금지. type이 틀리면 사람이 임의 type으로 바꾸지 않고 추천을 거절 |

review UI는 gate 전체에서 한 번 선택하는 `추천값`과 `사용자화` mode를 명시적으로 구분한다. fact card마다
mode를 반복하지 않는다. 추천값 mode에서는 Normalizer의 type과 field를 읽기 전용으로 보여 준다. 사용자화
mode에서는 Agent가 고른 allowlist type을 고정하고 field 값만 편집한다. `일괄 승인`은 사람이 명시적으로
실행하며, 유효한 사용자화 draft 각각에 별도 review record를 남긴다. 자동 approve, 자동 snapshot freeze,
normalization type selector는 두지 않는다.

#### C. Storyboard Recomposer

| 항목 | 계약 |
|---|---|
| 입력 | frozen review snapshot에서 compile한 event graph, 시간순으로 인접한 두 stage snapshot, allowlist된 action·source fact ref |
| 출력 | 읽기 전용 `NON_AUTHORITATIVE` `beats`(`ENTER/EXIT/MOVE/HOLD/CROSSFADE`)·event 요약·`missing_evidence` |
| trigger | reviewed workspace에서 timeline event가 바뀔 때 비동기 실행. 동일 frozen input은 서버 cache 사용 |
| cache | `review_snapshot_id + cue_revision_id + from/to event ID + Agent ID + Config ID + input hash` |
| trust | event/entity/zone/fact ID를 서버 allowlist로 strict 검증. 좌표·곡선·새 event·duration을 추정하지 않음. `beats`·`missing_evidence`는 정적 snapshot이나 deterministic verdict를 만들거나 수정하지 않으며 실패·timeout은 정적 snapshot fallback |

JSON Editor 직행은 review snapshot이 없으므로 현재 Storyboard Agent를 호출하지 않는다. 대본 DOCX/PDF는
case-independent Script projection endpoint로 구조화하고, 정적 snapshot·인접 semantic motion을 제공한다.
reviewed workspace에서는 timeline 클릭마다 긴 job을 동기
대기하지 않으며, 늦게 도착한 이전 event 응답이 현재 선택을 덮지 못하게 selection/version을 검사한다.

#### D. Rehearsal Brief

| 항목 | 계약 |
|---|---|
| 입력 | reviewed event graph와 코드가 확정한 finding, calculation, missing fact, evidence fact ref |
| 출력 | 무대감독용 짧은 요약, event·department별 확인 질문, `unknowns` 목록 |
| trigger | 새 verifier result hash가 생긴 뒤 1회. 같은 결과에서 언어를 바꾸면 locale별 cache만 선택 |
| cache | `verifier result hash + locale + Agent ID + Config ID + input hash` |
| trust | 새 finding·severity·verdict·안전 결론을 만들지 않음. 기존 근거를 압축하는 읽기 전용 산출물이며 기본 접힘·핵심 3개 제한 |

네 Agent 모두 Agent ID·Config ID·provider job ID·input/output hash를 provenance에 남긴다. API key와 원문은
브라우저에 보내지 않으며, 모델 텍스트를 HTML로 실행하지 않는다.

### 3-2. Script Sidebar 경계

현재 공개 MVP 입력 화면에는 세 번째 SCRIPT 업로드 카드를 다시 만들지 않는다. 워크스페이스의 접이식
Script Sidebar에서 DOCX(우선) 또는 PDF(보조)를 연결한다. 서버는 Upstage Script Extractor 결과를
`standby.script-projection.v1`으로 strict 투영하고 실제 대사·지문만 보여 준다. MASTER_CUE 문구나
reviewed event label은 대본 fallback이 아니다.
timeline 선택은 같은 event 발췌를 스크롤·강조하고, 발췌 선택은 같은 event로 이동한다. 이 패널은 읽기
전용이고 localStorage에 원문을 남기지 않으며 Agent가 원문을 보충하거나 fact·snapshot·verdict authority를
만드는 경로가 아니다. raw fact의 exact `event_id`만 자동 연결하고, 나머지는 사람이 현재 event에 연결한다.

### 중요한 미확정 경계

공식 사례는 다문서 cross-validation을 확인하지만, `Split by file` 뒤 세 유형의 Extract 결과를 한 Instruct에서 참조하는 정확한 `@field` scope는 공개 노드 문서에 없다.

따라서 첫 smoke test에서 다음 둘 중 하나를 선택한다.

1. **통과**: Studio Instruct가 세 결과를 함께 읽음 → Studio에서 event-link 후보와 검토 설명까지 생성
2. **실패**: Agents API `include=all`로 유형별 Extract 결과를 받아 앱이 deterministic anchor matching을 수행 → Instruct는 설명만 담당

둘째도 Studio가 핵심 문서 처리 단계를 구동한다. 어느 경로에서도 Instruct가 물리 verdict를 정하지 않는다.

---

## 4. 노드별 build recipe

### 4-1. Parse

#### 입력 우선순위

1. 대본: 원본 PDF → 300 DPI 스캔 → 겹쳐 찍은 근접 tile
2. 큐시트: 원본 XLSX → PDF → 300 DPI 스캔 → 헤더를 포함한 근접 tile
3. 무대 사양: zone·route·시간이 텍스트나 표로 명시된 PDF → 이미지
4. 전체 큐시트나 무대도면 한 장 사진은 위치 안내용

현재 `script-final.txt`와 `reference-cuesheet.csv`는 Studio가 지원하지 않는다. 각각 PDF와 XLSX/PDF로 변환하고 `source-map.json`으로 원본 line/row와 변환 page를 연결한다. Studio의 지원 범위와 standalone API 한도는 다르므로 섞어 말하지 않는다.

#### 사진/스캔 권장 설정

| 설정 | 값 | 이유 |
|---|---|---|
| Mode | `Advanced` (API: `enhanced`) | 17열, 병합셀, 다단 헤더, 셀 내부 줄바꿈 |
| OCR | `Always` (API: `force`) | 사진·스캔 |
| Language | Korean | 한글 고정 문서 |
| Output | 대본 Markdown/text · 큐시트 HTML · 무대 사양 Markdown/HTML | reading order와 `rowspan`·`colspan`을 역할별로 보존 |
| Coordinates | On | provenance |
| DPI | 300 | PDF를 이미지로 변환할 때 작은 글자 보존. 사진 입력은 촬영 해상도와 crop으로 해결 |
| Merge multi-page tables | MVP에서는 Off | 한 페이지 crop으로 먼저 검증 |
| Nightly | Off | 해커톤 주 경로의 재현성 |

깨끗한 XLSX/PDF는 먼저 `Auto` 또는 `Basic/standard`로 비용과 속도를 줄이고, 실패 시 Advanced로 올린다.

#### 역할별 canonical source

세 문서에 같은 표현을 강제하지 않는다.

```text
Upstage raw response — 불변 저장
  ├─ script: text/Markdown reading order → ScriptFact
  ├─ cuesheet: table.content.html → logical 17-column grid → CueFact
  └─ stage_spec: text/table labels → StageFact
```

Markdown은 큐시트 병합셀을 온전히 표현하지 못하므로 큐시트의 canonical source만 HTML로 둔다. 파싱이 17열을 만들지 못하면 열을 추측해서 채우지 말고 `NEEDS_REVIEW`로 중단한다. 대본은 scene·대사·지시문 reading order, 무대 사양은 named zone·route·제약 label 보존을 별도로 검사한다.

#### Parse fail-closed 조건

- 큐시트 logical column count가 17이 아니거나 기대한 header path가 없음
- 대본의 hero scene marker·재입장 지시·costume phrase가 사라짐
- 무대 사양의 zone·route·minimum-change label이 사라짐
- critical token `N#12`, `??`, `on/off`가 사라짐
- unknown OCR 문자 `�`가 있음
- `usage.pages`가 입력 페이지 수와 다름
- finding에 연결할 page/element provenance가 없음

공식 standalone Parse 한도는 50MB, 동기 100페이지, 비동기 1,000페이지다. Studio는 파일당 500MB·1,000페이지지만 Extract Enhanced는 50페이지다.

- [Document Parse](https://console.upstage.ai/docs/capabilities/parse/document-parsing)
- [Parse 입력 요구사항](https://console.upstage.ai/docs/capabilities/parse/input-requirements)
- [Studio 한도](https://console.upstage.ai/docs/studio/troubleshooting#limits)

### 4-2. Classify

MVP label은 네 개만 둔다.

| label | description |
|---|---|
| `script` | 대사·가사·지시문·scene·등퇴장·의상·소품 요구가 담긴 대본 |
| `cuesheet` | 조명·음향·세션·소품·의상·무대기계 실행 cue가 담긴 표 |
| `stage_spec` | 무대 zone·출입구·crossover·환복 위치·route·제약이 담긴 문서 |
| `other` | 위 세 유형에 해당하지 않는 문서 |

설정:

- Combined case에 세 파일을 올림
- `Split by file`
- 항상 `other` escape hatch를 둠
- 분류 결과를 사용자가 고칠 수 있게 함

고정된 `대본`·`큐시트`·`무대 사양` 업로드 슬롯이 역할을 이미 확정한다면 Classify는 생략할 수 있다. 이 경우 한 Agent가 역할을 알아서 추정한다고 가정하지 말고, 역할별 Extract config/job을 분리한다. 노드 수를 늘리려고 Classify를 쓰지 않는다.

- [Document Classification](https://console.upstage.ai/docs/capabilities/classify/document-classification)

### 4-3. Extract

초안은 Auto-Generate Schema로 만들 수 있지만, 데모 config는 직접 description을 다듬어 고정한다. 문서 역할별로 flat schema를 나눈다.

| schema | 최소 raw field |
|---|---|
| `ScriptFact` | locator copy, fact kind, document/section raw, speaker/dialogue, stage direction, subject, movement, location, prop, costume, declared/cumulative timing, comment/unresolved, source quote |
| `CueFact` | cell locator copy, record kind, cue ID, trigger, target, operation, state, location, prop, costume, responsible party, explicit time text/qualifier, unresolved, note, source quote |
| `StageFact` | fact_type, subject, zone, from_zone, to_zone, direction, value, unit, semantics, route_status, topology_complete, source_quote_raw |

[upstage/cue-facts.schema.json](upstage/cue-facts.schema.json)과 [upstage/script-facts.schema.json](upstage/script-facts.schema.json)은 standalone Information Extract의 `response_format`용 역할별 schema다. 앱 내부 교환 계약은 [upstage/exchange-envelope.schema.json](upstage/exchange-envelope.schema.json)으로 분리한다. StageFact schema와 Studio가 export한 Extract-fields JSON, 실제 Upstage 응답 capture는 아직 없으므로 구현 완료로 표시하지 않는다. 자세한 source packet·locator·fixture 경계는 [JSON_CONTRACT.md](JSON_CONTRACT.md)를 따른다.

필수 extraction rules:

1. 각 역할별 호출은 자기 유형의 top-level array 하나만 반환한다: `script → script_facts[]`, `cuesheet → cue_facts[]`, `stage_spec → stage_fact_rows[]`. 한 Extract schema에 세 유형 array를 동시에 넣거나 다른 역할의 빈 array를 만들지 않는다. adapter가 file ID와 document role을 보존한 채 결과를 병합한다.
2. 큐시트 한 셀의 서로 다른 실행 statement는 각각 한 `cue_facts` item으로 분리한다. 반면 하나의 연속 대본 지시문 안의 movement·costume·prop은 한 ScriptFact의 여러 raw field로 보존한다.
3. `??`, `TBD`, `미정`은 추측하지 않고 원문 그대로 남긴다.
4. 배우명과 배역명을 임의로 같은 사람으로 통합하지 않는다.
5. 명시되지 않은 cue ID·시간·무대 경로·소품 이동을 만들지 않는다.
6. `source_quote_raw`는 해당 사실을 포함한 원문을 그대로 복사한다.
7. 없는 값은 빈 문자열로 두고 다른 문서나 열에서 추측하지 않는다.
8. 반복 table 안에 또 다른 array를 만들지 않는다. 대상 목록도 MVP에서는 원문 문자열로 둔다.
9. `sequence_index`, normalized time, stage geometry, origin, review state는 모델이 만들지 않는다. 앱이 원문 순서·사용자 확인·source metadata로 부여한다.
10. 대본은 동일 파일 안의 반복 revision block을 사람이 먼저 선택한다. 모델이 authoritative segment를 고르거나 서로 다른 block을 병합하지 않는다.
11. locator는 source adapter가 입력에 심고 모델은 token을 복사만 한다. decoder는 반환 locator가 해당 chunk manifest에 실제 존재하는지 검증한다.

왜 flat schema인가:

- Information Extract는 array of object는 지원한다.
- 그러나 array 안에 또 array가 들어가는 중첩 반복 구조는 지원하지 않는다.
- sync API는 최대 100 properties·15,000 characters, async는 5,000 properties·120,000 characters다.
- schema가 field 존재를 강제한다고 가정하지 않는다. decoder는 missing, `null`, 빈 문자열을 공통 empty value로 정규화한다.

- [Information Extract](https://console.upstage.ai/docs/capabilities/extract/universal-extraction)
- [Schema 작성 제한](https://console.upstage.ai/docs/capabilities/extract/writing-a-schema)

#### provenance 계약 — 🧪 Studio hard gate

standalone Information Extract의 `location=true`, `location_granularity=all`은 공식 기능이다. 그러나 Studio Extract에서 이 설정이 가능한지, 배열 item의 좌표와 파일별 source ID가 Agents API `additional_values`까지 유지되는지는 공개 문서로 확정되지 않았다.

첫 Studio smoke test에서 raw profile을 확인하고 전용 decoder를 만든 뒤에만 `content[].additional_values`를 `json.loads()`해 field path에 붙인다. profile 확인 전 계약은 다음처럼 닫는다.

```json
{
  "additional_values_contract_status": "NOT_OBSERVED",
  "additional_values_decoder_version": null,
  "location_quality": "NATIVE_ONLY",
  "field_mapping_status": "MISSING",
  "field_evidence": []
}
```

원본 `additional_values`는 stringified JSON 상태와 파싱 결과를 모두 보존한다. 실제 raw 안에서 array item·field와 `coordinates` / `word_coordinates` / confidence의 대응을 증명한 profile decoder가 생겨야 `LIVE_OBSERVED`로 전환한다. 그 전에는 provider page·box·confidence를 만들지 않고 앱이 검증한 native cell/line locator만 사용한다.

### 4-4. Instruct

첫 Instruct는 `Generate and decide`를 사용한다.

결정값:

- `LINK_CANDIDATE`
- `NEEDS_REVIEW`
- `INSUFFICIENT_EVIDENCE`

권장 prompt:

```text
당신은 공연 문서 검토 보조자다.

대본, 큐시트, 무대 사양에서 추출된 raw fact만 사용해 같은 공연 사건일 가능성을 설명하라.

규칙:
1. 서로 다른 fact가 같은 사건인지 최종 확정하지 않는다.
2. 문서에 없는 배우명, 동작, 시간, route, 소품 이동, 위험을 추측하지 않는다.
3. scene·dialogue·cue anchor가 불분명하면 INSUFFICIENT_EVIDENCE를 선택한다.
4. 명시적 anchor가 연결되지만 raw 값이 다르면 NEEDS_REVIEW를 선택한다.
5. 연결 근거가 충분한 후보는 LINK_CANDIDATE를 선택한다.
6. 설명에는 각 문서의 raw anchor, 서로 다른 값, 담당자가 답할 중립적 질문만 포함한다.

출력 예:
대본의 '우주비행사 유니폼을 갖춰 입은 채 입장'과 큐시트의
'우주복을 손에 들고 입장한 뒤 무대 위에서 착용'은 같은 재입장 사건 후보입니다.
두 지시 중 이번 revision의 실행 상태는 무엇입니까?
```

Instruct의 텍스트를 JSON이라고 가정해 파싱하지 않는다. 공식 문서는 고정 decision value와 텍스트를 설명하지만 JSON Schema 강제를 약속하지 않는다.

Instruct는 `available < required`, route capacity, prop state transition을 계산하지 않는다. event link는 사람이 승인하고, 물리 판정은 동일 입력에 항상 동일 결과를 내는 STANDBY verifier가 수행한다.

두 번째 Instruct가 필요하면 `Generate only`로 “담당자에게 보낼 한 문장 확인 요청”만 만든다.

### 4-5. Table View, Ground truth, Quick Tune

해커톤에서:

- hero gold fact 15개(`ScriptFact` 3, `CueFact` 5, `StageFact` 7)의 Extract 결과를 원문과 비교
- 틀린 값을 Table View에서 고침
- `Mark as reviewed`로 ground truth 확정
- 역할별 config를 바꾼 뒤 같은 reviewed set에 재실행해 raw fact accuracy를 비교

장기 운영에서:

- Quick Tune이 반복 수정 패턴을 보고 field description 개선안을 제안
- 사람이 확인 후 새 config version 생성
- 모델 재학습이 아니라 prompt/schema description 개선임을 정확히 설명

---

## 5. 데이터 계약

### Source document

```json
{
  "document_id": "script-hero-v1",
  "document_role": "script",
  "filename": "script-hero.pdf",
  "sha256": "...",
  "origin": "REAL_REFERENCE",
  "returned_model": "document-parse-260630",
  "agent_id": "agt_...",
  "config_id": "1",
  "extraction_review_status": "UNREVIEWED"
}
```

`document_role`은 `script | cuesheet | stage_spec` 중 하나다. 모델 alias만 저장하지 말고 실제 응답의 returned model도 저장한다. `REAL_REFERENCE`, `USER_PROVIDED`, `CONTROLLED_FIXTURE`, `MUTATED_FIXTURE` origin은 fact와 finding, 2D 화면까지 전파한다.

### 유형별 raw fact

```json
{
  "fact_id": "script-fact-07",
  "fact_type": "ScriptFact",
  "document_id": "script-hero-v1",
  "section_marker_raw": "S16",
  "event_type_raw": "entrance",
  "character_raw": "성인 마루",
  "stage_direction_raw": "우주비행사 유니폼을 갖춰 입은 채 등장한다",
  "location_raw": "",
  "costume_state_raw": "우주비행사 유니폼 착용",
  "source_quote_raw": "우주비행사 유니폼을 갖춰 입은 채 등장한다",
  "source_refs": []
}
```

`CueFact`는 cue ID·department·trigger·target·operation·location·prop·costume와 문서에 명시된 time text raw 값을, `StageFact`는 zone·route·restriction·time·capacity·topology raw 값을 가진다. 공개 CueSheet JSON에는 장면 길이·환복 소요 시간을 추정하는 `estimated_duration_sec`·`costume_change_duration_sec`를 두지 않는다. `raw` 필드를 먼저 보존하고 normalized 값은 파생 데이터로 별도 생성한다. 원문을 덮어쓰지 않는다.

다음은 Extract가 아니라 앱과 사람의 책임이다.

- Parse reading order 기반 `sequence_index`
- actor↔character와 raw label↔stage zone mapping
- 명시된 시간 text의 reviewed min/max semantics. 문서에 없는 duration은 계산하지 않음
- 2D `layout_geometry`
- `origin`과 `review_status`
- event link와 verdict

### Event linking

세 문서의 fact를 같은 사건으로 연결하는 우선순위:

1. 명시적 cue ID 또는 문서가 공유하는 stable ID exact
2. 검토된 scene mapping + dialogue/stage-direction anchor exact
3. 같은 section의 검토된 전후 anchor와 reading order → `PROPOSED`
4. 나머지는 사람이 연결

정규화 허용 범위:

- Unicode NFKC
- 공백과 단순 문장부호
- `N 12`, `N#12`, `N-12` → `N#12`
- 영문 대소문자

배우명/배역명, stage side 이름, 동의어, 의미상 유사 trigger는 자동 통합하지 않는다.

매칭 상태:

- `EXACT`
- `NORMALIZED_EXACT`
- `PROPOSED`
- `UNMATCHED`

결정론적 verifier는 `EXACT`, `NORMALIZED_EXACT`, 사람이 승인한 link만 사용한다. AI가 제안한 link는 승인 전 verdict에 사용하지 않는다.

### Finding rules

| rule | 의미 |
|---|---|
| `UNRESOLVED_TOKEN` | `??`, `TBD`, `미정` 보존 |
| `BLOCKING_CONFLICT` | reviewed 점유 구간이 stage capacity·exclusive 제약과 충돌 |
| `QUICK_CHANGE_TIGHT` | available과 required 시간 범위가 겹쳐 사람 확인이 필요 |
| `QUICK_CHANGE_ROUTE_CONFLICT` | available 최대가 required 최소보다 작음 |
| `POSSIBLE_PROP_GAP` | 다음 사용 시점에 필요한 zone/actor로 이어지는 reviewed carry·handoff·move가 없음 |
| `COSTUME_STATE_CONFLICT` | 같은 재입장 사건의 명시적 costume state가 문서마다 다름 |
| `AMBIGUOUS_LINK` | 사람이 사건 연결을 결정해야 함 |
| `INSUFFICIENT_EVIDENCE` | 판정에 필요한 time·route·state·link가 없음 |

Finding은 위험 감상문이 아니라 **검토된 fact로 재현 가능한 계산 결과**다. `POSSIBLE_PROP_GAP`은 추출 completeness와 해당 구간의 사건이 검토된 뒤에만 만든다. 그 전에는 `INSUFFICIENT_EVIDENCE`다.

```json
{
  "finding_id": "finding-quick-change-01",
  "rule": "QUICK_CHANGE_ROUTE_CONFLICT",
  "verdict": "VIOLATION",
  "severity": "ERROR",
  "origin": "CONTROLLED_FIXTURE",
  "calculation": "available 58–62s / required 66–68s",
  "time_range": { "start_ms": 3120000, "end_ms": 3180000 },
  "entities": ["actor-hyewon"],
  "source_refs": [
    { "role": "script", "locator": "page 1: re-entry" },
    { "role": "cuesheet", "locator": "page 1: exit/change window" },
    { "role": "stage_spec", "locator": "page 1: route/change constraints" }
  ],
  "lifecycle": "OPEN"
}
```

판정 축은 섞지 않는다.

- `verdict`: `VIOLATION | REVIEW | INSUFFICIENT | NO_CONFLICT_WITHIN_DECLARED_CONSTRAINTS`
- `severity`: `ERROR | WARNING | INFO`
- `review_status`: `UNREVIEWED | REVIEWED | REJECTED`
- `lifecycle`: `OPEN | DECISION_RECORDED | SOURCE_SYNCED | CONSISTENT`

Case 상태:

- `UPLOADED`
- `STUDIO_RUNNING`
- `EXTRACTION_UNREVIEWED`
- `EXTRACTION_REVIEWED`
- `LINKING`
- `NEEDS_REVIEW`
- `NEEDS_SOURCE_UPDATE`
- `SOURCE_SYNCED`
- `CONSISTENT`
- `FAILED`

사람이 해결 방향을 고르는 것은 `DECISION_RECORDED`일 뿐 원본 문서를 바꾸지 않는다. 수정된 대본·큐시트·무대 사양을 새 revision으로 다시 올린 뒤에만 `SOURCE_SYNCED`, 재검사에서 차이가 없어야 `CONSISTENT`로 전이한다.

마스터↔부서 사본의 cue ID exact diff는 이 핵심 계약 위에 붙는 `revision consistency` 확장이다. 제품 본체의 event linking과 물리 verifier를 대체하지 않는다.

---

## 6. Agents API 운영 계약

공식 흐름:

1. `/v2/files`에 파일을 올려 `file_id` 획득
2. 역할별 `/v2/responses` 요청에 `model=agent_id`, 해당 역할의 `input_file` 하나를 전달
3. job ID를 저장하고 polling
4. `/v2/responses/{job_id}`를 `include=all`로 조회
5. 각 step의 `content[].text`와 `content[].additional_values` 해석
6. 결과를 원본 file ID와 `script / cuesheet / stage_spec` 역할에 다시 연결
7. 유형별 fact decoder를 거쳐 사람 review 후 verifier 실행

추가 네 Agent의 구현된 서버 흐름 (**실제 live smoke 대기**):

1. `Stage Spec Extractor`는 source extraction operation 안에서 별도 역할 job으로 실행하고 `stage_facts`를
   기존 review queue에 `UNREVIEWED`로 넣는다.
2. 역할별 raw fact가 모이면 `Fact Normalizer`가 allowlist schema의 normalized type/value를 추천한다.
   추천은 읽기 전용이며 사람의 review 전에는 authority가 없다.
3. snapshot freeze 뒤 reviewed graph와 finding을 원문과 분리된 최소 입력 문서로 만든다.
4. 같은 입력 file ID를 `Storyboard Recomposer`와 `Rehearsal Brief` job이 읽되 결과 artifact와 cache key는
   Agent별로 분리한다.
5. Storyboard는 timeline 선택 시 lazy 실행한다. target snapshot은 job 완료를 기다리지 않고 즉시 보여 주며,
   같은 frozen input은 서버 cache를 사용한다.
6. Normalizer와 두 후처리 결과는 strict decoder와 allowlist를 통과해도 `NON_AUTHORITATIVE`이며 verifier 입력으로 역류하지 않는다.

- [Agents API](https://console.upstage.ai/docs/agents)
- [Jobs API](https://console.upstage.ai/docs/agents/jobs)

주의:

- 기본 `include`는 `last`다. provenance와 중간 결과가 필요하므로 `all`을 쓴다.
- `additional_values`는 stringified JSON이다.
- Jobs는 비동기이므로 UI 상태와 timeout을 둔다.
- Webhook이 공개 지원되기 전에는 polling을 쓴다.
- 실패 job은 과금되지 않지만 무한 retry하지 않는다.
- document-processing cache key는 세 파일 SHA-256 + Agent ID + 실제 request body hash 조합으로 둔다.
- verifier cache에는 reviewed fact set, event-link version, stage topology/constraint version도 포함한다.
- Fact Normalizer cache에는 raw fact-set digest·normalized schema version·Agent/Config·input hash를 넣는다.
- Storyboard cache에는 review snapshot·revision·from/to event·Agent/Config·input hash를, Rehearsal Brief
  cache에는 verifier result hash·locale·Agent/Config·input hash를 넣는다.
- Agent job timeout이나 cache miss가 timeline 선택, stage snapshot, deterministic verifier를 막으면 안 된다.
- Split 뒤 file identity나 role이 보존되지 않으면 결과를 섞지 않는다. 역할별 Agent/config와 별도 job으로 fallback한다.

### Timeout budget과 latency 계측

현재 extraction 경로의 기본값은 브라우저 operation poll **1초 / 660초**, 서버 Upstage job poll
**2초 / 600초**다. 서버의 각 Upstage HTTP 요청도 같은 600초 `AbortSignal`을 쓰므로, file upload·job submit·
개별 poll 요청이 지연되면 job 전체 deadline과 별개로 벽시계 시간이 늘어날 수 있다. review queue 조회는 job이
끝난 뒤 시작한다. 따라서 `전체가 오래 걸렸다` 한 값만 남기지 말고 아래 span을 분리한다.

대기 UI는 JetBrains Mono의 `S T A N D B Y`를 `S`부터 `Y`까지 순서대로 밝히되, 이를 실제 진행률로
표현하지 않는다. 상태·실패·timeout 문구는 계속 별도로 표시하며 `prefers-reduced-motion`에서는 순차 효과를
멈추고 고정 wordmark를 보여 준다. 본문과 조작 UI는 시스템 서체를 사용한다.

| span | 시작 → 종료 | 필수 tag |
|---|---|---|
| `client.hash_validate` | 파일 선택 → signature·size·SHA-256 완료 | role, bytes, extension, outcome |
| `client.case_upload` | case 생성 시작 → 모든 source upload 완료 | case ID, source count, duration, outcome |
| `server.upstage_file_upload` | `/v2/files` 요청 → file ID 수신 | role, source hash prefix, Agent ID, duration, outcome |
| `server.upstage_job_submit` | `/v2/responses` 요청 → job ID 수신 | role, Agent/Config ID, input hash prefix, duration, outcome |
| `server.upstage_job_poll` | 첫 GET → terminal/timeout | role, job ID, poll count, queued/in-progress durations, outcome |
| `server.strict_decode` | terminal payload 수신 → decoder 종료 | role, schema version, output hash prefix, duration, outcome |
| `client.review_ready` | extraction operation 시작 → review queue 표시 | operation ID, fact count, total duration, outcome |
| `agent.production` | Normalizer/Storyboard/Brief 시작 → artifact/cache/fallback | role, input/config fingerprint, cache hit, duration, stale-drop, outcome |

`outcome`은 최소 `SUCCEEDED | FAILED | TIMEOUT | DECODE_REJECTED | CACHE_HIT | FALLBACK`으로 고정한다.
Storyboard는 `timeline_select_to_snapshot_ms`와 `timeline_select_to_storyboard_ms`를 별도로 측정한다. 첫 값은
Agent timeout과 무관하게 즉시 끝나야 한다. selection/version이 바뀐 뒤 도착한 응답은 `stale_drop=true`로
기록하고 화면에 적용하지 않는다.

로그에는 원문 bytes, source quote, API key, 전체 hash, Agent 응답 본문을 넣지 않는다. request/operation/job/
artifact ID와 hash prefix만 구조화해 남기고, 에러 메시지는 allowlist된 code로 정규화한다. p50/p95와
timeout 비율은 role·span별로 보고, `UPSTAGE_JOB_TIMEOUT`을 file upload 지연·submit 지연·poll deadline·decode
실패와 구분할 수 있어야 한다.

### Config 변경 추적

2026-08-22 Studio Code 패널에서 Script Config #1과 Master Cue Config #1의 실제 요청 body를
확인했다. 2026-08-23에는 실제 46행 큐시트에서 exact locator·source quote를 보존하도록 Master Cue
Config #3을 저장하고 Table View에서 결과를 확인했다. 운영 요청은 Script `config_id: "1"`, Master
Cue `config_id: "3"`을 사용한다. M1 adapter는 역할별 Config ID가 설정된 경우에만 이를 전송하고
provenance에 기록하며, 값이 없으면 필드를 생략하고 `null`로 남긴다. Draft를 저장하지 않은 상태나
임의 추정값은 절대 전송하지 않는다.

현재 저장 스키마와 실제 확인 범위:

- Script Config #1: Parse → Extract(Standard), `script_facts` 14개 raw 필드
- Master Cue Config #3: Parse → Extract(Standard), `cue_facts`와 15개 item 필드. `locator`와
  `source_quote_raw` 필수 보존
- Stage Spec Extractor: `agt_PxbxmhXXT8iqdzs5WmHfUz`, Config `#1` **저장 · 서버 배선 구현 · live smoke 대기**
- Fact Normalizer: `agt_6tn639gGApNdV9SdRfAjnE`, Config `#1` **저장 · 서버 배선 구현 · live smoke 대기**
- Storyboard Recomposer: `agt_go8aoJTVDvEwK8mwXh5gEi`, Config `#1` **저장 · 서버 배선 구현 · live smoke 대기**
- Rehearsal Brief: `agt_9iLkb7fqwdEtaBv48t9tQA`, Config `#1` **저장 · 서버 배선 구현 · live smoke 대기**

실제 Agent/Config ID와 smoke fixture의 raw response hash를 함께 보관해 Config 변경을 감시한다.

2026-08-23 실제 큐시트 확인: Master Cue Config #3의 `job_6N9aeVdJ2rvT7DZD4ndcTZ`가 46개
`cue_row`를 만들었고 46개 서로 다른 `t_0_r_*` locator와 원문 인용을 Table View에 표시했다. 이
확인은 extraction contract와 evidence field의 존재를 검증한 것이며, 각 raw field의 의미 정확도나
verdict 정확도를 증명하지 않는다. 기존 Config #1 합성 smoke는 아래의 역사적 근거로만 유지한다.

### 2026-08-22 합성 live smoke

비공개 원본을 전송하지 않고, 직접 만든 합성 Script PDF와 Master Cue PDF/XLSX로 다음 경로를 실행했다.

```text
Files API → 역할별 Agent Config #1 → job polling → strict decoder → UNREVIEWED facts
```

| 입력 조합 | 결과 | Script | Master Cue | Stage Spec | review gate |
|---|---|---:|---:|---:|---|
| Script PDF + Master Cue PDF + Stage Spec JSON | 통과 | 12 | 5 | 3 | 전부 `UNREVIEWED` |
| Script PDF + Master Cue XLSX + Stage Spec JSON | 통과 | 12 | 5 | 3 | 전부 `UNREVIEWED` |

- PDF run: Script `job_YPFgaia4HoyvzmjW7W5Rtk`, Master Cue `job_bH8PBxZYd8mW9fzCYgbCco`
- XLSX run: Script `job_5h692JBNzFCceiFzgbwDtj`, Master Cue `job_Sa8VH787dXnmCPvbpDh3xD`
- decoder가 관측한 key는 Script 14개, Master Cue 16개로 저장 Config schema와 일치했다.
- 위 표의 Stage Spec 3개는 현재 `STANDBY_FORM` deterministic extractor 결과다. **Stage Spec Extractor
  Agent의 live smoke가 아니며**, Fact Normalizer·Storyboard Recomposer·Rehearsal Brief도 이 smoke 범위에 없다.
- 이 결과는 **API 연결·파일 형식·schema·review gate**를 검증한다. 실제 대본/큐시트에 대한 recall,
  locator 품질, 표 병합·줄바꿈 보존율이나 제품 정확도를 증명하지는 않는다.
- 공개 가능한 sanitized evidence는 `qa/upstage-live-smoke-2026-08-22.json`에 보관한다.

- [Create Job](https://console.upstage.ai/api/agents/jobs/create-job)
- [Studio 버전·배포](https://console.upstage.ai/docs/studio/deployment)

### 공유·export

- Agent config, Classify setup, Extract fields는 Studio에서 export한 JSON을 원본으로 보관
- 여러 Agent export는 ZIP 가능
- 공개 문서가 내부 import JSON 형식을 보장하지 않으므로 손으로 “Studio import JSON”을 만들어내지 않음
- 의미 있는 config에는 이름을 붙이고 데모 config를 동결

- [Studio 공유·Import/Export](https://console.upstage.ai/docs/studio/sharing)

---

## 7. 가격·한도·보안

### 2026-08-22 공개 Studio 가격

| node | Standard | Enhanced |
|---|---:|---:|
| Parse | $0.01/page | $0.03/page |
| Extract | $0.03/page | $0.05/page |
| Classify | 무료 Beta | 변경 가능 |
| Instruct | 무료 Beta | 변경 가능 |

- Standard Parse+Extract: **$0.04/page**
- Enhanced Parse+Extract: 공개 항목 합계 **$0.08/page**
- 여러 단계여도 Parse는 한 번만 과금
- Agent마다 카드 없이 10회 무료 document run
- VAT 10% 별도

가격은 바뀔 수 있으므로 발표 직전 다시 확인한다.

- [Upstage API·Studio 가격](https://www.upstage.ai/pricing/api)

### 보관과 개인정보

Studio 업로드 파일은 사용자가 삭제할 때까지 보관된다. 해커톤 fixture는 배우 연락처·주민번호·계약 금액 등 실제 개인정보를 제거한다. API key는 브라우저에 넣지 않고 서버 환경변수에서만 사용한다.

### Solar Pro 4를 직접 쓸 때

Solar Pro 4는 OpenAI-compatible Chat Completions, structured outputs, reasoning, tool calling을 지원한다. 현재 공개 가격은 input $0.30/M tokens, cached input $0.06/M, output $1.20/M이다.

STANDBY에서 직접 호출할 정당한 경우:

- 명시적 cue ID가 없고 trigger 문구만 조금 다를 때 **후보만** 제안
- 결정론적 finding을 중립적 확인 질문으로 변환
- 여러 finding을 무대감독용 brief로 요약

정당하지 않은 경우:

- exact 문자열 비교
- on/off 상태머신
- JSON schema로 이미 추출 가능한 필드 재추출
- “사고가 난다” 같은 근거 없는 예측

- [Solar Pro 4](https://www.upstage.ai/blog/en/solar-pro-4)
- [Structured outputs](https://console.upstage.ai/docs/capabilities/generate/structured-outputs)
- [Reasoning](https://console.upstage.ai/docs/capabilities/generate/reasoning)
- [Tool calling](https://console.upstage.ai/docs/capabilities/generate/tool-calling)

---

## 8. 존망을 가르는 smoke tests

### Must-ship fixture

- `script-hero.pdf` + `cuesheet-hero.pdf|xlsx` + `stage-spec-demo.pdf` + `source-map.json`
- 같은 한 장면과 전후 전환의 reviewed event 8개
- 배우 2명 또는 배우 1명+crew 1명, 환복 1회, 소품 1개, named zone 3개
- 사람이 원문과 대조한 gold fact 15개
- 서로 독립된 controlled/mutated fixture와 clean control
  - blocking: capacity 1인 route의 점유 시간이 겹침 → `BLOCKING_CONFLICT`
  - quick-change: available `58–62초`, required `66–68초` → `QUICK_CHANGE_ROUTE_CONFLICT`
  - prop: 다음 사용 zone까지 이어지는 carry·handoff·move 없음 → `POSSIBLE_PROP_GAP`
  - missing minimum-change 또는 route fact → `INSUFFICIENT_EVIDENCE`
  - tight margin: available `62–70초`, required `66–68초` → `REVIEW / QUICK_CHANGE_TIGHT`
  - clean: minimum change `45초`, crew 이동은 배우보다 먼저 종료, prop handoff 완료 → 세 core finding 0건

실제 대본·큐시트와 fixture를 섞더라도 각 fact의 origin을 유지한다. 주입한 blocking·prop gap을 실제 공연에서 발견한 결함이라고 부르지 않는다. 기존 R2~R6 출력도 ground truth로 쓰지 않는다.

### Must-ship 합격선

- Classify `script / cuesheet / stage_spec` 3/3, 또는 오분류 수정 기록과 역할별 job fallback 존재
- 대본 hero anchor, 큐시트 17열·줄바꿈, 무대 zone·route label 보존
- gold fact 15개를 원문과 대조하고 event link·topology까지 `REVIEWED`
- Script/Cue/Stage Extract-fields export 3개와 config version을 보관하고 standalone schema와 혼용하지 않음
- 존재하지 않는 인물·시간·zone·route·prop 이동 생성 0건
- 승인되지 않은 event link를 물리 verdict에 사용한 사례 0건
- reviewed fixture 기준 세 finding 3/3, 각 clean control false positive 0
- tight fixture `REVIEW / QUICK_CHANGE_TIGHT` 1/1
- missing-evidence fixture `INSUFFICIENT_EVIDENCE` 1/1
- 실제 costume-state·section-number 차이를 각각 `REVIEW` 1건으로 보존하고 authority 승인 전 hard verdict 0건
- script 재입장, cue 퇴장/window, stage route/minimum-change 중 하나를 제거할 때마다 quick-change verdict가 `INSUFFICIENT_EVIDENCE`로 내려감
- 같은 reviewed input 3회에서 verdict와 calculation trace 3/3 동일
- 세 finding 각각 대본·큐시트·무대 사양에서 계산에 사용한 모든 `page + source_quote_raw` 근거 존재
- 2D simulator가 hero event를 step/play하고 finding의 정확한 시점·zone·entity 상태를 재현
- `CONTROLLED_FIXTURE`·`MUTATED_FIXTURE` badge가 결과 JSON·2D·source drawer에 유지
- 사람의 선택은 `DECISION_RECORDED`; 수정 문서 재업로드 전 `CONSISTENT` 금지

### Stretch 검증

1. 원본 XLSX, 깨끗한 PDF, 300 DPI 스캔, 스마트폰 사진, 빨간펜판 5종
2. 전체 공연 timeline과 더 많은 배우·소품·cue
3. `other` 문서 2개를 포함한 Classify 6/6
4. 같은 입력 3회 반복의 Parse 구조와 deterministic finding 안정성
5. 🧪 Studio Jobs의 배열 item `location=all`과 파일별 source ID 보존
6. 세 source의 word-level highlight 5/5
7. 빨간펜은 먼저 수정 셀 후보 5/5; 필기 의미 추출은 별도 실험

이 숫자는 작은 fixture의 데모 통과 기준이지 제품 성능 주장으로 쓰지 않는다. raw model extraction accuracy와 사람이 reviewed한 뒤의 diff accuracy를 한 숫자로 섞지 않는다.

### 즉시 중단 또는 축소 조건

- 17열/critical token이 반복해서 무너짐 → 큐시트 사진 hero를 버리고 XLSX/PDF로 데모
- Split 후 Instruct가 세 문서를 함께 못 봄 → `include=all` 결과를 앱에서 deterministic linking
- Studio Jobs location이 없거나 좌표가 맞지 않음 → 꾸며낸 box 대신 page + source quote + table element만 표시
- 핵심 fact·event link·topology가 reviewed되지 않음 → 물리 verdict 대신 `INSUFFICIENT_EVIDENCE`
- stable anchor가 거의 없음 → 자동 연결 대신 proposed-link 검토 UX로 축소
- 실제 계정에 Validate/Webhook이 없음 → 공개 4-node + polling 경로 유지

---

## 9. 비개발자 중심 팀의 48시간 순서

### 0–3시간: 존망 테스트

- authoritative 대본 block을 확정하고 hero PDF 생성
- CSV hero 구간을 XLSX/PDF로 변환
- reviewed zone·route·capacity·minimum-change가 적힌 stage-spec fixture 생성
- `source-map.json`과 gold manifest 작성
- 세 파일을 한 case로 실행해 script anchor, cue 17열, stage label 확인
- 🧪 Studio Jobs location은 별도 hard gate; 실패해도 page+quote로 계속 진행

### 3–8시간: Studio Agent live smoke 고정

- Grace로 Agent 초안 생성
- Classify 4종 + Split by file
- Script: 재입장·costume state·prop requirement, Cue: 퇴장·window·환복·route occupancy·prop move/handoff, Stage: zone·route time·minimum-change·route capacity를 포함한 유형별 flat Extract config 고정
- 세 Studio Extract-fields export와 config version 보관
- Instruct decision 3종
- Stage Spec Extractor·Fact Normalizer·Storyboard Recomposer·Rehearsal Brief의 저장된 Config `#1`을 export하고
  최소 fixture의 raw response hash·strict decode·fallback 결과를 보관한다. 하나라도 live smoke 전이면 발표에서
  `Studio 설정·서버 배선 구현`까지만 말한다.

### 8–14시간: 정답과 review gate

- gold fact 15개 작성
- fact·event link·topology를 원문과 대조
- 실제 reference와 controlled/mutated fixture origin 고정

### 14–26시간: compiler와 verifier

- Studio `Copy code.md`를 coding Agent에게 전달
- Files/Jobs polling
- `include=all` decoder
- 8개 hero event compiler
- blocking·quick-change·prop deterministic rule
- clean control과 insufficient-evidence guard

### 26–38시간: 화면 두 개

1. 세 파일 업로드 + fact/link/topology review
2. finding 목록 + 2D event simulator + 세 source drawer
3. 별도 화면 없이 cached storyboard 전환과 기본 접힘 rehearsal brief를 같은 workspace에 배치

### 38–44시간: 측정

- reviewed fixture에서 3/3, clean FP 0, insufficient abstention 확인
- 실패 case를 먼저 고침
- config name과 returned model 기록
- 인접 storyboard cache hit, 비인접 jump 정적 교체, reduced-motion, Agent timeout fallback을 측정
- Brief가 원래 없던 finding·verdict·안전 결론을 만들지 않는지 strict fixture로 확인

### 44–48시간: 동결

- 성공 응답 cache
- API 장애 fallback
- schema와 Studio config 변경 금지
- 3분 데모 3회 이상 리허설

비개발자 팀원이 가장 잘 맡을 수 있는 핵심 일은 schema description, gold fact 작성, event-link·stage topology review, fixture 기대값 검수, 2D 재생의 실제 공연 의미 확인, 데모 문장이다. 다형식 5종·빨간펜 의미 OCR·Quick Tune은 must-ship이 아니라 stretch다.

---

## 10. 멘토에게 먼저 물을 10개

1. 행사 계정에는 공개판에 없는 Validate 실행 노드가 실제로 있는가?
2. 행사 tenant에서 Webhook callback이 활성화되어 있는가?
3. Combined case에서 Split된 여러 Extract 결과를 Instruct가 모두 참조하는 문법은 무엇인가?
4. 배열 item의 `location=all`이 Studio Jobs API `additional_values`에 그대로 노출되는가?
5. 한 case의 파일별 source ID가 Extract location까지 유지되는가?
6. 선택한 Config ID를 Agents API request에 고정하는 정확한 field는 무엇인가?
7. Table View에서 reviewed된 결과를 별도 API로 가져오는 정확한 방법은 무엇인가?
8. 빨간펜 한글 수정·취소선·겹쳐쓰기의 권장 Parse 설정은 무엇인가?
9. `words=true`의 현재 응답 schema와 안정성 보장은 무엇인가?
10. `script / cuesheet / stage_spec` class마다 서로 다른 Extract field config를 두고 한 Agent 결과로 병합할 수 있는가?

답변은 구두로만 기억하지 말고, 실제 계정의 screenshot·export·API response fixture로 남긴다.

---

## 11. 심사위원에게 설명하는 Upstage 깊이

“Agent 수가 많다”가 깊이가 아니다. 아래 여덟 층이 실제 계약과 live evidence로 연결되어야 한다.

1. **다형식 구조 복원** — 대본·17열 큐시트·무대 사양의 서로 다른 구조 보존
2. **분류·분할** — 한 case의 script/cuesheet/stage_spec/other가 올바른 lane으로 감
3. **유형별 추출** — 각 문서가 ScriptFact/CueFact/StageFact contract가 됨. Stage Spec Agent 결과도 UNREVIEWED gate를 통과
4. **정규화 추천** — Fact Normalizer가 raw fact를 allowlist schema에 추천하되 사람 승인 전 authority가 없음
5. **reviewed event compile** — 사람이 승인한 anchor·link·topology만 실행 순서로 연결
6. **검증·시뮬레이션** — blocking·quick-change·prop 상태를 결정론적으로 검사하고 2D에서 재생
7. **Storyboard 재구성** — reviewed 인접 snapshot만 Agent가 의미 순서로 재구성하고 strict decoder·cache·정적 fallback으로 제한
8. **Rehearsal 전달·운영 루프** — 기존 finding과 missing evidence만 brief로 압축하고 source evidence·config·polling·fallback에 연결

30점 답변용 한 문장:

> **우리는 Upstage로 대본·큐시트·무대 사양을 각각 검증 가능한 공연 fact로 구조화하고 원문 근거를 보존했습니다. 사람이 승인한 fact만 결정론적 verifier와 2D stage simulator에 넣어 blocking·quick-change·prop 상태를 검사합니다.**

단, 이 문장은 smoke test와 실제 API 연결이 모두 끝난 뒤에만 과거형으로 말한다.

네 Agent의 live smoke까지 통과한 뒤에만 덧붙일 문장:

> **검증 뒤에는 Upstage가 인접 event의 storyboard와 기존 finding의 rehearsal brief를 재구성하지만, 두 산출물은 판정을 바꾸지 않는 읽기 전용 보조 결과입니다.**

현재 네 Agent의 Agent ID·Config는 저장됐지만 live response가 없으므로 이 문장은 아직 미래형으로 말한다.

---

## 12. “Upstage MASTER” 숙달 기준

문서를 읽은 상태가 아니라 아래를 직접 재현할 수 있을 때 숙달로 본다.

- [ ] 같은 파일을 Basic/Advanced와 OCR Auto/Always로 실행하고, 가장 먼저 깨진 node를 찾아 설정을 고칠 수 있다.
- [ ] Classify를 써야 할 case와 고정 입력 슬롯이라 생략해야 할 case를 설명할 수 있다.
- [ ] schema description 하나를 바꿔 before/after extraction accuracy를 ground truth로 비교할 수 있다.
- [ ] Parse `elements`, Extract `additional_values`, `location`, `confidence`를 서로 혼동하지 않고 설명할 수 있다.
- [ ] Studio Agent를 config version과 함께 export하고, `include=all` job 결과에서 중간 step을 읽을 수 있다.
- [ ] Instruct의 link 제안과 reviewed fact가 충돌할 때 reviewed evidence를 우선하고 `INSUFFICIENT_EVIDENCE`로 닫을 수 있다.
- [ ] 공개 기능, Beta, coming soon, 행사 전용 가능성을 구분해 심사위원에게 답할 수 있다.
- [ ] 한 run의 페이지 수와 node별 mode로 예상 비용을 계산할 수 있다.
- [ ] API 장애·좌표 누락·표 구조 실패 때 꾸며내지 않고 fallback으로 전환할 수 있다.
- [ ] 네 추가 Agent 각각의 input/output/trigger/cache key를 설명하고 Agent ID·Config·raw response hash를 재현할 수 있다.
- [ ] Fact Normalizer 추천이 자동 승인되지 않고, gate 전체의 추천값/사용자화 선택과 fact별 review record를 거쳐야 함을 재현할 수 있다.
- [ ] Storyboard 출력의 가짜 event/entity/zone을 strict decoder가 거절하고 timeline은 정적 snapshot으로 계속 동작함을 재현할 수 있다.
- [ ] Rehearsal Brief 전후 verifier result hash가 같고, 새 finding이나 안전 결론이 생기지 않았음을 확인할 수 있다.

가장 좋은 연습은 같은 3문서 hero case로 config 세 개를 만드는 것이다.

1. `baseline-basic`
2. `enhanced-flat-schema`
3. `enhanced-reviewed-v1`

각 config의 Parse 구조 정확도, 유형별 fact accuracy, latency, 비용, finding precision을 한 표에 기록하면 기능 암기가 아니라 운용 능력이 생긴다.

---

## 13. 공식 자료 바로가기

- [Upstage 공식 문서 index](https://console.upstage.ai/llms.txt)
- [Studio 개요](https://console.upstage.ai/docs/studio)
- [Studio nodes](https://console.upstage.ai/docs/studio/key-features)
- [Run, review, ground truth, Quick Tune](https://console.upstage.ai/docs/studio/feedback-loop)
- [Versions and deployment](https://console.upstage.ai/docs/studio/deployment)
- [Agents API](https://console.upstage.ai/docs/agents)
- [Jobs API](https://console.upstage.ai/docs/agents/jobs)
- [Document Parse](https://console.upstage.ai/docs/capabilities/parse/document-parsing)
- [Parse output](https://console.upstage.ai/docs/capabilities/parse/understanding-output)
- [Document Classify](https://console.upstage.ai/docs/capabilities/classify/document-classification)
- [Information Extract](https://console.upstage.ai/docs/capabilities/extract/universal-extraction)
- [Extract schema](https://console.upstage.ai/docs/capabilities/extract/writing-a-schema)
- [Extract location](https://console.upstage.ai/docs/capabilities/extract/location-coordinates)
- [Extract confidence](https://console.upstage.ai/docs/capabilities/extract/confidence)
- [Studio pricing](https://www.upstage.ai/pricing/api)
- [Official cross-document use case](https://www.upstage.ai/use-cases/corporate-loan-document-automation)
- [Official Document Parse skill](https://github.com/UpstageAI/upstage-extensions-hub/tree/main/skills/upstage-document-parse)
