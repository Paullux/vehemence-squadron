// Catalogue des corps célestes disponibles (textures dans public/textures/).
// position = offset caméra : les corps restent à l'horizon en permanence.

export const STARS = {
  sun_star: {
    texture: '/textures/stars/sun_star/star_albedo.png',
    radius: 230,
    haloColor: 0xffcc55,
    lightColor: 0xfff1dd,
    lightIntensity: 2.6,
    position: [950, 420, -2400],
  },
  big_red_star: {
    texture: '/textures/stars/big_red_star/star_albedo.png',
    radius: 500,
    haloColor: 0xff4422,
    coronaColor: 0xff7a22,
    coronaScale: 7.4,
    coronaOpacity: 0.34,
    ringColor: 0xffc08a,
    ringTilt: 1.08,
    ringRotation: 0.32,
    lightColor: 0xff7755,
    lightIntensity: 2.2,
    pulse: true,
    position: [1100, 480, -2800],
  },
};

// Systèmes stellaires : composition complète d'un ciel de mission.
// Positions = offsets caméra. `main: true` désigne l'étoile dominante ;
// `orbit` fait tourner un corps autour d'un autre (index dans `planets`).
export const SYSTEMS = {
  // Niveau 1 : le système binaire de Kharos — un soleil stable et une géante
  // rouge agonisante. Kharos-3 (désertique) + sa lune, planète océanique au loin.
  kharos_binary: {
    stars: [
      { id: 'sun_star', position: [950, 420, -2400], main: true },
      { id: 'big_red_star', position: [-1300, 620, -2900], lightIntensity: 0.85 },
    ],
    planets: [
      { id: 'desert_planete', position: [-700, 250, -1900] },
      { id: 'ocean_planete', position: [700, -380, -2800] },
      { id: 'cratere_moon', position: [-700, 250, -1900], orbit: { around: 0, radius: 430, speed: 0.03, tilt: 0.25 } },
    ],
  },
  kharos_red_corona: {
    stars: [
      { id: 'big_red_star', position: [0, 260, -1850], main: true, lightIntensity: 1.65, ringTilt: 1.34, ringRotation: 0.08 },
      { id: 'sun_star', position: [1250, 260, -3100], lightIntensity: 0.6 },
    ],
    planets: [
      { id: 'desert_planete', position: [-980, 180, -2300] },
      { id: 'cratere_moon', position: [-980, 180, -2300], orbit: { around: 0, radius: 430, speed: 0.03, tilt: 0.25 } },
      { id: 'ocean_planete', position: [920, -430, -3000] },
    ],
  },
  ocean_front: {
    stars: [
      { id: 'sun_star', position: [620, 360, -1650], main: true, lightIntensity: 3.1 },
      { id: 'big_red_star', position: [-1450, 520, -3300], lightIntensity: 0.08, coronaOpacity: 0.08 },
    ],
    planets: [
      { id: 'ocean_planete', position: [-620, -90, -1550] },
      { id: 'cratere_moon', position: [-620, -90, -1550], orbit: { around: 0, radius: 390, speed: 0.025, tilt: 0.18 } },
      { id: 'desert_planete', position: [1250, -520, -3200] },
    ],
  },
};

export const PLANETS = {
  // Kharos-3 — théâtre de la première campagne (voir CONTEXTE.md)
  desert_planete: {
    radius: 260,
    spinSpeed: 0.015,
    atmosphereColor: 0xff9a5c,
    position: [-700, 250, -1900],
    textures: {
      albedo: '/textures/planets/desert_planete/planet_albedo.png',
      clouds: '/textures/planets/desert_planete/planet_clouds_alpha.png',
      normal: '/textures/planets/desert_planete/planet_normal.png',
      roughness: '/textures/planets/desert_planete/planet_roughness.png',
      emission: '/textures/planets/desert_planete/planet_emission.png',
    },
  },
  ocean_planete: {
    radius: 260,
    spinSpeed: 0.012,
    atmosphereColor: 0x66baff,
    position: [-700, 250, -1900],
    textures: {
      albedo: '/textures/planets/ocean_planete/planet_albedo.png',
      clouds: '/textures/planets/ocean_planete/planet_clouds_alpha.png',
      normal: '/textures/planets/ocean_planete/planet_normal.png',
      roughness: '/textures/planets/ocean_planete/planet_roughness.png',
      emission: '/textures/planets/ocean_planete/planet_emission.png',
    },
  },
  // Lune morte : pas de nuages, pas d'atmosphère
  cratere_moon: {
    radius: 170,
    spinSpeed: 0.008,
    atmosphereColor: null,
    position: [-600, 220, -1700],
    textures: {
      albedo: '/textures/planets/cratere_moon/planet_albedo.png',
      normal: '/textures/planets/cratere_moon/planet_normal.png',
      roughness: '/textures/planets/cratere_moon/planet_roughness.png',
    },
  },
};
