# P6.6A attempt-5 authority-collision overlay

Read-only Blender 5.1 debug renders comparing preserved revision 1 with the
attempt-5 measured 5.2 m terminal-footprint collision candidate.

## Legend

- Slate: geometry unchanged between the two GLBs.
- Red: revision-1 geometry removed in attempt 5.
- Green: geometry added in attempt 5.
- Orange wire: old geometry for a same-name modified collider.
- Cyan: attempt-5 geometry for a same-name modified collider.

Comparison: 346 revision-1 meshes, 337 attempt-5 meshes,
18 removed, 9 added, 1 modified,
and 327 unchanged. Exact names and SHA-256 values are in
`collision-overlay-report.json`.

These images are P6.6A visual collision evidence only. They do not claim P6.7,
G5, final art, or human acceptance.
