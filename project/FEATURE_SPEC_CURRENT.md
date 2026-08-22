# STANDBY — 현재 구현 기능 명세 (As-Is)

| 항목 | 내용 |
|---|---|
| 문서 상태 | 공개 데모 런타임 코드 대조 + 2026-08-23 목표 계약 분리 |
| 기준 브랜치 | `main` + `feat/public-demo-ux` |
| 목적 | 현재 배포 동작과 후속 운영화를 구분한다 |
| 제품 목표 | [PRD_CLAUDE.md](PRD_CLAUDE.md) |
| UI 계약 | [`../Lo-Fi/standby/DESIGN.md`](../Lo-Fi/standby/DESIGN.md) |

> 코드와 이 문서가 다르면 코드가 우선한다. 현재 공개 MVP는 로그인 없이 익명 브라우저 세션으로 실행한다.
> 아래 네 Agent는 Studio Config `#1` 저장과 서버 배선까지 구현됐다. 아직 각 Agent의 실제 API 응답을
> 확인하는 live smoke는 끝나지 않았으므로 `운영 검증 완료`로 표현하지 않는다.

---

## 1. 한 문장 현황

현재 STANDBY는 **Master Cue·구조화된 무대 사양을 한 case에 업로드하고, Upstage가 만든
UNREVIEWED fact를 사람이 정규화·승인한 뒤, 불변 snapshot만 compiler/verifier에 전달해
세 verdict·근거 3종·이벤트별 2D 무대를 실제 workspace에 표시**한다.

Vercel 프론트, Railway API, Upstage Agent가 연결돼 있다. 공개 MVP는 로그인 UI를 두지 않고 브라우저별
UUID 세션으로 case 소유권을 분리한다. 이 값은 사용자 신원을 증명하는 인증 정보가 아니며, 현재 상태와
원문은 여전히 서버 프로세스 메모리에만 있어 운영 제품의 계정·영속성 경계로 간주하지 않는다.

---

## 2. 구현 상태

