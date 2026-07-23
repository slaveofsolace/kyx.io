import {
  DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
  createDevelopmentLocalMovementBridge,
  type BrowserMovementInputSample,
  type DevelopmentLocalMovementBridge,
  type DevelopmentLocalMovementBridgeSnapshot,
  type MovementInputAction,
} from '../app/movement';
import {
  createRapierMovementWorld,
  getPhysicsFixture,
  type RapierMovementWorld,
} from '../physics';
import {
  AUTHORITY_RATE_HZ,
  INTENT_BUTTON,
  MAX_LOOK_DELTA_MILLI_DEGREES,
  MOVEMENT_PITCH_MAX_MILLI_DEGREES,
  MOVEMENT_PITCH_MIN_MILLI_DEGREES,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  createMovementSimulationState,
  type MovementSimulationState,
} from '../sim';

export const DEVELOPMENT_FLAT_RUN_DRIVER_QUERY = 'movementDriver=flat_run' as const;
export const DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_PROPERTY =
  '__KYX_DEV_FLAT_RUN_MOVEMENT__' as const;
export const DEVELOPMENT_FLAT_RUN_MARKER =
  'HYPOTHESIS · FLAT_RUN · DEV ONLY' as const;
export const DEVELOPMENT_MOVEMENT_TIMING_POLICY_ID =
  'hypothesis_bounded_backlog_2000ms_max8ticks_v1' as const;
export const DEVELOPMENT_MOVEMENT_MAX_BACKLOG_MILLISECONDS = 2_000 as const;
export const DEVELOPMENT_MOVEMENT_MAX_TICKS_PER_RENDER_SAMPLE = 8 as const;
export const DEVELOPMENT_MOVEMENT_VISUALIZATION_BOUNDARY =
  'development_flat_run_visualization_only_v1' as const;
export const DEVELOPMENT_MOVEMENT_VISUALIZATION_DISCLOSURE =
  'MOVEMENT FIXTURE · COMBAT / AI / PICKUPS / MODE TIMER PAUSED' as const;

const DIAGNOSTICS_SCHEMA_VERSION = 1 as const;
const MILLIMETERS_PER_RENDER_UNIT = 1_000;
const LOOK_MILLI_DEGREES_PER_MOUSE_UNIT = 138;
const FULL_TURN_MILLI_DEGREES = 360_000;
const PLAYER_YAW_CONVENTION_OFFSET_MILLI_DEGREES = 180_000;

const REARM_REQUIRED_ACTIONS = Object.freeze([
  'jump',
  'crouch',
  'primaryFire',
  'secondaryFire',
  'abilityOne',
  'abilityTwo',
  'utility',
  'reload',
  'melee',
] as const satisfies readonly MovementInputAction[]);

type DriverStatus =
  | 'initializing'
  | 'ready'
  | 'running'
  | 'neutralized'
  | 'error'
  | 'disposed';

interface Vector3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}

interface DevelopmentDriverInput {
  readonly mouseDown: boolean;
  readonly rightMouseDown: boolean;
  readonly mouseDX: number;
  readonly mouseDY: number;
  readonly wheelDelta: number;
  readonly justPressed?: ReadonlySet<string>;
  readonly justReleased?: ReadonlySet<string>;
  readonly mouseJustPressed?: boolean;
  readonly mouseJustReleased?: boolean;
  readonly rightMouseJustPressed?: boolean;
  readonly rightMouseJustReleased?: boolean;
  isDown(code: string): boolean;
}

interface MovementPresentationInput {
  readonly wheelDelta: number;
  readonly yawRadians: number;
  readonly pitchRadians: number;
}

interface DevelopmentDriverPlayer {
  readonly position: Vector3Like;
  readonly velocity: Vector3Like;
  readonly camera: { readonly position: Vector3Like };
  yaw: number;
  pitch: number;
  onGround: boolean;
  isCrouching: boolean;
  isSliding: boolean;
  isSprinting: boolean;
  teleportCooldown: number;
  invertY: boolean;
  sensitivityMult: number;
  readonly audio: {
    playJump(): void;
    playLand(hard: boolean): void;
  } | null;
  readonly onTeleport: (() => void) | null;
  updateDrivenPresentation(
    elapsedSeconds: number,
    input: MovementPresentationInput,
  ): void;
  resetDrivenPresentation(): void;
}

export interface DevelopmentMovementDriverUpdateOptions {
  readonly elapsedMilliseconds: number;
  readonly presentationElapsedSeconds: number;
  readonly input: DevelopmentDriverInput;
  readonly player: DevelopmentDriverPlayer;
}

export interface DevelopmentMovementDriverResetOptions {
  readonly player: DevelopmentDriverPlayer;
  readonly spawnPosition: Readonly<{ x: number; y: number; z: number }>;
}

export interface DevelopmentFlatRunMovementDriver {
  readonly capability: Readonly<{
    readonly boundary: typeof DEVELOPMENT_MOVEMENT_VISUALIZATION_BOUNDARY;
    readonly legacyGameplayPolicy: 'pause';
  }>;
  attach(options: { readonly player: DevelopmentDriverPlayer }): void;
  update(options: DevelopmentMovementDriverUpdateOptions): void;
  reset(options: DevelopmentMovementDriverResetOptions): void;
  neutralize(): void;
  dispose(): void;
}

