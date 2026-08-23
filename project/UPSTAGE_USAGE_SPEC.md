# STANDBY — Upstage 활용 명세

> 목적: 심사위원·멘토·개발자가 **“Upstage가 어디서, 왜, 어떻게 쓰였는가?”**를 같은 말로 설명하기 위한 정본.
> 기준: 운영 코드와 `FEATURE_SPEC_CURRENT.md`의 현재 상태. Agent가 안전 판정을 한다고 과장하지 않는다.

## 1. 한 문장 답변

STANDBY는 Upstage Studio Agent를 **공연 문서의 비정형 내용을 근거가 붙은 구조화 후보로 바꾸고,
사람이 검토할 추천과 이벤트별 설명을 만드는 데** 사용한다. 실제 충돌 판정은 승인된 사실만 읽는
STANDBY의 결정론적 compiler/verifier가 수행한다.

```text
공연 문서
  → Upstage: 읽기·추출·구조화·추천
  → 사람: 승인·거절·수동 연결
  → STANDBY 코드: 상태 전이·충돌 계산·verdict
  → Upstage: 이미 계산된 결과를 storyboard/brief로 설명
```

## 2. 왜 Upstage Studio가 필요한가

공연 현장의 입력은 일반 데이터베이스가 아니다.

- 병합 셀과 여러 부서 열이 섞인 XLSX/PDF Master Cue
- 대사·지문·장면 표기가 섞인 DOCX/PDF 대본
- `막 30% 열리면`, `노래 끝날 무렵`, `중퇴`, `퀵체` 같은 도메인 문장
- 같은 의미를 부서마다 다르게 적은 표현

단순 표 파서는 셀을 읽을 수 있지만, 그 셀이 **트리거인지, 인물인지, 소품 이동인지, 환복인지**까지
안정적으로 분리하기 어렵다. Upstage는 이 문서 이해 구간을 담당하고, STANDBY는 그 결과를 무조건 믿지
않고 원문 locator·quote와 함께 `UNREVIEWED` 후보로 격리한다.

## 3. 실제 Agent 구성

| 역할 | Agent / Config | 입력 | 출력 | 제품에서 보이는 결과 |
|---|---|---|---|---|
| Script Extractor | `agt_7yeqpDe7zmwCGVWoMY377j` / `#1` | DOCX·PDF 대본 | 대사·지문·화자·장면 표기·locator | Script Sidebar와 event mapping 후보 |
| Master Cue Extractor | `agt_FkyNiySGY4WACFvMNV5DRQ` / `#3` | XLSX·PDF·JSON Master Cue | cue row의 부서·트리거·인물·동작·위치·소품·의상·원문 근거 | Fact Review 원문 카드 |
| Stage Spec Extractor | `agt_PxbxmhXXT8iqdzs5WmHfUz` / `#1` | 구조화된 stage spec | route·capacity·초기 배치 후보 | 무대/이동 관련 fact 후보 |
| Fact Normalizer | `agt_6tn639gGApNdV9SdRfAjnE` / `#1` | raw fact set + 허용 schema | allowlist type/value 추천 | 추천값/사용자화 검토 |
| Storyboard Recomposer | `agt_go8aoJTVDvEwK8mwXh5gEi` / `#1` | 승인된 event와 인접 snapshot | action beat·누락 근거 설명 | 타임라인 전환 설명 |
| Rehearsal Brief | `agt_9iLkb7fqwdEtaBv48t9tQA` / `#1` | deterministic finding/evidence | 부서별 확인 질문·요약 | 리허설 브리프 |

Agent ID는 서버 기본값이며 운영 환경변수로 교체할 수 있다. Config ID도 실제 요청에 포함되고 결과
provenance에 기록된다.

## 4. 사용자 흐름별 Upstage 개입 지점

### 4.1 Master Cue 입력

```text
XLSX/PDF/JSON 업로드
→ Upstage Files API
→ Master Cue Extractor
→ cue_facts strict decode
→ locator/source quote가 붙은 UNREVIEWED fact
→ Fact Review 화면 즉시 진입
```

Upstage가 하는 일:

