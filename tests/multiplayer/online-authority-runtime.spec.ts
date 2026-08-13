import { expect, test, type BrowserContext, type Page } from '@playwright/test';

interface OnlineSnapshot {
  readonly roomCode: string;
  readonly connection: string;
  readonly playerId: string | null;
  readonly remotePlayers: number;
  readonly commandsGenerated: number;
  readonly resumeSuccesses: number;
  readonly lastError: string | null;
  readonly localPredictedPosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritativePosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritativeVelocity: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritativeGrounded: boolean | null;
  readonly localAuthoritativeLocomotion: 'grounded' | 'airborne' | 'sliding' | null;
  readonly inputBridge: Readonly<{
    readonly pressedKeys: readonly string[];
    readonly axes: Readonly<{
      readonly moveX: number;
      readonly moveY: number;
    }>;
    readonly heldButtons: number;
    readonly crouch: boolean;
    readonly jump: boolean;
    readonly sprint: boolean;
    readonly primaryFire: boolean;
    readonly aimHeld: boolean;
  }>;
}

async function snapshot(page: Page): Promise<OnlineSnapshot | null> {
  return page.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot() ?? null);
}

async function waitForJoined(page: Page): Promise<OnlineSnapshot> {
  await expect.poll(async () => {
    const current = await snapshot(page);
    if (current?.connection === 'failed') {
      throw new Error(`online authority client failed: ${current.lastError ?? 'no diagnostic'}`);
    }
    return current?.connection ?? null;
  }, {
    timeout: 20_000,
  }).toBe('joined');
  const result = await snapshot(page);
  if (result === null) throw new Error('online preview diagnostics were not installed');
  return result;
}

