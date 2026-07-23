# Inkfall Foundry P6.3 runtime-integration report

Date: 2026-07-21 (America/Chicago)  
Verdict: **DELEGATED P6.3 PACKAGE/LOADER/COLLIDER SLICE COMPLETE**  
Whole P6.3 backlog verdict: **PARTIAL**  
G5 verdict: **NOT PASSED**

## What is complete

The accepted P6.2 render and collision exports now have a versioned, strict
runtime package at `runtime/map.package.v1.json`. The package binds the immutable
P6.1 seed, map units/origin/bounds, distinct render and authority artifact roles,
exact byte sizes and SHA-256 hashes, zones, spawn candidates, intentionally empty
pickup data, one teleport trigger contract, and recovery/kill volumes.

The runtime loader:

- snapshots and validates untrusted manifest JSON without invoking accessors;
- rejects missing and unknown fields at every package layer;
- verifies a canonical package identity digest before artifact loading;
- copies artifact bytes before asynchronous SHA-256 verification;
- requires exact artifact byte sizes and hashes;
- accepts GLB 2.0 with one JSON and one embedded binary chunk only;
- requires all render nodes to use the `R_` / `render_graybox` role;
- requires all authority nodes to use the `C_` / `authoritative_collider` role;
- accepts only one centered primitive box per authority node and validates its
  position-accessor bounds against the authored integer dimensions;
- converts the GLB X-east/Y-up/-Z-north basis into project X-east/Y-up/Z-north;
- outward-quantizes odd box dimensions by at most one millimeter;
- fails if a quantized collider exceeds declared map bounds;
- constructs the current deterministic `PhysicsFixtureV1` and Rapier world from
  collision bytes plus authority volumes only.

The loader verifies render bytes, but the returned authority structure contains
only the converted collision fixture. Render bytes and render nodes never enter
the fixture conversion function.

## Saved runtime identity

| Field | Value |
|---|---|
| Map | `inkfall_foundry@1` |
| Package digest | `a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267` |
| Bounds | `[-36000,-5000,-28000]` to `[36000,10000,28000]` mm |
| Render GLB | 613564 bytes, SHA-256 `90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634` |
| Collision GLB | 614548 bytes, SHA-256 `40fc9fa07da89779bb2cb150cc9b642b3598fdf54d041f23d4b6ab203df2d2f0` |
| Render mesh nodes | 346, presentation only |
| Authority box colliders | 346 |
| Authority volumes | 2 (`kill`, `recovery`) |
| Total authority colliders | 348 |
| Physics fixture hash | `2a0a446a0b152395` |
| Zones | 9 |
| Spawn candidates | 12, capsule-clear but unscored |
| Pickups | 0, intentionally empty for this slice |
| Trigger contracts | 1 teleport, execution still contract-only |

## Visible development proof

Development route: `/__test__/map`

The route fetches both saved GLBs, runs the full package loader, and draws a
top-down diagram generated from the converted authority fixture. It exposes a
read-only serialized `window.__KYX_MAP_EVIDENCE__` surface; it does not expose
artifact bytes or the mutable Rapier world. The route is gated by
`import.meta.env.DEV`; a production build contains no P6.3 map debug/package
strings and no Inkfall GLB.

Evidence:

- `evidence/2026-07-21/phase-6-p6-3-runtime-map/runtime-map-capture.json`
- `evidence/2026-07-21/phase-6-p6-3-runtime-map/screenshots/inkfall-map-runtime.png`
- screenshot SHA-256:
  `49fa2f37fce2db1c9892c725404415cac614d1053836f1c4e207881fc50e4c71`
- Chromium 149.0.7827.55 at 1600x1000
- both artifact responses HTTP 200; no console, page, request, or HTTP errors
- independent saved-evidence verification:
  `INDEPENDENT_P6_3_RUNTIME_EVIDENCE_PASS`

## Automated proof

- Map schema/identity and real-GLB/Rapier integration: **11/11 PASS**
- Development browser route: **1/1 PASS**
- App, Worker, simulation-source, and simulation TypeScript targets: **PASS**
- Full main suite: **433/433 PASS** across 43 files
- Worker isolate suite: **5/5 PASS** across 2 files
- Full repository lint: **PASS**
- Production Vite build: **PASS**, with the pre-existing 937.98 kB `Game` chunk
  warning; the P6.3 dev route and Inkfall artifacts are absent from `dist`.
- Development asset validation: **PASS with 0 errors and 33 preserved warnings**
  on unresolved legacy assets; no warning is attributed to this runtime package.

## Explicit remaining boundary

This report does not claim complete P6.3 gameplay behavior or G5:

- teleport trigger execution remains `contract_only`;
- pickup population/content policy is intentionally empty;
- P6.4 spawn scoring, all-enemy LOS fixtures, and score visualization remain;
- P6.5 route/death/damage/sightline/occupancy telemetry remains;
- P6.6 authoritative run/jump/slide/teleport tapes and 2/4/8-player playtests
  remain;
- P6.7 graybox lock and modular art-kit dimensions remain;
- no final-art room, combat readability verdict, no-snag/escape runtime proof,
  performance capture, or human fun/readability acceptance exists;
- G5 remains **NOT PASSED**.

The immutable P6.1 seed, accepted P6.2 source/exports, and every P6.2 failure
artifact remain preserved. No production deployment was performed.
