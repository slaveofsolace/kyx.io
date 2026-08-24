# Instagib client negotiation batch 08

Date: 2026-08-24
Parent commit: `a6d5cd8776cb65c59475d197949ff29c2991e99f` (`feat:add-restart-safe-instagib-worker-preview`)

## Implemented

- Added `instagib` to the exact client match-mode vocabulary and the online mode picker. Create, invite, join, continuation, and reconnect URLs preserve the canonical mode id.
- Bound successful create/join to the Worker's exact echoed match mode. A room returning `free_for_all` for an Instagib request is rejected instead of being treated as a compatible individual-score alias.
- Routed Instagib sessions through the individual-score HUD, scoreboard, opponent presentation, and remote-avatar hostility contract without changing authority-owned teams, score, hits, damage, or lifecycle.
- Locked the visible/input weapon rail to Longshot slot 3. Other weapon buttons are disabled and keyboard attempts to select another slot do not change the outgoing selected slot. The prior Worker batch remains the enforcement boundary; the UI is not treated as authority.
- Added source tests for exact selection/gateway negotiation and a genuine two-client browser test covering mode echo, active lifecycle, HUD binding, locked Longshot, invite preservation, reconnect, and mismatched-mode rejection.

## Source-frozen acceptance

- All five configured TypeScript checks: PASS.
- ESLint over source, Worker, Pages, tests, and tools: PASS.
- Main Vitest: 168 files, 1,109 tests PASS.
- Worker Vitest: 14 files, 72 tests PASS.
- Multiplayer Playwright: 6 tests PASS in 1.6 minutes, including source-matched 2/4/8 clients, FFA, Instagib, three-arena rotation, reconnect, and stale-boundary continuity.
- Broad browser Playwright: 64 tests PASS and 16 mobile-project skips in 3.4 minutes. The isolated G7 pass initially missed one synthetic Enter activation; an immediate clean rerun passed 4/4, and the same case then passed inside the full browser suite.
- Production Vite build: PASS. The existing large-chunk advisory remains non-blocking evidence, not a performance acceptance claim.
- Worker Wrangler dry-run: PASS with 22 static files and both Durable Object bindings.
- Release-mode asset validation, release-provenance sentinel, and closed-world release-package verification: PASS; zero release-packaged provenance-bearing binary assets.
- Dependency audit: PASS, zero vulnerabilities.
- G9 control audit: PASS; 5,338 tracked paths scanned for probable secrets with zero findings. Release remains `BLOCKED` by project-license selection, accepted runtime character, and distribution-mode decisions.
- Codex Security compact diff scan `1ed835ed-f21b-4462-9830-e08d1877a4a9`: COMPLETE with three runtime surfaces reviewed, complete diff coverage, and zero findings. Exact working-tree digest: `codex-security-snapshot/v1:sha256:226479f2b5c8c72e2db55ac418891ad70998ad1014a5463b40c29319ef045553`.

## Security conclusions

- The query-string mode is untrusted, but it is restricted to the closed client enum and is sent to the Worker for exact create/join verification.
- `matchModeBoundFetch` rejects a successful authority response whose mode differs from the requested mode before the route receives a room proof.
- Longshot-only client controls are presentation/input hardening. The authoritative room still owns the Instagib slot, damage policy, score identity, checkpoint mode binding, and rejection behavior.
- The Three.js change only maps all individual-mode peers to hostile presentation; it cannot author teams, hits, damage, or score.

## Boundary

This batch makes online Instagib player-routable and browser-verified; it does not complete shared offline Instagib practice, human gameplay/visual acceptance, spectators, rematch consensus, objective modes, the Battle Royale arena, persistent accounts/progression, D1, parties/social systems, the authenticated editor, adverse-network acceptance, or the genuine 30-minute soak. No deployment, release, external asset acquisition, entitlement acceptance, rights admission, or historical-worktree cleanup occurred.
