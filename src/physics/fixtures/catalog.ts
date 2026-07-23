import type { PhysicsFixtureV1 } from '../fixtureSchema';
import { loadPhysicsFixture } from '../fixtureSchema';
import { CONTACT_LAB_FIXTURE_SOURCE } from './contactLab';
import { FLAT_RUN_FIXTURE_SOURCE } from './flatRun';
import { SLIDE_LAB_FIXTURE_SOURCE } from './slideLab';
import { TELEPORT_LAB_FIXTURE_SOURCE } from './teleportLab';
import { VERTICAL_LAB_FIXTURE_SOURCE } from './verticalLab';

export const PHYSICS_FIXTURE_IDS = Object.freeze([
  'flat_run',
  'contact_lab',
  'vertical_lab',
  'slide_lab',
  'teleport_lab',
] as const);

export type PhysicsFixtureId = (typeof PHYSICS_FIXTURE_IDS)[number];

const FIXTURES = new Map<PhysicsFixtureId, PhysicsFixtureV1>([
  ['flat_run', loadPhysicsFixture(FLAT_RUN_FIXTURE_SOURCE)],
  ['contact_lab', loadPhysicsFixture(CONTACT_LAB_FIXTURE_SOURCE)],
  ['vertical_lab', loadPhysicsFixture(VERTICAL_LAB_FIXTURE_SOURCE)],
  ['slide_lab', loadPhysicsFixture(SLIDE_LAB_FIXTURE_SOURCE)],
  ['teleport_lab', loadPhysicsFixture(TELEPORT_LAB_FIXTURE_SOURCE)],
]);

export function getPhysicsFixture(id: PhysicsFixtureId): PhysicsFixtureV1 {
  const fixture = FIXTURES.get(id);
  if (!fixture) throw new RangeError(`Unknown physics fixture: ${id}`);
  return fixture;
}

export function listPhysicsFixtures(): readonly PhysicsFixtureV1[] {
  return Object.freeze(PHYSICS_FIXTURE_IDS.map((id) => getPhysicsFixture(id)));
}

