import { getSkin } from '../player/skins.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { GameSettings } from '../core/GameSettings.js';
import { GAME_MODES } from '../core/GameModes.js';
import { GUNS, MELEE, Loadout } from '../core/Loadout.js';
import { ABILITY_PRESENTATION } from '../abilities/abilityLoadout.ts';
import { createAbilityGlyph } from './abilityGlyph.ts';
import { COMBAT_PRESETS } from '../loadouts/combatPresets.ts';
import { listMapLibrarySections } from '../content/maps/library.ts';
import { ControllerMenuNavigator } from './ControllerNavigation.js';
import { focusFirst, moveFocusSpatial, trapTabWithin } from './KeyboardFocus.js';

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
  constructor() {
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
    this.selectedMapId = 'iron_bastion';
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
    this._buildMapLibrary();
    this._buildSettings();
    this._wireNav();
    this._controllerNavigation = new ControllerMenuNavigator({
      getScope: () => this._activeFocusScope(),
      onBack: () => this._handleBackNavigation(),
    });
    this._controllerNavigation.start();
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

  _startPractice(modeId, mapId = 'iron_bastion') {
    if (modeId) this.selectedModeId = modeId;
    this.selectedMapId = mapId;
    this._closeAllPanels();
    this._closeAllDropdowns();
    if (mapId === 'inkfall_foundry_rev5') {
      window.location.assign('/practice');
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
    if (id === 'loadout') this._renderLocalLoadout();
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

  _buildMapLibrary() {
    const root = document.getElementById('map-library-sections');
    if (!root) return;
    root.replaceChildren();

    for (const section of listMapLibrarySections()) {
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
        } else {
          const link = document.createElement('a');
          link.className = entry.action.kind === 'open_review_route'
            ? 'map-library__action'
            : 'map-library__reference';
          link.href = entry.action.href;
          link.textContent = entry.action.kind === 'open_local_authority_practice'
            ? 'Play local authority'
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

        article.append(descriptionColumn, actionColumn);
        entries.appendChild(article);
      }

      sectionNode.append(sectionHead, entries);
      root.appendChild(sectionNode);
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
    if (title) title.textContent = 'Loadout';
    tabs?.replaceChildren();
    equipped?.replaceChildren();
    grid?.replaceChildren();
    if (!grid) return;

    const currentPreset = Loadout.getCombatPreset();
    const currentGun = Loadout.getGun();
    const currentMelee = Loadout.getMelee();
    const abilitySlots = Loadout.getAbilityUiSlots();
    if (equipped) {
      const gun = GUNS.find((weapon) => weapon.id === currentGun);
      const roleChip = document.createElement('div');
      roleChip.className = 'local-loadout-chip';
      roleChip.dataset.combatPresetId = currentPreset.id;
      roleChip.textContent = `${currentPreset.displayName} · ${currentPreset.roleLabel} · ${gun?.name ?? 'Default'}`;
      equipped.appendChild(roleChip);
      const melee = MELEE.find((weapon) => weapon.id === currentMelee);
      const reserveChip = document.createElement('div');
      reserveChip.className = 'local-loadout-chip local-loadout-chip--quiet';
      reserveChip.textContent = `${melee?.name ?? 'Blade'} · ${currentPreset.helmetVariantId} helmet`;
      equipped.appendChild(reserveChip);
    }

    const presetHeading = document.createElement('div');
    presetHeading.className = 'inv-section-label';
    presetHeading.textContent = 'Combat package';
    grid.appendChild(presetHeading);
    const presetRow = document.createElement('div');
    presetRow.className = 'local-loadout-packages';
    for (const preset of COMBAT_PRESETS) {
      const selected = preset.id === currentPreset.id;
      const button = document.createElement('button');
      button.className = `local-loadout-option${selected ? ' equipped' : ''}`;
      button.dataset.combatPresetId = preset.id;
      button.setAttribute('aria-pressed', String(selected));
      button.title = preset.description;
      button.textContent = `${preset.displayName} · ${preset.roleLabel}`;
      button.addEventListener('click', () => {
        Loadout.setCombatPreset(preset.id);
        this._renderLocalLoadout();
      });
      presetRow.appendChild(button);
    }
    grid.appendChild(presetRow);

    const abilityHeading = document.createElement('div');
    abilityHeading.className = 'inv-section-label';
    abilityHeading.textContent = 'Ability slots';
    grid.appendChild(abilityHeading);
    const slotGrid = document.createElement('div');
    slotGrid.className = 'local-loadout-slots';
    const blink = abilitySlots[0];
    const blinkSlot = document.createElement('div');
    blinkSlot.className = 'local-loadout-slot';
    blinkSlot.appendChild(Object.assign(document.createElement('span'), {
      className: 'local-loadout-slot__key',
      textContent: blink.inputLabel,
    }));
    const blinkButton = document.createElement('button');
    blinkButton.className = 'local-loadout-ability equipped';
    blinkButton.disabled = true;
    blinkButton.setAttribute('aria-label', `${blink.ability.displayName}, fixed to ${blink.inputLabel}`);
    blinkButton.replaceChildren(
      createAbilityGlyph(blink.ability.id, 'ability-glyph ability-glyph--loadout'),
      Object.assign(document.createElement('span'), {
        textContent: `${blink.ability.displayName} · Fixed`,
      }),
    );
    blinkSlot.appendChild(blinkButton);
    slotGrid.appendChild(blinkSlot);

    for (const slot of abilitySlots.slice(1)) {
      const slotIndex = slot.slot - 1;
      const slotRoot = document.createElement('div');
      slotRoot.className = 'local-loadout-slot';
      slotRoot.appendChild(Object.assign(document.createElement('span'), {
        className: 'local-loadout-slot__key',
        textContent: slot.inputLabel,
      }));
      const candidateIds = [...new Set(COMBAT_PRESETS.map(
        (preset) => preset.selectableAbilityIds[slotIndex],
      ))];
      for (const abilityId of candidateIds) {
        const candidatePresets = COMBAT_PRESETS
          .filter((preset) => preset.selectableAbilityIds[slotIndex] === abilityId)
          .sort((left, right) => {
            const matchingOtherSlots = (preset) => preset.selectableAbilityIds.reduce(
              (count, candidateAbilityId, index) => (
                count + Number(index !== slotIndex
                  && candidateAbilityId === currentPreset.selectableAbilityIds[index])
              ),
              0,
            );
            return matchingOtherSlots(right) - matchingOtherSlots(left);
          });
        const candidatePreset = candidatePresets[0];
        if (!candidatePreset) continue;
        const ability = ABILITY_PRESENTATION[abilityId];
        const selected = currentPreset.selectableAbilityIds[slotIndex] === abilityId;
        const button = document.createElement('button');
        button.className = `local-loadout-ability${selected ? ' equipped' : ''}`;
        button.dataset.abilitySlot = String(slot.slot);
        button.dataset.abilityId = abilityId;
        button.dataset.combatPresetId = candidatePreset.id;
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute(
          'aria-label',
          `${ability.displayName}, key ${slot.inputLabel}. Equips the linked ${candidatePreset.displayName} combat package.`,
        );
        button.title = `${ability.description} Linked package: ${candidatePreset.displayName}.`;
        button.replaceChildren(
          createAbilityGlyph(abilityId, 'ability-glyph ability-glyph--loadout'),
          Object.assign(document.createElement('span'), {
            textContent: `${ability.shortName} · ${candidatePreset.displayName}`,
          }),
        );
        button.addEventListener('click', () => {
          Loadout.setCombatPreset(candidatePreset.id);
          this._renderLocalLoadout();
        });
        slotRoot.appendChild(button);
      }
      slotGrid.appendChild(slotRoot);
    }
    grid.appendChild(slotGrid);
    const packageNote = document.createElement('p');
    packageNote.className = 'local-loadout-note';
    packageNote.textContent = 'Ability choices equip the compatible combat package.';
    grid.appendChild(packageNote);
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
