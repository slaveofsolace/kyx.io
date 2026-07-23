# P5.11 Inkfall revision-2 Worker profile proof

Status: `BOUNDED_PASS` — `G4_NOT_CLAIMED`.

The Worker now exposes one separately named, explicit opt-in room profile: `p511-inkfall-foundry-revision-2-combat-v1`. It reconstructs its sole authoritative Rapier world from the hash-locked P5.10 Inkfall fixture and passes that world's real hitscan and grenade ports into the revision-3 combat room.

## Persisted compatibility boundary

The wire contract remains `SimulationIdentityV1`. A new `room_profile_v1` record persists the selected versioned profile independently from the simulation identity. Reconstitution requires the profile record and identity to agree exactly. Older accepted P5.9 rooms that predate the table are backfilled once from their exact persisted identity.

This closes the silent-alias risk: substituting a valid `phase4_flat_run` identity beneath a persisted Inkfall profile fails room reconstruction with `ROOM_UNAVAILABLE`. An explicit P5.9 profile request against an existing Inkfall room returns `409 ROOM_PROFILE_MISMATCH` without poisoning the correct room incarnation. A resume token issued by a different profile/room is rejected.

## Real Worker proof

- A real hibernatable Durable Object was evicted with one live Inkfall lobby player and reconstituted from SQLite.
- The rebuilt world retained fixture `inkfall_foundry_map_collision@2`, hash `bf85e42731fd088e`, 339 solid colliders, and the P5.10 query behavior.
- The west-spawn hitscan probe hit `map_collision_spawn_pad_spawn_w_press_a` at 2,000 mm.
- The grenade sweep hit `map_collision_spawn_pocket_floor_west` at 450 permille.
- A second real WebSocket client joined after reconstitution; both clients received the same simulation identity.
- Client one occupied `spawn_w_press_a` at `(-33500, 0, -3500)`, yaw `0`.
- Client two occupied `spawn_e_press_a` at `(33500, 0, 3500)`, yaw `180000`.
- Snapshot coordinates use the locked map presentation contract: east/up/north, millimeters, milli-degrees, `press_core_floor_contact` origin.

## Defaults preserved

No-header room creation remains the accepted `phase4_flat_run` revision-2 route. The accepted P5.9 profile remains `p58d-rev3-combat-v1`, with its flat-run identity, spawns, and deterministic clear/empty combat ports unchanged. Inkfall revision 1 remains the catalog default; this revision-2 Worker path is opt-in only. No prior evidence is overwritten or superseded.

## Validation

- Focused P5.11 Worker proof: 1 file / 3 tests passed.
- P5.10 Rapier/Inkfall regression: 2 files / 27 tests passed.
- Accepted P5.9 Worker regression: 1 file / 3 tests passed.
- App and Worker TypeScript passed.
- Full ESLint passed.
- Vite production build passed (143 modules).
- Node Vitest: 79 files / 668 tests passed.
- Worker Vitest: 8 files / 29 tests passed.
- Wrangler dry-run passed (2,828.96 KiB upload; 772.99 KiB gzip).

Exact source and fixture hashes are recorded in the adjacent JSON proof.

## Remaining seam

The player-facing online route does not yet select this profile. The proof covers deterministic world reconstruction and lobby checkpoint/socket reconstitution before two-client warmup; active-match checkpoint recovery remains intentionally unavailable. Final spawn scoring, full traversal, final map visuals, paired visible combat footage, and human play acceptance remain open. Therefore G4 and G5 remain open.
