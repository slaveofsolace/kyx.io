# Phase 4 work log — expanded local G3 evidence

- Date: 2026-07-21; independently audited and updated 2026-07-22 (America/Chicago)
- Scope: P4.3-P4.8 local authoritative-movement validation
- Result: **EXPANDED LOCAL EVIDENCE PASS; G3 NOT ACCEPTED**
- Deployment: none performed or authorized

## Outcome

The current canonical local result is the immutable `local-v12` capture. It
passes independent verification without making a gate decision:

1. `local-v12` returned `EXPANDED_LOCAL_G3_EVIDENCE_PASS` for all fourteen
   profiles. It contains 70 inventoried artifacts and retains the exact factored
   matrix, lifecycle, real reload/resume, abuse, render-sampler, screenshots,
   videos, logs, and source/run identity recorded at capture time.
2. The root-owned verifier ran exactly once against that frozen directory. All
   38 checks are true, including raw/embedded profile equality, required row
   order, atomic observer sample/overlay equality, artifact hash and scope,
   preserved failures, and released ports. It returned
   `INDEPENDENT_EXPANDED_G3_VERIFICATION_PASS`.
3. The historical five-profile and earlier expanded PASS records remain useful
   implementation evidence, but they are not substituted for or silently
   merged into `local-v12`.

The matrix retains `gateDecision: NONE`, `gateClaim: G3_NOT_ACCEPTED`, and
`deploymentPerformed: false`; the verifier independently retains
`gateClaim: G3_NOT_ACCEPTED`. This is a local evidence PASS, not a G3 pass.

## Exact local coverage

| Dimension | Passed local rows | Boundary |
|---|---|---|
| RTT | 0, 50, 100, 200, 350 ms | Symmetric seeded one-way half-RTT delays |
| Jitter | 0, +/-15, +/-50 ms | Nonzero rows use a 60 ms one-way base |
| Loss | 0, 1, 3, 8% | Deterministic seeded gameplay-frame loss |
| Duplication | 0, 1, 5% | Deterministic seeded duplicate copies |
| Reordering | finite targeted burst | Every twelfth gameplay frame receives a 140 ms reorder delay |
| Recovery | finite 18-frame inbound outage | Interpolated, extrapolated, stale, and recovered presentation were observed |
| Presentation sampler | 30, 60, 120 Hz | 29.97, 62.47, and 124.98 Hz measured; this is not physical-display proof |

The run is a factored-axis sweep, not the 540-case Cartesian product of all
RTT, jitter, loss, and duplication combinations. Periodic movement traffic was
impaired; reliable join/resume/version/resync control and each initial bootstrap
full snapshot followed the explicitly logged bypass policy.

All 14 profile rows used two isolated Chromium contexts in the same room and
match. Authority measured within the declared 17-23 Hz band, movement and
remote interpolation were observed, high-RTT prediction led authority where
required, reconciliation samples remained below the 2 m hard-snap bucket,
client and impairment queues stayed bounded, and browser critical logs were
empty. The corrected reordered-input path reached a 1,400 mm peer-A maximum in
`local-v12`, with four soft corrections and zero hard snaps; peer B remained at
zero correction. Every row includes screenshots for both peers plus a motion
screenshot whose fixed dev-only overlay is derived from the exact serialized
interpolated observer sample. The RTT-350, targeted-reorder, and outage rows
also include both-peer video.

## Lifecycle and abuse results

The lifecycle probe passed all of the following:

- initial join/full snapshot;
- a distinct passive activation peer with processed sequence `-1`, followed by
  authority tick advance without either peer sending input;
- a separate late join that received the already moved player;
- live duplicate-session rejection;
- correlated explicit full resync plus the 500 ms resync-request rate bound;
- protocol-v1 rejection without corrupting the open v2 session;
- disconnect grace retention followed by deterministic leave/removal;
- authenticated reconnect with stable player/match identity and rotated opaque
  43-character resume token;
- old-token replay rejection; and
- a real `page.reload()` that tore down a socket recorded open immediately
  before navigation, then resumed from a full snapshot with zero unexpected
  post-reload critical failures.

