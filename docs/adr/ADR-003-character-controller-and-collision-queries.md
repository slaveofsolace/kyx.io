# ADR-003 — Character controller and collision queries

- Status: Accepted
- Date: 2026-07-19 (America/Chicago)
- Validated: 2026-07-20 (America/Chicago)
- Accepted: 2026-07-20 (explicit human G2 decision)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Scope: P3.1–P3.9 and the G2 deterministic-movement evidence gate

## Context

The legacy local controller advances directly from browser-frame delta time and mixes input sampling, camera effects, audio, stamina, movement state, collision correction, and world-specific teleport pads in `Player`. That path is useful as a contained Offline Practice fallback, but it cannot provide a portable 20 Hz authority controller, headless fixture replays, or trustworthy collision evidence.

ADR-002 established integer millimeters, integer velocity, a 20 Hz authority clock, pure simulation source, and canonical replay hashing. Phase 3 must add grounded movement, slopes and steps, stance occupancy, slide, and teleport without allowing the physics engine or presentation runtime to become authority dependencies.

The first movement values are explicitly `HYPOTHESIS` data. Passing deterministic fixtures demonstrates an internally repeatable controller envelope; it does not establish ev.io parity or final playability.

## Decision

1. **Pure movement authority:** movement state transitions and velocity rules live under `src/sim/movement`. They accept quantized commands and a project-owned synchronous query port. Simulation source does not import Rapier, Three.js, DOM/browser services, Node services, storage, networking, timers, or wall-clock state.
2. **Canonical body coordinate:** a player's authority position is the capsule's lowest point, or floor-contact foot level. For a full-height capsule, an engine adapter derives the center as `feet.y + height / 2`. Millimeters convert to physics meters only at the adapter boundary, with 1,000 millimeters equal to one physics unit.
3. **Project-owned query boundary:** `MovementQueryPort` owns capsule move-and-slide, capsule overlap, capsule cast, and volume-overlap operations. Requests carry integer geometry, explicit collision layers, and controller settings. Results return quantized translations, stable collider identifiers, ordered contacts, support data, and query counts.
4. **Physics implementation:** `@dimforge/rapier3d-deterministic-compat` is pinned to `0.19.3` for the Phase 3 fixture implementation. Its WebAssembly runtime initializes before authority ticks. Rapier's kinematic character controller and scene queries are contained under `src/physics`; Rapier objects and floating-point vectors never enter canonical movement state or replay records.
5. **Quantization and ordering:** the adapter converts each request to physics units, performs bounded queries, then quantizes observable results back to integer simulation units and Q15 contact normals. Contacts, overlaps, and volume hits are sorted by stable project collider ID before they cross the port. Canonical hashes never include engine handles, allocation order, or raw floating-point values.
6. **Collision taxonomy:** Phase 3 uses explicit layers for static world, dynamic platforms, player bodies, doors, spawn barriers, kill volumes, forbidden volumes, and recovery volumes. Solid and volume queries declare their applicable layers. Aim/LOS rays are outside this body-collision contract.
7. **Compact immutable fixtures:** collision maps use a versioned, validated data schema with stable IDs and a canonical content hash. The initial fixture set covers flat locomotion, wall/corner/step/ramp/ceiling contacts, jump and vertical cases, crouch/slide occupancy, and teleport obstruction/destination volumes. Fixture records are test data, not shippable arena content.
8. **Controller behavior:** one fixed tick consumes sequenced held/edge intent, updates grounded/stance/slide/teleport state, calculates deterministic planar and vertical velocity, asks the query port to move the body, clips velocity using returned contacts, validates stance expansion and teleport destination occupancy, emits semantic events, and records a canonical state snapshot. Integer remainder policy is part of the versioned replay contract.
9. **Teleport as a shape operation:** teleport casts the current capsule along a bounded direction, applies skin clearance, searches backward in deterministic fixed increments when necessary, rejects blocked or forbidden destinations, and changes position atomically. A failed attempt does not start cooldown unless the selected profile explicitly says it does.
10. **Presentation isolation:** render-frame input is latched into fixed-tick command snapshots so edges cannot be lost or repeated. Pointer-lock negotiation, FOV, ADS scaling, head motion, landing kick, recoil, sprint FOV, slide tilt, shake, and reduced-motion choices stay outside movement state and canonical hashes.
11. **Migration boundary:** the Phase 3 controller first runs in headless fixtures and a dedicated local lab. A product feature flag may then select the modern local bridge while the legacy controller remains available for comparison. The legacy path is removed only after the clean automated G2 seal and human G2 review both accept the controller; the flag does not imply multiplayer authority.
12. **Ruleset identity:** movement tapes record the movement schema, profile ID and revision, immutable profile hash, fixture schema and hash, physics package/version, authority rate, and ordered input commands. Later protocol and room work must carry equivalent immutable ruleset identity before tapes can be compared across releases.

