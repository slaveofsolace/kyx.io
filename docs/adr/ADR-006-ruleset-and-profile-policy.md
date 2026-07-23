# ADR-006 — Ruleset and profile policy

- Status: Accepted for the Phase 2 contract
- Date: 2026-07-19 (America/Chicago)
- Amended: 2026-07-20 (America/Chicago), after G2 acceptance
- Baseline commit: `81aa1d02acce8e30ba411bb895901d2d2ac6694e`
- Default ruleset ID: `revamped_classic`
- Scope: P2.4 and the content boundary required by P3–P5

## Context

The product direction combines selected modern documented behavior, later technical fixes, and deliberately chosen classic-style equip/ability behavior. Those sources are not interchangeable. A hybrid must not be presented as the official current game, historical 1:1 parity, or a verified balance table when fields remain disputed.

The legacy JavaScript weapon and ability definitions mix presentation, local gameplay, defaults, and partially invented tuning. They are not a safe shared client/server rules authority. Phase 2 needs a JSON-first contract that can reject drift before later movement, room, combat, bot, and UI systems consume it.

## Decision

1. **Canonical profile:** the product default is the versioned ruleset ID `revamped_classic`; its intentional current revision is 2. Its display label is **Revamped**. It is an original product profile, not an official ev.io mode or a claim of exact parity.
2. **Versioning:** `schemaVersion` controls the data shape; `revision` controls compatible ruleset content changes. IDs are stable snake-case semantic identifiers. `requireRuleset('revamped_classic')` resolves the declared current revision, while an explicit revision argument addresses immutable historical content. Incompatible schema meaning requires a new schema version and migration, not silent reinterpretation.
3. **JSON first:** the bundled sources of truth are `src/content/rulesets/revamped_classic.v1.json` and `src/content/rulesets/revamped_classic.v2.json`. Revision 1 remains unchanged as the Phase 2 record; revision 2 is the current selection. TypeScript interfaces describe validated output; they do not replace runtime validation. The catalog exposes one semantic ID with an explicit, ordered revision set and opens no network or transport.
4. **Truthful implementation status:** ruleset, weapon, and ability records remain either `contract_only` or `playable`. A movement-profile reference may additionally be `fixture_only`, matching the Phase 3 movement contract without claiming G3 multiplayer readiness. Revision 2 therefore remains `contract_only` and references `phase3_hypothesis_v1` revision 1 as `fixture_only`. Unselected damage, cadence, ammo, range, cooldown, spread, projectile, and presentation values remain explicitly `null`; the loader does not invent convenient defaults.
5. **Provenance policy:** each ruleset/weapon/ability record names a source profile, evidence label, and design reason. Supported evidence labels are `VERIFIED`, `INFERRED`, and `PRODUCT_OVERRIDE`. The current hybrid/equip decisions are labeled `PRODUCT_OVERRIDE`. Later verified values must retain their supporting source in the reference ledger; changing a label alone is not evidence.
6. **Equip contract:** one primary weapon is available at spawn, one secondary slot may be filled by a pickup, and one melee fallback is available at spawn. The ability layout is exactly two damage slots plus one utility slot. Ammo-as-an-ability is disabled by default.
7. **Vertical-slice roster:** the contract must resolve one primary rifle, one melee fallback, one grenade damage ability, one deployable damage ability, and teleport in the utility slot. Referenced IDs must exist, have the right category/slot, and remain unique.
8. **Canonical authority units:** cadence and state windows are integer authority ticks at 20 Hz. Distance/radius fields are integer millimeters, impulse/projectile speed fields are millimeters per second, angular spread is milli-degrees, and damage fields are named health points. This follows ADR-002 and avoids unlabelled world-unit or radians conversion at the authority boundary.
9. **Fail-closed loading:** validators reject malformed JSON, unsupported versions, unknown/missing fields, wrong types, non-finite/out-of-range values, oversized arrays/strings, duplicate IDs, missing references, invalid loadout counts, ammo-default drift, and an incomplete vertical slice with stable codes and paths. Successful content is recursively frozen so TypeScript `readonly` semantics also hold at runtime.
10. **Authority use:** future rooms select and load an allowed validated ruleset; a client may request an ID/loadout but cannot send rule values or make them authoritative. Client and server adapters must consume the same schema/revision and reject incompatible content/protocol versions.

