import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../core/assetUrl.js';
import { makeHaloTexture } from '../core/halo.js';

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

const CANYON_LENGTH = 6400;
const CHUNK_COUNT = 18;
const CHUNK_DEPTH = 360;
const FLOOR_Y = -34;
const RIVER_Y = FLOOR_Y + 0.42;
const SAFE_HALF_WIDTH = 176;
const WALL_HALF_WIDTH = 340;
const KILL_HALF_WIDTH = 214;
const TERRAIN_HALF_WIDTH = 1350;
const SEGMENTS_X = 56;
const SEGMENTS_Z = 16;
export const HEGEMONY_CAPITAL_MODEL = {
  url: '/cities/hegemonie_capital/base_basic_pbr.glb',
  emissiveUrl: '/cities/hegemonie_capital/texture_emissive.png',
  length: 260,
  rotationY: 0,
};
const CITY_MODEL = HEGEMONY_CAPITAL_MODEL.url;
const CITY_EMISSIVE = HEGEMONY_CAPITAL_MODEL.emissiveUrl;
const CITY_LOD_FAR_DISTANCE = 1180;

const rand = (a, b) => a + Math.random() * (b - a);

function canyonCurve(z) {
  return Math.sin(z * 0.0021) * 32 + Math.sin(z * 0.00073 + 1.8) * 48;
}

function halfWidth(z) {
  return SAFE_HALF_WIDTH + 34 * Math.sin(z * 0.0024 + 0.7) + 22 * Math.sin(z * 0.0047);
}

function ridgeNoise(x, z, seed = 0) {
  return (
    Math.sin(x * 0.045 + seed) * 3.2 +
    Math.sin(z * 0.018 + seed * 1.7) * 9.5 +
    Math.sin((x + z) * 0.026 + seed * 0.4) * 4.5
  );
}

function makeRockMaterial() {
  const albedo = textureLoader.load(assetUrl('/textures/mission5_desert/desert_albedo.png'));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 8;
  albedo.repeat.set(1, 1);

  const normal = textureLoader.load(assetUrl('/textures/mission5_desert/desert_normal.png'));
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.anisotropy = 8;
  normal.repeat.copy(albedo.repeat);

  const roughness = textureLoader.load(assetUrl('/textures/mission5_desert/desert_roughness.png'));
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.anisotropy = 8;
  roughness.repeat.copy(albedo.repeat);

  const emission = textureLoader.load(assetUrl('/textures/mission5_desert/desert_emission.png'));
  emission.colorSpace = THREE.SRGBColorSpace;
  emission.wrapS = THREE.RepeatWrapping;
  emission.wrapT = THREE.RepeatWrapping;
  emission.anisotropy = 8;
  emission.repeat.copy(albedo.repeat);

  return new THREE.MeshStandardMaterial({
    color: 0xffb06f,
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(1.85, 1.85),
    roughnessMap: roughness,
    emissive: 0xff3508,
    emissiveMap: emission,
    emissiveIntensity: 0.72,
    roughness: 0.86,
    metalness: 0.04,
    flatShading: false,
    side: THREE.DoubleSide,
  });
}

function makeRiverMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x8b2e11,
    emissive: 0xff3a12,
    emissiveIntensity: 1.8,
    roughness: 0.36,
    metalness: 0.12,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
}

function makeSkyTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#fff0a8');
  gradient.addColorStop(0.34, '#ffc66b');
  gradient.addColorStop(0.68, '#e87435');
  gradient.addColorStop(1, '#6b150f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    const y = Math.random() * size;
    const x = Math.random() * size;
    const a = Math.max(0, 0.18 - y / size * 0.12) * Math.random();
    ctx.fillStyle = `rgba(255,244,190,${a})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export class HegemonyCanyonRun {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.active = false;
    this.complete = false;
    this.time = 0;
    this.progress = 0;
    this.spawnCooldown = 2.2;
    this.cityShown = false;
    this.cityVisibleTime = 0;
    this.cityFullModel = null;
    this.cityFullResolutionVisible = false;
    this._cityWorldPosition = new THREE.Vector3();
    this._lastCamera = null;
    this.centerZ = 0;

    this.rockMat = makeRockMaterial();
    this.riverMat = makeRiverMaterial();
    this.redMat = new THREE.MeshBasicMaterial({
      color: 0xff2208,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.skyGroup = new THREE.Group();
    this.skyGroup.visible = false;
    scene.add(this.skyGroup);
    this.buildSky();

    this.chunks = [];
    this.buildChunks();
    this.buildGroundUnderlay();
    this.buildCity();
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3600, 48, 24),
      new THREE.MeshBasicMaterial({
        map: makeSkyTexture(),
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
      })
    );
    sky.renderOrder = -200;
    this.skyGroup.add(sky);

    const starMap = textureLoader.load(assetUrl('/textures/stars/big_red_star/star_albedo.png'));
    starMap.colorSpace = THREE.SRGBColorSpace;
    this.redStar = new THREE.Group();
    this.redStar.position.set(820, 610, -1650);
    this.redStar.rotation.set(-0.08, 0.25, 0.08);
    this.skyGroup.add(this.redStar);

    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(250, 48, 32),
      new THREE.MeshBasicMaterial({ map: starMap, color: 0xffdcc8 })
    );
    this.redStar.add(surface);
    this.redStarSurface = surface;

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeHaloTexture(0xff5a18),
        color: 0xff8a24,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      })
    );
    halo.scale.set(1320, 1320, 1);
    halo.renderOrder = -150;
    this.redStar.add(halo);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bands = [
      [340, 360, 0.2],
      [405, 424, 0.36],
      [470, 492, 0.25],
      [560, 578, 0.16],
    ];
    this.starRings = [];
    for (const [inner, outer, opacity] of bands) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 192, 1), ringMat.clone());
      ring.material.opacity = opacity;
      ring.rotation.set(1.16, 0.08, 0.24);
      this.redStar.add(ring);
      this.starRings.push(ring);
    }

    const dustMat = new THREE.MeshBasicMaterial({
      color: 0xd98236,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.dustVeils = [];
    for (let i = 0; i < 7; i++) {
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(1700, 420, 1, 1), dustMat.clone());
      veil.position.set(rand(-420, 420), rand(-70, 210), -520 - i * 260);
      veil.rotation.set(0.08 + rand(-0.06, 0.06), rand(-0.08, 0.08), rand(-0.08, 0.08));
      veil.material.opacity = rand(0.055, 0.13);
      this.skyGroup.add(veil);
      this.dustVeils.push(veil);
    }
  }

  buildChunks() {
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const group = new THREE.Group();
      const terrain = new THREE.Mesh(new THREE.BufferGeometry(), this.rockMat);
      terrain.receiveShadow = true;
      const river = new THREE.Mesh(new THREE.BufferGeometry(), this.riverMat);
      river.renderOrder = 2;
      group.add(terrain, river);
      this.group.add(group);
      this.chunks.push({ group, terrain, river, index: i, seed: i * 19.37 });
    }
  }

  buildGroundUnderlay() {
    const geometry = new THREE.PlaneGeometry(TERRAIN_HALF_WIDTH * 2.8, CHUNK_DEPTH * (CHUNK_COUNT + 5), 12, 32);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const wave = Math.sin(x * 0.006) * 0.9 + Math.sin(z * 0.011) * 0.7;
      pos.setY(i, FLOOR_Y - 2.8 + wave);
      uv.setXY(i, (x + TERRAIN_HALF_WIDTH) / 240, Math.abs(z) / 240);
    }
    geometry.computeVertexNormals();
    this.groundUnderlay = new THREE.Mesh(geometry, this.rockMat);
    this.groundUnderlay.receiveShadow = true;
    this.groundUnderlay.renderOrder = -4;
    this.group.add(this.groundUnderlay);
  }

  updateGroundUnderlay(shipZ) {
    if (!this.groundUnderlay) return;
    this.groundUnderlay.position.set(0, 0, shipZ - (CHUNK_DEPTH * CHUNK_COUNT) / 2 + 220);
  }

  buildCity() {
    this.city = new THREE.Group();
    this.city.visible = false;
    this.group.add(this.city);

    this.citySilhouette = new THREE.Group();
    const fallbackMat = new THREE.MeshStandardMaterial({
      color: 0x101018,
      emissive: 0x420300,
      emissiveIntensity: 0.6,
      roughness: 0.42,
      metalness: 0.72,
    });
    for (let i = 0; i < 32; i++) {
      const h = rand(24, 110);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(rand(9, 24), h, rand(9, 24)), fallbackMat);
      tower.position.set(rand(-150, 150), h / 2, rand(-70, 105));
      const light = new THREE.Mesh(new THREE.SphereGeometry(rand(1.2, 2.4), 8, 6), this.redMat.clone());
      light.position.set(0, h * 0.32, -tower.geometry.parameters.depth / 2 - 0.3);
      tower.add(light);
      this.citySilhouette.add(tower);
    }

    this.cityLOD = new THREE.LOD();
    this.cityLOD.addLevel(this.citySilhouette, CITY_LOD_FAR_DISTANCE);
    this.city.add(this.cityLOD);

    gltfLoader.load(
      assetUrl(CITY_MODEL),
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.scale.setScalar(260 / Math.max(size.x, size.y, size.z));
        box.setFromObject(model);
        model.position.sub(box.getCenter(new THREE.Vector3()));
        box.setFromObject(model);
        model.position.y -= box.min.y;
        textureLoader.load(assetUrl(CITY_EMISSIVE), (emissive) => {
          emissive.flipY = false;
          emissive.colorSpace = THREE.SRGBColorSpace;
          model.traverse((o) => {
            if (!o.isMesh) return;
            o.material.emissiveMap = emissive;
            o.material.emissive?.set?.(0xff1a08);
            o.material.emissiveIntensity = 1.15;
            o.material.needsUpdate = true;
          });
        });
        this.cityFullModel = model;
        this.cityLOD.addLevel(model, 0);
      },
      undefined,
      (err) => console.error('Capitale Hegemonie indisponible - fallback conserve', err)
    );
  }

  start(shipZ) {
    this.active = true;
    this.complete = false;
    this.time = 0;
    this.progress = 0;
    this.spawnCooldown = 1.6;
    this.centerZ = shipZ - 360;
    this.group.visible = true;
    this.skyGroup.visible = true;
    this.city.visible = false;
    this.cityShown = false;
    this.cityVisibleTime = 0;
    this.cityFullResolutionVisible = false;
    for (let i = 0; i < this.chunks.length; i++) {
      this.resetChunk(this.chunks[i], shipZ + 170 - i * CHUNK_DEPTH);
    }
    this.updateGroundUnderlay(shipZ);
    this.positionCity(shipZ - CANYON_LENGTH - 480);
  }

  resetChunk(chunk, zStart) {
    chunk.zStart = zStart;
    chunk.zEnd = zStart - CHUNK_DEPTH;
    this.rebuildTerrain(chunk);
    this.rebuildRiver(chunk);
  }

  rebuildTerrain(chunk) {
    const verts = [];
    const uvs = [];
    const indices = [];
    const xMin = -TERRAIN_HALF_WIDTH;
    const xMax = TERRAIN_HALF_WIDTH;
    for (let iz = 0; iz <= SEGMENTS_Z; iz++) {
      const tZ = iz / SEGMENTS_Z;
      const z = chunk.zStart - tZ * CHUNK_DEPTH;
      const center = canyonCurve(z);
      const safe = halfWidth(z);
      for (let ix = 0; ix <= SEGMENTS_X; ix++) {
        const tX = ix / SEGMENTS_X;
        const x = xMin + (xMax - xMin) * tX;
        const dist = Math.abs(x - center);
        const wall = Math.max(0, dist - safe);
        const wallT = THREE.MathUtils.clamp(wall / (WALL_HALF_WIDTH - safe), 0, 1);
        const mountainT = THREE.MathUtils.clamp((dist - WALL_HALF_WIDTH) / (TERRAIN_HALF_WIDTH - WALL_HALF_WIDTH), 0, 1);
        const lowDune = Math.sin(x * 0.013 + z * 0.018 + chunk.seed) * 1.6;
        const roadSmoothing = 1 - THREE.MathUtils.clamp(dist / safe, 0, 1);
        const shoulder = Math.pow(wallT, 1.8) * 42;
        const farRange = Math.pow(mountainT, 1.18) * 155;
        const mesa = Math.max(0, Math.sin(x * 0.011 + chunk.seed) * Math.sin(z * 0.006 - chunk.seed * 0.7)) * 58 * mountainT;
        const y = FLOOR_Y + lowDune * (1 - roadSmoothing * 0.82) + shoulder + farRange + mesa + ridgeNoise(x, z, chunk.seed) * (0.22 + mountainT * 0.85);
        verts.push(x, y, z);
        uvs.push((x + TERRAIN_HALF_WIDTH) / 240, Math.abs(z) / 240);
      }
    }
    const row = SEGMENTS_X + 1;
    for (let iz = 0; iz < SEGMENTS_Z; iz++) {
      for (let ix = 0; ix < SEGMENTS_X; ix++) {
        const a = iz * row + ix;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    const geo = chunk.terrain.geometry;
    geo.dispose();
    chunk.terrain.geometry = new THREE.BufferGeometry();
    chunk.terrain.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    chunk.terrain.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    chunk.terrain.geometry.setIndex(indices);
    chunk.terrain.geometry.computeVertexNormals();
  }

  rebuildRiver(chunk) {
    const width = 10;
    const verts = [];
    const uvs = [];
    const indices = [];
    for (let iz = 0; iz <= SEGMENTS_Z; iz++) {
      const z = chunk.zStart - (iz / SEGMENTS_Z) * CHUNK_DEPTH;
      const center = canyonCurve(z) + Math.sin(z * 0.008) * 9;
      verts.push(center - width, RIVER_Y, z, center + width, RIVER_Y, z);
      uvs.push(0, iz / 2, 1, iz / 2);
    }
    for (let iz = 0; iz < SEGMENTS_Z; iz++) {
      const a = iz * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    chunk.river.geometry.dispose();
    chunk.river.geometry = new THREE.BufferGeometry();
    chunk.river.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    chunk.river.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    chunk.river.geometry.setIndex(indices);
    chunk.river.geometry.computeVertexNormals();
  }

  positionCity(z) {
    const x = canyonCurve(z);
    this.city.position.set(x, FLOOR_Y, z + 280);
    this.city.scale.setScalar(1.42);
  }

  update(dt, ship, targets, sound = null, explosions = null, { enemyAggressionMultiplier = 1 } = {}) {
    if (!this.active || this.complete) return 0;
    this.time += dt;
    const shipZ = ship.group.position.z;
    this.progress = clamp01(Math.abs(shipZ - this.centerZ) / CANYON_LENGTH);
    this.riverMat.emissiveIntensity = 1.45 + Math.sin(this.time * 2.2) * 0.26;
    this.updateGroundUnderlay(shipZ);

    this.recycleChunksBehindCamera(ship.group.position.z + 90);

    const cityZ = this.centerZ - CANYON_LENGTH - 420;
    if (!this.cityShown && shipZ < this.centerZ - CANYON_LENGTH + 1500) {
      this.cityShown = true;
      this.city.visible = true;
      this.positionCity(cityZ);
    }
    this.cityFullResolutionVisible = this.isCityFullResolutionVisible(this._lastCamera);
    if (this.cityShown && this.cityFullResolutionVisible) {
      this.cityVisibleTime += dt;
    }
    if (this.cityVisibleTime >= 4) {
      this.complete = true;
      this.active = false;
      this.skyGroup.visible = false;
      return 2600;
    }

    this.spawnCooldown -= dt * enemyAggressionMultiplier;
    if (this.spawnCooldown <= 0 && shipZ > this.centerZ - CANYON_LENGTH + 900) {
      const z = shipZ - rand(520, 900);
      const x = canyonCurve(z) + rand(-48, 48);
      const y = rand(-14, 26);
      targets.launchFromMothership('basic_fighter', new THREE.Vector3(x, y, z), shipZ, { clampAhead: false });
      this.spawnCooldown = rand(1.1, 2.4);
    }

    if (shipZ < this.centerZ - CANYON_LENGTH) {
      this.complete = true;
      this.active = false;
      this.skyGroup.visible = false;
      return 2600;
    }
    return 0;
  }

  recycleChunksBehindCamera(cameraBackZ) {
    for (const chunk of this.chunks) {
      if (chunk.zEnd <= cameraBackZ) continue;
      let farthestEnd = Infinity;
      for (const other of this.chunks) {
        if (other === chunk) continue;
        farthestEnd = Math.min(farthestEnd, other.zEnd);
      }
      this.resetChunk(chunk, farthestEnd);
    }
  }

  syncSky(camera, dt) {
    if (camera) {
      this._lastCamera = camera;
      this.cityLOD?.update(camera);
    }
    if (!this.skyGroup.visible || !camera) return;
    this.skyGroup.position.copy(camera.position);
    if (this.redStarSurface) this.redStarSurface.rotation.y += dt * 0.018;
    if (this.dustVeils) {
      for (let i = 0; i < this.dustVeils.length; i++) {
        const veil = this.dustVeils[i];
        veil.position.x += Math.sin(this.time * 0.22 + i) * dt * 10;
        veil.material.opacity = 0.055 + 0.045 * (0.5 + 0.5 * Math.sin(this.time * 0.35 + i));
      }
    }
    if (this.starRings) {
      for (let i = 0; i < this.starRings.length; i++) {
        this.starRings[i].rotation.z += dt * (0.004 + i * 0.0015);
      }
    }
  }

  applyCollision(shipPos, damage, sound = null, explosions = null) {
    if (!this.active || this.complete) return false;
    const center = canyonCurve(shipPos.z);
    const safe = halfWidth(shipPos.z);
    const floorLimit = FLOOR_Y + 7;
    const dist = Math.abs(shipPos.x - center);
    const hitTerrain = shipPos.y < floorLimit || dist > safe + 28 || dist > KILL_HALF_WIDTH;
    if (!hitTerrain) return false;
    sound?.explosion('medium', shipPos);
    explosions?.spawn(shipPos, { scale: 18 });
    damage(999);
    return true;
  }

  getProgress() {
    return this.progress;
  }

  getStatusLabel() {
    if (this.complete) return 'CAPITALE EN VUE';
    if (this.cityShown && !this.cityFullResolutionVisible) return 'APPROCHE CAPITALE';
    if (this.cityFullResolutionVisible) return `CAPITALE ${Math.floor(this.cityVisibleTime)}/4s`;
    return `COULOIR CAPITAL ${Math.round(this.progress * 100)}%`;
  }

  isCityFullResolutionVisible(camera) {
    if (!camera || !this.cityLOD || !this.cityFullModel) return false;
    this.cityLOD.updateMatrixWorld(true);
    this.cityLOD.getWorldPosition(this._cityWorldPosition);
    const distance = camera.position.distanceTo(this._cityWorldPosition);
    return this.cityLOD.getObjectForDistance(distance) === this.cityFullModel;
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
