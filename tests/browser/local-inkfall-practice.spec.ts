import { expect, test } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('local Inkfall Practice route', () => {
  test('advances one shared 8-player authority runtime', async ({ page }) => {
    // Full-resolution WebGL startup is intentionally allowed extra time under
    // Chromium's software renderer. Frame-performance proof is a separate
    // evidence gate; this test verifies route integration and viewport truth.
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/practice');
    await expect(page.getByRole('dialog', { name: 'Enter the arena' })).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute(
      'data-launch-support',
      'local-inkfall-practice-authority',
    );

    const entryGateLayout = await page.locator('#local-practice-gate').evaluate((gate) => {
      const bounds = gate.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        viewportWidth: window.innerWidth,
        width: bounds.width,
      };
    });
    if (entryGateLayout.viewportWidth >= 901) {
      expect(entryGateLayout.left).toBeLessThanOrEqual(1);
      expect(entryGateLayout.width).toBeGreaterThanOrEqual(540);
      expect(entryGateLayout.right).toBeLessThanOrEqual(entryGateLayout.viewportWidth * 0.64);
    }

    await page.getByRole('button', { name: 'Enter arena' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'ready');
    await expect(page.getByRole('dialog', { name: 'Enter the arena' })).toBeHidden();

    const canvasViewport = await page.locator('#game-canvas').evaluate((canvas) => ({
      height: canvas.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: canvas.getBoundingClientRect().width,
    }));
    expect(canvasViewport.width).toBeGreaterThanOrEqual(canvasViewport.viewportWidth - 1);
    expect(canvasViewport.height).toBeGreaterThanOrEqual(canvasViewport.viewportHeight - 1);

    const hudClearance = await page.evaluate(() => {
      const vitals = document.querySelector('#hud-vitals')?.getBoundingClientRect();
      const abilities = document.querySelector('#ability-rack')?.getBoundingClientRect();
      if (!vitals || !abilities) return null;
      return {
        abilityLeft: abilities.left,
        abilityRight: abilities.right,
        vitalsRight: vitals.right,
        viewportWidth: window.innerWidth,
      };
    });
    expect(hudClearance).not.toBeNull();
    if ((hudClearance?.viewportWidth ?? 0) >= 901) {
      expect((hudClearance?.abilityLeft ?? 0) - (hudClearance?.vitalsRight ?? 0))
        .toBeGreaterThanOrEqual(24);
      expect(hudClearance?.abilityRight ?? Number.POSITIVE_INFINITY)
        .toBeLessThanOrEqual((hudClearance?.viewportWidth ?? 0) * 0.58);
    }

    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().serverTick ?? 0
    ))).toBeGreaterThan(1);
    const movementStart = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
    ));
    expect(movementStart).not.toBeNull();

    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.mouse.move(840, 420);
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().serverTick ?? 0
    ))).toBeGreaterThan((movementStart?.serverTick ?? 0) + 12);
    const movementEnd = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
    ));
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');

    expect(movementEnd).not.toBeNull();
    const startFeet = movementStart?.localAuthoritativePlayer.feetPosition;
    const endFeet = movementEnd?.localAuthoritativePlayer.feetPosition;
    expect(startFeet).toBeDefined();
    expect(endFeet).toBeDefined();
    const horizontalDisplacement = Math.hypot(
      (endFeet?.x ?? 0) - (startFeet?.x ?? 0),
      (endFeet?.z ?? 0) - (startFeet?.z ?? 0),
    );
    expect(horizontalDisplacement).toBeGreaterThan(400);
    expect(Math.hypot(
      movementEnd?.localAuthoritativePlayer.velocity.x ?? 0,
      movementEnd?.localAuthoritativePlayer.velocity.z ?? 0,
    )).toBeGreaterThan(1_000);

    const diagnostics = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
    ));
    expect(diagnostics).not.toBeNull();
    expect(diagnostics).toMatchObject({
      schemaVersion: 1,
      status: 'ready',
      hostId: 'local_inkfall_practice_authority_v1',
      lifecycle: 'active',
      playerCount: 8,
      botCount: 7,
      mapId: 'inkfall_foundry',
      pointerLocked: true,
      localAuthoritativePlayer: {
        playerId: 'practice.local.player',
        feetPosition: {
          x: expect.any(Number),
          y: expect.any(Number),
          z: expect.any(Number),
        },
        velocity: {
          x: expect.any(Number),
          y: expect.any(Number),
          z: expect.any(Number),
        },
      },
      render3d: {
        status: 'ready',
        renderer: 'three_webgl',
        remoteAvatarCount: 7,
        selectedWeaponId: 'vertical_rifle_v1',
        selectedFirstPersonHandCount: 2,
      },
    });
    expect(diagnostics?.acceptedInputs ?? 0).toBeGreaterThanOrEqual(72);
    expect(diagnostics?.missedSchedulerTicks).toBe(0);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: join(tmpdir(), 'kyx-inkfall-practice-active-20260731.png'),
      fullPage: false,
    });
  });
});
