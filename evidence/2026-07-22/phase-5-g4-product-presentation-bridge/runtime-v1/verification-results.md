# Final verification results

Executed on 2026-07-22 against the final source state and final runtime capture.

| Gate | Result |
|---|---|
| Application TypeScript (`tsconfig.json`) | PASS, zero diagnostics |
| Worker TypeScript (`tsconfig.worker.json`) | PASS, zero diagnostics |
| Full ESLint graph | PASS, zero errors/warnings |
| Full default Vitest | PASS, 86 files / 711 tests |
| Full Worker Vitest | PASS, 10 files / 36 tests |
| Vite production build | PASS, 154 modules transformed |
| Wrangler isolated deploy dry-run | PASS, no deployment performed |
| System-Chrome two-context runtime capture | PASS, 12.5 seconds |
| `verify-evidence.mjs` | PASS |
| Post-capture ports 5173 and 8787 | RELEASED |

Vite emitted its existing large-chunk advisory. Several real-Rapier tests emitted the existing deprecated-initialization advisory. Neither command failed and neither warning originated in this bounded bridge change.

The final verifier pinned `runtime-facts.json` to:

`b8a2f4d41b71e109e4c22b06e64c76e9680b6b1b101abd09be2c99229f0bda11`
