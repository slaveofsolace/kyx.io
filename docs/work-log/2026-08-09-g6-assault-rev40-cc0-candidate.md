# G6 Assault Rev40 CC0 candidate — 2026-08-09

Branch: `agent/relay-playable-slice-wip`
Parent checkpoint: `520d94c5c9bd54b5b138ca25a116a1781f3e3356`.

## Implemented source batch

- Reused the qualified Irondust Sci-fi Soldier CC0 body, hands, and broad-visor
  head instead of constructing another procedural mannequin.
- Retargeted ten selected third-person actions from Quaternius Universal
  Animation Library Standard and throw/melee from UAL2 Standard, both CC0.
- Preserved a 66-joint contract by adding one non-deforming right-hand weapon
  socket to the 65-joint Quaternius hierarchy.
- Exported three distinct review LODs: 3,392 / 1,914 / 1,057 triangles,
  totaling 13,786,484 bytes.
- Added exact Quaternius archive, registry, inventory, license, GLB, and selected
  clip hashes to the Rev40 source registry.
- Added a review-only installer selected explicitly with
  `?g6Candidate=g6-assault-rev40-cc0`; Rev39 remains the staging-review default.
- Added Quaternius bone aliases, right-hand socket fallback, authored
  throw/melee bindings, and prevention of procedural double transforms.
- Added selected-weapon presentation to the loadout turntable and corrected its
  front-view camera and overly fast rotation.
- Closed the staging-package verifier blind spot by requiring exactly one
  packaged copy of each Rev40 LOD with exact size/SHA-256 binding.

## Export and package result

Source evidence:
`evidence/2026-08-09/g6-assault-rev40-source-build/`

- Blender 5.1 bounded export completed in 21.2 seconds under an explicit shared
  runtime grant, then the runtime slot was released.
- Exact LOD hashes: `55828c78…a843`, `50836dd2…b175`, and
  `eb072f25…d29c`.
- 66 joints and all 12 named actions are present in every LOD.
- The catastrophic spike/exploding-mesh retarget defect is absent.
- Staging-review build and package-closure verification passed; each Rev40 LOD
  was emitted exactly once.

## Browser and Human Eye result

Final diagnostic packet:
`evidence/2026-08-09/g6-assault-rev40-browser-player-eye-v7/`

Automated runtime facts:

- 7/7 visible remote avatars bound to the candidate, authored actions, weapons,
  and skeletal stance contract.
- 7/7 instrumented support-hand targets were within the declared 0.12 m limit;
  the worst sampled error was 0.0341 m.
- Pointer lock, loadout crouch, strafe/backpedal signals, remote crouch, and the
  first-person overlap check completed with zero recorded runtime errors.

Human Eye decision: **REJECT FOR PROMOTION — ITERATE**.

The numeric contact pass hid a visually unacceptable procedural solve: the
rifle crossed the visor/face, elbows and shoulders compressed unnaturally, and
long dangling projections recreated the owner's rejected spike silhouette. The
procedural primary-arm experiment was removed from current source after capture.
The detailed decision is in the packet's `HUMAN_EYE_AUDIT.md`.

## Authored recovery prepared

Exact-source reference packet:
`evidence/2026-08-09/g6-quaternius-weapon-pose-reference-v1/`

The hash-pinned UAL1 GLB was loaded directly with Three.js and six source clips
were captured. `Pistol_Idle_Loop` and `Pistol_Aim_Neutral` provide coherent,
two-handed chest-level weapon poses; `Idle_Loop` leaves both arms at the thigh.

The source recipe supports an isolated
`g6-assault-rev40-cc0-weapon-ready-v2` output. It preserves lower-body idle,
walk, jog, jump, airborne, and landing motion while overlaying both
clavicle/arm chains from the exact CC0 `Pistol_Idle_Loop`. It writes to distinct
model, runtime-candidate, and evidence paths, preserving the original Rev40
candidate.

