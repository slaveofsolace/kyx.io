# Inkfall Rev5 player-eye v12 — human-eye review

## Verdict

The portal is now a real, reachable, authority-owned map feature rather than an
unproven prop. The map delta is directionally better, but the full arena is
still a revision candidate because its bridge assembly, landmark finishing,
first-person weapon, and HUD do not yet meet the requested visual bar.

- Runtime movement/reconciliation: **KEEP**
- Rev5 authority/render separation: **KEEP**
- Authored topology route: **KEEP**
- Lower-to-upper portal traversal: **KEEP**
- Portal player-eye discoverability: **KEEP AND CONTINUE**
- Portal visual treatment and arrival framing: **REVISE**
- Map lighting/material delta from v10: **KEEP AND CONTINUE**
- Press roller landmark construction: **REVISE**
- Bridge structural art composition: **REVISE**
- First-person VLR-7 presentation: **REJECT**
- Current HUD presentation: **REJECT**
- Human map/play acceptance: **BLOCKED** pending integrated combat presentation
  and owner play review

## What changed materially

- The source-frozen Rev5 GLB is 3,232,668 bytes with SHA-256
  `7f9fb6064b514bcfc1ce962357c30eaa71e6539a5aa3dc5115cc73f1bba927d3`,
  24 joined render meshes, and 55,252 Rev5 triangles.
- Bridge supports now use thicker piers, larger feet and frames, stronger edge
  girders, and eight boundary rail posts instead of the prior picket cadence.
- Dark surface families have more separation, while the press roller uses a
  dedicated brushed-steel body and muted-brass collars.
- The capture follows the authored west/Ink route into the lower crouch
  corridor instead of taking a diagonal shortcut through collision.
- The player approached at `(-4621,-2863,-12808)`, crossed the real lower
  trigger, arrived at `(1786,1690,-4214)`, and received one portal presentation
  event.
- Six 1440x900 player-eye frames were captured on an RTX 4090 D3D11 hardware
  renderer with zero browser or page errors.

## Evidence labels

- **MEASURED:** source remained at
  `91f61acb8c5fd4348df2ae18812f9080883478cf`; the run started clean; two
  isolated clients joined; the host retained its accepted identity and
  `53000` authoritative yaw; forward alignment was
  `0.9989774060650497`; the Rev3 fixture retained 339 colliders, 12 spawns, and
  9 zones; one lower-to-upper portal traversal completed.
- **OBSERVED:** the lower portal is now a dominant, discoverable traversal
  target; structural load paths and surface separation are clearer than v10.
  The field still reads like a flat fan, the arrival does not frame the linked
  exit, the bridge remains scaffold-like, the roller remains awkwardly
  suspended, and the rifle/HUD remain the strongest unfinished surfaces.
- **INFERRED:** players should discover and use the shortcut more reliably than
  in v10, but combat readability and product trust remain below acceptance.
- **UNKNOWN:** portal reconnect, opponent silhouettes and animation, ADS,
  recoil/reload contact, ability VFX/audio, death/respawn, spawn safety, and fun
  remain outside this packet.

## Smallest coherent next batch

1. Preserve and checkpoint the strongest Cutline HUD candidate, then integrate
   it without losing current authority diagnostics.
2. Recover the integrated VLR-7 as a real first-person viewmodel with authored
   arms, two-hand contact, ADS, recoil, reload, and muzzle alignment.
3. Finish one representative bridge bay, the press roller mounting, and the
   portal membrane/arrival framing as one map-art batch.
4. Capture one real combat loop covering opponents, movement, equipped
   abilities, portal use, death, respawn, and reconnect for owner review.

Automated checks and this AI visual review do not grant human acceptance.
