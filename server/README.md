# STANDBY backend MVP

사람이 승인한 문서 fact만 compiler와 결정론적 verifier에 전달하는 수직 슬라이스다.
현재 구현은 제어된 hero fixture 경로와 **실제 PDF/XLSX → Upstage Agent → UNREVIEWED fact** 경로를 함께 제공한다. M3에서는 사람의 정규화 검토, 불변 snapshot, verifier, workspace projection과 Supabase 사용자 JWT 경계까지 연결했다. 상태와 원문 파일은 아직 프로세스 메모리에만 있다.

## 실행

Node.js 22.12 이상이 필요하다.

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

서버 기본 주소는 `http://localhost:8787`이다. 개발 환경의 `/v1/*` 요청에는
`Authorization: Bearer <STANDBY_API_TOKEN>`이 필요하고, 상태를 바꾸는 요청에는
고유한 `Idempotency-Key` 헤더도 필요하다. 운영(`NODE_ENV=production`)은 정적 token을 받지 않고
`SUPABASE_URL`의 JWKS로 사용자 access token의 서명·issuer·audience·role·subject를 확인한다.
case와 extraction operation은 생성한 사용자만 읽거나 변경할 수 있다.

실제 추출에는 `.env`에 `UPSTAGE_API_KEY`, `UPSTAGE_AGENT_ID_SCRIPT`,
`UPSTAGE_AGENT_ID_MASTER_CUE`, `UPSTAGE_CONFIG_ID_SCRIPT`,
`UPSTAGE_CONFIG_ID_MASTER_CUE`를 설정한다. `.env.example`의 Agent/Config ID는
2026-08-22 Studio Code 패널에서 확인한 저장 Config #1 값이다. API key나 Agent ID를
브라우저 번들에 넣지 않는다.
SCRIPT는 PDF/DOCX, MASTER_CUE는 XLSX/PDF multipart 파일을 받고 STAGE_SPEC은 JSON으로 받는다.
파일은 50 MiB 이하이며 확장자·MIME·signature를 모두 통과해야 한다.

```bash
npm run typecheck
npm test
npm run build
```

## 컨테이너와 운영 변수

저장소 루트에서 다음과 같이 API image를 재현한다.

```bash
docker build -f server/Dockerfile -t standby-server .
docker run --rm -p 8787:8787 \
  -e NODE_ENV=production \
  -e SUPABASE_URL=https://PROJECT.supabase.co \
  -e STANDBY_ALLOWED_ORIGINS=https://standby-junctionx.vercel.app \
  -e UPSTAGE_API_KEY=... \
  standby-server
```

