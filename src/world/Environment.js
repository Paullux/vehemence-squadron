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

    // Chaque étoile du système éclaire la scène de sa couleur, depuis son axe
    this.stars = [];
    for (const cfg of sys.stars) {
      const def = STARS[cfg.id];
      const star = new Star(def);
      star.group.position.fromArray(cfg.position);
      camera.add(star.group);
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
      planet.group.position.fromArray(cfg.position);
      planet.orbit = cfg.orbit || null;
      planet.orbitAngle = Math.random() * Math.PI * 2;
      camera.add(planet.group);
      this.planets.push(planet);
    }
  }

  update(dt) {
    for (const star of this.stars) star.update(dt);
    for (const planet of this.planets) {
      planet.update(dt);
      if (planet.orbit) {
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
}
