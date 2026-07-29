# Work in progress

This is the current authority for incomplete work in canonical
`E:\AI Projects\Projects\Games\evio\evio-repo`.

Last refreshed: 2026-07-28 during canonical mainline recovery.

## Current checkpoint

- Canonical branch: `main`.
- Recovery base: `12bfd882ae9ac43bd95905e0ce6c2b7c5aee77da`.
- `origin/main` matched that base at the start of recovery.
- Production deployment is frozen.
- The recovery suite is green. After this checkpoint, the only active feature
  lane is the source-frozen Inkfall Rev5 review; unrelated feature merges remain
  frozen.
- `.env.staging` is ignored local configuration. The committed
  `.env.staging.example` contains only a non-secret placeholder.

Three interrupted feature worktrees are preserved, not merged or discarded:

- `evio-role-runtime-binding-20260728` — 15 modified files.
- `evio-inkfall-portal-cleanup-20260728` — 5 modified files.
- `evio-hud-cohesion-20260728` — clean.

Their work must be audited against the recovered mainline before any later
merge. Worktree count is not a completion metric.

## Mainline recovery completed in this batch

- Moved all Rev17/Rev30/Rev31 GLBs and candidate manifests from `public/` and
  active `assets/manifests/` into provenance-preserving `assets/review/`.
- Disabled browser/query selection of those review candidates. Practice and
  online now use the existing code-authored procedural fallback instead of
  fetching rejected or non-shipped GLBs.
- Preserved Rev30's exact candidate bytes and truthful `candidate` disposition;
  the stale unit contract no longer calls it approved.
- Classified Rev31 as a rejected review-only asset batch, not a runtime family.
- Reset the shipped binary ledger to the exact empty `public/` binary inventory.
- Made zero active manifests valid only when `public/` has zero supported
  binaries.
- Added a closed-world `dist/` verifier requiring exact package/manifest/ledger
  agreement and release approval.
- Removed development inspection routes and unaccepted Rev5/Rev3 GLB loading
  from the production graph. Production online play now validates the bundled
  Revision 3 manifest plus exact 339-collider fixture and renders the existing
  procedural authority-containment shell. Development mode retains the exact
  Rev5/Rev3 GLBs for human map review.
- Expanded package closure so every non-allowlisted text/build output requires
  provenance, including audio, fonts, WASM, video, archives, and unknown file
  extensions.
- Updated G9 staging isolation to require both intended local bindings:
  `KYX_ROOM -> KyxRoom` and
  `KYX_ALLOCATION_GUARD -> KyxAllocationGuard`, while rejecting production
  namespace reuse.

See
`docs/audits/KYX_CANONICAL_ACCEPTANCE_MATRIX_2026-07-28.md` for authoritative
commands, results, and evidence locations.

The final recovery suite passed: all app/Worker/simulation typechecks, ESLint,
116 app test files / 867 tests, 12 routine Worker files / 49 tests, production
build, release asset validation, provenance sentinel, package closure, and all
9 G9 controls. G9 remains release-blocked on owner/product decisions. The
dedicated authority soak is intentionally excluded from routine Worker tests
and is reserved for the final source-frozen evidence phase.

## Product state

### Inkfall Foundry Rev5

The Rev5 Geometry Portal render candidate and paired portal are available in
the development review path over the frozen Revision 3 authority package with
339 colliders, 12 spawns, and 9 zones. The production build intentionally uses
the procedural authority-containment visual until the GLB art is human-
accepted and release-approved. Rev4's 2/4/8 proof remains historical. Required
next proof is a source-frozen Rev5 2/4/8 review run plus human fun, sightline,
spawn-safety, readability, portal, collision, and visual review.

*Currently being worked on after mainline recovery.*

### Character and animation

Rev17 is a superseded rig/anatomical reference. Rev30 and Rev31 are owner-
rejected visual candidates. None are release-packaged or browser-selectable.
The shipped fallback is procedural and playable, not final art.

The next bounded role is Assault only: continuous authored cyber-suit, integrated
cowl/neck seal, credible proportions, first-person arms, full locomotion/action
contact, weapon alignment, damage readability, LOD/package budget, provenance,
runtime binding, and 5/20/40 m plus player-eye evidence. Human acceptance is
required before propagating modular role silhouettes.

*Currently being worked on after mainline recovery.*

### HUD and presentation

The compact Arena Instrument candidate is present. Center-screen gameplay space
is intended to stay clear; connection/debug diagnostics belong in a drawer.
Practice and online still need one typed view model, CSS decomposition,
representative desktop/reduced-motion/high-contrast captures, and owner
acceptance.

*Currently being worked on after mainline recovery.*

### Mechanics, weapons, and abilities

Worker-authoritative movement/combat, reconnect/resume, six weapon families,
Blink, and five grenade-family contracts exist. The single vertical slice still
needs authoritative Blink preview parity, smoke/flash closure, portal reconnect
behavior, ADS/scope, weapon-specific first-person contact, hit/headshot/kill
feedback, and cohesive non-retro audio/VFX review before roster expansion.

*Currently being worked on after mainline recovery.*

## Remaining gate order

1. Finish and commit green canonical mainline recovery.
2. Audit and integrate only coherent changes needed for one accepted Inkfall
   desktop vertical slice.
3. Obtain human map, character/animation, HUD, audio/VFX, and gameplay-feel
   decisions from real runtime captures.
4. Run the final source-frozen 2/4/8 regression and G8 30-minute soak.
5. Close G9 owner decisions: project license and distribution mode.
6. Deploy and verify staging, then rehearse rollback.
7. Production promotion only with explicit owner authorization.

Mobile-specific arena/control polish remains deferred until the desktop browser
game is a coherent accepted vertical slice.
