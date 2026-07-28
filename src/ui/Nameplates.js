// Floating enemy nameplates (ev.io-style): a name + health bar above each living
// opponent, projected to the screen each frame. Replaces the 3D bar on bots so
// the plate stays crisp and always faces the camera.
import * as THREE from 'three';

const MAX_DIST = 90;   // don't show plates for very distant bots
const NAMEPLATE_WIDTH = 130;
const NAMEPLATE_HEIGHT = 26;
const NAMEPLATE_GAP = 4;
const NAMEPLATE_TOP_GUTTER = 4;

function placementBox(placement) {
  const width = NAMEPLATE_WIDTH * placement.scale;
  const height = NAMEPLATE_HEIGHT * placement.scale;
  return {
    left: placement.x - width / 2,
    right: placement.x + width / 2,
    top: placement.y - height,
    bottom: placement.y,
  };
}

function boxesOverlap(left, right) {
  return left.left < right.right + NAMEPLATE_GAP
    && left.right > right.left - NAMEPLATE_GAP
    && left.top < right.bottom + NAMEPLATE_GAP
    && left.bottom > right.top - NAMEPLATE_GAP;
}

/**
 * Keeps the closest bot label at its projected anchor and moves only labels
 * behind it upward. This stays presentation-only: world positions, targeting,
 * health, and bot iteration order are untouched.
 */
export function deconflictNameplatePlacements(placements, viewportHeight) {
  const ranked = placements
    .map((placement, sourceIndex) => ({ ...placement, sourceIndex }))
    .sort((left, right) => left.distance - right.distance || left.sourceIndex - right.sourceIndex);
  const resolved = [];

  for (const placement of ranked) {
    const height = NAMEPLATE_HEIGHT * placement.scale;
    const minimumBottom = height + NAMEPLATE_TOP_GUTTER;
    let next = { ...placement };
    let nextBox = placementBox(next);

    for (let attempt = 0; attempt < ranked.length; attempt += 1) {
      const collision = resolved.find(({ box }) => boxesOverlap(nextBox, box));
      if (!collision) break;

      const proposedBottom = collision.box.top - NAMEPLATE_GAP;
      const boundedBottom = Math.max(minimumBottom, proposedBottom);
      if (boundedBottom === next.y) break;

      next = { ...next, y: boundedBottom };
      nextBox = placementBox(next);
    }

    if (Number.isFinite(viewportHeight)) {
      next = {
        ...next,
        y: Math.min(next.y, viewportHeight - NAMEPLATE_TOP_GUTTER),
      };
      nextBox = placementBox(next);
    }

    resolved.push({ placement: next, box: nextBox });
  }

  return resolved
    .sort((left, right) => left.placement.sourceIndex - right.placement.sourceIndex)
    .map(({ placement }) => {
      const result = { ...placement };
      delete result.sourceIndex;
      return result;
    });
}

export class Nameplates {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'nameplates';
    (document.getElementById('hud') || document.body).appendChild(this.container);
    this._labels = new Map();   // bot -> element
    this._v   = new THREE.Vector3();
    this._cam = new THREE.Vector3();
  }

  update(camera, bots) {
    if (!camera || !bots) return;
    const w = window.innerWidth, h = window.innerHeight;
    const deconflictLabels =
      document.body?.dataset.uiSystem === 'match-instrument-v1';
    const visiblePlacements = [];
    camera.getWorldPosition(this._cam);
    const live = new Set();

    for (const bot of bots) {
      if (!bot.alive || !bot.mesh) continue;
      // Hide the bot's built-in 3D health bar; the DOM plate replaces it.
      if (bot.healthBarGroup) bot.healthBarGroup.visible = false;

      this._v.set(bot.position.x, bot.position.y + 2.15, bot.position.z);
      const dist = this._cam.distanceTo(this._v);
      this._v.project(camera);
      const onScreen = this._v.z < 1 &&
        this._v.x > -1.05 && this._v.x < 1.05 && this._v.y > -1.05 && this._v.y < 1.05;
      let el = this._labels.get(bot);

      if (!onScreen || dist > MAX_DIST) {
        if (el) el.style.display = 'none';
        if (bot.alive) live.add(bot);
        continue;
      }
      live.add(bot);

      if (!el) {
        el = document.createElement('div');
        el.className = 'nameplate';

        const name = document.createElement('div');
        name.className = 'np-name';
        const bar = document.createElement('div');
        bar.className = 'np-bar';
        const fill = document.createElement('div');
        fill.className = 'np-bar-fg';
        bar.appendChild(fill);
        el.append(name, bar);

        el._name = name;
        el._fg   = fill;
        el._name.textContent = bot.displayName || 'Enemy';
        this.container.appendChild(el);
        this._labels.set(bot, el);
      }
      el.style.display = 'block';
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      const s = Math.max(0.58, Math.min(0.92, 14 / dist));
      if (deconflictLabels) {
        visiblePlacements.push({ el, x, y, scale: s, distance: dist });
      } else {
        el.style.left = `${x}px`;
        el.style.top  = `${y}px`;
        el.style.transform = `translate(-50%, -100%) scale(${s})`;
      }
      el._fg.style.width = `${Math.max(0, (bot.health / bot.maxHealth) * 100)}%`;
    }

    if (deconflictLabels) {
      for (const placement of deconflictNameplatePlacements(visiblePlacements, h)) {
        placement.el.style.left = `${placement.x}px`;
        placement.el.style.top = `${placement.y}px`;
        placement.el.style.transform =
          `translate(-50%, -100%) scale(${placement.scale})`;
      }
    }

    // Remove plates for dead / despawned bots.
    for (const [bot, el] of this._labels) {
      if (!live.has(bot)) { el.remove(); this._labels.delete(bot); }
    }
  }

  clear() {
    this.container.replaceChildren();
    this._labels.clear();
  }
}
