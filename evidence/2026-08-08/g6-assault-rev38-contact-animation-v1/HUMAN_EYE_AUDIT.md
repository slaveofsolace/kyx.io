# Rev38 contact and animation player-eye audit

Verdict: **REJECT visual direction; KEEP runtime/contact fixes.**

## Observed

- The stable spawn view shows seven readable remote combatants and the selected Quaternius rifle without first-person mesh overlap.
- The remote weapon is attached to the firing hand and the support hand remains in contact.
- The Rev38 body reads as a thin mannequin at both loadout and arena distances. Torso, helmet, hands, and lower legs lack the mass and authored armor hierarchy expected of the Assault role.
- The live locomotion frame includes an exaggerated cross-step/lean that can read as skating rather than planted movement.
- The loadout turntable presents the model too small to judge construction or material transitions.
- The hold-Tab scoreboard is compact, centered, and sufficiently opaque without covering the whole playfield.

## Measured

- 7 remote avatars
- 7 Rev38 candidate bindings
- 7 shared animation contracts
- 7 active authored clips
- 7 equipped weapon attachments
- 7 support-hand contacts
- 0 procedural remote fallbacks
- 0 console, page, or request failures
- first-person overlap check: clear

The exact machine-readable values are in `runtime.json`.

## Inferred

- Contact and clip wiring are ready to reuse on a stronger Assault mesh.
- The visual regression is primarily the candidate mesh/silhouette and framing, not loss of the animation or weapon attachment contract.
- Team color should remain a restrained material accent. It should not change the Assault silhouette or armor class.

## Unknown

- Human feel for locomotion cadence, foot planting, reload, throw, hit reaction, and death under direct play.
- Crouch quality; the current remote path still uses whole-root vertical squash.
- Final material, helmet, armor, and silhouette acceptance.
- 2/4/8 performance or external online transport behavior after these edits.

## Decision

Do not promote Rev38. Preserve the LOD correction, weapon-contact diagnostics, shared Assault silhouette policy, and throwable animation hook. Build the next review candidate from the stronger earlier armored direction while keeping release eligibility and human acceptance false until a new player-eye packet is reviewed.
