import { describe, expect, it, vi } from 'vitest';

import { Game, updatePlayerMovementFrame } from '../../../../src/core/Game.js';
import { InputManager } from '../../../../src/core/InputManager.js';
import {
  DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
  FixedTickInputLatch,
  MOVEMENT_BUTTON_BITS,
  createDevelopmentLocalMovementBridge,
} from '../../../../src/app/movement';
import {
  DEVELOPMENT_MOVEMENT_MAX_TICKS_PER_RENDER_SAMPLE,
  DevelopmentMovementElapsedPolicy,
  DevelopmentMovementInputRearmPolicy,
  DevelopmentMovementOrientation,
  DevelopmentTeleportInterpolationPolicy,
  createDevelopmentMovementInputSample,
  reflectAuthorityPositionForThree,
  reflectAuthorityVelocityForThree,
} from '../../../../src/dev/developmentFlatRunMovementDriver';
import { Player } from '../../../../src/player/Player.js';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
} from '../../sim/movement/fakeQueryPort';

const MILLI_DEGREES_TO_RADIANS = Math.PI / 180_000;

function playerYawRadians(authorityYawMilliDegrees: number): number {
  const playerYawMilliDegrees = (
    (180_000 - authorityYawMilliDegrees) % 360_000 + 360_000
  ) % 360_000;
  return playerYawMilliDegrees * MILLI_DEGREES_TO_RADIANS;
}

describe('development flat_run presentation orientation', () => {
  it('initializes presentation from authority with the Three.js yaw convention', () => {
    const orientation = new DevelopmentMovementOrientation();

    const initial = orientation.reset(0, 0);
    expect(initial).toMatchObject({
      pitchRadians: 0,
      pendingYawMilliDegrees: 0,
      pendingPitchMilliDegrees: 0,
    });
    expect(initial.yawRadians).toBeCloseTo(Math.PI, 12);
    const rotated = orientation.reset(90_000, -20_000);
    expect(rotated.yawRadians).toBeCloseTo(0.5 * Math.PI, 12);
    expect(rotated.pitchRadians).toBeCloseTo(
      -20_000 * MILLI_DEGREES_TO_RADIANS,
      12,
    );
  });

  it('reflects simulation X so camera forward/right and movement share one handedness', () => {
    const orientation = new DevelopmentMovementOrientation();
    const yawZero = orientation.reset(0, 0).yawRadians;
    const cameraForward = (yaw: number): readonly [number, number] => [
      -Math.sin(yaw),
      -Math.cos(yaw),
    ];
    const cameraRight = (yaw: number): readonly [number, number] => [
      Math.cos(yaw),
      -Math.sin(yaw),
    ];
    const dot = (
      left: readonly [number, number],
      right: readonly [number, number],
    ): number => left[0] * right[0] + left[1] * right[1];

    expect(cameraForward(yawZero)[0]).toBeCloseTo(0, 12);
    expect(cameraForward(yawZero)[1]).toBeCloseTo(1, 12);
    const movedRight = reflectAuthorityPositionForThree(
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
    );
    expect(dot([movedRight.x, movedRight.z], cameraRight(yawZero))).toBeCloseTo(1, 12);

    const yawNinety = orientation.reset(90_000, 0).yawRadians;
    expect(cameraForward(yawNinety)[0]).toBeCloseTo(-1, 12);
    expect(cameraForward(yawNinety)[1]).toBeCloseTo(0, 12);
    expect(reflectAuthorityVelocityForThree({ x: 1_000, y: 0, z: 0 })).toEqual({
      x: -1,
      y: 0,
      z: 0,
    });

    orientation.reset(0, 0);
    orientation.sample(10, 0, 1, false);
    const mouseRightForward = cameraForward(
      orientation.reconcile(0, 0, 0).yawRadians,
    );
    expect(dot(mouseRightForward, cameraRight(yawZero))).toBeGreaterThan(0);
  });

  it('presents sub-tick look immediately without changing authority', () => {
    const orientation = new DevelopmentMovementOrientation();
    orientation.reset(0, 0);

    expect(orientation.sample(10, -5, 1, false)).toEqual({
      mouseDeltaX: 10,
      mouseDeltaY: -5,
    });
    const immediate = orientation.reconcile(0, 0, 0);

    expect(immediate.pendingYawMilliDegrees).toBe(1_380);
    expect(immediate.pendingPitchMilliDegrees).toBe(690);
    expect(immediate.yawRadians).toBeCloseTo(
      playerYawRadians(1_380),
      12,
    );
    expect(immediate.pitchRadians).toBeCloseTo(
      690 * MILLI_DEGREES_TO_RADIANS,
      12,
    );
  });

  it('reconciles a consumed tick without applying the same look twice', () => {
    const orientation = new DevelopmentMovementOrientation();
    orientation.reset(0, 0);
    orientation.sample(10, -5, 1, false);

    const reconciled = orientation.reconcile(1_380, 690, 1);

    expect(reconciled.pendingYawMilliDegrees).toBe(0);
    expect(reconciled.pendingPitchMilliDegrees).toBe(0);
    expect(reconciled.yawRadians).toBeCloseTo(
      playerYawRadians(1_380),
      12,
    );
    expect(reconciled.yawRadians).not.toBeCloseTo(
      playerYawRadians(2_760),
      6,
    );
    expect(reconciled.pitchRadians).toBeCloseTo(
      690 * MILLI_DEGREES_TO_RADIANS,
      12,
    );
  });

  it('stays exactly reconciled over a long fixed-tick run', () => {
    const orientation = new DevelopmentMovementOrientation();
    orientation.reset(0, 0);
    let authorityYaw = 0;
    let authorityPitch = 0;

    for (let tick = 0; tick < 2_000; tick += 1) {
      const mouseX = tick % 2 === 0 ? 1 : -0.5;
      const mouseY = tick % 3 === 0 ? -0.25 : 0.125;
      orientation.sample(mouseX, mouseY, 1, false);
      authorityYaw = (
        authorityYaw + Math.round(mouseX * 138) + 360_000
      ) % 360_000;
      authorityPitch = Math.max(
        -89_000,
        Math.min(89_000, authorityPitch + Math.round(-mouseY * 138)),
      );
      const reconciled = orientation.reconcile(
        authorityYaw,
        authorityPitch,
        1,
      );

      expect(reconciled.pendingYawMilliDegrees).toBe(0);
      expect(reconciled.pendingPitchMilliDegrees).toBe(0);
      expect(reconciled.yawRadians).toBeCloseTo(
        playerYawRadians(authorityYaw),
        12,
      );
      expect(reconciled.pitchRadians).toBeCloseTo(
        authorityPitch * MILLI_DEGREES_TO_RADIANS,
        12,
      );
    }
  });
});

