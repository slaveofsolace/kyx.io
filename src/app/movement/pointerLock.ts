export interface PointerLockRequestOptions {
  readonly unadjustedMovement?: boolean;
}

export interface PointerLockRequestTarget {
  requestPointerLock(
    options?: PointerLockRequestOptions,
  ): void | PromiseLike<void>;
}

export type PointerLockRequestResult =
  | {
      readonly ok: true;
      readonly requestedMode: 'unadjusted' | 'standard';
      readonly fallbackUsed: boolean;
    }
  | {
      readonly ok: false;
      readonly requestedMode: 'unavailable';
      readonly fallbackUsed: boolean;
      readonly reason: 'unsupported' | 'request_failed' | 'aborted';
    };

export interface PointerLockConfirmationHost {
  readonly pointerLockElement: unknown;
  addEventListener(
    type: 'pointerlockchange' | 'pointerlockerror',
    listener: () => void,
  ): void;
  removeEventListener(
    type: 'pointerlockchange' | 'pointerlockerror',
    listener: () => void,
  ): void;
}

export type ConfirmedPointerLockRequestResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'unsupported'
        | 'request_failed'
        | 'pointerlock_error'
        | 'timeout'
        | 'aborted';
    };

/**
 * Requests raw mouse movement when the host supports the options overload, then
 * retries the standard request if that attempt throws or rejects. It reports
 * only what was requested; pointer-lock change/error events remain host-owned.
 */
export async function requestPointerLockWithRawFallback(
  target: PointerLockRequestTarget | null | undefined,
  signal?: AbortSignal,
): Promise<PointerLockRequestResult> {
  const isAborted = (): boolean => signal?.aborted === true;
  let request: PointerLockRequestTarget['requestPointerLock'];
  try {
    if (target === null || target === undefined) {
      return Object.freeze({
        ok: false,
        requestedMode: 'unavailable',
        fallbackUsed: false,
        reason: 'unsupported',
      });
    }
    request = target.requestPointerLock;
    if (typeof request !== 'function') {
      return Object.freeze({
        ok: false,
        requestedMode: 'unavailable',
        fallbackUsed: false,
        reason: 'unsupported',
      });
    }
  } catch {
    return Object.freeze({
      ok: false,
      requestedMode: 'unavailable',
      fallbackUsed: false,
      reason: 'unsupported',
    });
  }

  if (isAborted()) {
    return Object.freeze({
      ok: false,
      requestedMode: 'unavailable',
      fallbackUsed: false,
      reason: 'aborted',
    });
  }

  try {
    await request.call(target, { unadjustedMovement: true });
    if (isAborted()) {
      return Object.freeze({
        ok: false,
        requestedMode: 'unavailable',
        fallbackUsed: false,
        reason: 'aborted',
      });
    }
    return Object.freeze({
      ok: true,
      requestedMode: 'unadjusted',
      fallbackUsed: false,
    });
  } catch {
    if (isAborted()) {
      return Object.freeze({
        ok: false,
        requestedMode: 'unavailable',
        fallbackUsed: false,
        reason: 'aborted',
      });
    }
    try {
      await request.call(target);
      if (isAborted()) {
        return Object.freeze({
          ok: false,
          requestedMode: 'unavailable',
          fallbackUsed: true,
          reason: 'aborted',
        });
      }
      return Object.freeze({
        ok: true,
        requestedMode: 'standard',
        fallbackUsed: true,
      });
    } catch {
      return Object.freeze({
        ok: false,
        requestedMode: 'unavailable',
        fallbackUsed: true,
        reason: 'request_failed',
      });
    }
  }
}

/**
 * Requests pointer lock and waits for the browser's pointerlockchange
 * confirmation. Legacy hosts can return void even when the request is denied,
 * so the confirmation wait is deliberately bounded.
 */
export function requestConfirmedPointerLock(
  target: PointerLockRequestTarget | null | undefined,
  host: PointerLockConfirmationHost,
  timeoutMilliseconds: number,
  signal?: AbortSignal,
): Promise<ConfirmedPointerLockRequestResult> {
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new RangeError('pointer-lock confirmation timeout must be positive');
  }
  try {
    if (target === null || target === undefined || typeof target.requestPointerLock !== 'function') {
      return Promise.resolve(Object.freeze({ ok: false, reason: 'unsupported' }));
    }
  } catch {
    return Promise.resolve(Object.freeze({ ok: false, reason: 'unsupported' }));
  }
  const supportedTarget = target;
  const request = supportedTarget.requestPointerLock;

  return new Promise((resolve) => {
    let settled = false;
    let attempt: 'unadjusted' | 'standard' = 'unadjusted';
    let standardStarted = false;
    let rawErrorObserved = false;
    let delayedRawErrorAllowance = false;
    const timeoutState: { timer?: ReturnType<typeof setTimeout> } = {};

    function finish(result: ConfirmedPointerLockRequestResult): void {
      if (settled) return;
      settled = true;
      if (timeoutState.timer !== undefined) clearTimeout(timeoutState.timer);
      host.removeEventListener('pointerlockchange', onPointerLockChange);
      host.removeEventListener('pointerlockerror', onPointerLockError);
      signal?.removeEventListener('abort', onAbort);
      resolve(Object.freeze(result));
    }
    function beginStandardAttempt(): void {
      if (settled || standardStarted) return;
      if (signal?.aborted === true) {
        finish({ ok: false, reason: 'aborted' });
        return;
      }
      standardStarted = true;
      attempt = 'standard';
      try {
        Promise.resolve(request.call(supportedTarget)).then(
          () => undefined,
          () => finish({ ok: false, reason: 'request_failed' }),
        );
      } catch {
        finish({ ok: false, reason: 'request_failed' });
      }
    }
    function onPointerLockChange(): void {
      if (host.pointerLockElement === supportedTarget) finish({ ok: true });
    }
    function onPointerLockError(): void {
      if (attempt === 'unadjusted') {
        rawErrorObserved = true;
        beginStandardAttempt();
        return;
      }
      if (delayedRawErrorAllowance) {
        delayedRawErrorAllowance = false;
        return;
      }
      finish({ ok: false, reason: 'pointerlock_error' });
    }
    function onAbort(): void {
      finish({ ok: false, reason: 'aborted' });
    }

    if (signal?.aborted === true) {
      finish({ ok: false, reason: 'aborted' });
      return;
    }

    host.addEventListener('pointerlockchange', onPointerLockChange);
    host.addEventListener('pointerlockerror', onPointerLockError);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (host.pointerLockElement === supportedTarget) {
      finish({ ok: true });
      return;
    }
    timeoutState.timer = setTimeout(() => {
      finish(host.pointerLockElement === supportedTarget
        ? { ok: true }
        : { ok: false, reason: 'timeout' });
    }, timeoutMilliseconds);

    try {
      Promise.resolve(request.call(supportedTarget, { unadjustedMovement: true })).then(
        () => undefined,
        (error: unknown) => {
          if (settled || standardStarted) return;
          delayedRawErrorAllowance = !rawErrorObserved
            && typeof error === 'object'
            && error !== null
            && 'name' in error
            && error.name === 'NotSupportedError';
          beginStandardAttempt();
        },
      );
    } catch {
      beginStandardAttempt();
    }
  });
}
