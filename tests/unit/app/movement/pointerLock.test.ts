import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  requestConfirmedPointerLock,
  requestPointerLockWithRawFallback,
  type PointerLockRequestOptions,
} from '../../../../src/app/movement';

afterEach(() => vi.useRealTimers());

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

  it('does not issue a standard fallback after an aborted raw request rejects late', async () => {
    const calls: (PointerLockRequestOptions | undefined)[] = [];
    let rejectRaw!: (reason?: unknown) => void;
    const target = {
      requestPointerLock(options?: PointerLockRequestOptions): void | Promise<void> {
        calls.push(options);
        return new Promise<void>((_resolve, reject) => {
          rejectRaw = reject;
        });
      },
    };
    const controller = new AbortController();
    const result = requestPointerLockWithRawFallback(target, controller.signal);

    controller.abort();
    rejectRaw(new Error('raw request rejected after teardown'));

    await expect(result).resolves.toEqual({
      ok: false,
      requestedMode: 'unavailable',
      fallbackUsed: false,
      reason: 'aborted',
    });
    expect(calls).toEqual([{ unadjustedMovement: true }]);
  });
});

describe('requestConfirmedPointerLock', () => {
  function confirmationHost() {
    const listeners = {
      pointerlockchange: new Set<() => void>(),
      pointerlockerror: new Set<() => void>(),
    };
    const host = {
      pointerLockElement: null as unknown,
      addEventListener(
        type: 'pointerlockchange' | 'pointerlockerror',
        listener: () => void,
      ) {
        listeners[type].add(listener);
      },
      removeEventListener(
        type: 'pointerlockchange' | 'pointerlockerror',
        listener: () => void,
      ) {
        listeners[type].delete(listener);
      },
    };
    return {
      host,
      listenerCount: () => (
        listeners.pointerlockchange.size + listeners.pointerlockerror.size
      ),
      emit: (type: 'pointerlockchange' | 'pointerlockerror' = 'pointerlockchange') => {
        listeners[type].forEach((listener) => listener());
      },
    };
  }

  it('does not mistake a null target for an already-confirmed null lock', async () => {
    const confirmation = confirmationHost();

    await expect(requestConfirmedPointerLock(null, confirmation.host, 100)).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(confirmation.listenerCount()).toBe(0);
  });

  it('requires the host confirmation event before reporting success', async () => {
    const confirmation = confirmationHost();
    const target = {
      requestPointerLock() {
        confirmation.host.pointerLockElement = target;
        confirmation.emit();
      },
    };

    await expect(requestConfirmedPointerLock(target, confirmation.host, 100)).resolves.toEqual({
      ok: true,
    });
    expect(confirmation.listenerCount()).toBe(0);
  });

  it('times out and cleans up when a legacy request never settles', async () => {
    vi.useFakeTimers();
    const confirmation = confirmationHost();
    const target = {
      requestPointerLock: () => new Promise<void>(() => undefined),
    };
    const result = requestConfirmedPointerLock(target, confirmation.host, 80);

    await vi.advanceTimersByTimeAsync(80);
    await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' });
    expect(confirmation.listenerCount()).toBe(0);

    confirmation.host.pointerLockElement = target;
    confirmation.emit();
    await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('aborts and removes host listeners during route teardown', async () => {
    const confirmation = confirmationHost();
    const controller = new AbortController();
    const target = {
      requestPointerLock: () => new Promise<void>(() => undefined),
    };
    const result = requestConfirmedPointerLock(
      target,
      confirmation.host,
      100,
      controller.signal,
    );

    controller.abort();
    await expect(result).resolves.toEqual({ ok: false, reason: 'aborted' });
    expect(confirmation.listenerCount()).toBe(0);
  });

  it('reports an explicit request denial without waiting for timeout', async () => {
    const confirmation = confirmationHost();
    const target = { requestPointerLock: () => Promise.reject(new Error('denied')) };

    await expect(requestConfirmedPointerLock(target, confirmation.host, 100)).resolves.toEqual({
      ok: false,
      reason: 'request_failed',
    });
    expect(confirmation.listenerCount()).toBe(0);
  });

  it('allows one standard fallback when the raw error event accompanies rejection', async () => {
    const confirmation = confirmationHost();
    const calls: (PointerLockRequestOptions | undefined)[] = [];
    const target = {
      requestPointerLock(options?: PointerLockRequestOptions): void | Promise<void> {
        calls.push(options);
        if (options !== undefined) {
          confirmation.emit('pointerlockerror');
          return Promise.reject(new DOMException('raw unsupported', 'NotSupportedError'));
        }
        confirmation.host.pointerLockElement = target;
        confirmation.emit('pointerlockchange');
      },
    };

    await expect(requestConfirmedPointerLock(target, confirmation.host, 100)).resolves.toEqual({
      ok: true,
    });
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);
    expect(confirmation.listenerCount()).toBe(0);
  });

  it('fails promptly when pointerlockerror belongs to the standard attempt', async () => {
    const confirmation = confirmationHost();
    const calls: (PointerLockRequestOptions | undefined)[] = [];
    const target = {
      requestPointerLock(options?: PointerLockRequestOptions) {
        calls.push(options);
        confirmation.emit('pointerlockerror');
      },
    };

    await expect(requestConfirmedPointerLock(target, confirmation.host, 100)).resolves.toEqual({
      ok: false,
      reason: 'pointerlock_error',
    });
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);
    expect(confirmation.listenerCount()).toBe(0);
  });

  it('ignores one delayed unsupported-raw error but not a later standard error', async () => {
    const confirmation = confirmationHost();
    const calls: (PointerLockRequestOptions | undefined)[] = [];
    const target = {
      requestPointerLock(options?: PointerLockRequestOptions) {
        calls.push(options);
        return options === undefined
          ? new Promise<void>(() => undefined)
          : Promise.reject(new DOMException('raw unsupported', 'NotSupportedError'));
      },
    };
    const result = requestConfirmedPointerLock(target, confirmation.host, 100);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);

    confirmation.emit('pointerlockerror');
    confirmation.emit('pointerlockerror');

    await expect(result).resolves.toEqual({ ok: false, reason: 'pointerlock_error' });
    expect(confirmation.listenerCount()).toBe(0);
  });
});
