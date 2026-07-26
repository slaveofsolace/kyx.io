# Inkfall west-archive collision rounding repair

Status: **BOUNDED REGRESSION PASS; G5 REMAINS OPEN**

Commit: `8dc762d`

The exact reachable runtime-v45 pose at the west-archive rotated face exposed a
millimeter-quantization seam after Rapier's kinematic-controller result was
converted back to integer authority units. The movement adapter now permits
only a shallow post-movement correction when every correction contact was
already reported by the controller and the total correction stays within the
configured contact skin. Novel or deeper overlaps continue to fail closed.

Validation:

- exact west-archive regression: 5/5 tests passed;
- adjacent physics, movement, Inkfall runtime-map, and native revision-2
  authority matrix: 109/109 tests passed;
- main, simulation-source, and simulation typechecks: passed;
- final exact-pose feet position: `{-23958, 37, 402}`;
- final blocking overlap set: empty;
- the older P5.15 guard-rail embed still fails closed.

This closes the deterministic rounding defect only. It does not establish the
full G5 traversal matrix, 2/4/8-player playtest, counterplay, fun/readability,
finished-map integration, or human acceptance.

*Currently being worked on.*
