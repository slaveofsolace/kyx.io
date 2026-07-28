import { getWeaponThumb } from './WeaponThumbnails.js';
import { isDamageDirection } from './DamageDirection.js';

function sentenceCaseHudText(value) {
  const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (!normalized) return '';
  const prepared = normalized === normalized.toUpperCase()
    ? normalized.toLocaleLowerCase()
    : normalized;
  return prepared.charAt(0).toLocaleUpperCase() + prepared.slice(1);
}

export class HUD {
  constructor() {
    this.root        = document.getElementById('hud');
    this.healthWrap  = document.getElementById('health-wrap');
    this.healthBar   = document.getElementById('health-bar');
    this.healthText  = document.getElementById('health-text');
    this.healthState = document.getElementById('health-state');
    this.shieldWrap  = document.getElementById('shield-wrap');
    this.shieldBar   = document.getElementById('shield-bar');
    this.shieldText  = document.getElementById('shield-text');
    this.staminaWrap = document.getElementById('stamina-wrap');
    this.staminaBar  = document.getElementById('stamina-bar');
    this.staminaText = document.getElementById('stamina-text');
    this.staminaState = document.getElementById('stamina-state');
    this.weaponName  = document.getElementById('weapon-name');
    this.weaponWrap  = document.getElementById('weapon-wrap');
    this.ammoText    = document.getElementById('ammo-text');
    this.reloadText  = document.getElementById('reload-text');
    this.killCount   = document.getElementById('kill-count');
    this.scoreCount  = document.getElementById('score-count');
    this.practiceStatus = document.getElementById('server-pop');
    this.weaponSlots = document.getElementById('weapon-slots');
    this.hitmarker   = document.getElementById('hitmarker');
    this.damageFlash = document.getElementById('damage-flash');
    this.killfeed    = document.getElementById('killfeed');
    this.killConfirmation = document.getElementById('kill-confirmation');
    this.killConfirmationLabel = document.getElementById('kill-confirmation-label');
    this.killConfirmationDetail = document.getElementById('kill-confirmation-detail');
    this.modeInfo    = document.getElementById('mode-info');
    this.dmTimer        = document.getElementById('dm-timer');
    this.streakBadge    = document.getElementById('streak-badge');
    this.downedOverlay  = document.getElementById('downed-overlay');
    this.downedBar      = document.getElementById('downed-bar');
    this.downedCountdown = document.getElementById('downed-countdown');
    this.waveBanner     = document.getElementById('wave-banner');
    this._teleportFlash    = document.getElementById('teleport-flash');
    this._abilityQ         = document.getElementById('ability-q');
    this._abilityQState    = document.getElementById('ability-q-state');
    this.damageDirection   = document.getElementById('damage-direction');
    this.damageDirectionText = document.getElementById('damage-direction-text');
    this.abilityReason     = document.getElementById('ability-reason');
    this.interactionPrompt = document.getElementById('interaction-prompt');
    this.interactionKey    = document.getElementById('interaction-key');
    this.interactionText   = document.getElementById('interaction-text');
    this.connectionWarning = document.getElementById('connection-warning');
    this.connectionWarningDetail = document.getElementById('connection-warning-detail');
    this._hitmarkerTimeout    = null;
    this._damageTimeout       = null;
    this._waveBannerTimer     = null;
    this._streakTimeout       = null;
    this._teleportFlashTimeout = null;
    this._damageDirectionTimeout = null;
    this._abilityReasonTimeout = null;
    this._killConfirmationTimeout = null;
  }

  show() { this.root?.classList.remove('hidden'); }
  hide() {
    this.root?.classList.add('hidden');
    this.clearTransientEvents();
  }

  // Mode-specific top-center overlay (timer, wave, lives, + optional 3rd line).
  setModeHUD(primary, secondary = '', tertiary = '') {
    this.modeInfo.classList.remove('hidden');
    this.modeInfo.textContent = '';
    const p = document.createElement('span');
    p.className = 'mode-primary';
    p.textContent = sentenceCaseHudText(primary);
    this.modeInfo.appendChild(p);
    if (secondary) {
      const s = document.createElement('span');
      s.className = 'mode-secondary';
      s.textContent = sentenceCaseHudText(secondary);
      this.modeInfo.appendChild(s);
    }
    if (tertiary) {
      const t = document.createElement('span');
      t.className = 'mode-tertiary';
      t.textContent = sentenceCaseHudText(tertiary);
      this.modeInfo.appendChild(t);
    }
  }

