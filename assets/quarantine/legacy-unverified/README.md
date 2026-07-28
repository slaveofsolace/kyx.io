# Unverified legacy asset quarantine

This directory preserves six historical runtime snapshots whose creator, source,
acquisition record, license, and rights evidence were absent from the handoff.
They are **not shipped**, are **not runtime-addressable**, and are
**not release-eligible**. Do not move them into `public/`, import them from game
code, or describe them as project-owned without new documentary evidence.

`manifests/*.asset.json` uses quarantine manifest schema version 2. The
`quarantine.path`, byte count, and SHA-256 bind each record to the preserved
bytes; `distributionStatus: quarantined_not_shipped` is mandatory. The records
retain the original structural measurements solely for audit continuity.

| Asset | Quarantine snapshot | Bytes | SHA-256 | Runtime replacement |
| --- | --- | ---: | --- | --- |
| `legacy.player` | `runtime-snapshots/player.glb` | 1,363,668 | `cdb9a8d694a132099e2b505f07957bb39683def8ec9356be304d79b6f6f92564` | project-authored Rev17 character, then accepted successor |
| `legacy.soldier` | `runtime-snapshots/soldier.glb` | 2,159,764 | `5f75df0a1035956c5da3781dcdaa6e5bf06d27e913d3c428eef0da5d10ba7bde` | project-authored Rev17 character, then accepted successor |
| `legacy.spartan` | `runtime-snapshots/spartan.glb` | 256,508 | `377d6461d47c4324880832d9bff81d5a4bc8470ad3f2a4412a21c1e892dce43c` | project-authored character or procedural preview |
| `legacy.weapons` | `runtime-snapshots/weapons.glb` | 2,019,140 | `3c0ded95defbb4ddc52e8b9a2bc22de233cdfdccbeb4e6cbcc548252f5d08ce8` | project-authored procedural weapon builders |
| `legacy.zombie` | `runtime-snapshots/zombie.glb` | 234,604 | `f67258d00882c787653f3996b7478e14b2a04211b83be2487a9f87346767d6ef` | project-authored procedural enemy rig |
| `legacy.sakura-wrap` | `runtime-snapshots/textures/sakura/wrap.png` | 127,881 | `376c4a7688e0d76afc1308d91bf7deca0ccef48bcc2bc51cdc4438066dc7137c` | project-authored procedural canvas texture |

Quarantine is preservation, not clearance. Owner attestation or a verifiable
license could support a future review, but no such decision is made here.
