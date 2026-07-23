# P5.8D Worker red run 03

- Command: `vitest run --config vitest.worker.config.ts --maxWorkers=1 --no-isolate tests/worker/combatRev3.test.ts`
- Result: **1 passed / 1 failed**
- The real WSS impairment sequence reached the exact core consequence: 10 unique shots, 10 unique 10-point damage events, one death, team-blue score 1, and feed sequence 1.
- At tick 60 the shooter held 40/50 rounds and the victim was dead with respawn eligibility at tick 220.
- The follow-on combined release/reload/grenade sample did not produce a later composite snapshot; the diagnostic needs processing acknowledgements between the queued held-fire tail and follow-on commands.
- This red run is retained and does not support a composite reconnect pass claim.

Correction: wait for the release input acknowledgement, then submit reload/grenade against a fresh observed server tick.