describe('development teleport interpolation', () => {
  it('snaps across teleport and resumes interpolation only after the next tick', () => {
    const policy = new DevelopmentTeleportInterpolationPolicy();

    expect(policy.selectAlpha({
      interpolationAlphaPermille: 250,
      ticksStepped: 1,
      teleported: false,
    })).toBe(0.25);
    expect(policy.selectAlpha({
      interpolationAlphaPermille: 0,
      ticksStepped: 1,
      teleported: true,
    })).toBe(1);
    expect(policy.active).toBe(true);
    expect(policy.selectAlpha({
      interpolationAlphaPermille: 700,
      ticksStepped: 0,
      teleported: false,
    })).toBe(1);
    expect(policy.selectAlpha({
      interpolationAlphaPermille: 100,
      ticksStepped: 1,
      teleported: false,
    })).toBe(0.1);
    expect(policy.active).toBe(false);
  });
});

describe('development movement lifecycle input re-arm', () => {
  it('suppresses held one-shot actions until release while preserving direction and sprint', () => {
    const policy = new DevelopmentMovementInputRearmPolicy();
    const heldAcrossBoundary = [
      'moveForward',
      'sprint',
      'jump',
      'crouch',
      'utility',
    ] as const;

    expect(policy.filter(heldAcrossBoundary)).toEqual([
      'moveForward',
      'sprint',
    ]);
    expect(policy.filter(heldAcrossBoundary)).toEqual([
      'moveForward',
      'sprint',
    ]);

    expect(policy.filter(['moveForward', 'sprint'])).toEqual([
      'moveForward',
      'sprint',
    ]);
    expect(policy.filter(heldAcrossBoundary)).toEqual(heldAcrossBoundary);

    policy.reset();
    expect(policy.filter(heldAcrossBoundary)).toEqual([
      'moveForward',
      'sprint',
    ]);
  });

  it('prevents the fixed latch from synthesizing jump/crouch/teleport edges across neutralize', () => {
    const policy = new DevelopmentMovementInputRearmPolicy();
    const latch = new FixedTickInputLatch();
    const held = [
      'moveForward',
      'sprint',
      'jump',
      'crouch',
      'utility',
    ] as const;

    latch.sample({ held: policy.filter(held) });
    const initial = latch.emitNextCommand();
    expect(initial.moveZ).toBe(127);
    expect(initial.heldButtons).toBe(MOVEMENT_BUTTON_BITS.sprint);
    expect(initial.pressedButtons & MOVEMENT_BUTTON_BITS.jump).toBe(0);
    expect(initial.pressedButtons & MOVEMENT_BUTTON_BITS.crouch).toBe(0);
    expect(initial.pressedButtons & MOVEMENT_BUTTON_BITS.utility).toBe(0);

    latch.neutralize();
    policy.reset();
    latch.sample({ held: policy.filter(held) });
    const resumedWhileHeld = latch.emitNextCommand();
    expect(resumedWhileHeld.moveZ).toBe(127);
    expect(resumedWhileHeld.heldButtons).toBe(MOVEMENT_BUTTON_BITS.sprint);
    expect(resumedWhileHeld.pressedButtons & MOVEMENT_BUTTON_BITS.jump).toBe(0);
    expect(resumedWhileHeld.pressedButtons & MOVEMENT_BUTTON_BITS.crouch).toBe(0);
    expect(resumedWhileHeld.pressedButtons & MOVEMENT_BUTTON_BITS.utility).toBe(0);

    latch.sample({ held: policy.filter(['moveForward', 'sprint']) });
    latch.sample({ held: policy.filter(held) });
    const repressed = latch.emitNextCommand();
    expect(repressed.pressedButtons & MOVEMENT_BUTTON_BITS.jump).not.toBe(0);
    expect(repressed.pressedButtons & MOVEMENT_BUTTON_BITS.crouch).not.toBe(0);
    expect(repressed.pressedButtons & MOVEMENT_BUTTON_BITS.utility).not.toBe(0);
  });

  it('preserves an ordered press and release completed between render samples', () => {
    const policy = new DevelopmentMovementInputRearmPolicy();
    const latch = new FixedTickInputLatch();
    const input = {
      mouseDown: false,
      rightMouseDown: false,
      mouseDX: 0,
      mouseDY: 0,
      wheelDelta: 0,
      justPressed: new Set<string>(),
      justReleased: new Set<string>(),
      isDown: () => false,
    };

    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    input.justPressed.add('Space');
    input.justReleased.add('Space');
    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    const command = latch.emitNextCommand();

    expect(command.heldButtons & MOVEMENT_BUTTON_BITS.jump).toBe(0);
    expect(command.pressedButtons & MOVEMENT_BUTTON_BITS.jump).not.toBe(0);
    expect(command.releasedButtons & MOVEMENT_BUTTON_BITS.jump).not.toBe(0);
  });
});

