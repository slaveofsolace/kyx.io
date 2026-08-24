# Project status

Last updated: 2026-08-24

**43% complete / 57% remaining**

KYX.IO is playable in development. It is not a finished game, a release
candidate, or a deployment claim.

## Working now

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

- 1,144 main tests passed
- 73 Worker tests passed
- The prior frozen browser matrix passed 65 tests with 17 intentional mobile
  project skips
- The prior frozen multiplayer matrix passed all 6 tests, including 2, 4, and
  8 clients
- The current WIP multiplayer rerun passed 3 of 6 tests; one join closed early
  and two movement/timing thresholds failed, so this snapshot is not accepted
- The current lifecycle diff security review completed with no findings
- The production truth-surface release gate remains blocked because no
  production authority origin is configured

## Release status

Release remains blocked. The repository is currently public, the project is
`UNLICENSED`, and no deployment was performed. Licensing, distribution,
deployment, and release require separate owner decisions.