- 복잡한 표를 cue 단위로 분리
- 부서, 트리거, 인물, operation, 위치, 소품, 의상 표현 추출
- 원문 위치(`t_0_r_*`)와 인용문 보존

Upstage가 하지 않는 일:

- `VIOLATION` 판정
- 실제 동선 좌표 생성
- 누락된 시간이나 위치 추측
- fact 자동 승인

### 4.2 Fact 추천 — 사용자 대기를 막지 않는 background 단계

Extractor가 끝나면 사용자는 즉시 raw fact와 원문 근거를 본다. Fact Normalizer는 background에서
allowlist schema에 맞는 추천을 준비한다.

```text
raw facts 표시 ───────────────→ 사용자는 근거 검토 시작
       └→ Fact Normalizer 실행 → 추천값이 준비되면 같은 화면에 합류
```

추천은 `NON_AUTHORITATIVE`다. 추천값 적용, 사용자 수정, 거절 중 하나를 사람이 선택해야만 review record가
생긴다. 이 구조는 Upstage의 처리 시간을 제품 전체의 빈 로딩 화면으로 전가하지 않는다.

### 4.3 Script Sidebar

```text
DOCX/PDF
→ Script Extractor
→ standby.script-projection.v1
→ exact event ID / 유일한 장면명 자동 연결
→ 나머지는 추천 event + 신뢰도 + 근거
→ 사람의 개별 적용 또는 추천 모두 적용
```

RAW JSON Editor에서도 standalone Script Projection을 호출할 수 있다. 이때 JSON cue 자체는 이미
canonical이므로 Upstage로 다시 보내지 않고, 연결한 대본만 Upstage가 구조화한다.

매핑 추천은 Upstage가 만든 대본 projection을 입력으로 받아 장면·화자·대사/트리거 토큰·공연 순서를
조합한다. 추천은 자동 확정되지 않으며 승인된 연결만 Sidebar·타임라인·CSV export에 반영된다.

### 4.4 Storyboard Recomposer

사용자가 타임라인 event를 선택하면 정본인 static snapshot을 먼저 즉시 표시한다. Agent는 인접 event의
승인된 action 의미 순서를 `NON_AUTHORITATIVE` beat로 보조한다.

- Agent 응답을 기다리느라 timeline 이동을 막지 않는다
- event/entity/zone allowlist 밖의 출력은 거절한다
- timeout·decode 실패 시 static snapshot으로 fallback한다
- Agent가 좌표나 새로운 blocking을 만들지 않는다

### 4.5 Rehearsal Brief

이미 verifier가 만든 finding과 evidence만 요약한다. 새 finding이나 안전 결론을 만들 수 없다.

- 입력: finding ID, verdict, 계산, 세 역할의 evidence
- 출력: 부서별 확인 질문, 확인되지 않은 값, rehearsal 순서 요약
- 금지: 새로운 event/finding 참조, verdict 변경, “안전하다”는 결론

## 5. Upstage와 결정론적 코드의 경계

| 질문 | 담당 |
|---|---|
| 이 셀은 대사 트리거인가? | Upstage 후보 생성 → 사람 승인 |
| 이 문단은 어느 event와 가까운가? | Upstage projection + 추천 매핑 → 사람 확정 |
| 환복에 필요한 시간이 가능한 시간보다 큰가? | STANDBY verifier |
| crossover가 없는데 반대편 재등장인가? | STANDBY state machine/verifier |
| 소품이 앞 event의 위치에서 다음 위치로 이어지는가? | STANDBY state machine/verifier |
| finding을 무대감독에게 어떻게 설명할까? | Upstage Rehearsal Brief |

핵심 표현:

> **Upstage는 공연 문서를 실행 가능한 fact 후보로 바꾸고, STANDBY는 사람이 승인한 fact만 계산한다.**

## 6. 신뢰성과 보안

