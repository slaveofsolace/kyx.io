# FABLE 5 → CODEX CONTINUATION — KYX.IO FULL-GAME AUDIT LANE

Date: 2026-07-31. Author: Claude Fable 5 (audit/steer lane).

## 1. Exact source state

- Branch: `claude/fable5-kyx-full-audit-20260730`
- HEAD: `7f8f241616555a7e06d40a493a46817ba34795a3`
- Upstream: `origin/claude/fable5-kyx-full-audit-20260730` (pushed, tracking)
- Base / starting SHA: `a1ba98fbd8257c94ac8f787351a69fc9bb011b20` (== `main` == `origin/main` at handoff time)
- Pushed commits on this branch: exactly one, `7f8f241` (`feat: add full-game runtime audit harness and Cutline match immersion`).
- Worktree status at packet time: clean except this document (committed with it).
- Physical checkout for this lane: `evio-fable5-audit` git worktree (sibling of the canonical repo directory), `node_modules` junctioned from the canonical checkout. The canonical checkout was left on `main`.

## 2. CRITICAL COORDINATION FACT — concurrent Codex writer

At session start the canonical checkout was found being **actively edited by the live Codex desktop agent** (uncommitted, growing diff; `codex.exe` resident). Its in-flight batch owns: VLR-7 first-person pose constants (`scale 0.585`, new hip/ADS offsets), contact-rig v3 support-arm alignment, donor-shell material restyle (`loadKyxVlr7QuaterniusReview.ts`), reciprocating-action hide, `inkfallRev5OverheadReadability.ts` (new), runtime/loader wiring, the armory unit-test updates, and a new first-person composition gallery capture tool.

Actions taken to protect both lanes:

1. The canonical checkout was switched back to `main` (pure ref move at the same commit; its uncommitted work untouched) so the Codex batch commits where it expects.
2. All Fable work happened in the separate worktree/branch above.
3. The Fable lane deliberately did NOT touch: weapon pose constants, contact rig, donor materials, map art/lighting modules, Worker sources.

**Merge instruction:** land the Codex weapon/map batch on `main` first, then rebase/merge `claude/fable5-kyx-full-audit-20260730` (expected conflict-free: it touches only `src/ui/kyx-cutline.css` [three small blocks], a new tools file, new evidence, and this document).

## 3. Player-facing verdict (one sentence)

Technically robust and now measurably smoother to inhabit (full-viewport play, legible rail, proven blink/portal/authority loop), but the slice still fails player-eye acceptance on first-person weapon composition, arena value structure, refresh-resume continuity, and the untested damage/kill/respawn feel.

## 4. What was actually played, and how

