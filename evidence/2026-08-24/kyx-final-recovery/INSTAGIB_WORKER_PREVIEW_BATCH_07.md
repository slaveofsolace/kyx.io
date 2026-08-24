# Instagib Worker preview batch 07

Date: 2026-08-24
Parent commit: `22fe20efb6a7651a207efcaa3c992ba80abef965` (`feat:route-ffa-through-authority-client`)

## Implemented

- Promoted Instagib from a foundation-only identity to a fail-closed Worker preview runtime. It remains deliberately absent from the player-facing route until a separate client-negotiation batch passes browser acceptance.
- Added an exact authority weapon policy: `instagib_longshot_v1`, Longshot slot 3, and 100 damage for every resolved body region. Unsupported weapon policies, missing hitscan/match capabilities, and non-Longshot authority attacks fail closed.
- New players join with Longshot selected in both movement intent and the authoritative armory. Client input cannot switch away; respawn and trusted movement recovery preserve the locked slot.
- Direct non-Longshot combat-loadout changes are rejected by the authority room. Trusted Worker bot, takeover, persisted-loadout, and client-loadout application paths all pass through the same mode-owned slot override.
- Instagib uses one immutable score identity per player and the existing restart-safe FFA deathmatch lifecycle, including timed respawn, score-limit/time-limit result, and reliable combat events.
- Active Worker checkpoint envelopes advance to schema 2 and bind the exact persisted match mode. A schema-2 checkpoint cannot be relabeled between TDM, FFA, and Instagib even when the replacement mode id is otherwise valid.
- Schema-1 active checkpoints remain readable only for legacy default TDM. A schema-1 envelope cannot be interpreted as FFA or Instagib.

## Acceptance

- Focused authority catalog/armory: 2 files, 8 tests PASS.
- Focused Worker combat: 1 file, 6 tests PASS, including Instagib room creation, Relay population, two human clients, locked Longshot projection, active checkpoint persistence, Durable Object restart, and valid-mode relabel rejection.
- All five configured TypeScript checks: PASS.
- ESLint over source, Worker, Pages, tests, and tools: PASS.
- Main Vitest: 168 files, 1,107 tests PASS.
- Worker Vitest: 14 files, 72 tests PASS.
- Production Vite build: PASS.
- Worker Wrangler dry-run: PASS; 22 static files and both Durable Object bindings included.
- Development asset validation, asset audit, closed-world release-package verification, and release-provenance sentinel: PASS.
- G9 control audit: PASS; tracked probable-secret findings: 0; dependency audit vulnerabilities: 0.
- Release remains blocked by the existing project-license, distribution-mode, and accepted-runtime-character owner gates.

## Boundary

This batch is an authority/Worker preview, not a shipping-mode claim. It does not add Instagib to the player menu or gateway, implement shared offline Instagib practice, prove arena-specific genuine browser combat, complete spectator/rematch behavior, run a 30-minute soak, or grant Human Eye/Human Brain acceptance. No deployment, release, external asset acquisition, rights acceptance, or historical-worktree cleanup occurred.
