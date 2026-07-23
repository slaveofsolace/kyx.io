# Phase 6 P6.3 runtime map evidence

Status: **P6.3 package/loader/collider slice PASS; whole P6.3 and G5 remain open**

Repository HEAD during capture:
`81aa1d02acce8e30ba411bb895901d2d2ac6694e`

The worktree was intentionally dirty and was preserved. See `environment.json`
for the captured status. No deploy was performed.

## Evidence contract

- Package: `assets/source/maps/inkfall-foundry/runtime/map.package.v1.json`
- Package digest:
  `a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267`
- Seed SHA-256:
  `562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63`
- Render SHA-256:
  `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634`
- Collision SHA-256:
  `40fc9fa07da89779bb2cb150cc9b642b3598fdf54d041f23d4b6ab203df2d2f0`
- Physics fixture hash: `2a0a446a0b152395`
- Runtime route: `/__test__/map` (development only)
- Browser: Chromium 149.0.7827.55, 1600x1000

`runtime-map-capture.json` is the machine-readable result. It records two actual
artifact fetches, all public read-only runtime facts, assertion results, and
zero console/page/request/HTTP errors.

`independent-verification.json` recomputes the package, seed/artifact, capture,
and screenshot identities without importing the runtime loader.

## Results

- strict manifest and package identity tests: PASS
- artifact size/hash tests: PASS
- units/origin/bounds/unknown-field rejection: PASS
- render-vs-authority role rejection: PASS
- real collision GLB to `PhysicsFixtureV1`: PASS
- 346 authority boxes plus 2 authority volumes: PASS
- deterministic Rapier world construction: PASS
- visible browser load/debug route: PASS
- production debug-route exclusion: PASS
- app, Worker, simulation-source, and simulation typechecks: PASS
- full main tests: 433/433 PASS across 43 files
- Worker isolate tests: 5/5 PASS across 2 files
- full lint: PASS
- production build: PASS; known 937.98 kB `Game` chunk warning remains
- development asset validation: PASS with 0 errors and 33 legacy warnings

## Non-claims

This is not spawn-scoring, route-tape, playtest, performance, final-art, or G5
evidence. Teleport execution is contract-only and the pickup list is
intentionally empty.

## Preserved failures

Three initial failures are retained under `failures/`: two browser assertion
defects after a visibly successful runtime load, plus one signed-zero conversion
representation regression. None was hidden or treated as passing evidence.
