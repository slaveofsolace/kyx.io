# KYX.IO — project notes (for Claude / new sessions)

A Three.js browser FPS (an **ev.io**-style arena shooter), built with **Vite**.
The repository currently has no authorized automatic production-deployment
path. Treat public builds as historical baselines until release gates pass.

## How to run / build
- Dev: `npx vite --port 5999 --host`
- Build: `npm run build` → outputs to `dist/` (Vite `base: './'`, works from any web root)
- Headless screenshots for verification: Playwright + swiftshader; GLBs take
  ~30s to load. Log in via `#auth-guest-btn`, start a match via `#play-btn`.

## Deployment authorization gate
- `kyrx.live` is a historical public baseline, not evidence that the current
  repository is approved for another production release.
- `.github/workflows/deploy-vps.yml` is now a manual static-build verification
  workflow. It does not use VPS secrets, transfer files, or deploy on pushes.
- Local and staging validation are implementation work. Production deployment,
  paid services, DNS changes, and other external mutations require explicit
  user authorization after security, rollback, provenance, and release gates.

## Legacy relay (comparison only)
- `server/` preserves the original client-trusting WebSocket relay solely as a
  local comparison fixture. It is **not an online or authoritative multiplayer
  server**: clients can claim kills and it simulates no movement, collision,
  combat, damage, or score authority.
- It always binds to `127.0.0.1`, has no client build-time endpoint, and must not
  be proxied, tunneled, deployed, or described as a live match server.
- Run it only when comparison work requires it: `cd server`, `npm ci`, then
  `npm run legacy:relay`. See `server/README.md` for the containment contract.

## Working branch
- Use the task's current worktree/branch. A merge or push does not authorize a
  production deployment.

## Layout
- `src/core/Game.js` — main loop, state, match flow, HUD wiring, map-loading card.
- `src/world/World.js` — the map. Currently the **Winter-Bishop town**: textured
  building blocks in 3 rings, avenues/plaza, walkable snowy rooftops, ramps +
  rooftop bridges, grav-lifts, central pavilion, snow drifts, string lights.
  Collision via `colliders[]` (boxes) + `platforms[]` (walkable tops) +
  `groundHeightAt()`. Snowy overcast palette, no neon.
- `src/player/` — `HumanSoldier.js` (rigged Mixamo Vanguard w/ procedural armor,
  worn-metal PBR detail textures, `setLocomotion()` speed-scaled anim + idle
  breathing), `PreviewCharacter.js` (also loads Blender `public/spartan.glb` for
  the menu preview), `skins.js` (default = white/silver spartan), `Player.js`.
- `src/weapons/` — WeaponSystem, weapon defs, skins, `WeaponModels.js` (GLB).
- `src/ui/` — `MainMenu.js` (truthful offline-practice, local loadout, and
  settings panels), `HUD.js` (health, ammo, local practice score, scoreboard,
  and measured post-run results), `Nameplates.js`, `DamageNumbers.js`, and
  `WeaponThumbnails.js` (renders local weapon thumbnails).
- `public/*.glb` — soldier, player, spartan, weapons, zombie models.
- The old `src/core/NetClient.js` and `src/core/ServerSim.js` launch paths are
  removed. `server/` is a loopback-only historical relay used for protocol
  comparison, never production multiplayer.

## Design system (CSS in `src/style.css`)
- ev.io-inspired: dark translucent glass panels, **cyan** accent (`--kx-cyan`),
  consistent section labels w/ accent bars. Big appended sections at the end of
  the file: "PAGE UI OVERHAUL", "IN-GAME HUD OVERHAUL", inventory cards,
  scoreboard, achievements, map loading screen, inventory v2 toolbar.

## Done this project (high level)
- Full menu/page restyle; in-game HUD restyle; floating damage numbers;
  ev.io post-match leaderboard; PROFILE nav dropdown (Inventory/Career/Achievements);
  Achievements page; hold-TAB in-game scoreboard; survival wave HUD + wave bonus
  + best time; **1:1 inventory** (per-gun tabs, no main/map split);
  vertical weapon wheel; enemy nameplates; coin-earn popups; Winter-Bishop
  map + map loading screen; Esc opens the full nav GUI mid-match;
  fixed false-positive mobile controls on desktop (pointer-lock now works);
  **Inventory v2** = real skinned-weapon renders + search + rarity filter chips.

## Known constraints / notes
- Can't generate/sculpt realistic character meshes from an image; the player
  model is a themed rigged Vanguard + a procedural Blender `spartan.glb`. For a
  truly realistic character, drop in an authored/licensed `.glb` and wire it via
  `PreviewCharacter.js`.
- Keep chat sessions from getting huge (lots of embedded video/screenshots) — it
  can trip a 32MB request limit. Prefer short clips + fresh sessions.
</content>