interface DevelopmentFlatRunDiagnostics {
  readonly schemaVersion: typeof DIAGNOSTICS_SCHEMA_VERSION;
  readonly label: typeof DEVELOPMENT_FLAT_RUN_MARKER;
  readonly productStatus: 'NON_PRODUCT_FIXTURE_AUTHORITY';
  readonly coordinateAdapter: 'threejs_reflect_x_v1';
  readonly status: DriverStatus;
  readonly worldDisposed: boolean;
  readonly authorityRateHz: typeof AUTHORITY_RATE_HZ;
  readonly timing: DevelopmentMovementTimingDiagnostics;
  readonly fixture: {
    readonly id: 'flat_run';
    readonly hash: string;
    readonly physicsAdapterVersion: string;
  };
  readonly authority: {
    readonly tick: number;
    readonly stateHash: string;
    readonly feetPositionMm: Readonly<{ x: number; y: number; z: number }>;
    readonly velocityMmPerSecond: Readonly<{ x: number; y: number; z: number }>;
    readonly stance: MovementSimulationState['player']['stance'];
    readonly locomotion: MovementSimulationState['player']['locomotion'];
    readonly grounded: boolean;
    readonly yawMilliDegrees: number;
    readonly pitchMilliDegrees: number;
  };
  readonly render: {
    readonly interpolationAlphaPermille: number;
    readonly position: Readonly<{ x: number; y: number; z: number }>;
    readonly stance: MovementSimulationState['player']['stance'];
    readonly teleportSnapActive: boolean;
  };
  readonly presentation: {
    readonly yawRadians: number;
    readonly pitchRadians: number;
    readonly pendingYawMilliDegrees: number;
    readonly pendingPitchMilliDegrees: number;
  };
  readonly sample: {
    readonly ticksStepped: number;
    readonly totalTicksStepped: number;
    readonly pendingWholeTicks: number;
    readonly consumedSemanticEvents: number;
    readonly latestSemanticEventKinds: readonly string[];
    readonly semanticEventCounts: Readonly<Record<string, number>>;
  };
  readonly error: string | null;
}

interface CreateDevelopmentFlatRunMovementDriverOptions {
  readonly boundary: typeof DEVELOPMENT_FLAT_RUN_DRIVER_QUERY;
  readonly canvas: HTMLCanvasElement;
  readonly body: HTMLBodyElement;
}

function freezeJson<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  const result = finite(value, label);
  if (result < 0) throw new RangeError(`${label} must be non-negative`);
  return result;
}

export interface DevelopmentMovementTimingAdmission {
  readonly observedMilliseconds: number;
  readonly admittedMilliseconds: number;
  readonly droppedMilliseconds: number;
  readonly accumulatorBeforeMilliseconds: number;
}

export interface DevelopmentMovementTimingDiagnostics {
  readonly policyId: typeof DEVELOPMENT_MOVEMENT_TIMING_POLICY_ID;
  readonly backlogCapMilliseconds:
    typeof DEVELOPMENT_MOVEMENT_MAX_BACKLOG_MILLISECONDS;
  readonly maximumTicksPerRenderSample:
    typeof DEVELOPMENT_MOVEMENT_MAX_TICKS_PER_RENDER_SAMPLE;
  readonly observedMillisecondsTotal: number;
  readonly admittedMillisecondsTotal: number;
  readonly droppedMillisecondsTotal: number;
  readonly overloadSamples: number;
  readonly lastObservedMilliseconds: number;
  readonly lastAdmittedMilliseconds: number;
  readonly lastDroppedMilliseconds: number;
  readonly currentBacklogMilliseconds: number;
}

export class DevelopmentMovementElapsedPolicy {
  private observedMillisecondsTotal = 0;
  private admittedMillisecondsTotal = 0;
  private droppedMillisecondsTotal = 0;
  private overloadSamples = 0;
  private lastObservedMilliseconds = 0;
  private lastAdmittedMilliseconds = 0;
  private lastDroppedMilliseconds = 0;

  public admit(
    rawElapsedMilliseconds: number,
    accumulatorMilliseconds: number,
  ): Readonly<DevelopmentMovementTimingAdmission> {
    const observedMilliseconds = nonNegativeFinite(
      rawElapsedMilliseconds,
      'movement raw elapsedMilliseconds',
    );
    const accumulatorBeforeMilliseconds = nonNegativeFinite(
      accumulatorMilliseconds,
      'movement accumulatorMilliseconds',
    );
    if (
      accumulatorBeforeMilliseconds
      > DEVELOPMENT_MOVEMENT_MAX_BACKLOG_MILLISECONDS
    ) {
      throw new RangeError(
        `movement accumulatorMilliseconds cannot exceed ${DEVELOPMENT_MOVEMENT_MAX_BACKLOG_MILLISECONDS}`,
      );
    }
    const availableMilliseconds =
      DEVELOPMENT_MOVEMENT_MAX_BACKLOG_MILLISECONDS
      - accumulatorBeforeMilliseconds;
    const admittedMilliseconds = Math.min(
      observedMilliseconds,
      availableMilliseconds,
    );
    const droppedMilliseconds = observedMilliseconds - admittedMilliseconds;

    this.observedMillisecondsTotal += observedMilliseconds;
    this.admittedMillisecondsTotal += admittedMilliseconds;
    this.droppedMillisecondsTotal += droppedMilliseconds;
    if (droppedMilliseconds > 0) this.overloadSamples += 1;
    this.lastObservedMilliseconds = observedMilliseconds;
    this.lastAdmittedMilliseconds = admittedMilliseconds;
    this.lastDroppedMilliseconds = droppedMilliseconds;

    return Object.freeze({
      observedMilliseconds,
      admittedMilliseconds,
      droppedMilliseconds,
      accumulatorBeforeMilliseconds,
    });
  }

