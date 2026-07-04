import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.start();

// Accès debug depuis la console du navigateur
window.game = game;
