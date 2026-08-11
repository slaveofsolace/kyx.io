import { expect, test } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('local Relay Practice route', () => {
  test('recovers from a stalled pointer-lock request and reconciles a late lock', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.addInitScript(() => {
      const state = {
        requestCount: 0,
        pointerLockElement: null as Element | null,
      };
      Object.defineProperty(window, '__KYX_POINTER_LOCK_TEST__', {
        configurable: true,
        value: state,
      });
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => state.pointerLockElement,
      });
      Object.defineProperty(document, 'exitPointerLock', {
        configurable: true,
        value: () => {
          state.pointerLockElement = null;
          document.dispatchEvent(new Event('pointerlockchange'));
        },
      });
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
        configurable: true,
        value: () => {
          state.requestCount += 1;
          return new Promise<void>(() => undefined);
        },
      });
    });

    await page.goto('/practice');
    await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined);
    const gate = page.getByRole('dialog', { name: 'First team to 40 wins' });
    const enter = page.getByRole('button', { name: 'Enter arena' });
    await expect(gate).toBeVisible();

    await enter.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new TypeError('local Practice entry action is not a button');
      }
      button.click();
      button.click();
    });
    await expect(enter).toBeDisabled();
    await expect(page.locator('.local-practice-gate__status'))
      .toHaveText('Capturing mouse…');
    await expect(enter).toBeEnabled({ timeout: 5_000 });
    await expect(page.locator('.local-practice-gate__status'))
      .toContainText('did not complete');
    await expect(enter).toBeFocused();
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().entryGateState ?? null
    ))).toBe('timed_out');
    expect(await page.evaluate(() => (
      (window as unknown as {
        __KYX_POINTER_LOCK_TEST__: { requestCount: number };
      }).__KYX_POINTER_LOCK_TEST__.requestCount
    ))).toBe(1);

    await page.evaluate(() => {
      const state = (window as unknown as {
        __KYX_POINTER_LOCK_TEST__: { pointerLockElement: Element | null };
      }).__KYX_POINTER_LOCK_TEST__;
      state.pointerLockElement = document.querySelector('#game-canvas');
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'ready');
    await expect(gate).toBeHidden();
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().entryGateState ?? null
    ))).toBe('active');

    await page.evaluate(() => document.exitPointerLock());
    await expect(gate).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'paused');
  });

  test('restores an actionable entry gate when pointer lock is denied', async ({ page }) => {
    await page.addInitScript(() => {
      const state = { requestCount: 0 };
      Object.defineProperty(window, '__KYX_POINTER_LOCK_DENIAL_TEST__', {
        configurable: true,
        value: state,
      });
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
        configurable: true,
        value: () => {
          state.requestCount += 1;
          return Promise.reject(new Error('pointer lock denied'));
        },
      });
    });

    await page.goto('/practice');
    await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined);
    const enter = page.getByRole('button', { name: 'Enter arena' });
    await enter.click();
    await expect(enter).toBeEnabled();
    await expect(enter).toBeFocused();
    await expect(page.locator('.local-practice-gate__status'))
      .toContainText('was denied');
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().entryGateState ?? null
    ))).toBe('denied');
    expect(await page.evaluate(() => (
      (window as unknown as {
        __KYX_POINTER_LOCK_DENIAL_TEST__: { requestCount: number };
      }).__KYX_POINTER_LOCK_DENIAL_TEST__.requestCount
    ))).toBe(2);
  });

  test('advances one shared 8-player authority runtime', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'chromium-mobile-unsupported',
      'The 8-player Practice runtime is intentionally desktop-only',
    );
    // Full-resolution WebGL startup is intentionally allowed extra time under
    // Chromium's software renderer. Frame-performance proof is a separate
    // evidence gate; this test verifies route integration and viewport truth.
    test.setTimeout(120_000);
    const evidenceDirectory = process.env.KYX_EVIDENCE_DIR ?? tmpdir();
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/practice');
    await expect(page.getByRole('dialog', { name: 'First team to 40 wins' })).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute(
      'data-launch-support',
      'local-relay-practice-authority',
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

    const entryAction = page.getByRole('button', { name: 'Enter arena' });
    const canvasBounds = await page.locator('#game-canvas').boundingBox();
    expect(canvasBounds).not.toBeNull();
    await page.mouse.move(
      (canvasBounds?.x ?? 0) + (canvasBounds?.width ?? 0) / 2,
      (canvasBounds?.y ?? 0) + (canvasBounds?.height ?? 0) / 2,
    );
    await entryAction.focus();
    await expect(entryAction).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'ready');
    await expect(page.getByRole('dialog', { name: 'First team to 40 wins' })).toBeHidden();

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
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().match.phase ?? null
    )), { timeout: 30_000 }).toBe('active');
    const movementStart = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
    ));
    expect(movementStart).not.toBeNull();
    expect(movementStart?.match).toMatchObject({
      phase: 'active',
      teamScores: expect.any(Array),
      playerScores: expect.any(Array),
      result: null,
      localLifePhase: 'alive',
      localDeathOrdinal: 0,
      localSpawnOrdinal: 1,
    });
    expect(movementStart?.match.playerScores).toHaveLength(8);
    await expect(page.locator('#gameover-menu')).toBeHidden();
    await expect(page.locator('#gameover-menu')).toHaveAttribute('inert', '');
    expect(movementStart?.loadout).toMatchObject({
      combatPresetId: 'assault',
      primaryWeaponSlot: 0,
      allowedWeaponSlots: [0, 1, 5],
      authoritativeSelectedWeaponSlot: 0,
      authoritativeSelectedWeaponId: 'vertical_rifle_v1',
    });
    await page.keyboard.press('Digit2');
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().loadout ?? null
    ))).toMatchObject({
      authoritativeSelectedWeaponSlot: 1,
      authoritativeSelectedWeaponId: 'kyx_sidearm_v1',
    });
    await page.keyboard.press('Digit6');
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().loadout ?? null
    ))).toMatchObject({
      authoritativeSelectedWeaponSlot: 5,
      authoritativeSelectedWeaponId: 'kyx_edge_v1',
    });
    await page.keyboard.press('Digit1');
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().loadout ?? null
    ))).toMatchObject({
      authoritativeSelectedWeaponSlot: 0,
      authoritativeSelectedWeaponId: 'vertical_rifle_v1',
    });
    await expect(page.locator('#dm-timer')).toBeVisible();
    await expect(page.locator('#local-score-label')).toHaveText('Your team');
    await expect(page.locator('#opponent-score-label')).toHaveText('Opponents');

    await page.keyboard.down('Tab');
    await expect(page.locator('#scoreboard-overlay')).toBeVisible();
    await expect(page.locator('#sb-rows tr')).toHaveCount(8);
    await expect(page.locator('#sb-rows tr').first().locator('td')).toHaveCount(6);
    await page.keyboard.up('Tab');
    await expect(page.locator('#scoreboard-overlay')).toBeHidden();

    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.mouse.move(840, 420);
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().serverTick ?? 0
    ))).toBeGreaterThan((movementStart?.serverTick ?? 0) + 12);
    await expect.poll(async () => page.evaluate((origin) => {
      const feet = window.__KYX_LOCAL_PRACTICE__?.getSnapshot()
        .localAuthoritativePlayer.feetPosition;
      if (feet === undefined) return 0;
      return Math.hypot(feet.x - origin.x, feet.z - origin.z);
    }, movementStart?.localAuthoritativePlayer.feetPosition ?? { x: 0, z: 0 }), {
      timeout: 5_000,
    }).toBeGreaterThan(400);
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

    const launchBefore = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().launch ?? null
    ));
    expect(launchBefore).not.toBeNull();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(120);
    await page.screenshot({
      path: join(tmpdir(), 'kyx-launch-contact-presentation-20260802.png'),
      fullPage: false,
    });
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().launch.acceptedThrowCount ?? 0
    ))).toBeGreaterThan(launchBefore?.acceptedThrowCount ?? 0);
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().launch.detonationCount ?? 0
    )), { timeout: 10_000 }).toBeGreaterThan(launchBefore?.detonationCount ?? 0);

    const launchAfter = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
    ));
    expect(launchAfter?.launch).toMatchObject({
      acceptedThrowCount: (launchBefore?.acceptedThrowCount ?? 0) + 1,
      collisionCount: (launchBefore?.collisionCount ?? 0) + 1,
      detonationCount: (launchBefore?.detonationCount ?? 0) + 1,
      terminalContactSameTick: true,
      lastCollision: {
        bounceCount: 0,
        settled: true,
      },
      lastDetonation: {
        reason: 'collision',
      },
    });
    expect(launchAfter?.launch.lastCollision?.authorityTick)
      .toBe(launchAfter?.launch.lastDetonation?.authorityTick);
    expect(launchAfter?.render3d).toMatchObject({
      launchProjectilePresentation: 'cutline_launch_canister_v1',
      launchCanisterPresentationCount: expect.any(Number),
      launchPulsePresentationCount: expect.any(Number),
    });
    expect(launchAfter?.render3d.launchCanisterPresentationCount ?? 0).toBeGreaterThan(0);
    expect(launchAfter?.render3d.launchPulsePresentationCount ?? 0).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().launch.activeLocalProjectileCount ?? -1
    ))).toBe(0);

    const throwablePresentationBefore = launchAfter?.render3d.throwablePresentationCount ?? 0;
    await page.mouse.move(840, 650);
    await page.keyboard.press('KeyF');
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().render3d.throwablePresentationCount ?? 0
    ))).toBeGreaterThan(throwablePresentationBefore);
    await expect.poll(async () => page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().render3d.activeSmokeFieldCount ?? 0
    )), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1_900);
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(120);
    await page.screenshot({
      path: join(evidenceDirectory, 'kyx-smoke-field-presentation-20260808.png'),
      fullPage: false,
    });

    const diagnostics = await page.evaluate(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
    ));
    expect(diagnostics).not.toBeNull();
    expect(diagnostics).toMatchObject({
      schemaVersion: 1,
      status: 'ready',
      hostId: 'local_relay_practice_authority_v1',
      lifecycle: 'active',
      playerCount: 8,
      botCount: 7,
      mapId: 'relay',
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
        yawMilliDegrees: expect.any(Number),
        pitchMilliDegrees: expect.any(Number),
      },
      render3d: {
        status: 'ready',
        renderer: 'three_webgl',
        presentationMode: 'relay_visual_candidate',
        presentationDisplayName: 'Relay',
        authorityCompatibility: 'relay_revision_1_authority_candidate',
        remoteAvatarCount: 7,
        launchProjectilePresentation: 'cutline_launch_canister_v1',
        selectedWeaponId: 'vertical_rifle_v1',
        selectedFirstPersonHandCount: 2,
      },
    });
    expect(diagnostics?.acceptedInputs ?? 0).toBeGreaterThanOrEqual(72);
    expect(diagnostics?.missedSchedulerTicks).toBe(0);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({
      path: join(evidenceDirectory, 'kyx-relay-practice-active.png'),
      fullPage: false,
    });
  });
});
