# G3 lobby reliable-event checkpoint durability

Status: **BOUNDED LOCAL DURABILITY PASS; G3 REMAINS OPEN**

Commit: `bf31c60`

The lobby Durable Object now stores a bounded, identity- and hash-bound
checkpoint containing the reliable-event stream and sorted cumulative event
acknowledgements for checkpointed players. Restore validates schema, room,
match, protocol, hash, size, event IDs, and player ordering before accepting
the checkpoint.

The Worker integration test performs two real hibernatable-object evictions:

1. unacknowledged `event.1` is restored and replayed byte-for-byte after the
   first eviction;
2. the client acknowledges `event.1`, that acknowledgement is persisted, and
   the second eviction restores the cumulative baseline without resending it.

Lobby loadout events use the same persistence path. Checkpoints are removed on
expiry and active-match transition.

Validation:

- Worker suite: 10 files, 41 tests passed;
- focused protocol/loadout suite: 11/11 passed;
- worker and full-project typechecks: passed;
- scoped ESLint and diff check: passed.

This closes a local lobby reliability/hibernation gap only. Authenticated
staging/WSS, external slow-client/load/resource/cost evidence, the final
source-frozen product-flow matrix, and human G3 acceptance remain open.

*Currently being worked on.*
