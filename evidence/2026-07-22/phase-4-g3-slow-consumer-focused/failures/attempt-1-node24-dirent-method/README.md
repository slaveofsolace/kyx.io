# Focused slow-consumer capture failure — attempt 1

- Status: preserved tooling failure; no evidence or gate claim.
- Runtime: bundled Node.js 24.14.0.
- The deterministic policy and Worker-isolate probes emitted their raw JSON logs, but capture terminated before writing `slow-consumer-focused.json`.
- Cause: `artifactInventory()` destructured `Dirent.isFile`, losing its required receiver under Node 24.
- Correction: retain the directory entry and call `entry.isFile()`.
- The corrected capture must use a fresh, empty `runs/local-v1` path and must be independently verified once.
