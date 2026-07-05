import { assetUrl } from './assetUrl.js';

const SFX_PATH = '/audio/sfx/';
const MUSIC_PATH = '/audio/music/';
const VOICE_PATH = '/audio/voice/';

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

// Répliques radio de l'escadron. Fichiers attendus dans public/audio/voice/
// (voir public/audio/prompts/voice_prompts.md pour le script à donner à la
// génération vocale) — enregistrements propres, SANS grésillement : le
// filtre radio est appliqué en direct par playVoiceLine() ci-dessous.
const VOICE = {
  kill1: `${VOICE_PATH}kill_01.wav`,
  kill2: `${VOICE_PATH}kill_02.wav`,
  kill3: `${VOICE_PATH}kill_03.wav`,
  deathRenard: `${VOICE_PATH}death_renard.wav`,
  deathCobra: `${VOICE_PATH}death_cobra.wav`,
  deathCorbeau: `${VOICE_PATH}death_corbeau.wav`,
  lowEnergyPlayer: `${VOICE_PATH}low_energy_player.wav`,
  lowEnergyRenard: `${VOICE_PATH}low_energy_renard.wav`,
  lowEnergyCobra: `${VOICE_PATH}low_energy_cobra.wav`,
  lowEnergyCorbeau: `${VOICE_PATH}low_energy_corbeau.wav`,
  fightBossMothership: `${VOICE_PATH}fight_boss_mothership.wav`,
};

const KILL_LINES = ['kill1', 'kill2', 'kill3'];

