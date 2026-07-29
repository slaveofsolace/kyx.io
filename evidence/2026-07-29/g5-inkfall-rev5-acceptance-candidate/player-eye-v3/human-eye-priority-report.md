# Human-eye playtest priority report

Observations: 6

Tier counts: S=5, A=0, B=1, C=0, D=0

| Tier | Score | Confidence | Component | Finding | Evidence label |
|---|---:|---|---|---|---|
| S | 100 | HIGH | authoritative movement and match runtime | Normal forward movement stops the room with a visible authority tick failure | OBSERVED |
| S | 100 | HIGH | map traversal and collision | The intended spawn egress loses more than three meters of elevation | MEASURED |
| S | 95 | HIGH | map lighting and geometry readability | Press Hall remains dominated by black crush and an overhead slab silhouette | OBSERVED |
| S | 87 | HIGH | first-person arms and weapon | The live rifle is still a procedural blockout with no hands or arms | OBSERVED |
| S | 86 | HIGH | HUD and evidence integrity | Diagnostics are hidden, but a raw authority exception still becomes player-facing UI | OBSERVED |
| B | 65 | HIGH | opponent model and animation | Enemy model, role silhouette, animation, and weapon contact remain unassessable | UNKNOWN |

## Component coverage

- HUD and evidence integrity: 1
- authoritative movement and match runtime: 1
- first-person arms and weapon: 1
- map lighting and geometry readability: 1
- map traversal and collision: 1
- opponent model and animation: 1

> Priority is deterministic triage, not human acceptance. Review evidence and confidence before acting.
