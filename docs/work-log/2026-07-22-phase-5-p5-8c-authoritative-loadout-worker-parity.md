# Phase 5 P5.8C authoritative loadout Worker path and isolate parity

Date: 2026-07-22 (America/Chicago)  
Status: **BOUNDED LOADOUT TRANSPORT SLICE PASS; P5.8, P5.9, AND G4 REMAIN OPEN**

## Scope and identity boundary

This slice replaces the unconditional `COMBAT_NOT_IMPLEMENTED` response for a
schema-valid `loadoutRequest` with a real authoritative Worker path. It does not
deploy, change Inkfall, touch character assets, or silently upgrade the live
Worker from its accepted `revamped_classic@2` transport identity.

That identity distinction matters. The live Worker currently selects the exact
revision-2 vertical slice, including damage slot 1 `vertical_grenade_v1`.
Revision 3's implemented G4 room fixture instead uses
`vertical_impulse_grenade_v1`. This slice proves the live request/response and
idempotency boundary for revision 2; it does not claim that revision-3 combat is
already running in the Worker.

## Implemented authority boundary

`src/authority/combat/loadoutRequest.ts` adds a portable, recursively frozen
authority evaluator that:

- derives the only accepted selection from the active validated ruleset;
- accepts selection only while the room lifecycle is `lobby`;
- rejects primary, secondary, melee, damage-slot 1, damage-slot 2, and utility
  mismatches with stable field-specific reasons;
- rejects every non-lobby lifecycle as `loadout_locked` before inspecting IDs;
- creates a request-ID-independent canonical payload fingerprint; and
- hashes a canonical decision trace with portable FNV-1a-64.

The existing protocol schema remains the first boundary. Unknown outcome facts,
duplicate damage IDs, malformed IDs, wrong tuple length, oversized data, and
unknown fields fail before the authority evaluator. The existing
`LoadoutRequestMessage` protocol type is now re-exported by `src/net/index.ts`;
the message schema and protocol version are unchanged.

## Worker request, state, and idempotency path

`worker/room.ts` now requires a joined current session and then evaluates the
request against the room's loaded ruleset and lifecycle.

Accepted requests:

1. atomically persist the authoritative selection in
   `room_player_loadouts_v1`;
2. persist request ID, payload fingerprint, and result in the bounded
   512-entry `room_loadout_requests_v1` ledger;
3. append exactly one reliable `loadoutAccepted` semantic event;
4. return a correlated `LOADOUT_ACCEPTED` server notice; and
5. increment explicit loadout transport metrics.

Rejected requests return `LOADOUT_REJECTED` with a stable detail and mutate no
selected-loadout row. Replaying the same request ID and payload returns the same
notice/error without appending another event. Reusing an ID with a different
payload returns `LOADOUT_REQUEST_ID_CONFLICT`. Final player expiry removes both
the selected row and that player's ledger entries.

The obsolete `COMBAT_NOT_IMPLEMENTED` branch no longer exists.

## Node and Worker-isolate parity pin

The same eight-row decision trace runs in the normal Node test graph and inside
the Cloudflare Worker isolate. Both pin:

`810083ecca297f5e`

The trace includes exact acceptance; primary, secondary, melee, both damage
slots, and utility rejection; and the non-lobby state lock.

This is selection-decision parity for the live revision-2 transport ruleset. It
is not the still-required full revision-3 combat replay hash across Node,
Worker, and browser.

## Retained failures

Both failed P5.8C development attempts are retained under
`evidence/2026-07-22/phase-5-p5-8/failures/`:

- `p58c-node-attempt-1.json` records the revision-2/revision-3 ID distinction
  and initial hash calibration;
- `p58c-typecheck-attempt-1.json` records the missing public type export,
  frozen tuple inference, and complete lifecycle-union corrections.

## Executed verification

