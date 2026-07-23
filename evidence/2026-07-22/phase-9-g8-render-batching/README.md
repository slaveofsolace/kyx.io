# Phase 9 / G8 render batching foundation

Status: `BOUNDED_OPTIMIZATION_PASS` / `G8_OPEN`

This slice reduces the current Offline Practice scene's static-object submission cost and makes the performance harness fail closed for any would-be qualifying soak. It is not a final-map, final-character, real-GPU, named-tier, or 30-minute performance pass.

## Product change

- Repeated conduit and perimeter marker bulbs are emitted as color/radius keyed `InstancedMesh` batches.
- Orbital-ring nodes and decorative rubble are instanced.
- Repeated supply-crate hull, band, and status-strip geometry is instanced while preserving separate invisible CPU raycast proxies and the existing precomputed collision boxes.
- Town-building bodies use one wall material; their separate roof shell remains the visible roof treatment. This removes redundant six-face material groups.

## Harness hardening

- `--qualifying-candidate` now requires at least 30 active minutes, 60 seconds of warmup, a headed browser, a non-software renderer, `--final-integrated-build`, at least eight declared players plus bots, and complete named-machine metadata.
- A long run without that explicit contract remains `NON_QUALIFYING_INSTRUMENTATION_SMOKE`.
- Captures now record deterministic movement/fire/jump/ability activity, warmup separately from the active window, renderer/resource ranges, Chromium interval work, memory/DOM/listener trends, payload size, and explicit budget signals.
- GPU timer queries, authoritative room-tick p99, final visibility/readability, and leak verdicts remain separate required evidence.

## Preserved smoke-v1

- Scope: 1280x720, low preset, Chromium SwiftShader, 2-second warmup, 5-second active capture, one local player plus seven bots.
- Capture structural checks: 14/14 PASS.
- Independent verifier: 22/22 PASS.
- Active render calls: minimum/p50 437, p95/max 619.
- Visible triangles: 126,770, within the provisional low-tier 700,000 ceiling.
- Scene objects: 1,710.
- The earlier preserved instrumentation smoke recorded a steady 785 calls and 2,119 scene objects. Because the new harness additionally drives fire/jump/ability activity, this is a directional comparison rather than a controlled final benchmark.

## Honest failures retained

- Active frame p95: 100 ms under SwiftShader; non-qualifying and above 16.67 ms.
- Active long tasks over 50 ms: 29; fails the no-recurring-long-task signal.
- Active draw-call maximum: 619; above the provisional low-tier maximum of 300.
- First-playable observed transfer: 13,557,909 bytes; above the low-tier 12,000,000-byte target.
- G8 remains open.

Primary files:

- `smoke-v1/runtime-instrumentation.json`
- `smoke-v1/independent-verification.json`
- `smoke-v1/active-match.png`
- `test-results/verification.txt`

## SHA-256

- `src/world/World.js`: `795515f1b2ee8c9084b01735abae0eb3f396c5332ac770149c9ed201ed8955fb`
- capture tool: `20892e87ec5fa85c10334ad35454cd454c64e95e23c90399ad9a6c358fb792b4`
- verifier: `bb1d3b53ed9b9d8c30727b238254bf98157dda8d5f641533d1bbff0d055d5a9f`
- capture JSON: `cbd305d4601a42801166e641a628783249f8906c6c62abe54b088d287a7d2619`
- independent verification: `3477ddc22b690559039018e5849c9d4ca69e861f20bafa062c46be1a363a2c28`
- screenshot: `51340e495511af226c3575adad88d1b770b9f1959ffb3f03b5d4cdb234863153`
