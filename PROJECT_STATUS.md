# Project status

Last updated: 2026-08-09

KYX.IO is in pre-release development. The active target is a coherent
desktop-browser team-deathmatch slice on the original Relay arena that works
consistently in Practice and online at 2, 4, and 8 players. Iron Bastion is
retained as legacy history. Inkfall evidence and profiles remain preserved but
are no longer the product-default map.

## Component status

| Component | Current state | Next acceptance step |
| --- | --- | --- |
| Offline Practice | Relay runs through the browser-local fixed-20-Hz authority host with one player and seven bots, shared Three presentation, combat events, Blink/ability inputs, score, linked portals, and Cutline HUD. Iron Bastion remains separately playable through the legacy menu path | Complete source-frozen human play acceptance and close remaining Practice/online presentation differences |
| Online authority | Worker-authoritative room allocation, movement/combat state, scoring, portal traversal, and reconnect/resume are implemented. Relay is the product-default profile; historical Foundry identities remain explicit for persisted rooms and evidence | Preserve parity while the slice changes; repeat the final 2/4/8 matrix only on the accepted source state |
| Relay | Current v4 authority/render candidate has 56 colliders, 8 spawns, 8 zones, and 2 linked portals. Practice and online share its profile. Functional traversal is proven, but current player-eye evidence rejects the flat sky, collider-like boxes, unsupported slabs, blown-out floor patches, and weak spawn identity | Integrate and visually review the bounded v5 render-art correction without changing authority geometry, then complete human play/readability acceptance |
| Movement | Fixed-20-Hz deterministic KCC, sprint, jump, crouch/slide, Blink intent, portal traversal, prediction/reconciliation, and fail-closed collision recovery are implemented | Prove representative manual traversal and the final source-frozen 2/4/8 matrix; inspect new snags as authored geometry first |
| Map library | Original, KYX legacy, and rights-blocked external reference categories are implemented. Relay is the playable original candidate; Iron Bastion is the legacy arena; external ev.io families remain inspection/reference-only without redistribution rights | Verify the final runtime panel and add only licensed/importable maps |
| Character | The procedural fallback remains playable. Rev43 exported but failed Human Eye review; Rev44 failed its unchanged wrist gate before export; Rev45 is a statically reviewed, source-only anatomical-grip correction with no Blender/render/browser acceptance yet | Run Rev45 once under the protected Blender window, require technical gates and separate Human Eye acceptance, then integrate one Assault role only |
| Animation | A shared 66-bone, 12-action technical contract and directional/action motion sources exist. Exact weapon contact is now representable without a generic runtime CCD overwriting authored contact | Prove Rev45 all-frame contact, locomotion, action continuity, and browser player-eye behavior before claiming animation acceptance |
| Weapons | Rights-cleared Quaternius candidates cover rifle, sidearm, shotgun, sniper, launcher, and melee. VLR-7 exact grip/support/muzzle geometry is decoded, and one-root mounting exists; current scale, secondary-contact, equip/sprint, ADS, hit-feedback, and presentation polish are still under isolated review | Review the isolated armory delivery, then prove each accepted weapon in first- and third-person Practice/online states without overlap |
| Abilities | Blink plus launch, smoke, frag, sticky, and flash authority contracts exist with resources and reconnect persistence. Launch is zero-bounce and first-contact terminal in the current baseline; smoke grows over time. Duplicate throwable audio, local/Worker launch-impulse parity, Blink preview honesty, and whole-roster feel remain open | Review the isolated authority/audio/VFX correction and prove the same outcomes in Practice and real two-client online play |
| HUD/UI | Cutline menu and match HUD are integrated and Practice/online share typed authority values. A source/pixel re-audit found no broad generic-design rewrite warranted, but removed the underlying launch-card overlap while a command panel is open. Historical CSS layering and explicit owner acceptance remain open | Capture the consolidated source state across desktop, narrow, high-contrast, reduced-motion, scoreboard, and online states; then retire superseded CSS as one coherent batch |
| Audio/VFX | Functional feedback exists, including separate launch presentation, smoke, hit/headshot, and kill surfaces. Final mix, duplicate-event prevention, movement/weapon weight, and human-ear acceptance remain incomplete | Integrate the isolated ability and armory corrections, then perform one coherent human-ear/player-eye pass |
| Mobile | A preliminary base exists | Deferred until the desktop arena, character, animation, and gameplay slice are accepted |

## Release gate order

1. Finish Relay v5 visual integration and manual map/play review without
   changing its authoritative fixture.
2. Complete and accept one Assault character with first- and third-person
   presentation.
3. Integrate and accept the shared armory, ability, HUD/loadout, audio, and VFX
   presentation model.
4. Run the final source-frozen 2/4/8 regression and 30-minute authority soak.
5. Resolve project license and source/built-artifact distribution decisions.
6. Deploy and verify staging, including rollback proof.
7. Promote production only after an explicit release decision.

Historical automated evidence remains useful, but it does not approve a newer
source state or replace manual visual/playtest review.
