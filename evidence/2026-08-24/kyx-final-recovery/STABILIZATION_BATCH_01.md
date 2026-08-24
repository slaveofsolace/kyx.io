# Stabilization batch 01 — browser HUD isolation and authority clock recovery

Base commit: `7760d3643e66204d966440f79b6052b266af2c35`

## Fixed contracts

### G7 synthetic HUD isolation

The G7 presentation test disabled future `requestAnimationFrame` calls and then injected a synthetic reloading HUD state. A frame already queued by the live practice loop could still render once and overwrite that synthetic state with `stable`. The test now waits for one live frame, disables future scheduling, drains the one successor frame, and only then injects its isolated HUD state. Runtime rendering behavior is unchanged.

Verification:

- Focused installed-Chrome stress: 10/10 passed.
- Full installed-Chrome browser suite: 62 passed, 16 intentionally skipped, 0 failed.

### Authority/client clock recovery

The full-order multiplayer suite reproduced a fatal client failure after sequence 462 was rejected as `client_tick_too_far_ahead`. The local Worker was saturated by the preceding genuine 2/4/8-client and arena cases, so its bounded scheduler correctly dropped elapsed authority ticks while the browser input clock continued at wall cadence. The server's anti-future bound behaved correctly; the client incorrectly classified the clock-resynchronization rejection as an unexpected fatal authority error.

The client now recognizes only the exact, already-sent `INPUT_REJECTED` category `client_tick_too_far_ahead` as recoverable. It:

1. keeps the server rejection and anti-tamper boundary intact;
2. neutralizes held input;
3. discards speculative prediction;
4. rebases the client tick to the last observed authority tick;
5. emits no further input until a fresh authoritative snapshot rebuilds prediction; and
6. preserves the monotonic command-sequence cursor.

Malformed, future-sequence, queue-full, and other out-of-stream authority errors remain fail-closed.

Verification:

- Focused authority evidence tests: 17/17 passed, including new overload recovery coverage.
- Full multiplayer invocation: 4/4 passed.
- First pass of a same-process `--repeat-each=2` stress invocation: 4/4 passed again.
- The second pass was denied at room creation with HTTP 429 for all four cases because the same temporary Durable Object allocation guard intentionally retained its rate-limit state across repetitions. This is expected abuse-boundary behavior and is not counted as a gameplay regression or as another green invocation.

## Batch-wide gates

| Gate | Result |
| --- | --- |
| Git whitespace check | PASS |
| App, Worker, Pages, and simulation typechecks | PASS |
| ESLint | PASS |
| Unit/contract/integration suite | PASS — 167 files, 1,097 tests |
| Worker suite | PASS — 14 files, 69 tests |
| Production build | PASS — existing large-chunk warning retained |
| Installed-Chrome browser matrix | PASS — 62 passed, 16 intentional skips |
| Genuine multiplayer matrix | PASS — 4 passed |
| Release asset validation | PASS mechanically — zero admitted manifests/assets |
| Provenance sentinel | PASS |
| Release package closure | PASS |
| G9 controls | PASS controls; release BLOCKED by the three prior owner gates |

## Nonclaims

- The same-process repeat's HTTP 429 results prove the allocation guard remained active; they do not prove a second independent fresh-state multiplayer run.
- This batch does not establish 30-minute authority soak, adverse-network, performance, accessibility, controller, mobile, or human play acceptance.
- No outside product asset, dependency update, deployment, release, PR merge, or historical-worktree cleanup occurred.
