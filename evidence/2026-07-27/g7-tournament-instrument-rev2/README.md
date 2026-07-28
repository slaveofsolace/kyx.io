# G7 Tournament Instrument Rev2 evidence

This evidence set covers the separate opt-in G7 Rev2 surgical rewrite based on
`addacf2c402067194a51bb9598edaa160d05e14e`.

## Audits

- [Pre-rewrite P1/P2 audit](audit-before.md)
- [Post-rewrite audit and Avoid-AI success tests](re-audit.md)
- [Machine-readable validation results](validation-results.json)
- [Runtime capture/layout/contrast/error manifest](after/runtime-capture.json)

## Final 12-view capture

1. [Menu, 1440x900](after/menu-1440x900.png)
2. [Settings, 1440x900](after/settings-1440x900.png)
3. [Narrow menu, 768x900](after/menu-narrow-768x900.png)
4. [Live HUD, 1280x720](after/hud-1280x720.png)
5. [HUD scale 125%, 1280x720](after/hud-scale-125-1280x720.png)
6. [Reload presentation fixture, 1280x720](after/hud-reload-presentation-fixture-1280x720.png)
7. [Killfeed presentation fixture, 1280x720](after/hud-killfeed-presentation-fixture-1280x720.png)
8. [Pause, 1280x720](after/pause-1280x720.png)
9. [Scoreboard presentation fixture, 1280x720](after/scoreboard-presentation-fixture-1280x720.png)
10. [High contrast HUD, 1280x720](after/hud-high-contrast-1280x720.png)
11. [Live HUD, 1920x1080](after/hud-1920x1080.png)
12. [125% browser-equivalent HUD, 1024x576](after/hud-125-percent-equivalent-1024x576.png)

The presentation fixtures call existing HUD methods after a live gameplay frame
and do not claim authority outcomes.
