# 2026-07-22 — Phase 5 P5.10 Inkfall combat collision

## Outcome

Bounded pass. The saved non-default Inkfall Foundry revision-2 collision artifact now drives strict, deterministic Rapier combat query ports. Existing defaults and the accepted P5.9 online profile were not changed. This is not a G4 pass and is not final 3D map integration.

## Implementation delta

1. Added a deterministic solid-ray query to `RapierMovementWorld`.
   - Validates finite integer origins, unit directions, bounded distance, exact solid layers, and the `solid` flag.
   - Casts against colliders in stable ID order instead of relying on broad-phase callback ordering.
   - Resolves nearest quantized distance, then stable collider ID for equal-distance ties.
2. Added `createInkfallRevision2RapierCombatWorldPorts`.
   - Fails closed unless fixture ID/revision/hash/cardinality/volume count/layers match the saved revision-2 authority fixture.
   - Binds hitscan world occlusion to the deterministic solid ray.
   - Binds grenade sweep to a Rapier spherical capsule cast.
   - Binds radial occlusion to the deterministic solid ray.
   - Binds collision-safe impulse to one-tick capsule casts and clamps only toward zero, preserving the authority validator's no-amplify/no-redirect contract.
3. Added a reproducible fixture generator.
   - Reads the saved GLB in the same Vite SSR realm as the converter.
   - Verifies package digest, source byte count, source SHA-256, fixture hash, and collider cardinality.
   - Emits `combat-authority-fixture.p5-10.v1.json`; repeated runs are byte-identical.
4. Added focused determinism and abuse tests.
   - Native revision-2 GLB conversion must exactly equal the generated JSON fixture.
   - Exact hitscan, sweep, radial, and safe-impulse results are pinned across independent worlds.
   - Equal-distance collider ordering, NaN/non-unit/range rejection, forged layers, accessors, and wrong-fixture rejection are pinned.

## Runtime integration decision

The existing Worker room was intentionally not changed. Its persisted `SimulationIdentityV1` names one `phase4_flat_run` / `flat_run` authority fixture. A hidden second Inkfall combat world would not be covered by persisted identity or resume mismatch checks. Replacing the sole world would change P5.9's accepted spawn/presentation coordinate contract.

Exact next seam:

1. Create a distinct opt-in room profile whose persisted identity names Inkfall revision 2, or version the protocol identity to include a second combat-fixture identity.
2. Load the generated fixture into a Worker Rapier world during Durable Object initialization.
3. Feed the adapter's two ports into `createWorkerCombatOptions`.
4. Bind spawn and client presentation coordinates to Inkfall.
5. Prove room persistence/reconstitution and two separate clients against that same identity.

## Verification

- Fixture generator: passed twice; byte-identical SHA-256 `d04669cc6efbc3970d21572e6d06b009416558a4475ea1744d862b70b1cd9a83`.
- Focused tests: 2 files / 27 tests passed.
- App TypeScript: passed.
- Worker TypeScript: passed.
- Full ESLint: passed.
- Vite build: passed.
- Node Vitest: 79 files / 668 tests passed.
- Worker Vitest: 7 files / 26 tests passed.
- Wrangler dry-run: passed.

## Non-claims

- `G4_NOT_CLAIMED`
- `FINAL_3D_MAP_INTEGRATION_NOT_CLAIMED`
- `CURRENT_P59_WORKER_PROFILE_NOT_BOUND_TO_INKFALL_COLLISION`
- `P59_EVIDENCE_NOT_SUPERSEDED`
