import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

/**
 * Charge un GLB Rodin et le normalise : centré sur l'origine, mis à l'échelle
 * (`length` = plus grande dimension en unités monde), orienté via `rotationY`
 * (convention : le nez du modèle doit pointer vers -Z après rotation).
 * Rodin exporte souvent l'émissif à part : `emissiveUrl` l'applique au matériau.
 */
export function loadShipModel({ url, emissiveUrl = null, length = 8, rotationY = 0 }) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = rotationY;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.scale.setScalar(length / Math.max(size.x, size.y, size.z));
        box.setFromObject(model);
        model.position.sub(box.getCenter(new THREE.Vector3()));

        if (emissiveUrl) {
          const emissive = texLoader.load(emissiveUrl);
          emissive.flipY = false; // les UV glTF ne sont pas retournés
          emissive.colorSpace = THREE.SRGBColorSpace;
          model.traverse((o) => {
            if (o.isMesh) {
              o.material.emissiveMap = emissive;
              o.material.emissive.set(0xffffff);
              o.material.needsUpdate = true;
            }
          });
        }

        resolve(model);
      },
      undefined,
      reject
    );
  });
}
