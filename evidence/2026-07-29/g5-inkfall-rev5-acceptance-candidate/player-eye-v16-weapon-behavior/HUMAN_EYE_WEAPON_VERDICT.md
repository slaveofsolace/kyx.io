# VLR-7 weapon-behavior verdict — v16

Source: `d854852930a754fd2bbabc5a24dea64b33bced19`

## Keep

- Right-mouse held ADS is an explicit presentation-only input.
- The server-accepted rifle event now drives the first-person presentation lane.
- Two-hand contact, 72-degree hip FOV, narrowed ADS FOV, and authority reload state are measured in the runtime packet.
- One accepted rifle attack, one authority reload, and one linked portal traversal completed with zero console or page errors on hardware rendering.

## Revise

- **ADS composition — reject:** the receiver is too large, the optic is above/right of the crosshair, and the central sight picture is obstructed.
- **ADS scale/depth — revise:** compensate for FOV narrowing with an authored ADS scale and move the weapon farther from the camera.
- **Reload evidence — revise:** the screenshot was taken at roughly 11% progress; capture the peak authored motion instead.
- **Fire evidence — incomplete:** the accepted event is measured, but a player-eye frame of the authority-driven recoil/muzzle effect was not captured.
- The simplified first-person arms remain a functional contact rig, not final character-quality arms.

This is a valid technical proof and a visual rejection of the v16 ADS composition. It is not final weapon acceptance.
