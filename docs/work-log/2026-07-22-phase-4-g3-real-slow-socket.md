# Phase 4 G3 real slow-socket evidence — 2026-07-22

## Result

The local application-level snapshot-ACK-debt policy now has reproducible
evidence through actual `ws` clients, an owned Node TCP byte relay, and the
local Wrangler Durable Object runtime. The capture and independent verifier
both pass. This closes the single-real-slow-socket local boundary; it does
**not** accept G3.

## Eviction scenario

- A proxied client joined and received its initial full snapshot without
  acknowledging it.
- The relay paused the upstream server-to-client TCP read. During the pause,
  no server-to-client `data` event was delivered by the relay, while the
  client-to-server leg remained live and forwarded 12 application pings.
- Server-to-client observed bytes stayed exactly 1,394 at pause and immediately
  before resume. Client-to-server bytes advanced from 406 to 602.
- The Worker recorded 27 coalesced snapshots, 32 coalesced reliable batches,
  two timeout fallbacks, and a maximum debt of 3,073 ms.
- Exactly one ACK-debt/slow-consumer eviction occurred. After the relay resumed,
  the client received close code 1013 with the stable reason
  `Snapshot acknowledgement timeout`.
- The healthy direct peer remained connected and received a later snapshot at
  tick 62.
- Buffered server-to-client bytes drained after resume: observed relay bytes
  increased from 1,394 to 2,392.

## Recovery scenario

- A second proxied client joined without acknowledging its initial snapshot.
- The relay paused the same server-to-client direction for 607 ms while two
  application pings continued upstream.
- The relay resumed below the pinned 1,000 ms fallback threshold and the client
  acknowledged the snapshot.
- The Worker recorded an ACK-debt recovery with zero fallback and zero eviction.
- A healthy direct peer then joined; both clients remained connected and the
  recovered client received a later authority snapshot.

## Immutable evidence

- Capture:
  `evidence/2026-07-22/phase-4-g3-real-slow-socket/runs/local-v1/real-slow-socket.json`
  - status: `LOCAL_G3_REAL_SLOW_SOCKET_EVIDENCE_PASS`
  - SHA-256: `49748dd8be977fd4cba1ec7feab989f1852157f8df4a1a28c6e4bc4ecf37e49c`
- Independent verification:
  `evidence/2026-07-22/phase-4-g3-real-slow-socket/verification-local-v1.json`
  - status: `INDEPENDENT_G3_REAL_SLOW_SOCKET_VERIFICATION_PASS`
  - all 17 top-level checks pass
  - SHA-256: `403a4419982d174626b358326f110511c35594e3732d7453973dbd79ce0e510d`
- Capture tool SHA-256:
  `1605d8014bacb7786b55811b301bd8b660a8979dfdbf09959ba87118a4c6234f`
- Verifier SHA-256:
  `4355f004cf19f6da9cb64ffdfedee476ae6a915b55b08b08df444cd850960f5e`

The verifier recomputes the source and artifact inventories, compares the raw
scenario logs with the embedded records, and independently derives the
eviction/recovery assertions from raw bytes, timing, close, message, and Worker
metric values. It does not merely trust serialized `passed` booleans.

## Adjacent verification

- Evidence-tool syntax checks: **PASS**.
- Evidence-tool ESLint: **PASS**.
- Snapshot/security policy: **7/7 PASS**.
- Full Cloudflare Worker pool: **17/17 PASS** across four files.
- Worker TypeScript: **PASS**.
- Wrangler deployment bundle dry-run: **PASS**; no deployment was performed.
- Owned port 8787 was released.

## Honest boundary

This is a real local TCP read-pause and application-debt proof. It is not a
claim of operating-system socket-buffer saturation and does not invent a
server-side `bufferedAmount` API that the installed Cloudflare surface does not
provide. The successor concurrent record in
`2026-07-22-phase-4-g3-multi-slow-socket.md` now proves four independently
paused connections are evicted while a fifth healthy peer advances. Public
authentication, production-origin WSS, external staging recovery, load/soak,
resource/cost, physical-device
refresh, product-flow integration, and the final source-frozen adjacent
regression remain open. G3 remains `G3_NOT_ACCEPTED`.
