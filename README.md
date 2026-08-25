# KYX.IO

**Work in progress — about 43% complete, 57% remaining.**

Development is currently paused at an unfinished checkpoint. KYX.IO is a
playable tactical sci-fi browser FPS, but it is not feature-complete,
release-ready, or deployed.

## Available now

- Team Deathmatch, Free For All, and Instagib
- Relay, Switchyard, and Crownpoint arenas
- Relay Practice with bots
- Server-authoritative movement, combat, scoring, reconnect, and rotation
- Six weapon families, six ability families, loadouts, HUD, and match results

## Remaining

- Spectator, rematch, private-match, and remaining game-mode flows
- Battle Royale and its large original arena
- Remaining combat content and Practice parity
- Accounts, progression, cosmetics, social systems, moderation, and map editing
- Full network, performance, accessibility, controller, and human play review

No cryptocurrency, wallets, NFTs, real-money purchases, or pay-to-win systems.

## Run locally

Requires Node.js 22-24, npm 11, and Git LFS.

```powershell
git lfs install
npm ci
npm run dev
```

Run `npm run dev:authority` in a second terminal for online authority.

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the full checkpoint and test
state. The source and assets are `UNLICENSED`.
