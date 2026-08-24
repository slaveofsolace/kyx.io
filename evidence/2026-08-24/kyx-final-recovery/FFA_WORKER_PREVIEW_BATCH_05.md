# Free For All Worker preview batch 05

Date: 2026-08-24
Parent commit: `ff261ea994181f6243c8a82baa4f327f380394c2` (`feat:integrate-restart-safe-ffa-rooms`)

## Implemented

- Added a public `x-kyx-match-mode` room-creation contract and a separate stripped internal Durable Object header.
- The public boundary accepts only Worker-backed mode ids. Unknown client claims and foundation-only modes fail with `MATCH_MODE_UNSUPPORTED` before allocation.
- Team Deathmatch remains the default. Free For All is classified as `worker_preview_runtime`; the existing player route and menu continue to expose only the shipping TDM runtime.
- FFA creation requires a persistent authority-map profile. Flat-run/development combat profiles fail with `MATCH_MODE_REQUIRES_PERSISTENT_MAP_PROFILE`, preventing an active room that cannot survive restart.
- Durable Objects persist the selected mode in versioned SQLite table `room_match_mode_v1`. Older rooms with no mode row backfill exactly to TDM; invalid rows and mode-without-runtime states fail closed.
- Trusted Worker combat options wrap the existing map collision, weapons, abilities, and match lifecycle while replacing the team resolver with one immutable score identity per player and the exact 25-kill FFA rules.
- Room responses and protected metrics disclose the persisted mode. Conflicting recreation requests fail with `ROOM_MATCH_MODE_MISMATCH` and HTTP 409.
- Client attempts to send the internal room-mode header are stripped at the public Worker boundary.

## Acceptance

- Focused authority catalog: 1 file, 3 tests PASS.
- Focused Worker FFA/CORS: 2 files, 9 tests PASS.
- Full Worker Vitest: 14 files, 71 tests PASS.
- FFA Worker acceptance uses two genuine WebSocket clients on Relay, enters the active phase, proves player-owned score identities, persists an active checkpoint, evicts the Durable Object, restores the hibernated sockets, and rejects a TDM alias request.
- Legacy migration deletes the new mode row, rehydrates it as TDM, then proves a tampered mode row makes the room unavailable.
- All configured TypeScript checks: PASS.
- ESLint: PASS.
- Main Vitest: 168 files, 1,103 tests PASS.
- Production build, Worker dry-run package, development asset validation, release-package closure, and release-provenance sentinel: PASS.
- G9 control audit: PASS; probable tracked-secret findings: 0; dependency audit vulnerabilities: 0.

## Boundary

This batch does not add a player menu, gateway selection, practice route, explicit mode field to the combat snapshot, browser multiplayer case, Human Eye pass, or shipping acceptance. FFA is therefore a restart-safe Worker preview runtime, not a player-routable or release-ready mode. No deployment occurred.
