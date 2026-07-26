# Cloudflare staging live proof — v1

Status: **bounded staging PASS; G3, G5, G6, G7, G8, and G9 remain open**

This pack proves that the current KYX.IO work-in-progress is deployed to the
personal Cloudflare Workers account, that its same-origin authority endpoints
respond with the expected origin controls, and that the public offline and
online paths initialize in a real Chrome runtime. It is not a production
release certificate and it does not close any broad acceptance gate by itself.

## Deployed identity

- Canonical staging URL:
  `https://kyx-io-authority.suhaibabdeljaber.workers.dev`
- Git commit:
  `03e99dca613ac6c0cdbaf7330d41a5a3bb5e39a9`
- Cloudflare Worker version:
  `cf1af235-494c-4d1c-86dd-d25987d74524`
- Worker build ID:
  `foundry-command-v2-g7-online-20260725`
- Browser:
  Google Chrome `150.0.7871.186`, headless, 1280 × 720

## Executed checks

| Check | Current result |
| --- | --- |
| Production Vite build | PASS — 155 modules transformed |
| `GET /health` | PASS — HTTP 200, `ok: true`, Durable Object binding present |
| Allowed-origin `POST /api/rooms/create` | PASS — HTTP 201 |
| Allowed-origin room metrics | PASS — HTTP 200 |
| Forbidden-origin room creation | PASS — HTTP 403 |
| Root CSP | PASS — self-only scripts plus narrow `wasm-unsafe-eval` required by deterministic Rapier WASM |
| Online create/join in Chrome | PASS — room `KYX-VZHBLY`, connection `joined`, revision-3 ruleset, one full snapshot, presentation bridge `ready`, no page errors |
| Offline launch in Chrome | PASS — pointer lock acquired, HUD and seven-bot practice session visible |
| Escape recovery | PASS — pointer released, pause dialog visible, focus moved to `RESUME PRACTICE` |
| Quit recovery | PASS — returned to the menu, pointer remained released, focus returned to `play-btn` |
| 1280 × 720 menu fit | PASS — viewport and document are both 1280 × 720 with no overflow |

The live browser emitted no page errors. Non-fatal warnings remain for the
upstream Rapier initialization signature, one Chrome Permissions-Policy token,
and a GPU shader precision diagnostic. These are not hidden or promoted to
release-clean status.

An attempted two-page visual follow-up is deliberately excluded as multiplayer
proof: Chrome background-page throttling let the first page hit the authority
heartbeat timeout while the second page joined. The existing protocol and
multi-client harnesses remain the applicable machine evidence; G3 still needs a
successful accepted population/interpolation proof.

## Screenshots

- `cloudflare-menu-live.png` — final deployed menu at 1280 × 720.
- `cloudflare-offline-practice-gameplay-1280x720-live.png` — final deployed
  offline practice after successful pointer lock.
- `cloudflare-offline-practice-paused-live.png` — Escape/pointer-release pause
  recovery.
- `cloudflare-online-authority-joined-1280x720-live.png` — live public
  authority room joined and synchronized.

Hashes and exact observations are recorded in `capture.json`.

## Claim boundary

This pack is **NOT_G3**, **NOT_G5**, **NOT_G6**, **NOT_G7**, **NOT_G8**, and
**NOT_G9**. In particular, it does not prove accepted 2/4/8-player population,
the final Inkfall Foundry runtime, final character art, zoom/accessibility
review, final performance, legal/source clearance, rollback, or production
release authorization.

*Currently being worked on.*
