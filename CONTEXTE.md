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
- Les phases au sol sur les planètes sont prévues **dans un second temps long** :
  elles doivent arriver comme un événement narratif, quand l'ennemi est affaibli et
  que les héros sont assez forts pour descendre du ciel.

## 3. Piliers de design

1. **Sensations d'arcade avant tout** — 60 FPS, réponse immédiate, lisibilité.
2. **Spectaculaire scripté** — vagues d'ennemis, événements de mission, dialogues radio.
3. **Réaliste mais simple** — vaisseaux crédibles (Rodin), pas de simulation.
4. **Solo-dev friendly** — chaque système doit rester simple à étendre.

## 4. Modes de gameplay visés

| Mode | Description | Statut |
|---|---|---|
| **Vol sur rail spatial** | Avance automatique, déplacement dans un cadre, roulis/tangage visuels, double réticule, vagues ennemies | ✅ Prototype jouable |
| **Vol libre six axes** | Arène de dogfight, liberté complète autour de cibles lourdes, IA d'escadron plus indépendante | 🔜 À construire après un premier boss |
| **Vol sur rail planétaire** | Même ADN arcade que le rail spatial, mais avec sol, relief, horizon, bases et tourelles | ⏳ Deuxième grande extension |
| **Combat au sol** | Fusils à plasma, progression à pied, bataille ultime lorsque les héros peuvent enfin affronter l'ennemi au sol | 🌙 Fin de jeu / long terme |

Intention de progression :
1. **Survivre** — rail spatial : escorte, interception, libération des routes.
2. **Reprendre l'initiative** — vol libre : attaque de capital ships et défense du
   *Véhémence*.
3. **Percer les mondes occupés** — rail planétaire : assauts basse altitude, corridors
   civils, neutralisation de défenses de surface.
4. **Descendre du ciel** — combat au sol : bataille ultime, quand l'Empire du Vide est
   assez affaibli pour qu'un assaut terrestre ait du sens.

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
- Les modèles GLB critiques sont maintenant **préchargés et mis en cache** avant la
  création de `Game` (`preloadShipModels()` dans `src/core/ShipModel.js`) : le briefing
  de mission sert aussi d'écran de chargement, puis chaque instance clone le modèle
  déjà normalisé. Objectif : éviter les placeholders visibles au lancement.

## 7. État actuel du prototype

- Vol sur rail complet : lasers alternés, drones destructibles (+50), anneaux à
  traverser (+100), explosions, boost avec recul caméra, champ d'étoiles infini,
  HUD score/vitesse.
- **Flux de lancement actuel** : intro vidéo de recrutement → briefing mission de 30 s
  (préchargement GLB + image de hangar) → sortie du *Véhémence* (~3,6 s) → gameplay.
  Le briefing actuel annonce la mission : libérer au maximum la route commerciale de
  Kharos-3 occupée par l'Empire/Hégémonie du Vide.
- **Sortie du Véhémence** : utilise `public/images/interieur_vehemence.png` comme
  texture transparente dans la scène Three.js, rendue devant le ciel étoilé mais
  derrière les vaisseaux. Les Aquila sortent du hangar avec traînées cyan et overlay
  "PUBLIC FEED 03" en HTML.
- **Vaisseau héros : le chasseur Aquila** (`public/space_ships/heroes/aquila_fighter/`),
  modèle Rodin low-poly PBR (~4 600 sommets) avec émissif appliqué au chargement.
- **Escadron Aquila** (`src/entities/Wingman.js`) : 3 ailiers PNJ sur le même chasseur,
  formation en V autour du joueur (suivi avec inertie, roulis naturel, flottement),
  tir de soutien auto sur les ennemis dans leur cône avant (leurs kills créditent le
  score). **Meurent dans les mêmes conditions que le joueur** (PV/régén partagés via
  `src/core/combat.js`) — explosion, halo éteint, arrêt du vol/tir ; les ennemis ne
  ciblent toujours que le joueur, mais un ailier peut mourir par collision ou en
  étant dans la trajectoire d'un tir. Callsigns façon Top Gun (voir §9).
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
- **Prototype boss vaisseau-mère** (`src/entities/MothershipBoss.js`) :
  `public/space_ships/ennemies/mothership/base_basic_pbr.glb` est intégré comme
  capital ship dédié, préchargé pendant le briefing. Il apparaît rapidement après le
  début de mission, coupe les vagues normales, affiche une barre de boss et des points
  faibles rouges clignotants. Le vaisseau-mère effectue une rotation lente pendant
  le combat pour exposer progressivement ses flancs et permettre au rail shooter de
  viser tous les modules. Il lance périodiquement 1 ou 2 chasseurs depuis ses baies
  d'envol, mais en quantité limitée pour rester jouable. Les modules extérieurs
  doivent être détruits avant l'exposition du coeur/réacteur final ; sa destruction
  déclenche l'écran
  **ROUTE LIBEREE**. C'est une v1 jouable du concept, à régler ensuite : échelle,
  orientation, trajectoire rail autour de la coque, patterns de tir et placement fin
  des points faibles.
