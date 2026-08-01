# Inkfall Revision 4 authority correction and Launch v2 — 2026-08-01

## Outcome

The active Inkfall Rev5 browser slice now selects a distinct Revision 4
authority profile:

`g5-inkfall-foundry-rev5-revision-4-authority-v1`

Revision 4 changes one collision rail at the east-choice platform seam and
reuses the existing render presentation. The older Rev4 / Revision 3 profile
remains available for persisted rooms and checkpoints; browser, Worker, portal,
spawn, fixture, and map-binding selection fail closed across the two identities.

Launch is now a gravity-driven, world-contact projectile. It has no player-body
collision, restitution, friction, or bounce; the first qualifying world contact
emits the collision and detonation in one ordered authority tick. Checkpoints
and client presentation require the v2 capability rather than silently loading
the older bouncing behavior.

## Versioned map delta

- Rev3 source blend SHA-256:
  `5e0d2549b1e642f3763f2df27213862375cad90ba9ada8353f89bfcba2864fa3`
- Rev3 fixture hash: `97eb7772ac59dc95`
- Rev4 source blend SHA-256:
  `823c1cf32bc05304e368415550307d01aec6ec66d1cb37828d0802c8c5a67a10`
- Rev4 collision SHA-256:
  `59d791898a3f7815bb2306c678b2b37fcaaf201b33a94a1e260752edb7a5477c`
- Rev4 package digest:
  `65c6c315d9bc0ba27e7ddec1fd2712752b0fa91c4f865f4b2a055e778158c9cf`
- Rev4 fixture hash: `b24d002179389621`
- Collider count: 339 before and after.

Only `map_collision_guard_rail_ink_east_choice_s02_right` changes. Its
platform-side endpoint is trimmed by 141 mm, its center moves from
`(22347,-54,-4058)` to `(22374,-63,-4122)`, and its longitudinal half extent
changes from 841 mm to 770 mm. The opposite endpoint, every non-target
collider, render data, spawn set, zones, triggers, and global KCC recovery
tolerance remain unchanged. The resulting platform-edge clearance is 421 mm:
350 mm capsule radius, 20 mm contact skin, and 50 mm deterministic margin.

## Runtime and compatibility proof

- App TypeScript: PASS.
- Worker TypeScript: PASS.
- Focused ESLint for online/profile/portal seams: PASS.
- Portal compatibility: 9/9 tests PASS across Revision 3 and Revision 4.
- Shared browser/Worker map-factory and online-world contracts: 8/8 tests PASS.
- Online gateway/selection routing: 20/20 tests PASS.
- Worker room/profile suite: 7/7 tests PASS, including a real Rev5 room welcome
  carrying fixture hash `b24d002179389621`.
- Exact former east-rail pose and immutable-delta tests: 2/2 PASS.
- Browser-local Practice: deterministic one-player-plus-seven-bot replay passes
  300 authority ticks in two byte-identical rooms, beyond the former tick-163
  failure window.
- Launch v2 consolidated gate: app and Worker typechecks PASS; focused ESLint
  PASS; app Vitest 7 files / 33 tests PASS; Worker projection 1 file / 4 tests
  PASS; focused diff check PASS.
- Final integrated source gate after the map-library truth update: app, Worker,
  and simulation TypeScript PASS; full ESLint PASS; application Vitest 126
  files / 905 tests PASS; routine Worker Vitest 12 files / 52 tests PASS. The
  dedicated authority soak remains intentionally excluded from the routine
  Worker gate.
- Vite production build PASS with 215 transformed modules. The existing large
  route-chunk warning remains an explicit performance task, not a build error.
- Chromium desktop Practice integration PASS at 1440x900: 1/1 test in 1.2
  minutes, one local player plus seven rendered authority bots, meaningful
  authoritative movement, pointer lock, and zero captured console/page errors.
- Human Brain reasoning ledger validation: `HUMAN_BRAIN_LEDGER_VALID`.
- Release asset validation PASS with zero release manifests/errors/warnings;
  provenance sentinel PASS; built-package closed-world verifier PASS; G9
  controls PASS. G9 release status remains correctly **BLOCKED** on the owner
  project-license choice, owner distribution-mode choice, and one accepted
  runtime G6 character. No map or source-art proof is being misrepresented as
  release-packaged art.

These are compile, contract, and bounded deterministic/runtime integration
results. The Chromium capture visibly still contains fallback/blocky opponents
and unapproved map/HUD/weapon presentation. None of these results constitutes
owner visual approval, human play acceptance, final 2/4/8 performance evidence,
or a soak result.

## Remaining acceptance work

- Run the final source-frozen browser Practice/online matrix only after the
  remaining vertical-slice changes stop moving.
- Capture and review real player-eye desktop evidence for map readability,
  portal comprehension, spawn safety, combat flow, HUD density, character art,
  weapons, animation, audio, and VFX.
- Complete authoritative smoke/Flash semantics and the locked-Q plus three
  selectable-ability loadout.
- Complete one accepted Assault character and weapon-contact set.
- Run the final 2/4/8 matrix and 30-minute soak, then close license and
  distribution decisions before staging.

No staging or production deployment occurred in this checkpoint.
