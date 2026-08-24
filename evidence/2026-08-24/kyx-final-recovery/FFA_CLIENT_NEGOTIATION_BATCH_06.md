# Free For All client negotiation batch 06

Date: 2026-08-24
Parent commit: `a2c110ccc9f5c1ae1bbbc707d7ba5df94e8ce0ae` (`feat:add-restart-safe-ffa-worker-preview`)

## Implemented

- Added one client-owned catalog for the currently routable Worker modes: Team Deathmatch and Free For All. Worker ids remain independently asserted in unit tests so client/server drift fails visibly.
- Added a strict `match` query parameter that is separate from the existing create/join route operation. Unknown, repeated, or non-canonical mode claims fail closed.
- Team Deathmatch remains the default canonical URL. FFA create, join, invite, retry, history replacement, reload/resume, and arena continuation retain `match=free_for_all`.
- The gateway sends `x-kyx-match-mode` on create and join verification, requires the successful authority response to echo the exact mode, and preserves real `Response.ok`/`Response.status` fields across its validation wrapper.
- The landing surface now exposes two collapsed, keyboard-operable match choices without changing the established Cutline shell.
- The session binding, diagnostics, body truth attributes, HUD, scoreboard, result surface, 2D fallback, and Three.js remote-player presentation consume the verified mode. FFA presents one local score against the highest rival score and never presents remote players as teammates.
- Local Relay Practice explicitly supplies the shared TDM presentation contract. This prevents an implicit mode while preserving the current practice boundary; a true FFA practice loop remains open.
- The browser proof creates a real Relay FFA room, verifies server mode echo, opens genuine WebSockets for two clients, checks active-phase HUD/scoreboard identity, preserves the mode through invite and reload/resume, and proves a TDM alias join is rejected.
- Browser-suite caller isolation models Cloudflare's edge-injected `CF-Connecting-IP` at the Playwright network boundary. It does not alter or bypass the Worker's production allocation limits.

## Acceptance

- All five configured TypeScript checks: PASS.
- ESLint over source, Worker, Pages, tests, and tools: PASS.
- Main Vitest: 168 files, 1,106 tests PASS.
- Worker Vitest: 14 files, 71 tests PASS.
- Focused client selection/gateway unit tests: 2 files, 27 tests PASS.
- Broad desktop/mobile-boundary browser suite: 64 tests PASS, 16 explicitly unsupported/mobile-only cases skipped.
- Genuine multiplayer Playwright: 5 tests PASS in one shared source-frozen run, including 2/4/8 clients, FFA mode rejection, Relay/Switchyard/Crownpoint, rotation, reconnect, and the 35-second stale-socket boundary.
- Production Vite build: PASS.
- Worker Wrangler dry-run bundle: PASS; 22 static files and both Durable Object bindings included.
- Development asset validation, asset audit, closed-world release-package verification, and release-provenance sentinel: PASS.
- G9 control audit: PASS; tracked probable-secret findings: 0; dependency audit vulnerabilities: 0.
- Release remains blocked by the existing project-license, distribution-mode, and accepted-runtime-character owner gates.
- The legacy Phase-1 truth verifier remains intentionally blocked by an empty `.env.production` authority origin. No production origin was invented because deployment is forbidden in this task.

## Boundary

This batch makes FFA player-routable and proves its genuine local multiplayer negotiation/reconnect path. It does not complete FFA human gameplay acceptance, offline FFA practice, spectator behavior, a 30-minute soak, adverse-network coverage, or the other required modes. Automated green status is not player-eye acceptance. No deployment, release, external asset acquisition, rights acceptance, or historical-worktree cleanup occurred.
