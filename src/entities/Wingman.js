import * as THREE from 'three';
import { loadShipModel } from '../core/ShipModel.js';
import { makeHaloSprite } from '../core/halo.js';
import { HERO_MODEL } from './PlayerShip.js';
import { MAX_HP, REGEN_DELAY, REGEN_RATE } from '../core/combat.js';

const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

/**
 * Ailier PNJ de l'escadron Aquila : même chasseur que le joueur, vole en
 * formation (offset relatif au héros, suivi avec inertie) et tire sur les
 * ennemis qui passent dans son cône avant. Meurt dans les mêmes conditions
 * que le joueur (mêmes PV/régén — voir core/combat.js) ; les dégâts réels
 * sont appliqués par Game.handleCollisions via applyDamage().
 */
export class Wingman {
  constructor(scene, offset, callsign) {
    this.offset = new THREE.Vector3(...offset);
    this.callsign = callsign;
    this.group = new THREE.Group();
    this.group.position.copy(this.offset); // démarre à son poste, pas sur le joueur
    this.mesh = new THREE.Group();
    this.group.add(this.mesh);

    this.hp = MAX_HP;
    this.alive = true;
    this.timeSinceDamage = REGEN_DELAY;
    this.hitFlash = 0;
    this.lowEnergyFired = false;

    this.prevX = 0;
    this.prevY = 0;
    this.roll = 0;
    this.pitch = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.fireCooldown = 1 + Math.random() * 2;

    const placeholder = new THREE.Mesh(
      new THREE.ConeGeometry(1, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, flatShading: true })
    );
    placeholder.rotation.x = -Math.PI / 2;
    this.mesh.add(placeholder);
    loadShipModel(HERO_MODEL)
      .then((model) => {
        this.mesh.clear();
        this.mesh.add(model);
      })
      .catch((err) => console.error('Modèle ailier indisponible — placeholder conservé', err));

    // Halo cyan allié, plus discret que celui du héros
    this.halo = makeHaloSprite({ color: 0x44ddff, size: 9, opacity: 0.16 });
    this.halo.position.z = -4;
    this.group.add(this.halo);

    scene.add(this.group);
  }

  // Applique des dégâts (même barème que le joueur) ; déclenche la
  // destruction si les PV tombent à zéro. Appelé par Game.handleCollisions.
  applyDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.timeSinceDamage = 0;
    this.hitFlash = 0.4;
    if (this.hp <= 0) this.alive = false; // Game.js déclenche l'explosion au moment de l'impact
  }

  update(dt, player, targets, lasers, sound = null) {
    if (!this.alive) return;

    // Régénération du bouclier après un répit sans dégât (mêmes règles que le joueur)
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > REGEN_DELAY) {
      this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.halo.material.opacity = 0.16 + this.hitFlash * 0.7;

    // Réplique radio "bouclier faible", une seule fois par épisode critique
    // (hystérésis : re-armée seulement après être remonté au-dessus de 60%)
    const ratio = this.hp / MAX_HP;
    if (ratio < 0.3 && !this.lowEnergyFired) {
      this.lowEnergyFired = true;
      sound?.lowEnergy(this.callsign);
    } else if (ratio > 0.6) {
      this.lowEnergyFired = false;
    }

    const playerPos = player.group.position;
    this.phase += dt;

    // Formation : x/y suivis avec inertie (effet "pilote qui corrige"),
    // z verrouillé pour rester dans le rang, léger flottement vertical
    _target.copy(playerPos).add(this.offset);
    const k = 1 - Math.exp(-2.8 * dt);
    const p = this.group.position;
    this.prevX = p.x;
    this.prevY = p.y;
    p.x += (_target.x - p.x) * k;
    p.y += (_target.y + Math.sin(this.phase * 1.3) * 0.8 - p.y) * k;
    p.z = _target.z;

    // Roulis/tangage déduits du mouvement réel, lissés
    const vx = dt > 0 ? (p.x - this.prevX) / dt : 0;
    const vy = dt > 0 ? (p.y - this.prevY) / dt : 0;
    const kr = 1 - Math.exp(-6 * dt);
    this.roll += (THREE.MathUtils.clamp(-vx * 0.028, -0.8, 0.8) - this.roll) * kr;
    this.pitch += (THREE.MathUtils.clamp(vy * 0.012, -0.35, 0.35) - this.pitch) * kr;
    this.mesh.rotation.z = this.roll;
    this.mesh.rotation.x = this.pitch;

    // Tir de soutien : premier ennemi vivant dans le cône avant
    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0) {
      let fired = false;
      for (const e of targets.enemies) {
        if (!e.userData.alive || !e.userData.hasModel) continue;
        const dz = p.z - e.position.z;
        if (dz < 60 || dz > 500) continue;
        const dx = e.position.x - p.x;
        const dy = e.position.y - p.y;
        if (Math.abs(dx) < 30 && Math.abs(dy) < 20) {
          _dir.set(dx, dy, -dz);
          _origin.copy(p).addScaledVector(_dir.clone().normalize(), 5);
          lasers.fire(_origin, _dir, 420 + player.forwardSpeed);
          this.fireCooldown = 0.9 + Math.random() * 1.3;
          fired = true;
          break;
        }
      }
      if (!fired) this.fireCooldown = 0.4; // rien en vue, re-scan bientôt
    }
  }
}