- Focused Node evaluator/schema suite: **4/4 PASS**.
- Focused Worker socket/state/idempotency/parity suite: **3/3 PASS**.
- Full Worker isolate regression suite: **20/20 PASS** across 5 files.
- Selected combat/protocol/reliability/presentation matrix: **150/150 PASS**
  across 17 files.
- Current full shared-tree Vitest: **622/622 PASS** across 65 files.
- Application TypeScript graph: **PASS, zero diagnostics**.
- Worker TypeScript graph: **PASS, zero diagnostics**.
- Focused ESLint for all P5.8C source/test files: **PASS, zero errors and zero
  warnings**.
- Wrangler Worker bundle validation: **PASS** using `deploy --dry-run`; no
  deployment was performed.

Artifact hashes:

| File | SHA-256 |
|---|---|
| `src/authority/combat/loadoutRequest.ts` | `d2cfed65ec656b3b6f0441ee7bcf6d1fa2d890890a99ec7d1d04615629488c40` |
| `src/authority/combat/index.ts` | `0ad3c90277dfb54720b0eb5b51e666b1f2438e2f8f56c4a511c64e0165c75b61` |
| `src/net/index.ts` | `15b46867a23766f6e6c7c8e9b8b198c32dac1574dc958e1e89c74d4c6aa7d9fb` |
| `worker/room.ts` | `1a9eaff786ea4f79611c41e1f31c51666ba129838d4a18d98051a4a767f1bb30` |
| `tests/unit/authority/combat/loadoutRequest.test.ts` | `3c174f67d3da0acd1fbdaefa39aca37ef3d0e2af84357f2353415dbef31a0844` |
| `tests/worker/loadoutRequest.test.ts` | `c293e1108b6456b3fe7410cee05a91e66aa39659a8c6370e5ecff2627d1aaf41` |

Preserved P5.8B/P5.8A and P5.7 seals:

| File | Preserved SHA-256 |
|---|---|
| `tests/unit/authority/combat/p58ConsequenceReconnect.test.ts` | `bb6d2b6a80abb22167ce089b403595fb8694cd36c7896b8224bb95ab23ef0ba7` |
| `tests/unit/authority/combat/p58AbuseBoundaries.test.ts` | `e99b3004b46f5adb520356fc713b1fedf00ae9865200f12686ebb9d7a277043a` |
| `src/client/combat/presentationAdapter.ts` | `b32eef1afc9e3dcd2a62413d6677f428e18b280b29a935f7c78361d7291b17e1` |
| `tests/unit/client/combat/presentationAdapter.test.ts` | `214887d86ee7d96ff890f3383e914f665dab1e0c454366e25dd28fc2b40f9a5a` |
| `src/client/combat/index.ts` | `6465fce04a7676462508d3914b1a6f6181e9ca7b08e872fd55806ccfe8e64aa5` |
| `src/client/index.ts` | `9681e1bc8c4e1281a1edb9ab299388544af1bb937ec2a385ed3d5d4d828863fb` |

## Exact remaining boundary

P5.8 remains open for:

1. revision-3 G4 combat integration in the actual Worker, including loadout
   state reflected in live weapon/ability snapshots rather than only the
   revision-2 transport selection;
2. the full P5.8 combat replay hash matching Node, Worker isolate, and the
   development browser route;
3. full damage/effect/death/score/feed/cooldown consequence impairment through
   the actual Worker/WebSocket transport, not only the deterministic room
   harness; and
4. retained browser evidence for those runtime rows.

P5.9 remains wholly open: two real isolated browsers must visibly prove rifle,
reload, hit/damage, death/score/feed/respawn, grenade collision/detonation and
reconciled impulse, hostile probes, impairment profiles, exact ruleset identity,
and aligned HUD/VFX/audio/animation markers with traces, screenshots, and video.

Therefore P5.8C closes the real revision-2 Worker loadout request seam and its
Node/Worker decision parity only. It does not pass P5.8, P5.9, or G4.
