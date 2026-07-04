import * as THREE from 'three';
import { Input } from './Input.js';
import { PlayerShip } from '../entities/PlayerShip.js';
import { Wingman } from '../entities/Wingman.js';
import { LaserPool } from '../entities/LaserPool.js';
import { Targets } from '../entities/Targets.js';
import { ExplosionPool } from '../entities/Explosions.js';
import { Starfield } from '../world/Starfield.js';
import { Environment } from '../world/Environment.js';
import { SoundManager } from './SoundManager.js';
import { MAX_HP, REGEN_DELAY, REGEN_RATE } from './combat.js';

const BASE_FOV = 70;
const FORWARD = new THREE.Vector3(0, 0, -1);

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
    this.input = new Input();
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
    this.explosions = new ExplosionPool(this.scene);
    this.starfield = new Starfield(this.scene);
    // Système stellaire de la mission — voir SYSTEMS dans celestial-catalog.js
    this.environment = new Environment(this.scene, this.camera, {
      systemId: 'kharos_binary',
    });

    this.buildReticles();

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

    this.hudScore = document.getElementById('score');
    this.hudSpeed = document.getElementById('speed');
    this.hudHpBar = document.getElementById('hpbar');
    this.hudFlash = document.getElementById('damage-flash');
    this.hudGameOver = document.getElementById('gameover');

    this._v = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._look = new THREE.Vector3();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
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

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.gameOver) {
      this.ship.update(dt, this.input);
      this.aimGroup.position.copy(this.ship.group.position);

      this.fireCooldown -= dt;
      if (this.input.fire && this.fireCooldown <= 0) {
        this.fireCooldown = 0.13;
        this.lasers.fire(this.ship.nextGunPosition(this._v), FORWARD, 420 + this.ship.forwardSpeed);
        this.sound.playerLaser();
      }

      // Régénération du bouclier après un répit sans dégât
      this.timeSinceDamage += dt;
      if (this.timeSinceDamage > REGEN_DELAY) {
        this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);
      }
    }

    // Les ailiers volent même après la mort du joueur (ils escortent l'épave)
    for (const w of this.wingmen) w.update(dt, this.ship, this.targets, this.lasers, this.sound);

    this.lasers.update(dt);
    this.enemyLasers.update(dt);
    this.enemyHeavyLasers.update(dt);
    this.score += this.targets.update(
      dt,
      this.ship,
      { light: this.enemyLasers, heavy: this.enemyHeavyLasers },
      !this.gameOver,
      this.sound
    );
    this.explosions.update(dt);
    if (!this.gameOver) this.handleCollisions();
    this.starfield.update(this.camera);
    this.updateCamera(dt);
    // Après updateCamera : les astres suivent la position caméra la plus
    // fraîche possible (voir Environment.update — ils ignorent volontairement
    // la rotation de la caméra pour rester stables à l'écran).
    this.environment.update(dt, this.camera);
    this.updateAudio(dt);
    this.updateHud(dt);

    this.renderer.render(this.scene, this.camera);

    if (this.gameOver) {
      if (!this.input.fire) this.restartArmed = true;
      else if (this.restartArmed) location.reload();
    }
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
    const boosting = this.input.boost && !this.wasBoosting && !this.gameOver;
    this.sound.updateHeroEngine({
      boostAmount: this.ship.boostAmount,
      forwardSpeed: this.ship.forwardSpeed,
      boosting,
    });
    this.wasBoosting = this.input.boost && !this.gameOver;

    const ratio = this.hp / MAX_HP;
    this.sound.updateShieldAlarm(dt, ratio < 0.25 && !this.gameOver);

    // Réplique "bouclier faible", une seule fois par épisode critique
    if (ratio < 0.3 && !this.lowEnergyFired && !this.gameOver) {
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
  }
}
