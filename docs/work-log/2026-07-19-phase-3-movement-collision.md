# Phase 3 work log — movement/collision vertical slice

- Date: 2026-07-19 (America/Chicago)
- Final technical seal: 2026-07-20 (America/Chicago)
- Human acceptance: 2026-07-20 (explicit `Accept G2` decision)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Current gate: G2 deterministic movement
- Gate status: **G2 ACCEPTED — PHASE 4 AUTHORIZED**
- Deployment: none performed or authorized

## Target

Implement the handoff pack's P3.1–P3.9 movement/collision vertical slice without weakening the truthful Phase 1 Offline Practice product boundary or the sealed Phase 2 deterministic foundation.

G2 requires repeated collision fixtures, a stable 20 Hz replay hash, logged route metrics, frame-schedule-independent authority trajectories, correct stance/teleport collision, and proof that camera accessibility settings do not alter authority.

## Starting state

The legacy `Player.update(deltaTime)` path mixes render-frame input, camera, audio, gameplay movement, collision correction, and map-specific teleport behavior. Phase 2 provides a portable integer 20 Hz simulation foundation, but deliberately contains no capsule controller, gravity, grounded movement, crouch occupancy, slide, or teleport shape sweep.

The Phase 2 foundation replay hash is a protected regression sentinel:

```text
d7201dfc006e72ee
```

## Implemented architecture boundary

- `src/sim/movement/**` owns pure integer movement state, rules, canonical serialization, and replay. It imports only within `src/sim` and receives collision answers through `MovementQueryPort`.
- `src/physics/**` owns a pinned Rapier deterministic-compat runtime, collision layers, strict compact fixtures, and the Rapier implementation of the project query port.
- `src/app/movement/**` owns browser input latching, camera presentation settings, legacy-camera migration, and raw-pointer-lock fallback. Camera objects/settings do not enter movement commands or canonical state.
- Canonical position is the capsule's lowest point. The Rapier adapter derives center height and converts exactly 1,000 integer millimeters to one physics unit.
- The initial movement profile is labeled `HYPOTHESIS` and `fixture_only`; fixture success is not an ev.io parity or playable-content claim.

ADR-003 records the decision, alternatives, consequences, required evidence, and reversal seam.

## Initial fixture catalog

| Fixture | Intended coverage |
|---|---|
| `flat_run` | floor contact, acceleration/braking, distance and route timing |
| `contact_lab` | walls, corners, doorway, partial embed, and dynamic support metadata |
| `vertical_lab` | below/above-threshold steps, walkable/steep ramps, ceiling, crouch tunnel, and vertical volumes |
| `slide_lab` | slide friction/steering, step and wall impacts, slopes, and forbidden edge |
| `teleport_lab` | thin wall, corner, low ceiling, door, spawn barrier, player body, and kill/forbidden/recovery volumes |

Fixtures are versioned, strictly validated, detached from caller input, recursively frozen, sorted by stable semantic collider ID, and canonically hashed. They are test data rather than shippable arena content.

## Final technical seal

The canonical [Phase 3 evidence root](../../evidence/2026-07-20/phase-3-movement-collision/README.md) was produced by one clean pinned-install harness and sealed without failed assertions:

- aggregate gate: 10/10 stages;
- Vitest: 323/323 tests across 26 files;
- Playwright browser matrix: 27 passed and 7 intentionally skipped mobile-unsupported cases;
- deterministic movement tapes: 18/18, with 7/7 tuning metrics inside their hypothesis envelopes;
- canonical movement hash: `66fcaf19c3fd94ad`;
- movement profile hash: `8ab4ed437a4393c0`;
- protected Phase 2 replay: `d7201dfc006e72ee`;
- Chromium evidence: 67/67 checks, six PNGs, and one 1600×900 WebM;
- production boundary: 10 built text artifacts and zero DEV-only movement signatures;
- browser/network capture: zero critical console, page, first-party request, external-origin, or application-WebSocket failures;
- exact evidence Vite child shutdown, with ports 4175 and 5999 closed after the run; and
- 27 evidence files / 5,948,871 bytes independently verified with no hash failures by the [outside-root manifest verifier](../../evidence/2026-07-20/phase3-manifest-verification.json), manifest SHA-256 `ffd175395ae65bd32d57edc66cbe105f611cf7f612f9f563356de8853a0a4d76`.

The Rapier package remains pinned directly as `@dimforge/rapier3d-deterministic-compat` `0.19.3`. Its upstream initialization deprecation warning is recorded in the sealed logs rather than hidden.

## Deliberate limits

- The legacy local controller remains the default product path until real-adapter fixtures and G2 evidence pass.
- Movement constants remain hypotheses until route metrics and playtest review approve an envelope.
- Dynamic-platform velocity is represented at the query seam; complete moving-platform behavior is not claimed unless a fixture tape proves it.
- Multiplayer authority, prediction, reconciliation, remote interpolation, and the movement specification's two-client acceptance bullets belong to Phase 4/G3.
- The wire command's `moveY` to simulation `moveZ` adapter must be explicit before Phase 4; compatible units alone are not an implemented adapter.
- A fast press/release pair may truthfully appear as both edge bits in one local fixed-tick command. The current network protocol validator rejects overlapping pressed/released bits, so Phase 4 must either split those ordered transitions at the wire adapter or introduce a versioned protocol representation; the local latch must not silently discard the tap.
- No production deployment is part of Phase 3.

## G2 acceptance

The user explicitly accepted G2 on 2026-07-20 after receiving the canonical screenshots, WebM, technical summary, current playable-state limitations, and the non-reproducing slide-capture caveat. Phase 4/G3 work is authorized to begin.

Acceptance promotes the sealed movement contract into the Phase 4 baseline; it does not claim ev.io parity, final balance, multiplayer authority, finished art, or deployment. The legacy Offline Practice controller remains available while the authoritative client/room seam is integrated and proved. Legacy assets remain release-ineligible pending provenance, external glTF validation/reporting, and texture-memory measurement. No production deployment was performed or authorized.
