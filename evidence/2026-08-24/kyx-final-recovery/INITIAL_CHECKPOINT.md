# KYX.IO final completion — initial recovery checkpoint

Captured: 2026-08-24 (America/Chicago)

## Recovery identity

- Authoritative task worktree: `C:\KYX.IO-Final-Game-Completion`
- Verified starting branch: `codex/kyx-final-game-completion-20260824`
- Verified starting commit: `2afbf58f264289b28d8d1dd3993d894edc50686d`
- Exact recovery ref: `origin/codex/kyx-final-game-completion-20260824`
- Recovery ref was resolved from the remote after push and matched the required commit exactly.
- Active integration branch: `codex/kyx-final-integration-20260824`
- Canonical read-only checkout: `D:\AI Projects\Projects\Games\evio\evio-repo`
- Canonical checkout remained at `agent/relay-playable-slice-wip@2afbf58f264289b28d8d1dd3993d894edc50686d`, tracked-clean.
- Remotes: `origin=https://github.com/slaveofsolace/kyx.io.git`; upstream fetch is `https://github.com/NotHereButAfk/Ev.io`; upstream push is disabled.

The task commit has 84 commits not present in the live `origin/agent/relay-playable-slice-wip` tip (`7b63cbb7`) and 105 commits not present in live `origin/main` (`4a97b707`). Live `origin/main` contains one commit not in the task commit; their merge base is `e380b716`. It was fetched without integration into the task-owned snapshot ref `refs/codex/snapshots/origin-main-20260824`.

## Protected ownership

- Canonical untracked inventory: exactly 621 files, 298,747,343 bytes.
- Ownership manifest: `canonical-untracked-ownership-manifest.json`.
- Manifest SHA-256: `9b29a6147af4bbda1604d69d6f8d84f06716c05f0faded7868c02d3474d136df`.
- Every canonical untracked entry is classified `protected-read-only`; none was copied, moved, renamed, deleted, deduplicated, or interpreted as task-owned.
- Repository/process/dependency capture: `repository-state.json` and `dependency-inventory.json`.
- The 41 historical worktrees and their dirty/untracked contents remain read-only evidence. No cleanup target is currently proven safe.

All six PID receipts found in the canonical checkout referred to stopped processes. No process was terminated. Unrelated Node and Chrome processes were treated as foreign-owned and left untouched. The tested ports were not listening at the checkpoint boundary.

Disk-space preflight reported 4,300,640,256 free bytes on C: and 103,880,675,328 free bytes on both D: and E:. After the exact dependency install and browser-toolchain acquisition, C: reported 3,378,302,976 free bytes.

## Historical reconciliation

The canonical, G7, G8, G9, Fable, armory, ability-parity, integration, and upstream-audit lines were inspected using ancestry, patch-id, tree, and reachability evidence. Most named heads are ancestors of the verified baseline or patch-equivalent to work already present. No historical branch was blindly cherry-picked.

Material retained for later file-level review:

- G7 Foundry heads `addacf2c` and `0193363b` contain unmatched map work on a divergent line.
- Integration re-audit commits `86870ee1`, `c8c64a61`, `cde288a9`, `d3358c1f`, `5498ea7c`, and `6a389d63` are divergent and not patch-equivalent.
- Several historical worktrees contain modified or untracked material even when their commit heads are reachable or patch-equivalent.
- Upstream remains reference-only because its root does not provide a compatible project license. No upstream source or asset was imported.

See `HISTORY_RECONCILIATION.md` for the named-head decision record.

## Source-frozen baseline at `2afbf58f`

| Gate | Result |
| --- | --- |
| Git whitespace check | Pending until checkpoint files are staged |
| App, Worker, Pages, and simulation typechecks | PASS (all four) |
| ESLint | PASS |
| Unit/contract/integration suite | PASS — 167 files, 1,096 tests |
| Worker suite | PASS — 14 files, 69 tests |
| Production build | PASS — large-chunk warnings retained |
| Release asset validation | PASS mechanically — zero admitted release assets/manifests |
| Provenance sentinel | PASS — zero public binary paths, zero active manifests, six quarantined entries |
| Release-package closure | PASS mechanically — no provenance-bearing release artifacts |
| G9 controls | PASS controls; release remains BLOCKED |
| Dependency audit | FAIL — eight high-severity advisories, zero critical |
| Browser matrix, installed Chrome | 61 passed, 16 intentionally skipped, 1 failed |
| Multiplayer matrix, installed Chrome | 3 passed, 1 failed; isolated retry of the failure passed |

G9 release blockers remain the unresolved project-license decision, acceptance of the G6 runtime character, and the source-vs-binary distribution decision. A green mechanical asset gate does not mean that release assets exist or have human acceptance.

The production build warning includes a roughly 3.2 MB preload-helper chunk (about 1.0 MB gzip) and a roughly 712 KB armory chunk. These are performance leads, not acceptance evidence.

The dependency audit reports high-severity findings through direct `@cloudflare/vitest-pool-workers@0.18.6` and `wrangler@4.112.0` dependencies and transitive `brace-expansion`, `miniflare`, `nanoid`, `postcss`, `sharp`, and `undici` packages. No automatic audit fix was applied.

## Reproducible baseline failures

1. `tests/browser/g7-ui-presentation.spec.ts:112` races an already queued live render against a test-injected HUD state. The test disables future animation-frame scheduling, but a frame already queued can overwrite `reloading` with `stable` before assertion. Full installed-Chrome result: one failure. Focused movement and long local-practice tests passed; the pause-flow case also passed three repeated focused runs.
2. `tests/multiplayer/original-arena-runtime.spec.ts:161` lost its room connection after the socket-stale interval only when run after the preceding multiplayer cases. It passed in isolation. The order-sensitive failure requires better diagnostic evidence before being classified as either a product defect or harness resource leak.
3. The Playwright-managed headless shell was unstable under software rendering. The source-matched rerun used installed Chrome through `KYX_PLAYWRIGHT_EXECUTABLE_PATH`; toolchain instability is not recorded as a product failure.

## First coherent implementation batch

1. Quiesce the already queued render before the G7 test injects its synthetic HUD state, then rerun the focused case, the full Relay/Switchyard/Crownpoint browser matrix, and repeat stress.
2. Add bounded diagnostics around the stale-boundary multiplayer case and reproduce the full-order failure. Fix source or harness ownership only after the failing layer is proven.
3. Review dependency upgrades as a separate lockfile-controlled security batch; do not use an unreviewed automatic audit rewrite.

## Explicit nonclaims

- Broad browser acceptance is not green at this checkpoint.
- Multiplayer longevity is not green at this checkpoint.
- Automated tests and builds do not establish player-eye, accessibility, genuine play-feel, 30-minute authority soak, adverse-network, performance, lower-tier hardware, mobile, or release acceptance.
- No external asset candidate was acquired for the product. The Playwright browser download is test tooling, not a game asset.
- No deployment, release, account action, rights acceptance, PR merge, canonical-branch update, or historical-worktree cleanup occurred.

This checkpoint is reboot-safe: the required source commit is preserved by the exact remote recovery ref, the active work is isolated on the task-owned integration branch, and the canonical untracked set is independently hash-addressed without claiming ownership.
