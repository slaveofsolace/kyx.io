import { describe, expect, it } from 'vitest';

import {
  requestPointerLockWithRawFallback,
  type PointerLockRequestOptions,
} from '../../../../src/app/movement';

describe('requestPointerLockWithRawFallback', () => {
  it('requests unadjusted movement first', async () => {
    const calls: (PointerLockRequestOptions | undefined)[] = [];
    const target = {
      requestPointerLock(options?: PointerLockRequestOptions) {
        calls.push(options);
      },
    };

    await expect(requestPointerLockWithRawFallback(target)).resolves.toEqual({
      ok: true,
      requestedMode: 'unadjusted',
      fallbackUsed: false,
    });
    expect(calls).toEqual([{ unadjustedMovement: true }]);
  });

  it('falls back without options when the raw request rejects', async () => {
    const calls: (PointerLockRequestOptions | undefined)[] = [];
    const target = {
      async requestPointerLock(options?: PointerLockRequestOptions) {
        calls.push(options);
        if (calls.length === 1) throw new TypeError('raw pointer not supported');
      },
    };

    await expect(requestPointerLockWithRawFallback(target)).resolves.toEqual({
      ok: true,
      requestedMode: 'standard',
      fallbackUsed: true,
    });
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);
  });

  it('never throws when both request forms fail', async () => {
    const target = {
      requestPointerLock() {
        throw new Error('pointer lock denied');
      },
    };

    await expect(requestPointerLockWithRawFallback(target)).resolves.toEqual({
      ok: false,
      requestedMode: 'unavailable',
      fallbackUsed: true,
      reason: 'request_failed',
    });
  });

  it('reports an unavailable injected target without throwing', async () => {
    await expect(requestPointerLockWithRawFallback(undefined)).resolves.toEqual({
      ok: false,
      requestedMode: 'unavailable',
      fallbackUsed: false,
      reason: 'unsupported',
    });
  });
});
