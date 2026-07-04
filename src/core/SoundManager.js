const SFX_PATH = '/audio/sfx/';
const MUSIC_PATH = '/audio/music/';

const SFX = {
  playerLaser1: `${SFX_PATH}player_laser_teal_01.wav`,
  playerLaser2: `${SFX_PATH}player_laser_teal_02.wav`,
  playerCharge: `${SFX_PATH}player_laser_charge.wav`,
  enemyLaser1: `${SFX_PATH}enemy_laser_red_01.wav`,
  enemyLaser2: `${SFX_PATH}enemy_laser_red_02.wav`,
  enemyHeavyCannon: `${SFX_PATH}enemy_heavy_cannon_red.wav`,
  heroEngine: `${SFX_PATH}hero_engine_loop.wav`,
  heroBoost: `${SFX_PATH}hero_boost.wav`,
  enemyBasicEngine: `${SFX_PATH}enemy_basic_engine_loop.wav`,
  enemyBasicBoost: `${SFX_PATH}enemy_basic_boost.wav`,
  enemyArtilleryEngine: `${SFX_PATH}enemy_artillery_engine_loop.wav`,
  enemyArtilleryBoost: `${SFX_PATH}enemy_artillery_boost.wav`,
  enemyDestroyerEngine: `${SFX_PATH}enemy_destroyer_engine_loop.wav`,
  enemyDestroyerBoost: `${SFX_PATH}enemy_destroyer_boost.wav`,
  shieldHit: `${SFX_PATH}shield_hit_teal.wav`,
  armorHit: `${SFX_PATH}armor_hit_small.wav`,
  explosionSmall: `${SFX_PATH}explosion_small.wav`,
  explosionMedium: `${SFX_PATH}explosion_medium.wav`,
  explosionBig: `${SFX_PATH}explosion_big_destroyer.wav`,
  uiSelect: `${SFX_PATH}ui_select.wav`,
  uiWarning: `${SFX_PATH}ui_warning.wav`,
};

