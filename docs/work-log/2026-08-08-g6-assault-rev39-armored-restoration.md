# G6 Assault Rev39 armored restoration — 2026-08-08

Parent checkpoint: `e735ed52cb34d9f6de6cfa3f92e857b9d31985c3`.

## Implemented

- Added an isolated `rev39-armored-restore-v1` staging/development candidate based on the preserved CC0 Rev30 armored source.
- Kept the Rev30 artifact truthfully rejected and review-only; Rev39 is a runtime restoration candidate, not a renamed approval.
- Reused the one preserved source LOD at both review distances and declared `distinctAuthoredLods: false`.
- Hid the embedded diagnostic rifle in all presentation states.
- Preserved the selected Quaternius weapon attachment, muzzle alignment, and support-hand contact.
- Reworked dark-source tinting so armor, suit, and visor remain readable in the Relay arena without turning team identity into a different role silhouette.
- Changed the staging-review package from three Rev38 GLBs totaling about 43.5 MB to one 15.0 MB armored source GLB.
- Updated the player-eye harness to capture a useful front-three-quarter loadout angle and fail closed on candidate, clip, weapon, contact, and runtime-error checks.

## Verification

- app TypeScript — pass
- targeted ESLint — pass
- focused Vitest — 4 files, 13 tests — pass
- staging-review Vite build — 229 modules — pass
- staging package closure — `STAGING_REVIEW_PACKAGE_VERIFIED`
- bounded Chrome runtime — pass, pointer lock acquired, zero runtime errors
- remote candidate/clip/weapon/support contact — 7/7 each

Final player-eye packet: `evidence/2026-08-08/g6-assault-rev39-armored-player-eye-v2`.

## Human status

Preferred over Rev38 for staging, but not accepted. Remaining visual blockers are pinched waist, weak shoulder/chest mass, glossy material uniformity, cross-step/float motion, whole-root crouch squash, and lack of real lower LODs.

## Next action

Replace the whole-root crouch scale with an authored stance presentation and reduce cross-step/foot-slide artifacts without changing Worker authority. Then create a new exported armored derivative with stronger Assault torso/shoulder proportion and real LOD1/LOD2 before any release claim.