The first bounded v2 export completed in 24.8 seconds and emitted three LODs,
but Human Eye rejected it immediately. Both weighted arm chains stretched into
long blade-like spikes because source-local bone matrices were copied onto a
target whose neutral pose had already been applied as its rest pose. The
rejected evidence is preserved at
`evidence/2026-08-09/g6-assault-rev40-weapon-ready-source-build-v2/` with an
explicit `HUMAN_EYE_AUDIT.md`; these GLBs must not be installed or packaged.

The source-only correction is isolated as
`g6-assault-rev40-cc0-weapon-ready-v3`. It transfers the authored
armature-space pose relative to the shared clavicle-parent anchor. This keeps
the current locomotion torso transform while avoiding incompatible
rest-relative translations and scales. The v2 manifest/report paths are guarded
against overwrite, and v3 has distinct model, candidate, and evidence paths.
Its Python AST and diff checks pass. A fresh bounded Blender export remains
required before visual or runtime acceptance can move.

That v3 export subsequently completed in 22.4 seconds under a separate explicit
runtime grant, but Human Eye rejected it because the same hand/forearm spikes
remained. Review setup already muted every NLA track except the weapon-ready
idle, so overlapping action evaluation was not the cause. GLB skin inspection
then localized the defect: each donor hand contained five original vertices
with no surviving mapped influence. The legacy fallback weighted those vertices
to the pelvis; raising the hands kept them stationary and stretched adjacent
triangles into the visible blades.

The next isolated source is `g6-assault-rev40-cc0-weapon-ready-v4`. It preserves
v2/v3 as sealed rejected packets and reconstructs each unmapped vertex from the
nearest topology-connected valid influences, falling back to the geometrically
nearest valid vertex only for disconnected geometry. V4 fails the build if any
such vertex still reaches the pelvis fallback. No v4 Blender run has occurred.

## Verification completed

- `git diff --check` — pass (line-ending warnings only)
- Rev40 and weapon-ready wrapper Python AST parse — pass
- Resource Pilfer registry validation — pass
- app TypeScript — pass
- targeted ESLint — pass
- focused Vitest — 3 files / 11 tests — pass
- staging-review Vite build and exact package verifier — pass before the
  authored weapon-ready source change
- Rev40 player-eye v7 — technical pass, human visual reject

The package-manager wrapper attempted an interactive dependency-layout repair
after the drive migration and aborted before changing files. Checks use the
intact local dependencies with the bundled Node executable.

## Nonclaims

No human model acceptance, final weapon contact, dedicated first-person-arm
derivative, release eligibility, multiplayer/performance acceptance, map/HUD
acceptance, push, or deployment is claimed.

## Exact resume step

Wait for a fresh explicit shared-runtime grant for the corrected source. Re-
audit protected processes, then run exactly one bounded weapon-ready-v4 wrapper
export. Inspect the authored front/three-quarter renders before installing the
new candidate. Only if that visual source gate is credible should its exact
hashes be added to the review installer/package verifier and a fresh browser
player-eye packet be captured.

## Superseding checkpoint — weapon-ready v4

The isolated v4 export completed under its one-run shared-runtime grant. It
preserved the 66-joint / 12-action contract and the topology-neighbor repair
closed the structural failure in every LOD: the skin-integrity verifier found
zero pelvis-only and zero detached pelvis-only vertices.

V4 still failed the player-facing browser gate. The real Quaternius VLR-7 rifle
was active and telemetry exposed the authored support palm in weapon-local
space, but none of the seven sampled avatars met the contact requirement. The
worst miss was approximately 0.431 m. The rifle sat across/above the visor and
the imported `Pistol_Idle_Loop` did not supply a credible rifle stance. V4 is
therefore preserved as a structural repair and visual rejection, not promoted.

## Rev41 Human Soldier rifle-pose experiment