  public reset(): void {
    this.observedMillisecondsTotal = 0;
    this.admittedMillisecondsTotal = 0;
    this.droppedMillisecondsTotal = 0;
    this.overloadSamples = 0;
    this.lastObservedMilliseconds = 0;
    this.lastAdmittedMilliseconds = 0;
    this.lastDroppedMilliseconds = 0;
  }

  public diagnostics(
    currentBacklogMilliseconds: number,
  ): Readonly<DevelopmentMovementTimingDiagnostics> {
    const backlog = nonNegativeFinite(
      currentBacklogMilliseconds,
      'movement currentBacklogMilliseconds',
    );
    return Object.freeze({
      policyId: DEVELOPMENT_MOVEMENT_TIMING_POLICY_ID,
      backlogCapMilliseconds: DEVELOPMENT_MOVEMENT_MAX_BACKLOG_MILLISECONDS,
      maximumTicksPerRenderSample:
        DEVELOPMENT_MOVEMENT_MAX_TICKS_PER_RENDER_SAMPLE,
      observedMillisecondsTotal: this.observedMillisecondsTotal,
      admittedMillisecondsTotal: this.admittedMillisecondsTotal,
      droppedMillisecondsTotal: this.droppedMillisecondsTotal,
      overloadSamples: this.overloadSamples,
      lastObservedMilliseconds: this.lastObservedMilliseconds,
      lastAdmittedMilliseconds: this.lastAdmittedMilliseconds,
      lastDroppedMilliseconds: this.lastDroppedMilliseconds,
      currentBacklogMilliseconds: backlog,
    });
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeYaw(value: number): number {
  return ((value % FULL_TURN_MILLI_DEGREES) + FULL_TURN_MILLI_DEGREES)
    % FULL_TURN_MILLI_DEGREES;
}

function milliDegreesToRadians(value: number): number {
  return (value * Math.PI) / 180_000;
}

export interface DevelopmentPresentationOrientation {
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly pendingYawMilliDegrees: number;
  readonly pendingPitchMilliDegrees: number;
}

export class DevelopmentMovementOrientation {
  private pendingYawMilliDegrees = 0;
  private pendingPitchMilliDegrees = 0;
  private authorityYawMilliDegrees = 0;
  private authorityPitchMilliDegrees = 0;

  public reset(
    authorityYawMilliDegrees: number,
    authorityPitchMilliDegrees: number,
  ): DevelopmentPresentationOrientation {
    this.pendingYawMilliDegrees = 0;
    this.pendingPitchMilliDegrees = 0;
    this.authorityYawMilliDegrees = authorityYawMilliDegrees;
    this.authorityPitchMilliDegrees = authorityPitchMilliDegrees;
    return this.current();
  }

  public sample(
    mouseDeltaX: number,
    mouseDeltaY: number,
    sensitivityMultiplier: number,
    invertY: boolean,
  ): Readonly<{ mouseDeltaX: number; mouseDeltaY: number }> {
    const sensitivity = finite(sensitivityMultiplier, 'sensitivityMultiplier');
    const transformedX = finite(mouseDeltaX, 'mouseDX') * sensitivity;
    const transformedY = finite(mouseDeltaY, 'mouseDY')
      * sensitivity
      * (invertY ? -1 : 1);
    this.pendingYawMilliDegrees = clamp(
      this.pendingYawMilliDegrees
        + transformedX * LOOK_MILLI_DEGREES_PER_MOUSE_UNIT,
      -MAX_LOOK_DELTA_MILLI_DEGREES,
      MAX_LOOK_DELTA_MILLI_DEGREES,
    );
    this.pendingPitchMilliDegrees = clamp(
      this.pendingPitchMilliDegrees
        - transformedY * LOOK_MILLI_DEGREES_PER_MOUSE_UNIT,
      -MAX_LOOK_DELTA_MILLI_DEGREES,
      MAX_LOOK_DELTA_MILLI_DEGREES,
    );
    return Object.freeze({
      mouseDeltaX: transformedX,
      mouseDeltaY: transformedY,
    });
  }

  public reconcile(
    authorityYawMilliDegrees: number,
    authorityPitchMilliDegrees: number,
    ticksStepped: number,
  ): DevelopmentPresentationOrientation {
    this.authorityYawMilliDegrees = authorityYawMilliDegrees;
    this.authorityPitchMilliDegrees = authorityPitchMilliDegrees;
    if (ticksStepped > 0) {
      this.pendingYawMilliDegrees = 0;
      this.pendingPitchMilliDegrees = 0;
    }
    return this.current();
  }

  public current(): DevelopmentPresentationOrientation {
    const playerYawMilliDegrees = normalizeYaw(
      PLAYER_YAW_CONVENTION_OFFSET_MILLI_DEGREES
        - this.authorityYawMilliDegrees
        - this.pendingYawMilliDegrees,
    );
    const pitchMilliDegrees = clamp(
      this.authorityPitchMilliDegrees + this.pendingPitchMilliDegrees,
      MOVEMENT_PITCH_MIN_MILLI_DEGREES,
      MOVEMENT_PITCH_MAX_MILLI_DEGREES,
    );
    return Object.freeze({
      yawRadians: milliDegreesToRadians(playerYawMilliDegrees),
      pitchRadians: milliDegreesToRadians(pitchMilliDegrees),
      pendingYawMilliDegrees: this.pendingYawMilliDegrees,
      pendingPitchMilliDegrees: this.pendingPitchMilliDegrees,
    });
  }
}

export function reflectAuthorityPositionForThree(
  renderOrigin: Readonly<{ x: number; y: number; z: number }>,
  feetPositionMm: Readonly<{ x: number; y: number; z: number }>,
): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({
    x: renderOrigin.x - feetPositionMm.x / MILLIMETERS_PER_RENDER_UNIT,
    y: renderOrigin.y + feetPositionMm.y / MILLIMETERS_PER_RENDER_UNIT,
    z: renderOrigin.z + feetPositionMm.z / MILLIMETERS_PER_RENDER_UNIT,
  });
}

export function reflectAuthorityVelocityForThree(
  velocityMmPerSecond: Readonly<{ x: number; y: number; z: number }>,
): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({
    x: -velocityMmPerSecond.x / MILLIMETERS_PER_RENDER_UNIT,
    y: velocityMmPerSecond.y / MILLIMETERS_PER_RENDER_UNIT,
    z: velocityMmPerSecond.z / MILLIMETERS_PER_RENDER_UNIT,
  });
}

