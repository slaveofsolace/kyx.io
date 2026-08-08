# NotHereButAfk/Ev.io resource audit — 2026-08-08

## Scope

- Live source: `https://github.com/NotHereButAfk/Ev.io`
- Live audited head: `213738b5913dd7d5806fa9c54b10687cf366b670`
  (`Rebuild GUI around EV-style desktop shell`)
- Map/rotation anchor immediately below it:
  `ce6e10c6aba752f6d9c18b1e54d80246cd200d90`
  (`Import Winter map and enable match rotation`)
- Owner-provided offline snapshot: `C:\Users\suhai\Downloads\Ev.io-main.zip`
- Archive SHA-256:
  `2ad470b7d2337e1d0a5aebff69684544448c02d93d2b6dcfc52fb1c4385099c2`
- Exact snapshot reconciliation: all 168 archive files match all 168 Git blobs
  at audited head `213738b`; there are no archive-only files, remote-only files,
  or content mismatches.
- Method: rights-aware structure and behavior audit followed by independent
  clean-room implementation. No upstream source, Blender output, textures,
  audio, or `.evmap` payload was copied into KYX.

The original 9,931,303-byte ZIP remains unchanged and unextracted. The
Resource Pilfer non-extracting inventory records 193 total entries and
23,673,895 uncompressed bytes. It found no traversal/absolute paths, encrypted
entries, symlinks, duplicate or case-colliding names, nested archives, or
compression-ratio bomb indicator. It did identify executable/active source and
tooling, seven GLBs, and two `.evmap` binaries; none was executed or imported.
See
`assets/review/external-resource-ledger/notherebutafk-evio-2026-08-08.inventory.json`
and the adjacent fail-closed candidate registry.

The repository exposes an `ISC` package metadata field but does not ship a
root `LICENSE`, `LICENSE.md`, or `COPYING` file at the audited head. That is not
enough provenance for KYX's fail-closed release ledger. Upstream source and
assets therefore remain reference-only unless the owner supplies explicit
license/redistribution evidence.

## Accepted ideas and KYX disposition

| Upstream lesson | KYX disposition | Status |
| --- | --- | --- |
| Authored spawns can become buried or stranded when geometry changes. | Probe each authored feet position against the exact world-static authority fixture; reject floating, materially buried, or unsupported spawns. | Implemented as a clean-room authority gate in `src/authority/spawn/fixtureSpawnSupport.ts` and bound into Inkfall spawn validation. |
| A weapon switch must leave exactly one camera-space viewmodel. | Treat the first-person mount as weapon-only, remove and dispose every stale child, validate the next root before mutation, and expose overlap diagnostics. | Implemented in `src/weapons/KyxFirstPersonWeaponMount.ts` and integrated into the online Three runtime. |
| Map teardown gates must count every renderable resource, not meshes alone. | Centralize deduplicated Mesh, Line, Points, and Sprite geometry/material disposal and use it for online presentation teardown. | Implemented in `src/render/disposeThreeObjectResources.ts` and integrated into the online Three runtime. |
| Map replacement needs explicit asynchronous handoff and state teardown. | Keep Worker map identity authoritative; teardown map-scoped projectiles, smoke, portal effects, presentation roots, input history, and reconnect state as one transition contract. | Accepted design requirement; implementation audit pending after the current dirty integration batch is stabilized. |
| Client and server must agree on map identity during join and rotation. | Keep exact map/profile/hash identity in welcome, snapshot, reconnect, and presentation selection. Mismatch remains fail-closed. | Already stronger in the KYX authority profile system; regression proof remains required. |
| First-person framing needs action-state and viewport/FOV coverage. | Gate all weapon families at 4:3, 16:9, ultrawide, and narrow desktop widths; cover idle, ADS, fire recoil, reload, melee transition, jump, and landing. | Accepted evidence requirement; runtime matrix pending. |
| Locomotion quality cannot be inferred from file/rig validation. | Require direction-aware gait, acceleration/turn transitions, jump/land contact, weapon-hand alignment, and 5 m / 20 m / 40 m player-eye review. | Accepted evidence requirement for the Assault vertical slice. |
| A provenance-safe fallback still needs a complete runtime animation contract. | Drive the named procedural limb pivots from measured authority velocity, including backpedal direction, bounded strafe bias, turn-in-place, jump/land, action hooks, death, and hand-mounted weapons. | Implemented for online fallback avatars; human/player-eye acceptance remains pending. |
| A desktop game shell benefits from one obvious panel at a time and recoverable settings. | Preserve a restrained persistent navigation model, deterministic panel focus/close behavior, and settings export/import/defaults backed by the real KYX schema. | Interaction requirement accepted; upstream markup and styling are not copied. |
| Ambient effects must not impersonate gameplay alarms. | Verify the old timed sawtooth siren cannot be scheduled and keep ambience non-tonal unless an authority event explicitly owns an alarm. | Current `src/core/AudioManager.js` already removes the old siren generator; a staging recurrence indicates stale deployment or a second audio path, not this source. |

## Rejected or quarantined material

- Imported `.evmap` files and the newly added Winter/Rook map binaries: rights
  and redistribution are unresolved. They may be inspected locally but cannot
  enter the shipped tree or KYX release ledger.
- The block-built Blender hero and helmet family: useful as a rig/build-pipeline
  study, but visually incompatible with the owner's accepted V6-A anatomical
  foundation and repeated rejection of cuboid/AI-assembled armor.
- Upstream JavaScript, Python, Blender project output, shaders, textures, and
  sound: reference-only until a repository license and per-asset provenance are
  established.
- The latest EV-style GUI skin: it appends another large override block, uses
  symbol/emoji stand-ins, and exposes additional game-mode affordances without
  evidence that each route is playable. KYX keeps the Cutline visual language,
  typed HUD state, real ability glyphs, and no false menu promises.

## Verification boundary

The exact Inkfall Rev4 fixture structurally supports all 12 current authored
spawns with a zero-millimeter support gap under the new probe. This was checked
against the committed map package and 339-collider authority fixture without
using render geometry as gameplay authority.

The ordinary local command bridge remained unavailable during this audit. A
shell-independent Node execution route established the physical canonical
checkout (`D:\AI Projects\Projects\Games\evio\evio-repo`), branch `main`, HEAD
`e380b716154528700b6b83ae58ebc5718920dbd9`, dirty ownership, archive inventory,
and exact Git-tree reconciliation without extracting or executing upstream
content.

Typecheck, Vitest, build, browser/runtime evidence, commit, push, and deployment
are still explicitly **not claimed** at this checkpoint. Run one consolidated
verification cycle after the coherent source batch is complete. Automated
success will not approve the Assault visuals, animation feel, map playability,
HUD appearance, or audio quality; those remain player-eye/human decisions.
