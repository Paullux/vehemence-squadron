import * as THREE from 'three';
import { Input } from './Input.js';
import { PlayerShip } from '../entities/PlayerShip.js';
import { Wingman } from '../entities/Wingman.js';
import { LaserPool } from '../entities/LaserPool.js';
import { Targets } from '../entities/Targets.js';
import { MothershipBoss } from '../entities/MothershipBoss.js';
import { ExplosionPool } from '../entities/Explosions.js';
import { Starfield } from '../world/Starfield.js';
import { Environment } from '../world/Environment.js';
import { SoundManager } from './SoundManager.js';
import { MAX_HP, REGEN_DELAY, REGEN_RATE } from './combat.js';
import { assetUrl } from './assetUrl.js';

const BASE_FOV = 70;
const FORWARD = new THREE.Vector3(0, 0, -1);
const BOSS_SPAWN_TIME = 10;
const LAUNCH_DURATION = 3.6;
const LAUNCH_HANGAR_DISTANCE = 360;
const LAUNCH_HANGAR_ASPECT = 1672 / 941;
const AIM_DEPTH = 78;
const AIM_RANGE_X = 22;
const AIM_RANGE_Y = 12;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

export class Game {
  constructor(container) {
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
    this.explosions = new ExplosionPool(this.scene);
    this.starfield = new Starfield(this.scene);
    // Système stellaire de la mission — voir SYSTEMS dans celestial-catalog.js
    this.environment = new Environment(this.scene, this.camera, {
      systemId: 'kharos_binary',
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

    this.hudScore = document.getElementById('score');
    this.hudSpeed = document.getElementById('speed');
    this.hudHpBar = document.getElementById('hpbar');
    this.hudFlash = document.getElementById('damage-flash');
    this.hudGameOver = document.getElementById('gameover');
    this.hudBoss = document.getElementById('boss-hud');
    this.hudBossLabel = document.getElementById('boss-label');
    this.hudBossBar = document.getElementById('boss-bar');
    this.hudMissionComplete = document.getElementById('mission-complete');
    this.hudVictoryScore = document.getElementById('victory-score');
    this.hudPointerLockHint = document.getElementById('pointer-lock-hint');
    this.debriefOverlay = document.getElementById('debrief');
    this.debriefVideo = document.getElementById('debrief-video');
    this.debriefSkip = document.getElementById('debrief-skip');
    this.debriefDone = false;
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
    // Double réticule style Star Fox, suit la position du vaisseau (pas son roulis)
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
    near.position.z = -35;
    near.renderOrder = 10;
    const far = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 4), mat);
    far.rotation.z = Math.PI / 4;
    far.position.z = -70;
    far.renderOrder = 10;
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
      if (!this.bossStarted && this.missionTime >= BOSS_SPAWN_TIME) this.spawnMothership();

      this.fireCooldown -= dt;
      if (this.input.fire && this.fireCooldown <= 0) {
        this.fireCooldown = 0.13;
        this._fireOrigin.copy(this.ship.nextGunPosition(this._v));
        this._fireDir.subVectors(this._aimTarget, this._fireOrigin);
        this.lasers.fire(this._fireOrigin, this._fireDir, 440 + this.ship.forwardSpeed);
        this.sound.playerLaser();
      }

      // Régénération du bouclier après un répit sans dégât
      this.timeSinceDamage += dt;
      if (this.timeSinceDamage > REGEN_DELAY) {
        this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);
      }
    }

    // Les ailiers volent même après la mort du joueur (ils escortent l'épave)
    if (!this.missionComplete) {
      for (const w of this.wingmen) w.update(dt, this.ship, this.targets, this.lasers, this.sound);
    }

    this.lasers.update(dt);
    this.enemyLasers.update(dt);
    this.enemyHeavyLasers.update(dt);
    if (!this.bossStarted && !this.missionComplete) {
      this.score += this.targets.update(
        dt,
        this.ship,
        this.wingmen,
        { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
        !this.gameOver,
        this.sound
      );
    }
    this.boss.update(
      dt,
      this.ship,
      { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
      !this.gameOver && !this.missionComplete,
      this.sound
    );
    if (this.bossStarted && !this.missionComplete) {
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
      if (!this.input.fire) this.restartArmed = true;
      else if (this.restartArmed) location.reload();
    }
  }

  spawnMothership() {
    this.bossStarted = true;
    this.setCombatVisible(false);
    this.hudBoss.classList.remove('hidden');
    this.boss.spawn(this.ship.group.position.z);
    this.sound.playMusic('generalBoss', { volume: 0.55, fade: 1.2 });
    this.sound.bossMothershipIncoming();
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
    this.aimGroup.position.copy(this._aimTarget);
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
      this.lasers.forEachActive((laser) => {
        if (hit) return;
        const dz = Math.abs(laser.position.z - enemy.position.z);
        const dx = laser.position.x - enemy.position.x;
        const dy = laser.position.y - enemy.position.y;
        if (dz < zWindow && dx * dx + dy * dy < rLatSq) {
          hit = true;
          this.lasers.release(laser);
          this.sound.armorHit(enemy.position);
        }
      });
      if (hit) this.damageEnemy(enemy);

      if (u.alive) {
        for (const actor of actors) {
          if (enemy.position.distanceToSquared(actor.position) < (rLat + 2) ** 2) {
            this.destroyEnemy(enemy, 0);
            actor.damage(def.ramDamage);
            break;
          }
        }
      }
    }

    if (this.boss.active) this.handleBossCollisions();

    // Lasers ennemis → n'importe quel appareil de l'escadron (dégâts du bolt)
    for (const pool of [this.enemyLasers, this.enemyHeavyLasers]) {
      pool.forEachActive((laser) => {
        for (const actor of actors) {
          if (laser.position.distanceToSquared(actor.position) < 12) {
            pool.release(laser);
            this.sound.shieldHit();
            actor.damage(laser.userData.damage || 12);
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

  completeMission() {
    if (this.missionComplete) return;
    this.missionComplete = true;
    this.hudBoss.classList.add('hidden');
    this.hudVictoryScore.textContent = this.score;
    this.hudMissionComplete.classList.remove('hidden');
    this.aimGroup.visible = false;
    this.sound.playMusic('victory', { volume: 0.58, fade: 1.5 });
    document.body.classList.remove('cursor-hidden');
    // Laisse le temps de lire le score avant d'enchaîner sur le debrief
    setTimeout(() => this.startDebrief(), 2500);
  }

  startDebrief() {
    if (!this.debriefVideo) return;
    this.hudMissionComplete.classList.add('hidden');
    this.debriefOverlay.classList.remove('hidden');
    this.debriefVideo.currentTime = 0;
    this.debriefVideo.play().catch(() => this.endDebrief());
    this.debriefVideo.addEventListener('ended', () => this.endDebrief(), { once: true });
    setTimeout(() => this.debriefSkip.classList.remove('hidden'), 1000);
    this.debriefSkip.addEventListener('click', () => this.endDebrief(), { once: true });
  }

  endDebrief() {
    if (this.debriefDone) return;
    this.debriefDone = true;
    this.debriefVideo.pause();
    this.debriefOverlay.classList.add('hidden');
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

  damageEnemy(enemy) {
    const u = enemy.userData;
    u.hp -= 1;
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
      this.hudBossLabel.textContent = this.boss.getStatusLabel();
      this.hudBossBar.style.width = `${(1 - this.boss.getProgress()) * 100}%`;
    }

    // Souris capturée façon FPS : rappel tant qu'elle n'est pas engagée
    const needsLock = !this.launching && !this.gameOver && !this.missionComplete && !this.input.pointerLocked;
    this.hudPointerLockHint.classList.toggle('hidden', !needsLock);
  }
}
