# G4 source-frozen vertical combat candidate

Status: `BOUNDED_PASS`

Gate claim: `G3_G4_ACCEPTANCE_CANDIDATE_G5_NOT_CLAIMED`

This packet is the retained source-frozen G4 runtime candidate. It extends the
pushed G3 population runtime with truthful authoritative Impulse Grenade
semantics, wire projection, client presentation, and a real Inkfall Foundry @2
collision/impulse proof.

## Retained run

- Run: `runs/local-v11`
- Room: `KYX-UDUDWC`
- Product clients: 8 isolated browser contexts in 8 distinct browser processes
- Normalized wire records: 29,336
- Screenshots: 14
- Source hashes: 95
- Manifested runtime artifacts: 16
- Proof SHA-256: `01c9f8cdd078e75b39b60fd8bee8d4fb30e788f1841bf7f08d76b69df85f115e`
- Manifest SHA-256: `d26ae87af9aee096d50b87eb08c935ae7088eb8a00d1f25ec6a297747249023b`
- Wire SHA-256: `79be54564db7af25853f97127d778e14c64b89625610883d96d2167ef315536c`
- Repository state during capture: unchanged at
  `145264d7d72e2dc1be63eddc355edf4e5d5e2cac` plus the disclosed G4 dirty set

## What the runtime proves

- Exact Inkfall Foundry @2 profile, map binding, eight initial spawns, and
  fail-closed profile mismatch before socket creation.
- Real server-owned rifle hit, damage, death, score, feed, teleport, and secure
  resume behavior.
- Real authoritative crouch input (`C`) with pressed, held, and released wire
  edges.
- Accepted grenade throw, projectile spawn, guard-rail collision, fuse start,
  detonation, projectile cleanup, and zero health damage.
- Server-resolved enemy impulse at 1,933 mm from the detonation with 824 permille
  falloff and 1,021 mm observed victim displacement.
- Truthful `projectileSpawned`, `projectileCollided`, `projectileDetonated`, and
  `impulseApplied` reliable-event projection.
- At-least-once reliable transport with exactly-once logical cue application on
  both participating clients.
- Two-, four-, and eight-client shared authority clock evidence with no missed
  scheduler ticks, no acknowledgement rejection, no acknowledgement-debt
  eviction, and no socket closure.
- Stable repository HEAD, dirty-tree fingerprint, and all 95 hashed source files
  throughout capture.

## Verification

Run:

```text
node tools/evidence/verify-phase5-p515-inkfall-product-population.mjs evidence/2026-07-26/phase-4-g4-source-frozen-vertical-combat/runs/local-v11
```

The independent verifier returned `PASS`; its retained summary is
`verification.json`.

## Final regression

- Main suite: 88 files, 737 tests passed.
- Worker suite: 10 files, 42 tests passed.
- Main, Worker, simulation-source, and simulation typechecks passed.
- Full lint and production build passed.
- Production truth surface: 54 checks passed.
- Legacy relay verifier: 28 checks passed.
- Phase 2 boundary verifier: 10 checks passed.
- Asset validation: 0 errors; 33 disclosed legacy warnings remain outside this
  bounded G4 claim.
- Wrangler 4.112.0 dry-run packaged 34 static assets and the Durable Object
  Worker without publishing.
- `git diff --check` passed.

## Human review entry points

- `screenshots/p515-04a-grenade-throw-accepted.png`
- `screenshots/p515-04b-grenade-collision-fuse.png`
- `screenshots/p515-04c-grenade-impulse-confirmed.png`
- `screenshots/p515-09-eight-product-clients.png`
- `screenshots/p515-11-runtime-evidence-board.png`

## Explicit non-claims

- This packet does not claim formal human acceptance of G3 or G4.
- This packet does not claim G5 map acceptance or erase the retained canonical
  press-cross traversal defect.
- This packet does not claim final art, broad playtest acceptance, matchmaking,
  progression, packaging, deployment, or release readiness.
- Human visual review remains separate.
