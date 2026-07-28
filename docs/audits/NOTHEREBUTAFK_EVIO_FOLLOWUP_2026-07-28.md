# NotHereButAfk/Ev.io follow-up audit

Date: 2026-07-28

Repository: `https://github.com/NotHereButAfk/Ev.io`

Previously audited head: `39b65ade16828e02e7ba23809efe9b4d567e9b54`

Refreshed `upstream/main`: `8675cc805f008b18ecc59754887497cca20527ec`
(`Merge animation, action, HUD and viewmodel work`)

## Ownership boundary

The refreshed repository still exposes an `ISC` package field without a root
`LICENSE` or `COPYING` file. This follow-up therefore treats the upstream work
as read-only engineering and visual-language reference. No upstream source,
CSS, geometry, assets, constants, coordinates, or commits were copied or
cherry-picked into KYX.IO.

## Delta reviewed

The new mainline range contains eight commits and changes 16 files
(1,673 insertions, 133 deletions):

| Commit | Upstream subject | KYX.IO decision |
| --- | --- | --- |
| `8801272` | Fix reversed walk cycle and add a jump pose | Retain the invariant. KYX.IO now derives forward/back/strafe presentation from measured authoritative travel and must prove gait direction on its own Rev30 skeleton. |
| `a4a9630` | Add jump push-off and blink pose | Retain as a readability reference. KYX.IO's authored jump/air/land clips and server-owned teleport path remain the implementation source of truth. |
| `3f84895` | Animate reload, swap, throw, melee, slide, and flinch | The previously unavailable Claude-session commit is now inspectable. Its useful principle—one authoritative action clock and hand/weapon contact derived from one pose source—matches KYX.IO's independent semantic-action and socket/contact integration. Do not port its procedural rig code. |
| `68ce728` | Zombie shamble and first-person reload | No zombie work is adopted in this batch. First-person reload remains driven by KYX.IO's existing Rev17 viewmodel/action contract. |
| `0ac5e4a` | Prevent viewmodel near-plane slicing | Independently correct KYX.IO's own camera/viewmodel geometry and verify the result across its six weapon families in the consolidated runtime capture. |
| `effb949` | Instrument-panel HUD restyle | Do not adopt the CSS. The isolated upstream treatment is still card/panel-heavy relative to the user's direction; KYX.IO's Arena Instrument v3 uses its own edge-anchored hierarchy and tokens. |
| `b67deb4` | Merge arena, armour-arm, and feedback work | No merge or code adoption. Existing KYX map, character, and feedback lanes stay authoritative. |
| `8675cc8` | Merge animation, action, HUD, and viewmodel work | Audit marker only. It does not change the ownership decision. |

## Concrete outcome

This audit did not create a new dependency on the upstream repository. It
reinforced the following independently implemented KYX.IO requirements:

- measured local-space travel must drive forward/back/strafe presentation;
- action/reload/melee clocks must not be duplicated across presentation layers;
- the equipped external weapon must stay attached to the authored hand socket,
  with support-hand and muzzle/blade-tip contact derived from the same pose;
- first-person weapon depth and camera clipping must be reviewed across the
  entire six-family presentation set;
- HUD information should remain edge-anchored and gameplay-first rather than
  expanding into a floating card dashboard.

The upstream push URL remains disabled. Only the working KYX.IO `origin` may be
pushed.
