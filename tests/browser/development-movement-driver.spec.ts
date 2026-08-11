import { expect, test, type Page } from '@playwright/test';

const DRIVER_PROPERTY = '__KYX_DEV_FLAT_RUN_MOVEMENT__';
const DRIVER_MODULE_FRAGMENT = '/src/dev/developmentFlatRunMovementDriver.ts';

interface DriverDiagnostics {
  readonly schemaVersion: number;
  readonly label: string;
  readonly productStatus: string;
  readonly coordinateAdapter: string;
  readonly status: string;
  readonly worldDisposed: boolean;
  readonly timing: {
    readonly policyId: string;
    readonly currentBacklogMilliseconds: number;
    readonly droppedMillisecondsTotal: number;
  };
  readonly fixture: {
    readonly id: string;
    readonly hash: string;
    readonly physicsAdapterVersion: string;
  };
  readonly authority: {
    readonly tick: number;
    readonly feetPositionMm: { readonly x: number; readonly y: number; readonly z: number };
    readonly velocityMmPerSecond: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly stance: string;
    readonly locomotion: string;
    readonly grounded: boolean;
    readonly yawMilliDegrees: number;
    readonly pitchMilliDegrees: number;
  };
  readonly render: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly stance: string;
    readonly teleportSnapActive: boolean;
  };
  readonly presentation: {
    readonly yawRadians: number;
    readonly pitchRadians: number;
  };
  readonly sample: {
    readonly totalTicksStepped: number;
    readonly consumedSemanticEvents: number;
    readonly semanticEventCounts: Readonly<Record<string, number>>;
  };
}

