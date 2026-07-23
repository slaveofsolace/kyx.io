# 2026-07-22 — Press Hall v3.2 runtime integration and bounded profile

## Outcome

Added an explicit, non-default product inspection route for the sealed Press Hall v3.2 spatial/material-joined GLB. The route verifies the exact hash and byte count before parsing it with Three.js, presents four interactive camera presets, and can display the separately verified revision-2 authority fixture as instanced wire boxes, authority volumes, and spawn markers.

The bounded integration itself passed. The exact GLB is not a final-art runtime candidate yet: all nine glTF materials omit explicit base-color factors and base-color textures, so the actual application render is largely default white and does not match the Blender review boards. The software-rendered Chromium profile is also non-qualifying for G8.

## Preserved boundaries

- `DEFAULT_MAP_REVISION` remains `1`.
- Inkfall revision-2 package digest remains `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`.
- Locked authority fixture remains `bf85e42731fd088e` with 339 solid colliders and two authority volumes.
- Art is presentation-only and cannot become authority.
- Offline Practice remains Iron Bastion and is not changed by this route.
- No deployment, publishing, shipping-default, G5, G8, human-visual, human-playtest, or no-snag claim was made.

## Implementation

- Added strict query selection in `src/app/pressHallInspectionSelection.ts`.
- Added real Three.js/GLTFLoader runtime, fail-closed hashing, structural validation, revision-2 fixture overlay, camera controls/sweep, renderer/frame/heap diagnostics, and visible non-claims in `src/app/pressHallInspectionRoute.ts`.
- Added a menu inspection action in `index.html` and the smallest dynamic route hook in `src/main.js`.
- Added focused unit and browser coverage.
- Added reproducible browser capture and independent verifier tooling.

## Evidence decision

Canonical decision: **BOUNDED RUNTIME INTEGRATION PASS / GLB MATERIAL PARITY FAIL / G5 AND G8 OPEN**.

Canonical capture: `evidence/2026-07-22/phase-9-g8-press-hall-runtime-v3-2/runtime-v3/capture.json`.

Independent verification: `INDEPENDENT_PRESS_HALL_V3_2_BOUNDED_RUNTIME_VERIFICATION_PASS_G5_G8_OPEN`, 42/42 checks.

## Next action

Return the GLB to the art/export lane to encode the intended nine material base colors (or reviewed PBR textures) in glTF. Keep the 29-primitive spatial/material join, regenerate a new immutable hash, and repeat this exact route capture before attempting playable map integration or G5/G8 acceptance.
