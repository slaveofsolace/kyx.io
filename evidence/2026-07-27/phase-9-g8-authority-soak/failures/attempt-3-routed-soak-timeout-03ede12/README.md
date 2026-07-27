# Failed attempt 3: routed soak exceeded the old harness timeout

- Source base: `03ede12`
- Surface: local `@cloudflare/vitest-pool-workers` Worker and `KyxRoom`
- Command: `npm run test:authority-soak`
- Result: `FAIL` after the Vitest 60,000 ms test timeout
- Observed test duration: 60,026 ms; process duration: 62.34 s

The new real-WebSocket driver was traversing the already verified Ink Channel
route rather than firing through the intended spawn-room occlusion. The
60-second test ceiling predated that bounded movement work and expired before
the routed run completed. This attempt emitted no per-leg markers, so it does
not support a route-position claim.

The correction raised the test ceiling to 120 seconds and the capture-process
ceiling to 150 seconds, then added one `KYX_AUTHORITY_SOAK_ROUTE` marker after
each completed leg. Two fresh-process reruns subsequently completed all nine
legs, reached the verified combat pair, authored a real kill, and converged to
all eight clients in 91.10 and 77.32 seconds respectively. Those successful
runs are validation inputs only until source-frozen evidence is recaptured.
