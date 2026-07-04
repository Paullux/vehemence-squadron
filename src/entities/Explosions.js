import * as THREE from 'three';

const COUNT = 60;
const LIFETIME = 0.9;

class Explosion {
  constructor(scene) {
    this.positions = new Float32Array(COUNT * 3);
    this.velocities = new Float32Array(COUNT * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0xffa040,
      size: 1.1,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.visible = false;
    this.points.frustumCulled = false;
    this.life = 0;
    scene.add(this.points);
  }

  spawn(pos) {
    const v = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = pos.x;
      this.positions[i * 3 + 1] = pos.y;
      this.positions[i * 3 + 2] = pos.z;
      v.randomDirection().multiplyScalar(6 + Math.random() * 26);
      this.velocities[i * 3] = v.x;
      this.velocities[i * 3 + 1] = v.y;
      this.velocities[i * 3 + 2] = v.z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.life = LIFETIME;
    this.mat.opacity = 1;
    this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.points.visible = false;
      return;
    }
    const damp = Math.max(0, 1 - dt * 1.4);
    for (let i = 0; i < COUNT * 3; i++) {
      this.velocities[i] *= damp;
      this.positions[i] += this.velocities[i] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.opacity = this.life / LIFETIME;
  }
}

export class ExplosionPool {
  constructor(scene) {
    this.items = Array.from({ length: 6 }, () => new Explosion(scene));
  }

  spawn(pos) {
    const e = this.items.find((x) => !x.points.visible) || this.items[0];
    e.spawn(pos);
  }

  update(dt) {
    for (const e of this.items) e.update(dt);
  }
}
