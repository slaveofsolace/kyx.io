# NotHereButAfk/Ev.io Targeted Adoption Audit

Date: 2026-07-27

Audited upstream: `https://github.com/NotHereButAfk/Ev.io`

Audited head: `92b9716deb1fb7e00ea2576c6834a27331b90e78` (`main`)

## Scope and conclusion

This is a targeted engineering and design audit of the current upstream head,
the latest arena/Jinx chain, and the commits most relevant to KYX.IO's open
G5/G6 presentation gaps. It is not a line-by-line endorsement of the upstream
repository.

No upstream commit is safe to cherry-pick wholesale. The projects have diverged
in map architecture, character assets, animation, networking, and capture
infrastructure. The useful work is a set of bounded fixes, invariants, and
visual-language references that should be adapted to KYX.IO and re-proven in
its own runtime.

## License boundary

At audited head `92b9716`, the root `package.json` declares `"license": "ISC"`,
but the repository tree contains no `LICENSE` or `COPYING` file and the README
does not state a license. Until the owner supplies the actual license text or
written permission is recorded in KYX.IO's provenance ledger, this audit does
not authorize verbatim source or asset copying. The decisions below therefore
favor independently implemented behavior, test invariants, and high-level
design references; no upstream commit has been cherry-picked.

## Adoption matrix

| Priority | Upstream evidence | Decision for KYX.IO | Required proof |
| --- | --- | --- | --- |
| P0 | `74a4b8f` - first-person sleeve uses the dark secondary/undersuit color, primary only on the cuff, and a darkened glove | Adapt now in the active sword/viewmodel correction. KYX.IO currently recolors the entire legacy sleeve with the near-white primary color when melee restores that arm. Do not assume tint is the only defect: first prove whether the legacy arm is intended, duplicated, or incorrectly layered over the sword. | Live before/after sword-switch frames, mesh-visibility assertions, and focused weapon tests |
| P0 | `e1fecef` - one character renderer/state contract for the local third-person body and remote players | Adapt architecturally. KYX.IO's public online route still presents authority through a 2D canvas and does not prove the Rev17/Rev18 character, weapon, aim, and action presentation for remote players. Reuse `Rev17Character`/its successor with Cloudflare authority snapshots rather than importing upstream's Node bridge. | Two real browser clients showing the same model, weapon, aim, firing, damage, death, and respawn state; authoritative state remains server-derived |
| P1 | `f4c9082` - explicit camera-forward/body-forward dot-product check exposed a 180-degree third-person facing error | Add a model-specific facing invariant and direct rear-view capture. Do not copy its yaw offset blindly because KYX.IO's authored GLB forward axis may differ from upstream's procedural body. | Automated dot-product assertion plus runtime front/rear/strafe captures on the exported character |
| P1 | `cee1fef` - centralized locomotion phase, contact-derived stride, and spawn-independent rig validation | Adapt the test methodology to authored Blender clips. KYX.IO should measure foot drift and gait direction from the exported runtime skeleton rather than porting procedural limb code. | Walk/run/strafe/backpedal filmstrips; planted-foot drift metric; no moonwalk; repeat at a non-origin spawn |
| P1 | `92b9716` - derives local strafe intent from measured horizontal displacement and view yaw before driving presentation | Adapt the invariant, not the implementation. It directly addresses the reported mid-ease strafe-angle inconsistency, but KYX.IO must prove the sign and forward axis against Rev19's exported skeleton and authoritative snapshots. | Forward/back/left/right/diagonal tapes with signed local-space velocity, body-forward dot products, and frame-by-frame action selection |
| P1 | `92b9716` - readable reload progress, viewmodel landing impulse, shared remote fire recoil, kill confirmation, and visual death/respawn beats | Route the useful feedback beats into the G6/G7 acceptance matrix. Do not port its CSS, timers, procedural death fall, or Node bridge: KYX.IO already has semantic action markers and server-authoritative consequence state that should drive authored animation and the Foundry Tactical HUD. | Offline and two-client parity captures for reload/fire/hit/kill/death/respawn; no client-side mechanic or timing authority; reduced-motion behavior |
| P1 | External design-session idea associated with unavailable commit `3f84895` - one clock per action and hand/blade contact bounds | Keep as an invariant, not as pullable source. KYX.IO's semantic-action contract already centralizes state markers; the remaining gap is direct contact proof through the full attack animation and online 3D presentation. | Worst sword-hand/socket gap under the agreed threshold through the swing, frame filmstrip, and remote-client action parity |
| P2 | `b6497f7` through `436da5b` - Jinx/Rook/Depot/Vestige/Momentum-inspired arena massing, framed modules, colored route lanes, bridge loops, ramps, and gravity lifts | Use as a visual and routing reference only. Inkfall Foundry is an authored Blender/GLB map with separate authoritative collision, zones, spawns, and telemetry. Upstream's monolithic procedural `World.js` cannot replace that pipeline. | Human-approved Inkfall art revision with unchanged collision/package parity, followed by 2/4/8-player route and spawn validation |
| P2 | `d2ddb75` - adds a central objective beacon, framed halo landmark, oversized route signs, compressed side canyons, and stronger route-color hierarchy | Feed only the landmark principles into the isolated Inkfall Rev4 art lane. Its changed spawn coordinates and procedural geometry are not evidence for KYX.IO's authored collision or spawn safety. | Distinctive authored landmark visible from key routes, unchanged collision hashes, retained sightline/spawn contracts, and direct navigation review |
| Reject | Upstream `tools/screenshots.mjs` launch/pointer-lock workarounds | Do not copy. KYX.IO's G8 capture harness intentionally uses trusted Playwright input; untrusted scripted clicks previously caused pointer-lock denial and pause-state contamination. | Continue using trusted-input capture and record the exact route/build SHA |
| Reject | Upstream Node `AuthNetBridge` and server protocol | Do not import. KYX.IO's authority is implemented around Cloudflare Durable Objects, reconnect/resume credentials, rate limiting, and production-readiness constraints. | Preserve the existing authority contract and extend its renderer adapter only |

