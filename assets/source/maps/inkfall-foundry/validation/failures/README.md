# Preserved P6.2 failures

These directories are intentional evidence.  Do not treat an earlier PASS in a
build report as a playability pass; the authoritative progression is the latest
`playable-surface-validation.json` in the map's `validation/` directory.

| Attempt | Truthful result | Key failure |
|---|---|---|
| `attempt-1-topology-extrusion` | FAIL | coincident slide-gate walls and collision outside the seed bound |
| `attempt-2-playability-sweep` | FAIL | 19/25 physical links obstructed; slide crouch obstructed; 4.2 m gap bridged |
| `attempt-3-trimmed-rails-partial` | FAIL | 10 physical links still obstructed |
| `attempt-4-three-links-remaining` | FAIL | three physical links still obstructed |
| `attempt-5-one-link-remaining` | FAIL | shared-junction rail blocked `press_west_ink` |
| `attempt-6-cover-obstruction` | FAIL | relocated rail exposed a cover object on `press_west_ink` |

The current top-level report passes only after actual collision geometry was
rebuilt and every link was swept again.  No failed assertion was removed or
allowlisted.  Seven absent rail intervals are explicit shared-node crosslink
openings recorded in the Blend and independently audited against the seed graph.
