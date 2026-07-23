# Phase 5 P5.7 predicted/authority combat presentation adapter

Date: 2026-07-22 (America/Chicago)  
Status: **CORRECTED BOUNDED CLIENT CONTRACT PASS; REAL RENDER/AUDIO/VFX, WIRE, TWO-BROWSER PROOF, AND G4 OPEN**

## Verdict

P5.7 now has one opt-in, immutable, client-owned presentation adapter. It is
initialized from an `AuthoritativeRoom` full snapshot and then consumes atomic
room tick results. The implementation has no import from `src/authority`, does
not call an authority reducer, and cannot author damage, ammo, cooldown, life,
score, timer, feed, projectile, or teleport outcomes.

The marker contract is exactly:

`kyx.combat.presentation.markers.v1`

The existing application path does not instantiate this adapter. G0-G2 and the
truthful Offline Practice default therefore remain unchanged.

## Prediction and reconciliation contract

Only three safe audiovisual actions may be predicted:

- Auto Rifle fire;
- Impulse Grenade throw;
- teleport.

A prediction emits animation/audio/VFX marker intent only. It does not decrement
ammo, consume cooldown, move a player, create a projectile, apply a hit, change
life, or alter match state. Every prediction owns a stable client-command ID,
command sequence, client tick, expiry tick, and optional expected authority
event ID.

The exact next Rifle and Impulse Grenade acceptance IDs can be derived from the
latest snapshot namespace/ordinal and the adapter uses them for automatic
exact-once reconciliation. The current teleport authority event intentionally
does not carry a client command identity, so teleport can use an explicit link
between one already observed authority event ID and one pending command ID.
That link is idempotent and emits no second audiovisual cue.

Prediction state is never conflated with authority outcome state. Local cues are
`predicted`; Rifle and Grenade command acceptances are `accepted`; a teleport or
explicit command rejection is `rejected`; gameplay consequences and completed
authority facts are `confirmed`; expiry and snapshot supersession are
`cancelled`. Rejection has distinct markers, status, and metrics and is never
routed through either confirmed or cancelled presentation.

A rejection, bounded expiry, or superseding full snapshot resolves a prediction
exactly once. It does not infer or roll back gameplay state. A later real
authority event is still presented as authority truth, but cannot resolve the
already-closed command a second time.

## Snapshot, event, and reconnect behavior

Full snapshots are copied into a recursively frozen client view model containing:

- the complete 13-field room/simulation/content identity;
- local life, health, shield, protection, and respawn state;
- equipped weapon slot, Rifle phase/ammo/reload/cadence state;
- grenade and teleport phase/cooldown state;
- lifecycle, authoritative match timer, score rows, player rows, feed, and result;
- active projectile identities, owners, positions, and detonation tick.

The adapter validates and retains room, match, ruleset, revision, ruleset hash,
map, fixture, fixture hash, physics adapter ID/version, movement profile,
movement profile revision, and movement profile hash. Every player movement
snapshot must carry the same ten simulation identity fields and the same tick as
the enclosing full snapshot. Any malformed field, hash, nested mismatch, or
change to any retained identity field fails closed.

The adapter does not retain or freeze caller-owned snapshot/event objects.
Unexpected event fields, future event ticks, conflicting payloads under one
event ID, replayed client-command IDs, and a prediction/event kind mismatch also
fail closed.

Authority events are ordered by authority tick and one stable semantic priority
before projection. Confirmed event IDs are remembered in a configurable bounded
window; same-ID/same-payload replay is suppressed, while same-ID conflicting
payload or kind fails closed. Older atomic frames and late events cannot roll
the view backward.

Reconnect/full-snapshot hydration emits one restrained HUD synchronization
intent and non-celebratory active-projectile reconciliation markers. It does not
replay historical hit, damage, death, score, feed, detonation, or teleport
effects. Snapshot combat-sequence floors, exact accepted-action ordinals, and
remembered feed IDs suppress already-reflected reliable events. Reload start,
reload completion, reload cancellation, grenade collision, detonation, impulse,
teleport confirmation, and teleport rejection at the snapshot's exact tick are
also suppressed because an atomic full snapshot at that tick is downstream of
those events. Pending cues at or before the snapshot tick are cancelled without
inferring acceptance.

Respawn events do not contain replacement health/shield totals. The adapter
therefore changes the life phase and discontinuity data but marks point values
stale until the next full snapshot instead of inventing the known current
profile total.

## Semantic presentation outputs

Twenty-nine immutable marker bundles cover:

- ammo/equip/cooldown HUD synchronization;
- predicted, accepted, rejected, and cancelled Rifle fire;
- Rifle reload start, completion, and cancellation;
- confirmed body, shield, and kill hit feedback;
- incoming damage, death, and respawn;
- team score, phase/timer, kill feed, and match result;
- predicted/accepted/rejected/cancelled grenade throw, collision, detonation,
  and impulse;
- predicted/confirmed/rejected/cancelled teleport;
- full-snapshot projectile reconciliation.

