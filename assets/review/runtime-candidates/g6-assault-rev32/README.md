# G6 Assault Rev32 review candidate

This directory contains an isolated, weapon-free Assault character review batch.
It is outside `public`, is not copied into release builds, and is not G6 or
release accepted.

## Exact current artifacts

| LOD | SHA-256 | Bytes | Triangles |
|---|---|---:|---:|
| LOD0 | `775a423da21ad9cafefc1b2f7882805ddcbc2531b50336857b38d350b5b4cb62` | 25,434,708 | 61,780 |
| LOD1 | `aa1bf26a9bd9c3c5524f81a6848978cccbcc27eaefad2285cdcbd0d059788479` | 23,598,468 | 32,394 |
| LOD2 | `b4c8da22afdd8c6b0fbb121a7474c36ec4c159cd5e05a405a84eeb76b04e09a4` | 22,988,040 | 15,183 |

Each GLB carries one 66-bone rig and all 16 inherited Rev17 clips. The base
character deliberately embeds no weapon; equipped weapon ownership remains a
runtime socket-adapter responsibility.

The authoritative visual packet for this batch is
`evidence/2026-08-01/g6-assault-rev32/direct-glb-review-v10`.

All three GLBs pass Khronos glTF Validator `2.0.0-dev.3.10` with zero errors
and zero warnings. The LOD0 audit sampled all 459 integer frames across all 16
clips with zero gross-deformation, topology, attachment, or contact-semantic
failures. That audit records intentional body/armor BVH intersections and does
not claim that every frame is visually clipping-free.

The inherited third-person death clip originally ended about 0.77 m above the
floor. The export pipeline now grounds the exact NLA action slot at every frame;
the final exported frame ends at `-0.0039164 m`, matching the rest-pose contact
plane within the bounded tolerance.

## Open before promotion

- explicit owner visual decision;
- first-person arms and weapon-contact proof;
- browser runtime selection and distance-readability proof;
- human review of the all-frame audit's diverse worst-metric renders;
- texture downscaling/compression and package-budget closure.
