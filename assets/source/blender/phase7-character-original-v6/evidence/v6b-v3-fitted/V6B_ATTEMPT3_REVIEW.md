# KYX Vanguard V6-B isolated attempt 3 fitted-construction review

Status: **useful construction WIP; direct visual audit complete; not accepted V6-B; not G6**

This lane is isolated from `author_v6b_construction.py`,
`render_v6b_review.py`, the current root-owned V6-B working Blend, and
`evidence/v6b-renders/`. It does not overwrite the accepted V6-A checkpoint or
the preserved attempt-1/attempt-2 failures.

## Strongest preserved revision

- Blend: `model/v6b-v3/kyx_vanguard_v6b_fitted_attempt3_rev10.blend`
- bytes: `13,030,611`
- SHA-256: `9d044885ea5178417898e36a89f4f9e7e6d3fd82088f2fae10077cca7ef7577f`
- authoring report: `v6b-v3-authoring-report-rev10.json`
- render report: `v6b-v3-render-report-rev10.json`
- render directory: `renders-rev10/`
- authored inventory: 90 objects, 83 meshes, 4 curves, and 34 literal
  body-surface-derived shell objects

The accepted V6-A input remained byte-identical before and after every v3
authoring run:

- `model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
- SHA-256 `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`

## What attempt 3 proves

- Garment, chest, back, shoulder, forearm, glove, thigh, knee, shin, helmet,
  and ankle shells can be extracted from the accepted anatomy and thickened
  outward, avoiding the visibly floating panels in preserved attempt 2.
- The accepted human silhouette remains dominant; the lane does not replace
  the body with torso or limb cylinders.
- The helmet now has an open crown volume, angular visor, literal
  visor-to-temple bridges, jaw/chin pieces, side fasteners, and a connected
  close-fitted neck/cowl interface rather than exposed facial cutouts.
- Boots fully hide the source feet for review and use measured, rotated,
  multi-section uppers, ankle shells, toe caps, heel cups, rounded outsoles,
  and tread objects. They no longer expose source toes or use the attempt-1
  slab geometry.
- The rifle is a separate, visibly labeled design review with stock, receiver,
  grip, trigger/guard, magazine, handguard, rails, support grip, vents, barrel,
  shroud, muzzle, sights, ejection port, butt pad, and contact-target witnesses.
  It is not shown touching an unrigged body.

## Direct visual decision

`REVIEWABLE_WIP`, not V6-B acceptance.

Rev10 is materially better than preserved attempts 1 and 2: shells visibly
follow the body, joint transitions remain readable, the earlier floating seam
tubes and collar mantle are gone, source toes are hidden, and the helmet visor
is structurally bridged to the temples. The front, side, back, three-quarter,
helmet/chest, limb, boot, and rifle plates were inspected directly.

The following remain too schematic for a production-quality V6-B decision:

- chest/back boundaries inherit a broad early construction read and need
  authored clean panel topology, fastening hardware, and controlled edge flow;
- forearm, thigh, knee, and shin shells are fitted but still visually simple;
- the cowl is a close-fitting construction volume rather than a finished
  believable fabric drape;
- the helmet is connected but still generic and requires cleaner crown/cheek/
  jaw segmentation plus stronger concept-specific asymmetry;
- boots are enclosed and measured but remain an early smooth construction,
  without final sole layering, ankle articulation, or authored tread design;
- the rifle remains a construction blockout and literal two-hand/shoulder
  contact is correctly open until a defensible rigged pose exists.

Consequently this attempt must not unlock retopology, rigging, runtime export,
or a G6 claim on visual evidence alone. Its useful result is the surface-fit
method and a cleaner construction baseline for a later art pass.

## Rev10 render hashes

| View | File | SHA-256 |
|---|---|---|
| front | `renders-rev10/kyx-v6b-v3-fitted-front.png` | `c7dc142b4c6a119fb261ae4a190f913b96cb7fc450bf948b23bf35d0a88eea4a` |
| side | `renders-rev10/kyx-v6b-v3-fitted-side.png` | `e6c4087aa5eb9ad57d902a5edbb981d672bcf971445a1a2087fc7c6cdf4e23b7` |
| back | `renders-rev10/kyx-v6b-v3-fitted-back.png` | `264bb6c956a6af0d059ae9b0a866f859e3515cb5a2001db3de27fcce65f6bf34` |
| three-quarter | `renders-rev10/kyx-v6b-v3-fitted-three-quarter.png` | `3eeecc9357e684eb22a176ae2d9a53dd3fcb9d972368a6c2697c7f17fe9e528d` |
| helmet/chest | `renders-rev10/kyx-v6b-v3-helmet-chest.png` | `fbb9258481087c49d500da993a7edd69b09ccfb7f7c4f9a3390963063917508e` |
| limb fit | `renders-rev10/kyx-v6b-v3-limb-fit.png` | `9a9065b4ad8c8fa06a729739b44e1034bb960d534486b977e65e4fa162e2f4f5` |
| boot detail | `renders-rev10/kyx-v6b-v3-boot-detail.png` | `e4b2884d1b33b0222a94bfcecef7a2488409b6d9bddd12cfa0f34dee391bd861` |
| rifle design | `renders-rev10/kyx-v6b-v3-rifle-design.png` | `d0af78c383cc7c8426cd26d67476aad41fb397f3fb94349926e932921817444d` |

## Scripts

- `scripts/author_v6b_fitted_v3.py` — SHA-256
  `208377e57180d7401cf8a1ba057c8016eb758d5259d0013dfec9a0d705045a82`
- `scripts/render_v6b_fitted_v3.py` — SHA-256
  `9274bb0e59f407cfa3a36bdbc011623e855ff35e41b2773ba50b3170d8c8c9c7`

## Preserved v3 iteration history

Every Blend, authoring report, render report, and render directory remains in
the separate v3 paths. No revision overwrote an earlier one.

- rev1 `6c698071aeb4efb958a337102315191f5dbbe7c74035b0e2d1edafdb26f989a5`:
  literal fit established, but jagged masks and exposed facial/foot anatomy.
- rev2 `21689c78bf278387bb4a0977d3efdb55c8addb1d67219af0247abbc7ee57c21d`:
  smoothed masks and visor, but rejected for the oversized collar mantle and
  slab/panel/boot/rifle reads.
- rev3 `e416b11574515280d11ee715afa82c21dfe295d47bc04fb8a76e3ab6971fcb39`:
  visor sealed, but open-loft collar still formed a mantle.
- rev4 `cffe4b30f7a650a9d70c6e6da6e2a88d989984362e5266ee7760188cb227d888`:
  mantle removed and armor segmented; boot capsules badly misaligned.
- rev5 `3e649d389509258485066db8ceb9e942240516360deecdec5161102d1d9ff7a1`:
  measured boot centers, but bubble-like boot volumes remained.
- rev6 `b2c5b14103b24b5b1ed62650c5ede32bc2af155a7c99e42c30dc060830fb3fb5`:
  hidden source feet and tapered boot experiment; platform read rejected.
- rev7 `256f54225e40176e775bbb6cebc8332fc3e3f21c8b79213fc4db7eaa5beb2808`:
  multi-section boot upper established; sole/tread gaps remained.
- rev8 `c36ac2a506ef1d7d2b1612ea284e56cf3edf26a2a09040fc34b57983c908aedb`:
  closer collar and attached outsole/tread proportions; floating seam tubes and
  visor-side gap remained.
- rev9 `fccdb29e2f4453992893dfe65ab3d482d853c503a098e7f06dc8c36e7cfe992c`:
  floating seam tubes removed, accepted underlayer preserved but hidden behind
  derived review shells, and literal visor-temple bridges added.
- rev10 `9d044885ea5178417898e36a89f4f9e7e6d3fd82088f2fae10077cca7ef7577f`:
  current strongest construction WIP and the reviewed handoff candidate.

## Non-claims

There is no final retopology, authored UV set, texture set, runtime skeleton,
weighting, animation, LOD, GLB, first-person asset, runtime integration,
performance proof, literal weapon-contact proof, V6-B acceptance, or G6 claim.
