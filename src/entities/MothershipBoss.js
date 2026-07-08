import * as THREE from 'three';
import { loadShipModel } from '../core/ShipModel.js';
import { makeHaloSprite } from '../core/halo.js';

export const MOTHERSHIP_MODEL = {
  url: '/space_ships/ennemies/mothership/base_basic_pbr.glb',
  emissiveUrl: '/space_ships/ennemies/mothership/texture_emissive.png',
  length: 190,
  rotationY: Math.PI / 2,
};

const WEAK_POINTS = [
  { id: 'port-hangar', label: 'PONT BABORD', pos: [-23, -8, 24], normal: [-1, -0.1, 0.2], hp: 5, radius: 8 },
  { id: 'starboard-hangar', label: 'PONT TRIBORD', pos: [23, -8, 18], normal: [1, -0.1, 0.2], hp: 5, radius: 8 },
  { id: 'port-shield', label: 'BOUCLIER BABORD', pos: [-20, 5, -18], normal: [-1, 0.15, -0.1], hp: 4, radius: 7 },
  { id: 'starboard-shield', label: 'BOUCLIER TRIBORD', pos: [20, 5, -24], normal: [1, 0.15, -0.1], hp: 4, radius: 7 },
  { id: 'reactor', label: 'COEUR REACTEUR', pos: [0, 2, -58], normal: [0, 0.05, -1], hp: 8, radius: 11, locked: true },
];
// Le séparateur est optionnel : GLTFLoader assigne le nom du *node* (via
// PropertyBinding.sanitizeNodeName), qui peut différer du nom du *mesh data*
// Blender — ici le node exporté est "vulnerable_target000" (sans point),
// alors que le mesh data interne garde "vulnerable_target.000". Vérifié en
// inspectant le GLB chargé en jeu (model.traverse) : sans le "?" après
// [._-], la regex ne matchait jamais et le boss retombait silencieusement
// sur les 5 points de secours codés en dur.
const VULNERABLE_TARGET_RE = /^vulnerable_target(?:[._-]?\d+)?$/i;
const MIN_PRESENTATION_TURN = Math.PI;
const PRESENTATION_TURN_DURATION = 38;
const WEAK_POINT_FACING_THRESHOLD = -0.45;
const LAUNCH_BAYS = [
  new THREE.Vector3(-32, -12, 34),
  new THREE.Vector3(32, -12, 28),
  new THREE.Vector3(0, -10, 54),
];

const _world = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _toShip = new THREE.Vector3();

export class MothershipBoss {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.position.set(0, 14, -700);
    this.group.rotation.set(0.04, 0, 0);
    this.scene.add(this.group);

    this.active = false;
    this.defeated = false;
    this.arrival = 0;
    this.time = 0;
    this.fireCooldown = 1.5;
    this.fighterLaunchCooldown = 3.2;
    this.hitFlash = 0;
    this.scoreAwarded = 0;
    this.presentationYaw = 0;

