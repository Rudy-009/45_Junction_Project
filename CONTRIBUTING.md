# STANDBY 공동 작업 규칙

이 저장소는 두 명의 공동 작업자가 짧은 브랜치와 Pull Request로 작업한다.

## 시작 순서

```bash
git switch main
git pull --ff-only
git switch -c <type>/<short-topic>
```

브랜치 유형은 `docs/`, `feat/`, `fix/`, `design/`을 사용한다. `main`에는 직접 push하지 않는다.

## 변경 원칙

- 한 PR은 한 목적만 가진다.
- `git add .` 대신 변경한 경로를 명시적으로 stage한다.
- 공유 브랜치에는 force push하지 않는다.
- 원 대본·큐시트, 지원서, 개인 포트폴리오, API key와 `.env`는 공개 저장소에 올리지 않는다.
- fixture는 실제 자료와 구분하고 `CONTROLLED_FIXTURE` 또는 `MUTATED_FIXTURE` origin을 남긴다.

## PR 전 확인

```bash
git status --short
git diff --check
git diff --cached --check
```

- 문서 링크와 상대 경로가 열리는지 확인한다.
- `openapi.yaml`을 수정했다면 YAML parse와 관련 schema를 검증한다.
- UI 변경은 최신 화면 캡처와 PRD acceptance를 함께 확인한다.
- 검증하지 못한 항목은 PR 설명에 명시한다.

## 병합

PR은 다른 작업자 1명의 확인을 받은 뒤 squash 또는 merge한다. 병합 후 작업 브랜치를 삭제하고 다음 작업은 최신 `main`에서 시작한다.