  hideModeHUD() { this.modeInfo.classList.add('hidden'); }

  // Survival wave-score multiplier (top-right).
  setWaveBonus(mult) {
    let el = document.getElementById('wave-bonus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wave-bonus';
      (this.root || document.getElementById('hud') || document.body).appendChild(el);
    }
    el.classList.remove('hidden');
    el.textContent = '';
    const label = document.createElement('span');
    label.className = 'wb-label';
    label.textContent = 'Wave score';
    const value = document.createElement('span');
    value.className = 'wb-mult';
    value.textContent = `${mult}x`;
    el.append(label, value);
  }
  hideWaveBonus() { document.getElementById('wave-bonus')?.classList.add('hidden'); }

  // Large centered deathmatch countdown timer
  showDMTimer(timeStr, isLow = false) {
    this.dmTimer.textContent = timeStr;
    this.dmTimer.classList.remove('hidden');
    this.dmTimer.classList.toggle('dm-low', isLow);
    this.dmTimer.setAttribute('aria-label', `Round time ${timeStr}${isLow ? ', time low' : ''}`);
  }
  hideDMTimer() { this.dmTimer.classList.add('hidden'); }

  // Kill streak badge (shown briefly above the DM timer)
  showStreak(streak) {
    if (streak < 2) return;
    this.streakBadge.textContent = `${streak} target streak`;
    this.streakBadge.classList.remove('hidden');
    clearTimeout(this._streakTimeout);
    this._streakTimeout = setTimeout(() => this.streakBadge.classList.add('hidden'), 2500);
  }

  // Survival: downed overlay with countdown bar
  showDowned(secsLeft, totalSecs) {
    this.downedOverlay.classList.remove('hidden');
    const pct = Math.max(0, (secsLeft / totalSecs) * 100);
    if (this.downedBar) this.downedBar.style.width = pct + '%';
    if (this.downedCountdown) this.downedCountdown.textContent = Math.ceil(Math.max(0, secsLeft));
  }
  hideDowned() { this.downedOverlay.classList.add('hidden'); }

  // Survival: wave banner (auto-removes after animation)
  showWaveBanner(text) {
    this.waveBanner.textContent = sentenceCaseHudText(text);
    this.waveBanner.classList.remove('hidden');
    clearTimeout(this._waveBannerTimer);
    this._waveBannerTimer = setTimeout(() => this.waveBanner.classList.add('hidden'), 3000);
  }

  buildWeaponSlots(slots, activeIndex) {
    this.weaponSlots.replaceChildren();
    slots.forEach((slot, i) => {
      const key = (typeof slot === 'object') ? slot.key : slot;
      const id  = (typeof slot === 'object') ? slot.id  : null;
      const el = document.createElement('div');
      el.className = 'weapon-slot' + (i === activeIndex ? ' active' : '');
      el.dataset.index = i;

      const thumb = id ? getWeaponThumb(id) : null;
      if (thumb) {
        const img = document.createElement('div');
        img.className = 'ws-thumb';
        img.style.backgroundImage = `url(${thumb})`;
        el.appendChild(img);
      }
      const k = document.createElement('span');
      k.className = 'ws-key';
      k.textContent = key;
      el.appendChild(k);

      this.weaponSlots.appendChild(el);
    });
  }

  setActiveSlot(index) {
    this.weaponSlots.querySelectorAll('.weapon-slot').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
  }

