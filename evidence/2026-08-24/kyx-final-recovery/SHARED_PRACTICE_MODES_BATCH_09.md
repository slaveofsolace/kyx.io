# Shared Practice deathmatch modes batch 09

Date: 2026-08-24
Parent commit: `e54d342321a3ad68b29f1abb0b80129b144b10c5` (`feat:route-instagib-through-authority-client`)

## Implemented

- Made local Practice select the same canonical `team_deathmatch`, `free_for_all`, and `instagib` identifiers as online play. Query parsing is exact and fail-closed: unsupported raw mode values fall back to the default route, while programmatic construction rejects unsupported values.
- Bound the selected mode inside the browser-local `AuthoritativeRoom`. TDM retains two teams; FFA and Instagib assign one score identity per player and use individual-score rules.
- Enforced the Practice Instagib contract in authority code: Longshot slot 3 is the only seeded and accepted local slot and uses the 100-damage one-shot configuration. The visible weapon controls mirror that policy but are not treated as authority.
- Preserved the selected mode through the entry gate, active HUD, Three presentation, diagnostics, and rematch. Practice navigation exposes compact, explicit TDM, FFA, and Instagib choices.
- Projected individual-mode opponent score as the maximum authoritative opposing-player score. The HUD objective-label bound increased from 24 to 40 sanitized characters so `One shot · Individual score` is presented without truncation.
- Kept the online mode declaration type-bound to the canonical deathmatch authority identifier through a type-only import, avoiding a new runtime bundle dependency edge.

## Source-frozen acceptance

- All five configured TypeScript checks: PASS.
- ESLint over source, Worker, Pages, tests, and tools: PASS.
- Main Vitest: 168 files, 1,114 tests PASS.
- Worker Vitest: 14 files, 72 tests PASS.
- Corrected broad browser Playwright: 65 tests PASS and 17 intentional mobile-project skips in 3.4 minutes.
- Multiplayer Playwright: 6 tests PASS in 1.6 minutes, including source-matched 2/4/8 clients, FFA, Instagib, three-arena rotation, reconnect, and stale-boundary continuity.
- Production Vite build: PASS. The existing large-chunk advisory remains non-blocking evidence, not a performance acceptance claim.
- Worker Wrangler dry-run: PASS with 22 static files and both Durable Object bindings.
- Release-mode asset validation, release-provenance sentinel, and closed-world release-package verification: PASS; zero release-packaged provenance-bearing binary assets.
- Dependency audit: PASS, zero vulnerabilities.
- G9 control audit: PASS; 5,339 tracked paths scanned for probable secrets with zero findings. Release remains `BLOCKED` by project-license selection, accepted runtime character, and distribution-mode decisions.
- Codex Security compact diff scan `c31c24c5-d724-49fd-8e60-aceeb1b5055c`: COMPLETE with six attack surfaces reviewed, complete diff coverage, and zero findings. Exact working-tree digest: `codex-security-snapshot/v1:sha256:14767587db21e008aa9beeb9f275cb904041adfe4d1af08d079634c0a0fda008`.

## Browser correction record

The first broad browser run produced 64 passes, 17 intentional skips, and one failure because the shared HUD sanitizer clipped `One shot · Individual score` to `One shot · Individual sc`. The sanitizer remained active but its bound was increased to 40 characters, unit coverage was added, a focused five-test rerun passed, and the full corrected matrix then passed 65 tests with 17 intentional skips.

## Security conclusions

- Browser route and query input is untrusted but cannot select an undeclared match mode.
- Practice mode, teams, weapon policy, damage, score, lifecycle, and results are owned by the browser-local authority room rather than the UI or renderer.
- Online multiplayer remains Worker/Durable-Object authoritative; this batch does not weaken or substitute that boundary.
- Mode navigation uses internal constants and DOM construction. HUD strings remain sanitized and bounded.
- No secrets, external assets, persistence grants, credits, cosmetics, or entitlements were introduced.

## Boundary

This batch completes automated shared-Practice routing for TDM, FFA, and Instagib on Relay. It does not establish human gameplay or visual acceptance, shared Practice coverage on Switchyard or Crownpoint, an online spectator role, rematch consensus, objective/elimination/survival modes, the Battle Royale arena, persistent accounts/progression, D1, parties/social systems, the authenticated editor, adverse-network acceptance, performance acceptance, or the genuine 30-minute authority soak. No deployment, release, external asset acquisition, entitlement acceptance, rights admission, or historical-worktree cleanup occurred.
