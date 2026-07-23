import { expect, test } from '@playwright/test';

import { getPhysicsFixtureTape } from '../../src/physics';

const CANONICAL_MOVEMENT_LAB_TAPE = getPhysicsFixtureTape(
  'flat_run_fixed_20hz_v1',
);

interface MovementLabPayload {
  readonly schemaVersion: number;
  readonly evidence: {
    readonly label: string;
    readonly surface: string;
    readonly productStatus: string;
    readonly route: string;
  };
  readonly tape: {
    readonly schemaVersion: number;
    readonly id: string;
    readonly simulationRateHz: number;
    readonly tickDurationMs: number;
    readonly frameCount: number;
  };
  readonly identity: {
    readonly movementProfileId: string;
    readonly fixtureId: string;
    readonly fixtureHash: string;
    readonly physicsAdapterId: string;
    readonly physicsAdapterVersion: string;
  };
  readonly hash: {
    readonly firstRun: string;
    readonly secondRun: string;
    readonly recorded: string;
    readonly repeatConfirmed: boolean;
    readonly recordedMatch: boolean;
  };
  readonly envelope: {
    readonly evidenceLabel: string;
    readonly finalTick: number;
    readonly tickCount: number;
    readonly elapsedMilliseconds: number;
    readonly planarDistanceTravelledMm: number;
    readonly maximumPlanarSpeedMmPerSecond: number;
  };
  readonly measurements: (typeof CANONICAL_MOVEMENT_LAB_TAPE)['expected']['measurements'];
  readonly queryMetrics: {
    readonly moveCapsuleCalls: number;
    readonly overlapCapsuleCalls: number;
    readonly castCapsuleCalls: number;
    readonly volumeCalls: number;
    readonly shapeCasts: number;
    readonly overlapTests: number;
    readonly contacts: number;
  };
  readonly trajectory: readonly {
    readonly authorityTick: number;
    readonly xMm: number;
    readonly zMm: number;
    readonly grounded: boolean;
  }[];
}

interface RouteRuntimeActivity {
  readonly canvasContextTypes: string[];
  readonly storageOperations: string[];
  animationFrameRequests: number;
  storageCalls: number;
  fetchCalls: number;
  xhrOpenCalls: number;
  audioContextConstructions: number;
}

