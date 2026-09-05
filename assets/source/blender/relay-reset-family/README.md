# Relay field-crew family — isolated review

Decision: **ADAPT**. These files are local review candidates. Human art/motion
acceptance and release-ledger admission remain pending.

Job: one clearly equipped field crew actor and matching first-person arms/rifle
for Relay. Preserve the existing 66-joint locomotion rig and VLR7 mount/contact
coordinates. Work in meters; Blender Z-up exports to glTF Y-up. No authority
collision, hitbox, damage or equipment identifiers change.

## Three equal-detail treatments

| Treatment | Organizing idea | Visible construction | Risk to inspect |
| --- | --- | --- | --- |
| Communications deck | Exposed equipment carried on a field harness | Two separate chest straps, open collar, split rifle bridge with dark service gaps | Thin harness may disappear at 30 m |
| Ceramic utility campus | Sealed shells protect flexible working equipment | Broad quiet shoulder/chest caps, short visor brow, continuous rifle service shroud with one ochre release | Pale actor and architecture may merge |
| Transmitter workshop | Compact repair gear with accessible interfaces | Folded chest yoke, compact side service unit, clipped receiver cover and protected access latch | Equipment could make the torso look square |

Each uses the same underlying actor, rifle contacts, animation subset and lighting.
Compare in the shared west-A gameplay camera before selecting a winner. Campus is
a provisional experiment, not an accepted direction. Actor identification keeps
dark joints and face separation; cyan/red remain runtime team roles.

## Preserved inputs and fresh checks

- Actor/locomotion: preserved `g6-assault-rev40-cc0-weapon-ready-v4` GLBs. LODs
  contain 3,392 / 1,914 / 1,057 triangles, 66 joints and 12 clips. Exact current
  hashes match their existing manifest; see `source-inspection.json`.
- Mesh lineage: [Sci-fi Soldier by Irondust](https://opengameart.org/content/sci-fi-soldier),
  CC0-1.0. Canonical listing rechecked 2026-09-05. Existing donor notice identifies
  Body, HandSimple and Head2; source albedo/branding are omitted. Historical archive
  is preserved outside Git and was not reacquired in this lane.
- Motion lineage: Quaternius Universal Animation Library 1/2 Standard, CC0-1.0.
  [UAL1](https://quaternius.com/packs/universalanimationlibrary.html) and
  [UAL2](https://quaternius.com/packs/universalanimationlibrary2.html) listings and
  [FAQ](https://quaternius.com/faq.html) rechecked 2026-09-05. This lane reuses the
  already-retargeted clip subset, not the libraries or paid source editions.
- Rifle lineage: preserved VLR7 adaptation of Quaternius Rifle.blend from the
  [Sci-Fi Gun Pack](https://quaternius.com/packs/scifigun.html), CC0-1.0. Exact GLB
  hash `46de2380ac08810524d7bb4bb67d8621bb436a4f559b4d672d5c2026a075dd79`.
  Existing vendor license and source inventory are retained unchanged.
- [CC0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)
  rechecked 2026-09-05. No account, checkout, price or entitlement action is needed
  for these preserved CC0 derivatives. Keep creator credits and adaptation lineage.
- No new outside payload acquisition, cloud conversion or generative upload.
  GLB container checks found no external buffer/image URIs. Blender 5.1.2
  `ec6e62d40fa9` imported with factory startup and auto-execution disabled;
  fresh actor inspection found no linked library or drivers.

## Current evidence

`preserved-actor-baseline.png` is a fresh Blender source inspection, not the
gameplay camera. OBSERVED: narrow stretched hand polygons and bright contiguous
metal surfaces. INFERRED: finger weighting and excessive metallic response are
contributing causes. Test repair in the same pose, then in the actual running scene.

The old Rev17 FP asset is preserved but has a different skeleton and 27,026
triangles. It is not the matching-family input. Derive arms from this actor family.

Runtime proof, moving grip/reload contact, frame cost and human verdict remain
UNKNOWN until measured. Failed or missing assets must retain the game fallback.
