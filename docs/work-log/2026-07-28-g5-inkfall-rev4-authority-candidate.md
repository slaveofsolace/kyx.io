# G5 Inkfall Foundry Rev4 authority candidate

Date: 2026-07-28

Branch: `codex/g5-inkfall-rev4-20260727`

## Outcome

Inkfall Foundry Revision 3 and the Press Archive Rev4.1 presentation now have
an explicit opt-in authoritative product profile. It pins separate render and
collision roles, the exact fixture/package identity, 339 collision solids, 12
spawns, 9 zones, zero pickups, the teleport trigger contract, telemetry
counters, combat ports, and active checkpoint/resume behavior. Default map
selection remains unchanged.

The separately executable Rev4 vertical route traverses Press Hall through the
west ascent into Paper Archive against the real Rapier collision fixture. The
real product-client run populated one room with 2, 4, and 8 independent Chrome
processes and exercised movement, combat, collision/occlusion, grenade,
teleport, resume, and fail-closed profile verification.

The result is a technical acceptance candidate, not a self-approved G5 pass.
Human multiplayer and visual review, dynamic LOS-scored spawn selection, full
3D online presentation, and shipping-hardware visual performance remain open.
The exact evidence and reproduction commands are in
`evidence/2026-07-28/g5-inkfall-rev4-acceptance-candidate/README.md`.

## Validation snapshot

- Application Vitest: 101 files, 789 tests passed.
- Final Rev4 Worker profile/resume file: 1 file, 6 tests passed.
- The other 9 scoped Worker files passed 43 tests in the consolidated run.
- App, Worker, sim-source, and sim TypeScript checks passed.
- ESLint passed.
- Vite production build passed, 169 modules transformed.
- Development asset validation completed with 0 errors and 37 pre-existing
  legacy/provenance warnings; no ambiguous upstream asset was adopted.
- Rev4 Playwright visual route: 1 test passed in 52.0 seconds.
- Real runtime verifier:
  `EVIDENCE_INTEGRITY_VERIFIED_ACCEPTANCE_CANDIDATE`.
