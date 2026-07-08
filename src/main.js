import { Game } from './core/Game.js';
import { preloadShipModels } from './core/ShipModel.js';
import { assetUrl } from './core/assetUrl.js';
import { HERO_MODEL } from './entities/PlayerShip.js';
import { ENEMY_TYPES } from './entities/Targets.js';
import { MOTHERSHIP_MODEL } from './entities/MothershipBoss.js';
import { VEHEMENCE_MODEL } from './entities/VehemenceDefense.js';

let game = null;
let starting = false;

const intro = document.getElementById('intro');
const introVideo = document.getElementById('intro-video');
const introPlay = document.getElementById('intro-play');
const introStart = document.getElementById('intro-start');
const mission01 = document.getElementById('mission-01');
const mission02 = document.getElementById('mission-02');
const mission03 = document.getElementById('mission-03');
const difficultyPilot = document.getElementById('difficulty-pilot');
const difficultyCadet = document.getElementById('difficulty-cadet');
const introSkip = document.getElementById('intro-skip');
const missionBrief = document.getElementById('mission-brief');
const missionKicker = document.getElementById('mission-kicker');
const missionTitle = document.getElementById('mission-title');
const missionCopy = document.getElementById('mission-copy');
const missionObjectiveText = document.getElementById('mission-objective-text');
const missionProgress = document.getElementById('mission-progress');
const missionStatus = document.getElementById('mission-status');
const hud = document.getElementById('hud');

const MODEL_PRELOADS = [HERO_MODEL, ...Object.values(ENEMY_TYPES), MOTHERSHIP_MODEL, VEHEMENCE_MODEL];
const MIN_BRIEF_DURATION = 30000;
let selectedMission = 'mission01';
let selectedDifficulty = 'pilot';

const MISSION_BRIEFS = {
  mission01: {
    kicker: 'BRIEFING DE MISSION // ROUTE KHAROS-3',
    title: 'LIBERER LA ROUTE COMMERCIALE',
    copy:
      "Le Vehemence ouvre une fenêtre de lancement. Votre escadron doit arriver à libérer au maximum cette route commerciale de l'Hégémonie du Vide.",
    objective: "Abattre les patrouilles, tenir le corridor, préserver l'escadron Aquila.",
  },
  mission02: {
    kicker: 'BRIEFING DE MISSION // COURONNE ROUGE',
    title: 'INFILTRER LE CHAMP DE DEBRIS',
    copy:
      "Les restes du vaisseau-mere dérivent vers la géante rouge. Aquila doit traverser le champ d'astéroïdes et neutraliser la base camouflée de l'Hégémonie.",
    objective: 'Eviter les astéroïdes, détruire les tourelles rouges, faire exploser la base-astéroïde.',
  },
  mission03: {
    kicker: 'BRIEFING DE MISSION // DEFENSE DU VEHEMENCE',
    title: 'TENIR LA LIGNE',
    copy:
      "L'Hégémonie a localisé le Vehemence. Aquila redécolle au coeur de la bataille pour briser les vagues d'assaut avant qu'elles ne percent son bouclier.",
    objective: 'Défendre le Vehemence, intercepter les chasseurs, neutraliser artillerie et destroyers ennemis.',
  },
};

const launchParams = new URLSearchParams(location.search);
const requestedMission = launchParams.get('mission');
const requestedDifficulty = launchParams.get('difficulty');
const requestedScore = Math.max(0, Math.floor(Number(launchParams.get('score')) || 0));
const shouldAutostart = launchParams.get('autostart') === '1';
const shouldSkipBrief = launchParams.get('skipBrief') === '1';

function preloadImage(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = path;
  });
}

function setDifficulty(difficulty) {
  selectedDifficulty = difficulty;
  difficultyPilot.classList.toggle('active', difficulty === 'pilot');
  difficultyCadet.classList.toggle('active', difficulty === 'cadet');
  difficultyPilot.setAttribute('aria-pressed', difficulty === 'pilot' ? 'true' : 'false');
  difficultyCadet.setAttribute('aria-pressed', difficulty === 'cadet' ? 'true' : 'false');
}

