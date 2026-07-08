import * as THREE from 'three';
import { Input } from './Input.js';
import { PlayerShip } from '../entities/PlayerShip.js';
import { Wingman } from '../entities/Wingman.js';
import { LaserPool } from '../entities/LaserPool.js';
import { Targets } from '../entities/Targets.js';
import { MothershipBoss } from '../entities/MothershipBoss.js';
import { AsteroidField } from '../entities/AsteroidField.js';
import { ExplosionPool } from '../entities/Explosions.js';
import { Starfield } from '../world/Starfield.js';
import { Environment } from '../world/Environment.js';
import { SoundManager } from './SoundManager.js';
import { MAX_HP, REGEN_DELAY, REGEN_RATE, getDifficulty } from './combat.js';
import { assetUrl } from './assetUrl.js';

const BASE_FOV = 70;
const FORWARD = new THREE.Vector3(0, 0, -1);
const BOSS_SPAWN_TIME = 10;
const LAUNCH_DURATION = 3.6;
const LAUNCH_HANGAR_DISTANCE = 360;
const LAUNCH_HANGAR_ASPECT = 1672 / 941;
const AIM_DEPTH = 78;
const AIM_NEAR_DEPTH = 35;
const AIM_RANGE_X = 30;
const AIM_RANGE_Y = 17;
const AUDIO_SETTINGS_KEY = 'vehemence.audio';
const MISSION_SAVE_KEY = 'vehemence.missionSave';
const DEBRIEF_DELAY = 2500;
const AI_DEBRIEF_DURATION = 13000;
const COMMANDER_BRIEF_FALLBACK_DURATION = 48000;
const DEFAULT_AUDIO_SETTINGS = {
  master: 0.72,
  music: 0.42,
  sfx: 0.85,
  voice: 2.2,
};
const DEBRIEF_VIDEO_BY_MISSION = {
  mission01: '/cinematics/first_mission_end/debrief_end_first_mission.mp4',
  mission02: '/cinematics/second_mission_end/red_corona_escape_seedance.mp4',
};
const MISSION02_COMMANDER_BRIEF =
  "Pilotes de l'escadron Aquila.\n\n" +
  "La Couronne Rouge est tombee.\n\n" +
  "Vous avez detruit la base cachee de l'Hegemonie et rouvert une route que nos ennemis pensaient tenir pour toujours.\n\n" +
  "Apres Kharos-3, la Confederation esperait encore. Apres cette seconde victoire, elle peut croire de nouveau.\n\n" +
  "Croire qu'un jour, les Mondes Libres retrouveront la paix que l'Hegemonie du Vide leur a volee.\n\n" +
  "Cette paix ne reviendra pas seule. Elle reviendra parce que des pilotes comme vous acceptent de decoller quand tout semble perdu.\n\n" +
  "Le Vehemence transmettra votre victoire a tous les mondes libres.\n\n" +
  "Reposez-vous, Aquila. La guerre n'est pas terminee. Mais grace a vous, elle a change de direction.";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

export class Game {
  constructor(container, options = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 4000);
    this.camera.position.set(0, 3.5, 15);
    this.scene.add(this.camera);

    this.clock = new THREE.Clock();
    this.input = new Input(this.renderer.domElement);
    this.sound = new SoundManager();
    this.difficulty = getDifficulty(options.difficulty);
    this.missionId = options.missionId || 'mission01';

    this.ship = new PlayerShip(this.scene);
    this.playerCallsign = 'Lynx';
    // Escadron Aquila en V : joueur au centre, flanc-gardes légèrement devant,
    // éclaireur en pointe haute (devant = -Z, sinon ils masquent la caméra).
    // Callsigns façon Top Gun — voir CONTEXTE.md pour le reste de la liste.
    this.wingmen = [
      new Wingman(this.scene, [-13, 1.5, -5], 'Renard'),
      new Wingman(this.scene, [13, 1.5, -5], 'Cobra'),
      new Wingman(this.scene, [0, 7, -13], 'Corbeau'),
    ];
    this.lasers = new LaserPool(this.scene);
    this.enemyLasers = new LaserPool(this.scene, { size: 32, color: 0xff3344, radius: 0.14 });
    this.enemyHeavyLasers = new LaserPool(this.scene, { size: 16, color: 0xff7733, radius: 0.28, length: 6.5 });
    this.targets = new Targets(this.scene);
    this.boss = new MothershipBoss(this.scene);
    this.asteroidField = new AsteroidField(this.scene);
    this.explosions = new ExplosionPool(this.scene);
    this.starfield = new Starfield(this.scene);
    // Système stellaire de la mission — voir SYSTEMS dans celestial-catalog.js
    this.environment = new Environment(this.scene, this.camera, {
      systemId: this.missionId === 'mission02' ? 'kharos_red_corona' : 'kharos_binary',
    });

