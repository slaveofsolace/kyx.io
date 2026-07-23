# Phase 5 P5.12 — Inkfall product-client selection

## Result

`BOUNDED_PASS`. The existing `/online` product route now has a visible, unchecked-by-default opt-in for the exact `p511-inkfall-foundry-revision-2-combat-v1` profile. Create and join send that profile, verify the returned profile, full `inkfall_foundry@2` binding, and every simulation identity before opening the socket, and fail closed on mismatch. The no-profile default and P5.9 flat-run paths remain unchanged.

This does not close G4 or G5.

## Final evidence bundle

The accepted runtime is `runtime-v6/`:

- `p512-two-browser-inkfall-product-client-proof.json` — exact room profile, complete map binding, all eight spawns, simulation identity, two browser-process IDs, frozen route observations, occluded cross-map fire, damage/death/score/feed, active grenade, mismatch rejection, source hashes, and non-claims.
- `artifact-manifest.json` — SHA-256 for 10 screenshots, two browser videos, and the structured proof.
- `independent-verification.json` — independent PASS over 13 artifact hashes, 10 source hashes, exact profile/map/eight spawns, two distinct browsers, combat consequences, grenade state, and fail-closed mismatch. SHA-256: `c9aaefb5b55cabef1630872b69da101959c63a4a0f6c6d991aa1eab5a30e6666`.
- `screenshots/p512-01-visible-opt-in-selection.png` — visible truthful selector, unchecked by default.
- `screenshots/p512-02-west-spawn-profile-identity.png` and `p512-03-east-spawn-profile-identity.png` — independently launched west/east clients and verified profile banner.
- `screenshots/p512-04-real-occlusion-blocks-cross-map-fire.png` — live Inkfall authority plane after seven accepted shots with target health unchanged.
- `screenshots/p512-05-west-authoritative-damage.png` through `p512-08-east-authoritative-death.png` — visible damage and death state.
- `screenshots/p512-09-real-grenade-port-active.png` — live grenade state on the real collision port.
- `screenshots/p512-10-profile-mismatch-fails-closed.png` — visible HTTP 409 rejection before a client is created.
- `videos/p512-west-product-client.webm` and `p512-east-product-client.webm` — two separate Chrome-process product-client captures.

The gameplay stills intentionally show the authority-plane visualization. They prove live authoritative state and real collision integration; they are not evidence of final integrated map visuals.

## Runtime proof

- Exact profile: `p511-inkfall-foundry-revision-2-combat-v1`.
- Exact map: `inkfall_foundry@2`, package `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`.
- Exact fixture: `inkfall_foundry_map_collision` / `bf85e42731fd088e`, 339 colliders.
- Exact locked spawns: all eight west/east tuples independently verified; observed first pair was `(-33500, 0, -3500)` and `(33500, 0, 3500)`.
- Browser topology: two independent system-Chrome processes, no synthetic dashboard.
- Cross-map collision: seven accepted shots; target remained at 100 HP behind real Inkfall occlusion.
- Close combat: visible 70 HP damage, then dead / 0 HP, death ordinal 1, feed sequence 1, and blue score 1.
- Grenade: accepted throw 1, active projectile 1, real Inkfall grenade port active.
- Mismatch: a flat-profile room requested as Inkfall returned HTTP 409; `__KYX_ONLINE_PREVIEW__` was never defined.

## Verification matrix

- App TypeScript: passed.
- Worker TypeScript: passed.
- Full ESLint: passed.
- Vite production build: passed, 151 modules.
- Node Vitest: 82 files / 683 tests passed.
- Worker Vitest: 8 files / 29 tests passed.
- Wrangler deploy dry-run: passed, 2,829.83 KiB upload / 773.11 KiB gzip.
- Independent runtime verifier: passed.

## Preserved earlier runs

- `runtime-v1/` preserved a harness failure caused by classifying the intentional 409 console line as unexpected.
- `runtime-v2/` preserved a tight combat-wait timeout.
- `runtime-v3/` preserved an authority-tick input-pulse timeout.
- `runtime-v4/` and `runtime-v5/` are complete green runs retained before the final direct-arena screenshot framing in `runtime-v6/`.

## Discovered and fixed

Non-cardinal muzzle rotation could produce a fractional authority ray origin, which the strict Inkfall collision port rejected. Authority-derived eye and muzzle origins are now deterministically rounded to integer millimeters before ray construction, with a focused regression test.

## Still open

- Active-match checkpoint/recovery remains unimplemented; durable recovery is still lobby-only.
- The complete active-match and final traversal matrix remains open.
- Final integrated map visuals and human visual/play acceptance remain open.
- G4 and G5 remain explicitly unclaimed.

