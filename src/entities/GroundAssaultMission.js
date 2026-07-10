import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from '../core/assetUrl.js';
import { makeHaloTexture } from '../core/halo.js';

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const ASSAULT_LENGTH = 5200;
const FLOOR_Y = -30;
const SOLDIER_FOOT_OFFSET = 1.85;
const PLAYER_HEIGHT = 28;
const SOLDIER_SCALE = 5.8;
const SOLDIER_COUNT = 34;
const ENEMY_COUNT = 34;
const CAPITAL_ENTRY_DEPTH = 520;
const CITY_START_PROGRESS = 0.66;
const ENEMY_KILL_TARGET = 42;
const CAPITAL_GROUND_SINK = 128;
const CITY_WEAKPOINT_HP = 5;
const CITY_WEAKPOINT_RADIUS = 18;
const ALLY_FIRE_INTERVAL_MIN = 0.08;
const ALLY_FIRE_INTERVAL_MAX = 0.22;
const ALLY_TARGET_RANGE = 1180;
const CITY_DESTRUCTION_DURATION = 2.2;
const CAPITAL_MODEL = {
  url: '/cities/hegemonie_capital/base_basic_pbr.glb',
  emissiveUrl: '/cities/hegemonie_capital/texture_emissive.png',
};
// LOD de la capitale : silhouette procédurale au loin, puis GLB complet dès
// l'arrivée en ville. Pas de palier intermédiaire pour éviter les trous.
const CAPITAL_LOD_FAR_DISTANCE = 1450;
const CITY_WEAKPOINT_LAYOUT = [
  { x: -240, y: 70, z: 58 },
  { x: -154, y: 126, z: 96 },
  { x: -72, y: 92, z: 18 },
  { x: 0, y: 168, z: 72 },
  { x: 96, y: 112, z: 24 },
  { x: 178, y: 88, z: 132 },
  { x: 260, y: 62, z: 70 },
  { x: 0, y: 34, z: 314 },
];
const CITY_COLLIDERS = [
  { x: -240, z: 74, w: 90, d: 150 },
  { x: -120, z: 65, w: 105, d: 170 },
  { x: 18, z: 72, w: 120, d: 180 },
  { x: 156, z: 102, w: 95, d: 160 },
  { x: 285, z: 84, w: 105, d: 165 },
  { x: -332, z: 245, w: 120, d: 110 },
  { x: 334, z: 248, w: 120, d: 110 },
];

const CONFEDERATION = {
  folder: '/characters/confederation',
  model: '/characters/confederation/lod.fbx',
  weapon: '/weapons/weapon_voidrifle_confederation.glb',
  tint: 0xdfefff,
  emissive: 0x2f8cff,
};

const HEGEMONY = {
  folder: '/characters/hegemonie',
  model: '/characters/hegemonie/lod.fbx',
  weapon: '/weapons/weapon_voidrifle_hegemonie.glb',
  tint: 0x151016,
  emissive: 0xff1508,
};

const ANIMATIONS = {
  idle: '/animations/mixamo/Idle.fbx',
  walk: '/animations/mixamo/Rifle Walk To Stop.fbx',
  run: '/animations/mixamo/Run Forward Right.fbx',
  shoot: '/animations/mixamo/Gunplay.fbx',
  death: '/animations/mixamo/Walking To Dying.fbx',
  deathAlt: '/animations/mixamo/Death Crouching Headshot Front.fbx',
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function getConfederationFormationSlot(index) {
  const columns = 7;
  const row = Math.floor(index / columns);
  const col = index % columns;
  const rowZ = [-92, -58, -24, 14, 46, 74];
  return {
    x: (col - 3) * 18 + (row % 2 ? 8 : 0),
    z: rowZ[row] ?? 96 + (row - rowZ.length) * 24,
  };
}

// Les FBX Mixamo animent aussi la translation du bassin (root motion), alors
// que le placement des acteurs (joueur, alliés, ennemis) est entièrement
// piloté par le code chaque frame (position.set / rotation.y). Sans ce
// filtrage, la piste de position du bassin fait glisser/avancer le perso en
// plus du déplacement code, d'où l'anim de marche qui semblait durer trop
// longtemps ou ne pas correspondre au déplacement réel.
function stripRootMotion(clip) {
  if (!clip) return clip;
  clip.tracks = clip.tracks.filter((track) => !track.name.toLowerCase().endsWith('hips.position'));
  return clip;
}

// Le clip Mixamo "Rifle Walk To Stop" (30 fps, 108 frames) ne contient un
// vrai cycle de foulée que sur ses ~41 premières frames (~1,37 s) ; le reste
// est une pose d'arrêt figée. En bouclant les 108 frames telles quelles, le
// perso "gèle" sur cette pose d'arrêt ~2 s à chaque tour. On ne garde donc que
// la portion cyclique (bornes retrouvées en comparant les quaternions des
// membres à la frame 0 : ~99,9% de similarité vers la frame 41).
function makeLoopableWalk(clip) {
  if (!clip) return clip;
  return THREE.AnimationUtils.subclip(clip, `${clip.name}_loop`, 0, 41, 30);
}

// Même technique de bosselage procédural que les astéroïdes de la mission 2
// (AsteroidField.js) : un icosaèdre déformé par du bruit, réutilisé ici pour
// des blocs rocheux au sol (repères visuels sur la plaine, sinon trop vide).
function rockNoise(x, y, z, seed) {
  return (
    Math.sin(x * 2.1 + seed) * 0.16 +
    Math.sin(y * 2.7 + seed * 1.7) * 0.13 +
    Math.sin(z * 3.3 + seed * 2.3) * 0.11 +
    Math.sin((x + y - z) * 4.1 + seed * 0.7) * 0.08
  );
}

function makeRockGeometry(radius, detail = 1, seed = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const n = rockNoise(dir.x, dir.y, dir.z, seed);
    const s = 1 + n;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeSoldierFallback(color, emissive) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.18,
    roughness: 0.58,
    metalness: 0.22,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.25, 6, 10), mat);
  body.position.y = 1.08;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), mat);
  helmet.position.y = 2.02;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: emissive })
  );
  visor.position.set(0, 2.04, -0.29);
  group.add(body, helmet, visor);
  return group;
}