    this.buildPlaceholder();
    this.buildWeakPoints();
    this.buildBossLights();
    this.loadModel();
  }

  buildPlaceholder() {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(72, 18, 190),
      new THREE.MeshStandardMaterial({ color: 0x222733, metalness: 0.65, roughness: 0.48 })
    );
    hull.position.z = -12;
    this.hull = hull;
    this.group.add(hull);
  }

  buildWeakPoints() {
    this.weakPoints = WEAK_POINTS.map((def) => this.createWeakPoint(def));
  }

  createWeakPoint(def) {
    const node = new THREE.Group();
    node.position.set(...def.pos);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(def.radius * 0.34, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff2211,
        transparent: true,
        opacity: def.locked ? 0.2 : 0.95,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(def.radius * 0.72, def.radius, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff4433,
        transparent: true,
        opacity: def.locked ? 0.15 : 0.9,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = Math.PI / 2;
    const halo = makeHaloSprite({
      color: 0xff2211,
      size: def.radius * 7,
      opacity: def.locked ? 0.08 : 0.32,
    });
    halo.material.depthTest = true;
    halo.renderOrder = 20;
    core.renderOrder = 21;
    ring.renderOrder = 21;

    node.add(halo, ring, core);
    this.group.add(node);
    return {
      ...def,
      hp: def.hp,
      maxHp: def.hp,
      destroyed: false,
      node,
      core,
      ring,
      halo,
    };
  }

  buildBossLights() {
    const coldRim = new THREE.PointLight(0x8aaaff, 260, 360, 1.2);
    coldRim.position.set(0, 70, 90);
    const redCore = new THREE.PointLight(0xff2211, 90, 240, 1.5);
    redCore.position.set(0, -12, -36);
    this.group.add(coldRim, redCore);
  }

  loadModel() {
    loadShipModel(MOTHERSHIP_MODEL)
      .then((model) => {
        this.group.remove(this.hull);
        this.hull = model;
        this.group.add(model);
        this.applyModelWeakTargets(model);
      })
      .catch((err) => console.error('Chargement du vaisseau-mere impossible - placeholder conserve', err));
  }

  applyModelWeakTargets(model) {
    this.group.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const targets = [];
    model.traverse((obj) => {
      if (!VULNERABLE_TARGET_RE.test(obj.name)) return;
      obj.visible = false;
      obj.getWorldPosition(_world);
      targets.push({
        name: obj.name,
        position: this.group.worldToLocal(_world.clone()),
      });
    });

    if (!targets.length) return;
    targets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const wp of this.weakPoints) this.group.remove(wp.node);
    this.weakPoints = [];

    // Pas de réutilisation des id/label de l'ancien WEAK_POINTS à 5 points ici :
    // ses index ne correspondent à rien une fois qu'on a les 8 vraies cibles du
    // modèle (l'index 4 récupérait par coïncidence le libellé "COEUR REACTEUR"
    // de l'ancien schéma alors qu'il ne s'agit plus du réacteur réel).
    for (let i = 0; i < targets.length; i++) {
      const isReactor = i === targets.length - 1 && targets.length > 1;
      this.weakPoints.push(
        this.createWeakPoint({
          id: isReactor ? 'reactor' : `vulnerable-target-${String(i + 1).padStart(3, '0')}`,
          label: isReactor ? 'COEUR REACTEUR' : `MODULE ${String(i + 1).padStart(2, '0')}`,
          pos: targets[i].position.toArray(),
          normal: [0, 0, -1],
          hp: isReactor ? 8 : 4,
          radius: isReactor ? 11 : 7,
          locked: isReactor,
        })
      );
    }

    console.info(`${targets.length} cible(s) vulnerable_target chargee(s) depuis le vaisseau-mere`);
  }

  spawn(playerZ) {
    if (this.active || this.defeated) return;
    this.active = true;
    this.group.visible = true;
    this.arrival = 0;
    this.time = 0;
    this.presentationYaw = -MIN_PRESENTATION_TURN * 0.5;
    this.group.position.set(0, 18, playerZ - 620);
  }

  update(dt, ship, pools, canFire, sound = null, { enemyAggressionMultiplier = 1 } = {}) {
    if (!this.active || this.defeated) return 0;
    const aggression = Math.max(0.25, enemyAggressionMultiplier);

    this.time += dt;
    this.updateLaunchCooldown(dt, aggression);
    this.arrival = Math.min(1, this.arrival + dt * 0.18);
    const orbit = Math.sin(this.time * 0.22);
    const turnProgress = Math.min(1, this.time / PRESENTATION_TURN_DURATION);
    const easedTurn = turnProgress * turnProgress * (3 - 2 * turnProgress);
    const targetZ = ship.group.position.z - (310 + (1 - this.arrival) * 220);
    this.group.position.set(orbit * 18, 12 + Math.sin(this.time * 0.31) * 4, targetZ);
    // Presentation du capital ship : au lieu d'une simple oscillation, il
    // montre au moins une demi-rotation pour exposer ses deux flancs.
    this.presentationYaw = -MIN_PRESENTATION_TURN * 0.5 + easedTurn * MIN_PRESENTATION_TURN;
    this.group.rotation.y = this.presentationYaw + orbit * 0.12 + Math.sin(this.time * 0.11) * 0.18;
    this.group.rotation.z = Math.sin(this.time * 0.18) * 0.035;
    this.group.updateMatrixWorld(true);

    for (const wp of this.weakPoints) {
      const unlocked = this.isWeakPointUnlocked(wp);
      const facing = this.isWeakPointFacingShip(wp, ship);
      const presentation = facing ? 1 : 0.62;
      const pulse = 0.58 + 0.42 * Math.sin(this.time * 8 + wp.pos[0] * 0.1);
      wp.node.visible = !wp.destroyed && unlocked;
      wp.core.material.opacity = unlocked ? (0.65 + pulse * 0.35) * presentation : 0.12;
      wp.ring.material.opacity = unlocked ? (0.5 + pulse * 0.38) * presentation : 0.08;
      wp.halo.material.opacity = unlocked ? (0.22 + pulse * 0.24) * presentation : 0.04;
      if (wp.node.visible) wp.node.lookAt(ship.group.position);
    }

    this.fireCooldown -= dt * aggression;
    if (canFire && this.fireCooldown <= 0) {
      this.fireAtPlayer(ship, pools.heavy, sound);
      this.fireCooldown = 1.25 + Math.random() * 0.9;
    }

    return this.scoreAwarded;
  }

  consumeFighterLaunch() {
    if (!this.active || this.defeated) return null;
    if (this.fighterLaunchCooldown > 0) return null;
    this.fighterLaunchCooldown = 6.5 + Math.random() * 2.5;
    const bay = LAUNCH_BAYS[Math.floor(Math.random() * LAUNCH_BAYS.length)];
    _world.copy(bay);
    this.group.localToWorld(_world);
    return _world.clone();
  }

  updateLaunchCooldown(dt, aggression = 1) {
    if (!this.active || this.defeated) return;
    this.fighterLaunchCooldown -= dt * aggression;
  }

  fireAtPlayer(ship, pool, sound) {
    const liveTurrets = this.weakPoints.filter((wp) => !wp.destroyed && this.isWeakPointUnlocked(wp) && wp.node.visible);
    if (!liveTurrets.length) return;
    const wp = liveTurrets[Math.floor(Math.random() * liveTurrets.length)];
    wp.node.getWorldPosition(_origin);
    _dir.subVectors(ship.group.position, _origin);
    pool.fire(_origin, _dir, 155, 4.5, 24);
    sound?.enemyLaser('general_destroyer', _origin);
  }

  isWeakPointUnlocked(wp) {
    if (!wp.locked) return true;
    return this.weakPoints.every((other) => other === wp || other.destroyed);
  }

  isWeakPointFacingShip(wp, ship) {
    wp.node.getWorldPosition(_world);
    _toShip.subVectors(ship.group.position, _world).normalize();
    _normal.set(...wp.normal).normalize().transformDirection(this.group.matrixWorld);
    return _normal.dot(_toShip) > WEAK_POINT_FACING_THRESHOLD;
  }

  handleLaser(laser, explosions, sound = null) {
    if (!this.active || this.defeated) return { hit: false, score: 0 };

    for (const wp of this.weakPoints) {
      if (wp.destroyed || !this.isWeakPointUnlocked(wp)) continue;
      wp.node.getWorldPosition(_world);
      if (laser.position.distanceToSquared(_world) > wp.radius * wp.radius) continue;
      wp.hp -= Math.max(1, laser.userData.damage || 1);
      this.hitFlash = 0.35;
      sound?.armorHit(_world);
      if (wp.hp <= 0) {
        wp.destroyed = true;
        wp.node.visible = false;
        explosions.spawn(_world);
        sound?.explosion(wp.id === 'reactor' ? 'big' : 'medium', _world);
        if (wp.id === 'reactor') {
          this.destroy(explosions, sound);
          return { hit: true, score: 2000 };
        }
        return { hit: true, score: 250 };
      }
      return { hit: true, score: 0 };
    }

    return { hit: false, score: 0 };
  }

  destroy(explosions, sound = null) {
    this.defeated = true;
    this.active = false;
    const bursts = [
      [0, 0, -58],
      [-26, 7, -22],
      [30, -3, 18],
      [-18, -8, 32],
      [18, 10, -8],
    ];
    for (const p of bursts) {
      _world.set(...p);
      this.group.localToWorld(_world);
      explosions.spawn(_world);
    }
    sound?.explosion('big', this.group.position);
    this.group.visible = false;
  }

  getProgress() {
    const total = this.weakPoints.reduce((sum, wp) => sum + wp.maxHp, 0);
    const current = this.weakPoints.reduce((sum, wp) => sum + Math.max(0, wp.hp), 0);
    return total > 0 ? 1 - current / total : 0;
  }

  getStatusLabel() {
    if (!this.active && !this.defeated) return '';
    if (this.defeated) return 'VAISSEAU-MERE DETRUIT';
    const reactor = this.weakPoints.find((wp) => wp.id === 'reactor');
    if (reactor && this.isWeakPointUnlocked(reactor)) return 'COEUR REACTEUR EXPOSE';
    return 'DETRUIRE LES MODULES ROUGES';
  }
}
