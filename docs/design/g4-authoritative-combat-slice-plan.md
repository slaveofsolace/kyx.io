# G4 authoritative combat slice plan

Status: **PLANNING ONLY — G4 NOT STARTED OR ACCEPTED**  
Gate dependency: G3 must be independently accepted before this plan becomes the active integration path.  
Binding sources: handoff `06_COMBAT_WEAPONS_ABILITIES.md`, `07_MULTIPLAYER_AUTHORITY.md`, `15_QA_EVIDENCE_GATES.md`, and Phase 5 of `17_EXECUTION_BACKLOG.md`.

## Outcome and representative content

The first end-to-end combat slice is:

- `vertical_rifle_v1`, normalized as the Auto Rifle benchmark;
- `vertical_impulse_grenade_v1`, an authoritative projectile/AoE/impulse ability;
- authoritative player life, damage, death, respawn, match timer, score, and feed;
- predicted presentation that is always confirmed or cancelled by room events.

The Impulse Grenade is selected instead of an HE Grenade for the first projectile because the rifle already proves authoritative damage/death while the impulse projectile additionally exercises the accepted movement/collision implementation. It must still prove server-owned cooldown, projectile spawn, sweep, bounce, fuse, AoE, impulse, deduplication, and correction.

This slice does not revive or integrate the deleted legacy `NetClient.js`/`ServerSim.js` path, and it does not allow `Player.js`, Three.js, the HUD, or a client message to decide a gameplay outcome.

## Ruleset revision before implementation

Create a new ruleset revision rather than mutating revision 2 in place. Revision 2 remains the G2-bound, `contract_only` record. The new revision may become `playable_slice` only after every non-null field below has an explicit evidence label and validation test.

Use the audited official snapshot where its unit is already normalized:

| Field | Initial value | Evidence treatment |
|---|---:|---|
| Authority rate | 20 Hz | Accepted project architecture |
| Player health | 100 HP | Explicit `PRODUCT_OVERRIDE`; replaces the current room placeholder |
| Player shield | 0 | Explicit `PRODUCT_OVERRIDE` for this slice |
| Auto Rifle base damage | 10 HP | `OFFICIAL_LIVE`, node 4 |
| Auto Rifle magazine | 50 | `OFFICIAL_LIVE`, node 4 |
| Auto Rifle fire cooldown | 2 ticks / 100 ms | `OFFICIAL_LIVE`, node 4 |
| Auto Rifle reload | 60 ticks / 3 s | `OFFICIAL_LIVE`, node 4 |
| Auto Rifle pellets | 1 | `OFFICIAL_LIVE`, node 4 |
| Auto Rifle head/limb multiplier | 1.0 / 1.0 | Explicit `PRODUCT_OVERRIDE`; no unsupported universal headshot multiplier |
| Auto Rifle range | 120,000 mm | Explicit `PRODUCT_OVERRIDE`, bounded for Inkfall dimensions |
| Auto Rifle reserve | 150 rounds | Explicit `PRODUCT_OVERRIDE` |
| Respawn delay | 160 ticks / 8 s | Official later behavior cited by the reference ledger |
| Impulse damage | 0 HP | `OFFICIAL_LIVE`, node 355 |
| Impulse radius | 11,000 mm | `PRODUCT_OVERRIDE` conversion: one audited source distance unit is treated as one metre for this slice |
| Impulse projectile speed | 18,000 mm/s | `PRODUCT_OVERRIDE` conversion: 0.9 source units per 50 ms tick at one metre/unit |

The following product overrides are now pinned for the deterministic implementation fixture. They remain tunable only through a later ruleset revision and do not make G4 playable or accepted by themselves.

The machine-readable fixture is `revamped_classic@3` with immutable content
hash `d5f0418d1d927370`. `revamped_classic@2` deliberately remains the product
default until authoritative room integration and G4 runtime evidence pass.