- Two independent Chrome clients (host+guest) in an authoritative local room (wrangler dev, Durable Objects local) at exact source `a1ba98f`, hardware-rendered (RTX 4090, D3D11 ANGLE), 1440×900 plus 1920×1080 / 1024×640 / 2560×1080 HUD passes.
- Harness: `tools/evidence/capture-fable5-full-game-audit.mjs` (new, committed; record-don't-die stages, JSON report).
- Occupancy: 2 players end-to-end. 4/8 occupancy NOT run this session (source-frozen matrix still owed after the Codex visual batch lands).
- Staging (`kyx-io-preview.pages.dev`) was inspected read-only; existing a1ba98f live frames in `review-evidence/2026-07-30/inkfall-vlr7-portal-cutline-85f7928/` were used as the staging visual baseline. No deployment was made this session.

## 5. Acceptance matrix (evidence-labeled)

| Surface | Verdict | Evidence / note |
|---|---|---|
| Launch → lobby → create/join (2 clients) | KEEP | audit stages green, 0 console/page errors; `01-two-client-spawn.png` |
| Movement (walk/strafe/reversal) | KEEP (MEASURED) | authoritative displacement sane; feel/cadence unrated by ear/eye |
| Jump | UNKNOWN | probe sampling too coarse; re-probe with 60ms polling |
| VLR-7 hip/ADS/fire/reload (dev procedural) | REVISE | `02-weapon-slot0-*.png`; pose re-author in flight in Codex lane |
| VLR-7 donor shell (staging mode) | REVISE (Codex lane) | gated to `MODE==='staging-review'`; dev shows procedural — remember when reading captures |
| Sidearm/Scatter/Longshot/Rocket | BLOCKED (preset) | slots 1–4 `presetAllowed=false` in current preset; only rifle+blade reachable — decide roster exposure |
| Blade | KEEP (runtime) | equips, no ADS (correct), fires |
| Blink | KEEP (MEASURED) | level-pitch preview `valid/ready` at 3.6m, commit teleported (−33265,4053→−29952,2648); earlier "dead zone" reading was the post-use cooldown state — not a defect |
| Launch/Smoke/Frag | PARTIAL | fire+cooldown UI proven; `03d/03e` smoke expansion frames captured; physics/radius/counterplay feel unrated |
| Damage/kill/respawn | UNKNOWN — TOP GAP | combat snapshot exposes no enemy positions (`remotePlayerKeys` in report), so scripted aim-at-enemy failed; needs avatar-transform-driven aim (see §8.1) |
| Scoreboard (Tab) | KEEP (exists) | `05-tab-scoreboard.png`; scan-speed/content unrated |
| Kill feed / feedback HUD | UNKNOWN | never triggered (no kill achieved by harness) |
| Reconnect / refresh resume | **REVISE — S-tier** | after guest reload: identity NOT preserved, room holds 3 player entries, host renders 2 remote avatars (ghost). Score/match continuity itself held. `06*.png`, report `reconnect_resume` |
| HUD (Cutline, online) | KEEP after this batch | full-viewport pointer-locked play (`01c-hud-pointer-locked.png`, appBarVisible:false), rail 11px + active underline; ability instrument already good in source |
| HUD viewports | KEEP (captured) | `07*.png` at 1080p/narrow/ultrawide — review for safe-area regressions |
| Practice parity | UNKNOWN | landing/settings captured (`08*.png`); Start-practice click failed in harness (accessible-name mismatch) — fix probe |
| Audio | LIKELY KEEP (source-level) | synthesis is noise-burst based, "bright square" retro tones explicitly avoided, old siren generator removed; ear-level pass still owed |
| Performance | KEEP | p50 1.9 / p95 3.8 / p99 5.6 / worst 13ms, zero long tasks steady-state; one 1.14s cold-start compile hitch on first run only — consider warm-up pass |
| Map (Inkfall Rev5) | REVISE (Codex lane) | dark overhead mass/value inversion per existing player-eye packet; runtime GLB material names + near-black albedo documented in session notes |
| Portal | KEEP | prior live traversal proof + frames; unchanged |
| Packaging/provenance/staging isolation | KEEP (unchanged) | nothing in this lane touched packaging, secrets, or deploys |

Component completion (functional 30 / runtime 20 / player-eye 20 / evidence 15 / acceptance 15): overall slice ≈ **58/100** — functional 26, runtime 17, player-eye 6, evidence 9, acceptance 0 (owner has accepted nothing).

## 6. Validation commands and results (this branch)

- `node --check tools/evidence/capture-fable5-full-game-audit.mjs` — pass.
- `node node_modules/eslint/bin/eslint.js tools/evidence/capture-fable5-full-game-audit.mjs` — clean.
- Full harness run at `a1ba98f`+HUD edits: **13/13 stages completed, 0 console errors, 0 page errors** — `evidence/2026-07-31/fable5-full-game-audit-a1ba98f/audit-report.json` (+25 PNGs, LFS).
- App/Worker/sim typechecks and the full vitest suites were NOT rerun here (no TS/Worker source changed in this lane); hosted CI on the pushed branch is the arbiter.

## 7. Environment facts the next agent needs

- No system Node: use `D:\AI Projects\Tools\node-v22.22.0-win-x64\node.exe`; call repo binaries directly (`node node_modules/<tool>/...`). npm.cmd exists in that portable dir if ever needed.
- `wrangler dev` requires `./dist` to exist (assets.directory) — harness auto-creates a stub in fresh worktrees.
- Fresh worktrees need selective LFS hydration: CI include-list in `.github/workflows/ci.yml` plus `assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/**`.
- The local PowerShell tool hangs on this machine; use Git Bash. Blender 5.1 at `C:\Program Files\Blender Foundation\Blender 5.1` (bundled Python works for zip/scripts).

## 8. Five highest-impact next actions

1. **Close the combat-feel gap**: extend the harness to read remote avatar world transforms from the presentation layer (or add a diagnostics hook exposing remote positions), then drive approach→damage→kill→respawn and capture hit/kill/death/respawn HUD+audio evidence. This is the largest unaudited player surface.
2. **Fix refresh-resume**: persist the resume token (sessionStorage) and rejoin as the same player; reap the ghost entry server-side on resumed identity. Evidence: report `reconnect_resume` (3 entries / 2 avatars / new id).
3. **Land the Codex weapon/map batch, then re-run this harness + the g5 player-eye route on the merged SHA** for before/after; then the source-frozen 2/4/8 matrix.
4. **Roster decision + exposure**: preset currently ships rifle+blade only; either author the remaining four weapons' first-person composition (constants exist for all six) behind presets deliberately, or hide inactive slots' keys from the rail UX story.
5. **Practice-parity + ear-level audio pass**: fix the Start-practice probe (accessible name), compare binds/roster/HUD practice-vs-online, and do one human listening pass against the no-retro/no-siren rule.

## 9. Human (owner) decisions required

Unchanged and still open: project license (root is UNLICENSED), distribution mode (source/built/both), final visual acceptance of weapon/map/HUD/character, production deployment, public-repo promotion, and now: intended weapon-roster exposure for the vertical slice (2 weapons vs 6).

## 10. Budget stop state

Handoff began with ~USD 95 Fable 5 credit. Work stopped for reserve when the audit+HUD checkpoint was pushed and this packet written — remaining reserve target 12–15% was honored; no implementation was left mid-edit. The concurrent Codex lane made large duplicate implementation unnecessary; this lane converted the budget into runtime truth (working audit harness + measured defects + immersion/rail fixes) instead of merge conflicts.
