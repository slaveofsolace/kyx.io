import { describe, expect, it } from 'vitest';

import {
  G6_CHARACTER_CANDIDATE,
  isG6CharacterCandidateEnabled,
} from '../../../src/config/g6CharacterCandidate';
import {
  installKyxAssaultRev40Cc0Review,
  KYX_ASSAULT_REV40_CC0_REVIEW,
  KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW,
  resolveKyxAssaultRev40Cc0ReviewRequest,
} from '../../../src/dev/installKyxAssaultRev40Cc0Review';

describe('G6 Assault Rev40 CC0 review boundary', () => {
  it('requires explicit selection and rejects production use', () => {
    expect(resolveKyxAssaultRev40Cc0ReviewRequest('', 'staging-review'))
      .toMatchObject({ selected: false, selection: 'not-requested' });
    expect(resolveKyxAssaultRev40Cc0ReviewRequest(
      '?g6Candidate=g6-assault-rev40-cc0&g6Population=8',
      'development',
    )).toMatchObject({
      selected: true,
      selection: 'explicit-review-selection',
      population: 8,
    });
    expect(resolveKyxAssaultRev40Cc0ReviewRequest(
      '?g6Candidate=g6-assault-rev40-cc0',
      'production',
    )).toMatchObject({
      selected: false,
      selection: 'review-request-rejected-in-release',
    });
    expect(resolveKyxAssaultRev40Cc0ReviewRequest(
      '?g6Candidate=g6-assault-rev40-cc0-weapon-ready-v3',
      'staging-review',
    )).toMatchObject({
      selected: false,
      selection: 'unsupported-review-request',
    });
  });

  it('installs distinct review LODs without granting release or human acceptance', () => {
    const result = installKyxAssaultRev40Cc0Review(
      '?g6Candidate=g6-assault-rev40-cc0&g6Population=4',
      'staging-review',
    );
    expect(result.installed).toBe(true);
    try {
      expect(G6_CHARACTER_CANDIDATE).toMatchObject({
        enabled: true,
        default: false,
        revision: KYX_ASSAULT_REV40_CC0_REVIEW.candidateId,
        population: 4,
        releaseEligible: false,
        humanAccepted: false,
      });
      expect(G6_CHARACTER_CANDIDATE.assets.lod0)
        .not.toBe(G6_CHARACTER_CANDIDATE.assets.lod1);
      expect(G6_CHARACTER_CANDIDATE.assets.lod1)
        .not.toBe(G6_CHARACTER_CANDIDATE.assets.lod2);
      expect(KYX_ASSAULT_REV40_CC0_REVIEW).toMatchObject({
        sourceDisposition: 'ADAPT',
        distinctAuthoredLods: true,
        embeddedDiagnosticWeapon: false,
        rigBones: 66,
        animationClips: 12,
      });
      expect(KYX_ASSAULT_REV40_CC0_REVIEW.package.lods).toHaveLength(3);
      expect(KYX_ASSAULT_REV40_CC0_REVIEW.package.lods
        .reduce((total, lod) => total + lod.bytes, 0))
        .toBe(KYX_ASSAULT_REV40_CC0_REVIEW.package.combinedBytes);
      expect(new Set(
        KYX_ASSAULT_REV40_CC0_REVIEW.package.lods.map((lod) => lod.sha256),
      ).size).toBe(3);
      expect(isG6CharacterCandidateEnabled()).toBe(true);
    } finally {
      if (result.installed) result.restore();
    }
  });

  it('isolates the v4 skin repair for real browser weapon-contact review', () => {
    const result = installKyxAssaultRev40Cc0Review(
      '?g6Candidate=g6-assault-rev40-cc0-weapon-ready-v4&g6Population=8',
      'staging-review',
    );
    expect(result.installed).toBe(true);
    try {
      expect(G6_CHARACTER_CANDIDATE).toMatchObject({
        enabled: true,
        default: false,
        revision: KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW.candidateId,
        population: 8,
        releaseEligible: false,
        humanAccepted: false,
        evidenceStatus: 'source-deformation-pass-browser-weapon-contact-required',
      });
      expect(KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW).toMatchObject({
        authoredWeaponReadyUpperBody: true,
        unweightedVertexRepair: 'topology-neighbor-fail-closed',
        detachedPelvisOnlyVertices: 0,
        releaseEligible: false,
        humanAccepted: false,
      });
      expect(KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW.package.lods)
        .toHaveLength(3);
      expect(KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW.package.lods
        .reduce((total, lod) => total + lod.bytes, 0))
        .toBe(KYX_ASSAULT_REV40_CC0_WEAPON_READY_V4_REVIEW.package.combinedBytes);
    } finally {
      if (result.installed) result.restore();
    }
  });
});