Resource Pilfer isolated the Kevin Iglesias Human Soldier Animations FREE pack
outside the repository and recorded the unchanged archive, nested archive,
reviewed Blender source, inventories, creator-license snapshot, Unity EULA
snapshot, and candidate registry. The pack contains a real humanoid rig and the
`WeaponHold_AssaultRifle01` pose, but public source/release distribution remains
on hold under the Unity Standard Asset Store EULA boundary.

One explicitly granted Blender 5.1 run produced the distinct review-only
`g6-assault-rev41-kevin-rifle-v1` packet. It retains the target 66-joint rig,
12-action contract, and 3,392 / 1,914 / 1,057 triangle LODs. Exact GLB hashes:

- LOD0: `a2e65682c673938693f9b9b9538de9c834f835dc67d8900b6a81c1f1ba3aa920`
- LOD1: `6e9577ce9042e774d573e65d10d1adebbd582b6225334b224d8b86cd466f61d1`
- LOD2: `cd70171552dab83b781b0a612685fa3ce6abc22fa0ffce38d89e954b944d3cd9`

The skin-integrity verifier passes every LOD with no detached/pelvis-only
vertices. Human Eye nevertheless rejects the source pose: the left forearm
folds across the chest/neck, the right hand collapses toward the waist, both
elbows flare, and the hands do not define one plausible rifle. The three source
renders also contain no actual rifle, so weapon grip, stock, sightline, muzzle,
and armor clearance remain unproven. The detailed decision is in
`evidence/2026-08-09/g6-assault-rev41-kevin-rifle-source-build-v1/HUMAN_EYE_AUDIT.md`.

## Current exact resume step

Do not rerun Blender or install Rev41. Preserve v2/v3/v4/Rev41 as rejected
evidence. After the shared V47 production runtime is returned and a new KYX
window is explicitly granted, author one distinct candidate around the actual
selected KYX rifle: align dominant-hand and stock sockets first, solve the
support hand to the real foregrip, and prove muzzle/visor/armor clearance in the
source render before browser integration. The Human Soldier donor remains
quarantined until distribution rights are deliberately closed.

## Rev42 actual-rifle constrained source checkpoint

The distinct `g6-assault-rev42-vlr7-constrained-v1` source now uses only the
hash-pinned CC0 body, motion, and selected Quaternius VLR-7. The VLR-7 blend is
appended as a source-render/contact fixture and remains excluded from the
character GLBs. Its rear stock face, dominant-grip marker, handguard geometry,
live authority muzzle, visible barrel nose, and runtime `0.86` scale define the
pose contract. The stale internal muzzle marker is retained only as a measured
0.16 m discrepancy witness.

The first explicitly granted Rev42 Blender run stopped at the first fail-closed
contact gate before emitting any artifact: the left support target was
`0.571545 m` from the shoulder while the two-bone solve allowed at most
`0.527081 m`. Blender exited, the shared slot was returned, and the distinct
candidate/model/evidence directories remain empty. Human Eye was not run
because no render exists.

The source-only correction does not shrink the rifle, shorten its chosen
handguard contact, stretch bones, or weaken the margin. It rolls the left
clavicle/shoulder toward the contact by at most 24 degrees only when necessary,
requires at least 22 mm remaining arm reach, and then applies the exact
two-bone solve. The wrapper and shared author script are AST-valid and
`git diff --check` clean. A second Blender invocation requires a new explicit
shared-runtime grant.

The second explicitly granted Rev42 run also stopped at the first fail-closed
contact gate before writing an artifact. The support target improved from
`0.571545 m` to `0.536807 m`, but remained `0.011726 m` beyond the declared
`0.525081 m` usable reach. Telemetry exposed an implementation defect in the
bounded shoulder roll: linear interpolation between direction vectors turned
the declared 24-degree allowance into only `13.901 degrees` of actual rotation.
Blender exited after `12.6 s`, the shared runtime was returned with no protected
process remaining, all three Rev42 output directories remain empty, and Human
Eye remains `NOT RUN / UNKNOWN` because there is still no render.