  update(player, weaponInfo, kills, score) {
    const hpct = Math.max(0, (player.health / player.maxHealth) * 100);
    const healthValue = Math.ceil(player.health);
    this.healthBar.style.width  = `${hpct}%`;
    this.healthText.textContent = healthValue;
    const healthState = hpct <= 25 ? 'critical' : hpct <= 50 ? 'low' : 'stable';
    this.healthWrap.dataset.state = healthState;
    this.healthWrap.setAttribute(
      'aria-label',
      `Health ${healthValue} of ${Math.ceil(player.maxHealth)}${healthState === 'stable' ? '' : `, ${healthState}`}`,
    );
    this.healthState.textContent = healthState === 'critical' ? 'Critical' : 'Low';
    this.healthState.classList.toggle('hidden', healthState === 'stable');

    if (player.maxShield > 0) {
      this.shieldWrap.classList.remove('hidden');
      const spct = Math.max(0, (player.shield / player.maxShield) * 100);
      this.shieldBar.style.width  = `${spct}%`;
      this.shieldText.textContent = Math.ceil(player.shield);
      this.shieldWrap.setAttribute(
        'aria-label',
        `Shield ${Math.ceil(player.shield)} of ${Math.ceil(player.maxShield)}`,
      );
    } else {
      this.shieldWrap.classList.add('hidden');
    }

    const spct = Math.max(0, (player.stamina / player.maxStamina) * 100);
    this.staminaBar.style.width  = `${spct}%`;
    this.staminaText.textContent = Math.ceil(player.stamina);
    this.staminaBar.classList.toggle('stamina-low', player.stamina < 25);
    this.staminaState.textContent = 'Low';
    this.staminaState.classList.toggle('hidden', player.stamina >= 25);
    this.staminaWrap?.setAttribute(
      'aria-label',
      `Energy ${Math.ceil(player.stamina)} of ${Math.ceil(player.maxStamina)}${player.stamina < 25 ? ', low' : ''}`,
    );

    this.weaponName.textContent = weaponInfo.name;
    this.ammoText.textContent = weaponInfo.isMelee
      ? '∞'
      : `${weaponInfo.magAmmo} / ${weaponInfo.reserveAmmo}`;
    this.reloadText.classList.toggle('hidden', !weaponInfo.isReloading);
    this.weaponWrap?.setAttribute(
      'aria-label',
      weaponInfo.isMelee
        ? `${weaponInfo.name}, melee weapon`
        : `${weaponInfo.name}, ${weaponInfo.magAmmo} rounds loaded, ${weaponInfo.reserveAmmo} reserve${weaponInfo.isReloading ? ', reloading' : ''}`,
    );

    this.killCount.textContent  = kills;
    this.scoreCount.textContent = score;
  }

  updateGrenades(frags, smokes) {
    const safeFrags = Number.isFinite(frags) ? Math.max(0, Math.floor(frags)) : 0;
    const safeSmokes = Number.isFinite(smokes) ? Math.max(0, Math.floor(smokes)) : 0;
    this.updateAbilitySlot('frag', {
      name: 'Frag',
      count: safeFrags,
      state: safeFrags > 0 ? 'ready' : 'empty',
      stateLabel: safeFrags > 0 ? 'Ready' : 'Empty',
      ready: safeFrags > 0,
    });
    this.updateAbilitySlot('smoke', {
      name: 'Smoke',
      count: safeSmokes,
      state: safeSmokes > 0 ? 'ready' : 'empty',
      stateLabel: safeSmokes > 0 ? 'Ready' : 'Empty',
      ready: safeSmokes > 0,
    });
  }

