# Cutline + Inkfall Rev5 staging deployment proof

- Deployed source: `03a3accc775593c374a0e38720e97f992c470ff4`
- Worker: `kyx-io-authority-staging`
- Worker version: `c1558355-ab53-4d81-8e3f-9538a22659fc`
- Review URL:
  `https://kyx-io-authority-staging.suhaibabdeljaber.workers.dev`
- Build ID: `kyx-main-cutline-rev5-review-20260729`
- Environment: isolated Cloudflare staging; production was not changed

## Live result

`STAGING_TWO_PLAYER_WALKTHROUGH_PASS`

Two independent headless Chrome contexts joined room `KYX-G9NBRT`. Each saw one
remote player. The host moved 7,000 mm authoritatively while the peer remained
connected.

The deployed page reported:

- renderer: `three_webgl`;
- map: `inkfall_foundry@3`;
- presentation:
  `inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular`;
- release presentation mode: `procedural_authority_containment`;
- authoritative collision/spawns/zones: 339 / 12 / 9;
- selected weapon: `vertical_rifle_v1` / `VLR-7 LINE RIFLE`;
- first-person contact: `authored_two_hand_assault_suit_v2`, two hands;
- UI/HUD: `cutline-v1`, HUD view model schema 1;
- canvas center hit target: `CANVAS`;
- reticle pointer events: `none`;
- console errors, page errors, and failed requests: 0 / 0 / 0.

The exact live screenshot is
[`live-two-player-walkthrough.png`](live-two-player-walkthrough.png). Structured
snapshots and checks are in [`live-walkthrough.json`](live-walkthrough.json).

## Deployment boundary

- Staging Vite build: 201 modules.
- Release asset validation: pass.
- Release provenance sentinel: pass.
- Closed-world package verifier: pass.
- G9 security/deployment controls: pass.
- Wrangler staging dry-run: 17 files, 3,407.89 KiB / 849.32 KiB gzip.
- `/health`, `/`, and `/online`: HTTP 200 after deployment.

G9 release status remains blocked by the owner-only project-license and
distribution-mode decisions and by the absence of an accepted G6 runtime
character. This staging proof does not grant production readiness.

The authored Rev5 GLB remains review-only outside `public`; staging intentionally
uses the corrected procedural visual-continuity fallback. Human map, HUD,
weapon, character, audio, accessibility, 2/4/8 combat, and final release
acceptance remain open.