The next source correction preserves the exact rifle, runtime scale, chosen
handguard point, stock target, bone lengths, and contact/error margins. It
replaces the vector interpolation with a true shortest-arc rotation capped at
the same 24 degrees, so the already-declared anatomical shoulder allowance is
actually honored. The correction is source-only; another Blender invocation
requires a fresh explicit shared-runtime grant.

That fresh one-run verification applied the full `24.000 degrees` and advanced
beyond the earlier failing sample, but a later weapon-ready locomotion sample
then failed with the support target at `0.782530 m` before and `0.754344 m`
after shoulder roll against `0.525081 m` usable reach. Blender stopped after
`13.8 s`, produced no artifact or render, and returned a clear shared runtime.
Technical status remains `FAIL`; Human Eye remains `NOT RUN / UNKNOWN`.

The later-frame delta identifies the next architectural correction: the solve
was inheriting arbitrary arm swing from each walk/run/jump source frame before
seating the rifle. Rev42 now restores both clavicle/arm chains to the target's
known chest-relative rest basis on every weapon-ready sample, while preserving
the animated spine, head, pelvis, legs, and root. Only then does it seat the
exact VLR-7 and solve the stock, dominant hand, support hand, muzzle, and
sightline constraints. Rifle forward/up and the stock-pocket offset are also
resolved in the current chest frame instead of object space. The reset proves
all eight upper-body bases are identity and all bone lengths unchanged before
each solve. Failures now include output action, source library/clip, source
frame, and output frame so no future bounded run can fail without actionable
provenance.
This is source-only and requires a fresh grant before one more Blender run.

A direct triangle decode of the hash-pinned VLR-7 then disproved the earlier
`0.42` support fraction: it passed approximately `4.006 mm` into/past the
magazine surface and sat `45.770 mm` from the receiver/handguard. The first
actual receiver/handguard surface intersection on the same dominant-to-forward
reference is `0.687504578`, at candidate-local
`(-0.013750091, -0.063437157, -0.188127513) m`. Under the fixed idle/chest
baseline its measured target distance is `0.523899002 m` against the stricter
`0.525080584 m` pre-solve limit, retaining the full 22 mm arm-reach margin plus
`1.181582 mm` extra.

Rev42 uses a more numerically stable point on that same decoded triangle:
primitive `2`, zero-based triangle `298`, indices `(437, 439, 438)`, and
barycentric `(0.1, 0.1, 0.8)`. It is 10% inset from the triangle edges at
candidate-local `(-0.019679020, -0.062568905, -0.188127518) m`, measures
`0.522114783 m` from the fixed left shoulder, and retains the full 22 mm reach
margin plus `2.965801 mm` extra. This is the rear transverse face of the real
combined receiver/handguard, not a lower-foregrip claim. Human Eye must still
decide whether the near-extended support arm reads naturally. The rejected
magazine-intersection fraction is preserved here rather than relabeled.

## Rev42 successful export and visual rejection

The final sealed source (`92d917b670c836a4704753404116e8dad582267c8acc653f9c50bb7c2f00ad34`)
and wrapper (`7b4862b403f3a7ad821ac8aecceee365593a22d6b809521a279ee5bf91c8970a`)
received one explicit shared-runtime grant. The protected-process audit was
clear before launch. Exactly one Blender 5.1.2 invocation completed in
`42.8 s`, exited `0`, and returned a clear protected runtime with no second
invocation.

The distinct Rev42 packet now contains the master blend, manifest, source
report, three GLBs, and seven review renders. LOD0/1/2 are 3,392 / 1,914 /
1,057 triangles with SHA-256 values:

- LOD0: `24bca678711c917e8fe80925247deeeb6c01f17b6aacd5de284c2bf85f38c5d2`
- LOD1: `16648aa6a650b5acd2af26590cdeb97324cf08758268312d3ff13ebfef096a89`
- LOD2: `f64a08c190688554d418efb064103b8e4b9fc4c137010ac9bab497bac491a9ac`

