# P5.15 source-frozen 2/4/8-client attempt archive

Status: **FAILURES PRESERVED; G3 NOT ACCEPTED**

This directory contains seven local P5.15 attempts. None is a successful
2/4/8-client proof. The first eight product screenshots describe stages that
completed before each later failure; they must not be read as a pass.

## Attempt inventory

| Run | Result | Source freeze |
| --- | --- | --- |
| `local-v1` | Failed after the eight-client movement stage because the 40 ms keyboard pulse produced zero accepted outward shots. | Not captured |
| `local-v2` | Failed while rotating the combat pair to yaw `84036`. | Not captured |
| `local-v3` | Failed when east alternate-Ink leg 8 fell through to `y=-87568`. | Not captured |
| `local-v4` | Failed when east alternate-Ink leg 1 fell through to `y=-16230`. | Not captured |
| `local-v5` | Failed when eight-client movement remained about 800 mm from its target. | Not captured |
| `local-v6` | Failed eight-client readiness after seven clients were evicted for snapshot-acknowledgement debt. | Not captured |
| `local-v7` | Failed the eight-client remote-interpolation endpoint check after a 10,000 ms timeout. | Recorded unchanged for 31 enumerated files |

There is no `p515-product-population-proof.json`, successful artifact manifest,
eight-client screenshot, profile-mismatch screenshot, evidence-board
screenshot, or successful independent verification in this archive.

## Independently verified local-v7 failure

The repaired failure verifier confirms the following from
`local-v7/capture-failure.json`, the normalized wire log, the audited
SHA-pinned local-v7 capture contract, and the stored screenshots:

- all eight clients remained joined and each reported seven remote players;
- the wire log contains 20,564 sequential records, 3,155 received snapshots,
  3,261 snapshot acknowledgements, zero acknowledgement rejections, zero decode
  errors, and no raw resume-token field;
- client 6's authoritative remote position moved from
  `(-30500, 0, 7000)` to `(-30522, 0, 5751)`;
- the hash-pinned capture required local prediction to enter a 350 mm radius
  around `(-30500, 4500)` before waiting for the observer;
- the authoritative endpoint remained 1,251.193 mm from that target, so it was
  at least **901.193 mm outside the accepted predicted-endpoint radius**;
- the observer did not enter the separate 750 mm endpoint-proximity bound
  before the 10,000 ms timeout; and
- the final room metrics recorded **186 missed scheduler ticks out of 2,229
  ticks (8.345%)**.

The missed ticks and endpoint discrepancy occurred in the same run. This
archive does not claim that the missed ticks caused the discrepancy; causal
diagnosis requires a controlled follow-up capture with stronger
prediction/authority telemetry.

The recorded source freeze has identical start/failure hashes for its 31
enumerated files. When the verification record below was written, 27 still
matched the current workspace, three additional files had advanced in
concurrent post-capture work, and the remaining difference was this repaired
failure verifier. All four post-capture differences are disclosed in the JSON;
they do not rewrite the equal start/failure hashes stored by `local-v7`.

- captured verifier SHA-256:
  `c0dade1113645c21fe9c343aa55becd8c7f0d32ecf421ebe83ec0fb854eff9a6`;
- repaired verifier SHA-256:
  `631fe346c7d9c31be6159c141359662d59bcd047e53a709a7f111b569cd452fe`.

The freeze is not a complete repository, dependency, hardware, process-load,
or runtime-environment freeze.

## Verification records

- `runs/local-v7/independent-failure-verification.json`
  - status: `FAILURE_CONFIRMED`;
  - kind: `EIGHT_CLIENT_INTERPOLATION_ENDPOINT_TIMEOUT`;
  - SHA-256:
    `2b8dfd3b25c64eb65054512ee225e709a97bd4ff57e4f7c9b5c93cfcf68273f7`.
- `runs/local-v6/independent-failure-verification.json`
  - status: `FAILURE_CONFIRMED`;
  - kind: `EIGHT_CLIENT_SNAPSHOT_ACK_DEBT_EVICTION`;
  - source-freeze status: `NOT_CAPTURED`;
  - SHA-256:
    `f7fd1b010791579c2fff57053ae09a83aea36889792645c6b3725902b044cee7`.

The verifier supports immutable output creation and a read-only rerun:

```powershell
node tools/evidence/verify-phase5-p515-inkfall-product-population-failure.mjs `
  --check-only `
  evidence/2026-07-25/phase-4-g3-source-frozen-2-4-8/runs/local-v7
```

## Acceptance boundary

These records verify failure integrity only. They do not prove bounded
eight-client reconciliation/interpolation, healthy room scheduling, a complete
source-frozen 2/4/8 matrix, staging WSS, load/resource behavior, human review,
or any G3 acceptance requirement.

**G3 remains open.**

*Currently being worked on.*
