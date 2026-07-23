# KYX Vanguard v6 sculpt and retopology plan

Status: **V6-A authored anatomy/silhouette candidate complete; human review pending; no G6 claim**

Pinned concept target: `assets/source/characters/kyx-vanguard/concept/kyx-vanguard-model-sheet-v1.png`, SHA-256 `067a3eba77f9c9e566fe7aeba9684346bfd9fcd162de8ead14194640c0fb76c3`.

Pinned anatomy checkpoint: `source/kyx_vanguard_v6_cc0_anatomy_seed_sanitized.blend`, SHA-256 `e2d5b41ce10364cfc570fb0efe961c6548fe6fb90ab87850b453728372669e0d`.

The source is credible continuous anatomy, but it is a neutral CC0 human and not the KYX character. The first production checkpoint must visibly depart from this base through deliberate silhouette and construction work before armor is treated as presentable.

## 1. Immutable source and working duplicate

- Never modify the sanitized checkpoint in place.
- Create `model/kyx_vanguard_v6_sculpt_working.blend` as the first working duplicate and record its initial hash.
- Normalize the working root to world origin and ground the plantar surface without changing the source checkpoint.
- Preserve a visible CC0/source marker on the untouched duplicate until the first project-authored sculpt checkpoint is saved.
- Do not enable or install third-party generators or add-ons. Blender's own sculpt, retopo, and bundled Rigify tooling may be used under the separate runtime-skeleton rules.

## 2. Anatomy and silhouette pass before costume

Target the sheet's lean athletic operator rather than a bodybuilder, inflated suit, or generic mannequin:

- preserve readable clavicle, acromion, deltoid insertion, elbow, ulnar wrist, pelvis, patella, calf, Achilles, heel, palm, knuckle, and five-digit landmarks;
- reduce any generic roundness in torso-to-pelvis and thigh transitions while keeping plausible soft-tissue continuity;
- establish the sheet's long-limbed, mobile silhouette with narrower waist, controlled shoulder width, stable knee tracking, and boot-ready foot proportion;
- keep the head/neck interface usable for a sealed helmet and cowl without burying the trapezius and jaw landmarks;
- test neutral A-pose, relaxed rifle-ready stance, crouch, slide compression, overhead reach, and 120-degree knee/elbow flexion before costume blocking.

Required clay review: front, side, back, and three-quarter color/grayscale plates plus 5 m, 20 m, and 40 m silhouette reads. Armor work cannot hide a failed anatomy review.

## 3. Concept-matched garment and hard-surface construction

Build separate authored pieces; do not inflate or duplicate the body surface:

- black technical undersuit with seam logic, panel tension, articulation zones, and compression/fold behavior;
- fitted ivory ceramic chest and back structures with an abdominal articulation break rather than a barrel shell;
- layered shoulder caps with real thickness, attachment hardware, and arm-clearance gaps matching the model-sheet hierarchy;
- asymmetric red accent routing and restrained cyan device/readout accents;
- connected helmet construction: crown, brow, visor seal, cheek, chin, rear shell, side hardware, and neck interface;
- separate cowl/scarf volume with believable drape, thickness, and deformation clearance;
- constructed forearm guards, five-digit gloves, thigh plates, knee shells, shin guards, and treaded boots with distinct soles, heel blocks, toe caps, and ankle articulation.

Every armor piece must show manufactured edges, thickness, fastening logic, and deformation gaps. Reject capsule, slab, dome, clamshell, and box-extrusion reads at close, mid, and gameplay distances.

## 4. Auto Rifle and literal contact

Author separate world and first-person rifle assets from the sheet's design language:

- continuous stock, receiver, pistol grip, trigger/guard, magazine well, removable magazine, handguard, vent/negative-space cuts, barrel, muzzle device, sights, controls, and sockets;
- reachable trigger, safety, magazine release, charging action, and reload path;
- right palm and digits wrapped around the grip with the index finger visibly inside the guard at the trigger only in fire-ready poses;
- left palm and digits wrapped around a real support-hand contact region;
- stock seated at the shoulder pocket with no hovering or body penetration;
- contact checks for idle, walk, sprint, crouch, slide, jump, landing, firing, reload, melee, grenade/ability transition, and death.

Weapon-contact plates must remain an explicit human-review gate. Constraints and numeric proximity alone cannot approve contact.

## 5. Project-authored retopology and UVs

- Build a new deformation cage; do not present the vendor topology or an automatic decimation as final LOD0.
- Preserve clean loops around shoulders, elbows, wrists, thumb web, finger bases, hips, knees, ankles, neck, visor seal, and garment/armor interfaces.
- Target third-person LOD0 at 25k-45k triangles, LOD1 at 12k-22k, and LOD2 at 4k-8k, with one to three runtime material primitives.
- Validate silhouette and contact at each LOD. Manually repair helmet, fingers, boots, rifle, joint outlines, and armor gaps after reduction.
- Create authored non-overlapping UVs with measured texel density and deliberate mirrored/unique regions. Plan 1K-2K atlases per visible family unless a measured viewmodel need justifies 4K.
- Remove hidden body faces only after extreme-pose clipping and armor separation are proven.

## 6. Materials, rig, and dedicated first-person assets

- Author cloth, ceramic, rubber, painted metal, skin, line, team, and wear masks from scratch. No vendor or generator-default surface may remain visible.
- Define a stable 60-90-bone runtime deform skeleton with complete fingers, required sockets, and no Rigify UI/control bones in runtime exports.
- Limit runtime skinning to four influences per vertex and weight-test shoulders, wrists, hips, knees, ankles, crouch, slide, landing, and death extremes.
- Build dedicated first-person arms/sleeves/hands at 15k-30k triangles and one or two materials; do not crop the third-person body.
- Build a dedicated viewmodel rifle export and prove it at 70-110 gameplay FOV plus the selected viewmodel FOV.

## 7. Checkpoints and acceptance sequence

1. `V6-A`: authored anatomy/silhouette clay review, no costume.
2. `V6-B`: garment, armor, helmet, glove, boot, and rifle construction review.
3. `V6-C`: retopo/UV/material review with topology and texture-memory evidence.
4. `V6-D`: runtime skeleton, weighting, first-person assets, and required action/marker matrix.
5. `V6-E`: LOD0/1/2 and world/viewmodel GLB validation, Khronos checks, manifest hashes, and budget evidence.
6. `V6-F`: direct runtime 2/4/8-player views, close/mid/far color and grayscale, contact/clipping/deformation plates, and performance capture.
7. Explicit human visual acceptance, followed by G6 audit. No earlier checkpoint may claim G6.

At each checkpoint, preserve failed attempts and record exact source/export hashes. Technical validation is necessary but never substitutes for direct visual judgment.