const MUSIC = {
  mission01: `${MUSIC_PATH}Mission%2001%20-%20Kharos-3%20Rail%20Combat.wav`,
  hangar: `${MUSIC_PATH}Hangar%20-%20Carrier%20Vehemence.wav`,
  generalBoss: `${MUSIC_PATH}General%20Destroyer%20Boss.wav`,
  victory: `${MUSIC_PATH}Victory%20Debrief.wav`,
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class SoundManager {
  constructor({ master = 0.72, sfx = 0.85, music = 0.42, engine = 0.5 } = {}) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = AudioContext ? new AudioContext() : null;
    this.enabled = !!this.ctx;
    this.buffers = new Map();
    this.loading = new Map();
    this.loops = new Map();
    this.currentMusic = null;
    this.pendingMusic = null;
    this.pendingLoops = new Map();
    this.lastPlayed = new Map();
    this.listener = { x: 0, y: 0, z: 0 };

    if (!this.enabled) return;

    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.engineGain = this.ctx.createGain();

    this.masterGain.gain.value = master;
    this.sfxGain.gain.value = sfx;
    this.musicGain.gain.value = music;
    this.engineGain.gain.value = engine;

    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.engineGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this._unlock = this.unlock.bind(this);
    addEventListener('pointerdown', this._unlock, { once: true });
    addEventListener('keydown', this._unlock, { once: true });

    this.preload();
  }

  preload() {
    for (const [name, url] of Object.entries({ ...SFX, mission01: MUSIC.mission01 })) {
      this.load(name, url);
    }
  }

  async load(name, url) {
    if (!this.enabled || this.buffers.has(name)) return this.buffers.get(name);
    if (this.loading.has(name)) return this.loading.get(name);

    const task = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Audio introuvable: ${url}`);
        return res.arrayBuffer();
      })
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(name, buffer);
        this.loading.delete(name);
        if (this.pendingLoops.has(name)) {
          const options = this.pendingLoops.get(name);
          this.pendingLoops.delete(name);
          this.startLoop(name, options);
        }
        if (this.pendingMusic?.name === name) {
          const options = this.pendingMusic.options;
          this.pendingMusic = null;
          this.playMusic(name, options);
        }
        return buffer;
      })
      .catch((err) => {
        this.loading.delete(name);
        console.warn(err);
        return null;
      });
    this.loading.set(name, task);
    return task;
  }

  unlock() {
    if (!this.enabled) return;
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.startLoop('heroEngine', { volume: 0.16, group: 'engine' });
    this.playMusic('mission01', { volume: 0.5, fade: 1.5 });
  }

  setListener(position) {
    this.listener.x = position.x;
    this.listener.y = position.y;
    this.listener.z = position.z;
  }

  setMasterVolume(value) {
    if (!this.enabled) return;
    this.masterGain.gain.setTargetAtTime(clamp01(value), this.ctx.currentTime, 0.03);
  }

  play(name, { volume = 1, rate = 1, detune = 0, minInterval = 0, group = 'sfx' } = {}) {
    return this.playAt(name, null, { volume, rate, detune, minInterval, group });
  }

  playAt(name, position, { volume = 1, rate = 1, detune = 0, minInterval = 0, group = 'sfx' } = {}) {
    if (!this.enabled) return null;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) || -Infinity;
    if (now - last < minInterval) return null;
    this.lastPlayed.set(name, now);

    const buffer = this.buffers.get(name);
    if (!buffer) return null;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.detune.value = detune;
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(position ? this.createPanner(position) : this.getGroupGain(group));
    source.start();
    return source;
  }

  createPanner(position) {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 18;
    panner.maxDistance = 260;
    panner.rolloffFactor = 0.55;
    panner.positionX.value = position.x - this.listener.x;
    panner.positionY.value = position.y - this.listener.y;
    panner.positionZ.value = position.z - this.listener.z;
    panner.connect(this.sfxGain);
    return panner;
  }

  getGroupGain(group) {
    if (group === 'music') return this.musicGain;
    if (group === 'engine') return this.engineGain;
    return this.sfxGain;
  }

  startLoop(name, { volume = 1, group = 'sfx', rate = 1 } = {}) {
    if (!this.enabled || this.loops.has(name)) return;
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.pendingLoops.set(name, { volume, group, rate });
      return;
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.getGroupGain(group));
    source.start();
    this.loops.set(name, { source, gain });
  }

  setLoop(name, { volume, rate } = {}) {
    if (!this.enabled) return;
    const loop = this.loops.get(name);
    if (!loop) {
      this.startLoop(name, { volume: volume ?? 0, rate: rate ?? 1, group: 'engine' });
      return;
    }
    const now = this.ctx.currentTime;
    if (volume !== undefined) loop.gain.gain.setTargetAtTime(clamp01(volume), now, 0.08);
    if (rate !== undefined) loop.source.playbackRate.setTargetAtTime(rate, now, 0.08);
  }

  playMusic(name, { volume = 1, fade = 0.8 } = {}) {
    if (!this.enabled || this.currentMusic?.name === name) return;
    if (!this.buffers.has(name) && MUSIC[name]) this.load(name, MUSIC[name]);
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.pendingMusic = { name, options: { volume, fade } };
      return;
    }

    const now = this.ctx.currentTime;
    if (this.currentMusic) {
      this.currentMusic.gain.gain.setTargetAtTime(0, now, fade / 3);
      this.currentMusic.source.stop(now + fade);
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.musicGain);
    source.start();
    gain.gain.setTargetAtTime(volume, now, fade / 3);
    this.currentMusic = { name, source, gain };
  }

  updateHeroEngine({ boostAmount = 0, forwardSpeed = 60, boosting = false }) {
    if (!this.enabled) return;
    const volume = 0.18 + boostAmount * 0.24 + Math.min(0.1, forwardSpeed / 1600);
    const rate = 0.9 + boostAmount * 0.35;
    this.setLoop('heroEngine', { volume, rate });
    if (boosting) this.play('heroBoost', { volume: 0.65, minInterval: 0.8, group: 'engine' });
  }

  playerLaser() {
    this.play(Math.random() > 0.5 ? 'playerLaser1' : 'playerLaser2', {
      volume: 0.44,
      detune: rand(-45, 35),
      minInterval: 0.035,
    });
  }

  enemyLaser(typeId, position) {
    const heavy = typeId !== 'basic_fighter';
    this.playAt(heavy ? 'enemyHeavyCannon' : Math.random() > 0.5 ? 'enemyLaser1' : 'enemyLaser2', position, {
      volume: heavy ? 0.42 : 0.28,
      detune: heavy ? rand(-40, 20) : rand(-70, 60),
      minInterval: heavy ? 0.25 : 0.08,
    });
  }

  shieldHit() {
    this.play('shieldHit', { volume: 0.58, detune: rand(-25, 25), minInterval: 0.08 });
  }

  armorHit(position) {
    this.playAt('armorHit', position, { volume: 0.38, detune: rand(-60, 60), minInterval: 0.035 });
  }

  explosion(kind, position) {
    const name = kind === 'big' ? 'explosionBig' : kind === 'medium' ? 'explosionMedium' : 'explosionSmall';
    const volume = kind === 'big' ? 0.82 : kind === 'medium' ? 0.62 : 0.48;
    this.playAt(name, position, { volume, detune: rand(-55, 35), minInterval: 0.04 });
  }
}