`railway.json`은 같은 Dockerfile과 `/healthz`를 사용한다. Railway에는 `SUPABASE_URL`,
`STANDBY_ALLOWED_ORIGINS`, `UPSTAGE_API_KEY`, 역할별 Upstage Agent/Config ID를 secret으로 둔다.
Vercel에는 공개값 `VITE_STANDBY_API_BASE_URL`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`만 둔다. `UPSTAGE_API_KEY`와 정적 API token은 Vercel에 넣지 않는다.

해커톤 데모 기간에만 로그인을 우회하려면 Vercel에
`VITE_STANDBY_AUTH_BYPASS=true`, Railway에 `STANDBY_AUTH_BYPASS=true`를 둘 다 설정한다.
하나만 켜지면 우회는 완성되지 않는다. 서버 플래그가 켜진 동안 모든 요청은
공유 `demo-user`의 데이터로 처리되므로, 공개 데모가 끝나면 두 플래그를 먼저
`false`로 되돌린 뒤 재배포한다.

## 구현된 흐름

1. `POST /v1/cases` — 검증 case 생성
2. `POST /v1/cases/:caseId/sources/:role` — SCRIPT, MASTER_CUE, STAGE_SPEC 등록
3. `POST /v1/cases/:caseId/extraction-runs` — 제어 fixture 또는 Upstage Agent 비동기 extraction 시작
4. `GET /v1/operations/:operationId` — 작업 상태 polling
5. `GET /v1/extraction-runs/:runId` — 역할별 provider provenance 확인
6. `GET /v1/cases/:caseId/review-queue` — 사람이 검토할 후보 조회
7. `POST /v1/cases/:caseId/fact-reviews:batch` — fact 승인 또는 거절
8. `POST /v1/cases/:caseId/review-snapshots` — 승인 시점의 fact를 불변 스냅샷으로 동결하고 compile·verify
9. `GET /v1/cases/:caseId/workspace` — reviewed event graph, 결정론적 verdict, 근거 3종, 무대 스냅샷 조회
10. `POST /v1/cases/:caseId/cue-revisions` — 원본 hash를 유지한 revision layer 생성

Hero fixture에서는 승인 전 세 규칙이 모두 `INSUFFICIENT_EVIDENCE`다. 승인 후 8-event graph와
VR-01 quick-change `VIOLATION`, VR-02 route capacity `VIOLATION`, VR-03 prop continuity `REVIEW`가
생긴다. R3 환복시간을 70초로 고치면 VR-01만 사라지고 독립된 두 finding은 유지된다.

2026-08-22 저장 Agent/Config #1에 합성 Script PDF와 Master Cue PDF/XLSX를 실제 전송한 live smoke도
통과했다. 두 형식 모두 Files API, job polling, strict decoder를 거쳐 Script 12개, Master Cue 5개,
Stage Spec 3개 fact를 만들었고 전부 `UNREVIEWED`였다. 이는 연결과 계약 검증이며 실제 공연 원본의
추출 정확도 검증은 아니다. sanitized 결과는 `qa/upstage-live-smoke-2026-08-22.json`에 있다.

## 신뢰·보안 경계

- LLM/추출기는 fact **후보만** 만든다. verdict는 `src/domain/verifier.ts`가 계산한다.
- Upstage 출력에 exact locator나 quote가 없으면 전체 역할 job을 실패시킨다.
- Upstage가 만든 fact는 항상 `UNREVIEWED`이며 사람 승인 전 verifier authority가 없다.
- verifier는 현재 review queue가 아니라 사람이 동결한 `review_snapshot`만 읽는다.
- compiler는 `REVIEWED` fact만 읽으며 Upstage raw label을 추측해 정규화하지 않는다.
- raw fact를 정규화할 때는 review의 `corrected_value`에 명시적 `normalized_fact_type` envelope를 쓴다.
- MASTER_CUE 원본 SHA-256은 revision으로 바뀌지 않는다.
- 응답에는 업로드한 원문 content나 내부 cue rows를 그대로 내보내지 않는다.
- JSON body는 1 MiB로 제한하고 CORS allowlist, Helmet, rate limit을 적용한다.
- multipart 파일은 50 MiB로 제한하고 역할별 허용 형식과 signature를 검사한다.
- 저장소에는 secret을 넣지 않는다. `.env`는 Git에서 제외한다.
- 운영은 Supabase JWT를 JWKS로 검증하고 `sub`를 actor ID로 사용한다.
- 모든 case·operation·extraction run 접근에 owner 검사를 적용하며, 다른 사용자의 resource는 404로 숨긴다.
- 정적 bearer token은 로컬 개발과 자동 테스트에서만 허용한다.

## 아직 없는 것

- 업로드 object storage와 악성 파일/zip bomb 검사
- 실제 한국어 대본·17열 Master Cue reference에 대한 추출 fidelity·locator 검증
- PostgreSQL/Supabase 영속화와 DB 수준 RLS (HTTP 계층의 사용자별 owner 검사는 구현됨)
- XLSX 원형 보존 export
- 감사 로그, 보존 기간, 삭제 작업, 운영 관측성

운영 서비스 연결과 보안 설계는 [BACKEND_ARCHITECTURE.md](../project/BACKEND_ARCHITECTURE.md),
교환 형식은 [contracts/README.md](../contracts/README.md)를 따른다.
