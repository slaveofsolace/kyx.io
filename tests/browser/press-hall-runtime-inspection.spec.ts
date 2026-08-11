import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test.setTimeout(60_000);

const rev4EvidenceDirectory = resolve(
  process.env.KYX_REV4_EVIDENCE_DIR
    ?? 'evidence/2026-07-27/g5-inkfall-rev4-runtime-candidate',
);

test('retired Press Hall inspection stays off the player-facing Relay menu', async ({
  page,
}, testInfo) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const inspectionLink = page.getByRole('link', { name: 'INSPECT PRESS HALL V3.3 MATERIAL RUNTIME' });
  await expect(inspectionLink).toHaveCount(0);
  if (testInfo.project.name === 'chromium-mobile-unsupported') {
    await expect(page.getByRole('heading', { name: 'DESKTOP REQUIRED' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toHaveCount(1);
  }
  await expect(page.locator('body')).not.toHaveAttribute(
    'data-launch-support',
    'press-hall-v3-3-inspection',
  );
});

test('Rev4.1 Press Archive art stays visual-only over executable Revision 3 authority', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });

  await page.goto(
    '/?mapArt=inkfall_foundry%403%2Fpress_archive%2Fv4.1%2Fspatial-material-joined',
    { waitUntil: 'networkidle' },
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-launch-support',
    'press-archive-rev4-1-rev3-authority-candidate',
    { timeout: 45_000 },
  );
  await expect(page.locator('body')).toHaveAttribute('data-press-hall-status', 'ready');
  await expect(page.locator('body')).toHaveAttribute('data-catalog-default', 'inkfall_foundry@1');
  await expect(page.getByRole('heading', { name: 'Press Archive v4.1' })).toBeVisible();
  await expect(page.getByLabel(
    'Interactive Press Archive v4.1 joined-art runtime inspection viewport',
  )).toBeVisible();
  await expect(page.getByText(/presentation art \+ separate revision-3 authority overlay/iu))
    .toBeVisible();

  await page.evaluate(() => {
    window.__KYX_PRESS_HALL_INSPECTION__?.selectView('archive_rise');
    window.__KYX_PRESS_HALL_INSPECTION__?.setAuthorityOverlay(true);
  });
  await page.waitForTimeout(250);
  const snapshot = await page.evaluate(
    () => window.__KYX_PRESS_HALL_INSPECTION__?.getSnapshot(),
  ) as {
    status?: string;
    selection?: { mapRevision?: number; artRevision?: string };
    catalogDefault?: { mapRevision?: number; unchanged?: boolean };
    art?: { sha256?: string; nodeCount?: number; triangleCount?: number };
    authorityAlignment?: {
      mapRevision?: number;
      artGeometryMayBeAuthority?: boolean;
      candidateContract?: { allChecksPassed?: boolean };
      candidateScene?: {
        riseMeshCount?: number;
        landingMeshCount?: number;
        decorativeVerticalOverhangMm?: number;
        allChecksPassed?: boolean;
      };
      candidateTraversal?: {
        routeId?: string;
        totalTickCount?: number;
        enteredZoneIds?: string[];
        allChecksPassed?: boolean;
      };
      roleSeparation?: { presentationArtPassedToPackageLoader?: boolean };
    };
    browserRuntimeErrors?: string[];
  };
  expect(snapshot).toMatchObject({
    status: 'PRESS_ARCHIVE_REV4_1_RUNTIME_CANDIDATE_READY_G5_OPEN',
    selection: { mapRevision: 3, artRevision: '4.1' },
    catalogDefault: { mapRevision: 1, unchanged: true },
    art: {
      sha256: '5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00',
      nodeCount: 45,
      triangleCount: 190_788,
    },
    authorityAlignment: {
      mapRevision: 3,
      artGeometryMayBeAuthority: false,
      candidateContract: { allChecksPassed: true },
      candidateScene: {
        riseMeshCount: 7,
        landingMeshCount: 9,
        decorativeVerticalOverhangMm: 755,
        allChecksPassed: true,
      },
      candidateTraversal: {
        routeId: 'press_west_archive',
        totalTickCount: expect.any(Number),
        enteredZoneIds: expect.arrayContaining(['press_hall', 'archive_walk_west']),
        allChecksPassed: true,
      },
      roleSeparation: { presentationArtPassedToPackageLoader: false },
    },
    browserRuntimeErrors: [],
  });
  expect(snapshot.authorityAlignment?.candidateTraversal?.totalTickCount).toBeGreaterThan(40);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);

  await mkdir(rev4EvidenceDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(rev4EvidenceDirectory, 'press-archive-rev4-rev3-authority-overlay.png'),
    animations: 'disabled',
  });
  await page.evaluate(() => {
    window.__KYX_PRESS_HALL_INSPECTION__?.setAuthorityOverlay(false);
  });
  await page.waitForTimeout(100);
  await page.screenshot({
    path: resolve(rev4EvidenceDirectory, 'press-archive-rev4-clean-archive-rise.png'),
    animations: 'disabled',
  });
  await page.evaluate(() => {
    window.__KYX_PRESS_HALL_INSPECTION__?.selectView('archive_landing');
  });
  await page.waitForTimeout(100);
  await page.screenshot({
    path: resolve(rev4EvidenceDirectory, 'press-archive-rev4-clean-archive-landing.png'),
    animations: 'disabled',
  });
});

