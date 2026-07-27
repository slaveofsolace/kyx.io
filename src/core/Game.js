import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { BotManager } from '../entities/BotManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { DamageNumbers } from '../ui/DamageNumbers.js';
import { Nameplates } from '../ui/Nameplates.js';
import { MenuUI } from '../ui/MainMenu.js';
import { UserAccount } from './UserAccount.js';
import { GameSettings } from './GameSettings.js';
import { applyAccessibilityPreferences } from '../ui/AccessibilityPreferences.js';
import { CaptionCueOverlay } from '../ui/CaptionCueOverlay.js';
import { classifyDamageDirection } from '../ui/DamageDirection.js';
import { DeathEffectManager } from '../effects/DeathEffects.js';
import { getMode } from './GameModes.js';
import { getSkin } from '../player/skins.js';
import { buildPreviewCharacter, applySkinToCharacter, rigCharacterLimbs } from '../player/PreviewCharacter.js';
import { loadArmorType } from '../player/ArmorTypes.js';
import { GrenadeSystem } from '../weapons/GrenadeSystem.js';
import { Loadout } from './Loadout.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { SurvivalManager } from './SurvivalManager.js';
import { DeathmatchManager } from './DeathmatchManager.js';
import { preloadZombieModel } from '../entities/Zombie.js';
import { preloadHumanSoldier } from '../player/HumanSoldier.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { PickupSystem } from '../world/PickupSystem.js';
import { PRODUCT_CONFIG } from '../config/productConfig.js';
import { G6_CHARACTER_CANDIDATE } from '../config/g6CharacterCandidate.js';

const SPAWN_POINT = new THREE.Vector3(0, 0, 8);

const PRACTICE_BOTS = G6_CHARACTER_CANDIDATE.enabled
  && G6_CHARACTER_CANDIDATE.population
  ? G6_CHARACTER_CANDIDATE.population - 1
  : PRODUCT_CONFIG.practice.bots;
const PRACTICE_DURATION_SECONDS = PRODUCT_CONFIG.practice.durationSeconds;
const DEVELOPMENT_MOVEMENT_VISUALIZATION_BOUNDARY =
  'development_flat_run_visualization_only_v1';

// Small optional seam for development movement authorities. Keeping the
// legacy call in this dispatcher makes the unconfigured product path explicit
// and independently testable.
export function updatePlayerMovementFrame(movementDriver, context) {
  if (movementDriver) {
    movementDriver.update({
      elapsedMilliseconds:
        context.movementElapsedMilliseconds ?? context.elapsedSeconds * 1000,
      presentationElapsedSeconds: context.elapsedSeconds,
      input: context.input,
      player: context.player,
    });
    return;
  }
  context.player.update(context.elapsedSeconds, context.input, context.legacyWorld);
}

export class Game {
  constructor(canvas, options = undefined) {
    this.canvas = canvas;
    if (G6_CHARACTER_CANDIDATE.enabled) {
      document.body.dataset.g6Candidate = G6_CHARACTER_CANDIDATE.revision;
      document.body.dataset.g6Population = String(PRACTICE_BOTS + 1);
    }
    this._movementDriver = options?.movementDriver ?? null;
    this._onMovementDriverFault = options?.onMovementDriverFault ?? null;
    this._movementDriverFaulted = false;
    this._disposed = false;
    this._scheduledTimeouts = new Set();
    GameSettings.load();
    const _q = GameSettings.get('quality');
    // Quality-aware renderer: MSAA + full pixel ratio + shadows only on 'high',
    // and request the discrete GPU (helps a lot on dual-GPU laptops).
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: _q === 'high',
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = false; // sky-only lighting: no shadow casters
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(_q === 'high' ? Math.min(window.devicePixelRatio, 2) : _q === 'low' ? 0.6 : 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.78;

    // Fetch only the preferred player model during menu initialization. The
    // older player/Spartan GLBs are procedural fallbacks, and eagerly fetching
    // every fallback plus the weapon catalog inflated the first-play path by
    // several megabytes. Mode-specific assets are loaded only when selected.
    const swapPreview = () => {
      const wasVisible = this.previewCharacter?.visible ?? false;
      this._rebuildPreviewCharacter();
      this.previewCharacter.visible = wasVisible;
      if (this._menuBotsActive) {
        this._clearMenuBots();
        this._spawnMenuBots();
      }
    };
    preloadHumanSoldier(swapPreview);

    this.world        = new World();

    // IBL — makes every MeshStandardMaterial look physically accurate
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(0.35)).texture;
    this.world.scene.environmentIntensity = 0.5; // keep IBL from washing surfaces to white
    pmrem.dispose();

    // ── HDR bloom post-processing ──────────────────────────────────────────
    // Makes every emissive surface — neon signs, lit windows, glowing weapon
    // skins, muzzle flashes, lamps — bleed light for a cinematic glow.
    this._buildPostFX();
    this.player       = new Player(window.innerWidth / window.innerHeight);
    this._damageForward = new THREE.Vector3();
    this.audio        = new AudioManager();
    this.player.audio = this.audio;
    this.player.onTeleport = () => {
      this.audio.playTeleport();
      this.hud.flashTeleport();
    };
    this.player.onTeleportUnavailable = (remainingSeconds) => {
      this.hud.showAbilityUnavailable('Q', `BLINK RECHARGING ${remainingSeconds.toFixed(1)}S`);
    };
    this.weaponSystem = new WeaponSystem(this.player.camera, this.world.scene, this.audio);
    // Hide FPS viewmodel during menu — it floats in the scene otherwise.
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
    // The first-person viewmodel (gun, arm, muzzle flash, viewmodel lights) is
    // parented to the player camera. Three.js only renders objects reachable
    // from the scene root, so the camera itself must live in the scene.
    this.world.scene.add(this.player.camera);
    this.deathEffects = new DeathEffectManager(this.world.scene);
    this.botManager      = new BotManager(this.world, this.world.scene);
    this.zombieManager   = new ZombieManager(this.world, this.world.scene, this.audio);
    this.survivalManager = new SurvivalManager();
    this.dmManager       = new DeathmatchManager();
    this._activeManager  = this.botManager;  // switches between botManager / zombieManager
    this._isSurvival     = false;
    this._isDM           = false;
    this._playerDowned   = false;
    this.input        = new InputManager(canvas);
    this._movementDriver?.attach({ player: this.player });
    this.hud            = new HUD();
    this.captionCues    = new CaptionCueOverlay();
    this.audio.onCriticalCue = (cue) => this.captionCues.showAudioCue(cue);
    this.audio.onSubtitle = (cue) => this.captionCues.showSubtitle(cue);
    this.damageNumbers  = new DamageNumbers();
    this.nameplates     = new Nameplates();
    this._scopeOverlay  = document.getElementById('scope-overlay');
    this._hudCrosshair  = document.getElementById('crosshair');
    this._menuOpen      = false; // in-match menu overlay (the match keeps running)
    this.grenadeSystem  = new GrenadeSystem(this.world.scene);
    this.pickupSystem = null; // created on first play, cleared on restart
    this.menu           = new MenuUI();

    this.menuCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

    // Cinematic spectator waypoints (pos + lookAt) for the fly-through
    this._camWpts = [
      { p: new THREE.Vector3(-30,  9, -22), t: new THREE.Vector3(  5, 3,   0) },
      { p: new THREE.Vector3( 18,  5, -58), t: new THREE.Vector3( -6, 4,  16) },
      { p: new THREE.Vector3( 62, 15,  24), t: new THREE.Vector3(  0, 4, -10) },
      { p: new THREE.Vector3(-14,  7,  62), t: new THREE.Vector3( 20, 3,   0) },
      { p: new THREE.Vector3(  4, 22,  -3), t: new THREE.Vector3( 42, 1,  40) },
      { p: new THREE.Vector3(-58,  6,  10), t: new THREE.Vector3( 10, 5,   0) },
    ];
    this._camSeg     = 0;
    this._camSegTime = 0;
    this._CAM_SEG_DUR = 7.0; // seconds per transition

    this.selectedSkin      = getSkin('spartan');
    this.selectedArmorType = loadArmorType();
    this.selectedArmorSkin = null;
    this.previewCharacter  = buildPreviewCharacter(this.selectedSkin, this.selectedArmorType, this.selectedArmorSkin);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.previewCharacter.visible = false;
    this.world.scene.add(this.previewCharacter);

    this.state   = 'menu';
    this.kills   = 0;
    this.score   = 0;
    this.deaths  = 0;
    this._sbShown = false;   // in-game scoreboard (hold TAB)
    this._sbRefreshT = 0;
    this.playTime = 0;
    this._statsSaved  = true;
    this.currentProfileKind = 'local_guest';

    // Game-mode runtime state
    this._mode      = null; // current mode definition object
    this._lives     = Infinity;
    this._wave      = 1;
    this._modeTimer = 0;    // countdown (time-attack)
    this._lbTimer   = 0;    // post-match leaderboard countdown

    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this._applySettings();
    this._wireCallbacks();
    this._wireMenu();
    // Auth is deferred until after the connect sequence

    this._onCanvasClick = () => {
      this.audio.resume();
      if (this._menuOpen) this._resume();
    };
    this._onWindowResize = () => this._onResize();
    this.canvas.addEventListener('click', this._onCanvasClick);
    window.addEventListener('resize', this._onWindowResize);
    this.input.onLockChange = (locked) => {
      // Losing pointer lock (for example, pressing ESC) opens the practice menu
      // while the local simulation continues.
      if (!locked) this._movementDriver?.neutralize();
      if (!locked && this.state === 'playing' && !this._menuOpen) this._openMenu();
    };
    this.input.onPointerLockError = () => {
      this._movementDriver?.neutralize();
      if (this.state !== 'playing') return;
      this._menuOpen = true;
      this.menu.showPause();
      this.menu.showPointerLockError();
    };
    this.input.onFocusLoss = () => this._movementDriver?.neutralize();

    this._rafId = requestAnimationFrame(() => this._loop());
    this._runConnectSequence();
  }

