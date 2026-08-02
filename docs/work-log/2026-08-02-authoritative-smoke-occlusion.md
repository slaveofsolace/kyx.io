# Authoritative smoke occlusion checkpoint — 2026-08-02

## Outcome

Authoritative smoke fields now participate in every server-owned hitscan path through one deterministic ray/sphere occlusion contract. Smoke is materialized before combat resolution on its detonation tick, so a shot accepted on that same tick cannot bypass the new field.

The contract treats smoke as visibility cover rather than solid barrel geometry:

- `barrel_clearance` queries continue to use physical world geometry only;
- `shot_path` queries select the nearest active smoke or physical-world blocker;
- physical geometry wins an exact-distance tie;
- a shot originating inside an active smoke field is obscured at distance zero;
- active lifetime is the half-open interval `[spawnedAtTick, expiresAtTick)`;
- fields behind the ray, expired fields, and not-yet-active fields do not occlude.

The legacy authoritative auto rifle and the generalized pistol/shotgun/sniper hitscan resolver consume the same immutable per-tick smoke snapshot. Projectile weapons, melee, splash, and movement collision remain physical-world-only.

## Files

- `src/authority/combat/smokeOcclusion.ts`
- `src/authority/combat/index.ts`
- `src/authority/room.ts`
- `tests/unit/authority/combat/smokeOcclusion.test.ts`
- `tests/unit/authority/combat/roomArmoryIntegration.test.ts`

## Consolidated impacted verification

Bundled runtime: `D:\AI Projects\Tools\node-v22.22.0-win-x64\node.exe`

1. App typecheck — PASS
   - `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`
2. Worker typecheck — PASS
   - `node node_modules/typescript/bin/tsc -p tsconfig.worker.json --noEmit`
3. Changed-surface ESLint — PASS
   - `node node_modules/eslint/bin/eslint.js src/authority/combat/smokeOcclusion.ts src/authority/combat/index.ts src/authority/room.ts tests/unit/authority/combat/smokeOcclusion.test.ts tests/unit/authority/combat/roomArmoryIntegration.test.ts --no-error-on-unmatched-pattern`
4. Focused Vitest — PASS, 2 files / 9 tests
   - `node node_modules/vitest/vitest.mjs run tests/unit/authority/combat/smokeOcclusion.test.ts tests/unit/authority/combat/roomArmoryIntegration.test.ts`

Runtime integration proof constructs a real authority smoke projectile, restores it through the strict active-match checkpoint, detonates it on the same tick as a shot, and verifies `world_occluded`, the exact `.smoke` field ID, zero applied damage, field snapshot publication, and reconnect preservation. It covers both the legacy auto rifle and the generalized sniper family; pistol and shotgun share the same generalized resolver and port binding.

## Explicit nonclaims and next consequences

- No human play/readability acceptance was performed.
- No visual smoke expansion, material, sound, or VFX was changed or approved.
- Practice bots still use their existing local `isLineObscured` smoke query; convergence onto this authority contract remains a separate task.
- Spectator/replay perception behavior was not changed.
- No full-suite, browser, 2/4/8 matrix, soak, packaging, staging, or deployment claim is made by this bounded checkpoint.
