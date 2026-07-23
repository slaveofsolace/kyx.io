import {
  boxSolid,
  boxVolume,
  capsuleSolid,
  fixture,
} from './primitives';

export const TELEPORT_LAB_FIXTURE_SOURCE = fixture(
  'teleport_lab',
  [-6_000, 0, 0],
  [
    boxSolid('teleport_ground', 'world_static', [0, -500, 0], [12_000, 500, 10_000]),
    boxSolid('thin_wall', 'world_static', [0, 1_500, 0], [25, 1_500, 5_000]),
    boxSolid('teleport_corner_x', 'world_static', [4_000, 1_500, 2_000], [100, 1_500, 2_000]),
    boxSolid('teleport_corner_z', 'world_static', [2_000, 1_500, 4_000], [2_000, 1_500, 100]),
    boxSolid('teleport_low_ceiling', 'world_static', [5_000, 1_350, -4_000], [1_500, 150, 1_500]),
    boxSolid('teleport_door', 'door', [-2_000, 1_500, 5_500], [750, 1_500, 100]),
    boxSolid('teleport_spawn_barrier', 'spawn_barrier', [-4_000, 1_500, -5_000], [100, 1_500, 1_500]),
    capsuleSolid('teleport_player_proxy', 'player_body', [3_000, 900, -1_500], 1_800, 350),
  ],
  [
    boxVolume('teleport_kill_zone', 'kill', [8_000, 500, 6_000], [1_000, 500, 1_000]),
    boxVolume('teleport_forbidden_zone', 'forbidden', [8_000, 1_000, -6_000], [1_000, 1_000, 1_000]),
    boxVolume('teleport_recovery_zone', 'recovery', [-9_000, 1_000, 8_000], [500, 1_000, 500]),
  ],
);

