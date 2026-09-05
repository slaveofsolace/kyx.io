# Relay playable reset

## Owner hold — September 5, 2026

All implementation and acceptance work is paused at the owner's explicit request.
Do not resume this plan, either lane, or a scheduled continuation without new
owner authorization. Only safe preservation and the requested WIP repository
handoff are in scope. Both lanes confirmed that their commands are stopped;
the task's Vite server is stopped and its browser test has finished unsuccessfully.

Local changes were saved as `346df1145492b1006ef193d5000dbbc1624f5035` on the
existing integration branch. GitHub `main` was verified at
`373e9de6bff25e5ceae1c0af15839654273af6e1` before publication. The owner then
instructed that visibility be left unchanged and delegated the WIP handoff
decision. The repository stays public; only this preserved unfinished checkpoint
and its documentation are being published. Development is not resumed. No
deployment, history rewrite, deletion or protected-worktree cleanup has occurred.

Completed before the hold: shared eye/settings contract, immediate pending-look
rendering, time-based camera smoothing, reduced-motion controls, and correction
of the reflected ramp quaternion. Application type checking and 47 focused
tests passed. The ramp corner regression reproduced a 3.99 m error before the
render-only correction and passes afterward; collision was not changed.

Unresolved acceptance: the real 2/4/8-client test failed with a `resuming` rather
than `joined` state. The new first-person controls test reached crouched-camera
assertions but timed out during its screenshot, so it is not a pass. No further
game fixes or acceptance runs are authorized while held.

Preserved candidates: three original map treatments and three actor/rifle
treatments, their editable source, manifests, scripts and inspection images.
The map development loader exists but is not wired into the game. The family
installer and matching first-person arms are unfinished. All candidate
`humanAccepted` and `releaseEligible` flags remain false. Source repair and
static dimensions do not prove runtime art, motion, audio or encounter quality.

Map observations pending review include overlapping upper-deck ramp access and
the unoccluded primary-spawn sightline. These are not accepted layout fixes.
Historical evidence, provenance and license records remain intact.

## Baseline

Baseline: `C:\KYX.IO-Final-Game-Completion`,
`codex/kyx-final-integration-20260824@373e9de6bff25e5ceae1c0af15839654273af6e1`.
Clean when resumed. Work is local; the protected D: checkout, its 621 untracked
paths and historical worktrees remain read-only. The owner accepts the final play,
motion, art and audio result.

## Shared contract

- Experience: a short Relay fight between field crews competing over a working
  communications complex. Readable equipment, routes and purposeful utility use.
- Compare three treatments at equal detail: exposed communications deck,
  ceramic utility campus, compact transmitter workshop. Selection is provisional
  until the same gameplay view shows a useful difference.
- Authority uses millimeters, Y up, yaw zero facing +Z. Rendering uses meters,
  Y up, with authority Z negated; camera yaw is negative authority yaw.
- Standing capsule: 1.8 m high, radius 0.35 m. Crouched: 1.1 m high, same radius.
  Eye: 1.70 m standing / 1.00 m crouched, derived from the authority shape.
- Comparison view: Relay west A spawn, authority feet (-29000, 0, 0), yaw
  90000 millidegrees, pitch 0, vertical FOV 78, viewport 1707 x 863. Use the
  same scene, time/lighting and detail level for player, rifle and architecture.
  Also inspect a mid-lane view and opponents at 5, 15 and 30 m before selection.
- Weapons keep existing weapon IDs, hand/muzzle socket conventions and mount
  contracts. Inspect their actual transforms before adapting meshes. FP arms
  and TP actor must share anatomy, equipment and material roles.
- Palette roles: warm pale structural surfaces, dark load-bearing/mechanical
  parts, small safety ochre markings. Cyan ally and warm red enemy identification
  must remain readable in motion and grayscale. Emission marks active devices.
- Cover follows collision exactly. Low 0.9 m / crouch-blocking 1.2 m / full
  2.0 m cover are comparison classes, not authorization to alter colliders.
  Preserve portal clearances, useful flanks and spawn exits. Parent reviews
  all collision/layout changes before integration.
- Deliver editable Blender source plus GLB, existing rig/LOD/animation and
  contact contracts, local provenance and hashes. Use existing runtime budgets;
  measure candidate cost. Targets remain 60 FPS desktop / 30 FPS lower tier.
- Asset lane owns `assets/source/blender/relay-reset-family/`,
  `assets/review/runtime-candidates/relay-reset-family/` and
  `src/app/development/installRelayResetFamilyReview.ts` only.
- Map lane owns `assets/source/maps/relay-reset/`,
  `assets/review/runtime-candidates/relay-reset-map/` and
  `src/app/relayResetArchitecture.ts` only.
- Parent owns controls, authority, shared runtime, tests and integration. Local
  review candidates remain explicit development selections; admission flags
  and release ledgers are not bypassed.

## Milestones

| Milestone | Status | Evidence required |
| --- | --- | --- |
| G1 Direction and baseline | PAUSED, INCOMPLETE | Current gameplay view, usable route, comparable actor/rifle/world treatments and selected provisional direction |
| G2 Integrated first pass | NOT STARTED | Same build contains camera/input repairs, actual actor/arms/rifle and one authored Relay combat area; scale/contact/sightlines inspected |
| G3 Whole Relay match | NOT STARTED | Coherent arena, useful bots/routes/spawns, two clients plus two bots, death/respawn/result/rematch and failed-asset fallback |
| G4 Owner-ready slice | NOT STARTED | Input/rejection checks, measured frames/memory, motion/audio evidence and owner play/listening acceptance |

## Bounded source review

OBSERVED: camera fixed at 1.58 m conflicts with the authority eye. FOV and
pointer scale bypass saved settings. Camera position has a frame-dependent
lerp. Both routes buffer pointer input to the 20 Hz tick; Practice additionally
interpolates local look. Its Blink preview already includes pending look, so
preview and rendered aim can disagree between ticks.

OBSERVED: firing presentation follows accepted attack events. Default art is
an intentional procedural fallback; preserved binary candidates require the
development review seam. Respawn rules specify 160 ticks (8 seconds at 20 Hz).

CORRECTION: the audit's five-frame camera response is a mathematical position
estimate, not a measured input latency. A direct Chrome coordinate click previously
acquired pointer lock transiently; subsequent tool/focus transitions released it.
An automation capture failure alone is not a demonstrated product input defect.

The eye/settings, pending-look and smoothing changes are preserved but not fully
accepted. The two-client path, encounter and art verdicts remain unverified.
Both lanes are stopped. These notes are a checkpoint, not permission to proceed.