    this.buildReticles();
    this.buildLaunchSequence();

    this.score = 0;
    this.fireCooldown = 0;
    this.shake = 0;
    this.hp = MAX_HP;
    this.gameOver = false;
    this.restartArmed = false;
    this.timeSinceDamage = REGEN_DELAY;
    this.flashTimer = 0;
    this.wasBoosting = false;
    this.lowEnergyFired = false;
    this.missionTime = 0;
    this.bossStarted = false;
    this.missionComplete = false;
    this.paused = false;

    this.hudScore = document.getElementById('score');
    this.hudDifficulty = document.getElementById('difficulty-label');
    this.hudSpeed = document.getElementById('speed');
    this.hudHpBar = document.getElementById('hpbar');
    this.hudFlash = document.getElementById('damage-flash');
    this.hudGameOver = document.getElementById('gameover');
    this.hudBoss = document.getElementById('boss-hud');
    this.hudBossLabel = document.getElementById('boss-label');
    this.hudBossBar = document.getElementById('boss-bar');
    this.hudMissionComplete = document.getElementById('mission-complete');
    this.hudMissionCompleteTitle = document.getElementById('mission-complete-title');
    this.hudMissionCompleteSubtitle = document.getElementById('mission-complete-subtitle');
    this.hudVictoryScore = document.getElementById('victory-score');
    this.hudPointerLockHint = document.getElementById('pointer-lock-hint');
    this.pauseMenu = document.getElementById('pause-menu');
    this.pauseResume = document.getElementById('pause-resume');
    this.pauseSave = document.getElementById('pause-save');
    this.pauseClearSave = document.getElementById('pause-clear-save');
    this.pauseSaveStatus = document.getElementById('pause-save-status');
    this.audioControls = {
      master: document.getElementById('audio-master'),
      music: document.getElementById('audio-music'),
      sfx: document.getElementById('audio-sfx'),
      voice: document.getElementById('audio-voice'),
    };
    this.audioLabels = {
      master: document.getElementById('audio-master-value'),
      music: document.getElementById('audio-music-value'),
      sfx: document.getElementById('audio-sfx-value'),
      voice: document.getElementById('audio-voice-value'),
    };
    this.debriefOverlay = document.getElementById('debrief');
    this.debriefVideo = document.getElementById('debrief-video');
    this.debriefAi = document.getElementById('debrief-ai');
    this.debriefAiImage = document.getElementById('debrief-ai-image');
    this.debriefCommander = document.getElementById('debrief-commander');
    this.debriefCommanderCopy = document.getElementById('debrief-commander-copy');
    this.debriefSkip = document.getElementById('debrief-skip');
    this.debriefDone = false;
    this.debriefTimer = null;
    this.commanderBriefSource = null;
    this.hudRoot = document.getElementById('hud');
    this.launchOverlay = document.getElementById('launch-sequence');
    this.launchStatus = document.getElementById('launch-status');
    this.launchProgress = document.getElementById('launch-progress');
    this.launching = true;
    this.launchTime = 0;
    this.hudRoot.classList.add('launching');
    this.launchOverlay.classList.remove('hidden');
    this.setCombatVisible(false);
    this.setEnvironmentVisible(false);
    this.updateLaunchHangarPlane();
    this.setupPauseMenu();
    if (this.hudDifficulty) this.hudDifficulty.textContent = `MODE ${this.difficulty.label}`;

