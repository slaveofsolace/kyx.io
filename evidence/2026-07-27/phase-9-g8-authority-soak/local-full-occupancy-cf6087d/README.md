# G4/G8 local full-occupancy authority soak

- Captured: 2026-07-27T16:10:32.405Z
- Source commit: cf6087dd15f55443a36ee30fff982b6554c0c287
- Runtime: @cloudflare/vitest-pool-workers
- Clients: 8
- Soak window: 6694 ms
- Observed authority rate: 20.018 Hz
- Authority tick p99: 30 ms
- Observed bidirectional bytes: 3791676
- Resume: resumed, identity preserved true
- Combat convergence: 8/8 clients

This evidence is local Worker/Durable Object runtime proof. Read `authority-soak.json`
for the exact counters and declared limitations; it is not production-network or
30-minute soak evidence.
