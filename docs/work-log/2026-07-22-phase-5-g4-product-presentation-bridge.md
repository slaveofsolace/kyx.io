# Phase 5 G4 product presentation bridge

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED PRODUCT PRESENTATION BRIDGE PASS; BROAD G4 OPEN**

## Verdict

The existing pure P5.7 combat presentation adapter is now connected to the real
`/online` product route and to concrete visible HUD, VFX, caption, and WebAudio
consumers. The Worker projects authoritative damage and teleport outcomes into
an optional, versioned presentation payload on the existing reliable-event
envelope. The client validates the wire projection, pins the full runtime
identity, hydrates only from full snapshots, suppresses stale/duplicate replay,
and fails closed on malformed or contradictory payloads.

The bounded implementation and runtime evidence pass. Broad G4 remains open.

## Compatible wire extension

The legacy reliable-event envelope retains its required seven fields and stream
version. A new optional `presentation` field carries a strict schema-version-1
tagged union:

- `damage_applied` with event identity, tick, participants, health/shield
  deltas, and authoritative post-damage values;
- `teleport_resource_confirmed` with exact from/to positions, resource outcome,
  cooldown, recovery, and combat-state policy;
- `teleport_resource_rejected` with a reason and an explicit assertion that
  rejected activation consumed no cooldown.

Events without this field remain valid. Unknown fields, unknown kinds, wrong
schema versions, mismatched ticks, invalid base-kind mappings, projection
mismatches, and contradictory rejection data fail closed. The Worker is the
only author of the nested projection.

## Product integration

The `/online` route now:

- creates the adapter after the first complete combat snapshot;
- hydrates from each new full snapshot while pinning all thirteen runtime
  identity fields and the reliable-event baseline;
- feeds each presentation-bearing transport event once, keyed by transport ID;
- exposes stable presentation diagnostics through
  `window.__KYX_ONLINE_PREVIEW__.getSnapshot().presentation`;
- renders visible confirmed body, shield, kill, teleport, and rejected-teleport
  semantics with non-audio text/caption fallback;
- emits short WebAudio cues for non-snapshot outcomes;
- supports reduced-motion VFX behavior;
- exposes a real `T` / `online-teleport` control;
- immediately resets VFX to inactive and audio metadata to `not_played` on full
  snapshot hydration, so reconnect cannot visually inherit a celebratory cue.

The route also remembers processed transport IDs. The adapter independently
remembers authoritative semantic IDs, so transport re-exposure is cheap while
duplicate/conflicting semantic events remain protected at the contract layer.

## Deterministic contract evidence

New focused coverage proves:

- valid body, shield, kill, confirmed teleport, and rejected teleport mapping;
- snapshot hydration and reliable baseline behavior;
- duplicate suppression, stale-event suppression, conflict rejection, and
  identity mismatch rejection;
- unknown/malformed nested payload rejection;
- exact base-envelope/nested-projection consistency;
- Worker projection of body/kill and confirmed/rejected teleport outcomes.

The final shared-tree regression state is:

- full default Vitest: **86 files / 711 tests PASS**;
- full Worker Vitest: **10 files / 36 tests PASS**;
- application and Worker TypeScript: **PASS**;
- full ESLint graph: **PASS**;
- Vite production build: **PASS**;
- Wrangler isolated deploy dry-run: **PASS**, with no deployment.

The current full-suite counts include accepted work from other active lanes and
are supporting regression evidence, not exclusive G4-bridge artifacts.

## Real browser evidence

The final capture launched two isolated contexts in system Chrome
`150.0.7871.129` against a real local Vite application and real local
Worker/Durable Object room.

It proved:

- body hit: confirmed count advanced and the product rendered
  `BODY HIT · CONFIRMED`, active VFX, and a successful audio attempt;
- lethal hit: the shooter rendered `ELIMINATION · CONFIRMED` while the victim
  authoritative snapshot was `dead` at `0 HP`;
- teleport: the real control moved `(0,0,0)` to `(0,0,9000)`, with one explicit
  `teleport_resource_confirmed` event and confirmed HUD/VFX/audio;
- reconnect: hydration advanced from one to two, confirmed count stayed at
  eleven, duplicate count stayed at zero, audio-attempt count did not advance,
  HUD audio was `not_played`, and VFX was inactive with cue `snapshot`;
- both browser contexts had zero console, page, and request failures.

Four raw full-page captures and four accepted 1440x1100 readable boards are in:

`evidence/2026-07-22/phase-5-g4-product-presentation-bridge/runtime-v1/`

The independent evidence verifier checks the runtime facts, exact reconnect
non-replay conditions, browser errors, every PNG signature/size, and exact board
dimensions. `SHA256SUMS.txt` seals the scoped implementation, tests, work log,
and evidence package.

The first final recapture sampled the victim immediately after the shooter's
kill cue and correctly failed its new dead-life assertion before the victim's
next snapshot arrived. The harness was corrected to wait for the victim's own
authoritative `dead` snapshot. No product behavior was changed for that harness
timing correction. The final recapture passed all assertions.

## Explicit limitations and remaining work

- Broad G4 is still open. This is not a release/readiness, G5, or G8 claim.
- The exact revision-3 combat profile has `shieldPoints = 0`. A live shield hit
  cannot occur in the accepted room, so shield mapping is deterministic fixture
  evidence only. No synthetic live shield outcome was injected.
- Malformed/unknown payload rejection, stale/duplicate suppression, identity
  mismatch, and rejected teleport are deterministic test evidence rather than
  browser screenshots.
- Chrome recorded WebAudio attempts as played; no human audibility/mix review
  is claimed.
- This diagnostic `/online` surface is not final character art, final map art,
  matchmaking, progression, or release polish.
- The separately observed Press Hall traversal snag and population/ACK evidence
  belong to the P5.15/G5 lane. This work log makes no claim about them and made
  no G5 collision repair.

Therefore the product presentation bridge is closed only as a bounded G4
subcontract. Exact-profile shield constraints and all broader G4 acceptance
requirements remain explicit and open.
