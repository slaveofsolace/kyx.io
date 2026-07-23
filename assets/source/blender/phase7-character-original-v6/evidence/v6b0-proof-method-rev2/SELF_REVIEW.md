# V6-B0 proof-of-method revision 2 strict self-review

Date: 2026-07-22

Decision: **SELF-REJECTED / METHOD NOT APPROVED / NOT V6-B0 APPROVED / NOT V6-B / NOT V6-C / NOT G6**

Revision 2 is the single bounded correction allowed after revision 1. It replaces the slab stock with two continuous load rails, hides all V6-A source-eye witnesses, smooths evidence trim paths, lowers the lighting exposure, and adds an oblique hand-first contact camera. Direct inspection still rejects the method. No revision 3, complete character, rig, export, LOD, animation, or runtime integration was produced.

## Source isolation

- Immutable continuous V6-A input: `../../model/kyx_vanguard_v6a_anatomy_sculpt_working.blend`
- Required SHA-256: `074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d`
- Pinned concept: `../../concept/kyx-vanguard-v6c-production-target-v1.png`
- Required SHA-256: `9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2`
- No revision 12 or later failed armor Blend was opened, appended, linked, or inherited.

## What the method attempted

- Undersuit: V6-A torso/right-arm surface extraction with live Shrinkwrap, Subdivision, Solidify, manufactured edge softening, fabric bump, routed seams, and elbow/axilla tension-fold curves.
- Hero armor: chest and right-deltoid surface retopology with live clearance offsets, physical thickness, multi-segment bevels, true boolean negative space, edge seals, two chest-to-shoulder load rails, and a pivot.
- Weapon contact: actual five-digit V6-A hand surface extraction with proportional mesh deformation and corrective smoothing around a multi-ring ergonomic grip; a boolean-cut receiver region, continuous guard/trigger, controls, magazine path, and skeletonized shoulder stock were staged around it.

These are materially different operations from constructing a complete body out of capsules, boxes, slabs, or floating primitive plates. The direct render nevertheless proves that using the right modifier names is not enough: the visible result still fails.

## Direct visual gate

| Required proof | Direct result | Decision |
| --- | --- | --- |
| Suit preserves anatomical tension instead of smoothing it away | Torso and arm curvature survive and fabric/seam routing is visible, but the chest overlay obscures most useful tension reads | **Insufficient** |
| Armor has continuous manufactured perimeter, readable thickness, attachment, negative space, and arm clearance | Thickness and rails exist, but the face-mask/boolean result fragments into disconnected bright islands and the perimeter is not production-clean | **Fail** |
| All five digits visibly wrap, with palm and four-digit grip contact | Five digits are visible and curled, but the hand-first camera does not show four fingers seated on the grip surface or an unobstructed palm witness | **Fail** |
| Index sits inside the guard at the trigger with clearance | Guard and trigger are visible, but the index is not visibly seated on the trigger and guard clearance cannot be judged | **Fail** |
| Stock terminates visibly at the shoulder pocket | The two rails lead toward a small pad, but the exact pad/shoulder interface is occluded and cannot prove contact | **Fail** |
| Method unmistakably improves on the user's blocky/shape-like rejection | The stock silhouette improves over revision 1, but the broad receiver and fragmented armor still read as procedural blockout | **Fail** |

## Exact blockers

1. Region selection by face-center masks does not produce a clean manually controlled armor cage on this anatomy. Subdivision, Solidify, bevels, and booleans amplify disconnected islands instead of yielding one manufactured shell.
2. The five-digit source-hand deformation curls digit volume, but staging and camera placement do not prove contact. The visible fingers curl beside and partly behind the grip; the trigger/index relation remains ambiguous.
3. The stock rails visually terminate near the shoulder, but no unobstructed tangent/contact view proves that the pad seats in the shoulder pocket.
4. The receiver core remains a broad profiled extrusion and still carries a slab-like blockout read compared with the pinned concept's interlocking receiver, stock, handguard, and control density.
5. The partial bust is valid as a method specimen, but its open boundaries and fragmented armor prevent it from acting as a presentable character checkpoint.

## Required next production method

Do not extend either revision. Start a new interactive Blender file from the immutable V6-A source and:

1. create a manually drawn quad retopology cage over the chest and deltoid with Poly Build/Shrinkwrap, one continuous perimeter per manufactured part, and visually inspected edge flow before Solidify or booleans;
2. use Sculpt/Cloth brushes on the extracted garment for seam tension, compression, and folds, checking silhouette in Material Preview before armor is shown;
3. pose and sculpt the hand in a hand-first file around the final grip/guard/trigger geometry, keeping the receiver hidden until palm, four gripping digits, thumb opposition, and index-on-trigger are independently visible;
4. lock an unobstructed 45-degree palm/trigger camera and a separate stock/shoulder tangent camera before adding receiver surface detail;
5. boolean and retopologize the weapon one connected subsystem at a time, rejecting any broad slab read in clay before materials.

Only a new direct board that independently proves those contacts and continuous surfaces should authorize expansion to a full V6-B character.

## Evidence

- Direct board: `renders/kyx-v6b0-proof-method-rev2-three-view-board.png`
- Pinned-concept comparison: `renders/kyx-v6b0-proof-method-rev2-concept-comparison-board.png`
- Direct source renders: `renders/kyx-v6b0-proof-method-rev2-*.png`
- Machine inventory: `authoring-report.json`
- Render record: `render-report.json`
- Human-readable inventory: `TOPOLOGY_AND_METHOD_INVENTORY.md`
- Immutable file hashes: `HASHES.sha256` and `hash-manifest.json`
