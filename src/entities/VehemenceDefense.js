import * as THREE from 'three';
import { HERO_MODEL } from './PlayerShip.js';
import { loadShipModel } from '../core/ShipModel.js';
import { makeHaloSprite } from '../core/halo.js';

export const VEHEMENCE_MODEL = {
  url: '/space_ships/heroes/vehemence/base_basic_pbr.glb',
  emissiveUrl: '/space_ships/heroes/vehemence/texture_emissive.png',
  length: 260,
  rotationY: Math.PI,
};

const ASSAULT_DURATION = 95;
const MAX_SHIELD = 100;
const VEHEMENCE_YAW = Math.PI * 2;
const WAVE_SCHEDULE = [
  { at: 2, type: 'basic_fighter', count: 4 },
  { at: 9, type: 'basic_fighter', count: 5 },
  { at: 18, type: 'commander_artillery', count: 2 },
  { at: 30, type: 'basic_fighter', count: 5 },
  { at: 48, type: 'general_destroyer', count: 1 },
  { at: 57, type: 'commander_artillery', count: 3 },
  { at: 70, type: 'basic_fighter', count: 6 },
  { at: 82, type: 'general_destroyer', count: 1 },
  { at: 88, type: 'commander_artillery', count: 2 },
];
const ALLIED_FLYER_COUNT = 18;
const DEBRIS_COUNT = 58;

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
const _debrisSpin = new THREE.Vector3();

const rand = (a, b) => a + Math.random() * (b - a);

export class VehemenceDefense {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.active = false;
    this.complete = false;
    this.defeated = false;
    this.time = 0;
    this.shield = MAX_SHIELD;
    this.waveIndex = 0;
    this.damageTick = 0;
    this.alliedFireCooldown = 0.2;
    this.siegeFireCooldown = 0.4;
    this.targetProxy = {
      alive: true,
      group: this.group,
      velocity: new THREE.Vector2(),
    };

