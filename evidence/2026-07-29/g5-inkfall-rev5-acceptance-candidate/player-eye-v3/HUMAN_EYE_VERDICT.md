# Inkfall Rev5 player-eye v3 verdict

**REJECTED — runtime and visual acceptance remain open.**

The packet is a complete, source-frozen hardware capture from commit
`941a1f333b7ddb59c3c98e7116a59e8276a92578`, rendered through ANGLE D3D11 on
an NVIDIA GeForce RTX 4090. It proves that the corrected west spawn faces its
intended egress (`forwardAlignment=0.9955763180001926`) and that the oversized
spawn medallion and default diagnostics panel were removed from the normal
player view.

It does **not** pass gameplay or visual review:

- ordinary forward movement exposes `ROOM_TICK_FAILED` and stops the capture
  route;
- the player loses 3.259 m of elevation on the intended first egress;
- three views repeat the failed position instead of proving distinct routes;
- Press Hall remains crushed into near-black geometry with an unreadable
  overhead slab;
- the first-person rifle is a procedural blockout without hands or arms;
- no opponent model or animation is visible;
- disconnect cleanup records `AUTHORITY_ACTIVE_CHECKPOINT_TICK_IN_PROGRESS`.

The capture script's `rev5_player_eye_capture_complete_human_review_open`
status means only that its requested files were written. It is not an
acceptance label.

Next gate: reproduce and eliminate the first authority-tick exception, prove a
continuous collision-supported spawn egress, then recapture distinct player-eye
views before further map or character approval.
