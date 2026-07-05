import { Game } from './core/Game.js';
import { preloadShipModels } from './core/ShipModel.js';
import { HERO_MODEL } from './entities/PlayerShip.js';
import { ENEMY_TYPES } from './entities/Targets.js';
import { MOTHERSHIP_MODEL } from './entities/MothershipBoss.js';

let game = null;
let starting = false;

const intro = document.getElementById('intro');
const introVideo = document.getElementById('intro-video');
const introPlay = document.getElementById('intro-play');
const introStart = document.getElementById('intro-start');
const introSkip = document.getElementById('intro-skip');
const missionBrief = document.getElementById('mission-brief');
const missionProgress = document.getElementById('mission-progress');
const missionStatus = document.getElementById('mission-status');
const hud = document.getElementById('hud');

const MODEL_PRELOADS = [HERO_MODEL, ...Object.values(ENEMY_TYPES), MOTHERSHIP_MODEL];
const MIN_BRIEF_DURATION = 30000;

function preloadImage(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = path;
  });
}

async function startGame() {
  if (game || starting) return;
  starting = true;
  introVideo.pause();
  intro.classList.add('hidden');
  missionBrief.classList.remove('hidden');
  missionStatus.textContent = 'CHARGEMENT DES APPAREILS 3D';
  missionProgress.style.transform = 'scaleX(0.08)';
  const briefStartedAt = performance.now();
  const progressTimer = setInterval(() => {
    const elapsed = performance.now() - briefStartedAt;
    missionProgress.style.transform = `scaleX(${Math.min(0.94, elapsed / MIN_BRIEF_DURATION)})`;
  }, 100);

  await Promise.all([
    preloadShipModels(MODEL_PRELOADS),
    preloadImage('/images/interieur_vehemence.png'),
    new Promise((resolve) => setTimeout(resolve, MIN_BRIEF_DURATION)),
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

  game = new Game(document.getElementById('app'));
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
introStart.addEventListener('click', startGame);
introSkip.addEventListener('click', startGame);
introVideo.addEventListener('ended', startGame);
introVideo.addEventListener('error', startGame);

addEventListener('keydown', (event) => {
  if (game || starting) return;
  if (event.code === 'Escape') startGame();
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (intro.classList.contains('playing')) startGame();
    else playIntro();
  }
});
