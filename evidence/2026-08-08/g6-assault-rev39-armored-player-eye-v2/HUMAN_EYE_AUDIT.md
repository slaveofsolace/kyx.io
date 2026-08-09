# Rev39 armored restoration player-eye audit

Verdict: **KEEP FOR STAGING / ITERATE. Not human-accepted.**

## Observed

- The preserved integrated helmet, broad visor, gloves, torso plating, thigh/shin armor, and proportional boots are visible in the actual loadout and arena runtime.
- The brighter separated material treatment survives the Relay arena lighting better than the first Rev39 capture and substantially better than Rev38.
- The embedded diagnostic rifle is absent. The selected Quaternius weapon is the only visible equipped weapon.
- The remote weapon remains planted in the firing and support hands.
- The silhouette still has a pinched waist and insufficient shoulder/chest mass for a final Assault read.
- The finish remains too uniformly glossy and mannequin-like at close loadout distance.
- The captured walk frame still includes a cross-step/float impression; foot plant and crouch remain unresolved.
- The loadout preview column is too small for final character construction review even at a front-three-quarter angle.

## Measured

- 7 remote avatars
- 7 Rev39 candidate bindings
- 7 shared animation contracts
- 7 active authored clips
- 7 equipped weapon attachments
- 7 support-hand contacts
- 0 procedural remote fallbacks
- 0 console, page, or request failures
- first-person overlap check: clear
- packaged character source: 15,025,320 bytes, one preserved source LOD

The exact machine-readable values are in `runtime.json`.

## Inferred

- Rev39 is the stronger tester-facing staging baseline because it restores authored armor construction without regressing weapon contact or animation wiring.
- The next visible improvement should be motion contact and crouch, followed by torso/shoulder proportion and material breakup on a newly exported derivative.
- A final release candidate still requires real authored LOD1/LOD2 rather than reuse of the preserved source LOD0.

## Unknown

- Direct human feel for locomotion cadence, reload, throw, hit, death, and weapon switching.
- Foot sliding under repeated direction changes.
- Online 2/4/8 performance with the 15 MB review source.
- Owner approval of the restored helmet/body direction.

## Acceptance boundary

This packet does not approve Rev39, does not reverse the rejection of Rev30, and does not make the source release-eligible. It only establishes Rev39 as the preferred staging-review iteration over Rev38.
