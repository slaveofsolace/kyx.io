# Phase 4 G3 Durable Object capacity and cost model

Status: planning model only; not measured billing evidence and not G3 acceptance.

Pricing basis captured 2026-07-22 from Cloudflare's current [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [WebSocket best-practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) pages:

- paid-plan allowance: 1,000,000 requests/month and 400,000 GB-s/month;
- overage: USD 0.15 per million requests and USD 12.50 per million GB-s;
- incoming WebSocket messages are charged at a 20:1 message-to-request ratio;
- outgoing WebSocket messages are not charged as Durable Object requests;
- duration is billed in 128 MB increments.

These inputs are versioned assumptions. Recheck the linked primary source before a production capacity or purchasing decision.

## Runtime assumptions

The current authority contract uses one Durable Object per room, a 20 Hz active match tick, client input at up to 20 Hz, and client snapshot/reliable acknowledgement traffic at up to 10 Hz. Active matches intentionally stay awake. Lobby/reconnect-wait hibernation is a separate optimization and must not be used to discount active-match duration.

| Players | Incoming messages/s | Incoming messages/room-hour | Request equivalents/room-hour | Request overage/room-hour |
|---:|---:|---:|---:|---:|
| 2 | 60 | 216,000 | 10,800 | USD 0.00162 |
| 4 | 120 | 432,000 | 21,600 | USD 0.00324 |
| 8 | 240 | 864,000 | 43,200 | USD 0.00648 |

Formula: `players * (20 input + 10 acknowledgement) * 3,600 / 20` request equivalents per room-hour. This is a conservative transport ceiling, not a measured average.

At the 128 MB billing increment, one continuously active room-hour consumes 460.8 GB-s. The included 400,000 GB-s therefore represents approximately 868.06 active room-hours before other Durable Object duration. Duration overage is USD 0.00576 per active room-hour.

| Players | Duration overage/room-hour | Request overage/room-hour | Modeled incremental total/room-hour |
|---:|---:|---:|---:|
| 2 | USD 0.00576 | USD 0.00162 | USD 0.00738 |
| 4 | USD 0.00576 | USD 0.00324 | USD 0.00900 |
| 8 | USD 0.00576 | USD 0.00648 | USD 0.01224 |

The totals apply only after monthly allowances are exhausted. They exclude plan minimums, Worker requests outside the Durable Object, storage reads/writes, logs, analytics, any third-party identity provider, and future protocol changes.

## Evidence relationship

The external eight-room burst exercised 8 rooms, 16 gameplay clients, and 24 physical WSS connections in parallel. It measured transport latency and room metrics, but not Cloudflare CPU time, memory, storage, or billed usage. A named-tier sustained soak plus provider-side usage export is still required for G3/G8 capacity acceptance.
