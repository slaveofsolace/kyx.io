# Project status

Last updated: 2026-09-05

**Paused WIP — approximately 43% complete / 57% remaining**

Development is on hold at the owner's request. This is an unfinished prototype,
not a release candidate. The percentage is the existing rough estimate against
the full product scope, not measured acceptance. No newly accepted milestone
justifies increasing it. There is no completion ETA while paused.

## Implemented prototype systems

- Server-authoritative 20 Hz multiplayer movement, combat, score, results,
  reconnect, restart checkpoints, rate limits, and arena rotation
- Online Team Deathmatch, Free For All, and Instagib
- Relay, Switchyard, and Crownpoint online
- Relay Practice with bots and the same three deathmatch contracts
- Rifle, sidearm, shotgun, sniper, rocket, and melee authority families
- Blink, launch, frag, smoke, sticky, and flash authority contracts
- Desktop HUD, loadouts, results, and multiplayer/browser test paths
- Worker spectator join/resume, target selection, replay-safe credentials,
  rematch voting, and restart persistence

## Remaining

1. Finish the player-facing spectator/rematch flow and private/custom rooms.
2. Add CTF, Search and Destroy, Last Team Standing, Survival, Zombie Survival,
   and Battle Royale.
3. Build and accept the large original Battle Royale arena.
4. Complete the remaining weapons, upgrades, mines, pickups, loot, and Practice
   parity.
5. Add accounts, progression, inventory, cosmetics, social systems, and
   moderation.
6. Add authenticated map editing, testing, moderation, and publishing.
7. Complete adverse-network, abuse, soak, performance, accessibility,
   controller, and human gameplay acceptance.

## Verification snapshot

September 5 local work, based on `373e9de6`:

- Application type checking passed, as did 47 focused tests across six files.
- Camera settings, standing/crouched eye height, pending mouse look and
  frame-independent camera smoothing were updated. Ramp rendering was corrected
  to match the unchanged authority rotation; the geometry regression passes.
- The real 2/4/8-client multiplayer test failed while waiting for a client to
  join: its state was `resuming`, not `joined`. Multiplayer is not accepted.
- The first-person controls browser test reached its crouched-camera assertions
  but timed out taking a screenshot. The test did not finish and is not a pass.
- Three map treatments and three actor/rifle treatments are isolated review
  candidates. They are not integrated or approved; matching first-person arms,
  grip repair, runtime comparison and human play review remain unfinished.
- Full lint, Worker tests, build, security, soak and performance gates were not
  rerun for this paused diff. No new release or deployment acceptance is claimed.

Historical August 24 evidence recorded 1,144 main tests, 73 Worker tests, a prior
65-test browser matrix with 17 intentional skips, and a prior six-test
multiplayer matrix. Its later WIP multiplayer rerun passed only three of six.
These are historical results, not verification of the September 5 changes.

## Release status

Release remains blocked. GitHub reported the repository as public at the pause,
which conflicts with the task's private-repository boundary. Upload of the new
checkpoint is held pending the owner's visibility decision. The project remains
`UNLICENSED`; third-party license, attribution and provenance records are retained.

No deployment, history rewrite, branch deletion or protected-worktree cleanup is
authorized by this checkpoint. Development servers and both asset/map lanes
are stopped. Resume requires a new explicit owner request.
