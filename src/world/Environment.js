import * as THREE from 'three';
import { Planet } from './Planet.js';
import { Star } from './Star.js';
import { STARS, PLANETS, SYSTEMS } from './celestial-catalog.js';

export class Environment {
  constructor(scene, camera, { systemId = 'kharos_binary' } = {}) {
    const sys = SYSTEMS[systemId];

    scene.add(new THREE.HemisphereLight(0x93a7ff, 0x1a0f2e, 0.5));

    // La planète principale (index 0) sert de cible pour orienter les lumières
    const mainPlanetPos = new THREE.Vector3().fromArray(sys.planets[0].position);

    // Chaque étoile du système éclaire la scène de sa couleur, depuis son axe.
    // Astres ajoutés à la scène (pas à la caméra) : ils ne doivent suivre que
    // la POSITION de la caméra pour rester à l'horizon, jamais sa rotation —
    // sinon ils "dansent" chaque fois que la caméra s'oriente pour suivre le
    // vaisseau (lookAt en updateCamera). Le décalage d'origine est conservé
    // dans baseOffset et réappliqué à la position caméra à chaque frame.
    this.stars = [];
    for (const cfg of sys.stars) {
      const def = STARS[cfg.id];
      const star = new Star(def);
      star.baseOffset = new THREE.Vector3().fromArray(cfg.position);
      scene.add(star.group);
      this.stars.push(star);

      const light = new THREE.DirectionalLight(
        def.lightColor,
        cfg.lightIntensity ?? def.lightIntensity
      );
      light.position
        .fromArray(cfg.position)
        .sub(mainPlanetPos)
        .normalize()
        .multiplyScalar(100);
      scene.add(light);
    }

    this.planets = [];
    for (const cfg of sys.planets) {
      const def = PLANETS[cfg.id];
      const planet = new Planet(def);
      planet.baseOffset = new THREE.Vector3().fromArray(cfg.position);
      planet.orbit = cfg.orbit || null;
      planet.orbitAngle = Math.random() * Math.PI * 2;
      scene.add(planet.group);
      this.planets.push(planet);
    }
  }

  update(dt, camera) {
    for (const star of this.stars) {
      star.group.position.copy(camera.position).add(star.baseOffset);
      star.update(dt);
    }

    // Première passe : positionne tout ce qui suit directement la caméra
    // (les planètes en orbite seront recalées ensuite par rapport à leur
    // centre, lui-même déjà repositionné ici).
    for (const planet of this.planets) {
      if (!planet.orbit) planet.group.position.copy(camera.position).add(planet.baseOffset);
      planet.update(dt);
    }

    for (const planet of this.planets) {
      if (!planet.orbit) continue;
      // Orbite autour d'un autre corps du système (ex. lune de Kharos-3)
      const o = planet.orbit;
      planet.orbitAngle += o.speed * dt;
      const center = this.planets[o.around].group.position;
      planet.group.position.set(
        center.x + Math.cos(planet.orbitAngle) * o.radius,
        center.y + Math.sin(planet.orbitAngle) * o.radius * (o.tilt ?? 0.25),
        center.z + Math.sin(planet.orbitAngle) * o.radius * 0.6
      );
    }
  }
}
