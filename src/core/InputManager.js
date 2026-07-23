import { requestPointerLockWithRawFallback } from '../app/movement/pointerLock.ts';

export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set();
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.pointerLocked = false;
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.mouseJustPressed = false;
    this.mouseJustReleased = false;
    this.rightMouseJustPressed = false;
    this.rightMouseJustReleased = false;
    this.onFocusLoss = null; // () => void
    this.onPointerLockError = null; // (reason: string) => void
    this._pointerLockErrorNotified = false;
    this._pointerLockRequestPending = false;
    this._pointerLockErrorTimer = null;

    this._releaseAllHeldInputs = () => {
      this.justPressed.clear();
      this.mouseJustPressed = false;
      this.rightMouseJustPressed = false;
      for (const code of this.keys) this.justReleased.add(code);
      this.keys.clear();
      if (this.mouseDown) this.mouseJustReleased = true;
      if (this.rightMouseDown) this.rightMouseJustReleased = true;
      this.mouseDown = false;
      this.rightMouseDown = false;
      this.mouseDX = 0;
      this.mouseDY = 0;
      this.wheelDelta = 0;
    };

    this._onKeyDown = (e) => {
      // Browsers normally reserve Escape to release pointer lock. Keep an
      // explicit fallback for runtimes that deliver the key event without
      // performing the release (for example embedded/headless Chromium), and
      // neutralize held movement immediately so a stalled release cannot leave
      // stale gameplay input active.
      if (e.code === 'Escape' && this.pointerLocked) {
        this._releaseAllHeldInputs();
        this.exitPointerLock();
        return;
      }
      // Tab is captured only while the viewport actually owns pointer lock.
      // Released menus must retain native keyboard focus traversal.
      if (e.code === 'Tab' && this.pointerLocked) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      if (this.keys.has(e.code)) this.justReleased.add(e.code);
      this.keys.delete(e.code);
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        if (!this.mouseDown) this.mouseJustPressed = true;
        this.mouseDown = true;
      }
      if (e.button === 2) {
        if (!this.rightMouseDown) this.rightMouseJustPressed = true;
        this.rightMouseDown = true;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) {
        if (this.mouseDown) this.mouseJustReleased = true;
        this.mouseDown = false;
      }
      if (e.button === 2) {
        if (this.rightMouseDown) this.rightMouseJustReleased = true;
        this.rightMouseDown = false;
      }
    };
    this._onWheel = (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
    };
    this.onLockChange = null; // (locked: boolean) => void
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (this.pointerLocked) {
        this._pointerLockErrorNotified = false;
        clearTimeout(this._pointerLockErrorTimer);
      }
      if (!this.pointerLocked) {
        this._releaseAllHeldInputs();
      }
      if (this.onLockChange) this.onLockChange(this.pointerLocked);
    };
    this._notifyPointerLockError = () => {
      if (this._pointerLockErrorNotified) return;
      this._pointerLockErrorNotified = true;
      this._releaseAllHeldInputs();
      this.onPointerLockError?.('pointer_lock_denied');
    };
    this._onPointerLockError = () => {
      clearTimeout(this._pointerLockErrorTimer);
      this._pointerLockErrorTimer = setTimeout(() => {
        if (!this._pointerLockRequestPending && document.pointerLockElement !== this.domElement) {
          this._notifyPointerLockError();
        }
      }, 100);
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onWindowBlur = () => {
      this._releaseAllHeldInputs();
      this.onFocusLoss?.();
    };
    this._onVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        this._releaseAllHeldInputs();
        this.onFocusLoss?.();
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('blur', this._onWindowBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('pointerlockerror', this._onPointerLockError);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  consumeJustPressed(code) {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  async requestPointerLock() {
    this._pointerLockErrorNotified = false;
    this._pointerLockRequestPending = true;
    const result = await requestPointerLockWithRawFallback(this.domElement);
    this._pointerLockRequestPending = false;
    if (!result.ok) {
      this._notifyPointerLockError();
    }
    return result.ok;
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per frame after consuming deltas. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.justPressed.clear();
    this.justReleased.clear();
    this.mouseJustPressed = false;
    this.mouseJustReleased = false;
    this.rightMouseJustPressed = false;
    this.rightMouseJustReleased = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('blur', this._onWindowBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('pointerlockerror', this._onPointerLockError);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    clearTimeout(this._pointerLockErrorTimer);
    this.onFocusLoss = null;
    this.onPointerLockError = null;
  }
}
