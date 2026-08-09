# KYX armory POV/world source-only handoff

Date: 2026-08-09
Branch: `codex/armory-pov-polish-20260809`
Baseline: `520d94c5c9bd54b5b138ca25a116a1781f3e3356`

## Candidate boundary

This commit is a source-only integration candidate. It does not approve player-eye quality, remote/world quality, an Assault body, Rev45, release eligibility, packaging, or deployment. The shared-runtime hold prohibited browser, dev-server, build, capture, Blender, Unreal, and protected-runtime work during finalization.

Combat authority, damage, ammo, cadence, spread, projectile behavior, and loadout balance are unchanged. Presentation reads authority events and weapon phases; it does not produce combat results.

## Selected assets and exact identity

The selected external armory contains five Quaternius-derived review GLBs. Edge-1 remains project-authored procedural and is not represented as an external asset.

| Role | Weapon | Runtime file | Bytes | SHA256 | Authored muzzle node |
|---|---|---|---:|---|---|
| Assault rifle | VLR-7 | `assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/kyx-vlr7-quaternius-rev1.glb` | 132052 | `46de2380ac08810524d7bb4bb67d8621bb436a4f559b4d672d5c2026a075dd79` | `KYX_VLR7_REVIEW_MUZZLE_REFERENCE` |
| Compact/sidearm | K-9 | `assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-k9-quaternius-rev1.glb` | 233708 | `4b72710b6071bd120195ddd80673ec47cc5a3f394430bb6d614df04dcf42b339` | `KYX_K9_QUATERNIUS_REV1_MUZZLE_REFERENCE` |
| Breacher/shotgun | SG-4 | `assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-sg4-quaternius-rev1.glb` | 510624 | `d04629199f582dfcb2dce89bf534f295ee8689fa6cead04854c8a2e2a0bafd4b` | `KYX_SG4_QUATERNIUS_REV1_MUZZLE_REFERENCE` |
| Recon/sniper | Longbow-12 | `assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-longbow12-quaternius-rev1.glb` | 285500 | `af4a907b60c1b482cf9e7d7339c884905dd5ae4d792a1ecc94bbd1a2da227b55` | `KYX_LONGBOW12_QUATERNIUS_REV1_MUZZLE_REFERENCE` |
| Siege/launcher | BR-6 | `assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-br6-quaternius-rev1.glb` | 482632 | `6eb88285056f83b064cbbf82c7b123a8453d1deec61c4a4c2e47b081409b735b` | `KYX_BR6_QUATERNIUS_REV1_MUZZLE_REFERENCE` |

The typed identity registry is `src/weapons/KyxArmorySelectedAssets.ts`. Loaders verify byte length, SHA256, root, authored muzzle node, mesh count, and triangle count before installing any review factory. The four-family loader installs only after the whole batch verifies.

Provenance references:

- `assets/source/blender/vendor/quaternius-sci-fi-gun-pack/SOURCE_LICENSE.txt` — Quaternius source credit and CC0 1.0 terms.
- `assets/source/blender/vendor/quaternius-sci-fi-gun-pack/SOURCE_INVENTORY.json` — exact donor identities and hashes.
- `assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/build-report.json` — VLR conversion identity and structure.
- `assets/review/runtime-candidates/kyx-quaternius-armory-rev1/build-report.json` — K-9, SG-4, Longbow-12, and BR-6 conversion identities and structures.
- `assets/provenance/shipped-assets.g9.json` — release ledger remains closed; these review candidates are not declared shipped assets.

Precise blocker: the assets are CC0 and locally hash-verified, but the project ledger still marks the selected binaries outside the shipped set and runtime selection remains review/dev-only. This candidate does not bypass that release gate.

## Integration behavior

- Offline roles bind `m4`, `sidearm`, `energyshotgun`, `boltsniper`, and `rpg` to the same authority presentation IDs used online. `sword` binds to procedural Edge-1.
- Offline camera models explicitly request `first_person`; bots, previews, and remote/world callers retain the `world` default.
- Unknown authority IDs, malformed first-person roots, malformed world roots, missing authored muzzle nodes, and failed world attachment seams fail closed.
- First-person replacement removes every stale mount child before adding one validated selected root.
- World replacement purges stale authored world roots below the avatar and verifies one root matching the selection after the character attachment callback.
- Shared first-person weapon/contact presentation suppresses the separate Rev17/legacy arm path, including rifle-to-Edge switching. No player-model or animation source is edited.
- Each family has explicit first-person framing, world scale, ADS datum/type, recoil recovery, equip/sprint/reload transforms, moving-part hooks, material treatment, and dominant/support contact data.
- Firearm muzzle FX resolve from the selected GLB's authored muzzle reference. BR-6 backblast resolves from a calibrated visible-rear marker and uses a directional plume.
- Body hit, headshot, kill, and headshot-kill are classified as presentation-only hooks/counters without HUD layout changes.

## Character seam and remaining animation work

`KYX_FIRST_PERSON_CONTACT_SEAM` exports exact dominant/support grips with `characterBinding: unbound_pending_accepted_assault_body`. This prepares a future accepted Assault body without importing, binding, or approving Rev45.

VLR-7 has a separable donor magazine. K-9, SG-4, Longbow-12, and BR-6 donor GLBs are fused meshes with no authored animation clips, so compact code-authored slide/cell, pump/gate, bolt/magazine, and chamber/sight overlays provide presentation motion. These overlays need later player-eye review and must not be represented as donor-authored animations.

## Required later runtime capture matrix

Run only after the shared-runtime hold is explicitly lifted.

| View | Required states |
|---|---|
| 2560x1440 player eye, all six | Hip/equipped; ADS for each firearm; fire/recoil/recovery; reload midpoint; sprint enter/exit; switch/equip |
| Edge-1 switch regression | Rifle-to-Edge and firearm-to-Edge frames proving no retained donor, legacy arm, or second weapon root |
| Visible-nozzle proof, five firearms | Muzzle flash/tracer origin over the authored visible nozzle; BR-6 directional backblast behind the visible rear |
| 2560x1440 remote/world, all six | Local plus remote selected identity, one authored world root, proportions/contact framing, no duplicate embedded/legacy gun |
| Confirmed-damage hooks | Body hit, headshot, kill, and headshot-kill presentation with counters and no HUD layout modification |
| Representative motion | VLR-7, K-9, SG-4, Longbow-12, BR-6, Edge-1 under standing, movement, sprint, reload/equip, and relevant attack phases |

Automated cardinality, hashes, and unit checks are structural evidence only. Human visual review remains `UNKNOWN` until this matrix is captured and inspected.

## Source checks

- `tsc -p tsconfig.json --noEmit`: PASS.
- Focused ESLint over the changed TypeScript, tests, and `WeaponSystem.js`: PASS.
- `WeaponModels.js` with only `@typescript-eslint/no-unused-vars` suppressed: PASS. The unsuppressed file reports seven legacy unused-builder errors; the same seven errors reproduce against `HEAD:src/weapons/WeaponModels.js`, so this candidate does not expand into unrelated dead-builder cleanup.
- Focused Vitest: PASS, 8 files and 34 tests. Coverage includes exact file byte/hash/root/muzzle identity, runtime-role bindings, review-asset fail-closed behavior, all-six typed presentation/contact seams, authored muzzle selection, first-person/world cardinality, rifle-to-Edge overlay removal, transition hooks, viewmodel visibility, action timing, routing, and hit/headshot/kill classification.
- Build, staging-package verification, browser tests, dev server, protected runtime, and captures: NOT RUN under the authoritative hold.
