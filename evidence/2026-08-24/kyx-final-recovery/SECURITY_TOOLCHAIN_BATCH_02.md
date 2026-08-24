# Security/toolchain batch 02

Date: 2026-08-24  
Parent source commit: `4541900ac4790f87c8c4ca33d22abf04d04dc6fa`

## Change

- `@cloudflare/vitest-pool-workers`: `0.18.6` -> `0.22.0`
- `@cloudflare/workers-types`: `5.20260719.1` -> `5.20260823.1`
- `wrangler`: `4.112.0` -> `4.125.0`
- `eslint`: `10.7.0` -> `10.9.1`
- `vite`: `8.0.16` -> `8.2.2`
- Lockfile transitive fixes include non-vulnerable `brace-expansion`, `nanoid`, `postcss`, `sharp`, and `undici` versions selected by the exact dependency graph.
- Restored the proven unique 20-weapon procedural viewmodel/muzzle browser contract from preserved commit `86870ee1d74eb5421e70fdf8187bef3f52f2daad`.

No gameplay runtime dependency major was changed. No `audit fix --force`, deployment, or external state mutation was used.

## Security result

- Before: 8 high, 0 critical (`npm audit`).
- After exact clean install: 0 total vulnerabilities across 266 dependencies.
- G9 control audit: PASS; 5,327 tracked paths scanned; zero probable-secret findings.
- Release status remains BLOCKED by project-license selection, accepted runtime character, and distribution-mode decisions.

## Acceptance

- `npm ci --ignore-scripts`: PASS; lockfile closes; 0 vulnerabilities.
- Four TypeScript project checks: PASS.
- ESLint: PASS.
- Main Vitest: 167 files, 1,097 tests PASS.
- Worker Vitest with the upgraded pool: 14 files, 69 tests PASS.
- Production Vite build: PASS.
- Wrangler 4.125.0 dry-run bundle: PASS; both Durable Object bindings present; no deployment.
- Release asset validation, provenance cleanup, and closed-world package verification: PASS mechanically; zero release-admitted binary assets.
- Intended browser matrix: 64 PASS, 16 intentional mobile/online skips, 0 failures. This includes the restored weapon test in desktop and mobile configurations.
- Genuine multiplayer browser matrix: 4/4 PASS, including 2/4/8 clients with resume, Switchyard/Crownpoint bindings, rotation, and stale-boundary liveness.

## Invalid invocation excluded from acceptance

One direct Playwright invocation omitted its file filter and therefore attempted to load Vitest files under `tests/`. The resulting runner/JSON-import errors are a test-runner selection error, not a game or dependency regression. It is excluded from acceptance. The subsequent explicit `browser`-path matrix is the recorded result above.

## Remaining scope

This batch removes the known dependency audit blocker and restores a missing internal verification contract. It does not implement the missing modes, Battle Royale arena, persistence/accounts/social/editor systems, or human gameplay acceptance itemized in `FINAL_COMPLETION_GAP_MATRIX.md`.