test('joined Press Hall v3.2 art loads through Three.js with separate locked authority', async ({
  page,
}) => {
  test.setTimeout(120_000);
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

  await page.goto(
    '/?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.2%2Fspatial-material-joined',
    { waitUntil: 'networkidle' },
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-launch-support',
    'press-hall-v3-2-inspection',
  );
  await expect(page.locator('body')).toHaveAttribute('data-press-hall-status', 'ready', {
    timeout: 45_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-catalog-default', 'inkfall_foundry@1');
  await expect(page.getByRole('heading', { name: 'Press Hall v3.2' })).toBeVisible();
  await expect(page.getByLabel('Interactive Press Hall v3.2 joined-art runtime inspection viewport'))
    .toBeVisible();
  await expect(page.getByText(/presentation art \+ separate revision-2 authority overlay/iu))
    .toBeVisible();
  await expect(page.getByText(/G5 and G8 remain open/iu)).toBeVisible();
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);

  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.startCameraSweep());
  await page.waitForFunction(() => (
    (window.__KYX_PRESS_HALL_INSPECTION__?.getSnapshot() as {
      camera?: { sweep?: { status?: string } };
    } | undefined)?.camera?.sweep?.status === 'complete'
  ), undefined, { timeout: 15_000 });
  const evidence = await page.evaluate(() => ({
    snapshot: window.__KYX_PRESS_HALL_INSPECTION__?.getSnapshot(),
    descriptor: Object.getOwnPropertyDescriptor(window, '__KYX_PRESS_HALL_INSPECTION__'),
  }));
  expect(evidence).toMatchObject({
    snapshot: {
      status: 'PRESS_HALL_V3_2_RUNTIME_INSPECTION_READY_G5_G8_OPEN',
      selection: {
        explicit: true,
        mapId: 'inkfall_foundry',
        mapRevision: 2,
        artRevision: '3.2',
        exportVariant: 'spatial-material-joined',
      },
      catalogDefault: {
        mapRevision: 1,
        unchanged: true,
      },
      art: {
        role: 'presentation_only',
        bytes: 13_300_676,
        sha256: '56cbd313e3fd2166c70ce6cca614e02f08fd027acf2b0a43749cf076c46f8119',
        hashVerified: true,
        loadedBy: 'THREE.GLTFLoader.parse',
        nodeCount: 29,
        meshCount: 29,
        primitiveCount: 29,
        triangleCount: 188_576,
        materialCount: 9,
      },
      authorityAlignment: {
        role: 'separate_authority_fixture_overlay',
        mapRevision: 2,
        packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
        fixtureHash: 'bf85e42731fd088e',
        solidColliderCount: 339,
        authorityVolumeCount: 2,
        spawnCount: 12,
        artGeometryMayBeAuthority: false,
      },
      renderer: {
        artOnly: {
          calls: expect.any(Number),
          triangles: expect.any(Number),
          textures: expect.any(Number),
        },
      },
      performance: {
        warmupFrames: 60,
        measuredFrames: 180,
        frameTimes: { count: 180 },
      },
      camera: {
        sweep: {
          status: 'complete',
          completedSegments: 4,
          collisionNoSnagClaim: false,
        },
      },
      productBoundary: {
        explicitNonDefaultInspection: true,
        loadedIntoOfflinePractice: false,
        shippingDefaultChanged: false,
        artGeometryUsedForAuthority: false,
        g5Passed: false,
        g8Passed: false,
      },
    },
    descriptor: {
      writable: false,
      configurable: false,
    },
  });
  const renderer = (evidence.snapshot as {
    renderer: {
      artOnly: { calls: number; triangles: number };
      artPlusAuthorityOverlay: { calls: number };
    };
  }).renderer;
  expect(renderer.artOnly.calls).toBeGreaterThan(0);
  expect(renderer.artOnly.calls).toBeLessThanOrEqual(29);
  expect(renderer.artOnly.triangles).toBeGreaterThan(0);
  expect(renderer.artOnly.triangles).toBeLessThanOrEqual(188_576);
  expect(renderer.artPlusAuthorityOverlay.calls).toBeGreaterThan(renderer.artOnly.calls);

  const glbRequests = [...new Set(requestedUrls
    .map((url) => new URL(url).pathname)
    .filter((pathname) => pathname.endsWith('.glb')))];
  expect(glbRequests).toHaveLength(3);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(httpErrors).toEqual([]);
});