function captureCriticalFailures(page: Page): {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedFirstPartyRequests: string[];
  readonly requestedUrls: string[];
  readonly httpErrors: string[];
  readonly websocketUrls: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedFirstPartyRequests: string[] = [];
  const requestedUrls: string[] = [];
  const httpErrors: string[] = [];
  const websocketUrls: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('requestfailed', (request) => {
    const requestUrl = new URL(request.url());
    const pageUrl = page.url().startsWith('http') ? new URL(page.url()) : null;
    if (pageUrl !== null && requestUrl.origin === pageUrl.origin) {
      failedFirstPartyRequests.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on('websocket', (socket) => websocketUrls.push(socket.url()));
  return {
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    requestedUrls,
    httpErrors,
    websocketUrls,
  };
}

function expectCleanNetwork(
  failures: ReturnType<typeof captureCriticalFailures>,
  pageUrl: string,
): void {
  const origin = new URL(pageUrl).origin;
  const externalRequests = failures.requestedUrls.filter((url) => {
    const parsed = new URL(url);
    return /^https?:$/u.test(parsed.protocol) && parsed.origin !== origin;
  });
  const unexpectedSockets = failures.websocketUrls.filter((url) => {
    const parsed = new URL(url);
    const expectedProtocol = new URL(origin).protocol === 'https:' ? 'wss:' : 'ws:';
    return !(
      parsed.protocol === expectedProtocol
      && parsed.host === new URL(origin).host
      && parsed.pathname === '/'
      && parsed.searchParams.has('token')
    );
  });
  expect(failures.httpErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(unexpectedSockets).toEqual([]);
}

test('default launch does not load or expose the development movement driver', async ({
  page,
}, testInfo) => {
  const failures = captureCriticalFailures(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const mobile = testInfo.project.name === 'chromium-mobile-unsupported';

  if (mobile) {
    await expect(page.getByRole('heading', { name: 'DESKTOP REQUIRED' })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toBeVisible({
      timeout: 15_000,
    });
  }

  await expect(page.locator('#dev-flat-run-movement-marker')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-movement-driver', /.+/);
  expect(await page.evaluate((property) => {
    const canvas = document.querySelector('#game-canvas');
    const body = document.body;
    return {
      canvasOwn: canvas === null ? false : Object.hasOwn(canvas, property),
      bodyOwn: Object.hasOwn(body, property),
      gameGlobal: Object.hasOwn(window, 'game'),
    };
  }, DRIVER_PROPERTY)).toEqual({
    canvasOwn: false,
    bodyOwn: false,
    gameGlobal: false,
  });
  expect(failures.requestedUrls.some((url) => url.includes(DRIVER_MODULE_FRAGMENT))).toBe(false);
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
  expect(failures.failedFirstPartyRequests).toEqual([]);
  expectCleanNetwork(failures, page.url());
});

const rejectedDriverQueries = [
  '/?movementDriver=flat_run&x=1',
  '/?movementDriver=flat_run&movementDriver=flat_run',
  '/?movementDriver=FLAT_RUN',
  '/?MovementDriver=flat_run',
] as const;

for (const rejectedQuery of rejectedDriverQueries) {
  test(`rejects non-exact DEV query ${rejectedQuery}`, async ({ page }, testInfo) => {
    const failures = captureCriticalFailures(page);
    const mobile = testInfo.project.name === 'chromium-mobile-unsupported';
    await page.goto(rejectedQuery, { waitUntil: 'domcontentloaded' });
    if (mobile) {
      await expect(page.getByRole('heading', { name: 'DESKTOP REQUIRED' })).toBeVisible();
    } else {
      await expect(page.locator('#dev-build-diagnostics')).toContainText(
        'LOCAL DEV',
        { timeout: 15_000 },
      );
      await expect(page.locator('#dev-build-diagnostics')).toContainText('OFFLINE PRACTICE');
      await expect(page.locator('#dev-build-diagnostics')).toBeHidden();
    }
    await expect(page.locator('#dev-flat-run-movement-marker')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-movement-driver', /.+/);
    expect(await page.evaluate((property) => {
      const target = document.querySelector('#game-canvas');
      return target === null ? false : Object.hasOwn(target, property);
    }, DRIVER_PROPERTY)).toBe(false);
    expect(failures.requestedUrls.some((url) => url.includes(DRIVER_MODULE_FRAGMENT))).toBe(false);
    expect(failures.consoleErrors).toEqual([]);
    expect(failures.pageErrors).toEqual([]);
    expect(failures.failedFirstPartyRequests).toEqual([]);
    expectCleanNetwork(failures, page.url());
  });
}

const exactDriverScenarios = [
  { id: 'boundary', title: 'exposes immutable diagnostics' },
  { id: 'jump', title: 'drives a fixed-tick jump' },
  { id: 'run', title: 'drives fixed-tick run and braking' },
  { id: 'teleport', title: 'renders an exact mapped teleport snap' },
] as const;

for (const scenario of exactDriverScenarios) {
test(`exact DEV flag ${scenario.title}`, async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'chromium-mobile-unsupported';
  test.skip(
    mobile && scenario.id !== 'boundary',
    'the desktop-only driver is intentionally gated on mobile',
  );
  const failures = captureCriticalFailures(page);
  await page.goto('/?movementDriver=flat_run', { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('#game-canvas');

  if (mobile) {
    await expect(page.getByRole('heading', { name: 'DESKTOP REQUIRED' })).toBeVisible();
    await expect(page.locator('#dev-flat-run-movement-marker')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-movement-driver', /.+/);
    expect(await page.evaluate((property) => {
      const target = document.querySelector('#game-canvas');
      return target === null ? false : Object.hasOwn(target, property);
    }, DRIVER_PROPERTY)).toBe(false);
    expect(failures.requestedUrls.some((url) => url.includes(DRIVER_MODULE_FRAGMENT))).toBe(false);
  } else {
    await expect(page.locator('#dev-flat-run-movement-marker')).toContainText(
      'HYPOTHESIS · FLAT_RUN · DEV ONLY',
    );
    await expect(page.locator('#dev-flat-run-movement-marker')).toContainText(
      'MOVEMENT FIXTURE · COMBAT / AI / PICKUPS / MODE TIMER PAUSED',
    );
    await expect(page.locator('body')).toHaveAttribute('data-movement-driver', 'flat_run');
    await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toBeVisible({
      timeout: 15_000,
    });
    expect(failures.requestedUrls.some((url) => url.includes(DRIVER_MODULE_FRAGMENT))).toBe(true);

    const readOnlySurface = await page.evaluate((property) => {
      const canvasElement = document.querySelector('#game-canvas');
      if (!(canvasElement instanceof HTMLCanvasElement)) {
        throw new Error('game canvas unavailable');
      }
      const recursivelyFrozen = (value: unknown): boolean => {
        if (value === null || typeof value !== 'object') return true;
        if (!Object.isFrozen(value)) return false;
        return Object.values(value as Record<string, unknown>).every(recursivelyFrozen);
      };
      const canvasDescriptor = Object.getOwnPropertyDescriptor(canvasElement, property);
      const bodyDescriptor = Object.getOwnPropertyDescriptor(document.body, property);
      const diagnostics = (canvasElement as unknown as Record<string, unknown>)[property];
      return {
        canvasGetter: typeof canvasDescriptor?.get === 'function',
        canvasSetter: canvasDescriptor?.set === undefined,
        canvasConfigurable: canvasDescriptor?.configurable,
        bodyGetter: typeof bodyDescriptor?.get === 'function',
        bodySetter: bodyDescriptor?.set === undefined,
        bodyConfigurable: bodyDescriptor?.configurable,
        sameSnapshot:
          diagnostics === (document.body as unknown as Record<string, unknown>)[property],
        recursivelyFrozen: recursivelyFrozen(diagnostics),
        gameGlobal: Object.hasOwn(window, 'game'),
      };
    }, DRIVER_PROPERTY);
    expect(readOnlySurface).toEqual({
      canvasGetter: true,
      canvasSetter: true,
      canvasConfigurable: true,
      bodyGetter: true,
      bodySetter: true,
      bodyConfigurable: true,
      sameSnapshot: true,
      recursivelyFrozen: true,
      gameGlobal: false,
    });

    const initial = await canvas.evaluate((element, property) => (
      element as unknown as Record<string, DriverDiagnostics>
    )[property], DRIVER_PROPERTY);
    expect(initial).toMatchObject({
      schemaVersion: 1,
      label: 'HYPOTHESIS · FLAT_RUN · DEV ONLY',
      productStatus: 'NON_PRODUCT_FIXTURE_AUTHORITY',
      coordinateAdapter: 'threejs_reflect_x_v1',
      worldDisposed: false,
      timing: {
        policyId: 'hypothesis_bounded_backlog_2000ms_max8ticks_v1',
        droppedMillisecondsTotal: 0,
      },
      fixture: { id: 'flat_run', physicsAdapterVersion: '0.19.3' },
    });
    expect(initial.fixture.hash).toMatch(/^[a-f0-9]{16}$/u);
    expect(initial.authority.yawMilliDegrees).toBe(0);
    expect(initial.authority.pitchMilliDegrees).toBe(0);
    expect(initial.presentation.yawRadians).toBeCloseTo(Math.PI, 12);
    expect(initial.presentation.pitchRadians).toBe(0);

    if (scenario.id !== 'boundary') {
      await page.getByRole('button', { name: 'Enter Relay practice' }).click();
      await expect.poll(async () => {
      return await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
    }, { timeout: 10_000 }).toMatchObject({ status: 'running' });
    await expect.poll(async () => {
      const current = await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
      return current.authority.tick;
    }).toBeGreaterThan(initial.authority.tick);
    const beforeMove = await canvas.evaluate((element, property) => (
      element as unknown as Record<string, DriverDiagnostics>
    )[property], DRIVER_PROPERTY);

    if (scenario.id === 'jump') {
    const jumpedBefore = beforeMove.sample.semanticEventCounts.jumped ?? 0;
    const landedBefore = beforeMove.sample.semanticEventCounts.landed ?? 0;
    const eventsBeforeClick = beforeMove.sample.semanticEventCounts;
    await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    });
    await expect.poll(async () => {
      const current = await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
      return current.authority.tick;
    }).toBeGreaterThan(beforeMove.authority.tick);
    const eventsAfterClick = (await canvas.evaluate((element, property) => (
      element as unknown as Record<string, DriverDiagnostics>
    )[property], DRIVER_PROPERTY)).sample.semanticEventCounts;
    const movementNeutralEvents = (events: Readonly<Record<string, number>>) =>
      Object.fromEntries(
        Object.entries(events).filter(([kind]) => kind !== 'movement_intent_applied'),
      );
    expect(movementNeutralEvents(eventsAfterClick)).toEqual(
      movementNeutralEvents(eventsBeforeClick),
    );

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    });
    await expect.poll(async () => {
      const current = await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
      return current.sample.semanticEventCounts.jumped ?? 0;
    }).toBe(jumpedBefore + 1);
    await expect.poll(async () => {
      const current = await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
      return current.authority.grounded
        ? current.sample.semanticEventCounts.landed ?? 0
        : -1;
    }, { timeout: 10_000 }).toBe(landedBefore + 1);
    }

    if (scenario.id === 'run') {
    const runStart = await canvas.evaluate((element, property) => (
      element as unknown as Record<string, DriverDiagnostics>
    )[property], DRIVER_PROPERTY);
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(({ property, start }) => {
        const element = document.querySelector('#game-canvas');
        if (element === null) return false;
        const current = (
          element as unknown as Record<string, DriverDiagnostics>
        )[property];
        const authorityDistanceMm = Math.hypot(
          current.authority.feetPositionMm.x - start.authority.feetPositionMm.x,
          current.authority.feetPositionMm.z - start.authority.feetPositionMm.z,
        );
        const renderDistance = Math.hypot(
          current.render.position.x - start.render.position.x,
          current.render.position.z - start.render.position.z,
        );
        return current.authority.tick > start.authority.tick
          && authorityDistanceMm >= 300
          && renderDistance > 0.05;
      }, { property: DRIVER_PROPERTY, start: runStart }, {
        timeout: 10_000,
        polling: 'raf',
      });
    } finally {
      await page.keyboard.up('w');
    }

    await expect.poll(async () => {
      const current = await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
      return {
        grounded: current.authority.grounded,
        horizontalSpeedMmPerSecond: Math.hypot(
          current.authority.velocityMmPerSecond.x,
          current.authority.velocityMmPerSecond.z,
        ),
      };
    }).toEqual({ grounded: true, horizontalSpeedMmPerSecond: 0 });
    const stoppedTick = await canvas.evaluate((element, property) => (
      element as unknown as Record<string, DriverDiagnostics>
    )[property].authority.tick, DRIVER_PROPERTY);
    await expect.poll(async () => {
      return await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property].authority.tick, DRIVER_PROPERTY);
    }).toBeGreaterThan(stoppedTick);
    }

    if (scenario.id === 'teleport') {
    const beforeTeleport = await canvas.evaluate((element, property) => (
      element as unknown as Record<string, DriverDiagnostics>
    )[property], DRIVER_PROPERTY);
    const teleportSnap = page.waitForFunction(({ property, priorTeleports }) => {
      const element = document.querySelector('#game-canvas');
      if (element === null) return false;
      const diagnostics = (
        element as unknown as Record<string, DriverDiagnostics>
      )[property];
      return diagnostics.render.teleportSnapActive
        && (diagnostics.sample.semanticEventCounts.teleport_succeeded ?? 0)
          === priorTeleports + 1
        ? diagnostics
        : false;
    }, {
      property: DRIVER_PROPERTY,
      priorTeleports: beforeTeleport.sample.semanticEventCounts.teleport_succeeded ?? 0,
    }, { timeout: 5_000 });
    const teleportFlash = page.waitForFunction(() => {
      return document.querySelector('#teleport-flash')?.classList.contains('show') === true;
    }, undefined, { timeout: 5_000, polling: 'raf' });
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
    });
    const [teleportSnapHandle, teleportFlashHandle] = await Promise.all([
      teleportSnap,
      teleportFlash,
    ]);
    await teleportFlashHandle.dispose();
    const teleported = await teleportSnapHandle.jsonValue() as DriverDiagnostics;
    await teleportSnapHandle.dispose();
    expect(teleported.render.teleportSnapActive).toBe(true);
    expect(teleported.sample.semanticEventCounts.teleport_succeeded ?? 0).toBe(1);
    expect(Math.hypot(
      teleported.authority.feetPositionMm.x - beforeTeleport.authority.feetPositionMm.x,
      teleported.authority.feetPositionMm.z - beforeTeleport.authority.feetPositionMm.z,
    )).toBeGreaterThan(1_000);
    expect(teleported.render.position.x).toBeCloseTo(
      beforeTeleport.render.position.x
        - (teleported.authority.feetPositionMm.x
          - beforeTeleport.authority.feetPositionMm.x) / 1_000,
      6,
    );
    expect(teleported.render.position.y).toBeCloseTo(
      beforeTeleport.render.position.y
        + (teleported.authority.feetPositionMm.y
          - beforeTeleport.authority.feetPositionMm.y) / 1_000,
      6,
    );
    expect(teleported.render.position.z).toBeCloseTo(
      beforeTeleport.render.position.z
        + (teleported.authority.feetPositionMm.z
          - beforeTeleport.authority.feetPositionMm.z) / 1_000,
      6,
    );
    await expect.poll(async () => {
      const current = await canvas.evaluate((element, property) => (
        element as unknown as Record<string, DriverDiagnostics>
      )[property], DRIVER_PROPERTY);
      return current.render.teleportSnapActive;
    }).toBe(false);

    const finalSurface = await canvas.evaluate((element, property) => {
      const finalDiagnostics = (
        element as unknown as Record<string, DriverDiagnostics>
      )[property];
      return {
        diagnostics: finalDiagnostics,
        canvasSerialized: element.getAttribute('data-kyx-dev-movement'),
        bodySerialized: document.body.getAttribute('data-kyx-dev-movement'),
      };
    }, DRIVER_PROPERTY);
    const finalDiagnostics = finalSurface.diagnostics;
    expect(finalDiagnostics.authority.tick).toBeGreaterThan(beforeMove.authority.tick);
    expect(finalDiagnostics.sample.totalTicksStepped).toBeGreaterThan(0);
    expect(finalDiagnostics.render.stance).toBe(finalDiagnostics.authority.stance);
    expect(finalDiagnostics.render.teleportSnapActive).toBe(false);
    expect(finalSurface.canvasSerialized).toBe(JSON.stringify(finalDiagnostics));
    expect(finalSurface.bodySerialized).toBe(JSON.stringify(finalDiagnostics));
    }
    }

  }

  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
  expect(failures.failedFirstPartyRequests).toEqual([]);
  expectCleanNetwork(failures, page.url());
});
}

test('exact DEV flag enters an authoritative crouched slide', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'the desktop-only driver is intentionally gated on mobile',
  );
  const failures = captureCriticalFailures(page);
  await page.goto('/?movementDriver=flat_run', { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('#game-canvas');
  await expect(page.locator('#dev-flat-run-movement-marker')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Enter Relay practice' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-movement-driver-status', 'running');

  const before = await canvas.evaluate((element, property) => (
    element as unknown as Record<string, DriverDiagnostics>
  )[property], DRIVER_PROPERTY);
  const slidesBefore = before.sample.semanticEventCounts.slide_started ?? 0;
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
  });
  try {
    await page.waitForFunction((property) => {
      const element = document.querySelector('#game-canvas');
      if (element === null) return false;
      const current = (
        element as unknown as Record<string, DriverDiagnostics>
      )[property];
      return current.authority.grounded
        && Math.hypot(
          current.authority.velocityMmPerSecond.x,
          current.authority.velocityMmPerSecond.z,
        ) >= 7_000;
    }, DRIVER_PROPERTY, { timeout: 10_000, polling: 'raf' });
    const slideObservation = page.waitForFunction(({ property, priorSlides }) => {
      const element = document.querySelector('#game-canvas');
      if (element === null) return false;
      const current = (
        element as unknown as Record<string, DriverDiagnostics>
      )[property];
      return current.authority.locomotion === 'sliding'
        && (current.sample.semanticEventCounts.slide_started ?? 0) === priorSlides + 1
        ? current
        : false;
    }, { property: DRIVER_PROPERTY, priorSlides: slidesBefore }, {
      timeout: 5_000,
      polling: 'raf',
    });
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ControlLeft',
        key: 'Control',
      }));
    });
    const slideHandle = await slideObservation;
    const slide = await slideHandle.jsonValue() as DriverDiagnostics;
    await slideHandle.dispose();
    expect(slide.authority.locomotion).toBe('sliding');
    expect(slide.authority.stance).toBe('crouched');
    expect(slide.sample.semanticEventCounts.slide_started ?? 0).toBe(slidesBefore + 1);
  } finally {
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'ControlLeft',
        key: 'Control',
      }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
    }).catch(() => {});
  }

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#dev-flat-run-movement-marker')).toHaveCount(0);
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
  expect(failures.failedFirstPartyRequests).toEqual([]);
  expectCleanNetwork(failures, page.url());
});