| Policy | Pinned value | Evidence treatment |
|---|---:|---|
| Auto Rifle ready/equip | 4 ticks / 200 ms | `PRODUCT_OVERRIDE` |
| Auto Rifle spread | 0 to 1,146 milli-degrees | `PRODUCT_OVERRIDE`; the audited `0-0.02` source interval is treated as radians only for this fixture |
| Auto Rifle recoil | `kyx_auto_rifle_12_v1`, room-seeded 12-shot deterministic pitch/yaw pattern | `PRODUCT_OVERRIDE` |
| Reload interruption | Fire or sprint cancels only before the completion-tick transfer; death always cancels; transfer occurs exactly once | `PRODUCT_OVERRIDE` |
| Auto reload | Enabled when a fire intent reaches an empty magazine and reserve remains | `PRODUCT_OVERRIDE` |
| Sprint/fire policy | Firing is blocked while sprinting; four ready ticks follow sprint release | `PRODUCT_OVERRIDE` |
| Spawn protection | 20 ticks / 1 s; an accepted offensive action ends it | `PRODUCT_OVERRIDE` |
| Regeneration | Disabled | `PRODUCT_OVERRIDE` |
| Match duration / score limit | 9,600 ticks / 8 minutes; 40 kills in TDM | `PRODUCT_OVERRIDE` |
| Impulse Grenade ready/cooldown | 8 ticks / 400 ms; 240 ticks / 12 s | `PRODUCT_OVERRIDE` |
| Impulse Grenade collision | 150 mm swept sphere; world/player collision; earliest contact; maximum 3 bounces | `PRODUCT_OVERRIDE` |
| Impulse Grenade fuse | Starts at first qualifying collision; 30 ticks / 1.5 s; lifetime retirement/detonation at 120 ticks / 6 s | `PRODUCT_OVERRIDE` |
| Impulse Grenade bounce | Restitution 0.55, friction 0.20, values quantized in deterministic integer simulation | `PRODUCT_OVERRIDE` |
| Impulse Grenade owner policy | Owner collision ignored for 6 ticks, then normal; no damage, self impulse allowed | `PRODUCT_OVERRIDE` |
| Radial falloff | Linear from full impulse at center to zero at 11,000 mm | `PRODUCT_OVERRIDE` |
| Self / enemy impulse cap | 9,000 / 7,000 mm/s, collision-safe; vertical component capped at 8,000 mm/s | `PRODUCT_OVERRIDE` conversion of audited raw bounce strength `250` |
| Active projectiles | Maximum 2 per player | `PRODUCT_OVERRIDE` |

Tests must reject an enabled playable record containing `null` in any required runtime field. The first code may use a clearly labelled immutable implementation fixture while the ruleset-revision schema is being added; the room cannot enable the slice until those exact values are loaded from a validated revision rather than copied into `Player.js`, the Worker adapter, or presentation code.

## Authority ownership

The room is the only owner of:

- life state, health, shield, protection, damage ledger, assists, death, respawn eligibility, and accepted spawn;
- equipped slot, readiness state, magazine, reserve, reload transfer marker, cadence, recoil/spread seed, and accepted shot sequence;
- historical authoritative aim/pose samples and the bounded rewind calculation;
- projectile identity, origin, direction, velocity, sweep/substeps, collision, bounce, fuse, detonation, AoE, impulse, and retirement;
- match phase, remaining ticks, score, kill attribution, feed sequence, and result;
- reliable semantic event identifiers and deduplication.

Clients send intent only: held/pressed/released fire, reload, ability use, selected slot, and the existing bounded look/input sequence. There is no accepted client field for transform, shot origin, hit target, damage, detonation, death, kill, score, projectile ID, remaining ammo, cooldown completion, or respawn position.

## Implementation sequence

### P5.1 — Life and damage service

Add pure deterministic life state and one damage service. Define shield-first overflow, protection, self/team filtering, simultaneous-event order, last-hit/assist ledger, exactly-once death transition, respawn tick, and discontinuity metadata. Replace the hard-coded snapshot `healthPoints: 100` and `shieldPoints: 0` with room state. Prove death cannot be repeated and respawn cannot occur early or at a client-selected position.

### P5.2 — Auto Rifle state machine

Implement `holstered`, `equipping`, `ready`, `firing`, `recovering`, `reloading`, `sprinting`, `empty`, and `dead` transitions using authority ticks. Ammo consumption and cooldown start are one atomic accepted-shot operation. Reload transfers ammunition once at its authority marker. Deterministic recoil/spread consumes a room-owned seed and is frame-rate independent.

### P5.3 — Pose history and hitscan rewind

