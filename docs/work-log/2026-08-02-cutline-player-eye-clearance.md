# Cutline player-eye clearance checkpoint — 2026-08-02

## Outcome

The source-frozen Inkfall Practice route exposed a reproducible desktop HUD
defect: the centered Q/E/F/Z ability rail extended into the first-person rifle
envelope, hiding the F and Z readouts during play. Desktop Practice and online
now share a left-anchored ability baseline between vitals and the weapon zone.
The centered layout remains the explicit narrow-screen fallback.

The Practice entry surface also moved from a centered bordered card to the
asymmetric `Cutline rangefinder` briefing rail. It uses the existing Cutline
type, palette, focus, and reduced-motion contracts; it adds no generated art,
glass, rounded card system, glow, or permanent diagnostic layer.

Localized matte contrast fields sit behind the three lower HUD instruments and
the top score readout. They preserve the center sightline while keeping state
legible against bright Inkfall floors. A browser assertion now fails if the
desktop ability rail crowds the vitals or crosses the defined first-person
weapon-safe envelope.

## Source-matched player-eye evidence

- `evidence/2026-08-02/inkfall-practice-entry-cutline-rangefinder.png`
- `evidence/2026-08-02/inkfall-player-eye-hud-clearance.png`

The active capture is from the exact post-change 1440×900 source and follows a
real pointer-lock entry plus authoritative sprint input. It shows all four
ability slots clear of the rifle and a clean reticle area.

## Consolidated impacted verification

- App TypeScript: PASS in 6.9 seconds.
- Full configured ESLint surface: PASS in 12.2 seconds.
- Focused Practice/HUD/G7 Vitest: 6 files, 20 tests PASS in 14.24 seconds.
- Production Vite build: PASS, 216 modules transformed in 360 ms. The existing
  greater-than-500-kB chunk warning remains.
- Desktop Chromium Inkfall Practice: 1/1 PASS in 74.6 seconds at 1440×900. It
  acquired pointer lock, advanced one exact eight-player authority host,
  produced more than 400 units of sprint displacement, retained seven remote
  avatars, one rifle, two first-person hands, and zero missed scheduler ticks
  or browser errors.
- Shared Cutline Practice/online presentation: 4/4 Playwright scenarios PASS in
  43.7 seconds. The existing software-renderer precision warning remains.

## Truth boundary

- Automated layout and runtime gates do not grant human visual acceptance.
- The current procedural remote avatar remains visibly blocky and rejected as
  final character art.
- Inkfall remains a rough, unaccepted map-art/play candidate despite having a
  working full-viewport traversal route.
- This checkpoint does not approve the current first-person weapon art.
- No final 2/4/8 performance matrix, 30-minute soak, staging deployment, or
  production deployment was run here.
