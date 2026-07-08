import * as THREE from 'three';
import { makeHaloSprite } from '../core/halo.js';
import { assetUrl } from '../core/assetUrl.js';

const textureLoader = new THREE.TextureLoader();

const rand = (a, b) => a + Math.random() * (b - a);
const ASTEROID_COUNT = 24;
const ASTEROID_INITIAL_SPACING = 78;
const ASTEROID_RESPAWN_MIN = 650;
const ASTEROID_RESPAWN_MAX = 1450;
const ASTEROID_MIN_SPLIT_RADIUS = 5.4;
const ASTEROID_SPLIT_SCALE = 0.58;
const ASTEROID_MAX_MESHES = 54;
const ASTEROID_SPLIT_SCORE = 15;
const RING_DUST_COUNT = 1200;
const RING_DUST_DEPTH = 2300;
const FINAL_BASE_START_TIME = 24;
const GIANT_ASTEROID_ROTATION = {
  x: 0.12,
  y: 0.087,
  z: 0.053,
};

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _world = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dustPos = new THREE.Vector3();

function rockNoise(x, y, z, seed) {
  return (
    Math.sin(x * 2.1 + seed) * 0.16 +
    Math.sin(y * 2.7 + seed * 1.7) * 0.13 +
    Math.sin(z * 3.3 + seed * 2.3) * 0.11 +
    Math.sin((x + y - z) * 4.1 + seed * 0.7) * 0.08
  );
}

