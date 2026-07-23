import { boxSolid, boxVolume, fixture } from './primitives';

export const SLIDE_LAB_FIXTURE_SOURCE = fixture(
  'slide_lab',
  [-8_000, 0, 0],
  [
    boxSolid('slide_ground', 'world_static', [0, -500, 0], [12_000, 500, 6_000]),
    boxSolid('slide_step', 'world_static', [2_000, 170, 0], [400, 170, 1_500]),
    boxSolid('slide_wall', 'world_static', [8_000, 1_500, 0], [100, 1_500, 2_000]),
    boxSolid('slide_uphill', 'world_static', [4_500, 900, 3_000], [1_500, 100, 1_000], [0, 0, 25_000]),
    boxSolid('slide_downhill', 'world_static', [-2_000, 900, 3_000], [1_500, 100, 1_000], [0, 0, -25_000]),
  ],
  [
    boxVolume('slide_forbidden_edge', 'forbidden', [10_500, 1_000, 0], [500, 1_000, 5_000]),
  ],
);

