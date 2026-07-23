import type { MapVector3Millimeters } from '../../content/maps';
import {
  createRapierMovementWorld,
  type RapierMovementWorld,
  type LoadedRuntimeMapPackage,
} from '../../physics';
import {
  INTENT_BUTTON,
  asQuantizedAxis,
  asMillimeters,
  type PlayerIntentCommand,
} from '../../sim';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  createMovementSimulationState,
  hashCanonicalMovementState,
  stepMovementSimulation,
  type CapsuleCastRequest,
  type CapsuleCastResult,
  type CapsuleMoveRequest,
  type CapsuleMoveResult,
  type CapsuleOverlapRequest,
  type CapsuleOverlapResult,
  type CapsuleVolumeRequest,
  type CapsuleVolumeResult,
  type MovementContact,
  type MovementQueryMetrics,
  type MovementQueryPort,
  type MovementSimulationState,
} from '../../sim/movement';
import {
  createInkfallSpawnAuthority,
  type AuthoritySpawnSelectionInputV1,
  type AuthoritySpawnSelectionResultV1,
} from '../spawn';
import { createInkfallAuthorityTelemetry } from '../telemetry';
import {
  INKFALL_PLAYTEST_FIXTURE_HASH,
  INKFALL_PLAYTEST_FIXTURE_HASH_V2,
  INKFALL_PLAYTEST_MAP_ID,
  INKFALL_PLAYTEST_MAP_REVISION,
  INKFALL_PLAYTEST_MAP_REVISION_V2,
  INKFALL_PLAYTEST_PACKAGE_DIGEST,
  INKFALL_PLAYTEST_PACKAGE_DIGEST_V2,
  INKFALL_PLAYTEST_RATE_HZ,
  INKFALL_PLAYTEST_SCHEMA_VERSION,
  INKFALL_PLAYTEST_SCHEMA_VERSION_V2,
  INKFALL_PLAYTEST_TICK_MILLISECONDS,
  INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256,
  type InkfallAuthorityPlaytestScenarioDefinition,
  type InkfallAuthorityPlaytestScenarioResultV1,
  type InkfallAuthorityPlaytestSuiteDefinition,
  type InkfallAuthorityPlaytestSuiteDefinitionV1,
  type InkfallAuthorityPlaytestSuiteDefinitionV2,
  type InkfallAuthorityPlaytestSuiteResult,
  type InkfallAuthorityPlaytestSuiteResultV1,
  type InkfallAuthorityPlaytestSuiteResultV2,
  type InkfallPlaytestIssueV1,
  type InkfallPlaytestQueryMetricsV1,
  type InkfallMovementToolEventV1,
  type InkfallRouteMetricResultV1,
  type InkfallRouteTapeResultV1,
  type InkfallSyntheticAgentDefinition,
  type InkfallSyntheticAgentResultV1,
  type InkfallTapeMovementMode,
  type InkfallTapeRouteStepV2,
} from './schema';

const SAMPLE_STRIDE_TICKS = 10;
const OCCUPANCY_STRIDE_TICKS = 20;
const WAYPOINT_PLANAR_TOLERANCE_MM = 900;
const WAYPOINT_VERTICAL_TOLERANCE_MM = 1_600;
const TELEPORT_ACTIVATION_TOLERANCE_MM = 150;
// Authored 4 m clear landing diameter minus the standing capsule radius.
const TELEPORT_LANDING_TOLERANCE_MM = 1_650;
const SNAG_WINDOW_TICKS = 40;
const SNAG_PROGRESS_MM = 250;
const CLOSE_CONTACT_DISTANCE_MM = 2_000;
const BODY_DIAMETER_MM = 700;
const MAX_QUERY_CALLS_PER_AGENT_TICK = 128;
const TELEMETRY_APPEND_BATCH_LIMIT = 64;
const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const);
const RULESET_HASH = '66365f706c617931';

type Point = Readonly<{ x: number; y: number; z: number }>;

export function chunkOrderedTelemetryEventsForAppend<T>(
  events: readonly T[],
): readonly (readonly T[])[] {
  const batches: T[][] = [];
  for (let start = 0; start < events.length; start += TELEMETRY_APPEND_BATCH_LIMIT) {
    batches.push(events.slice(start, start + TELEMETRY_APPEND_BATCH_LIMIT));
  }
  return Object.freeze(batches.map((batch) => Object.freeze(batch)));
}

interface TopologyLink {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly oneWay: boolean;
  readonly modes: readonly InkfallTapeMovementMode[];
  readonly waypoints: readonly Point[];
}

interface TopologyMetric {
  readonly id: string;
  readonly linkIds: readonly string[];
  readonly targetBandMilliseconds: readonly [number, number];
}

interface ParsedTopology {
  readonly links: ReadonlyMap<string, TopologyLink>;
  readonly metrics: ReadonlyMap<string, TopologyMetric>;
}

interface SavedSpawnFixtureScenario {
  readonly id: string;
  readonly input: AuthoritySpawnSelectionInputV1;
  readonly expected: {
    readonly status: 'selected' | 'no_safe_spawn';
    readonly selectedSpawnId: string | null;
    readonly decisionHash: string;
  };
}

interface PlaytestBinding {
  readonly schemaVersion: 1 | 2;
  readonly mapRevision: 1 | 2;
  readonly packageDigest: string;
  readonly fixtureHash: string;
  readonly colliderCardinality: number;
  readonly status:
    | 'P6_6_AUTOMATED_AUTHORITY_PLAYTEST_FOUNDATION_G5_NOT_PASSED'
    | 'P6_6_REVISION_2_AUTOMATED_AUTHORITY_PLAYTEST_RESULT_G5_NOT_PASSED';
}

interface PendingTelemetryEvent {
  readonly authorityTick: number;
  readonly order: number;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
}

interface MutableTape {
  readonly linkId: string;
  readonly direction: 'forward' | 'reverse';
  readonly movementMode: InkfallTapeMovementMode;
  enteredAtTick: number;
  exitedAtTick: number | null;
  completed: boolean;
}

interface AgentRuntime {
  readonly definition: InkfallSyntheticAgentDefinition;
  readonly id: string;
  readonly initialPosition: Point;
  readonly tapes: MutableTape[];
  readonly semanticEvents: Record<string, number>;
  readonly blockingColliderIds: Set<string>;
  readonly replayStateHashes: string[];
  readonly movementToolEvents: InkfallMovementToolEventV1[];
  readonly queryCapture: ContactCaptureQueries;
  state: MovementSimulationState;
  stepIndex: number;
  waypointIndex: number;
  waypointTargetedAtTick: number;
  stepEnteredAtTick: number | null;
  modeActivated: boolean;
  activeMovementMode: InkfallTapeMovementMode | null;
  previousHeldButtons: number;
  bestWaypointDistanceMm: number;
  stagnantTicks: number;
  horizontalCollisionContacts: number;
  embedSamples: number;
  snagEvents: number;
  recoveryVolumeEntries: number;
  killVolumeEntries: number;
  sampledFrameCount: number;
  completionTick: number | null;
  fatalError: string | null;
  readonly reportedSnagWaypoints: Set<string>;
}

interface MutableQueryTotals {
  moveCapsuleCalls: number;
  overlapCapsuleCalls: number;
  castCapsuleCalls: number;
  volumeCalls: number;
  shapeCasts: number;
  overlapTests: number;
  contacts: number;
  explicitEmbedChecks: number;
  maximumCallsPerAgentTick: number;
}

class ContactCaptureQueries implements MovementQueryPort {
  readonly schemaVersion = 1 as const;
  readonly contacts: MovementContact[] = [];
  readonly castColliderIds: string[] = [];

  constructor(private readonly world: RapierMovementWorld) {}

  reset(): void {
    this.contacts.length = 0;
    this.castColliderIds.length = 0;
  }

  moveCapsule(request: CapsuleMoveRequest): CapsuleMoveResult {
    const result = this.world.moveCapsule(request);
    this.contacts.push(...result.contacts);
    return result;
  }

  overlapCapsule(request: CapsuleOverlapRequest): CapsuleOverlapResult {
    return this.world.overlapCapsule(request);
  }

  castCapsule(request: CapsuleCastRequest): CapsuleCastResult {
    const result = this.world.castCapsule(request);
    if (result.hit) this.castColliderIds.push(result.hit.colliderId);
    return result;
  }

  volumesAtCapsule(request: CapsuleVolumeRequest): CapsuleVolumeResult {
    return this.world.volumesAtCapsule(request);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function semanticId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,95}$/u.test(value)) {
    throw new RangeError(`${label} must be a bounded lowercase semantic id`);
  }
  return value;
}

