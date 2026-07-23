# Phase 7 character refinement v3 — visual decision

- Decision: **REJECTED**
- Date: 2026-07-20
- Scope: visual quality only
- Runtime/G6 effect: none; the asset remains non-integrated and cannot pass G6

## User feedback

The player models remain “too blocky/shape like.”

## Review findings

The second-pass export is structurally valid and improves on the earlier zero-mesh GLB defect, but structural validity does not satisfy the visual benchmark. Direct inspection of the close, front-grayscale, side, and weapon-contact plates found:

- upper and lower arms still read as smooth tubes with weak elbow and muscle/garment transitions;
- torso construction reads as a flat vest with attached polygon plates rather than armor integrated over a shaped garment/ribcage;
- helmet reads as a smooth appliance-like shell rather than deliberate brow, cheek, face-seal, rear-shell, and neck layers;
- pelvis and legs retain inflated-cylinder construction with decorative jagged knee breaks;
- boots remain simplified extruded footwear without convincing outsole, heel, ankle, and articulation construction;
- gloves use capsule-like fingers and a mitten/palm mass despite improved contact placement;
- the rifle is recognizable but still visibly assembled from rectangular receiver, rail, magazine, and barrel parts;
- the full silhouette remains a procedural mannequin rather than the authored tactical-manga hero required by the art bible.

## Evidence reviewed

- `output/renders/refinement-v3-close-color.png`
- `output/renders/refinement-v3-front-ortho-grayscale.png`
- `output/renders/refinement-v3-side-ortho-color.png`
- `output/renders/refinement-v3-weapon-contact-color.png`
- `output/character-refinement-v3-report.json`

## Required direction

Do not integrate or cosmetically patch v3. Preserve it as rejected evidence. The next canonical attempt must use continuous shaped anatomical and garment surfaces, integrated layered armor, functional helmet/glove/boot construction, and a unified authored rifle. The concept reference under `assets/source/characters/kyx-vanguard/concept/` establishes the new visual target but is not itself accepted art.
