# P5.8D Worker red run 04

- Command: `vitest run --config vitest.worker.config.ts --maxWorkers=1 --no-isolate tests/worker/combatRev3.test.ts`
- Result: **1 passed / 1 failed**
- Release input was processed at tick 62, sequence 26, and the rifle returned to ready with the exact 10-shot/40-round consequence.
- The separately submitted reload/grenade command did not advance beyond tick 62, indicating an authority tick exception in the explicit Worker combat fixture rather than queue ordering.
- This red run is retained and does not support a composite reconnect pass claim.

Correction: expose the bounded exception message only on the explicit evidence profile, then repair the specific combat fixture seam.
