import { expect, test, type Page } from '@playwright/test';

interface ArenaSnapshot {
  readonly connection: string;
  readonly remotePlayers: number;
  readonly commandsGenerated: number;
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
      'original_arena_visual_v1',
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