describe('InputManager focus-loss release snapshot', () => {
  it('clears held keys/buttons on blur and lost lock without synthesizing resume input', () => {
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), {
      pointerLockElement: null as EventTarget | null,
      hidden: false,
      visibilityState: 'visible',
      exitPointerLock: vi.fn(),
    });
    const canvas = Object.assign(new EventTarget(), {
      requestPointerLock: vi.fn(),
    });
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('document', documentTarget);
    const input = new InputManager(canvas);
    const policy = new DevelopmentMovementInputRearmPolicy();
    const latch = new FixedTickInputLatch();
    const dispatch = (
      target: EventTarget,
      type: string,
      properties: Readonly<Record<string, unknown>>,
    ): void => {
      const event = new Event(type);
      for (const [key, value] of Object.entries(properties)) {
        Object.defineProperty(event, key, { value });
      }
      target.dispatchEvent(event);
    };

    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    latch.emitNextCommand();
    const focusLoss = vi.fn(() => {
      latch.neutralize();
      policy.reset();
    });
    input.onFocusLoss = focusLoss;

    documentTarget.pointerLockElement = canvas;
    documentTarget.dispatchEvent(new Event('pointerlockchange'));
    dispatch(windowTarget, 'keydown', { code: 'KeyW' });
    dispatch(windowTarget, 'keydown', { code: 'Space' });
    dispatch(windowTarget, 'mousedown', { button: 0 });
    input.mouseDX = 12;
    input.mouseDY = -8;
    input.wheelDelta = 1;
    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: input.mouseDX, mouseDeltaY: input.mouseDY },
      policy,
    ));
    windowTarget.dispatchEvent(new Event('blur'));

    expect(input.keys.size).toBe(0);
    expect(input.mouseDown).toBe(false);
    expect(input.justReleased).toEqual(new Set(['KeyW', 'Space']));
    expect(input.mouseJustReleased).toBe(true);
    expect(input.mouseDX).toBe(0);
    expect(input.mouseDY).toBe(0);
    expect(input.wheelDelta).toBe(0);

    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    let command = latch.emitNextCommand();
    expect(command.moveZ).toBe(0);
    expect(command.heldButtons).toBe(0);
    expect(command.pressedButtons).toBe(0);
    expect(command.releasedButtons).toBe(0);
    expect(command.lookYawDeltaMilliDegrees).toBe(0);
    expect(command.lookPitchDeltaMilliDegrees).toBe(0);
    input.endFrame();

    documentTarget.pointerLockElement = canvas;
    documentTarget.dispatchEvent(new Event('pointerlockchange'));
    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    command = latch.emitNextCommand();
    expect(command.moveZ).toBe(0);
    expect(command.heldButtons).toBe(0);
    expect(command.pressedButtons).toBe(0);

    dispatch(windowTarget, 'mousedown', { button: 0 });
    dispatch(windowTarget, 'mouseup', { button: 0 });
    dispatch(windowTarget, 'mousedown', { button: 2 });
    dispatch(windowTarget, 'mouseup', { button: 2 });
    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    command = latch.emitNextCommand();
    expect(command.heldButtons & MOVEMENT_BUTTON_BITS.primaryFire).toBe(0);
    expect(command.heldButtons & MOVEMENT_BUTTON_BITS.secondaryFire).toBe(0);
    expect(command.pressedButtons & MOVEMENT_BUTTON_BITS.primaryFire).not.toBe(0);
    expect(command.releasedButtons & MOVEMENT_BUTTON_BITS.primaryFire).not.toBe(0);
    expect(command.pressedButtons & MOVEMENT_BUTTON_BITS.secondaryFire).not.toBe(0);
    expect(command.releasedButtons & MOVEMENT_BUTTON_BITS.secondaryFire).not.toBe(0);
    input.endFrame();

    dispatch(windowTarget, 'keydown', { code: 'KeyW' });
    dispatch(windowTarget, 'keydown', { code: 'Space' });
    dispatch(windowTarget, 'mousedown', { button: 0 });
    documentTarget.pointerLockElement = null;
    documentTarget.dispatchEvent(new Event('pointerlockchange'));
    expect(input.keys.size).toBe(0);
    expect(input.mouseDown).toBe(false);

    dispatch(windowTarget, 'keydown', { code: 'KeyW' });
    dispatch(windowTarget, 'keydown', { code: 'Space' });
    dispatch(windowTarget, 'mousedown', { button: 0 });
    input.mouseDX = 3;
    input.mouseDY = 4;
    input.wheelDelta = -1;
    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: input.mouseDX, mouseDeltaY: input.mouseDY },
      policy,
    ));
    documentTarget.hidden = true;
    documentTarget.visibilityState = 'hidden';
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(input.keys.size).toBe(0);
    expect(input.mouseDown).toBe(false);
    expect(input.mouseDX).toBe(0);
    expect(input.mouseDY).toBe(0);
    expect(input.wheelDelta).toBe(0);
    input.endFrame();
    documentTarget.hidden = false;
    documentTarget.visibilityState = 'visible';
    latch.sample(createDevelopmentMovementInputSample(
      input,
      { mouseDeltaX: 0, mouseDeltaY: 0 },
      policy,
    ));
    command = latch.emitNextCommand();
    expect(command.moveZ).toBe(0);
    expect(command.heldButtons).toBe(0);
    expect(command.pressedButtons).toBe(0);
    expect(command.releasedButtons).toBe(0);
    expect(command.lookYawDeltaMilliDegrees).toBe(0);
    expect(command.lookPitchDeltaMilliDegrees).toBe(0);
    expect(focusLoss).toHaveBeenCalledTimes(2);

    input.dispose();
    input.keys.add('KeyW');
    windowTarget.dispatchEvent(new Event('blur'));
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(input.keys.has('KeyW')).toBe(true);
    vi.unstubAllGlobals();
  });
});

