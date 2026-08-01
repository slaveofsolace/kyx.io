# G6 Assault Rev32 review candidate

This directory contains an isolated, weapon-free Assault character review batch.
It is outside `public`, is not copied into release builds, and is not G6 or
release accepted.

## Exact current artifacts

| LOD | SHA-256 | Bytes | Triangles |
|---|---|---:|---:|
| LOD0 | `939737b7f145c80a07c528621efc16b55dfe790c02e3eba9af407e9bcef8e2e9` | 24,804,780 | 61,780 |
| LOD1 | `ba08d337ce56737b8dc4968455408392fefc0425a2ef846779c1f49501dcd196` | 23,598,128 | 32,394 |
| LOD2 | `a504674cd82c69a4c471b498ec633c67e139de444a86d99d9524719e5ba6a97d` | 22,988,468 | 15,183 |

Each GLB carries one 66-bone rig and all 16 inherited Rev17 clips. The base
character deliberately embeds no weapon; equipped weapon ownership remains a
runtime socket-adapter responsibility.

The authoritative visual packet for this batch is
`evidence/2026-08-01/g6-assault-rev32/direct-glb-review-v10`.

## Open before promotion

- explicit owner visual decision;
- external glTF validator report;
- first-person arms and weapon-contact proof;
- browser runtime selection and distance-readability proof;
- every-frame clipping sweep;
- texture downscaling/compression and package-budget closure.
