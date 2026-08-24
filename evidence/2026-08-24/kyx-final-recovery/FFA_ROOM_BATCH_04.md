# Free For All room batch 04

Date: 2026-08-24  
Parent commit: `65c7c49` (`feat:add-fail-closed-authority-mode-core`)

## Implemented

- Authoritative rooms may now be constructed by a trusted host with an exact validated deathmatch rules object.
- Team Deathmatch remains the default and retains the prior rules, durations, capability identifier, snapshots, and Worker behavior.
- Free For All uses the exact 25-kill authority-core rules and a host-only player-to-score-identity resolver.
- A player cannot submit or inherit an aliased team identity in FFA; registration fails unless the score identity equals the authority player id.
- Room combat derives FFA damage, death, individual score, player statistics, and kill feed from accepted server events.
- Active-match checkpoints validate the selected rules instead of assuming TDM, and FFA restores the exact tick, score, feed, players, and pending-event state.
- Corrupt or mismatched rules, durations, capability fields, team identities, score fields, and checkpoint contents remain fail-closed.

## Acceptance

- Focused room plus active-checkpoint tests: 2 files, 10 tests PASS.
- FFA room integration test includes positive scoring, client-team rejection, and byte-for-byte restart proof.
- Four TypeScript project checks: PASS.
- ESLint: PASS.
- Main Vitest: 168 files, 1,103 tests PASS.
- Worker Vitest: 14 files, 69 tests PASS.
- Production build: PASS.

## Boundary

This batch does not expose an FFA room-creation header, menu selection, HUD result vocabulary, practice route, or multiplayer browser test. The public Worker therefore remains Team Deathmatch-only and FFA remains `authority_core`, not `shipping_runtime`.