export class DevelopmentMovementInputRearmPolicy {
  private readonly blocked = new Set<MovementInputAction>();

  public constructor() {
    this.reset();
  }

  public reset(): void {
    this.blocked.clear();
    for (const action of REARM_REQUIRED_ACTIONS) this.blocked.add(action);
  }

  public filter(held: readonly MovementInputAction[]): readonly MovementInputAction[] {
    return this.filterSample({ held }).held;
  }

  public filterSample(sample: Readonly<{
    held: readonly MovementInputAction[];
    pressed?: readonly MovementInputAction[];
    released?: readonly MovementInputAction[];
  }>): Readonly<{
    held: readonly MovementInputAction[];
    pressed: readonly MovementInputAction[];
    released: readonly MovementInputAction[];
  }> {
    const heldSet = new Set(sample.held);
    const pressedSet = new Set(sample.pressed ?? []);
    const blockedAtSampleStart = new Set(this.blocked);
    for (const action of REARM_REQUIRED_ACTIONS) {
      if (!heldSet.has(action) && !pressedSet.has(action)) {
        this.blocked.delete(action);
      }
    }
    const allow = (action: MovementInputAction): boolean =>
      !blockedAtSampleStart.has(action);
    return Object.freeze({
      held: Object.freeze(sample.held.filter(allow)),
      pressed: Object.freeze((sample.pressed ?? []).filter(allow)),
      released: Object.freeze((sample.released ?? []).filter(allow)),
    });
  }
}

export class DevelopmentTeleportInterpolationPolicy {
  private snapActive = false;

  public reset(): void {
    this.snapActive = false;
  }

  public selectAlpha(options: {
    readonly interpolationAlphaPermille: number;
    readonly ticksStepped: number;
    readonly teleported: boolean;
  }): number {
    if (options.teleported) {
      this.snapActive = true;
    } else if (options.ticksStepped > 0) {
      this.snapActive = false;
    }
    return this.snapActive ? 1 : options.interpolationAlphaPermille / 1_000;
  }

  public get active(): boolean {
    return this.snapActive;
  }
}

const KEY_ACTION_BINDINGS = Object.freeze([
  ['moveForward', ['KeyW']],
  ['moveBackward', ['KeyS']],
  ['moveLeft', ['KeyA']],
  ['moveRight', ['KeyD']],
  ['jump', ['Space']],
  ['sprint', ['ShiftLeft', 'ShiftRight']],
  ['crouch', ['ControlLeft', 'ControlRight', 'KeyC']],
  ['abilityOne', ['KeyE']],
  ['abilityTwo', ['KeyF']],
  ['utility', ['KeyQ']],
  ['reload', ['KeyR']],
  ['melee', ['KeyV']],
] as const satisfies readonly (readonly [MovementInputAction, readonly string[]])[]);

