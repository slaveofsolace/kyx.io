# G6 melee viewmodel visibility

Status: **bounded defect fixed; G6 visual acceptance remains open**

## What was wrong

Switching from the rifle to the Arc Blade made `WeaponSystem.armGroup`, an
unnamed blockout-era `THREE.Group` containing 15 primitive hand/forearm meshes,
visible over the sword. The overlap existed on both the default `/` route and
the explicit `/?g6Candidate=rev17` route.

Live inspection ruled out a second sword model:

- default sword: one active procedural `sword` group, 20 children;
- Rev17 sword: one active procedural `sword` group, 20 children;
- offending overlay: the separate legacy arm group, 15 children.

The group is now named `KYX_LEGACY_FIRST_PERSON_ARM` for diagnostics. The
visibility policy is explicit:

| Route / weapon | Legacy arm | Rev17 first person | Active weapon model |
| --- | ---: | ---: | --- |
| Default rifle | visible | absent | `m4` |
| Default sword | hidden | absent | `sword` |
| Rev17 rifle | hidden | visible | embedded Rev17 rifle |
| Rev17 sword | hidden | hidden | `sword` |

## Runtime flow

The tested flow was:

`page loads -> Start practice -> pointer lock acquired -> Digit1/Digit2 -> active viewmodel changes without an extra arm or duplicate weapon`

Environment:

- Google Chrome, controlled through repository Playwright
- 1920 x 1080 viewport
- local Vite URL `http://127.0.0.1:6199/`
- Rev17 URL `http://127.0.0.1:6199/?g6Candidate=rev17`
- in-app Browser discovery returned no available browser session, so Chrome
  Playwright was the required fallback

## Visual evidence

### Default route

Before:

![Default sword before](./default-sword-before.png)

After:

![Default sword after](./default-sword-after.png)

### Rev17 candidate

Before:

![Rev17 sword before](./rev17-sword-before.png)

Rifle preserved:

![Rev17 rifle after](./rev17-rifle-after.png)

Sword corrected:

![Rev17 sword after](./rev17-sword-after.png)

## Validation

- focused weapon/action/contact tests: 13/13 passed
- unit suite: 83 files, 587/587 passed
- TypeScript typecheck: passed
- focused ESLint: passed
- production Vite build: passed
- isolated-worktree complete Vitest run: 98 files passed, 771/772 tests passed
  - the sole failure was a checkout-specific byte-hash mismatch across nine
    frozen Inkfall JSON sources; this branch does not modify those sources
- canonical main immediately after merge: 20/20 focused tests passed, including
  all 7 Inkfall frozen-source checks and the 4 new visibility checks

`tests/unit/player/g6ActionContract.test.ts` still passes the existing
third-person socket-local melee origin/rotation/scale invariant.

## Limits

- This fix removes false first-person hand/blade contact; it does **not** add an
  authored Rev17 melee hand, grip socket, or melee animation.
- The Arc Blade remains the existing procedural model.
- Third-person model quality, deformation, authored melee contact, and G6 human
  visual acceptance remain open.
- No HUD, map, authority, deployment, or release-default files were changed.

See [`result.json`](./result.json) for the exact live visibility matrix and
screenshot hashes.