- Upstage API key는 Railway 서버 환경변수에만 저장한다
- 브라우저 bundle·localStorage·API 응답에 key를 넣지 않는다
- 파일은 최대 50 MiB이며 확장자·MIME·signature를 검사한다
- 모든 Agent 출력은 strict decoder와 schema allowlist를 통과해야 한다
- locator·quote가 없는 추출 결과는 authority를 얻지 못한다
- Agent ID·Config ID·provider job ID·source/input/output hash를 provenance로 남긴다
- 다른 익명 브라우저 세션은 case/operation을 읽을 수 없다
- Agent 실패는 verdict를 임의 생성하지 않고 실패 또는 deterministic fallback으로 닫힌다

## 7. 실제 확인된 범위

확인된 것:

- Script PDF와 Master Cue PDF/XLSX의 Files API → Agent job → strict decode 경로
- 합성 smoke에서 Script 12개, Master Cue 5개 fact 추출
- 실제 46행 Master Cue Config #3에서 46개 cue row와 서로 다른 locator 보존
- Stage Spec Extractor·Fact Normalizer·Storyboard Recomposer 개별 live smoke
- 허용 목록 밖 Rehearsal Brief 응답의 fail-closed fallback

아직 과장하면 안 되는 것:

- 모든 한국어 공연 문서에서의 recall/정확도
- locator 품질의 정량 평가
- 네 Agent의 최신 전체 동시 재실행 성공
- Agent 출력이 실제 공연 안전을 보장한다는 주장

최신 전체 재실행은 Upstage `/v2` HTTP 403 이력 때문에 다시 확인이 필요하다. 따라서 발표에서는
**“배선 및 개별 smoke 확인”**과 **“모든 운영 조건에서 검증 완료”**를 구분한다.

## 8. 데모에서 보여줄 장면

1. Master Cue 업로드 후 Upstage가 원문 locator를 가진 fact를 생성
2. raw fact가 먼저 나타나고 Fact Normalizer 추천이 background에서 합류
3. 추천이 있어도 `UNREVIEWED`이며 사람이 승인해야 상태가 바뀜
4. Script Extractor가 실제 대사·지문을 Sidebar에 표시
5. 미연결 구간에 추천 event·신뢰도·근거가 나타나고 `추천 모두 적용`으로 연결
6. timeline event 선택 시 같은 대본·cue row·stage snapshot이 함께 이동
7. deterministic finding의 계산과 세 source evidence 확인
8. 승인된 Script mapping이 포함된 cue sheet CSV export

## 9. 30초 발표 답변

> 공연 문서는 표처럼 보여도 병합 셀, 지문, 대사 트리거와 부서별 표현이 섞여 있어서 일반 파서만으로는
> 의미 구조를 만들기 어렵습니다. 저희는 Upstage Studio의 Script와 Master Cue Agent로 문서를 원문
> locator가 붙은 fact 후보로 구조화하고, Fact Normalizer로 표준 schema 추천을 만듭니다. 사람의 승인 전에는
> 어떤 추천도 판정에 쓰지 않습니다. 승인된 값은 저희 결정론적 verifier가 시간·동선·소품 연속성을 계산하고,
> Storyboard와 Rehearsal Brief Agent는 그 결과를 타임라인과 현장 질문으로 설명합니다. 즉 Upstage는 문서
> 이해와 설명의 coverage를 맡고, 안전 관련 verdict는 검증 가능한 코드가 맡습니다.

## 10. 코드 추적표

| 책임 | 코드 |
|---|---|
| Agent ID·Config·server-only key | `server/src/index.ts` |
| Files/Responses API·polling·strict decode | `server/src/providers/upstage-agent-provider.ts` |
| raw fact·operation·artifact provenance | `server/src/store/in-memory-store.ts` |
| schema/allowlist 검증 | `server/src/domain/production-agents.ts` |
| Master Cue 추출 및 background Normalizer 시작 | `app/src/screens/InputScreen.tsx` |
| fact 승인 UI | `app/src/components/domain/FactReviewPanel.tsx` |
| Script projection·event 연결 | `app/src/lib/script-projection.ts` |
| Script Sidebar | `app/src/components/domain/ScriptSidebar.tsx` |
| deterministic compiler/verifier | `server/src/domain/compiler.ts`, `server/src/domain/verifier.ts` |
