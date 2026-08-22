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
| `STAGE_RIGHT_CHANGE` | 상수환복소 |

모델은 ID, hash, origin, review status, verdict를 생성하지 않는다.
`fact_snapshot_digest`는 승인 시점에 동결한 fact 후보 전체를 `fact_id` 순서로 canonical JSON hash한 값이다.

## M2 normalized review envelope

Upstage의 역할별 raw field를 compiler가 추측해 정규화하지 않는다. 사람이 fact를 검토하면서
명시적으로 정규화해야 할 때만 `corrected_value`에 다음 envelope를 저장한다.

```json
{
  "normalized_fact_type": "ROUTE_OCCUPANCY",
  "value": {
    "route_id": "HASU_CROSSOVER",
    "event_id": "E6",
    "entity_id": "actor-hyewon",
    "start_ms": 52000,
    "end_ms": 58000
  }
}
```

compiler는 `REVIEWED` fact만 읽고, envelope가 없으면 기존 `fact_type`과
`reviewed_value ?? raw_value`를 사용한다. 지원하는 normalized type은 quick-change 5종,
blocking 3종, prop continuity 4종, `EVENT_STATE`다. 알 수 없는 type이나 object가 아닌 value는 거부한다.
