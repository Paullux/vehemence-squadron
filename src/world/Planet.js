import * as THREE from 'three';
import { assetUrl } from '../core/assetUrl.js';

const loader = new THREE.TextureLoader();

function loadColorTexture(url) {
  const t = loader.load(assetUrl(url));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Planète texturable avec le pack standard généré par ChatGPT :
 *   textures: {
 *     albedo:    '/textures/planets/<nom>/albedo.png',    // couleur (équirectangulaire 2:1)
 *     clouds:    '/textures/planets/<nom>/clouds.png',    // nuages avec alpha
 *     normal:    '/textures/planets/<nom>/normal.png',    // relief
 *     roughness: '/textures/planets/<nom>/roughness.png', // brillance
 *     emission:  '/textures/planets/<nom>/emission.png',  // lave / villes lumineuses
 *   }
 * Toutes optionnelles — sans albedo, la planète utilise `color` en uni.
 */
export class Planet {
  constructor({ radius = 260, color = 0x4a6a8a, atmosphereColor = 0x6fb1ff, spinSpeed = 0.004, textures = {} } = {}) {
    this.group = new THREE.Group();
    this.spinSpeed = spinSpeed;

    const mat = new THREE.MeshStandardMaterial({
      color: textures.albedo ? 0xffffff : color,
      roughness: 0.9,
      metalness: 0,
    });
    if (textures.albedo) mat.map = loadColorTexture(textures.albedo);
    if (textures.normal) mat.normalMap = loader.load(assetUrl(textures.normal));
    if (textures.roughness) {
      mat.roughnessMap = loader.load(assetUrl(textures.roughness));
      mat.roughness = 1;
    }
    if (textures.emission) {
      mat.emissiveMap = loadColorTexture(textures.emission);
      mat.emissive = new THREE.Color(0xffffff);
    }

    this.surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
    this.group.add(this.surface);

    if (textures.clouds) {
      this.clouds = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.015, 64, 48),
        new THREE.MeshStandardMaterial({
          map: loadColorTexture(textures.clouds),
          transparent: true,
          depthWrite: false,
          roughness: 1,
        })
      );
      this.group.add(this.clouds);
    }

    if (atmosphereColor) {
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.03, 48, 32),
        new THREE.MeshBasicMaterial({
          color: atmosphereColor,
          transparent: true,
          opacity: 0.12,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.group.add(atmosphere);
    }
  }

  update(dt) {
    this.surface.rotation.y += this.spinSpeed * dt;
    if (this.clouds) this.clouds.rotation.y += this.spinSpeed * 1.6 * dt;
  }
}
