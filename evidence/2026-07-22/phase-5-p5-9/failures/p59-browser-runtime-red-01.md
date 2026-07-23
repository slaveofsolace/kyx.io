# P5.9 retained red — browser runtime fallback

The in-app Browser runtime setup completed, but its browser list was empty. Playwright's managed Chromium executable was also absent from the expected local installation. No browser was downloaded.

The proof therefore used the installed Google Chrome executable through Playwright. Two separate Chrome browser processes, two separate contexts, and two distinct local identities were used. The required real-browser and distinct-process topology was preserved.
