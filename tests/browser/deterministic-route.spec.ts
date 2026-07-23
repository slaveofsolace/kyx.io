import { expect, test } from '@playwright/test';

test('development determinism route repeats the pure 20 Hz replay hash', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const requestOrigins = new Set<string>();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') requestOrigins.add(url.origin);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });

  await page.goto('/__test__/determinism', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle('KYX.IO — Determinism Contract');
  await expect(page.locator('body')).toHaveAttribute('data-launch-support', 'deterministic-test');
  await expect(page.locator('body')).toHaveAttribute('data-determinism-status', 'pass');
  await expect(page.getByRole('status')).toHaveText('Determinism probe passed');
  await expect(page.locator('canvas')).toHaveCount(0);

  const firstPayload = JSON.parse(await page.locator('#determinism-result').innerText()) as {
    schemaVersion: number;
    profile: string;
    tickDurationMs: number;
    finalTick: number;
    finalStateHash: string;
    entityCount: number;
    eventCount: number;
  };
  expect(firstPayload).toMatchObject({
    schemaVersion: 1,
    profile: 'authority_20hz',
    tickDurationMs: 50,
    finalTick: 6,
    entityCount: 2,
    eventCount: 6,
  });
  expect(firstPayload.finalStateHash).toBe('d7201dfc006e72ee');

  await page.reload({ waitUntil: 'networkidle' });
  const secondPayload = JSON.parse(await page.locator('#determinism-result').innerText()) as {
    finalStateHash: string;
  };
  expect(secondPayload.finalStateHash).toBe(firstPayload.finalStateHash);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect([...requestOrigins]).toEqual([new URL(page.url()).origin]);
});
