import { getSkin } from '../player/skins.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { GameSettings } from '../core/GameSettings.js';
import { GAME_MODES } from '../core/GameModes.js';
import { GUNS, MELEE, Loadout } from '../core/Loadout.js';
import { focusFirst, trapTabWithin } from './KeyboardFocus.js';

const SAFE_PANELS = new Set(['loadout', 'modes', 'settings']);

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

function createStatRow(label, value) {
  const row = document.createElement('div');
  const labelNode = document.createTextNode(label);
  const valueNode = document.createElement('span');
  valueNode.textContent = value;
  row.append(labelNode, valueNode);
  return row;
}

export class MenuUI {
  constructor() {
    this.topNav = document.getElementById('top-nav');
    this.centerPlay = document.getElementById('center-play');
    this.nameInput = document.getElementById('player-name');
    this.playBtn = document.getElementById('play-btn');
    this.pauseMenu = document.getElementById('pause-menu');
    this.pauseLockStatus = document.getElementById('pause-lock-status');
    this.gameoverMenu = document.getElementById('gameover-menu');
    this.gameoverStats = document.getElementById('gameover-stats');

    this.selectedSkinId = getSkin().id;
    this.selectedArmorId = loadArmorType();
    this.selectedModeId = GAME_MODES[0].id;
    this._displayName = 'Recruit';
    this._activePanel = null;
    this._panelReturnFocus = null;
    this._settingsStatusTimer = null;

    this.onPlay = null;
    this.onResume = null;
    this.onQuit = null;
    this.onRestart = null;
    this.onBackToMenu = null;
    this.onArmorChanged = null;
    this.onSettingsSaved = null;
    this.onProfileEdit = null;

    this._buildModeCards();
    this._buildSettings();
    this._wireNav();
  }

  _wireNav() {
    const startPractice = (modeId) => {
      if (modeId) this.selectedModeId = modeId;
      this._closeAllPanels();
      this._closeAllDropdowns();
      const name = this.nameInput?.value.trim() || this._displayName || 'Recruit';
      this.onPlay?.(name, this.selectedSkinId, this.selectedModeId, this.selectedArmorId);
    };

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
    document.getElementById('inv-close-btn')?.addEventListener('click', () => this._closeAllPanels(true));

    document.addEventListener('keydown', (event) => {
      const activeDialog = [this.pauseMenu, this.gameoverMenu].find(
        (dialog) => dialog && !dialog.classList.contains('hidden'),
      );
      if (activeDialog) trapTabWithin(activeDialog, event);
    });
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
    panel?.classList.remove('hidden');
    trigger?.classList.add('active');
    trigger?.setAttribute('aria-expanded', 'true');
    if (id === 'loadout') this._renderLocalLoadout();
    if (id === 'settings') this._loadSettings();
    queueMicrotask(() => focusFirst(panel));
  }

  _closeAllPanels(restoreFocus = false) {
    const returnFocus = this._panelReturnFocus;
    this._activePanel = null;
    this._panelReturnFocus = null;
    document.querySelectorAll('.nav-panel').forEach((panel) => panel.classList.add('hidden'));
    document.querySelectorAll('[data-panel]').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    });
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
        this.selectedModeId = mode.id;
        const playerName = this.nameInput?.value.trim() || this._displayName || 'Recruit';
        this.onPlay?.(playerName, this.selectedSkinId, mode.id, this.selectedArmorId);
      });
      root.appendChild(button);
    }
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
          ? 'SETTINGS SAVED ON THIS DEVICE'
          : 'STORAGE UNAVAILABLE — SETTINGS ACTIVE FOR THIS SESSION';
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
    if (title) title.textContent = `${this._displayName} · LOCAL PRACTICE`;
    tabs?.replaceChildren();
    equipped?.replaceChildren();
    grid?.replaceChildren();
    if (!grid) return;

    const currentGun = Loadout.getGun();
    const currentMelee = Loadout.getMelee();
    if (equipped) {
      const gun = GUNS.find((weapon) => weapon.id === currentGun);
      const melee = MELEE.find((weapon) => weapon.id === currentMelee);
      for (const [label, weapon] of [['PRIMARY', gun], ['MELEE', melee]]) {
        const chip = document.createElement('div');
        chip.className = 'local-loadout-chip';
        chip.textContent = `${label} · ${weapon?.name ?? 'DEFAULT'}`;
        equipped.appendChild(chip);
      }
    }

    const renderGroup = (heading, weapons, selectedId, select) => {
      const headingNode = document.createElement('div');
      headingNode.className = 'inv-section-label';
      headingNode.textContent = heading;
      grid.appendChild(headingNode);
      for (const weapon of weapons) {
        const button = document.createElement('button');
        button.className = `local-loadout-option${weapon.id === selectedId ? ' equipped' : ''}`;
        button.textContent = `${weapon.name}${weapon.id === selectedId ? ' · EQUIPPED' : ''}`;
        button.addEventListener('click', () => {
          select(weapon.id);
          this._renderLocalLoadout();
        });
        grid.appendChild(button);
      }
    };
    renderGroup('PRIMARY WEAPON', GUNS, currentGun, (id) => Loadout.setGun(id));
    renderGroup('MELEE WEAPON', MELEE, currentMelee, (id) => Loadout.setMelee(id));
  }

  setUsername(displayName) {
    this._displayName = displayName || 'Recruit';
    if (this.nameInput) this.nameInput.value = this._displayName;
    for (const id of ['nav-username', 'inv-username', 'profile-username']) {
      const element = document.getElementById(id);
      if (element) element.textContent = this._displayName;
    }
  }

  _chrome(show) {
    document.getElementById('nav-side')?.classList.toggle('hidden', !show);
  }

  showMain() {
    this.topNav?.classList.remove('hidden');
    this.centerPlay?.classList.remove('hidden');
    this.pauseMenu?.classList.add('hidden');
    this._chrome(true);
    queueMicrotask(() => this.playBtn?.focus());
  }

  hideMain() {
    this.topNav?.classList.add('hidden');
    this.centerPlay?.classList.add('hidden');
    this._chrome(false);
    this._closeAllPanels();
  }

  showPause() {
    if (!this.pauseMenu) return;
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
      this.pauseLockStatus.textContent = 'POINTER LOCK DENIED — CHECK BROWSER PERMISSIONS, THEN ACTIVATE RESUME TO RETRY';
      this.pauseLockStatus.classList.remove('hidden');
    }
    queueMicrotask(() => focusFirst(this.pauseMenu));
  }

  hidePause() {
    if (this.pauseMenu) {
      this.pauseMenu.inert = true;
      this.pauseMenu.classList.add('hidden');
    }
    this._closeAllPanels();
  }

  showGameOver(stats, title = 'PRACTICE RUN COMPLETE') {
    const heading = document.getElementById('gameover-title');
    if (heading) heading.textContent = title;
    if (this.gameoverStats) {
      this.gameoverStats.replaceChildren(
        createStatRow('KILLS', stats.kills),
        createStatRow('SCORE', stats.score),
        createStatRow('TIME', formatDuration(stats.time)),
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