test('hash-pinned Press Hall v3.3 material export loads fail-closed through the product route', async ({
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

  await page.goto(
    '/?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.3%2Fspatial-material-joined',
    { waitUntil: 'networkidle' },
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-launch-support',
    'press-hall-v3-3-inspection',
  );
  await expect(page.locator('body')).toHaveAttribute('data-press-hall-status', 'ready', {
    timeout: 45_000,
  });
  await expect(page.locator('body')).toHaveAttribute('data-catalog-default', 'inkfall_foundry@1');
  await expect(page.getByRole('heading', { name: 'Press Hall v3.3' })).toBeVisible();
  await expect(page.getByLabel('Interactive Press Hall v3.3 joined-art runtime inspection viewport'))
    .toBeVisible();
  await expect(page.getByText(/runtime material verified · 9\/9 explicit base colors/iu))
    .toBeVisible();
  await expect(page.getByText(/G5 and G8 remain open/iu)).toBeVisible();
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);

  const evidence = await page.evaluate(() => ({
    snapshot: window.__KYX_PRESS_HALL_INSPECTION__?.getSnapshot(),
    descriptor: Object.getOwnPropertyDescriptor(window, '__KYX_PRESS_HALL_INSPECTION__'),
  }));
  expect(evidence).toMatchObject({
    snapshot: {
      status: 'PRESS_HALL_V3_3_RUNTIME_INSPECTION_READY_G5_G8_OPEN',
      selection: {
        explicit: true,
        reference: 'inkfall_foundry@2/press_hall/v3.3/spatial-material-joined',
        mapId: 'inkfall_foundry',
        mapRevision: 2,
        artRevision: '3.3',
        exportVariant: 'spatial-material-joined',
      },
      catalogDefault: {
        mapRevision: 1,
        unchanged: true,
      },
      art: {
        role: 'presentation_only',
        bytes: 13_301_752,
        sha256: '4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564',
        expectedSha256: '4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564',
        hashVerified: true,
        loadedBy: 'THREE.GLTFLoader.parse',
        nodeCount: 29,
        meshCount: 29,
        primitiveCount: 29,
        triangleCount: 188_576,
        materialCount: 9,
        materialEncoding: {
          explicitBaseColorFactorCount: 9,
          baseColorTextureReferenceCount: 0,
          imageCount: 0,
          textureCount: 0,
          runtimeColorParityWithBlenderReview: true,
          instantiatedMaterialCount: 9,
          whiteFallbackMaterialCount: 0,
          instantiatedValuesMatchExplicitGltf: true,
        },
      },
      authorityAlignment: {
        role: 'separate_authority_fixture_overlay',
        mapRevision: 2,
        packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
        fixtureHash: 'bf85e42731fd088e',
        solidColliderCount: 339,
        artGeometryMayBeAuthority: false,
      },
      renderer: {
        artOnly: {
          calls: expect.any(Number),
          triangles: expect.any(Number),
        },
        artPlusAuthorityOverlay: {
          calls: expect.any(Number),
        },
      },
      performance: {
        warmupFrames: 60,
        measuredFrames: 180,
        frameTimes: { count: 180 },
      },
      productBoundary: {
        explicitNonDefaultInspection: true,
        loadedIntoOfflinePractice: false,
        playableMatch: false,
        shippingDefaultChanged: false,
        artGeometryUsedForAuthority: false,
        performanceAccepted: false,
        humanAccepted: false,
        g5Passed: false,
        g8Passed: false,
      },
    },
    descriptor: {
      writable: false,
      configurable: false,
    },
  });
  const snapshot = evidence.snapshot as {
    art: { materialEncoding: { maximumBaseColorDelta: number } };
    renderer: {
      artOnly: { calls: number; triangles: number };
      artPlusAuthorityOverlay: { calls: number };
    };
    performance: { frameTimes: { p95Ms: number }; loadTimingMs: { totalMs: number } };
  };
  expect(snapshot.art.materialEncoding.maximumBaseColorDelta).toBeLessThanOrEqual(1e-6);
  expect(snapshot.renderer.artOnly.calls).toBeGreaterThan(0);
  expect(snapshot.renderer.artOnly.calls).toBeLessThanOrEqual(29);
  expect(snapshot.renderer.artOnly.triangles).toBeGreaterThan(0);
  expect(snapshot.renderer.artOnly.triangles).toBeLessThanOrEqual(188_576);
  expect(snapshot.renderer.artPlusAuthorityOverlay.calls).toBeGreaterThan(snapshot.renderer.artOnly.calls);
  expect(snapshot.performance.frameTimes.p95Ms).toBeGreaterThan(0);
  expect(snapshot.performance.frameTimes.p95Ms).toBeLessThan(1_000);
  expect(snapshot.performance.loadTimingMs.totalMs).toBeLessThan(60_000);

  const glbRequests = [...new Set(requestedUrls
    .map((url) => new URL(url).pathname)
    .filter((pathname) => pathname.endsWith('.glb')))];
  expect(glbRequests).toHaveLength(3);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(httpErrors).toEqual([]);
});

test('unsupported Press Hall art selection cannot fall through to a playable surface', async ({ page }) => {
  await page.goto('/?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.2%2Fstandard');
  await expect(page.locator('body')).toHaveAttribute('data-press-hall-status', 'unsupported');
  await expect(page.getByRole('alert')).toContainText('UNSUPPORTED PRESS HALL ART INSPECTION');
  await expect(page.getByRole('alert')).toContainText(
    'No art, authority package, or Offline Practice fallback was loaded.',
  );
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);
});