| 영역 | 상태 | 현재 동작 |
|---|---|---|
| 두 화면 라우팅 | **구현** | `/` 입력, `/workspace` 워크스페이스만 존재 |
| KOR/ENG i18n | **구현** | 헤더 선택 메뉴로 M3 입력·review·workspace·2D 무대 카피를 전환하고 선택을 localStorage에 보존 |
| UI 카피 정리 | **구현** | 설명형 슬로건·면책을 제거하고 provenance와 hash는 요청 시 펼침 |
| 입력 | **구현** | MASTER_CUE XLSX/PDF/JSON 한 칸과 STAGE_SPEC 폼을 받음 |
| Script Sidebar | **로컬 코드 구현·배포 전** | DOCX 우선·PDF 보조 → 서버 Upstage Script Extractor → `standby.script-projection.v1` 실제 대사·지문. exact event ID만 자동 연결하고 나머지는 사람이 현재 event에 연결. MASTER_CUE fallback 없음 |
| 로컬 파일 방어 | **구현** | 확장자·signature·50 MiB·SHA-256 검사. 미리 정한 파일명 없음 |
| JSON Editor 직행 | **구현** | STANDBY CueSheet JSON은 로컬 구조 검사를 통과하면 `/workspace` Editor로 이동. reviewed case가 없어 Storyboard Agent는 호출하지 않지만, 대본 DOCX/PDF는 case-independent Script projection endpoint로 구조화 가능. 공개 CueSheet JSON에는 duration 추정 필드 없음 |
| 서버 JSON 전달 | **구현** | API로 받은 원본 JSON bytes/hash는 보존하고 Upstage 전송 때만 JSON Pointer 행의 임시 XLSX로 변환 |
| 무대 사양 | **구현** | crossover, 환복 시간, route time, route ID/capacity, 인물·소품 초기 배치 |
| Upstage 추출 | **구현** | 저장·live smoke가 확인된 기존 역할 Agent 결과를 모두 UNREVIEWED/NON_AUTHORITATIVE로 격리. 입력 화면의 Master Cue 추출과 별개로 Sidebar 대본은 case-independent Script projection endpoint에서 처리 |
| Stage Spec Extractor | **Studio 설정·서버 배선 구현 / live smoke 대기** | Config #1 `agt_PxbxmhXXT8iqdzs5WmHfUz`. locator·quote가 붙은 `stage_facts` 후보를 만들되 전부 UNREVIEWED |
| Fact Normalizer | **Studio 설정·서버 배선 구현 / live smoke 대기** | Config #1 `agt_6tn639gGApNdV9SdRfAjnE`. raw fact를 allowlist schema의 NON_AUTHORITATIVE normalized type/value로 추천. 추천값은 읽기 전용, 사용자화는 Agent가 고른 type의 값만 편집 |
| Storyboard Recomposer | **Studio 설정·서버 배선 구현 / live smoke 대기** | Config #1 `agt_go8aoJTVDvEwK8mwXh5gEi`. reviewed graph와 인접 snapshot으로 NON_AUTHORITATIVE transition을 비동기 생성·cache |
| Rehearsal Brief | **Studio 설정·서버 배선 구현 / live smoke 대기** | Config #1 `agt_9iLkb7fqwdEtaBv48t9tQA`. 결정론적 finding과 evidence를 무대감독용 확인 질문·unknown으로 요약. 새 verdict/finding 생성 금지 |
| 인접 event semantic transition | **로컬 코드 구현·배포 전** | 인접한 다음 event의 바뀐 entity만 짧게 전환. jump/back·초기 로드는 정적, reduced-motion은 정적 |
| 장시간 추출 | **구현** | 서버 최대 10분·브라우저 최대 11분 polling, 결과 미리보기와 `S T A N D B Y`가 왼쪽부터 순차 점등되는 로딩 화면 표시. reduced-motion에서는 고정 wordmark |
| Fact review | **구현** | raw field·locator·quote를 보고 승인/제외, 13개 normalized fact와 EVENT_STATE snapshot을 구조화 편집 |
| Review snapshot | **구현** | 현재 결정을 불변 digest로 동결. 미결정 fact는 authority를 얻지 않음 |
| Compiler | **구현** | 승인된 normalized envelope만 event graph·stage snapshot으로 변환 |
| Verifier | **구현** | VR-01 환복, VR-02 경로 수용량, VR-03 소품 연속성을 결정론적으로 계산 |
| 실제 workspace 배선 | **구현** | 같은 case ID의 event·finding·calculation·evidence·2D snapshot을 표시 |
| 세 verdict | **구현** | `VIOLATION`, `REVIEW`, `INSUFFICIENT_EVIDENCE`; finding 0건은 CONSISTENT |
| Evidence Trace | **구현** | 모든 finding에 SCRIPT·MASTER_CUE·STAGE_SPEC 역할별 origin·review·locator·quote 표시 |
| 공개 데모 세션 | **구현** | 로그인 없이 브라우저 UUID를 전송하고 서버가 해시한 actor ID로 사용 |
| 세션별 격리 | **구현** | case·operation·extraction run owner 검사. 다른 세션의 ID는 404 |
| 데모 남용 방지 | **구현** | 전체 API 분당 120회, extraction은 IP당 시간당 20회 제한 |
| Railway 배포 규격 | **구현** | multi-stage Dockerfile, root build context ignore, health check, restart policy |
| 외부 운영 연결 | **구현** | Vercel 도메인, Railway API, server-only Upstage key 연결 |
| 서체 | **구현** | 본문·라벨은 시스템 기본 서체, STANDBY 로고·추출 loading wordmark만 JetBrains Mono |
| 데이터 영속성 | **미구현** | 프로세스 재시작 시 case·review·snapshot이 사라짐 |
| 실제 reference fidelity | **미검증** | 합성 live smoke는 통과했지만 공연 원본 gold fact 대조는 아직 없음 |
| XLSX 왕복·refresh | **미구현** | 원형 보존 export와 hash 기반 부분 재추출은 후속 milestone |

