# Phase 4 G3 Worker bundle boundary and temporary deployment

Status: `TEMPORARY_WORKER_LIVE_EXTERNAL_PROTOCOL_NOT_YET_VERIFIED`

## Change

The browser/Node Rapier initializer is now separated from the Worker-safe Rapier world contract and constructor. `worker/room.ts` also imports the authority fixture catalog directly rather than the broad physics barrel. This prevents the Worker bundle from retaining the browser compatibility distribution and recorded fixture-tape catalog.

The public browser/Node API remains asynchronous through `createRapierMovementWorld`. The Worker still initializes the exact deterministic `0.19.3` WASM runtime through its Worker-specific boundary.

## Verification

- Application TypeScript: pass.
- Worker TypeScript: pass.
- Repository ESLint: pass.
- Focused Rapier/map/tape tests: 67/67 pass.
- Complete Worker-isolate tests: 20/20 pass.
- Complete Node Vitest suite: 622/622 pass across 65 files.
- Minified Worker dry run: 2,041.67 KiB total / 687.13 KiB gzip.
- Deployed Worker startup: 12 ms.
- `/health`: HTTP 200 with build `g3tmp-93ae5c5c1604` and a present Durable Object binding.
- First room creation: HTTP 503 `ROOM_INITIALIZATION_FAILED`; retained as a failure.
- Immediate room-creation retry: HTTP 201.

## Bundle identity

- `worker.js`: SHA-256 `93ae5c5c16041eef583a9da6a3e0a674a8b7e3c97f122154401a8764d5227d64`.
- Rapier WASM: SHA-256 `f27e91563c97bc402e1e8bb0531d6238f7ecf3a7f6a193b2e44278b5d9670470`.
- Temporary version: `8b21d027-c1e0-4913-be7a-ac16bb8207ff`.

## Truth boundary

This is an ephemeral temporary-account deployment, not durable staging or production. The claim URL, temporary account identifier, and credentials are not persisted. External WSS protocol evidence and its independent verifier remain required before promoting the external-runtime portion of G3.

## Subsequent external verification

The later source-frozen external transport run passed 24/24 capture assertions and 24/24 independent checks against this exact build. A corrected bounded concurrency burst then passed 8/8 captures and 8/8 independent verifiers across eight rooms, sixteen gameplay clients, and twenty-four physical WSS connections. See `2026-07-22-phase-4-g3-external-worker-tooling.md` and `2026-07-22-phase-4-g3-external-bounded-burst.md`.

These later records supersede only the `externalWssProtocolVerified: false` point-in-time field in the immutable deployment-attempt JSON. Durable staging, production-origin authentication, product flow, sustained provider resource/billing evidence, and G3 acceptance remain open.