  // Release all global event listeners and cancel the render loop.
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    cancelAnimationFrame(this._rafId);
    this._clearAllScheduledTimeouts();
    this.canvas.removeEventListener('click', this._onCanvasClick);
    window.removeEventListener('resize', this._onWindowResize);
    this.input.onLockChange = null;
    this.input.onFocusLoss = null;
    this._movementDriver?.dispose();
    this._movementDriver = null;
    this.input.dispose();
    this.captionCues.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.botManager.clear();
    this.zombieManager.clear();
  }

  _scheduleTimeout(callback, delayMilliseconds) {
    let handle = null;
    handle = setTimeout(() => {
      this._scheduledTimeouts.delete(handle);
      if (!this._disposed) callback();
    }, delayMilliseconds);
    this._scheduledTimeouts.add(handle);
    return handle;
  }

  _clearScheduledTimeout(handle) {
    if (handle === null || handle === undefined) return;
    clearTimeout(handle);
    this._scheduledTimeouts.delete(handle);
  }

  _clearAllScheduledTimeouts() {
    for (const handle of this._scheduledTimeouts) clearTimeout(handle);
    this._scheduledTimeouts.clear();
  }

  _handleMovementDriverFault(error) {
    if (this._movementDriverFaulted || this._disposed) return;
    this._movementDriverFaulted = true;
    cancelAnimationFrame(this._rafId);
    const driver = this._movementDriver;
    this._movementDriver = null;
    try { driver?.neutralize(); } catch { /* Preserve the original fault. */ }
    try { driver?.dispose(); } catch { /* Preserve the original fault. */ }
    this.input.endFrame();
    this._onMovementDriverFault?.(error);
  }

  // ── Connect sequence ─────────────────────────────────────────────────────────

  // Local boot flow: logo -> arena preview card -> offline-practice menu.
  _runConnectSequence() {
    const screen = document.getElementById('connect-screen');
    this._scheduleTimeout(() => {
      screen.classList.add('fade-out');
      this._scheduleTimeout(() => {
        screen.classList.add('hidden');
        this._runMapIntro();
      }, 700);
    }, 2000);
  }

  // Show the map-loading card (IRON-BASTION + map name) over the fly-through,
  // then reveal the main menu GUI.
  _runMapIntro() {
    const el = document.getElementById('map-loading');
    if (el) {
      const region  = document.getElementById('ml-region');
      const mode    = document.getElementById('ml-mode');
      const players = document.getElementById('ml-players');
      const tip     = document.getElementById('ml-tip');
      if (region)  region.textContent  = 'Bastion Sector';
      if (mode)    mode.textContent     = 'Offline Practice Preview';
      if (players) players.textContent  = `1 LOCAL PLAYER · ${PRACTICE_BOTS} PRACTICE BOTS`;
      if (tip)     tip.textContent      = 'TIP: start offline practice when ready';
      this._clearScheduledTimeout(this._mlTimer1); this._clearScheduledTimeout(this._mlTimer2);
      el.classList.remove('hidden', 'ml-fade');
      this._mlTimer1 = this._scheduleTimeout(() => el.classList.add('ml-fade'), 2000);
      this._mlTimer2 = this._scheduleTimeout(() => {
        el.classList.add('hidden');
        this._initAuth();
      }, 2700);
      return;
    }
    this._initAuth();
  }

  // ── Local guest profile ─────────────────────────────────────────────────────

  _initAuth() {
    this._onProfileLoaded();
  }

  _onProfileLoaded() {
    const displayName = UserAccount.getDisplayName();
    this.currentProfileKind = 'local_guest';
    this.menu.setUsername(displayName);
    const input = document.getElementById('player-name');
    if (input) input.value = displayName;
    this.menu.showMain();
  }

  // ── Settings application ────────────────────────────────────────────────────

  _applySettings(settings = GameSettings.snapshot()) {
    this.player.sensitivityMult = settings.sensitivity;
    this.player.invertY         = settings.invertY;
    this.player.baseFov         = settings.fov;
    this.player.setReducedMotion(settings.reducedMotion);
    this.player.camera.fov      = this.player.baseFov;
    this.player.camera.updateProjectionMatrix();
    this.audio.setVolume(settings.volume);
    const q = settings.quality;
    const pr = q === 'high' ? Math.min(window.devicePixelRatio, 2)
             : q === 'low'  ? 0.6 : 1;
    this.renderer.setPixelRatio(pr);
    this._bloomEnabled = q !== 'low';
    applyAccessibilityPreferences(settings);
    this.captionCues.setPreferences(settings);
  }

  // ── Wire callbacks ──────────────────────────────────────────────────────────

  _wireCallbacks() {
    this.weaponSystem.applyRecoilToPlayer = (amt) => {
      this.player.applyRecoil(amt);
    };
    this.weaponSystem.onPresentationAction = (event) => {
      if (event.phase !== 'started') return;
      const body = this._playerBody?.userData;
      if (body?.triggerAction) {
        body.triggerAction(event);
      } else if (event.kind === 'fire') {
        // Preserve the legacy procedural soldier recoil while Rev17 remains
        // an opt-in candidate.
        body?.triggerFire?.(1);
      }
    };

    this.grenadeSystem.onExplode = (point, radius, damage) => {
      for (const enemy of this._activeManager.bots) {
        if (!enemy.alive) continue;
        const d = enemy.position.distanceTo(point);
        if (d <= radius) {
          const f = THREE.MathUtils.lerp(1, 0.1, THREE.MathUtils.clamp(d / radius, 0, 1));
          const killed = enemy.takeDamage(damage * f);
          this.hud.flashHitmarker();
          if (killed) {
            this.deathEffects.spawn(enemy.mesh.position, null, null, false);
            this._onEnemyKilled(enemy, null);
          }
        }
      }
    };

    this.weaponSystem.onHitBot = (enemy, dmg, point, meta) => {
      const killed = enemy.takeDamage(dmg);
      this.audio.playHit();
      this.hud.flashHitmarker(meta?.headshot);
      this.damageNumbers.spawn(this.player.camera, point, dmg, { headshot: meta?.headshot, killed });
      if (meta?.headshot) this.hud.showHeadshotFlair?.();
      if (killed) {
        const def     = this.weaponSystem.currentDef;
        const isMelee = def.kind === 'melee';
        const entry   = this.weaponSystem._armoryMap?.get(def.id);
        this.deathEffects.spawn(
          enemy.mesh.position,
          entry?.isSword ? null : entry?.skin?.id,
          entry?.isSword ? entry?.skin?.id : null,
          isMelee
        );
        this.audio.playKill();
        const baseMult = meta?.rewardMult || 1;
        this._onEnemyKilled(enemy, entry, baseMult, meta?.headshot);
      }
    };
  }

  _onEnemyKilled(enemy, weaponEntry, rewardMult = 1, headshot = false) {
    this.kills++;
    const hsTag    = headshot  ? '  🎯 HEADSHOT!' : '';
    const knifeTag = rewardMult > 1 ? `  🔪 KNIFE THROW x${rewardMult.toFixed(1)}!` : '';

    if (this._isSurvival) {
      const points = Math.round(50 * rewardMult * this.survivalManager.waveBonus());
      this.score += points;
      this.hud.addKillFeed(`ZOMBIE DOWN  +${points} PRACTICE SCORE${hsTag}${knifeTag}`);
    } else if (this._isDM) {
      const { streak } = this.dmManager.onKill();
      const points = Math.round(100 * rewardMult);
      this.score += points;
      if (streak >= 2) {
        this.hud.showStreak(streak);
        this.hud.addKillFeed(`PRACTICE BOT ELIMINATED — 🔥 x${streak} STREAK  +${points}${hsTag}${knifeTag}`);
      } else {
        this.hud.addKillFeed(`PRACTICE BOT ELIMINATED  +${points}${hsTag}${knifeTag}`);
      }
    } else {
      const points = Math.round(100 * rewardMult);
      this.score += points;
      this.hud.addKillFeed(`${this.player.name} eliminated a practice target  +${points}${hsTag}${knifeTag}`);
    }
  }

  _wireMenu() {
    this.menu.onPlay = (name, skinId, modeId, armorTypeId) => this._startGame(name, skinId, modeId, armorTypeId);
    this.menu.onResume        = () => this._resume();
    this.menu.onQuit          = () => this._quitToMenu();
    this.menu.onRestart       = () => this._restart();
    this.menu.onBackToMenu    = () => this._quitToMenu();
    this.menu.onArmorChanged  = (armorTypeId) => this._rebuildPreviewCharacter(armorTypeId, undefined);
    this.menu.onSettingsSaved = (s) => {
      this._applySettings(s);
      // The decorative light budget is baked at world build, so that part of a
      // quality change takes full effect on the next reload. Shadows stay off.
    };
    this.menu.onProfileEdit = () => { window.location.href = '/login'; };
  }

  // ── Game start / restart ────────────────────────────────────────────────────

  _rebuildPreviewCharacter(armorTypeId) {
    if (armorTypeId !== undefined) this.selectedArmorType = armorTypeId;
    this.world.scene.remove(this.previewCharacter);
    this.previewCharacter = buildPreviewCharacter(this.selectedSkin, this.selectedArmorType, this.selectedArmorSkin);
    this.previewCharacter.position.copy(this.world.previewPedestalPos);
    this.previewCharacter.visible = true;
    this.world.scene.add(this.previewCharacter);
  }

  _startGame(name, skinId, modeId = 'deathmatch', armorTypeId, options = undefined) {
    const sameModeRestart = options?.reuseRuntimeActors === true
      && this._mode?.id === modeId;
    this._clearMenuBots();
    this.audio.resume();
    this.selectedSkin      = getSkin(skinId);
    this.selectedArmorSkin = null;
    applySkinToCharacter(this.previewCharacter, this.selectedSkin, this.selectedArmorSkin);
    this.weaponSystem.setSkin(this.selectedSkin);

    // Equip exactly the chosen gun + melee for this match.
    this.weaponSystem.setLoadout(Loadout.getGun(), Loadout.getMelee());

    this.player.name = name;
    this.player.skin = this.selectedSkin;
    this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
    this._respawnPlayer(SPAWN_POINT);
    this.weaponSystem.resetState(this.player.baseFov);
    this.grenadeSystem.reset();

    this._mode    = getMode(modeId);
    this.kills    = 0;
    this.score    = 0;
    this.deaths   = 0;
    this.playTime = 0;
    this._statsSaved   = false;
    this._playerDowned = false;

    // Mode-specific setup
    this._isDM       = ['deathmatch', 'teamslayer', 'ctf', 'koth'].includes(modeId);
    this._isSurvival = modeId === 'survival';

    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.hud.hideModeHUD();
    this.hud.hideWaveBonus();   // only survival shows it
    this.nameplates.clear();
    this.waveBanner?.classList?.add('hidden');
    this._showMapLoading(modeId);

    if (this._isDM) {
      this._activeManager = this.botManager;
      this.zombieManager.clear();
      this.dmManager.reset();
      if (!sameModeRestart || !this.botManager.resetAll(PRACTICE_BOTS, false, 1)) {
        this.botManager.spawnAll(PRACTICE_BOTS, false, 1);
      }
      this._modeTimer = PRACTICE_DURATION_SECONDS;
      this.hud.showPracticeStatus(true, PRACTICE_BOTS);
      this._preparePickupSystem(sameModeRestart);
      const _mm = Math.floor(this._modeTimer / 60), _ss = Math.floor(this._modeTimer % 60);
      this.hud.showDMTimer(`${_mm}:${String(_ss).padStart(2, '0')}`);
    } else if (this._isSurvival) {
      // Survival has a 60-second grace period, so its dedicated model can load
      // here without penalizing the default Offline Practice launch.
      preloadZombieModel();
      this._activeManager = this.zombieManager;
      this.botManager.clear();
      this.zombieManager.clear();
      this.survivalManager.reset();
      this._modeTimer = 0;
      this.hud.showPracticeStatus(true, 0, 'SOLO WAVE PRACTICE');
      this._wireSurvivalCallbacks();
      this.hud.setModeHUD('GRACE PERIOD', '1:00 REMAINING');
    } else {
      // Legacy modes (kept for compatibility)
      this._activeManager = this.botManager;
      this.zombieManager.clear();
      this.hud.showPracticeStatus(false);
      this._modeTimer = this._mode.timeLimit || 0;
      this._lives     = this._mode.lives === Infinity ? Infinity : this._mode.lives;
      this._wave      = 1;
      const botCount = this._mode.waves ? 3 : this._mode.botCount;
      if (!sameModeRestart || !this.botManager.resetAll(botCount, this._mode.noRespawn, 1)) {
        this.botManager.spawnAll(botCount, this._mode.noRespawn, 1);
      }
      this._preparePickupSystem(sameModeRestart);
      this._refreshModeHUD();
    }

    this.previewCharacter.visible = false;
    this.menu.hideMain();
    this.menu.hideGameOver();
    this.hud.show();
    this.hud.buildWeaponSlots(this.weaponSystem.getHudInfo().slots, 0);

    // Build a third-person body mesh matching the player's current loadout,
    // then rig its limbs so it can walk/run in third person.
    this._preparePlayerBody(sameModeRestart, armorTypeId);
    this._playerBody.visible = false;

    this.state = 'playing';
    this.player._camDist = 0;  // always start in FPS on new game
    this.canvas.focus({ preventScroll: true });
    this.input.requestPointerLock();
    this.audio.startAmbientCity();
  }

  _preparePlayerBody(sameModeRestart, armorTypeId) {
    if (!sameModeRestart || !this._playerBody) {
      if (this._playerBody) this.world.scene.remove(this._playerBody);
      this._playerBody = buildPreviewCharacter(
        this.selectedSkin,
        armorTypeId || this.selectedArmorType || 'assault',
        this.selectedArmorSkin,
        { runtimeRole: 'player' },
      );
      // The human soldier animates via its own skeleton; only the procedural
      // block character needs the limb-pivot rig.
      if (!this._playerBody.userData?.isHuman) rigCharacterLimbs(this._playerBody);
      this._tpsWeaponId = null; // force TPS weapon attach for a new body
      this.world.scene.add(this._playerBody);
    } else {
      this._playerBody.position.copy(this.player.position);
      this._playerBody.rotation.set(0, this.player.yaw, 0);
      this._playerBody.scale.setScalar(1);
      const runtime = this._playerBody.userData;
      runtime?.setLocomotion?.(0, true, false, 0);
      runtime?.setAim?.(0, 0);
      runtime?.setMotion?.('idle');
      if (this._playerBody.parent !== this.world.scene) {
        this.world.scene.add(this._playerBody);
      }
    }
  }

  _preparePickupSystem(sameModeRestart) {
    if (sameModeRestart && this.pickupSystem) {
      this.pickupSystem.reset();
      return;
    }
    this.pickupSystem?.dispose();
    this.pickupSystem = new PickupSystem(this.world.scene);
  }

  _respawnPlayer(position) {
    this.player.respawn(position);
    this._movementDriver?.reset({
      player: this.player,
      spawnPosition: position,
    });
  }

  _wireSurvivalCallbacks() {
    const sm = this.survivalManager;

    sm.onGraceEnd = () => {
      this.hud.addKillFeed('⚠ GRACE PERIOD OVER — FIRST WAVE INCOMING!');
    };

    sm.onWaveStart = (wave, count, hpMult, speedMult, armedRatio = 0, dmgMult = 1) => {
      this.zombieManager.spawnWave(count, hpMult, speedMult, wave, armedRatio, dmgMult);
      const bonus      = Math.round((hpMult - 1) * 100);
      const armedCount = Math.round(count * armedRatio);
      let   threat     = '';
      if (armedRatio >= 0.60) threat = ' ⚠ HEAVILY ARMED';
      else if (armedRatio > 0) threat = ` — ${armedCount} ARMED`;
      this.hud.showWaveBanner(`WAVE ${wave} — ${count} ZOMBIES${threat}`);
      this.hud.addKillFeed(`— WAVE ${wave}: ${count} zombies${bonus > 0 ? ` (+${bonus}% HP)` : ''}${armedCount > 0 ? ` | ${armedCount} carry guns!` : ''}`);
    };

    sm.onWaveClear = (wave) => {
      this.hud.showWaveBanner(`WAVE ${wave} CLEARED!`);
      this.hud.addKillFeed(`WAVE ${wave} SURVIVED! Next wave in ${Math.round(sm.betweenTimer || 12)}s`);
    };

    sm.onRevive = () => {
      this._playerDowned = false;
      this.hud.hideDowned();
      this._respawnPlayer(SPAWN_POINT);
      this.player.health = 50;
      this.player.shield = Math.min(this.player.maxShield, this.player.maxShield * 0.3);
      this.hud.addKillFeed('LOCAL AUTO-REVIVE — 50 HP');
      this.hud.flashDamage();
    };

    sm.onGameOver = () => {
      this._playerDowned = false;
      this.hud.hideDowned();
      this.hud.hideWaveBonus();
      sm.recordBest();
      this._endGame('GAME OVER', `SURVIVED ${sm.wave} WAVES · ${this._fmtHMS(sm.elapsed)}`);
    };
  }

  _refreshModeHUD() {
    if (!this._mode) return;
    if (this._mode.timeLimit) {
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.setModeHUD(`${mins}:${String(secs).padStart(2, '0')}`, 'TIME REMAINING');
    } else if (this._mode.waves) {
      const livesStr = this._lives === Infinity ? '∞' : '♥'.repeat(Math.max(0, this._lives));
      this.hud.setModeHUD(`WAVE ${this._wave}`, livesStr);
    } else if (this._mode.noRespawn && this._mode.lives <= 1) {
      this.hud.setModeHUD('ELIMINATION', `${this.botManager.bots.filter(b => b.alive).length} REMAINING`);
    } else {
      this.hud.hideModeHUD();
    }
  }

  // Format seconds as HH:MM:SS (survival best-time display).
  _fmtHMS(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // Practice scoreboard: local facts only. Bot combat statistics are not yet
  // tracked, so they are explicitly unknown rather than fabricated.
  _buildScoreboardRows() {
    const rows = [{ name: this.player.name || 'You', kills: this.kills, score: this.score, isYou: true }];
    if (!this._isSurvival) {
      for (const bot of (this.botManager?.bots || [])) {
        rows.push({
          name: bot.displayName || 'PRACTICE BOT',
          kills: '—',
          score: '—',
          isYou: false,
        });
      }
    }
    return rows;
  }

  // ── Post-match leaderboard ───────────────────────────────────────────────────

  _showLeaderboard() {
    this._saveStats();
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');

    // Results contain measured local-player facts only. Bot results remain
    // unavailable until the practice AI owns explicit statistic tracking.
    const kd = (k, d) => (d > 0 ? (k / d).toFixed(1) : k.toFixed(1));
    const rows = [{
      name:    this.player.name,
      score:   this.score,
      assists: Math.floor(this.kills * 0.4),
      kills:   this.kills,
      deaths:  this.deaths,
      kd:      kd(this.kills, this.deaths),
      isYou:   true,
    }];
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
    this.state    = 'leaderboard';
    this._lbTimer = 10;
    this.input.exitPointerLock();
    this.hud.hide();         // hide crosshair / ammo / health
    this.hud.hideDMTimer();
    this.hud.hideScoreboard(); this._sbShown = false;
    this.hud.hideLeaderboard(); // reset in case it was shown before
    this.hud.showLeaderboard(rows, this.player.name);
    this.hud.updateLeaderboardCountdown(10, 10);
  }

  _updateLeaderboard(dt) {
    // Bots and cinematic camera keep running during the scoreboard
    this._activeManager.update(dt, this.player, this.player.camera, () => {});
    this.deathEffects.update(dt);
    this._updateMenuScene(dt);

    this._lbTimer -= dt;
    const secsLeft = Math.max(0, Math.ceil(this._lbTimer));
    this.hud.updateLeaderboardCountdown(secsLeft, 10);

    if (this._lbTimer <= 0) {
      this._lbTimer = Infinity; // guard against multiple triggers
      this.hud.hideLeaderboard();
      this._restart();
    }
  }

  _saveStats() {
    if (this._statsSaved) return;
    this._statsSaved = true;
  }

  _resume() {
    this.menu.hidePause();
    this._menuOpen = false;
    this.canvas.focus({ preventScroll: true });
    this.input.requestPointerLock();
  }

  // ESC during practice opens the menu as an overlay while local simulation
  // continues. The loading card states the local roster explicitly.
  // shown over the fly-through for a beat as the match starts, then fades.
  _showMapLoading(modeId) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    const TIPS = [
      'TIP: press Q to blink-teleport forward',
      'TIP: hold TAB to check the scoreboard mid-match',
      'TIP: F throws a frag grenade, E throws smoke',
      'TIP: headshots deal bonus damage — aim high',
      'TIP: grav-lifts by the plaza launch you onto the rooftops',
      'TIP: all opponents in this build are local practice bots',
    ];
    const modeNames = {
      deathmatch: 'Offline Practice',
      survival: 'Solo Wave Practice',
    };
    const mode = document.getElementById('ml-mode');
    if (mode) mode.textContent = modeNames[modeId] || 'Offline Practice';
    const players = document.getElementById('ml-players');
    if (players) players.textContent = modeId === 'survival'
      ? '1 LOCAL PLAYER · SOLO WAVES'
      : `1 LOCAL PLAYER · ${PRACTICE_BOTS} BOTS`;
    const tip = document.getElementById('ml-tip');
    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

    this._clearScheduledTimeout(this._mlTimer1); this._clearScheduledTimeout(this._mlTimer2);
    el.classList.remove('hidden', 'ml-fade');
    this._mlTimer1 = this._scheduleTimeout(() => el.classList.add('ml-fade'), 2600);
    this._mlTimer2 = this._scheduleTimeout(() => el.classList.add('hidden'), 3300);
  }

  _hideMapLoading() {
    this._clearScheduledTimeout(this._mlTimer1); this._clearScheduledTimeout(this._mlTimer2);
    document.getElementById('map-loading')?.classList.add('hidden');
  }

  _openMenu() {
    this._movementDriver?.neutralize();
    this._menuOpen = true;
    this.menu.showPause();
  }

  _quitToMenu() {
    if (this.state === 'playing' || this.state === 'leaderboard') this._saveStats();
    this._lbTimer = Infinity; // cancel any pending auto-restart
    this._hideMapLoading();
    this.hud.hideLeaderboard();
    this.audio.stopAmbientCity();
    this.hud.showPracticeStatus(false);
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');
    if (this._playerBody) { this.world.scene.remove(this._playerBody); this._playerBody = null; }
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
    this.state = 'menu';
    this.menu.hidePause();
    this.menu.hideGameOver();
    this.hud.hide();
    this.hud.hideModeHUD();
    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.captionCues.clear();
    this.input.exitPointerLock();
    this.botManager.clear();
    this.zombieManager.clear();
    this.pickupSystem?.dispose();
    this.pickupSystem = null;
    this._playerDowned = false;
    this.menu.showMain();
  }

  _restart() {
    this._saveStats();
    this.hud.hideLeaderboard();
    this.menu.hideGameOver();
    this._startGame(
      this.player.name,
      this.selectedSkin.id,
      this._mode?.id || 'deathmatch',
      this.selectedArmorType,
      { reuseRuntimeActors: true },
    );
  }

  // ── Player damage / death ───────────────────────────────────────────────────

  _onPlayerDamaged(dmg, sourcePosition = null) {
    if (this.player.isDead || this._playerDowned) return;
    const died = this.player.takeDamage(dmg);
    this.audio.playHurt();
    this.hud.flashDamage();
    if (sourcePosition) {
      this.player.camera.getWorldDirection(this._damageForward);
      const direction = classifyDamageDirection(sourcePosition, this.player.position, this._damageForward);
      if (direction) this.hud.showDamageDirection(direction);
    }
    // Damage flinch on the third-person body model.
    this._playerBody?.userData?.triggerHit?.(0, 1);
    if (died) this._onPlayerDeath();
  }

  _onPlayerDeath() {
    this.deaths++;
    // Survival: enter downed state instead of immediate death
    if (this._isSurvival) {
      if (this._playerDowned) return; // already downed
      this._playerDowned = true;
      this.survivalManager.playerDowned();
      // survivalManager.onGameOver fires if no revives remain
      return;
    }

    // Deathmatch: respawn immediately (infinite lives)
    if (this._isDM) {
      this._scheduleTimeout(() => {
        this._respawnPlayer(SPAWN_POINT);
        this.player.setMaxShield(this.selectedArmorSkin?.shield || 0);
        this.hud.addKillFeed('RESPAWNING...');
      }, 1200);
      return;
    }

    // Legacy modes
    if (this._mode?.lives !== Infinity) {
      this._lives = Math.max(0, this._lives - 1);
      if (this._lives > 0 && this._mode?.waves) {
        this._scheduleTimeout(() => {
          this._respawnPlayer(SPAWN_POINT);
          this._refreshModeHUD();
        }, 1500);
        return;
      }
    }
    this._endGame('YOU DIED');
  }

  _endGame(title, subtitle = '') {
    this._saveStats();
    this._menuOpen = false;
    if (this._scopeOverlay) this._scopeOverlay.classList.remove('active');
    if (this._hudCrosshair) this._hudCrosshair.classList.remove('hidden');
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = false;
    this.state = 'gameover';
    this.input.exitPointerLock();
    this.hud.hide();
    this.hud.hideDMTimer();
    this.hud.hideDowned();
    this.menu.showGameOver(
      { kills: this.kills, score: this.score, time: Math.floor(this.playTime) },
      subtitle ? `${title} — ${subtitle}` : title
    );
  }

  // ── Post-processing (bloom) ──────────────────────────────────────────────

  _buildPostFX() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(w, h);

    // RenderPass camera is swapped each frame between player/menu cameras.
    this.renderPass = new RenderPass(this.world.scene, this.menuCamera);
    this.composer.addPass(this.renderPass);

    // Selective glow: a higher threshold + lower strength keeps the arena clean
    // and readable (ev.io-style) — only the brightest neon blooms, instead of
    // the whole scene washing out to white.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.14,   // strength — subtle; clean arena, not a neon glow-fest
      0.4,    // radius
      1.05    // threshold — only emissive accents bloom, not lit surfaces
    );
    this.composer.addPass(this.bloomPass);

    // OutputPass applies the renderer's tone mapping + sRGB after bloom.
    this.composer.addPass(new OutputPass());

    // Bloom on by default; disabled on the 'low' quality preset for performance.
    this._bloomEnabled = GameSettings.get('quality') !== 'low';
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
    this.menuCamera.aspect = w / h;
    this.menuCamera.updateProjectionMatrix();
  }

  // ── Update loop ─────────────────────────────────────────────────────────────

  _usesMovementFixtureVisualizationPolicy() {
    const capability = this._movementDriver?.capability;
    return capability?.boundary === DEVELOPMENT_MOVEMENT_VISUALIZATION_BOUNDARY
      && capability.legacyGameplayPolicy === 'pause'
      && Object.isFrozen(capability);
  }

  _updateMovementFixtureVisualization(dt, movementElapsedMilliseconds) {
    this.playTime += dt;
    const menuOpen = this._menuOpen;

    if (!menuOpen) {
      updatePlayerMovementFrame(this._movementDriver, {
        elapsedSeconds: dt,
        movementElapsedMilliseconds,
        input: this.input,
        player: this.player,
        legacyWorld: this.world,
      });
    }
    this.player.camera.updateMatrixWorld(true);
    this.world.update(dt);

    const inTPS = this.player._camDist > 0;
    if (this._playerBody) {
      this._playerBody.visible = inTPS;
      if (inTPS) {
        this._playerBody.position.copy(this.player.position);
        this._playerBody.rotation.y = this.player.yaw;
        this._syncTpsWeapon();
        this._animatePlayerBody(dt);
      }
    }
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = !inTPS;

    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);
    this.hud.updateTeleport(1 - this.player.teleportCooldown / this.player.teleportMaxCooldown);
  }

  _updatePlaying(dt, movementElapsedMilliseconds = dt * 1000) {
    if (this._usesMovementFixtureVisualizationPolicy()) {
      this._updateMovementFixtureVisualization(dt, movementElapsedMilliseconds);
      return;
    }
    this.playTime += dt;

    const menuOpen = this._menuOpen;

    // Player input is blocked while the menu overlay is open (no pointer lock),
    // while the local practice simulation continues.
    if (!menuOpen) {
      updatePlayerMovementFrame(this._movementDriver, {
        elapsedSeconds: dt,
        movementElapsedMilliseconds,
        input: this.input,
        player: this.player,
        legacyWorld: this.world,
      });
    }
    this.player.camera.updateMatrixWorld(true);

    // Animate the living sci-fi city (flying traffic, pulsing energy).
    this.world.update(dt);

    // Sync third-person body mesh and hide/show viewmodel
    const inTPS = this.player._camDist > 0;
    if (this._playerBody) {
      this._playerBody.visible = inTPS;
      if (inTPS) {
        this._playerBody.position.copy(this.player.position);
        // Face the direction the player is aiming/moving, so the camera
        // (which sits behind the player) sees the character's back.
        this._playerBody.rotation.y = this.player.yaw;
        this._syncTpsWeapon();
        this._animatePlayerBody(dt);
      }
    }
    if (this.weaponSystem.weaponMount) this.weaponSystem.weaponMount.visible = !inTPS;

    // While menu is open or downed, block weapon/grenade input — match still runs.
    if (!menuOpen && !this._playerDowned) {
      this.weaponSystem.update(dt, this.input, this.world, this._activeManager, this.player);
    }
    this.deathEffects.update(dt);
    this._activeManager.update(
      dt,
      this.player,
      this.player.camera,
      (dmg, sourcePosition) => this._onPlayerDamaged(dmg, sourcePosition),
      this.world,
    );
    this.pickupSystem?.update(dt, this.player, this.weaponSystem, this.hud);

    // grenade input  F = frag  E = smoke
    if (!menuOpen && this.input.consumeJustPressed('KeyF')) {
      const thrown = this.grenadeSystem.throwFrag(this.player.camera);
      if (!thrown) this.hud.showAbilityUnavailable('F', 'NO FRAG GRENADES');
      else this.weaponSystem.presentAbility();
      this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    }
    if (!menuOpen && this.input.consumeJustPressed('KeyE')) {
      const thrown = this.grenadeSystem.throwSmoke(this.player.camera);
      if (!thrown) this.hud.showAbilityUnavailable('E', 'NO SMOKE GRENADES');
      else this.weaponSystem.presentAbility();
      this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    }
    this.grenadeSystem.update(dt, this.player);

    this.hud.update(this.player, this.weaponSystem.getHudInfo(), this.kills, this.score);
    this.hud.updateGrenades(this.grenadeSystem.frags, this.grenadeSystem.smokes);
    this.hud.setActiveSlot(this.weaponSystem.currentIndex);

    // Enemy nameplates (name + health bar) over living opponents.
    if (this.botManager?.bots?.length) {
      this.nameplates.container.style.display = '';
      this.nameplates.update(this.player.camera, this.botManager.bots);
    } else {
      this.nameplates.container.style.display = 'none';
    }

    // In-game scoreboard — hold TAB to view live scores
    const sbDown = this.input.isDown('Tab');
    if (sbDown) {
      this._sbRefreshT -= dt;
      if (!this._sbShown || this._sbRefreshT <= 0) {
        this.hud.showScoreboard(this._buildScoreboardRows(), this._mode?.name || '');
        this._sbRefreshT = 0.4;
      }
      this._sbShown = true;
    } else if (this._sbShown) {
      this.hud.hideScoreboard();
      this._sbShown = false;
    }
    this.hud.updateTeleport(1 - this.player.teleportCooldown / this.player.teleportMaxCooldown);

    // Scope overlay — shown when ADS on a scoped weapon
    if (this._scopeOverlay) {
      const showScope = !!this.weaponSystem.currentDef.scoped && this.weaponSystem.scopeT > 0.5;
      this._scopeOverlay.classList.toggle('active', showScope);
      if (this._hudCrosshair) this._hudCrosshair.classList.toggle('hidden', showScope);
    }

    this._updateModeLogic(dt);
  }

  // Put the currently-held weapon into the third-person body's hand, rebuilding
  // only when the active weapon changes (gun ↔ melee switch). Human model only —
  // the procedural fallback body carries no weapon.
  _syncTpsWeapon() {
    const ud = this._playerBody?.userData;
    if (!ud?.isHuman || !ud.attachWeapon) return;
    const def = this.weaponSystem.currentDef;
    if (!def || this._tpsWeaponId === def.id) return;
    this._tpsWeaponId = def.id;
    const built = buildWeaponModel(def, { procedural: true });
    ud.attachWeapon(built?.group || null, def.kind === 'melee');
  }

  // Drive the third-person body's walk cycle: swing the rigged arm/leg pivots
  // when moving, gentle breathing sway when standing still.
  _animatePlayerBody(dt) {
    const p = this.player;
    const speed = Math.hypot(p.velocity.x, p.velocity.z);

    // Real human soldier: drive its skeletal Idle/Walk/Run clips.
    const ud = this._playerBody?.userData;
    if (ud?.isHuman) {
      // Strafe input in the body's local frame — feeds the lean layer.
      const yaw = p.yaw;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const strafe = -(p.velocity.x * cs - p.velocity.z * sn) / Math.max(1, speed);
      if (ud.setLocomotion) ud.setLocomotion(speed, p.onGround, p.isSprinting, strafe);
      else ud.setMotion(speed > 0.6 && p.onGround ? (speed > 6.5 ? 'run' : 'walk') : 'idle');
      // Head/spine track the player's aim pitch (the whole body already yaws to
      // face the aim direction, so we only need pitch here).
      if (ud.setAim) ud.setAim(p.pitch, 0);
      ud.mixer.update(dt);
      ud.actionTick?.(dt);
      ud.armorTick?.(dt);
      return;
    }

    const rig = ud?.rig;
    if (!rig) return;
    const moving = speed > 0.6 && p.onGround;
    if (moving) {
      const swing = Math.sin(p.bobTime) * (p.isSprinting ? 0.85 : 0.55);
      rig.legL.rotation.x =  swing;
      rig.legR.rotation.x = -swing;
      rig.armL.rotation.x = -swing * 0.7;
      rig.armR.rotation.x =  swing * 0.7;
    } else {
      // idle breathing — tiny arm sway, legs return to neutral
      const breathe = Math.sin(this.playTime * 1.6) * 0.04;
      rig.armL.rotation.x += (breathe - rig.armL.rotation.x) * Math.min(1, dt * 4);
      rig.armR.rotation.x += (breathe - rig.armR.rotation.x) * Math.min(1, dt * 4);
      rig.legL.rotation.x += (0 - rig.legL.rotation.x) * Math.min(1, dt * 6);
      rig.legR.rotation.x += (0 - rig.legR.rotation.x) * Math.min(1, dt * 6);
    }
  }

  _updateModeLogic(dt) {
    if (!this._mode || this.state !== 'playing') return;

    // ─── DEATHMATCH ─────────────────────────────────────────────────────────────
    if (this._isDM) {
      this.dmManager.update(dt);
      this._modeTimer = Math.max(0, this._modeTimer - dt);
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.showDMTimer(`${mins}:${String(secs).padStart(2, '0')}`, this._modeTimer <= 30);
      if (this._modeTimer <= 0) {
        this._showLeaderboard();
      }
      return;
    }

    // ─── SURVIVAL ───────────────────────────────────────────────────────────────
    if (this._isSurvival) {
      const sm = this.survivalManager;
      sm.update(dt, this.zombieManager.allDead());

      // Downed HUD
      if (this._playerDowned && sm.isDowned) {
        this.hud.showDowned(sm.downedTimer, sm.AUTO_REVIVE_TIME);
      } else if (!sm.isDowned && this._playerDowned) {
        // revive callback already fired; make sure overlay hides
        this._playerDowned = false;
        this.hud.hideDowned();
      }

      // Mode info panel (ev.io-style 3-line wave HUD)
      const alive = this.zombieManager.zombies.filter((z) => z.alive).length;
      const best  = `YOUR BEST TIME: ${this._fmtHMS(sm.bestTime())}`;
      const mmss  = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
      if (sm.graceActive) {
        this.hud.setModeHUD(`WAVE 1 SPAWNS IN ${mmss(sm.graceTimer)}`, `${alive} BOTS ALIVE`, best);
      } else if (sm.betweenWave) {
        this.hud.setModeHUD(`WAVE ${sm.wave + 1} SPAWNS IN ${mmss(sm.betweenTimer)}`, `${alive} BOTS ALIVE`, best);
      } else {
        this.hud.setModeHUD(`WAVE ${sm.wave}`, `${alive} BOTS ALIVE`, best);
      }
      this.hud.setWaveBonus(sm.waveBonus());
      return;
    }

    // ─── LEGACY MODES ───────────────────────────────────────────────────────────
    if (this._mode.timeLimit > 0) {
      this._modeTimer = Math.max(0, this._modeTimer - dt);
      const mins = Math.floor(this._modeTimer / 60);
      const secs = Math.floor(this._modeTimer % 60);
      this.hud.setModeHUD(`${mins}:${String(secs).padStart(2, '0')}`, 'TIME REMAINING');
      if (this._modeTimer <= 0) this._endGame("TIME'S UP");
      return;
    }
    if (this._mode.waves && this.botManager.allDead()) {
      this._wave += 1;
      const count = 3 + (this._wave - 1) * 2;
      const hm = 1 + (this._wave - 1) * 0.18;
      this.botManager.spawnAll(count, true, hm);
      this.hud.addKillFeed(`— WAVE ${this._wave} — (+${Math.round((hm - 1) * 100)}% HP)`);
      this._refreshModeHUD();
      return;
    }
    if (this._mode.noRespawn && !this._mode.waves && this.botManager.allDead()) {
      this._endGame('VICTORY');
      return;
    }
    if (this._mode.id === 'elimination') {
      const alive = this.botManager.bots.filter(b => b.alive).length;
      this.hud.setModeHUD('ELIMINATION', `${alive} REMAINING`);
    }
  }

  _updateStateForFrame(dt, rawDeltaSeconds) {
    if (
      this._usesMovementFixtureVisualizationPolicy()
      && (this.state === 'playing' || this.state === 'leaderboard')
    ) {
      this._updateMovementFixtureVisualization(dt, rawDeltaSeconds * 1000);
    } else if (this.state === 'playing') {
      this._updatePlaying(dt, rawDeltaSeconds * 1000);
    } else if (this.state === 'leaderboard') {
      this._updateLeaderboard(dt);
    } else {
      // Cinematic camera runs for every non-playing state (connecting, auth, menu, paused, gameover)
      this._updateMenuScene(dt);
    }
  }

  _spawnMenuBots() {
    if (this._menuBotsActive) return;
    this._menuBotsActive = true;
    this.botManager.spawnAll(6, true, 1);
    for (const bot of this.botManager.bots) {
      bot._provoked = false;
      bot._provokeTimer = 0;
    }
  }

  _clearMenuBots() {
    if (!this._menuBotsActive) return;
    this._menuBotsActive = false;
    this.botManager.clear();
  }

  _updateMenuScene(dt) {
    // Slowly rotate the preview character (only shown on PLAY tab)
    if (this.previewCharacter.visible) {
      this.previewCharacter.rotation.y += dt * 0.6;
    }
    // Tick the human soldier's idle animation whenever it's on screen.
    const pud = this.previewCharacter?.userData;
    if (pud?.isHuman) { pud.setMotion('idle'); pud.mixer.update(dt); pud.armorTick?.(dt); }

    // Keep the city alive behind the menu fly-through (flying traffic, pulse).
    this.world.update(dt);

    // Spectator bots — visible running around the map during the home screen.
    if (this.state === 'menu' && !this._menuBotsActive) this._spawnMenuBots();
    if (this._menuBotsActive) {
      const dummyPlayer = { position: new THREE.Vector3(9999, 9999, 9999), isDead: true };
      this.botManager.update(dt, dummyPlayer, this.menuCamera, () => {}, this.world);
    }

    // Cinematic spectator fly-through
    this._camSegTime += dt;
    if (this._camSegTime >= this._CAM_SEG_DUR) {
      this._camSegTime -= this._CAM_SEG_DUR;
      this._camSeg = (this._camSeg + 1) % this._camWpts.length;
    }
    const from = this._camWpts[this._camSeg];
    const to   = this._camWpts[(this._camSeg + 1) % this._camWpts.length];
    const t    = this._camSegTime / this._CAM_SEG_DUR;
    const e    = t * t * (3 - 2 * t); // smoothstep

    this.menuCamera.position.lerpVectors(from.p, to.p, e);
    const lookTarget = new THREE.Vector3().lerpVectors(from.t, to.t, e);
    this.menuCamera.lookAt(lookTarget);
  }

  _loop() {
    if (this._disposed || this._movementDriverFaulted) return;
    this._rafId = requestAnimationFrame(() => this._loop());
    this.timer.update();
    const rawDeltaSeconds = this.timer.getDelta();
    const dt = Math.min(0.05, rawDeltaSeconds);

    try {
      this._updateStateForFrame(dt, rawDeltaSeconds);
    } catch (error) {
      if (this._movementDriver !== null) {
        this._handleMovementDriverFault(error);
        return;
      }
      throw error;
    }

    const camera = this.state === 'playing' ? this.player.camera : this.menuCamera;
    if (this._bloomEnabled && this.composer) {
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(this.world.scene, camera);
    }
    this.input.endFrame();
  }
}
