import { Game } from './core/Game.js';

let game = null;

const intro = document.getElementById('intro');
const introVideo = document.getElementById('intro-video');
const introPlay = document.getElementById('intro-play');
const introStart = document.getElementById('intro-start');
const introSkip = document.getElementById('intro-skip');
const hud = document.getElementById('hud');

function startGame() {
  if (game) return;
  introVideo.pause();
  intro.classList.add('hidden');
  hud.classList.remove('hidden');

  game = new Game(document.getElementById('app'));
  game.start();

  // Accès debug depuis la console du navigateur
  window.game = game;
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
  if (game) return;
  if (event.code === 'Escape') startGame();
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (intro.classList.contains('playing')) startGame();
    else playIntro();
  }
});
