# V6-C Visual Benchmark Revision 7 Review

## Decision

`STRONGEST_CURRENT_COMBAT_SILHOUETTE_CANDIDATE`

`READY_FOR_ROOT_VISUAL_REVIEW`

`NOT_ACCEPTED` / `NOT_V6-C` / `NOT_G6`

Revision 7 materially improves the authored combat read over revision 6 and is suitable for direct root review. This document does not grant visual acceptance or authorize downstream production gates.

## Direct visual findings

- The torso now reads as a connected load-bearing system: a continuous front/side/back yoke, sternum and rear spines, side rib panels, rib arcs, and a waist load band visually tie the upper body together.
- Shoulder bridges plus elbow and knee articulation bands and hinge rails create clearer transition logic at the major joints.
- The helmet is no longer only an egg/shield volume. Temporal and jaw framing, a rear occipital shell, visor framing, and rear vents establish side and rear architecture.
- Near-black graphite, structural blue steel, warm ivory ceramic, and red identity accents establish a more legible material/value hierarchy.
- The rebuilt rifle has a distinct stock, receiver, handguard, rail, grip, magazine, rooted barrel, and muzzle. Its silhouette is materially more credible than revision 6.
- The authored upper-body silhouette remains readable in the 5 m, 20 m, and 40 m distance board.

## Residual visual risks for root judgment

- The paired high-clavicle ivory pieces remain highly symmetric and somewhat scalloped; they may still read as organic or cloud-like instead of disciplined ceramic inlays.
- The dark rib harness arcs are thick enough to read as exposed cables or rods in some views rather than overlapping armor structure.
- The broad helmet side and occipital steel panels still have some flat, slab-like area that may need stronger plane breaks.
- The rifle is a benchmark-level authored silhouette, not a production-ready weapon asset.
- Literal two-hand and shoulder contact is deliberately absent at this static visual gate.

## Contact-evidence boundary

The standalone `kyx-v6c-benchmark-rev7-contact-intent.png` view visualizes three witness positions only: primary grip, support grip, and shoulder. It is not a held-contact board and proves no hand placement, shoulder seating, rig behavior, or animation. A held-contact board was omitted because literal contact is reserved for the later rigged gate by the current contract.

## Evidence packet

- Direct review board: `renders/kyx-v6c-benchmark-rev7-direct-review-board.png`
- Component review board: `renders/kyx-v6c-benchmark-rev7-component-review-board.png`
- Distance review board: `renders/kyx-v6c-benchmark-rev7-distance-review-board.png`
- Contact-intent view: `renders/kyx-v6c-benchmark-rev7-contact-intent.png`
- Rifle view: `renders/kyx-v6c-benchmark-rev7-rifle.png`
- Authoring report: `v6c-benchmark-rev7-authoring-report.json`
- Render report: `v6c-benchmark-rev7-render-report.json`

## Integrity and structure audit

- Revision 7 blend SHA-256: `b07d9657cefe68d33f4657da8fb2cf3498339bbc49c333036f0782c78137e4d6`
- Revision 6 preserved SHA-256: `bb3ec3a885ae0f36740ed979a38bcdfe6e354b93e497f29280b131f42aed89a2`
- Accepted V6-A preserved SHA-256: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
- Blender 5.1.2 reopen audit: 98 objects, 96 revision-7-prefixed objects, 60 meshes, and 3 contact-witness empties.
- Reopen audit found zero V6-B objects, armatures, actions, and external libraries.
- All 17 evidence assets exist, are non-empty, and match the byte counts and SHA-256 values recorded in the render report.
- Rendering did not alter the revision 7 blend; its pre-render and post-render hashes match.

## Explicit non-claims

No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, performance result, V6-C acceptance, or G6 acceptance is claimed.
