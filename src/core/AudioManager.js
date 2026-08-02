// Procedural tactical audio built from short noise transients, filtered body,
// restrained low-frequency pulses and a compact room tail. No external samples
// are required and every per-event variation comes from a deterministic PRNG.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.onCriticalCue = null;
    this.onSubtitle = null;
    this._cueTimes = new Map();
    this._seed = 0x6b797861;
    this._foot = 0;
    this._ambientRunning = false;
    this._ambientSources = [];
  }

  _emitCriticalCue({
    id,
    text,
    direction = 'none',
    priority = 'status',
    durationMs = 1_600,
    minIntervalMs = 250,
  }) {
    const now = Date.now();
    const lastEmitted = this._cueTimes.get(id);
    if (lastEmitted !== undefined && now - lastEmitted < minIntervalMs) return false;
    this._cueTimes.set(id, now);
    try {
      this.onCriticalCue?.({ id, text, direction, priority, durationMs, minIntervalMs });
    } catch {
      // Accessibility presentation is isolated from simulation and audio.
    }
    return true;
  }

  emitSubtitle({ speaker = 'SYSTEM', text = '', direction = 'none', durationMs = 3_200 } = {}) {
    if (typeof text !== 'string' || !text.trim()) return false;
    try {
      this.onSubtitle?.({ speaker, text, direction, durationMs });
    } catch {
      // Subtitle consumers are presentation-only.
    }
    return true;
  }

  _random() {
    this._seed = (Math.imul(this._seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this._seed / 0xffff_ffff;
  }

  _vary(amount = 0.04) {
    return 1 + (this._random() * 2 - 1) * amount;
  }

  ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: 'interactive' });

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.78;
    this.uiBus = this.ctx.createGain();
    this.uiBus.gain.value = 0.46;
    this.ambienceBus = this.ctx.createGain();
    this.ambienceBus.gain.value = 0.34;

    const mixFilter = this.ctx.createBiquadFilter();
    mixFilter.type = 'highpass';
    mixFilter.frequency.value = 24;
    mixFilter.Q.value = 0.55;

    this._limiter = this.ctx.createDynamicsCompressor();
    this._limiter.threshold.value = -8;
    this._limiter.knee.value = 8;
    this._limiter.ratio.value = 10;
    this._limiter.attack.value = 0.002;
    this._limiter.release.value = 0.14;

    this.sfxBus.connect(this.master);
    this.uiBus.connect(this.master);
    this.ambienceBus.connect(this.master);
    this.master.connect(mixFilter).connect(this._limiter).connect(this.ctx.destination);

    this._noise = this._makeNoiseBuffer(2.4);
    this._roomVerb = this.ctx.createConvolver();
    this._roomVerb.buffer = this._makeRoomImpulse(0.82);
    this._verbIn = this.ctx.createGain();
    this._verbOut = this.ctx.createGain();
    this._verbOut.gain.value = 0.23;
    this._verbIn.connect(this._roomVerb).connect(this._verbOut).connect(this.sfxBus);
  }

  _makeNoiseBuffer(durationSeconds) {
    const buffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * durationSeconds),
      this.ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let state = 0x4b595841;
    let previous = 0;
    for (let index = 0; index < data.length; index += 1) {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      const white = state / 0xffff_ffff * 2 - 1;
      previous = previous * 0.18 + white * 0.82;
      data[index] = previous;
    }
    return buffer;
  }

  _makeRoomImpulse(durationSeconds) {
    const length = Math.ceil(this.ctx.sampleRate * durationSeconds);
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      let state = 0x1f2e3d4c ^ (channel * 0x9e3779b9);
      for (let index = 0; index < data.length; index += 1) {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        const progress = index / data.length;
        data[index] = (state / 0xffff_ffff * 2 - 1)
          * Math.pow(1 - progress, 3.8)
          * 0.42;
      }
      for (const [seconds, gain] of [
        [0.013, 0.5],
        [0.027, -0.31],
        [0.049, 0.2],
        [0.083, -0.12],
      ]) {
        const sample = Math.floor(seconds * this.ctx.sampleRate * (channel ? 1.05 : 1));
        if (sample < data.length) data[sample] += gain;
      }
    }
    return impulse;
  }

  resume() {
    this.ensureContext();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolume(value) {
    this.ensureContext();
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, Number(value) || 0));
  }

  _envelope(peak, attackSeconds, releaseSeconds, start, destination) {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attackSeconds);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + attackSeconds + releaseSeconds,
    );
    gain.connect(destination);
    return gain;
  }

  _withRoom(node, amount) {
    if (!this._verbIn || amount <= 0) return;
    const send = this.ctx.createGain();
    send.gain.value = amount;
    node.connect(send).connect(this._verbIn);
  }

  _noiseBurst({
    delay = 0,
    duration = 0.08,
    gain = 0.1,
    type = 'bandpass',
    frequency = 1_200,
    endFrequency = frequency,
    q = 0.7,
    attack = 0.001,
    playbackRate = 1,
    destination = this.sfxBus,
    room = 0,
  } = {}) {
    if (!this.ctx || !this._noise || !destination) return;
    const start = this.ctx.currentTime + Math.max(0, delay);
    const source = this.ctx.createBufferSource();
    source.buffer = this._noise;
    source.playbackRate.value = playbackRate * this._vary(0.025);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(30, frequency * this._vary(0.02)), start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(30, endFrequency * this._vary(0.02)),
      start + duration,
    );
    const envelope = this._envelope(gain, attack, duration, start, destination);
    source.connect(filter).connect(envelope);
    this._withRoom(envelope, room);
    const maxOffset = Math.max(0, this._noise.duration - duration - 0.05);
    source.start(start, this._random() * maxOffset, duration + attack + 0.01);
  }

  _bodyPulse({
    delay = 0,
    duration = 0.12,
    gain = 0.1,
    frequency = 110,
    endFrequency = 45,
    type = 'sine',
    destination = this.sfxBus,
    room = 0,
  } = {}) {
    if (!this.ctx || !destination) return;
    const start = this.ctx.currentTime + Math.max(0, delay);
    const oscillator = this.ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(24, frequency * this._vary(0.025)), start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency * this._vary(0.02)),
      start + duration,
    );
    const envelope = this._envelope(gain, 0.0015, duration, start, destination);
    oscillator.connect(envelope);
    this._withRoom(envelope, room);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  _metalClick(delay = 0, gain = 0.08, frequency = 2_300, room = 0.04) {
    this._noiseBurst({
      delay,
      duration: 0.025,
      gain,
      type: 'bandpass',
      frequency,
      endFrequency: frequency * 0.72,
      q: 4.5,
      room,
    });
    this._bodyPulse({
      delay,
      duration: 0.045,
      gain: gain * 0.34,
      frequency: 290,
      endFrequency: 150,
      type: 'triangle',
      room: room * 0.4,
    });
  }

  playShot(kind = 'rifle') {
    if (!this.ctx) return;
    const profile = {
      sidearm: {
        level: 0.72, crack: 4_500, blast: 1_350, body: 145,
        duration: 0.13, tail: 0.22, room: 0.2, mech: 2_600,
      },
      smg: {
        level: 0.5, crack: 5_300, blast: 1_700, body: 118,
        duration: 0.085, tail: 0.14, room: 0.12, mech: 3_100,
      },
      shotgun: {
        level: 0.93, crack: 2_650, blast: 720, body: 92,
        duration: 0.31, tail: 0.48, room: 0.38, mech: 1_450,
      },
      rifle: {
        level: 0.68, crack: 5_800, blast: 1_180, body: 132,
        duration: 0.14, tail: 0.24, room: 0.22, mech: 2_800,
      },
      lmg: {
        level: 0.76, crack: 4_300, blast: 920, body: 110,
        duration: 0.18, tail: 0.3, room: 0.27, mech: 2_100,
      },
      sniper: {
        level: 0.98, crack: 6_900, blast: 760, body: 78,
        duration: 0.4, tail: 0.72, room: 0.5, mech: 1_900,
      },
      rpg: {
        level: 0.94, crack: 1_550, blast: 430, body: 62,
        duration: 0.46, tail: 0.66, room: 0.45, mech: 900,
      },
      rocket: {
        level: 0.94, crack: 1_550, blast: 430, body: 62,
        duration: 0.46, tail: 0.66, room: 0.45, mech: 900,
      },
    }[kind] ?? {
      level: 0.66, crack: 5_200, blast: 1_100, body: 125,
      duration: 0.14, tail: 0.24, room: 0.22, mech: 2_500,
    };
    const level = profile.level * this._vary(0.035);

    // Air-pressure snap, combustion/body, chest pulse and mechanical action.
    this._noiseBurst({
      duration: 0.018,
      gain: level * 0.62,
      type: 'highpass',
      frequency: profile.crack,
      endFrequency: profile.crack * 0.58,
      q: 0.65,
      room: profile.room * 0.35,
    });
    this._noiseBurst({
      duration: profile.duration,
      gain: level * 0.56,
      type: 'bandpass',
      frequency: profile.blast,
      endFrequency: profile.blast * 0.31,
      q: kind === 'shotgun' || kind === 'sniper' ? 0.48 : 0.72,
      room: profile.room,
      playbackRate: kind === 'rpg' || kind === 'rocket' ? 0.66 : 1,
    });
    this._bodyPulse({
      duration: profile.duration * 0.9,
      gain: level * 0.34,
      frequency: profile.body,
      endFrequency: profile.body * 0.35,
      room: profile.room * 0.18,
    });
    this._metalClick(
      kind === 'shotgun' ? 0.045 : kind === 'sniper' ? 0.07 : 0.016,
      level * (kind === 'smg' ? 0.075 : 0.11),
      profile.mech,
      profile.room * 0.28,
    );
    this._noiseBurst({
      delay: 0.018,
      duration: profile.tail,
      gain: level * 0.15,
      type: 'bandpass',
      frequency: profile.blast * 1.35,
      endFrequency: 180,
      q: 0.35,
      room: profile.room * 1.25,
    });

    if (kind === 'shotgun') {
      this._noiseBurst({
        delay: 0.018,
        duration: 0.16,
        gain: level * 0.26,
        type: 'lowpass',
        frequency: 1_200,
        endFrequency: 120,
        q: 0.42,
        room: 0.3,
      });
    } else if (kind === 'sniper') {
      this._noiseBurst({
        delay: 0.055,
        duration: 0.5,
        gain: level * 0.2,
        type: 'bandpass',
        frequency: 2_200,
        endFrequency: 250,
        q: 0.25,
        room: 0.72,
      });
    } else if (kind === 'rpg' || kind === 'rocket') {
      this._noiseBurst({
        duration: 0.44,
        gain: level * 0.42,
        type: 'lowpass',
        frequency: 1_050,
        endFrequency: 95,
        q: 0.35,
        playbackRate: 0.54,
        room: 0.36,
      });
    }
  }

  // Cosmetic skins retain their visual identity while using the equipped
  // weapon's modern profile instead of novelty vocal/chiptune overrides.
  playSkinShot() {
    return false;
  }

  playExplosion() {
    this._emitCriticalCue({
      id: 'explosion',
      text: 'EXPLOSION',
      direction: 'nearby',
      priority: 'danger',
      durationMs: 1_500,
      minIntervalMs: 500,
    });
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.035,
      gain: 0.9,
      type: 'highpass',
      frequency: 2_400,
      endFrequency: 900,
      room: 0.25,
    });
    this._noiseBurst({
      duration: 0.72,
      gain: 0.82,
      type: 'lowpass',
      frequency: 1_150,
      endFrequency: 70,
      q: 0.45,
      playbackRate: 0.72,
      room: 0.48,
    });
    this._bodyPulse({
      duration: 0.58,
      gain: 0.62,
      frequency: 105,
      endFrequency: 27,
      room: 0.12,
    });
    for (const [delay, frequency, gain] of [
      [0.07, 2_100, 0.13],
      [0.13, 1_550, 0.1],
      [0.21, 2_800, 0.07],
    ]) {
      this._metalClick(delay, gain, frequency, 0.22);
    }
  }

  playLaunchDetonation() {
    this._emitCriticalCue({
      id: 'launch-pulse',
      text: 'LAUNCH PULSE',
      direction: 'nearby',
      priority: 'status',
      durationMs: 900,
      minIntervalMs: 320,
    });
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.028,
      gain: 0.36,
      type: 'highpass',
      frequency: 3_200,
      endFrequency: 1_050,
      q: 0.65,
      room: 0.12,
    });
    this._noiseBurst({
      duration: 0.34,
      gain: 0.38,
      type: 'lowpass',
      frequency: 680,
      endFrequency: 72,
      q: 0.5,
      playbackRate: 0.88,
      room: 0.24,
    });
    this._bodyPulse({
      duration: 0.3,
      gain: 0.3,
      frequency: 98,
      endFrequency: 31,
      room: 0.08,
    });
  }

  playSwing() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.2,
      gain: 0.36,
      type: 'bandpass',
      frequency: 540,
      endFrequency: 3_100,
      q: 0.6,
      playbackRate: 0.8,
      room: 0.08,
    });
    this._noiseBurst({
      delay: 0.055,
      duration: 0.12,
      gain: 0.14,
      type: 'highpass',
      frequency: 2_700,
      endFrequency: 1_200,
      q: 0.5,
      room: 0.06,
    });
  }

  playReload() {
    if (!this.ctx) return;
    this.playReloadMag();
    this._metalClick(0.18, 0.13, 1_500, 0.08);
    this.playReloadRack(0.34);
  }

  playReloadMag(delay = 0) {
    if (!this.ctx) return;
    this._noiseBurst({
      delay,
      duration: 0.06,
      gain: 0.14,
      type: 'bandpass',
      frequency: 780,
      endFrequency: 360,
      q: 1.2,
      room: 0.05,
    });
    this._metalClick(delay + 0.028, 0.11, 1_850, 0.06);
    this._metalClick(delay + 0.072, 0.07, 1_300, 0.05);
  }

  playReloadRack(delay = 0) {
    if (!this.ctx) return;
    this._noiseBurst({
      delay,
      duration: 0.12,
      gain: 0.12,
      type: 'bandpass',
      frequency: 720,
      endFrequency: 2_600,
      q: 1.1,
      room: 0.06,
    });
    this._metalClick(delay + 0.085, 0.16, 2_700, 0.08);
  }

  playHit(headshot = false) {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: headshot ? 0.055 : 0.08,
      gain: headshot ? 0.26 : 0.17,
      type: 'bandpass',
      frequency: headshot ? 3_300 : 1_150,
      endFrequency: headshot ? 1_700 : 420,
      q: headshot ? 2.8 : 0.9,
      room: headshot ? 0.1 : 0.04,
      destination: this.uiBus,
    });
    this._bodyPulse({
      duration: 0.085,
      gain: headshot ? 0.13 : 0.09,
      frequency: headshot ? 240 : 155,
      endFrequency: headshot ? 105 : 72,
      destination: this.uiBus,
    });
    if (headshot) this._metalClick(0.034, 0.09, 4_200, 0.08);
  }

  playKill(headshot = false) {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.06,
      gain: 0.22,
      type: 'bandpass',
      frequency: headshot ? 3_800 : 2_100,
      endFrequency: headshot ? 1_900 : 760,
      q: 2.2,
      destination: this.uiBus,
    });
    this._noiseBurst({
      delay: 0.055,
      duration: 0.075,
      gain: 0.14,
      type: 'bandpass',
      frequency: headshot ? 2_500 : 1_400,
      endFrequency: 520,
      q: 1.5,
      destination: this.uiBus,
    });
    this._bodyPulse({
      duration: 0.17,
      gain: 0.14,
      frequency: headshot ? 180 : 145,
      endFrequency: 55,
      destination: this.uiBus,
    });
  }

  playHurt() {
    this._emitCriticalCue({
      id: 'damage-received',
      text: 'DAMAGE RECEIVED',
      priority: 'danger',
      durationMs: 1_000,
      minIntervalMs: 250,
    });
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.2,
      gain: 0.22,
      type: 'lowpass',
      frequency: 820,
      endFrequency: 120,
      q: 0.45,
    });
    this._bodyPulse({ duration: 0.22, gain: 0.2, frequency: 105, endFrequency: 37 });
  }

  playEmptyClick() {
    this._emitCriticalCue({
      id: 'weapon-empty',
      text: 'WEAPON EMPTY',
      priority: 'status',
      durationMs: 1_200,
      minIntervalMs: 500,
    });
    if (!this.ctx) return;
    this._metalClick(0, 0.12, 1_650, 0.03);
    this._metalClick(0.052, 0.055, 1_050, 0.02);
  }

  playFootstep(sprint = false) {
    if (!this.ctx) return;
    this._foot ^= 1;
    const side = this._foot ? 1.04 : 0.96;
    const level = sprint ? 0.19 : 0.115;
    this._bodyPulse({
      duration: sprint ? 0.105 : 0.085,
      gain: level,
      frequency: (sprint ? 102 : 84) * side,
      endFrequency: 30,
    });
    this._noiseBurst({
      duration: sprint ? 0.085 : 0.062,
      gain: level * 0.72,
      type: 'bandpass',
      frequency: (sprint ? 1_250 : 950) * side,
      endFrequency: 330,
      q: 0.62,
      playbackRate: side,
      room: 0.035,
    });
    if (sprint) {
      this._noiseBurst({
        delay: 0.025,
        duration: 0.08,
        gain: 0.035,
        type: 'highpass',
        frequency: 2_000,
        endFrequency: 820,
        q: 0.35,
      });
    }
  }

  playJump() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.14,
      gain: 0.095,
      type: 'bandpass',
      frequency: 420,
      endFrequency: 1_650,
      q: 0.55,
      playbackRate: 0.82,
    });
    this._bodyPulse({ duration: 0.11, gain: 0.08, frequency: 92, endFrequency: 48 });
    this._metalClick(0.018, 0.03, 1_700, 0.02);
  }

  playLand(hard = false) {
    if (!this.ctx) return;
    const level = hard ? 0.44 : 0.24;
    this._bodyPulse({
      duration: hard ? 0.25 : 0.16,
      gain: level,
      frequency: hard ? 112 : 86,
      endFrequency: 24,
      room: hard ? 0.08 : 0.03,
    });
    this._noiseBurst({
      duration: hard ? 0.18 : 0.11,
      gain: level * 0.78,
      type: 'lowpass',
      frequency: hard ? 1_350 : 950,
      endFrequency: 125,
      q: 0.5,
      room: hard ? 0.12 : 0.04,
    });
    if (hard) this._metalClick(0.025, 0.075, 1_250, 0.08);
  }

  playGrenadeThrow(kind = 'frag') {
    if (!this.ctx) return;
    if (kind === 'launch') {
      this._noiseBurst({
        duration: 0.095,
        gain: 0.11,
        type: 'highpass',
        frequency: 2_450,
        endFrequency: 620,
        q: 0.72,
        playbackRate: 0.92,
        room: 0.03,
      });
      this._bodyPulse({
        duration: 0.09,
        gain: 0.065,
        frequency: 165,
        endFrequency: 54,
        room: 0.02,
      });
      this._metalClick(0.008, 0.06, 2_200, 0.025);
      return;
    }
    this._noiseBurst({
      duration: 0.17,
      gain: 0.14,
      type: 'bandpass',
      frequency: 390,
      endFrequency: 1_900,
      q: 0.5,
      playbackRate: kind === 'smoke' ? 0.72 : 0.86,
      room: 0.04,
    });
    this._metalClick(0.012, kind === 'smoke' ? 0.07 : 0.095, 1_950, 0.04);
  }

  playGrenadeBounce(intensity = 1, kind = 'frag') {
    if (!this.ctx) return;
    const level = Math.max(0.025, Math.min(0.15, 0.04 + intensity * 0.1));
    this._noiseBurst({
      duration: 0.045,
      gain: level,
      type: 'bandpass',
      frequency: kind === 'smoke' ? 1_100 : 1_850,
      endFrequency: kind === 'smoke' ? 480 : 850,
      q: kind === 'smoke' ? 1.4 : 3.2,
      room: 0.08,
    });
    this._bodyPulse({
      duration: 0.055,
      gain: level * 0.38,
      frequency: kind === 'smoke' ? 190 : 245,
      endFrequency: 90,
      room: 0.03,
    });
  }

  playSmokeDeploy() {
    this._emitCriticalCue({
      id: 'smoke-deployed',
      text: 'SMOKE DEPLOYED',
      priority: 'status',
      durationMs: 1_100,
      minIntervalMs: 500,
    });
    if (!this.ctx) return;
    this._metalClick(0, 0.11, 1_800, 0.07);
    this._noiseBurst({
      delay: 0.025,
      duration: 0.82,
      gain: 0.24,
      type: 'bandpass',
      frequency: 2_300,
      endFrequency: 480,
      q: 0.42,
      playbackRate: 0.62,
      room: 0.24,
    });
    this._bodyPulse({
      delay: 0.02,
      duration: 0.22,
      gain: 0.1,
      frequency: 130,
      endFrequency: 54,
    });
  }

  playTeleportDeparture(delay = 0) {
    if (!this.ctx) return;
    this._noiseBurst({
      delay,
      duration: 0.14,
      gain: 0.22,
      type: 'bandpass',
      frequency: 520,
      endFrequency: 4_200,
      q: 0.72,
      playbackRate: 0.82,
      room: 0.2,
    });
    this._bodyPulse({
      delay,
      duration: 0.13,
      gain: 0.14,
      frequency: 165,
      endFrequency: 55,
      room: 0.08,
    });
  }

  playTeleportArrival(delay = 0) {
    if (!this.ctx) return;
    this._noiseBurst({
      delay,
      duration: 0.24,
      gain: 0.26,
      type: 'bandpass',
      frequency: 4_100,
      endFrequency: 310,
      q: 0.65,
      playbackRate: 0.72,
      room: 0.32,
    });
    this._bodyPulse({
      delay: delay + 0.015,
      duration: 0.2,
      gain: 0.2,
      frequency: 138,
      endFrequency: 38,
      room: 0.1,
    });
    this._metalClick(delay + 0.02, 0.055, 2_900, 0.11);
  }

  playTeleport() {
    this._emitCriticalCue({
      id: 'teleport',
      text: 'BLINK ACTIVATED',
      priority: 'status',
      durationMs: 900,
      minIntervalMs: 300,
    });
    if (!this.ctx) return;
    this.playTeleportDeparture();
    this.playTeleportArrival(0.105);
  }

  playWeaponSwitch() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.095,
      gain: 0.075,
      type: 'bandpass',
      frequency: 520,
      endFrequency: 1_900,
      q: 0.8,
    });
    this._metalClick(0.035, 0.095, 2_150, 0.04);
  }

  playShellCasing() {
    if (!this.ctx) return;
    const delay = 0.085 + this._random() * 0.07;
    this._metalClick(delay, 0.045, 2_700 + this._random() * 1_100, 0.08);
    this._metalClick(delay + 0.07 + this._random() * 0.035, 0.024, 1_850, 0.06);
  }

  playUiHover() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.018,
      gain: 0.032,
      type: 'bandpass',
      frequency: 2_600,
      endFrequency: 1_700,
      q: 3,
      destination: this.uiBus,
    });
  }

  playUiConfirm() {
    if (!this.ctx) return;
    this._metalClick(0, 0.055, 2_350, 0.02);
    this._bodyPulse({
      duration: 0.07,
      gain: 0.045,
      frequency: 210,
      endFrequency: 145,
      destination: this.uiBus,
    });
  }

  playUiCancel() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.055,
      gain: 0.055,
      type: 'bandpass',
      frequency: 1_250,
      endFrequency: 420,
      q: 1.3,
      destination: this.uiBus,
    });
  }

  playUiError() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.095,
      gain: 0.075,
      type: 'bandpass',
      frequency: 620,
      endFrequency: 190,
      q: 0.9,
      destination: this.uiBus,
    });
    this._bodyPulse({
      duration: 0.12,
      gain: 0.06,
      frequency: 105,
      endFrequency: 48,
      destination: this.uiBus,
    });
  }

  playZombieGrowl() {
    this._emitCriticalCue({
      id: 'hostile-vocal',
      text: 'HOSTILE VOCALIZATION',
      direction: 'nearby',
      priority: 'threat',
      durationMs: 1_600,
      minIntervalMs: 1_200,
    });
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.65,
      gain: 0.19,
      type: 'bandpass',
      frequency: 330,
      endFrequency: 105,
      q: 0.65,
      playbackRate: 0.42,
      room: 0.14,
    });
    this._bodyPulse({
      duration: 0.58,
      gain: 0.12,
      frequency: 86,
      endFrequency: 39,
      type: 'triangle',
      room: 0.08,
    });
  }

  playZombieDeath() {
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.48,
      gain: 0.35,
      type: 'lowpass',
      frequency: 760,
      endFrequency: 85,
      q: 0.45,
      playbackRate: 0.6,
      room: 0.12,
    });
    this._bodyPulse({ duration: 0.42, gain: 0.2, frequency: 112, endFrequency: 29 });
  }

  playZombieAttack() {
    this._emitCriticalCue({
      id: 'hostile-attack',
      text: 'HOSTILE ATTACK',
      direction: 'nearby',
      priority: 'danger',
      durationMs: 1_200,
      minIntervalMs: 400,
    });
    if (!this.ctx) return;
    this._noiseBurst({
      duration: 0.11,
      gain: 0.27,
      type: 'lowpass',
      frequency: 1_250,
      endFrequency: 180,
      q: 0.5,
    });
    this._bodyPulse({ duration: 0.15, gain: 0.25, frequency: 175, endFrequency: 47 });
  }

  // A quiet, non-tonal ventilation/city bed. The old timed siren generator was
  // intentionally removed: ambience must never impersonate a gameplay alarm.
  startAmbientCity() {
    if (!this.ctx || this._ambientRunning || !this._noise || !this.ambienceBus) return;
    this._ambientRunning = true;
    const layers = [
      { rate: 0.19, gain: 0.024, type: 'lowpass', frequency: 190, q: 0.35 },
      { rate: 0.31, gain: 0.009, type: 'bandpass', frequency: 720, q: 0.28 },
    ];
    for (const layer of layers) {
      const source = this.ctx.createBufferSource();
      source.buffer = this._noise;
      source.loop = true;
      source.playbackRate.value = layer.rate;
      const filter = this.ctx.createBiquadFilter();
      filter.type = layer.type;
      filter.frequency.value = layer.frequency;
      filter.Q.value = layer.q;
      const gain = this.ctx.createGain();
      gain.gain.value = layer.gain;
      source.connect(filter).connect(gain).connect(this.ambienceBus);
      source.start();
      this._ambientSources.push(source);
    }
  }

  stopAmbientCity() {
    this._ambientRunning = false;
    for (const source of this._ambientSources) {
      try {
        source.stop();
      } catch {
        // Already stopped by browser context teardown.
      }
    }
    this._ambientSources.length = 0;
  }
}