// Une seule voix source suffit : ces vitesses de lecture (pitch + tempo liés,
// comme sur une bande analogique) donnent à chaque callsign une identité
// sonore distincte sans avoir à enregistrer plusieurs comédiens.
const CHARACTER_RATE = {
  Renard: 0.9, // un peu plus grave et posé
  Cobra: 1.14, // plus aigu et nerveux
  Corbeau: 0.83, // grave, sombre — le guetteur
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Courbe de saturation douce (WaveShaper) — apporte le grain "haut-parleur
// de cockpit" sur les répliques radio sans avoir besoin de fichiers dédiés.
function makeDriveCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// Bruit statique procédural (~2 s, bouclé) mixé sous les répliques radio.
function makeStaticNoiseBuffer(ctx) {
  const duration = 2;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class SoundManager {
  constructor({ master = 0.72, sfx = 0.85, music = 0.42, engine = 0.5, voice = 2.2 } = {}) {
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
    this.voiceBusyUntil = 0;
    this.shieldAlarm = null;

    if (!this.enabled) return;

    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.engineGain = this.ctx.createGain();
    this.voiceGain = this.ctx.createGain();
    this.radioOutputGain = this.ctx.createGain();

    this.masterGain.gain.value = master;
    this.sfxGain.gain.value = sfx;
    this.musicGain.gain.value = music;
    this.engineGain.gain.value = engine;
    this.voiceGain.gain.value = voice;
    this.radioOutputGain.gain.value = 1.85;

    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.engineGain.connect(this.masterGain);
    this.voiceGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Chaîne "radio militaire" : bande passante étroite façon haut-parleur de
    // cockpit + légère saturation, posée sur toute réplique jouée via
    // playVoiceLine(). Les fichiers sources doivent rester des voix propres.
    this.radioFilter = this.ctx.createBiquadFilter();
    this.radioFilter.type = 'bandpass';
    this.radioFilter.frequency.value = 1750;
    this.radioFilter.Q.value = 1.15;
    this.radioDrive = this.ctx.createWaveShaper();
    this.radioDrive.curve = makeDriveCurve(14);
    this.radioDrive.connect(this.radioFilter);
    this.radioFilter.connect(this.radioOutputGain);
    this.radioOutputGain.connect(this.voiceGain);

    this.staticNoiseBuffer = makeStaticNoiseBuffer(this.ctx);

    this._unlock = this.unlock.bind(this);
    addEventListener('pointerdown', this._unlock, { once: true });
    addEventListener('keydown', this._unlock, { once: true });

    this.preload();
  }

  preload() {
    for (const [name, url] of Object.entries({ ...SFX, mission01: MUSIC.mission01, fightBossMothership: VOICE.fightBossMothership })) {
      this.load(name, url);
    }
  }

  async load(name, url) {
    if (!this.enabled || this.buffers.has(name)) return this.buffers.get(name);
    if (this.loading.has(name)) return this.loading.get(name);

    const task = fetch(assetUrl(url))
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

  setGroupVolume(group, value) {
    if (!this.enabled) return;
    const gain = this.getGroupGain(group);
    const max = group === 'voice' ? 3 : 1;
    gain.gain.setTargetAtTime(Math.max(0, Math.min(max, value)), this.ctx.currentTime, 0.03);
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
    if (group === 'voice') return this.voiceGain;
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
    this.currentMusic = { name, source, gain, volume };
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

  // Réplique radio de l'escadron : chargement paresseux (silencieux tant que
  // Codex/ElevenLabs n'a pas livré le fichier — voir public/audio/voice/),
  // passée dans la chaîne bandpass + saturation + bruit de fond pour l'effet
  // "tour de contrôle". Une seule réplique à la fois (comme une vraie radio).
  // `rate` : vitesse de lecture (pitch lié, comme une bande analogique) — voir
  // CHARACTER_RATE. Une seule voix source enregistrée peut ainsi incarner
  // tout l'escadron.
  async playVoiceLine(name, { volume = 1, rate = 1, priority = false, duckMusic = false } = {}) {
    if (!this.enabled) return;
    const url = VOICE[name];
    if (!url) return;
    const now = this.ctx.currentTime;
    if (!priority && now < this.voiceBusyUntil) return; // quelqu'un parle déjà sur la fréquence

    if (!this.buffers.has(name)) await this.load(name, url);
    const buffer = this.buffers.get(name);
    if (!buffer) return; // fichier pas encore livré — silence, pas d'erreur

    const duration = buffer.duration / rate; // durée réelle une fois la vitesse appliquée
    const startAt = this.ctx.currentTime;
    this.voiceBusyUntil = startAt + duration + 0.1;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.radioDrive);
    source.start();

    if (duckMusic && this.currentMusic) {
      const music = this.currentMusic;
      music.gain.gain.setTargetAtTime(music.volume * 0.28, startAt, 0.05);
      music.gain.gain.setTargetAtTime(music.volume, startAt + duration + 0.25, 0.25);
    }

    // Souffle statique, présent juste avant/après la voix (façon "ouverture
    // de fréquence"), très en retrait pour ne pas couvrir la réplique.
    const noise = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();
    noise.buffer = this.staticNoiseBuffer;
    noise.loop = true;
    noiseGain.gain.setValueAtTime(0, startAt);
    noiseGain.gain.linearRampToValueAtTime(0.045, startAt + 0.05);
    noiseGain.gain.setValueAtTime(0.045, startAt + duration - 0.08);
    noiseGain.gain.linearRampToValueAtTime(0, startAt + duration + 0.1);
    noise.connect(noiseGain);
    noiseGain.connect(this.radioDrive);
    noise.start(startAt);
    noise.stop(startAt + duration + 0.15);
  }

  enemyKilled() {
    // Léger jitter de vitesse à chaque tir pour éviter l'effet "disque rayé"
    this.playVoiceLine(pick(KILL_LINES), { rate: rand(0.96, 1.06) });
  }

  wingmanDown(callsign) {
    this.playVoiceLine(`death${callsign}`, { rate: CHARACTER_RATE[callsign] ?? 1 });
  }

  lowEnergy(callsign) {
    this.playVoiceLine(callsign ? `lowEnergy${callsign}` : 'lowEnergyPlayer', {
      rate: callsign ? CHARACTER_RATE[callsign] ?? 1 : 1,
    });
  }

  bossMothershipIncoming() {
    this.playVoiceLine('fightBossMothership', { volume: 2.1, rate: 0.98, priority: true, duckMusic: true });
  }

  // Bip-bip strident synthétisé (aucun fichier requis) : activé/désactivé
  // en continu selon l'état du bouclier (voir Game.updateAudio).
  updateShieldAlarm(dt, critical) {
    if (!this.enabled) return;
    if (critical && !this.shieldAlarm) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1250;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      this.shieldAlarm = { osc, gain, phase: 0 };
    }
    if (!critical && this.shieldAlarm) {
      const { osc, gain } = this.shieldAlarm;
      const now = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0, now, 0.05);
      osc.stop(now + 0.2);
      this.shieldAlarm = null;
    }
    if (this.shieldAlarm) {
      this.shieldAlarm.phase += dt;
      const on = this.shieldAlarm.phase % 0.7 < 0.35; // beep... beep... beep...
      this.shieldAlarm.gain.gain.setTargetAtTime(on ? 0.3 : 0, this.ctx.currentTime, 0.008);
    }
  }
}
