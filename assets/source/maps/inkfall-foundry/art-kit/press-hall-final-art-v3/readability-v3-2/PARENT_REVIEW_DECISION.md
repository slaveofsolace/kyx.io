# Press Hall v3.2 parent review decision

Decision: **V3_2_BOUNDED_READABILITY_AND_BATCHING_PASS / ART_DIRECTION_AND_RUNTIME_CANDIDATE_ONLY**

This decision closes only the bounded Press Hall readability and static-batching lane. It is not final-art acceptance, G5, human visual acceptance, runtime acceptance, shipping approval, or deployment authorization.

## Accepted evidence

- The north force-path readability defect is fixed. Measured median luminance increased from `0.000283` in the frozen final render to `0.479198` in v3.2; the fraction below `0.035` fell from `0.919053` to `0.157674`.
- The neutral-light diagnostic board is bright enough to review the north force path, south roller/tension mechanism, and both gameplay-eye directions.
- The preserved named authoring candidate remains `654` nodes, `654` meshes, `654` primitives, `364,984` summed POSITION vertices, `188,576` triangles, `9` materials, and `11,980,752` bytes.
- The separate spatial-module/material-joined candidate preserves `188,576` triangles and `9` materials while reducing the offline primitive/draw-call proxy from `654` to `29`.
- The v3, v3.1, and conditional final packages remain hash-frozen and unchanged. P6.7 envelopes, authority collision, and catalog revision 1 remain unchanged.

## Remaining blockers

- The authored scene still reads as a clean modular benchmark rather than a shipping-quality environment.
- The joined GLB grows to `13,300,676` bytes; byte payload is not solved by batching.
- Draco and meshopt compression are intentionally withheld because repository/runtime loader support has not been proven.
- Runtime frame time, real draw calls, memory, shader cost, streaming, and no-snag behavior have not been measured.
- Color-vision review and representative human gameplay/playtest review have not been completed.
- Product integration, default selection, shipping status, and deployment remain unauthorized.

## Next authorized lane

Integrate only the `29`-primitive spatial/material-joined candidate behind an explicit non-default preview, then profile runtime frame time, draw calls, memory, shader cost, loading/streaming, collision/no-snag behavior, and representative gameplay readability. Do not promote it to default or claim G5 without those gates and a separate human final-art decision.

## Review artifacts

- `boards/inkfall-press-hall-v3-2-gameplay-readability-board.png`
- `boards/inkfall-press-hall-v3-2-mechanical-readability-board.png`
- `boards/inkfall-press-hall-v3-2-neutral-diagnostic-board.png`
- `validation/press-hall-readability-v3-2-build-report.json`

Non-claims: `G5_NOT_PASSED`, `FINAL_ART_NOT_ACCEPTED`, `HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED`, `HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED`, `PERFORMANCE_NOT_MEASURED`, `NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE`, `COLOR_VISION_REVIEW_NOT_COMPLETE`, `PRODUCT_INTEGRATION_NOT_COMPLETE`, `REVISION_2_NOT_DEFAULT_OR_SHIPPING`, and `DEPLOYMENT_NOT_AUTHORIZED`.