- **Cinématique de debrief** (`completeMission()` dans `src/core/Game.js`) : ~2,5 s
  après l'écran de résultats, enchaîne automatiquement sur
  `public/cinematics/first_mission_end/debrief_end_first_mission.mp4` (bouton PASSER
  disponible après 1 s). Redémarrage (ESPACE/A) verrouillé tant que la vidéo n'est
  pas terminée ou sautée (`this.debriefDone`), pour ne pas la zapper par inadvertance
  depuis l'écran de score. Voir aussi `public/cinematics/mission_debrief/` pour le
  script complet du prochain debrief (storyboard + prompts LTX).
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
  et blindage, explosions par gabarit. **Alarme de bouclier critique** (<25%) :
  bip-bip strident synthétisé en direct (oscillateur, aucun fichier requis).
  **Répliques radio de l'escadron** : chaîne "radio militaire" appliquée en direct
  (filtre bandpass resserré + saturation renforcée + souffle statique procédural)
  sur des
  enregistrements propres — voir §9 et `public/audio/prompts/voice_prompts.md`
  pour le script à faire générer (Codex/ElevenLabs). Tant que les fichiers
  `public/audio/voice/*.wav` n'existent pas, les répliques restent silencieuses
  sans erreur (chargement paresseux, avertissement console bénin en dev).
- Support manette Xbox (API Gamepad, mapping standard).

## 9. Callsigns de l'escadron Aquila

| Pilote | Callsign | Rôle |
|---|---|---|
| Joueur | **Lynx** | Chasseur — le plus jeune pilote encore opérationnel |
| Ailier gauche | **Renard** | Flanc-garde |
| Ailier droit | **Cobra** | Flanc-garde |
| Ailier haut | **Corbeau** | Éclaireur |

Réserve pour de futurs pilotes de remplacement (si un ailier meurt en mission et que
l'escadron est renforcé) : *Frelon, Spectre, Phénix, Vipère, Bourrasque*.

## 10. Feuille de route

Priorité de design actée après discussion :
- Construire d'abord une **mission complète en vol sur rail spatial**, avec boss et
  fin de mission, avant d'ouvrir les autres modes.
- Boss v1 retenu : **vaisseau mère / capital ship ennemi**, plutôt qu'une base
  planétaire. Raison : il reste compatible avec le gameplay spatial actuel et permet
  une fin spectaculaire sans développer tout de suite sol, relief et atmosphère.
- Structure boss v1 proposée :
  1. vagues de route commerciale ;
  2. annonce radio d'un contact massif ;
  3. apparition du capital ship ;
  4. destruction de points faibles (tourelles, batteries, coeur/réacteur) ;
  5. ailiers survivants en attaques scriptées autour des modules ;
  6. explosion finale, musique de victoire, écran "ROUTE COMMERCIALE LIBEREE".
- Le vol libre six axes reste une cible importante, mais plutôt pour une v2 du combat
  contre capital ship : liberté autour du boss, survivants autonomes, attaque sous
  plusieurs angles.
- La base ennemie sur planète reste une excellente piste pour plus tard : elle demande
  un mode rail planétaire avec sol, relief, brouillard/HDRI Rodin AI, tourelles et
  règles d'altitude lisibles.

Phase "structure" (architecture, avec Fable 5) :
1. Machine à états : menu / cinématique / vol rail / all-range / game over
2. Mode all-range (contrôles libres, caméra de poursuite, IA de dogfight basique)
3. Système de missions scriptables (vagues, événements, dialogues radio)
4. Pipeline branché : chargeur GLB Rodin, HDRI skybox, lecteur cinématiques LTX
5. Santé/boucliers, dégâts, game over

Phase "contenu" (itération, transférable à Opus 4.8) : nouvelles missions, ennemis,
équilibrage, intégration d'assets, écrans d'UI, sons.
