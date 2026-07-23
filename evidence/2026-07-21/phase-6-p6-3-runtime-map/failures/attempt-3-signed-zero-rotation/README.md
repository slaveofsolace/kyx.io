# Integration attempt 3 - signed zero in converted rotation

Result: **FAIL (representation regression)**

Reproduction:

```powershell
node node_modules/vitest/vitest.mjs run tests/integration/physics/inkfallMapRuntime.test.ts --reporter=verbose
```

Exact failure: the known first route box had the correct center, dimensions, and
`-10305` milli-degree Y rotation, but its X component was JavaScript `-0` instead
of canonical `0`.

Root cause: `Math.round` preserves negative zero for a tiny negative Euler
component. JSON serialization and the fixture hash already represented it as
zero, but the in-memory value was not canonical. Fix: normalize signed zero for
all GLB-to-map center and Euler rounding. The exact coordinate regression remains
in the integration suite.
