# G3 source-frozen 2/4/8-player candidate

This directory contains the final bounded G3 runtime candidate captured on
2026-07-26. It is evidence for authoritative movement, population, transport,
reconnect/resume, and the shared authority clock. It does not claim G4, G5, or
human visual acceptance.

## Canonical run

- Run: `runs/local-v20`
- Captured from base HEAD: `d324ee304ec70411c33e66ea8267410e76398c0f`
- Runtime: Node `v24.14.0`, Windows x64, system Google Chrome
- Product route: `/online`
- Authority profile: `p511-inkfall-foundry-revision-2-combat-v1`
- Map: `inkfall_foundry@2`
- Clients: eight isolated browser contexts in eight distinct Chrome processes
- Common room-wide authority ticks: 2 players `79`, 4 players `2110`,
  8 players `2461`
- Capture status: `BOUNDED_PASS`
- Independent verification: `PASS`

The proof contains 77 source hashes and records an unchanged HEAD and dirty-tree
fingerprint across the capture. Resume tokens are never stored; only SHA-256
digests are present.

## Reproduce

Run from the repository root with ports `5173` and `8787` free:

```text
node tools/evidence/capture-phase5-p515-inkfall-product-population.mjs evidence/2026-07-26/phase-4-g3-source-frozen-2-4-8/runs/<fresh-run-name>
node tools/evidence/verify-phase5-p515-inkfall-product-population.mjs evidence/2026-07-26/phase-4-g3-source-frozen-2-4-8/runs/<fresh-run-name>
```

The capture refuses to overwrite an existing run. The verifier likewise writes
`independent-verification.json` once and refuses to overwrite it.

## Verified bounds

- 8 product clients, 8 browser contexts, 8 distinct browser processes
- exactly one primary-fire press and one later release for each population
  stimulus
- at-least-once wire delivery with exactly-once logical application
- 0 rejected snapshot ACKs and 0 snapshot-debt evictions
- maximum snapshot ACK debt: `740 ms` (bound `1000 ms`)
- missed scheduler ticks: `59` (bound `60`)
- maximum observed queue depth: `15` (bound `16`)
- movement support casts: `16969` for `7850` movement calls
- active-match checkpoint writes: `283` (derived bound `320`)
- authoritative collision occlusion, damage/death/score/feed, teleport
  presentation, reconnect/resume, token rotation, and mismatch fail-closed pass
- 23,955 normalized wire records and 11 runtime screenshots

## Artifact integrity

- Proof SHA-256:
  `2ae703f604bf9e6a3fad63f1766899d8178c7b431f04217915ea9aa28545b4c3`
- Manifest SHA-256:
  `363821494697586bbbff9e0daa9c7191efd399becf4a532455e6df0fd0749962`
- Wire log SHA-256:
  `7a7c008c2e73ddeca6fd3ad350c4eaccd09f0131be77ba8562e5f19d2eda88dd`

## Deliberate non-claims

- G3 still requires explicit human acceptance.
- G4 and G5 are not accepted by this run.
- The run models eight actively scheduled player machines; it does not claim
  backgrounded or suspended-tab robustness.
- Map fun/readability and final visual quality require separate human review.
