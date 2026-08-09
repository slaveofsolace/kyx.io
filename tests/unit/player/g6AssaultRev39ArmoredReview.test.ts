import { describe, expect, it } from 'vitest';

import {
  G6_CHARACTER_CANDIDATE,
  isG6CharacterCandidateEnabled,
} from '../../../src/config/g6CharacterCandidate';
import {
  installKyxAssaultRev39ArmoredReview,
  KYX_ASSAULT_REV39_ARMORED_REVIEW,
  resolveKyxAssaultRev39ArmoredReviewRequest,
} from '../../../src/dev/installKyxAssaultRev39ArmoredReview';

describe('G6 Assault Rev39 armored restoration boundary', () => {
  it('is the staging-review default but never a production selection', () => {
    expect(resolveKyxAssaultRev39ArmoredReviewRequest('', 'production'))
      .toMatchObject({ selected: false, selection: 'not-requested' });
    expect(resolveKyxAssaultRev39ArmoredReviewRequest('', 'staging-review'))
      .toMatchObject({ selected: true, selection: 'staging-review-default' });
    expect(resolveKyxAssaultRev39ArmoredReviewRequest(
      '?g6Candidate=rev39-armored-restore-v1&g6Population=8',
      'development',
    )).toMatchObject({
      selected: true,
      selection: 'explicit-review-selection',
      population: 8,
    });
  });

  it('reuses the preserved source honestly while remaining rejected and unshipped', () => {
    const result = installKyxAssaultRev39ArmoredReview(
      '?g6Candidate=rev39-armored-restore-v1&g6Population=4',
      'development',
    );
    expect(result.installed).toBe(true);
    try {
      expect(G6_CHARACTER_CANDIDATE).toMatchObject({
        enabled: true,
        default: false,
        revision: KYX_ASSAULT_REV39_ARMORED_REVIEW.candidateId,
        population: 4,
        releaseEligible: false,
        humanAccepted: false,
      });
      expect(G6_CHARACTER_CANDIDATE.assets.lod0)
        .toBe(G6_CHARACTER_CANDIDATE.assets.lod1);
      expect(G6_CHARACTER_CANDIDATE.assets.lod1)
        .toBe(G6_CHARACTER_CANDIDATE.assets.lod2);
      expect(KYX_ASSAULT_REV39_ARMORED_REVIEW).toMatchObject({
        sourceRevision: 'rev30-cc0-donor',
        sourceDisposition: 'rejected-review-source',
        distinctAuthoredLods: false,
        embeddedDiagnosticWeapon: 'hidden-by-runtime',
      });
      expect(isG6CharacterCandidateEnabled()).toBe(true);
    } finally {
      if (result.installed) result.restore();
    }
  });
});