All three GLBs pass `verify-g6-assault-skin-integrity.py`; each retains the
66-joint skin and twelve-action contract with no pelvis-only or detached
pelvis-only vertices. Locomotion contact telemetry reports sub-micrometer hand
and stock target error while retaining approximately `0.024966 m` support reach
margin. This is a technical export/contact PASS only.

Human Eye cold-review rejects the visible contact pose. Both hand heads reach
their measured targets, but the inherited wrist and finger orientations remain
open and mechanically implausible: the dominant hand does not wrap the pistol
grip, the support palm intersects/floats through the handguard, and the
stock-to-shoulder support chain is visually unreadable. The pose also does not
clearly communicate low-ready versus aimed readiness, and the uniform glossy
blue material response collapses armor, undersuit, gloves, visor, and rifle.
The formal evidence is in
`evidence/2026-08-09/g6-assault-rev42-vlr7-constrained-source-build-v1/HUMAN_EYE_AUDIT.md`.

Rev42 remains `humanAccepted=false`, `runtimeIntegrated=false`, and
`releaseEligible=false`. The next candidate must preserve the exact VLR-7,
`0.86` runtime scale, stock/muzzle/real-handguard fixtures, and contact/reach
gates while adding explicit pistol-grip and handguard frames, bounded wrist
swing/twist, authored finger curls, visible collision-clearance checks, and one
declared low-ready silhouette target. Do not install this rejected pose into
Practice or online runtime.

## Rev43 palm-grip source checkpoint

Rev43 is a distinct source-only correction; it does not modify or overwrite the
sealed Rev42 source or evidence. The previous solve placed each wrist joint on
the weapon surface. Rev43 instead derives exact palm landmarks at the midpoint
from each wrist to the mean index/middle/ring/pinky MCP roots, derives real
weapon surface frames, offsets the wrist targets by the transformed palm
anchors, then solves the arm chains.

The firing hand now targets the right surface of stock/grip primitive 0,
zero-based triangle 64. The support hand targets the clean underside of
receiver/handguard primitive 2, zero-based triangle 287. Static geometry gives
approximately 109 mm and 43 mm reach margin respectively, so neither contact
requires stretching or a relaxed margin. The source retains the `0.86` weapon
scale, authority muzzle, shoulder-stock target, 22 mm reach gate, 2 mm
transformed-palm gate, 65-degree wrist-swing gate, 70-degree twist gate, and
66-bone/twelve-action contract.

The evidence design also replaces the cyan three-light wash with a neutral key,
cool fill, and restrained rim; separates armor, undersuit, gloves, knees,
visor, barrel, details, scope/handle, and rifle body through explicit material
profiles; and adds rear dominant-grip plus neutral-contact witness views. The
source review rifle remains excluded from exported character GLBs.

Final source-only static review is **GO**:

- core SHA-256:
  `10dbfeec98db80f80014359ccacc449e907f7f774c78e99d2071180f79a371cc`
- wrapper SHA-256:
  `552ea307bef09819529d2a12ae1366144ea2c77dae16c4c6cc9a38d4543fd4b3`
- Python AST: PASS.
- untracked-source whitespace check: PASS (line-ending notice only).
- independent Blender/API/math/order review: GO after correcting Rev43 export
  copyright and completion-signature identity.

No Rev43 Blender run, GLB, render, Human Eye verdict, browser integration,
release claim, or deployment exists at this checkpoint. A single bounded run
has been requested from the shared-runtime coordinator and must wait for the
currently owned Nova Blender process to return the slot.

