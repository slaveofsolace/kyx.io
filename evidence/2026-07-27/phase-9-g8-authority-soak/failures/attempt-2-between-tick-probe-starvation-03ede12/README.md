# Failed attempt 2: between-tick probe starvation

The clean-source capture at `03ede12` failed because 100 test introspection
attempts all observed `activeTickMatchEvents` as non-null. The special
`runInDurableObject` callback did not reliably receive an execution slice in
the narrow between-tick window while the production timer remained active.

The correction preserves the live timer for the complete measured soak, then
quiesces it and waits 100 ms before applying the controlled authority damage at
a checked checkpoint boundary. This makes the combat projection step
deterministic while keeping its limitation explicit: combat convergence is not
measured concurrently with the performance soak.

The raw Vitest logs are retained beside this note.
