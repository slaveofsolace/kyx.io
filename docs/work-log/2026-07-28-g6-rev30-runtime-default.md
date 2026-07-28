# G6 Rev30 runtime-default integration

Base: canonical `9879421a8eb4b8b7ea437e1d6613cb019494ce2c`.

## Runtime selection

- Rev30 is the default third-person character when `g6Candidate` is absent.
- `?g6Candidate=rev30` selects that same default explicitly.
- `?g6Candidate=rev17` preserves the exact Rev17 third-person fallback.
- Unsupported revision values fail back to Rev30 and remain visible through the
  config's `requestedRevision` and `selection` fields.
- Player and enemy loader slots both resolve to the one physical
  `/candidates/g6-rev30-cc0-donor/character-lod0.glb` file. No Rev30 LOD1/LOD2
  binary is duplicated or claimed.
- First person remains
  `/candidates/g6-rev17/first-person.glb`; Rev30 did not author a viewmodel.

## Provenance and acceptance boundary

The Rev30 third-person visual is project-owner accepted and its Irondust
**Sci-fi Soldier** donor geometry is CC0-1.0 with exact archive, object, texture,
source and runtime hashes recorded in the donor notice and manifests.

The embedded pale rifle is only a contact diagnostic. It is not final weapon
presentation, and the separate runtime attachment lane must hide or replace it
with the equipped project-authored weapon.

This integration does not claim a dedicated Rev30 first-person asset, distinct
Rev30 LOD1/LOD2, external glTF validation, full animation/contact regression,
performance qualification, G6 gate closure, release eligibility or deployment.
Rev17 assets remain tracked as fallback/evidence; no history was deleted.
