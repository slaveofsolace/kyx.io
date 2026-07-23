import { boxSolid, boxVolume, fixture } from './primitives';

export const FLAT_RUN_FIXTURE_SOURCE = fixture(
  'flat_run',
  [0, 0, 0],
  [
    boxSolid('flat_ground', 'world_static', [0, -500, 0], [12_000, 500, 12_000]),
  ],
  [
    boxVolume('flat_kill_plane', 'kill', [0, -4_000, 0], [15_000, 1_000, 15_000]),
  ],
);

