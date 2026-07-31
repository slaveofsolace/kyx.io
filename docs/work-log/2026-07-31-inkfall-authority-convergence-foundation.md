# Inkfall authority convergence foundation — 2026-07-31

## Outcome

The Worker and browser presentation no longer maintain separate copies of the
Inkfall authority profile. `src/authority/inkfallRoomFactory.ts` is now the
browser-safe, Cloudflare-independent source for:

- persisted Revision 2 and Revision 3/Rev5-compatible profile IDs;
- exact map/package/fixture identity;
- 8 playable and 12 authored spawn definitions;
- Revision 3 zones, trigger, portal metadata, and empty pickup contract;
- hash/cardinality-checked collision fixture selection;
- Inkfall Rapier combat ports, spawn authority, and deterministic ordinal spawn
  selection.

`worker/combatRuntime.ts` retains its public compatibility names but delegates
fixture, spawn, and combat-option construction to the shared factory.
`src/app/onlineAuthorityProfiles.ts` and
`src/app/onlineAuthorityInkfallWorld.ts` consume the same objects and fixture.

## Evidence

- App typecheck: PASS.
- Worker typecheck: PASS.
- Shared factory and Rev4/Rev5 profile tests: 2 files, 9 tests PASS.
- Targeted Worker profile/reconnect tests: 1 file, 6 tests PASS.
- Production Vite build: PASS, 204 modules; pre-existing large-chunk warning.
- Changed-file ESLint: PASS after removal of two stale imports.

## Truth boundary

This is architecture convergence, not visible Practice convergence. Offline
Practice still launches the legacy Iron Bastion `Game.js` runtime. The next
implementation is a browser-local 20 Hz Inkfall authority host and a
mode-neutral client/presentation adapter. No map, character, HUD, gameplay,
staging, or release acceptance is claimed here.
