# KYX.IO named-history reconciliation

Baseline: `2afbf58f264289b28d8d1dd3993d894edc50686d`

This record distinguishes commit reachability from dirty worktree ownership. A reachable or patch-equivalent head does not authorize deletion of a worktree containing modified or untracked files.

| History | Observed head | Relation to baseline | Decision |
| --- | --- | --- | --- |
| Canonical relay slice | `2afbf58f` | exact | Authoritative baseline; canonical files protected read-only. |
| G7 immersive | `260da86b` | ancestor | Already integrated. |
| G7 Foundry | `0193363b` | divergent; two commits from merge base | One maps change remains unmatched; preserve for file-level review. |
| G7 human UI | `29b6a8bb` | divergent, patch-equivalent | Source already represented; preserve dirty ownership separately. |
| G8 | `920abfe1` | ancestor | Source already integrated; retain its 13 untracked entries. |
| G9 security | `e1ec7550` | ancestor | Already integrated. |
| G9 metrics | `127c6a90` | divergent, patch-equivalent | Source already represented. |
| G9 allocation | `c7381138` | divergent, patch-equivalent | Source already represented. |
| Fable | `8e9778fe` | ancestor | Already integrated. |
| Armory room | `befd62aa` | divergent; both commits patch-equivalent | Source already represented. |
| Armory first-person view | `785576a5` | divergent, adapted homolog | Preserve five untracked entries; do not blind-cherry-pick. |
| Ability loadout | `222552a3` | divergent, adapted homolog | Do not blind-cherry-pick. |
| Ability parity | `f4e3828c` | divergent, patch-equivalent | Source already represented. |
| Movement/ability | `c0ffd7b7` | divergent, patch-equivalent | Source already represented. |
| Integration re-audit | `6a389d63` | divergent, eight commits | Six commits are not patch-equivalent; preserve for file-level review. |
| Canonical final integration | `3f82534f` | ancestor | Commit is integrated; its worktree still has one modified and two untracked entries. |
| Canonical combat | `72757de5` | divergent, 14 commits | Twelve patch-equivalent; two cancel to the baseline tree. Preserve 35 untracked entries. |
| Browser parity | `a8e718cc` | divergent, adapted homolog | Do not blind-cherry-pick. |
| Upstream main | `8675cc` | divergent, 354/129 | Reference/invariant evidence only; no wholesale integration. |

## Retained divergent evidence

- G7 Foundry: `addacf2c`, `0193363b`.
- Integration re-audit: `86870ee1`, `c8c64a61`, `cde288a9`, `d3358c1f`, `5498ea7c`, `6a389d63`.

No named head was found dangling. No deletion manifest exists, so no historical branch or worktree is eligible for task-owned cleanup.