## Latest arena chain

The current upstream map sequence is:

1. `61a5e80` - claim arena recreation lane
2. `b6497f7` - recreate observed ev.io arena layout
3. `1a178be` - align gravity lifts to the industrial style
4. `fe2775f` - document the arena recreation
5. `f80188f` - mark the recreation ready for playtest
6. `4ce62e5` - rebuild with stronger ev.io/Jinx visual language
7. `436da5b` - mark the Jinx reference pass ready for playtest
8. `d2ddb75` - add objective/halo landmarks, route signs, and side-route
   material hierarchy
9. `92b9716` - add presentation feedback and measured-motion animation cues

The two commits after `436da5b` add 561 lines and touch eleven files. The arena
delta remains concentrated in upstream's procedural `src/world/World.js`; the
feedback delta is coupled to its procedural avatar, local HUD, and Node network
adapter. This reinforces the adapt-and-re-prove decision for both lanes.

## Current disposition

- Targeted audit: complete through upstream `92b9716`.
- The first adoption candidate triggered a live sword/viewmodel inventory. That
  proved the visible obstruction was KYX.IO's own 15-primitive blockout arm on
  both the default and Rev17 paths, not the sword. The bounded correction hides
  that invalid arm for melee while retaining each rifle path; recoloring it
  would have preserved false contact. Authored melee arms/contact remain G6
  work.
- Character-facing and gait/contact checks: Rev18 proved the validation
  pipeline but failed visual acceptance; the findings are now routed into the
  active Rev19 true-remodel pass.
- Shared online character renderer: retained as a required post-model
  integration task, not falsely counted as complete.
- Arena language: the new landmark principles are routed to the isolated
  Inkfall Rev4 art lane; no upstream map code or spawn coordinates have been
  merged.
- Animation/feedback delta: the measured-strafe invariant is routed to G6 and
  the presentation beats to the opt-in Foundry Tactical G7 candidate. No
  upstream avatar, HUD, weapon, or network code has been merged.
- Upstream push URL remains disabled. This audit does not modify the buddy
  repository.
