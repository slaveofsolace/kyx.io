import { expect, test } from '@playwright/test';

test('applies saved first-person controls and stance to a real pointer-locked Practice session', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile-unsupported', 'Desktop pointer-lock flow');
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('sio_settings', JSON.stringify({
      fov: 100, sensitivity: 2, invertY: true, adsSensitivity: 0.5, reducedMotion: true,
    }));
  });
  await page.goto('/practice');
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined);
  const snapshot = () => page.evaluate(() => window.__KYX_LOCAL_PRACTICE__!.getSnapshot());
  await expect.poll(async () => (await snapshot()).render3d).toMatchObject({
    selectedFirstPersonFieldOfViewDegrees: 100,
    cameraEyeHeightMillimeters: 1_700,
    cameraReducedMotion: true,
    cameraMovementBob: 0,
  });

  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Enter arena' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await snapshot()).pointerLocked).toBe(true);
  await expect.poll(async () => (await snapshot()).match.phase, { timeout: 15_000 }).toBe('active');
  const before = await snapshot();
  await page.mouse.move(620, 410);
  await expect.poll(async () => (await snapshot()).localAuthoritativePlayer.yawMilliDegrees)
    .toBe(before.localAuthoritativePlayer.yawMilliDegrees + 4_400);
  await expect.poll(async () => (await snapshot()).localAuthoritativePlayer.pitchMilliDegrees)
    .toBe(before.localAuthoritativePlayer.pitchMilliDegrees + 2_200);

  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => (await snapshot()).aimHeld).toBe(true);
  await expect.poll(async () => (await snapshot()).render3d.selectedFirstPersonAimMix).toBeGreaterThan(0.95);
  const beforeAds = await snapshot();
  await page.mouse.move(640, 420);
  await expect.poll(async () => (await snapshot()).localAuthoritativePlayer.yawMilliDegrees)
    .toBe(beforeAds.localAuthoritativePlayer.yawMilliDegrees + 2_200);
  await expect.poll(async () => (await snapshot()).localAuthoritativePlayer.pitchMilliDegrees)
    .toBe(beforeAds.localAuthoritativePlayer.pitchMilliDegrees + 1_100);
  expect((await snapshot()).render3d.selectedFirstPersonFieldOfViewDegrees).toBeLessThan(100);
  await page.mouse.up({ button: 'right' });

  await page.keyboard.down('ControlLeft');
  await expect.poll(async () => (await snapshot()).render3d.cameraEyeHeightMillimeters).toBe(1_000);
  await page.waitForTimeout(150);
  const crouched = await snapshot();
  expect(crouched.render3d.cameraPositionMillimeters.y - crouched.localAuthoritativePlayer.feetPosition.y)
    .toBeCloseTo(1_000, 3);
  await page.screenshot({ path: testInfo.outputPath('crouched-controls.png') });
  await page.keyboard.up('ControlLeft');
  await expect.poll(async () => (await snapshot()).render3d.cameraEyeHeightMillimeters).toBe(1_700);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyW');
  expect((await snapshot()).render3d.cameraMovementBob).toBe(0);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByRole('button', { name: 'Enter arena' })).toBeVisible();
  expect(errors).toEqual([]);
});