function keyEdgeActions(
  keys: ReadonlySet<string> | undefined,
): MovementInputAction[] {
  if (keys === undefined) return [];
  const actions: MovementInputAction[] = [];
  for (const [action, codes] of KEY_ACTION_BINDINGS) {
    if (codes.some((code) => keys.has(code))) actions.push(action);
  }
  return actions;
}

export function createDevelopmentMovementInputSample(
  input: DevelopmentDriverInput,
  transformedLook: Readonly<{ mouseDeltaX: number; mouseDeltaY: number }>,
  rearmPolicy: DevelopmentMovementInputRearmPolicy,
): BrowserMovementInputSample {
  const held: MovementInputAction[] = [];
  const add = (condition: boolean, action: MovementInputAction): void => {
    if (condition) held.push(action);
  };

  add(input.isDown('KeyW'), 'moveForward');
  add(input.isDown('KeyS'), 'moveBackward');
  add(input.isDown('KeyA'), 'moveLeft');
  add(input.isDown('KeyD'), 'moveRight');
  add(input.isDown('Space'), 'jump');
  add(input.isDown('ShiftLeft') || input.isDown('ShiftRight'), 'sprint');
  add(
    input.isDown('ControlLeft')
      || input.isDown('ControlRight')
      || input.isDown('KeyC'),
    'crouch',
  );
  add(input.mouseDown, 'primaryFire');
  add(input.rightMouseDown, 'secondaryFire');
  add(input.isDown('KeyE'), 'abilityOne');
  add(input.isDown('KeyF'), 'abilityTwo');
  add(input.isDown('KeyQ'), 'utility');
  add(input.isDown('KeyR'), 'reload');
  add(input.isDown('KeyV'), 'melee');

  const pressed = keyEdgeActions(input.justPressed);
  const released = keyEdgeActions(input.justReleased);
  if (input.mouseJustPressed) pressed.push('primaryFire');
  if (input.mouseJustReleased) released.push('primaryFire');
  if (input.rightMouseJustPressed) pressed.push('secondaryFire');
  if (input.rightMouseJustReleased) released.push('secondaryFire');
  const filtered = rearmPolicy.filterSample({ held, pressed, released });

  return {
    held: filtered.held,
    pressed: filtered.pressed,
    released: filtered.released,
    mouseDeltaX: transformedLook.mouseDeltaX,
    mouseDeltaY: transformedLook.mouseDeltaY,
    wheelDeltaY: finite(input.wheelDelta, 'wheelDelta'),
  };
}

function presentationInput(
  input: DevelopmentDriverInput,
  orientation: DevelopmentPresentationOrientation,
): MovementPresentationInput {
  return {
    wheelDelta: finite(input.wheelDelta, 'wheelDelta'),
    yawRadians: orientation.yawRadians,
    pitchRadians: orientation.pitchRadians,
  };
}

