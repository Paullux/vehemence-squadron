import * as THREE from 'three';
import { loadShipModel } from '../core/ShipModel.js';
import { makeHaloSprite } from '../core/halo.js';

const BOUND_X = 16;
const BOUND_Y = 9;
const BASE_SPEED = 60;
const BOOST_SPEED = 130;
const MAX_LATERAL = 30;

// Modèle Rodin du chasseur Aquila — partagé par le joueur et ses ailiers PNJ.
// Rodin exporte l'émissif à part. Ce GLB sort nez vers +Z (vérifié contre
// references/rear.png : les 3 réacteurs cyan doivent être à l'arrière) → demi-tour.
export const HERO_MODEL = {
  url: '/space_ships/heroes/aquila_fighter/base_basic_pbr.glb',
  emissiveUrl: '/space_ships/heroes/aquila_fighter/texture_emissive.png',
  length: 9,
  rotationY: Math.PI,
};
// Origines des tirs et position de la lueur moteur, adaptées à ce modèle
const PLAYER_MODEL_GUNS = [
  [-3.3, -0.2, -1.5],
  [3.3, -0.2, -1.5],
];
const PLAYER_MODEL_ENGINE_Z = 4.3;

export class PlayerShip {
  constructor(scene) {
    // group = position dans le monde, mesh = orientation visuelle (roulis/tangage)
    this.group = new THREE.Group();
    this.mesh = new THREE.Group();
    this.group.add(this.mesh);

    this.velocity = new THREE.Vector2();
    this.forwardSpeed = BASE_SPEED;
    this.boostAmount = 0;
    this.gunIndex = 0;

    this.buildMesh();
    this.loadModel();

    // Halo cyan discret, placé côté nez (à l'opposé de la caméra) : le vaisseau
    // se découpe à contre-jour dessus sans être masqué.
    this.halo = makeHaloSprite({ color: 0x44ddff, size: 12, opacity: 0.22 });
    this.halo.position.z = -5;
    this.group.add(this.halo);

    scene.add(this.group);
  }

  // Remplace la coque placeholder par le modèle Rodin normalisé.
  loadModel() {
    loadShipModel(HERO_MODEL)
      .then((model) => {
        this.mesh.remove(this.hull);
        this.mesh.add(model);
        this.hull = model;
        this.gunOffsets = PLAYER_MODEL_GUNS.map((a) => new THREE.Vector3(...a));
        this.engineGlow.position.z = PLAYER_MODEL_ENGINE_Z;
      })
      .catch((err) => console.error('Chargement du modèle héros impossible — placeholder conservé', err));
  }

  buildMesh() {
    const hull = new THREE.MeshStandardMaterial({ color: 0xb8c4d4, metalness: 0.55, roughness: 0.38, flatShading: true });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2b6fd4, metalness: 0.5, roughness: 0.35, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x232a33, metalness: 0.6, roughness: 0.5 });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0, 5.5, 8), hull);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -2.2;

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 4.4), hull);
    body.position.z = 1.6;

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x66ccff, metalness: 0.1, roughness: 0.05, emissive: 0x113355 })
    );
    cockpit.scale.set(0.9, 0.62, 1.5);
    cockpit.position.set(0, 0.75, 0.4);

    // Ailes en dièdre inversé (style Arwing)
    const wingGeo = new THREE.BoxGeometry(4.2, 0.16, 2.4);
    const wingL = new THREE.Mesh(wingGeo, accent);
    wingL.position.set(-2.8, -0.15, 1.8);
    wingL.rotation.z = 0.38;
    const wingR = new THREE.Mesh(wingGeo, accent);
    wingR.position.set(2.8, -0.15, 1.8);
    wingR.rotation.z = -0.38;

    const podGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.6, 8);
    podGeo.rotateX(Math.PI / 2);
    const podL = new THREE.Mesh(podGeo, dark);
    podL.position.set(-4.5, -0.85, 1.0);
    const podR = new THREE.Mesh(podGeo, dark);
    podR.position.set(4.5, -0.85, 1.0);

    const finGeo = new THREE.BoxGeometry(0.14, 1.5, 1.9);
    const finL = new THREE.Mesh(finGeo, accent);
    finL.position.set(-4.5, 0.0, 1.9);
    const finR = new THREE.Mesh(finGeo, accent);
    finR.position.set(4.5, 0.0, 1.9);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x66eaff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.set(0, 0, 3.85);
    this.engineGlow = glow;

    const engineLight = new THREE.PointLight(0x55ddff, 30, 20, 1.8);
    engineLight.position.set(0, 0, 4.5);

    // La coque est isolée dans son propre groupe : le modèle Rodin la remplace,
    // la lueur moteur et les canons restent en place.
    this.hull = new THREE.Group();
    this.hull.add(nose, body, cockpit, wingL, wingR, podL, podR, finL, finR);
    this.mesh.add(this.hull, glow, engineLight);

    this.gunOffsets = [
      new THREE.Vector3(-4.5, -0.85, -1.4),
      new THREE.Vector3(4.5, -0.85, -1.4),
    ];
  }

  update(dt, input) {
    const k = 1 - Math.exp(-8 * dt);
    this.velocity.x += (input.moveX * MAX_LATERAL - this.velocity.x) * k;
    this.velocity.y += (input.moveY * MAX_LATERAL - this.velocity.y) * k;

    const p = this.group.position;
    p.x = THREE.MathUtils.clamp(p.x + this.velocity.x * dt, -BOUND_X, BOUND_X);
    p.y = THREE.MathUtils.clamp(p.y + this.velocity.y * dt, -BOUND_Y, BOUND_Y);

    const targetSpeed = input.boost ? BOOST_SPEED : BASE_SPEED;
    this.forwardSpeed += (targetSpeed - this.forwardSpeed) * (1 - Math.exp(-3 * dt));
    this.boostAmount = (this.forwardSpeed - BASE_SPEED) / (BOOST_SPEED - BASE_SPEED);
    p.z -= this.forwardSpeed * dt;

    // Inclinaison visuelle : roulis marqué, tangage et lacet légers
    const nx = this.velocity.x / MAX_LATERAL;
    const ny = this.velocity.y / MAX_LATERAL;
    this.mesh.rotation.z = -nx * 0.85;
    this.mesh.rotation.x = ny * 0.35;
    this.mesh.rotation.y = -nx * 0.22;

    const flicker = 1 + this.boostAmount * 0.8 + Math.sin(performance.now() * 0.02) * 0.06;
    this.engineGlow.scale.setScalar(flicker);

    // Le halo s'intensifie avec le boost
    this.halo.material.opacity = 0.22 + this.boostAmount * 0.15;
    this.halo.scale.setScalar(12 * (1 + this.boostAmount * 0.4));
  }

  nextGunPosition(out) {
    this.gunIndex = 1 - this.gunIndex;
    out.copy(this.gunOffsets[this.gunIndex]);
    return this.mesh.localToWorld(out);
  }
}
