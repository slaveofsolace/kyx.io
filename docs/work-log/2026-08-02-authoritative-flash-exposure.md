# Authoritative Flash exposure checkpoint - 2026-08-02

## Outcome

Flash now has one agency-preserving authority contract across Practice and online:

- the server owns radius, physical line of sight, distance falloff, target view angle, duration, and expiry;
- facing the detonation produces maximum exposure, a side view produces partial exposure, and looking away retains only bounded peripheral exposure;
- Flash remains non-damaging and non-impulsive;
- movement, input, and weapon intent are not disabled, and the server does not inject hidden random aim error;
- reliable `flash_applied` presentation carries exact duration, intensity, and facing permille while legacy version-1 events without those optional fields remain valid;
- active impairment expiry remains in the authority snapshot and active-match checkpoint, including disconnect/resume;
- Practice and online presentation consume the exact authority envelope;
- overlapping exposures retain the strongest still-active envelope instead of allowing a later short event to truncate longer cover;
- reduced-flash mode keeps the same competitive duration and swaps the luminous flash for a dark, desaturated visor obstruction. It no longer shortens the effect or turns it into a transparent border.
- ability-unavailable notices no longer cancel the independent Flash-expiry timer.

## Consequence decisions

Invisible aim jitter was rejected because it would make correct crosshair placement disagree with server hit direction. Input suppression was rejected because it steals agency. Low-luminance accessibility changes presentation energy, not authority timing, so it does not become a competitive visibility bypass.

The authority exposure envelope is backward compatible: the three new semantic fields are optional for stored legacy events, but any event that supplies one must supply all three and must be a targeted `flash_applied` event for `flash_grenade_v1`.

## Consolidated verification

Bundled runtime: `D:\AI Projects\Tools\node-v22.22.0-win-x64\node.exe`

1. App typecheck - PASS
   - `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`
2. Worker typecheck - PASS
   - `node node_modules/typescript/bin/tsc -p tsconfig.worker.json --noEmit`
3. Changed-surface ESLint - PASS
4. App-focused Vitest - PASS, 4 files / 18 tests before the final stacking/timer delta
   - authority facing, line-of-sight, no-damage/no-impulse behavior;
   - full-room Flash state, reliable semantics, checkpoint and reconnect;
   - fail-closed protocol envelope validation;
   - HUD reduced-flash duration parity.
5. Worker projection Vitest - PASS, 1 file / 5 tests
   - `node node_modules/vitest/vitest.mjs run --config vitest.worker.config.ts tests/worker/combatPresentationProjection.test.ts --maxWorkers=1 --no-isolate`
6. Final browser delta - PASS
   - app typecheck;
   - browser-delta ESLint;
   - HUD regression Vitest, 1 file / 5 tests, including overlap and independent-timer cases.
7. Final Vite production build - PASS, 216 modules
   - Existing chunk-size warning remains: the largest reported route chunk is approximately 2.68 MB before gzip and 934.60 kB gzip.

## Explicit nonclaims

- No player-eye visual or comfort acceptance has been granted for either luminous or low-luminance presentation.
- No sampled Flash audio, tinnitus/ducking mix, caption timing, or opponent tell was added in this checkpoint.
- No online browser capture, 2/4/8 matrix, soak, staging, or production deployment was run.
- This does not approve the rejected Rev33 character or decide Rev34 v2.