function createTimedBridge(
  maximumTicksPerRenderSample: number =
    DEVELOPMENT_MOVEMENT_MAX_TICKS_PER_RENDER_SAMPLE,
) {
  return createDevelopmentLocalMovementBridge({
    boundary: DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
    initialState: createTestMovementState(),
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    maximumTicksPerRenderSample,
  });
}

function runTimedSchedule(schedule: readonly number[]) {
  const bridge = createTimedBridge();
  const policy = new DevelopmentMovementElapsedPolicy();
  return schedule.map((rawElapsedMilliseconds) => {
    const before = bridge.getSnapshot();
    const admission = policy.admit(
      rawElapsedMilliseconds,
      before.accumulatorMilliseconds,
    );
    const snapshot = bridge.advanceRenderSample({
      elapsedMilliseconds: admission.admittedMilliseconds,
      input: { held: ['moveForward'] },
    });
    return {
      authorityTick: snapshot.authorityTick,
      previousAuthorityState: snapshot.previousAuthorityState,
      currentAuthorityState: snapshot.currentAuthorityState,
      currentStateHash: snapshot.currentStateHash,
      commands: snapshot.commands,
      events: snapshot.events,
    };
  });
}

describe('development movement elapsed policy', () => {
  it('advances a 250 ms raw frame by exactly five authority ticks', () => {
    const bridge = createTimedBridge();
    const policy = new DevelopmentMovementElapsedPolicy();
    const admission = policy.admit(250, bridge.getSnapshot().accumulatorMilliseconds);
    const snapshot = bridge.advanceRenderSample({
      elapsedMilliseconds: admission.admittedMilliseconds,
      input: { held: ['moveForward'] },
    });

    expect(snapshot.ticksStepped).toBe(5);
    expect(snapshot.authorityTick).toBe(5);
    expect(snapshot.accumulatorMilliseconds).toBe(0);
  });

  it('drains a one-second stall as 8, 8, and 4 ticks with zero backlog', () => {
    const bridge = createTimedBridge();
    const policy = new DevelopmentMovementElapsedPolicy();
    const ticks: number[] = [];
    for (const rawElapsedMilliseconds of [1_000, 0, 0]) {
      const admission = policy.admit(
        rawElapsedMilliseconds,
        bridge.getSnapshot().accumulatorMilliseconds,
      );
      const snapshot = bridge.advanceRenderSample({
        elapsedMilliseconds: admission.admittedMilliseconds,
        input: { held: ['moveForward'] },
      });
      ticks.push(snapshot.ticksStepped);
    }

    const final = bridge.getSnapshot();
    expect(ticks).toEqual([8, 8, 4]);
    expect(final.totalTicksStepped).toBe(20);
    expect(policy.diagnostics(final.accumulatorMilliseconds)).toMatchObject({
      policyId: 'hypothesis_bounded_backlog_2000ms_max8ticks_v1',
      currentBacklogMilliseconds: 0,
      observedMillisecondsTotal: 1_000,
      admittedMillisecondsTotal: 1_000,
      droppedMillisecondsTotal: 0,
    });
  });

  it('reports intentional overload drops above the bounded two-second backlog', () => {
    const bridge = createTimedBridge();
    const policy = new DevelopmentMovementElapsedPolicy();
    const admission = policy.admit(2_500, 0);
    let snapshot = bridge.advanceRenderSample({
      elapsedMilliseconds: admission.admittedMilliseconds,
    });
    while (snapshot.accumulatorMilliseconds >= 50) {
      snapshot = bridge.advanceRenderSample({ elapsedMilliseconds: 0 });
    }

    expect(snapshot.totalTicksStepped).toBe(40);
    expect(snapshot.accumulatorMilliseconds).toBe(0);
    expect(policy.diagnostics(snapshot.accumulatorMilliseconds)).toMatchObject({
      overloadSamples: 1,
      observedMillisecondsTotal: 2_500,
      admittedMillisecondsTotal: 2_000,
      droppedMillisecondsTotal: 500,
      lastDroppedMilliseconds: 500,
      currentBacklogMilliseconds: 0,
    });
  });

  it('rejects invalid elapsed values without mutating counters', () => {
    const policy = new DevelopmentMovementElapsedPolicy();

    expect(() => policy.admit(Number.NaN, 0)).toThrow(/finite/u);
    expect(() => policy.admit(-1, 0)).toThrow(/non-negative/u);
    expect(policy.diagnostics(0)).toMatchObject({
      observedMillisecondsTotal: 0,
      admittedMillisecondsTotal: 0,
      droppedMillisecondsTotal: 0,
      overloadSamples: 0,
    });
  });

  it('clears stale elapsed on reset and cannot retroactively advance it', () => {
    const bridge = createTimedBridge();
    const policy = new DevelopmentMovementElapsedPolicy();
    const admitted = policy.admit(1_000, 0);
    bridge.advanceRenderSample({ elapsedMilliseconds: admitted.admittedMilliseconds });

    bridge.reinitialize({ initialState: createTestMovementState() });
    policy.reset();
    const afterReset = bridge.advanceRenderSample({ elapsedMilliseconds: 0 });

    expect(afterReset.totalTicksStepped).toBe(0);
    expect(afterReset.accumulatorMilliseconds).toBe(0);
    expect(policy.diagnostics(0).observedMillisecondsTotal).toBe(0);
  });

  it('produces identical full authority traces for equal admitted schedules', () => {
    expect(runTimedSchedule([1_000, 0, 0])).toEqual(
      runTimedSchedule([400, 400, 200]),
    );
  });
});

