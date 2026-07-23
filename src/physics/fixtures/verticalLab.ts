import { boxSolid, boxVolume, fixture } from './primitives';

export const VERTICAL_LAB_FIXTURE_SOURCE = fixture(
  'vertical_lab',
  [-6_000, 0, 0],
  [
    boxSolid('vertical_ground', 'world_static', [0, -500, 0], [12_000, 500, 10_000]),
    boxSolid('step_below_threshold', 'world_static', [-2_000, 170, 0], [500, 170, 1_500]),
    boxSolid('step_above_threshold', 'world_static', [0, 180, 0], [500, 180, 1_500]),
    boxSolid('ramp_walkable', 'world_static', [3_000, 1_000, -2_500], [1_500, 100, 1_500], [0, 0, 45_000]),
    boxSolid('ramp_too_steep', 'world_static', [6_500, 1_200, -2_500], [1_500, 100, 1_500], [0, 0, 50_000]),
    boxSolid('crouch_tunnel_ceiling', 'world_static', [0, 1_350, 4_500], [2_000, 150, 1_500]),
    boxSolid('jump_ceiling', 'world_static', [-4_000, 2_400, 4_500], [1_000, 100, 1_000]),
  ],
  [
    boxVolume('vertical_kill_plane', 'kill', [0, -4_000, 0], [15_000, 1_000, 12_000]),
    boxVolume('vertical_recovery', 'recovery', [-9_000, 1_000, 8_000], [500, 1_000, 500]),
  ],
);

