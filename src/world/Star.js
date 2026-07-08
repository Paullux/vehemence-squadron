import * as THREE from 'three';
import { makeHaloTexture } from '../core/halo.js';
import { assetUrl } from '../core/assetUrl.js';

const loader = new THREE.TextureLoader();

function makeMatterRingTexture(color) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(color);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  ctx.scale(1, 0.28);

  const bands = [
    { r: 330, w: 7, a: 0.16 },
    { r: 365, w: 5, a: 0.32 },
    { r: 405, w: 8, a: 0.28 },
    { r: 452, w: 5, a: 0.22 },
  ];

  for (const band of bands) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${rgb}, ${band.a})`;
    ctx.lineWidth = band.w;
    ctx.ellipse(0, 0, band.r, band.r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 950; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 320 + Math.random() * 165;
    const lane = (Math.random() - 0.5) * 22;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r + lane;
    const bright = Math.random() ** 2;
    ctx.fillStyle = `rgba(${rgb}, ${0.08 + bright * 0.42})`;
    ctx.fillRect(x, y, 1 + bright * 2.2, 1 + bright * 2.2);
  }

  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Étoile : sphère auto-lumineuse (MeshBasicMaterial, ignorée par l'éclairage)
 * + halo additif en sprite. `pulse: true` fait respirer lentement la surface
 * et le halo — pour les étoiles en fin de vie.
 */
export class Star {
  constructor({
    radius = 230,
    texture,
    haloColor = 0xffcc55,
    coronaColor = null,
    coronaScale = 6,
    coronaOpacity = 0.28,
    ringColor = null,
    ringTilt = 1.1,
    ringRotation = 0,
    spinSpeed = 0.006,
    pulse = false,
  }) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.spinSpeed = spinSpeed;
    this.pulse = pulse;
    this.time = 0;
    this.coronaScale = coronaScale;
    this.coronaOpacity = coronaOpacity;
    this.ringBaseOpacity = 0.42;

    const map = loader.load(assetUrl(texture));
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

    if (coronaColor) {
      this.coronaMat = new THREE.SpriteMaterial({
        map: makeHaloTexture(coronaColor),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: coronaOpacity,
      });
      this.corona = new THREE.Sprite(this.coronaMat);
      this.corona.scale.setScalar(radius * coronaScale);
      this.corona.renderOrder = -1;
      this.group.add(this.corona);
    }

    if (ringColor) {
      this.ringGroup = this.buildMatterRingSurface(radius, ringColor);
      this.ringGroup.rotation.set(ringTilt, 0, ringRotation);
      this.group.add(this.ringGroup);
    }
  }

  buildMatterRingSurface(radius, color) {
    const group = new THREE.Group();
    const baseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const bands = [
      { inner: 1.18, outer: 1.28, opacity: 0.12 },
      { inner: 1.33, outer: 1.39, opacity: 0.28 },
      { inner: 1.46, outer: 1.57, opacity: 0.2 },
      { inner: 1.67, outer: 1.75, opacity: 0.16 },
      { inner: 1.9, outer: 1.98, opacity: 0.1 },
    ];

    this.ringBands = bands.map((band) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius * band.inner, radius * band.outer, 192, 1),
        baseMat.clone()
      );
      mesh.material.opacity = band.opacity;
      mesh.userData.baseOpacity = band.opacity;
      group.add(mesh);
      return mesh;
    });

    const dustCount = 900;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (1.18 + Math.random() * 0.85);
      const lane = (Math.random() - 0.5) * radius * 0.055;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.sin(a) * r;
      positions[i * 3 + 2] = lane;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ringDustMat = new THREE.PointsMaterial({
      color,
      size: Math.max(3, radius * 0.011),
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    this.ringDust = new THREE.Points(dustGeo, this.ringDustMat);
    group.add(this.ringDust);

    return group;
  }

  update(dt) {
    this.surface.rotation.y += this.spinSpeed * dt;
    if (this.pulse) {
      this.time += dt;
      const s = 0.5 + 0.5 * Math.sin(this.time * 0.9); // période ~7 s
      this.haloMat.opacity = 0.6 + s * 0.4;
      this.halo.scale.setScalar(this.radius * (4.2 + s * 0.8));
      if (this.corona) {
        this.coronaMat.opacity = this.coronaOpacity * (0.78 + s * 0.35);
        this.corona.scale.setScalar(this.radius * (this.coronaScale + s * 0.55));
      }
      if (this.ringGroup) {
        this.ringGroup.rotation.z += dt * 0.012;
        for (const band of this.ringBands) {
          band.material.opacity = band.userData.baseOpacity * (0.78 + s * 0.25);
        }
        this.ringDustMat.opacity = 0.34 + s * 0.2;
      }
      this.surfaceMat.color.setScalar(0.82 + s * 0.18);
    }
  }
}