## Alternatives rejected

- Continue extending the legacy `Player.update(deltaTime)` path: this preserves frame-rate authority and keeps movement inseparable from camera, audio, and world presentation.
- Import Rapier directly from simulation: this leaks engine types, initialization, floating-point state, and runtime availability into the portable authority layer.
- Use rays or the player center for stance and teleport clearance: neither represents the occupied body volume and both permit thin-wall or low-ceiling errors.
- Use unrestricted triangle-mesh visual collision: decorative bevels and mesh detail create snag geometry and unstable route results. Authority fixtures and maps use simplified colliders.
- Trust a stable state hash alone: deterministic wrong collision remains wrong. Hashes must accompany geometric assertions, route envelopes, query metrics, and visual evidence.
- Flip the live controller before fixture evidence: this would make the product path the debugging harness and could regress the truthful Phase 1 Offline Practice slice.

## Consequences and limits

- Simulation tests can use fake query ports for precise rule coverage, while integration tests exercise the same controller against the actual Rapier adapter.
- Engine-version or adapter-quantization changes may alter fixture results even when movement rules do not. Such changes require a versioned tape migration and renewed G2 evidence.
- Dynamic-platform support is represented in the query contract, but it is not claimed complete unless the Phase 3 evidence explicitly includes a moving-platform fixture.
- The sealed Phase 3 profile remains a versioned `fixture_only` evidence profile. G2 acceptance authorizes its use as the Phase 4 movement baseline, but does not claim ev.io parity, final balance, or a release-ready product profile.
- The Phase 3 local bridge is not a server authority, prediction, reconciliation, or two-client proof. Those belong to Phase 4 and G3.

## Validation required for acceptance

The clean 2026-07-20 G2 technical seal proves every automated criterion below from a pinned dependency install. The canonical evidence is [the Phase 3 movement/collision seal](../../evidence/2026-07-20/phase-3-movement-collision/README.md), whose 27-file manifest is confirmed by the [outside-root verifier](../../evidence/2026-07-20/phase3-manifest-verification.json).

Human G2 acceptance was explicitly recorded on 2026-07-20 after the six screenshots, WebM, technical summary, and current playable-state limitations were presented for review. ADR-003 is therefore accepted as the Phase 4 movement baseline. Automated tests and captures remain technical evidence rather than an independent claim of visual or feel approval.

The sealed automated criteria are:

- every compact movement/collision fixture passes repeatedly against the real adapter;
- a versioned 20 Hz input tape produces the same canonical hash across repeated Node and Chromium runs;
- route time, distance, apex/airtime, speed, contacts, casts, and overlaps are logged with truthful units;
- different render-frame schedules feeding the same tick commands produce identical authority trajectories;
- low-ceiling stance expansion, slide collision, thin-wall teleport, blocked destination, and forbidden/kill volume cases pass;
- camera FOV and reduced-motion settings change only presentation output and never movement state or hash;
- the feature-flagged local lab renders the modern state without a critical console, page, or first-party request error;
- the Phase 2 foundation replay remains exactly `d7201dfc006e72ee`.

## Reversal strategy

The project-owned query port is the reversal seam. A later Rapier release or different collision backend may replace `src/physics` while preserving versioned integer requests/results and replay records. A movement-rules replacement may be selected behind the local feature flag while the legacy fallback remains available. Reinterpreting an existing fixture/profile/tape in place is forbidden; semantic changes create a new schema, profile revision, or adapter version and retain the prior evidence as historical record.
