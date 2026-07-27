import { focusFirst, moveFocusSpatial } from './KeyboardFocus.js';

const EMPTY_STATE = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  accept: false,
  back: false,
});

function buttonPressed(button) {
  return Boolean(button?.pressed || Number(button?.value ?? 0) > 0.55);
}

export function readControllerState(gamepad, axisThreshold = 0.55) {
  if (!gamepad) return EMPTY_STATE;
  const horizontal = Number(gamepad.axes?.[0] ?? 0);
  const vertical = Number(gamepad.axes?.[1] ?? 0);
  return {
    up: buttonPressed(gamepad.buttons?.[12]) || vertical < -axisThreshold,
    down: buttonPressed(gamepad.buttons?.[13]) || vertical > axisThreshold,
    left: buttonPressed(gamepad.buttons?.[14]) || horizontal < -axisThreshold,
    right: buttonPressed(gamepad.buttons?.[15]) || horizontal > axisThreshold,
    accept: buttonPressed(gamepad.buttons?.[0]),
    back: buttonPressed(gamepad.buttons?.[1]),
  };
}

export function controllerDirection(state) {
  if (state?.up) return 'ArrowUp';
  if (state?.down) return 'ArrowDown';
  if (state?.left) return 'ArrowLeft';
  if (state?.right) return 'ArrowRight';
  return null;
}

function adjustFocusedRange(element, direction) {
  if (element?.tagName !== 'INPUT' || element.type !== 'range') return false;
  if (direction !== 'ArrowLeft' && direction !== 'ArrowRight') return false;
  const step = Number(element.step || 1);
  const min = Number(element.min || 0);
  const max = Number(element.max || 100);
  const delta = direction === 'ArrowRight' ? step : -step;
  element.value = String(Math.min(max, Math.max(min, Number(element.value) + delta)));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * @typedef {object} ControllerMenuNavigatorOptions
 * @property {() => HTMLElement | null | undefined} [getScope]
 * @property {() => void} [onBack]
 * @property {Document} [root]
 * @property {(callback: FrameRequestCallback) => number} [requestFrame]
 * @property {(handle: number) => void} [cancelFrame]
 * @property {() => (Gamepad | null)[]} [getGamepads]
 */

export class ControllerMenuNavigator {
  /** @param {ControllerMenuNavigatorOptions} [options] */
  constructor(options = {}) {
    const {
      getScope,
      onBack,
      root = globalThis.document,
      requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
      cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
      getGamepads = () => globalThis.navigator?.getGamepads?.() ?? [],
    } = options;
    this.getScope = getScope;
    this.onBack = onBack;
    this.root = root;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.getGamepads = getGamepads;
    this.frameId = null;
    this.previousState = EMPTY_STATE;
    this.previousDirection = null;
    this.nextMoveAt = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.frameId !== null || typeof this.requestFrame !== 'function') return false;
    this.frameId = this.requestFrame(this._tick);
    return true;
  }

  stop() {
    if (this.frameId !== null && typeof this.cancelFrame === 'function') {
      this.cancelFrame(this.frameId);
    }
    this.frameId = null;
    this.previousState = EMPTY_STATE;
    this.previousDirection = null;
  }

  _tick(timestamp = 0) {
    this.frameId = null;
    const scope = this.getScope?.() ?? null;
    const gamepad = Array.from(this.getGamepads?.() ?? []).find(Boolean);
    const state = readControllerState(gamepad);
    const direction = controllerDirection(state);

    if (scope && gamepad) {
      if (this.root?.body) this.root.body.dataset.inputMode = 'controller';
      const directionChanged = direction && direction !== this.previousDirection;
      const directionRepeated = direction && timestamp >= this.nextMoveAt;
      if (directionChanged || directionRepeated) {
        const activeElement = this.root?.activeElement;
        if (!adjustFocusedRange(activeElement, direction)) {
          moveFocusSpatial(scope, direction, activeElement);
        }
        this.nextMoveAt = timestamp + (directionChanged ? 340 : 115);
      }

      if (state.accept && !this.previousState.accept) {
        const activeElement = this.root?.activeElement;
        if (!activeElement || activeElement === this.root.body) {
          focusFirst(scope);
        } else {
          activeElement.click?.();
        }
      }

      if (state.back && !this.previousState.back) this.onBack?.();
    }

    this.previousState = state;
    this.previousDirection = direction;
    if (!direction) this.nextMoveAt = 0;
    this.frameId = this.requestFrame?.(this._tick) ?? null;
  }
}
