# Inkfall Foundry graybox seed validation note

- Date: 2026-07-20 (America/Chicago)
- Scope: isolated P6.1 design prework only
- Result: **PASS - machine seed is internally coherent**
- Gate status: **G5 NOT ASSESSED; G6 NOT ASSESSED**

## Files checked

- `docs/design/inkfall-foundry-graybox-brief.md`
- `assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json`
- Sealed movement input: `evidence/2026-07-20/phase-3-movement-collision/movement-tapes.json`

## Node validation result

| Field | Result |
|---|---:|
| JSON parse | pass |
| Assertions | 271 passed / 0 failed |
| Seed SHA-256 | `562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63` |
| Seed bytes | 52,549 |
| Zones / nodes / links | 9 / 19 / 27 |
| Route metrics | 12; all calculation estimates inside declared HYPOTHESIS bands |
| Spawn candidates | 12; all inside bounds with at least two escape families |
| Strong positions | 3; every seed position has at least three access links |
| Sightline probes | 4; coordinate lengths recompute |
| Teleport shortcut | 8,124 mm <= 9,000 mm profile maximum; 876 mm margin |
| Graybox/render/collider artifacts | none present |

Validation reparsed the file from disk and checked:

- unique IDs and valid node-to-zone/link references;
- every node and spawn position against the declared bounds;
- every link polyline endpoint against its node and every rounded 3D link length against a fresh calculation;
- whole-graph connectivity while treating one-way links as connected for topology reachability;
- the sealed Phase 3 movement profile ID, revision, hash, `fixture_only` status, sprint/acceleration, jump, slide, and teleport sizing inputs;
- route geometry, locomotion-only distance, teleport distance, from-rest/rolling timing formula, explicit penalty, and target-band result;
- strong-position access/counter link references;
- sightline probe coordinate lengths and their still-pending raycast status;
- standing/crouched capsule, skin, door, ceiling, step, ramp, and slide-gate margins; and
- truth flags proving that runtime integration, artifacts, playtest, profiling, G5, and G6 are all false.

## Interpretation

This pass means the design seed is syntactically valid and its arithmetic agrees with its own stated model and the sealed Phase 3 profile. It does **not** validate route feel, spawn safety, sightline occlusion, collision, traversal, performance, originality review, or fun.

The `schemaVersion: 1` field belongs only to this design seed. It is not the future runtime map schema and must not be loaded by production code without the later P6.3 schema/loader work.

## Required next validation

Phase 6 still needs a Blender meter-grid graybox, separate authoritative collider package, strict runtime map schema, deterministic spawn scoring/LOS fixtures, repeated 20 Hz run/jump/slide/teleport tapes, 2/4/8-player playtests, zone/death/damage/sightline telemetry, low/high profiles, a 30-minute soak, and—later in Phase 7—one representative final-art room. Until those exist, no G5 row may be marked passed.


