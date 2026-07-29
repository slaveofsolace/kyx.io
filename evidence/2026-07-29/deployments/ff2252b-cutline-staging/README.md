# Cutline staging deployment proof

- Source commit: `ff2252b799c381d75b429c81f9716230ec1d1417`
- Worker: `kyx-io-authority-staging`
- Worker version: `3b2b5e83-8731-45b4-b3c9-e344b8642a45`
- Review URL: `https://kyx-io-authority-staging.suhaibabdeljaber.workers.dev`
- Build identity: `kyx-main-cutline-rev5-review-20260729`
- Captured: 2026-07-29

## Live browser result

Two independent headless Chrome contexts joined one real staging room. Both
reported `connection=joined` and one remote player. The host reported:

- renderer: `three_webgl`
- render status: `ready`
- map: `inkfall_foundry@3`
- presentation: `inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular`
- selected weapon: `vertical_rifle_v1` / `VLR-7 LINE RIFLE`
- UI system: `cutline-v1`
- online HUD count: `1`
- authoritative position before forward input: `(-33500, 0, -3500)`
- authoritative position after forward input: `(-29742, 41, -91)`
- console errors: `0`
- page errors: `0`
- failed requests: `0`

The screenshot is the exact deployed staging page after the movement check:
[`live-two-player-walkthrough.png`](live-two-player-walkthrough.png).

## Consolidated pre-deploy gates

- app, Worker, sim-source, and sim typechecks: pass
- ESLint: pass
- app Vitest: 118 files / 881 tests pass
- routine Worker Vitest: 12 files / 50 tests pass
- Cutline Playwright: 4 / 4 pass
- staging Vite build: 201 modules
- release asset validation: pass
- release provenance sentinel: pass
- release package closure: pass
- G9 controls: pass
- Wrangler staging dry-run: pass

## Nonclaims

This proof does not grant human visual acceptance, G6 character acceptance,
project-license approval, distribution-mode approval, final 2/4/8 acceptance,
or the final 30-minute soak. It is a staging review deployment, not a
production promotion.
