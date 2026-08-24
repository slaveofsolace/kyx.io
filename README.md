# KYX.IO

> **Work in progress: about 43% complete / 57% remaining.**
>
> Playable in development. Not feature-complete, release-ready, or deployed.

KYX.IO is an original tactical sci-fi browser FPS. It uses Three.js, Rapier,
TypeScript, and a server-authoritative Cloudflare Worker/Durable Object runtime.

## Current build

- Online Team Deathmatch, Free For All, and Instagib
- Relay, Switchyard, and Crownpoint arenas
- Relay Practice with bots
- Authoritative movement, combat, scoring, results, reconnect, and rotation
- Six weapon families and six ability families
- Desktop HUD, loadouts, match results, and automated multiplayer coverage
- Server-side spectator sessions and rematch consensus foundations

## Still to build

- Player-facing spectator/rematch flows, private matches, and remaining modes
- Capture The Flag, Search and Destroy, Last Team Standing, Survival,
  Zombie Survival, and Battle Royale
- A large original Battle Royale arena
- Remaining weapons, upgrades, mines, pickups, loot, and Practice parity
- Accounts, progression, inventory, cosmetics, social systems, and moderation
- Authenticated map editing and publishing
- Full network, soak, performance, accessibility, controller, and human review

The project has no cryptocurrency, wallets, NFTs, real-money purchases, or
pay-to-win systems.

## Run locally

Requires Node.js 22-24, npm 11, and Git LFS.

```powershell
git lfs install
npm ci
npm run dev
```

Run `npm run dev:authority` in a second terminal for online authority.

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the current scope and verified
test state. The source and assets are `UNLICENSED`.
