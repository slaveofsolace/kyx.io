# Phase 4 G3 expanded local transport evidence v14 — 2026-07-22

## Result

The fresh `local-v14` expanded local G3 capture and its independent verifier
both pass. The run exercises real Chromium clients against owned Vite and local
Wrangler Durable Object runtimes. It closes the stale evidence-client defect
that invalidated `local-v13`; it does **not** accept G3.

## Preserved v13 failure

`runs/local-v13` is retained intact. All fourteen impairment profiles and the
render-rate sweep completed, then the lifecycle probe timed out waiting for
authoritative movement. The raw lifecycle client predated the snapshot-ACK-debt
policy and never acknowledged snapshots, so the Worker correctly entered
fallback behavior. This was an evidence-harness defect, not a relaxation or
failure of the Worker policy. Its `logs/capture-error.txt` remains part of the
independent v14 preservation check.

## Corrected protocol clients

- Lifecycle, real document-refresh/resume, and abuse probes now acknowledge
  versioned full and delta snapshot baselines and reliable-event cursors.
- Delta probes validate their base ID and tick, apply removals and patches, and
  retain a materialized entity view for lifecycle assertions.
- Lifecycle clients sent 112, 111, 5, and 1 acknowledgements respectively,
  with zero delta-baseline misses.
- Refresh preparation/resume sent 2 and 1 acknowledgements.
- Abuse attacker/witness clients sent 9 and 8 acknowledgements, with zero
  delta-baseline misses.

## Immutable evidence

- Capture matrix:
  `evidence/2026-07-21/phase-4-g3-expanded/runs/local-v14/expanded-runtime-matrix.json`
  - status: `EXPANDED_LOCAL_G3_EVIDENCE_PASS`
  - evidence ID: `phase-4-g3-expanded-local-v14-2026-07-22`
  - SHA-256: `62d8b44bba410a3c35fd0069163b46de03cf8926bbcfa98008b41325e0147702`
- Independent verification:
  `evidence/2026-07-21/phase-4-g3-expanded/verification-local-v14.json`
  - status: `INDEPENDENT_EXPANDED_G3_VERIFICATION_PASS`
  - all 52 independent checks pass
  - SHA-256: `665c79778b9c044185d2db914f85eed1c55b25e9956761d7a2ab6f8aa564d1dd`
- Capture tool SHA-256:
  `76cb5e90538fe5db5bf4f246dbebe7ae41f16a5029cd2162cccd724a2ecf4e92`
- Verifier SHA-256:
  `3db46293a21365d37b0a354c892abb869553de2c0c2c9e53dfef71c2084d077a`

The verifier recomputes the artifact inventory, exact profile contracts,
transport-limit-derived flood counters, lifecycle/refresh/abuse assertions,
protocol-client diagnostics, and preservation of the v13 failure. The v14
capture contains 70 hashed artifacts.

## Runtime coverage

- 14/14 factored impairment profiles pass: RTT 0/50/100/200/350 ms, jitter
  15/50 ms, loss 1/3/8 percent, duplication 1/5 percent, targeted reorder, and
  bounded outage recovery.
- 30/60/120 Hz browser presentation-sampler rows pass. The 120 Hz row is not a
  claim of physical 120 Hz display capture.
- Lifecycle, late join, explicit resync/rate bound, duplicate session,
  disconnect grace/removal, authenticated reconnect, rotated/replay-safe token,
  and version rejection pass.
- A real document reload followed by authenticated resume passes.
- Forged transform/player ID, duplicate/far-ahead input, queue pressure,
  oversized/invalid messages, and the transport-flood close/counters pass.
- Both owned ports were released after capture.
- Capture/verifier syntax and focused ESLint pass.

## Honest boundary

This remains local development evidence and uses factored impairment sweeps,
not a full Cartesian matrix. The separate real slow-socket evidence covers one
paused downstream and one healthy peer, and its concurrent successor covers
four paused downstreams plus one healthy peer. Public authentication,
production-origin staging WSS, external-process confirmation of the already
sealed Worker-isolate lobby hibernation/checkpoint recovery, load/soak,
resource/cost, physical-device
refresh, product-flow integration, and a final source-frozen adjacent
regression remain open. G3 remains `G3_NOT_ACCEPTED`.
