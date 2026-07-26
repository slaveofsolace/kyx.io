# G5 current authoritative traversal matrix

Status: **`BOUNDED_DETERMINISTIC_PASS_G5_OPEN`**.

This evidence refreshes Inkfall Foundry traversal against the current
post-`8dc762d` Rapier adapter without promoting a map revision or weakening the
accepted Phase 3 movement profile. The provenance-v2 recapture was made from
repository HEAD `71bdf0c648062ebcb966d0a78c14d876e1c82b79`; it closes the
exact concurrent dirty worktree rather than presenting it as a clean release
state. The original HEAD-`19272e1` capture remains in this directory as
historical pre-hardening evidence.

## Frozen authority bindings

- Movement profile: `phase3_hypothesis_v1`, revision 1
- Physics adapter: `0.19.3`
- Authority rate: 20 Hz
- Revision 2 package:
  `77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520`
- Revision 2 fixture: `bf85e42731fd088e`
- Revision 3 package:
  `c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161`
- Revision 3 fixture: `31fea7ee73a12b91`

Revision 2 and revision 3 results are intentionally separated. The 2/4/8
authority suite remains bound to native revision 2. Revision 3 is exercised by
the canonical Press-junction and west-Archive probes only.

## Provenance-v2 source closure

`source-closure.provenance-v2.json` byte-closes 31 critical inputs, including:

- the capture runner/runtime module, closure builder, raw-result recorder,
  verifier, focused matrix test, and collision-GLB rebuild regression;
- governing authority-playtest, collision conversion, Rapier movement, and
  accepted movement-profile sources;
- revision-2/revision-3 collision, render, fixture, and manifest inputs;
- route tapes, spawn fixtures, topology seed, `package.json`,
  `package-lock.json`, TypeScript configs, and ESLint config.

It also records exact HEAD/branch plus the complete non-evidence dirty index
and worktree through status bytes, binary-diff hashes, and 31 per-file byte
records. Only this generated evidence directory is excluded to avoid circular
self-hashing; the separate provenance baseline closes its substantive output
artifacts.

At capture, the repository-state digest was
`0a07e03bcfdbb54de4cc6629a4405c6643dd2a45577c65a7b5dcf1f758f396eb`.
The immediate strict verifier confirmed the same state. Concurrent unrelated
lanes changed later during the 110-second raw command run; that full-tree drift
is recorded without hiding it, while all 31 critical G5 sources stayed
byte-identical.

## Current deterministic result

The native revision-2 P6.6 suite was executed twice and remained byte-identical:

- scenarios: `PASS / PASS / PASS` for 2, 4, and 8 synthetic players;
- suite hash: `143d09532b9c2b24`;
- replay hashes:
  `92aa8378d2e0d27e`, `2010f3a3d1897f31`,
  `909814a9d725d187`;
- 14/14 agents completed;
- 70/70 route tapes completed;
- 20/20 governing route metrics passed;
- zero capsule embeds, route snags, retained-body overlap samples,
  recovery-volume entries, and kill-volume entries;
- recovery, kill-priority, and post-recovery escape probes passed in every
  player arrangement.

Revision 3 additionally proves:

- the exact historical revision-2 P5.15 move still fails closed with
  `PHYSICS_DEPENETRATION_FAILED`;
- the same exact revision-3 move passes;
- all seven Press-junction adjacent lanes finish with zero recovery and zero
  overlap;
- nine west-Archive approach probes pass and finish clear;
- two deliberately seeded overlap diagnostics move from an overlapping start
  to a clear final capsule;
- four independent escape translations from the exact runtime-v45 resolved
  position pass and finish clear;
- exact runtime-v45 resolution remains `(-23958, 37, 402)` mm.

The seeded-overlap probes are bounded inferred observations. Their
`successfulRecoveryCount` is derived only from starting overlap, a returned
deterministic `moveCapsule`, and final-clear overlap. It is not production
recovery telemetry, and the probes are not claimed as reachable product routes.

## Verification and regressions

- Provenance-closed consistency verification: 18/18 checks passed.
- Immediate strict HEAD/dirty-tree match: passed.
- Raw command-result records: 8/8 commands exited successfully.
- Focused and adjacent Vitest matrix: 70/70 tests passed across seven files.
- Application, simulation-source, and simulation TypeScript: passed.
- Focused ESLint: passed.
- Asset manifests: 0 errors and 33 pre-existing legacy-asset warnings.

The raw results store stdout/stderr, exit code, duration, byte count, and
SHA-256 for the dry-run capture, verifier, 70-test matrix, three typechecks,
focused lint, and asset validation. A production build was not repeated in the
provenance-v2 command matrix and is not claimed by this recapture.

The current collision reconciliation changes the historical revision-1
diagnostic outcome from a depenetration exception at tick 91 to a bounded route
snag at tick 137. Its deterministic test hashes were refreshed. The revision-1
8-player scenario remains `FAIL` with 16 preserved issues; no topology change
or acceptance waiver was introduced.

## Evidence files

- `authoritative-traversal-matrix.provenance-v2.json`: hardened proof
- `source-closure.provenance-v2.json`: source and dirty-tree closure
- `verification.provenance-v2.json`: 18-check strict verification
- `command-results.provenance-v2.json`: raw eight-command results
- `commands.provenance-v2.txt`: exact orchestration commands
- `baseline-manifest.provenance-v2.json`: final artifact hashes
- unsuffixed files: historical pre-hardening capture

Primary hashes:

- proof:
  `0bc25606eed47b9e141da1dedc53257398ef8173fb010d53d60280670d9af11f`;
- source closure:
  `bf9f256b135ee7164b03a8aeebe480bbca710b1d17e52801716c9b95f85ab6e6`;
- strict verification:
  `1d863744377722be9d5e090bad23cd56bb3ab5ef16dd6006ffda40aab50e0a2c`;
- raw command results:
  `9bfdc32a3b437dab6890e499ab07945c5a046163ae3ce4ff184c74b1455a8051`.

## Remaining G5 boundary

This automated matrix does not pass G5. Remaining work includes:

1. exact product-browser canonical route replay on revision 3 with zero driver
   recovery;
2. promotion/default selection review after that replay;
3. human 2/4/8-player playtests with video, route, spawn, counterplay, fun, and
   readability review;
4. complete product-map, final-art, and performance acceptance.

No commit, push, deployment, product-default change, or gate acceptance was
performed by this slice.

*Currently being worked on.*
