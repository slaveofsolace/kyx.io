# Ability parity implementation and verification

Date: 2026-08-09

Worktree: `D:\AI Projects\Projects\Games\evio\evio-ability-parity-20260809`

Branch: `codex/ability-parity-20260809`

Frozen baseline: `520d94c5c9bd54b5b138ca25a116a1781f3e3356`

## Implemented contract

- Launch uses the Worker throwable and impulse rules as the local prediction source. Its zero-tick fuse is armed by the first accepted world contact, it has zero generic bounces, and local consequence prediction uses the same radius, self/target caps, falloff, line-of-sight, and friendly-target rules as authority.
- Launch contact emits one readable `ability_contact` transition before the normal accepted detonation event. Target-specific impulse events do not replay the detonation sound.
- Smoke retains a 5,880 mm authority radius (approximately 40% above the earlier 4,200 mm coverage) and 200-tick authority lifetime. Both local and online presentation use the same 27-tick/1.35-second smooth expansion curve, 16 bounded puffs, and a bounded one-tick prediction lead while gameplay visibility continues to use authoritative state.
- Blink preview mirrors the authority capsule sweep, occupancy fallback, forbidden-volume, kill-volume, ground, range, resource, and cooldown checks. The preview records the exact look intent, is depth-tested, fails closed for invalid space, and release submits only the intent that produced the active eligible preview. The Worker still recomputes and owns destination, cost, and cooldown.
- Fixed Q Blink plus exactly three selectable E/F/Z ability slots remains the shared loadout schema used by persistence normalization, menu rendering, Practice input, and Worker validation. Blink display metadata now matches authority at 9 m range and 8 s cooldown; its cost remains the Worker cooldown-only resource contract.
- Online throwable audio has one selected owner. Three-dimensional presentation owns generic throwable and Launch detonation cues; route presentation owns input, contact, rejection, and Blink feedback; two-dimensional fallback remains explicit and fail-closed.
- Owned audio surfaces use finite, non-melodic procedural one-shots. Authority IDs are normalized before profile selection. Sticky contact, Launch detonation, Flash detonation, Smoke deployment, and rejection now select distinct finite roles. No external audio asset was imported.
- Practice and online continue to consume the same reliable authority-event model and the same Three presentation path.

## Source inspection findings

- The local GrenadeSystem had independent throwable constants and generic lifecycle behavior, while the Worker held the authoritative rules.
- A zero-duration Launch fuse could be evaluated before contact in the local path, allowing an airborne prediction detonation.
- Online route and Three presentation paths could both play the same accepted throwable event.
- The Smoke authority state advanced in ticks and presentation had no shared time-based growth contract.
- Blink collision prediction was already authority-shaped, but release did not prove that the submitted look intent was the one that produced the eligible marker.
- Ability audio callers passed authority IDs into helpers that compared short names, selecting generic profiles.
- No active looping siren was found in the owned surfaces. The existing ambient loop is a non-tonal ventilation bed; no new loop was added. This is source inspection, not listening evidence.

## Consolidated static verification

The final source pass used the locally installed dependency tree and the bundled Node 24 runtime. The repository declares `npm@11.18.0`; npm was unavailable in this environment, so dependencies were installed with `pnpm install --lockfile=false --ignore-scripts`. No lockfile changed. That toolchain variance is a merge-time retest risk.

Final results:

- `tsc -p tsconfig.json --noEmit`: PASS.
- `tsc -p tsconfig.worker.json --noEmit`: PASS.
- ESLint over all changed TypeScript source and focused test files: PASS.
- Vitest over the ten focused contract files: PASS, 34/34 tests in 3.52 seconds.

Focused files:

