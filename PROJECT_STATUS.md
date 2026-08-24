# Project status

Last updated: 2026-08-24

Overall estimate: **43% complete / 57% remaining**.

KYX.IO is an active development project. The current source is playable and
has substantial automated coverage, but it is not a finished game, a release
candidate, or a deployment claim.

## Implemented and verified

- Worker-authoritative 20 Hz rooms with validated input, deterministic movement,
  combat, damage, death, respawn, scoring, results, reconnect, restart
  checkpoints, rate limits, and arena rotation
- Online Team Deathmatch, Free For All, and Instagib
- Relay, Switchyard, and Crownpoint online map bindings
- Relay Practice with bots and shared TDM, FFA, and Instagib mode contracts
- Six authority weapon families: rifle, sidearm, shotgun, sniper, rocket, melee
- Blink, launch, frag, smoke, sticky, and flash authority contracts
- Desktop HUD, loadouts, match results, and multiplayer/browser test paths
- Strict release-package, asset-provenance, dependency, secret, and security gates

The last fully frozen batch passed:

- 1,114 main tests
- 72 Worker tests
- 65 broad browser tests, with 17 intentional mobile-project skips
- 6 multiplayer tests, including 2, 4, and 8 clients
- all configured TypeScript checks, lint, production build, Worker dry-run,
  release package closure, dependency audit, and secret scan

An unfinished spectator/rematch authority foundation is preserved as a WIP
checkpoint. Its focused TypeScript, lint, and 9 unit tests pass, but it is not
connected to the Worker protocol or player-facing UI.

## Remaining work

1. Finish spectator sessions, rematch consensus, custom/private rooms, and
   shared lifecycle behavior.
2. Implement Capture The Flag, Search and Destroy, Last Team Standing,
   Survival, Zombie Survival, and Battle Royale.
3. Build and accept an original large Battle Royale arena.
4. Complete missing weapons, upgrades, mines, pickups, loot, and multi-map
   Practice parity.
5. Add accounts, passkeys, recovery, signed authority match receipts, D1
   progression, inventory, cosmetics, leaderboards, parties, clans, blocks,
   mutes, reports, and moderation.
6. Add the authenticated map editor, private playtesting, publication,
   moderation, versioning, and rollback.
7. Complete adverse-network and abuse matrices, a genuine 30-minute authority
   soak, performance/cost profiling, accessibility/controller coverage, and
   human gameplay review.

## Release status

Release is blocked. The project remains private and `UNLICENSED`. Project
licensing, runtime character acceptance, distribution mode, deployment, and
release require separate owner decisions.
