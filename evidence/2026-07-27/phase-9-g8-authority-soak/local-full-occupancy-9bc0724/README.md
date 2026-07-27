# G4/G8 local full-occupancy authority soak

- Captured: 2026-07-27T16:46:48.823Z
- Source commit: 9bc0724d74b15dfcc5c482648e4dc55beabf8e1c
- Runtime: @cloudflare/vitest-pool-workers
- Clients: 8
- Soak window: 6579 ms
- Observed authority rate: 20.064 Hz
- Authority tick p99: 27 ms
- Observed bidirectional bytes: 14838742
- Resume: resumed, identity preserved true
- Combat convergence: 8/8 clients

This evidence is local Worker/Durable Object runtime proof. Read `authority-soak.json`
for the exact counters and declared limitations; it is not production-network or
30-minute soak evidence.
