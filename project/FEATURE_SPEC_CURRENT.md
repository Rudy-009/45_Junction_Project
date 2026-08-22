# STANDBY — 현재 구현 기능 명세 (As-Is)

| 항목 | 내용 |
|---|---|
| 문서 상태 | M3 코드 대조 완료 · 2026-08-22 |
| 기준 브랜치 | `feat/m3-review-workspace` |
| 목적 | 실제 동작과 외부 서비스 연결 대기를 구분한다 |
| 제품 목표 | [PRD_CLAUDE.md](PRD_CLAUDE.md) |
| UI 계약 | [`../Lo-Fi/standby/DESIGN.md`](../Lo-Fi/standby/DESIGN.md) |

> 코드와 이 문서가 다르면 코드가 우선한다. 운영 배포는 Railway·Supabase 자격 증명이 연결된 뒤에만 완료로 표시한다.

---

## 1. 한 문장 현황

현재 STANDBY는 **Master Cue·구조화된 무대 사양을 한 case에 업로드하고, Upstage가 만든
UNREVIEWED fact를 사람이 정규화·승인한 뒤, 불변 snapshot만 compiler/verifier에 전달해
세 verdict·근거 3종·이벤트별 2D 무대를 실제 workspace에 표시**한다.

M3 애플리케이션 코드와 컨테이너 경계는 구현됐다. 외부 Railway 서비스와 Supabase 프로젝트는
현재 로컬 CLI가 로그인되지 않아 아직 provision되지 않았다. 따라서 Vercel 운영 화면은 공개 API/Auth
환경변수가 들어가기 전까지 의도적으로 “운영 사용자 인증 미연결”을 표시한다.

---

## 2. 구현 상태

| 영역 | 상태 | 현재 동작 |
|---|---|---|
| 두 화면 라우팅 | **구현** | `/` 입력, `/workspace` 워크스페이스만 존재 |
| KOR/ENG i18n | **구현** | 헤더 선택 메뉴로 M3 입력·review·workspace·2D 무대 카피를 전환하고 선택을 localStorage에 보존 |
| UI 카피 정리 | **구현** | 설명형 슬로건·면책을 제거하고 provenance와 hash는 요청 시 펼침 |
| 입력 | **구현** | MASTER_CUE XLSX/PDF/JSON 한 칸과 STAGE_SPEC 폼을 받음 |
| 로컬 파일 방어 | **구현** | 확장자·signature·50 MiB·SHA-256 검사. 미리 정한 파일명 없음 |
| 무대 사양 | **구현** | crossover, 환복 시간, route time, route ID/capacity, 인물·소품 초기 배치 |
| Upstage 추출 | **구현** | 역할별 Agent/Config를 서버에서 호출하고 모든 후보를 UNREVIEWED로 격리 |
| Fact review | **구현** | raw field·locator·quote를 보고 승인/제외, 13개 normalized fact와 EVENT_STATE snapshot을 구조화 편집 |
| Review snapshot | **구현** | 현재 결정을 불변 digest로 동결. 미결정 fact는 authority를 얻지 않음 |
| Compiler | **구현** | 승인된 normalized envelope만 event graph·stage snapshot으로 변환 |
| Verifier | **구현** | VR-01 환복, VR-02 경로 수용량, VR-03 소품 연속성을 결정론적으로 계산 |
| 실제 workspace 배선 | **구현** | 같은 case ID의 event·finding·calculation·evidence·2D snapshot을 표시 |
| 세 verdict | **구현** | `VIOLATION`, `REVIEW`, `INSUFFICIENT_EVIDENCE`; finding 0건은 CONSISTENT |
| Evidence Trace | **구현** | 모든 finding에 SCRIPT·MASTER_CUE·STAGE_SPEC 역할별 origin·review·locator·quote 표시 |
| 사용자 인증 코드 | **구현** | Supabase magic link, access token, 서버 JWKS 검증 |
| 사용자별 권한 | **구현** | case·operation·extraction run owner 검사. 타 사용자 ID는 404 |
| Railway 배포 규격 | **구현** | multi-stage Dockerfile, root build context ignore, health check, restart policy |
| 외부 운영 provision | **대기** | Railway·Supabase CLI 로그인과 프로젝트/환경변수 설정 필요 |
| 데이터 영속성 | **미구현** | 프로세스 재시작 시 case·review·snapshot이 사라짐 |
| 실제 reference fidelity | **미검증** | 합성 live smoke는 통과했지만 공연 원본 gold fact 대조는 아직 없음 |
| XLSX 왕복·refresh | **미구현** | 원형 보존 export와 hash 기반 부분 재추출은 후속 milestone |