describe('optional Game movement-driver dispatch', () => {
  it('calls the unchanged legacy Player.update path when no driver is configured', () => {
    const update = vi.fn();
    const input = Object.freeze({ source: 'legacy-input' });
    const legacyWorld = Object.freeze({ source: 'legacy-world' });

    updatePlayerMovementFrame(null, {
      elapsedSeconds: 0.016,
      input,
      player: { update },
      legacyWorld,
    });

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(0.016, input, legacyWorld);
  });

  it('calls only the driver on the configured path', () => {
    const legacyUpdate = vi.fn();
    const driverUpdate = vi.fn();
    const player = { update: legacyUpdate };
    const input = Object.freeze({ source: 'driver-input' });

    updatePlayerMovementFrame({ update: driverUpdate }, {
      elapsedSeconds: 0.025,
      input,
      player,
      legacyWorld: Object.freeze({ source: 'must-not-be-queried' }),
    });

    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(driverUpdate).toHaveBeenCalledOnce();
    expect(driverUpdate).toHaveBeenCalledWith({
      elapsedMilliseconds: 25,
      presentationElapsedSeconds: 0.025,
      input,
      player,
    });
  });

  it('preserves raw authority elapsed while clamping presentation elapsed', () => {
    const driverUpdate = vi.fn();
    const player = { update: vi.fn() };

    updatePlayerMovementFrame({ update: driverUpdate }, {
      elapsedSeconds: 0.05,
      movementElapsedMilliseconds: 250,
      input: {},
      player,
      legacyWorld: {},
    });

    expect(driverUpdate).toHaveBeenCalledWith(expect.objectContaining({
      elapsedMilliseconds: 250,
      presentationElapsedSeconds: 0.05,
    }));
    expect(player.update).not.toHaveBeenCalled();
  });

  it('keeps the driven Player presentation method free of authority mutation', () => {
    const player = new Player(16 / 9);
    player.position.set(4, 5, 6);
    player.velocity.set(7, 8, 9);
    const position = player.position.clone();
    const velocity = player.velocity.clone();

    player.updateDrivenPresentation(0.016, {
      wheelDelta: 0,
      yawRadians: 1.2,
      pitchRadians: -0.3,
    });

    expect(player.position.toArray()).toEqual(position.toArray());
    expect(player.velocity.toArray()).toEqual(velocity.toArray());
    expect(player.yaw).toBe(1.2);
    expect(player.pitch).toBe(-0.3);
  });

  it('resets driven recoil, sprint, eye-height, and bob transients on respawn', () => {
    const player = new Player(16 / 9);
    player.bobTime = 3.2;
    player.recoilPitch = 0.4;
    player.recoilPitchVel = -1.5;
    player._sprintT = 0.8;
    player._eyeHeight = 0.9;
    player.camera.rotation.z = -0.02;

    player.respawn(player.position.clone());

    expect(player.bobTime).toBe(0);
    expect(player.recoilPitch).toBe(0);
    expect(player.recoilPitchVel).toBe(0);
    expect(player._sprintT).toBe(0);
    expect(player._eyeHeight).toBe(1.7);
    expect(player.camera.rotation.z).toBe(0);
  });
});

