# P5.14 exact-profile real-client population proof

Captured: 2026-07-22T15:12:51.684Z

Scope is limited to the opt-in Worker profile
`p511-inkfall-foundry-revision-2-combat-v1` on `inkfall_foundry@2`.
P5.14 adds executable population evidence only; it does not change the Worker,
authority simulation, protocol, map identity, default profile, or P5.8D profile.

## Executable proof

`tests/worker/inkfallPopulation.test.ts` opens actual Cloudflare Worker WebSocket
upgrades for every participant. No participant or transport is mocked.

- Four clients prove unique locked spawns, accepted movement and authoritative
  reconciliation, the 20 Hz protocol contract plus a measured tick window,
  bounded ping/pong latency and server-recorded RTT history, real Inkfall
  collision/occlusion queries, one authoritative death/score/feed outcome,
  reliable delivery to all four clients, and disconnect/resume continuity with
  the same player id and a rotated resume token.
- Eight clients prove all eight locked spawns, a 4-blue/4-red team split,
  accepted movement and real query diagnostics, RTT history for every player,
  authoritative death/score/reliable delivery to all eight clients, a bound
  `active_checkpointed` row, and full-snapshot recovery for all eight
  hibernated sockets at the exact persisted authority tick.
- A populated-room negative scenario rejects the P5.8D profile alias with
  `409 ROOM_PROFILE_MISMATCH`, rejects an unknown resume identity, and returns
  `503 ROOM_UNAVAILABLE` after persisted map identity tampering.

See `population-proof.json`, `verification.json`, and `source-hashes.json` for
the frozen claim set and verification matrix.

This is an implementation/verification record. It does not claim G4, G5,
broad playtest acceptance, or human visual approval.