test('dispose clears Game listeners/timers and permits same-document driver reinstall', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'the desktop-only driver is intentionally gated on mobile',
  );
  const failures = captureCriticalFailures(page);
  await page.addInitScript(() => {
    const audit = {
      listeners: [] as Array<{
        target: 'window' | 'document' | 'canvas';
        type: string;
        listener: EventListenerOrEventListenerObject;
      }>,
      timers: new Set<number>(),
    };
    const track = (
      target: 'window' | 'document' | 'canvas',
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => audit.listeners.push({ target, type, listener });
    const untrack = (
      target: 'window' | 'document' | 'canvas',
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      const index = audit.listeners.findIndex((entry) => (
        entry.target === target && entry.type === type && entry.listener === listener
      ));
      if (index >= 0) audit.listeners.splice(index, 1);
    };
    type AuditedListener = EventListenerOrEventListenerObject;
    type AuditedOptions = boolean | AddEventListenerOptions | undefined;
    type AuditedListenerMethod = (
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) => void;
    const originalWindowAdd = window.addEventListener.bind(window) as AuditedListenerMethod;
    const originalWindowRemove = window.removeEventListener.bind(window) as AuditedListenerMethod;
    window.addEventListener = ((
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) => {
      if (type === 'resize' || type === 'blur') track('window', type, listener);
      originalWindowAdd(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) => {
      if (type === 'resize' || type === 'blur') untrack('window', type, listener);
      originalWindowRemove(type, listener, options);
    }) as typeof window.removeEventListener;
    const originalDocumentAdd = document.addEventListener.bind(document) as AuditedListenerMethod;
    const originalDocumentRemove = document.removeEventListener.bind(document) as
      AuditedListenerMethod;
    document.addEventListener = ((
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) => {
      if (type === 'visibilitychange') track('document', type, listener);
      originalDocumentAdd(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) => {
      if (type === 'visibilitychange') untrack('document', type, listener);
      originalDocumentRemove(type, listener, options);
    }) as typeof document.removeEventListener;
    const originalCanvasAdd = HTMLCanvasElement.prototype.addEventListener as
      AuditedListenerMethod;
    const originalCanvasRemove = HTMLCanvasElement.prototype.removeEventListener as
      AuditedListenerMethod;
    HTMLCanvasElement.prototype.addEventListener = function (
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) {
      if (this.id === 'game-canvas' && type === 'click') track('canvas', type, listener);
      originalCanvasAdd.call(this, type, listener, options);
    };
    HTMLCanvasElement.prototype.removeEventListener = function (
      type: string,
      listener: AuditedListener,
      options?: AuditedOptions,
    ) {
      if (this.id === 'game-canvas' && type === 'click') untrack('canvas', type, listener);
      originalCanvasRemove.call(this, type, listener, options);
    };
    const trackedDelays = new Set([700, 1_200, 1_500, 2_000, 2_600, 2_700, 3_300]);
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      let handle = 0;
      const wrapped = () => {
        audit.timers.delete(handle);
        if (typeof handler === 'function') handler(...args);
        else window.eval(handler);
      };
      handle = originalSetTimeout(wrapped, timeout);
      if (trackedDelays.has(timeout ?? 0)) audit.timers.add(handle);
      return handle;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((handle?: number) => {
      if (handle !== undefined) audit.timers.delete(handle);
      originalClearTimeout(handle);
    }) as typeof window.clearTimeout;
    (window as unknown as { __evioLifecycleAudit: typeof audit }).__evioLifecycleAudit = audit;
  });

  await page.goto('/?movementDriver=flat_run', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#dev-flat-run-movement-marker')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Enter Relay practice' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-movement-driver-status', 'running');
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const audit = (window as unknown as {
        __evioLifecycleAudit: { timers: Set<number> };
      }).__evioLifecycleAudit;
      return audit.timers.size;
    });
  }).toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    const audit = (window as unknown as {
      __evioLifecycleAudit: {
        listeners: Array<{ target: string; type: string }>;
        timers: Set<number>;
      };
    }).__evioLifecycleAudit;
    return {
      listeners: audit.listeners
        .map(({ target, type }) => `${target}:${type}`)
        .sort(),
      timers: audit.timers.size,
    };
  });
  expect(before.listeners).toEqual([
    'canvas:click',
    'document:visibilitychange',
    'document:visibilitychange',
    'window:blur',
    'window:resize',
  ]);
  expect(before.timers).toBeGreaterThan(0);

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const after = await page.evaluate(() => {
    const audit = (window as unknown as {
      __evioLifecycleAudit: {
        listeners: Array<{ target: string; type: string }>;
        timers: Set<number>;
      };
    }).__evioLifecycleAudit;
    return {
      listeners: audit.listeners
        .map(({ target, type }) => `${target}:${type}`)
        .sort(),
      timers: audit.timers.size,
    };
  });
  expect(after).toEqual({ listeners: [], timers: 0 });

  const collisionCleanup = await page.evaluate(async (property) => {
    const modulePath = '/src/dev/developmentFlatRunMovementDriver.ts';
    const module = await import(/* @vite-ignore */ modulePath);
    const canvas = document.querySelector('#game-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('game canvas unavailable');
    Object.defineProperty(canvas, property, {
      configurable: true,
      value: 'occupied-by-collision-test',
    });
    let message = '';
    try {
      await module.createDevelopmentFlatRunMovementDriver({
        boundary: module.DEVELOPMENT_FLAT_RUN_DRIVER_QUERY,
        canvas,
        body: document.body,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const result = {
      message,
      canvasCollisionPreserved:
        (canvas as unknown as Record<string, unknown>)[property]
        === 'occupied-by-collision-test',
      bodyClean: !Object.hasOwn(document.body, property),
      markerCount: document.querySelectorAll('#dev-flat-run-movement-marker').length,
      datasetClean:
        !canvas.hasAttribute('data-kyx-dev-movement')
        && !document.body.hasAttribute('data-kyx-dev-movement'),
    };
    delete (canvas as unknown as Record<string, unknown>)[property];
    return result;
  }, DRIVER_PROPERTY);
  expect(collisionCleanup).toEqual({
    message: 'DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_ALREADY_INSTALLED',
    canvasCollisionPreserved: true,
    bodyClean: true,
    markerCount: 0,
    datasetClean: true,
  });

  const reinstall = await page.evaluate(async (property) => {
    const modulePath = '/src/dev/developmentFlatRunMovementDriver.ts';
    const module = await import(/* @vite-ignore */ modulePath);
    const canvas = document.querySelector('#game-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('game canvas unavailable');
    const driver = await module.createDevelopmentFlatRunMovementDriver({
      boundary: module.DEVELOPMENT_FLAT_RUN_DRIVER_QUERY,
      canvas,
      body: document.body,
    });
    const descriptor = Object.getOwnPropertyDescriptor(canvas, property);
    const installed = Object.hasOwn(canvas, property) && Object.hasOwn(document.body, property);
    driver.dispose();
    return {
      installed,
      configurable: descriptor?.configurable,
      canvasClean: !Object.hasOwn(canvas, property),
      bodyClean: !Object.hasOwn(document.body, property),
      datasetClean:
        !canvas.hasAttribute('data-kyx-dev-movement')
        && !document.body.hasAttribute('data-kyx-dev-movement'),
    };
  }, DRIVER_PROPERTY);
  expect(reinstall).toEqual({
    installed: true,
    configurable: true,
    canvasClean: true,
    bodyClean: true,
    datasetClean: true,
  });
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
  expect(failures.failedFirstPartyRequests).toEqual([]);
  expectCleanNetwork(failures, page.url());
});

test('runtime driver fault stops once and shows a no-fallback DEV failure', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'the desktop-only driver is intentionally gated on mobile',
  );
  await page.addInitScript(() => {
    const audit = { animationFrames: new Set<number>(), metricsIntervals: new Set<number>() };
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    window.requestAnimationFrame = (callback) => {
      let handle = 0;
      handle = originalRequestAnimationFrame((now) => {
        audit.animationFrames.delete(handle);
        callback(now);
      });
      audit.animationFrames.add(handle);
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      audit.animationFrames.delete(handle);
      originalCancelAnimationFrame(handle);
    };
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const handle = originalSetInterval(handler, timeout, ...args);
      if (timeout === 1_000) audit.metricsIntervals.add(handle);
      return handle;
    }) as typeof window.setInterval;
    window.clearInterval = ((handle?: number) => {
      if (handle !== undefined) audit.metricsIntervals.delete(handle);
      originalClearInterval(handle);
    }) as typeof window.clearInterval;
    (window as unknown as { __evioRuntimeLoopAudit: typeof audit })
      .__evioRuntimeLoopAudit = audit;
  });
  const failures = captureCriticalFailures(page);
  await page.goto('/?movementDriver=flat_run', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Enter Relay practice' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-movement-driver-status', 'running');
  await expect(page.locator('#game-canvas')).toHaveAttribute('data-kyx-dev-metrics', /.+/, {
    timeout: 5_000,
  });

  await page.evaluate(() => {
    const invalidWheel = new Event('wheel');
    Object.defineProperty(invalidWheel, 'deltaY', { value: Number.NaN });
    window.dispatchEvent(invalidWheel);
  });

  const failure = page.getByRole('alert');
  await expect(failure).toContainText('HYPOTHESIS · FLAT_RUN · DEV ONLY · RUNTIME FAILED');
  await expect(failure).toContainText('Legacy movement was not loaded as a fallback');
  await expect(page.locator('body')).toHaveAttribute('data-movement-driver-status', 'error');
  await expect(page.locator('#dev-flat-run-movement-marker')).toHaveCount(0);
  expect(await page.evaluate((property) => {
    const canvas = document.querySelector('#game-canvas');
    return {
      canvasOwn: canvas === null ? false : Object.hasOwn(canvas, property),
      bodyOwn: Object.hasOwn(document.body, property),
    };
  }, DRIVER_PROPERTY)).toEqual({ canvasOwn: false, bodyOwn: false });

  await page.waitForTimeout(150);
  expect(await page.evaluate(() => {
    const audit = (window as unknown as {
      __evioRuntimeLoopAudit: {
        animationFrames: Set<number>;
        metricsIntervals: Set<number>;
      };
    }).__evioRuntimeLoopAudit;
    return {
      animationFrames: audit.animationFrames.size,
      metricsIntervals: audit.metricsIntervals.size,
      metricsDataset: document.querySelector('#game-canvas')
        ?.hasAttribute('data-kyx-dev-metrics') ?? false,
    };
  })).toEqual({ animationFrames: 0, metricsIntervals: 0, metricsDataset: false });
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
  expect(failures.failedFirstPartyRequests).toEqual([]);
  expectCleanNetwork(failures, page.url());
});

