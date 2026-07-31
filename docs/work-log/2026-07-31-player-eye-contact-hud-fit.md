# Player-eye rifle contact and HUD fit batch

Date: 2026-07-31

Starting canonical commit:
`38d06cb9df4d8d7654bbe2850044a6c7d8bf93e8`

## Purpose

Close two concrete player-eye defects found by the recovered full-game audit:

1. the VLR-7 ADS arms formed an oversized lower-screen V and read as long,
   plate-heavy procedural limbs;
2. the shared four-slot ability instrument truncated ability names at narrow
   desktop widths and, once measured correctly, also truncated Launch and Smoke
   at 1280x720.

This is a presentation correction, not final weapon/HUD visual acceptance.

## Source changes

- `src/weapons/KyxFirstPersonContactRig.ts`
  - advances the contact contract to
    `authored_two_hand_assault_suit_v5`;
  - moves both elbows inward and down;
  - shortens the visible plated gauntlet spans;
  - reduces lower-sleeve and forearm-plate radii/width;
  - preserves both exact grip markers and the upper-arm camera crop.
- `src/ui/kyx-cutline.css`
  - gives the shared four-slot instrument sufficient width at standard and
    narrow desktop sizes;
  - reduces narrow-layout glyph/gap pressure without hiding the names;
  - preserves non-overlap with vitals and weapon telemetry.
- `tests/unit/weapons/kyxArmoryPresentation.test.ts`
  - binds the v5 contact contract and camera-crop/plate-width invariants.
- `tests/browser/g7-ui-presentation.spec.ts`
  - now fails on actual ability-name or weapon-name clipping, not merely page
    overflow or bounding-box overlap.
- `tools/evidence/capture-g7-human-ui.mjs`
  - adds a representative `1024x640` gameplay HUD frame.

## Visual result

The focused first-person capture shows one rifle/optic, two retained contact
hands, a narrower lower-screen arm silhouette, and no duplicate/overlapping
weapon shell. The arms no longer span the full sight picture. They remain a
procedural contact rig and are not a substitute for the authored Assault arms,
gloves, animation, or final weapon model pass.

The 1024x640 HUD frame shows complete Blink, Launch, Smoke, and Frag names. The
instrument remains centered, stays inside the viewport, and does not overlap
the vitals or weapon readout.

External review evidence:

- `D:/AI Projects/Projects/Games/evio/review-evidence/2026-07-31/kyx-player-eye-contact-v5-38d06cb`
- `D:/AI Projects/Projects/Games/evio/review-evidence/2026-07-31/kyx-cutline-label-fit-v2-38d06cb`

## Consolidated verification

- app TypeScript: PASS;
- changed-file ESLint: PASS;
- `tests/unit/weapons/kyxArmoryPresentation.test.ts`: 6/6 PASS;
- G7 isolated Playwright suite: 4/4 PASS;
- focused 1280/1024 text-measurement rerun: 1/1 PASS;
- first-person composition capture: 7/7 frames, zero capture errors;
- G7 player-eye capture: 18/18 frames, zero capture errors.

The strengthened test initially failed because Launch and Smoke were also
clipped at 1280x720. The width correction was applied and the full suite then
passed. This failure is retained here because it demonstrates the difference
between container-fit and text-fit evidence.

## Nonclaims and next action

- no human weapon/HUD acceptance;
- no authored third-person character or role helmet integration;
- no animation acceptance;
- no Practice/online arena convergence;
- no audio/VFX, 2/4/8, soak, staging, or release claim.

Next: replace the procedural online opponent with one provenance-clean,
reviewable Assault runtime candidate, then converge Practice onto the shared
Inkfall authority/presentation path before final population evidence.