function setMission(missionId) {
  selectedMission = missionId;
  mission01.classList.toggle('active', missionId === 'mission01');
  mission02.classList.toggle('active', missionId === 'mission02');
  mission03.classList.toggle('active', missionId === 'mission03');
  mission01.setAttribute('aria-pressed', missionId === 'mission01' ? 'true' : 'false');
  mission02.setAttribute('aria-pressed', missionId === 'mission02' ? 'true' : 'false');
  mission03.setAttribute('aria-pressed', missionId === 'mission03' ? 'true' : 'false');
}

async function startGame(difficulty = selectedDifficulty, options = {}) {
  if (game || starting) return;
  starting = true;
  const brief = MISSION_BRIEFS[selectedMission];
  missionKicker.textContent = brief.kicker;
  missionTitle.textContent = brief.title;
  missionCopy.textContent = brief.copy;
  missionObjectiveText.textContent = brief.objective;
  introVideo.pause();
  intro.classList.add('hidden');
  missionBrief.classList.remove('hidden');
  missionStatus.textContent = 'CHARGEMENT DES APPAREILS 3D';
  missionProgress.style.transform = 'scaleX(0.08)';
  const briefStartedAt = performance.now();
  const briefDuration = options.skipBrief ? 1200 : MIN_BRIEF_DURATION;
  const progressTimer = setInterval(() => {
    const elapsed = performance.now() - briefStartedAt;
    missionProgress.style.transform = `scaleX(${Math.min(0.94, elapsed / briefDuration)})`;
  }, 100);

  await Promise.all([
    preloadShipModels(MODEL_PRELOADS),
    preloadImage(assetUrl('/images/interieur_vehemence.png')),
    new Promise((resolve) => setTimeout(resolve, briefDuration)),
  ]);
  clearInterval(progressTimer);

  missionStatus.textContent = 'AUTORISATION DE DEPART ACCORDEE';
  missionProgress.style.transform = 'scaleX(1)';
  await new Promise((resolve) => setTimeout(resolve, 350));

  missionBrief.classList.add('hidden');
  hud.classList.remove('hidden');
  // Curseur masqué dès le lancement (façon FPS) ; réaffiché par Game au
  // game over / à la fin de mission pour cliquer les boutons de l'écran.
  document.body.classList.add('cursor-hidden');

  game = new Game(document.getElementById('app'), {
    difficulty,
    missionId: selectedMission,
    initialScore: options.initialScore || 0,
  });
  // Accès debug depuis la console du navigateur
  window.game = game;
  game.start();
}

async function playIntro() {
  intro.classList.add('playing');
  introSkip.classList.remove('hidden');
  try {
    introVideo.currentTime = 0;
    await introVideo.play();
  } catch (err) {
    console.warn('Lecture de la cinématique impossible, démarrage du jeu.', err);
    startGame();
  }
}

introPlay.addEventListener('click', playIntro);
mission01.addEventListener('click', () => setMission('mission01'));
mission02.addEventListener('click', () => setMission('mission02'));
mission03.addEventListener('click', () => setMission('mission03'));
difficultyPilot.addEventListener('click', () => setDifficulty('pilot'));
difficultyCadet.addEventListener('click', () => setDifficulty('cadet'));
introStart.addEventListener('click', () => startGame());
introSkip.addEventListener('click', () => startGame());
introVideo.addEventListener('ended', () => startGame());
introVideo.addEventListener('error', () => startGame());

if (requestedMission === 'mission01' || requestedMission === 'mission02' || requestedMission === 'mission03') {
  setMission(requestedMission);
}
if (requestedDifficulty === 'pilot' || requestedDifficulty === 'cadet') setDifficulty(requestedDifficulty);
if (shouldAutostart) {
  setTimeout(() => startGame(selectedDifficulty, { skipBrief: shouldSkipBrief, initialScore: requestedScore }), 0);
}

addEventListener('keydown', (event) => {
  if (game || starting) return;
  if (event.code === 'Escape') startGame();
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (intro.classList.contains('playing')) startGame();
    else playIntro();
  }
});
