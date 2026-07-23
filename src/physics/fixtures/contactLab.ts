import { boxSolid, boxVolume, fixture } from './primitives';

export const CONTACT_LAB_FIXTURE_SOURCE = fixture(
  'contact_lab',
  [-6_000, 0, 0],
  [
    boxSolid('contact_ground', 'world_static', [0, -500, 0], [10_000, 500, 10_000]),
    boxSolid('wall_axis', 'world_static', [3_000, 1_500, 0], [100, 1_500, 3_000]),
    boxSolid('wall_diagonal', 'world_static', [0, 1_500, 3_500], [3_000, 1_500, 100], [0, 45_000, 0]),
    boxSolid('corner_x', 'world_static', [-2_000, 1_500, -2_000], [100, 1_500, 1_500]),
    boxSolid('corner_z', 'world_static', [-3_400, 1_500, -500], [1_500, 1_500, 100]),
    // Two spatially isolated doorway contracts share the same wall plane. The
    // -X lane preserves the literal 700 mm body-width boundary (350 mm radius
    // per side); the 20 mm controller skin must reject it safely. The +X lane
    // is the distinct 800 mm semantic doorway and must remain traversable.
    boxSolid('doorway_exact_700_left', 'door', [-7_400, 1_500, 6_000], [1_050, 1_500, 100]),
    boxSolid('doorway_exact_700_right', 'door', [-4_600, 1_500, 6_000], [1_050, 1_500, 100]),
    boxSolid('doorway_semantic_800_left', 'door', [4_600, 1_500, 6_000], [1_000, 1_500, 100]),
    boxSolid('doorway_semantic_800_right', 'door', [7_400, 1_500, 6_000], [1_000, 1_500, 100]),
    boxSolid('embedded_probe', 'world_static', [-5_750, 450, -3_000], [500, 450, 500]),
    boxSolid(
      'moving_platform_probe',
      'dynamic_platform',
      [0, 500, -5_000],
      [1_500, 500, 1_500],
      [0, 0, 0],
      [500, 0, 0],
    ),
  ],
  [
    boxVolume('contact_recovery', 'recovery', [8_500, 1_000, 8_500], [500, 1_000, 500]),
  ],
);
