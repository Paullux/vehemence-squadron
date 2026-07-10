# Space Opera — Contexte du jeu

> Document de référence du projet. L'univers (section 2) est une **proposition v0.1** à
> valider ou réécrire — tout le reste décrit des décisions actées.
> Dernière mise à jour : 09/07/2026.

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

### Thème écologique et retournement moral

La guerre contre l'Hégémonie du Vide ne doit pas rester un conflit simple entre
"héros confédérés" et "ennemis barbares". Après une bataille au sol sur une planète
de l'Hégémonie, le joueur peut interroger un prisonnier ennemi. Ce prisonnier révèle
une autre lecture de l'histoire : la **Confédération des Mondes Libres** terraformait
des planètes entières au mépris des formes de vie préexistantes, écrasant des
écosystèmes lents, invisibles ou incompris pour rendre ces mondes habitables par les
humains.

Dans ce récit, **la Terre** est devenue presque une légende : le monde d'origine,
perdu, détruit par les humains eux-mêmes. Le prisonnier explique que le sort de la
Terre n'est pas une exception ancienne mais un modèle qui se répète. Si rien ne
change, **Kharos connaîtra dans un millénaire le même destin** : épuisement,
artificialisation, disparition des vivants natifs, puis fuite vers un autre monde.

Message de fond : l'humanité parcourt l'espace de monde en monde pour survivre,
mais sa survie repose encore sur la destruction de ce qu'elle touche. Le jeu peut
porter cette idée sans transformer le joueur en coupable immédiat : Lynx découvre
progressivement que la propagande confédérée, l'héroïsme militaire et même la notion
de "mondes libres" masquent une logique coloniale et extractive plus profonde.

## 3. Piliers de design

1. **Sensations d'arcade avant tout** — 60 FPS, réponse immédiate, lisibilité.
2. **Spectaculaire scripté** — vagues d'ennemis, événements de mission, dialogues radio.
3. **Réaliste mais simple** — vaisseaux crédibles (Rodin), pas de simulation.
4. **Solo-dev friendly** — chaque système doit rester simple à étendre.

## 4. Modes de gameplay visés

| Mode | Description | Statut |
|---|---|---|
| **Vol sur rail spatial** | Avance automatique, déplacement dans un cadre, roulis/tangage visuels, double réticule, vagues ennemies | ✅ Prototype jouable |
| **Vol libre six axes** | Arène de dogfight, liberté complète autour de cibles lourdes, IA d'escadron plus indépendante | ✅ Livré en mission 4 (voir §7) |
| **Vol sur rail planétaire** | Même ADN arcade que le rail spatial, mais avec sol, relief, horizon, bases et tourelles | ⏳ Deuxième grande extension |
| **Combat au sol** | Fusils à plasma, progression à pied, bataille ultime lorsque les héros peuvent enfin affronter l'ennemi au sol | 🌙 Fin de jeu / long terme |

Intention de progression :
1. **Survivre** — rail spatial : escorte, interception, libération des routes.
2. **Reprendre l'initiative** — vol libre : attaque de capital ships et défense du
   *Véhémence*.
3. **Percer les mondes occupés** — rail planétaire : assauts basse altitude, corridors
   civils, neutralisation de défenses de surface.
4. **Descendre du ciel** — combat au sol : bataille ultime, quand l'Hégémonie du Vide est
   assez affaibli pour qu'un assaut terrestre ait du sens.

## 5. Contrôles (axe Y inversé, façon aviation)

| Action | Clavier | Manette Xbox |
|---|---|---|
| Piloter | ZQSD / WASD / Flèches | Stick gauche |
| Tirer | Clic gauche (souris capturée) | RT ou A |
| Boost | Maj / clic droit (souris capturée) | LT ou LB |
| Pause | Espace | — |

**Visée souris façon FPS** (`src/core/Input.js`) : capturée via Pointer Lock API
(clic sur le jeu pour capturer, **Échap** pour relâcher — natif navigateur).
Hors capture, la souris ne fait strictement rien (pas de visée, pas de clic sur
la page) ; un rappel HUD ("CLIQUEZ POUR CAPTURER...") s'affiche tant qu'elle
n'est pas engagée. Une fois capturée, les deltas relatifs (`movementX/Y`)
pilotent le réticule en continu, clavier/manette restent indépendants du
verrou.

