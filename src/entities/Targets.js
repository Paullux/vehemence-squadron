import * as THREE from 'three';
import { loadShipModel } from '../core/ShipModel.js';
import { makeHaloSprite } from '../core/halo.js';

const rand = (a, b) => a + Math.random() * (b - a);

const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

// Flotte de l'Hégémonie : plus le vaisseau est gros, plus il encaisse et plus
// il tape fort. `rotationY` dépend de chaque export Rodin (vérifié visuellement
// contre les images de référence) : le nez doit pointer vers +Z, face au joueur.
export const ENEMY_TYPES = {
  basic_fighter: {
    url: '/space_ships/ennemies/basic_fighter/base_basic_pbr.glb',
    emissiveUrl: '/space_ships/ennemies/basic_fighter/texture_emissive.png',
    rotationY: 0,
    count: 6,
    length: 9,
    hp: 1,
    score: 50,
    ramDamage: 25,
    approachSpeed: 22,
    wobble: 0.3,
    halo: { color: 0xff2211, size: 11 },
    cadence: [2.2, 4],
    bolt: { pool: 'light', speed: 210, damage: 12 },
  },
  commander_artillery: {
    url: '/space_ships/ennemies/commander_artillery/base_basic_pbr.glb',
    emissiveUrl: '/space_ships/ennemies/commander_artillery/texture_emissive.png',
    rotationY: 0,
    count: 2,
    length: 14,
    hp: 3,
    score: 150,
    ramDamage: 40,
    approachSpeed: 14,
    wobble: 0.12,
    halo: { color: 0xbb44ff, size: 18 },
    cadence: [3, 5],
    bolt: { pool: 'heavy', speed: 175, damage: 20 },
  },
  general_destroyer: {
    url: '/space_ships/ennemies/general_destroyer/base_basic_pbr.glb',
    emissiveUrl: '/space_ships/ennemies/general_destroyer/texture_emissive.png',
    rotationY: 0,
    count: 1,
    length: 30,
    hp: 8,
    score: 500,
    ramDamage: 60,
    approachSpeed: 7,
    wobble: 0.04,
    halo: { color: 0xff6600, size: 40 },
    cadence: [3.5, 5.5],
    bolt: { pool: 'heavy', speed: 160, damage: 30 },
  },
};