  /**
   * Runtime-generic loadout hook. Blink remains the fixed Q slot; the ability
   * runtime may populate the three selectable E/F/Z slots without replacing
   * HUD markup or relying on ability-specific CSS selectors.
   */
  updateAbilitySlot(abilityId, {
    name,
    key,
    state = 'assigned',
    stateLabel = 'Assigned',
    count = null,
    ready = state === 'ready',
  } = {}) {
    const safeId = String(abilityId ?? '').replace(/[^a-z0-9_-]/giu, '').slice(0, 32);
    if (!safeId) return false;
    const slot = this.root?.querySelector?.(`[data-ability-id="${safeId}"]`);
    if (!slot) return false;
    const safeKey = String(key ?? slot.dataset.abilityKey ?? '')
      .replace(/[^A-Z0-9]/giu, '')
      .slice(0, 3)
      .toUpperCase();
    const safeName = sentenceCaseHudText(name ?? safeId).slice(0, 24);
    const safeState = String(state ?? 'assigned')
      .replace(/[^a-z0-9_-]/giu, '')
      .slice(0, 24) || 'assigned';
    const safeStateLabel = sentenceCaseHudText(stateLabel ?? safeState).slice(0, 28);
    const keyElement = slot.querySelector?.('.ability-key');
    const nameElement = slot.querySelector?.('.ability-name');
    const stateElement = slot.querySelector?.('.ability-state');
    const countElement = slot.querySelector?.('.ability-count');
    if (keyElement && safeKey) keyElement.textContent = safeKey;
    if (nameElement) nameElement.textContent = safeName;
    if (stateElement) stateElement.textContent = safeStateLabel;
    if (countElement) countElement.textContent = Number.isFinite(count) ? `${Math.max(0, Math.floor(count))}` : '';
    slot.dataset.abilityId = safeId;
    if (safeKey) slot.dataset.abilityKey = safeKey;
    slot.dataset.state = safeState;
    slot.classList.toggle('ready', ready === true);
    slot.setAttribute(
      'aria-label',
      `${safeName}${safeKey ? `, ${safeKey}` : ''}, ${safeStateLabel.toLocaleLowerCase()}`,
    );
    return true;
  }

  flashHitmarker(headshot = false) {
    this.hitmarker.classList.remove('show', 'headshot');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (headshot) this.hitmarker.classList.add('headshot');
    clearTimeout(this._hitmarkerTimeout);
    this._hitmarkerTimeout = setTimeout(() => this.hitmarker.classList.remove('show', 'headshot'), 160);
  }