Same-origin requests aborted specifically during the intentionally destroyed
pre-reload document are retained separately as expected `net::ERR_ABORTED`
teardown records. Request failures outside that tagged navigation phase remain
critical.

The modified-client abuse probe passed forged transform and forged player-ID
rejection with no accepted-position mutation, duplicate-sequence replay and
sequence-lead rejection, oversized and invalid-JSON rejection, and open-socket
health afterward. Five 32-command batches reached the authority queue's exact
128-command ceiling; Worker metrics reported 32 `queue_full` rejections and a
maximum depth of 128. A separate valid-ACK flood returned `RATE_LIMITED` and
closed with policy code 1008. The frozen artifact serializes
`transportFlood.messagesSent: 257`, but the capture source in place before the
run transmitted 385 frames while retaining that stale literal in its result.
The independent verifier checks the exact abuse-assertion key set and that every
serialized assertion is `true`; it does not recompute the concrete flood count
or reconcile it with the capture loop. Therefore the rate-limit outcome is
useful local behavior evidence, but `local-v12` is not accepted as exact
threshold proof.

## Preserved failure ledger

No failed run was overwritten:

| Attempt | Preserved result |
|---|---|
| 1 | Browser CORS blocked evidence-only REST fetch after profiles/render; moved REST orchestration outside the browser |
| 2 | Tick-independence probe ran before the two-player match-start precondition; added a separately identified passive peer |
| 3 | Browser waited for an immediate `queue_full` error frame even though live draining delayed it; added Worker metrics plus deterministic transport flood proof |
| 4 | All substantive rows passed, but an expected reload-teardown request abort was globally classified as critical; added navigation-phase-scoped classification |
| 5 | A concurrent source edit hot-reloaded Wrangler during profile 2; active uncheckpointed recovery correctly failed closed with HTTP 503 |

The subsequent fresh-run chain is also immutable:

| Run | Preserved result |
|---|---|
| `local-v8` | Invalidated by a concurrent source edit and Wrangler hot reload; room metrics correctly returned 503 |
| `local-v9` | Runtime rows completed, but verification was rejected because stale scope text falsely said deltas were absent |
| `local-v10` | Truthful FAIL: targeted reordering exposed one exact 2,000 mm peer-A hard snap caused by arrival-order input sequencing |
| `local-v11` | Product defect fixed; truthful FAIL because the evidence harness sampled presentation twice across an interpolated/extrapolated mode boundary |
| `local-v12` | PASS: the exact interpolated presentation handle is serialized once and its structured payload is rendered into the screenshot proof overlay |

The first independent expanded-verifier execution also failed because a
detached `Dirent.isDirectory` method lost its receiver. That verifier failure is
preserved separately; the corrected verifier then passed against the unchanged
successful capture.

## Artifacts and reproducible commands

- Existing matrix:
  `evidence/2026-07-20/phase-4-g3-authoritative-movement/runs/reliable-control-split/runtime-matrix.json`
- Existing-matrix independent verification:
  `evidence/2026-07-21/phase-4-g3-expanded/five-profile-independent-verification.json`
- Canonical expanded matrix:
  `evidence/2026-07-21/phase-4-g3-expanded/runs/local-v12/expanded-runtime-matrix.json`
  (`f3a2e65970a1525aec08a843e01a00bfd5ab2a4fab317594e816defe08c419ad`)
- Canonical expanded independent verification:
  `evidence/2026-07-21/phase-4-g3-expanded/expanded-independent-verification-local-v12.json`
  (`4bf6184415f8e743430180f3aa107cf18e1f674b103ad6295d6c5e656f97d89b`)
- Failed expanded attempts:
  `evidence/2026-07-21/phase-4-g3-expanded/failures/`

```text
node tools/evidence/capture-phase4-g3-expanded.mjs --output evidence/2026-07-21/phase-4-g3-expanded/runs/local-v12
node tools/evidence/verify-phase4-g3-expanded.mjs --run evidence/2026-07-21/phase-4-g3-expanded/runs/local-v12 --output evidence/2026-07-21/phase-4-g3-expanded/expanded-independent-verification-local-v12.json
```

Those are historical exact invocations, not authorization to overwrite or rerun
the frozen artifacts. The capture used Node `v24.14.0`, Playwright `1.61.1`,
Vite `8.0.16`, Wrangler `4.112.0`, and the recorded package-lock hash. Both
owned ports were released.