export class Targets {
  constructor(scene) {
    this.enemies = [];
    this.rings = [];

    const droneGeo = new THREE.OctahedronGeometry(1);
    const droneMat = new THREE.MeshStandardMaterial({ color: 0xd23b3b, emissive: 0x5a1010, flatShading: true, metalness: 0.3, roughness: 0.5 });

    for (const [typeId, def] of Object.entries(ENEMY_TYPES)) {
      for (let i = 0; i < def.count; i++) {
        const enemy = new THREE.Group();
        const placeholder = new THREE.Mesh(droneGeo, droneMat);
        placeholder.scale.setScalar(def.length * 0.25);
        enemy.add(placeholder);
        // Halo derrière la queue : silhouette à contre-jour, couleur par type
        const halo = makeHaloSprite({ color: def.halo.color, size: def.halo.size, opacity: 0.45 });
        halo.position.z = -def.length * 0.55;
        enemy.add(halo);
        enemy.userData = {
          def,
          typeId,
          halo,
          alive: true,
          hasModel: false,
          hp: def.hp,
          time: rand(0, 10),
          drift: new THREE.Vector2(rand(-2, 2), rand(-1.5, 1.5)),
          fireCooldown: rand(...def.cadence),
          hitFlash: 0,
        };
        this.placeEnemyAhead(enemy, 0, true);
        scene.add(enemy);
        this.enemies.push(enemy);
      }

      loadShipModel(def)
        .then((model) => {
          for (const enemy of this.enemies) {
            if (enemy.userData.typeId !== typeId) continue;
            enemy.clear();
            enemy.add(model.clone(true));
            enemy.add(enemy.userData.halo); // le halo survit au swap de modèle
            enemy.rotation.set(0, 0, 0);
            enemy.userData.hasModel = true;
          }
        })
        .catch((err) => console.error(`Modèle ${typeId} indisponible — placeholder conservé`, err));
    }

    const ringGeo = new THREE.TorusGeometry(6, 0.35, 10, 28);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshStandardMaterial({ color: 0xe8b64a, emissive: 0x8a6316, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.3 })
      );
      m.userData = { passed: false, flash: 0 };
      m.position.set(rand(-10, 10), rand(-6, 6), -120 - i * 150);
      scene.add(m);
      this.rings.push(m);
    }
  }

  placeEnemyAhead(enemy, shipZ, initial = false) {
    const def = enemy.userData.def;
    enemy.position.set(rand(-24, 24), rand(-13, 13), shipZ - (initial ? rand(120, 700) : rand(350, 900)));
    enemy.userData.alive = true;
    enemy.userData.hp = def.hp;
    enemy.visible = true;
  }

  // Retourne les points marqués en traversant des anneaux cette frame.
  // `pools` = { light, heavy } : LaserPools ennemis selon le calibre.
  update(dt, ship, pools, canFire, sound = null) {
    const shipPos = ship.group.position;
    let ringScore = 0;

    for (const e of this.enemies) {
      const u = e.userData;
      const def = u.def;
      u.time += dt;
      u.halo.material.opacity = 0.38 + 0.12 * Math.sin(u.time * 3);
      if (u.hitFlash > 0) {
        // Coup encaissé : le halo flashe pour signaler que les PV descendent
        u.hitFlash = Math.max(0, u.hitFlash - dt);
        u.halo.material.opacity = 0.6 + u.hitFlash;
      }

      if (u.hasModel) {
        e.position.z += def.approachSpeed * dt;
        e.rotation.z = Math.sin(u.time * 1.6) * def.wobble;
        e.rotation.x = Math.sin(u.time * 0.9) * def.wobble * 0.3;
      } else {
        e.rotation.x += dt;
        e.rotation.y += 0.7 * dt;
      }
      e.position.x += u.drift.x * dt;
      e.position.y += u.drift.y * dt;

      // Tir : visée anticipée sur la trajectoire du héros + dispersion
      u.fireCooldown -= dt;
      if (canFire && u.alive && u.hasModel && u.fireCooldown <= 0) {
        const ahead = shipPos.z - e.position.z; // > 0 si l'ennemi est devant
        if (ahead > 80 && ahead < 600) {
          const bolt = def.bolt;
          const t = e.position.distanceTo(shipPos) / bolt.speed;
          _aim.set(
            shipPos.x + ship.velocity.x * t + rand(-5, 5),
            shipPos.y + ship.velocity.y * t + rand(-4, 4),
            shipPos.z - ship.forwardSpeed * t
          );
          _dir.subVectors(_aim, e.position);
          _origin.copy(e.position).addScaledVector(_dir.clone().normalize(), def.length * 0.5);
          pools[bolt.pool].fire(_origin, _dir, bolt.speed, 4.5, bolt.damage);
          sound?.enemyLaser(u.typeId, _origin);
          u.fireCooldown = rand(...def.cadence);
        }
      }

      if (!u.alive || e.position.z > shipPos.z + 30) {
        this.placeEnemyAhead(e, shipPos.z);
        u.fireCooldown = rand(...def.cadence);
      }
    }

    for (const r of this.rings) {
      if (r.userData.flash > 0) {
        r.userData.flash = Math.max(0, r.userData.flash - dt);
        r.scale.setScalar(1 + r.userData.flash * 0.8);
      }
      if (!r.userData.passed && shipPos.z <= r.position.z) {
        r.userData.passed = true;
        const dx = shipPos.x - r.position.x;
        const dy = shipPos.y - r.position.y;
        if (dx * dx + dy * dy < 36) {
          ringScore += 100;
          r.userData.flash = 0.5;
        }
      }
      if (shipPos.z < r.position.z - 80) {
        r.position.set(rand(-12, 12), rand(-7, 7), shipPos.z - rand(400, 800));
        r.userData.passed = false;
        r.scale.setScalar(1);
      }
    }

    return ringScore;
  }
}