  showHeadshotFlair() {
    const el = document.createElement('div');
    el.className = 'hs-flair';
    el.textContent = 'Headshot confirmed';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  flashTeleport() {
    if (!this._teleportFlash) return;
    this._teleportFlash.classList.remove('show');
    void this._teleportFlash.offsetWidth;
    this._teleportFlash.classList.add('show');
    clearTimeout(this._teleportFlashTimeout);
    this._teleportFlashTimeout = setTimeout(() => this._teleportFlash.classList.remove('show'), 300);
  }

  updateTeleport(ratio) {
    if (!this._abilityQ) return;
    const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    const ready = safeRatio >= 1;
    this._abilityQ.style.setProperty('--ratio', safeRatio);
    this._abilityQ.classList.toggle('ready', ready);
    this._abilityQ.dataset.state = ready ? 'ready' : 'charging';
    if (this._abilityQState) this._abilityQState.textContent = ready ? 'Ready' : `Charging ${Math.round(safeRatio * 100)}%`;
    this._abilityQ.setAttribute('aria-label', ready ? 'Blink, Q, ready' : `Blink, Q, charging ${Math.round(safeRatio * 100)} percent`);
  }

  showAbilityUnavailable(key, reason, durationMs = 1_400) {
    if (!this.abilityReason || typeof reason !== 'string' || !reason.trim()) return false;
    const safeKey = String(key ?? '').replace(/[^A-Z0-9]/giu, '').slice(0, 6) || 'ABILITY';
    const safeReason = sentenceCaseHudText(reason.replace(/\s+/gu, ' ').trim().slice(0, 80));
    this.abilityReason.textContent = `${safeKey.toUpperCase()}: ${safeReason}`;
    this.abilityReason.classList.remove('hidden');
    clearTimeout(this._abilityReasonTimeout);
    const safeDuration = Number.isFinite(durationMs) ? Math.min(5_000, Math.max(500, durationMs)) : 1_400;
    this._abilityReasonTimeout = setTimeout(() => this.abilityReason.classList.add('hidden'), safeDuration);
    return true;
  }

  showDamageDirection(direction, durationMs = 750) {
    if (!this.damageDirection || !this.damageDirectionText || !isDamageDirection(direction)) return false;
    this.damageDirection.dataset.direction = direction;
    const directionLabel = {
      front: 'ahead',
      rear: 'behind',
      left: 'left',
      right: 'right',
    }[direction];
    this.damageDirectionText.textContent = `Damage ${directionLabel}`;
    this.damageDirection.classList.remove('hidden');
    clearTimeout(this._damageDirectionTimeout);
    const safeDuration = Number.isFinite(durationMs) ? Math.min(3_000, Math.max(300, durationMs)) : 750;
    this._damageDirectionTimeout = setTimeout(() => this.damageDirection.classList.add('hidden'), safeDuration);
    return true;
  }

  showInteractionPrompt(key, text) {
    if (!this.interactionPrompt || typeof text !== 'string' || !text.trim()) return false;
    if (this.interactionKey) this.interactionKey.textContent = String(key ?? 'E').replace(/\s+/gu, '').slice(0, 8).toUpperCase();
    if (this.interactionText) this.interactionText.textContent = sentenceCaseHudText(text.replace(/\s+/gu, ' ').trim().slice(0, 80));
    this.interactionPrompt.classList.remove('hidden');
    return true;
  }

  hideInteractionPrompt() {
    this.interactionPrompt?.classList.add('hidden');
  }

  setConnectionWarning(visible, detail = '') {
    if (!this.connectionWarning) return false;
    this.connectionWarning.classList.toggle('hidden', visible !== true);
    if (this.connectionWarningDetail) {
      this.connectionWarningDetail.textContent = visible
        ? sentenceCaseHudText(String(detail).replace(/\s+/gu, ' ').trim().slice(0, 80))
        : '';
    }
    return true;
  }

  clearTransientEvents() {
    clearTimeout(this._damageDirectionTimeout);
    clearTimeout(this._abilityReasonTimeout);
    clearTimeout(this._killConfirmationTimeout);
    this._damageDirectionTimeout = null;
    this._abilityReasonTimeout = null;
    this._killConfirmationTimeout = null;
    this.damageDirection?.classList.add('hidden');
    this.abilityReason?.classList.add('hidden');
    this.killConfirmation?.classList.add('hidden');
    this.hideInteractionPrompt();
    this.setConnectionWarning(false);
  }

  flashDamage() {
    this.damageFlash.classList.remove('show');
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add('show');
    clearTimeout(this._damageTimeout);
    this._damageTimeout = setTimeout(() => this.damageFlash.classList.remove('show'), 600);
  }

  showPracticeStatus(show, botCount = 7, label = 'Offline practice') {
    if (!this.practiceStatus) return;
    this.practiceStatus.classList.toggle('hidden', !show);
    if (show) {
      this.practiceStatus.textContent = botCount > 0
        ? `${sentenceCaseHudText(label)} · ${botCount} bots`
        : sentenceCaseHudText(label);
    }
  }

  // Post-match leaderboard (outside #hud, so hud.hide() won't touch it).
  showLeaderboard(rows, playerName) {
    const overlay = document.getElementById('leaderboard-overlay');
    const tbody   = document.getElementById('lb-rows');
    if (!overlay || !tbody) return;
    tbody.replaceChildren();

    // Practice result banner. Only locally measured facts are displayed.
    const winner = rows[0];
    const winEl  = document.getElementById('lb-winner-name');
    if (winEl && winner) winEl.textContent = winner.name;

    rows.forEach((row, i) => {
      const rank   = i + 1;
      const rankCls = rank <= 3 ? `lb-rank lb-rank-${rank}` : 'lb-rank';
      const tr = document.createElement('tr');
      const isCurrentPlayer = row.isYou || row.name === playerName;
      tr.className = isCurrentPlayer ? 'lb-row-you' : '';

      const nameTd = document.createElement('td');
      nameTd.className = 'lb-name-cell';
      nameTd.textContent = row.name;
      if (isCurrentPlayer) {
        const badge = document.createElement('span');
        badge.className = 'lb-you-badge';
        badge.textContent = 'YOU';
        nameTd.appendChild(badge);
      }

      const rankTd = document.createElement('td');
      const rankSpan = document.createElement('span');
      rankSpan.className = rankCls;
      rankSpan.textContent = rank;
      rankTd.appendChild(rankSpan);
      tr.appendChild(rankTd);
      tr.appendChild(nameTd);

      const cell = (val, cls) => {
        const td = document.createElement('td');
        if (cls) td.className = cls;
        td.textContent = val;
        tr.appendChild(td);
      };
      cell(row.score.toLocaleString(), 'lb-score-cell');
      cell(row.assists ?? 0, 'lb-dim-cell');
      cell(row.kills, 'lb-kills');
      cell(row.deaths ?? 0, 'lb-dim-cell');
      cell(row.kd ?? '0.0', 'lb-kd-cell');

      tbody.appendChild(tr);
    });
    overlay.classList.remove('hidden');
  }

  hideLeaderboard() {
    document.getElementById('leaderboard-overlay')?.classList.add('hidden');
  }

  // In-game scoreboard (hold TAB). rows: [{name, kills, score, isYou}], sub: mode label.
  showScoreboard(rows, sub = '') {
    const ov = document.getElementById('scoreboard-overlay');
    const tb = document.getElementById('sb-rows');
    if (!ov || !tb) return;
    const subEl = document.getElementById('sb-sub');
    if (subEl && sub) subEl.textContent = sentenceCaseHudText(sub);
    tb.replaceChildren();
    rows.forEach((r, i) => {
      const rank = i + 1;
      const tr = document.createElement('tr');
      if (r.isYou) tr.className = 'sb-row-you';
      const rankCls = rank <= 3 ? `sb-rank sb-rank-${rank}` : 'sb-rank';

      const nameTd = document.createElement('td');
      nameTd.className = 'sb-name-cell';
      nameTd.textContent = r.name;
      if (r.isYou) {
        const b = document.createElement('span');
        b.className = 'sb-you-badge'; b.textContent = 'YOU';
        nameTd.appendChild(b);
      }
      const rankTd = document.createElement('td');
      const rankSpan = document.createElement('span');
      rankSpan.className = rankCls;
      rankSpan.textContent = rank;
      rankTd.appendChild(rankSpan);
      tr.appendChild(rankTd);
      tr.appendChild(nameTd);
      const k = document.createElement('td'); k.className = 'sb-kills'; k.textContent = r.kills;
      const s = document.createElement('td'); s.className = 'sb-score';
      s.textContent = typeof r.score === 'number' ? r.score.toLocaleString() : r.score;
      tr.appendChild(k); tr.appendChild(s);
      tb.appendChild(tr);
    });
    ov.classList.remove('hidden');
  }

  hideScoreboard() {
    document.getElementById('scoreboard-overlay')?.classList.add('hidden');
  }

  updateLeaderboardCountdown(secsLeft, total) {
    const el = document.getElementById('lb-countdown');
    if (el) el.textContent = secsLeft;
    const bar = document.getElementById('lb-bar');
    if (bar) bar.style.width = `${Math.max(0, (secsLeft / total) * 100)}%`;
  }

  addKillFeed(text) {
    const el = document.createElement('div');
    el.className = 'kill-entry';
    el.textContent = text;
    this.killfeed.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while (this.killfeed.children.length > 5) {
      this.killfeed.removeChild(this.killfeed.firstChild);
    }
  }

  showKillConfirmation({
    target = 'Target',
    points = 0,
    headshot = false,
    streak = 1,
    durationMs = 1_150,
  } = {}) {
    if (!this.killConfirmation || !this.killConfirmationLabel || !this.killConfirmationDetail) {
      return false;
    }
    const safeTarget = sentenceCaseHudText(target).slice(0, 32) || 'Target';
    const safePoints = Number.isFinite(points) ? Math.max(0, Math.round(points)) : 0;
    const safeStreak = Number.isFinite(streak) ? Math.max(1, Math.floor(streak)) : 1;
    const details = [
      safePoints > 0 ? `+${safePoints}` : null,
      headshot ? 'Headshot' : null,
      safeStreak > 1 ? `${safeStreak} streak` : null,
    ].filter(Boolean);
    this.killConfirmationLabel.textContent = `${safeTarget} down`;
    this.killConfirmationDetail.textContent = details.join(' · ');
    this.killConfirmation.dataset.headshot = String(headshot === true);
    this.killConfirmation.classList.remove('hidden');
    clearTimeout(this._killConfirmationTimeout);
    const safeDuration = Number.isFinite(durationMs)
      ? Math.min(2_500, Math.max(650, durationMs))
      : 1_150;
    this._killConfirmationTimeout = setTimeout(
      () => this.killConfirmation.classList.add('hidden'),
      safeDuration,
    );
    return true;
  }
}
