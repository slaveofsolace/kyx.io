# G4 product presentation bridge — bounded runtime evidence

Status: `BOUNDED_G4_PRODUCT_PRESENTATION_BRIDGE_RUNTIME_PASS_G4_OPEN`

This package proves the new combat presentation bridge in the real `/online` product route against a real local Worker/Durable Object room and two isolated system-Chrome contexts. It does not close broad G4.

## Proven live

- Authoritative body damage produces the visible `BODY HIT · CONFIRMED` HUD/VFX cue and a WebAudio attempt.
- Authoritative lethal damage produces `ELIMINATION · CONFIRMED`, with the victim authoritative snapshot at `dead` and `0 HP`.
- The real `T`/Teleport control produces an explicit versioned `teleport_resource_confirmed` reliable event, moves `(0,0,0)` to `(0,0,9000)`, and renders the confirmed HUD/VFX/audio cue.
- Reconnect applies a second full-snapshot hydration without replaying a confirmed cue: confirmed count remains `11`, duplicate count remains `0`, audio-attempt count is unchanged, HUD audio is `not_played`, and VFX is immediately inactive with cue `snapshot`.
- Both browser contexts recorded zero console errors, page errors, and failed requests.

## Readable boards

- `screenshots/g4-board-01-confirmed-teleport.png`
- `screenshots/g4-board-02-confirmed-body-hit.png`
- `screenshots/g4-board-03-confirmed-kill.png`
- `screenshots/g4-board-04-reconnect-no-replay.png`

The original full-page screenshots are preserved beside the boards. `runtime-facts.json` is the machine-readable runtime record. `verify-evidence.mjs` independently checks the facts and every PNG.

## Boundary

The exact revision-3 combat profile has `shieldPoints = 0`; a live shield hit cannot occur under that profile. Shield presentation, malformed/unknown event rejection, duplicate suppression, stale-event suppression, identity mismatch, and rejected teleport are therefore covered by deterministic protocol/adapter/Worker tests rather than synthetic live cues. See `known-issues.md`.
