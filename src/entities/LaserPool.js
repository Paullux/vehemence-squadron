import * as THREE from 'three';

const _target = new THREE.Vector3();

export class LaserPool {
  constructor(scene, { size = 48, color = 0x66ff55, radius = 0.09, length = 4.5 } = {}) {
    const geo = new THREE.CylinderGeometry(radius, radius, length, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pool = [];
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.userData = { life: 0, vel: new THREE.Vector3() };
      scene.add(m);
      this.pool.push(m);
    }
  }

  fire(origin, dir, speed, life = 1.4, damage = 0) {
    const m = this.pool.find((l) => !l.visible);
    if (!m) return;
    m.position.copy(origin);
    m.userData.vel.copy(dir).normalize().multiplyScalar(speed);
    _target.copy(origin).add(m.userData.vel);
    m.lookAt(_target);
    m.userData.life = life;
    m.userData.damage = damage;
    m.visible = true;
  }

  update(dt) {
    for (const m of this.pool) {
      if (!m.visible) continue;
      m.position.addScaledVector(m.userData.vel, dt);
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false;
    }
  }

  forEachActive(cb) {
    for (const m of this.pool) if (m.visible) cb(m);
  }

  release(m) {
    m.visible = false;
  }
}
