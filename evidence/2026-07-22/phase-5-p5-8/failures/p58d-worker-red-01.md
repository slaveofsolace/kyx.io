# P5.8D Worker red run 01

- Command: `vitest run --config vitest.worker.config.ts --maxWorkers=1 --no-isolate tests/worker/combatRev3.test.ts`
- Result: **2 failed / 2 total**
- Revision-3 identity and protocol decoding reached the real Worker isolate.
- Fixture assertion mismatch: the initial lobby rifle phase is correctly `holstered`, not `ready`.
- Combat consequence timeout: live snapshots continued for 15 seconds, but the expected death/score/feed composite was not observed.
- This red run is retained. It does not support a P5.8D pass claim.

Next diagnostic: include the latest combat snapshot and reliable-event counts in timeout output, then determine whether the live miss is spawn/aim geometry or RTT history.
