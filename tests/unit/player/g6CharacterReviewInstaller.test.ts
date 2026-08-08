import { describe, expect, it } from 'vitest';

import {
  G6_CHARACTER_CANDIDATE,
  installG6CharacterReviewCandidate,
  isG6CharacterCandidateEnabled,
  isG6Rev17CharacterCandidateEnabled,
} from '../../../src/config/g6CharacterCandidate';
import {
  installKyxAssaultRev38Review,
  KYX_ASSAULT_REV38_REVIEW,
  resolveKyxAssaultRev38ReviewRequest,
} from '../../../src/dev/installKyxAssaultRev38Review';

describe('G6 Assault Rev38 staging review boundary', () => {
  it('selects the candidate only for staging or an explicit development request', () => {
    expect(resolveKyxAssaultRev38ReviewRequest('', 'production')).toMatchObject({
      selected: false,
      selection: 'not-requested',
    });
    expect(resolveKyxAssaultRev38ReviewRequest('', 'staging-review')).toMatchObject({
      selected: true,
      selection: 'staging-review-default',
    });
    expect(resolveKyxAssaultRev38ReviewRequest(
      '?g6Candidate=rev38-fitted-v1&g6Population=8',
      'development',
    )).toMatchObject({
      selected: true,
      selection: 'explicit-review-selection',
      population: 8,
    });
    expect(resolveKyxAssaultRev38ReviewRequest(
      '?g6Candidate=rev99',
      'staging-review',
    )).toMatchObject({
      selected: false,
      selection: 'unsupported-review-request',
    });
  });

  it('fails closed on candidates that pretend to be accepted or release eligible', () => {
    expect(() => installG6CharacterReviewCandidate({
      enabled: true,
      default: false,
      revision: 'unsafe',
      runtimeScope: 'development-or-staging-review',
      releaseEligible: true,
      humanAccepted: false,
      assets: { lod0: 'a', lod1: 'b', lod2: 'c', firstPerson: null },
    })).toThrow('G6_REVIEW_CANDIDATE_POLICY_MISMATCH');
  });

  it('installs exact Rev38 URLs without enabling a nonexistent first-person GLB', () => {
    const result = installKyxAssaultRev38Review(
      '?g6Candidate=rev38-fitted-v1&g6Population=4',
      'development',
    );
    expect(result.installed).toBe(true);
    try {
      expect(G6_CHARACTER_CANDIDATE).toMatchObject({
        enabled: true,
        default: false,
        revision: KYX_ASSAULT_REV38_REVIEW.candidateId,
        population: 4,
        releaseEligible: false,
        humanAccepted: false,
        runtimeScope: 'development-or-staging-review',
        releasePackagePolicy: 'staging-review-only-excluded-from-production',
      });
      expect(G6_CHARACTER_CANDIDATE.assets.lod0).toContain(
        'kyx-v6b-assault-rev38-fitted-v1-lod0.glb',
      );
      expect(G6_CHARACTER_CANDIDATE.assets.firstPerson).toBeNull();
      expect(isG6CharacterCandidateEnabled()).toBe(true);
      expect(isG6Rev17CharacterCandidateEnabled()).toBe(false);
    } finally {
      if (result.installed) result.restore();
    }
    expect(isG6CharacterCandidateEnabled()).toBe(false);
  });
});
