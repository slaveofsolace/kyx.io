# Phase 5 revision 3 combat implementation profile — 2026-07-21

## Verdict

**BOUNDED CONTENT-CONTRACT MILESTONE COMPLETE. G4 IS NOT PASSED.**

`revamped_classic@3` is now an explicitly addressable, recursively frozen
implementation fixture. The accepted `revamped_classic@2` remains the default,
so this change does not alter the G2 movement identity or silently opt the
product into unfinished combat.

## Identity and truth boundary

| Contract | Value |
|---|---|
| Default ruleset | `revamped_classic@2` |
| Combat fixture | `revamped_classic@3` |
| Revision 3 hash | `d5f0418d1d927370` |
| Root status | `contract_only` |
| Combat profile status | `implementation_fixture` |
| Authority cadence | 20 Hz |

The revision 3 validator requires an explicit combat profile and rejects that
profile on revisions 1 and 2. Unknown keys, malformed nested values, profile to
weapon/ability drift, and missing semantic references fail closed. The loader
continues to snapshot untrusted content into a detached recursively frozen
graph.

## Pinned fixture

- Life: 100 health, zero shield, 20-tick offense-breaking spawn protection,
  160-tick respawn, 200-tick assist window, one-health-point assist minimum,
  no friendly/self damage, and no regeneration.
- Match: TDM, 40-tick warmup, 9,600-tick active phase, 200-tick postmatch, and
  40-kill team score limit.
- Auto Rifle: 10 damage, one pellet, 1.0 head/limb multipliers, 120 m range,
  50/150 magazine/reserve, 2-tick cadence, 60-tick reload, 4-tick ready time,
  completion-tick-only transfer, bounded interruption rules, auto reload,
  sprint blocking, 0–1,146 milli-degree spread, and deterministic
  `kyx_auto_rifle_12_v1` recoil.
- Impulse Grenade: zero damage, 11 m radius, 18 m/s projectile, 8-tick ready,
  240-tick cooldown, collision-started 30-tick fuse, 120-tick lifetime, 150 mm
  swept radius, three bounces, 0.55 restitution, 0.20 friction, six owner
  immunity ticks, linear falloff, 9/7/8 m/s self/enemy/vertical impulse caps,
  and two active projectiles per player.

Melee, deployable, teleport balance, presentation IDs, authoritative room
integration, hitscan/rewind, projectile simulation, match orchestration, and
runtime behavior remain unresolved or separately scheduled. The fixture is not
a playable-content claim.

## Evidence

- Focused ruleset/content tests: **32/32 PASS** before the full shared run.
- App TypeScript and focused lint: **PASS**.
- Historical hashes remain pinned:
  `revamped_classic@1 = 75c24a622286d2b0` and
  `revamped_classic@2 = 039ae95bed7ee716`.
- The first focused run correctly failed the stale `[1, 2]` revision-list
  assertion and surfaced heterogeneous JSON import inference in the catalog;
  both were corrected without changing the default revision.

## Remaining G4 work

Wire the P5.1 life service and P5.2 Auto Rifle into authoritative room state,
then implement authoritative rewind/hitscan, the Impulse Grenade, cooldown and
projectile lifecycle, timer/score/feed/respawn, presentation confirmation,
abuse coverage, shared Node/Worker/browser determinism, and visible two-client
runtime proof. G4 remains open until that complete scope passes direct review.
