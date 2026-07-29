# Inkfall Rev5 player-eye v8 — diagnostic failure

This packet is preserved as a fail-closed runtime diagnostic, not as visual or
map acceptance evidence.

- Source commit: `5aec687193bdb51dd426f4bf93178c05a281c1eb`
- Renderer request: hardware D3D11
- Services: isolated local Vite and Wrangler authority
- Result: capture stopped after the first movement phase
- Observed: the host joined at `spawn_w_press_a` (`-33500, 0, -3500`) with the
  bound spawn yaw of `53000`, but the sampled authoritative position after
  forward input was `-33500, 0, 3500`.
- Gate failure: first-egress alignment was `0.6018150231520483`, below the
  required `0.97`.

Independent in-memory and two-player Worker probes preserve yaw-relative
movement through the Rev3 collision fixture and Rev5 portal authority. The next
capture therefore records and asserts the live reconciliation player identity,
authoritative yaw, and predicted yaw before changing movement behavior.

See `failure.json` for the exact service log and phase diagnostics.
