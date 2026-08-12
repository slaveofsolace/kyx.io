# Canonical Relay authority room soak

This gate runs eight real protocol-v2 WebSocket clients through the Worker
entrypoint and the `KyxRoom` Durable Object under
`@cloudflare/vitest-pool-workers`. It exists to cover the local,
full-occupancy authority-runtime gap; it does not replace production-network or
long-duration soak evidence.

## What the gate proves

- Eight distinct players join one canonical Relay revision-1 authority room.
- The real `FixedTickScheduler` timer remains live while all clients submit
  neutral gameplay inputs and acknowledge snapshots.
- The room exposes a bounded, constant-memory window of actual authority tick
  execution durations, including p50, p95, p99, and maximum.
- The harness counts exact UTF-8 bytes sent and received at each WebSocket
  client boundary.
- Two clients traverse the continuous spawn-to-center Relay route using
  protocol-v2 movement while the other six remain connected. At the verified
  combat pair they face within 800 milli-degrees, one holds primary fire, and
  the room must author a kill that converges through reliable events and combat
  snapshots to all eight clients.
- One client disconnects, resumes the same immutable player identity with its
  opaque credential, receives a rotated credential and full snapshot, and
  restores eight-client occupancy.

## Run and verify

```text
npm run test:authority-soak
npm run evidence:authority-soak
node tools/evidence/verify-phase9-g8-authority-soak.mjs
```

The capture defaults to:

```text
evidence/2026-08-12/kyx-clean-room-parity-v1/relay-authority-soak-v2
```

Pass `--evidence-dir=<path>` to both the capture and verifier to use another
location.

## Thresholds

The executable gate requires:

- exactly 8 clients;
- at least 60 input rounds and 100 measured authority ticks;
- local authority-tick execution p99 at or below the 50 ms simulation budget;
- observed authority progression between 10 and 30 Hz around the 20 Hz target;
- nonzero bidirectional wire traffic;
- no inbound rate rejection, backpressure episode, slow-consumer eviction,
  protocol decode error, or room tick failure;
- resumed identity/connection mode and rotated resume credential;
- a verified Relay centerline combat pair at no more than 2.2 m separation, one
  dead-target authoritative snapshot, and combat convergence to 8 of 8 clients.

## Truthful limitations

- The neutral full-occupancy load window is approximately six seconds. The
  complete deterministic run is longer because it then drives two clients over
  the canonical Relay route; it is not the separately required 30-minute
  soak.
- This is a local Workers runtime. Its timing, byte volume, and request cost are
  not Cloudflare production latency, billing, or Internet impairment results.
- `authorityTickExecution` measures work inside each tick. Scheduler delay is
  represented by the separately reported observed tick rate.
- Combat covers one live auto-rifle kill at the verified Relay centerline
  pair. It does not exhaust every weapon/projectile, multiple simultaneous
  deaths, every route, or arbitrary map sightlines.
- Tick samples are a bounded in-memory ring and reset when the room isolate is
  evicted.
