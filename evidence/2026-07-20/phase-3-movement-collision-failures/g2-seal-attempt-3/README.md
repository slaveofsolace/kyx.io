# Phase 3 G2 movement/collision evidence

- Automated status: **OPEN_AUTOMATED_FAILURE**
- Human review: **PENDING_HUMAN_REVIEW**
- Visual approval: **NOT_PERFORMED_OR_CLAIMED**
- Baseline HEAD: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Pre-run dirty entries preserved: 54
- Deployment: none performed or authorized

## Reproduce

Run with the bundled Node executable and set `KYX_PNPM_CLI` to the bundled `pnpm.mjs`, then execute:

```text
node tools/evidence/capture-phase3-check.mjs
```

The harness refuses to overwrite this evidence root or its outside-root verification result. It performs a clean pinned install, the complete browser-enabled aggregate check, the expected legacy-asset release rejection, production DEV-surface scan, repeated Node tapes, exact Chromium fixture/driver capture, exact-child server shutdown, manifest generation, and independent manifest verification.

## Sealed results

- Aggregate checks: 10/10; Vitest 323/323
- Browser test matrix: 27 passed, 7 intentionally skipped
- Movement tapes: 18/18; tuning metrics 7/7
- Canonical movement hash: `66fcaf19c3fd94ad`
- Movement profile hash: `8ab4ed437a4393c0`
- Protected Phase 2 replay: `d7201dfc006e72ee`
- Chromium evidence: 67/67; 6 screenshots; 1 WebM
- Production boundary: 10 text artifacts, 0 DEV-only signatures
- Browser/network: no critical console, page, request, external-origin, or application-WebSocket failure

## Scope

This is deterministic non-product fixture evidence. The profile is labeled `HYPOTHESIS` and `fixture_only`; it does not claim ev.io parity, final playability, multiplayer authority, prediction, reconciliation, combat authority, final art, or deployment. Review the six screenshots and the WebM under `browser/` before any human acceptance decision.
