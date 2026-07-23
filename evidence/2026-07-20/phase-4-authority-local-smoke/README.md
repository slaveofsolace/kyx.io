# Phase 4 protocol-v2 authority local smoke

- Local implementation status: **PASS**
- G3 authoritative two-browser gate: **NOT PASSED**
- Runtime: local workerd through Wrangler dev
- Room: `KYX-PC4N5C`
- Deployment: none performed or authorized

## What this run proved

Two isolated browser contexts joined one protocol-v2 room with the same match and immutable ruleset hash `039ae95bed7ee716`. The room issued two 43-character opaque resume credentials, rotated the credential on resume, preserved the player and match identity, and resumed from processed input sequence `0`.

The authority acknowledged sequences `0` and `1`. Browser B observed browser A move from `[-1500, 0, -2000]` to `[-1500, 0, -1850]` mm, then continue after resume from `[-1500, 0, -1250]` to `[-1500, 0, -800]` mm. A forged `SetPosition` failed with `PROTOCOL_FORBIDDEN_COMMAND`; replaying the old resume token failed with `RESUME_REJECTED`; and presenting the current token while its session was live failed with `DUPLICATE_SESSION`.

At the captured warmup metrics point the room returned HTTP 200 at authority tick 20 with two players, two connected players, two accepted inputs, queue depth 1, zero listed authority-queue rejections, and zero missed ticks. The forged-command rejection occurs at the protocol boundary and therefore does not contradict the zero authority-queue rejection counter.

The exact structured observations are in `live-smoke.json`. The same-session verification summary is in `verification.json`; it records green application/Worker/simulation typechecks, full lint, 86 protocol tests, 17 client-netcode tests, 20 authority/security tests, 282 unit tests, 66 contract tests, four Worker-isolate tests, build, Wrangler dry-run, diff integrity, and two matching Phase 3 movement hashes.

## Gate boundary

This is a sealed local smoke record, not a G3 decision. It does not include the latency/jitter/loss/duplication/reorder matrix, full visible-UI wiring, delta snapshot baselines, staging/WSS proof, raw command logs, browser video/screenshots, checkpoint rehydration, or demonstrated lobby hibernation. The current Worker emits full snapshots only, fails closed when a dirty active room is recreated without a checkpoint, and keeps lobby rooms awake with its maintenance timer. Those gaps remain Phase 4 work.