---

## 3. 현재 사용자 흐름

```text
Supabase 로그인
  → MASTER_CUE XLSX/PDF/JSON 파일 선택
  → STAGE_SPEC route/time/capacity/initial state 입력
  → case 생성 + Master Cue 및 유효한 Stage Spec 업로드
  → 서버의 Upstage Agent 추출
  → UNREVIEWED fact의 quote/locator/field 검토
  → REVIEWED/REJECTED와 normalized envelope 기록
  → review snapshot freeze
  → reviewed fact compiler + deterministic verifier
  → 같은 case ID의 workspace
  → 이벤트 선택 → stage snapshot + finding + 계산 + 세 근거
```

파일을 다시 선택하면 이전 case·fact review·workspace는 즉시 초기화된다. 원문 role의 `REVIEWED`는
사람이 그 입력 파일을 선택했다는 의미이고, 추출 fact의 `REVIEWED`와 구분된다.

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

---

## 5. 운영·보안 경계

- 개발: 로컬 정적 bearer token을 사용할 수 있다.
- 운영: `SUPABASE_URL`이 필수이며 JWT의 서명·issuer·audience·role·subject를 검증한다.
- 브라우저: Supabase 사용자 access token만 `Authorization: Bearer`로 전송한다.
- 서버: CORS allowlist, Helmet, 분당 120회 rate limit, JSON 1 MiB, 파일 50 MiB,
  역할별 MIME/확장자/signature, Idempotency-Key를 적용한다.
- 권한: resource owner가 아닌 사용자는 존재 여부를 드러내지 않고 404를 받는다.
- 남은 위험: in-memory store, 원문 object storage/악성 파일 검사 부재, audit/retention/observability 부재.

---

## 6. 검증된 결과

서버 자동 테스트는 다음을 고정한다.

```text
미검토 → VR-01/02/03 모두 INSUFFICIENT_EVIDENCE
20개 통제 fact 승인 → 8 events + VR-01 VIOLATION / VR-02 VIOLATION / VR-03 REVIEW
raw Upstage-shaped fact + 사람이 승인한 normalized envelope → 같은 8 events / 3 findings
tight fixture → VR-01 REVIEW
clean control → finding 0건
다른 사용자 → case read 404
```

프런트 production build는 secret 없이 생성된다. 실제 Railway/Supabase URL을 넣은 live 브라우저 E2E는
외부 project provision 뒤에 마지막으로 확인해야 한다.

---

## 7. M3 판정과 다음 순서

| 구분 | 판정 | 완료 조건 |
|---|---|---|
| M3-B review→workspace E2E | **코드 완료** | 한 case ID로 review/snapshot/verifier/workspace 연결 |
| M3-A 인증·운영 runtime | **코드 완료** | Supabase JWT/owner 경계와 Railway image/config |
| M3-A 외부 provision | **대기** | Railway와 Supabase 로그인, URL/secret 설정, live smoke |
| 다음 P0 | **reference fidelity** | 실제 한국어 대본·17열 Master Cue를 gold fact와 대조 |
| 다음 P1 | **OAuth 인증 통합** | OAuth Provider(Apple/Google) 연동으로 사용자별 권한 경계를 보강하고 현재 magic-link 인증 흐름을 통합 |
| 다음 P1 | **XLSX 왕복** | 원본 sheet·열·서식을 유지한 새 파일과 re-import 동일 fact |
| 다음 P2 | **refresh/영속성** | 동일 hash 재호출 금지, DB 저장, 새 fact UNREVIEWED gate |

---

## 8. 정본

- 현재 구현: 이 문서
- 목표와 판정 규칙: [PRD_CLAUDE.md](PRD_CLAUDE.md)
- UI 불변식: [`../Lo-Fi/standby/DESIGN.md`](../Lo-Fi/standby/DESIGN.md)
- 서버 실행·보안: [`../server/README.md`](../server/README.md)
- JSON 계약: [`../contracts/README.md`](../contracts/README.md)
- 목표 서비스 구조: [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)
