# P5.10 Inkfall revision-2 combat collision proof

Status: `BOUNDED_PASS` — `G4_NOT_CLAIMED`.

The saved, non-default `inkfall_foundry@2` authority collision GLB now has a reproducible combat fixture snapshot and strict Rapier-backed ports for hitscan world occlusion, grenade sphere collision, grenade radial occlusion, and collision-safe impulse clamping.

## Exact authority identity

- Package digest: `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- Collision GLB SHA-256: `cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e`
- Fixture: `inkfall_foundry_map_collision@2`
- Fixture hash: `bf85e42731fd088e`
- Authority geometry: 339 solid colliders and 2 volumes
- Generated fixture snapshot SHA-256: `d04669cc6efbc3970d21572e6d06b009416558a4475ea1744d862b70b1cd9a83`
- Two consecutive generator runs were byte-identical.

## Pinned real-Rapier results

- Hitscan ray: `map_collision_spawn_pad_spawn_w_press_a` at exactly 2,000 mm.
- Grenade sweep: `map_collision_spawn_pocket_floor_west`, TOI 450 permille, normal `(0, 32767, 0)`.
- Radial occlusion: blocked by `map_collision_spawn_pad_spawn_w_press_a`.
- Downward impulse at the west spawn: requested `(0, -20000, 0)`, safely applied `(0, 0, 0)`.
- Two independent worlds and reversed query order returned identical results.
- An equal-distance low-level ray tie resolved by stable collider ID.

## Abuse boundary

Non-finite rays, non-unit directions, forged grenade layer lists, accessor payloads, invalid ranges, and the wrong fixture identity fail closed. A discovered `-0` result from negative impulse truncation was canonicalized to `0` and pinned by the suite.

## Validation

- Focused Rapier and Inkfall suite: 2 files / 27 tests passed.
- App TypeScript passed.
- Worker TypeScript passed.
- Full ESLint passed.
- Vite production build passed.
- Node Vitest: 79 files / 668 tests passed.
- Worker Vitest: 7 files / 26 tests passed.
- Wrangler dry-run passed.

## Deliberately preserved boundary

The accepted default remains map revision 1. The existing P5.9 `p58d-rev3-combat-v1` Worker profile and evidence remain unchanged.

The current Worker persists one `SimulationIdentityV1` naming `phase4_flat_run` plus the `flat_run` fixture. Silently adding Inkfall as a second combat-only world would leave its authority identity outside persistence and resume validation. Replacing the sole world would also invalidate the accepted P5.9 flat-run spawn and presentation coordinates.

The safe product seam is therefore explicit: create a new opt-in profile whose persisted identity names Inkfall revision 2 (or version identity to carry a second combat fixture), construct the Rapier world from the generated snapshot, pass `createInkfallRevision2RapierCombatWorldPorts(world)` into the room's hitscan and grenade options, move spawn/presentation coordinates to Inkfall, and then rerun reconstitution plus two-client runtime proof.

No final 3D map integration and no G4 closure are claimed.
