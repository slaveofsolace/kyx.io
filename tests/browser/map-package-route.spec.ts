import { expect, test } from '@playwright/test';

interface MapEvidenceSnapshot {
  readonly status: string;
  readonly mapId: string;
  readonly mapRevision: number;
  readonly displayName: string;
  readonly boundsMm: {
    readonly minimum: { readonly x: number; readonly y: number; readonly z: number };
    readonly maximum: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly renderMeshNodeCount: number;
  readonly authorityCollisionMeshNodeCount: number;
  readonly authorityVolumeCount: number;
  readonly totalAuthorityColliderCount: number;
  readonly spawnCount: number;
  readonly zoneCount: number;
  readonly pickupCount: number;
  readonly triggerCount: number;
  readonly renderMeshesMayBeAuthority: boolean;
  readonly spawnAuthority: {
    readonly status: string;
    readonly fixtureSetId: string;
    readonly scenarioId: string;
    readonly expectedDecisionHash: string;
    readonly decision: {
      readonly status: string;
      readonly selected: null | { readonly spawnId: string };
      readonly decisionHash: string;
      readonly clientPositionOrScoreAccepted: boolean;
      readonly evaluations: readonly {
        readonly spawnId: string;
        readonly eligible: boolean;
        readonly enemies: readonly unknown[];
      }[];
    };
    readonly fixtureResults: readonly {
      readonly id: string;
      readonly status: string;
      readonly selectedSpawnId: string | null;
      readonly decisionHash: string;
    }[];
  };
  readonly telemetry: {
    readonly status: string;
    readonly binding: {
      readonly mapId: string;
      readonly mapRevision: number;
      readonly packageDigest: string;
      readonly fixtureHash: string;
    };
    readonly privacy: {
      readonly actorIdentity: string;
      readonly exactPositionsRetained: boolean;
      readonly accountIdentifiersRetained: boolean;
      readonly networkIdentifiersRetained: boolean;
      readonly clientOutcomeAuthorityAccepted: boolean;
    };
    readonly buffer: {
      readonly acceptedEvents: number;
      readonly retainedEvents: number;
      readonly evictedEvents: number;
    };
    readonly arrangementSamples: {
      readonly twoPlayers: number;
      readonly fourPlayers: number;
      readonly eightPlayers: number;
      readonly other: number;
    };
    readonly heatCells: readonly unknown[];
    readonly snapshotHash: string;
    readonly nonClaims: readonly string[];
  };
}

test('development map route visibly loads the saved package without crossing render/authority roles', async ({
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

  await page.goto('/__test__/map', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toHaveAttribute('data-launch-support', 'map-package-evidence');
  await expect(page.locator('body')).toHaveAttribute('data-map-status', 'ready', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Inkfall Foundry' })).toBeVisible();
  await expect(page.locator('.map-lab__boundary')).toHaveText(
    /P6\.3 runtime fixture.*P6\.5 authority telemetry.*G5 not passed/u,
  );
  await expect(page.getByText('P6.5 telemetry heat + P6.4 score / LOS', { exact: true })).toBeVisible();
  await expect(page.getByText('P6.5 events', { exact: true })).toBeVisible();
  await expect(page.getByText('18', { exact: true })).toBeVisible();
  await expect(page.locator('.spawn-score')).toHaveCount(4);
  await expect(page.locator('.spawn-score--selected')).toContainText('spawn_dm_ink_e');
  await expect(page.locator('#game-canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toHaveCount(0);

  const canvas = page.locator('.map-canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png').length))
    .toBeGreaterThan(8_000);

  const evidence = await page.evaluate(() => {
    const surface = (window as typeof window & {
      __KYX_MAP_EVIDENCE__?: { readonly getSnapshot: () => MapEvidenceSnapshot };
    }).__KYX_MAP_EVIDENCE__;
    const descriptor = Object.getOwnPropertyDescriptor(window, '__KYX_MAP_EVIDENCE__');
    return {
      snapshot: surface?.getSnapshot(),
      writable: descriptor?.writable,
      configurable: descriptor?.configurable,
    };
  });
  expect(evidence).toMatchObject({
    snapshot: {
      status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED',
      mapId: 'inkfall_foundry',
      mapRevision: 1,
      displayName: 'Inkfall Foundry',
      boundsMm: {
        minimum: { x: -36_000, y: -5_000, z: -28_000 },
        maximum: { x: 36_000, y: 10_000, z: 28_000 },
      },
      renderMeshNodeCount: 346,
      authorityCollisionMeshNodeCount: 346,
      authorityVolumeCount: 2,
      totalAuthorityColliderCount: 348,
      spawnCount: 12,
      zoneCount: 9,
      pickupCount: 0,
      triggerCount: 1,
      renderMeshesMayBeAuthority: false,
      spawnAuthority: {
        status: 'P6.4_DETERMINISTIC_AUTHORITY_FIXTURE_G5_NOT_PASSED',
        fixtureSetId: 'inkfall_foundry_p6_4',
        scenarioId: 'ffa_visual_score_pressure',
        expectedDecisionHash: '81286ef1c04ce7e4',
        decision: {
          status: 'selected',
          selected: { spawnId: 'spawn_dm_ink_e' },
          decisionHash: '81286ef1c04ce7e4',
          clientPositionOrScoreAccepted: false,
        },
        fixtureResults: [
          { id: 'ffa_2_player_occluded', status: 'selected', selectedSpawnId: 'spawn_dm_ink_w', decisionHash: '2ff86027cd9ca213' },
          { id: 'ffa_4_player_all_enemy_aggregate', status: 'selected', selectedSpawnId: 'spawn_dm_ink_e', decisionHash: 'aabbcef2ce8f30cc' },
          { id: 'ffa_8_player_safe_pockets', status: 'selected', selectedSpawnId: 'spawn_dm_ink_w', decisionHash: '196138c60153ded0' },
          { id: 'tdm_4_player_team_cluster', status: 'selected', selectedSpawnId: 'spawn_w_archive', decisionHash: '4ad48c0fd9e11aeb' },
          { id: 'ffa_visual_score_pressure', status: 'selected', selectedSpawnId: 'spawn_dm_ink_e', decisionHash: '81286ef1c04ce7e4' },
          { id: 'ffa_no_safe_spawn', status: 'no_safe_spawn', selectedSpawnId: null, decisionHash: '4ad254e4323673e7' },
        ],
      },
      telemetry: {
        status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED',
        binding: {
          mapId: 'inkfall_foundry',
          mapRevision: 1,
          packageDigest: 'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267',
          fixtureHash: '2a0a446a0b152395',
        },
        privacy: {
          actorIdentity: 'ephemeral_match_slot_0_through_63',
          exactPositionsRetained: false,
          accountIdentifiersRetained: false,
          networkIdentifiersRetained: false,
          clientOutcomeAuthorityAccepted: false,
        },
        buffer: {
          acceptedEvents: 18,
          retainedEvents: 18,
          evictedEvents: 0,
        },
        arrangementSamples: {
          twoPlayers: 1,
          fourPlayers: 1,
          eightPlayers: 1,
          other: 0,
        },
        snapshotHash: '264136593a919c7f',
        nonClaims: ['P6.6_NOT_CLAIMED', 'G5_NOT_PASSED', 'HUMAN_ACCEPTANCE_NOT_RUN'],
      },
    },
    writable: false,
    configurable: false,
  });

  const artifactFetches = requestedUrls.filter((url) => {
    const parsed = new URL(url);
    return parsed.pathname.endsWith('.glb') && parsed.search === '';
  });
  expect(artifactFetches).toHaveLength(2);
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
