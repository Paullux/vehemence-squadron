import * as THREE from 'three';
import { makeHaloTexture } from '../core/halo.js';

const loader = new THREE.TextureLoader();

/**
 * Étoile : sphère auto-lumineuse (MeshBasicMaterial, ignorée par l'éclairage)
 * + halo additif en sprite. `pulse: true` fait respirer lentement la surface
 * et le halo — pour les étoiles en fin de vie.
 */
export class Star {
  constructor({ radius = 230, texture, haloColor = 0xffcc55, spinSpeed = 0.006, pulse = false }) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.spinSpeed = spinSpeed;
    this.pulse = pulse;
    this.time = 0;

    const map = loader.load(texture);
    map.colorSpace = THREE.SRGBColorSpace;
    this.surfaceMat = new THREE.MeshBasicMaterial({ map });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.surfaceMat);
    this.group.add(this.surface);

    this.haloMat = new THREE.SpriteMaterial({
      map: makeHaloTexture(haloColor),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(radius * 4.5);
    this.group.add(this.halo);
  }

  update(dt) {
    this.surface.rotation.y += this.spinSpeed * dt;
    if (this.pulse) {
      this.time += dt;
      const s = 0.5 + 0.5 * Math.sin(this.time * 0.9); // période ~7 s
      this.haloMat.opacity = 0.6 + s * 0.4;
      this.halo.scale.setScalar(this.radius * (4.2 + s * 0.8));
      this.surfaceMat.color.setScalar(0.82 + s * 0.18);
    }
  }
}
