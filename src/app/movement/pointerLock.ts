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
      readonly reason: 'unsupported' | 'request_failed';
    };

/**
 * Requests raw mouse movement when the host supports the options overload, then
 * retries the standard request if that attempt throws or rejects. It reports
 * only what was requested; pointer-lock change/error events remain host-owned.
 */
export async function requestPointerLockWithRawFallback(
  target: PointerLockRequestTarget | null | undefined,
): Promise<PointerLockRequestResult> {
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

  try {
    await request.call(target, { unadjustedMovement: true });
    return Object.freeze({
      ok: true,
      requestedMode: 'unadjusted',
      fallbackUsed: false,
    });
  } catch {
    try {
      await request.call(target);
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
