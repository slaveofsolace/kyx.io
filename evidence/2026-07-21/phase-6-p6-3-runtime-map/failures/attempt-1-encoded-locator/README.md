# Browser attempt 1 - encoded locator mismatch

Result: **FAIL (test assertion)**

Reproduction:

```powershell
$env:KYX_PLAYWRIGHT_PORT='4177'
node node_modules/@playwright/test/cli.js test tests/browser/map-package-route.spec.ts --project=chromium-desktop --reporter=list
```

Exact failure: the test searched for a double-encoded middle-dot string and
could not find the visible boundary label at line 48. The page had already
reached `data-map-status="ready"`, the package facts and authority canvas were
visible, and the error context contained the expected 346/346/2/348 counts.

Root cause: a non-ASCII literal in the test source did not match the browser's
decoded text. Fix: target `.map-lab__boundary` and use an ASCII-stable regular
expression spanning the separator. The runtime source was not changed to hide
the failure.