describe('development movement visualization boundary', () => {
  function createVisualizationGame() {
    const driverUpdate = vi.fn();
    const forbidden = {
      weapon: vi.fn(),
      activeManager: vi.fn(),
      pickup: vi.fn(),
      grenade: vi.fn(),
      mode: vi.fn(),
      leaderboard: vi.fn(),
      deathEffects: vi.fn(),
    };
    const worldUpdate = vi.fn();
    const hudUpdate = vi.fn();
    const game = {
      _movementDriver: {
        capability: Object.freeze({
          boundary: 'development_flat_run_visualization_only_v1',
          legacyGameplayPolicy: 'pause',
        }),
        update: driverUpdate,
      },
      _menuOpen: false,
      _playerDowned: false,
      _playerBody: null,
      state: 'playing',
      playTime: 0,
      kills: 0,
      score: 0,
      input: {
        mouseDown: true,
        rightMouseDown: true,
        mouseDX: 0,
        mouseDY: 0,
        wheelDelta: 0,
        isDown: () => true,
        consumeJustPressed: () => true,
      },
      player: {
        _camDist: 0,
        teleportCooldown: 0,
        teleportMaxCooldown: 5,
        camera: { updateMatrixWorld: vi.fn() },
      },
      world: { update: worldUpdate },
      weaponSystem: {
        update: forbidden.weapon,
        weaponMount: { visible: true },
        getHudInfo: () => Object.freeze({}),
        currentIndex: 0,
      },
      _activeManager: { update: forbidden.activeManager },
      pickupSystem: { update: forbidden.pickup },
      grenadeSystem: {
        frags: 2,
        smokes: 2,
        throwFrag: forbidden.grenade,
        throwSmoke: forbidden.grenade,
        update: forbidden.grenade,
      },
      deathEffects: { update: forbidden.deathEffects },
      hud: {
        update: hudUpdate,
        updateGrenades: vi.fn(),
        setActiveSlot: vi.fn(),
        updateTeleport: vi.fn(),
      },
      _usesMovementFixtureVisualizationPolicy:
        Game.prototype._usesMovementFixtureVisualizationPolicy,
      _updateMovementFixtureVisualization:
        Game.prototype._updateMovementFixtureVisualization,
      _updateModeLogic: forbidden.mode,
      _updateLeaderboard: forbidden.leaderboard,
      _updatePlaying: Game.prototype._updatePlaying,
      _updateMenuScene: vi.fn(),
    };
    return { game, driverUpdate, forbidden, worldUpdate, hudUpdate };
  }

  it('freezes the capability and skips every interpolated legacy gameplay consumer', () => {
    const { game, driverUpdate, forbidden, worldUpdate, hudUpdate } =
      createVisualizationGame();

    Game.prototype._updatePlaying.call(game, 0.05, 250);
    game._menuOpen = true;
    Game.prototype._updatePlaying.call(game, 0.05, 50);
    game._menuOpen = false;
    Game.prototype._updatePlaying.call(game, 0.05, 50);

    expect(Object.isFrozen(game._movementDriver.capability)).toBe(true);
    expect(driverUpdate).toHaveBeenCalledTimes(2);
    expect(driverUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      elapsedMilliseconds: 250,
      presentationElapsedSeconds: 0.05,
    }));
    expect(worldUpdate).toHaveBeenCalledTimes(3);
    expect(hudUpdate).toHaveBeenCalledTimes(3);
    for (const consumer of Object.values(forbidden)) {
      expect(consumer).not.toHaveBeenCalled();
    }
  });

  it('keeps forced leaderboard state inside the visualization allowlist', () => {
    const { game, forbidden } = createVisualizationGame();
    game.state = 'leaderboard';

    Game.prototype._updateStateForFrame.call(game, 0.05, 0.25);

    expect(forbidden.leaderboard).not.toHaveBeenCalled();
    expect(forbidden.activeManager).not.toHaveBeenCalled();
    expect(game._movementDriver.update).toHaveBeenCalledWith(
      expect.objectContaining({ elapsedMilliseconds: 250 }),
    );
  });

  it('preserves per-tick authority traces through the live Game frame seam', () => {
    const partition = (frames: number): number[] => {
      const base = Math.floor(1_000 / frames);
      const remainder = 1_000 - base * frames;
      return [...Array<number>(frames)].map(
        (_, index) => base + (index < remainder ? 1 : 0),
      );
    };
    const run = (scheduleMilliseconds: readonly number[]) => {
      // A one-tick bridge exposes every intermediate authority hash. It uses
      // the same real latch/simulation/query path; zero-elapsed Game frames
      // drain backlog exactly as the production max-eight bridge does.
      const bridge = createTimedBridge(1);
      const policy = new DevelopmentMovementElapsedPolicy();
      const hashes: string[] = [];
      const driver = {
        capability: Object.freeze({
          boundary: 'development_flat_run_visualization_only_v1',
          legacyGameplayPolicy: 'pause',
        }),
        update: ({ elapsedMilliseconds }: { elapsedMilliseconds: number }) => {
          const admission = policy.admit(
            elapsedMilliseconds,
            bridge.getSnapshot().accumulatorMilliseconds,
          );
          const snapshot = bridge.advanceRenderSample({
            elapsedMilliseconds: admission.admittedMilliseconds,
            input: { held: ['moveForward'] },
          });
          if (snapshot.ticksStepped === 1) hashes.push(snapshot.currentStateHash);
        },
      };
      const game = {
        state: 'playing',
        _movementDriver: driver,
        _usesMovementFixtureVisualizationPolicy:
          Game.prototype._usesMovementFixtureVisualizationPolicy,
        _updateMovementFixtureVisualization(
          elapsedSeconds: number,
          movementElapsedMilliseconds: number,
        ) {
          updatePlayerMovementFrame(driver, {
            elapsedSeconds,
            movementElapsedMilliseconds,
            input: {},
            player: {},
            legacyWorld: {},
          });
        },
        _updatePlaying: vi.fn(),
        _updateLeaderboard: vi.fn(),
        _updateMenuScene: vi.fn(),
      };
      for (const elapsedMilliseconds of scheduleMilliseconds) {
        Game.prototype._updateStateForFrame.call(
          game,
          Math.min(0.05, elapsedMilliseconds / 1_000),
          elapsedMilliseconds / 1_000,
        );
      }
      while (bridge.getSnapshot().accumulatorMilliseconds >= 50) {
        Game.prototype._updateStateForFrame.call(game, 0, 0);
      }
      return {
        hashes,
        state: bridge.getSnapshot().currentAuthorityState,
        diagnostics: policy.diagnostics(
          bridge.getSnapshot().accumulatorMilliseconds,
        ),
      };
    };

    const sixtyFps = run(partition(60));
    const fractionalSixtyFps = run(
      [...Array<number>(60)].map(() => 1_000 / 60),
    );
    const thirtyFps = run(partition(30));
    const tenFps = run(partition(10));
    const stalled = run([1_000]);

    expect(sixtyFps.hashes).toHaveLength(20);
    expect(fractionalSixtyFps.hashes).toEqual(sixtyFps.hashes);
    expect(thirtyFps.hashes).toEqual(sixtyFps.hashes);
    expect(tenFps.hashes).toEqual(sixtyFps.hashes);
    expect(stalled.hashes).toEqual(sixtyFps.hashes);
    expect(thirtyFps.state).toEqual(sixtyFps.state);
    expect(tenFps.state).toEqual(sixtyFps.state);
    expect(stalled.state).toEqual(sixtyFps.state);
    expect(stalled.diagnostics).toMatchObject({
      admittedMillisecondsTotal: 1_000,
      droppedMillisecondsTotal: 0,
      currentBacklogMilliseconds: 0,
    });
  });

  it('transitions a runtime fault once and disposes without a fallback update', () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const driver = { neutralize: vi.fn(), dispose: vi.fn() };
    const onFault = vi.fn();
    const game = {
      _movementDriverFaulted: false,
      _disposed: false,
      _rafId: 42,
      _movementDriver: driver,
      input: { endFrame: vi.fn() },
      _onMovementDriverFault: onFault,
    };
    const error = new Error('synthetic movement fault');

    Game.prototype._handleMovementDriverFault.call(game, error);
    Game.prototype._handleMovementDriverFault.call(game, error);

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(driver.neutralize).toHaveBeenCalledOnce();
    expect(driver.dispose).toHaveBeenCalledOnce();
    expect(onFault).toHaveBeenCalledOnce();
    expect(onFault).toHaveBeenCalledWith(error);
    expect(game._movementDriver).toBeNull();
    vi.unstubAllGlobals();
  });

  it('reads raw Timer delta once and passes it beside the legacy 50 ms clamp', () => {
    const requestAnimationFrame = vi.fn(() => 9);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const getDelta = vi.fn(() => 0.25);
    const updateStateForFrame = vi.fn();
    const game = {
      _disposed: false,
      _movementDriverFaulted: false,
      _movementDriver: null,
      state: 'playing',
      timer: { update: vi.fn(), getDelta },
      _updateStateForFrame: updateStateForFrame,
      player: { camera: {} },
      menuCamera: {},
      _bloomEnabled: false,
      composer: null,
      renderer: { render: vi.fn() },
      world: { scene: {} },
      input: { endFrame: vi.fn() },
      _loop: vi.fn(),
    };

    Game.prototype._loop.call(game);

    expect(getDelta).toHaveBeenCalledOnce();
    expect(updateStateForFrame).toHaveBeenCalledWith(0.05, 0.25);
    vi.unstubAllGlobals();
  });
});
