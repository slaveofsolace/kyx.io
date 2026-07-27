# Failed attempt 1: live combat checkpoint boundary race

The first packaged capture at implementation commit `7f5d766` failed with
`AUTHORITY_ACTIVE_CHECKPOINT_TICK_IN_PROGRESS`.

The local test introspection callback had entered while the real timer was
finishing an authority tick, then attempted to persist a controlled combat
mutation before the checkpoint boundary closed. Earlier direct test runs had
passed, proving the flow was nondeterministic rather than a stable gate.

The harness was corrected in `cf6087d` to inspect the authority's explicit
between-tick boundary and retry without pausing or replacing the live timer.
The raw Vitest logs are retained beside this note.
