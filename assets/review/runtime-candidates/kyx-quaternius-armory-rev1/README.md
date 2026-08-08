# KYX Quaternius Armory Rev1

Review-only runtime adaptations from Quaternius' CC0 Sci-Fi Gun Pack.

| KYX weapon | Donor | Runtime candidate |
| --- | --- | --- |
| K-9 Arc Sidearm | `Pistol.blend` | `kyx-k9-quaternius-rev1.glb` |
| SG-4 Breach Array | `LongPistol.blend` | `kyx-sg4-quaternius-rev1.glb` |
| Longbow-12 | `Sniper rifle.blend` | `kyx-longbow12-quaternius-rev1.glb` |
| BR-6 Siege Launcher | `Ray Gun.blend` | `kyx-br6-quaternius-rev1.glb` |

The VLR-7 rifle remains in its existing independently verified candidate.
`LightningGun.blend` and `LongPistol_small.blend` remain preserved source only;
they were not forced into a mismatched gameplay role.

`tools/art/build-quaternius-armory-candidates.py` verifies each untouched donor
hash, applies restrained role materials and a two-segment micro-bevel, exports
the editable derivatives and GLBs, and records exact output hashes and topology
in `build-report.json`.

These models are presentation-only. They do not change authority, damage,
cadence, ammo, ADS, projectile, reload, or ability rules. They are loaded only
in development and staging-review builds and remain unaccepted and ineligible
for a release package until current player-eye and owner review.
