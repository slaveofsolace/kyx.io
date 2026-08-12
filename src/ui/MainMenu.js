import { getSkin } from '../player/skins.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { GameSettings } from '../core/GameSettings.js';
import { GAME_MODES } from '../core/GameModes.js';
import { GUNS, MELEE, Loadout } from '../core/Loadout.js';
import { ABILITY_PRESENTATION } from '../abilities/abilityLoadout.ts';
import { createAbilityGlyph } from './abilityGlyph.ts';
import { COMBAT_PRESETS } from '../loadouts/combatPresets.ts';
import { listMapLibrarySections } from '../content/maps/library.ts';
import { inspectLocalEvmapFile } from '../content/maps/localEvmapInspection.ts';
import { LOCAL_PRACTICE_ACTION_LABEL } from '../app/localPracticeEntryGate.ts';
import { ControllerMenuNavigator } from './ControllerNavigation.js';
import { focusFirst, moveFocusSpatial, trapTabWithin } from './KeyboardFocus.js';
import { buildPracticeHref } from './practiceRoute.ts';
import { ArmorPreviewRenderer } from './ArmorPreviewRenderer.js';
import { getWeaponThumb, warmWeaponThumbs } from './WeaponThumbnails.js';
import {
  isHumanSoldierReady,
  preloadHumanSoldier,
} from '../player/HumanSoldier.js';

export { buildPracticeHref } from './practiceRoute.ts';

const SAFE_PANELS = new Set(['maps', 'loadout', 'modes', 'settings']);

const SETTING_CHOICE_GROUPS = Object.freeze([
  Object.freeze({ id: 'quality-btns', dataKey: 'q' }),
  Object.freeze({ id: 'invert-btns', dataKey: 'inv' }),
  Object.freeze({ id: 'crosshair-color-btns', dataKey: 'crosshairColor' }),
  Object.freeze({ id: 'high-contrast-btns', dataKey: 'highContrast' }),
  Object.freeze({ id: 'reduced-motion-btns', dataKey: 'reducedMotion' }),
  Object.freeze({ id: 'reduced-flash-btns', dataKey: 'reducedFlash' }),
  Object.freeze({ id: 'subtitles-btns', dataKey: 'subtitles' }),
  Object.freeze({ id: 'visual-audio-cues-btns', dataKey: 'visualAudioCues' }),
]);