**Mission 4 / vol libre — schéma dédié** (`updateMission04Flight` dans
`Game.js`, getters `throttle`/`roll`/`consumeMouseDelta()` dans `Input.js`) :
la souris pilote le cap du vaisseau sans butée (là où tu regardes, tu voles —
le réticule reste fixe au centre de l'écran), `Z` avance / `S` recule
(rapproche/éloigne du bouclier, rayon borné), `Q`/`D` font rouler le vaisseau
et le déplacent latéralement (tangentiel). Le tir part du vaisseau et vise le
long de l'axe caméra→cible (`firePlayerLaser`, branche `mission04`). Ce schéma
est indépendant de `moveX`/`moveY` (vol sur rail, inchangé). Testé et affiné
avec Paul sur plusieurs allers-retours : correction d'un saut de cap parasite
au premier mouvement souris après capture du Pointer Lock (délai de
150 ms avant de lire les deltas, `POINTER_LOCK_SETTLE_MS`), des codes
clavier manquants pour AZERTY sur `throttle`/`roll` (`KeyZ`+`KeyW`,
`KeyQ`+`KeyA` — même piège que `moveX`/`moveY` plus haut), et un réticule
qui n'était pas "billboard" (plan figé dans l'espace, vu de tranche dès que
la caméra tournait librement) — il copie maintenant l'orientation caméra
chaque frame.

**Menu pause** : `Espace` ouvre un panneau en jeu avec réglages audio
persistants (`localStorage`) et sauvegarde légère de mission (score, bouclier,
temps, boss commencé/progression). Cette sauvegarde sert pour l'instant de
checkpoint informatif ; la reprise exacte d'un état 3D viendra avec la machine
à états de mission.

## 6. Pipeline d'assets