## Current contract boundary

The following are selected now:

| Contract field | Phase 2 value |
|---|---|
| Ruleset | `revamped_classic`, schema 1, revision 2 (current); revision 1 retained |
| Current canonical ruleset hash | `039ae95bed7ee716` |
| Movement profile | `phase3_hypothesis_v1`, revision 1, `fixture_only` |
| Authority tick | 20 Hz |
| Primary slots | 1 at spawn |
| Secondary slots | 1 optional pickup |
| Melee slots | 1 at spawn |
| Damage ability slots | 2 |
| Utility ability slots | 1 |
| Ammo ability default | off |
| Required slice | rifle, melee, grenade, deployable, teleport |
| Gameplay readiness | `contract_only` |

Exact balance, projectile collision, teleport range/destination rules, cooldowns, presentation assets, animation/audio/VFX IDs, and bot desirability remain deliberately unselected. They become `playable` only after their owning phase supplies provenance, implementation, tests, authority proof, and integrated evidence.

## Alternatives rejected

- Treating legacy `weaponDefs.js` and local ability code as canonical: those values are not a validated shared authority contract.
- Copying the handoff scaffold verbatim: it is an accelerator, not acceptance-ready runtime validation.
- Filling every nullable field with a plausible number: this would hide research and design debt as fact.
- Calling the hybrid “classic” or “official”: selected behaviors and original product overrides make that misleading.
- TypeScript-only validation: network, JSON, fixtures, migrations, and JavaScript callers still require runtime rejection.
- Mutable loaded records: a consumer could alter the supposed rules authority after validation.
- Broadening the catalog before the vertical slice: more records would create unimplemented surface area without gameplay proof.

## Consequences and limits

- Movement, combat, server, renderer, HUD, bot, and asset adapters receive explicit versioned records rather than importing legacy globals.
- Content changes become reviewable data diffs with stable validation failures.
- The protocol uses the same slot counts and explicit physical units, but Phase 2 does not yet connect a server or make the current Offline Practice loop consume these records.
- A valid `contract_only` ruleset proves schema coherence, not balance, feel, collision, server authority, or product readiness.
- Before any record becomes `playable`, null required runtime fields must be resolved and a stricter readiness validator/gate must be added for that record category.

## Validation

- The content suite passes 26 Node tests covering current/default selection, explicit historical revision lookup, pinned canonical identities, movement-profile status separation, default load/freeze, detached recursive freezing, equip policy, required slice, null tuning, missing IDs/revisions, malformed JSON, version/tick drift, unknown fields, ammo/slot drift, missing teleport, duplicate IDs, and hostile object-shape rejection.
- The companion protocol suite passes 64 Node tests across every declared client/server family, round trips, versions/directions, UTF-8/JSON/byte/array/numeric limits, sequences, unit bounds, duplicate lifecycle IDs, forbidden client authority commands, accessor/serialization attacks, sparse arrays, and detached recursive freezing.
- Strict TypeScript, ESLint, aggregate Vitest, production build, and the combined Phase 2 check pass before this ADR is considered implemented.

## Reversal strategy

The catalog and loader isolate the policy from gameplay. A replacement profile can be added under a new stable ID/revision and selected explicitly. Revision 1 remains addressable as `requireRuleset('revamped_classic', 1)`; changing the current alias does not rewrite it. Recorded matches, replays, and network clients must carry the selected ruleset revision or immutable content hash in addition to the ruleset ID. Removing or redefining an existing `revamped_classic` revision in place is not a rollback; it is an incompatible content migration requiring its own ADR and compatibility plan.