function applyCharacterTextures(root, cfg) {
  const base = cfg.folder;
  const diffuse = textureLoader.load(assetUrl(`${base}/texture_diffuse.png`));
  diffuse.colorSpace = THREE.SRGBColorSpace;
  const normal = textureLoader.load(assetUrl(`${base}/texture_normal.png`));
  const roughness = textureLoader.load(assetUrl(`${base}/texture_roughness.png`));
  const metallic = textureLoader.load(assetUrl(`${base}/texture_metallic.png`));
  const emissivePath = cfg === HEGEMONY ? `${base}/texture_emissive.png` : null;
  const emissiveMap = emissivePath ? textureLoader.load(assetUrl(emissivePath)) : null;
  if (emissiveMap) emissiveMap.colorSpace = THREE.SRGBColorSpace;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.material = new THREE.MeshStandardMaterial({
      color: cfg.tint,
      map: diffuse,
      normalMap: normal,
      roughnessMap: roughness,
      metalnessMap: metallic,
      emissive: cfg.emissive,
      emissiveMap,
      emissiveIntensity: emissiveMap ? 0.95 : 0.12,
      roughness: 0.72,
      metalness: 0.28,
      skinning: true,
    });
  });
}

function normalizeFbx(root, targetHeight = SOLDIER_SCALE) {
  root.rotation.set(0, Math.PI, 0);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const h = Math.max(0.001, size.y);
  root.scale.setScalar(targetHeight / h);
  box.setFromObject(root);
  root.position.sub(box.getCenter(new THREE.Vector3()));
  root.position.y -= box.min.y;
  return root;
}

function findHand(root) {
  let found = null;
  root.traverse((obj) => {
    const name = obj.name.toLowerCase();
    if (!found && (name.includes('righthand') || name.includes('right_hand') || name.includes('handr'))) {
      found = obj;
    }
  });
  return found;
}

function findNodeByName(root, wantedName) {
  const needle = wantedName.toLowerCase();
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.name?.toLowerCase?.() === needle) found = obj;
  });
  return found;
}

export class GroundAssaultMission {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.skyGroup = new THREE.Group();
    this.skyGroup.visible = false;
    scene.add(this.skyGroup);

    this.active = false;
    this.complete = false;
    this.progress = 0;
    this.time = 0;
    this.centerZ = 0;
    this.score = 0;
    this.kills = 0;
    this.spawnLine = 0;

    this.soldiers = [];
    this.enemySoldiers = [];
    this.playerActor = null;
    this.characterBases = { confederation: null, hegemonie: null };
    this.weaponBases = { confederation: null, hegemonie: null };
    this.animationClips = {};
    this.assetsReady = false;
    this.capitalFullModel = null;
    this.capitalFullResolutionVisible = false;
    this.cityWeakpoints = [];
    this.cityHealth = 0;
    this.cityMaxHealth = CITY_WEAKPOINT_LAYOUT.length * CITY_WEAKPOINT_HP;
    this.cityDestroyed = false;
    this.cityDestructionTimer = 0;
    this.cityDestructionBurstTimer = 0;
    this._capitalWorldPosition = new THREE.Vector3();
    this._tmpWorld = new THREE.Vector3();
    this._lastCamera = null;