- Dossier source hors repo GitHub : `I:\jeu Space Opera Threejs - Source`.
  Convention à garder pour la suite : y placer les fichiers lourds et génératifs
  (prompts ChatGPT/Rodin/LTX, fichiers Blender, sources vidéo, HDRI de travail,
  images de référence, exports intermédiaires). Le repo `I:\jeu Space Opera Threejs`
  ne doit garder que les assets finaux optimisés nécessaires au jeu dans `public/`
  et le code source. Objectif : pouvoir itérer sur les assets sans alourdir le dépôt.
  Les anciens fichiers de production qui avaient été placés dans `public/` ont été
  déplacés vers `I:\jeu Space Opera Threejs - Source\public-non-runtime\` et purgés
  de l'historique Git/LFS.
- **ChatGPT** → concept arts (vues orthographiques pour Rodin) et **textures de planètes**
  (équirectangulaires 2:1, pack albedo/clouds/normal/roughness/emission).
- **Rodin AI** → modèles 3D GLB (vaisseaux, stations) et HDRI d'environnement.
- **LTX / Seedance** → animation des images ChatGPT en cinématiques entre les missions.
- Placeholders en primitives Three.js tant que les assets finaux ne sont pas prêts ; le
  mesh du vaisseau joueur est isolé dans `PlayerShip.buildMesh()` pour un swap GLB facile.
- Les modèles GLB critiques sont maintenant **préchargés et mis en cache** avant la
  création de `Game` (`preloadShipModels()` dans `src/core/ShipModel.js`) : le briefing
  de mission sert aussi d'écran de chargement, puis chaque instance clone le modèle
  déjà normalisé. Objectif : éviter les placeholders visibles au lancement.
- Après une réécriture d'historique ou un clone, vérifier que les fichiers Git LFS
  sont matérialisés (`git lfs pull`). Un pointeur LFS brut dans `public/` se voit par
  une taille d'environ 130 octets et provoque des placeholders (cube, audio muet, etc.).

## 7. État actuel du prototype

- Vol sur rail complet : lasers alternés, drones destructibles (+50), anneaux à
  traverser (+100), explosions, boost avec recul caméra, champ d'étoiles infini,
  HUD score/vitesse.
- **Flux de lancement actuel** : intro vidéo de recrutement → briefing mission de 30 s
  (préchargement GLB + image de hangar) → sortie du *Véhémence* (~3,6 s) → gameplay.
  Le briefing actuel annonce la mission : libérer au maximum la route commerciale de
  Kharos-3 occupée par l'Hégémonie du Vide.
- **Flux campagne actuel** : mission 1 → cinématique de fin → briefing mission 2 →
  décollage ; mission 2 → cinématique + briefing commandant → briefing mission 3 →
  décollage ; mission 3 → cinématique de fin → briefing mission 4 → décollage ;
  mission 4 → cinématique de fin → retour menu (rechargement sans paramètres d'URL).
  Chaque transition passe par l'URL (`mission`, `difficulty`, `score`, `autostart=1`) :
  le score est cumulé et le mode de difficulté (`PILOTE` ou `CADET`) conservé sur
  toute la campagne. Vérifié en direct de bout en bout (fin mission 3 → auto-lancement
  mission 4 avec score transmis) le 09/07/2026.
- **Menu de test** : pendant la phase de développement, l'écran d'intro garde un
  sélecteur Mission 1 / Mission 2 / Mission 3 / Mission 4 et un sélecteur de
  difficulté. En fin de production, ce choix devra être remplacé par un flux plus
  simple : lancer l'intro puis la campagne, ou démarrer directement au niveau 1.
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
  `src/core/combat.js`) — explosion, halo éteint, arrêt du vol/tir. Chaque ailier
  expose `.velocity` (même forme que `PlayerShip`) pour la visée anticipée ennemie.
  Callsigns façon Top Gun (voir §9).
  ⚠️ Les offsets de formation doivent rester en -Z (devant le joueur), sinon les
  ailiers passent devant la caméra de poursuite.
- **Ciblage ennemi réparti sur tout l'escadron** (`Targets.pickTarget`) : chaque
  chasseur ennemi (normal ou lancé par le vaisseau-mère) choisit sa cible au hasard
  parmi le joueur ET les ailiers vivants, réévaluée toutes les 2,5-4,5 s ou dès que
  l'ailier visé meurt. Il se dirige et tire (visée anticipée) vers cette cible, pas
  uniquement vers le joueur. La progression en Z reste calée sur le joueur (rythme
  du rail) — seul le point visé change. Tirage aléatoire uniforme volontaire (le
  "plus proche" faisait converger tous les ennemis sur l'ailier de pointe).
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
  des points faibles. Les points faibles peuvent maintenant être placés directement
  dans Blender avec des objets nommés `vulnerable_target.000` à
  `vulnerable_target.007` (ou plus si besoin) : le jeu détecte ces objets dans le GLB,
  masque leurs meshes et place les marqueurs HUD rouges à leurs positions. Le dernier
  `vulnerable_target.00x` détecté est traité comme coeur/réacteur verrouillé à
  détruire en dernier.
  Sa destruction masque maintenant le modèle complet et déclenche des sprites
  d'explosion plus une gerbe de débris noir/rouge/rouge émissif, miroir hostile de
  l'explosion du *Véhémence*.
- **Cinématique de debrief** (`completeMission()` dans `src/core/Game.js`) : ~2,5 s
  après l'écran de résultats, enchaîne automatiquement sur
  `public/cinematics/first_mission_end/debrief_end_first_mission.mp4` (bouton PASSER
  disponible après 1 s). Redémarrage (ESPACE/A) verrouillé tant que la vidéo n'est
  pas terminée ou sautée (`this.debriefDone`), pour ne pas la zapper par inadvertance
  depuis l'écran de score. Les storyboards/prompts source sont conservés hors runtime
  dans `I:\jeu Space Opera Threejs - Source\`.
- **Niveau 2 : Couronne Rouge** (`src/entities/AsteroidField.js`) : mission sur rail
  dans le système `kharos_red_corona`, autour de la géante rouge. Le joueur traverse
  un champ d'astéroïdes avec tourelles, puis affronte une base-astéroïde camouflée.
  Les relais rouges secondaires doivent être détruits avant que le noyau final soit
  exposé ; sa destruction déclenche **COURONNE SECURISEE**. Le verrou du noyau ne doit
  compter que les points faibles secondaires, pas le noyau lui-même.
  Prochaine passe asset : remplacer les primitives de tourelles/hangars par deux
  modèles Rodin dédiés :
  - **Canon plasma d'astéroïde** (`public/space_ships/ennemies/asteroid_plasma_cannon/`)
    modèle unique réutilisable à plusieurs échelles. Les parties destructibles doivent
    être rouges/émissives et très lisibles : ce sont les points à détruire sur la
    base-astéroïde géante.
  - **Hangar d'astéroïde** (`public/space_ships/ennemies/asteroid_hangar/`) module
    encastré dans la roche, avec bouche de lancement claire. Les chasseurs ennemis
    doivent décoller visiblement de ces hangars sur l'astéroïde géant.
- **Cinématique de fin du niveau 2** : `completeMission()` utilise maintenant
  `public/cinematics/second_mission_end/red_corona_escape_seedance.mp4`, générée via
  Replicate / `bytedance/seedance-1.5-pro` depuis l'image source
  `red_corona_escape_ai.png`. Les prompts et le storyboard sont conservés côté source
  dans `I:\jeu Space Opera Threejs - Source\pipeline-assets\cinematics\second_mission_end\`.
  L'image IA reste disponible dans `public/` comme fallback si le MP4 ne charge pas.
- **Niveau 3 : Défense du Véhémence** (`src/entities/VehemenceDefense.js`) :
  bataille spatiale près d'une étoile type soleil et d'une planète océanique
  (`ocean_front`). Le niveau commence par une scène de décollage plus longue :
  plusieurs salves de chasseurs Aquila quittent le hangar par groupes de 4, puis le
  joueur part avec la réplique prioritaire `public/audio/voice/cest_a_notre_tout.wav`
  ("c'est à notre tour les gars, bonne chance"). En gameplay, le joueur défend le
  *Véhémence* contre des vagues de chasseurs, vaisseaux d'artillerie et destroyers ;
  des figurants alliés traversent le champ de bataille et tirent en soutien. Les
  ennemis ciblent le *Véhémence* et l'escadron, avec agressivité réduite en mode
  `CADET` et inchangée en mode `PILOTE`. Si le bouclier du *Véhémence* tombe à zéro :
  modèle masqué, explosions, débris blanc/gris/bleu/cyan, game over
  **VEHEMENCE DETRUIT / ECHEC DE LA MISSION**. Si le joueur tient jusqu'à la fin :
  **VEHEMENCE PROTEGE / ASSAUT REPOUSSE**.
- **Cinématique de fin du niveau 3** :
  `public/cinematics/third_mission_end/end_mission_3_debrief.mp4`, générée depuis
  l'image de briefing hangar avec le commandant vu de dos pour éviter le lipsync.
  Le clip Seedance court a été monté en bounce avant/arrière plusieurs fois pour
  couvrir toute la voix `public/audio/voice/end_mission_3.wav`. Après cette
  cinématique, retour au menu. Côté histoire, le commandant remercie Aquila d'avoir
  permis à l'Hégémonie du Vide de sortir des systèmes contrôlés par la Confédération,
  puis prépare l'assaut dans le propre système de l'Hégémonie.
- **Mission 4 : `MISSION 4 // Directement chez L'HEGEMONIE`**. V1 jouable :
  bataille près d'une planète rouge, d'une grande étoile rouge et de ses anneaux.
  C'est le niveau où le **mode libre/all-range** prend tout son sens : les rails et
  le recentrage automatique sont désactivés. Le joueur peut contourner librement la
  planète pour atteindre tous les satellites-boucliers répartis autour d'elle,
  toujours sur une coque sphérique (rayon variable) autour du bouclier. Pilotage
  refondu (voir §5) : souris = cap, `Z`/`S` = avancer/reculer (rayon), `Q`/`D` =
  rouler + latéral ; relâcher tous les contrôles fige la position et la caméra
  dans la vue atteinte (propriété naturelle de l'accumulateur d'angle/rayon, pas
  de logique de gel dédiée). **Aucun chasseur ennemi** dans cette mission (retiré
  à la demande de Paul — `ShieldSatelliteAssault.launchFighters()` supprimé) :
  la mission est purement un assaut de précision contre les satellites, sans
  interception. Objectif : détruire les satellites qui génèrent le champ de
  force/bouclier planétaire de l'Hégémonie.
  L'éclairage rouge très marqué de l'Hégémonie (`buildMissionLighting`) n'est
  ajouté à la scène qu'à la fin du décollage (`finishLaunch`), pas avant : sinon
  il teintait aussi la sortie du hangar, encore en espace neutre.
  Modèle runtime des satellites :
  `public/space_ships/ennemies/shield_satellites/base_basic_pbr.glb` avec
  `texture_emissive.png`. Références de génération Rodin conservées côté source :
  `I:\jeu Space Opera Threejs - Source\pipeline-assets\space_ships\ennemies\hegemony_shield_satellite\references\`.
  Le bouclier est rendu comme une sphère rouge transparente à quadrillage émissif
  autour de la planète ; chaque satellite détruit casse un secteur du shader, et
  la jauge de boss indique les satellites restants.
- **Cinématique de fin du niveau 4** :
  `public/cinematics/fourth_mission_end/aquila_dive_to_red_planet_seedance.mp4`,
  générée via Replicate / `bytedance/seedance-1.5-pro` depuis l'image clé
  `aquila_dive_to_red_planet_keyframe.png`. Elle montre l'escadron Aquila plongeant
  directement vers la planète rouge après l'ouverture du bouclier. Les prompts et
  sources sont conservés côté source dans
  `I:\jeu Space Opera Threejs - Source\pipeline-assets\cinematics\fourth_mission_end\`.
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
  enregistrements propres — voir §9 et
  `I:\jeu Space Opera Threejs - Source\public-non-runtime\public\audio\prompts\voice_prompts.md`
  pour les scripts source déplacés hors runtime. Tant que les fichiers
  `public/audio/voice/*.wav` n'existent pas, les répliques restent silencieuses
  sans erreur (chargement paresseux, avertissement console bénin en dev).
  Les voix sont volontairement boostées au mix (gain radio + slider pause jusqu'à
  300%) pour rester audibles au-dessus des moteurs, lasers et musiques de boss.
  La réplique d'arrivée du vaisseau-mère est prioritaire et baisse brièvement la
  musique boss pour rester compréhensible.
  Tous les sons de vol (moteur, alarme bip-bip, répliques bouclier faible) sont
  **coupés dès la fin de mission ou le game over** (`updateAudio` gardé par `flying`) —
  seule la musique de victoire/défaite continue.
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
- Le vol libre six axes, envisagé au départ comme une v2 du combat contre capital
  ship, a finalement été livré en **mission 4** : liberté de mouvement autour de la
  planète rouge (longitude/latitude, recentrage désactivé) pour atteindre les
  satellites-boucliers sous tous les angles.
- La base ennemie sur planète reste une excellente piste pour plus tard : elle demande
  un mode rail planétaire avec sol, relief, brouillard/HDRI Rodin AI, tourelles et
  règles d'altitude lisibles.

Phase "structure" — **terminée** : machine à états (menu / cinématique / briefing /
vol rail / all-range / debrief / game over via `missionId` + flags dans `Game.js`),
mode all-range (mission 4), 4 missions scriptables complètes avec vagues/boss/
événements/dialogues radio, pipeline GLB Rodin + cinématiques Seedance/LTX branché,
bouclier/dégâts/game over.

Prochaines pistes (non actées, à discuter) :
- Remplacer le menu de test (sélecteur Mission 1-4 + difficulté) par un vrai flux de
  production : intro → campagne complète, ou reprise au niveau atteint.
- Équilibrage général maintenant que les 4 missions s'enchaînent (`DIFFICULTIES` dans
  `src/core/combat.js` : `pilot` vs `cadet`, multiplicateurs dégâts/régén/agressivité).
- Rail planétaire + combat au sol (§2, "second temps long") : le prisonnier ennemi et
  le retournement moral écologique sont écrits, pas encore montés en mission jouable.
- Remplacement des dernières primitives par des modèles Rodin dédiés (tourelles/
  hangars d'astéroïde, voir §7 niveau 2).

Phase "contenu" (itération, transférable à Opus 4.8) : nouvelles missions, ennemis,
équilibrage, intégration d'assets, écrans d'UI, sons.