- `tests/unit/authority/combat/impulseGrenade.test.ts`
- `tests/unit/authority/combat/abilityLoadoutRuntime.test.ts`
- `tests/unit/abilities/abilityPresentationSemantics.test.ts`
- `tests/unit/abilities/abilityLoadoutContract.test.ts`
- `tests/unit/app/localInkfallPracticeInput.test.ts`
- `tests/unit/app/onlineAuthorityPresentationRouting.test.ts`
- `tests/unit/app/onlineBlinkPreview.test.ts`
- `tests/unit/app/onlineBlinkPreviewPresentation.test.ts`
- `tests/unit/core/abilityAudioContract.test.ts`
- `tests/unit/weapons/grenadeSystem.test.ts`

The first focused run exposed an airborne Launch detonation when the zero-tick fuse was checked before contact: 32/33 tests passed. The source contract was corrected and an explicit airborne-before-contact regression was added; the single final consolidated rerun passed 34/34.

## Shared-runtime hold

The continuation imposed an authoritative hold on Blender, Unreal, browser, dev server, build, capture, and protected runtime activity. A previously started local dev process was terminated immediately. No build or post-change runtime/capture was run after the hold. The PNGs under `baseline-runtime` predate the source changes and are tool-limited baseline context only; they are not post-change evidence or acceptance evidence.

## Deferred runtime evidence procedure

Run only after the shared-runtime hold is explicitly lifted, in a clean integration worktree at the merged commit:

1. Use the repository-declared Node/npm toolchain: `npm ci`, then `npm run typecheck`, `npm run typecheck:worker`, and the same focused Vitest files.
2. Run `npm run build` and retain the complete command output and artifact hash.
3. Start loopback only: `npm run dev -- --host 127.0.0.1 --port 6419 --strictPort`.
4. Run `npx playwright test tests/browser/local-inkfall-practice.spec.ts`, then use the approved runtime driver for a controlled Practice pass.
5. Verify Launch stays airborne until contact, reports bounce count zero, emits contact before detonation, reconciles to the Worker result, and applies the documented self/target impulse caps without friendly or through-wall consequence.
6. Verify Smoke reaches 5,880 mm effective coverage, expands continuously for about 1.35 seconds, never exceeds 16 puffs per field, follows authority lifetime/fade, and does not alter gameplay visibility from client-predicted age.
7. Verify Blink shows 9 m and 8 s/cooldown-only readiness, never presents a reachable marker through blocked or invalid space, submits the previewed look intent, and accepts the Worker correction without a second client-side commitment.
8. Run a two-client local Worker session. Confirm one accepted throwable cue per lifecycle role, no duplicated Launch pulse for per-target impulse events, equivalent Practice/online event semantics, and deterministic reconciliation counters.
9. Listen on headphones and speakers for level, masking, fatigue, spatial clarity, rejection clarity, contact/detonation distinction, and any unintended siren or loop. Record the listener, device, build hash, and verdict.
10. Capture representative desktop frames and event logs, then obtain named Human gameplay, visual, and audio review before merge approval.

## Compatibility and open risk

- Stored loadouts remain schema version 1 and normalize through the existing persistence path; no migration is required. Invalid or older records continue to fall back through the current schema normalization.
- Blink metadata correction affects presentation only; authoritative cooldown/resource behavior is unchanged.
- A very short Blink tap that never produced an active eligible hold preview now submits no Blink intent. This is intentional fail-closed behavior and needs runtime usability review.
- Legacy GrenadeSystem now imports authority-rule modules, adding those modules to its browser bundle dependency graph. Typecheck and focused tests pass; build/integration verification is deferred by the hold.
- Visual mesh radii remain presentation-specific while collision radii come from the Worker contract. Future tuning must preserve that distinction.
- All new audio is original procedural source. No listening evidence exists, so final sound quality, mix balance, and absence of every perceived siren-like quality remain unresolved.

## Explicit nonclaims

- No post-change runtime, browser, build, capture, two-client, or listening evidence was produced under the hold.
- The baseline images do not prove the changed physics, smoke, Blink, audio, VFX, authority, or reconciliation behavior.
- Focused static checks do not establish Human gameplay, visual, or audio acceptance.
- This batch is not merged, pushed, deployed, released, or self-approved.