Retain bounded tick-resolution pose/hit-volume history. Map a command to shot time using server receipt and observed transport history, cap compensation, derive the muzzle/eye ray from the shooter’s authoritative pose, clamp aim against accepted look history, rewind targets only, test occlusion in authoritative collision, then restore without side effects. Log compensation and rejection reason without trusting a client timestamp.

### P5.4 — Impulse projectile

Spawn from an authority-derived socket with a room ID and seed. Use deterministic swept collision/substeps and resolve the earliest hit. Specify world/player/owner layers, bounce cap, fuse start, lifetime, radial falloff, collision-safe applied displacement, and exactly-once detonation. Presentation may predict a throw/trail but cannot create an accepted projectile or impulse.

### P5.5 — Ability/resource and movement integration

The room validates slot, cooldown, life/match state, weapon readiness, maximum active projectile count, and movement locks. Applied impulse goes through the existing authoritative controller/collision path and is reproduced by client reconciliation. Teleport remains the G2/G3 movement seam and receives no new unreviewed outcome authority here.

### P5.6 — Match timer, score, feed, and respawn

Drive timer and phase from authority ticks. Score derives only from the damage/death ledger. Emit ordered, stable IDs for damage, death, score, feed, and respawn events. Late join and reconnect receive the current life/weapon/projectile/match state; reliable events do not double-apply after resume.

### P5.7 — Presentation bridge

Expose separate predicted, accepted, rejected, and confirmed states. The HUD reads authoritative ammo/health/cooldown/timer/score. Hit and kill markers require confirmed event IDs. Muzzle flash, audio, animation, tracer, impact, projectile, impulse, damage direction, reload, death, and respawn markers must have deterministic fixture states and reduced-motion/reduced-flash alternatives. Missing art may use clearly labelled diagnostic presentation during implementation, but G4 cannot pass until marker alignment is directly visible and audible in runtime evidence.

### P5.8 — Deterministic and abuse suite

At minimum, automate:

- cadence boundary, held fire, empty magazine, reload transfer, reload interruption, dead/sprinting/not-ready fire;
- invalid weapon/slot, forged origin, impossible aim delta, stale/future/replayed sequence;
- forged hit/damage/death/kill/score/projectile/detonation messages rejected at schema and room boundaries;
- rewind inside/outside cap, occlusion, simultaneous shots, self/team policy, exactly-once death and score;
- projectile tunnelling, earliest contact, bounce/fuse/lifetime, owner policy, radial falloff, collision-safe impulse, maximum active count, duplicate detonation;
- loss/reorder/duplicate delivery without duplicate ammo, damage, effect, death, score, feed, or cooldown completion;
- reconnect/full snapshot with active reload, active projectile, dead player, respawn countdown, and in-progress match;
- deterministic replay hash across Node, Worker isolate, and the development browser evidence route.

Every failure attempt is retained under a dated evidence folder. A later passing run never erases the failure.

### P5.9 — Runtime proof

Capture one reproducible room with two real browser clients and the authority runtime. The proof must visibly show:

1. both clients in the same room and match phase;
2. accepted automatic fire, authoritative ammo/cadence, reload, and deterministic hit/damage;
3. death, score/feed, respawn countdown, and authoritative respawn on both clients;
4. an Impulse Grenade projectile, collision/detonation, and reconciled movement on both clients;
5. forged damage/kill/origin and fire-spam probes failing closed without corrupting the honest clients;
6. latency/loss/reorder/duplicate profiles with no duplicate consequences;
7. debug evidence naming the exact ruleset revision and normalized values;
8. confirmed HUD/VFX/audio/animation markers aligned with the event stream.

Record machine-readable room/client metrics, structured command/event traces, screenshots, and video. Close all local services after capture. Local two-browser evidence may prove implementation behavior, but WSS/auth/origin/observability requirements remain governed by G3/G9 and cannot be silently inferred.

## G4 decision rule

G4 is accepted only if every P5.1–P5.9 artifact is current and independently inspected, the full main and Worker suites are green, build/typecheck/lint are green, the two-browser runtime proof is reproducible, and all G4 bullets in `15_QA_EVIDENCE_GATES.md` are directly supported. Unit tests, schemas, ruleset JSON, screenshots, or a polished local legacy match cannot substitute for that proof.