test('development movement fixture lab is repeatable, isolated, and reload-stable', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];
  const requestUrls: string[] = [];
  const webSocketUrls: string[] = [];

  await page.addInitScript(() => {
    const activity: RouteRuntimeActivity = {
      canvasContextTypes: [],
      storageOperations: [],
      animationFrameRequests: 0,
      storageCalls: 0,
      fetchCalls: 0,
      xhrOpenCalls: 0,
      audioContextConstructions: 0,
    };
    Object.defineProperty(window, '__KYX_MOVEMENT_LAB_ACTIVITY__', {
      value: activity,
      writable: false,
      configurable: false,
    });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function instrumentedGetContext(
      this: HTMLCanvasElement,
      contextId: string,
      ...argumentsList: unknown[]
    ) {
      activity.canvasContextTypes.push(contextId);
      return Reflect.apply(originalGetContext, this, [contextId, ...argumentsList]);
    } as typeof originalGetContext;

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      activity.animationFrameRequests += 1;
      return originalRequestAnimationFrame.call(window, callback);
    };

    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function instrumentedGetItem(key: string): string | null {
      activity.storageCalls += 1;
      activity.storageOperations.push(`get:${key}`);
      return originalGetItem.call(this, key);
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function instrumentedSetItem(
      key: string,
      value: string,
    ): void {
      activity.storageCalls += 1;
      activity.storageOperations.push(`set:${key}`);
      originalSetItem.call(this, key, value);
    };

    const originalFetch = window.fetch;
    window.fetch = (...argumentsList: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
      activity.fetchCalls += 1;
      return originalFetch(...argumentsList);
    };

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function instrumentedXhrOpen(
      this: XMLHttpRequest,
      ...argumentsList: Parameters<XMLHttpRequest['open']>
    ): void {
      activity.xhrOpenCalls += 1;
      Reflect.apply(originalXhrOpen, this, argumentsList);
    } as typeof originalXhrOpen;

    const originalAudioContext = window.AudioContext;
    if (typeof originalAudioContext === 'function') {
      Object.defineProperty(window, 'AudioContext', {
        value: new Proxy(originalAudioContext, {
          construct(target, argumentsList, newTarget) {
            activity.audioContextConstructions += 1;
            return Reflect.construct(target, argumentsList, newTarget);
          },
        }),
        writable: false,
        configurable: false,
      });
    }
  });

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requestUrls.push(request.url()));
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('websocket', (socket) => webSocketUrls.push(socket.url()));

  await page.goto('/__test__/movement', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle('KYX.IO - Movement Fixture Lab');
  await expect(page.locator('body')).toHaveAttribute(
    'data-launch-support',
    'movement-fixture-lab',
  );
  await expect(page.locator('body')).toHaveAttribute('data-movement-status', 'pass', {
    timeout: 30_000,
  });
  await expect(page.getByText('Hypothesis · Fixture Lab', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Non-product evidence route · development only', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'Two independent fixture runs agree',
  );
  await expect(page.locator('#game-canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);

  const trajectoryCanvas = page.locator('#movement-trajectory');
  await expect(trajectoryCanvas).toBeVisible();
  await expect(trajectoryCanvas).toHaveAttribute('width', '920');
  await expect(trajectoryCanvas).toHaveAttribute('height', '520');
  expect(
    await trajectoryCanvas.evaluate((canvas) =>
      (canvas as HTMLCanvasElement).toDataURL('image/png').length,
    ),
  ).toBeGreaterThan(5_000);

  const firstJson = await page.locator('#movement-result').textContent();
  if (firstJson === null) throw new Error('Movement fixture lab did not expose JSON.');
  const firstPayload = JSON.parse(firstJson) as MovementLabPayload;
  expect(firstPayload).toMatchObject({
    schemaVersion: 1,
    evidence: {
      label: 'HYPOTHESIS',
      surface: 'FIXTURE LAB',
      productStatus: 'NON_PRODUCT',
      route: '/__test__/movement',
    },
    hash: {
      firstRun: CANONICAL_MOVEMENT_LAB_TAPE.expected.finalHash,
      secondRun: CANONICAL_MOVEMENT_LAB_TAPE.expected.finalHash,
      recorded: CANONICAL_MOVEMENT_LAB_TAPE.expected.finalHash,
      repeatConfirmed: true,
      recordedMatch: true,
    },
  });
  expect(firstPayload.tape).toEqual({
    schemaVersion: CANONICAL_MOVEMENT_LAB_TAPE.schemaVersion,
    id: CANONICAL_MOVEMENT_LAB_TAPE.id,
    simulationRateHz: CANONICAL_MOVEMENT_LAB_TAPE.simulationRateHz,
    tickDurationMs: 1_000 / CANONICAL_MOVEMENT_LAB_TAPE.simulationRateHz,
    frameCount: CANONICAL_MOVEMENT_LAB_TAPE.frames.length,
  });
  expect(firstPayload.identity).toEqual(CANONICAL_MOVEMENT_LAB_TAPE.identity);
  expect(firstPayload.envelope).toEqual(CANONICAL_MOVEMENT_LAB_TAPE.expected.envelope);
  expect(firstPayload.measurements).toEqual(
    CANONICAL_MOVEMENT_LAB_TAPE.expected.measurements,
  );
  expect(firstPayload.queryMetrics).toEqual(
    CANONICAL_MOVEMENT_LAB_TAPE.expected.envelope.queries,
  );
  expect(firstPayload.trajectory).toHaveLength(
    CANONICAL_MOVEMENT_LAB_TAPE.frames.length + 1,
  );

  const immutability = await page.evaluate(() => {
    const labWindow = window as typeof window & {
      __KYX_MOVEMENT_LAB_RESULT__?: unknown;
    };
    const result = labWindow.__KYX_MOVEMENT_LAB_RESULT__;
    const descriptor = Object.getOwnPropertyDescriptor(
      window,
      '__KYX_MOVEMENT_LAB_RESULT__',
    );
    const pending: unknown[] = [result];
    const seen = new Set<object>();
    let graphFrozen = true;
    while (pending.length > 0) {
      const value = pending.pop();
      if (value === null || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      if (!Object.isFrozen(value)) graphFrozen = false;
      pending.push(...Object.values(value));
    }
    return {
      graphFrozen,
      writable: descriptor?.writable,
      configurable: descriptor?.configurable,
    };
  });
  expect(immutability).toEqual({
    graphFrozen: true,
    writable: false,
    configurable: false,
  });

  const firstActivity = await page.evaluate(() =>
    (window as typeof window & {
      __KYX_MOVEMENT_LAB_ACTIVITY__: RouteRuntimeActivity;
    }).__KYX_MOVEMENT_LAB_ACTIVITY__,
  );
  expect(firstActivity).toEqual({
    canvasContextTypes: ['2d'],
    storageOperations: [],
    animationFrameRequests: 0,
    storageCalls: 0,
    fetchCalls: 0,
    xhrOpenCalls: 0,
    audioContextConstructions: 0,
  });

  await page.locator('#movement-json-details summary').click();
  await expect(page.locator('#movement-result')).toBeVisible();

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('body')).toHaveAttribute('data-movement-status', 'pass', {
    timeout: 30_000,
  });
  const reloadJson = await page.locator('#movement-result').textContent();
  if (reloadJson === null) throw new Error('Reloaded fixture lab did not expose JSON.');
  expect(JSON.parse(reloadJson) as MovementLabPayload).toEqual(firstPayload);

  const reloadActivity = await page.evaluate(() =>
    (window as typeof window & {
      __KYX_MOVEMENT_LAB_ACTIVITY__: RouteRuntimeActivity;
    }).__KYX_MOVEMENT_LAB_ACTIVITY__,
  );
  expect(reloadActivity).toEqual(firstActivity);

  const routeHost = new URL(page.url()).host;
  const externalRequests = requestUrls.filter((requestUrl) => {
    const url = new URL(requestUrl);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:')
      && url.host !== routeHost
    );
  });
  const nonViteSockets = webSocketUrls.filter((socketUrl) => {
    const url = new URL(socketUrl);
    return !(
      url.host === routeHost
      && url.pathname === '/'
      && url.searchParams.has('token')
    );
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(httpErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(nonViteSockets).toEqual([]);
});