test('Rapier initialization failure shows no-fallback DEV failure without starting Game', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'the desktop-only driver is intentionally gated on mobile',
  );
  await page.addInitScript(() => {
    const rejectRapier = async (): Promise<never> => {
      throw new Error('synthetic Rapier initialization failure');
    };
    Object.defineProperty(WebAssembly, 'instantiate', {
      configurable: true,
      value: rejectRapier,
    });
    Object.defineProperty(WebAssembly, 'instantiateStreaming', {
      configurable: true,
      value: rejectRapier,
    });
  });
  const failures = captureCriticalFailures(page);

  await page.goto('/?movementDriver=flat_run', { waitUntil: 'networkidle' });

  const failure = page.getByRole('alert');
  await expect(failure).toContainText(
    'HYPOTHESIS · FLAT_RUN · DEV ONLY · INITIALIZATION FAILED',
  );
  await expect(failure).toContainText('Legacy movement was not loaded as a fallback');
  await expect(page.locator('body')).toHaveAttribute('data-movement-driver-status', 'error');
  await expect(page.locator('#dev-flat-run-movement-marker')).toHaveCount(0);
  expect(await page.evaluate((property) => {
    const canvas = document.querySelector('#game-canvas');
    return {
      canvasOwn: canvas === null ? false : Object.hasOwn(canvas, property),
      bodyOwn: Object.hasOwn(document.body, property),
      metrics: canvas?.hasAttribute('data-kyx-dev-metrics') ?? false,
      menuStarted: !document.querySelector('#center-play')?.classList.contains('hidden'),
    };
  }, DRIVER_PROPERTY)).toEqual({
    canvasOwn: false,
    bodyOwn: false,
    metrics: false,
    menuStarted: false,
  });
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
  expect(failures.failedFirstPartyRequests).toEqual([]);
  expectCleanNetwork(failures, page.url());
});
