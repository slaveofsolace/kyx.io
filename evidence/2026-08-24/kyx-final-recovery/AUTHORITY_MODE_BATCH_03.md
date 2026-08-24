# Authority mode batch 03

Date: 2026-08-24  
Parent commit: `ea00c2b` (`chore:harden-final-completion-toolchain`)

## Implemented

- Added one immutable Worker-authority mode catalog covering Team Deathmatch, Free For All, Instagib, Capture The Flag, Search and Destroy, Last Team Standing, Survival, Zombie Survival, and Battle Royale.
- Every definition declares server-owned outcomes, team/objective/respawn/loadout policy, bounded population, score or round limits, late-join behavior, and spectator policy.
- Added explicit implementation states:
  - `shipping_runtime`: Team Deathmatch only.
  - `authority_core`: Free For All.
  - `foundation_only`: every remaining mode.
- Runtime selectors fail closed: foundation-only modes cannot enter authority-core selection, and Free For All cannot enter a routable room yet.
- Extended the deterministic deathmatch match core with exact Free For All rules:
  - 20 Hz authority clock;
  - 40-tick warmup, 9,600-tick active phase, 200-tick postmatch;
  - 25-kill score limit;
  - one score identity per authority player;
  - shared-team aliasing rejected;
  - damage/death/score/feed remain derived only from accepted server combat events.
- Bound the existing Team Deathmatch rule identity to the new catalog without changing its wire values.
- Corrected the restored weapon-model browser test so strict TypeScript can check its browser-evaluated dynamic imports.

## Acceptance

- Four TypeScript project checks: PASS.
- ESLint: PASS.
- Focused mode/match tests: 2 files, 14 tests PASS.
- Main Vitest: 168 files, 1,102 tests PASS.
- Worker Vitest: 14 files, 69 tests PASS.
- Production build: PASS.
- Dependency audit: zero findings.
- Restored weapon model browser contract: 2/2 PASS after the TypeScript correction.

## Explicit boundary

Free For All is an accepted authority-core implementation, not a player-routable mode. It is intentionally rejected by `requireRoutableAuthorityMode` until room creation, team assignment, snapshots/HUD, practice parity, reconnect, spectator, rematch, and genuine multi-client acceptance are integrated. Instagib and all objective/elimination/survival modes remain foundation-only and are not completion claims.

