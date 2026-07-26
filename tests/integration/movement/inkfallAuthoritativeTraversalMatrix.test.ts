import { beforeAll, describe, expect, it } from 'vitest';

import { capturePhase6G5AuthoritativeTraversalMatrix } from '../../../tools/evidence/capture-phase6-g5-authoritative-traversal-matrix.module';

type TraversalProof = Awaited<ReturnType<
  typeof capturePhase6G5AuthoritativeTraversalMatrix
>>;

let proof: TraversalProof;

beforeAll(async () => {
  proof = await capturePhase6G5AuthoritativeTraversalMatrix();
}, 180_000);

describe('Inkfall current authoritative traversal matrix', () => {
  it('keeps revision-2 and revision-3 authority identities explicit', () => {
    expect(proof.bindings).toMatchObject({
      movementProfileId: 'phase3_hypothesis_v1',
      movementProfileRevision: 1,
      physicsAdapterVersion: '0.19.3',
      authorityRateHz: 20,
      revision2: {
        mapRevision: 2,
        packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
        fixtureHash: 'bf85e42731fd088e',
        collisionSha256: 'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e',
      },
      revision3: {
        mapRevision: 3,
        packageDigest: 'c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161',
        fixtureHash: '31fea7ee73a12b91',
        collisionSha256: '5fc4f934676c96b9c06638640977fbff12c57585e56746d8129a75e59fd9a4ca',
        collisionMeshNodeCount: 339,
      },
    });
  });

  it('replays the complete native 2/4/8-player authority tapes without defects', () => {
    expect(proof.revision2AuthorityPlaytest).toMatchObject({
      status: 'P6_6_REVISION_2_AUTOMATED_AUTHORITY_PLAYTEST_RESULT_G5_NOT_PASSED',
      suiteHash: '1b5ccfdc5a9afb55',
      repeatedReplayByteIdentical: true,
      issueCount: 0,
      allAutomatedThresholdsPassed: true,
      totals: {
        scenarioCount: 3,
        playerArrangements: [2, 4, 8],
        agentCount: 14,
        completedAgentCount: 14,
        routeTapeCount: 70,
        completedRouteTapeCount: 70,
        routeMetricCount: 20,
        routeMetricPassCount: 20,
        embedSamples: 0,
        snagEvents: 0,
        retainedBodyOverlapSamples: 0,
        recoveryEntries: 0,
        killEntries: 0,
      },
    });
    expect(
      proof.revision2AuthorityPlaytest.scenarios.map((scenario) => ({
        players: scenario.playerCount,
        status: scenario.status,
        recoveryProbePassed: scenario.recoveryProbePassed,
        killPriorityProbePassed: scenario.killPriorityProbePassed,
        postRecoveryEscapePassed: scenario.postRecoveryEscapePassed,
        replayHash: scenario.replayHash,
      })),
    ).toEqual([
      {
        players: 2,
        status: 'PASS',
        recoveryProbePassed: true,
        killPriorityProbePassed: true,
        postRecoveryEscapePassed: true,
        replayHash: 'b989fdfdec907c2a',
      },
      {
        players: 4,
        status: 'PASS',
        recoveryProbePassed: true,
        killPriorityProbePassed: true,
        postRecoveryEscapePassed: true,
        replayHash: '776fe698501b4994',
      },
      {
        players: 8,
        status: 'PASS',
        recoveryProbePassed: true,
        killPriorityProbePassed: true,
        postRecoveryEscapePassed: true,
        replayHash: '3be932c85d177021',
      },
    ]);
  });

  it('preserves the old revision-2 P5.15 fail-closed embed and clears revision 3', () => {
    expect(proof.revision3CanonicalPressJunction.exactRevision2).toMatchObject({
      moveOutcome: 'ERROR',
      error: 'PHYSICS_DEPENETRATION_FAILED',
      forwardCast: {
        hit: {
          colliderId: 'map_collision_guard_rail_press_west_ink_s00_left',
          timeOfImpactPermille: 303,
        },
      },
    });
    expect(proof.revision3CanonicalPressJunction.result).toEqual({
      exactRevision2DefectReproduced: true,
      exactRevision3CastClear: true,
      exactRevision3KccMoveApplied: true,
      exactRevision3FinalOverlapCount: 0,
      adjacentLaneCount: 7,
      adjacentLaneRecoveryCount: 0,
      adjacentLaneOverlapCount: 0,
      deterministicCandidatePass: true,
    });
  });

  it('covers clear, seeded-overlap recovery, and escape probes at west archive', () => {
    expect(proof.revision3WestArchive.recoveryCountSemantics).toBe(
      'BOUNDED_INFERRED_OBSERVATION_FROM_STARTING_OVERLAP_AND_FINAL_CLEAR_NOT_PRODUCTION_TELEMETRY',
    );
    expect(proof.revision3WestArchive.totals).toEqual({
      approachProbeCount: 9,
      approachPassCount: 9,
      approachSeededOverlapCount: 2,
      approachSuccessfulRecoveryCount: 2,
      approachFailedRecoveryCount: 0,
      approachStartingOverlapCount: 2,
      approachFinalOverlapCount: 0,
      escapeProbeCount: 4,
      escapePassCount: 4,
      escapeSuccessfulRecoveryCount: 0,
      escapeFailedRecoveryCount: 0,
      escapeFinalOverlapCount: 0,
    });
    const exact = proof.revision3WestArchive.approach.find(
      ({ id }) => id === 'exact_runtime_v45_face',
    );
    expect(exact).toMatchObject({
      outcome: 'PASS',
      startingOverlap: { blockingColliderIds: [] },
      move: {
        appliedTranslation: { x: 66, y: 0, z: -22 },
        contacts: [
          { colliderId: 'map_collision_route_west_choice_archive_s00' },
          { colliderId: 'map_collision_route_west_choice_archive_s00' },
        ],
      },
      finalFeet: { x: -23_958, y: 37, z: 402 },
      finalOverlap: { blockingColliderIds: [] },
    });
    expect(
      proof.revision3WestArchive.approach
        .filter(({ expectedStartingState }) => (
          expectedStartingState === 'seeded_overlap_recovery'
        ))
        .map((probe) => ({
          startingBlockers: probe.startingOverlap.blockingColliderIds,
          outcome: probe.outcome,
          successfulRecoveryCount: probe.successfulRecoveryCount,
          recoveryObservation: probe.recoveryObservation,
          productionRecoveryTelemetryObserved:
            probe.productionRecoveryTelemetryObserved,
          finalBlockers: probe.outcome === 'PASS'
            ? probe.finalOverlap.blockingColliderIds
            : [],
        })),
    ).toEqual([
      {
        startingBlockers: ['map_collision_route_west_choice_archive_s00'],
        outcome: 'PASS',
        successfulRecoveryCount: 1,
        recoveryObservation: 'BOUNDED_INFERRED_START_OVERLAP_TO_FINAL_CLEAR',
        productionRecoveryTelemetryObserved: false,
        finalBlockers: [],
      },
      {
        startingBlockers: ['map_collision_route_west_choice_archive_s00'],
        outcome: 'PASS',
        successfulRecoveryCount: 1,
        recoveryObservation: 'BOUNDED_INFERRED_START_OVERLAP_TO_FINAL_CLEAR',
        productionRecoveryTelemetryObserved: false,
        finalBlockers: [],
      },
    ]);
    expect(proof.revision3WestArchive.escape.every((probe) => (
      probe.outcome === 'PASS'
      && probe.startingOverlap.blockingColliderIds.length === 0
      && probe.finalOverlap.blockingColliderIds.length === 0
      && probe.appliedDistanceMm >= 50
    ))).toBe(true);
  });

  it('pins the deterministic core and retains the truthful G5 boundary', () => {
    expect(proof.deterministicCoreSha256).toBe(
      'a338b10f1798add58db72c5d87b8623e9608aa6a96068d3affc3ddbad0ad0ae7',
    );
    expect(proof.status).toBe('BOUNDED_DETERMINISTIC_PASS_G5_OPEN');
    expect(proof.nonClaims).toContain('G5_NOT_PASSED');
    expect(proof.nonClaims).toContain('HUMAN_2_4_8_PLAYTEST_NOT_RUN');
    expect(proof.nonClaims).toContain('EXACT_PRODUCT_BROWSER_ROUTE_NOT_REPLAYED');
    expect(proof.nonClaims).toContain(
      'RECOVERY_COUNTS_ARE_BOUNDED_INFERENCES_NOT_PRODUCTION_TELEMETRY',
    );
  });
});
