import { expect, test, type Page } from '@playwright/test';

interface ArenaSnapshot {
  readonly roomCode: string;
  readonly connection: string;
  readonly remotePlayers: number;
  readonly commandsGenerated: number;
  readonly lastError: string | null;
  readonly inputBridge: Readonly<{ readonly selectedWeaponSlot: number }>;
  readonly localAuthoritativePosition: Readonly<{ x: number; y: number; z: number }> | null;
  readonly roomVerification?: Readonly<{
    roomProfile: string;
    mapBinding: Readonly<{
      mapId: string;
      mapReference: string;
      displayName?: string;
    }>;
  }>;
}

async function snapshot(page: Page): Promise<ArenaSnapshot | null> {
  return page.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot() ?? null);
}

test('Switchyard and Crownpoint mount their exact authority worlds and player-visible renderers', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cases = [
    {
      profile: 'switchyard-revision-1-authority-v1',
      mapId: 'switchyard',
      mapReference: 'switchyard@1',
      displayName: 'Switchyard',
    },
    {
      profile: 'crownpoint-revision-1-authority-v1',
      mapId: 'crownpoint',
      mapReference: 'crownpoint@1',
      displayName: 'Crownpoint',
    },
  ] as const;

  for (const arena of cases) {
    await page.goto(`/online?mode=create&profile=${arena.profile}`);
    await expect.poll(async () => (await snapshot(page))?.connection ?? null, {
      timeout: 20_000,
    }).toBe('joined');
    await expect(page.locator('body')).toHaveAttribute('data-online3d-status', 'ready', {
      timeout: 20_000,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-online-map-reference',
      arena.mapReference,
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-online3d-presentation-mode',
      'original_arena_visual_v4',
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-online3d-display-name',
      arena.displayName,
    );
    const initial = await snapshot(page);
    expect(initial?.remotePlayers).toBe(7);
    expect(initial?.roomVerification).toMatchObject({
      roomProfile: arena.profile,
      mapBinding: {
        mapId: arena.mapId,
        mapReference: arena.mapReference,
        displayName: arena.displayName,
      },
    });
    const beforePosition = initial?.localAuthoritativePosition;
    const beforeCommands = initial?.commandsGenerated ?? 0;
    if (beforePosition === null || beforePosition === undefined) {
      throw new Error(`${arena.mapId} did not expose an authoritative spawn position`);
    }
    const weaponButtons = page.locator('[data-testid^="online-weapon-slot-"]');
    await expect(weaponButtons).toHaveCount(6);
    for (let slot = 0; slot < 6; slot += 1) {
      const button = page.getByTestId(`online-weapon-slot-${slot}`);
      await expect(button).toBeEnabled();
      await page.keyboard.press(`Digit${slot + 1}`);
      await expect.poll(async () => (
        await snapshot(page)
      )?.inputBridge.selectedWeaponSlot ?? -1).toBe(slot);
    }
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await snapshot(page))?.commandsGenerated ?? 0, {
      timeout: 10_000,
    }).toBeGreaterThan(beforeCommands + 5);
    await expect.poll(async () => {
      const position = (await snapshot(page))?.localAuthoritativePosition;
      return position !== null && position !== undefined
        && Math.hypot(
          position.x - beforePosition.x,
          position.z - beforePosition.z,
        ) >= 500;
    }, { timeout: 10_000 }).toBe(true);
    await page.keyboard.up('KeyW');
  }
});

test('production continuation allocates fresh rooms across the three-arena rotation', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const sequence = [
    {
      profile: 'relay-revision-1-authority-v1',
      mapReference: 'relay@1',
    },
    {
      profile: 'switchyard-revision-1-authority-v1',
      mapReference: 'switchyard@1',
    },
    {
      profile: 'crownpoint-revision-1-authority-v1',
      mapReference: 'crownpoint@1',
    },
    {
      profile: 'relay-revision-1-authority-v1',
      mapReference: 'relay@1',
    },
  ] as const;

  await page.goto(`/online?mode=create&profile=${sequence[0].profile}`);
  let previousRoomCode: string | null = null;
  for (const [index, arena] of sequence.entries()) {
    await expect.poll(async () => (await snapshot(page))?.connection ?? null, {
      timeout: 30_000,
    }).toBe('joined');
    await expect.poll(async () => (
      (await snapshot(page))?.roomVerification?.roomProfile ?? null
    ), { timeout: 30_000 }).toBe(arena.profile);
    await expect(page.locator('body')).toHaveAttribute(
      'data-online-map-reference',
      arena.mapReference,
      { timeout: 30_000 },
    );
    const current = await snapshot(page);
    if (current === null) throw new Error(`arena ${arena.profile} did not expose diagnostics`);
    expect(current.roomCode).toMatch(/^KYX-[A-Z0-9]{6}$/u);
    if (previousRoomCode !== null) expect(current.roomCode).not.toBe(previousRoomCode);
    previousRoomCode = current.roomCode;

    if (index === sequence.length - 1) break;
    await page.getByTestId('online-play-again').evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new TypeError('online Play again control is not a button');
      }
      button.click();
    });
    await expect.poll(async () => (await snapshot(page))?.roomCode ?? null, {
      timeout: 30_000,
    }).not.toBe(previousRoomCode);
  }
});

test('an active match remains live beyond the socket stale boundary', async ({ page }) => {
  test.setTimeout(100_000);

  await page.goto('/online?mode=create&profile=relay-revision-1-authority-v1');
  await expect.poll(async () => (await snapshot(page))?.connection ?? null, {
    timeout: 30_000,
  }).toBe('joined');
  const active = await snapshot(page);
  if (active === null) throw new Error('active match did not expose online diagnostics');

  await page.waitForTimeout(35_000);
  const afterStaleBoundary = await snapshot(page);
  expect(afterStaleBoundary).not.toBeNull();
  expect(afterStaleBoundary?.connection).toBe('joined');
  expect(afterStaleBoundary?.roomCode).toBe(active.roomCode);
  expect(afterStaleBoundary?.commandsGenerated ?? 0)
    .toBeGreaterThan(active.commandsGenerated + 100);
  expect(afterStaleBoundary?.lastError).toBeNull();
  await expect(page.getByRole('alert')).toBeHidden();
});
