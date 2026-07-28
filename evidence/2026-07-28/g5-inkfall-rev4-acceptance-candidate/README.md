# Inkfall Foundry Rev4 acceptance-candidate evidence

Date: 2026-07-28

Profile: `g5-inkfall-foundry-rev4-revision-3-authority-v1`

Map: `inkfall_foundry@3`

Presentation:
`inkfall_foundry@3/press_archive/v4.1/spatial-material-joined`

Status: **technical acceptance candidate; human review pending; G5 is not
self-granted.**

## What the runtime proved

- Eight separate Chrome processes joined one real local Durable Object room.
- The same room was observed at 2, 4, and 8 active clients at common authority
  ticks 84, 2681, and 3030.
- Eight exact, unique, capsule-clear locked spawns were used with a 4-blue /
  4-red distribution.
- Live movement, prediction, peer interpolation, map collision/occlusion,
  authoritative rifle damage, death, score/feed, impulse grenade, teleport,
  mismatch rejection, and reconnect/resume were exercised.
- Resume kept the same player and match, preserved score/feed, rotated and
  redacted the token, and replayed no confirmed presentation event.
- The alternate Ink Channel runtime traversal needed zero driver recoveries.
- 1,680 active-client frame intervals were sampled. The maximum p95 was 2.0 ms,
  maximum p99 25.8 ms, maximum observed frame 25.9 ms, and maximum reliable
  event delivery 91 ms. There were zero frames over 50 ms, zero long tasks, and
  zero missed authority scheduler ticks in this local headless run.
- The independent verifier checked 27,382 normalized wire entries, 16 hashed
  artifacts, and 105 frozen source files.

Verifier status:
`EVIDENCE_INTEGRITY_VERIFIED_ACCEPTANCE_CANDIDATE`

Proof SHA-256:
`73d3efce34857a996c16d8426b36619675ab9cbf27f63a6e2450af5b7ba4cd47`

Artifact manifest SHA-256:
`1e28d02afdae73b4c4cf087ad63bbe20aea74a91b1da391ab5d62a3481c0517e`

Normalized wire log SHA-256:
`762b5b9e6473abb24b1cf4ae1d46a69510bd9f1db25c00e31a5a09cb1b4f43b8`

## Visual evidence

- `visual/press-archive-rev4-clean-archive-rise.png`
  (`f3f58f08928a8a1c5e3f4f5a9864c91571b378c33c2736247a9d7d52520f41e7`)
- `visual/press-archive-rev4-clean-archive-landing.png`
  (`f543dab35ccce2c7304a1dcbe5dfec2b5809aa41170a6f863743caa8541a8238`)
- `visual/press-archive-rev4-rev3-authority-overlay.png`
  (`83e615d3b681063765a7c800761f4145d2dfa8313726af6b51b2564947df4cc1`)
- `runtime-2-4-8-v1/screenshots/p515-11-runtime-evidence-board.png`
  is the derived summary; the proof, wire log, and artifact manifest are the
  authoritative evidence.

## Exact reproduction

```powershell
node tools/evidence/capture-phase5-p515-inkfall-product-population.mjs `
  evidence/2026-07-28/g5-inkfall-rev4-acceptance-candidate/runtime-2-4-8-v1 `
  --profile=g5-inkfall-foundry-rev4-revision-3-authority-v1

node tools/evidence/verify-phase5-p515-inkfall-product-population.mjs `
  evidence/2026-07-28/g5-inkfall-rev4-acceptance-candidate/runtime-2-4-8-v1 `
  --profile=g5-inkfall-foundry-rev4-revision-3-authority-v1
```

The capture output directory must not already exist.

## Remaining nonclaims and blockers

- No human 2/4/8-player fun, readability, spawn-safety, or visual approval was
  performed. G5 remains pending that review.
- Initial live spawns are authoritative, unique, capsule-clear, and
  team-distributed, but their package status remains
  `capsule_clear_unscored`; dynamic live enemy-LOS spawn scoring is not claimed.
- The Rev4 Three.js inspection route renders the presentation GLB over separate
  authority; the online combat client remains the authority-plane renderer.
  Full 3D online presentation is not claimed.
- The visual inspection's software/headless frame measurement is explicitly
  unqualified for shipping hardware. The separate online-client profile above
  is the measured 2/4/8 performance result.
- The map package intentionally has zero pickups. No pickup gameplay claim is
  made.
- The saved map teleport trigger remains `contract_only`; the runtime proof
  exercises the server-authoritative teleport ability, not that map trigger.
- No authenticated staging, external capacity, production deployment, release
  readiness, G3, G4, G5, or human acceptance claim is made.