function makeRockGeometry(radius, detail = 2, seed = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    _dir.set(x, y, z).normalize();
    const n = rockNoise(_dir.x, _dir.y, _dir.z, seed);
    const s = 1 + n;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

export class AsteroidField {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.active = false;
    this.time = 0;
    this.finalStarted = false;
    this.defeated = false;
    this.complete = false;
    this.escapeTimer = 0;
    this.launchCooldown = 4;

    const asteroidAlbedo = textureLoader.load(assetUrl('/textures/asteroids/red_corona_asteroid_albedo.png'));
    asteroidAlbedo.colorSpace = THREE.SRGBColorSpace;
    asteroidAlbedo.wrapS = THREE.RepeatWrapping;
    asteroidAlbedo.wrapT = THREE.RepeatWrapping;
    asteroidAlbedo.repeat.set(2.2, 2.2);

    const asteroidEmission = textureLoader.load(assetUrl('/textures/asteroids/red_corona_asteroid_emission.png'));
    asteroidEmission.colorSpace = THREE.SRGBColorSpace;
    asteroidEmission.wrapS = THREE.RepeatWrapping;
    asteroidEmission.wrapT = THREE.RepeatWrapping;
    asteroidEmission.repeat.copy(asteroidAlbedo.repeat);

    const asteroidNormal = textureLoader.load(assetUrl('/textures/asteroids/red_corona_asteroid_normal.png'));
    asteroidNormal.wrapS = THREE.RepeatWrapping;
    asteroidNormal.wrapT = THREE.RepeatWrapping;
    asteroidNormal.repeat.copy(asteroidAlbedo.repeat);

    this.rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asteroidAlbedo,
      emissive: 0xff3a13,
      emissiveMap: asteroidEmission,
      emissiveIntensity: 1.75,
      normalMap: asteroidNormal,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughness: 0.86,
      metalness: 0.08,
      flatShading: true,
    });
    this.darkMetal = new THREE.MeshStandardMaterial({
      color: 0x151922,
      roughness: 0.48,
      metalness: 0.7,
    });
    this.redMat = new THREE.MeshBasicMaterial({
      color: 0xff2211,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });

    this.asteroids = [];
    this.turrets = [];
    this.weakPoints = [];
    this.buildRingDust();
    this.buildField();
    this.buildBossBase();
  }

  buildRingDust() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(RING_DUST_COUNT * 3);
    const colors = new Float32Array(RING_DUST_COUNT * 3);
    const colorHot = new THREE.Color(0xff6a2a);
    const colorDim = new THREE.Color(0x6f1b12);

    for (let i = 0; i < RING_DUST_COUNT; i++) {
      const z = -120 - Math.random() * RING_DUST_DEPTH;
      const x = rand(-150, 150);
      const lane = Math.sin(z * 0.006) * 18;
      const y = x * 0.18 + lane + rand(-24, 24);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = colorDim.clone().lerp(colorHot, Math.random() ** 2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.ringDust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 2.8,
        transparent: true,
        opacity: 0.46,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.ringDust.renderOrder = -4;
    this.group.add(this.ringDust);
  }

  buildField() {
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const radius = rand(3.5, 13);
      const rock = this.createAsteroid(radius, i + 2, i % 3);
      rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      this.resetAsteroid(rock, -150 - i * ASTEROID_INITIAL_SPACING);
      this.group.add(rock);
      this.asteroids.push(rock);

      if (i % 5 === 1) this.addTurretToAsteroid(rock);
    }
  }

  createAsteroid(radius, seed = Math.random() * 999, detail = 1) {
    const rock = new THREE.Mesh(makeRockGeometry(radius, detail, seed), this.rockMat);
    rock.userData = {
      radius,
      seed,
      detail,
      active: true,
      splitDrift: new THREE.Vector3(),
      spin: new THREE.Vector3(rand(-0.25, 0.25), rand(-0.18, 0.18), rand(-0.22, 0.22)),
    };
    return rock;
  }

  addTurretToAsteroid(rock) {
    const turret = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(1.6, 2.2, 1.2, 10);
    const base = new THREE.Mesh(baseGeo, this.darkMetal);
    base.rotation.x = Math.PI / 2;
    const barrelGeo = new THREE.CylinderGeometry(0.24, 0.34, 5.2, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, this.darkMetal);
    barrel.position.z = -2.8;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.86, 14, 10), this.redMat.clone());
    core.position.z = -0.9;
    const halo = makeHaloSprite({ color: 0xff2211, size: 8, opacity: 0.42 });
    halo.position.z = -1.2;
    turret.add(base, barrel, core, halo);

    const normal = new THREE.Vector3(rand(-1, 1), rand(-0.45, 0.65), rand(-0.5, 0.2)).normalize();
    turret.position.copy(normal).multiplyScalar(rock.userData.radius * 0.92);
    turret.lookAt(turret.position.clone().add(normal));
    turret.userData = {
      asteroid: rock,
      hp: 2,
      alive: true,
      cooldown: rand(1, 4),
      radius: 3.2,
      core,
      halo,
      score: 180,
    };
    rock.add(turret);
    this.turrets.push(turret);
  }

  buildBossBase() {
    this.boss = new THREE.Group();
    this.boss.visible = false;
    const rock = new THREE.Mesh(makeRockGeometry(70, 3, 77), this.rockMat);
    rock.scale.set(1.35, 0.82, 1.05);
    this.boss.add(rock);

    const hangarGeo = new THREE.BoxGeometry(22, 9, 12);
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.42, metalness: 0.75 });
    const hangars = [
      [-38, -8, 42],
      [35, 4, 48],
      [0, -18, 54],
    ];
    this.hangarLaunchPoints = hangars.map((p) => new THREE.Vector3(...p));
    for (const p of hangars) {
      const hangar = new THREE.Mesh(hangarGeo, hangarMat);
      hangar.position.set(...p);
      hangar.lookAt(0, 0, -260);
      this.boss.add(hangar);
    }

    const points = [
      [-46, 18, 54],
      [42, -12, 58],
      [7, 30, 62],
      [-10, -31, 60],
      [0, 4, 72],
    ];
    for (let i = 0; i < points.length; i++) {
      const wp = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(i === points.length - 1 ? 5 : 3.6, 18, 12), this.redMat.clone());
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(i === points.length - 1 ? 6.5 : 4.7, i === points.length - 1 ? 7.3 : 5.5, 24),
        this.redMat.clone()
      );
      ring.material.opacity = 0.55;
      const halo = makeHaloSprite({ color: 0xff2211, size: i === points.length - 1 ? 38 : 24, opacity: 0.3 });
      core.renderOrder = 30;
      ring.renderOrder = 30;
      halo.renderOrder = 29;
      core.material.depthTest = false;
      ring.material.depthTest = false;
      halo.material.depthTest = false;
      wp.position.set(...points[i]);
      wp.add(halo, ring, core);
      wp.lookAt(0, 0, 280);
      wp.userData = {
        hp: i === points.length - 1 ? 10 : 5,
        maxHp: i === points.length - 1 ? 10 : 5,
        alive: true,
        locked: i === points.length - 1,
        radius: i === points.length - 1 ? 9 : 7,
        score: i === points.length - 1 ? 2200 : 320,
        core,
        halo,
      };
      this.boss.add(wp);
      this.weakPoints.push(wp);
    }

    this.group.add(this.boss);
  }

  resetAsteroid(rock, z) {
    rock.userData.active = true;
    rock.userData.splitDrift?.set(0, 0, 0);
    const central = Math.random() < 0.22;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = central ? rand(-18, 18) : side * rand(34, 78);
    const y = central ? rand(-11, 11) : rand(-34, 34);
    rock.position.set(x, y, z);
    rock.visible = true;
  }

  start(shipZ) {
    this.active = true;
    this.group.visible = true;
    this.time = 0;
    this.finalStarted = false;
    this.defeated = false;
    this.complete = false;
    this.escapeTimer = 0;
    for (let i = 0; i < this.asteroids.length; i++) {
      this.resetAsteroid(this.asteroids[i], shipZ - 150 - i * ASTEROID_INITIAL_SPACING);
    }
    for (const t of this.turrets) {
      t.userData.alive = true;
      t.userData.hp = 2;
      t.visible = true;
    }
    this.boss.visible = false;
    for (const wp of this.weakPoints) {
      wp.userData.alive = true;
      wp.visible = !wp.userData.locked;
      wp.userData.hp = wp.userData.maxHp;
    }
  }

  update(dt, ship, pools, canFire, sound = null, targets = null) {
    if (!this.active || this.complete) return 0;
    this.time += dt;
    const shipPos = ship.group.position;
    let score = 0;
    this.updateRingDust(shipPos);

    for (const rock of this.asteroids) {
      if (!rock.userData.active) {
        if (!this.finalStarted) this.resetAsteroid(rock, shipPos.z - rand(ASTEROID_RESPAWN_MIN, ASTEROID_RESPAWN_MAX));
        continue;
      }
      const spin = rock.userData.spin;
      rock.position.addScaledVector(rock.userData.splitDrift, dt);
      rock.userData.splitDrift.multiplyScalar(Math.exp(-0.9 * dt));
      rock.rotation.x += spin.x * dt;
      rock.rotation.y += spin.y * dt;
      rock.rotation.z += spin.z * dt;
      if (!this.finalStarted && rock.position.z > shipPos.z + 65) {
        this.resetAsteroid(rock, shipPos.z - rand(ASTEROID_RESPAWN_MIN, ASTEROID_RESPAWN_MAX));
      }
    }

    score += this.updateTurrets(dt, ship, pools, canFire, sound);

    if (!this.finalStarted && this.time > FINAL_BASE_START_TIME) this.startFinalBase(shipPos.z);
    if (this.finalStarted) score += this.updateFinalBase(dt, ship, pools, canFire, sound, targets);

    if (this.defeated) {
      this.escapeTimer += dt;
      if (this.escapeTimer > 3.2) this.complete = true;
    }

    return score;
  }

  updateRingDust(shipPos) {
    if (!this.ringDust) return;
    this.ringDust.position.set(shipPos.x * 0.22, shipPos.y * 0.18, shipPos.z);
    this.ringDust.rotation.z = -0.22 + Math.sin(this.time * 0.08) * 0.04;
    this.ringDust.rotation.x = 0.12;

    const positions = this.ringDust.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      _dustPos.fromBufferAttribute(positions, i);
      if (_dustPos.z + this.ringDust.position.z > shipPos.z + 120) {
        _dustPos.z -= RING_DUST_DEPTH;
        _dustPos.x = rand(-150, 150);
        _dustPos.y = _dustPos.x * 0.18 + Math.sin(_dustPos.z * 0.006) * 18 + rand(-24, 24);
        positions.setXYZ(i, _dustPos.x, _dustPos.y, _dustPos.z);
      }
    }
    positions.needsUpdate = true;
  }

  updateTurrets(dt, ship, pools, canFire, sound) {
    let score = 0;
    const shipPos = ship.group.position;
    for (const turret of this.turrets) {
      const u = turret.userData;
      if (!u.alive) continue;
      turret.getWorldPosition(_world);
      u.halo.material.opacity = 0.32 + 0.16 * Math.sin(this.time * 5);
      if (_world.z > shipPos.z + 45) continue;
      if (shipPos.z - _world.z > 620) continue;
      turret.lookAt(shipPos);
      u.cooldown -= dt;
      if (canFire && u.cooldown <= 0) {
        _dir.subVectors(shipPos, _world);
        _origin.copy(_world).addScaledVector(_dir.clone().normalize(), 4.5);
        pools.light.fire(_origin, _dir, 205, 3.8, 12);
        sound?.enemyLaser('basic_fighter', _origin);
        u.cooldown = rand(1.6, 3.2);
      }
    }
    return score;
  }

  startFinalBase(shipZ) {
    this.finalStarted = true;
    this.boss.visible = true;
    this.boss.position.set(0, 8, shipZ - 720);
    this.launchCooldown = 2.5;
  }

  updateFinalBase(dt, ship, pools, canFire, sound, targets) {
    if (!this.boss.visible) return 0;
    this.boss.position.z += (ship.group.position.z - 360 - this.boss.position.z) * (1 - Math.exp(-0.7 * dt));
    this.boss.rotation.x = Math.sin(this.time * GIANT_ASTEROID_ROTATION.x) * Math.PI;
    this.boss.rotation.y = Math.sin(this.time * GIANT_ASTEROID_ROTATION.y + 1.4) * Math.PI;
    this.boss.rotation.z = Math.sin(this.time * GIANT_ASTEROID_ROTATION.z + 2.3) * Math.PI;

    const reactorUnlocked = this.weakPoints
      .filter((wp) => !wp.userData.locked)
      .every((wp) => !wp.userData.alive);
    for (const wp of this.weakPoints) {
      if (wp.userData.locked) wp.visible = reactorUnlocked && wp.userData.alive;
      if (!wp.userData.alive || !wp.visible) continue;
      wp.lookAt(ship.group.position);
      wp.userData.halo.material.opacity = 0.25 + 0.18 * Math.sin(this.time * 6);
      wp.scale.setScalar(1 + 0.12 * Math.sin(this.time * 8 + wp.position.x));
    }

    this.launchCooldown -= dt;
    if (targets && canFire && !this.defeated && this.launchCooldown <= 0) {
      const launches = Math.random() > 0.52 ? 2 : 1;
      for (let i = 0; i < launches; i++) {
        const localBay = this.hangarLaunchPoints[Math.floor(Math.random() * this.hangarLaunchPoints.length)].clone();
        localBay.x += rand(-3.5, 3.5);
        localBay.y += rand(-2, 2);
        this.boss.localToWorld(localBay);
        targets.launchFromMothership('basic_fighter', localBay, ship.group.position.z);
      }
      this.launchCooldown = rand(3.2, 4.8);
    }

    if (canFire && !this.defeated && Math.random() < dt * 0.75) {
      const live = this.weakPoints.filter((wp) => wp.userData.alive && wp.visible);
      const wp = live[Math.floor(Math.random() * live.length)];
      if (wp) {
        wp.getWorldPosition(_world);
        _aim.copy(ship.group.position).add(new THREE.Vector3(rand(-4, 4), rand(-3, 3), 0));
        _dir.subVectors(_aim, _world);
        pools.heavy.fire(_world, _dir, 155, 4.2, 22);
        sound?.enemyLaser('general_destroyer', _world);
      }
    }

    return 0;
  }

  handleLaser(laser, explosions, sound = null) {
    for (const turret of this.turrets) {
      const u = turret.userData;
      if (!u.alive) continue;
      turret.getWorldPosition(_world);
      if (laser.position.distanceToSquared(_world) > u.radius * u.radius) continue;
      u.hp -= Math.max(1, laser.userData.damage || 1);
      sound?.armorHit(_world);
      if (u.hp <= 0) {
        u.alive = false;
        turret.visible = false;
        explosions.spawn(_world);
        sound?.explosion('small', _world);
        return { hit: true, score: u.score };
      }
      return { hit: true, score: 0 };
    }

    if (this.finalStarted && !this.defeated) {
      for (const wp of this.weakPoints) {
        const u = wp.userData;
        if (!u.alive || !wp.visible) continue;
        wp.getWorldPosition(_world);
        if (laser.position.distanceToSquared(_world) > u.radius * u.radius) continue;
        u.hp -= Math.max(1, laser.userData.damage || 1);
        sound?.armorHit(_world);
        if (u.hp <= 0) {
          u.alive = false;
          wp.visible = false;
          explosions.spawn(_world);
          sound?.explosion(u.locked ? 'big' : 'medium', _world);
          if (u.locked) this.destroyBase(explosions, sound);
          return { hit: true, score: u.score };
        }
        return { hit: true, score: 0 };
      }
    }

    if (!this.finalStarted) {
      for (const rock of this.asteroids) {
        if (!rock.visible || !rock.userData.active) continue;
        const radius = rock.userData.radius;
        if (laser.position.distanceToSquared(rock.position) > radius * radius) continue;
        this.splitAsteroid(rock, laser, explosions, sound);
        return { hit: true, score: ASTEROID_SPLIT_SCORE };
      }
    }

    return { hit: false, score: 0 };
  }

  splitAsteroid(rock, laser, explosions, sound = null) {
    const radius = rock.userData.radius;
    explosions.spawn(rock.position);
    sound?.armorHit(rock.position);

    for (const turret of this.turrets) {
      if (turret.userData.asteroid !== rock) continue;
      turret.userData.alive = false;
      turret.visible = false;
    }

    if (radius <= ASTEROID_MIN_SPLIT_RADIUS) {
      rock.visible = false;
      rock.userData.active = false;
      sound?.explosion('small', rock.position);
      return;
    }

    const nextRadius = radius * ASTEROID_SPLIT_SCALE;
    const hitDir = _dir.subVectors(rock.position, laser.position).normalize();
    if (hitDir.lengthSq() < 0.01) hitDir.set(rand(-1, 1), rand(-1, 1), rand(-0.2, 0.2)).normalize();
    const side = new THREE.Vector3(-hitDir.y, hitDir.x, rand(-0.25, 0.25)).normalize();
    const separation = nextRadius * 0.85;

    rock.geometry.dispose();
    rock.geometry = makeRockGeometry(nextRadius, rock.userData.detail, rock.userData.seed + this.time + 11);
    rock.userData.radius = nextRadius;
    rock.userData.spin.multiplyScalar(1.35);
    rock.userData.splitDrift.copy(side).multiplyScalar(10);
    rock.position.addScaledVector(side, separation);

    if (this.asteroids.length >= ASTEROID_MAX_MESHES) return;

    const fragment = this.createAsteroid(nextRadius, rock.userData.seed + this.asteroids.length + 31, rock.userData.detail);
    fragment.position.copy(rock.position).addScaledVector(side, -separation * 2);
    fragment.rotation.copy(rock.rotation);
    fragment.userData.splitDrift.copy(side).multiplyScalar(-10);
    fragment.userData.spin.multiplyScalar(1.45);
    this.group.add(fragment);
    this.asteroids.push(fragment);
  }

  destroyBase(explosions, sound = null) {
    this.defeated = true;
    for (const p of [
      [0, 0, -55],
      [-38, 16, -8],
      [42, -12, 20],
      [-4, -26, 34],
      [24, 30, -24],
    ]) {
      _world.set(...p);
      this.boss.localToWorld(_world);
      explosions.spawn(_world);
    }
    sound?.explosion('big', this.boss.position);
  }

  applyCollision(shipPos, damage) {
    if (!this.active || this.complete) return;
    for (const rock of this.asteroids) {
      if (!rock.visible || !rock.userData.active) continue;
      const r = rock.userData.radius;
      if (shipPos.distanceToSquared(rock.position) < (r + 2.2) * (r + 2.2)) {
        damage(Math.min(42, 12 + r * 1.4));
        rock.position.z = shipPos.z + 90;
      }
    }
    if (this.finalStarted && !this.defeated && shipPos.distanceToSquared(this.boss.position) < 85 * 85) {
      damage(55);
    }
  }

  getProgress() {
    if (!this.finalStarted) return 0;
    const total = this.weakPoints.reduce((sum, wp) => sum + wp.userData.maxHp, 0);
    const current = this.weakPoints.reduce((sum, wp) => sum + Math.max(0, wp.userData.hp), 0);
    return total > 0 ? 1 - current / total : 0;
  }

  getStatusLabel() {
    if (!this.finalStarted) return 'TRAVERSER LE CHAMP DE DEBRIS';
    if (this.defeated) return 'BASE-ASTEROIDE DETRUITE';
    const reactor = this.weakPoints.find((wp) => wp.userData.locked);
    if (reactor?.visible) return 'NOYAU ROUGE EXPOSE';
    return 'DETRUIRE LES TOURELLES ET RELAIS ROUGES';
  }
}
