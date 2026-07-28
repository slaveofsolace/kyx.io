import type { PhysicsFixtureV1 } from '../physics/fixtureSchema';
import {
  createInkfallRev4VisualContinuity,
} from './inkfallRev4VisualContinuity';

export const INKFALL_REV5_VISUAL_CONTINUITY_VERSION =
  'inkfall_rev5_online_visual_continuity_v1' as const;

/**
 * Retains the authority-aligned procedural shell while the rejected Rev4
 * parent-scene overlay is removed. Rev5 adds only its modular bridge,
 * landing, and portal presentation on top of this no-hit shell.
 */
export function createInkfallRev5VisualContinuity(
  fixture: PhysicsFixtureV1,
) {
  const continuity = createInkfallRev4VisualContinuity(fixture);
  continuity.group.name =
    'INKFALL_REV5_AUTHORITY_ALIGNED_RENDER_ONLY_VISUAL_CONTINUITY';
  continuity.group.userData.visualContinuityVersion =
    INKFALL_REV5_VISUAL_CONTINUITY_VERSION;
  continuity.group.userData.rev5GeometryCorrection = Object.freeze({
    rejectedRev4ParentSceneOverlayRemoved: true,
    modularRenderOnlyArtAddedSeparately: true,
    authorityFixtureUnchanged: true,
    renderMeshesMayBeAuthority: false,
  });
  continuity.group.traverse((object) => {
    object.userData.visualContinuityVersion =
      INKFALL_REV5_VISUAL_CONTINUITY_VERSION;
    object.userData.rev5PresentationRole =
      'authority_aligned_no_hit_shell';
  });
  return continuity;
}
