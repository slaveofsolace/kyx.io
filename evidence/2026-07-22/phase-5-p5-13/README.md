# P5.13 exact-profile active-match checkpoint and reconstitution

Captured: 2026-07-22T13:42:13.393Z

Scope is limited to the opt-in Worker profile
`p511-inkfall-foundry-revision-2-combat-v1`. Default rooms and the earlier
P5.8D/P5.9 combat profile retain the existing `active_uncheckpointed`
fail-closed behavior.

## Landed boundary

- `AuthoritativeRoom.exportActiveMatchCheckpoint()` exports one schema-v1,
  immutable checkpoint at a completed authority-tick boundary.
- `AuthoritativeRoom.restoreActiveMatchCheckpoint()` validates the entire
  checkpoint before mutating a pristine room. It restores lifecycle clocks,
  TDM scores/feed, movement and combat state, ammo/reload/cooldowns, life and
  respawn state, input queues/reorder timing, pose/RTT histories, active
  grenade projectiles, counters, and combat ordinals.
- The Durable Object stores one versioned `room_active_checkpoint_v1` row.
  The row is bound to room, match, exact profile, protocol, simulation
  identity, and Inkfall revision-2 map binding. The serialized envelope is
  checked with `fnv1a64-json-v1` before parsing.
- The Worker envelope additionally restores the reliable-event stream and
  next ordinal, per-player cumulative event acknowledgements, session
  generations, and hibernated socket ownership. Snapshot baselines are
  intentionally reset and both clients receive a new full snapshot.
- Missing, corrupt, schema-incompatible, profile-mismatched, simulation-
  mismatched, or map-mismatched state fails closed. No partial authority state
  is installed.

## Runtime proof

`tests/worker/inkfallRev2CombatProfile.test.ts` uses two real Worker WebSocket
clients. At eviction the checkpoint contains a dead player, an active impulse
grenade projectile, active TDM score/feed state, and appended reliable event
ordinals. Both hibernated clients receive a full snapshot at the exact stored
authority tick after reconstitution, and the reliable batch retains the final
`playerKilled` event id. Separate payload-hash and map-binding corruptions both
return `503 ROOM_UNAVAILABLE`.

See `runtime-proof.json`, `verification.json`, and `source-hashes.json` in this
directory for the frozen claims and verification matrix.

This is a P5.13 implementation/verification record only. It does not claim G4
or G5 approval.
