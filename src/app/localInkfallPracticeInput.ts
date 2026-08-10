import type { LocalInkfallPracticeInput } from '../authority';
import { INTENT_BUTTON } from '../sim';
import { axesFromPressedKeys } from '../dev/authorityEvidenceModel';
import {
  isOnlineAuthorityInputCode,
  onlineAuthorityInputButtonsFromPressedKeys,
  onlineAuthorityWeaponSlotFromCode,
} from './onlineAuthorityInput';

// InputCommand is a wire-safe intent even for the browser-local host.
const MAX_LOOK_DELTA_MILLI_DEGREES = 32_767;
const MOUSE_MILLI_DEGREES_PER_PIXEL = 110;
const ALL_AUTHORITY_WEAPON_SLOTS = Object.freeze([0, 1, 2, 3, 4, 5]);

export interface LocalInkfallPracticeInputBufferOptions {
  readonly initialSelectedSlot?: number;
  readonly allowedSelectedSlots?: readonly number[];
}

function authorityWeaponSlot(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 5) {
    throw new RangeError(`${label} must be an integer from 0 through 5`);
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Buffers browser-rate input until one exact 20 Hz authority tick consumes it.
 * Press/release edges and mouse deltas therefore survive frames with no tick.
 */
export class LocalInkfallPracticeInputBuffer {
  private readonly allowedSelectedSlots: ReadonlySet<number>;
  private readonly keys = new Set<string>();
  private pointerPrimaryHeld = false;
  private pointerAimHeld = false;
  private currentHeldButtons = 0;
  private publishedHeldButtons = 0;
  private pendingPressedButtons = 0;
  private pendingReleasedButtons = 0;
  private pendingYawMilliDegrees = 0;
  private pendingPitchMilliDegrees = 0;
  private selectedSlot: number;

  constructor(options: LocalInkfallPracticeInputBufferOptions = {}) {
    const initialSelectedSlot = authorityWeaponSlot(
      options.initialSelectedSlot ?? 0,
      'initial selected weapon slot',
    );
    const allowedSelectedSlots = new Set(
      (options.allowedSelectedSlots ?? ALL_AUTHORITY_WEAPON_SLOTS).map(
        (slot) => authorityWeaponSlot(slot, 'allowed selected weapon slot'),
      ),
    );
    if (allowedSelectedSlots.size === 0 || !allowedSelectedSlots.has(initialSelectedSlot)) {
      throw new RangeError('allowed selected weapon slots must contain the initial slot');
    }
    this.allowedSelectedSlots = allowedSelectedSlots;
    this.selectedSlot = initialSelectedSlot;
  }

  get aimHeld(): boolean {
    return this.pointerAimHeld;
  }

  get blinkPreviewHeld(): boolean {
    return this.keys.has('KeyQ');
  }

  get scoreboardHeld(): boolean {
    return this.keys.has('Tab');
  }

  get pressedKeys(): readonly string[] {
    return Object.freeze([...this.keys].sort());
  }

  get pendingLookYawMilliDegrees(): number {
    return this.pendingYawMilliDegrees;
  }

  get pendingLookPitchMilliDegrees(): number {
    return this.pendingPitchMilliDegrees;
  }

  handleKey(
    code: string,
    down: boolean,
    repeat = false,
    blinkCommitEligible = true,
  ): boolean {
    if (code === 'Tab') {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      return true;
    }
    if (!isOnlineAuthorityInputCode(code) && code !== 'KeyV') return false;
    if (down) {
      if (!repeat) {
        const slot = onlineAuthorityWeaponSlotFromCode(code);
        if (slot !== null && this.allowedSelectedSlots.has(slot)) this.selectedSlot = slot;
      }
      this.keys.add(code);
    } else {
      const commitBlink = code === 'KeyQ'
        && this.keys.has(code)
        && blinkCommitEligible;
      this.keys.delete(code);
      if (commitBlink) {
        this.pendingPressedButtons |= INTENT_BUTTON.utility;
        this.pendingReleasedButtons |= INTENT_BUTTON.utility;
      }
    }
    this.captureHeldTransition();
    return true;
  }

  handlePointerButton(button: number, down: boolean): boolean {
    if (button === 0) this.pointerPrimaryHeld = down;
    else if (button === 2) this.pointerAimHeld = down;
    else return false;
    this.captureHeldTransition();
    return true;
  }

  addPointerLook(movementX: number, movementY: number): void {
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) return;
    this.pendingYawMilliDegrees = clamp(
      this.pendingYawMilliDegrees + Math.round(movementX * MOUSE_MILLI_DEGREES_PER_PIXEL),
      -MAX_LOOK_DELTA_MILLI_DEGREES,
      MAX_LOOK_DELTA_MILLI_DEGREES,
    );
    this.pendingPitchMilliDegrees = clamp(
      this.pendingPitchMilliDegrees + Math.round(-movementY * MOUSE_MILLI_DEGREES_PER_PIXEL),
      -MAX_LOOK_DELTA_MILLI_DEGREES,
      MAX_LOOK_DELTA_MILLI_DEGREES,
    );
  }

  consume(): LocalInkfallPracticeInput {
    const axes = axesFromPressedKeys(this.keys);
    // The wire protocol intentionally rejects a pressed and released edge for
    // the same button in one command. Preserve a sub-tick tap by publishing it
    // as held+pressed for one authority tick, then emit its release on the next
    // tick. This keeps very fast clicks and key taps deterministic without
    // weakening the protocol contract or dropping the action.
    const pulseButtons = (
      this.pendingPressedButtons
      & this.pendingReleasedButtons
      & ~this.currentHeldButtons
    ) >>> 0;
    const publishedHeldButtons = (
      this.currentHeldButtons | pulseButtons
    ) >>> 0;
    const publishedPressedButtons = (
      publishedHeldButtons & ~this.publishedHeldButtons
    ) >>> 0;
    const publishedReleasedButtons = (
      this.publishedHeldButtons & ~publishedHeldButtons
    ) >>> 0;
    const result = Object.freeze({
      moveX: axes.moveX,
      moveY: axes.moveY,
      lookYawDeltaMilliDegrees: this.pendingYawMilliDegrees,
      lookPitchDeltaMilliDegrees: this.pendingPitchMilliDegrees,
      heldButtons: publishedHeldButtons,
      pressedButtons: publishedPressedButtons,
      releasedButtons: publishedReleasedButtons,
      selectedSlot: this.selectedSlot,
    });
    this.publishedHeldButtons = publishedHeldButtons;
    this.pendingPressedButtons = 0;
    this.pendingReleasedButtons = 0;
    this.pendingYawMilliDegrees = 0;
    this.pendingPitchMilliDegrees = 0;
    return result;
  }

  neutralize(): void {
    this.pendingReleasedButtons |= this.currentHeldButtons;
    this.keys.clear();
    this.pointerPrimaryHeld = false;
    this.pointerAimHeld = false;
    this.currentHeldButtons = 0;
    this.pendingYawMilliDegrees = 0;
    this.pendingPitchMilliDegrees = 0;
  }

  private captureHeldTransition(): void {
    const nextHeldButtons = (
      (
        onlineAuthorityInputButtonsFromPressedKeys(this.keys)
        & ~INTENT_BUTTON.utility
      )
      | (this.pointerPrimaryHeld ? INTENT_BUTTON.primaryFire : 0)
      | (this.keys.has('KeyV') ? INTENT_BUTTON.melee : 0)
    ) >>> 0;
    this.pendingPressedButtons |= nextHeldButtons & ~this.currentHeldButtons;
    this.pendingReleasedButtons |= this.currentHeldButtons & ~nextHeldButtons;
    this.currentHeldButtons = nextHeldButtons;
  }
}
