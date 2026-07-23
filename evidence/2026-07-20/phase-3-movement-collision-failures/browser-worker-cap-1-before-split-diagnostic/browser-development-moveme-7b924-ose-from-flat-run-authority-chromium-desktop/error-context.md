# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browser\development-movement-driver.spec.ts >> exact DEV flag drives live render pose from flat_run authority
- Location: tests\browser\development-movement-driver.spec.ts:190:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#game-canvas')
    - locator resolved to visible <canvas tabindex="0" width="1440" height="900" id="game-canvas" data-engine="three.js r184" aria-label="KYX.IO offline practice game viewport" data-kyx-dev-metrics="{"schemaVersion":1,"state":"playing","render":{"frame":2102,"calls":505,"triangles":107204,"points":0,"lines":0},"renderRange":{"count":136,"maxCalls":813,"maxTriangles":111928},"memory":{"geometries":1771,"textures":53},"programs":26,"sceneObjects":2062,"pixelRatio":1,"canvas":{"width":1440,"height":900},"frameTimes":{"count":135,"p50Ms":…></canvas>

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic "KYX.IO offline practice game viewport" [ref=e3]
    - generic "Offline practice heads-up display":
      - generic:
        - generic: ♥
        - generic: "100"
      - generic:
        - generic: E
        - generic: "100"
      - generic:
        - generic:
          - generic: F
          - generic: "2"
          - generic: FRAG
        - generic:
          - generic: S
          - generic: "2"
          - generic: SMOKE
      - generic:
        - generic: AR-9 ASSAULT
        - generic: 30 / 120
      - generic:
        - generic: OFFLINE PRACTICE
        - generic: OFFLINE PRACTICE · 7 BOTS
        - generic: BOTS DEFEATED 0
        - generic: SCORE 0
      - generic:
        - generic:
          - generic: "1"
        - generic:
          - generic: "2"
      - generic: ⏱8:00
      - generic:
        - generic: Q
        - generic: BLINK
    - status: KYX.IO 1.0.0-phase1 · LOCAL DEV · OFFLINE PRACTICE
  - status: HYPOTHESIS · FLAT_RUN · DEV ONLY MOVEMENT FIXTURE · COMBAT / AI / PICKUPS / MODE TIMER PAUSED
