import * as THREE from 'three';

const COUNT = 2200;
const DEPTH = 1400;

export class Starfield {
  constructor(scene) {
    this.positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 1000;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * 1000;
      this.positions[i * 3 + 2] = -Math.random() * DEPTH + 60;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // Recycle les étoiles passées derrière la caméra vers l'avant
  update(camera) {
    const camZ = camera.position.z;
    const pos = this.positions;
    let dirty = false;
    for (let i = 2; i < COUNT * 3; i += 3) {
      if (pos[i] > camZ + 60) {
        pos[i] -= DEPTH;
        dirty = true;
      }
    }
    if (dirty) this.geo.attributes.position.needsUpdate = true;
  }
}
