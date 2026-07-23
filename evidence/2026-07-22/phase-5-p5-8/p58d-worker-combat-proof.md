# P5.8D real Worker combat, impairment, resume, and replay parity

Date: 2026-07-22 (America/Chicago)  
Status: **PASS — P5.8 AUTOMATED SUITE COMPLETE; P5.9 AND G4 REMAIN OPEN**

## Outcome

An explicitly requested revision-3 room now runs the implemented combat
authority through the real Cloudflare Worker Durable Object and WebSocket seam.
The default room remains revision 2 and emits no combat extension, so the
accepted default transport identity does not drift.

| Room path | Ruleset revision | Ruleset hash | Combat extension |
|---|---:|---|---|
| Default create | 2 | `039ae95bed7ee716` | Omitted |
| Header `x-kyx-evidence-profile: p58d-rev3-combat-v1` | 3 | `d5f0418d1d927370` | Snapshot schema 1 |

The revision-3 identity is persisted with the room and rehydrates after Durable
Object eviction. Asking an already-persisted revision-2 room to become revision
3 fails closed.

## Real Worker/WebSocket proof

The isolate suite uses real WebSocket upgrades, joins, input batches,
acknowledgements, reliable event batches, socket close, secure resume, and full
snapshots. It proves:

- duplicate, intentionally missing, and reordered input sequences do not create
  duplicate combat consequences;
- exactly 10 accepted shots consume exactly 10 rounds, apply exactly 10 damage
  events, create one death, one team score, and one feed entry;
- one snapshot simultaneously contains an active reload, active Impulse Grenade
  projectile, dead player with respawn countdown, and active match;
- secure reconnect returns that complete state in a full snapshot; and
- reliable combat event IDs remain unique across the original and resumed
  sockets.

The four real-WSS delivery profiles — baseline, loss, reorder, and duplicate —
all normalize to this exact consequence:

```json
{
  "acceptedShotCount": 10,
  "magazineRounds": 40,
  "targetHealthPoints": 0,
  "targetDeathOrdinal": 1,
  "blueScore": 1,
  "feedSequence": 1,
  "eventCounts": {
    "shotAccepted": 10,
    "damageApplied": 10,
    "playerKilled": 1
  }
}
```

Canonical replay digest on every profile and every runtime surface:

`c614736551a1a503`

That digest is independently reproduced by the Node `AuthoritativeRoom`, the
Worker isolate over real WebSockets, and Chromium through the development
browser evidence route.

## Protocol and runtime changes

- Added a strictly validated optional combat snapshot extension. Existing
  revision-2 messages remain byte-shape compatible because the field is omitted
  by default.
- Added revision-3 authority-to-wire combat snapshots and reliable-event
  projection.
- Bounded long internal grenade identifiers into deterministic wire-safe IDs;
  internal authority IDs remain unchanged.
- Recorded server-observed acknowledgement RTT for revision-3 rewind hitscan.
- Added exact-origin CORS to create and proxied room HTTP responses with
  `Vary: Origin`; preflight is limited to known API routes, GET/POST, and the
  two required request headers. Forbidden origins, methods, headers, health
  preflights, and arbitrary deep room paths fail closed.

## Executed gates

| Gate | Result |
|---|---|
| Full Node Vitest | **69 files / 636 tests PASS** in 34.44s |
| Full Worker isolate suite | **7 files / 26 tests PASS** in 15.76s |
| Focused Node replay parity | **1/1 PASS** |
| Chromium development-browser replay parity | **1/1 PASS** in 7.6s |
| Application TypeScript | **PASS**, zero diagnostics |
| Worker TypeScript | **PASS**, zero diagnostics |
| Full ESLint | **PASS**, zero errors/warnings |
| Vite production build | **PASS**, 138 modules transformed |
| Wrangler bundle validation | **PASS**, 2606.42 KiB / 756.94 KiB gzip; dry-run only |

The Node suite emitted only the repository's existing Rapier initialization
deprecation advisory. Vite emitted its existing large-chunk advisory. Neither
gate emitted a failure.

The Worker suite must use its pinned `--maxWorkers=1 --no-isolate` command.
One diagnostic attempt that omitted those resource-safety flags timed out; the
pinned command completed cleanly in 15.76 seconds.

## Retained failure evidence

The following failed development attempts remain immutable under `failures/`:

- `p58d-worker-red-01.md` through `p58d-worker-red-06.md`;
- `p58d-cors-red-01.md`; and
- `p58d-node-parity-red-01.md`.

The most material discovered defect was a protocol ceiling violation: authority
grenade IDs containing a player UUID could exceed the 64-byte wire ID limit,
which closed the socket with code 1013. The final projection retains the full
authority ID internally and sends a stable bounded hash on the wire.

## Artifact hashes

| File | SHA-256 |
|---|---|
| `src/net/protocol.ts` | `7e2ab11e17135777b885997e87595767f34dcb58efc35d8d31ee87d343dbe729` |
| `src/net/schemas.ts` | `8e0974ab9e980120e74f4d8f99751b1de4adc0eddc28eb74419dc64bea8c5b19` |
| `src/net/index.ts` | `84f3205018be887d6a86e3cda972c9c1dcb7ece16c143bfaf88e8ab85abf95b5` |
| `src/net/combatConsequence.ts` | `9a744108265a4e19bb060772347d66b6dfae1a39afbac102209ff7e9b133e767` |
| `worker/combatRuntime.ts` | `13bce97d18b9b93e788640afee28359bbb36599a778c09a6e236266517211414` |
| `worker/room.ts` | `b378b535efe4bfea345394357d7573444c82ca87e044bf2a34bfb0e89636374a` |
| `worker/worker.ts` | `b9106a7fd59967f5aeb04d07eb135cb579d81361d3a86d37f4ccbb205cc094b9` |
| `tests/worker/combatRev3.test.ts` | `c795f3f7642a1f95f030670d6c99d4a4c8f9288690a0f148a1fa41e22b6bd301` |
| `tests/worker/cors.test.ts` | `5a28e89962a252a35aca35f887e15f9b4df8dd43598b18576221a1ea63908186` |
| `tests/unit/authority/combat/p58dReplayParity.test.ts` | `bb9be635fc93dc89ea02be62f0c7e84e08b6250b967cefdb44c0125b94b5b6aa` |
| `tests/browser/p58d-combat-replay-digest.spec.ts` | `759b56ccbe6060149edecce4f137347b24888fea032d02b912cdc7de9c72cb3c` |

## Exact remaining boundary

P5.8's automated deterministic and abuse rows are now represented in the
current green Node, Worker, and browser graphs, including the previously open
real-Worker and three-runtime parity seams.

P5.9 remains open. It requires two real isolated browser clients in one room to
visibly prove rifle fire/ammo/reload/hit/damage, death/score/feed/respawn,
Impulse Grenade collision/detonation/reconciled movement, hostile probes,
impairment profiles, exact identity, and aligned HUD/VFX/audio/animation, with
machine traces, screenshots, and video. The deterministic empty grenade
collision evidence port used here is not real-map collision acceptance.

No deployment was performed. This artifact does not accept G4 and does not
substitute its machine-readable browser parity route for P5.9 product-visible
evidence.
