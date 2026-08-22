# STANDBY

STANDBY는 대본, 사람이 작성한 마스터 큐시트, 무대 사양을 분석해 blocking conflict, 촉박한 quick-change, 누락된 소품을 찾고, 그 근거를 2D 무대에서 시각화해 공연 오류를 예방하는 AI 도구입니다.

현재 `app/`에는 [standby-junctionx.vercel.app](https://standby-junctionx.vercel.app/)에 배포된 것과 같은 React/Vite 클라이언트 프로토타입 원본이 있습니다. 아직 실제 Upstage 호출이나 서버 저장소는 연결되지 않은 데모 상태입니다.

## 로컬 실행

```bash
cd app
npm ci
npm run typecheck
npm run build
npm run dev
```

`dist/`와 `.vercel/`은 재생성 가능하거나 개인 계정에 연결된 로컬 산출물이므로 Git에서 제외합니다. 배포 화면과 로컬 원본의 비교 결과는 [design-qa.md](design-qa.md)에 기록했습니다.

공동 작업 방식은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다.
