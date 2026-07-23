# 2026-07-22 — Phase 5 P5.12 Inkfall product client

## Outcome

Bounded pass. The `/online` route now exposes an explicit truthful opt-in for `p511-inkfall-foundry-revision-2-combat-v1`, verifies the exact authority profile, complete revision-2 map binding, and every simulation identity before socket creation, and runs movement, hitscan, and grenade behavior against the real hash-locked Inkfall Rapier world. Default/no-header and P5.9 flat behavior remain unchanged. This is not a G4 or G5 pass.

## Implementation delta

1. Added a strict product-client profile boundary.
   - The selector is visible and unchecked by default.
   - Only the exact profile is accepted in the URL selection model.
   - Create and join metadata requests send the public evidence-profile header.
   - Profile, room, full map binding, and simulation identity drift fail closed before socket creation.
2. Added the locked Inkfall client world.
   - The client validates revision, package digest, fixture identity/hash, collider cardinality, coordinate system, and all eight spawns.
   - The same P5.10 Rapier fixture drives local prediction while the Worker remains authoritative.
3. Added usable view control for the proof client.
   - Q/E produce bounded deterministic yaw deltas.
   - Existing commands retain exact zero yaw/pitch defaults.
4. Fixed a strict-port defect found in real runtime.
   - Rotated muzzle offsets could yield fractional millimeter ray origins.
   - Authority eye/muzzle origins are now deterministically rounded before collision queries.
5. Added regression and runtime evidence.
   - URL/default-path and gateway mismatch tests.
   - Locked-world integration tests.
   - Worker public-profile success/mismatch tests.
   - Bounded look-input and non-cardinal hitscan-origin tests.
   - Two separate Chrome processes exercised spawn, a frozen seven-leg traversal, real occlusion, damage/death/score/feed, grenade state, and pre-socket profile rejection.

## Verification

- Final runtime: `evidence/2026-07-22/phase-5-p5-12/runtime-v6/`.
- Independent verifier: 13 artifact hashes and 10 source hashes passed.
- App TypeScript: passed.
- Worker TypeScript: passed.
- Full ESLint: passed.
- Vite build: passed, 151 modules.
- Node Vitest: 82 files / 683 tests passed.
- Worker Vitest: 8 files / 29 tests passed.
- Wrangler dry-run: passed, 2,829.83 KiB upload / 773.11 KiB gzip.

## Remaining seam

Durable recovery remains lobby-only; active-match checkpoint/reconstitution is still open. The bounded press-cross route does not replace a complete traversal matrix. The authority-plane stills prove state and collision behavior, not final integrated map visuals. Human visual/play acceptance and G4/G5 closure remain open.

## Non-claims

- `G4_NOT_CLAIMED`
- `G5_NOT_CLAIMED`
- `FINAL_3D_MAP_INTEGRATION_NOT_CLAIMED`
- `ACTIVE_MATCH_CHECKPOINT_RECOVERY_NOT_CLAIMED`
- `P59_EVIDENCE_NOT_SUPERSEDED`