Every audiovisual bundle has a versioned semantic marker ID. Every
animation-bearing bundle declares a reduced-motion animation substitute. Every
VFX-bearing bundle declares reduced-flash, reduced-motion, and combined
reduced-flash/reduced-motion substitutes. Every audio-bearing bundle declares a
non-audio HUD/caption/shape substitute. The adapter emits no screen flash
implementation and no center-screen card.

## Independent audit failure and correction

The first bounded implementation was independently audited as **FAIL**. That
failure is preserved here and is not overwritten by the corrected result. The
audit identified four defects:

1. only room and match IDs were retained and compared from the full snapshot
   identity;
2. same-tick reconnect replay was not suppressed for reload, collision,
   detonation, impulse, and teleport event families;
3. accepted and rejected authority outcomes were labelled as confirmed or
   cancelled;
4. marker bundles exposed reduced-flash and non-audio alternatives but no
   reduced-motion alternatives.

All four defects are now **CLOSED in the bounded client seam**. The regression
suite changes every one of the 13 root identity fields, exercises malformed
hashes and nested remote-player movement identity/tick mismatch, replays all
eight audited same-tick event kinds after a snapshot, asserts distinct
predicted/accepted/rejected/confirmed/cancelled semantics, and inspects every
marker bundle for the required accessibility alternatives. Real rendered
accessibility behavior remains open and is explicitly not claimed.

## Executed evidence

All commands used the repository-installed TypeScript, Vitest, and ESLint under
the bundled Node runtime. No Worker/wire source, deploy configuration, external
service, or published environment was changed.

- Focused P5.7 Vitest: **13/13 PASS** in one file.
- Current full default Vitest: **583/583 PASS** across 60 files.
- Current application TypeScript graph: **PASS, zero diagnostics**.
- Focused ESLint selection for the new source, exports, and test: **PASS, zero
  errors and zero warnings**.
- Full ESLint graph: **PASS, zero errors and zero warnings**.
- Static client boundary audit: **zero authority imports and zero authority
  reducer/class references** in the presentation adapter.

The 583-test run is the current shared-tree selection and includes concurrent
accepted work outside P5.7; it is supporting regression evidence, not an
exclusive P5.7 artifact. The focused thirteen tests directly prove real
`AuthoritativeRoom` snapshot/tick consumption, detached recursive immutability,
all-field identity pinning, safe prediction, exact automatic and explicit
reconciliation, honest outcome semantics, rejection and expiry,
duplicate/conflict handling, canonical ordering, stale-frame behavior,
same-tick reconnect/full-snapshot non-replay, Rifle ammo, grenade/teleport
cooldowns, body/shield/kill feedback, incoming damage, death/respawn,
score/feed, projectile/detonation markers, and marker accessibility variants.

The first development test run was 6/9 because its test harness expected a
nested partial object as an exact object, matched a snake-case error with a
space-case expression, and sampled the real Rifle before its equip-ready tick.
Two follow-up runs were 8/9 while the harness corrected the exact held-button
bit and submitted held intent on each sampled tick. These were test-fixture
corrections. After the independent audit, the first mid-correction run was 6/9
because three pre-audit expectations still required the old confirmed/cancelled
labels. Those expected failures were updated only after the implementation
changed, and the final corrected focused run is the 13/13 result above.

Current file hashes after the sealed run:

| File | SHA-256 |
|---|---|
| `src/client/combat/presentationAdapter.ts` | `b32eef1afc9e3dcd2a62413d6677f428e18b280b29a935f7c78361d7291b17e1` |
| `src/client/combat/index.ts` | `6465fce04a7676462508d3914b1a6f6181e9ca7b08e872fd55806ccfe8e64aa5` |
| `src/client/index.ts` | `9681e1bc8c4e1281a1edb9ab299388544af1bb937ec2a385ed3d5d4d828863fb` |
| `tests/unit/client/combat/presentationAdapter.test.ts` | `214887d86ee7d96ff890f3383e914f665dab1e0c454366e25dd28fc2b40f9a5a` |

## Explicit non-claims and remaining work

- This does not create a rendered HUD, animation player, audio engine binding,
  particle/VFX system, camera impulse, viewmodel, crosshair, caption widget, or
  accessibility settings screen. Marker consumers remain future integration.
- It adds no protocol/wire field, Worker adapter, reliable-event acknowledgment,
  network command/event correlation, or resume delta.
- Rifle/grenade automatic prediction IDs assume the snapshot ordinal plus the
  adapter's pending order. If an intervening command is rejected and no exact
  event ID is available, the adapter fails closed until explicit cancellation,
  event linkage, or snapshot resynchronization; it never infers a hit or spend.
- The remembered-event window is bounded. The real reliable transport must pin
  replay/resend bounds inside that capacity before G4 evidence.
- It does not prove actual reduced-flash visuals, captions, audio balance,
  marker-to-clip timing, frame pacing, two-browser behavior, latency feel, or
  human presentation acceptance.
- It does not implement P5.8 abuse/chaos coverage or P5.9 two-browser combat
  proof and does not pass G4.

Therefore this closes only the bounded P5.7 client contract and focused
regression seam. Real presentation consumers, network correlation, runtime
evidence, accessibility review, and human acceptance remain open.
