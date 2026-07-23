# G4 authoritative presentation wire gap — 2026-07-22

Status: **OPEN — implementation in progress**

The existing pure combat presentation adapter is not instantiated by the product
route. More importantly, its internal authority input shape is richer than the
current `/online` wire projection:

- The product wire exposes compact `CombatSnapshotV1` state and camel-case
  reliable events.
- Shield damage amount is lost before it reaches the product client.
- Teleport is collapsed into generic ability/cooldown events, so the client
  cannot classify a confirmed teleport without inference.

A UI-only adapter instantiation or ID-based guess would not satisfy G4. The
approved implementation direction is an explicit, validated, backward-safe
wire projection carrying authoritative presentation semantics from the Worker
through the evidence client into a focused product presentation bridge.

Required behavior:

1. Preserve explicit confirmed body, shield, kill, and teleport identity and
   authoritative values end-to-end.
2. Reject or suppress malformed/unknown records; never relabel ambiguous events.
3. Preserve reconnect hydration and bounded deduplication.
4. Consume confirmed intents as concrete, visible HUD/audio/VFX behavior in the
   actual online route.
5. Add deterministic unit/Worker coverage and rendered product evidence.
6. Keep broad G4 open until live authoritative combat, abuse/loss/reorder, and
   product feedback evidence meet the governing gate.

P5.15 browser population capture is intentionally waiting for this route/schema
surface to stabilize before freezing final evidence.

