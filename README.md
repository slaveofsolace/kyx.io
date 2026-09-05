# KYX.IO

**Paused work in progress — approximately 43% complete / 57% remaining.**

KYX.IO is an original tactical sci-fi browser FPS. This is an unfinished
development snapshot, not a release. Development is on hold as of September 5,
2026. The percentage is a rough full-project estimate, not a test-pass score.

## Current prototype

- TDM, FFA and Instagib across Relay, Switchyard and Crownpoint; Relay Practice with bots.
- Server-authoritative combat, movement, weapons, abilities, loadouts and match results.
- Camera, controls and new Relay art are being refined. Multiplayer reliability and full play acceptance remain unresolved.

## Remaining

- Finish and play-test a coherent Relay match, including art, animation, audio and reconnect.
- Complete the remaining modes, combat content, accounts, progression, social systems and map editor.
- Finish network, performance, accessibility and controller acceptance.

No cryptocurrency, real-money purchases or pay-to-win systems. There is no
completion ETA while development is paused.

## Run locally

Requires Node.js 22-24, npm 11, and Git LFS.

```powershell
git lfs install
npm ci
npm run dev
```

Run `npm run dev:authority` in a second terminal for online authority.

See [Project status](./PROJECT_STATUS.md) for known failures and remaining work.
The project is `UNLICENSED`; third-party rights and attribution still apply.
