import { describe, expect, it } from 'vitest';

import { Player } from '../../../src/player/Player.js';
import {
  getRev17MeleeSocketContactTransform,
} from '../../../src/player/Rev17Character.js';

type MovementCapture = Readonly<{
  position: Readonly<{ x: number; z: number }>;
  velocity: Readonly<{ x: number; z: number }>;
}>;

function captureLegacyMovementBeforeCollision(
  code: 'KeyW' | 'KeyS' | 'KeyA' | 'KeyD',
  yaw: number,
): MovementCapture {
  const player = new Player(1);
  player.position.set(0, 0, 0);
  player.velocity.set(0, 0, 0);
  player.yaw = yaw;

  let capture: MovementCapture | null = null;
  const world = {
    colliders: [],
    resolveCollisions(position: { x: number; z: number }) {
      capture = {
        position: { x: position.x, z: position.z },
        velocity: { x: player.velocity.x, z: player.velocity.z },
      };
    },
  };
  const input = {
    wheelDelta: 0,
    mouseDX: 0,
    mouseDY: 0,
    isDown: (candidate: string) => candidate === code,
    consumeJustPressed: () => false,
  };

  player.update(0.1, input, world);
  if (capture === null) throw new Error('legacy collision boundary was not reached');
  return capture;
}

describe('G6 action contract', () => {
  it.each([
    ['forward at zero yaw', 'KeyW', 0, 'z', -1, 'x'],
    ['backward at zero yaw', 'KeyS', 0, 'z', 1, 'x'],
    ['left at zero yaw', 'KeyA', 0, 'x', -1, 'z'],
    ['right at zero yaw', 'KeyD', 0, 'x', 1, 'z'],
    ['forward at quarter-turn yaw', 'KeyW', Math.PI / 2, 'x', -1, 'z'],
    ['right at quarter-turn yaw', 'KeyD', Math.PI / 2, 'z', -1, 'x'],
  ] as const)(
    'keeps legacy %s on its current pre-collision direction sign',
    (_label, code, yaw, primaryAxis, expectedSign, crossAxis) => {
      const capture = captureLegacyMovementBeforeCollision(code, yaw);

      expect(Math.sign(capture.velocity[primaryAxis])).toBe(expectedSign);
      expect(Math.sign(capture.position[primaryAxis])).toBe(expectedSign);
      expect(capture.velocity[crossAxis]).toBeCloseTo(0, 12);
      expect(capture.position[crossAxis]).toBeCloseTo(0, 12);
    },
  );

  it('pins the socket-local melee origin, rotation, and scale invariant', () => {
    const contact = getRev17MeleeSocketContactTransform();

    expect(Math.hypot(...contact.position)).toBe(0);
    expect(contact.rotation).toEqual([0, Math.PI, 0]);
    expect(contact.uniformScale).toBe(0.75);
  });
});
