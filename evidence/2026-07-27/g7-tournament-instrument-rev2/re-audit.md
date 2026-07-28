# G7 Tournament Instrument Rev2 post-rewrite audit

Date: 2026-07-27

Profile: game dashboard / app-component

Mode: surgical rewrite

Base state: `addacf2c402067194a51bb9598edaa160d05e14e`

Candidate gate: `?g7Candidate=foundry-tactical` resolves exactly to
`data-g7-candidate="foundry-tactical-v1"`.

## P0

None found.

## P1 disposition

| Finding | Result | Evidence |
| --- | --- | --- |
| Repeated dark-card hierarchy | Resolved for the gameplay HUD | Vitals are one grouped readout; abilities share one aligned rack; weapon, objective, and timer use quiet backings and 1px functional rules without offset shadows. Necessary menu, pause, settings, and scoreboard surfaces remain single bounded containers. |
| Repeated accent framing | Resolved | Amber is now used for actions, selected controls, actionable ability readiness, reload/critical warnings, and key prompts. Informational headings, ranks, weapon identity, stamina, and shell branding are neutral ivory. |
| Generic retro-technical ornament | Resolved | `FT-CMD`, `IB-07`, `FT-MATCH`, `VITAL BUS`, the timer label, calibration ticks, grids, hatching, and repeating gradients are absent from the candidate stylesheet. |
| Critical microtype | Resolved | Objective and ability states measure 11px; reload is 11px; ammo qualifier is 10px; sampled body copy is 12px or larger. The 19-sample contrast floor is 5.70:1. |
| World-space nameplate collision | Resolved with a bounded presentation-only change | The exact G7 candidate keeps the nearest projected label anchored and stacks farther collisions upward. Default nameplate placement is unchanged. A deterministic three-label unit fixture and the focused browser collision audit pass. |

## P2 disposition

| Finding | Result | Evidence |
| --- | --- | --- |
| All-caps micro-labels | Resolved | Candidate CSS retains uppercase only for major brand/downed display text. Objective, ability, settings, navigation, metadata, and scoreboard labels use authored sentence/title case. |
| Flat micro-spacing | Resolved | Major values and actions establish hierarchy; supporting copy uses calmer 11-12px text and larger section spacing. |
| Decorative texture repetition | Resolved | Candidate backgrounds are solid/translucent colors. No repeating gradients remain. |
| Unconditional candidate stylesheet import | Deferred payload debt | The import remains unchanged. Every candidate rule is still gated by both the accepted interface dataset and exact candidate dataset, so the default presentation and behavior do not change. |

## Avoid-AI success tests

### 1. Justified

Pass. Tournament Instrument is tied to the FPS use case: objective, time,
health, shield, ammo, ability readiness, and actions are prioritized at the
existing gameplay anchors. Decoration does not invent new information.

### 2. Coherent

Pass. Menu, settings, live HUD, reload, killfeed, pause, scoreboard,
high-contrast, narrow, and scaled states share the same condensed display/body
hierarchy, near-black/ivory field, semantic amber/teal use, square geometry,
and restrained 1px rule vocabulary.

### 3. Not a re-run

Pass. Rev2 is not the Rev1 industrial-tech treatment with renamed tokens. It
removes the pseudo-codes, grid/hatch texture, calibration marks, tiny mono
metadata, repeated accent bars, and medal colors that defined Rev1. The
remaining result is a quieter tournament instrument organized by type,
alignment, and negative space.

## Preservation audit

- Existing DOM, route selection, gameplay state, HUD update semantics, and HUD
  anchors are unchanged.
- High contrast, reduced motion, focus-visible styling, keyboard focus loops,
  pause, hold-Tab scoreboard behavior, and 125% HUD scale remain verified.
- Nameplate deconfliction runs only when
  `body.dataset.g7Candidate === "foundry-tactical-v1"`.
- No merge, push, deployment, canonical checkout change, or production action
  was performed.
- This is a scoped G7 verification; it is not a claim that the full repository
  test suite was run.

## Pixel review

All 12 final Chrome captures were reviewed at native resolution. No clipped
critical text, HUD-to-HUD overlap, viewport escape, decorative grid/hatch,
generic pseudo-code, or runtime error was found. Final automated results are in
`after/runtime-capture.json`.
