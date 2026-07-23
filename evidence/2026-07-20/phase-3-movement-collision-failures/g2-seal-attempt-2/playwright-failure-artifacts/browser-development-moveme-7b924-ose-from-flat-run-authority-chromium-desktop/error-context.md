# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browser\development-movement-driver.spec.ts >> exact DEV flag drives live render pose from flat_run authority
- Location: tests\browser\development-movement-driver.spec.ts:190:1

# Error details

```
Error: Test timeout of 30000ms exceeded
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
  384 |       return await canvas.evaluate((element, property) => (
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
> 450 |     }).toBe(false);
      |        ^ Error: Test timeout of 30000ms exceeded
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
  485 |   const failures = captureCriticalFailures(page);
  486 |   await page.goto('/?movementDriver=flat_run', { waitUntil: 'domcontentloaded' });
  487 |   const canvas = page.locator('#game-canvas');
  488 |   await expect(page.locator('#dev-flat-run-movement-marker')).toBeVisible({ timeout: 15_000 });
  489 |   await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toBeVisible({
  490 |     timeout: 15_000,
  491 |   });
  492 |   await page.getByRole('button', { name: 'START OFFLINE PRACTICE' }).click();
  493 |   await expect(page.locator('body')).toHaveAttribute('data-movement-driver-status', 'running');
  494 | 
  495 |   const before = await canvas.evaluate((element, property) => (
  496 |     element as unknown as Record<string, DriverDiagnostics>
  497 |   )[property], DRIVER_PROPERTY);
  498 |   const slidesBefore = before.sample.semanticEventCounts.slide_started ?? 0;
  499 |   await page.evaluate(() => {
  500 |     window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
  501 |     window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
  502 |   });
  503 |   try {
  504 |     await page.waitForFunction((property) => {
  505 |       const element = document.querySelector('#game-canvas');
  506 |       if (element === null) return false;
  507 |       const current = (
  508 |         element as unknown as Record<string, DriverDiagnostics>
  509 |       )[property];
  510 |       return current.authority.grounded
  511 |         && Math.hypot(
  512 |           current.authority.velocityMmPerSecond.x,
  513 |           current.authority.velocityMmPerSecond.z,
  514 |         ) >= 7_000;
  515 |     }, DRIVER_PROPERTY, { timeout: 10_000, polling: 'raf' });
  516 |     const slideObservation = page.waitForFunction(({ property, priorSlides }) => {
  517 |       const element = document.querySelector('#game-canvas');
  518 |       if (element === null) return false;
  519 |       const current = (
  520 |         element as unknown as Record<string, DriverDiagnostics>
  521 |       )[property];
  522 |       return current.authority.locomotion === 'sliding'
  523 |         && (current.sample.semanticEventCounts.slide_started ?? 0) === priorSlides + 1
  524 |         ? current
  525 |         : false;
  526 |     }, { property: DRIVER_PROPERTY, priorSlides: slidesBefore }, {
  527 |       timeout: 5_000,
  528 |       polling: 'raf',
  529 |     });
  530 |     await page.evaluate(() => {
  531 |       window.dispatchEvent(new KeyboardEvent('keydown', {
  532 |         code: 'ControlLeft',
  533 |         key: 'Control',
  534 |       }));
  535 |     });
  536 |     const slideHandle = await slideObservation;
  537 |     const slide = await slideHandle.jsonValue() as DriverDiagnostics;
  538 |     await slideHandle.dispose();
  539 |     expect(slide.authority.locomotion).toBe('sliding');
  540 |     expect(slide.authority.stance).toBe('crouched');
  541 |     expect(slide.sample.semanticEventCounts.slide_started ?? 0).toBe(slidesBefore + 1);
  542 |   } finally {
  543 |     await page.evaluate(() => {
  544 |       window.dispatchEvent(new KeyboardEvent('keyup', {
  545 |         code: 'ControlLeft',
  546 |         key: 'Control',
  547 |       }));
  548 |       window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }));
  549 |       window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
  550 |     }).catch(() => {});
```