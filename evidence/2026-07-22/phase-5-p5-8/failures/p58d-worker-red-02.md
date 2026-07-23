# P5.8D Worker red run 02

- Command: `vitest run --config vitest.worker.config.ts --maxWorkers=1 --no-isolate tests/worker/combatRev3.test.ts`
- Result: **1 passed / 1 failed**
- Revision-2 default and durable revision-3 rehydration passed.
- The real combat room accepted exactly two shots and applied exactly two 10-point hits; final target health was 80.
- Diagnostic snapshot at tick 340 showed the held-fire intent had safely decayed to zero after accepted input stopped. This is expected authority behavior, not a duplicate consequence.
- Reliable unique events were `shotAccepted: 2`, `damageApplied: 2`, `playerJoined: 2`.
- This red run is retained and does not support a P5.8D pass claim.

Correction: the WSS impairment driver must continue delivering held-fire samples at authority cadence, as the Node P5.8B profile already does.