    this._v = new THREE.Vector3();
    this._aimTarget = new THREE.Vector3();
    this._fireOrigin = new THREE.Vector3();
    this._fireDir = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._look = new THREE.Vector3();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.updateLaunchHangarPlane();
    });
  }

  buildReticles() {
    // Double réticule style Star Fox : grand carré proche, petit carré sur le
    // point de convergence des lasers.
    this.aimGroup = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x55ff88,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const near = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.0, 4), mat);
    near.rotation.z = Math.PI / 4;
    near.renderOrder = 10;
    const far = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 4), mat);
    far.rotation.z = Math.PI / 4;
    far.renderOrder = 10;
    this.aimNearReticle = near;
    this.aimFarReticle = far;
    this.aimGroup.add(near, far);
    this.scene.add(this.aimGroup);
  }

  buildLaunchSequence() {
    this.starfield.points.renderOrder = -30;
    const hangarTexture = new THREE.TextureLoader().load(assetUrl('/images/interieur_vehemence.png'));
    hangarTexture.colorSpace = THREE.SRGBColorSpace;
    const hangarMaterial = new THREE.MeshBasicMaterial({
      map: hangarTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.launchHangarPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hangarMaterial);
    this.launchHangarPlane.position.z = -LAUNCH_HANGAR_DISTANCE;
    this.launchHangarPlane.renderOrder = -20;
    this.camera.add(this.launchHangarPlane);

    this.launchActors = [
      {
        group: this.ship.group,
        mesh: this.ship.mesh,
        start: new THREE.Vector3(-8.8, -0.2, -18),
        end: new THREE.Vector3(-3.8, 6.4, -132),
        roll: -0.1,
        pitch: 0.08,
        yaw: -0.04,
        delay: 0.15,
        scale: 1.22,
      },
      {
        group: this.wingmen[0].group,
        mesh: this.wingmen[0].mesh,
        start: new THREE.Vector3(4.4, 0.5, -30),
        end: new THREE.Vector3(8.8, 7.4, -168),
        roll: -0.22,
        pitch: 0.07,
        yaw: -0.12,
        delay: 0.72,
        scale: 0.86,
      },
      {
        group: this.wingmen[1].group,
        mesh: this.wingmen[1].mesh,
        start: new THREE.Vector3(9.8, 1.9, -42),
        end: new THREE.Vector3(14.5, 8.8, -210),
        roll: 0.18,
        pitch: 0.09,
        yaw: -0.16,
        delay: 1.15,
        scale: 0.68,
      },
      {
        group: this.wingmen[2].group,
        mesh: this.wingmen[2].mesh,
        start: new THREE.Vector3(0.8, 3.2, -58),
        end: new THREE.Vector3(4.8, 9.4, -250),
        roll: -0.12,
        pitch: 0.08,
        yaw: -0.1,
        delay: 1.55,
        scale: 0.52,
      },
    ];

    const trailGeo = new THREE.CylinderGeometry(0.08, 0.42, 38, 18, 1, true);
    trailGeo.rotateX(Math.PI / 2);
    for (const actor of this.launchActors) {
      actor.originalScale = actor.group.scale.clone();
      const trail = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
          color: 0x36fff2,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      trail.position.z = 21;
      trail.renderOrder = 5;
      actor.trail = trail;
      actor.group.add(trail);
    }
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.paused) {
      this.updateHud(0);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.launching) {
      this.updateLaunch(dt);
      this.starfield.update(this.camera);
      this.environment.update(dt, this.camera);
      this.updateAudio(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!this.gameOver && !this.missionComplete) {
      this.ship.update(dt, this.input);
      this.updateAimTarget(dt);
      this.missionTime += dt;
      if (this.missionId === 'mission01' && !this.bossStarted && this.missionTime >= BOSS_SPAWN_TIME) this.spawnMothership();
      if (this.missionId === 'mission02' && !this.asteroidField.active) this.startAsteroidMission();

      this.fireCooldown -= dt;
      if (this.input.fire && this.fireCooldown <= 0) {
        this.fireCooldown = 0.13 * this.difficulty.fireCooldownMultiplier;
        this._fireOrigin.copy(this.ship.nextGunPosition(this._v));
        this._fireDir.subVectors(this._aimTarget, this._fireOrigin);
        this.lasers.fire(this._fireOrigin, this._fireDir, 440 + this.ship.forwardSpeed, 1.4, this.difficulty.playerDamageMultiplier);
        this.sound.playerLaser();
      }

      // Régénération du bouclier après un répit sans dégât
      this.timeSinceDamage += dt;
      if (this.timeSinceDamage > REGEN_DELAY) {
        this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * this.difficulty.regenRateMultiplier * dt);
      }
    }

    // Les ailiers volent même après la mort du joueur (ils escortent l'épave)
    if (!this.missionComplete) {
      for (const w of this.wingmen) w.update(dt, this.ship, this.targets, this.lasers, this.sound, {
        regenRateMultiplier: this.difficulty.regenRateMultiplier,
      });
    }

    this.lasers.update(dt);
    this.enemyLasers.update(dt);
    this.enemyHeavyLasers.update(dt);
    if (this.missionId === 'mission01' && !this.bossStarted && !this.missionComplete) {
      this.score += this.targets.update(
        dt,
        this.ship,
        this.wingmen,
        { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
        !this.gameOver,
        this.sound
      );
    }
    if (this.missionId === 'mission01') {
      this.boss.update(
        dt,
        this.ship,
        { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
        !this.gameOver && !this.missionComplete,
        this.sound
      );
    }
    if (this.missionId === 'mission02' && !this.missionComplete) {
      this.score += this.asteroidField.update(
        dt,
        this.ship,
        { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
        !this.gameOver,
        this.sound,
        this.targets
      );
      this.targets.update(
        dt,
        this.ship,
        this.wingmen,
        { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
        !this.gameOver,
        this.sound,
        { respawn: false, rings: false }
      );
      if (this.asteroidField.complete) this.completeMission();
    }
    if (this.missionId === 'mission01' && this.bossStarted && !this.missionComplete) {
      const launchOrigin = this.boss.consumeFighterLaunch();
      if (launchOrigin) {
        this.targets.launchFromMothership('basic_fighter', launchOrigin, this.ship.group.position.z);
        if (Math.random() > 0.55) {
          launchOrigin.x += (Math.random() - 0.5) * 10;
          launchOrigin.y += (Math.random() - 0.5) * 4;
          this.targets.launchFromMothership('basic_fighter', launchOrigin, this.ship.group.position.z);
        }
      }
      this.targets.update(
        dt,
        this.ship,
        this.wingmen,
        { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
        !this.gameOver,
        this.sound,
        { respawn: false, rings: false }
      );
    }
    this.explosions.update(dt);
    if (!this.gameOver && !this.missionComplete) this.handleCollisions();
    this.starfield.update(this.camera);
    this.updateCamera(dt);
    // Après updateCamera : les astres suivent la position caméra la plus
    // fraîche possible (voir Environment.update — ils ignorent volontairement
    // la rotation de la caméra pour rester stables à l'écran).
    this.environment.update(dt, this.camera);
    this.updateAudio(dt);
    this.updateHud(dt);

    this.renderer.render(this.scene, this.camera);

    // Pour une mission réussie, on attend la fin (ou le skip) du debrief
    // avant d'autoriser le redémarrage — sinon "tirer" sur l'écran de score
    // sauterait la vidéo avant même qu'elle démarre.
    if (this.gameOver || (this.missionComplete && this.debriefDone)) {
      const restartPressed = this.input.fire || this.input.isDown('Space');
      if (!restartPressed) this.restartArmed = true;
      else if (this.restartArmed) location.reload();
    }
  }

  setupPauseMenu() {
    const settings = this.loadAudioSettings();
    for (const [key, control] of Object.entries(this.audioControls)) {
      if (!control) continue;
      control.value = Math.round(settings[key] * 100);
      this.updateAudioControlLabel(key, settings[key]);
      control.addEventListener('input', () => {
        const next = Number(control.value) / 100;
        settings[key] = next;
        this.applyAudioSettings(settings);
        this.saveAudioSettings(settings);
        this.updateAudioControlLabel(key, next);
      });
    }
    this.applyAudioSettings(settings);
    this.updateSaveStatus();

    this.pauseResume?.addEventListener('click', () => this.setPaused(false));
    this.pauseSave?.addEventListener('click', () => this.saveMissionSnapshot());
    this.pauseClearSave?.addEventListener('click', () => this.clearMissionSnapshot());

    addEventListener('keydown', (event) => {
      if (event.code !== 'Space') return;
      if (this.launching || this.gameOver || this.missionComplete) return;
      event.preventDefault();
      this.setPaused(!this.paused);
    });
  }

  loadAudioSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY));
      const settings = { ...DEFAULT_AUDIO_SETTINGS, ...saved };
      settings.voice = Math.max(DEFAULT_AUDIO_SETTINGS.voice, settings.voice);
      return settings;
    } catch {
      return { ...DEFAULT_AUDIO_SETTINGS };
    }
  }

  saveAudioSettings(settings) {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  }

  applyAudioSettings(settings) {
    this.sound.setMasterVolume(settings.master);
    this.sound.setGroupVolume('music', settings.music);
    this.sound.setGroupVolume('sfx', settings.sfx);
    this.sound.setGroupVolume('voice', settings.voice);
  }

  updateAudioControlLabel(key, value) {
    if (this.audioLabels[key]) this.audioLabels[key].textContent = Math.round(value * 100);
  }

  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.pauseMenu?.classList.toggle('hidden', !paused);
    this.hudPointerLockHint?.classList.add('hidden');
    document.body.classList.toggle('cursor-hidden', !paused && !this.gameOver && !this.missionComplete);
    if (paused) {
      document.exitPointerLock?.();
      this.sound.setLoop('heroEngine', { volume: 0 });
      this.input.keys.delete('Space');
      this.updateSaveStatus();
    } else {
      this.clock.getDelta();
    }
  }

  saveMissionSnapshot() {
    const data = {
      savedAt: new Date().toISOString(),
      score: this.score,
      hp: Math.round(this.hp),
      missionTime: Math.round(this.missionTime),
      bossStarted: this.bossStarted,
      bossProgress: this.bossStarted ? Number(this.boss.getProgress().toFixed(2)) : 0,
    };
    localStorage.setItem(MISSION_SAVE_KEY, JSON.stringify(data));
    this.updateSaveStatus(data);
  }

  clearMissionSnapshot() {
    localStorage.removeItem(MISSION_SAVE_KEY);
    this.updateSaveStatus(null);
  }

  updateSaveStatus(data = undefined) {
    if (!this.pauseSaveStatus) return;
    let save = data;
    if (save === undefined) {
      try {
        save = JSON.parse(localStorage.getItem(MISSION_SAVE_KEY));
      } catch {
        save = null;
      }
    }
    if (!save) {
      this.pauseSaveStatus.textContent = 'Aucune sauvegarde de mission.';
      return;
    }
    const date = new Date(save.savedAt).toLocaleString('fr-FR');
    const boss = save.bossStarted ? ` Boss ${Math.round(save.bossProgress * 100)}%.` : '';
    this.pauseSaveStatus.textContent = `Derniere sauvegarde : ${date}. Score ${save.score}, bouclier ${save.hp}%, temps ${save.missionTime}s.${boss}`;
  }

  spawnMothership() {
    this.bossStarted = true;
    this.setCombatVisible(false);
    this.hudBoss.classList.remove('hidden');
    this.boss.spawn(this.ship.group.position.z);
    this.sound.playMusic('generalBoss', { volume: 0.55, fade: 1.2 });
    this.sound.bossMothershipIncoming();
  }

  startAsteroidMission() {
    this.bossStarted = true;
    this.setCombatVisible(false);
    this.hudBoss.classList.remove('hidden');
    this.asteroidField.start(this.ship.group.position.z);
    this.sound.playMusic('mission01', { volume: 0.52, fade: 1.2 });
  }

  updateLaunch(dt) {
    this.launchTime += dt;
    const t = this.launchTime;
    const global = smoothstep(t / LAUNCH_DURATION);

    this.camera.position.set(0, 1.15 - global * 0.2, -4 + global * 1.5);
    this.camera.lookAt(0, 3.55 + global * 2.2, -94 - global * 58);
    this.camera.fov = 44 - global * 2;
    this.camera.updateProjectionMatrix();
    this.updateLaunchHangarPlane();
    this.aimGroup.visible = false;
    this.ship.forwardSpeed = 85 + global * 90;
    this.ship.boostAmount = 0.65 + global * 0.35;

    for (const actor of this.launchActors) {
      const local = smoothstep((t - actor.delay) / (LAUNCH_DURATION - 1.05));
      actor.group.visible = t >= actor.delay - 0.1;
      actor.group.position.lerpVectors(actor.start, actor.end, local);
      actor.group.scale.setScalar(actor.scale * (1 - local * 0.4));
      actor.mesh.rotation.set(
        actor.pitch + Math.sin(t * 2 + actor.delay) * 0.035,
        actor.yaw,
        actor.roll + Math.sin(t * 3 + actor.delay) * 0.04
      );
      actor.trail.visible = local < 0.97;
      actor.trail.material.opacity = (1 - local) * (0.28 + Math.sin(t * 24) * 0.04);
      actor.trail.scale.set(0.72 + local * 0.18, 0.72 + local * 0.18, 1 + local * 1.3);
    }

    if (this.launchStatus) {
      if (t < 1.5) this.launchStatus.textContent = 'CATAPULTES SYNCHRONISEES';
      else if (t < 3.4) this.launchStatus.textContent = 'ESCADRON AQUILA EN SORTIE';
      else this.launchStatus.textContent = 'LE VEHEMENCE VOUS OUVRE LA VOIE';
    }
    if (this.launchProgress) {
      this.launchProgress.style.transform = `scaleX(${clamp01(t / LAUNCH_DURATION)})`;
    }

    if (t >= LAUNCH_DURATION) this.finishLaunch();
  }

  finishLaunch() {
    this.launching = false;
    this.launchOverlay.classList.add('hidden');
    this.launchHangarPlane.visible = false;
    this.hudRoot.classList.remove('launching');
    this.aimGroup.visible = true;
    this.setCombatVisible(true);
    this.setEnvironmentVisible(true);

    this.ship.group.position.set(0, 0, 0);
    this.ship.group.scale.copy(this.launchActors[0].originalScale);
    this.ship.mesh.rotation.set(0, 0, 0);
    this.ship.velocity.set(0, 0);
    this.ship.forwardSpeed = 60;
    this.ship.boostAmount = 0;

    for (let i = 0; i < this.wingmen.length; i++) {
      const wingman = this.wingmen[i];
      const actor = this.launchActors[i + 1];
      wingman.group.position.copy(wingman.offset);
      wingman.group.scale.copy(actor.originalScale);
      wingman.mesh.rotation.set(0, 0, 0);
      actor.trail.visible = false;
    }
    this.launchActors[0].trail.visible = false;

    this.camera.position.set(0, 3.5, 15);
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.updateAimTarget(1);
  }

  setCombatVisible(visible) {
    for (const enemy of this.targets.enemies) enemy.visible = visible;
    for (const ring of this.targets.rings) ring.visible = visible;
  }

  setEnvironmentVisible(visible) {
    for (const star of this.environment.stars) star.group.visible = visible;
    for (const planet of this.environment.planets) planet.group.visible = visible;
  }

  updateLaunchHangarPlane() {
    if (!this.launchHangarPlane) return;
    const viewHeight = 2 * LAUNCH_HANGAR_DISTANCE * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const viewWidth = viewHeight * this.camera.aspect;
    const viewAspect = viewWidth / viewHeight;
    const height = viewAspect > LAUNCH_HANGAR_ASPECT ? viewWidth / LAUNCH_HANGAR_ASPECT : viewHeight;
    const width = viewAspect > LAUNCH_HANGAR_ASPECT ? viewWidth : viewHeight * LAUNCH_HANGAR_ASPECT;
    this.launchHangarPlane.scale.set(width, height, 1);
  }

  updateAimTarget(dt) {
    const sp = this.ship.group.position;
    const desired = this._v.set(
      sp.x + this.input.aimX * AIM_RANGE_X,
      sp.y + this.input.aimY * AIM_RANGE_Y,
      sp.z - AIM_DEPTH
    );
    this._aimTarget.lerp(desired, 1 - Math.exp(-14 * dt));
    const nearT = AIM_NEAR_DEPTH / AIM_DEPTH;
    this.aimFarReticle.position.copy(this._aimTarget);
    this.aimNearReticle.position.set(
      sp.x + (this._aimTarget.x - sp.x) * nearT,
      sp.y + (this._aimTarget.y - sp.y) * nearT,
      sp.z - AIM_NEAR_DEPTH
    );
  }

  handleCollisions() {
    // Tout l'escadron (joueur + ailiers vivants) subit les mêmes règles de
    // dégâts — un bolt ou une collision touche le premier appareil trouvé
    // dans son rayon, qu'il s'agisse du héros ou d'un PNJ.
    const actors = [{ position: this.ship.group.position, damage: (amt) => this.applyDamage(amt) }];
    for (const w of this.wingmen) {
      if (w.alive) actors.push({ position: w.group.position, damage: (amt) => this.damageWingman(w, amt) });
    }

    for (const enemy of this.targets.enemies) {
      if (!enemy.visible) continue;
      const u = enemy.userData;
      if (!u.alive) continue;
      const def = u.def;
      // Hitbox proportionnelle au gabarit du vaisseau
      const rLat = def.length * 0.35;
      const rLatSq = rLat * rLat;
      const zWindow = Math.max(7, def.length * 0.6);

      let hit = false;
      let laserDamage = 1;
      this.lasers.forEachActive((laser) => {
        if (hit) return;
        const dz = Math.abs(laser.position.z - enemy.position.z);
        const dx = laser.position.x - enemy.position.x;
        const dy = laser.position.y - enemy.position.y;
        if (dz < zWindow && dx * dx + dy * dy < rLatSq) {
          hit = true;
          laserDamage = laser.userData.damage || 1;
          this.lasers.release(laser);
          this.sound.armorHit(enemy.position);
        }
      });
      if (hit) this.damageEnemy(enemy, laserDamage);

      if (u.alive) {
        for (const actor of actors) {
          if (enemy.position.distanceToSquared(actor.position) < (rLat + 2) ** 2) {
            this.destroyEnemy(enemy, 0);
            actor.damage(def.ramDamage * this.difficulty.receivedDamageMultiplier);
            break;
          }
        }
      }
    }

    if (this.missionId === 'mission01' && this.boss.active) this.handleBossCollisions();
    if (this.missionId === 'mission02') {
      this.handleAsteroidMissionCollisions();
      this.asteroidField.applyCollision(this.ship.group.position, (amt) =>
        this.applyDamage(amt * this.difficulty.receivedDamageMultiplier)
      );
    }

    // Lasers ennemis → n'importe quel appareil de l'escadron (dégâts du bolt)
    for (const pool of [this.enemyLasers, this.enemyHeavyLasers]) {
      pool.forEachActive((laser) => {
        for (const actor of actors) {
          if (laser.position.distanceToSquared(actor.position) < 12) {
            pool.release(laser);
            this.sound.shieldHit();
            actor.damage((laser.userData.damage || 12) * this.difficulty.receivedDamageMultiplier);
            return; // un bolt ne touche qu'un seul appareil
          }
        }
      });
    }
  }

  handleBossCollisions() {
    this.lasers.forEachActive((laser) => {
      const result = this.boss.handleLaser(laser, this.explosions, this.sound);
      if (!result.hit) return;
      this.lasers.release(laser);
      if (result.score > 0) this.score += result.score;
      if (this.boss.defeated) this.completeMission();
    });
  }

  handleAsteroidMissionCollisions() {
    this.lasers.forEachActive((laser) => {
      const result = this.asteroidField.handleLaser(laser, this.explosions, this.sound);
      if (!result.hit) return;
      this.lasers.release(laser);
      if (result.score > 0) this.score += result.score;
    });
  }

  completeMission() {
    if (this.missionComplete) return;
    this.missionComplete = true;
    this.hudBoss.classList.add('hidden');
    if (this.missionId === 'mission02') {
      this.hudMissionCompleteTitle.textContent = 'COURONNE SECURISEE';
      this.hudMissionCompleteSubtitle.textContent = 'BASE-ASTEROIDE DETRUITE';
    } else {
      this.hudMissionCompleteTitle.textContent = 'ROUTE LIBEREE';
      this.hudMissionCompleteSubtitle.textContent = 'VAISSEAU-MERE DETRUIT';
    }
    this.hudVictoryScore.textContent = this.score;
    this.hudMissionComplete.classList.remove('hidden');
    this.aimGroup.visible = false;
    this.sound.playMusic('victory', { volume: 0.58, fade: 1.5 });
    document.body.classList.remove('cursor-hidden');
    // Laisse le temps de lire le score avant d'enchaîner sur le debrief
    setTimeout(() => this.startDebrief(), DEBRIEF_DELAY);
  }

  startDebrief() {
    if (!this.debriefOverlay) return;
    this.hudMissionComplete.classList.add('hidden');
    this.debriefOverlay.classList.remove('hidden');
    this.debriefSkip.classList.add('hidden');
    this.debriefSkip.addEventListener('click', () => this.endDebrief(), { once: true });
    setTimeout(() => this.debriefSkip.classList.remove('hidden'), 1000);

    this.startVideoDebrief();
  }

  startVideoDebrief() {
    if (!this.debriefVideo) {
      this.endDebrief();
      return;
    }
    this.debriefAi?.classList.add('hidden');
    this.debriefCommander?.classList.add('hidden');
    this.debriefVideo.classList.remove('hidden');
    this.debriefVideo.src = DEBRIEF_VIDEO_BY_MISSION[this.missionId] || DEBRIEF_VIDEO_BY_MISSION.mission01;
    this.debriefVideo.currentTime = 0;
    this.debriefVideo.play().catch(() => this.endDebrief());
    this.debriefVideo.addEventListener(
      'ended',
      () => (this.missionId === 'mission02' ? this.startCommanderBriefing() : this.endDebrief()),
      { once: true }
    );
    if (this.missionId === 'mission02') {
      this.debriefVideo.addEventListener('error', () => this.startAiDebrief(), { once: true });
    }
  }

  startAiDebrief() {
    this.debriefVideo?.pause();
    this.debriefVideo?.classList.add('hidden');
    this.debriefCommander?.classList.add('hidden');
    this.debriefAi?.classList.remove('hidden');
    if (this.debriefAiImage) {
      this.debriefAiImage.style.animation = 'none';
      this.debriefAiImage.offsetHeight;
      this.debriefAiImage.style.animation = '';
    }
    this.debriefTimer = setTimeout(() => this.endDebrief(), AI_DEBRIEF_DURATION);
  }

  async startCommanderBriefing() {
    this.debriefVideo?.pause();
    this.debriefVideo?.classList.add('hidden');
    this.debriefAi?.classList.add('hidden');
    if (this.debriefCommanderCopy) this.debriefCommanderCopy.textContent = MISSION02_COMMANDER_BRIEF;
    this.debriefCommander?.classList.remove('hidden');
    if (this.debriefTimer) {
      clearTimeout(this.debriefTimer);
      this.debriefTimer = null;
    }
    const voice = await this.sound.mission02CommanderDebrief();
    if (this.debriefDone) {
      voice?.source?.stop?.();
      return;
    }
    this.commanderBriefSource = voice?.source || null;
    const durationMs = voice?.duration ? voice.duration * 1000 + 1200 : COMMANDER_BRIEF_FALLBACK_DURATION;
    this.debriefTimer = setTimeout(() => this.endDebrief(), durationMs);
  }

  endDebrief() {
    if (this.debriefDone) return;
    this.debriefDone = true;
    if (this.debriefTimer) {
      clearTimeout(this.debriefTimer);
      this.debriefTimer = null;
    }
    try {
      this.commanderBriefSource?.stop?.();
    } catch {
      // La source peut deja etre terminee si la voix a fini naturellement.
    }
    this.commanderBriefSource = null;
    this.debriefVideo?.pause();
    this.debriefVideo?.classList.add('hidden');
    this.debriefAi?.classList.add('hidden');
    this.debriefCommander?.classList.add('hidden');
    this.debriefSkip?.classList.add('hidden');
    this.debriefOverlay?.classList.add('hidden');
    this.hudMissionComplete.classList.remove('hidden');
  }

  damageWingman(wingman, amount) {
    wingman.applyDamage(amount);
    if (!wingman.alive) {
      this.sound.explosion('small', wingman.group.position);
      this.explosions.spawn(wingman.group.position);
      wingman.group.visible = false;
      this.sound.wingmanDown(wingman.callsign);
    }
  }

  damageEnemy(enemy, amount = 1) {
    const u = enemy.userData;
    u.hp -= Math.max(1, amount);
    if (u.hp <= 0) {
      this.destroyEnemy(enemy, u.def.score);
    } else {
      u.hitFlash = 0.5; // le halo flashe : touché mais pas détruit
    }
  }

  destroyEnemy(enemy, points) {
    const kind = enemy.userData.def.length > 20 ? 'big' : enemy.userData.def.length > 10 ? 'medium' : 'small';
    enemy.userData.alive = false;
    enemy.visible = false;
    this.sound.explosion(kind, enemy.position);
    this.explosions.spawn(enemy.position);
    if (enemy.userData.def.length > 20) {
      // Gros vaisseau : gerbe d'explosions
      const o = new THREE.Vector3();
      this.explosions.spawn(o.copy(enemy.position).add(new THREE.Vector3(6, 3, -5)));
      this.explosions.spawn(o.copy(enemy.position).add(new THREE.Vector3(-5, -2, 6)));
    }
    if (points > 0) this.sound.enemyKilled(); // pas de réplique pour une collision suicide (0 pt)
    this.score += points;
  }

  applyDamage(amount) {
    if (this.gameOver) return;
    this.hp = Math.max(0, this.hp - amount);
    this.timeSinceDamage = 0;
    this.flashTimer = 0.35;
    this.shake = Math.max(this.shake, 0.5);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.gameOver = true;
    this.setPaused(false);
    this.sound.explosion('medium', this.ship.group.position);
    this.explosions.spawn(this.ship.group.position);
    this.ship.group.visible = false;
    this.aimGroup.visible = false;
    document.getElementById('final-score').textContent = this.score;
    this.hudGameOver.classList.remove('hidden');
    document.body.classList.remove('cursor-hidden');
  }

  updateCamera(dt) {
    const sp = this.ship.group.position;
    const k = 1 - Math.exp(-6 * dt);

    // Le retard exponentiel sur z crée naturellement un recul caméra pendant le boost
    this._camTarget.set(sp.x * 0.88, sp.y * 0.88 + 3.4, sp.z + 15);
    this.camera.position.lerp(this._camTarget, k);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.6;
    }

    this._look.set(sp.x * 0.95, sp.y * 0.95, sp.z - 60);
    this.camera.lookAt(this._look);

    const targetFov = BASE_FOV + this.ship.boostAmount * 12;
    if (Math.abs(targetFov - this.camera.fov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
  }

  updateAudio(dt) {
    this.sound.setListener(this.camera.position);
    // Sons de vol (moteur, alarme, répliques) coupés dès la fin de mission —
    // seule la musique de victoire/défaite doit continuer à jouer.
    const flying = !this.gameOver && !this.missionComplete;
    if (flying) {
      const boosting = this.input.boost && !this.wasBoosting;
      this.sound.updateHeroEngine({
        boostAmount: this.ship.boostAmount,
        forwardSpeed: this.ship.forwardSpeed,
        boosting,
      });
    } else {
      this.sound.setLoop('heroEngine', { volume: 0 });
    }
    this.wasBoosting = this.input.boost && flying;

    const ratio = this.hp / MAX_HP;
    this.sound.updateShieldAlarm(dt, flying && ratio < 0.25);

    // Réplique "bouclier faible", une seule fois par épisode critique
    if (flying && ratio < 0.3 && !this.lowEnergyFired) {
      this.lowEnergyFired = true;
      this.sound.lowEnergy(null);
    } else if (ratio > 0.6) {
      this.lowEnergyFired = false;
    }
  }

  updateHud(dt) {
    this.hudScore.textContent = `SCORE ${this.score}`;
    this.hudSpeed.textContent = `VITESSE ${Math.round(this.ship.forwardSpeed * 10)} km/h`;

    const ratio = this.hp / MAX_HP;
    this.hudHpBar.style.width = `${ratio * 100}%`;
    this.hudHpBar.style.background = ratio > 0.5 ? '#4be08a' : ratio > 0.25 ? '#e0b04b' : '#e04b4b';

    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.hudFlash.style.opacity = this.flashTimer > 0 ? (this.flashTimer / 0.35) * 0.8 : 0;

    if (this.bossStarted && !this.boss.defeated) {
      const bossHud = this.missionId === 'mission02' ? this.asteroidField : this.boss;
      this.hudBossLabel.textContent = bossHud.getStatusLabel();
      this.hudBossBar.style.width = `${(1 - bossHud.getProgress()) * 100}%`;
    }

    // Souris capturée façon FPS : rappel tant qu'elle n'est pas engagée
    const needsLock = !this.launching && !this.gameOver && !this.missionComplete && !this.input.pointerLocked;
    this.hudPointerLockHint.classList.toggle('hidden', !needsLock);
  }
}
