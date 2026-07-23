import {
  INTENT_BUTTON,
  MAX_LOOK_DELTA_MILLI_DEGREES,
  MAX_SELECTABLE_SLOT,
  assertPlayerIntentCommand,
  type PlayerIntentCommand,
} from '../../sim/commands';
import {
  AUTHORITY_RATE_HZ,
  AUTHORITY_TICK_DURATION_MS,
  QUANTIZED_AXIS_LIMIT,
  asQuantizedAxis,
  asSimulationTick,
} from '../../sim/units';

export const MOVEMENT_COMMAND_RATE_HZ = AUTHORITY_RATE_HZ;
export const MOVEMENT_COMMAND_DURATION_MS = AUTHORITY_TICK_DURATION_MS;
export const MOVEMENT_BUTTON_BITS = INTENT_BUTTON;
export const DEFAULT_LOOK_MILLI_DEGREES_PER_MOUSE_UNIT = 100 as const;
export const MAX_LOOK_MILLI_DEGREES_PER_MOUSE_UNIT =
  MAX_LOOK_DELTA_MILLI_DEGREES;

const UINT32_MAX = 0xffff_ffff;

const MOVEMENT_DIRECTION_ACTIONS = Object.freeze([
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
] as const);

const MOVEMENT_BUTTON_ACTIONS = Object.freeze([
  'jump',
  'sprint',
  'crouch',
  'primaryFire',
  'secondaryFire',
  'abilityOne',
  'abilityTwo',
  'utility',
  'reload',
  'melee',
] as const);

export type MovementDirectionAction = (typeof MOVEMENT_DIRECTION_ACTIONS)[number];
export type MovementButtonAction = (typeof MOVEMENT_BUTTON_ACTIONS)[number];
export type MovementInputAction = MovementDirectionAction | MovementButtonAction;

export interface BrowserMovementInputSample {
  /** Complete held-action snapshot for this render sample, when available. */
  readonly held?: readonly MovementInputAction[];
  /** Edge events observed since the previous render sample. */
  readonly pressed?: readonly MovementInputAction[];
  readonly released?: readonly MovementInputAction[];
  readonly mouseDeltaX?: number;
  readonly mouseDeltaY?: number;
  readonly wheelDeltaY?: number;
}

export interface FixedTickInputLatchOptions {
  /** Primitive adapter conversion only; never a camera settings object. */
  readonly lookMilliDegreesPerMouseUnit?: number;
  readonly invertY?: boolean;
  readonly initialSequence?: number;
  readonly initialClientTick?: number;
  readonly initialSelectedSlot?: number;
}

export interface FixedTickInputLatchResetOptions {
  readonly initialSequence?: number;
  readonly initialClientTick?: number;
  readonly initialSelectedSlot?: number;
}

interface NormalizedInputSample {
  readonly heldProvided: boolean;
  readonly held: readonly MovementInputAction[];
  readonly pressed: readonly MovementInputAction[];
  readonly released: readonly MovementInputAction[];
  readonly mouseDeltaX: number;
  readonly mouseDeltaY: number;
  readonly wheelDeltaY: number;
}

const SAMPLE_KEYS = new Set<string>([
  'held',
  'pressed',
  'released',
  'mouseDeltaX',
  'mouseDeltaY',
  'wheelDeltaY',
]);
const INPUT_ACTIONS = new Set<string>([
  ...MOVEMENT_DIRECTION_ACTIONS,
  ...MOVEMENT_BUTTON_ACTIONS,
]);
const BUTTON_ACTIONS = new Set<string>(MOVEMENT_BUTTON_ACTIONS);

function assertUnsigned32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
}

function assertSelectedSlot(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SELECTABLE_SLOT) {
    throw new RangeError(`selected slot must be between 0 and ${MAX_SELECTABLE_SLOT}`);
  }
}

function isMovementButtonAction(
  action: MovementInputAction,
): action is MovementButtonAction {
  return BUTTON_ACTIONS.has(action);
}

