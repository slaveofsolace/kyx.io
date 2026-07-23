# Phase 4 / G3 product online preview

Date: 2026-07-22  
Status: `PRODUCT_PATH_INTEGRATION_PASS` / `G3_NOT_ACCEPTED`

## Outcome

The product now has a visible, configuration-gated `ONLINE MOVEMENT PREVIEW` entry and a dedicated `/online` flow. It uses the existing local guest profile, creates rooms through the authoritative Worker, joins by a bounded room code, renders local prediction plus remote interpolation, and offers explicit disconnect/resume. It does not collect a password and it does not present movement-only work as complete multiplayer.

The new route explicitly excludes combat presentation, matchmaking, progression, and release readiness. The default build remains fail-closed: with no `VITE_KYX_AUTHORITY_ORIGIN`, the main-menu entry stays disabled and `/online` explains that no authority endpoint is configured. Production configuration accepts HTTPS origins only; loopback HTTP is development-only. Room links contain only `mode` and `room`, never an authority override or credential.

## Browser CORS defect found and fixed

The first real-browser create attempt in `runs/local-v1` failed because allowed origins passed Worker authorization but successful HTTP API responses did not include `Access-Control-Allow-Origin`. The failure screenshot is retained as `online-create-debug.png`.

`worker/worker.ts` now reflects only the exact allowed request origin, adds `Vary: Origin`, and provides bounded room-route `OPTIONS` handling. Forbidden origins, methods, headers, and paths remain denied; no wildcard origin is emitted. `tests/worker/cors.test.ts` covers allowed creation, bounded preflight, and forbidden-origin behavior.

## Automated product-path capture

`tools/evidence/capture-phase4-g3-product-online-preview.mjs` drove two isolated Chrome profiles through the visible product flow against a local Wrangler Worker. It verified:

- the configured main menu exposes `ONLINE MOVEMENT PREVIEW`;
- the lobby discloses local-guest identity and movement-only scope;
- the browser creates a valid authority room through HTTP CORS;
- both clients join the same match with distinct player identities;
- each client sees one remote player;
- client A advances 7,200 mm and client B renders A at 0 mm measured divergence;
- full/delta snapshots and input acknowledgements flow;
- explicit disconnect/resume succeeds and preserves player/match identity;
- the peer remains joined; and
- both browser error streams remain empty.

Capture verdict: `PASS`, 17/17 checks.  
Independent verifier verdict: `PASS`, 12/12 checks.

Primary evidence:

- `evidence/2026-07-22/phase-4-g3-product-online-preview/runs/local-v2/product-online-preview-runtime.json`
  - SHA-256 `aad9367ea53b95fb8aff9a7a1d19da062f96e68f7ee3cab7b85a6235aa5f3807`
- `evidence/2026-07-22/phase-4-g3-product-online-preview/verifications/local-v2.json`
  - SHA-256 `126af2af60bb2818b5dfb95550a157308f5ae902efd31a3118347734b66412a4`
- `main-menu-online-entry.png`
  - SHA-256 `7ceb29a196df28bd7ff66547f3f267d0b4a1e60f803b3b77552134314c54a04e`
- `online-lobby.png`
  - SHA-256 `4cd2c52fc07c8744b0213518e0037ce3e6e8b56af3de14691c7a00961fdc1ae1`
- `online-room-a-resumed.png`
  - SHA-256 `668f9c70a7bd475b3a2db0b038d452e65c733450e416984efd39c9e40e815cf7`
- `online-room-b-peer.png`
  - SHA-256 `37179d9fba630cf4713256d5418c757e83e6bcc9d2566b3ac26c011453af3668`

## Verification

- app TypeScript: PASS
- Worker TypeScript: PASS
- focused app unit tests: PASS, 11/11
- Worker CORS tests: PASS, 3/3
- focused ESLint: PASS
- Vite production build: PASS
- automated two-browser product capture: PASS, 17/17
- independent artifact verifier: PASS, 12/12

## Gate boundary

This closes the missing product-visible movement-room path and browser CORS sub-blocker. It does not close G3. A durable staging or production deployment, provider resource/usage observation under sustained load, broader recovery/soak evidence, final regression, and human review remain required. The earlier ephemeral Worker deployment is now HTTP 429 under its temporary account limit and is not treated as durable staging.
