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
