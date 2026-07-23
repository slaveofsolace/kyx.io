# 2026-07-22 — Phase 5 P5.9 online authoritative combat presentation

## Outcome

`/online` now provides a pre-release, production-shaped authoritative combat room. The route explicitly creates revision-3 combat rooms while leaving the default revision-2 room path unchanged. Two independent real-browser clients visibly exercised combat through the real Worker WebSocket path.

## Implementation

- Added an explicit combat-profile room creation helper and exact profile header.
- Extended evidence input commands with opt-in held/pressed/released combat buttons without changing the movement-only command shape.
- Exposed combat snapshots and bounded reliable combat events through the client diagnostics surface.
- Added the production `/online` arena presentation: health, ammo, weapon and grenade states, score, match phase, kill feed, projectiles, death, and respawn.
- Added Space/R/G keyboard and pointer controls.
- Added automatic authoritative respawn for revision-3 combat rooms only.
- Added targeted unit and real-Worker coverage for opt-in combat input, exact room headers, and resumed automatic respawn.

## Runtime proof

Two separate Chrome processes joined the same real local Durable Object room. Both observed authoritative damage and death, score/feed increment, automatic respawn, active grenade/reload state, same-player/same-match resume, and eventual snapshot convergence. Focused screenshots, two independent videos, and machine-readable facts are sealed under `evidence/2026-07-22/phase-5-p5-9`.

## Final verification

- App TypeScript: PASS
- Worker TypeScript: PASS
- Full ESLint: PASS
- Vite production build: PASS
- Wrangler dry-run: PASS
- Node Vitest: 651/651 PASS
- Worker Vitest: 7 files / 26 tests PASS

## Remaining boundary

This is not a G4 close. Movement uses the real flat-run Rapier fixture, while hitscan and grenade collision still use deterministic evidence ports rather than accepted real-map combat collision. That limitation is visible in the product route and recorded in the evidence contract.
