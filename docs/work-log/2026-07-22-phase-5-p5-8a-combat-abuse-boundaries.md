# Phase 5 P5.8A deterministic combat abuse boundaries

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED TEST SLICE PASS; P5.8, P5.9, AND G4 REMAIN OPEN**

## Governing acceptance contract

The binding handoff requirement is Phase 5 P5.8 in
`codex_handoff_pack_20260719_v2/17_EXECUTION_BACKLOG.md`: add a
cadence/ammo/origin/aim/kill/damage/duplicate abuse suite. The expanded current
contract is `docs/design/g4-authoritative-combat-slice-plan.md`, P5.8 lines
115-128. It requires automation for:

1. Rifle cadence, held fire, empty/reload/interruption, and fire locks;
2. invalid weapon/slot, forged origin, impossible aim, and hostile sequences;
3. forged hit/damage/death/kill/score/projectile/detonation messages at schema
   and room boundaries;
4. rewind, occlusion, simultaneous shots, damage policy, and exactly-once
   death/score;
5. the full deterministic Impulse Grenade behavior matrix;
6. combat consequences under loss/reorder/duplicate delivery;
7. reconnect snapshots spanning active reload/projectile/death/respawn/match;
8. one replay hash matching Node, Worker isolate, and the development browser
   evidence route.

The contract also requires every failed evidence attempt to remain retained.
P5.9 and the G4 decision rule separately require reproducible two-real-browser
runtime proof and cannot be replaced by this suite.

## Implemented bounded slice

This slice adds one test-only authority boundary file. It does not change the
protocol, Worker, authority implementation, Inkfall files, character assets,
G3 evidence, or the sealed P5.7 adapter.

The new matrix proves:

- forged `Kill`, `Damage`, `SetScore`, `Hit`, `Death`, `Projectile`, and
  `Detonation` command facts are rejected by both `validateClientMessage` and
  `AuthoritativeRoom.enqueueInputBatch`;
- forged weapon, origin, direction, target, damage, kill, score, projectile,
  detonation, and cooldown fields on an otherwise-valid input command fail as
  unknown fields before reaching the room queue;
- invalid slot and impossible per-command yaw/pitch deltas fail protocol bounds;
- sequence lead and client-tick lead attempts are rejected by the room queue and
  counted under stable reasons without changing combat state;
- duplicated sequence 0, duplicated reordered sequence 2, and a replayed stale
  sequence do not duplicate accepted shots or ammo consumption;
- two independent duplicate/reorder traces produce the same recursively
  serializable result and the same portable FNV-1a-64 digest in Node.

## P5.8 coverage audit

| P5.8 minimum | Current evidence | State after P5.8A |
|---|---|---|
| Rifle cadence/ammo/reload/fire locks | Existing `autoRifle.test.ts` covers all named transitions; the new trace adds room-level duplicate/reorder ammo integrity. | **Covered at deterministic Node/room seam** |
| Invalid weapon/slot, origin, aim, hostile sequence | Protocol and room reject forged weapon/origin fields, invalid slot/look bounds, and hostile sequence/tick lead. Rewind tests already prove authoritative origin and body-relative aim clamping. A real accepted/rejected loadout path is not wired into the combat room; the Worker currently rejects all loadout requests as `COMBAT_NOT_IMPLEMENTED`. | **Partial; real loadout authority remains open** |
| Forged combat outcomes | Seven forged command families and ten forged outcome fields now fail at both schema and room input boundaries without state mutation. | **Covered for the current input boundary** |
| Rewind/life/score matrix | Existing rewind, life, room hitscan, and TDM suites cover cap, outside-cap failure, occlusion, stable simultaneous order, self/team policy, and exactly-once death/score. | **Covered at deterministic Node/room seam** |
| Projectile matrix | Existing Impulse Grenade suites cover swept whole-tick translation/earliest contact, bounce, fuse, lifetime, owner expiry, falloff, collision-safe impulse, active cap, and duplicate detonation rejection. | **Covered at pure/room fake-world seam; rendered/runtime proof open** |
| Loss/reorder/duplicate consequences | New room trace covers duplicate/reordered fire, accepted-shot IDs, and ammo. Generic queue/reliable-event suites exist. | **Open for full loss profiles and damage/effect/death/score/feed/cooldown consequence parity** |
| Composite reconnect snapshot | Existing tests separately cover combat resume, TDM reconnect, and P5.7 snapshot non-replay. | **Open for one active-reload + active-projectile + dead/respawn-countdown + in-progress-match scenario** |
| Node/Worker/browser replay hash | New trace repeats identically in Node with a portable hash function. | **Open across Worker isolate and development browser route** |

## Executed evidence

- First focused development run: **18/19**, with one harness expectation using
  sequence 1,000 even though the declared default lead ceiling is 1,024. The
  queue correctly accepted it. The probe was moved beyond the declared ceiling
  to sequence 2,000; the failed run remains recorded here.
- Corrected focused P5.8A run: **19/19 PASS** in one file.
- Bounded combat/abuse matrix: **201/201 PASS** across 15 selected files.
- Current full shared-tree Vitest: **606/606 PASS** across 62 files.
- Application TypeScript graph: **PASS, zero diagnostics**.
- Focused ESLint: **PASS, zero errors and zero warnings**.

New artifact hash:

| File | SHA-256 |
|---|---|
| `tests/unit/authority/combat/p58AbuseBoundaries.test.ts` | `e99b3004b46f5adb520356fc713b1fedf00ae9865200f12686ebb9d7a277043a` |

The P5.7 seal remains unchanged:

| File | Preserved SHA-256 |
|---|---|
| `src/client/combat/presentationAdapter.ts` | `b32eef1afc9e3dcd2a62413d6677f428e18b280b29a935f7c78361d7291b17e1` |
| `tests/unit/client/combat/presentationAdapter.test.ts` | `214887d86ee7d96ff890f3383e914f665dab1e0c454366e25dd28fc2b40f9a5a` |
| `src/client/combat/index.ts` | `6465fce04a7676462508d3914b1a6f6181e9ca7b08e872fd55806ccfe8e64aa5` |
| `src/client/index.ts` | `9681e1bc8c4e1281a1edb9ab299388544af1bb937ec2a385ed3d5d4d828863fb` |

## Exact remaining boundary

P5.8 is not complete until the open matrix rows above have executable evidence,
especially full combat-consequence impairment, the composite reconnect case,
and the identical replay hash across Node, Worker isolate, and browser route.

P5.9 remains wholly runtime-facing: two real isolated browser clients in one
authority room must visibly prove Rifle fire/ammo/reload/hit/damage,
death/score/feed/respawn, Impulse Grenade collision/detonation/reconciled
movement, forged probes, latency/loss/reorder/duplicate profiles, exact ruleset
identity, and aligned HUD/VFX/audio/animation markers. Machine-readable traces,
metrics, screenshots, and video are required.

Therefore neither this P5.8A pass nor the wider existing unit suite passes P5.8,
P5.9, or G4.
