# Phase 4 G3 external Worker capture and verifier tooling

Date: 2026-07-22

Status: `EXTERNAL_WORKER_TRANSPORT_SMOKE_PASS` and `INDEPENDENT_VERIFICATION_PASS`.
Gate decision: `NONE`; `G3_NOT_ACCEPTED`.

## Bounded scope

This slice added reusable tooling for an explicitly supplied external HTTPS Worker origin and
expected `BUILD_ID`. The capture uses the fixed localhost Origin
`http://127.0.0.1:5173`, strict platform TLS verification, and real WSS connections. It does not
exercise production-origin authentication or the production product flow. The tested target is
an ephemeral preview, not durable staging. Matching the expected build ID is not remote source
attestation. No deployment is performed by either tool, and this smoke does not accept G3.

No Worker, app, combat, map, character, Inkfall, or existing G3 evidence file was changed.

## Added tools

- `tools/evidence/capture-phase4-g3-external-worker.mjs`
  - requires an HTTPS origin, exact expected build ID, and fresh repository-contained run path;
  - performs TLS health, forbidden-Origin, and room-creation requests;
  - opens two simultaneous protocol-v2 WSS clients with automatic ACKs and exact delta
    materialization;
  - proves join, input-independent tick advance, accepted input, authoritative movement visible to
    both clients, and forged-transform rejection without authority mutation;
  - closes client A, resumes it by possession of its opaque resume credential, proves identity and
    match preservation, credential rotation, and a first full snapshot;
  - captures selected healthy room/transport metrics and operation latency timings;
  - hashes the exact local transport source set before and after capture;
  - never stores raw protocol payloads, resume credential values, or external access credentials;
  - refuses an existing output directory and writes the runtime file with no-overwrite semantics.
- `tools/evidence/verify-phase4-g3-external-worker.mjs`
  - independently pins the expected Worker origin and build ID;
  - checks every capture assertion, HTTP/WSS contract, selected metrics, timings, boundaries,
    source hashes, and credential-field/value audit;
  - writes only to a fresh verification path outside the immutable capture run.

## Exact live commands

Capture:

```powershell
node tools/evidence/capture-phase4-g3-external-worker.mjs --worker-origin https://kyx-io-authority.heliotrope-contraption.workers.dev --expected-build-id g3tmp-93ae5c5c1604 --output evidence/2026-07-22/phase-4-g3-external-worker/runs/preview-g3tmp-93ae5c5c1604-v1
```

Expected and observed stdout:

```json
{"status":"EXTERNAL_WORKER_TRANSPORT_SMOKE_PASS","output":"evidence/2026-07-22/phase-4-g3-external-worker/runs/preview-g3tmp-93ae5c5c1604-v1/external-worker-runtime.json","gateClaim":"G3_NOT_ACCEPTED"}
```

Independent verification:

```powershell
node tools/evidence/verify-phase4-g3-external-worker.mjs --worker-origin https://kyx-io-authority.heliotrope-contraption.workers.dev --expected-build-id g3tmp-93ae5c5c1604 --run evidence/2026-07-22/phase-4-g3-external-worker/runs/preview-g3tmp-93ae5c5c1604-v1 --output evidence/2026-07-22/phase-4-g3-external-worker/verifications/preview-g3tmp-93ae5c5c1604-v1.json
```

Expected and observed stdout:

```json
{"status":"INDEPENDENT_VERIFICATION_PASS","output":"evidence/2026-07-22/phase-4-g3-external-worker/verifications/preview-g3tmp-93ae5c5c1604-v1.json","gateClaim":"G3_NOT_ACCEPTED"}
```

## Results

- Capture assertions: 24/24 true.
- Independent verification checks: 24/24 true.
- Credential audit: zero forbidden fields and zero opaque credential-like values.
- Source hashes: exact start/end match and current-source verifier match.
- Runtime: 2.120196 seconds total.
- Health: 107.002 ms; room creation: 650.683 ms.
- Two joined clients: protocol v2, WSS upgrade 101, no parse/version/baseline/history gaps.
- Transport metrics: 25 inbound/25 accepted/0 rate-rejected messages, 3 full snapshots,
  14 deltas, 20 accepted/0 rejected snapshot ACKs, and 0 slow-consumer evictions.
- Authority metrics: tick 18, warmup, 2 players/2 connected, 1 accepted input,
  0 authority input rejections, and 0 missed scheduler ticks.
- Resume: clean close 1000, authenticated `resumed` mode, identity/match preserved,
  credential rotated, and full snapshot first.
- Re-running either command at the same output path correctly failed before overwrite.

## Validation

- `node --check tools/evidence/capture-phase4-g3-external-worker.mjs`: pass.
- `node --check tools/evidence/verify-phase4-g3-external-worker.mjs`: pass.
- Both `--help` paths: pass.
- Targeted ESLint for both tools: pass.

## Artifact hashes

- Capture tool: `2737fd6c7fc3c28ac43fbb28e8891bb0a2296e7ee92efdd89ad5c397f0781325`
- Verifier tool: `dd7f382cba5c7c0b775ae546024919c67e69c2ec7fc3b789f30c7043396daff8`
- Runtime JSON: `96e17715be682bc87fac9210598273c088e1c2e67e207dfec8fbdceec0a13920`
- Independent verification JSON:
  `16931d697e65c6f0a0e2afe4e639f75b2ff9ebdbee5ffa29b45667ffcb4fd835`

## Remaining boundary

This evidence closes only the bounded external-preview transport smoke. Durable staging,
production-Origin access/authentication, the real product join flow, wider impairment/load
coverage, and any human G3 acceptance decision remain open.
