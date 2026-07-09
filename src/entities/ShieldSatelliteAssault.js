import * as THREE from 'three';
import { loadShipModel } from '../core/ShipModel.js';
import { assetUrl } from '../core/assetUrl.js';
import { makeHaloSprite } from '../core/halo.js';

export const SHIELD_SATELLITE_MODEL = {
  url: '/space_ships/ennemies/shield_satellites/base_basic_pbr.glb',
  emissiveUrl: '/space_ships/ennemies/shield_satellites/texture_emissive.png',
  length: 42,
  rotationY: 0,
};

const SATELLITE_COUNT = 6;
const SHIELD_RADIUS = 270;
const PLANET_RADIUS = 190;
const SATELLITE_HP = 6;
const SATELLITE_HIT_RADIUS = 34;
const FIGHTER_WAVE_INTERVAL = 5.2;
const PLANET_TEXTURES = {
  albedo: '/textures/planets/red_planete/planet_albedo.png',
  normal: '/textures/planets/red_planete/planet_normal.png',
  roughness: '/textures/planets/red_planete/planet_roughness.png',
  emission: '/textures/planets/red_planete/planet_emission.png',
};
const textureLoader = new THREE.TextureLoader();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _impactDir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _basis = new THREE.Matrix4();

const rand = (a, b) => a + Math.random() * (b - a);

const SATELLITE_DIRS = [
  [1, 0.1, 0],
  [-1, -0.05, 0.12],
  [0.12, 0.72, 0.68],
  [-0.18, -0.68, 0.72],
  [0.58, -0.35, -0.73],
  [-0.62, 0.38, -0.68],
].map((v) => new THREE.Vector3(...v).normalize());

function makeShieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      strength: { value: 1 },
      breakCount: { value: 0 },
      breakDirs: { value: Array.from({ length: SATELLITE_COUNT }, () => new THREE.Vector3(0, 0, 0)) },
    },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float strength;
      uniform int breakCount;
      uniform vec3 breakDirs[${SATELLITE_COUNT}];
      varying vec3 vNormalW;
      varying vec2 vUv;

      float gridLine(float v, float width) {
        float f = abs(fract(v) - 0.5);
        return smoothstep(width, 0.0, f);
      }

      void main() {
        float lat = gridLine(vUv.y * 18.0, 0.035);
        float lon = gridLine(vUv.x * 36.0, 0.035);
        float grid = max(lat, lon);
        float pulse = 0.72 + 0.28 * sin(time * 2.3 + vUv.x * 14.0);
        float fracture = 1.0;
        vec3 n = normalize(vNormalW);
        for (int i = 0; i < ${SATELLITE_COUNT}; i++) {
          if (i >= breakCount) break;
          float d = dot(n, normalize(breakDirs[i]));
          float hole = smoothstep(0.72, 0.94, d);
          float crack = smoothstep(0.58, 0.88, d) * (0.35 + 0.65 * gridLine((vUv.x + vUv.y) * 28.0 + float(i) * 0.17, 0.025));
          fracture *= 1.0 - hole;
          grid += crack * 0.55;
        }
        float alpha = clamp(grid, 0.0, 1.0) * (0.08 + strength * 0.46) * pulse * max(fracture, 0.12);
        vec3 color = mix(vec3(0.32, 0.0, 0.0), vec3(1.0, 0.05, 0.0), grid);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export class ShieldSatelliteAssault {
  constructor(scene) {
    this.scene = scene;
    this.center = new THREE.Vector3(0, -18, -430);
    this.active = false;
    this.complete = false;
    this.time = 0;
    this.fighterCooldown = 1.2;
    this.destroyedCount = 0;
    this.breakDirs = [];

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.buildPlanetAndShield();
    this.buildSatellites();
    this.loadSatelliteModel();
  }

  buildPlanetAndShield() {
    const albedo = textureLoader.load(assetUrl(PLANET_TEXTURES.albedo));
    albedo.colorSpace = THREE.SRGBColorSpace;
    const emission = textureLoader.load(assetUrl(PLANET_TEXTURES.emission));
    emission.colorSpace = THREE.SRGBColorSpace;
    this.planet = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS, 72, 48),
      new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: textureLoader.load(assetUrl(PLANET_TEXTURES.normal)),
        roughnessMap: textureLoader.load(assetUrl(PLANET_TEXTURES.roughness)),
        emissiveMap: emission,
        color: 0xb42a22,
        emissive: 0x3c0504,
        emissiveIntensity: 0.32,
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    this.group.add(this.planet);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PLANET_RADIUS * 1.25, PLANET_RADIUS * 1.7, 96),
      new THREE.MeshBasicMaterial({
        color: 0x6b1e16,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI * 0.58;
    ring.rotation.y = Math.PI * 0.12;
    this.group.add(ring);
    this.planetRing = ring;

    this.shieldMaterial = makeShieldMaterial();
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(SHIELD_RADIUS, 96, 64), this.shieldMaterial);
    this.group.add(this.shield);

    const redKey = new THREE.PointLight(0xff2a12, 420, 780, 1.35);
    redKey.position.set(0, 120, 180);
    this.group.add(redKey);
  }

  buildSatellites() {
    this.satellites = [];
    const placeholderGeo = new THREE.OctahedronGeometry(7, 1);
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0x191015,
      emissive: 0x8b0800,
      emissiveIntensity: 0.9,
      metalness: 0.65,
      roughness: 0.38,
      flatShading: true,
    });

    for (let i = 0; i < SATELLITE_COUNT; i++) {
      const dir = SATELLITE_DIRS[i];
      const group = new THREE.Group();
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(placeholderGeo, placeholderMat));
      const halo = makeHaloSprite({ color: 0xff2208, size: 86, opacity: 0.34 });
      group.add(mesh, halo);
      group.userData.index = i;
      this.group.add(group);
      this.satellites.push({
        group,
        mesh,
        halo,
        dir,
        hp: SATELLITE_HP,
        destroyed: false,
        spin: rand(-0.5, 0.5),
      });
    }
  }

  loadSatelliteModel() {
    loadShipModel(SHIELD_SATELLITE_MODEL)
      .then((model) => {
        for (const sat of this.satellites) {
          sat.mesh.clear();
          sat.mesh.add(model.clone(true));
        }
      })
      .catch((err) => console.error('Satellite-bouclier indisponible - placeholder conserve', err));
  }

  start(shipZ) {
    this.active = true;
    this.complete = false;
    this.time = 0;
    this.fighterCooldown = 1.2;
    this.destroyedCount = 0;
    this.breakDirs = [];
    this.center.set(0, -18, shipZ - 430);
    this.group.position.copy(this.center);
    this.group.visible = true;
    this.shieldMaterial.uniforms.breakCount.value = 0;
    this.shieldMaterial.uniforms.strength.value = 1;
    for (const sat of this.satellites) {
      sat.hp = SATELLITE_HP;
      sat.destroyed = false;
      sat.group.visible = true;
      sat.halo.visible = true;
    }
    this.updateSatellitePositions(0);
  }

  update(dt, ship, targets, sound = null, explosions = null, { enemyAggressionMultiplier = 1 } = {}) {
    if (!this.active || this.complete) return 0;
    const aggression = Math.max(0.25, enemyAggressionMultiplier);
    this.time += dt;
    this.planet.rotation.y += dt * 0.018;
    this.planetRing.rotation.z += dt * 0.014;
    this.shield.rotation.y -= dt * 0.025;
    this.shieldMaterial.uniforms.time.value = this.time;
    this.shieldMaterial.uniforms.strength.value = Math.max(0, 1 - this.destroyedCount / SATELLITE_COUNT);
    this.updateSatellitePositions(dt);
    this.launchFighters(dt, ship, targets, aggression);
    if (this.destroyedCount >= SATELLITE_COUNT) {
      this.complete = true;
      this.active = false;
      this.shield.visible = false;
      return 2400;
    }
    return 0;
  }

  updateSatellitePositions(dt) {
    for (const sat of this.satellites) {
      if (sat.destroyed) continue;
      const drift = Math.sin(this.time * 0.22 + sat.group.userData.index) * 0.045;
      _dir.copy(sat.dir).applyAxisAngle(_worldUp, drift);
      sat.group.position.copy(_dir).multiplyScalar(SHIELD_RADIUS + 10);
      _side.crossVectors(_dir, _worldUp);
      if (_side.lengthSq() < 0.01) _side.set(1, 0, 0);
      _side.normalize();
      _up.crossVectors(_side, _dir).normalize();
      _basis.makeBasis(_side, _dir, _up);
      sat.group.quaternion.setFromRotationMatrix(_basis);
      sat.mesh.rotation.x = Math.PI / 2;
      sat.mesh.rotation.y += dt * (0.25 + sat.spin);
      sat.halo.material.opacity = 0.26 + 0.14 * Math.sin(this.time * 3.1 + sat.group.userData.index);
    }
  }

  launchFighters(dt, ship, targets, aggression) {
    this.fighterCooldown -= dt * aggression;
    if (this.fighterCooldown > 0) return;
    this.fighterCooldown = rand(FIGHTER_WAVE_INTERVAL * 0.75, FIGHTER_WAVE_INTERVAL * 1.35);
    const count = Math.random() > 0.45 ? 2 : 1;
    _dir.subVectors(ship.group.position, this.center).normalize();
    _side.crossVectors(_dir, new THREE.Vector3(0, 1, 0));
    if (_side.lengthSq() < 0.01) _side.set(1, 0, 0);
    _side.normalize();
    _up.crossVectors(_side, _dir).normalize();
    for (let i = 0; i < count; i++) {
      const sideOffset = (i - (count - 1) * 0.5) * rand(28, 44) + rand(-12, 12);
      _origin.copy(this.center)
        .addScaledVector(_dir, PLANET_RADIUS + rand(34, 68))
        .addScaledVector(_side, sideOffset)
        .addScaledVector(_up, rand(-30, 30));
      targets.launchFromMothership('basic_fighter', _origin, ship.group.position.z, {
        clampAhead: false,
        freeChase: true,
        freeChaseCenter: this.center,
        freeChaseExitDir: _dir,
        freeChaseExitRadius: SHIELD_RADIUS + 170,
      });
    }
  }

  handleLaser(laser, explosions = null, sound = null) {
    if (!this.active || this.complete) return { hit: false, score: 0 };
    for (const sat of this.satellites) {
      if (sat.destroyed) continue;
      sat.group.getWorldPosition(_origin);
      if (laser.position.distanceToSquared(_origin) > SATELLITE_HIT_RADIUS * SATELLITE_HIT_RADIUS) continue;
      sat.hp -= Math.max(1, laser.userData.damage || 1);
      sound?.armorHit(_origin);
      sat.halo.material.opacity = 0.85;
      if (sat.hp <= 0) {
        sat.destroyed = true;
        sat.group.visible = false;
        this.destroyedCount += 1;
        _impactDir.copy(sat.dir).normalize();
        this.breakDirs.push(_impactDir.clone());
        this.shieldMaterial.uniforms.breakCount.value = this.breakDirs.length;
        for (let i = 0; i < this.breakDirs.length; i++) {
          this.shieldMaterial.uniforms.breakDirs.value[i].copy(this.breakDirs[i]);
        }
        explosions?.spawn(_origin, { scale: rand(18, 28) });
        sound?.explosion('medium', _origin);
        return { hit: true, score: 450 };
      }
      return { hit: true, score: 0 };
    }
    return { hit: false, score: 0 };
  }

  getProgress() {
    return this.destroyedCount / SATELLITE_COUNT;
  }

  getStatusLabel() {
    if (this.complete) return 'BOUCLIER PLANETAIRE OUVERT';
    return `SATELLITES BOUCLIER ${SATELLITE_COUNT - this.destroyedCount}/${SATELLITE_COUNT}`;
  }
}