function setChoiceGroup(id, dataKey, value) {
  document.getElementById(id)?.querySelectorAll('button').forEach((button) => {
    const selected = button.dataset[dataKey] === value;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function getChoiceValue(id, dataKey, fallback) {
  return document.getElementById(id)
    ?.querySelector('button.active')
    ?.dataset[dataKey] ?? fallback;
}

function formatDuration(seconds) {
  if (seconds <= 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function sentenceCaseLabel(value) {
  const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (!normalized) return '';
  const prepared = normalized === normalized.toUpperCase()
    ? normalized.toLocaleLowerCase()
    : normalized;
  return prepared.charAt(0).toLocaleUpperCase() + prepared.slice(1);
}

function createStatRow(label, value) {
  const row = document.createElement('div');
  const labelNode = document.createTextNode(label);
  const valueNode = document.createElement('span');
  valueNode.textContent = value;
  row.append(labelNode, valueNode);
  return row;
}

export class MenuUI {
  /** @param {{ routeRelayPractice?: boolean } | undefined} options */
  constructor(options = undefined) {
    this.topNav = document.getElementById('top-nav');
    this.centerPlay = document.getElementById('center-play');
    this.nameInput = document.getElementById('player-name');
    this.playBtn = document.getElementById('play-btn');
    this.pauseMenu = document.getElementById('pause-menu');
    this.pauseLockStatus = document.getElementById('pause-lock-status');
    this.gameoverMenu = document.getElementById('gameover-menu');
    this.gameoverStats = document.getElementById('gameover-stats');
    this.gameCanvas = document.getElementById('game-canvas');

    this.selectedSkinId = getSkin().id;
    this.selectedArmorId = loadArmorType();
    this.selectedModeId = GAME_MODES[0].id;
    this.selectedMapId = 'relay_visual_candidate';
    this._routeRelayPractice = options?.routeRelayPractice !== false;
    this._displayName = 'Recruit';
    this._activePanel = null;
    this._panelReturnFocus = null;
    this._settingsStatusTimer = null;
    this._armorPreview = null;
    this._armorPreviewModelLoaded = false;
    this._loadoutThumbsRequested = false;

    this.onPlay = null;
    this.onResume = null;
    this.onQuit = null;
    this.onRestart = null;
    this.onBackToMenu = null;
    this.onArmorChanged = null;
    this.onSettingsSaved = null;
    this.onProfileEdit = null;

    this._buildModeCards();
    this._buildMapLibrary();
    this._buildSettings();
    this._wireNav();
    this._controllerNavigation = new ControllerMenuNavigator({
      getScope: () => this._activeFocusScope(),
      onBack: () => this._handleBackNavigation(),
    });
    this._controllerNavigation.start();
    window.addEventListener('pagehide', () => {
      this._armorPreview?.dispose();
      this._armorPreview = null;
      this._armorPreviewModelLoaded = false;
    }, { once: true });
  }

  dispose() {
    this._controllerNavigation?.stop();
    this._armorPreview?.dispose();
    this._armorPreview = null;
    this._armorPreviewModelLoaded = false;
  }

  _showArmorPreview() {
    const canvas = document.getElementById('armor-preview-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (this._armorPreview === null) {
      this._armorPreview = new ArmorPreviewRenderer(canvas);
    }
    const loadAndStart = () => {
      if (this._activePanel !== 'loadout' || this._armorPreview === null) return;
      if (!this._armorPreviewModelLoaded) {
        const selectedGun = GUNS.find((weapon) => weapon.id === Loadout.getGun());
        this._armorPreview.loadArmor(
          getSkin(),
          this.selectedArmorId,
          null,
          selectedGun,
        );
        this._armorPreviewModelLoaded = true;
      }
      this._armorPreview.start();
      canvas.dataset.modelState = 'ready';
    };
    if (isHumanSoldierReady()) {
      loadAndStart();
      return;
    }
    canvas.dataset.modelState = 'loading';
    preloadHumanSoldier(loadAndStart);
  }

  _requestLoadoutThumbnails() {
    if (this._loadoutThumbsRequested) return;
    this._loadoutThumbsRequested = true;
    let attempts = 0;
    const refreshWhenReady = () => {
      const ready = GUNS.every((weapon) => getWeaponThumb(weapon.id));
      if (!ready && attempts < 50) {
        attempts += 1;
        setTimeout(refreshWhenReady, 200);
        return;
      }
      if (this._activePanel === 'loadout') {
        this._armorPreviewModelLoaded = false;
        this._renderLocalLoadout();
        this._showArmorPreview();
      }
    };
    warmWeaponThumbs(refreshWhenReady);
  }

  _wireNav() {
    const startPractice = (modeId) => this._startPractice(modeId);

    this.playBtn?.addEventListener('click', () => startPractice());

    document.querySelectorAll('.nav-dd-btn').forEach((button) => {
      const dropdown = document.getElementById(`dd-${button.dataset.dd}`);
      if (!dropdown) return;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const shouldOpen = dropdown.classList.contains('hidden');
        this._closeAllDropdowns();
        if (shouldOpen) {
          dropdown.classList.remove('hidden');
          button.classList.add('open');
        }
      });
    });

    document.querySelectorAll('.mode-option[data-mode]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        startPractice(button.dataset.mode);
      });
    });

    document.querySelectorAll('[data-panel]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const panel = button.dataset.panel;
        this._closeAllDropdowns();
        if (SAFE_PANELS.has(panel)) this._togglePanel(panel);
      });
    });

    for (const id of ['nav-profile-link', 'nav-login-link', 'profile-edit-btn']) {
      document.getElementById(id)?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onProfileEdit?.();
      });
    }

    document.addEventListener('click', (event) => {
      const path = event.composedPath();
      const contains = (selector) => path.some(
        (node) => node.nodeType === 1 && node.matches?.(selector),
      );
      if (!contains('.nav-dd-wrap')) this._closeAllDropdowns();
      if (this._activePanel && !contains('.nav-panel') && !contains('[data-panel]')) {
        this._closeAllPanels(true);
      }
    });

    document.getElementById('resume-btn')?.addEventListener('click', () => this.onResume?.());
    document.getElementById('quit-btn')?.addEventListener('click', () => this.onQuit?.());
    document.getElementById('restart-btn')?.addEventListener('click', () => this.onRestart?.());
    document.getElementById('menu-btn')?.addEventListener('click', () => this.onBackToMenu?.());
    document.getElementById('maps-close-btn')?.addEventListener('click', () => this._closeAllPanels(true));
    document.getElementById('inv-close-btn')?.addEventListener('click', () => this._closeAllPanels(true));
    document.getElementById('settings-close-btn')?.addEventListener('click', () => this._closeAllPanels(true));

    document.addEventListener('keydown', (event) => {
      const activeDialog = [this.pauseMenu, this.gameoverMenu].find(
        (dialog) => dialog && !dialog.classList.contains('hidden'),
      );
      const activePanel = this._activePanel
        ? document.getElementById(`panel-${this._activePanel}`)
        : null;
      const scope = activeDialog ?? activePanel ?? this._activeFocusScope();
      if (scope) document.body.dataset.inputMode = 'keyboard';
      if ((activeDialog || activePanel) && event.key === 'Tab') {
        trapTabWithin(activeDialog ?? activePanel, event);
        return;
      }
      if (event.key === 'Escape' && this._handleBackNavigation()) {
        event.preventDefault();
        return;
      }

      if (!scope || !event.key.startsWith('Arrow')) return;
      const choiceGroup = event.target?.closest?.('[role="group"]');
      if (choiceGroup && event.target?.matches?.('button')) {
        const buttons = Array.from(choiceGroup.querySelectorAll('button:not([disabled])'));
        const currentIndex = buttons.indexOf(event.target);
        if (currentIndex >= 0) {
          const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          const next = buttons[(currentIndex + delta + buttons.length) % buttons.length];
          event.preventDefault();
          next?.focus();
          next?.click();
          return;
        }
      }

      if (event.target?.matches?.('input[type="range"], textarea, select')) return;
      event.preventDefault();
      moveFocusSpatial(scope, event.key, event.target);
    });
  }

  _startPractice(modeId, mapId = 'relay_visual_candidate') {
    if (modeId) this.selectedModeId = modeId;
    this.selectedMapId = mapId;
    this._closeAllPanels();
    this._closeAllDropdowns();
    if (mapId === 'relay_visual_candidate' && this._routeRelayPractice) {
      window.location.assign(buildPracticeHref(window.location.search));
      return;
    }
    const name = this.nameInput?.value.trim() || this._displayName || 'Recruit';
    this.onPlay?.(name, this.selectedSkinId, this.selectedModeId, this.selectedArmorId);
  }

  _activeFocusScope() {
    const activeDialog = [this.pauseMenu, this.gameoverMenu].find(
      (dialog) => dialog && !dialog.classList.contains('hidden'),
    );
    if (activeDialog) return activeDialog;
    if (this._activePanel) return document.getElementById(`panel-${this._activePanel}`);
    if (this.centerPlay && !this.centerPlay.classList.contains('hidden')) {
      return document.getElementById('app');
    }
    return null;
  }

  _handleBackNavigation() {
    if (this._activePanel) {
      this._closeAllPanels(true);
      return true;
    }
    if (this.pauseMenu && !this.pauseMenu.classList.contains('hidden')) {
      this.onResume?.();
      return true;
    }
    if (this.gameoverMenu && !this.gameoverMenu.classList.contains('hidden')) {
      this.onBackToMenu?.();
      return true;
    }
    return false;
  }

  _closeAllDropdowns() {
    document.querySelectorAll('.nav-dd').forEach((dropdown) => dropdown.classList.add('hidden'));
    document.querySelectorAll('.nav-dd-btn').forEach((button) => button.classList.remove('open'));
  }

  _togglePanel(id) {
    if (!SAFE_PANELS.has(id)) return;
    if (this._activePanel === id) {
      this._closeAllPanels(true);
      return;
    }
    this._closeAllPanels();
    const trigger = document.querySelector(`[data-panel="${id}"]`);
    const panel = document.getElementById(`panel-${id}`);
    this._panelReturnFocus = trigger;
    this._activePanel = id;
    document.body.dataset.activeMenuPanel = id;
    panel?.classList.remove('hidden');
    trigger?.classList.add('active');
    trigger?.setAttribute('aria-expanded', 'true');
    if (id === 'loadout') {
      this._renderLocalLoadout();
      this._showArmorPreview();
    }
    if (id === 'settings') this._loadSettings();
    queueMicrotask(() => focusFirst(panel));
  }

  _closeAllPanels(restoreFocus = false) {
    const returnFocus = this._panelReturnFocus;
    this._activePanel = null;
    this._panelReturnFocus = null;
    delete document.body.dataset.activeMenuPanel;
    document.querySelectorAll('.nav-panel').forEach((panel) => panel.classList.add('hidden'));
    document.querySelectorAll('[data-panel]').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    });
    this._armorPreview?.stop();
    if (restoreFocus) queueMicrotask(() => returnFocus?.focus?.());
  }

  _buildModeCards() {
    const root = document.getElementById('mode-cards');
    if (!root) return;
    root.replaceChildren();
    for (const mode of GAME_MODES) {
      const button = document.createElement('button');
      button.className = 'mode-card';
      button.dataset.mode = mode.id;

      const name = document.createElement('span');
      name.className = 'mode-card-name';
      name.textContent = mode.name;
      const description = document.createElement('span');
      description.className = 'mode-card-desc';
      description.textContent = mode.desc;
      button.append(name, description);
      button.addEventListener('click', () => {
        this._startPractice(mode.id);
      });
      root.appendChild(button);
    }
  }

  _buildMapLibrary() {
    const root = document.getElementById('map-library-sections');
    if (!root) return;
    root.replaceChildren();

    const lanes = Object.freeze([
      Object.freeze({
        id: 'original',
        label: 'Original arenas',
        description: 'Current KYX arenas for shared movement and combat.',
      }),
      Object.freeze({
        id: 'legacy',
        label: 'Legacy maps',
        description: 'Classic KYX arenas and private local map files.',
      }),
    ]);
    const tabList = document.createElement('div');
    tabList.className = 'map-library__tabs';
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Arena families');
    const laneStack = document.createElement('div');
    laneStack.className = 'map-library__lanes';
    const laneNodes = new Map();
    const tabNodes = new Map();

    const activateLane = (laneId) => {
      for (const lane of lanes) {
        const selected = lane.id === laneId;
        const tab = tabNodes.get(lane.id);
        tab?.setAttribute('aria-selected', String(selected));
        tab?.classList.toggle('active', selected);
        if (tab) tab.tabIndex = selected ? 0 : -1;
        laneNodes.get(lane.id)?.classList.toggle('hidden', !selected);
      }
    };

    for (const lane of lanes) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.id = `map-library-tab-${lane.id}`;
      tab.className = 'map-library__tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `map-library-lane-${lane.id}`);
      tab.setAttribute('aria-selected', 'false');
      tab.tabIndex = -1;
      const tabLabel = document.createElement('strong');
      tabLabel.textContent = lane.label;
      const tabCopy = document.createElement('span');
      tabCopy.textContent = lane.description;
      tab.append(tabLabel, tabCopy);
      tab.addEventListener('click', () => activateLane(lane.id));
      tab.addEventListener('keydown', (event) => {
        const currentIndex = lanes.findIndex((candidate) => candidate.id === lane.id);
        let nextIndex = null;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + lanes.length) % lanes.length;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % lanes.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = lanes.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        const nextLane = lanes[nextIndex];
        activateLane(nextLane.id);
        tabNodes.get(nextLane.id)?.focus();
      });
      tabList.appendChild(tab);
      tabNodes.set(lane.id, tab);

      const laneNode = document.createElement('div');
      laneNode.id = `map-library-lane-${lane.id}`;
      laneNode.className = 'map-library__lane hidden';
      laneNode.setAttribute('role', 'tabpanel');
      laneNode.setAttribute('aria-labelledby', tab.id);
      laneStack.appendChild(laneNode);
      laneNodes.set(lane.id, laneNode);
    }

    for (const section of listMapLibrarySections()) {
      const laneId = section.id === 'original_maps' ? 'original' : 'legacy';
      const laneNode = laneNodes.get(laneId);
      if (!laneNode) continue;
      const sectionNode = document.createElement('section');
      sectionNode.className = 'map-library__section';
      sectionNode.dataset.sectionId = section.id;

      const sectionHead = document.createElement('header');
      sectionHead.className = 'map-library__section-head';
      const sectionTitle = document.createElement('h3');
      sectionTitle.textContent = section.label;
      const sectionCopy = document.createElement('p');
      sectionCopy.className = 'map-library__section-copy';
      sectionCopy.textContent = section.description;
      sectionHead.append(sectionTitle, sectionCopy);

      const entries = document.createElement('div');
      entries.className = 'map-library__entries';

      for (const entry of section.entries) {
        const article = document.createElement('article');
        article.className = 'map-library__entry';
        article.dataset.mapId = entry.id;
        article.dataset.availability = entry.availability;

        const visual = document.createElement('div');
        visual.className = 'map-library__entry-visual';
        visual.setAttribute('aria-hidden', 'true');
        const visualCode = document.createElement('strong');
        visualCode.textContent = entry.id === 'relay_visual_candidate'
          ? 'RY-01'
          : entry.id === 'iron_bastion'
            ? 'IB-01'
            : entry.id === 'local_evmap_inspection'
              ? 'LOCAL'
              : 'EXT';
        const visualCopy = document.createElement('span');
        visualCopy.textContent = entry.id === 'relay_visual_candidate'
          ? 'Open sky / three combat tiers'
          : entry.id === 'iron_bastion'
            ? 'Archive / offline bots'
            : entry.id === 'local_evmap_inspection'
              ? 'Private file / no upload'
              : 'External rights boundary';
        visual.append(visualCode, visualCopy);

        const descriptionColumn = document.createElement('div');
        const titleRow = document.createElement('div');
        titleRow.className = 'map-library__entry-title-row';
        const title = document.createElement('h4');
        title.textContent = entry.displayName;
        const status = document.createElement('span');
        status.className = 'map-library__entry-status';
        status.textContent = entry.statusLabel;
        titleRow.append(title, status);

        const maker = document.createElement('p');
        maker.className = 'map-library__entry-maker';
        maker.textContent = entry.maker;
        const copy = document.createElement('p');
        copy.className = 'map-library__entry-copy';
        copy.textContent = entry.description;
        const modes = document.createElement('div');
        modes.className = 'map-library__modes';
        modes.setAttribute('aria-label', `${entry.displayName} modes`);
        for (const mode of entry.modes) {
          const modeNode = document.createElement('span');
          modeNode.textContent = mode;
          modes.appendChild(modeNode);
        }
        descriptionColumn.append(titleRow, maker, copy, modes);

        const actionColumn = document.createElement('div');
        actionColumn.className = 'map-library__action-column';
        if (entry.action.kind === 'start_local_practice') {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'map-library__action map-library__action--primary';
          button.textContent = 'Play offline';
          button.addEventListener('click', () => this._startPractice(entry.action.modeId, entry.id));
          actionColumn.appendChild(button);
        } else if (entry.action.kind === 'inspect_local_evmap') {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.evmap';
          input.className = 'map-library__file-input';
          input.tabIndex = -1;
          input.setAttribute('aria-label', 'Choose a local evmap file to inspect');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'map-library__action';
          button.textContent = 'Choose local file';
          button.addEventListener('click', () => input.click());
          const result = document.createElement('p');
          result.className = 'map-library__inspection-result';
          result.setAttribute('role', 'status');
          result.setAttribute('aria-live', 'polite');
          result.textContent = 'Nothing leaves this device.';
          let inspectionRequestToken = 0;
          input.addEventListener('change', async () => {
            const requestToken = ++inspectionRequestToken;
            const file = input.files?.[0];
            if (!file) return;
            result.dataset.state = 'working';
            result.textContent = 'Inspecting local bytes…';
            try {
              const inspection = await inspectLocalEvmapFile(file);
              if (requestToken !== inspectionRequestToken) return;
              result.dataset.state = 'complete';
              result.textContent = [
                inspection.fileName,
                `${(inspection.bytes / 1024).toFixed(1)} KiB`,
                inspection.container,
                `SHA-256 ${inspection.sha256.slice(0, 12)}…`,
                'inspection only',
              ].join(' · ');
            } catch (error) {
              if (requestToken !== inspectionRequestToken) return;
              result.dataset.state = 'error';
              result.textContent = error instanceof Error
                ? error.message
                : 'LOCAL_EVMAP_INSPECTION_FAILED';
            } finally {
              if (requestToken === inspectionRequestToken) input.value = '';
            }
          });
          actionColumn.append(button, input, result);
        } else {
          const link = document.createElement('a');
          link.className = entry.action.kind === 'open_review_route'
            ? 'map-library__action'
            : 'map-library__reference';
          link.href = entry.action.href;
          link.textContent = entry.action.kind === 'open_local_authority_practice'
            ? LOCAL_PRACTICE_ACTION_LABEL
            : entry.action.kind === 'open_review_route'
              ? 'Open review arena'
            : 'View official library';
          if (entry.action.kind === 'external_reference') {
            link.target = '_blank';
            link.rel = 'noreferrer';
          }
          actionColumn.appendChild(link);

          if (entry.availability === 'rights_blocked') {
            const blocked = document.createElement('p');
            blocked.className = 'map-library__blocked-note';
            blocked.textContent = 'Import and redistribution remain locked.';
            actionColumn.appendChild(blocked);
          }
        }

        article.append(visual, descriptionColumn, actionColumn);
        entries.appendChild(article);
      }

      sectionNode.append(sectionHead, entries);
      laneNode.appendChild(sectionNode);
    }

    root.append(tabList, laneStack);
    activateLane('original');
  }

  _buildSettings() {
    const ranges = [
      ['set-sens', 'set-sens-val', (value) => `${(value / 100).toFixed(2)}×`],
      ['set-fov', 'set-fov-val', (value) => `${value}°`],
      ['set-vol', 'set-vol-val', (value) => `${value}%`],
      ['set-hud-scale', 'set-hud-scale-val', (value) => `${value}%`],
      ['set-crosshair-scale', 'set-crosshair-scale-val', (value) => `${value}%`],
    ];
    for (const [inputId, outputId, format] of ranges) {
      const input = document.getElementById(inputId);
      input?.addEventListener('input', () => {
        const output = document.getElementById(outputId);
        if (output) output.textContent = format(Number(input.value));
      });
    }

    for (const { id, dataKey } of SETTING_CHOICE_GROUPS) {
      document.getElementById(id)?.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => setChoiceGroup(id, dataKey, button.dataset[dataKey]));
      });
    }

    document.getElementById('settings-save-btn')?.addEventListener('click', () => {
      const settings = {
        sensitivity: Number(document.getElementById('set-sens')?.value ?? 100) / 100,
        fov: Number(document.getElementById('set-fov')?.value ?? 78),
        volume: Number(document.getElementById('set-vol')?.value ?? 50) / 100,
        quality: getChoiceValue('quality-btns', 'q', 'medium'),
        invertY: getChoiceValue('invert-btns', 'inv', 'off') === 'on',
        hudScale: Number(document.getElementById('set-hud-scale')?.value ?? 100) / 100,
        crosshairScale: Number(document.getElementById('set-crosshair-scale')?.value ?? 100) / 100,
        crosshairColor: getChoiceValue('crosshair-color-btns', 'crosshairColor', 'cyan'),
        highContrast: getChoiceValue('high-contrast-btns', 'highContrast', 'off') === 'on',
        reducedMotion: getChoiceValue('reduced-motion-btns', 'reducedMotion', 'off') === 'on',
        reducedFlash: getChoiceValue('reduced-flash-btns', 'reducedFlash', 'off') === 'on',
        subtitles: getChoiceValue('subtitles-btns', 'subtitles', 'on') === 'on',
        visualAudioCues: getChoiceValue('visual-audio-cues-btns', 'visualAudioCues', 'off') === 'on',
      };
      const persisted = GameSettings.setMany(settings);
      this.onSettingsSaved?.(GameSettings.snapshot());
      const status = document.getElementById('settings-save-status');
      if (status) {
        status.textContent = persisted
          ? 'Settings saved on this device.'
          : 'Storage unavailable. Settings remain active for this session.';
        clearTimeout(this._settingsStatusTimer);
        this._settingsStatusTimer = setTimeout(() => { status.textContent = ''; }, 3_000);
      }
    });
  }

  _loadSettings() {
    GameSettings.load();
    const sensitivity = document.getElementById('set-sens');
    const fov = document.getElementById('set-fov');
    const volume = document.getElementById('set-vol');
    const hudScale = document.getElementById('set-hud-scale');
    const crosshairScale = document.getElementById('set-crosshair-scale');
    const settings = GameSettings.snapshot();
    if (sensitivity) sensitivity.value = Math.round(settings.sensitivity * 100);
    if (fov) fov.value = settings.fov;
    if (volume) volume.value = Math.round(settings.volume * 100);
    if (hudScale) hudScale.value = Math.round(settings.hudScale * 100);
    if (crosshairScale) crosshairScale.value = Math.round(settings.crosshairScale * 100);
    for (const input of [sensitivity, fov, volume, hudScale, crosshairScale]) {
      input?.dispatchEvent(new Event('input'));
    }
    setChoiceGroup('quality-btns', 'q', settings.quality);
    setChoiceGroup('invert-btns', 'inv', settings.invertY ? 'on' : 'off');
    setChoiceGroup('crosshair-color-btns', 'crosshairColor', settings.crosshairColor);
    setChoiceGroup('high-contrast-btns', 'highContrast', settings.highContrast ? 'on' : 'off');
    setChoiceGroup('reduced-motion-btns', 'reducedMotion', settings.reducedMotion ? 'on' : 'off');
    setChoiceGroup('reduced-flash-btns', 'reducedFlash', settings.reducedFlash ? 'on' : 'off');
    setChoiceGroup('subtitles-btns', 'subtitles', settings.subtitles ? 'on' : 'off');
    setChoiceGroup('visual-audio-cues-btns', 'visualAudioCues', settings.visualAudioCues ? 'on' : 'off');
  }

  _renderLocalLoadout() {
    const equipped = document.getElementById('inv-equipped');
    const grid = document.getElementById('inv-grid');
    const tabs = document.getElementById('inv-tabs');
    const title = document.getElementById('inv-username');
    if (title) title.textContent = 'Combat rig';
    tabs?.replaceChildren();
    equipped?.replaceChildren();
    grid?.replaceChildren();
    if (!grid) return;

    const currentPreset = Loadout.getCombatPreset();
    const currentGun = Loadout.getGun();
    const currentMelee = Loadout.getMelee();
    const abilitySlots = Loadout.getAbilityUiSlots();
    const gun = GUNS.find((weapon) => weapon.id === currentGun);
    const melee = MELEE.find((weapon) => weapon.id === currentMelee);
    const currentAbilitySlot = new Map(
      abilitySlots.map((slot) => [slot.ability.id, slot]),
    );

    if (equipped) {
      const roleChip = document.createElement('div');
      roleChip.className = 'local-loadout-chip';
      roleChip.dataset.combatPresetId = currentPreset.id;
      roleChip.textContent = `${currentPreset.displayName} preset`;
      equipped.appendChild(roleChip);
      const reserveChip = document.createElement('div');
      reserveChip.className = 'local-loadout-chip local-loadout-chip--quiet';
      reserveChip.textContent = `${gun?.name ?? 'Primary'} / ${melee?.name ?? 'Blade'} / ${currentPreset.helmetVariantId} helmet`;
      equipped.appendChild(reserveChip);
      const hint = document.createElement('div');
      hint.className = 'local-loadout-chip local-loadout-chip--hint';
      hint.textContent = 'Choose a weapon or ability node';
      equipped.appendChild(hint);
    }

    const board = document.createElement('section');
    board.className = 'loadout-command-board';

    const radial = document.createElement('div');
    radial.className = 'loadout-radial';
    radial.setAttribute('aria-label', 'Linked weapon and ability presets');

    const radialLegend = document.createElement('div');
    radialLegend.className = 'loadout-radial__legend';
    radialLegend.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: 'Preset-linked armory' }),
      Object.assign(document.createElement('span'), {
        textContent: 'Weapons choose the whole rig. Bright ability nodes are equipped.',
      }),
    );
    radial.appendChild(radialLegend);

    const presetRow = document.createElement('div');
    presetRow.className = 'local-loadout-packages';
    presetRow.setAttribute('role', 'group');
    presetRow.setAttribute('aria-label', 'Combat presets');

    const detail = document.createElement('aside');
    detail.className = 'loadout-detail';
    detail.setAttribute('aria-live', 'polite');
    const detailKicker = document.createElement('p');
    detailKicker.className = 'loadout-detail__kicker';
    const detailTitle = document.createElement('h3');
    detailTitle.className = 'loadout-detail__title';
    const detailCopy = document.createElement('p');
    detailCopy.className = 'loadout-detail__copy';
    const detailFacts = document.createElement('dl');
    detailFacts.className = 'loadout-detail__facts';
    const detailNote = document.createElement('p');
    detailNote.className = 'loadout-detail__note';
    detail.append(detailKicker, detailTitle, detailCopy, detailFacts, detailNote);

    const renderDetail = ({ kicker, heading, copy, facts, note }) => {
      detailKicker.textContent = kicker;
      detailTitle.textContent = heading;
      detailCopy.textContent = copy;
      detailFacts.replaceChildren();
      for (const [label, value] of facts) {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        detailFacts.append(term, description);
      }
      detailNote.textContent = note;
    };

    const presentationWeaponForPreset = (preset) => (
      preset.initialOfflineWeaponId === 'sword'
        ? MELEE.find((weapon) => weapon.id === preset.initialOfflineWeaponId)
        : GUNS.find((weapon) => weapon.id === preset.offlinePrimaryWeaponId)
    );

    const showPresetDetail = (preset) => {
      const primary = presentationWeaponForPreset(preset);
      const reserve = preset.initialOfflineWeaponId === 'sword'
        ? GUNS.find((weapon) => weapon.id === preset.offlinePrimaryWeaponId)
        : MELEE.find((weapon) => weapon.id === preset.offlineMeleeWeaponId);
      const slotLabels = ['E', 'F', 'Z'];
      renderDetail({
        kicker: 'Complete combat preset',
        heading: `${preset.displayName} / ${preset.roleLabel}`,
        copy: preset.description,
        facts: [
          ['Primary', primary?.name ?? preset.roleLabel],
          ['Reserve', reserve?.name ?? 'Arc Blade'],
          ['Helmet', `${preset.helmetVariantId} variant`],
          ['Abilities', preset.selectableAbilityIds.map((id, index) => (
            `${slotLabels[index]} ${ABILITY_PRESENTATION[id].shortName}`
          )).join(' / ')],
        ],
        note: preset.id === currentPreset.id
          ? 'Equipped for Practice and online authority.'
          : 'Select this weapon node to equip the complete preset.',
      });
    };

    const matchingScore = (preset) => preset.selectableAbilityIds.reduce(
      (score, abilityId) => score + Number(currentPreset.selectableAbilityIds.includes(abilityId)),
      0,
    );
    const linkedPresetForAbility = (abilityId) => COMBAT_PRESETS
      .filter((preset) => preset.selectableAbilityIds.includes(abilityId))
      .sort((left, right) => matchingScore(right) - matchingScore(left))[0] ?? currentPreset;

    const showAbilityDetail = (ability, linkedPreset) => {
      const selectedSlot = currentAbilitySlot.get(ability.id);
      const reach = ability.maximumRangeMeters !== null
        ? `${ability.maximumRangeMeters} m range`
        : ability.radiusMeters !== null
          ? `${ability.radiusMeters} m radius`
          : 'Self target';
      renderDetail({
        kicker: selectedSlot ? `Equipped on ${selectedSlot.inputLabel}` : 'Available through linked preset',
        heading: ability.displayName,
        copy: ability.description,
        facts: [
          ['Class', ability.category],
          ['Cooldown', `${ability.cooldownSeconds} seconds`],
          ['Charges', ability.charges === null ? 'Cooldown governed' : String(ability.charges)],
          ['Reach', reach],
          ['Authority', ability.authority],
        ],
        note: selectedSlot
          ? `${ability.displayName} is active in the ${currentPreset.displayName} preset.`
          : `Select this node to equip the linked ${linkedPreset.displayName} preset.`,
      });
    };

    for (const [presetIndex, preset] of COMBAT_PRESETS.entries()) {
      const selected = preset.id === currentPreset.id;
      const primary = presentationWeaponForPreset(preset);
      const button = document.createElement('button');
      button.className = `local-loadout-option${selected ? ' equipped' : ''}`;
      button.dataset.combatPresetId = preset.id;
      button.dataset.orbitIndex = String(presetIndex);
      button.setAttribute('aria-pressed', String(selected));
      button.title = preset.description;
      const thumb = getWeaponThumb(primary?.id ?? preset.offlinePrimaryWeaponId);
      const visual = thumb
        ? Object.assign(document.createElement('img'), {
            className: 'local-loadout-option__image',
            src: thumb,
            alt: '',
          })
        : Object.assign(document.createElement('span'), {
            className: 'local-loadout-option__fallback',
            textContent: preset.weaponFamily.slice(0, 2).toUpperCase(),
          });
      visual.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'local-loadout-option__copy';
      copy.replaceChildren(
        Object.assign(document.createElement('strong'), { textContent: preset.displayName }),
        Object.assign(document.createElement('span'), { textContent: primary?.name ?? preset.roleLabel }),
      );
      const equippedMarker = document.createElement('span');
      equippedMarker.className = 'local-loadout-option__state';
      equippedMarker.textContent = selected ? 'Equipped' : 'Choose';
      button.replaceChildren(visual, copy, equippedMarker);
      button.addEventListener('mouseenter', () => showPresetDetail(preset));
      button.addEventListener('focus', () => showPresetDetail(preset));
      button.addEventListener('click', () => {
        Loadout.setCombatPreset(preset.id);
        this._armorPreviewModelLoaded = false;
        this._renderLocalLoadout();
        this._showArmorPreview();
        queueMicrotask(() => document.querySelector(
          `.local-loadout-option[data-combat-preset-id="${preset.id}"]`,
        )?.focus());
      });
      presetRow.appendChild(button);
    }
    radial.appendChild(presetRow);

    const slotGrid = document.createElement('div');
    slotGrid.className = 'local-loadout-slots';
    slotGrid.setAttribute('role', 'group');
    slotGrid.setAttribute('aria-label', 'Ability nodes');
    const allAbilities = [
      abilitySlots[0].ability,
      ...Loadout.getSelectableAbilities(),
    ];
    for (const [abilityIndex, ability] of allAbilities.entries()) {
      const selectedSlot = currentAbilitySlot.get(ability.id);
      const selected = Boolean(selectedSlot);
      const linkedPreset = ability.locked ? currentPreset : linkedPresetForAbility(ability.id);
      const slotRoot = document.createElement('div');
      slotRoot.className = 'local-loadout-slot';
      slotRoot.dataset.abilityId = ability.id;
      slotRoot.dataset.orbitIndex = String(abilityIndex);
      const button = document.createElement('button');
      button.className = `local-loadout-ability${selected ? ' equipped' : ''}`;
      button.dataset.abilityId = ability.id;
      button.dataset.combatPresetId = linkedPreset.id;
      if (selectedSlot) button.dataset.abilitySlot = String(selectedSlot.slot);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', selectedSlot
        ? `${ability.displayName}, equipped on ${selectedSlot.inputLabel}`
        : `${ability.displayName}, equips the linked ${linkedPreset.displayName} preset`);
      button.title = ability.description;
      const glyphWrap = document.createElement('span');
      glyphWrap.className = 'local-loadout-ability__glyph';
      glyphWrap.appendChild(createAbilityGlyph(
        ability.id,
        'ability-glyph ability-glyph--loadout',
      ));
      const abilityCopy = document.createElement('span');
      abilityCopy.className = 'local-loadout-ability__copy';
      abilityCopy.replaceChildren(
        Object.assign(document.createElement('strong'), { textContent: ability.shortName }),
        Object.assign(document.createElement('span'), {
          textContent: selectedSlot ? ability.category : linkedPreset.displayName,
        }),
      );
      const key = document.createElement('span');
      key.className = 'local-loadout-slot__key';
      key.textContent = selectedSlot?.inputLabel ?? '+';
      button.replaceChildren(glyphWrap, abilityCopy, key);
      button.addEventListener('mouseenter', () => showAbilityDetail(ability, linkedPreset));
      button.addEventListener('focus', () => showAbilityDetail(ability, linkedPreset));
      button.addEventListener('click', () => {
        showAbilityDetail(ability, linkedPreset);
        if (selected || ability.locked) return;
        Loadout.setCombatPreset(linkedPreset.id);
        this._armorPreviewModelLoaded = false;
        this._renderLocalLoadout();
        this._showArmorPreview();
        queueMicrotask(() => document.querySelector(
          `.local-loadout-ability[data-ability-id="${ability.id}"]`,
        )?.focus());
      });
      slotRoot.appendChild(button);
      if (ability.locked) {
        slotRoot.dataset.locked = 'true';
      }
      slotGrid.appendChild(slotRoot);
    }
    radial.appendChild(slotGrid);

    board.append(radial, detail);
    grid.appendChild(board);
    const packageNote = document.createElement('p');
    packageNote.className = 'local-loadout-note';
    packageNote.textContent = 'Presets are complete deployment rigs: primary weapon, opening weapon, helmet, and E/F/Z abilities move together. Blink remains fixed to Q.';
    grid.appendChild(packageNote);
    showPresetDetail(currentPreset);
    this._requestLoadoutThumbnails();
  }

  setUsername(displayName) {
    this._displayName = displayName || 'Recruit';
    if (this.nameInput) this.nameInput.value = this._displayName;
    for (const id of ['nav-username', 'profile-username']) {
      const element = document.getElementById(id);
      if (element) element.textContent = this._displayName;
    }
  }

  _chrome(show) {
    document.getElementById('nav-side')?.classList.toggle('hidden', !show);
  }

  showMain() {
    document.body.classList.remove('kyx-paused');
    this.topNav?.classList.remove('hidden');
    this.centerPlay?.classList.remove('hidden');
    this.pauseMenu?.classList.add('hidden');
    if (this.gameCanvas) this.gameCanvas.tabIndex = -1;
    this._chrome(true);
    queueMicrotask(() => this.playBtn?.focus());
  }

  hideMain() {
    this.topNav?.classList.add('hidden');
    this.centerPlay?.classList.add('hidden');
    if (this.gameCanvas) this.gameCanvas.tabIndex = 0;
    this._chrome(false);
    this._closeAllPanels();
  }

  showPause() {
    if (!this.pauseMenu) return;
    document.body.classList.add('kyx-paused');
    if (this.pauseLockStatus) {
      this.pauseLockStatus.textContent = '';
      this.pauseLockStatus.classList.add('hidden');
    }
    this.pauseMenu.inert = false;
    this.pauseMenu.classList.remove('hidden');
    queueMicrotask(() => focusFirst(this.pauseMenu));
  }

  showPointerLockError() {
    if (this.pauseLockStatus) {
      this.pauseLockStatus.textContent = 'Pointer lock was denied. Check browser permissions, then activate Resume to retry.';
      this.pauseLockStatus.classList.remove('hidden');
    }
    queueMicrotask(() => focusFirst(this.pauseMenu));
  }

  hidePause() {
    document.body.classList.remove('kyx-paused');
    if (this.pauseMenu) {
      this.pauseMenu.inert = true;
      this.pauseMenu.classList.add('hidden');
    }
    this._closeAllPanels();
  }

  showGameOver(stats, title = 'Practice run complete') {
    document.body.classList.remove('kyx-paused');
    const heading = document.getElementById('gameover-title');
    if (heading) heading.textContent = sentenceCaseLabel(title);
    if (this.gameoverStats) {
      this.gameoverStats.replaceChildren(
        createStatRow('Bots defeated', stats.kills),
        createStatRow('Score', stats.score),
        createStatRow('Time', formatDuration(stats.time)),
      );
    }
    if (this.gameoverMenu) {
      this.gameoverMenu.inert = false;
      this.gameoverMenu.classList.remove('hidden');
      queueMicrotask(() => focusFirst(this.gameoverMenu));
    }
  }

  hideGameOver() {
    if (this.gameoverMenu) {
      this.gameoverMenu.inert = true;
      this.gameoverMenu.classList.add('hidden');
    }
  }
}