---

## 3. 현재 사용자 흐름

```text
MASTER_CUE JSON 파일 선택
  → 로컬 CueSheet 구조 검사
  → workspace Editor 직행

또는 MASTER_CUE XLSX/PDF 파일 선택
  → STAGE_SPEC route/time/capacity/initial state 입력
  → case 생성 + Master Cue 및 유효한 Stage Spec 업로드
  → 서버의 Upstage Agent 추출
  → UNREVIEWED fact의 quote/locator/field 검토
  → REVIEWED/REJECTED와 normalized envelope 기록
  → review snapshot freeze
  → reviewed fact compiler + deterministic verifier
  → 같은 case ID의 workspace
  → 이벤트 선택 → stage snapshot + finding + 계산 + 세 근거
                   + Script Sidebar의 같은 event 발췌 스크롤·강조
```

파일을 다시 선택하면 이전 case·fact review·workspace는 즉시 초기화된다. 원문 role의 `REVIEWED`는
사람이 그 입력 파일을 선택했다는 의미이고, 추출 fact의 `REVIEWED`와 구분된다.

JSON 직행은 구조화 결과를 빠르게 확인·편집하기 위한 로컬 Editor 경로다. Upstage 추출과 fact review를
거치지 않으므로 서버의 `VerifiedWorkspace`나 세 근거를 갖춘 authoritative finding으로 표시하지 않는다.
씬 길이와 환복 소요 시간을 JSON에서 추정하지 않는다. 따라서 JSON 직행 경로는 duration 기반 경고를 만들지
않고, 시간 판정은 verifier 경로에서 사람이 검토한 명시적 `min_ms`·`max_ms` 근거가 있을 때만 수행한다.

---

## 4. 신뢰 경계

1. Upstage와 다른 LLM은 fact 후보만 만든다. verdict를 만들거나 바꾸지 못한다.
2. locator·quote가 없는 provider 결과는 fail-closed한다.
3. compiler는 `review_snapshot`의 REVIEWED fact만 읽는다.
4. raw Upstage label을 추측하지 않고 사람의 `normalized_fact_type + value`만 사용한다.
5. 모든 finding은 세 source evidence를 정확히 하나씩 갖는다.
6. 정보가 부족하거나 모호하면 `INSUFFICIENT_EVIDENCE`로 기권하고 누락 fact를 표시한다.
7. 원본 Master Cue hash는 revision으로 바뀌지 않는다.
8. Upstage key는 서버 환경변수에만 있고 브라우저·Vercel bundle·API 응답에 들어가지 않는다.
9. Normalizer·Storyboard·Brief는 모두 `NON_AUTHORITATIVE`다. strict decoder를 통과해도 source fact,
   review snapshot, deterministic verdict를 만들거나 수정하지 못한다. Normalizer 추천도 사람 승인 전 authority가 없다.
10. Storyboard의 `beats`와 `missing_evidence`는 읽기 전용 보조 정보다. deterministic snapshot과 verdict가
    언제나 authoritative하며 Agent 출력은 둘의 입력으로 역류하지 않는다.

---

## 5. 운영·보안 경계

- 개발: `STANDBY_ALLOW_ANONYMOUS=false`일 때 로컬 정적 bearer token을 사용할 수 있다.
- 공개 MVP: 브라우저가 만든 UUID v4를 `X-STANDBY-SESSION`으로 전송하고 서버는 그 값을 해시한다.
- 브라우저에는 Upstage key, API bearer token, DB secret이 없다.
- 서버: CORS allowlist, Helmet, 분당 120회 전역 rate limit, IP당 시간당 20회 extraction 제한,
  JSON 1 MiB, 파일 50 MiB,
  역할별 MIME/확장자/signature, Idempotency-Key를 적용한다.
