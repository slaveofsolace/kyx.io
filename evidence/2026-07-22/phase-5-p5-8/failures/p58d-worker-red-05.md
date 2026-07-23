# P5.8D Worker red run 05

- Command: focused `combatRev3.test.ts -t "applies duplicate"`
- Result: **failed after the exact death consequence**
- The authority continued normally (`timerActive: true`, tick advanced past 120) with no tick failure and no rate-limit or slow-consumer eviction.
- The first socket closed `1013 Backpressure` when the first projectile-bearing combat snapshot was encoded.
- Root cause: authoritative grenade projectile/event identifiers include the player UUID and can exceed the protocol-v2 64-byte ID ceiling. The authority ID is valid internally, but it is not directly wire-safe.
- This red run is retained and does not support a composite reconnect pass claim.

Correction: use one deterministic bounded wire-ID projection consistently for grenade snapshot and reliable-event subjects.
