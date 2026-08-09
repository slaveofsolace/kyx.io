# G6 Assault contact and animation checkpoint — 2026-08-08

Branch baseline: `agent/relay-playable-slice-wip` at `8940d59329325410ff56a803fb4e76783f9b740a`.

## Implemented

- Every remote runtime role now selects the intended LOD1 instead of accidentally falling through to LOD0.
- Practice and online remote characters retain one Assault silhouette; red/blue identity is applied as restrained material accents rather than separate armor classes.
- Remote authoritative throwable activation now drives the shared ability/throw presentation hook.
- The procedural fallback exposes distinct equip, melee, and ability actions instead of collapsing them into one generic arm motion.
- Runtime diagnostics fail closed on candidate binding, authored clip activity, equipped weapon attachment, and support-hand contact.
- The player-eye harness preserves the spawn sightline instead of steering the camera into collision geometry.

## Consolidated verification

- `tsc -p tsconfig.json --noEmit` — pass
- `tsc -p tsconfig.worker.json --noEmit` — pass
- targeted ESLint over eight affected source/test/evidence files — pass
- focused Vitest — 3 files, 11 tests — pass
- staging-review Vite build — 229 modules — pass
- staging-review package verifier — `STAGING_REVIEW_PACKAGE_VERIFIED`
- bounded Chrome player-eye capture — pass, pointer lock acquired, zero runtime errors

Runtime packet: `evidence/2026-08-08/g6-assault-rev38-contact-animation-v1/runtime.json`.

## Acceptance boundary

Automated runtime/contact status: **PASS**.

Human visual status: **REJECT**. Rev38 remains review-only, release-ineligible, and human-unaccepted. The body is too thin/mannequin-like, the Assault armor hierarchy is weak, and the live cross-step/lean needs a better motion source or retargeting pass.

## Next action

Use the preserved stronger earlier armored source as a new explicit staging-review candidate, retaining the now-proven contact/animation seam. Do not silently reactivate or approve the rejected Rev30 artifact; derive and identify a new candidate, remove its embedded diagnostic weapon, provide real LODs, and capture it at loadout and player-eye distances before any acceptance claim.