function interpolate(left: number, right: number, alpha: number): number {
  return left + (right - left) * alpha;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class FlatRunDriver implements DevelopmentFlatRunMovementDriver {
  public readonly capability = Object.freeze({
    boundary: DEVELOPMENT_MOVEMENT_VISUALIZATION_BOUNDARY,
    legacyGameplayPolicy: 'pause' as const,
  });
  private readonly canvas: HTMLCanvasElement;
  private readonly body: HTMLBodyElement;
  private readonly marker: HTMLElement;
  private readonly world: RapierMovementWorld;
  private readonly initialStateFactory: () => MovementSimulationState;
  private readonly bridge: DevelopmentLocalMovementBridge;
  private readonly orientation = new DevelopmentMovementOrientation();
  private readonly rearmPolicy = new DevelopmentMovementInputRearmPolicy();
  private readonly elapsedPolicy = new DevelopmentMovementElapsedPolicy();
  private readonly teleportInterpolation =
    new DevelopmentTeleportInterpolationPolicy();
  private readonly renderOrigin = { x: 0, y: 0, z: 0 };
  private latestDiagnostics: Readonly<DevelopmentFlatRunDiagnostics>;
  private player: DevelopmentDriverPlayer | null = null;
  private status: DriverStatus = 'initializing';
  private fault: string | null = null;
  private disposed = false;
  private consumedSemanticEvents = 0;
  private latestSemanticEventKinds: readonly string[] = Object.freeze([]);
  private semanticEventCounts: Record<string, number> = {};
  private readonly diagnosticsGetter = (): Readonly<DevelopmentFlatRunDiagnostics> =>
    this.latestDiagnostics;

  public constructor(
    options: CreateDevelopmentFlatRunMovementDriverOptions,
    world: RapierMovementWorld,
  ) {
    this.canvas = options.canvas;
    this.body = options.body;
    this.world = world;
    this.initialStateFactory = () => createMovementSimulationState(
      PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      {
        rulesetId: 'development_flat_run_bridge',
        rulesetRevision: 1,
        rulesetHash: 'acbd18db4cc2f85c',
        fixtureId: world.fixture.id,
        fixtureHash: world.fixtureHash,
        physicsAdapterId: 'rapier3d_deterministic_compat',
        physicsAdapterVersion: world.runtime.version,
        feetPosition: world.fixture.spawn.feetPositionMm,
        yawMilliDegrees: world.fixture.spawn.yawMilliDegrees,
      },
    );
    this.bridge = createDevelopmentLocalMovementBridge({
      boundary: DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
      initialState: this.initialStateFactory(),
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: world,
      input: {
        lookMilliDegreesPerMouseUnit: LOOK_MILLI_DEGREES_PER_MOUSE_UNIT,
      },
      maximumTicksPerRenderSample:
        DEVELOPMENT_MOVEMENT_MAX_TICKS_PER_RENDER_SAMPLE,
    });
    this.marker = this.createMarker();
    this.latestDiagnostics = this.makeDiagnostics(this.bridge.getSnapshot());
    try {
      this.installReadOnlyDiagnostics(this.canvas);
      this.installReadOnlyDiagnostics(this.body);
    } catch (error) {
      this.uninstallReadOnlyDiagnostics(this.canvas);
      this.uninstallReadOnlyDiagnostics(this.body);
      this.marker.remove();
      throw error;
    }
    this.status = 'ready';
    this.publish(this.bridge.getSnapshot());
  }

  public attach(options: { readonly player: DevelopmentDriverPlayer }): void {
    this.assertActive();
    this.player = options.player;
    options.player.resetDrivenPresentation();
    this.setRenderOrigin(options.player.position);
    const snapshot = this.bridge.getSnapshot();
    const authority = snapshot.currentAuthorityState.player;
    const orientation = this.orientation.reset(
      authority.yawMilliDegrees,
      authority.pitchMilliDegrees,
    );
    this.rearmPolicy.reset();
    this.elapsedPolicy.reset();
    this.teleportInterpolation.reset();
    this.applyAuthorityPose(options.player, snapshot);
    this.applyPresentationOrientation(options.player, orientation);
    this.status = 'ready';
    this.publish(snapshot);
  }

  public update(options: DevelopmentMovementDriverUpdateOptions): void {
    this.assertActive();
    this.player = options.player;
    let snapshot = this.bridge.getSnapshot();
    try {
      const transformedLook = this.orientation.sample(
        options.input.mouseDX,
        options.input.mouseDY,
        options.player.sensitivityMult,
        options.player.invertY,
      );
      const admission = this.elapsedPolicy.admit(
        options.elapsedMilliseconds,
        snapshot.accumulatorMilliseconds,
      );
      snapshot = this.bridge.advanceRenderSample({
        elapsedMilliseconds: admission.admittedMilliseconds,
        input: createDevelopmentMovementInputSample(
          options.input,
          transformedLook,
          this.rearmPolicy,
        ),
      });

      const teleported = snapshot.events.some(
        (event) => event.kind === 'teleport_succeeded',
      );
      const interpolationAlpha = this.teleportInterpolation.selectAlpha({
        interpolationAlphaPermille: snapshot.interpolationAlphaPermille,
        ticksStepped: snapshot.ticksStepped,
        teleported,
      });
      this.applyAuthorityPose(options.player, snapshot, interpolationAlpha);
      this.consumeSemanticEvents(options.player, snapshot);
      const authority = snapshot.currentAuthorityState.player;
      const orientation = this.orientation.reconcile(
        authority.yawMilliDegrees,
        authority.pitchMilliDegrees,
        snapshot.ticksStepped,
      );
      options.player.updateDrivenPresentation(
        nonNegativeFinite(
          options.presentationElapsedSeconds,
          'movement presentationElapsedSeconds',
        ),
        presentationInput(options.input, orientation),
      );
      this.status = 'running';
      this.publish(snapshot);
    } catch (error) {
      this.status = 'error';
      this.fault = errorMessage(error);
      this.publish(snapshot);
      throw error;
    }
  }

  public reset(options: DevelopmentMovementDriverResetOptions): void {
    this.assertActive();
    this.player = options.player;
    options.player.resetDrivenPresentation();
    const snapshot = this.bridge.reinitialize({
      initialState: this.initialStateFactory(),
    });
    this.setRenderOrigin(options.spawnPosition);
    const authority = snapshot.currentAuthorityState.player;
    const orientation = this.orientation.reset(
      authority.yawMilliDegrees,
      authority.pitchMilliDegrees,
    );
    this.rearmPolicy.reset();
    this.elapsedPolicy.reset();
    this.teleportInterpolation.reset();
    this.applyAuthorityPose(
      options.player,
      snapshot,
      snapshot.interpolationAlphaPermille / 1_000,
    );
    this.applyPresentationOrientation(options.player, orientation);
    this.status = 'ready';
    this.fault = null;
    this.consumedSemanticEvents = 0;
    this.latestSemanticEventKinds = Object.freeze([]);
    this.semanticEventCounts = {};
    this.publish(snapshot);
  }

  public neutralize(): void {
    if (this.disposed) return;
    this.bridge.neutralizeInput();
    this.rearmPolicy.reset();
    const authority = this.bridge.getSnapshot().currentAuthorityState.player;
    const orientation = this.orientation.reset(
      authority.yawMilliDegrees,
      authority.pitchMilliDegrees,
    );
    if (this.player !== null) {
      this.applyPresentationOrientation(this.player, orientation);
    }
    this.status = 'neutralized';
    this.publish(this.bridge.getSnapshot());
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bridge.neutralizeInput();
    this.world.dispose();
    this.status = 'disposed';
    this.latestDiagnostics = this.makeDiagnostics(this.bridge.getSnapshot());
    this.marker.remove();
    this.uninstallReadOnlyDiagnostics(this.canvas);
    this.uninstallReadOnlyDiagnostics(this.body);
    delete this.canvas.dataset.kyxDevMovement;
    delete this.body.dataset.kyxDevMovement;
    delete this.body.dataset.movementDriver;
    delete this.body.dataset.movementDriverStatus;
    this.player = null;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('DEVELOPMENT_FLAT_RUN_DRIVER_DISPOSED');
    if (this.fault !== null) {
      throw new Error('DEVELOPMENT_FLAT_RUN_DRIVER_FAULTED', {
        cause: new Error(this.fault),
      });
    }
  }

  private setRenderOrigin(spawnPosition: Readonly<{ x: number; y: number; z: number }>): void {
    const fixtureSpawn = this.world.fixture.spawn.feetPositionMm;
    this.renderOrigin.x = finite(spawnPosition.x, 'spawnPosition.x')
      + fixtureSpawn.x / MILLIMETERS_PER_RENDER_UNIT;
    this.renderOrigin.y = finite(spawnPosition.y, 'spawnPosition.y')
      - fixtureSpawn.y / MILLIMETERS_PER_RENDER_UNIT;
    this.renderOrigin.z = finite(spawnPosition.z, 'spawnPosition.z')
      - fixtureSpawn.z / MILLIMETERS_PER_RENDER_UNIT;
  }

  private applyAuthorityPose(
    player: DevelopmentDriverPlayer,
    snapshot: DevelopmentLocalMovementBridgeSnapshot,
    interpolationAlpha = snapshot.interpolationAlphaPermille / 1_000,
  ): void {
    const previous = snapshot.previousAuthorityState.player;
    const current = snapshot.currentAuthorityState.player;
    const alpha = interpolationAlpha;
    const interpolatedFeetPosition = {
      x: interpolate(
      previous.feetPosition.x,
      current.feetPosition.x,
      alpha,
      ),
      y: interpolate(
        previous.feetPosition.y,
        current.feetPosition.y,
        alpha,
      ),
      z: interpolate(
        previous.feetPosition.z,
        current.feetPosition.z,
        alpha,
      ),
    };
    const target = reflectAuthorityPositionForThree(
      this.renderOrigin,
      interpolatedFeetPosition,
    );
    const targetX = target.x;
    const targetY = target.y;
    const targetZ = target.z;
    const correctionX = targetX - player.position.x;
    const correctionY = targetY - player.position.y;
    const correctionZ = targetZ - player.position.z;

    player.position.set(targetX, targetY, targetZ);
    const velocity = reflectAuthorityVelocityForThree(current.velocity);
    player.velocity.set(velocity.x, velocity.y, velocity.z);
    player.camera.position.set(
      player.camera.position.x + correctionX,
      player.camera.position.y + correctionY,
      player.camera.position.z + correctionZ,
    );
    player.onGround = current.grounded;
    player.isCrouching = current.stance === 'crouched';
    player.isSliding = current.locomotion === 'sliding';
    player.isSprinting = (
      (current.intent.heldButtons & INTENT_BUTTON.sprint) !== 0
      && (current.intent.moveX !== 0 || current.intent.moveZ !== 0)
    );
    player.teleportCooldown =
      current.teleportCooldownTicksRemaining / AUTHORITY_RATE_HZ;
  }

  private applyPresentationOrientation(
    player: DevelopmentDriverPlayer,
    orientation: DevelopmentPresentationOrientation,
  ): void {
    player.updateDrivenPresentation(0, {
      wheelDelta: 0,
      yawRadians: orientation.yawRadians,
      pitchRadians: orientation.pitchRadians,
    });
  }

  private consumeSemanticEvents(
    player: DevelopmentDriverPlayer,
    snapshot: DevelopmentLocalMovementBridgeSnapshot,
  ): void {
    this.consumedSemanticEvents += snapshot.events.length;
    this.latestSemanticEventKinds = Object.freeze(
      snapshot.events.map((event) => event.kind),
    );
    for (const event of snapshot.events) {
      this.semanticEventCounts[event.kind] =
        (this.semanticEventCounts[event.kind] ?? 0) + 1;
      if (event.kind === 'jumped') {
        player.audio?.playJump();
      } else if (event.kind === 'landed') {
        player.audio?.playLand(event.impactSpeedMmPerSecond > 12_000);
      } else if (event.kind === 'teleport_succeeded') {
        player.onTeleport?.();
      }
    }
  }

  private createMarker(): HTMLElement {
    const marker = document.createElement('aside');
    marker.id = 'dev-flat-run-movement-marker';
    marker.textContent = [
      DEVELOPMENT_FLAT_RUN_MARKER,
      DEVELOPMENT_MOVEMENT_VISUALIZATION_DISCLOSURE,
    ].join('\n');
    marker.setAttribute('role', 'status');
    marker.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'top:14px',
      'left:14px',
      'padding:10px 13px',
      'border:2px solid #ffb000',
      'background:rgba(26,15,0,.94)',
      'color:#ffd166',
      'font:900 12px/1 ui-monospace,monospace',
      'letter-spacing:.12em',
      'pointer-events:none',
      'text-transform:uppercase',
      'white-space:pre-line',
      'box-shadow:0 0 24px rgba(255,176,0,.28)',
    ].join(';');
    this.body.append(marker);
    return marker;
  }

  private installReadOnlyDiagnostics(target: HTMLCanvasElement | HTMLBodyElement): void {
    if (Object.prototype.hasOwnProperty.call(
      target,
      DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_PROPERTY,
    )) {
      throw new Error('DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_ALREADY_INSTALLED');
    }
    Object.defineProperty(target, DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_PROPERTY, {
      configurable: true,
      enumerable: false,
      get: this.diagnosticsGetter,
    });
  }

  private uninstallReadOnlyDiagnostics(
    target: HTMLCanvasElement | HTMLBodyElement,
  ): void {
    const descriptor = Object.getOwnPropertyDescriptor(
      target,
      DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_PROPERTY,
    );
    if (descriptor?.get === this.diagnosticsGetter) {
      delete (target as unknown as Record<string, unknown>)[
        DEVELOPMENT_FLAT_RUN_DIAGNOSTICS_PROPERTY
      ];
    }
  }

  private publish(snapshot: DevelopmentLocalMovementBridgeSnapshot): void {
    this.latestDiagnostics = this.makeDiagnostics(snapshot);
    const serialized = JSON.stringify(this.latestDiagnostics);
    this.canvas.dataset.kyxDevMovement = serialized;
    this.body.dataset.kyxDevMovement = serialized;
    this.body.dataset.movementDriver = 'flat_run';
    this.body.dataset.movementDriverStatus = this.status;
    this.marker.dataset.status = this.status;
  }

  private makeDiagnostics(
    snapshot: DevelopmentLocalMovementBridgeSnapshot,
  ): Readonly<DevelopmentFlatRunDiagnostics> {
    const current = snapshot.currentAuthorityState.player;
    const player = this.player;
    const orientation = this.orientation.current();
    return freezeJson({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      label: DEVELOPMENT_FLAT_RUN_MARKER,
      productStatus: 'NON_PRODUCT_FIXTURE_AUTHORITY',
      coordinateAdapter: 'threejs_reflect_x_v1',
      status: this.status,
      worldDisposed: this.world.disposed,
      authorityRateHz: AUTHORITY_RATE_HZ,
      timing: this.elapsedPolicy.diagnostics(snapshot.accumulatorMilliseconds),
      fixture: {
        id: 'flat_run',
        hash: this.world.fixtureHash,
        physicsAdapterVersion: this.world.runtime.version,
      },
      authority: {
        tick: snapshot.authorityTick,
        stateHash: snapshot.currentStateHash,
        feetPositionMm: { ...current.feetPosition },
        velocityMmPerSecond: { ...current.velocity },
        stance: current.stance,
        locomotion: current.locomotion,
        grounded: current.grounded,
        yawMilliDegrees: current.yawMilliDegrees,
        pitchMilliDegrees: current.pitchMilliDegrees,
      },
      render: {
        interpolationAlphaPermille: snapshot.interpolationAlphaPermille,
        position: {
          x: player?.position.x ?? this.renderOrigin.x,
          y: player?.position.y ?? this.renderOrigin.y,
          z: player?.position.z ?? this.renderOrigin.z,
        },
        stance: current.stance,
        teleportSnapActive: this.teleportInterpolation.active,
      },
      presentation: {
        yawRadians: player?.yaw ?? 0,
        pitchRadians: player?.pitch ?? 0,
        pendingYawMilliDegrees: orientation.pendingYawMilliDegrees,
        pendingPitchMilliDegrees: orientation.pendingPitchMilliDegrees,
      },
      sample: {
        ticksStepped: snapshot.ticksStepped,
        totalTicksStepped: snapshot.totalTicksStepped,
        pendingWholeTicks: snapshot.pendingWholeTicks,
        consumedSemanticEvents: this.consumedSemanticEvents,
        latestSemanticEventKinds: [...this.latestSemanticEventKinds],
        semanticEventCounts: { ...this.semanticEventCounts },
      },
      error: this.fault,
    });
  }
}

export async function createDevelopmentFlatRunMovementDriver(
  options: CreateDevelopmentFlatRunMovementDriverOptions,
): Promise<DevelopmentFlatRunMovementDriver> {
  if (!import.meta.env.DEV) {
    throw new Error('DEVELOPMENT_FLAT_RUN_DRIVER_REQUIRES_DEV');
  }
  if (options.boundary !== DEVELOPMENT_FLAT_RUN_DRIVER_QUERY) {
    throw new Error('DEVELOPMENT_FLAT_RUN_DRIVER_REQUIRES_EXACT_QUERY_BOUNDARY');
  }
  const fixture = getPhysicsFixture('flat_run');
  const world = await createRapierMovementWorld(fixture);
  try {
    return new FlatRunDriver(options, world);
  } catch (error) {
    world.dispose();
    throw error;
  }
}
