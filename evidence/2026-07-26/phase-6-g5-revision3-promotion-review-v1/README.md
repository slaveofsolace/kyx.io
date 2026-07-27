# Inkfall Foundry Revision 3 — G5 promotion review packet

Status: packet complete for review; **G5 remains open**.

This packet is the bounded G5 map-promotion review surface for
`inkfall_foundry@3`. It does not promote Revision 3, change Offline Practice,
or close G5.

## Current Rev3 state

- Explicit product-browser review route:
  `/?mapPackage=inkfall_foundry%403`
- Review server used for this packet: `http://127.0.0.1:4365`
- Canonical G3 ports `5173` and `8787` were not used.
- Catalog/default map remains `inkfall_foundry@1`.
- Revision 3 remains non-default and unpromoted.
- Human graybox review and 2/4/8-player evidence remain required.

## Open-mid revision

The two inner Press baffles were shortened from 5,000 mm to 3,200 mm and
shifted 1,200 mm outward on each side. This produces a nominal 4,200 mm gain
in central clearance while retaining each baffle end as hard cover. The
existing Revision 3 west Press rail repair is preserved.

The resulting combat hypothesis is:

- two symmetric 28,018 mm eye-height sniper lanes through Press mid;
- two close-entry shotgun breach routes that remain traversable;
- 6,000 mm west/east counter-lines stopped by the retained inner baffles;
- an 18,000 mm north power-position line stopped by the Press reactor.

This is an automated and visual hypothesis. Humans must still determine
whether the sniper-shotgun interaction is fun, readable, and fair.

## Frozen identity

| Field | Value |
| --- | --- |
| Map | `inkfall_foundry@3` |
| Package digest | `260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a` |
| Render SHA-256 | `19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6` |
| Collision SHA-256 | `1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8` |
| Authority fixture hash | `6cf785c5171f2ff5` |
| Colliders | 339 |
| Spawns | 12 |
| Zones | 9 |

Only two render meshes and three collision solids changed from the immutable
Revision 2 source: the prior west-rail repair plus the two inner Press
baffles. Non-target render/collision fingerprints remain unchanged.

## Automated result

The real browser route reports
`REV3_PRODUCT_BROWSER_REVIEW_READY_G5_OPEN`:

- 3/3 representative KCC routes passed;
- 5/5 sightline and counter-cover checks passed;
- 12/12 spawn overlap/escape-family checks passed;
- Press-junction and west-Archive canonical regressions passed;
- recovery/kill-volume probes passed;
- zones, frag-mode objective contract, navigation, and verticality checks
  passed;
- no route runtime errors were recorded.

The only browser-console warning is the existing Rapier deprecated
initialization signature warning. It is recorded in
`product-browser-audit.json`.

## Packet index

- `product-browser-audit.json` — full browser audit, host, interactions,
  unchanged-default check, and non-claims.
- `performance.json` — live frame/load/render data and target-hardware
  follow-up contract.
- `capture-manifest.json` — hashes, formats, and dimensions for all captures.
- `collision-spawn-audit.md` — collision, traversal, volumes, spawns, zones,
  and known limits.
- `counterplay-notes.md` — sniper-shotgun intent, retained counters, and human
  questions.
- `human-playtest-2-4-8-plan.md` — required sessions and evidence contract.
- `graybox-lock-checklist.md` — automated closure and unresolved human gates.
- `representative-final-art-room.md` — Press Hall v3.3 representative room,
  boundaries, and runtime data.
- `verification-results.md` — complete automated gate results and the
  documented Windows raw-hash exception.
- `scope-audit.md` — worktree isolation, changed-path families, and forbidden
  scope audit.
- `captures/` — deterministic overview, route, spawn, sightline, collision,
  verticality, and representative-art images.

## Explicit non-claims

- Automated evidence is not human playtest evidence.
- Revision 3 is not the Offline Practice/default map.
- Teleport behavior remains contract-only.
- Spawn scoring and 8-player spawn pressure are not accepted.
- The representative art room is not Revision 3 authority and is not final
  art.
- Performance is measured, not human-accepted.
- G5 is open and not passed.
