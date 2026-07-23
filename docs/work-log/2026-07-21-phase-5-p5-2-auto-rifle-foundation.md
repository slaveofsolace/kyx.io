# Phase 5 P5.2 Auto Rifle foundation

Date: 2026-07-21 (America/Chicago)  
Status: **PURE AUTHORITY STATE-MACHINE PASS; ROOM INTEGRATION AND G4 OPEN**

## Implemented boundary

`src/authority/combat/autoRifle.ts` provides an immutable authority-tick state machine for the first rifle benchmark. Its explicit implementation fixture pins:

- 20 Hz authority;
- 10 reference damage, one pellet, 1.0 head/limb multipliers, and 120,000 mm range;
- 50-round magazine and 150-round reserve;
- two-tick cadence, 60-tick reload, and four-tick equip/ready delay;
- exactly-once reload transfer at completion;
- fire/sprint cancellation only before transfer, with death always cancelling;
- auto reload, sprint fire blocking, and four ready ticks after sprint release;
- room-owned seed and a deterministic 12-shot recoil/spread pattern bounded from 0 to 1,146 milli-degrees.

The state machine includes `holstered`, `equipping`, `ready`, `firing`, `recovering`, `reloading`, `sprinting`, `empty`, and `dead`. Accepted fire consumes ammunition and starts cadence atomically. Inputs contain only room-normalized life/selection state and fire/reload/sprint intent; transform, origin, hit, damage, ammo, cooldown, and frame-time claims are rejected as unknown fields.

## Current proof

- focused Auto Rifle tests: **11/11 PASS**;
- combined P5.1/P5.2 combat tests after root review: **20/20 PASS**;
- full authority unit checkpoint reported by the implementation lane: **34/34 PASS**;
- application and Worker TypeScript: **PASS** at the handoff checkpoint;
- targeted combat ESLint: **PASS**.

The suite covers exact cadence boundaries, held fire, empty/auto reload, manual partial reload, exactly-once transfer, fire/sprint/death interruption ordering, post-sprint and post-death readiness, deterministic output across simulated render rates and distinct room seeds, replay/stale tick and input rejection, immutability, and forged-field rejection.

## Explicit non-claims

- This state machine is not stored or advanced by `AuthoritativeRoom` yet.
- `referenceDamagePoints` is content binding only; no hitscan, rewind, hit volume, occlusion, or damage application is performed here.
- The temporary implementation fixture must be replaced by a validated versioned ruleset revision before the product room enables it.
- No protocol command, reliable combat event, HUD, VFX, audio, animation, two-browser proof, or G4 acceptance is claimed.
