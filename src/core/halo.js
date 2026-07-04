import * as THREE from 'three';

// Texture de halo radial (dégradé doux vers transparent), générée une fois par couleur
const cache = new Map();

export function makeHaloTexture(color) {
  if (cache.has(color)) return cache.get(color);
  const c = new THREE.Color(color);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(color, tex);
  return tex;
}

export function makeHaloSprite({ color, size, opacity = 0.9 }) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeHaloTexture(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity,
    })
  );
  sprite.scale.setScalar(size);
  return sprite;
}
