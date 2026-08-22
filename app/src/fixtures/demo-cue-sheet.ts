import type { Action, CueSheet, Direction } from '@/types/cue-sheet';

export const DEMO_REFERENCE_XLSX_SHA256 =
  'f8a8d43d100cb06887e0af905cbf3e2d09522c5efea90e8102972960710c0419';

export const DEMO_FAST_PATH_WAIT_MS = 3_200;

const action = (
  type: Action['type'],
  entity: string,
  direction?: Direction,
): Action => type.startsWith('prop_')
  ? { type, prop_id: entity, direction }
  : { type, character_id: entity, direction };

export function createDemoCueSheet(): CueSheet {
  return {
    metadata: {
      title: 'STANDBY Demo — S#16 → S#17',
      version: 'CONTROLLED_FIXTURE v1',
      created_at: '2026-08-23',
      notes: '영상 촬영용 8-event 통제 fixture. 업로드 원문은 포함하지 않는다.',
    },
    venue: {
      has_backstage_crossover: false,
    },
    characters: [
      { id: 'hyewon', name: '혜원' },
      { id: 'eunbi', name: '은비' },
    ],
    props: [
      { id: 'bag', name: '마루가방' },
    ],
    cues: [
      {
        cue_id: 'E1',
        scene_number: 'S#16',
        scene_type: 'scene',
        notes: '퇴장 전 무대 상태',
        events: [{
          event_id: 'E1',
          trigger: { type: 'scene_change', description: 'S#16 시작' },
          actions: [
            action('character_enter', 'hyewon', 'stage_right'),
            action('character_enter', 'eunbi', 'stage_left'),
            action('prop_in', 'bag', 'stage_left'),
          ],
          notes: '혜원·은비·마루가방 프리셋',
        }],
      },
      {
        cue_id: 'E2',
        scene_number: 'Q56',
        scene_type: 'dark',
        notes: '암전 시작',
        events: [{
          event_id: 'E2',
          trigger: { type: 'lighting_cue', description: 'LX Q56 암전' },
          actions: [action('character_exit', 'hyewon', 'stage_right')],
          notes: '혜원 하수 퇴장',
        }],
      },
      {
        cue_id: 'E3',
        scene_number: 'Q56a',
        scene_type: 'dark',
        notes: '환복소 이동',
        events: [{
          event_id: 'E3',
          trigger: { type: 'scene_change', description: '암전 중 환복 시작' },
          actions: [{
            type: 'costume_change',
            character_id: 'hyewon',
            costume_description: '우주복 A → 우주복 B',
          }],
          notes: 'AVAILABLE 58–62s / REQUIRED 66–68s 확인 필요',
        }],
      },
      {
        cue_id: 'E4',
        scene_number: 'P12',
        scene_type: 'dark',
        notes: '소품 반출',
        events: [{
          event_id: 'E4',
          trigger: { type: 'scene_change', description: '런크루 소품 회수' },
          actions: [action('prop_out', 'bag', 'stage_left')],
          notes: '마루가방 상수 반출',
        }],
      },
      {
        cue_id: 'E5',
        scene_number: 'P12a',
        scene_type: 'dark',
        notes: '소품 위치 충돌',
        events: [{
          event_id: 'E5',
          trigger: { type: 'scene_change', description: '다음 장면 소품 프리셋' },
          actions: [action('prop_in', 'bag', 'stage_right')],
          notes: '통로 없이 반대편 재등장 — ERROR',
        }],
      },
      {
        cue_id: 'E6',
        scene_number: 'C04',
        scene_type: 'dark',
        notes: '크루 동선 해제',
        events: [{
          event_id: 'E6',
          trigger: { type: 'scene_change', description: '암전 종료 준비' },
          actions: [action('character_exit', 'eunbi', 'stage_left')],
          notes: '은비 상수 퇴장',
        }],
      },
      {
        cue_id: 'E7',
        scene_number: 'S#17',
        scene_type: 'scene',
        notes: '혜원 재입장',
        events: [{
          event_id: 'E7',
          trigger: { type: 'lighting_cue', description: 'LX Q58 조명 in' },
          actions: [action('character_enter', 'hyewon', 'stage_left')],
          notes: '통로 없이 반대편 재등장 — ERROR',
        }],
      },
      {
        cue_id: 'E8',
        scene_number: 'S#17 / P13',
        scene_type: 'scene',
        notes: '소품 복귀',
        events: [{
          event_id: 'E8',
          trigger: { type: 'dialogue', character_id: 'hyewon', description: '혜원: 다녀오겠습니다!' },
          actions: [
            action('character_exit', 'eunbi', 'stage_left'),
            action('prop_in', 'bag', 'stage_right'),
          ],
          notes: '중복 소품 반입·무대 밖 배우 퇴장 — ACTION REQUIRED',
        }],
      },
    ],
  };
}
