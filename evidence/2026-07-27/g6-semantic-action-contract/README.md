# G6 semantic action contract slice

This evidence covers a bounded functional improvement on the opt-in Rev17
candidate. It does not accept G6.

## Runtime behavior added

- One immutable presentation-only action/marker contract now covers equip,
  fire, reload, melee, and ability actions.
- Third-person Rev17 receives actual local equip, fire, reload, melee, and
  successful grenade actions through one semantic callback.
- First-person Rev17 receives fire, reload, equip, and successful grenade
  actions. The first-person reload truthfully remains the bounded envelope.
- Reload magazine and bolt audio markers advance from the existing deterministic
  weapon reload clock. The unrelated rack `setTimeout` was removed.
- The online authority canvas derives its action glyph and label only from
  validated snapshot and reliable-event data. The current wire schema exposes
  no melee phase, so remote melee is never guessed.
- Runtime evidence snapshots now retain action sequence and last-started
  semantics so one-shot actions remain inspectable after completion.

Animation/audio remain presentation subscribers. Ammo transfer is still owned
by `WeaponSystem._completeReload`; no marker mutates gameplay state.

## Executed validation

```text
node node_modules/vitest/vitest.mjs run \
  tests/unit/player/g6ActionContract.test.ts \
  tests/unit/player/rev17SemanticActionContract.test.ts \
  tests/unit/weapons/weaponPresentationAction.test.ts

Result: 3 files passed, 12 tests passed.

node node_modules/vitest/vitest.mjs run tests/unit
Result: 78 files passed, 574 tests passed.

node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
Result: PASS

node node_modules/eslint/bin/eslint.js \
  src/app/onlineAuthorityRoute.ts \
  tests/unit/player/rev17SemanticActionContract.test.ts \
  tests/unit/weapons/weaponPresentationAction.test.ts \
  src/player/rev17ActionContract.js \
  src/player/Rev17Character.js \
  src/weapons/WeaponSystem.js \
  src/core/Game.js \
  src/entities/Bot.js \
  --no-error-on-unmatched-pattern
Result: PASS

node node_modules/vite/bin/vite.js build
Result: PASS
```

The browser smoke used installed Chrome at 1440x900, acquired pointer lock,
started offline practice with `?g6Candidate=rev17`, exercised the action
sequence, and captured the live third-person melee fallback. See
`runtime-smoke.json` for the exact action observations.

## Remaining and visually unproven

- Rev17 still lacks authored equip, melee, and ability clips. Their bounded
  procedural accents emit a development warning and are not promoted as authored
  animation.
- The embedded first-person reload clip remains visually unapproved and disabled
  in favor of the bounded envelope.
- The screenshot is runtime evidence of the fallback and hand-child socket
  behavior, not a visual-quality approval. Close-camera contact, silhouette,
  and deformation still require human review.
- The online product route still renders players in a 2D authority canvas. Its
  action state is authoritative, but a 3D local/remote Rev17 renderer remains
  future work.
- No deployment or default promotion occurred.
