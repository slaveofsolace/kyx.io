# Browser attempt 2 - Vite URL-module request accounting

Result: **FAIL (test assertion)**

Reproduction is the same command recorded in attempt 1.

Exact failure: expected two `.glb` requests, received four:

1. `render.graybox.glb?import&url`
2. `collision.authority.glb?import&url`
3. `render.graybox.glb`
4. `collision.authority.glb`

Root cause: Vite first resolves each `?url` module, then the runtime fetches the
two returned artifact URLs. The assertion counted module-resolution requests as
artifact fetches. Fix: classify actual artifact responses as queryless `.glb`
URLs, require exactly two, and continue checking that all requests are local and
error-free. The final browser run passed 1/1.