Prepared successor expanded tooling (not executed in this work log):

- corrected expanded abuse-counter capture/verifier:
  `tools/evidence/capture-phase4-g3-expanded.mjs` and
  `tools/evidence/verify-phase4-g3-expanded.mjs` (target run `local-v13`).

After the frozen PASS, the successor transport lane added acknowledged deltas,
bounded missing/history fallback, reliable-event resend/cumulative ACK checks,
and attachment-cache recovery with focused Worker tests. The next bounded lane
then added deterministic slow-consumer handling: the existing 256 KiB socket
buffer ceiling suppresses supersedable gameplay sends for a 1,000 ms grace
(twenty authority ticks / ten snapshot periods), resets when the buffer drains,
and evicts persistent saturation with close code 1013 and explicit transport
metrics. That checkpoint passed 12/12 Worker-isolate tests across four files,
including an exact 385-received/384-rate-accepted/1-rate-rejected counter test;
the focused security policy test passed 5/5. After the bounded lobby
hibernation/recovery additions below, the current adjacent Worker suite passes
15/15 across the same four files.

The bounded `local-v13` tooling is prepared but has not been executed. The
capture and Worker now share `worker/transport-limits.json`; the flood count is
derived as one over its 384-message limit, the browser records the count it
actually sends, and raw Worker received/accepted/rejected counters are sampled
before and after the isolated flood. The verifier recomputes those deltas rather
than trusting capture booleans. A preserved stale-count fixture proves the new
contract rejects the prior 257-recorded/385-executed mismatch (2/2 regression
tests pass). No `local-v13` directory or verifier output has been created while
concurrent source lanes are active.

Slow-consumer implementation evidence remains separate from the expanded
matrix. The standalone deterministic-policy and Cloudflare Worker-isolate
capture is now preserved at
`evidence/2026-07-22/phase-4-g3-slow-consumer-focused/runs/local-v1/`.
Its exact 5/5 policy and 3/3 Worker-isolate probes passed, all four serialized
checks are true, seven source files and four raw artifacts are hashed, and the
capture SHA-256 is
`43d53cff74c4d3ea0c41b702699086ebe11553768e6b7aa1f33939fd5c7d8a17`.
The independent verifier was executed exactly once and returned
`INDEPENDENT_FOCUSED_SLOW_CONSUMER_VERIFICATION_PASS`; its artifact SHA-256 is
`3310887b0605a1ba7a8cd9cb79e366567b61b37bdbb85fae9aed62655c2bb141`,
with all fifteen independent checks true.

The first focused capture attempt is preserved under
`evidence/2026-07-22/phase-4-g3-slow-consumer-focused/failures/attempt-1-node24-dirent-method/`.
Both probes had emitted raw logs, but capture stopped before producing its
evidence record because a detached `Dirent.isFile` method lost its receiver on
Node 24. The corrected script calls `entry.isFile()` and used a fresh output.

This focused PASS explicitly does not claim a real slow network socket, real
socket-buffer saturation, multiple-client resource behavior, staging WSS,
deployment, or G3 acceptance. It is not retroactively attributed to
`local-v12`, and the fresh expanded `local-v13` run remains pending a complete
source freeze.

The separate real local successor-transport harness has now also completed.
`evidence/2026-07-21/phase-4-g3-transport-v1/runs/local-v8/` is the first
successful run after seven preserved failed attempts. It used a real local Vite
origin, Wrangler Durable Object, and Chromium WebSocket and passed:

- distinct opaque baseline IDs for different same-tick states;
- deltas chained only from the exact acknowledged baseline;
- reliable join/leave event resend before ACK, client deduplication, and stop
  after cumulative ACK;
- future, old, and unknown snapshot/event ACK rejection;
- correlated missing-baseline and unacknowledged-timeout full-snapshot fallback;
- a 10.5-second honest stream near 20 Hz input and 10 Hz ACK cadence with 222
  deltas, no rate limit, no recovery request, and an open healthy socket; and
- an exact 385-message abuse stream producing 385 received, 384 rate-accepted,
  one rate-rejected, `RATE_LIMITED`, and policy close 1008.

