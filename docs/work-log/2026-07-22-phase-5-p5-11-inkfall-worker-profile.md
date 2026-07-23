# 2026-07-22 — Phase 5 P5.11 Inkfall Worker profile

## Outcome

Bounded pass. A new explicit opt-in Worker profile, `p511-inkfall-foundry-revision-2-combat-v1`, now constructs and reconstitutes its authoritative movement/combat world from the saved Inkfall Foundry revision-2 collision fixture. The accepted default and P5.9 flat-run routes remain unchanged. This is not a G4 or G5 pass.

## Implementation delta

1. Added an exact profile boundary.
   - The public opt-in remains the existing evidence-profile header, with two accepted values: the sealed P5.9 profile and the new P5.11 profile.
   - Unsupported values fail before room creation.
   - Room creation and metrics report the exact selected profile; Inkfall also reports its map/package/fixture/presentation binding.
2. Added independent profile persistence.
   - `room_profile_v1` records the versioned profile separately from `SimulationIdentityV1`.
   - Persisted profile and simulation identity must agree on every reconstitution.
   - Existing rooms without the new row are backfilled from their exact accepted identity.
   - A mismatched request returns `409 ROOM_PROFILE_MISMATCH` without poisoning the valid incarnation.
3. Bound the P5.10 world to the Worker.
   - The generated revision-2 fixture is validated against map revision, package digest, fixture identity/hash, cardinality, coordinate system, and locked spawn data.
   - One Rapier world supplies movement queries, hitscan occlusion, grenade sweep/radial occlusion, and collision-safe impulse.
4. Bound locked presentation coordinates.
   - Eight revision-2 team spawns are pinned in west/east ordinal order.
   - Snapshot positions stay in east/up/north millimeter coordinates with milli-degree yaw.
   - The Inkfall profile is capped at eight players to avoid inventing overlapping spawns beyond the locked set.
5. Added focused real-Worker coverage.
   - Real hibernatable Durable Object eviction/reconstitution with one live lobby socket.
   - Exact world-port probes after reconstruction.
   - Two real WebSocket clients under one exact identity and locked opposing spawns.
   - Wrong-profile, cross-profile resume, persisted flat-run alias, and legacy-row migration coverage.

## Verification

- Focused P5.11 Worker: 1 file / 3 tests passed.
- P5.10 Rapier/Inkfall: 2 files / 27 tests passed.
- P5.9 Worker regression: 1 file / 3 tests passed.
- App TypeScript: passed.
- Worker TypeScript: passed.
- Full ESLint: passed.
- Vite build: passed, 143 modules.
- Node Vitest: 79 files / 668 tests passed.
- Worker Vitest: 8 files / 29 tests passed.
- Wrangler dry-run: passed, 2,828.96 KiB upload / 772.99 KiB gzip.

## Remaining seam

The product client does not yet select the new profile. Durable recovery remains lobby-only; active-match state is still explicitly uncheckpointed. Fixed locked spawns replace neither final spawn scoring nor human play acceptance. Final traversal, final visuals, paired visible combat footage, and G4/G5 approval remain open.

## Non-claims

- `G4_NOT_CLAIMED`
- `G5_NOT_CLAIMED`
- `FINAL_3D_MAP_INTEGRATION_NOT_CLAIMED`
- `ACTIVE_MATCH_CHECKPOINT_RECOVERY_NOT_CLAIMED`
- `P59_EVIDENCE_NOT_SUPERSEDED`
