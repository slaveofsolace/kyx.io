# P6.6 work log — deterministic synthetic authority playtest

## Scope

Direct-only `src/authority/playtest/` runner; real accepted Inkfall package, 346-box Rapier authority fixture, Phase 3 movement profile, P6.4 saved spawn selection, and P6.5 telemetry. No Worker, network, combat, legacy, product runtime, G3, or map-package mutation.

## Attempt 1 — preserved unrefined harness

- Raw artifact: `failures/attempt-1-unrefined-synthetic-tapes.json`
- Suite hash: `8f8875d5ada6a25f`
- Result: 59 issues.
- Harness/tape issues identified before interpreting map quality:
  - Ink timing tapes used crouch on a link whose governing metric explicitly uses `runLinkIds`, producing 11.10/11.35 s. The band was not changed; the tape was corrected to run.
  - The recovery/kill priority probe used the standing capsule instead of the already-accepted crouched P6.3 probe shape.
  - West/east tape start delays caused avoidable analytical body convergence.
  - Repeated snag windows produced duplicate issue rows; raw snag counts remain preserved, while summary issues are now one per waypoint.
- Persistent findings already visible: west Archive depenetration, east/west Archive snags, and failed teleport landing.

## Attempt 2 — immutable corrected harness

- Raw artifact: `failures/attempt-2-corrected-harness-persistent-map-findings.json`
- Suite hash: `76fd1f528b60dd2c`
- Result: 16 issues; statuses `PASS`, `PASS`, `FAIL`.
- Corrections were limited to the four harness categories above. Governing bands, snag thresholds, seed, package, collider fixture, and movement profile were unchanged.
- 2-player and 4-player scenarios became clean passes. Archive and teleport failures reproduced.

## Attempt 3 — enriched diagnostics

- Raw artifact: `failures/attempt-3-enriched-persistent-map-diagnostics.json`
- Added exact failure position, target, velocity, support, current contact, and teleport from/to recording; functional thresholds were unchanged.
- Confirmed two independent west Archive outcomes (exception and zero-velocity snag), east Archive terminal-node snag, and a partial teleport followed by recovery/kill entry.

## Final saved result

- Raw: `authority-playtest-raw.json`
- Summary: `authority-playtest-summary.json`
- Suite hash: `cec7553cd9d45701`
- Scenario replay hashes: `0f7f6c2965a594c6`, `88ce02f1c029c9d9`, `c47c2acd6ab3541e`
- The final teleport tape uses a strict authored-entry activation point, aims at the authored exit, and uses only the authored 4 m landing-clearance tolerance. It records `map_collision_module_press_reactor_south` as the cast blocker.
- Final state remains partial; no geometry or topology correction was made.

## Verification

- Dedicated deterministic regression: 8/8 tests passed.
- Full authority matrix: 111/111 tests passed across 13 files.
- P6.6 TypeScript diagnostics: 0.
- P6.6 ESLint errors/warnings: 0/0.
- Project TypeScript (`tsconfig.json`): PASS with zero diagnostics on final rerun.
- Write-disabled production build: passed; no P6.6 runner status/agent markers appeared in 14 emitted chunks.
- Machine-readable record: `p6-6-verification.json`.

## Required boundary

These are deterministic synthetic agents, not people. Passing tapes do not establish fun, readability, visual acceptance, P6.7 topology lock, final art, or G5 acceptance.
