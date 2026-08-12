# Public ev.io clean-room behavior reference

Test contract: public `https://ev.io/`, guest/public match surface, desktop Chrome, keyboard/mouse intent, observed 2026-08-11 and 2026-08-12. This is a behavioral comparison only. No source, protocol, assets, geometry, branding, audio or text are copied.

## OBSERVED

- A public match begins from a single central `CLICK TO PLAY` action after the rotating match loads.
- The pre-entry camera already shows the active arena and combatants, reducing uncertainty about what the action will do.
- Multiple previously observed public cycles changed maps without returning to a product homepage. Observed arenas included materially different snow, industrial, bright teal/white, red/gothic and blue/orange spaces.
- Repeated deaths exposed a short click-to-respawn loop, persistent score/kill-feed context and rapid re-entry.
- The public scoreboard exposed player score, assists, kills, deaths and K/D.
- Weapon fire, impact, damage direction, cooldown state and kill-feed events were visible during the live cycles.
- A fresh 2026-08-12 desktop session exposed an active arena behind the central one-action play gate. Spectate entered the live match and followed moving players while the visible timer advanced from roughly 2:25 to 1:45. Opponent names/health, dust or speed trails, layered vertical routes, portals and high-contrast regional lighting made combat state legible before direct control.
- The current public mode selector exposed Deathmatch, Sniper Shotgun, Team Deathmatch, Infection, Battle Royale and Survival. This is breadth evidence only; KYX is not adopting names, rules text or private implementation details from that surface.

## MEASURED

- Current cold page load reached the named `Winter-Bishop`, `Deathmatch`, `8 players` load card and then the central play affordance in roughly 15 seconds on this connection.
- Entry requires one intended play action after load. The source-matched KYX staging harness separately proves keyboard movement without automating native pointer lock; direct-input latency remains unmeasured rather than fabricated.

## INFERRED

- Keeping match spectating visible behind the one-action gate makes the session feel live before the player commits input.
- Fast death/re-entry and automatic map turnover preserve match momentum better than a full page reload or return to a launcher.
- Strongly differentiated map palettes and silhouettes provide faster spatial re-orientation than one repeatedly reused layout.

## UNKNOWN / TOOL-LIMITED

- Exact end-to-end input latency, weapon TTK distributions, cadence values, death-to-control milliseconds, network reconciliation and audio mix are not remeasured in this post-boot run.
- Native player-control timing and weapon TTK were not measured in the 2026-08-12 public session. Spectate proved a live match and camera following, not first-person input control.
- Competitive balance, accessibility and performance require dedicated controlled sessions.

## Behavioral targets for KYX

- One action from ready state to control.
- No launcher reload between match result and the next ready match.
- A short, measured death-to-control loop with an attributable death and retained match context.
- At least three independent arena layouts with distinct landmark and route identity.
- Authority-owned score, kill feed, respawn and next-match state.
- Immediate, differentiated input and combat feedback without copying the reference game's expression.
