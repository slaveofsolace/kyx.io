# Press Hall v3.2 non-default runtime integration and profile

Status: **BOUNDED RUNTIME INTEGRATION PASS / CURRENT GLB NOT READY FOR G5 OR G8**

This lane adds an explicit product-visible inspection action and route for the exact spatial/material-joined Press Hall v3.2 GLB. It does not change Offline Practice, the catalog default, the locked P6.7 map/collision package, or authority behavior.

Canonical evidence is `runtime-v3/`. Earlier `runtime-v1/`, `runtime-v2/`, and `independent-verification.json` are retained diagnostic attempts; they are not the canonical claim surface. `independent-verification-v3.json` passed 42/42 checks against the hash-frozen v3 capture.

## Product route

- Menu action: `INSPECT PRESS HALL V3.2 RUNTIME ART`
- Explicit route: `/?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.2%2Fspatial-material-joined`
- Invalid, alternate, empty, or duplicate `mapArt` selections fail closed and do not fall through to Offline Practice.
- The route fetches and verifies the exact 13,300,676-byte GLB at SHA-256 `56cbd313e3fd2166c70ce6cca614e02f08fd027acf2b0a43749cf076c46f8119`, then parses it with the app's installed `THREE.GLTFLoader`.
- Revision-2 presentation and collision artifacts are loaded separately through the existing runtime map-package verifier. The visual overlay is built from fixture `bf85e42731fd088e`; art geometry is never used for authority.

## Measured runtime facts

Capture host: `sol`, Windows `10.0.26200`, Intel Core i9-14900K, 32 logical CPUs, 64 GB installed memory. Browser: headless Chromium `149.0.7827.55`, 1600x900, ANGLE SwiftShader Vulkan software renderer.

| Metric | Result |
| --- | ---: |
| Exact joined GLB | 13,300,676 bytes |
| Structural nodes / meshes / primitives | 29 / 29 / 29 |
| Structural triangles | 188,576 |
| Gameplay view, art only | 27 calls / 188,387 triangles |
| Gameplay view with authority overlay | 30 calls / 188,627 triangles / 12,276 lines |
| Warmup / measured frames | 60 / 180 |
| Frame p50 / p95 / p99 | 200.0 / 233.4 / 416.6 ms |
| Browser hash / parse | 8.0 / 14.2 ms |
| Revision-2 authority validation | 15.6 ms |
| Route-ready time including warmup/profile | 43,366.6 ms |
| Route heap before / after profile | 60.3 / 60.3 MB |
| CDP heap at capture | 9.02 MB used / 11.11 MB total |
| Failed requests / HTTP errors / page errors / console errors | 0 / 0 / 0 / 0 |

The 27-call gameplay result is the real frustum-culled renderer workload from that camera. The offline 29-primitive number remains the exact structural upper bound; it is not relabeled as an actual gameplay call count.

## Runtime blocker found

The exact GLB does **not** reproduce the material colors shown in the Blender review boards. Its nine named glTF materials contain:

- `0 / 9` explicit `baseColorFactor` values;
- `0` base-color texture references;
- `0` images and `0` textures.

The actual Three.js route consequently renders the presentation largely white/default-colored. Runtime recoloring was deliberately not added because it would hide an export defect and would no longer prove the supplied artifact. The joined export must be regenerated with its intended PBR base colors encoded, hash-frozen again, and recaptured before final-art acceptance.

The SwiftShader p50/p95/p99 values are also far outside a shippable frame budget, but software rendering is not representative named-GPU evidence. G8 still needs a physical-GPU run and the required 30-minute integrated soak after the corrected export is available.

## Visual and collision boundary

The four-segment gameplay/north/overhead/south camera sweep completed in 3,294.8 ms. It is a camera-only visibility sweep. It does not move an authoritative capsule and does not prove collision/no-snag behavior. A playable revision-2 route with authoritative movement, collision contacts, and recorded snag telemetry is still required for G5.

## Canonical artifacts

- `runtime-v3/capture.json` — browser/host identity, exact asset/hash, renderer, frame, heap, network, camera, and gate-boundary snapshot.
- `runtime-v3/gameplay-art-only.png` — actual joined GLB in the gameplay view.
- `runtime-v3/gameplay-authority-overlay.png` — gameplay view with the separate revision-2 authority fixture.
- `runtime-v3/overhead-authority-overlay.png` — overhead spatial/alignment inspection.
- `independent-verification-v3.json` — 42/42 checks passed.
- `test-results.json` — focused typecheck, lint, unit, browser, build, capture, and verifier results.

## Remaining before G5/G8

1. Regenerate the joined GLB with explicit intended base colors or textures, verify runtime parity with the Blender review, and reprofile the new hash.
2. Reduce the 13.30 MB presentation payload or justify it in the final integrated first-play budget.
3. Integrate the corrected art into a playable, still non-default revision-2 match surface and run authoritative capsule/no-snag traversal.
4. Obtain representative human gameplay and visual acceptance, including color-vision review.
5. Run physical named-GPU frame/heap metrics and the qualifying 30-minute final-map soak.

Non-claims: `G5_NOT_PASSED`, `G8_NOT_PASSED`, `FINAL_ART_NOT_ACCEPTED`, `HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED`, `HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED`, `NO_COLLISION_NO_SNAG_CLAIM_FROM_CAMERA_SWEEP`, `NOT_SHIPPING_DEFAULT`, `NO_DEPLOYMENT_OR_PUBLISHING`.