test('ships movement inputs and converges real 2/4/8 browser clients with resume', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const extraContexts: BrowserContext[] = [];
  const pages: Page[] = [page];
  try {
    await page.goto('/online?mode=create');
    const creator = await waitForJoined(page);
    expect(creator.roomCode).toMatch(/^KYX-[A-Z0-9]{6}$/u);
    expect(creator.remotePlayers).toBe(7);
    expect(creator.playerId).toBe('player.relay.slot.01');
    await expect(page.getByTestId('online-damage-direction'))
      .toHaveAttribute('data-active', 'false');

    const joinOne = async (): Promise<Page> => {
      const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
      extraContexts.push(context);
      const joinedPage = await context.newPage();
      pages.push(joinedPage);
      await joinedPage.goto(`/online?mode=join&room=${creator.roomCode}`);
      await waitForJoined(joinedPage);
      return joinedPage;
    };

    await joinOne();
    await expect.poll(async () => (await snapshot(page))?.remotePlayers ?? -1).toBe(7);

    await Promise.all([joinOne(), joinOne()]);
    await expect.poll(async () => (await snapshot(page))?.remotePlayers ?? -1).toBe(7);

    await Promise.all([joinOne(), joinOne(), joinOne(), joinOne()]);
    await expect.poll(async () => (await snapshot(page))?.remotePlayers ?? -1).toBe(7);
    await Promise.all(pages.map(async (clientPage) => {
      await expect.poll(async () => (await snapshot(clientPage))?.remotePlayers ?? -1)
        .toBe(7);
    }));
    const joinedPlayerIds = await Promise.all(pages.map(async (clientPage) => (
      (await waitForJoined(clientPage)).playerId
    )));
    expect([...joinedPlayerIds].sort()).toEqual([
      'player.relay.slot.01',
      'player.relay.slot.02',
      'player.relay.slot.03',
      'player.relay.slot.04',
      'player.relay.slot.05',
      'player.relay.slot.06',
      'player.relay.slot.07',
      'player.relay.slot.08',
    ]);

    // Eight simultaneous software-rendered WebGL pages are required only for
    // the population/takeover proof. Release seven renderers before the
    // movement/reconciliation sequence; the authority room retains all eight
    // stable player slots and refills disconnected human slots with bots.
    await Promise.all(pages.slice(1).map(async (clientPage) => {
      await clientPage.close({ runBeforeUnload: false });
    }));
    for (const context of extraContexts) await context.close();
    extraContexts.length = 0;
    pages.splice(1);
    await expect.poll(async () => (await snapshot(page))?.remotePlayers ?? -1, {
      timeout: 20_000,
    }).toBe(7);

    const before = await waitForJoined(page);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ShiftRight');
    await expect.poll(async () => (await snapshot(page))?.inputBridge).toMatchObject({
      axes: { moveY: 127 },
      sprint: true,
    });
    await page.keyboard.up('ShiftLeft');
    await expect.poll(async () => (await snapshot(page))?.inputBridge.sprint ?? false)
      .toBe(true);
    await expect.poll(async () => {
      const velocity = (await snapshot(page))?.localAuthoritativeVelocity;
      return velocity === null || velocity === undefined
        ? 0
        : Math.hypot(velocity.x, velocity.z);
    }, { timeout: 10_000 }).toBeGreaterThanOrEqual(7_000);
    await page.keyboard.down('KeyC');
    await expect.poll(async () => (await snapshot(page))?.inputBridge).toMatchObject({
      crouch: true,
      sprint: true,
    });
    await expect.poll(async () => (
      await snapshot(page)
    )?.localAuthoritativeLocomotion ?? null, { timeout: 10_000 }).toBe('sliding');
    await page.keyboard.up('KeyC');
    await page.keyboard.up('ShiftRight');
    await expect.poll(async () => (
      await snapshot(page)
    )?.localAuthoritativeLocomotion ?? null, { timeout: 10_000 }).toBe('grounded');
    await page.keyboard.down('Space');
    await expect.poll(async () => (await snapshot(page))?.inputBridge).toMatchObject({
      jump: true,
      axes: { moveY: 127 },
    });
    await expect.poll(async () => (
      await snapshot(page)
    )?.localAuthoritativeLocomotion ?? null, { timeout: 10_000 }).toBe('airborne');
    const airborne = await snapshot(page);
    const airbornePosition = airborne?.localAuthoritativePosition;
    if (airbornePosition === null || airbornePosition === undefined) {
      throw new Error('authoritative airborne position was unavailable');
    }
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await snapshot(page))?.inputBridge).toMatchObject({
      axes: { moveX: 127, moveY: 127 },
      jump: true,
    });
    await expect.poll(async () => {
      const state = await snapshot(page);
      return state?.localAuthoritativeLocomotion === 'airborne'
        && state.localAuthoritativePosition !== null
        && state.localAuthoritativePosition.x > airbornePosition.x + 25;
    }, { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => (await snapshot(page))?.commandsGenerated ?? 0)
      .toBeGreaterThan(before.commandsGenerated + 5);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    await expect.poll(async () => (await snapshot(page))?.commandsGenerated ?? 0)
      .toBeGreaterThan(before.commandsGenerated);
    await expect.poll(async () => {
      const position = (await snapshot(page))?.localPredictedPosition;
      return position === null
        || position === undefined
        || before.localPredictedPosition === null
        ? false
        : position.x !== before.localPredictedPosition.x
          || position.y !== before.localPredictedPosition.y
          || position.z !== before.localPredictedPosition.z;
    }).toBe(true);

    const fire = page.getByTestId('online-fire');
    await page.keyboard.down('Enter');
    await fire.dispatchEvent('pointerdown');
    await expect.poll(async () => (await snapshot(page))?.inputBridge.primaryFire ?? false)
      .toBe(true);
    await fire.dispatchEvent('pointerup');
    await expect.poll(async () => (await snapshot(page))?.inputBridge.primaryFire ?? false)
      .toBe(true);
    await page.keyboard.up('Enter');
    await expect.poll(async () => (await snapshot(page))?.inputBridge.primaryFire ?? true)
      .toBe(false);

    const canvas = page.locator('.online-session__canvas');
    await canvas.dispatchEvent('pointerdown', { button: 2 });
    await expect.poll(async () => (await snapshot(page))?.inputBridge.aimHeld ?? false)
      .toBe(true);
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { button: 2 }));
    });
    await expect.poll(async () => (await snapshot(page))?.inputBridge.aimHeld ?? true)
      .toBe(false);

    const crouch = page.getByTestId('online-crouch');
    await crouch.dispatchEvent('pointerdown');
    await expect.poll(async () => (await snapshot(page))?.inputBridge.crouch ?? false)
      .toBe(true);
    await expect(crouch).toHaveAttribute('aria-pressed', 'true');
    await crouch.dispatchEvent('pointerup');
    await expect.poll(async () => (await snapshot(page))?.inputBridge.crouch ?? true)
      .toBe(false);

    const beforeResume = await waitForJoined(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => (await snapshot(page))?.resumeSuccesses ?? 0, {
      timeout: 20_000,
    }).toBeGreaterThan(beforeResume.resumeSuccesses);
    const resumed = await waitForJoined(page);
    expect(resumed.playerId).toBe(beforeResume.playerId);
    await expect.poll(async () => (await snapshot(page))?.remotePlayers ?? -1).toBe(7);
  } finally {
    await Promise.all(extraContexts.map((context) => context.close()));
  }
});
