# Project status

Last updated: 2026-07-30

KYX.IO is in pre-release development. The active target is a coherent
desktop-browser team-deathmatch slice on Inkfall Foundry that works consistently
in Practice and online at 2, 4, and 8 players.

## Component status

| Component | Current state | Next acceptance step |
| --- | --- | --- |
| Offline Practice | Playable on Iron Bastion with bots, movement, weapons, abilities, scoring, and HUD | Converge presentation and loadout behavior with online play |
| Online authority | Worker-authoritative room allocation, movement/combat state, scoring, and reconnect/resume are implemented | Repeat the final 2/4/8 matrix on the source-frozen vertical slice |
| Inkfall Foundry | Rev5 render-art review candidate over the frozen Revision 3 authority package: 339 colliders, 12 spawns, and 9 zones. Bridge/landing grounding, the enclosed foundry treatment, and paired depth-tunnel portals are implemented; the art remains non-release | Capture real browser player-eye evidence, then complete manual collision, sightline, spawn, combat-readability, performance, and play review |
| Map library | Original, KYX legacy, and rights-blocked external reference categories are implemented | Verify the runtime panel and add only licensed/importable maps |
| Character | Procedural fallback is playable; earlier visual batches are preserved outside the release package | Complete one Assault role end to end on the shared anatomy/rig foundation |
| Animation | Core technical clips and procedural contact systems exist | Add complete directional locomotion, air/slide/action/hit/death coverage and first-person contact proof |
| Weapons | Six online weapon families and the broader Practice arsenal have procedural models | Converge Practice/online presentation and integrate any selected asset pack only after provenance and runtime review |
| Abilities | Blink and five grenade-family contracts exist with authority resources and reconnect persistence | Finish Blink preview parity, smoke/flash behavior, portal traversal, and cohesive physics/audio/VFX |
| HUD/UI | Cutline menu and match HUD are integrated | Complete representative desktop, reduced-motion, high-contrast, Practice, and online visual review |
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
