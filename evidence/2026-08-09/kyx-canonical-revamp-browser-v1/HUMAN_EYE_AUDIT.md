# KYX.IO Canonical Revamp — Bounded Player-Eye Audit

Date: 2026-08-09

Build: `51161552326fbf1d39986dc74b113e99a62b9319`

Mode: `staging-review`

Viewport: Chromium, 1440 × 900

Scenario: Relay Practice, one local player and seven bots

The same route was repeated after deployment at the immutable staging URL
`https://941036a0.kyx-io-preview.pages.dev` with the same bounded verdict.

## Verdicts

- Technical integrity: **PASS** for this bounded local staging slice.
- Gameplay slice: **PASS / ADVANCE TO STAGING** for menu → Relay selection → Practice → pointer lock → movement/jump/fire.
- Presentation: **REVISE**, but not a blocker for tester-grade staging.
- Human acceptance: **UNKNOWN**. This is an agent-assisted player-eye review, not literal human approval.
- Production release: **NO**. Review assets, provenance holds, and explicit WIP boundaries remain in force.

## Observed

- Relay is the sole product-facing arena and the menu, arena picker, entry gate, HUD, and first-person loop remain coherent.
- The local authority reached active play with eight participants, accepted 1,480 inputs, advanced to tick 185, and reported zero missed scheduler ticks.
- The player moved materially from spawn, pointer lock engaged, one attack was accepted, ammo decreased from 50 to 49, and the first-person fire impulse appeared.
- The packaged VLR-7 plus K9, SG-4, Longbow-12, and BR-6 review GLBs all returned HTTP 200. The selected VLR-7 had two first-person hands, one weapon root, one mount child, and an authority-bound muzzle reference.
- Seven remote avatars and seven world weapons were present without duplicate world-weapon roots.
- The capture recorded zero console, page, or request errors.
- The crosshair and forward route remain readable during movement and fire. No gross first-person clipping was visible in the captured frames.

## Presentation revisions

- The open-sky lighting produces repeated vertical shadow/light bands that read as unfinished.
- The campus is coherent but materially sparse and flat; repeated surfaces reduce place identity.
- A bright floor patch in the menu flythrough is distracting and partly blown out.
- The first-person VLR-7 is large in frame. It remains usable in this capture, but should receive a later comfort/occlusion pass.
- Remote support-hand contact is visibly still WIP: telemetry reports 7 contacts, 0 qualified contacts, and a maximum error of about 0.193 m. Per-finger optimization is explicitly deferred and is not reopened by this packet.

## Unknown / not claimed

- No portal traversal was performed.
- No confirmed hit, damage, headshot, or kill was captured.
- Reload, weapon switching, abilities, two-client online play, 2/4/8 population, soak, frame-time percentiles, GPU memory, and accessibility were not proven by this bounded route.
- The review character and weapon assets are not promoted to release status by this evidence.

## Evidence

- `relay/01-relay-menu-flythrough-1440x900.png`
- `relay/02-relay-arena-selection-1440x900.png`
- `relay/03-relay-entry-gate-1440x900.png`
- `relay/04-relay-spawn-active-1440x900.png`
- `relay/05-relay-route-one-1440x900.png`
- `relay/06-relay-route-two-1440x900.png`
- `relay/07-relay-movement-contact-1440x900.png`
- `relay/runtime.json`
- `live/01-relay-menu-flythrough-1440x900.png` through `live/07-relay-movement-contact-1440x900.png`
- `live/runtime.json`

Disposition: publish this exact build to **staging** as a tester-grade WIP, then continue game-facing iteration from the staged slice. Do not production-deploy.
