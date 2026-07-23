# Phase 5 P5.8D real Worker combat, impairment, and replay parity

Date: 2026-07-22 (America/Chicago)  
Status: **P5.8 AUTOMATED SUITE PASS; P5.9 AND G4 REMAIN OPEN**

## Scope

P5.8D closes the runtime seams left open by P5.8C:

1. explicit revision-3 combat in the actual Worker Durable Object;
2. full combat consequence impairment through real WebSockets;
3. secure reconnect with one composite combat snapshot; and
4. one pinned replay digest reproduced in Node, Worker isolate, and the
   development browser route.

The default Worker create path remains `revamped_classic@2` with hash
`039ae95bed7ee716`. Revision 3 is only selected by the exact evidence-profile
header and persists with that new room as `revamped_classic@3` hash
`d5f0418d1d927370`.

## Implementation

`src/net/protocol.ts` and `src/net/schemas.ts` add a strictly validated optional
combat snapshot. Revision-2 snapshots omit it. `worker/combatRuntime.ts`
contains the explicit profile marker, authority options, authority-to-wire
mapping, semantic reliable-event mapping, evidence spawn alignment, and bounded
wire ID projection. `worker/room.ts` persists and rehydrates the requested
profile, runs revision-3 combat, exposes its snapshot/events, and records
server-observed acknowledgement RTT for rewind. `worker/worker.ts` selects the
profile only on explicit create and applies exact-origin, bounded CORS to the
HTTP API surface.

`src/net/combatConsequence.ts` defines the fixed canonical consequence and
portable FNV-1a-64 digest used by all three runtime surfaces.

The adjacent `/online` create retry path briefly exposed an overly narrow
inferred literal type. The authorized one-token type annotation
`actionPath: string` preserves `${ONLINE_AUTHORITY_PATH}?mode=create` at runtime
and restores the application TypeScript graph.

## Proof

Baseline, loss, reorder, and duplicate real-WSS profiles all pin:

`c614736551a1a503`

The consequence is 10 accepted shots, 40 magazine rounds remaining, target at
0 health/death ordinal 1, blue score 1, feed sequence 1, with 10 shot events,
10 damage events, and one kill event. A secure resumed full snapshot contains
an active reload, active grenade projectile, dead target countdown, and active
match simultaneously.

## Executed verification

- Full Node Vitest: **69 files / 636 tests PASS**.
- Full Worker isolate suite: **7 files / 26 tests PASS** using the pinned
  single-worker/no-isolation command.
- Focused Node replay parity: **1/1 PASS**.
- Chromium development-browser replay parity: **1/1 PASS**.
- Application and Worker TypeScript: **PASS**, zero diagnostics.
- Full ESLint: **PASS**, zero errors/warnings.
- Vite production build: **PASS**.
- Wrangler `deploy --dry-run`: **PASS**; no deployment performed.

Machine-readable gate data and hashes are in
`evidence/2026-07-22/phase-5-p5-8/p58d-worker-combat-proof.json`; the human
proof summary is beside it as `p58d-worker-combat-proof.md`.

## Retained failures and boundaries

Eight P5.8D failures remain under the evidence `failures/` directory. They
record driver sequencing corrections, the wire ID ceiling defect, a CORS test
typo, and fail-closed authority option validation.

P5.9 remains the next combat gate. It must produce product-visible two-browser
gameplay traces, screenshots, and video on the real map, including visible and
audible presentation alignment. This slice does not deploy, accept G4, or claim
that its deterministic empty collision evidence port proves real-map grenade
collision.
