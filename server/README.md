# STANDBY backend MVP

사람이 승인한 문서 fact만 결정론적 verifier에 전달하는 첫 번째 수직 슬라이스다.
현재 구현은 **제어된 hero fixture 전용**이며, 실제 Upstage 호출·파일 업로드·영구 DB는 아직 연결하지 않았다.

## 실행

Node.js 22.12 이상이 필요하다.

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

서버 기본 주소는 `http://localhost:8787`이다. `/healthz` 외의 `/v1/*` 요청에는
`Authorization: Bearer <STANDBY_API_TOKEN>`이 필요하고, 상태를 바꾸는 요청에는
고유한 `Idempotency-Key` 헤더도 필요하다.

```bash
npm run typecheck
npm test
npm run build
```

## 구현된 흐름

1. `POST /v1/cases` — 검증 case 생성
2. `POST /v1/cases/:caseId/sources/:role` — SCRIPT, MASTER_CUE, STAGE_SPEC 등록
3. `POST /v1/cases/:caseId/extraction-runs` — 제어 fixture에서 근거 포함 fact 후보 생성
4. `GET /v1/cases/:caseId/review-queue` — 사람이 검토할 후보 조회
5. `POST /v1/cases/:caseId/fact-reviews:batch` — fact 승인 또는 거절
6. `POST /v1/cases/:caseId/review-snapshots` — 승인 시점의 fact를 불변 스냅샷으로 동결
7. `GET /v1/cases/:caseId/workspace` — 결정론적 verdict, 근거 3종, 8-event 무대 스냅샷 조회
8. `POST /v1/cases/:caseId/cue-revisions` — 원본 hash를 유지한 revision layer 생성

Hero fixture에서는 승인 전 E3가 `INSUFFICIENT_EVIDENCE`, 승인 후 58–62초 대
66–68초가 `VIOLATION`, R3 환복시간을 70초로 고치면 finding 0건과 `CONSISTENT`가 된다.

## 신뢰·보안 경계

- LLM/추출기는 fact **후보만** 만든다. verdict는 `src/domain/verifier.ts`가 계산한다.
- verifier는 현재 review queue가 아니라 사람이 동결한 `review_snapshot`만 읽는다.
- MASTER_CUE 원본 SHA-256은 revision으로 바뀌지 않는다.
- 응답에는 업로드한 원문 content나 내부 cue rows를 그대로 내보내지 않는다.
- JSON body는 1 MiB로 제한하고 CORS allowlist, Helmet, rate limit을 적용한다.
- 저장소에는 secret을 넣지 않는다. `.env`는 Git에서 제외한다.
- 현재 bearer token은 로컬 개발용 단일 사용자 인증이다. 운영 전 사용자별 인증과 case 권한 검사가 필요하다.

## 아직 없는 것

- 실제 PDF/XLSX 업로드와 object storage
- Upstage Document Parse/Extraction 비동기 worker 및 webhook 검증
- PostgreSQL/Supabase 영속화와 row-level authorization
- XLSX 원형 보존 export
- 감사 로그, 보존 기간, 삭제 작업, 운영 관측성

운영 서비스 연결과 보안 설계는 [BACKEND_ARCHITECTURE.md](../project/BACKEND_ARCHITECTURE.md),
교환 형식은 [contracts/README.md](../contracts/README.md)를 따른다.
