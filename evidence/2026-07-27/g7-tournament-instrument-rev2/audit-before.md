# G7 Tournament Instrument Rev2 pre-rewrite audit

Date: 2026-07-27

Profile: game dashboard / app-component

Mode: surgical rewrite

Reviewed state: `?g7Candidate=foundry-tactical` at
`addacf2c402067194a51bb9598edaa160d05e14e`

The Foundry Tactical candidate is a functional, explicit opt-in presentation,
but the current render overstates its technical theme. The rewrite must
preserve the existing DOM, state, routing, authority truth, accessibility
preferences, and HUD anchors.

## P0

None found.

## P1

| Catalog signal | Location | Evidence | Finding |
| --- | --- | --- | --- |
| K9, repeated dark-card treatment | vitals, abilities, weapon, objective, timer | code and render | Five separate dark framed instruments use similar borders, fills, and offset shadows. Their hierarchy comes from repeated containers rather than scale and position. |
| K4-like repeated accent framing | menu, pause, scoreboard, HUD state panels | code and render | Amber top rules, inset state bars, and framed callouts repeat often enough to read as theme decoration instead of a single functional signal. |
| Second-order retro-technical ornament | `.practice-launch-card::before`, `.map-preview-window::before`/`::after`, `.sb-panel::before`, `.hud-vitals-cluster::before`, `#dm-timer::before` | code-certain and render | `FT-CMD`, `IB-07`, `FT-MATCH`, `VITAL BUS`, `TIME`, calibration ticks, hatching, and grid textures form a generic sci-fi sticker layer that competes with actual information. |
| Critical microtype below a safe gameplay floor | objective, ammo qualifier, reload state, ability names/states, vital labels | code and measured render | Interactive or critical readouts fall to 6–9 CSS px at 100% HUD scale. Contrast passes, but legibility and glance recognition do not. |
| Colliding world-space nameplates | live HUD capture | render | Nearby projected bot labels occupy the same screen-space row and become unreadable. The issue is presentation-only, but must be bounded to the opt-in candidate if corrected. |

## P2

| Catalog signal | Location | Evidence | Finding |
| --- | --- | --- | --- |
| T5, reflexive all-caps micro-labels | navigation, menu metadata, settings, HUD, scoreboard | code and render | Uppercase plus wide tracking is applied to nearly every small label, flattening typographic hierarchy and reducing readability. |
| S1, flat micro-spacing | settings rows and HUD instruments | render | Repeated tight gaps and similarly weighted rules make secondary metadata feel as important as health, ammo, and actions. |
| Decorative texture repetition | menu field, command header, preview, settings field, sliders, low-state panels | code-certain | Multiple repeating gradients and hatch fields add visual frequency without carrying state. |
| Unconditional candidate stylesheet import | `src/main.js` | code-certain | Candidate selectors are correctly gated, but the entire candidate stylesheet is included on the default route. This is payload debt, not a visual or behavior change. |

## Committed direction

**Tournament Instrument** — a Swiss-style gameplay information system.

- Type: the existing condensed face for major values and headings, workhorse
  body face for labels and prose, and monospace only for numeric/data roles.
- Palette: near-black and ivory dominate; amber is reserved for primary
  actions and warnings; teal is reserved for shield and spatial meaning.
- Layout: keep the accepted HUD anchors and use scale, alignment, and negative
  space to establish priority instead of repeated cards.
- Motion: minimal functional state changes, with existing reduced-motion
  behavior preserved.
- Signature: one restrained horizontal alignment line shared by the shell and
  HUD, not a field of ticks, stripes, or calibration marks.

Broadcast Neutral and Inkfall Diegetic were not selected. Tournament
Instrument is the project-owner committed direction for this bounded Rev2.