The first explicitly granted Rev43 run stopped at its first fail-closed gate
after `7.986 s`. The palm-anchor verifier requested donor-style names such as
`index_01.R`, while the 66-bone target rig uses `index_01_r` / `index_01_l`.
Blender exited `1`; no master, GLB, manifest, report, or render was emitted.
The distinct model and runtime-candidate directories remain empty, and the
failed console packet is preserved at
`evidence/2026-08-09/g6-assault-rev43-vlr7-grip-source-build-v1/blender-console.log`.
Human Eye remains `NOT RUN / UNKNOWN`.

The source-only correction now constructs target finger names with exact
`_r` / `_l` suffixes in the palm derivation, finger curl, and clearance
witnesses. A direct decode of the successful Rev42 LOD0 skeleton confirms all
30 required finger joints exist. Corrected core SHA-256:
`a84a6fad934c67d5d73b95346e687b5a658754648ae059b3a405ef94767b3403`.
No second Blender invocation is authorized by the consumed grant.

The fresh recovery-safe grant then completed exactly one corrected invocation
in `27.913 s`, exit `0`, and returned a clear shared runtime. The Rev43 master
SHA is `87afa8ca8afbc5726971b6c07bf742d6e21a13c0eb81848a025df351d42f8b3a`.
LOD0/1/2 remain `3,392 / 1,914 / 1,057` triangles with hashes:

- LOD0: `f94b7302b1aa08de8cd190a8c92f6d74e56ea1c7462a55cf5488e748a6d41b0a`
- LOD1: `4c23f32111e734f2a75f5077655ddbcea6ccf1b28b91e9d870b107c082280178`
- LOD2: `d46d1c0746b49ef86f460cdb0fc3453cd0a44af1211bcfc368d2fe4749519370`

All three GLBs pass skin-integrity verification with the 66-joint/twelve-action
contract intact. The six weapon-contact actions remain below one micrometer
maximum palm error, preserve at least `0.109364 m / 0.043329 m` dominant/support
reach margin, stay within `62.766 / 45.270` degrees maximum swing/twist, and
retain sub-micrometer stock error. This is a technical PASS only.

Human Eye still rejects the pose. The dominant fingers form a flat curtain
beside the grip instead of wrapping it; the support hand remains occluded and
visually unproven; the rifle reads as floating across the torso; and the rear
camera does not show the declared grip evidence. Material separation is a real
improvement, but the paired white visor hotspots read like eyes. Formal review:
`evidence/2026-08-09/g6-assault-rev43-vlr7-grip-source-build-v1/HUMAN_EYE_AUDIT.md`.
Rev43 therefore remains review-only and must not be browser-integrated.

## Rev44 rights-aware reference recovery

Rev43's rejection is now traced to its digit solver rather than palm placement:
the palm is measured on the intended VLR-7 surface, but one shared palm-normal
curl bends every phalanx into the same plane. Passing angle and palm-error
telemetry therefore cannot produce or prove a grip circumference.

Resource Pilfer qualified two new public CC0 packets entirely outside the
product tree. Both registries validate through `technical-inspection`, and both
are deliberately classified `REFERENCE ONLY`:

- `resource-quarantine-20260809/oga-low-poly-fps-rifle-hands` contains a valid
  492-triangle rifle/hands GLB and a 0.25-second recoil clip, but all 922 render
  vertices are weighted to one bone. It has no wrist, finger, thumb, grip,
  stock, muzzle, or contact-marker articulation. It may inform only coarse
  first-person composition and recoil timing.
- `resource-quarantine-20260809/oga-fps-arms-rigged-only` contains a 50-bone,
  8,152-triangle MakeHuman-derived arms rig with hand-control IK, separate palm
  branches, three phalanges per digit, and separate thumb chains. It contains
  no weapon, socket, firearm landmark, or authored rifle pose; the test and base
  bind matrices also diverge. Its mesh, texture, bind pose, and animation must
  not be integrated. Only the rigging principles are retained: coarse hand
  controls, per-finger contacts, adjustable distal curl ratios, and separately
  solved thumb opposition.

