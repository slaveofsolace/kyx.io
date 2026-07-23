# ADR-002 — Simulation tick, units, and determinism

- Status: Accepted for the Phase 2 foundation
- Date: 2026-07-19 (America/Chicago)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Scope: P2.3, the simulation portion of P2.6, and the seam required by P3–P5

## Context

The legacy local game advances presentation and gameplay together from a browser frame timer, uses unconstrained floating-point world values, and contains ambient randomness. That is sufficient for a local visual prototype but cannot provide repeatable movement tapes, prediction/replay, authoritative room simulation, or useful failure evidence.

The multiplayer target requires one rules-driven simulation that runs without Three.js, a DOM, audio, storage, network, or wall-clock input. Presentation may interpolate at the display rate, but it cannot decide authoritative time or outcomes.

## Decision

1. **Canonical authority cadence:** the initial authority profile is exactly **20 Hz**, or **50 ms per integer tick**. Cooldowns and state windows use ticks. Render interpolation remains independent. A named 40 Hz / 25 ms profile exists only for later measured evaluation; it is not the launch authority rate and cannot be enabled merely as a tuning change.
2. **Canonical units:** simulation positions use integer millimeters, linear velocity uses integer millimeters per second, angles use integer milli-degrees, and movement axes use signed integers from `-127` through `127`. Ticks, sequences, bitsets, slots, and identifiers are validated at their boundaries. Branded TypeScript types make accidental unit mixing visible in new code.
3. **Deterministic clock:** the pure clock advances only by an explicit integer tick count. It does not read `Date`, `performance`, `requestAnimationFrame`, timers, or elapsed browser frames.
4. **Deterministic random streams:** simulation randomness uses the versioned `mulberry32-v1` state transition. Numeric seeds are unsigned 32-bit values; string seeds are reduced with a specified UTF-8 FNV-1a procedure and may be split by explicit stream keys. Each sample returns its value and next immutable state. `Math.random()` is prohibited under `src/sim/`.
5. **Player intent boundary:** commands contain a monotonic sequence, client tick metadata, quantized movement/look, held/pressed/released button bits, and an optional selected slot. Commands express intent only. Damage, kills, transforms, score, inventory, or currency are not client commands.
6. **Stable stepping:** command order is canonicalized by entity ID and sequence. Unknown entities and stale sequences produce stable rejection events. The foundation integrator carries integer division remainders, so position integration does not depend on floating frame deltas or discard fractional millimeters differently across runs.
7. **Replay and hash contract:** replay frames must be contiguous authority ticks. Canonical state serialization writes only versioned authority fields and sorts entity IDs. A 64-bit FNV-1a hash provides a compact regression fingerprint. It is a determinism/evidence checksum, not a security or anti-cheat primitive.
8. **Portable purity:** `tsconfig.sim-source.json` checks simulation source against ES2022 with neither DOM nor Node ambient types; `tsconfig.sim.json` adds Node types only for the test harness. ESLint and a recursive source-boundary test reject host/presentation imports, dynamic imports, DOM, browser, storage, process, wall-clock/timers, Three.js, audio, network, crypto randomness, and ambient randomness anywhere under `src/sim/`. The canonical replay runs in Node and through the development-only `/__test__/determinism` browser route; that route renders the result without constructing `Game`, WebGL, audio, storage, or networking.

## Canonical Phase 2 replay

The fixture seed is `kyx-phase2-foundation-v1`. It starts two entities, applies six ordered intent events over six authority ticks, and must finish with:

| Field | Expected value |
|---|---:|
| Authority rate | 20 Hz |
| Tick duration | 50 ms |
| Final tick | 6 |
| Entity count | 2 |
| Event count | 6 |
| Final state hash | `d7201dfc006e72ee` |

Changing the fixture, state schema, RNG algorithm, integration order, unit convention, or canonical serializer requires an intentional version/ADR update and new recorded evidence. A convenient hash change is not accepted as a harmless snapshot update.

## Alternatives rejected

- Browser delta-time as authority time: frame cadence, throttling, focus loss, and device load would change outcomes.
- Floating seconds/meters at every boundary: convenient for rendering, but ambiguous in content/protocol records and harder to reproduce exactly.
- Global or ambient PRNG state: call order in an unrelated system would silently alter the match.
- Trusting client position or outcome commands: this would preserve the legacy authority flaw.
- Enabling 40 Hz immediately: it doubles room work before the 20 Hz correctness, route, and cost evidence exists.
- Treating a replay hash as proof of physics quality: identical wrong behavior is still wrong and must pass movement/collision fixtures in Phase 3.

## Consequences and limits

- New simulation/content/protocol adapters must convert presentation values at explicit seams and document their unit mapping.
- The Phase 2 stepper deliberately proves timing, intent, ordering, integer integration, RNG, replay, and hashing only. It does **not** yet implement gravity, acceleration, collision, capsule occupancy, crouch, slide, teleport, combat, prediction, or a server room. G2/G3/G4 therefore remain open.
- Rapier/query determinism, collision ordering, allocation cost, and cross-runtime replay parity must be measured when the P3 controller is introduced.
- Renderer code may convert millimeters and milli-degrees to Three.js values, but renderer state never flows back as authority.

## Validation

- `tsc -p tsconfig.sim-source.json --noEmit` passes with no DOM or Node ambient types, and `tsc -p tsconfig.sim.json --noEmit` separately checks the Node test harness.
- The simulation suite contains 22 Node tests across units/clock, RNG, command stepping, replay, and source purity.
- The literal 20 Hz replay hash is asserted twice in Node and changes when the seed changes.
- The development route reports the same literal hash and passed in both desktop and mobile Playwright projects with no canvas, console error, page error, failed request, or external origin.

## Reversal strategy

The simulation is isolated behind pure constructors, commands, step rules, replay, and serialization functions. A later controller or physics backend may replace the foundation movement rule behind those contracts. Changing canonical rate, units, RNG, command semantics, or state serialization is a versioned migration—not an in-place reinterpretation of recorded tapes.
