# STANDBY contracts

앱, API, worker 사이에서 공유하는 JSON 계약이다. Upstage raw response schema가 아니라
STANDBY가 소유하는 strict contract다.

| 파일 | 역할 |
|---|---|
| `source.v1.schema.json` | 불변 입력과 source hash |
| `extraction.v1.schema.json` | provider raw lineage와 `UNREVIEWED` fact 후보 |
| `stage-spec.v1.schema.json` | named zone, route time, initial state |
| `review-snapshot.v1.schema.json` | 사람이 승인한 fact/link의 동결 snapshot |
| `event-graph.v1.schema.json` | 순서와 시간을 가진 compiled event/action graph |
| `verification.v1.schema.json` | 결정론적 finding과 3-role evidence |
| `revision.v1.schema.json` | 원본 hash 위의 append-only cell patch |

Canonical zone은 배우가 객석을 바라보는 관점이다.

| Canonical | UI label |
|---|---|
| `STAGE_RIGHT_WING` | 상수윙 |
| `STAGE` | 무대 |
| `STAGE_LEFT_WING` | 하수윙 |
| `STAGE_LEFT_CHANGE` | 하수환복소 |

모델은 ID, hash, origin, review status, verdict를 생성하지 않는다.
`fact_snapshot_digest`는 승인 시점에 동결한 fact 후보 전체를 `fact_id` 순서로 canonical JSON hash한 값이다.
