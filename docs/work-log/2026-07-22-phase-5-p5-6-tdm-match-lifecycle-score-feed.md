# Phase 5 P5.6 authoritative TDM lifecycle, score, and feed

Date: 2026-07-22 (America/Chicago)  
Status: **CORRECTED BOUNDED POLICY/ROOM PASS AFTER FAILED INDEPENDENT AUDIT; REAL WIRE, PRESENTATION, RUNTIME PROOF, AND G4 OPEN**

## Verdict

P5.6 now has one immutable authority-owned Team Deathmatch lifecycle and a
separate exact opt-in inside `AuthoritativeRoom`. The service consumes only the
already accepted P5.1 damage, death, and respawn ledger. It does not accept a
client-authored score, feed item, timer, phase, result, kill, death, or assist.

The nested room capability is exactly:

`authoritative_tdm_match_v1`

It is absent by default, requires the existing exact P5.5 ability-resource
capability, requires an explicit authority team resolver, and requires the room
durations to equal the checked-in revision-3 match contract. A wrong capability,
extra option field, missing prerequisite, missing team, changed rule, or changed
duration fails closed. Rooms without this capability retain their prior tick and
snapshot shapes.

## Exact match contract

| Contract | Required value |
|---|---|
| Authority rate | 20 Hz |
| Mode | Team Deathmatch |
| Warmup | 40 ticks / 2 seconds |
| Active match | 9,600 ticks / 8 minutes |
| Postmatch | 200 ticks / 10 seconds |
| Team score limit | 40 |

The lifecycle is `lobby -> warmup -> active -> postmatch -> completed`. Start,
timer decrement, warmup completion, time-limit result, score-limit result, and
postmatch completion are derived only from the authority tick. At least two
authority-owned teams must be registered before start.

Team and player rows are kept in explicit ordinal stable-ID order; ordering does
not depend on host locale collation. Score and feed event IDs are derived from
the match ID and accepted combat sequence. Results contain the final ordered
team scores and either one winning team or a draw.

## Ledger ownership and deterministic ordering

For an accepted active enemy death, the match service emits this stable order:

1. Existing `damage_applied` event.
2. Existing `death` event.
3. One `team_score_changed` event.
4. One `kill_feed_entry` event.

Kills, deaths, assists, cause, victim, killer, and score attribution come only
from that accepted death ledger. Environment deaths create a feed entry but no
team score. Warmup damage and deaths remain valid combat history but do not
change match statistics, score, or feed. Respawns are recorded exactly once and
never change accumulated score.

The first ordered death that reaches 40 is the deterministic scoring cutoff for
its authority tick. Any already-sampled lethal combat later in that same tick is
still retained in the life/death ledger, but it cannot add score, match
statistics, or feed. The room settles the tick once, then emits one phase change
and one score-limit result. A score-limit result wins over a simultaneous active
timer boundary. Replayed or stale combat and respawn sequences are idempotently
rejected before they can mutate match state.

## Room, snapshot, and reconnect behavior

Exact-capability rooms register each joined player under the server-resolved team
and reject a null team. Room start creates the warmup transition. Each authority
tick opens the match clock, resolves the already sampled sorted combat batch,
then settles score or timer boundaries so every event in that tick has one
deterministic position.

The room lifecycle follows the match lifecycle. Entering match postmatch also
ends active room combat and clears remaining grenade projectiles through the
existing lifecycle path. Direct authority damage outside a batched tick settles
the score limit immediately.

An exact-capability TDM match deliberately retains its authoritative
`warmup`, `active`, or `postmatch` room lifecycle when every player leaves. The
fixed authority clock continues with zero players, and `expire()` fails closed.
The room reaches `idle` only after the pinned match clock reaches `completed`;
only then may it transition to `expired`. This preserves the existing time-limit
and score-limit result contract instead of inventing an unapproved abandonment
or forfeit result.

Full exact-capability snapshots contain the current recursively frozen match
state: lifecycle clock, remaining ticks, sorted team and player scores, ordered
feed, processed combat sequence, and result. Reconnect receives that current
state without replaying old score or feed events; the next tick contains only
new transitions.

