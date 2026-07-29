const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export type AbilityGlyphKind =
  | 'blink'
  | 'launch'
  | 'smoke'
  | 'frag'
  | 'sticky'
  | 'flash'
  | 'empty';

function path(svg: SVGSVGElement, data: string): void {
  const element = document.createElementNS(SVG_NAMESPACE, 'path');
  element.setAttribute('d', data);
  svg.appendChild(element);
}

function circle(svg: SVGSVGElement, x: number, y: number, radius: number): void {
  const element = document.createElementNS(SVG_NAMESPACE, 'circle');
  element.setAttribute('cx', String(x));
  element.setAttribute('cy', String(y));
  element.setAttribute('r', String(radius));
  svg.appendChild(element);
}

function line(
  svg: SVGSVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const element = document.createElementNS(SVG_NAMESPACE, 'line');
  element.setAttribute('x1', String(x1));
  element.setAttribute('y1', String(y1));
  element.setAttribute('x2', String(x2));
  element.setAttribute('y2', String(y2));
  svg.appendChild(element);
}

export function abilityGlyphKind(abilityId: string): AbilityGlyphKind {
  const normalized = String(abilityId ?? '').toLocaleLowerCase();
  if (normalized.includes('blink') || normalized.includes('teleport')) return 'blink';
  if (normalized.includes('launch') || normalized.includes('impulse')) return 'launch';
  if (normalized.includes('smoke')) return 'smoke';
  if (normalized.includes('sticky')) return 'sticky';
  if (normalized.includes('flash')) return 'flash';
  if (normalized.includes('frag')) return 'frag';
  return 'empty';
}

export function createAbilityGlyph(
  abilityId: string,
  className = 'ability-glyph',
): SVGSVGElement {
  const kind = abilityGlyphKind(abilityId);
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.abilityGlyph = kind;

  if (kind === 'blink') {
    path(svg, 'M4 7h10M10 3l4 4-4 4');
    path(svg, 'M20 17H10M14 13l-4 4 4 4');
  } else if (kind === 'launch') {
    path(svg, 'M12 19V5M7.5 9.5 12 5l4.5 4.5');
    path(svg, 'M5 18c2.3 1.2 4.6 1.8 7 1.8s4.7-.6 7-1.8');
  } else if (kind === 'smoke') {
    path(svg, 'M5.5 16.5h12.2a3.3 3.3 0 0 0 .2-6.6 5.6 5.6 0 0 0-10.5-1.4 4.2 4.2 0 0 0-1.9 8Z');
    path(svg, 'M8 19h8');
  } else if (kind === 'frag') {
    path(svg, 'm9 7 6-.1 3 5.1-4 7H9l-3-7 3-5Z');
    path(svg, 'm10 7 .7-3h3.8M14.5 4l2-1');
    line(svg, 9, 12, 15, 12);
  } else if (kind === 'sticky') {
    circle(svg, 12, 12, 5);
    circle(svg, 12, 12, 1.4);
    line(svg, 12, 3, 12, 7);
    line(svg, 12, 17, 12, 21);
    line(svg, 3, 12, 7, 12);
    line(svg, 17, 12, 21, 12);
  } else if (kind === 'flash') {
    circle(svg, 12, 12, 3.2);
    line(svg, 12, 3, 12, 6);
    line(svg, 12, 18, 12, 21);
    line(svg, 3, 12, 6, 12);
    line(svg, 18, 12, 21, 12);
    path(svg, 'm5.7 5.7 2.1 2.1M16.2 16.2l2.1 2.1M18.3 5.7l-2.1 2.1M7.8 16.2l-2.1 2.1');
  } else {
    path(svg, 'M6 6h12v12H6zM9 9l6 6M15 9l-6 6');
  }

  return svg;
}
