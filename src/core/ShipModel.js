import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from './assetUrl.js';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const modelCache = new Map();

const modelKey = ({ url, emissiveUrl = null, length = 8, rotationY = 0 }) =>
  JSON.stringify({ url, emissiveUrl, length, rotationY });

async function loadBaseShipModel(def) {
  const { url, emissiveUrl = null, length = 8, rotationY = 0 } = def;
  const gltf = await gltfLoader.loadAsync(assetUrl(url));
  const model = gltf.scene;
  model.rotation.y = rotationY;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(length / Math.max(size.x, size.y, size.z));
  box.setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));

  if (emissiveUrl) {
    const emissive = await texLoader.loadAsync(assetUrl(emissiveUrl));
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

  return model;
}

function cloneShipModel(model) {
  return model.clone(true);
}

function getBaseShipModel(def) {
  const key = modelKey(def);
  if (!modelCache.has(key)) modelCache.set(key, loadBaseShipModel(def));
  return modelCache.get(key);
}

/**
 * Charge un GLB Rodin et le normalise : centré sur l'origine, mis à l'échelle
 * (`length` = plus grande dimension en unités monde), orienté via `rotationY`
 * (convention : le nez du modèle doit pointer vers -Z après rotation).
 * Rodin exporte souvent l'émissif à part : `emissiveUrl` l'applique au matériau.
 */
export function loadShipModel(def) {
  return getBaseShipModel(def).then(cloneShipModel);
}

export async function preloadShipModels(defs, onProgress = null) {
  let done = 0;
  const uniqueDefs = [...new Map(defs.map((def) => [modelKey(def), def])).values()];
  const tasks = uniqueDefs.map((def) =>
    getBaseShipModel(def)
      .catch((err) => {
        console.warn(`Préchargement du modèle impossible: ${def.url}`, err);
        return null;
      })
      .finally(() => {
        done += 1;
        onProgress?.(done / uniqueDefs.length);
      })
  );
  return Promise.all(tasks);
}
