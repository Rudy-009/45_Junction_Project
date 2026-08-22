"""
큐 시트 모순 검증기 (Cue Sheet Contradiction Detector)

검증 규칙:
1. 물리적 이동 불가: 상수 퇴장 → 하수 등장 (백스테이지 이동 시간 부족)
2. 통로 없는데 반대편 등장: has_backstage_crossover=false인데 반대편 이동
3. 이중 등장: 퇴장하지 않은 인물이 재등장
4. 소품 위치 모순: 소품이 한쪽으로 나갔는데 반대편에서 등장
5. 환복 시간 부족: 환복 시간 > 씬 간 여유 시간
"""

import json
import sys
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Severity(Enum):
    ERROR = "ERROR"       # 물리적으로 불가능한 모순
    WARNING = "WARNING"   # 위험하지만 가능할 수도 있는 상황


@dataclass
class Contradiction:
    severity: Severity
    rule: str
    cue_id: str
    scene_number: str
    event_id: str
    description: str
    details: dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "severity": self.severity.value,
            "rule": self.rule,
            "cue_id": self.cue_id,
            "scene_number": self.scene_number,
            "event_id": self.event_id,
            "description": self.description,
            "details": self.details,
        }


class CueSheetValidator:
    def __init__(self, data: dict):
        self.data = data
        self.venue = data.get("venue", {})
        self.characters = {c["id"]: c["name"] for c in data.get("characters", [])}
        self.props = {p["id"]: p for p in data.get("props", [])}
        self.cues = data.get("cues", [])
        self.contradictions: list[Contradiction] = []

        # 상태 추적
        self.character_state: dict[str, dict] = {}  # char_id -> {"on_stage": bool, "last_exit_direction": str, "last_exit_cue": str, "pending_costume_change_sec": int}
        self.prop_state: dict[str, dict] = {}       # prop_id -> {"on_stage": bool, "last_direction": str, "last_cue": str}

    def validate(self) -> list[Contradiction]:
        """전체 검증 실행"""
        self._init_states()

        for cue_idx, cue in enumerate(self.cues):
            cue_id = cue.get("cue_id", f"cue_{cue_idx}")
            scene_number = cue.get("scene_number", "unknown")
            estimated_duration = cue.get("estimated_duration_sec", 0)
            crossover_time = cue.get(
                "backstage_crossover_time_override_sec",
                self.venue.get("backstage_crossover_time_sec", 0)
            )

            events = cue.get("events", [])
            for event in events:
                event_id = event.get("event_id", "unknown")
                actions = event.get("actions", [])

                for action in actions:
                    self._validate_action(
                        action, cue_id, scene_number, event_id,
                        crossover_time, estimated_duration, cue_idx
                    )

            # 씬 종료 후: 환복 시간 체크 (다음 씬과 비교)
            self._check_costume_time(cue_idx)

        return self.contradictions

    def _init_states(self):
        """초기 상태 설정"""
        for char_id in self.characters:
            self.character_state[char_id] = {
                "on_stage": False,
                "last_exit_direction": None,
                "last_exit_cue": None,
                "last_exit_scene": None,
                "pending_costume_change_sec": 0,
                "costume_change_cue_idx": -1,
            }
        for prop_id in self.props:
            self.prop_state[prop_id] = {
                "on_stage": False,
                "last_direction": None,
                "last_cue": None,
                "last_scene": None,
            }

    def _validate_action(self, action: dict, cue_id: str, scene_number: str,
                         event_id: str, crossover_time: float,
                         estimated_duration: float, cue_idx: int):
        action_type = action.get("type")

        if action_type == "character_enter":
            self._check_character_enter(action, cue_id, scene_number, event_id, crossover_time, cue_idx)
        elif action_type == "character_exit":
            self._check_character_exit(action, cue_id, scene_number, event_id)
        elif action_type == "backstage_crossover":
            self._check_backstage_crossover(action, cue_id, scene_number, event_id)
        elif action_type == "prop_in":
            self._check_prop_in(action, cue_id, scene_number, event_id)
        elif action_type == "prop_out":
            self._check_prop_out(action, cue_id, scene_number, event_id)
        elif action_type == "costume_change":
            self._record_costume_change(action, cue_id, scene_number, event_id, cue_idx)

    def _check_character_enter(self, action: dict, cue_id: str, scene_number: str,
                               event_id: str, crossover_time: float, cue_idx: int):
        char_id = action.get("character_id", "")
        direction = action.get("direction", "")
        if not char_id:
            return

        state = self.character_state.get(char_id)
        if not state:
            return

        char_name = self.characters.get(char_id, char_id)

        # 규칙 3: 이중 등장 - 퇴장 안 했는데 등장
        if state["on_stage"]:
            self.contradictions.append(Contradiction(
                severity=Severity.ERROR,
                rule="duplicate_enter",
                cue_id=cue_id,
                scene_number=scene_number,
                event_id=event_id,
                description=f"'{char_name}'이(가) 퇴장하지 않고 재등장합니다.",
                details={"character_id": char_id, "character_name": char_name}
            ))

        # 규칙 1: 물리적 이동 불가
        if (not state["on_stage"] and state["last_exit_direction"]
                and direction and state["last_exit_direction"] != direction):

            # 백스테이지 통로가 없는 경우 (규칙 2)
            if not self.venue.get("has_backstage_crossover", False):
                self.contradictions.append(Contradiction(
                    severity=Severity.ERROR,
                    rule="no_backstage_crossover",
                    cue_id=cue_id,
                    scene_number=scene_number,
                    event_id=event_id,
                    description=f"'{char_name}'이(가) {self._dir_name(state['last_exit_direction'])}로 퇴장 후 "
                                f"{self._dir_name(direction)}에서 등장하지만, 백스테이지 통로가 없습니다.",
                    details={
                        "character_id": char_id,
                        "character_name": char_name,
                        "exit_direction": state["last_exit_direction"],
                        "enter_direction": direction,
                        "exited_at_cue": state["last_exit_cue"],
                        "exited_at_scene": state["last_exit_scene"],
                    }
                ))
            else:
                # 통로는 있지만, 이전 씬에서 backstage_crossover 액션이 없었는지 확인
                # → 이동 시간 체크
                if crossover_time > 0:
                    available_time = self._get_available_time_between(
                        state.get("costume_change_cue_idx", -1), cue_idx
                    )
                    needed_time = crossover_time + state.get("pending_costume_change_sec", 0)

                    if available_time > 0 and needed_time > available_time:
                        self.contradictions.append(Contradiction(
                            severity=Severity.WARNING,
                            rule="insufficient_crossover_time",
                            cue_id=cue_id,
                            scene_number=scene_number,
                            event_id=event_id,
                            description=f"'{char_name}'이(가) {self._dir_name(state['last_exit_direction'])}에서 "
                                        f"{self._dir_name(direction)}으로 이동하는데 시간이 부족할 수 있습니다. "
                                        f"(필요: {needed_time}초, 가용: {available_time}초)",
                            details={
                                "character_id": char_id,
                                "character_name": char_name,
                                "needed_sec": needed_time,
                                "available_sec": available_time,
                                "crossover_time_sec": crossover_time,
                                "costume_change_sec": state.get("pending_costume_change_sec", 0),
                            }
                        ))

        # 상태 업데이트
        state["on_stage"] = True
        state["pending_costume_change_sec"] = 0

    def _check_character_exit(self, action: dict, cue_id: str, scene_number: str, event_id: str):
        char_id = action.get("character_id", "")
        direction = action.get("direction", "")
        if not char_id:
            return

        state = self.character_state.get(char_id)
        if not state:
            return

        char_name = self.characters.get(char_id, char_id)

        # 무대에 없는 인물이 퇴장하는 경우
        if not state["on_stage"]:
            self.contradictions.append(Contradiction(
                severity=Severity.WARNING,
                rule="exit_without_enter",
                cue_id=cue_id,
                scene_number=scene_number,
                event_id=event_id,
                description=f"'{char_name}'이(가) 무대에 없는 상태에서 퇴장합니다.",
                details={"character_id": char_id, "character_name": char_name}
            ))

        # 상태 업데이트
        state["on_stage"] = False
        state["last_exit_direction"] = direction
        state["last_exit_cue"] = cue_id
        state["last_exit_scene"] = scene_number

    def _check_backstage_crossover(self, action: dict, cue_id: str, scene_number: str, event_id: str):
        char_id = action.get("character_id", "")
        from_dir = action.get("from", "")
        to_dir = action.get("to", "")

        if not char_id:
            return

        char_name = self.characters.get(char_id, char_id)

        # 규칙 2: 백스테이지 통로 없는데 이동
        if not self.venue.get("has_backstage_crossover", False):
            self.contradictions.append(Contradiction(
                severity=Severity.ERROR,
                rule="no_backstage_crossover",
                cue_id=cue_id,
                scene_number=scene_number,
                event_id=event_id,
                description=f"'{char_name}'이(가) 백스테이지 이동({self._dir_name(from_dir)}→{self._dir_name(to_dir)})을 "
                            f"하지만 백스테이지 통로가 없습니다.",
                details={
                    "character_id": char_id,
                    "character_name": char_name,
                    "from": from_dir,
                    "to": to_dir,
                }
            ))

        # 상태 업데이트: 퇴장 방향을 도착지로 갱신
        state = self.character_state.get(char_id)
        if state:
            state["last_exit_direction"] = to_dir

    def _check_prop_in(self, action: dict, cue_id: str, scene_number: str, event_id: str):
        prop_id = action.get("prop_id", "")
        direction = action.get("direction", "")
        carried_by = action.get("carried_by", "")

        if not prop_id:
            return

        prop_info = self.props.get(prop_id, {})
        prop_name = prop_info.get("name", prop_id)
        state = self.prop_state.get(prop_id)
        if not state:
            return

        # 규칙 4: 소품이 이미 무대 위에 있는데 다시 들어옴
        if state["on_stage"]:
            self.contradictions.append(Contradiction(
                severity=Severity.WARNING,
                rule="prop_already_on_stage",
                cue_id=cue_id,
                scene_number=scene_number,
                event_id=event_id,
                description=f"소품 '{prop_name}'이(가) 이미 무대 위에 있는데 다시 진입합니다.",
                details={
                    "prop_id": prop_id,
                    "prop_name": prop_name,
                    "last_cue": state["last_cue"],
                    "last_scene": state["last_scene"],
                }
            ))

        # 규칙 4: 소품이 한쪽으로 나갔는데 반대편에서 들어옴 (carried_by가 다른 인물이거나 없는 경우)
        if (not state["on_stage"] and state["last_direction"]
                and direction and state["last_direction"] != direction):
            # 소품이 이전에 나간 방향과 다른 방향에서 들어올 때
            # 백스테이지 통로가 없으면 모순
            if not self.venue.get("has_backstage_crossover", False):
                self.contradictions.append(Contradiction(
                    severity=Severity.ERROR,
                    rule="prop_location_contradiction",
                    cue_id=cue_id,
                    scene_number=scene_number,
                    event_id=event_id,
                    description=f"소품 '{prop_name}'이(가) {self._dir_name(state['last_direction'])}로 퇴장했는데 "
                                f"{self._dir_name(direction)}에서 진입합니다. 백스테이지 통로가 없습니다.",
                    details={
                        "prop_id": prop_id,
                        "prop_name": prop_name,
                        "exit_direction": state["last_direction"],
                        "enter_direction": direction,
                        "exited_at_cue": state["last_cue"],
                        "exited_at_scene": state["last_scene"],
                    }
                ))

        # 상태 업데이트
        state["on_stage"] = True
        state["last_direction"] = direction
        state["last_cue"] = cue_id
        state["last_scene"] = scene_number

    def _check_prop_out(self, action: dict, cue_id: str, scene_number: str, event_id: str):
        prop_id = action.get("prop_id", "")
        direction = action.get("direction", "")

        if not prop_id:
            return

        prop_info = self.props.get(prop_id, {})
        prop_name = prop_info.get("name", prop_id)
        state = self.prop_state.get(prop_id)
        if not state:
            return

        # 무대에 없는 소품이 퇴장
        if not state["on_stage"]:
            self.contradictions.append(Contradiction(
                severity=Severity.WARNING,
                rule="prop_not_on_stage",
                cue_id=cue_id,
                scene_number=scene_number,
                event_id=event_id,
                description=f"소품 '{prop_name}'이(가) 무대에 없는 상태에서 퇴장합니다.",
                details={
                    "prop_id": prop_id,
                    "prop_name": prop_name,
                }
            ))

        # 상태 업데이트
        state["on_stage"] = False
        state["last_direction"] = direction
        state["last_cue"] = cue_id
        state["last_scene"] = scene_number

    def _record_costume_change(self, action: dict, cue_id: str, scene_number: str,
                               event_id: str, cue_idx: int):
        char_id = action.get("character_id", "")
        duration = action.get("costume_change_duration_sec", 0)

        if not char_id:
            return

        state = self.character_state.get(char_id)
        if state:
            state["pending_costume_change_sec"] = duration
            state["costume_change_cue_idx"] = cue_idx

    def _check_costume_time(self, cue_idx: int):
        """현재 씬에서 환복 중인 인물이 다음 씬 시간 내에 환복을 끝낼 수 있는지 체크"""
        if cue_idx >= len(self.cues) - 1:
            return

        current_cue = self.cues[cue_idx]
        current_duration = current_cue.get("estimated_duration_sec", 0)

        for char_id, state in self.character_state.items():
            if state["pending_costume_change_sec"] > 0 and state["costume_change_cue_idx"] == cue_idx:
                # 현재 씬의 남은 시간으로 환복 가능한지 체크
                if current_duration > 0 and state["pending_costume_change_sec"] > current_duration:
                    char_name = self.characters.get(char_id, char_id)
                    self.contradictions.append(Contradiction(
                        severity=Severity.WARNING,
                        rule="insufficient_costume_time",
                        cue_id=current_cue.get("cue_id", ""),
                        scene_number=current_cue.get("scene_number", ""),
                        event_id="",
                        description=f"'{char_name}'의 환복 시간({state['pending_costume_change_sec']}초)이 "
                                    f"해당 씬 소요 시간({current_duration}초)보다 깁니다.",
                        details={
                            "character_id": char_id,
                            "character_name": char_name,
                            "costume_change_sec": state["pending_costume_change_sec"],
                            "scene_duration_sec": current_duration,
                        }
                    ))

    def _get_available_time_between(self, from_cue_idx: int, to_cue_idx: int) -> float:
        """두 큐 사이의 가용 시간 계산"""
        total = 0
        for i in range(max(0, from_cue_idx), to_cue_idx):
            total += self.cues[i].get("estimated_duration_sec", 0)
        return total

    @staticmethod
    def _dir_name(direction: str) -> str:
        if direction == "stage_left":
            return "상수"
        elif direction == "stage_right":
            return "하수"
        return direction or "불명"