- 격리: 세션 owner가 아닌 요청은 resource 존재 여부를 드러내지 않고 404를 받는다.
- 한계: UUID 세션은 사용자 신원을 확인하는 로그인이 아니다. 브라우저 저장소를 지우면 새 세션이 된다.
- 남은 위험: in-memory store, 원문 object storage/악성 파일 검사 부재, 계정 복구,
  audit/retention/observability 부재.

---

## 6. 검증된 결과

서버 자동 테스트는 다음을 고정한다.

```text
미검토 → VR-01/02/03 모두 INSUFFICIENT_EVIDENCE
20개 통제 fact 승인 → 8 events + VR-01 VIOLATION / VR-02 VIOLATION / VR-03 REVIEW
raw Upstage-shaped fact + 사람이 승인한 normalized envelope → 같은 8 events / 3 findings
tight fixture → VR-01 REVIEW
clean control → finding 0건
다른 익명 세션 → case read 404
```

프런트 production build는 secret 없이 생성된다. 서버 자동 테스트는 19건이며, app/server의
typecheck·production build와 두 패키지의 `npm audit` 0건을 확인했다.

---

## 7. M3 판정과 다음 순서

| 구분 | 판정 | 완료 조건 |
|---|---|---|
| M3-B review→workspace E2E | **코드 완료** | 한 case ID로 review/snapshot/verifier/workspace 연결 |
| M3-A 공개 데모 runtime | **완료** | 로그인 없는 세션 격리, Railway API, server-only Upstage key |
| M3-A 장시간 extraction UX | **완료** | 10분 server timeout, 11분 client polling, 결과 미리보기와 순차 점등 STANDBY wordmark, reduced-motion 고정 표시 |
| 다음 P0 | **Agent live smoke** | Studio Config #1과 서버 배선은 완료. 네 Agent의 실제 응답·strict decoder·cache/fallback을 fixture로 고정 |
| 다음 P0 | **semantic transition** | 인접 verified snapshot만 180–360ms 전환, jump/back·reduced-motion·Agent 실패는 정적 fallback |
| 다음 P0 | **reference fidelity** | 실제 한국어 대본·17열 Master Cue를 gold fact와 대조 |
| 다음 P1 | **XLSX 왕복** | 원본 sheet·열·서식을 유지한 새 파일과 re-import 동일 fact |
| 다음 P2 | **refresh/영속성** | 동일 hash 재호출 금지, DB 저장, 새 fact UNREVIEWED gate |
| 운영 제품 전환 시 | **계정·권한** | OAuth/JWT, DB 수준 owner/RLS, 세션 복구를 한 milestone으로 구현 |

네 Agent의 cache 계약은 각각 `source hash`, `raw fact-set digest`, `review/revision`, `verifier result hash`에 Agent/Config ID와
실제 input hash를 더한다. 같은 key에서는 Upstage를 재호출하지 않는다. timeline 클릭은 cached storyboard를
즉시 선택하고 miss만 비동기 실행하며, 늦은 이전 응답이 현재 event를 덮지 못해야 한다.

계획된 review UX는 gate 전체에서 한 번 선택하는 `추천값`/`사용자화` 두 mode다. fact card마다 mode를
반복하지 않는다. 추천값은 읽기 전용이고, 사용자화는 Normalizer가 추천한 allowlist type을 고정한 채 값만
편집한다. 정규화 type selector는 없으며 type이 틀리면 추천을 거절한다. 사용자화의 `일괄 승인`은 사용자가
명시적으로 누른 유효 draft에만 적용하고 fact별 review 기록을 남기며 snapshot freeze는 별도다.

---

## 8. 정본

- 현재 구현: 이 문서
- 목표와 판정 규칙: [PRD_CLAUDE.md](PRD_CLAUDE.md)
- UI 불변식: [`../Lo-Fi/standby/DESIGN.md`](../Lo-Fi/standby/DESIGN.md)
- 서버 실행·보안: [`../server/README.md`](../server/README.md)
- JSON 계약: [`../contracts/README.md`](../contracts/README.md)
- 목표 서비스 구조: [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)
