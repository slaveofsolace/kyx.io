# KYX.IO

> **Current work in progress — approximately 43% complete.**
>
> KYX.IO is playable in development, but it is not feature-complete,
> human-accepted, deployed, or release-ready.

KYX.IO is an original tactical sci-fi browser FPS built with Three.js,
TypeScript, Rapier physics, Vite, and an authoritative Cloudflare
Worker/Durable Object match service.

## What works now

- Online Team Deathmatch, Free For All, and Instagib
- Worker-authoritative movement, combat, score, results, reconnect, and arena rotation
- Relay, Switchyard, and Crownpoint online
- Relay Practice with bots and the same three deathmatch modes
- Rifle, sidearm, shotgun, sniper, rocket, and melee authority families
- Blink, launch, frag, smoke, sticky, and flash abilities
- Desktop HUD, loadouts, match results, and automated browser/multiplayer coverage

## What is still being built

- Spectators, rematch consensus, custom/private rooms, and remaining match modes
- Capture The Flag, Search and Destroy, Last Team Standing, Survival,
  Zombie Survival, and Battle Royale
- A large original Battle Royale arena
- Remaining weapons, movement upgrades, mines, pickups, and loot
- Accounts, passkeys, recovery, signed match receipts, D1 progression,
  inventory, cosmetics, leaderboards, parties, clans, and moderation
- Authenticated map editing, publication, moderation, and rollback
- Adverse-network, soak, performance, accessibility, controller, and human
  gameplay acceptance

No cryptocurrency, wallets, NFTs, real-money purchases, or pay-to-win systems
are part of the project.

## Run locally

Requirements: Node.js 22-24, npm 11, and Git LFS.

```powershell
git lfs install
npm ci
npm run dev
```

For the local authority service, run this in a second terminal:

```powershell
npm run dev:authority
```

## Verify

```powershell
npm run typecheck
npm run typecheck:worker
npm run typecheck:pages
npm run typecheck:sim
npm run lint
npm run test
npm run test:worker
npm run build
```

Detailed status lives in [PROJECT_STATUS.md](./PROJECT_STATUS.md). The project
remains private and `UNLICENSED`; do not redistribute its code or assets.
