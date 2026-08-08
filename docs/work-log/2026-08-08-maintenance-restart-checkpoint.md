# KYX.IO maintenance restart checkpoint — 2026-08-08

## Authoritative location and Git state

- Task cwd shown by Codex: `C:\AI Projects\Projects\Games\evio\codex_handoff_pack_20260719_v2`
- Physical canonical repository: `D:\AI Projects\Projects\Games\evio\evio-repo`
- Compatibility path: `E:\AI Projects\Projects\Games\evio\evio-repo`
- Stale/nonexistent canonical path: `C:\AI Projects\Projects\Games\evio\evio-repo`
- Branch: `main`
- HEAD: `e380b716154528700b6b83ae58ebc5718920dbd9`
- Tracking state observed immediately before the checkpoint: `main...origin/main`
- Repository is intentionally dirty. No reset, clean, stash, discard, commit,
  push, merge, or deployment occurred.

## Dirty-state ownership

Preserved modified files:

- `index.html`
- `src/app/onlineAuthorityThreeRuntime.ts`
- `src/authority/spawn/index.ts`
- `src/authority/spawn/inkfallSpawnAuthority.ts`
- `src/config/g6CharacterCandidate.js`
- `src/content/maps/library.ts`
- `src/main.js`
- `src/player/PreviewCharacter.js`
- `src/ui/MainMenu.js`
- `src/ui/map-library.css`
- `tests/unit/content/mapLibrary.test.ts`
- `tools/assets/verify-staging-review-package.mjs`

Preserved untracked work:

- `assets/review/external-resource-ledger/`
- `assets/review/runtime-candidates/g6-assault-rev38-fitted-v1/`
- `docs/audits/NOTHEREBUTAFK_EVIO_RESOURCE_AUDIT_2026-08-08.md`
- `src/authority/spawn/fixtureSpawnSupport.ts`
- `src/content/maps/localEvmapInspection.ts`
- `src/dev/installKyxAssaultRev38Review.ts`
- `src/render/disposeThreeObjectResources.ts`
- `src/ui/practiceRoute.ts`
- `src/weapons/KyxFirstPersonWeaponMount.ts`
- `tests/unit/authority/fixtureSpawnSupport.test.ts`
- `tests/unit/content/localEvmapInspection.test.ts`
- `tests/unit/player/g6CharacterReviewInstaller.test.ts`
- `tests/unit/player/proceduralCharacterPresentation.test.ts`
- `tests/unit/render/disposeThreeObjectResources.test.ts`
- `tests/unit/ui/practiceRoute.test.ts`
- `tests/unit/weapons/kyxFirstPersonWeaponMount.test.ts`

This is one protected, unfinished canonical integration batch. Some source and
review-package changes predate the 2026-08-08 upstream audit. The current audit
added clean-room spawn-support, single-viewmodel, complete Three-resource
disposal, and procedural fallback-animation work plus provenance evidence. Do
not split, overwrite, or discard it before reconciling the complete diff.

## Upstream ZIP evidence flushed

- Owner archive: `C:\Users\suhai\Downloads\Ev.io-main.zip`
- SHA-256:
  `2ad470b7d2337e1d0a5aebff69684544448c02d93d2b6dcfc52fb1c4385099c2`
- Size: 9,931,303 bytes
- Inventory: 193 entries / 168 files / 23,673,895 uncompressed bytes
- Exact Git-tree reconciliation: all 168 files match upstream head
  `213738b5913dd7d5806fa9c54b10687cf366b670`; zero missing, extra, or mismatched
  files.
- The original archive remains unchanged, unextracted, and unexecuted.
- Resource decision: `REFERENCE ONLY`; no upstream code, GLB, texture, audio,
  or `.evmap` payload entered KYX.
- Generated evidence:
  - `assets/review/external-resource-ledger/notherebutafk-evio-2026-08-08.inventory.json`
  - `assets/review/external-resource-ledger/notherebutafk-evio-2026-08-08.candidate.json`
  - `assets/review/external-resource-ledger/notherebutafk-evio-2026-08-08.json`
  - `docs/audits/NOTHEREBUTAFK_EVIO_RESOURCE_AUDIT_2026-08-08.md`
- The fail-closed Resource Pilfer candidate registry validated successfully:
  `valid: 1 record(s), schema 1.0, format json`.

## Completed lightweight verification

- Git physical root and HEAD were read using the shell-independent Node bridge.
- `git diff --check` found no whitespace errors; only expected Windows
  LF-to-CRLF conversion warnings were emitted.
- No typecheck, lint, Vitest, build, browser runtime, player-eye capture,
  commit, push, or deployment is claimed for the dirty integration batch.

## Process ownership and reboot safety

- Git and trusted Resource Pilfer Python inventory/registry processes completed.
- The ordinary PowerShell command bridge remained unhealthy.
- The Codex workspace-dependency probe was explicitly terminated before this
  checkpoint.
- This task launched no Vite, Worker, Playwright, Blender, Unreal, Cloudflare,
  or other KYX project runtime that remains intentionally active.
- No command or source write is in flight at checkpoint completion.
- Fresh OS-wide process enumeration was deliberately not started after the
  maintenance hold; unknown processes from other tasks remain untouched.

## Exact resume step

After an explicit post-restart release:

1. Resolve the physical repository to `D:\AI Projects\Projects\Games\evio\evio-repo`.
2. Re-read this checkpoint and verify branch `main`, HEAD `e380b716...`, complete
   dirty status, and project-process ownership without modifying the tree.
3. Revalidate the Resource Pilfer candidate registry and confirm the supplied
   ZIP hash only if the archive timestamp/size changed.
4. Use the shell-independent Node execution route if PowerShell remains
   unhealthy; locate the installed Node/npm runtime without starting a service.
5. Reconcile the complete dirty diff, then run one consolidated proportional
   gate: affected typechecks, ESLint, targeted unit tests, production/staging
   package verification, and only then browser/player-eye evidence.
6. Preserve the visual/rights nonclaims. Do not import legacy `.evmap` binaries,
   accept the Assault model, push, merge, deploy, or publish without the
   appropriate evidence and owner gate.

REBOOT-SAFE: **YES** — all current writes are durable, the only waiting helper
was terminated, no project runtime launched by this task remains active, and no
command is in flight.
