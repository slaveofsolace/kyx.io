# Phase 4 G3 external eight-room bounded burst

Status: `EXTERNAL_WORKER_8_ROOM_BOUNDED_BURST_PASS`; gate remains `G3_NOT_ACCEPTED`.

## Preserved failure

The first eight-room attempt is a failed capture. Three processes exited cleanly; five wrote nominal PASS JSON and then raised an unhandled late receive-path error while an acknowledgement raced a resumed socket close. Those five artifacts are not trusted as passes. The immutable failure summary names every affected run and pins the original capture source SHA-256 `2737fd6c7fc3c28ac43fbb28e8891bb0a2296e7ee92efdd89ad5c397f0781325`.

The capture probe now uses a best-effort `sendIfOpen` only for receive-path acknowledgements and automatic full-recovery requests. Explicit test actions still use the fail-closed `send` method. Corrected capture source SHA-256: `ec4609a232cb8b4c908de9f9bd706a6a471ece8d8a880f34627f889dc0b0e35a`.

## Corrected burst

Eight captures ran concurrently against build `g3tmp-93ae5c5c1604`:

- 8/8 processes exited cleanly.
- 8/8 runtime captures passed all 24 assertions.
- 8/8 independent verifiers passed all 24 checks.
- 8 rooms, 16 gameplay clients, and 24 physical WSS connections completed in 4,425 ms wall time.
- Every room reported zero input rejections, zero missed scheduler ticks, and zero slow-consumer evictions.
- Nearest-rank p95 room creation was 746.692 ms; input ACK 63.637 ms; sender/peer authoritative movement 110.149/110.181 ms; resume open/accepted/full 80.635/64.905/64.942 ms; total per-run completion 2,222.728 ms.

## Boundary

This is a short external concurrency burst. It is not a sustained soak, Cloudflare CPU/memory/billing measurement, cost acceptance, production-origin authentication, product-flow proof, or G3 acceptance.
