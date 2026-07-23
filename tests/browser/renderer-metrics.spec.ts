import { expect, test } from '@playwright/test';

interface DebugMetrics {
  schemaVersion: number;
  state: string;
  renderRange: { count: number; maxCalls: number; maxTriangles: number } | null;
  memory: { geometries: number; textures: number };
  sceneObjects: number;
  frameTimes: {
    count: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  } | null;
  longTasks: {
    supported: boolean;
    totalCount: number;
    totalDurationMs: number;
    maxDurationMs: number;
    recent: {
      windowMs: number;
      count: number;
      totalDurationMs: number;
      p95DurationMs: number;
      maxDurationMs: number;
    };
  };
  heap: {
    usedBytes: number;
    totalBytes: number;
    limitBytes: number;
  } | null;
}

test('read-only renderer diagnostics stay development-only and launch-gated', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'networkidle' });
  const canvas = page.locator('#game-canvas');
  const mobile = testInfo.project.name === 'chromium-mobile-unsupported';

  if (mobile) {
    await expect(page.locator('body')).toHaveAttribute('data-launch-support', 'desktop-required');
    await expect(canvas).not.toHaveAttribute('data-kyx-dev-metrics', /.+/);
  } else {
    await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(
      async () => await canvas.getAttribute('data-kyx-dev-metrics'),
      { timeout: 10_000 },
    ).not.toBeNull();

    const serialized = await canvas.getAttribute('data-kyx-dev-metrics');
    if (serialized === null) throw new Error('Renderer metrics were not published.');
    const metrics = JSON.parse(serialized) as DebugMetrics;

    expect(metrics.schemaVersion).toBe(1);
    expect(metrics.state).toBe('menu');
    expect(metrics.renderRange?.count).toBeGreaterThan(0);
    expect(metrics.renderRange?.maxCalls).toBeGreaterThan(0);
    expect(metrics.renderRange?.maxTriangles).toBeGreaterThan(0);
    expect(metrics.memory.geometries).toBeGreaterThan(0);
    expect(metrics.sceneObjects).toBeGreaterThan(0);
    expect(metrics.frameTimes?.count).toBeGreaterThan(0);
    expect(metrics.frameTimes?.p95Ms).toBeGreaterThanOrEqual(metrics.frameTimes?.p50Ms ?? 0);
    expect(metrics.frameTimes?.p99Ms).toBeGreaterThanOrEqual(metrics.frameTimes?.p95Ms ?? 0);
    expect(metrics.frameTimes?.maxMs).toBeGreaterThanOrEqual(metrics.frameTimes?.p99Ms ?? 0);
    expect(typeof metrics.longTasks.supported).toBe('boolean');
    expect(metrics.longTasks.totalCount).toBeGreaterThanOrEqual(0);
    expect(metrics.longTasks.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.longTasks.maxDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.longTasks.recent.windowMs).toBe(60_000);
    expect(metrics.longTasks.recent.count).toBeGreaterThanOrEqual(0);
    if (metrics.heap !== null) {
      expect(metrics.heap.usedBytes).toBeGreaterThan(0);
      expect(metrics.heap.totalBytes).toBeGreaterThanOrEqual(metrics.heap.usedBytes);
      expect(metrics.heap.limitBytes).toBeGreaterThanOrEqual(metrics.heap.totalBytes);
    }
    expect(await page.evaluate(() => Object.hasOwn(window, 'game'))).toBe(false);
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
