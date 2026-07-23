# P5.8D Worker red run 06

- Command: focused four-profile real-WSS matrix
- Result: **failed equality after every profile reached one death, score 1, feed 1, and ten damage applications**
- Baseline/duplicate accepted 11 shots while loss/reorder accepted 10 because the driver waited for a 10 Hz death snapshot before releasing held fire. One additional legal cadence shot could occur during snapshot-delivery latency.
- No duplicate damage, death, score, or feed occurred. The mismatch was driver timing around a non-damaging post-death shot.
- This red run is retained and does not support exact ammo parity.

Correction: release immediately after the tenth reliable `shotAccepted` consequence, whose delivery cadence is faster than snapshots, then compare the post-release authoritative state.
