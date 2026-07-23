import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import spawnFixtures from '../../../assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v2.json';
import telemetryFixtures from '../../../assets/source/maps/inkfall-foundry/runtime/telemetry-fixtures.p6-5.v2.json';
import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
} from '../../../src/authority/inkfallMapIdentity';
import { createInkfallSpawnAuthority } from '../../../src/authority/spawn';
import { createInkfallAuthorityTelemetry } from '../../../src/authority/telemetry';
import {
  DEFAULT_MAP_REVISION,
  requireBundledMapPackageManifest,
} from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
} from '../../../src/physics';

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);
let loaded: LoadedRuntimeMapPackage;

beforeAll(async () => {
  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 2);
  const [render, collision] = await Promise.all([
    readFile(new URL(manifest.artifacts.render.path, mapRoot)),
    readFile(new URL(manifest.artifacts.collision.path, mapRoot)),
  ]);
  loaded = await loadRuntimeMapPackage(manifest, { render, collision });
});

function telemetryEnvelope(
  event: (typeof telemetryFixtures.events)[number],
): Record<string, unknown> {
  return {
    schemaVersion: telemetryFixtures.schemaVersion,
    mapId: telemetryFixtures.mapId,
    mapRevision: telemetryFixtures.mapRevision,
    packageDigest: telemetryFixtures.packageDigest,
    fixtureHash: telemetryFixtures.fixtureHash,
    authorityRateHz: telemetryFixtures.authorityRateHz,
    producer: telemetryFixtures.producer,
    eventSequence: event.eventSequence,
    authorityTick: event.authorityTick,
    kind: event.kind,
    payload: event.payload,
  };
}

describe('Inkfall Foundry staged revision 2 P6.2-P6.5 regression', () => {
  it('loads revision 2 natively while leaving revision 1 as the unpromoted default', () => {
    expect(DEFAULT_MAP_REVISION).toBe(1);
    expect(loaded.identity).toMatchObject({
      id: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId,
      revision: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapRevision,
      packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest,
    });
    expect(loaded.presentation).toMatchObject({
      renderPath: 'revisions/revision-2/export/render.graybox.glb',
      renderMeshNodeCount: 346,
      renderSha256: '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634',
    });
    expect(loaded.authority).toMatchObject({
      collisionPath: 'revisions/revision-2/export/collision.authority.glb',
      collisionMeshNodeCount: INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality,
      fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
      authorityVolumeCount: 2,
      totalColliderCount: 341,
    });
    expect(loaded.authority.fixture.solids).toHaveLength(339);
    expect(loaded.authority.fixture.volumes).toHaveLength(2);
  });

  it('replays the six P6.4 spawn fixtures against native revision-2 identity', () => {
    const authority = createInkfallSpawnAuthority(loaded);
    const results = spawnFixtures.scenarios.map((scenario) => ({
      id: scenario.id,
      result: authority.select(scenario.input),
      expected: scenario.expected,
    }));

    expect(spawnFixtures).toMatchObject({
      mapRevision: 2,
      packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest,
      fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
    });
    for (const { result, expected } of results) {
      expect(result).toMatchObject({
        status: expected.status,
        mapRevision: 2,
        fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
        decisionHash: expected.decisionHash,
      });
      expect(result.selected?.spawnId ?? null).toBe(expected.selectedSpawnId);
      expect(result.nonClaims).toContain('P6.6_NOT_CLAIMED');
      expect(result.nonClaims).toContain('G5_NOT_PASSED');
    }
  });

  it('replays the all-family P6.5 fixture under native revision-2 identity', () => {
    const telemetry = createInkfallAuthorityTelemetry(loaded);
    const accepted = telemetry.appendBatch(telemetryFixtures.events.map(telemetryEnvelope));
    const snapshot = telemetry.snapshot();

    expect(accepted).toHaveLength(telemetryFixtures.expected.eventCount);
    expect(snapshot).toMatchObject({
      binding: {
        mapId: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId,
        mapRevision: 2,
        packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest,
        fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
      },
      arrangementSamples: telemetryFixtures.expected.arrangementSamples,
      totalsByKind: telemetryFixtures.expected.totalsByKind,
      nonClaims: ['P6.6_NOT_CLAIMED', 'G5_NOT_PASSED', 'HUMAN_ACCEPTANCE_NOT_RUN'],
    });
    expect(snapshot.snapshotHash).toBe(telemetryFixtures.expected.snapshotHash);
    expect(snapshot.events[0]?.eventId).toContain('.r2.');
  });
});
