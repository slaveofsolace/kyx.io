# Project status

Last updated: 2026-08-01

KYX.IO is in pre-release development. The active target is a coherent
desktop-browser team-deathmatch slice on Inkfall Foundry that works consistently
in Practice and online at 2, 4, and 8 players.

## Component status

| Component | Current state | Next acceptance step |
| --- | --- | --- |
| Offline Practice | `/practice` runs one browser-local fixed-20-Hz Inkfall authority host with one player and seven deterministic bots, the shared Three presentation, combat events, Blink/ability inputs, score, and Cutline HUD. It now binds the Revision 4 collision correction and passes two byte-identical 1+7 runs for 300 authority ticks, beyond the former deterministic tick-163 east-rail failure. The root launcher remains explicitly labeled Iron Bastion because it still owns the legacy runtime | Capture a fresh player-eye run and close remaining Practice/online command and presentation differences before manual play acceptance |
| Online authority | Worker-authoritative room allocation, movement/combat state, scoring, and reconnect/resume are implemented. The current Rev5 profile binds Revision 4 authority; the older Rev4 / Revision 3 identity remains isolated for persisted rooms and checkpoints. Browser, Worker, gateway, portal, spawn, and map selection now agree fail-closed | Preserve parity while the slice changes; repeat the final 2/4/8 matrix only on the source-frozen vertical slice |
| Inkfall Foundry | Rev5 render-art review candidate now sits over versioned Revision 4 authority: 339 colliders, 12 spawns, and 9 zones. One intrusive east-choice rail was shortened by 141 mm while every other collider and render data remained unchanged. Exact-pose and sustained 1+7 deterministic regressions pass; visible rough geometry and human map acceptance remain open | Complete collision-overlay, sightline, spawn-safety, combat-readability, performance, portal, and player-eye review; do not infer visual approval from the geometry fix |
| Movement | Fixed-20-Hz deterministic KCC, sprint, jump, crouch/slide, Blink intent, portal traversal, prediction/reconciliation, and fail-closed collision recovery are implemented. The known east-choice depenetration fault is corrected without widening global tolerance | Prove representative manual traversal and the final source-frozen 2/4/8 matrix; inspect any new snag as authored geometry first |
| Map library | Original, KYX legacy, and rights-blocked external reference categories are implemented. Inkfall now launches `/practice`; Iron Bastion remains the explicitly labeled legacy root experience | Verify the runtime panel and add only licensed/importable maps |
| Character | Procedural fallback is playable; earlier visual batches are preserved outside the release package | Complete one Assault role end to end on the shared anatomy/rig foundation |
| Animation | Core technical clips and procedural contact systems exist | Add complete directional locomotion, air/slide/action/hit/death coverage and first-person contact proof |
| Weapons | Six online weapon families and the broader Practice arsenal have procedural models. VLR-7 contact v5 narrows the ADS arm silhouette and preserves one weapon/two grip contacts, but remains procedural review art | Converge Practice/online presentation and integrate any selected asset pack only after provenance and runtime review |
| Abilities | Blink and five grenade-family contracts exist with authority resources and reconnect persistence. Practice uses shared Blink hold-preview/release intent and typed Q/E/F/Z projection. Launch v2 now passes its consolidated app/Worker gate as a gravity-driven, no-bounce, first-world-contact projectile with coalesced presentation. Smoke concealment and Flash impairment are not yet one authoritative gameplay truth, and the promised locked-Q plus three selectable abilities flow is incomplete | Capture Launch v2 in the real browser slice; then implement authoritative smoke/Flash semantics, custom Q+3 selection, and cohesive physics/audio/VFX |
| HUD/UI | Cutline menu and match HUD are integrated, and Practice/online share typed authority values. They do not yet share one final component tree: route-specific markup and accumulated CSS can still diverge. The full-viewport Practice capture proves data connection, not visual acceptance | Converge one component hierarchy, remove superseded CSS, then complete representative desktop, reduced-motion, high-contrast, Practice, and online visual review |
| Audio/VFX | Functional feedback exists | Replace placeholder/retro-feeling cues and complete weapon, movement, ability, hit, headshot, and kill feedback |
| Mobile | A preliminary base exists | Deferred until the desktop arena, character, animation, and gameplay slice are accepted |

## Release gate order

1. Finish the Inkfall Rev5 structural candidate and manual map/play review.
2. Complete and accept one Assault character with first- and third-person
   presentation.
3. Converge the shared HUD/loadout/gameplay presentation model.
4. Run the final source-frozen 2/4/8 regression and 30-minute authority soak.
5. Resolve project license and source/built-artifact distribution decisions.
6. Deploy and verify staging, including rollback proof.
7. Promote production only after an explicit release decision.

Historical automated evidence remains useful, but it does not approve a newer
source state or replace manual visual/playtest review.