    this.buildPlaceholder();
    this.buildLights();
    this.buildAlliedFlyers();
    this.buildDebris();
    this.loadModel();
  }

  buildPlaceholder() {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(72, 28, 260),
      new THREE.MeshStandardMaterial({
        color: 0xaeb8c8,
        metalness: 0.62,
        roughness: 0.42,
        flatShading: true,
      })
    );
    const hangar = new THREE.Mesh(
      new THREE.BoxGeometry(86, 10, 42),
      new THREE.MeshStandardMaterial({
        color: 0x182536,
        emissive: 0x0b4c66,
        emissiveIntensity: 0.8,
        metalness: 0.5,
        roughness: 0.35,
      })
    );
    hangar.position.set(0, -8, -42);
    this.hull = new THREE.Group();
    this.hull.add(hull, hangar);
    this.group.add(this.hull);

    this.shieldHalo = makeHaloSprite({ color: 0x66ddff, size: 330, opacity: 0.12 });
    this.shieldHalo.position.z = -20;
    this.group.add(this.shieldHalo);
  }

  buildLights() {
    const bayGlow = new THREE.PointLight(0x55ddff, 160, 260, 1.3);
    bayGlow.position.set(0, -8, -42);
    const engineGlow = new THREE.PointLight(0x44bbff, 260, 420, 1.4);
    engineGlow.position.set(0, 0, 118);
    const commandGlow = new THREE.PointLight(0xfff2d0, 45, 150, 1.6);
    commandGlow.position.set(0, 20, -36);
    this.group.add(bayGlow, engineGlow, commandGlow);
  }

  loadModel() {
    loadShipModel(VEHEMENCE_MODEL)
      .then((model) => {
        this.group.remove(this.hull);
        this.hull = model;
        this.group.add(model);
      })
      .catch((err) => console.error('Chargement du Vehemence impossible - placeholder conserve', err));
  }

  buildAlliedFlyers() {
    this.alliedFlyers = [];
    const geo = new THREE.ConeGeometry(1, 5.5, 8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9fb7cc,
      metalness: 0.45,
      roughness: 0.36,
      flatShading: true,
    });

    for (let i = 0; i < ALLIED_FLYER_COUNT; i++) {
      const group = new THREE.Group();
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(geo, mat));
      const halo = makeHaloSprite({ color: 0x55ddff, size: 8, opacity: 0.2 });
      halo.position.z = 3.8;
      group.add(mesh, halo);
      group.visible = false;
      group.scale.setScalar(rand(0.48, 0.72));
      this.scene.add(group);
      this.alliedFlyers.push({
        group,
        mesh,
        halo,
        side: i % 2 === 0 ? -1 : 1,
        lane: Math.floor(i / 3),
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        delay: rand(0, 8),
        duration: rand(4.8, 7.5),
        cooldown: rand(0.15, 0.8),
      });
      this.resetFlyerRoute(this.alliedFlyers[this.alliedFlyers.length - 1]);
    }

    loadShipModel(HERO_MODEL)
      .then((model) => {
        for (const flyer of this.alliedFlyers) {
          flyer.mesh.clear();
          flyer.mesh.add(model.clone(true));
        }
      })
      .catch((err) => console.error('Figurants Aquila de bataille indisponibles - placeholders conserves', err));
  }

  resetFlyerRoute(flyer) {
    const side = flyer.side;
    flyer.start.set(side * rand(42, 92), rand(-20, 24), -75 - flyer.lane * 24);
    flyer.end.set(-side * rand(44, 105), rand(-16, 28), -300 - flyer.lane * 30);
  }

  buildDebris() {
    this.debrisGroup = new THREE.Group();
    this.debrisGroup.visible = false;
    this.scene.add(this.debrisGroup);

    const geometries = [
      new THREE.BoxGeometry(1, 0.18, 3.2),
      new THREE.BoxGeometry(1.8, 0.25, 1.1),
      new THREE.TetrahedronGeometry(0.9, 0),
    ];
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0x1b2c3a, emissiveIntensity: 0.22, metalness: 0.58, roughness: 0.36, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xaeb9c8, emissive: 0x101923, emissiveIntensity: 0.18, metalness: 0.62, roughness: 0.42, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x2d74c8, emissive: 0x103f88, emissiveIntensity: 0.32, metalness: 0.5, roughness: 0.34, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x66dfff, emissive: 0x14728c, emissiveIntensity: 0.62, metalness: 0.35, roughness: 0.25, flatShading: true }),
    ];

    this.debris = [];
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const mesh = new THREE.Mesh(
        geometries[i % geometries.length],
        materials[Math.floor(Math.random() * materials.length)]
      );
      mesh.visible = false;
      this.debrisGroup.add(mesh);
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
      });
    }
  }

  start(shipZ) {
    this.active = true;
    this.complete = false;
    this.defeated = false;
    this.time = 0;
    this.shield = MAX_SHIELD;
    this.waveIndex = 0;
    this.damageTick = 0;
    this.siegeFireCooldown = 0.4;
    this.targetProxy.alive = true;
    this.group.visible = true;
    this.debrisGroup.visible = false;
    for (const piece of this.debris) piece.mesh.visible = false;
    this.group.position.set(0, -12, shipZ - 230);
    this.group.rotation.set(0.04, VEHEMENCE_YAW, 0);
    for (const flyer of this.alliedFlyers) {
      flyer.delay = rand(0, 7);
      flyer.cooldown = rand(0.15, 0.8);
      this.resetFlyerRoute(flyer);
    }
  }

  update(dt, ship, targets, pools, sound = null, explosions = null, { enemyAggressionMultiplier = 1 } = {}) {
    this.updateDebris(dt);
    if (!this.active || this.complete || this.defeated) return 0;
    const aggression = Math.max(0.25, enemyAggressionMultiplier);
    this.time += dt;
    const shipPos = ship.group.position;

    this.group.position.x += (shipPos.x * 0.12 - this.group.position.x) * (1 - Math.exp(-1.4 * dt));
    this.group.position.y += (-12 + Math.sin(this.time * 0.18) * 2 - this.group.position.y) * (1 - Math.exp(-1.2 * dt));
    this.group.position.z = shipPos.z - 230;
    this.group.rotation.z = Math.sin(this.time * 0.16) * 0.025;
    this.shieldHalo.material.opacity = 0.08 + (this.shield / MAX_SHIELD) * 0.09 + Math.sin(this.time * 4) * 0.015;

    this.launchScheduledWaves(targets, shipPos.z);
    this.updateAlliedFlyers(dt, shipPos, pools);
    this.updateAlliedFire(dt, shipPos, pools);
    this.updateSiegeFire(dt, shipPos, pools, aggression);
    this.applySiegePressure(dt, targets, sound, aggression);

    if (this.shield <= 0) {
      this.destroy(explosions, sound);
      return 0;
    }
    if (this.time >= ASSAULT_DURATION) {
      this.complete = true;
      return 1500;
    }
    return 0;
  }

  destroy(explosions = null, sound = null) {
    if (this.defeated) return;
    this.defeated = true;
    this.active = false;
    this.targetProxy.alive = false;
    const center = this.group.position.clone();

    for (const flyer of this.alliedFlyers) flyer.group.visible = false;
    this.group.visible = false;
    this.debrisGroup.visible = true;

    const blastOffsets = [
      [0, 0, 0],
      [-28, 8, -62],
      [30, -6, -34],
      [-18, -12, 42],
      [24, 10, 72],
      [0, 18, -92],
      [-36, 4, 12],
      [38, -10, 18],
      [0, -18, 96],
    ];
    for (const offset of blastOffsets) {
      _origin.set(...offset).add(center);
      explosions?.spawn(_origin, { scale: rand(18, 32) });
    }
    sound?.explosion('big', center);

    for (const piece of this.debris) {
      _dir.randomDirection();
      const forwardBias = rand(-0.25, 0.75);
      _origin.copy(center).add(new THREE.Vector3(rand(-46, 46), rand(-18, 24), rand(-105, 115)));
      piece.mesh.position.copy(_origin);
      piece.mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      piece.mesh.scale.set(rand(1.1, 3.4), rand(0.7, 2.1), rand(1.4, 4.2));
      piece.velocity.copy(_dir).multiplyScalar(rand(18, 58));
      piece.velocity.z += forwardBias * 42;
      piece.spin.set(rand(-2.8, 2.8), rand(-2.8, 2.8), rand(-3.4, 3.4));
      piece.life = rand(3.2, 6.2);
      piece.mesh.visible = true;
    }
  }

  updateDebris(dt) {
    if (!this.debrisGroup?.visible) return;
    let anyVisible = false;
    for (const piece of this.debris) {
      if (!piece.mesh.visible) continue;
      piece.life -= dt;
      if (piece.life <= 0) {
        piece.mesh.visible = false;
        continue;
      }
      anyVisible = true;
      piece.velocity.multiplyScalar(Math.exp(-0.32 * dt));
      piece.mesh.position.addScaledVector(piece.velocity, dt);
      _debrisSpin.copy(piece.spin).multiplyScalar(dt);
      piece.mesh.rotation.x += _debrisSpin.x;
      piece.mesh.rotation.y += _debrisSpin.y;
      piece.mesh.rotation.z += _debrisSpin.z;
      piece.mesh.scale.multiplyScalar(1 + dt * 0.015);
    }
    this.debrisGroup.visible = anyVisible;
  }

  launchScheduledWaves(targets, shipZ) {
    while (this.waveIndex < WAVE_SCHEDULE.length && this.time >= WAVE_SCHEDULE[this.waveIndex].at) {
      const wave = WAVE_SCHEDULE[this.waveIndex];
      for (let i = 0; i < wave.count; i++) {
        _origin.set(rand(-90, 90), rand(-28, 32), shipZ - rand(520, 820));
        targets.launchFromMothership(wave.type, _origin, shipZ);
      }
      this.waveIndex += 1;
    }
  }

  updateAlliedFire(dt, shipPos, pools) {
    this.alliedFireCooldown -= dt;
    if (this.alliedFireCooldown > 0) return;
    this.alliedFireCooldown = rand(0.08, 0.18);

    const left = Math.random() < 0.5 ? -1 : 1;
    _origin.set(left * rand(34, 92), rand(-18, 30), shipPos.z - rand(260, 430));
    _dir.set(-left * rand(0.2, 0.7), rand(-0.12, 0.12), -1);
    pools.allied.fire(_origin, _dir, rand(360, 520), 0.85, 0);
  }

  updateAlliedFlyers(dt, shipPos, pools) {
    for (const flyer of this.alliedFlyers) {
      const cycle = flyer.delay + flyer.duration;
      const t = (this.time + flyer.delay) % cycle;
      const local = t / flyer.duration;
      const active = local >= 0 && local <= 1;
      flyer.group.visible = active;
      if (!active) continue;

      const wave = Math.sin((local + flyer.lane) * Math.PI);
      _start.copy(flyer.start);
      _start.z += shipPos.z;
      _end.copy(flyer.end);
      _end.z += shipPos.z;
      flyer.group.position.lerpVectors(_start, _end, local);
      flyer.group.position.y += wave * 12;
      flyer.group.rotation.z = -flyer.side * 0.35 + Math.sin(this.time * 3 + flyer.lane) * 0.08;
      flyer.group.rotation.x = 0.08 + wave * 0.12;
      flyer.halo.material.opacity = 0.16 + wave * 0.16;

      flyer.cooldown -= dt;
      if (flyer.cooldown <= 0) {
        flyer.cooldown = rand(0.18, 0.55);
        _origin.copy(flyer.group.position);
        _dir.set(-flyer.side * rand(0.1, 0.45), rand(-0.18, 0.12), -1);
        pools.allied.fire(_origin, _dir, rand(430, 620), 0.9, 0);
      }
    }
  }

  updateSiegeFire(dt, shipPos, pools, aggression = 1) {
    this.siegeFireCooldown -= dt * aggression;
    if (this.siegeFireCooldown > 0 || !pools.enemyLight) return;
    this.siegeFireCooldown = rand(0.18, 0.42);

    const side = Math.random() < 0.5 ? -1 : 1;
    _origin.set(side * rand(80, 150), rand(-34, 42), shipPos.z - rand(360, 620));
    _dir.subVectors(this.group.position, _origin);
    pools.enemyLight.fire(_origin, _dir, rand(250, 360), 1.25, 0);
  }

  applySiegePressure(dt, targets, sound = null, aggression = 1) {
    this.damageTick += dt;
    if (this.damageTick < 1) return;
    this.damageTick = 0;

    let pressure = 0.38;
    for (const enemy of targets.enemies) {
      const u = enemy.userData;
      if (!enemy.visible || !u.alive) continue;
      if (u.typeId === 'basic_fighter') pressure += 0.48;
      if (u.typeId === 'commander_artillery') pressure += 1.55;
      if (u.typeId === 'general_destroyer') pressure += 2.8;
    }
    this.shield = Math.max(0, this.shield - pressure * aggression);
    if (pressure > 2.2) sound?.shieldHit();
  }

  getProgress() {
    return this.defeated ? 1 : 1 - this.shield / MAX_SHIELD;
  }

  getStatusLabel() {
    if (this.defeated) return 'VEHEMENCE PERDU';
    if (this.complete) return 'VEHEMENCE DEFENDU';
    return `BOUCLIER VEHEMENCE ${Math.ceil(this.shield)}%`;
  }
}