function point(value: unknown, label: string): Point {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a three-component array`);
  }
  return Object.freeze({
    x: boundedInteger(value[0], -100_000, 100_000, `${label}[0]`),
    y: boundedInteger(value[1], -100_000, 100_000, `${label}[1]`),
    z: boundedInteger(value[2], -100_000, 100_000, `${label}[2]`),
  });
}

function parseTopology(source: unknown): ParsedTopology {
  const root = record(source, '$topology');
  if (root.id !== 'inkfall_foundry_graybox_seed_v1'
    || root.mapId !== INKFALL_PLAYTEST_MAP_ID
    || root.status !== 'design_seed_only') {
    throw new Error('P6_6_TOPOLOGY_SEED_IDENTITY_MISMATCH');
  }
  if (!Array.isArray(root.nodes) || root.nodes.length !== 19
    || !Array.isArray(root.links) || root.links.length !== 27
    || !Array.isArray(root.routeMetrics) || root.routeMetrics.length !== 12) {
    throw new Error('P6_6_TOPOLOGY_SEED_CARDINALITY_MISMATCH');
  }
  const nodeIds = new Set(root.nodes.map((value, index) => (
    semanticId(record(value, `$topology.nodes[${index}]`).id, `$topology.nodes[${index}].id`)
  )));
  const links = new Map<string, TopologyLink>();
  for (const [index, value] of root.links.entries()) {
    const entry = record(value, `$topology.links[${index}]`);
    const id = semanticId(entry.id, `$topology.links[${index}].id`);
    const from = semanticId(entry.from, `$topology.links[${index}].from`);
    const to = semanticId(entry.to, `$topology.links[${index}].to`);
    if (!nodeIds.has(from) || !nodeIds.has(to) || typeof entry.oneWay !== 'boolean'
      || !Array.isArray(entry.modes) || entry.modes.length < 1) {
      throw new Error(`P6_6_TOPOLOGY_LINK_INVALID ${id}`);
    }
    const modes = entry.modes.map((mode) => {
      if (mode !== 'run' && mode !== 'jump' && mode !== 'slide'
        && mode !== 'crouch' && mode !== 'teleport' && mode !== 'drop') {
        throw new Error(`P6_6_TOPOLOGY_LINK_MODE_INVALID ${id}`);
      }
      return mode;
    });
    if (!Array.isArray(entry.waypointsMm) || entry.waypointsMm.length < 2
      || entry.waypointsMm.length > 8) {
      throw new Error(`P6_6_TOPOLOGY_WAYPOINTS_INVALID ${id}`);
    }
    if (links.has(id)) throw new Error(`P6_6_TOPOLOGY_LINK_DUPLICATE ${id}`);
    const waypoints = Object.freeze(entry.waypointsMm.map((item, waypointIndex) => (
      point(item, `$topology.links[${index}].waypointsMm[${waypointIndex}]`)
    )));
    links.set(id, Object.freeze({
      id,
      from,
      to,
      oneWay: entry.oneWay,
      modes: Object.freeze(modes),
      waypoints,
    }));
  }
  const metrics = new Map<string, TopologyMetric>();
  for (const [index, value] of root.routeMetrics.entries()) {
    const entry = record(value, `$topology.routeMetrics[${index}]`);
    const id = semanticId(entry.id, `$topology.routeMetrics[${index}].id`);
    if (!Array.isArray(entry.linkIds) || entry.linkIds.length < 1 || entry.linkIds.length > 16
      || !Array.isArray(entry.targetBandMs) || entry.targetBandMs.length !== 2) {
      throw new Error(`P6_6_TOPOLOGY_METRIC_INVALID ${id}`);
    }
    const linkIds = entry.linkIds.map((item, linkIndex) => (
      semanticId(item, `$topology.routeMetrics[${index}].linkIds[${linkIndex}]`)
    ));
    if (linkIds.some((linkId) => !links.has(linkId))) {
      throw new Error(`P6_6_TOPOLOGY_METRIC_LINK_MISSING ${id}`);
    }
    const minimum = boundedInteger(entry.targetBandMs[0], 1, 60_000, `${id}.targetBandMs[0]`);
    const maximum = boundedInteger(entry.targetBandMs[1], minimum, 60_000, `${id}.targetBandMs[1]`);
    metrics.set(id, Object.freeze({
      id,
      linkIds: Object.freeze(linkIds),
      targetBandMilliseconds: Object.freeze([minimum, maximum] as const),
    }));
  }
  return Object.freeze({ links, metrics });
}

function bindingForDefinition(definition: InkfallAuthorityPlaytestSuiteDefinition): PlaytestBinding {
  if (definition.schemaVersion === INKFALL_PLAYTEST_SCHEMA_VERSION) {
    return Object.freeze({
      schemaVersion: INKFALL_PLAYTEST_SCHEMA_VERSION,
      mapRevision: INKFALL_PLAYTEST_MAP_REVISION,
      packageDigest: INKFALL_PLAYTEST_PACKAGE_DIGEST,
      fixtureHash: INKFALL_PLAYTEST_FIXTURE_HASH,
      colliderCardinality: 346,
      status: 'P6_6_AUTOMATED_AUTHORITY_PLAYTEST_FOUNDATION_G5_NOT_PASSED',
    });
  }
  return Object.freeze({
    schemaVersion: INKFALL_PLAYTEST_SCHEMA_VERSION_V2,
    mapRevision: INKFALL_PLAYTEST_MAP_REVISION_V2,
    packageDigest: INKFALL_PLAYTEST_PACKAGE_DIGEST_V2,
    fixtureHash: INKFALL_PLAYTEST_FIXTURE_HASH_V2,
    colliderCardinality: 339,
    status: 'P6_6_REVISION_2_AUTOMATED_AUTHORITY_PLAYTEST_RESULT_G5_NOT_PASSED',
  });
}

function parseSavedSpawnFixtures(
  source: unknown,
  binding: PlaytestBinding,
): ReadonlyMap<string, SavedSpawnFixtureScenario> {
  const root = record(source, '$spawnFixtures');
  if (root.schemaVersion !== 1 || root.mapId !== INKFALL_PLAYTEST_MAP_ID
    || root.mapRevision !== binding.mapRevision
    || root.packageDigest !== binding.packageDigest
    || root.fixtureHash !== binding.fixtureHash
    || !Array.isArray(root.scenarios)) {
    throw new Error('P6_6_SPAWN_FIXTURE_IDENTITY_MISMATCH');
  }
  const scenarios = new Map<string, SavedSpawnFixtureScenario>();
  for (const [index, value] of root.scenarios.entries()) {
    const entry = record(value, `$spawnFixtures.scenarios[${index}]`);
    const expected = record(entry.expected, `$spawnFixtures.scenarios[${index}].expected`);
    const id = semanticId(entry.id, `$spawnFixtures.scenarios[${index}].id`);
    const status = expected.status;
    if (status !== 'selected' && status !== 'no_safe_spawn') {
      throw new Error(`P6_6_SPAWN_FIXTURE_STATUS_INVALID ${id}`);
    }
    scenarios.set(id, Object.freeze({
      id,
      input: entry.input as AuthoritySpawnSelectionInputV1,
      expected: Object.freeze({
        status,
        selectedSpawnId: expected.selectedSpawnId === null
          ? null
          : semanticId(expected.selectedSpawnId, `${id}.expected.selectedSpawnId`),
        decisionHash: typeof expected.decisionHash === 'string' ? expected.decisionHash : '',
      }),
    }));
  }
  return scenarios;
}

function assertSuiteDefinition(
  definition: InkfallAuthorityPlaytestSuiteDefinition,
  binding: PlaytestBinding,
  topology: ParsedTopology,
  spawnFixtures: ReadonlyMap<string, SavedSpawnFixtureScenario>,
): void {
  if (definition.schemaVersion !== binding.schemaVersion
    || definition.mapId !== INKFALL_PLAYTEST_MAP_ID
    || definition.mapRevision !== binding.mapRevision
    || definition.packageDigest !== binding.packageDigest
    || definition.fixtureHash !== binding.fixtureHash
    || definition.topologySeedSha256 !== INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256
    || definition.authorityRateHz !== INKFALL_PLAYTEST_RATE_HZ
    || definition.agents !== 'synthetic_non_human_deterministic') {
    throw new Error('P6_6_SUITE_DEFINITION_IDENTITY_MISMATCH');
  }
  if (definition.scenarios.length !== 3
    || definition.scenarios.map(({ playerCount }) => playerCount).join(',') !== '2,4,8') {
    throw new Error('P6_6_SUITE_REQUIRES_EXACT_2_4_8_SCENARIOS');
  }
  for (const scenario of definition.scenarios) {
    if (scenario.agents.length !== scenario.playerCount
      || scenario.maximumTicks < 1 || scenario.maximumTicks > 900) {
      throw new Error(`P6_6_SCENARIO_BOUND_INVALID ${scenario.id}`);
    }
    const spawnFixture = spawnFixtures.get(scenario.spawnProbe.fixtureScenarioId);
    if (!spawnFixture
      || spawnFixture.expected.status !== scenario.spawnProbe.expectedStatus
      || spawnFixture.expected.selectedSpawnId !== scenario.spawnProbe.expectedSpawnId
      || spawnFixture.expected.decisionHash !== scenario.spawnProbe.expectedDecisionHash) {
      throw new Error(`P6_6_SPAWN_PROBE_BINDING_MISMATCH ${scenario.id}`);
    }
    const slots = new Set<number>();
    const spawns = new Set<string>();
    for (const agent of scenario.agents) {
      if (slots.has(agent.slot) || spawns.has(agent.spawnId)
        || agent.slot < 0 || agent.slot >= scenario.playerCount
        || agent.startDelayTicks < 0 || agent.startDelayTicks > 60
        || agent.steps.length < 1 || agent.steps.length > 16) {
        throw new Error(`P6_6_AGENT_BOUND_INVALID ${scenario.id}.${agent.slot}`);
      }
      slots.add(agent.slot);
      spawns.add(agent.spawnId);
      let priorEnd: string | null = null;
      for (const step of agent.steps) {
        const link = topology.links.get(step.linkId);
        if (!link || (link.oneWay && step.direction === 'reverse')) {
          throw new Error(`P6_6_ROUTE_STEP_INVALID ${scenario.id}.${agent.slot}.${step.linkId}`);
        }
        const transitions = (step as InkfallTapeRouteStepV2).postureTransitions;
        if (definition.schemaVersion === INKFALL_PLAYTEST_SCHEMA_VERSION) {
          if (transitions !== undefined) {
            throw new Error(`P6_6_V1_POSTURE_TRANSITION_FORBIDDEN ${scenario.id}.${agent.slot}`);
          }
        } else if (transitions !== undefined) {
          if (transitions.length < 1 || transitions.length > 4) {
            throw new Error(`P6_6_POSTURE_TRANSITION_BOUND_INVALID ${scenario.id}.${agent.slot}`);
          }
          let priorTransitionOrder = -1;
          for (const transition of transitions) {
            if (!Number.isSafeInteger(transition.atWaypointIndex)
              || transition.atWaypointIndex < 0
              || transition.atWaypointIndex >= link.waypoints.length
              || !Number.isSafeInteger(transition.afterTargetedTicks)
              || transition.afterTargetedTicks < 0
              || transition.afterTargetedTicks > 20) {
              throw new Error(`P6_6_POSTURE_TRANSITION_INVALID ${scenario.id}.${agent.slot}`);
            }
            const transitionOrder = transition.atWaypointIndex * 100 + transition.afterTargetedTicks;
            if (transitionOrder <= priorTransitionOrder) {
              throw new Error(`P6_6_POSTURE_TRANSITION_ORDER_INVALID ${scenario.id}.${agent.slot}`);
            }
            priorTransitionOrder = transitionOrder;
          }
        }
        const start = step.direction === 'forward' ? link.from : link.to;
        const end = step.direction === 'forward' ? link.to : link.from;
        if (priorEnd !== null && start !== priorEnd) {
          throw new Error(`P6_6_ROUTE_DISCONTINUITY ${scenario.id}.${agent.slot}.${step.linkId}`);
        }
        priorEnd = end;
      }
      const agentLinks = agent.steps.map(({ linkId }) => linkId);
      for (const metricId of agent.routeMetricIds) {
        const metric = topology.metrics.get(metricId);
        if (!metric) throw new Error(`P6_6_ROUTE_METRIC_MISSING ${metricId}`);
        const sequence = metric.linkIds.join('|');
        if (!agentLinks.join('|').includes(sequence)) {
          throw new Error(`P6_6_ROUTE_METRIC_NOT_ON_TAPE ${scenario.id}.${agent.slot}.${metricId}`);
        }
      }
    }
  }
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function clonePoint(value: Point): MapVector3Millimeters {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function movementPoint(value: Point) {
  return Object.freeze({
    x: asMillimeters(value.x),
    y: asMillimeters(value.y),
    z: asMillimeters(value.z),
  });
}

function planarDistance(left: Point, right: Point): number {
  return Math.round(Math.hypot(left.x - right.x, left.z - right.z));
}

function distance3(left: Point, right: Point): number {
  return Math.round(Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z));
}

function formatPoint(value: Point): string {
  return `(${value.x},${value.y},${value.z})`;
}

function normalizeAngle(value: number): number {
  let normalized = value % 360_000;
  if (normalized > 180_000) normalized -= 360_000;
  if (normalized < -180_000) normalized += 360_000;
  return Math.round(normalized);
}

function currentShape(agent: AgentRuntime) {
  return agent.state.player.stance === 'standing'
    ? PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape
    : PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.crouchedShape;
}

function movementCallCount(metrics: MovementQueryMetrics): number {
  return metrics.moveCapsuleCalls + metrics.overlapCapsuleCalls
    + metrics.castCapsuleCalls + metrics.volumeCalls;
}

function addMetrics(target: MutableQueryTotals, metrics: MovementQueryMetrics): void {
  target.moveCapsuleCalls += metrics.moveCapsuleCalls;
  target.overlapCapsuleCalls += metrics.overlapCapsuleCalls;
  target.castCapsuleCalls += metrics.castCapsuleCalls;
  target.volumeCalls += metrics.volumeCalls;
  target.shapeCasts += metrics.shapeCasts;
  target.overlapTests += metrics.overlapTests;
  target.contacts += metrics.contacts;
}

function createQueryTotals(): MutableQueryTotals {
  return {
    moveCapsuleCalls: 0,
    overlapCapsuleCalls: 0,
    castCapsuleCalls: 0,
    volumeCalls: 0,
    shapeCasts: 0,
    overlapTests: 0,
    contacts: 0,
    explicitEmbedChecks: 0,
    maximumCallsPerAgentTick: 0,
  };
}

function addIssue(
  issues: InkfallPlaytestIssueV1[],
  code: string,
  scenarioId: string,
  agentSlot: number | null,
  tick: number | null,
  detail: string,
): void {
  issues.push(Object.freeze({
    code,
    scenarioId,
    agentSlot,
    tick,
    detail,
    topologyMutationAuthorized: false,
  }));
}

function routeWaypoints(agent: AgentRuntime, topology: ParsedTopology): readonly Point[] {
  const step = agent.definition.steps[agent.stepIndex];
  if (!step) return Object.freeze([]);
  const link = topology.links.get(step.linkId);
  if (!link) throw new Error(`P6_6_ROUTE_LINK_MISSING ${step.linkId}`);
  return step.direction === 'forward' ? link.waypoints : Object.freeze([...link.waypoints].reverse());
}

function enterCurrentStep(agent: AgentRuntime, authorityTickBeforeStep: number): void {
  if (agent.stepIndex >= agent.definition.steps.length || agent.stepEnteredAtTick !== null) return;
  const step = agent.definition.steps[agent.stepIndex];
  agent.stepEnteredAtTick = authorityTickBeforeStep;
  agent.waypointIndex = 0;
  agent.waypointTargetedAtTick = authorityTickBeforeStep;
  agent.modeActivated = false;
  agent.activeMovementMode = null;
  agent.bestWaypointDistanceMm = Number.POSITIVE_INFINITY;
  agent.stagnantTicks = 0;
  agent.tapes.push({
    linkId: step.linkId,
    direction: step.direction,
    movementMode: step.movementMode,
    enteredAtTick: authorityTickBeforeStep,
    exitedAtTick: null,
    completed: false,
  });
}

function waypointReached(
  position: Point,
  target: Point,
  planarToleranceMm = WAYPOINT_PLANAR_TOLERANCE_MM,
  verticalToleranceMm = WAYPOINT_VERTICAL_TOLERANCE_MM,
): boolean {
  return planarDistance(position, target) <= planarToleranceMm
    && Math.abs(position.y - target.y) <= verticalToleranceMm;
}

function advanceReachedWaypoints(
  agent: AgentRuntime,
  topology: ParsedTopology,
  authorityTick: number,
): void {
  while (agent.stepIndex < agent.definition.steps.length) {
    enterCurrentStep(agent, Math.max(0, authorityTick - 1));
    const waypoints = routeWaypoints(agent, topology);
    const target = waypoints[agent.waypointIndex];
    const step = agent.definition.steps[agent.stepIndex];
    const teleportActivation = step.movementMode === 'teleport' && agent.waypointIndex === 0;
    const teleportLanding = step.movementMode === 'teleport'
      && agent.waypointIndex === waypoints.length - 1;
    const planarTolerance = teleportActivation
      ? TELEPORT_ACTIVATION_TOLERANCE_MM
      : teleportLanding ? TELEPORT_LANDING_TOLERANCE_MM : WAYPOINT_PLANAR_TOLERANCE_MM;
    const verticalTolerance = teleportActivation ? 250 : WAYPOINT_VERTICAL_TOLERANCE_MM;
    if (target && !waypointReached(
      agent.state.player.feetPosition,
      target,
      planarTolerance,
      verticalTolerance,
    )) return;
    if (target) {
      agent.waypointIndex += 1;
      agent.waypointTargetedAtTick = authorityTick;
    }
    if (agent.waypointIndex < waypoints.length) {
      agent.bestWaypointDistanceMm = Number.POSITIVE_INFINITY;
      agent.stagnantTicks = 0;
      return;
    }
    const tape = agent.tapes.at(-1);
    if (!tape || tape.linkId !== agent.definition.steps[agent.stepIndex].linkId) {
      throw new Error('P6_6_ROUTE_TAPE_STATE_MISMATCH');
    }
    tape.exitedAtTick = Math.max(authorityTick, tape.enteredAtTick + 1);
    tape.completed = true;
    agent.stepIndex += 1;
    agent.stepEnteredAtTick = null;
    agent.waypointIndex = 0;
    agent.waypointTargetedAtTick = authorityTick;
    agent.modeActivated = false;
    agent.activeMovementMode = null;
    agent.bestWaypointDistanceMm = Number.POSITIVE_INFINITY;
    agent.stagnantTicks = 0;
    if (agent.stepIndex >= agent.definition.steps.length) {
      agent.completionTick = tape.exitedAtTick;
      return;
    }
  }
}

function desiredIntentForTarget(
  position: Point,
  target: Point,
  yawMilliDegrees: number,
): { readonly moveX: number; readonly moveZ: number } {
  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  const magnitude = Math.hypot(deltaX, deltaZ);
  if (magnitude < 1) return { moveX: 0, moveZ: 0 };
  const worldX = deltaX / magnitude;
  const worldZ = deltaZ / magnitude;
  const yaw = (yawMilliDegrees / 1_000) * (Math.PI / 180);
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return {
    moveX: Math.max(-127, Math.min(127, Math.round((worldX * cosine - worldZ * sine) * 127))),
    moveZ: Math.max(-127, Math.min(127, Math.round((worldX * sine + worldZ * cosine) * 127))),
  };
}

function currentMovementMode(
  agent: AgentRuntime,
  authorityTick: number,
): InkfallTapeMovementMode | null {
  const step = agent.definition.steps[agent.stepIndex];
  if (!step) return null;
  let movementMode = step.movementMode;
  const transitions = (step as InkfallTapeRouteStepV2).postureTransitions ?? [];
  for (const transition of transitions) {
    if (agent.waypointIndex > transition.atWaypointIndex
      || (agent.waypointIndex === transition.atWaypointIndex
        && authorityTick - agent.waypointTargetedAtTick >= transition.afterTargetedTicks)) {
      movementMode = transition.movementMode;
    }
  }
  return movementMode;
}

function commandForAgent(
  agent: AgentRuntime,
  topology: ParsedTopology,
  authorityTick: number,
): PlayerIntentCommand {
  let moveX = 0;
  let moveZ = 0;
  let heldButtons = 0;
  let pressedButtons = 0;
  let lookYawDeltaMilliDegrees = 0;
  let lookPitchDeltaMilliDegrees = 0;
  const step = authorityTick > agent.definition.startDelayTicks
    ? agent.definition.steps[agent.stepIndex]
    : undefined;
  if (step) {
    enterCurrentStep(agent, authorityTick - 1);
    const waypoints = routeWaypoints(agent, topology);
    const target = waypoints[agent.waypointIndex];
    if (target) {
      const intent = desiredIntentForTarget(
        agent.state.player.feetPosition,
        target,
        agent.state.player.yawMilliDegrees,
      );
      moveX = intent.moveX;
      moveZ = intent.moveZ;
    }
    const movementMode = currentMovementMode(agent, authorityTick) ?? step.movementMode;
    if (agent.activeMovementMode !== movementMode) {
      agent.activeMovementMode = movementMode;
      agent.modeActivated = false;
    }
    heldButtons |= INTENT_BUTTON.sprint;
    if (movementMode === 'crouch' || movementMode === 'slide') {
      heldButtons |= INTENT_BUTTON.crouch;
    }
    if (movementMode === 'jump' && !agent.modeActivated) {
      heldButtons |= INTENT_BUTTON.jump;
      pressedButtons |= INTENT_BUTTON.jump;
      agent.modeActivated = true;
    }
    if (movementMode === 'slide' && !agent.modeActivated
      && Math.hypot(agent.state.player.velocity.x, agent.state.player.velocity.z)
        >= PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.slide.minimumEntrySpeedMmPerSecond) {
      pressedButtons |= INTENT_BUTTON.crouch;
      agent.modeActivated = true;
    }
    if (movementMode === 'teleport' && agent.waypointIndex >= waypoints.length - 1
      && !agent.modeActivated && target) {
      const deltaX = target.x - agent.state.player.feetPosition.x;
      const deltaY = target.y - agent.state.player.feetPosition.y;
      const deltaZ = target.z - agent.state.player.feetPosition.z;
      const horizontal = Math.hypot(deltaX, deltaZ);
      const desiredYaw = Math.round(Math.atan2(deltaX, deltaZ) * (180 / Math.PI) * 1_000);
      const desiredPitch = Math.round(Math.atan2(deltaY, horizontal) * (180 / Math.PI) * 1_000);
      lookYawDeltaMilliDegrees = normalizeAngle(desiredYaw - agent.state.player.yawMilliDegrees);
      lookPitchDeltaMilliDegrees = Math.max(
        -180_000,
        Math.min(180_000, desiredPitch - agent.state.player.pitchMilliDegrees),
      );
      heldButtons |= INTENT_BUTTON.utility;
      pressedButtons |= INTENT_BUTTON.utility;
      moveX = 0;
      moveZ = 0;
      agent.modeActivated = true;
    }
  }
  const releasedButtons = agent.previousHeldButtons & ~heldButtons;
  agent.previousHeldButtons = heldButtons;
  return {
    kind: 'player_intent',
    sequence: authorityTick - 1,
    clientTick: agent.state.tick,
    moveX: asQuantizedAxis(moveX),
    moveZ: asQuantizedAxis(moveZ),
    lookYawDeltaMilliDegrees,
    lookPitchDeltaMilliDegrees,
    heldButtons,
    pressedButtons,
    releasedButtons,
  };
}

function updateSnagProgress(
  agent: AgentRuntime,
  topology: ParsedTopology,
  scenario: InkfallAuthorityPlaytestScenarioDefinition,
  authorityTick: number,
  issues: InkfallPlaytestIssueV1[],
): void {
  if (agent.stepIndex >= agent.definition.steps.length) return;
  const target = routeWaypoints(agent, topology)[agent.waypointIndex];
  if (!target) return;
  const distance = distance3(agent.state.player.feetPosition, target);
  if (distance + SNAG_PROGRESS_MM < agent.bestWaypointDistanceMm) {
    agent.bestWaypointDistanceMm = distance;
    agent.stagnantTicks = 0;
    return;
  }
  agent.stagnantTicks += 1;
  if (agent.stagnantTicks < SNAG_WINDOW_TICKS) return;
  agent.snagEvents += 1;
  const snagKey = `${agent.stepIndex}:${agent.waypointIndex}`;
  if (!agent.reportedSnagWaypoints.has(snagKey)) {
    agent.reportedSnagWaypoints.add(snagKey);
    addIssue(
      issues,
      'ROUTE_SNAG_WINDOW_EXCEEDED',
      scenario.id,
      agent.definition.slot,
      authorityTick,
      `No ${SNAG_PROGRESS_MM} mm progress toward ${agent.definition.steps[agent.stepIndex].linkId}`
        + ` waypoint ${agent.waypointIndex} for ${SNAG_WINDOW_TICKS} ticks; position=`
        + `${formatPoint(agent.state.player.feetPosition)}; target=${formatPoint(target)};`
        + ` distance=${distance} mm; velocity=${formatPoint(agent.state.player.velocity)};`
        + ` support=${agent.state.player.support?.colliderId ?? 'none'}; tickContacts=`
        + `${[...new Set(agent.queryCapture.contacts.map(({ colliderId }) => colliderId))].join(',') || 'none'}.`,
    );
  }
  agent.stagnantTicks = 0;
  agent.bestWaypointDistanceMm = distance;
}

function zoneForPosition(loaded: LoadedRuntimeMapPackage, position: Point): string | null {
  const candidates = loaded.manifest.zones.filter((zone) => (
    Math.abs(position.x - zone.centerMm.x) <= zone.halfExtentsMm.x
    && Math.abs(position.y - zone.centerMm.y) <= zone.halfExtentsMm.y
    && Math.abs(position.z - zone.centerMm.z) <= zone.halfExtentsMm.z
  ));
  candidates.sort((left, right) => {
    const normalizedDistance = (zone: (typeof candidates)[number]) => (
      ((position.x - zone.centerMm.x) / zone.halfExtentsMm.x) ** 2
      + ((position.y - zone.centerMm.y) / zone.halfExtentsMm.y) ** 2
      + ((position.z - zone.centerMm.z) / zone.halfExtentsMm.z) ** 2
    );
    return normalizedDistance(left) - normalizedDistance(right)
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
  return candidates[0]?.id ?? null;
}

function bodyOverlap(left: AgentRuntime, right: AgentRuntime): boolean {
  const horizontal = planarDistance(left.state.player.feetPosition, right.state.player.feetPosition);
  if (horizontal >= BODY_DIAMETER_MM) return false;
  const leftHeight = currentShape(left).height;
  const rightHeight = currentShape(right).height;
  return left.state.player.feetPosition.y < right.state.player.feetPosition.y + rightHeight
    && right.state.player.feetPosition.y < left.state.player.feetPosition.y + leftHeight;
}

function initializeAgent(
  definition: InkfallSyntheticAgentDefinition,
  loaded: LoadedRuntimeMapPackage,
  world: RapierMovementWorld,
): AgentRuntime {
  const spawn = loaded.manifest.spawns.find(({ id }) => id === definition.spawnId);
  if (!spawn) throw new Error(`P6_6_AGENT_SPAWN_MISSING ${definition.spawnId}`);
  const state = createMovementSimulationState(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, {
    rulesetId: 'inkfall.p6_6.synthetic',
    rulesetRevision: 1,
    rulesetHash: RULESET_HASH,
    fixtureId: world.fixture.id,
    fixtureHash: world.fixtureHash,
    physicsAdapterId: 'rapier3d.deterministic.compat',
    physicsAdapterVersion: world.runtime.version,
    playerId: `p6_6_agent_${definition.slot}`,
    feetPosition: spawn.feetPositionMm,
    grounded: true,
  });
  return {
    definition,
    id: `p6_6_agent_${definition.slot}`,
    initialPosition: clonePoint(spawn.feetPositionMm),
    state,
    tapes: [],
    semanticEvents: {},
    blockingColliderIds: new Set(),
    replayStateHashes: [],
    movementToolEvents: [],
    queryCapture: new ContactCaptureQueries(world),
    stepIndex: 0,
    waypointIndex: 0,
    waypointTargetedAtTick: 0,
    stepEnteredAtTick: null,
    modeActivated: false,
    activeMovementMode: null,
    previousHeldButtons: 0,
    bestWaypointDistanceMm: Number.POSITIVE_INFINITY,
    stagnantTicks: 0,
    horizontalCollisionContacts: 0,
    embedSamples: 0,
    snagEvents: 0,
    recoveryVolumeEntries: 0,
    killVolumeEntries: 0,
    sampledFrameCount: 0,
    completionTick: null,
    fatalError: null,
    reportedSnagWaypoints: new Set(),
  };
}

function addTelemetry(
  events: PendingTelemetryEvent[],
  authorityTick: number,
  kind: string,
  payload: Record<string, unknown>,
): void {
  events.push({ authorityTick, order: events.length, kind, payload });
}

function sampleOccupancy(
  agents: readonly AgentRuntime[],
  loaded: LoadedRuntimeMapPackage,
  authorityTick: number,
  telemetryEvents: PendingTelemetryEvent[],
  peakPlayersByZone: Record<string, number>,
): boolean {
  const occupants = agents.map((agent) => ({
    actorSlot: agent.definition.slot,
    zoneId: zoneForPosition(loaded, agent.state.player.feetPosition),
    feetPositionMm: clonePoint(agent.state.player.feetPosition),
  }));
  if (occupants.some(({ zoneId }) => zoneId === null)) return false;
  const counts: Record<string, number> = {};
  for (const occupant of occupants) {
    const zoneId = occupant.zoneId!;
    counts[zoneId] = (counts[zoneId] ?? 0) + 1;
    peakPlayersByZone[zoneId] = Math.max(peakPlayersByZone[zoneId] ?? 0, counts[zoneId]);
  }
  addTelemetry(telemetryEvents, authorityTick, 'occupancy_sample', {
    occupants: occupants.map((occupant) => ({
      actorSlot: occupant.actorSlot,
      zoneId: occupant.zoneId,
      feetPositionMm: { ...occupant.feetPositionMm },
    })),
  });
  return true;
}

function routeMetricResults(
  agent: AgentRuntime,
  topology: ParsedTopology,
): readonly InkfallRouteMetricResultV1[] {
  return agent.definition.routeMetricIds.map((metricId) => {
    const metric = topology.metrics.get(metricId);
    if (!metric) throw new Error(`P6_6_ROUTE_METRIC_MISSING ${metricId}`);
    const tapeLinks = agent.tapes.map(({ linkId }) => linkId);
    let firstIndex = -1;
    for (let index = 0; index <= tapeLinks.length - metric.linkIds.length; index += 1) {
      if (metric.linkIds.every((linkId, offset) => tapeLinks[index + offset] === linkId)) {
        firstIndex = index;
        break;
      }
    }
    const first = firstIndex < 0 ? undefined : agent.tapes[firstIndex];
    const last = firstIndex < 0 ? undefined : agent.tapes[firstIndex + metric.linkIds.length - 1];
    const measuredTicks = first && last?.completed && last.exitedAtTick !== null
      ? last.exitedAtTick - first.enteredAtTick
      : null;
    const measuredMilliseconds = measuredTicks === null
      ? null
      : measuredTicks * INKFALL_PLAYTEST_TICK_MILLISECONDS;
    return Object.freeze({
      metricId,
      targetBandMilliseconds: metric.targetBandMilliseconds,
      measuredTicks,
      measuredMilliseconds,
      insideTargetBand: measuredMilliseconds !== null
        && measuredMilliseconds >= metric.targetBandMilliseconds[0]
        && measuredMilliseconds <= metric.targetBandMilliseconds[1],
    });
  });
}

function agentResult(agent: AgentRuntime, topology: ParsedTopology): InkfallSyntheticAgentResultV1 {
  const finalStateHash = hashCanonicalMovementState(agent.state);
  return Object.freeze({
    slot: agent.definition.slot,
    id: agent.id,
    classification: 'synthetic_non_human_agent',
    spawnId: agent.definition.spawnId,
    startDelayTicks: agent.definition.startDelayTicks,
    completed: agent.stepIndex >= agent.definition.steps.length,
    completionTick: agent.completionTick,
    finalFeetPositionMm: clonePoint(agent.state.player.feetPosition),
    finalStateHash,
    replayHash: fnv1a64(agent.replayStateHashes.join('|')),
    routeTapes: Object.freeze(agent.tapes.map((tape): InkfallRouteTapeResultV1 => Object.freeze({
      linkId: tape.linkId,
      direction: tape.direction,
      movementMode: tape.movementMode,
      enteredAtTick: tape.enteredAtTick,
      exitedAtTick: tape.exitedAtTick,
      traversalTicks: tape.exitedAtTick === null ? null : tape.exitedAtTick - tape.enteredAtTick,
      completed: tape.completed,
    }))),
    routeMetrics: Object.freeze(routeMetricResults(agent, topology)),
    movementToolEvents: Object.freeze([...agent.movementToolEvents]),
    semanticEvents: Object.freeze({ ...agent.semanticEvents }),
    horizontalCollisionContacts: agent.horizontalCollisionContacts,
    blockingColliderIds: Object.freeze([...agent.blockingColliderIds].sort()),
    embedSamples: agent.embedSamples,
    snagEvents: agent.snagEvents,
    recoveryVolumeEntries: agent.recoveryVolumeEntries,
    killVolumeEntries: agent.killVolumeEntries,
    sampledFrameCount: agent.sampledFrameCount,
  });
}

function spawnProbeResult(
  selection: AuthoritySpawnSelectionResultV1,
  scenario: InkfallAuthorityPlaytestScenarioDefinition,
) {
  const selectedEvaluation = selection.selected === null
    ? undefined
    : selection.evaluations.find(({ spawnId }) => spawnId === selection.selected?.spawnId);
  const directLosSelected = selectedEvaluation === undefined
    ? null
    : selectedEvaluation.enemies.some((enemy) => (
      enemy.standingLineOfSight || enemy.crouchedLineOfSight
    ));
  return Object.freeze({
    fixtureScenarioId: scenario.spawnProbe.fixtureScenarioId,
    status: selection.status,
    selectedSpawnId: selection.selected?.spawnId ?? null,
    decisionHash: selection.decisionHash,
    directLosSelected,
    passed: selection.status === scenario.spawnProbe.expectedStatus
      && (selection.selected?.spawnId ?? null) === scenario.spawnProbe.expectedSpawnId
      && selection.decisionHash === scenario.spawnProbe.expectedDecisionHash
      && (selection.selected === null || directLosSelected === false),
  });
}

function appendSpawnTelemetry(
  pending: PendingTelemetryEvent[],
  selection: AuthoritySpawnSelectionResultV1,
): void {
  if (selection.status === 'selected' && selection.selected) {
    const selectedEvaluation = selection.evaluations.find(
      ({ spawnId }) => spawnId === selection.selected?.spawnId,
    );
    if (!selectedEvaluation) throw new Error('P6_6_SELECTED_SPAWN_EVALUATION_MISSING');
    addTelemetry(pending, 0, 'spawn_choice', {
      actorSlot: 0,
      spawnId: selection.selected.spawnId,
      decisionHash: selection.decisionHash,
      selectedScore: selection.selected.score,
      evaluatedCandidateCount: selection.evaluations.length,
      eligibleCandidateCount: selection.evaluations.filter(({ eligible }) => eligible).length,
    });
    return;
  }
  const rejectedFor = (reason: string) => selection.evaluations.filter(
    ({ rejectionReasons }) => rejectionReasons.includes(reason),
  ).length;
  addTelemetry(pending, 0, 'no_safe_spawn', {
    actorSlot: 0,
    evaluatedCandidateCount: selection.evaluations.length,
    directLosRejectedCount: rejectedFor('direct_enemy_line_of_sight'),
    occupancyRejectedCount: rejectedFor('authority_occupancy_overlap'),
    territoryRejectedCount: rejectedFor('mode_team_territory_invalid'),
    retryAfterTicks: 10,
  });
}

function addExternalOverlapMetrics(
  totals: MutableQueryTotals,
  result: CapsuleOverlapResult,
): void {
  totals.overlapCapsuleCalls += 1;
  totals.overlapTests += result.overlapTests;
  totals.explicitEmbedChecks += 1;
}

function addExternalVolumeMetrics(
  totals: MutableQueryTotals,
  result: CapsuleVolumeResult,
): void {
  totals.volumeCalls += 1;
  totals.overlapTests += result.overlapTests;
}

async function runScenario(
  loaded: LoadedRuntimeMapPackage,
  scenario: InkfallAuthorityPlaytestScenarioDefinition,
  topology: ParsedTopology,
  spawnFixture: SavedSpawnFixtureScenario,
  binding: PlaytestBinding,
): Promise<InkfallAuthorityPlaytestScenarioResultV1> {
  const world = await createRapierMovementWorld(loaded.authority.fixture);
  const issues: InkfallPlaytestIssueV1[] = [];
  try {
    const selection = createInkfallSpawnAuthority(loaded).select(spawnFixture.input);
    const probe = spawnProbeResult(selection, scenario);
    if (!probe.passed) {
      addIssue(
        issues,
        'SPAWN_PROBE_MISMATCH',
        scenario.id,
        null,
        selection.tick,
        `Expected ${scenario.spawnProbe.expectedStatus}/${scenario.spawnProbe.expectedSpawnId}`
          + `/${scenario.spawnProbe.expectedDecisionHash}; received ${selection.status}`
          + `/${selection.selected?.spawnId ?? 'null'}/${selection.decisionHash}.`,
      );
    }

    const agents = scenario.agents.map((definition) => initializeAgent(definition, loaded, world));
    const queryTotals = createQueryTotals();
    const pendingTelemetry: PendingTelemetryEvent[] = [];
    const peakPlayersByZone: Record<string, number> = {};
    const reportedEmbeds = new Set<string>();
    const reportedBodyOverlaps = new Set<string>();
    const reportedResourceAgents = new Set<number>();
    const reportedUnsafeVolumeAgents = new Set<string>();
    let minimumPairDistanceMm: number | null = null;
    let closeContactSamples = 0;
    let bodyOverlapSamples = 0;
    let occupancySampledTicks = 0;
    let firstCloseContactAtTick: number | null = null;

    appendSpawnTelemetry(pendingTelemetry, selection);
    sampleOccupancy(agents, loaded, 0, pendingTelemetry, peakPlayersByZone);

    const samplePairs = (authorityTick: number) => {
      occupancySampledTicks += 1;
      for (let leftIndex = 0; leftIndex < agents.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < agents.length; rightIndex += 1) {
          const left = agents[leftIndex];
          const right = agents[rightIndex];
          const distance = distance3(left.state.player.feetPosition, right.state.player.feetPosition);
          minimumPairDistanceMm = minimumPairDistanceMm === null
            ? distance
            : Math.min(minimumPairDistanceMm, distance);
          if (distance < CLOSE_CONTACT_DISTANCE_MM) {
            closeContactSamples += 1;
            firstCloseContactAtTick ??= authorityTick;
          }
          if (!bodyOverlap(left, right)) continue;
          bodyOverlapSamples += 1;
          const key = `${left.definition.slot}:${right.definition.slot}`;
          if (!reportedBodyOverlaps.has(key)) {
            reportedBodyOverlaps.add(key);
            addIssue(
              issues,
              'SYNTHETIC_BODY_OVERLAP',
              scenario.id,
              null,
              authorityTick,
              `Slots ${left.definition.slot} ${formatPoint(left.state.player.feetPosition)} and`
                + ` ${right.definition.slot} ${formatPoint(right.state.player.feetPosition)}`
                + ' overlapped analytical capsules.',
            );
          }
        }
      }
    };
    samplePairs(0);

    for (const agent of agents) {
      const overlap = world.overlapCapsule({
        feetPosition: agent.state.player.feetPosition,
        shape: currentShape(agent),
        solidLayers: SOLID_LAYERS,
      });
      addExternalOverlapMetrics(queryTotals, overlap);
      if (overlap.blockingColliderIds.length > 0) {
        agent.embedSamples += 1;
        const key = `${agent.definition.slot}:${overlap.blockingColliderIds.join(',')}`;
        reportedEmbeds.add(key);
        addIssue(
          issues,
          'INITIAL_SPAWN_CAPSULE_EMBEDDED',
          scenario.id,
          agent.definition.slot,
          0,
          `Blocking colliders: ${overlap.blockingColliderIds.join(', ')}.`,
        );
      }
    }

    let elapsedTicks = 0;
    for (let authorityTick = 1; authorityTick <= scenario.maximumTicks; authorityTick += 1) {
      for (const agent of agents) {
        if (agent.fatalError !== null) {
          agent.replayStateHashes.push(`${authorityTick}:halted:${hashCanonicalMovementState(agent.state)}`);
          if (authorityTick % SAMPLE_STRIDE_TICKS === 0) agent.sampledFrameCount += 1;
          continue;
        }
        if (authorityTick > agent.definition.startDelayTicks
          && agent.stepIndex < agent.definition.steps.length) {
          enterCurrentStep(agent, authorityTick - 1);
          advanceReachedWaypoints(agent, topology, authorityTick - 1);
        }
        const command = commandForAgent(agent, topology, authorityTick);
        agent.queryCapture.reset();
        let result: ReturnType<typeof stepMovementSimulation>;
        try {
          result = stepMovementSimulation(
            agent.state,
            [command],
            PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
            agent.queryCapture,
          );
        } catch (error) {
          agent.fatalError = error instanceof Error ? error.message : String(error);
          const failedStep = agent.definition.steps[agent.stepIndex];
          const failedTarget = failedStep
            ? routeWaypoints(agent, topology)[agent.waypointIndex]
            : undefined;
          const failedContacts = [...new Set(
            agent.queryCapture.contacts.map(({ colliderId }) => colliderId),
          )];
          addIssue(
            issues,
            'MOVEMENT_QUERY_EXCEPTION',
            scenario.id,
            agent.definition.slot,
            authorityTick,
            `${agent.fatalError}; step=${failedStep?.linkId ?? 'complete'}; waypoint=`
              + `${agent.waypointIndex}; position=${formatPoint(agent.state.player.feetPosition)};`
              + ` target=${failedTarget ? formatPoint(failedTarget) : 'none'}; velocity=`
              + `${formatPoint(agent.state.player.velocity)}; support=`
              + `${agent.state.player.support?.colliderId ?? 'none'}; queryContacts=`
              + `${failedContacts.join(',') || 'none'}.`,
          );
          agent.replayStateHashes.push(`${authorityTick}:exception:${agent.fatalError}`);
          if (authorityTick % SAMPLE_STRIDE_TICKS === 0) agent.sampledFrameCount += 1;
          continue;
        }
        agent.state = result.state;
        addMetrics(queryTotals, result.metrics);
        const callsThisTick = movementCallCount(result.metrics) + 1;
        queryTotals.maximumCallsPerAgentTick = Math.max(
          queryTotals.maximumCallsPerAgentTick,
          callsThisTick,
        );
        if (callsThisTick > MAX_QUERY_CALLS_PER_AGENT_TICK
          && !reportedResourceAgents.has(agent.definition.slot)) {
          reportedResourceAgents.add(agent.definition.slot);
          addIssue(
            issues,
            'QUERY_CALL_BOUND_EXCEEDED',
            scenario.id,
            agent.definition.slot,
            authorityTick,
            `${callsThisTick} authority query calls exceeded ${MAX_QUERY_CALLS_PER_AGENT_TICK}.`,
          );
        }

        for (const event of result.events) {
          agent.semanticEvents[event.kind] = (agent.semanticEvents[event.kind] ?? 0) + 1;
          if (event.kind === 'teleport_succeeded') {
            agent.movementToolEvents.push(Object.freeze({
              kind: event.kind,
              tick: event.tick,
              outcome: event.outcome,
              reason: null,
              fromFeetPositionMm: clonePoint(event.from),
              toFeetPositionMm: clonePoint(event.to),
              blockerColliderIds: Object.freeze([...new Set(agent.queryCapture.castColliderIds)]),
            }));
          } else if (event.kind === 'teleport_rejected') {
            agent.movementToolEvents.push(Object.freeze({
              kind: event.kind,
              tick: event.tick,
              outcome: null,
              reason: event.reason,
              fromFeetPositionMm: clonePoint(agent.state.player.feetPosition),
              toFeetPositionMm: null,
              blockerColliderIds: Object.freeze([...new Set(agent.queryCapture.castColliderIds)]),
            }));
          }
          if (event.kind !== 'movement_volume_entered') continue;
          if (event.volumeKind === 'recovery') agent.recoveryVolumeEntries += 1;
          if (event.volumeKind === 'kill') agent.killVolumeEntries += 1;
          if (event.volumeKind === 'recovery' || event.volumeKind === 'kill') {
            const key = `${agent.definition.slot}:${event.volumeKind}`;
            if (!reportedUnsafeVolumeAgents.has(key)) {
              reportedUnsafeVolumeAgents.add(key);
              addIssue(
                issues,
                'AUTHORED_ROUTE_ENTERED_UNSAFE_VOLUME',
                scenario.id,
                agent.definition.slot,
                authorityTick,
                `Synthetic route entered ${event.volumeKind} volume ${event.colliderId} at`
                  + ` ${formatPoint(agent.state.player.feetPosition)}.`,
              );
            }
          }
        }
        for (const contact of agent.queryCapture.contacts) {
          if (Math.abs(contact.normalQ15.y) > 8_192) continue;
          agent.horizontalCollisionContacts += 1;
          agent.blockingColliderIds.add(contact.colliderId);
        }

        const overlap = world.overlapCapsule({
          feetPosition: agent.state.player.feetPosition,
          shape: currentShape(agent),
          solidLayers: SOLID_LAYERS,
        });
        addExternalOverlapMetrics(queryTotals, overlap);
        if (overlap.blockingColliderIds.length > 0) {
          agent.embedSamples += 1;
          const key = `${agent.definition.slot}:${overlap.blockingColliderIds.join(',')}`;
          if (!reportedEmbeds.has(key)) {
            reportedEmbeds.add(key);
            addIssue(
              issues,
              'CAPSULE_EMBED_SAMPLE',
              scenario.id,
              agent.definition.slot,
              authorityTick,
              `Blocking colliders: ${overlap.blockingColliderIds.join(', ')}.`,
            );
          }
        }

        agent.replayStateHashes.push(`${authorityTick}:${hashCanonicalMovementState(agent.state)}`);
        if (authorityTick % SAMPLE_STRIDE_TICKS === 0) agent.sampledFrameCount += 1;
        if (authorityTick > agent.definition.startDelayTicks) {
          advanceReachedWaypoints(agent, topology, authorityTick);
          updateSnagProgress(agent, topology, scenario, authorityTick, issues);
        }
      }

      if (authorityTick % SAMPLE_STRIDE_TICKS === 0) samplePairs(authorityTick);
      if (authorityTick % OCCUPANCY_STRIDE_TICKS === 0) {
        sampleOccupancy(agents, loaded, authorityTick, pendingTelemetry, peakPlayersByZone);
      }
      elapsedTicks = authorityTick;
      if (agents.every((agent) => (
        agent.stepIndex >= agent.definition.steps.length || agent.fatalError !== null
      ))) break;
    }

    if (elapsedTicks % SAMPLE_STRIDE_TICKS !== 0) samplePairs(elapsedTicks);
    if (elapsedTicks % OCCUPANCY_STRIDE_TICKS !== 0) {
      sampleOccupancy(agents, loaded, elapsedTicks, pendingTelemetry, peakPlayersByZone);
    }

    const syntheticResults = agents.map((agent) => agentResult(agent, topology));
    for (const result of syntheticResults) {
      if (!result.completed) {
        addIssue(
          issues,
          'ROUTE_TAPE_INCOMPLETE',
          scenario.id,
          result.slot,
          elapsedTicks,
          `Completed ${result.routeTapes.filter(({ completed }) => completed).length}`
            + ` of ${scenario.agents[result.slot].steps.length} authored route steps.`,
        );
      }
      for (const metric of result.routeMetrics) {
        if (metric.insideTargetBand) continue;
        addIssue(
          issues,
          'GOVERNING_TIMING_BAND_MISS',
          scenario.id,
          result.slot,
          result.completionTick,
          `${metric.metricId} measured ${metric.measuredMilliseconds ?? 'incomplete'} ms; target is`
            + ` ${metric.targetBandMilliseconds[0]}-${metric.targetBandMilliseconds[1]} ms.`,
        );
      }
    }

    for (const agent of agents) {
      for (const tape of agent.tapes) {
        const exitedAtTick = tape.exitedAtTick ?? elapsedTicks;
        if (exitedAtTick <= tape.enteredAtTick) continue;
        addTelemetry(pendingTelemetry, exitedAtTick, 'route_traversal', {
          actorSlot: agent.definition.slot,
          routeId: tape.linkId,
          direction: tape.direction,
          enteredAtTick: tape.enteredAtTick,
          exitedAtTick,
          outcome: tape.completed ? 'completed' : 'aborted',
          movementMode: tape.movementMode,
        });
      }
    }

    if (selection.selected) {
      addTelemetry(pendingTelemetry, elapsedTicks, 'spawn_result', {
        actorSlot: 0,
        spawnId: selection.selected.spawnId,
        spawnedAtTick: 0,
        observedUntilTick: elapsedTicks,
        outcome: 'alive_window',
        firstRouteChoiceAtTick: agents[0].tapes[0]?.exitedAtTick ?? null,
        firstContactAtTick: firstCloseContactAtTick,
        damageTakenPoints: 25,
      });
    }

    const observer = agents[0];
    const subject = agents[1];
    const observerZone = zoneForPosition(loaded, observer.initialPosition);
    const subjectZone = zoneForPosition(loaded, subject.initialPosition);
    if (observerZone && subjectZone) {
      addTelemetry(pendingTelemetry, elapsedTicks, 'sightline_exposure', {
        observerActorSlot: observer.definition.slot,
        subjectActorSlot: subject.definition.slot,
        observerZoneId: observerZone,
        subjectZoneId: subjectZone,
        observerFeetPositionMm: { ...observer.initialPosition },
        subjectFeetPositionMm: { ...subject.initialPosition },
        observerStance: 'standing',
        subjectStance: 'standing',
        exposureTicks: Math.max(1, Math.min(1_200, elapsedTicks)),
      });
      addTelemetry(pendingTelemetry, elapsedTicks, 'damage_location', {
        sourceActorSlot: observer.definition.slot,
        targetActorSlot: subject.definition.slot,
        zoneId: subjectZone,
        positionMm: { ...subject.initialPosition },
        damagePoints: 25,
        causeClass: 'weapon_direct',
      });
      addTelemetry(pendingTelemetry, elapsedTicks, 'death_location', {
        victimActorSlot: subject.definition.slot,
        killerActorSlot: observer.definition.slot,
        zoneId: subjectZone,
        positionMm: { ...subject.initialPosition },
        causeClass: 'weapon_direct',
        assistCount: 0,
        respawnEligibleAtTick: elapsedTicks + 60,
      });
    }

    const standingShape = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape;
    const volumeProbeShape = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.crouchedShape;
    const recoveryOnly = world.volumesAtCapsule({
      feetPosition: movementPoint({ x: 0, y: -4_000, z: 0 }),
      shape: volumeProbeShape,
    });
    addExternalVolumeMetrics(queryTotals, recoveryOnly);
    const killAndRecovery = world.volumesAtCapsule({
      feetPosition: movementPoint({ x: 0, y: -4_800, z: 0 }),
      shape: volumeProbeShape,
    });
    addExternalVolumeMetrics(queryTotals, killAndRecovery);
    const escapePosition = selection.selected?.feetPositionMm ?? agents[0].initialPosition;
    const escapeVolumes = world.volumesAtCapsule({
      feetPosition: movementPoint(escapePosition),
      shape: standingShape,
    });
    addExternalVolumeMetrics(queryTotals, escapeVolumes);
    const escapeOverlap = world.overlapCapsule({
      feetPosition: movementPoint(escapePosition),
      shape: standingShape,
      solidLayers: SOLID_LAYERS,
    });
    addExternalOverlapMetrics(queryTotals, escapeOverlap);
    const recoveryProbePassed = recoveryOnly.volumes.some(({ kind }) => kind === 'recovery')
      && recoveryOnly.volumes.every(({ kind }) => kind !== 'kill');
    const killPriorityProbePassed = killAndRecovery.volumes[0]?.kind === 'kill'
      && killAndRecovery.volumes.some(({ kind }) => kind === 'recovery');
    const postRecoveryEscapePassed = escapeVolumes.volumes.length === 0
      && escapeOverlap.blockingColliderIds.length === 0;
    if (!recoveryProbePassed || !killPriorityProbePassed || !postRecoveryEscapePassed) {
      addIssue(
        issues,
        'RECOVERY_KILL_ESCAPE_PROBE_FAILED',
        scenario.id,
        null,
        elapsedTicks,
        `recovery=${recoveryProbePassed}; killPriority=${killPriorityProbePassed};`
          + ` postRecoveryEscape=${postRecoveryEscapePassed}.`,
      );
    }
    for (const [volumeId, positionMm, outcomes] of [
      ['lower_void_recovery', { x: 0, y: -3_750, z: 0 }, ['recovery_entered', 'recovery_completed']],
      ['lower_void_kill', { x: 0, y: -4_750, z: 0 }, ['kill_entered', 'killed']],
    ] as const) {
      for (const outcome of outcomes) {
        addTelemetry(pendingTelemetry, elapsedTicks, 'authority_volume', {
          actorSlot: 0,
          volumeId,
          positionMm: { ...positionMm },
          outcome,
        });
      }
    }

    pendingTelemetry.sort((left, right) => left.authorityTick - right.authorityTick
      || left.order - right.order);
    if (pendingTelemetry.length > 4_096) {
      addIssue(
        issues,
        'TELEMETRY_CAPACITY_EXCEEDED',
        scenario.id,
        null,
        elapsedTicks,
        `${pendingTelemetry.length} events exceeded the retained capacity of 4096.`,
      );
    }
    const telemetry = createInkfallAuthorityTelemetry(loaded, { retainedEventCapacity: 4_096 });
    const orderedTelemetryEvents = pendingTelemetry.map((event, index) => ({
      schemaVersion: 1,
      mapId: INKFALL_PLAYTEST_MAP_ID,
      mapRevision: binding.mapRevision,
      packageDigest: binding.packageDigest,
      fixtureHash: binding.fixtureHash,
      authorityRateHz: INKFALL_PLAYTEST_RATE_HZ,
      producer: 'authority_runtime',
      eventSequence: index + 1,
      authorityTick: event.authorityTick,
      kind: event.kind,
      payload: event.payload,
    }));
    for (const batch of chunkOrderedTelemetryEventsForAppend(orderedTelemetryEvents)) {
      telemetry.appendBatch(batch);
    }
    const telemetrySnapshot = telemetry.snapshot();

    const uniqueBlockingColliderIds = [...new Set(
      syntheticResults.flatMap(({ blockingColliderIds }) => blockingColliderIds),
    )].sort();
    const telemetryZoneIds = new Set<string>();
    for (const metric of telemetrySnapshot.occupancyZoneMetrics) telemetryZoneIds.add(metric.zoneId);
    for (const metric of telemetrySnapshot.combatZoneMetrics) telemetryZoneIds.add(metric.zoneId);
    for (const metric of telemetrySnapshot.exposureMetrics) {
      telemetryZoneIds.add(metric.observerZoneId);
      telemetryZoneIds.add(metric.subjectZoneId);
    }
    const queryMetrics: InkfallPlaytestQueryMetricsV1 = Object.freeze({ ...queryTotals });
    const scenarioReplayHash = fnv1a64(JSON.stringify({
      id: scenario.id,
      playerCount: scenario.playerCount,
      elapsedTicks,
      spawnDecisionHash: selection.decisionHash,
      agentReplayHashes: syntheticResults.map(({ replayHash }) => replayHash),
      telemetrySnapshotHash: telemetrySnapshot.snapshotHash,
      queryMetrics,
    }));
    return Object.freeze({
      id: scenario.id,
      playerCount: scenario.playerCount,
      classification: 'automated_synthetic_authority_playtest_not_human',
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      elapsedTicks,
      elapsedMilliseconds: elapsedTicks * INKFALL_PLAYTEST_TICK_MILLISECONDS,
      spawnProbe: probe,
      agents: Object.freeze(syntheticResults),
      occupancy: Object.freeze({
        sampledTicks: occupancySampledTicks,
        peakPlayersByZone: Object.freeze({ ...peakPlayersByZone }),
        minimumPairDistanceMm,
        closeContactSamples,
        bodyOverlapSamples,
      }),
      collision: Object.freeze({
        horizontalContacts: syntheticResults.reduce(
          (sum, agent) => sum + agent.horizontalCollisionContacts,
          0,
        ),
        uniqueBlockingColliderIds: Object.freeze(uniqueBlockingColliderIds),
        embedSamples: syntheticResults.reduce((sum, agent) => sum + agent.embedSamples, 0),
        snagEvents: syntheticResults.reduce((sum, agent) => sum + agent.snagEvents, 0),
      }),
      volumes: Object.freeze({
        recoveryEntries: syntheticResults.reduce((sum, agent) => sum + agent.recoveryVolumeEntries, 0),
        killEntries: syntheticResults.reduce((sum, agent) => sum + agent.killVolumeEntries, 0),
        recoveryProbePassed,
        killPriorityProbePassed,
        postRecoveryEscapePassed,
      }),
      telemetry: Object.freeze({
        eventCount: telemetrySnapshot.buffer.acceptedEvents,
        routeEvents: telemetrySnapshot.totalsByKind.route_traversal,
        occupancyEvents: telemetrySnapshot.totalsByKind.occupancy_sample,
        sightlineEvents: telemetrySnapshot.totalsByKind.sightline_exposure,
        damageEvents: telemetrySnapshot.totalsByKind.damage_location,
        deathEvents: telemetrySnapshot.totalsByKind.death_location,
        zoneCount: telemetryZoneIds.size,
        snapshotHash: telemetrySnapshot.snapshotHash,
        privacy: telemetrySnapshot.privacy,
      }),
      queryMetrics,
      replayHash: scenarioReplayHash,
      issues: Object.freeze([...issues]),
    });
  } finally {
    world.dispose();
  }
}

export function runInkfallAuthorityPlaytest(
  loaded: LoadedRuntimeMapPackage,
  definition: InkfallAuthorityPlaytestSuiteDefinitionV1,
  topologySource: unknown,
  savedSpawnFixtureSource: unknown,
): Promise<InkfallAuthorityPlaytestSuiteResultV1>;
export function runInkfallAuthorityPlaytest(
  loaded: LoadedRuntimeMapPackage,
  definition: InkfallAuthorityPlaytestSuiteDefinitionV2,
  topologySource: unknown,
  savedSpawnFixtureSource: unknown,
): Promise<InkfallAuthorityPlaytestSuiteResultV2>;
export async function runInkfallAuthorityPlaytest(
  loaded: LoadedRuntimeMapPackage,
  definition: InkfallAuthorityPlaytestSuiteDefinition,
  topologySource: unknown,
  savedSpawnFixtureSource: unknown,
): Promise<InkfallAuthorityPlaytestSuiteResult> {
  const binding = bindingForDefinition(definition);
  if (loaded.identity.id !== INKFALL_PLAYTEST_MAP_ID
    || loaded.identity.revision !== binding.mapRevision
    || loaded.identity.packageDigest !== binding.packageDigest
    || loaded.authority.fixtureHash !== binding.fixtureHash
    || loaded.authority.fixture.solids.length !== binding.colliderCardinality
    || loaded.manifest.authority.renderMeshesMayBeAuthority !== false) {
    throw new Error('P6_6_RUNTIME_MAP_IDENTITY_MISMATCH');
  }
  const topology = parseTopology(topologySource);
  const spawnFixtures = parseSavedSpawnFixtures(savedSpawnFixtureSource, binding);
  assertSuiteDefinition(definition, binding, topology, spawnFixtures);
  const scenarios: InkfallAuthorityPlaytestScenarioResultV1[] = [];
  for (const scenario of definition.scenarios) {
    const spawnFixture = spawnFixtures.get(scenario.spawnProbe.fixtureScenarioId);
    if (!spawnFixture) throw new Error(`P6_6_SPAWN_FIXTURE_MISSING ${scenario.id}`);
    scenarios.push(await runScenario(loaded, scenario, topology, spawnFixture, binding));
  }
  const issueCount = scenarios.reduce((sum, scenario) => sum + scenario.issues.length, 0);
  const source = {
    schemaVersion: binding.schemaVersion,
    status: binding.status,
    binding: {
      mapId: INKFALL_PLAYTEST_MAP_ID,
      mapRevision: binding.mapRevision,
      packageDigest: binding.packageDigest,
      fixtureHash: binding.fixtureHash,
      topologySeedSha256: INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256,
      movementProfileId: 'phase3_hypothesis_v1' as const,
      movementProfileRevision: 1 as const,
      physicsAdapterVersion: '0.19.3' as const,
    },
    units: {
      authorityRateHz: INKFALL_PLAYTEST_RATE_HZ,
      tickMilliseconds: INKFALL_PLAYTEST_TICK_MILLISECONDS,
      distance: 'integer_millimeters' as const,
      time: 'authority_ticks_and_integer_milliseconds' as const,
    },
    resourceBounds: {
      maximumScenarios: 3 as const,
      maximumAgentsPerScenario: 8 as const,
      maximumTicksPerScenario: 900 as const,
      maximumRouteStepsPerAgent: 16 as const,
      sampledFrameStrideTicks: SAMPLE_STRIDE_TICKS as 10,
      telemetryRetainedEventCapacity: 4_096 as const,
      maximumAuthorityQueryCallsPerAgentTick: MAX_QUERY_CALLS_PER_AGENT_TICK as 128,
    },
    scenarios: Object.freeze(scenarios),
    allAutomatedThresholdsPassed: issueCount === 0,
    issueCount,
    topologyRecommendation: issueCount === 0
      ? 'NO_AUTOMATED_CHANGE_JUSTIFIED' as const
      : 'REPORT_REQUIRED_BEFORE_PACKAGE_CHANGE' as const,
    nonClaims: Object.freeze([
      'SYNTHETIC_AGENTS_NOT_HUMAN_PLAYTESTERS',
      'HUMAN_FUN_AND_READABILITY_NOT_CLAIMED',
      'P6_7_TOPOLOGY_LOCK_NOT_CLAIMED',
      'FINAL_ART_NOT_CLAIMED',
      'G5_NOT_PASSED',
    ] as const),
  };
  return Object.freeze({
    ...source,
    suiteHash: fnv1a64(JSON.stringify(source)),
  }) as InkfallAuthorityPlaytestSuiteResult;
}