    this.buildTerrain();
    this.buildSky();
    this.buildCapitalSilhouette();
    this.loadAssets();
  }

  buildTerrain() {
    const albedo = textureLoader.load(assetUrl('/textures/mission5_desert/desert_albedo.png'));
    albedo.colorSpace = THREE.SRGBColorSpace;
    albedo.wrapS = THREE.RepeatWrapping;
    albedo.wrapT = THREE.RepeatWrapping;
    albedo.repeat.set(18, 30);
    const normal = textureLoader.load(assetUrl('/textures/mission5_desert/desert_normal.png'));
    normal.wrapS = THREE.RepeatWrapping;
    normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.copy(albedo.repeat);

    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0xffa15d,
      map: albedo,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.92,
      metalness: 0.03,
    });

    const geo = new THREE.PlaneGeometry(2400, ASSAULT_LENGTH + 2200, 8, 32);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, FLOOR_Y);
    }
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);

    this.path = new THREE.Mesh(
      new THREE.PlaneGeometry(180, ASSAULT_LENGTH + 1200, 8, 80),
      new THREE.MeshStandardMaterial({
        color: 0xb7562d,
        emissive: 0x421400,
        emissiveIntensity: 0.2,
        roughness: 0.96,
        transparent: true,
        opacity: 0.72,
      })
    );
    this.path.rotation.x = -Math.PI / 2;
    this.path.position.y = FLOOR_Y + 0.25;
    this.group.add(this.path);

    this.buildRocks();
  }

  // Blocs rocheux dispersés sur la plaine (mêmes textures/technique de
  // bosselage que les astéroïdes de la mission 2) : sans repère au sol, la
  // plaine paraît vide et donne une fausse impression que le joueur n'avance
  // pas. Enfants de `this.ground`, ils suivent automatiquement son recentrage
  // sur le joueur (voir update()), pas besoin de logique de défilement dédiée.
  buildRocks() {
    const albedo = textureLoader.load(assetUrl('/textures/asteroids/red_corona_asteroid_albedo.png'));
    albedo.colorSpace = THREE.SRGBColorSpace;
    const normal = textureLoader.load(assetUrl('/textures/asteroids/red_corona_asteroid_normal.png'));

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xb5673a,
      map: albedo,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });

    const ROCK_COUNT = 70;
    const halfWidth = 1100;
    const halfLength = (ASSAULT_LENGTH + 2200) / 2 - 100;
    const pathClearance = 130; // couloir central à garder dégagé pour le joueur/les troupes
    for (let i = 0; i < ROCK_COUNT; i++) {
      const radius = rand(4, 14);
      const geo = makeRockGeometry(radius, radius > 9 ? 2 : 1, i * 3.7 + 1);
      const rock = new THREE.Mesh(geo, rockMat);
      let x = rand(-halfWidth, halfWidth);
      if (Math.abs(x) < pathClearance) x += Math.sign(x || 1) * pathClearance;
      rock.position.set(x, FLOOR_Y + radius * 0.3, rand(-halfLength, halfLength));
      rock.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
      rock.receiveShadow = true;
      rock.castShadow = true;
      this.ground.add(rock);
    }
  }

  buildSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#ffe79a');
    g.addColorStop(0.48, '#d88b44');
    g.addColorStop(1, '#4d100d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const skyTex = new THREE.CanvasTexture(canvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3600, 48, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
    );
    this.skyGroup.add(sky);

    const starTex = textureLoader.load(assetUrl('/textures/stars/big_red_star/star_albedo.png'));
    starTex.colorSpace = THREE.SRGBColorSpace;
    this.star = new THREE.Group();
    this.star.position.set(780, 520, -1650);
    this.skyGroup.add(this.star);
    this.starSurface = new THREE.Mesh(
      new THREE.SphereGeometry(250, 48, 32),
      new THREE.MeshBasicMaterial({ map: starTex, color: 0xffd0b0 })
    );
    this.star.add(this.starSurface);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeHaloTexture(0xff6a12),
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(1250, 1250, 1);
    this.star.add(halo);
    for (const [inner, outer, opacity] of [[330, 350, 0.2], [390, 410, 0.32], [470, 492, 0.18]]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 192, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffd78a,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ring.rotation.set(1.15, 0.06, 0.24);
      this.star.add(ring);
    }

    const dustMat = new THREE.MeshBasicMaterial({
      color: 0xdf8538,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.dustVeils = [];
    for (let i = 0; i < 9; i++) {
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(1850, 360, 1, 1), dustMat.clone());
      veil.position.set(rand(-520, 520), rand(-92, 150), -430 - i * 210);
      veil.rotation.set(0.05 + rand(-0.05, 0.05), rand(-0.08, 0.08), rand(-0.05, 0.05));
      veil.material.opacity = rand(0.045, 0.12);
      this.skyGroup.add(veil);
      this.dustVeils.push(veil);
    }
  }

  buildCapitalSilhouette() {
    this.capital = new THREE.Group();
    // Silhouette procédurale : très bon marché, sert de palier "faible
    // résolution" visible de loin dans le THREE.LOD ci-dessous.
    this.capitalSilhouette = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x09070a,
      emissive: 0x7a0500,
      emissiveIntensity: 1.35,
      roughness: 0.5,
      metalness: 0.5,
    });
    mat.fog = false;
    for (let i = 0; i < 46; i++) {
      const h = rand(28, 170);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(rand(10, 34), h, rand(10, 34)), mat);
      tower.position.set(rand(-360, 360), h / 2, rand(-80, 160));
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(rand(1.5, 4), 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff1808 })
      );
      light.position.set(0, h * 0.25, -tower.geometry.parameters.depth / 2 - 0.4);
      tower.add(light);
      this.capitalSilhouette.add(tower);
    }

    const gateMat = new THREE.MeshStandardMaterial({
      color: 0x080506,
      emissive: 0xb90900,
      emissiveIntensity: 1.2,
      roughness: 0.42,
      metalness: 0.62,
    });
    gateMat.fog = false;
    const gateLeft = new THREE.Mesh(new THREE.BoxGeometry(42, 120, 90), gateMat);
    const gateRight = gateLeft.clone();
    gateLeft.position.set(-94, 60, 310);
    gateRight.position.set(94, 60, 310);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(230, 34, 86), gateMat);
    lintel.position.set(0, 124, 310);
    const avenue = new THREE.Mesh(
      new THREE.PlaneGeometry(175, 760, 4, 12),
      new THREE.MeshStandardMaterial({
        color: 0x1a0706,
        emissive: 0x5a0500,
        emissiveIntensity: 0.85,
        roughness: 0.82,
      })
    );
    avenue.material.fog = false;
    avenue.rotation.x = -Math.PI / 2;
    avenue.position.set(0, 0.5, 270);
    const foundation = new THREE.Mesh(
      new THREE.PlaneGeometry(980, 620, 2, 2),
      new THREE.MeshBasicMaterial({
        color: 0x4a170b,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      })
    );
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(0, 0.08, 155);
    this.capitalSilhouette.add(foundation, gateLeft, gateRight, lintel, avenue);
    this.capitalSilhouette.scale.set(1.22, 1.18, 1.22);
    this.capitalSilhouette.position.y = FLOOR_Y - CAPITAL_GROUND_SINK;

    // THREE.LOD : la silhouette est le seul palier dispo tant que le GLB n'a
    // pas fini de charger ; loadCapitalModel() ajoute ensuite le palier
    // complet qui remplace la silhouette dès l'entrée en ville.
    this.capitalLOD = new THREE.LOD();
    this.capitalLOD.addLevel(this.capitalSilhouette, CAPITAL_LOD_FAR_DISTANCE);
    this.capital.add(this.capitalLOD);
    this.buildCapitalWalkSurface();
    this.buildCityWeakpoints();
    this.group.add(this.capital);
  }

  buildCapitalWalkSurface() {
    this.cityWalkSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(980, 980, 2, 2),
      new THREE.MeshStandardMaterial({
        color: 0x4a0805,
        emissive: 0x5a0500,
        emissiveIntensity: 0.35,
        roughness: 0.86,
        metalness: 0.06,
      })
    );
    this.cityWalkSurface.rotation.x = -Math.PI / 2;
    this.cityWalkSurface.position.set(0, FLOOR_Y + 0.12, 170);
    this.cityWalkSurface.receiveShadow = true;
    this.capital.add(this.cityWalkSurface);
  }

  buildCityWeakpoints() {
    const targetMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const haloMat = new THREE.SpriteMaterial({
      map: makeHaloTexture(0xff1808),
      color: 0xb00000,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const spec of CITY_WEAKPOINT_LAYOUT) {
      const group = new THREE.Group();
      group.position.set(spec.x, FLOOR_Y + spec.y, spec.z);
      const core = new THREE.Mesh(new THREE.SphereGeometry(6.2, 16, 10), targetMat.clone());
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(10, 15, 32),
        new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = Math.PI / 2;
      const halo = new THREE.Sprite(haloMat.clone());
      halo.scale.set(58, 58, 1);
      group.add(core, ring, halo);
      group.userData = { hp: CITY_WEAKPOINT_HP, alive: true, phase: rand(0, Math.PI * 2) };
      this.cityWeakpoints.push(group);
      this.capital.add(group);
    }
  }

  async loadAssets() {
    this.characterBases.confederation = await this.loadCharacter(CONFEDERATION, 'confederation');
    this.characterBases.hegemonie = await this.loadCharacter(HEGEMONY, 'hegemonie');
    this.weaponBases.confederation = await this.loadWeapon(CONFEDERATION.weapon);
    this.weaponBases.hegemonie = await this.loadWeapon(HEGEMONY.weapon);
    await this.loadCapitalModel();
    await Promise.all(Object.entries(ANIMATIONS).map(async ([name, url]) => {
      try {
        const fbx = await fbxLoader.loadAsync(assetUrl(url));
        let clip = stripRootMotion(fbx.animations?.[0] || null);
        if (name === 'walk') clip = makeLoopableWalk(clip);
        this.animationClips[name] = clip;
      } catch (err) {
        console.warn(`Animation ${name} indisponible`, err);
      }
    }));
    this.assetsReady = true;
    this.refreshLoadedActors();
  }

  async loadCapitalModel() {
    try {
      const gltf = await gltfLoader.loadAsync(assetUrl(CAPITAL_MODEL.url));
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(760 / Math.max(size.x, size.y, size.z));
      box.setFromObject(model);
      model.position.sub(box.getCenter(new THREE.Vector3()));
      box.setFromObject(model);
      model.position.y += FLOOR_Y - box.min.y - CAPITAL_GROUND_SINK;
      model.rotation.y = Math.PI;
      const emissive = await textureLoader.loadAsync(assetUrl(CAPITAL_MODEL.emissiveUrl));
      emissive.flipY = false;
      emissive.colorSpace = THREE.SRGBColorSpace;
      model.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.material.emissiveMap = emissive;
        obj.material.emissive?.set?.(0xff1208);
        obj.material.emissiveIntensity = 1.25;
        obj.material.needsUpdate = true;
      });
      this.capitalFullModel = model;
      this.capitalLOD.addLevel(model, 0);
    } catch (err) {
      console.warn('Modele 3D capitale Mission 6 indisponible - silhouette conservee', err);
    }
  }

  async loadCharacter(cfg, side) {
    try {
      const root = await fbxLoader.loadAsync(assetUrl(cfg.model));
      applyCharacterTextures(root, cfg);
      normalizeFbx(root);
      return root;
    } catch (err) {
      console.warn(`Soldat ${side} indisponible - fallback conserve`, err);
      return makeSoldierFallback(cfg.tint, cfg.emissive);
    }
  }

  async loadWeapon(url) {
    try {
      const gltf = await gltfLoader.loadAsync(assetUrl(url));
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(3.4 / Math.max(size.x, size.y, size.z));
      box.setFromObject(model);
      model.position.sub(box.getCenter(new THREE.Vector3()));
      return model;
    } catch (err) {
      console.warn(`Arme indisponible ${url}`, err);
      return null;
    }
  }

  refreshLoadedActors() {
    for (const actor of [this.playerActor, ...this.soldiers, ...this.enemySoldiers]) {
      if (!actor) continue;
      this.swapActorModel(actor);
      actor.visible = this.active && actor.userData.alive;
    }
  }

  makeActor(side, index, enemy = false) {
    const actor = new THREE.Group();
    actor.userData = {
      side,
      enemy,
      index,
      alive: true,
      hp: enemy ? 3 : 4,
      fireCooldown: rand(0.6, 2.2),
      allyFireCooldown: enemy ? 0 : rand(0.02, 0.2),
      speed: enemy ? rand(6, 10) : rand(9, 14),
      phase: rand(0, Math.PI * 2),
      mixer: null,
      action: null,
      model: null,
      weapon: null,
      muzzle: null,
    };
    this.group.add(actor);
    this.swapActorModel(actor);
    actor.visible = this.assetsReady;
    return actor;
  }

  swapActorModel(actor) {
    const side = actor.userData.side;
    const base = this.characterBases[side];
    if (!base) {
      if (!actor.userData.model) {
        const cfg = side === 'hegemonie' ? HEGEMONY : CONFEDERATION;
        const fallback = makeSoldierFallback(cfg.tint, cfg.emissive);
        fallback.scale.setScalar(SOLDIER_SCALE);
        actor.add(fallback);
        actor.userData.model = fallback;
      }
      return;
    }

    if (actor.userData.model) actor.remove(actor.userData.model);
    actor.userData.muzzle = null;
    const model = base.isGroup ? SkeletonUtils.clone(base) : base.clone(true);
    actor.add(model);
    actor.userData.model = model;
    // Le modèle Hégémonie est exporté face à +Z alors que actor.lookAt() (dans
    // updateEnemy) oriente l'acteur en supposant un avant en -Z (convention
    // Three.js) : sans ce décalage, les ennemis tournaient le dos au joueur
    // qu'ils sont censés regarder.
    if (side === 'hegemonie') model.rotation.y = Math.PI;

    const mixer = new THREE.AnimationMixer(model);
    actor.userData.mixer = mixer;
    const idleClip = this.animationClips.idle;
    const walkClip = this.animationClips.walk;
    const runClip = this.animationClips.run;
    if (idleClip && walkClip) {
      // Perso joueur : bascule idle/marche/course selon la vitesse et le
      // boost réels (voir update()/setLocomotionState()), sinon l'anim de
      // marche tournait en boucle même à l'arrêt.
      const idleAction = mixer.clipAction(idleClip);
      const walkAction = mixer.clipAction(walkClip);
      idleAction.setLoop(THREE.LoopRepeat);
      walkAction.setLoop(THREE.LoopRepeat);
      idleAction.play();
      actor.userData.idleAction = idleAction;
      actor.userData.walkAction = walkAction;
      actor.userData.action = idleAction;
      actor.userData.animState = 'idle';
      if (runClip) {
        actor.userData.runAction = mixer.clipAction(runClip);
        actor.userData.runAction.setLoop(THREE.LoopRepeat);
      }
    } else {
      const clip = walkClip || idleClip;
      if (clip) {
        const action = mixer.clipAction(clip);
        action.play();
        actor.userData.action = action;
      }
    }

    const weaponBase = this.weaponBases[side];
    if (weaponBase) {
      const weapon = weaponBase.clone(true);
      weapon.rotation.set(0.2, Math.PI * 0.5, -0.12);
      weapon.position.set(0.22, -0.06, -0.34);
      actor.userData.muzzle = findNodeByName(weapon, 'Muzzle');
      const hand = findHand(model);
      if (hand) {
        hand.add(weapon);
      } else {
        weapon.position.set(0.48, 3.2, -0.82);
        actor.add(weapon);
      }
      actor.userData.weapon = weapon;
    }
  }

  start(shipZ) {
    this.active = true;
    this.complete = false;
    this.progress = 0;
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.cityHealth = this.cityMaxHealth;
    this.cityDestroyed = false;
    this.cityDestructionTimer = 0;
    this.cityDestructionBurstTimer = 0;
    this.capitalFullResolutionVisible = false;
    this.centerZ = shipZ - 240;
    this.group.visible = true;
    this.skyGroup.visible = true;
    this.ground.position.z = this.centerZ - ASSAULT_LENGTH / 2;
    this.path.position.z = this.centerZ - ASSAULT_LENGTH / 2;
    this.capital.position.set(0, 0, this.centerZ - ASSAULT_LENGTH + 420);
    this.capital.visible = true;
    this.capitalLOD.visible = true;
    this.cityWalkSurface.visible = true;
    for (const wp of this.cityWeakpoints) {
      wp.visible = true;
      wp.userData.hp = CITY_WEAKPOINT_HP;
      wp.userData.alive = true;
    }
    this.spawnLine = this.centerZ - 650;
    this.spawnActors(shipZ);
    this.setupPlayerActor(shipZ);
  }

  setupPlayerActor(shipZ) {
    if (!this.playerActor) {
      this.playerActor = this.makeActor('confederation', 1000, false);
    } else if (this.characterBases.confederation && this.playerActor.userData.model?.children?.length <= 3) {
      this.swapActorModel(this.playerActor);
    }
    this.playerActor.visible = true;
    this.playerActor.userData.alive = true;
    this.playerActor.position.set(0, FLOOR_Y + SOLDIER_FOOT_OFFSET, shipZ);
    this.playerActor.rotation.y = Math.PI;
    this.playerActor.visible = this.assetsReady;
  }

  spawnActors(shipZ) {
    while (this.soldiers.length < SOLDIER_COUNT) this.soldiers.push(this.makeActor('confederation', this.soldiers.length, false));
    while (this.enemySoldiers.length < ENEMY_COUNT) this.enemySoldiers.push(this.makeActor('hegemonie', this.enemySoldiers.length, true));

    for (const actor of this.soldiers) {
      const i = actor.userData.index;
      actor.visible = true;
      actor.userData.alive = true;
      actor.userData.hp = 4;
      const slot = getConfederationFormationSlot(i);
      actor.position.set(slot.x + rand(-3, 3), FLOOR_Y + SOLDIER_FOOT_OFFSET, shipZ + slot.z + rand(-6, 6));
      actor.rotation.y = rand(-0.08, 0.08);
      actor.visible = this.assetsReady;
      actor.userData.allyFireCooldown = rand(0.02, 0.18);
    }
    for (const actor of this.enemySoldiers) this.resetEnemy(actor, shipZ);
  }

  resetEnemy(actor, shipZ) {
    actor.visible = true;
    actor.userData.alive = true;
    actor.userData.hp = 3;
    const inCity = this.progress >= CITY_START_PROGRESS;
    const lane = inCity ? rand(-170, 170) : rand(-340, 340);
    const depth = inCity ? rand(260, 760) : rand(460, 1500) + Math.max(0, this.progress) * 1200;
    actor.position.set(lane, FLOOR_Y + SOLDIER_FOOT_OFFSET, shipZ - depth);
    actor.rotation.y = rand(-0.22, 0.22);
    actor.userData.fireCooldown = rand(0.6, 2.0);
    actor.visible = this.assetsReady;
  }

  update(dt, ship, pools, sound = null, { enemyAggressionMultiplier = 1, explosions = null } = {}) {
    if (!this.active || this.complete) return 0;
    this.time += dt;
    const shipZ = ship.group.position.z;
    this.progress = clamp01(Math.abs(shipZ - this.centerZ) / (ASSAULT_LENGTH + CAPITAL_ENTRY_DEPTH));

    this.ground.position.z = shipZ - ASSAULT_LENGTH / 2;
    this.path.position.z = shipZ - ASSAULT_LENGTH / 2;
    this.applyCityCollider(ship.group.position);

    for (const actor of this.soldiers) this.updateAlly(actor, dt, ship, pools, sound);
    if (this.playerActor) {
      const prevX = this.playerActor.position.x;
      const prevZ = this.playerActor.position.z;
      this.playerActor.position.set(ship.group.position.x, FLOOR_Y + SOLDIER_FOOT_OFFSET, ship.group.position.z);
      this.playerActor.rotation.y = ship.group.rotation.y;
      const speed = dt > 0 ? Math.hypot(this.playerActor.position.x - prevX, this.playerActor.position.z - prevZ) / dt : 0;
      if (this.playerActor.userData.idleAction && this.playerActor.userData.walkAction) {
        const moving = speed > 2;
        const running = moving && ship.boostAmount > 0 && this.playerActor.userData.runAction;
        this.setLocomotionState(this.playerActor, !moving ? 'idle' : running ? 'run' : 'walk');
      }
      this.playerActor.userData.mixer?.update(dt);
    }
    for (const actor of this.enemySoldiers) this.updateEnemy(actor, dt, ship, pools, sound, enemyAggressionMultiplier);

    this.capitalFullResolutionVisible = this.isCapitalFullResolutionVisible(this._lastCamera);
    for (const wp of this.cityWeakpoints) {
      if (!wp.userData.alive) continue;
      const pulse = 0.82 + Math.sin(this.time * 5.5 + wp.userData.phase) * 0.18;
      wp.scale.setScalar(pulse);
      wp.lookAt(ship.group.position.x, wp.position.y, ship.group.position.z);
    }
    if (!this.cityDestroyed && this.cityHealth <= 0) this.destroyCapital(explosions, sound);
    if (this.cityDestroyed) this.updateCapitalDestruction(dt, explosions);

    if (this.cityDestroyed && this.cityDestructionTimer <= 0) {
      this.complete = true;
      this.active = false;
      this.skyGroup.visible = false;
      return 4200 + this.score;
    }
    const awarded = this.score;
    this.score = 0;
    return awarded;
  }

  // Fondu croisé idle/marche/course : maintenant que la marche boucle
  // proprement (voir makeLoopableWalk), un fondu symétrique dans les deux
  // sens est fluide (l'ancien "arrêt net" ne servait qu'à éviter de traîner
  // sur la pose d'arrêt figée du clip d'origine, plus un problème ici).
  setLocomotionState(actor, state) {
    const ud = actor.userData;
    if (ud.animState === state) return;
    const actions = { idle: ud.idleAction, walk: ud.walkAction, run: ud.runAction };
    const next = actions[state];
    if (!next) return;
    const prev = actions[ud.animState];
    ud.animState = state;
    next.reset().fadeIn(0.2).play();
    if (prev && prev !== next) prev.fadeOut(0.2);
    ud.action = next;
  }

  updateAlly(actor, dt, ship, pools, sound) {
    if (!actor.visible || !actor.userData.alive) return;
    const prevX = actor.position.x;
    const prevZ = actor.position.z;
    const slot = getConfederationFormationSlot(actor.userData.index);
    const yaw = ship.group.rotation.y;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const targetX = ship.group.position.x + rightX * slot.x + forwardX * slot.z;
    const targetZ = ship.group.position.z + rightZ * slot.x + forwardZ * slot.z;
    const formationSnap = ship.boostAmount > 0 ? 3.8 : 2.6;
    const formationCatchup = ship.boostAmount > 0 ? 3.4 : 2.2;
    actor.position.x += (targetX - actor.position.x) * (1 - Math.exp(-formationSnap * dt));
    actor.position.z += (targetZ - actor.position.z) * (1 - Math.exp(-formationCatchup * dt));
    actor.position.x += Math.sin(this.time * 1.2 + actor.userData.phase) * dt * 2.0;
    actor.rotation.y = yaw + Math.sin(this.time * 0.8 + actor.userData.phase) * 0.08;
    const speed = dt > 0 ? Math.hypot(actor.position.x - prevX, actor.position.z - prevZ) / dt : 0;
    if (actor.userData.idleAction && actor.userData.walkAction) {
      const running = speed > 1.2 && ship.boostAmount > 0 && actor.userData.runAction;
      this.setLocomotionState(actor, speed > 1.2 ? running ? 'run' : 'walk' : 'idle');
    }
    this.updateAllyFire(actor, dt, pools, sound);
    actor.userData.mixer?.update(dt);
  }

  updateAllyFire(actor, dt, pools, sound) {
    if (!pools?.allied) return;
    actor.userData.allyFireCooldown -= dt;
    if (actor.userData.allyFireCooldown > 0) return;
    const target = this.findAllyTarget(actor);
    actor.userData.allyFireCooldown = rand(ALLY_FIRE_INTERVAL_MIN, ALLY_FIRE_INTERVAL_MAX);
    if (!target) return;
    const origin = new THREE.Vector3();
    if (actor.userData.muzzle) actor.userData.muzzle.getWorldPosition(origin);
    else origin.copy(actor.position).add(new THREE.Vector3(0, 4.2, 0));
    const spread = new THREE.Vector3(rand(-0.9, 0.9), rand(-0.35, 0.5), rand(-0.9, 0.9));
    const dir = target.add(spread).sub(origin).normalize();
    pools.allied.fire(origin, dir, rand(340, 520), 0.95, 1);
  }

  findAllyTarget(actor) {
    let best = null;
    let bestDist = ALLY_TARGET_RANGE * ALLY_TARGET_RANGE;
    for (const enemy of this.enemySoldiers) {
      if (!enemy.visible || !enemy.userData.alive) continue;
      const dz = enemy.position.z - actor.position.z;
      if (dz > 180 || dz < -ALLY_TARGET_RANGE) continue;
      const dist = actor.position.distanceToSquared(enemy.position);
      if (dist >= bestDist) continue;
      bestDist = dist;
      best = enemy.position.clone().add(new THREE.Vector3(0, 4.5, 0));
    }
    if (best) return best;
    if (!this.capitalFullResolutionVisible || this.cityDestroyed) return null;
    for (const wp of this.cityWeakpoints) {
      if (!wp.userData.alive) continue;
      wp.getWorldPosition(this._tmpWorld);
      const dist = actor.position.distanceToSquared(this._tmpWorld);
      if (dist >= bestDist) continue;
      bestDist = dist;
      best = this._tmpWorld.clone();
    }
    return best;
  }

  updateEnemy(actor, dt, ship, pools, sound, aggression) {
    if (!actor.visible || !actor.userData.alive) return;
    const prevX = actor.position.x;
    const prevZ = actor.position.z;
    const speed = actor.userData.speed * Math.max(0.65, aggression);
    actor.position.z += speed * dt;
    actor.position.x += Math.sin(this.time * 1.6 + actor.userData.phase) * dt * 4.5;
    actor.lookAt(ship.group.position.x, FLOOR_Y + PLAYER_HEIGHT * 0.35, ship.group.position.z);
    const moveSpeed = dt > 0 ? Math.hypot(actor.position.x - prevX, actor.position.z - prevZ) / dt : 0;
    if (actor.userData.idleAction && actor.userData.walkAction) {
      this.setLocomotionState(actor, moveSpeed > 1.2 ? 'walk' : 'idle');
    }
    actor.userData.mixer?.update(dt);

    actor.userData.fireCooldown -= dt * Math.max(0.65, aggression);
    if (actor.userData.fireCooldown <= 0 && pools?.heavy) {
      const origin = new THREE.Vector3();
      if (actor.userData.muzzle) actor.userData.muzzle.getWorldPosition(origin);
      else origin.copy(actor.position).add(new THREE.Vector3(0, 4.5, 0));
      const dir = ship.group.position.clone().add(new THREE.Vector3(0, -2, 0)).sub(origin).normalize();
      pools.heavy.fire(origin, dir, 155, 1.8, 8);
      actor.userData.fireCooldown = rand(1.3, 3.2);
      sound?.enemyLaser?.();
    }

    if (actor.position.z > ship.group.position.z + 140 || actor.position.distanceToSquared(ship.group.position) > 2600 ** 2) {
      this.resetEnemy(actor, ship.group.position.z);
    }
  }

  applyCityCollider(position) {
    const localX = position.x - this.capital.position.x;
    const localZ = position.z - this.capital.position.z;
    if (localZ < -190 || localZ > 560 || Math.abs(localX) > 430) return;
    for (const box of CITY_COLLIDERS) {
      const dx = localX - box.x;
      const dz = localZ - box.z;
      const halfW = box.w * 0.5 + 8;
      const halfD = box.d * 0.5 + 8;
      if (Math.abs(dx) > halfW || Math.abs(dz) > halfD) continue;
      const pushX = halfW - Math.abs(dx);
      const pushZ = halfD - Math.abs(dz);
      if (pushX < pushZ) {
        position.x += Math.sign(dx || 1) * pushX;
      } else {
        position.z += Math.sign(dz || 1) * pushZ;
      }
      break;
    }
  }

  handleLaser(laser, explosions = null, sound = null) {
    for (const actor of this.enemySoldiers) {
      if (!actor.visible || !actor.userData.alive) continue;
      const dz = Math.abs(laser.position.z - actor.position.z);
      if (dz > 8) continue;
      const dx = laser.position.x - actor.position.x;
      const dy = laser.position.y - (actor.position.y + 4);
      if (dx * dx + dy * dy > 70) continue;
      actor.userData.hp -= laser.userData.damage ?? 1;
      sound?.armorHit?.(actor.position);
      if (actor.userData.hp <= 0) {
        actor.userData.alive = false;
        actor.visible = false;
        explosions?.spawn(actor.position.clone().add(new THREE.Vector3(0, 4, 0)), { scale: 4 });
        this.kills += 1;
        this.score += 80;
      }
      return { hit: true, score: 0 };
    }
    const cityResult = this.handleCityLaser(laser, explosions, sound);
    if (cityResult.hit) return cityResult;
    return { hit: false, score: 0 };
  }

  handleCityLaser(laser, explosions = null, sound = null) {
    if (this.cityDestroyed || !this.capitalFullResolutionVisible) return { hit: false, score: 0 };
    for (const wp of this.cityWeakpoints) {
      if (!wp.userData.alive) continue;
      wp.getWorldPosition(this._tmpWorld);
      if (laser.position.distanceToSquared(this._tmpWorld) > CITY_WEAKPOINT_RADIUS * CITY_WEAKPOINT_RADIUS) continue;
      const damage = Math.max(1, laser.userData.damage || 1);
      wp.userData.hp -= damage;
      this.cityHealth = Math.max(0, this.cityHealth - damage);
      sound?.armorHit?.(this._tmpWorld);
      if (wp.userData.hp <= 0) {
        wp.userData.alive = false;
        wp.visible = false;
        explosions?.spawn(this._tmpWorld, { scale: 12, color: 0xff1808, spriteColor: 0xff2a08 });
      }
      if (this.cityHealth <= 0) {
        this.destroyCapital(explosions, sound);
        return { hit: true, score: 2400 };
      }
      return { hit: true, score: 120 };
    }
    return { hit: false, score: 0 };
  }

  destroyCapital(explosions = null, sound = null) {
    if (this.cityDestroyed) return;
    this.cityDestroyed = true;
    this.cityDestructionTimer = CITY_DESTRUCTION_DURATION;
    this.cityDestructionBurstTimer = 0;
    sound?.explosion?.('large', this.capital.position);
    this.spawnCapitalExplosionWave(explosions, 18);
    for (const wp of this.cityWeakpoints) wp.visible = false;
  }

  spawnCapitalExplosionWave(explosions = null, count = 8) {
    if (!explosions) return;
    const origin = this.capital.position;
    for (let i = 0; i < count; i++) {
      const x = rand(-330, 330);
      const y = rand(18, 165);
      const z = rand(-20, 360);
      explosions?.spawn(
        new THREE.Vector3(origin.x + x, FLOOR_Y + y, origin.z + z),
        { scale: rand(26, 58), color: Math.random() > 0.5 ? 0xff1208 : 0x050303, spriteColor: 0xff1808 }
      );
    }
  }

  updateCapitalDestruction(dt, explosions = null) {
    if (this.cityDestructionTimer <= 0) return;
    this.cityDestructionTimer = Math.max(0, this.cityDestructionTimer - dt);
    this.cityDestructionBurstTimer -= dt;
    if (this.cityDestructionBurstTimer <= 0) {
      this.cityDestructionBurstTimer = 0.16;
      this.spawnCapitalExplosionWave(explosions, 5);
    }
    if (this.cityDestructionTimer <= 0) {
      this.capitalLOD.visible = false;
      this.cityWalkSurface.visible = false;
    }
  }

  playPlayerDeath() {
    const actor = this.playerActor;
    if (!actor) return;
    actor.visible = true;
    actor.userData.alive = false;
    const mixer = actor.userData.mixer;
    // Un peu de variété visuelle : alterne entre les deux animations de mort
    // dispo quand les deux sont chargées.
    const clip = this.animationClips.deathAlt && Math.random() < 0.5
      ? this.animationClips.deathAlt
      : this.animationClips.death;
    if (mixer && clip) {
      if (actor.userData.action) actor.userData.action.fadeOut(0.12);
      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.08).play();
      actor.userData.action = action;
    } else {
      actor.rotation.x = -Math.PI * 0.5;
    }
  }

  syncSky(camera, dt) {
    if (camera) {
      this._lastCamera = camera;
      this.capitalLOD.update(camera);
    }
    if (!this.skyGroup.visible || !camera) return;
    this.skyGroup.position.copy(camera.position);
    if (this.starSurface) this.starSurface.rotation.y += dt * 0.015;
    if (this.dustVeils) {
      for (let i = 0; i < this.dustVeils.length; i++) {
        const veil = this.dustVeils[i];
        veil.position.x += Math.sin(this.time * 0.25 + i * 0.7) * dt * 12;
        veil.material.opacity = 0.045 + 0.05 * (0.5 + 0.5 * Math.sin(this.time * 0.32 + i));
      }
    }
  }

  getProgress() {
    if (this.progress >= CITY_START_PROGRESS || this.capitalFullResolutionVisible) {
      return this.cityMaxHealth > 0 ? 1 - this.cityHealth / this.cityMaxHealth : 1;
    }
    return this.progress;
  }

  getStatusLabel() {
    if (this.complete) return 'CAPITALE PRISE';
    const phase = this.progress >= CITY_START_PROGRESS ? 'VILLE' : 'PLAINE';
    if (this.progress >= CITY_START_PROGRESS || this.capitalFullResolutionVisible) {
      return this.cityDestroyed ? 'VILLE CAPITALE DETRUITE' : `VILLE ${this.cityHealth}/${this.cityMaxHealth}`;
    }
    if (this.kills >= ENEMY_KILL_TARGET && this.capitalFullResolutionVisible) {
      return `${phase} CAPITALE EN VUE`;
    }
    if (this.kills >= ENEMY_KILL_TARGET) {
      return `${phase} APPROCHE CAPITALE`;
    }
    return `${phase} ${this.kills}/${ENEMY_KILL_TARGET}`;
  }

  isCapitalFullResolutionVisible(camera) {
    if (!camera || !this.capitalLOD || !this.capitalFullModel) return false;
    this.capitalLOD.updateMatrixWorld(true);
    this.capitalLOD.getWorldPosition(this._capitalWorldPosition);
    const distance = camera.position.distanceTo(this._capitalWorldPosition);
    return this.capitalLOD.getObjectForDistance(distance) === this.capitalFullModel;
  }

  getPlayerPosition(out = new THREE.Vector3()) {
    if (this.playerActor) return out.copy(this.playerActor.position);
    return out.set(0, FLOOR_Y, this.centerZ);
  }
}

export const GROUND_ASSAULT_FLOOR_Y = FLOOR_Y;
