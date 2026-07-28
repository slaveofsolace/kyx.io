# Six-weapon presentation batch — implementation candidate

Date: 2026-07-28
Branch: `codex/weapon-presentation-batch-20260728`
Base: canonical `ec277d0fcf7767172123ab7d8b201ff8258d6c4c`

## Implemented

- Replaced the online Rev4 route's generic weapon construction with six
  project-authored Three.js presentation models:
  - VLR-7 line rifle
  - K-9 arc sidearm
  - SG-4 breach scattergun
  - Longbow-12 sniper
  - BR-6 siege launcher
  - EDGE-1 phase saber
- Each model has a distinct silhouette/material accent, dedicated first-person
  placement, third-person hand-socket compatibility, and an explicit authored
  muzzle/nozzle node. The rocket also has a separate backblast marker.
- Added moving presentation parts for fire/reload state: rifle action and
  magazine, pistol slide/chamber/cell, shotgun pump/drum, sniper bolt/magazine,
  rocket chamber, and saber blade pulse.
- Replaced the generic sphere/line feedback with family-specific muzzle flashes,
  cylinder tracers, authoritative pellet spread rays, shield/health impacts,
  melee arcs, rocket trail/plume/detonation, and readable short-lived light.
- Added a code-synthesized audio palette. No external audio or upstream asset is
  imported. Rifle, pistol, scattergun, sniper, rocket, saber, reload, shield,
  health, melee, and blast signatures are generated with Web Audio oscillators,
  deterministic noise, filters, and envelopes after a user gesture.
- Moved weapon effects/audio/projectile presentation out of
  `onlineAuthorityThreeRuntime.ts`; that runtime now orchestrates the model and
  effect modules.

## Authority boundary

- Fire presentation starts only from validated
  `weapon_attack_accepted` reliable-event semantics.
- Damage feedback starts only from validated `damage_applied` semantics.
- Melee contact and rocket detonation feedback use their dedicated reliable
  semantic events.
- Rocket movement/trails use authoritative weapon-projectile snapshots.
- Reload start/completion presentation follows authoritative selected-weapon
  snapshot phase transitions.
- The implementation does not create hits, damage, ammo, projectile motion, or
  reload completion.

## Intentional nonclaims

- A hitscan miss has no authoritative world-contact point in the current event
  contract, so it receives a confirmed attack tracer but no invented wall-hit
  decal.
- The synthesized audio is non-positional in this candidate and remains silent
  until the browser grants audio after user interaction.
- The inspection gallery is presentation-only. It does not prove multiplayer
  balance, feel, accessibility mix, long-session cleanup, or release readiness.
- This isolated candidate is not merged, pushed, deployed, or human-accepted.
