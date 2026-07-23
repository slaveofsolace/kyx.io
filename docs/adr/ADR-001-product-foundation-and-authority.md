# ADR-001 — Product foundation, authority, and launch scope

- Status: Accepted
- Date: 2026-07-19 (America/Chicago)
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Canonical ruleset: `revamped_classic`

## Context

KYX is the existing Vite/Three.js product shell and deployed application. It already contains the entry points, menu/HUD, world, weapon, profile, bot, and deployment wiring that must be migrated. It is also client-local, visually procedural, untested, and currently presents insecure or misleading product surfaces.

`C:\AI Projects\Projects\Games\aether-foundry-fps` has stronger TypeScript, pure-logic tests, interpolation, Playwright, and Cloudflare Worker/Durable Object patterns. It is not a Git checkout, so no donor commit is available, and its room accepts client-authored transforms and fire rays. Its current React application and visuals are not the product target.

## Decision

1. **Product shell:** migrate KYX in place. Preserve a runnable build and replace responsibilities at explicit seams. Do not replace the repository wholesale with Aether, React, or a new template.
2. **Aether donor boundary:** adopt only small, independently reviewed patterns for pure tests, interpolation, runtime protocol validation, Worker routing, hibernatable WebSocket attachment, SQLite/alarm persistence, and browser proof. Reject client-authored transforms, velocity, grounded state, fire origin/direction, arrival-driven simulation, and presentation. Until donor Git provenance is recovered, the file SHA-256 values below are the immutable source anchors.
3. **Authority:** clients send bounded, sequenced input commands. The room owns fixed-tick movement, collision, fire, damage, kills, score, cooldowns, inventory, and currency. There will be no client message that awards these facts.
4. **Controller/collision:** use a deterministic kinematic upright capsule/rounded-cylinder controller behind a project-owned query interface. Rapier is the preferred query/move-and-slide implementation. Do not use an uncontrolled dynamic rigid body or retain center-point/horizontal-circle collision as the production controller.
5. **Rules:** default to versioned `revamped_classic`. Modern documented weapon records and later fixes form the base; selected classic behaviors require explicit provenance and a documented divergence reason. A hybrid is never labeled official or 1:1 parity.
6. **Art/assets:** Blender is the canonical source. Runtime assets are optimized, validated glTF/GLB plus compressed textures, semantic manifests, LODs, sockets, animation markers, budgets, and provenance. The visual target is original cel-printed tactical manga. Existing fragmented/procedural assets are legacy proxies only.
7. **Launch target:** desktop keyboard/mouse first. Mobile/touch remains quarantined until desktop gameplay, authority, accessibility, and performance gates pass.
8. **Deployment:** local and reversible staging work are implementation scope. Production deployment, paid services, purchases, external account creation, and destructive external changes require explicit user authorization.

## Aether snapshot anchors

| Candidate donor | SHA-256 |
|---|---|
| `src/game/movementController.ts` | `96372876B8B37D9E068D9F57CDB01307B84E9D096C9EFAEBD310CE6B158AB66F` |
| `src/game/maps/mapRuntime.ts` | `232958EDFF4CF4C856D2E45DE5688C37AC2FD9F4FB3EDCD4E066C9A55363DEE4` |
| `src/game/weapons/weaponSystem.ts` | `90F6986A75BC30209B5AC1C953154014AEC5B5B3371D72D0EA562A959B2A2A7C` |
| `src/game/network/multiplayerMessages.ts` | `C4C0FBD162563777C84ACDB8C02318AE18A8BAD5B367E1265E71166CD1C7716F` |
| `src/game/network/remotePlayerInterpolation.ts` | `5C4CF58930E3FDD19412A10460CD6739E7EE0F689E6EC1FF8F3941FE1B94A8C4` |
| `worker/roomProtocol.ts` | `B0E6EA85EF7055C4A6D84DB3B991B4D4F35E61CE7070CACD4DA83448D1FB5F9D` |
| `worker/durable-objects/GameRoom.ts` | `BC27BF89ED49ABB21C49EF2864F7221059A20AB4FD0E05ABFF011E0CEB0DDF08` |
| `worker/index.ts` | `EA453E72D82797EEFAE1CB5A796F89CBD962CCBC431B3BA50ABCFF606C85B4D8` |
| `tools/smoke/worker-room.mjs` | `9E67D372684C474A343DEB797223E490DFED09B47BBEDD996980F2DAED2B8A81` |
| `tools/smoke/room-socket-client.mjs` | `46064D645289BE4EEC000F52D65DE2DA9AF046D73FB40E5394622A7C084D1A7D` |

## Alternatives rejected

- A wholesale Aether/React migration: creates a regression tail and inherits incomplete authority and visuals.
- Keeping the relay and clamping client transforms: does not establish authoritative physics or timing.
- A dynamic rigid-body player: makes responsive, deterministic FPS movement harder to control and reproduce.
- Treating current GLBs/procedural geometry as final after shader polish: fragmentation, absent rigs, and missing provenance remain structural failures.
- Mobile parity during the vertical slice: expands input/layout/QA scope before desktop quality is established.

## Consequences

- New simulation, content, protocol, and physics seams will be strict TypeScript while legacy JavaScript migrates incrementally.
- The game remains runnable while old modules are feature-flagged, adapted, and deleted only after equivalent evidence passes.
- Aether logic cannot be copied merely because it exists locally; each adoption needs a responsibility, source anchor/commit, unit conversion, rejected assumptions, tests, and ledger row.
- Existing online/economy/account claims are containment work, not trusted product capability.

## Validation

- Baseline install/build and browser evidence: `evidence/2026-07-19/phase-0-baseline/`.
- Architecture gate later requires Node-only deterministic tests, runtime content/protocol rejection, identical client/server rules, render-only non-authority, and one repeatable `check` command.
- Authority is accepted only after a fixed-tick two-browser match rejects forged transforms, damage, kills, cadence, and inventory/currency mutation.

## Reversal strategy

The migration is seam-based. Until a replacement passes its gate, the legacy path remains isolated and runnable. A new controller/server/runtime may be replaced behind the same project-owned interfaces without reverting the product shell or weakening the authority boundary.