def validate_cue_sheet(file_path: str) -> dict:
    """큐 시트 파일을 읽고 검증 결과를 반환"""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    validator = CueSheetValidator(data)
    contradictions = validator.validate()

    result = {
        "file": file_path,
        "title": data.get("metadata", {}).get("title", ""),
        "total_cues": len(data.get("cues", [])),
        "total_contradictions": len(contradictions),
        "errors": len([c for c in contradictions if c.severity == Severity.ERROR]),
        "warnings": len([c for c in contradictions if c.severity == Severity.WARNING]),
        "contradictions": [c.to_dict() for c in contradictions],
    }

    return result


def print_report(result: dict):
    """검증 결과를 보기 좋게 출력"""
    print("=" * 60)
    print(f"  큐 시트 모순 검증 리포트")
    print(f"  공연: {result['title']}")
    print(f"  파일: {result['file']}")
    print("=" * 60)
    print(f"\n  총 큐 수: {result['total_cues']}")
    print(f"  발견된 모순: {result['total_contradictions']}건")
    print(f"    - ERROR (물리적 불가): {result['errors']}건")
    print(f"    - WARNING (주의 필요): {result['warnings']}건")
    print()

    if result["contradictions"]:
        print("-" * 60)
        for i, c in enumerate(result["contradictions"], 1):
            severity_icon = "🔴" if c["severity"] == "ERROR" else "🟡"
            print(f"  {severity_icon} [{i}] {c['severity']} | {c['rule']}")
            print(f"     씬: {c['scene_number']} (큐: {c['cue_id']})")
            if c["event_id"]:
                print(f"     이벤트: {c['event_id']}")
            print(f"     내용: {c['description']}")
            if c["details"]:
                for k, v in c["details"].items():
                    if v:
                        print(f"       - {k}: {v}")
            print()
    else:
        print("  ✅ 모순이 발견되지 않았습니다!")

    print("=" * 60)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python cue_sheet_validator.py <cue-sheet.json>")
        sys.exit(1)

    file_path = sys.argv[1]
    result = validate_cue_sheet(file_path)
    print_report(result)

    # JSON 결과도 파일로 출력
    output_path = file_path.replace(".json", "-validation-result.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n  결과 JSON 저장: {output_path}")
