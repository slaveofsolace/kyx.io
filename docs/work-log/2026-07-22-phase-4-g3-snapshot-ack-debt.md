# Phase 4 G3 snapshot-acknowledgement debt — 2026-07-22

## Result

Implemented and locally verified a runtime-supported bound for clients that do
not acknowledge authoritative snapshots. This closes the newly discovered
local Worker-policy defect; it does **not** accept G3.

## Defect discovery

A diagnostic-only real TCP proxy run connected eight WebSocket clients to the
local Wrangler Durable Object and paused server-to-client reads for one client
while that client continued sending inbound pings. Over 46 seconds the Worker
reported zero observed buffered bytes, zero backpressure episodes, and zero
slow-consumer evictions while continuing to issue snapshots. The installed
Cloudflare Worker WebSocket type surface does not expose a server-side
`bufferedAmount` property, so the existing optional property check was useful
for deterministic fakes but could not provide the operational bound by itself.

That ad-hoc proxy run was not preserved as acceptance evidence. It was used to
find the defect and define the replacement policy.

## Implemented bound

- `worker/transport-limits.json` pins a 3,000 ms maximum snapshot-ACK debt.
- Socket attachment schema version 5 persists `snapshotAckDebtStartedAt` and
  safely migrates the immediately preceding version-4 shape.
- A pending latest snapshot is coalesced before the one-second retry boundary.
- A full recovery snapshot may be retried once per second without resetting the
  original debt start.
- Reliable-event resends are coalesced while debt persists. The first reliable
  batch and the first resend after a successful snapshot ACK remain available,
  preserving reliable-event progress for responsive clients.
- An unacknowledging socket is disconnected with WebSocket code 1013 and the
  stable reason `Snapshot acknowledgement timeout` at 3,000 ms.
- The same policy covers explicit full-snapshot requests so they cannot extend
  the debt window.
- Existing optional outbound-buffer policy remains as an additional guard for
  runtimes or test doubles that expose that signal.
- Transport metrics now distinguish ACK-debt episodes, snapshot and reliable
  coalescing, recoveries, evictions, fallbacks, and maximum observed debt.

## Current executable verification

- Pure security/transport policy: **7/7 PASS**.
- Full Cloudflare Worker pool: **17/17 PASS** across four files.
- The Worker integration includes one real non-acknowledging WebSocket and one
  automatically acknowledging peer. The former closes with code 1013 at the
  bounded debt window; the latter remains open and receives a later authority
  snapshot.
- Full default application regression: **579/579 PASS** across 60 files.
- Application TypeScript: **PASS**.
- Worker TypeScript: **PASS**.
- Focused ESLint: **PASS**.
- Wrangler deployment bundle dry-run: **PASS**; no deployment was performed.

## Remaining boundary

The successor real-socket capture in
`2026-07-22-phase-4-g3-real-slow-socket.md` now adds an actual local `ws` + TCP
read-pause proof: the 3,000 ms path evicts with code 1013 while a healthy peer
advances, and a 607 ms path recovers with zero fallback or eviction. It does
not claim operating-system socket-buffer saturation. The corrected expanded
Chromium/Wrangler matrix in `2026-07-22-phase-4-g3-expanded-v14.md` also passes
all 14 impairment profiles plus lifecycle, real-refresh resume, and abuse with
protocol-v2 acknowledgements and zero delta-baseline misses. Multiple stalled clients,
public auth, external staging recovery, load/resource/cost evidence, physical
refresh, product flow, and final source-frozen G3 regression remain open. G3
remains explicitly unaccepted.
