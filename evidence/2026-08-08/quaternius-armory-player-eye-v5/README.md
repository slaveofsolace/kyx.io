# Quaternius armory player-eye packet v5

This packet proves that the staging-review build loads one verified weapon
model for each product gun slot in the real local Practice runtime. It is a
work-in-progress integration checkpoint, not human visual acceptance.

## Slot mapping

| Slot | Runtime weapon | Imported source | Visible contact |
| --- | --- | --- | --- |
| 1 | VLR-7 rifle | Existing Quaternius rifle candidate | Two-hand assault contact |
| 2 | K-9 sidearm | `Pistol.blend` | One-hand contact |
| 3 | SG-4 shotgun | `LongPistol.blend` | Single clean WIP contact |
| 4 | Longbow-12 sniper | `Sniper rifle.blend` | Single clean WIP contact |
| 5 | BR-6 launcher | `Ray Gun.blend` | Single clean WIP contact |

The source pack is Quaternius' Sci-Fi Gun Pack under CC0-1.0. Exact donor
hashes, derivative hashes, mesh counts, triangle counts, and Blender/GLB
outputs are recorded in the armory build report.

## Current proof

- App TypeScript: PASS.
- Targeted armory Vitest: 1 file / 8 tests PASS.
- Staging-review build: PASS (229 modules).
- Staging package closure: `STAGING_REVIEW_PACKAGE_VERIFIED`.
- Runtime: five slots captured at 1440 x 900 using system Chrome.
- Each slot reports exactly one first-person weapon root.
- Each slot reports `selectedFirstPersonOverlapFree: true`.
- Browser console/page errors: 0.
- Runtime report SHA-256: `20b1fd25f51e4415611e0969b879c7445bcbdbfbc6ed3cbdaed6b46228a6d7eb`.

## Human Eye verdict

`REVISE`, suitable for WIP tester exposure. The imported models are genuinely
present, readable, and overlap-free. The rifle and sidearm are the strongest
first-person views. Shotgun, sniper, and launcher deliberately use one clean
contact instead of the rejected floating two-forearm adaptation. Final
two-hand grip markers, authored equip/reload/contact animation, and owner
visual approval remain open.

## Nonclaims

- No human visual acceptance.
- No final animation/contact acceptance.
- No change to authority, damage, cadence, ammo, muzzle, or hit logic.
- No production-release eligibility claim for this review-only batch.
