# NotHereButAfk/Ev.io Targeted Adoption Audit

Date: 2026-07-27

Audited upstream: `https://github.com/NotHereButAfk/Ev.io`

Audited head: `436da5b4ed0d5b3277ceb9c1873a238a37621e2f` (`main`)

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

## Adoption matrix

| Priority | Upstream evidence | Decision for KYX.IO | Required proof |
| --- | --- | --- | --- |
| P0 | `74a4b8f` - first-person sleeve uses the dark secondary/undersuit color, primary only on the cuff, and a darkened glove | Adapt now in the active sword/viewmodel correction. KYX.IO currently recolors the entire legacy sleeve with the near-white primary color when melee restores that arm. Do not assume tint is the only defect: first prove whether the legacy arm is intended, duplicated, or incorrectly layered over the sword. | Live before/after sword-switch frames, mesh-visibility assertions, and focused weapon tests |
| P0 | `e1fecef` - one character renderer/state contract for the local third-person body and remote players | Adapt architecturally. KYX.IO's public online route still presents authority through a 2D canvas and does not prove the Rev17/Rev18 character, weapon, aim, and action presentation for remote players. Reuse `Rev17Character`/its successor with Cloudflare authority snapshots rather than importing upstream's Node bridge. | Two real browser clients showing the same model, weapon, aim, firing, damage, death, and respawn state; authoritative state remains server-derived |
| P1 | `f4c9082` - explicit camera-forward/body-forward dot-product check exposed a 180-degree third-person facing error | Add a model-specific facing invariant and direct rear-view capture. Do not copy its yaw offset blindly because KYX.IO's authored GLB forward axis may differ from upstream's procedural body. | Automated dot-product assertion plus runtime front/rear/strafe captures on the exported character |
| P1 | `cee1fef` - centralized locomotion phase, contact-derived stride, and spawn-independent rig validation | Adapt the test methodology to authored Blender clips. KYX.IO should measure foot drift and gait direction from the exported runtime skeleton rather than porting procedural limb code. | Walk/run/strafe/backpedal filmstrips; planted-foot drift metric; no moonwalk; repeat at a non-origin spawn |
| P1 | Claude-session idea associated with unavailable commit `3f84895` - one clock per action and hand/blade contact bounds | Keep as an invariant, not as pullable source. KYX.IO's semantic-action contract already centralizes state markers; the remaining gap is direct contact proof through the full attack animation and online 3D presentation. | Worst sword-hand/socket gap under the agreed threshold through the swing, frame filmstrip, and remote-client action parity |
| P2 | `b6497f7` through `436da5b` - Jinx/Rook/Depot/Vestige/Momentum-inspired arena massing, framed modules, colored route lanes, bridge loops, ramps, and gravity lifts | Use as a visual and routing reference only. Inkfall Foundry is an authored Blender/GLB map with separate authoritative collision, zones, spawns, and telemetry. Upstream's monolithic procedural `World.js` cannot replace that pipeline. | Human-approved Inkfall art revision with unchanged collision/package parity, followed by 2/4/8-player route and spawn validation |
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

From the pre-chain base `f4c9082` to `436da5b`, the net change is concentrated
in `src/world/World.js` plus upstream process documentation: 621 additions and
91 deletions. This reinforces the reference-only decision; it is not compatible
with Inkfall Foundry's authored map/collision packages.

## Current disposition

- Targeted audit: complete through upstream `436da5b`.
- First adoption candidate: routed to the active sword/viewmodel fix.
- Character-facing and gait/contact checks: routed into the Rev18 remediation
  acceptance work.
- Shared online character renderer: retained as a required post-model
  integration task, not falsely counted as complete.
- Arena language: held as reference material pending human review of Inkfall
  Rev3; no upstream map code has been merged.
- Upstream push URL remains disabled. This audit does not modify the buddy
  repository.
