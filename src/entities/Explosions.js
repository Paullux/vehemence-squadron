import * as THREE from 'three';
import { assetUrl } from '../core/assetUrl.js';

const COUNT = 60;
const LIFETIME = 0.9;
const SPRITE_LIFETIME = 0.72;
const EXPLOSION_TEXTURE_PATHS = [
  '/textures/explosions/explosion_01.png',
  '/textures/explosions/explosion_02.png',
  '/textures/explosions/explosion_03.png',
];

const textureLoader = new THREE.TextureLoader();
const explosionTextures = EXPLOSION_TEXTURE_PATHS.map((path) => {
  const texture = textureLoader.load(assetUrl(path));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
});

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
    this.spriteMat = new THREE.SpriteMaterial({
      map: explosionTextures[0],
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(this.spriteMat);
    this.sprite.visible = false;
    this.sprite.frustumCulled = false;
    this.life = 0;
    this.spriteLife = 0;
    this.spriteBaseScale = 1;
    scene.add(this.points);
    scene.add(this.sprite);
  }

  spawn(pos, options = {}) {
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
    this.spriteLife = SPRITE_LIFETIME;
    this.spriteBaseScale = options.scale ?? (8 + Math.random() * 7);
    this.sprite.position.copy(pos);
    this.sprite.scale.setScalar(this.spriteBaseScale * 0.55);
    this.spriteMat.map = explosionTextures[Math.floor(Math.random() * explosionTextures.length)];
    this.spriteMat.rotation = Math.random() * Math.PI * 2;
    this.spriteMat.opacity = 0.95;
    this.spriteMat.needsUpdate = true;
    this.sprite.visible = true;
  }

  update(dt) {
    if (!this.points.visible && !this.sprite.visible) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.points.visible = false;
    } else {
      const damp = Math.max(0, 1 - dt * 1.4);
      for (let i = 0; i < COUNT * 3; i++) {
        this.velocities[i] *= damp;
        this.positions[i] += this.velocities[i] * dt;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.mat.opacity = this.life / LIFETIME;
    }

    this.spriteLife -= dt;
    if (this.spriteLife <= 0) {
      this.sprite.visible = false;
    } else {
      const progress = 1 - this.spriteLife / SPRITE_LIFETIME;
      const pulse = Math.sin(progress * Math.PI);
      const scale = this.spriteBaseScale * (0.65 + progress * 1.7);
      this.sprite.scale.setScalar(scale);
      this.spriteMat.opacity = Math.max(0, (1 - progress) * 0.82 + pulse * 0.18);
    }
  }
}

export class ExplosionPool {
  constructor(scene) {
    this.items = Array.from({ length: 10 }, () => new Explosion(scene));
  }

  spawn(pos, options) {
    const e = this.items.find((x) => !x.points.visible && !x.sprite.visible) || this.items[0];
    e.spawn(pos, options);
  }

  update(dt) {
    for (const e of this.items) e.update(dt);
  }
}