## Independent audit failure and correction

The first independent P5.6 audit was **FAIL** despite the original 14/14 focused
test result. It found two gaps not covered by that selection:

1. Explicitly leaving every player during an active exact-capability match could
   move the room to `idle`, after which `expire()` could produce an
   `expired` room snapshot whose embedded match was still `active`.
2. Team and player rows used default-locale `localeCompare`, so mixed-case or
   punctuation-bearing stable IDs did not have one host-independent ordinal
   ordering contract.

The correction keeps the room non-idle while the exact match is in `warmup`,
`active`, or `postmatch`; rejects expiry throughout those phases; and guards the
central lifecycle transition against any future idle/expired divergence. A new
room test follows an empty active match through the normal time-limit result,
postmatch, completed/idle, and finally expired/completed. One shared ordinal
comparator now orders TDM team/player rows and tied result evaluation, with a
mixed-case/punctuation regression test.

## Executed evidence

Verification ran in-process with the repository's installed TypeScript, Vitest,
and ESLint packages. No deployment, Worker mutation, protocol/wire edit, or
publishing occurred.

- Corrected pure P5.6 lifecycle/score/feed suite: **9/9 PASS**.
- Corrected exact room-integration suite: **7/7 PASS**.
- Corrected combined focused P5.6 selection: **16/16 PASS** across two files.
- Fresh read-only independent re-audit after correction: **PASS**. It confirmed
  no audited API path reaches `idle` or `expired` while the exact match remains
  `warmup`, `active`, or `postmatch`, and confirmed no `localeCompare` remains
  in the P5.6 match source or room seam.
- Current application TypeScript graph after correction: **PASS, zero
  diagnostics**.
- Current Worker TypeScript compatibility graph after correction: **PASS, zero
  diagnostics**.
- Current adjacent Worker-isolate regression after correction: **15/15 PASS**
  across four files.
- Current focused ESLint selection for the four corrected source/test files:
  **PASS, zero errors and zero warnings**.

The retained pre-audit baseline was full default Vitest **562/562 PASS** across
58 files, Worker Vitest **12/12 PASS** across four files, both simulation
TypeScript graphs **PASS**, and the then-current 208-file repository lint
selection **PASS**. The full default/simulation/repository-wide selections were
not rerun by this bounded correction and are not presented as current
post-correction whole-repository proof; the current 15/15 Worker result above
was rerun separately by root because the Worker imports `AuthoritativeRoom`.

The focused suites directly prove exact frozen rules, stable scoreboard order,
at-least-two-team start, authority-tick boundaries, time-limit draw, ordered
life/death/score/feed events, life-ledger assists, environment deaths, warmup
non-scoring, exact score-limit cutoff including a later same-tick death,
idempotent replay, respawn non-scoring, mismatched ledger rejection, default-room
compatibility, exact capability rejection, snapshot/reconnect state, no event
replay after reconnect, room postmatch synchronization, and rejection of forged
client score fields. The corrected suites additionally prove ordinal mixed-ID
ordering and coherent zero-player active-through-expired match lifecycle.

## Explicit non-claims and remaining work

- This is an internal authority snapshot/event seam. It adds no protocol field,
  Worker adapter, reliable network delivery, resume delta, HUD, scoreboard UI,
  announcer, animation, audio, VFX, camera treatment, or accessibility
  presentation.
- It adds no production runtime proof, proxy latency proof, two-browser playtest,
  correction trace, combat feel review, or performance capture.
- It does not implement or validate P5.7 presentation, P5.8 broader abuse and
  packet-chaos coverage, P5.9 real two-browser evidence, or the independent
  P5.1-P5.6 audit.
- The future Worker/wire combat adapter must prove that an empty running exact
  TDM room continues ticking through its finite 9,840-tick lifecycle instead of
  stopping based only on connected-player count.
- It does not pass G4 and does not make the combat slice load-and-play complete.

Therefore this closes only the bounded P5.6 policy and exact room-integration
seam. The real network, presentation, runtime-evidence, audit, and human
acceptance gates remain open.
