# Phase 4 G3 concurrent slow-socket evidence — 2026-07-22

## Result

Four independently stalled real WebSocket connections were bounded and evicted
while a fifth healthy client continued receiving authority updates from the
same local Wrangler Durable Object. The capture and independent verifier pass.
This closes the concurrent local stalled-client boundary; it does **not**
accept G3.

## Runtime result

- One owned Node TCP relay accepted four separate client connections.
- The server-to-client upstream read was independently paused for every stalled
  connection after its initial full snapshot. All four client-to-server legs
  stayed live and delivered 12 application pings each (48 total).
- For every stalled connection, observed server-to-client bytes remained
  exactly unchanged throughout the pause:
  - client 1: 1,395 to 1,395 bytes;
  - client 2: 1,440 to 1,440 bytes;
  - client 3: 1,483 to 1,483 bytes; and
  - client 4: 1,515 to 1,515 bytes.
- Pause durations were 3,260, 3,198, 3,136, and 3,073 ms. Each connection
  crossed the pinned 3,000 ms snapshot-ACK-debt limit.
- The Worker recorded exactly four snapshot-ACK-debt evictions and four
  slow-consumer evictions, 110 snapshot coalesces, 138 reliable-batch
  coalesces, eight timeout fallbacks, and a maximum observed debt of 3,087 ms.
- After relay resume, all four clients received close code 1013 with the stable
  reason `Snapshot acknowledgement timeout`; buffered relay bytes drained for
  every connection.
- The fifth, directly connected acknowledging peer remained connected and
  received a later authority snapshot at tick 66.

## Immutable evidence

- Capture:
  `evidence/2026-07-22/phase-4-g3-multi-slow-socket/runs/local-v1/multi-slow-socket.json`
  - status: `LOCAL_G3_MULTI_SLOW_SOCKET_EVIDENCE_PASS`
  - SHA-256: `62b696983ef61b3a55836459a669e8b2922ea23d5511a5a44840d7c187b8fa4a`
- Independent verification:
  `evidence/2026-07-22/phase-4-g3-multi-slow-socket/verification-local-v1.json`
  - status: `INDEPENDENT_G3_MULTI_SLOW_SOCKET_VERIFICATION_PASS`
  - all 41 checks pass
  - SHA-256: `fcdfb46745bc28eba9a8ef8f57374af342912c8a9226ad2f15ac4c36e0ac8d8f`
- Capture tool SHA-256:
  `5042008d3cb4456fefdb4b505e31335c9d69508793a12285af131aa7cc24bcc3`
- Verifier SHA-256:
  `8ec9177c68894abbba5ac7bc69b99cbcf769d5b6e39cfb4a22bd3779775e2bc5`

The verifier recomputes source/artifact hashes, reconstructs all counter
deltas, checks every paused byte interval and post-resume drain, validates all
close frames and player identities, and pins preservation of the prior
single-stalled-client evidence. Source hashes were identical at capture start,
capture end, and independent verification. Both evidence tools pass syntax,
focused ESLint, and `git diff --check`; owned port 8787 was released.

## Honest boundary

This is real local multi-connection TCP-relay evidence, but it does not claim
operating-system socket-buffer saturation. Public authentication,
production-origin WSS, external staging and restart/rollback behavior,
long-duration load/soak, CPU/memory/storage/bandwidth/cost evidence,
physical-device refresh, normal product-flow integration, and human acceptance
remain open. G3 remains `G3_NOT_ACCEPTED`.
