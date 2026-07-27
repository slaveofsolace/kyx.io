# Final automated verification

Status: packet-complete automated evidence for an **open G5 candidate**.

Date: 2026-07-26

Worktree:
`C:\AI Projects\Projects\Games\evio\evio-g5-inkfall-rev3`

Branch: `codex/g5-inkfall-rev3`

## Passing gates

| Gate | Result |
| --- | --- |
| App TypeScript (`tsconfig.json`) | Pass |
| Worker TypeScript (`tsconfig.worker.json`) | Pass |
| Sim-source TypeScript (`tsconfig.sim-source.json`) | Pass |
| Sim TypeScript (`tsconfig.sim.json`) | Pass |
| ESLint | Pass |
| Development asset-manifest validation | Pass: 0 errors, 33 known legacy-asset warnings |
| Vite production build | Pass: 160 modules transformed |
| Platform-independent Vitest run | Pass: 89 files, 730 tests |
| Focused G5 map run | Pass: 5 files, 23 tests |
| Product-browser authority audit | Pass: 3/3 routes, 5/5 sightlines, 12/12 spawns |
| Default-route browser check | Pass: no Rev3 review surface on `/` |
| Asset identity audit | Pass |
| Capture hash/format audit | Pass: 10 JPEGs, 1280×720 |
| Patch whitespace check | Pass |

Known non-blocking warnings:

- the repository's existing Rapier deprecated-initialization warning;
- existing legacy-asset provenance/budget warnings;
- the existing Vite large-chunk advisory.

## Full-suite Windows line-ending result

The unfiltered Vitest run completed with:

- 90 test files;
- 89 passing files;
- 736 passing tests;
- 1 failing test.

The only failure is
`tests/integration/content/inkfallGrayboxLock.test.ts` →
`recomputes every frozen source hash exactly`.

Cause: the test hashes raw checkout bytes, while nine accepted Revision 2 text
files are checked out as CRLF on Windows but locked as LF. A separate audit
confirmed:

- all nine text files exactly match their frozen SHA-256 after CRLF→LF
  canonicalization;
- all three frozen binary sources match raw bytes;
- no accepted Revision 2 source was modified to mask the platform-only gate.

The other six tests in that frozen Revision 2 lock file passed. Excluding only
that raw-byte platform gate, all 89 remaining files and all 730 tests passed.

## Revision 3 asset identity

| Artifact | SHA-256 |
| --- | --- |
| Render graybox | `19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6` |
| Collision authority | `1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8` |
| Blender source | `5e0d2549b1e642f3763f2df27213862375cad90ba9ada8353f89bfcba2864fa3` |
| Generator v2 | `ef6c40c7fb93c459f5b73b791cbe2b81af310bd4bd441fb42c03b00c20a2fa52` |

All four match the deterministic build report. The local and catalog Revision
3 package manifests are byte-identical. The report confirms:

- non-target render meshes unchanged;
- non-target colliders unchanged;
- collider cardinality unchanged;
- Revision 2 artifacts unchanged;
- topology, spawns, movement profile, and timing bands unchanged.

## Browser result

Route:
`http://127.0.0.1:4365/?mapPackage=inkfall_foundry%403`

Canonical G3 ports 5173 and 8787 were not bound.

The route reported:
`REV3_PRODUCT_BROWSER_REVIEW_READY_G5_OPEN`.

Named host profile:

- Chromium 150 / WebGL 2 / ANGLE D3D11;
- NVIDIA GeForce RTX 4090;
- 32 logical hardware threads reported;
- 1280×720 viewport at device-pixel ratio 1.25;
- 120 measured frames;
- p50 1.80 ms, p95 2.00 ms, p99 2.00 ms;
- 355 render calls and 4,568 triangles in the sampled overview;
- no route runtime errors.

This is measured browser evidence, not target-hardware or human performance
acceptance.

## Result boundary

Automated G5 map checks pass with the documented Windows raw-hash exception.
Human graybox, fun/readability, target-hardware performance, spawn-pressure,
and 2/4/8-player acceptance remain open. Revision 3 is not promoted and G5 is
not passed.
