# G5 spawn-readability sentinel v1

This was a setup/preflight failure, not a product sentinel run.

- Vite bound successfully.
- Wrangler refused to bind because this fresh sparse worktree did not yet have
  the configured `dist/` assets directory.
- No browser, room, player, spawn-selection, or visual assertion ran.

The exact failure and service logs are preserved in `failure.json` and
`services.json`. The harness was then given an explicit Vite build plus
`dist/` existence preflight before the one product attempt.