The capture has SHA-256
`63bb4529f0e7e2e9725b8b893e27a9e5bbd963d88be676a5e81a984cf2f6228e`.
The root-owned independent verifier was executed exactly once, returned
`INDEPENDENT_G3_TRANSPORT_V1_VERIFICATION_PASS`, and passed all 34 checks; its
artifact SHA-256 is
`37aa11ed96efdb3051c5782d55c19909a6ac31b53ecd7c581c803f214b6450b0`.
Both owned ports were released and the critical browser log is empty.

This successor record supersedes only the stale delta/reliable/rate-limit
claims from the immutable expanded run. Its reliable events are join/leave
lifecycle events rather than combat events, and it does not prove real socket
buffer saturation, public authentication, staging, restart/checkpoint recovery,
load/resource/cost behavior, physical 120 Hz review, or G3 acceptance. A final
source-frozen expanded regression remains prudent after the active source lanes
settle, but the exact 257/385 abuse-count defect now has independent replacement
evidence rather than relying on the historical `local-v12` literal.

The next bounded recovery slice replaces the lobby's perpetual five-second
maintenance timer with persisted SQLite lobby checkpoints and the nearest
durable socket-stale/session-expiry alarm. The successful focused capture at
`evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused/runs/local-v2/`
directly exercises Cloudflare Worker-isolate Durable Object eviction with
hibernatable WebSockets. Its three selected tests prove connected-lobby
rehydration with the same immutable room/match/player/spawn, disconnected-player
resume with opaque-token rotation, full-snapshot resynchronization, transition
to active warmup, and idempotent reconnect-expiry cleanup through the durable
alarm. Worker typecheck, focused lint, and a Wrangler dry-run bundle also pass.
The capture SHA-256 is
`c99096844a60fbe35599d1aec65a488f429be6cefe6f33c1d8e9faef88e33663`.

The independent verifier was executed exactly once, passed all 18 checks, and
has SHA-256
`7c2ca8c673cd385721b692266f36dd256f70fe773d7f2d95d0cd09ea64cf020f`.
The first `local-v1` capture is preserved as an evidence-schema failure: all
runtime probes passed, but Vitest reported two internal suite counters for the
one selected Worker-pool file while the first capture tool required one.

This new record closes only the focused Worker test-runtime lobby/reconnect
hibernation boundary. It is not an external workerd-process restart, staging or
production proof. Warmup/active/postmatch intentionally remain awake and
`active_uncheckpointed`; recreation still fails closed instead of fabricating
an active match. Real slow sockets, staging/auth, load/resource/cost,
physical-refresh, product-flow, final adjacent regression, and G3 acceptance
remain open.

## Remaining G3 blockers

The local PASS cannot accept G3. Still required or unproved:

- real Worker/socket saturation evidence for the new bounded slow-consumer
  policy, including coalescing, drain recovery, 1013 eviction, bounded retained
  reliable history, and resource behavior under multiple slow clients;
- uint32 input/event rollover plus explicit spawn/teleport/death/version reset
  semantics across the transport-connected product path;
- full Cartesian interaction rows if the governing matrix is interpreted as
  combinations rather than factored axes;
- physical 120+ Hz display/video review and human visual acceptance;
- production account authentication, origin/preflight/CORS policy, secure WSS,
  staging secrets/configuration, deployment compatibility, and rollback;
- external workerd/staging recovery observation beyond the focused
  Worker-isolate lobby checkpoint proof; active uncheckpointed rooms
  deliberately remain awake and fail closed on recreation;
- load/soak plus CPU, memory, storage, bandwidth, and cost observability; and
- visible product-flow integration beyond the development evidence route.

Release-map collision/content and combat authority remain downstream G4-G6
work; they are not silently treated as proof for this movement gate.

The next highest-leverage G3 closure items are real slow-client saturation with
multiple clients and staging/auth/load/resource rows. A final source freeze
should then run the
prepared `local-v13` expanded regression so the complete matrix is adjacent to
the settled source, even though the successor record now independently replaces
the stale abuse count. The historical `local-v12` PASS, `transport-v1` local-v8
PASS, and all failed attempts remain immutable. No deployment or G3 decision is
recorded here.