OpenGameArt listing snapshots, CC0 legal code, current official MakeHuman CC0
export/core-asset guidance, original archives, archive inventories, extracted
hashes, previews, and static inspection reports are preserved beside each
candidate. No external script, constraint, Blend file, browser runtime, or
product import was executed.

The previously quarantined KayKit Character Animations 1.2 remains CC0 and
`REFERENCE ONLY`. Static inspection of its two-hand shooting clip supports only
macro silhouette principles: turn the chest toward the weapon line, counter-
turn the head toward sight, keep the rear hand compact, extend the support hand,
stagger the shoulders, keep the rear elbow low, and place the support elbow
beneath/outside the handguard. Its six-joint skeleton has no elbows, wrists, or
fingers, so no raw tracks or contact data will be copied.

Rev44 is therefore scoped as a distinct source-only landmark solve. It must
preserve Rev43, the hash-pinned VLR-7, `0.86` scale, authority muzzle, stock
seat, 66-bone/twelve-action contract, reach/palm/wrist/LOD/skin/package gates,
and all fail-safe manifest flags. Each digit gets its own decoded weapon-surface
fixture and external wrap waypoints; the solver must gate fingertip contact,
weapon clearance, ordering, wrap angle, thumb opposition, and trigger-index
discipline across all six weapon-contact actions. Evidence cameras must derive
from the same contact frames and prove both grip clusters locally. No Blender
run, render, Human Eye verdict, runtime integration, or release claim exists for
Rev44 at this checkpoint.

## Rev44 landmark-grip technical run

The final Rev44 source passed independent static review at core SHA-256
`9d61110901f85206f2454b4ba046fb5e9b220efc4faf147e65a9bd4a4456efac`
and wrapper SHA-256
`02f1741178124b41c7be7d9ca8268aaba456f3e3053fb12fbea62ec2641eaa89`.
The preserved Rev43 source remained byte-identical at
`a84a6fad934c67d5d73b95346e687b5a658754648ae059b3a405ef94767b3403`.

Exactly one protected Blender 5.1 invocation was then executed. It failed
closed before any export or render while solving `KYX_REV17_TP_IDLE` from
`ual1 / Idle_Loop`, source frame 0 to output frame 1. The measured dominant
wrist swing was `65.698` degrees against the unchanged `65.000` degree
anatomical limit. No master Blend, GLB, manifest, report, or review image was
emitted. The distinct Rev44 model and runtime directories exist but are empty.
The preserved console log is
`evidence/2026-08-09/g6-assault-rev44-vlr7-landmark-grip-source-build-v1/blender-console.log`
at SHA-256
`6705ceb37e786320cf2bf85313af5f12e9b2b1d9fe2c9d73210c84d1e8996731`.
The shared runtime was returned with zero protected Blender/Unreal processes.

Blender itself returned process code 0 despite the uncaught Python traceback,
so all future bounded invocations must include `--python-exit-code 1` and must
still treat the fail-closed source traceback as authoritative. The Rev44 packet
is sealed as a technical failure. Human Eye was not run and remains `UNKNOWN`;
there is no image to accept or reject. Rev44 must not be rerun, integrated, or
promoted under the same identity.

The smallest next correction belongs to a distinct Rev45 source and packet.
It must preserve the semantic hand frame, exact palm contact, triangle-74
dominant-index fixture, all ten digit landmarks, stock, muzzle, `0.86` scale,
and the `65 / 70` degree wrist limits. The preferred correction is a bounded
dominant elbow-plane rotation about the exact shoulder-to-wrist-target axis,
which can change the forearm arrival orientation without moving the wrist
target or weapon contract. The correction must be fixed/deterministic, pass
every integer frame of all six contact actions, record all-frame wrist extrema,
and add elbow-to-torso/weapon clearance plus side and three-quarter silhouette
evidence. Relaxing the wrist gate or biasing the measured semantic hand frame
is explicitly rejected.

