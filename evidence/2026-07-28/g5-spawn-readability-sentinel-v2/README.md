# G5 spawn-readability sentinel v2

This was the single product-sentinel attempt, and it did not produce acceptance
evidence.

- The explicit Vite production build passed (171 modules).
- Wrangler compiled, bound, and returned HTTP 200 from `/health`.
- Eight isolated Chrome processes were launched.
- The first browser did not reach the online lobby state within 30 seconds, so
  no room was created and no 2/4/8 population assertion ran.
- No product retry was made.

The failure and service/build logs are preserved in `failure.json` and
`services.json`. This evidence does **not** claim runtime, visual, spawn-safety,
performance, G5, staging, deployment, or release acceptance.