```

# Test source

```ts
  284 |     }, { timeout: 10_000 }).toMatchObject({ status: 'running' });
  285 |     await expect.poll(async () => {
  286 |       const current = await canvas.evaluate((element, property) => (
  287 |         element as unknown as Record<string, DriverDiagnostics>
  288 |       )[property], DRIVER_PROPERTY);
  289 |       return current.authority.tick;
  290 |     }).toBeGreaterThan(initial.authority.tick);
  291 |     const beforeMove = await canvas.evaluate((element, property) => (
  292 |       element as unknown as Record<string, DriverDiagnostics>
  293 |     )[property], DRIVER_PROPERTY);
  294 | 
  295 |     const jumpedBefore = beforeMove.sample.semanticEventCounts.jumped ?? 0;
  296 |     const landedBefore = beforeMove.sample.semanticEventCounts.landed ?? 0;
  297 |     const eventsBeforeClick = beforeMove.sample.semanticEventCounts;
  298 |     await page.evaluate(() => {
  299 |       window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  300 |       window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  301 |     });
  302 |     await expect.poll(async () => {
  303 |       const current = await canvas.evaluate((element, property) => (
  304 |         element as unknown as Record<string, DriverDiagnostics>
  305 |       )[property], DRIVER_PROPERTY);
  306 |       return current.authority.tick;
  307 |     }).toBeGreaterThan(beforeMove.authority.tick);
  308 |     const eventsAfterClick = (await canvas.evaluate((element, property) => (
  309 |       element as unknown as Record<string, DriverDiagnostics>
  310 |     )[property], DRIVER_PROPERTY)).sample.semanticEventCounts;
  311 |     const movementNeutralEvents = (events: Readonly<Record<string, number>>) =>
  312 |       Object.fromEntries(
  313 |         Object.entries(events).filter(([kind]) => kind !== 'movement_intent_applied'),
  314 |       );
  315 |     expect(movementNeutralEvents(eventsAfterClick)).toEqual(
  316 |       movementNeutralEvents(eventsBeforeClick),
  317 |     );
  318 | 
  319 |     await page.evaluate(() => {
  320 |       window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  321 |       window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  322 |     });
  323 |     await expect.poll(async () => {
  324 |       const current = await canvas.evaluate((element, property) => (
  325 |         element as unknown as Record<string, DriverDiagnostics>
  326 |       )[property], DRIVER_PROPERTY);
  327 |       return current.sample.semanticEventCounts.jumped ?? 0;
  328 |     }).toBe(jumpedBefore + 1);
  329 |     await expect.poll(async () => {
  330 |       const current = await canvas.evaluate((element, property) => (
  331 |         element as unknown as Record<string, DriverDiagnostics>
  332 |       )[property], DRIVER_PROPERTY);
  333 |       return current.authority.grounded
  334 |         ? current.sample.semanticEventCounts.landed ?? 0
  335 |         : -1;
  336 |     }, { timeout: 10_000 }).toBe(landedBefore + 1);
  337 | 
  338 |     const runStart = await canvas.evaluate((element, property) => (
  339 |       element as unknown as Record<string, DriverDiagnostics>
  340 |     )[property], DRIVER_PROPERTY);
  341 |     await page.keyboard.down('w');
  342 |     try {
  343 |       await page.waitForFunction(({ property, start }) => {
  344 |         const element = document.querySelector('#game-canvas');
  345 |         if (element === null) return false;
  346 |         const current = (
  347 |           element as unknown as Record<string, DriverDiagnostics>
  348 |         )[property];
  349 |         const authorityDistanceMm = Math.hypot(
  350 |           current.authority.feetPositionMm.x - start.authority.feetPositionMm.x,
  351 |           current.authority.feetPositionMm.z - start.authority.feetPositionMm.z,
  352 |         );
  353 |         const renderDistance = Math.hypot(
  354 |           current.render.position.x - start.render.position.x,
  355 |           current.render.position.z - start.render.position.z,
  356 |         );
  357 |         return current.authority.tick > start.authority.tick
  358 |           && authorityDistanceMm >= 300
  359 |           && renderDistance > 0.05;
  360 |       }, { property: DRIVER_PROPERTY, start: runStart }, {
  361 |         timeout: 10_000,
  362 |         polling: 'raf',
  363 |       });
  364 |     } finally {
  365 |       await page.keyboard.up('w');
  366 |     }
  367 | 
  368 |     await expect.poll(async () => {
  369 |       const current = await canvas.evaluate((element, property) => (
  370 |         element as unknown as Record<string, DriverDiagnostics>
  371 |       )[property], DRIVER_PROPERTY);
  372 |       return {
  373 |         grounded: current.authority.grounded,
  374 |         horizontalSpeedMmPerSecond: Math.hypot(
  375 |           current.authority.velocityMmPerSecond.x,
  376 |           current.authority.velocityMmPerSecond.z,
  377 |         ),
  378 |       };
  379 |     }).toEqual({ grounded: true, horizontalSpeedMmPerSecond: 0 });
  380 |     const stoppedTick = await canvas.evaluate((element, property) => (
  381 |       element as unknown as Record<string, DriverDiagnostics>
  382 |     )[property].authority.tick, DRIVER_PROPERTY);
  383 |     await expect.poll(async () => {
> 384 |       return await canvas.evaluate((element, property) => (
      |                           ^ Error: locator.evaluate: Test timeout of 30000ms exceeded.
  385 |         element as unknown as Record<string, DriverDiagnostics>
  386 |       )[property].authority.tick, DRIVER_PROPERTY);
  387 |     }).toBeGreaterThan(stoppedTick);
  388 | 
  389 |     const beforeTeleport = await canvas.evaluate((element, property) => (
  390 |       element as unknown as Record<string, DriverDiagnostics>
  391 |     )[property], DRIVER_PROPERTY);
  392 |     const teleportSnap = page.waitForFunction(({ property, priorTeleports }) => {
  393 |       const element = document.querySelector('#game-canvas');
  394 |       if (element === null) return false;
  395 |       const diagnostics = (
  396 |         element as unknown as Record<string, DriverDiagnostics>
  397 |       )[property];
  398 |       return diagnostics.render.teleportSnapActive
  399 |         && (diagnostics.sample.semanticEventCounts.teleport_succeeded ?? 0)
  400 |           === priorTeleports + 1
  401 |         ? diagnostics
  402 |         : false;
  403 |     }, {
  404 |       property: DRIVER_PROPERTY,
  405 |       priorTeleports: beforeTeleport.sample.semanticEventCounts.teleport_succeeded ?? 0,
  406 |     }, { timeout: 5_000 });
  407 |     const teleportFlash = page.waitForFunction(() => {
  408 |       return document.querySelector('#teleport-flash')?.classList.contains('show') === true;
  409 |     }, undefined, { timeout: 5_000, polling: 'raf' });
  410 |     await page.evaluate(() => {
  411 |       window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
  412 |       window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
  413 |     });
  414 |     const [teleportSnapHandle, teleportFlashHandle] = await Promise.all([
  415 |       teleportSnap,
  416 |       teleportFlash,
  417 |     ]);
  418 |     await teleportFlashHandle.dispose();
  419 |     const teleported = await teleportSnapHandle.jsonValue() as DriverDiagnostics;
  420 |     await teleportSnapHandle.dispose();
  421 |     expect(teleported.render.teleportSnapActive).toBe(true);
  422 |     expect(teleported.sample.semanticEventCounts.teleport_succeeded ?? 0).toBe(1);
  423 |     expect(Math.hypot(
  424 |       teleported.authority.feetPositionMm.x - beforeTeleport.authority.feetPositionMm.x,
  425 |       teleported.authority.feetPositionMm.z - beforeTeleport.authority.feetPositionMm.z,
  426 |     )).toBeGreaterThan(1_000);
  427 |     expect(teleported.render.position.x).toBeCloseTo(
  428 |       beforeTeleport.render.position.x
  429 |         - (teleported.authority.feetPositionMm.x
  430 |           - beforeTeleport.authority.feetPositionMm.x) / 1_000,
  431 |       6,
  432 |     );
  433 |     expect(teleported.render.position.y).toBeCloseTo(
  434 |       beforeTeleport.render.position.y
  435 |         + (teleported.authority.feetPositionMm.y
  436 |           - beforeTeleport.authority.feetPositionMm.y) / 1_000,
  437 |       6,
  438 |     );
  439 |     expect(teleported.render.position.z).toBeCloseTo(
  440 |       beforeTeleport.render.position.z
  441 |         + (teleported.authority.feetPositionMm.z
  442 |           - beforeTeleport.authority.feetPositionMm.z) / 1_000,
  443 |       6,
  444 |     );
  445 |     await expect.poll(async () => {
  446 |       const current = await canvas.evaluate((element, property) => (
  447 |         element as unknown as Record<string, DriverDiagnostics>
  448 |       )[property], DRIVER_PROPERTY);
  449 |       return current.render.teleportSnapActive;
  450 |     }).toBe(false);
  451 | 
  452 |     const finalSurface = await canvas.evaluate((element, property) => {
  453 |       const finalDiagnostics = (
  454 |         element as unknown as Record<string, DriverDiagnostics>
  455 |       )[property];
  456 |       return {
  457 |         diagnostics: finalDiagnostics,
  458 |         canvasSerialized: element.getAttribute('data-kyx-dev-movement'),
  459 |         bodySerialized: document.body.getAttribute('data-kyx-dev-movement'),
  460 |       };
  461 |     }, DRIVER_PROPERTY);
  462 |     const finalDiagnostics = finalSurface.diagnostics;
  463 |     expect(finalDiagnostics.authority.tick).toBeGreaterThan(beforeMove.authority.tick);
  464 |     expect(finalDiagnostics.sample.totalTicksStepped).toBeGreaterThan(0);
  465 |     expect(finalDiagnostics.render.stance).toBe(finalDiagnostics.authority.stance);
  466 |     expect(finalDiagnostics.render.teleportSnapActive).toBe(false);
  467 |     expect(finalSurface.canvasSerialized).toBe(JSON.stringify(finalDiagnostics));
  468 |     expect(finalSurface.bodySerialized).toBe(JSON.stringify(finalDiagnostics));
  469 | 
  470 |   }
  471 | 
  472 |   expect(failures.consoleErrors).toEqual([]);
  473 |   expect(failures.pageErrors).toEqual([]);
  474 |   expect(failures.failedFirstPartyRequests).toEqual([]);
  475 |   expectCleanNetwork(failures, page.url());
  476 | });
  477 | 
  478 | test('exact DEV flag enters an authoritative crouched slide', async ({
  479 |   page,
  480 | }, testInfo) => {
  481 |   test.skip(
  482 |     testInfo.project.name === 'chromium-mobile-unsupported',
  483 |     'the desktop-only driver is intentionally gated on mobile',
  484 |   );
```