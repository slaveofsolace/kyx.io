# P5.9 two-browser authoritative combat proof

Status: **BOUNDED PASS — G4 NOT CLAIMED**

Two separate system-Chrome processes loaded the production `/online` route and joined real opt-in revision-3 Durable Object rooms through local Vite and Wrangler. This was not a synthetic telemetry dashboard. Both rendered the playable combat surface.

## What the two clients visibly proved

- Rifle input was accepted by the authority and applied 10 HP damage per hit.
- Both peer views agreed on the same victim at `dead / 0 HP`, the same score, and the same feed sequence.
- The authority automatically respawned that victim at `alive / 100 HP` while preserving death ordinal, score, and feed.
- A reload and active Impulse Grenade survived disconnect/resume with the same player ID, match ID, projectile ID, ammo, and cooldown state.
- After combat settled, both browsers held byte-identical combat snapshots.
- The opt-in room showed ruleset revision 3 and `d5f0418d1d927370`; the default room contract remains revision 2 and `039ae95bed7ee716`.

## Best visible evidence

- `screenshots/p59-13-shooter-kill-arena-panel.png` — peer down, 0 HP, visible 0–1 score.
- `screenshots/p59-14-victim-death-arena-panel.png` — victim view of the same down state and score.
- `screenshots/p59-15-shooter-kill-feed-panel.png` — accepted shots, 10 HP damage, elimination feed, and the explicit collision limitation.
- `screenshots/p59-18-victim-respawn-panel.png` — the victim alive at 100 HP after server respawn.
- `screenshots/p59-19-live-grenade-before-resume.png` and `p59-21-live-grenade-after-resume.png` — the live purple projectile before and after resume.
- `screenshots/p59-20-reload-grenade-before-resume.png` and `p59-22-reload-grenade-after-resume.png` — identical visible `reloading / cooldown / 1 ACTIVE` presentation; their SHA-256 hashes are identical.
- `videos/p59-client-a-two-room-combat.webm` and `videos/p59-client-b-two-room-combat.webm` — independent-process recordings.

## Regression seal

| Check | Result |
| --- | --- |
| App TypeScript | PASS |
| Worker TypeScript | PASS |
| Full ESLint | PASS |
| Vite production build | PASS |
| Wrangler dry-run | PASS |
| Node Vitest | PASS — 651/651 |
| Worker Vitest | PASS — 7 files, 26/26 |

The only browser console output was the existing Rapier deprecated-initialization warning. There were no browser console errors.

## Exact limit

Movement runs on the real `phase4_flat_run` Rapier fixture. Hitscan occlusion and Impulse Grenade collision still use deterministic evidence ports: clear hitscan occlusion, empty grenade sweeps, and clear radial occlusion. The UI says so directly. This evidence therefore closes bounded browser presentation, combat consequence, respawn, resume, and convergence subclaims only. It does **not** establish accepted real-map combat collision and does **not** close G4 overall.

Machine-readable facts and selected artifact/source hashes are in `p59-two-browser-authoritative-combat-proof.json`.
