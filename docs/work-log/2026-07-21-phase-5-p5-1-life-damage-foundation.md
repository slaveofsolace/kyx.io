# Phase 5 P5.1 life/damage foundation

Date: 2026-07-21 (America/Chicago)  
Status: **PURE AUTHORITY FOUNDATION PASS; ROOM INTEGRATION AND G4 OPEN**

## Implemented boundary

`src/authority/combat/life.ts` provides an immutable, deterministic combat-life service with explicit 20 Hz product rules:

- 100 health, zero shield in the G4 fixture;
- 20-tick spawn protection that ends on an accepted offensive action;
- self damage and friendly fire disabled;
- regeneration explicitly disabled;
- 200-tick assist window;
- 160-tick respawn delay;
- server-owned monotonic combat event sequences and generated semantic IDs.

The service handles shield-first overflow, protection/team/self filtering, all integer health transitions, deterministic server-sequence ordering for simultaneous damage, last-hit and assist attribution, exactly-once death, authority-only respawn, and death/respawn discontinuity metadata. It rejects stale/replayed event sequences and strict-runtime objects containing unsupported fields such as a claimed kill or client position.

## Current proof

The focused Vitest suite passes **9/9** and covers:

- shield overflow and immutability;
- spawn/self/team filters;
- deterministic simultaneous ordering, assist, and exactly one death;
- replayed server event rejection;
- early respawn rejection and exact authority-spawn input;
- assist-window expiry and protection-boundary behavior;
- protection break on accepted offense;
- explicit permissive policy variants without hidden defaults;
- ambiguous sequence, unknown-field, unresolved-policy, and tick-overflow rejection.

Targeted ESLint passes. Worker TypeScript also passed after the concurrent G3 protocol contract settled; full shared-tree regression remains owned by the active G3/G4 integration checkpoint.

## Explicit non-claims

- The service is not yet stored by `AuthoritativeRoom` and does not replace the temporary `healthPoints: 100` / `shieldPoints: 0` snapshot constants.
- No wire combat command, hitscan, projectile, score, feed, HUD, audio, VFX, or animation integration exists from this slice.
- No two-browser combat proof or G4 acceptance is claimed.
- The immutable fixture must be represented by a validated versioned ruleset revision before combat can be enabled in the product room.
