# Phase 4 G3 focused lobby hibernation and recovery

- Date: 2026-07-22 (America/Chicago)
- Result: **FOCUSED WORKER-ISOLATE PASS; G3 NOT ACCEPTED**
- Deployment: none performed or authorized

## Outcome

The protocol-v2 Durable Object no longer keeps created, lobby, or
reconnect-wait rooms awake with a five-second maintenance timer. Lobby authority
is now persisted as a bounded SQLite checkpoint and maintenance is scheduled at
the nearest socket-stale or resume-session deadline with one durable alarm.
Warmup, active, and postmatch still use the fixed 20 Hz in-memory timer and do
not claim hibernation.

The focused Cloudflare Worker-isolate record exercises the Hibernation API
boundary through a real hibernatable-object eviction. It proves three bounded
flows:

1. A connected one-player lobby survives object eviction with the same room,
   match, player, spawn ordinal, and tick-zero position; the still-open socket
   wakes the new instance, receives a fresh full snapshot, and can admit a
   second player to begin warmup.
2. A disconnected reconnect-wait player is reconstructed after eviction and
   can resume the same immutable player and match with a rotated opaque token
   and fresh full snapshot.
3. An expired reconnect-wait session is pruned idempotently by the durable
   alarm after eviction, returns the room to pristine state, clears the lobby
   row and resume session, and permits the room route to reopen.

This is direct Worker test-runtime hibernation evidence. It is not an external
workerd process restart, staging execution, or production runtime claim.

## Persistence and failure policy

`room_runtime_v2.recovery_state` now distinguishes:

- `pristine`: no persisted lobby authority exists;
- `lobby_checkpointed`: exact lobby player IDs and stable join ordinals are
  present in `room_lobby_players_v1` and must exactly match current resume
  sessions and live socket generations;
- `active_uncheckpointed`: a live fixed-tick match is intentionally memory-only
  and a recreated object fails closed; and
- `expired`: the room cannot be reconstructed as the same match.

Lobby player insertion plus the checkpoint state, activation plus checkpoint
deletion, and expiry pruning across reconnect mappings and lobby rows are
transactional. Recovery validates immutable room/match/protocol/simulation
identity, exact checkpoint-to-session membership, socket identity and
generation, and unique connected-player mapping. Any mismatch marks the room
expired instead of fabricating authority state. Rehydration resets stale
snapshot/reliable baselines and sends a current full snapshot.

Active simulation remains deliberately awake. Starting warmup atomically
clears lobby checkpoint rows, marks `active_uncheckpointed`, deletes the alarm,
and starts the fixed-tick timer. The implementation does not persist or
reconstruct per-tick active match state.

## Executed evidence

The immutable successful capture is:

- `evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused/runs/local-v2/lobby-hibernation-focused.json`
- Capture SHA-256:
  `c99096844a60fbe35599d1aec65a488f429be6cefe6f33c1d8e9faef88e33663`
- Status: `FOCUSED_LOBBY_HIBERNATION_EVIDENCE_PASS`
- Six capture checks passed.
- Thirteen scoped source/tool files and twelve raw/bundle artifacts are hashed.

The capture ran:

- the three focused eviction/alarm tests inside the real Cloudflare Worker test
  pool: **3/3 selected PASS** with the other three protocol-file tests skipped;
- Worker TypeScript: **PASS, zero diagnostics**;
- focused Worker/test ESLint: **PASS, zero errors or warnings**; and
- Wrangler Worker dry-run bundle: **PASS**, including the Worker JavaScript,
  source map, README, and Rapier WASM artifacts.

The complete adjacent Worker regression was also run independently at this
checkpoint: **15/15 PASS** across four files. Application TypeScript passed,
and the P5.6 focused selection independently passed 14/14.

The root-owned independent verifier was executed exactly once against the
frozen successful capture:

- `evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused/lobby-hibernation-independent-verification-local-v2.json`
- Verification SHA-256:
  `7c2ca8c673cd385721b692266f36dd256f70fe773d7f2d95d0cd09ea64cf020f`
- Status: `INDEPENDENT_FOCUSED_LOBBY_HIBERNATION_VERIFICATION_PASS`
- All **18/18** independent checks passed, including exact current source
  hashes, raw/embedded report equality, artifact hashes and scope, exact probe
  commands, dry-run output scope, and all non-claims.

The first capture remains immutable at `runs/local-v1`. Its runtime probes all
passed, including the same 3/3 selected hibernation tests, but the evidence
status correctly failed because Vitest reports two suite counters for this one
Worker-pool file and the first tool expected one. Only that evidence-schema
expectation was corrected before the fresh `local-v2`; `local-v1` was not
overwritten or independently verified.

## Reproduction commands

```text
node tools/evidence/capture-phase4-g3-lobby-hibernation-focused.mjs --output evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused/runs/local-v2
node tools/evidence/verify-phase4-g3-lobby-hibernation-focused.mjs --run evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused/runs/local-v2 --output evidence/2026-07-22/phase-4-g3-lobby-hibernation-focused/lobby-hibernation-independent-verification-local-v2.json
```

These are historical exact invocations, not authorization to overwrite either
immutable artifact.

## Explicit non-claims and remaining G3 work

- No external workerd-process restart with a real client, staging WSS,
  production Durable Object, or production deployment was exercised.
- Active-match checkpoint recovery is intentionally absent; active simulation
  remains awake and recreation of `active_uncheckpointed` authority fails
  closed.
- Real slow socket-buffer saturation and multi-client resource behavior remain
  unproved.
- Public account authentication, secrets/configuration, CORS/preflight,
  rollback, load/soak, CPU, memory, storage, bandwidth, and cost evidence remain
  open.
- Physical 120+ Hz review, visible product-flow integration, the final
  source-frozen expanded regression, and human G3 acceptance remain open.

Therefore this closes only the focused Worker-isolate lobby/reconnect
hibernation boundary. It does not accept G3.