function readActionArray(
  value: unknown,
  label: string,
): readonly MovementInputAction[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array of movement actions`);
  }

  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
  } catch {
    throw new TypeError(`${label} could not be inspected safely`);
  }
  if (prototype !== Array.prototype) {
    throw new TypeError(`${label} must be a plain array of movement actions`);
  }

  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > INPUT_ACTIONS.size
  ) {
    throw new RangeError(`${label} has an invalid action array length`);
  }
  const length = lengthDescriptor.value as number;
  const allowedKeys = new Set<string>([
    'length',
    ...Array.from({ length }, (_unused, index) => String(index)),
  ]);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new RangeError(`${label} cannot contain symbol fields`);
    }
    if (!allowedKeys.has(key)) {
      throw new RangeError(`${label} contains an unsupported array field: ${key}`);
    }
  }

  const seen = new Set<string>();
  const actions: MovementInputAction[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor)
    ) {
      throw new TypeError(
        `${label} must be a dense array of enumerable data fields`,
      );
    }
    const action = descriptor.value as unknown;
    if (typeof action !== 'string' || !INPUT_ACTIONS.has(action)) {
      throw new RangeError(`${label} contains an unsupported movement action`);
    }
    if (seen.has(action)) {
      throw new RangeError(`${label} contains a duplicate movement action: ${action}`);
    }
    seen.add(action);
    actions.push(action as MovementInputAction);
  }
  return Object.freeze(actions);
}

function readFiniteDelta(value: unknown, label: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function normalizeSample(sample: BrowserMovementInputSample): NormalizedInputSample {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new TypeError('browser movement input sample must be a plain object');
  }

  const prototype = Object.getPrototypeOf(sample);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('browser movement input sample must be a plain object');
  }

  const descriptors = Object.getOwnPropertyDescriptors(sample);
  for (const key of Reflect.ownKeys(sample)) {
    if (typeof key !== 'string') {
      throw new RangeError('browser movement input sample cannot contain symbol fields');
    }
    if (!SAMPLE_KEYS.has(key)) {
      throw new RangeError(`browser movement input sample contains unsupported field: ${key}`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor)
    ) {
      throw new TypeError(`browser movement input sample contains unsafe field: ${key}`);
    }
  }

  const heldValue = descriptors.held?.value as unknown;
  return Object.freeze({
    heldProvided: descriptors.held !== undefined && heldValue !== undefined,
    held: readActionArray(heldValue, 'held'),
    pressed: readActionArray(descriptors.pressed?.value, 'pressed'),
    released: readActionArray(descriptors.released?.value, 'released'),
    mouseDeltaX: readFiniteDelta(descriptors.mouseDeltaX?.value, 'mouseDeltaX'),
    mouseDeltaY: readFiniteDelta(descriptors.mouseDeltaY?.value, 'mouseDeltaY'),
    wheelDeltaY: readFiniteDelta(descriptors.wheelDeltaY?.value, 'wheelDeltaY'),
  });
}

function clampLookDelta(value: number): number {
  return Math.min(
    MAX_LOOK_DELTA_MILLI_DEGREES,
    Math.max(-MAX_LOOK_DELTA_MILLI_DEGREES, value),
  );
}

function roundHalfAwayFromZero(value: number): number {
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function maskForHeldButtons(heldActions: ReadonlySet<MovementInputAction>): number {
  let mask = 0;
  for (const action of MOVEMENT_BUTTON_ACTIONS) {
    if (heldActions.has(action)) mask |= MOVEMENT_BUTTON_BITS[action];
  }
  return mask >>> 0;
}

function parseStreamState(options: FixedTickInputLatchResetOptions): {
  readonly sequence: number;
  readonly clientTick: number;
  readonly selectedSlot: number;
} {
  const sequence = options.initialSequence ?? 0;
  const clientTick = options.initialClientTick ?? 0;
  const selectedSlot = options.initialSelectedSlot ?? 0;
  assertUnsigned32(sequence, 'initial sequence');
  assertUnsigned32(clientTick, 'initial client tick');
  assertSelectedSlot(selectedSlot);
  return { sequence, clientTick, selectedSlot };
}

/**
 * Latches render-frame browser input until it can be consumed as one strict
 * 20 Hz authority command. It owns no camera or presentation state.
 */
export class FixedTickInputLatch {
  private readonly lookMilliDegreesPerMouseUnit: number;
  private readonly invertY: boolean;
  private heldActions = new Set<MovementInputAction>();
  private pendingPressedButtons = 0;
  private pendingReleasedButtons = 0;
  private pendingLookYaw = 0;
  private pendingLookPitch = 0;
  private pendingSelectedSlot = false;
  private selectedSlot = 0;
  private lastEmittedHeldButtons = 0;
  private nextSequence = 0;
  private nextClientTick = 0;

  public constructor(options: FixedTickInputLatchOptions = {}) {
    const lookScale =
      options.lookMilliDegreesPerMouseUnit ??
      DEFAULT_LOOK_MILLI_DEGREES_PER_MOUSE_UNIT;
    if (
      typeof lookScale !== 'number' ||
      !Number.isFinite(lookScale) ||
      lookScale < 0 ||
      lookScale > MAX_LOOK_MILLI_DEGREES_PER_MOUSE_UNIT
    ) {
      throw new RangeError(
        `look scale must be between 0 and ${MAX_LOOK_MILLI_DEGREES_PER_MOUSE_UNIT}`,
      );
    }
    if (options.invertY !== undefined && typeof options.invertY !== 'boolean') {
      throw new TypeError('invertY must be a boolean');
    }
    this.lookMilliDegreesPerMouseUnit = lookScale;
    this.invertY = options.invertY ?? false;

    const stream = parseStreamState(options);
    this.nextSequence = stream.sequence;
    this.nextClientTick = stream.clientTick;
    this.selectedSlot = stream.selectedSlot;
  }

  public sample(sample: BrowserMovementInputSample): void {
    const normalized = normalizeSample(sample);

    if (normalized.heldProvided) {
      const nextHeld = new Set(normalized.held);
      for (const action of MOVEMENT_BUTTON_ACTIONS) {
        const wasHeld = this.heldActions.has(action);
        const isHeld = nextHeld.has(action);
        if (isHeld && !wasHeld) {
          this.pendingPressedButtons |= MOVEMENT_BUTTON_BITS[action];
        } else if (!isHeld && wasHeld) {
          this.pendingReleasedButtons |= MOVEMENT_BUTTON_BITS[action];
        }
      }
      this.heldActions = nextHeld;
    }

    for (const action of normalized.pressed) {
      if (this.heldActions.has(action)) continue;
      this.heldActions.add(action);
      if (isMovementButtonAction(action)) {
        this.pendingPressedButtons |= MOVEMENT_BUTTON_BITS[action];
      }
    }

    for (const action of normalized.released) {
      if (!this.heldActions.has(action)) continue;
      this.heldActions.delete(action);
      if (isMovementButtonAction(action)) {
        this.pendingReleasedButtons |= MOVEMENT_BUTTON_BITS[action];
      }
    }

    this.pendingLookYaw = clampLookDelta(
      this.pendingLookYaw +
        normalized.mouseDeltaX * this.lookMilliDegreesPerMouseUnit,
    );
    const pitchDirection = this.invertY ? 1 : -1;
    this.pendingLookPitch = clampLookDelta(
      this.pendingLookPitch +
        normalized.mouseDeltaY * this.lookMilliDegreesPerMouseUnit * pitchDirection,
    );

    if (normalized.wheelDeltaY !== 0) {
      const slotCount = MAX_SELECTABLE_SLOT + 1;
      const step = normalized.wheelDeltaY > 0 ? 1 : -1;
      this.selectedSlot = (this.selectedSlot + step + slotCount) % slotCount;
      this.pendingSelectedSlot = true;
    }
  }

  public emitNextCommand(): Readonly<PlayerIntentCommand> {
    assertUnsigned32(this.nextSequence, 'next sequence');
    assertUnsigned32(this.nextClientTick, 'next client tick');

    const horizontal =
      Number(this.heldActions.has('moveRight')) -
      Number(this.heldActions.has('moveLeft'));
    const forward =
      Number(this.heldActions.has('moveForward')) -
      Number(this.heldActions.has('moveBackward'));
    const heldButtons = maskForHeldButtons(this.heldActions);

    const baseCommand: PlayerIntentCommand = {
      kind: 'player_intent',
      sequence: this.nextSequence,
      clientTick: asSimulationTick(this.nextClientTick),
      moveX: asQuantizedAxis(horizontal * QUANTIZED_AXIS_LIMIT),
      moveZ: asQuantizedAxis(forward * QUANTIZED_AXIS_LIMIT),
      lookYawDeltaMilliDegrees: roundHalfAwayFromZero(this.pendingLookYaw),
      lookPitchDeltaMilliDegrees: roundHalfAwayFromZero(this.pendingLookPitch),
      heldButtons,
      pressedButtons: this.pendingPressedButtons >>> 0,
      releasedButtons: this.pendingReleasedButtons >>> 0,
    };
    const command: PlayerIntentCommand = this.pendingSelectedSlot
      ? { ...baseCommand, selectedSlot: this.selectedSlot }
      : baseCommand;
    assertPlayerIntentCommand(command);

    this.pendingPressedButtons = 0;
    this.pendingReleasedButtons = 0;
    this.pendingLookYaw = 0;
    this.pendingLookPitch = 0;
    this.pendingSelectedSlot = false;
    this.lastEmittedHeldButtons = heldButtons;
    this.nextSequence += 1;
    this.nextClientTick += 1;

    return Object.freeze(command);
  }

  /**
   * Clears local input and emits releases only for buttons already exposed to
   * simulation. This is suitable for blur, pointer-lock loss, and pause.
   */
  public neutralize(): void {
    this.heldActions.clear();
    this.pendingPressedButtons = 0;
    this.pendingReleasedButtons = this.lastEmittedHeldButtons;
    this.pendingLookYaw = 0;
    this.pendingLookPitch = 0;
    this.pendingSelectedSlot = false;
  }

  /** Starts a new command stream without synthesizing release edges. */
  public reset(options: FixedTickInputLatchResetOptions = {}): void {
    const stream = parseStreamState(options);
    this.heldActions.clear();
    this.pendingPressedButtons = 0;
    this.pendingReleasedButtons = 0;
    this.pendingLookYaw = 0;
    this.pendingLookPitch = 0;
    this.pendingSelectedSlot = false;
    this.lastEmittedHeldButtons = 0;
    this.nextSequence = stream.sequence;
    this.nextClientTick = stream.clientTick;
    this.selectedSlot = stream.selectedSlot;
  }
}