## Rev45 anatomical-grip source checkpoint

Further independent review found a smaller contact-faithful correction than
moving the elbow plane: rotate only the requested digit-extension direction
inside the exact requested palm plane. Rev45 therefore preserves the raw
semantic frame and exact palm normal, searches both signs for the smallest
in-plane correction that reaches a `64.5` degree solve target, and caps the
authored deviation at `3.0` degrees. Every probe restores the dominant chain,
recomputes the wrist target from the exact palm anchor, re-solves the arm, and
remeasures the post-solve wrist basis. The unchanged authoritative gates remain
`65 / 70` degrees. Corrections that jump more than `0.75` degrees between
adjacent frames or change sign meaningfully fail closed. The support hand is
unchanged.

The isolated Rev45 core and wrapper pass Python AST and independent static
review:

- core SHA-256:
  `2eb87de354d682f9fe35c0eda0e787c98b7eba779e9819b8ab4c761db656091f`
- wrapper SHA-256:
  `9bcc3a16f241c44fc8c779c5a591ec399942d02c636e95a682be71bb8f69e18c`
- preserved Rev44 SHA-256:
  `9d61110901f85206f2454b4ba046fb5e9b220efc4faf147e65a9bd4a4456efac`
- preserved Rev43 SHA-256:
  `a84a6fad934c67d5d73b95346e687b5a658754648ae059b3a405ef94767b3403`

All Rev44 source hashes, `0.86` scale, exact triangle-74 and ten-digit fixture
pins, rejected-seed history, stock, muzzle, palm, reach, wrist, rig, action,
LOD, skin, package, contact, BVH, trigger, and camera gates remain unchanged.
Requested/applied bases, correction, wrist displacement, convergence,
all-frame extrema, and continuity are recorded. The wrapper refuses to open
the authoring core unless Blender is launched with `--python-exit-code 1`.

No Rev45 Blender execution, render, Human Eye verdict, browser integration,
release claim, or deployment exists at this checkpoint. A single bounded run
is queued behind the currently occupied shared Blender slot and requires a
fresh explicit grant.

## Exact-contact browser integration seam

The shared character runtime now has a source-only, candidate-neutral seam for
an eventual Human Eye-accepted authored-contact candidate. Review candidates
can provide exact per-authority-weapon grip/support points and select either
the existing runtime CCD correction or `authored-contact-monitor-only`.
Monitor-only candidates fail closed unless at least one exact contact profile
is supplied. Contact points, scale, and policy are validated and frozen at the
review installer boundary.

`Rev17Character` selects profiles by the attached weapon's authoritative ID,
mounts the separately selected world weapon from that exact contract, and
reports the profile source, policy, exact points, authored/solved support-hand
positions, reach, target distance, and final contact error. Its generic support
hand CCD no longer runs when an accepted source animation is intended to own
the contact pose. This prevents the previous generic rifle support target from
moving a baked VLR-7 pose by roughly `127.7 mm` after runtime scale.

The isolated contract test uses the decoded VLR-7 points:

- dominant grip: `[0, -0.115, 0.19]`
- support contact: `[-0.019679019928, -0.062568904877, -0.1881275177]`
- uniform runtime scale: `0.86`

Bounded verification on the current dirty source state:

- `git diff --check` on the five contact-seam files: PASS (line-ending notices
  only)
- focused Vitest: `3` files / `15` tests PASS
- focused ESLint: PASS
- application TypeScript check (`tsc -p tsconfig.json --noEmit`): PASS

The repository's `pnpm exec` dependency-status wrapper attempted an
interactive module purge after the storage migration and correctly aborted in
the non-interactive shell. Verification used the already-installed pinned
bundled Node runtime directly; no dependency tree was rewritten.

This seam does not enable Rev45, invent asset hashes, package a candidate, or
establish any visual/runtime acceptance. Rev45 remains source-only until its
one protected Blender execution and separate Human Eye verdict pass.
