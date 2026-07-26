# G3 exact-authority interpolation diagnostics

Status: **harness correction implemented; successful proof not yet captured**

The preserved `local-v7` P5.15 run reached eight joined product clients but
timed out during its final interpolation check. Independent parsing confirmed
that the capture froze the mover's locally predicted endpoint immediately
after automation entered the target radius. While the server drained queued
inputs, the mover reconciled to a later authoritative position, but the
observer was still being compared with the stale predicted coordinate.

The failure remains genuine and preserved. It does not by itself establish a
production interpolation defect, because the old proof used both:

- nearest-position matching instead of the mover's exact player/entity ID; and
- a one-time predicted endpoint instead of the mover's settled authoritative
  position.

## Correction

The online preview's read-only diagnostic snapshot now exposes:

- local predicted and authoritative positions;
- the latest prediction error and pending prediction-history count; and
- remote entity IDs, positions, and interpolation modes.

The P5.15 capture now:

1. identifies the remote mover by exact entity ID;
2. waits for bounded local prediction/authority settlement after input release;
3. compares the observer with the settled authoritative position;
4. records prediction error, settlement duration, stable samples, exact remote
   interpolation mode, target distance, and observer convergence time; and
5. requires a 750 mm peer bound in both capture and independent verification.

The source freeze was expanded from 31 to 77 runtime-relevant files, including
the client prediction/interpolation modules, deterministic simulation closure,
Inkfall authority fixture, Worker persistence/runtime modules, build
configuration, package locks, CSP, and both capture verifiers. The capture also
records and requires an unchanged Git HEAD plus normalized dirty-tree digest
for the entire capture window, excluding only its generated output directory.

## Executed checks

- `node --check` for both P5.15 capture verifiers: pass.
- Focused ESLint for the route and capture/verifier scripts: pass.
- Main TypeScript typecheck: pass.
- Production Vite build: pass, 155 modules transformed.
- Online authority/client focused tests: 3 files, 26/26 pass.
- Deterministic Inkfall authority playtest: 1 file, 9/9 pass.
- Stored local-v6 and local-v7 failure verification: pass in read-only mode.

## Claim boundary

No new 2/4/8-client capture has been run yet. This change makes the next
capture materially more diagnostic and less ambiguous; it does not turn any
preserved failure into a pass and does not close G3, G4, or G5.

*Currently being worked on.*
