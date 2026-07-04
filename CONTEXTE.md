# Space Opera — Contexte du jeu

> Document de référence du projet. L'univers (section 2) est une **proposition v0.1** à
> valider ou réécrire — tout le reste décrit des décisions actées.

## 1. Pitch

Un shoot spatial en 3D dans le navigateur, à mi-chemin entre **Star Fox 64** (phases sur
rail spectaculaires) et **Battlestar Galactica** (dogfights nerveux, vaisseaux réalistes
mais lisibles). Construit en **Three.js + Vite**, jouable clavier (AZERTY/QWERTY) et
**manette Xbox**.

## 2. Univers — proposition v0.1 (à valider)

Dans le secteur frontalier de **Kharos**, la Confédération des Mondes Libres maintient une
paix fragile depuis la Grande Scission. Quand une flotte inconnue — **l'Hégémonie du
Vide** — surgit des zones mortes de la carte stellaire, les escadrons réguliers sont
balayés en quelques jours.

Le joueur est le dernier pilote opérationnel de **l'escadron Aquila**, rattaché au
porte-vaisseaux *Véhémence*. Chaque mission est lancée depuis le *Véhémence* (cinématique
LTX), se joue en vol (rail et/ou zone libre), et se conclut par un débriefing qui fait
avancer l'histoire.

- **Première planète : Kharos-3**, monde désertique volcanique (textures déjà en jeu) —
  théâtre de la première campagne.
- Les phases au sol sur les planètes sont prévues **dans un second temps**.

## 3. Piliers de design

1. **Sensations d'arcade avant tout** — 60 FPS, réponse immédiate, lisibilité.
2. **Spectaculaire scripté** — vagues d'ennemis, événements de mission, dialogues radio.
3. **Réaliste mais simple** — vaisseaux crédibles (Rodin), pas de simulation.
4. **Solo-dev friendly** — chaque système doit rester simple à étendre.

## 4. Modes de gameplay

| Mode | Description | Statut |
|---|---|---|
| **Rail (corridor)** | Avance automatique, déplacement dans un cadre, roulis/tangage visuels, double réticule | ✅ Prototype jouable |
| **All-range (zone libre)** | Arène de dogfight, vol libre simplifié, IA ennemie | 🔜 À construire |
| **Phases au sol** | Exploration/combat sur les planètes | ⏳ Second temps |

## 5. Contrôles (axe Y inversé, façon aviation)

| Action | Clavier | Manette Xbox |
|---|---|---|
| Piloter | ZQSD / WASD / Flèches | Stick gauche |
| Tirer | Espace | RT ou A |
| Boost | Maj | LT ou LB |

## 6. Pipeline d'assets

- **ChatGPT** → concept arts (vues orthographiques pour Rodin) et **textures de planètes**
  (équirectangulaires 2:1, pack albedo/clouds/normal/roughness/emission — voir
  `public/textures/planets/README.md`).
- **Rodin AI** → modèles 3D GLB (vaisseaux, stations) et HDRI d'environnement.
- **LTX (local, 720p)** → animation des images ChatGPT en cinématiques entre les missions.
- Placeholders en primitives Three.js tant que les assets finaux ne sont pas prêts ; le
  mesh du vaisseau joueur est isolé dans `PlayerShip.buildMesh()` pour un swap GLB facile.

## 7. État actuel du prototype

- Vol sur rail complet : lasers alternés, drones destructibles (+50), anneaux à
  traverser (+100), explosions, boost avec recul caméra, champ d'étoiles infini,
  HUD score/vitesse.
- **Vaisseau héros : le chasseur Aquila** (`public/space_ships/heroes/aquila_fighter/`),
  modèle Rodin low-poly PBR (~4 600 sommets) avec émissif appliqué au chargement.
- **Escadron Aquila** (`src/entities/Wingman.js`) : 3 ailiers PNJ sur le même chasseur,
  formation en V autour du joueur (suivi avec inertie, roulis naturel, flottement),
  tir de soutien auto sur les ennemis dans leur cône avant (leurs kills créditent le
  score). Invulnérables pour l'instant ; les ennemis ne visent que le joueur.
  ⚠️ Les offsets de formation doivent rester en -Z (devant le joueur), sinon les
  ailiers passent devant la caméra de poursuite.
- **Flotte ennemie complète en jeu** (catalogue `ENEMY_TYPES` dans
  `src/entities/Targets.js`, GLB Rodin normalisés) — tous tirent avec visée anticipée
  + dispersion, fenêtre 80-600 unités :
  - `basic_fighter` ×6 : 9 unités, 1 PV, laser léger (-12), halo rouge, +50 pts
  - `commander_artillery` ×2 : 14 unités, 3 PV, canon lourd (-20), halo violet, +150 pts
  - `general_destroyer` ×1 : 30 unités, 8 PV, artillerie (-30), halo orange, +500 pts,
    gerbe d'explosions à la destruction
  - Hitbox et point de tir proportionnels au gabarit ; halo qui flashe quand un ennemi
    encaisse sans mourir. Attention : l'orientation des exports Rodin varie
    (`rotationY` par type, vérifiée contre les images `references/`).
- **Bouclier du héros : 100 PV** (laser ennemi -12, collision -25), régénération
  +4 PV/s après 5 s sans dégât. HUD : barre de bouclier (vert/orange/rouge), vignette
  rouge d'impact, secousse caméra. **Game over** avec score final, restart ESPACE/A.
- Halos de lisibilité : rouge pulsant derrière les ennemis, cyan discret pour le héros
  (s'intensifie au boost) — silhouettes à contre-jour, code couleur ami/ennemi.
- **Catalogue céleste** (`src/world/celestial-catalog.js`) : 2 étoiles (soleil,
  géante rouge pulsante) et 3 planètes (Kharos-3 désertique, océanique, lune
  cratérisée). Chaque étoile projette sa lumière colorée (direction étoile → planète
  principale). **Niveau 1 : système binaire `kharos_binary`** (config `SYSTEMS`) —
  soleil + géante rouge en double éclairage, Kharos-3 avec sa lune en orbite animée,
  planète océanique au loin. Un ciel de mission = une entrée dans `SYSTEMS`.
- **Sons** (SoundManager, ajouté par Paul) : lasers joueur/ennemis, impacts bouclier
  et blindage, explosions par gabarit.
- Support manette Xbox (API Gamepad, mapping standard).

## 8. Feuille de route

Phase "structure" (architecture, avec Fable 5) :
1. Machine à états : menu / cinématique / vol rail / all-range / game over
2. Mode all-range (contrôles libres, caméra de poursuite, IA de dogfight basique)
3. Système de missions scriptables (vagues, événements, dialogues radio)
4. Pipeline branché : chargeur GLB Rodin, HDRI skybox, lecteur cinématiques LTX
5. Santé/boucliers, dégâts, game over

Phase "contenu" (itération, transférable à Opus 4.8) : nouvelles missions, ennemis,
équilibrage, intégration d'assets, écrans d'UI, sons.
