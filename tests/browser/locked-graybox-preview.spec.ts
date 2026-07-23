import { expect, test } from '@playwright/test';

interface LockedGrayboxPreviewSnapshot {
  readonly status: string;
  readonly selection: {
    readonly explicit: boolean;
    readonly reference: string;
    readonly mapId: string;
    readonly mapRevision: number;
  };
  readonly catalogDefault: {
    readonly mapId: string;
    readonly mapRevision: number;
    readonly unchanged: boolean;
  };
  readonly package: {
    readonly digest: string;
    readonly zoneCount: number;
    readonly spawnCount: number;
    readonly authorityVolumeCount: number;
  };
  readonly assets: {
    readonly requestedSeparately: boolean;
    readonly render: Record<string, unknown>;
    readonly authorityCollision: Record<string, unknown>;
  };
  readonly productBoundary: Record<string, boolean>;
  readonly nonClaims: readonly string[];
}

test('product-visible explicit @2 preview keeps the playable/default and artifact-role boundaries open', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];
  const requestedUrls: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/?mapPackage=inkfall_foundry%402', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toHaveAttribute('data-launch-support', 'locked-graybox-preview');
  await expect(page.locator('body')).toHaveAttribute('data-map-preview-status', 'ready', { timeout: 30_000 });
  await expect(page.locator('body')).toHaveAttribute('data-map-preview-reference', 'inkfall_foundry@2');
  await expect(page.locator('body')).toHaveAttribute('data-catalog-default', 'inkfall_foundry@1');
  await expect(page.getByRole('heading', { name: 'Inkfall Foundry' })).toBeVisible();
  await expect(page.getByText('RENDER-ONLY GLB', { exact: true })).toBeVisible();
  await expect(page.getByText('AUTHORITY-COLLISION GLB', { exact: true })).toBeVisible();
  await expect(page.getByText('Loaded + hash verified', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Default revision unchanged', { exact: true })).toBeVisible();
  await expect(page.getByText('Offline Practice unchanged', { exact: true })).toBeVisible();
  await expect(page.getByText(/GRAYBOX INSPECTION ONLY.*G5 REMAINS OPEN/u)).toBeVisible();
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);

  const canvas = page.getByLabel('Top-down locked Inkfall Foundry revision 2 authority-collision plan');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png').length))
    .toBeGreaterThan(8_000);

  const evidence = await page.evaluate(() => {
    const surface = (window as typeof window & {
      __KYX_LOCKED_GRAYBOX_PREVIEW__?: {
        readonly getSnapshot: () => LockedGrayboxPreviewSnapshot;
      };
    }).__KYX_LOCKED_GRAYBOX_PREVIEW__;
    const descriptor = Object.getOwnPropertyDescriptor(window, '__KYX_LOCKED_GRAYBOX_PREVIEW__');
    return {
      snapshot: surface?.getSnapshot(),
      writable: descriptor?.writable,
      configurable: descriptor?.configurable,
    };
  });
  expect(evidence).toMatchObject({
    snapshot: {
      status: 'LOCKED_GRAYBOX_EXPLICIT_PREVIEW_READY_G5_OPEN',
      selection: {
        explicit: true,
        reference: 'inkfall_foundry@2',
        mapId: 'inkfall_foundry',
        mapRevision: 2,
      },
      catalogDefault: {
        mapId: 'inkfall_foundry',
        mapRevision: 1,
        unchanged: true,
      },
      package: {
        digest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
        zoneCount: 9,
        spawnCount: 12,
        authorityVolumeCount: 2,
      },
      assets: {
        requestedSeparately: true,
        render: {
          role: 'render_only',
          path: 'revisions/revision-2/export/render.graybox.glb',
          bytes: 613_564,
          sha256: '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634',
          meshNodeCount: 346,
          verified: true,
        },
        authorityCollision: {
          role: 'authority_collision',
          path: 'revisions/revision-2/export/collision.authority.glb',
          bytes: 604_228,
          sha256: 'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e',
          meshNodeCount: 339,
          authorityVolumeCount: 2,
          totalColliderCount: 341,
          fixtureHash: 'bf85e42731fd088e',
          verified: true,
        },
      },
      productBoundary: {
        loadedIntoOfflinePractice: false,
        playableFromPreview: false,
        shippingDefaultChanged: false,
        finalArt: false,
        performanceAccepted: false,
        g5Passed: false,
      },
      nonClaims: [
        'GRAYBOX_INSPECTION_ONLY',
        'OFFLINE_PRACTICE_MAP_UNCHANGED',
        'NOT_PLAYABLE_FROM_THIS_SURFACE',
        'NOT_FINAL_ART',
        'NO_PERFORMANCE_ACCEPTANCE',
        'NO_SHIPPING_OR_DEPLOYMENT_PROMOTION',
        'G5_REMAINS_OPEN',
      ],
    },
    writable: false,
    configurable: false,
  });

  const artifactFetches = requestedUrls.filter((url) => new URL(url).pathname.endsWith('.glb'));
  expect(artifactFetches.length).toBeGreaterThanOrEqual(2);
  expect(new Set(artifactFetches.map((url) => new URL(url).pathname)).size).toBe(2);
  const origin = new URL(page.url()).origin;
  expect(requestedUrls.filter((url) => {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin !== origin;
  })).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(httpErrors).toEqual([]);
});

test('unsupported explicit package requests do not fall through into Offline Practice', async ({ page }) => {
  await page.goto('/?mapPackage=inkfall_foundry%401');
  await expect(page.locator('body')).toHaveAttribute('data-map-preview-status', 'unsupported');
  await expect(page.getByRole('alert')).toContainText('UNSUPPORTED EXPLICIT MAP PACKAGE REQUEST');
  await expect(page.getByRole('alert')).toContainText('No map package or Offline Practice fallback was loaded.');
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);
});
