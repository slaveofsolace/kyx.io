const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(scope) {
  if (!scope?.querySelectorAll) return [];
  return Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hidden
    && element.getAttribute?.('aria-hidden') !== 'true'
    && !element.closest?.('[inert]')
    && !element.closest?.('.hidden')
  ));
}

export function focusFirst(scope) {
  const first = getFocusableElements(scope)[0];
  first?.focus?.();
  return first ?? null;
}

export function trapTabWithin(scope, event, activeElement = globalThis.document?.activeElement) {
  if (event?.key !== 'Tab') return false;
  const focusable = getFocusableElements(scope);
  if (focusable.length === 0) {
    event.preventDefault?.();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (activeElement === first || !focusable.includes(activeElement))) {
    event.preventDefault?.();
    last.focus?.();
    return true;
  }
  if (!event.shiftKey && (activeElement === last || !focusable.includes(activeElement))) {
    event.preventDefault?.();
    first.focus?.();
    return true;
  }
  return false;
}

const DIRECTION_VECTORS = Object.freeze({
  ArrowLeft: Object.freeze({ x: -1, y: 0 }),
  ArrowRight: Object.freeze({ x: 1, y: 0 }),
  ArrowUp: Object.freeze({ x: 0, y: -1 }),
  ArrowDown: Object.freeze({ x: 0, y: 1 }),
});

function elementCenter(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

export function moveFocusSpatial(
  scope,
  direction,
  activeElement = globalThis.document?.activeElement,
) {
  const vector = DIRECTION_VECTORS[direction];
  if (!vector) return null;

  const focusable = getFocusableElements(scope);
  if (focusable.length === 0) return null;
  if (!focusable.includes(activeElement)) return focusFirst(scope);

  const origin = elementCenter(activeElement);
  const originIndex = focusable.indexOf(activeElement);
  if (!origin || (origin.width === 0 && origin.height === 0)) {
    const delta = vector.x + vector.y > 0 ? 1 : -1;
    const target = focusable[(originIndex + delta + focusable.length) % focusable.length];
    target?.focus?.();
    return target ?? null;
  }

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of focusable) {
    if (candidate === activeElement) continue;
    const center = elementCenter(candidate);
    if (!center) continue;
    const dx = center.x - origin.x;
    const dy = center.y - origin.y;
    const primary = dx * vector.x + dy * vector.y;
    if (primary <= 2) continue;
    const secondary = Math.abs(dx * vector.y - dy * vector.x);
    const score = primary + secondary * 0.42;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) {
    const ordered = [...focusable].sort((left, right) => {
      const leftCenter = elementCenter(left);
      const rightCenter = elementCenter(right);
      const leftAxis = (leftCenter?.x ?? 0) * vector.x + (leftCenter?.y ?? 0) * vector.y;
      const rightAxis = (rightCenter?.x ?? 0) * vector.x + (rightCenter?.y ?? 0) * vector.y;
      return leftAxis - rightAxis;
    });
    best = ordered[0] ?? null;
  }

  best?.focus?.();
  return best;
}
