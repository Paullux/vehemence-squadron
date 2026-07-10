import { Game } from './core/Game.js';
import { preloadShipModels } from './core/ShipModel.js';
import { initAnalytics, trackEvent } from './core/Analytics.js';
import { assetUrl } from './core/assetUrl.js';
import { HERO_MODEL } from './entities/PlayerShip.js';
import { ENEMY_TYPES } from './entities/Targets.js';
import { MOTHERSHIP_MODEL } from './entities/MothershipBoss.js';
import { VEHEMENCE_MODEL } from './entities/VehemenceDefense.js';
import { SHIELD_SATELLITE_MODEL } from './entities/ShieldSatelliteAssault.js';
import { HEGEMONY_CAPITAL_MODEL } from './entities/HegemonyCanyonRun.js';

let game = null;
let starting = false;

const intro = document.getElementById('intro');
const introVideo = document.getElementById('intro-video');
const introPlay = document.getElementById('intro-play');
const introStart = document.getElementById('intro-start');
const introHighscoresToggle = document.getElementById('intro-highscores-toggle');
const introAudioToggle = document.getElementById('intro-audio-toggle');
const introSaveToggle = document.getElementById('intro-save-toggle');
const introHighscoresPanel = document.getElementById('intro-highscores-panel');
const introHighscores = document.getElementById('intro-highscores');
const introAudioPanel = document.getElementById('intro-audio-panel');
const introSavePanel = document.getElementById('intro-save-panel');
const introSaveStatus = document.getElementById('intro-save-status');
const introClearSave = document.getElementById('intro-clear-save');
const introAudioControls = {
  master: document.getElementById('intro-audio-master'),
  music: document.getElementById('intro-audio-music'),
  sfx: document.getElementById('intro-audio-sfx'),
  voice: document.getElementById('intro-audio-voice'),
};
const introAudioLabels = {
  master: document.getElementById('intro-audio-master-value'),
  music: document.getElementById('intro-audio-music-value'),
  sfx: document.getElementById('intro-audio-sfx-value'),
  voice: document.getElementById('intro-audio-voice-value'),
};
const mission01 = document.getElementById('mission-01');
const mission02 = document.getElementById('mission-02');
const mission03 = document.getElementById('mission-03');
const mission04 = document.getElementById('mission-04');
const mission05 = document.getElementById('mission-05');
const mission06 = document.getElementById('mission-06');
const difficultyPilot = document.getElementById('difficulty-pilot');
const difficultyCadet = document.getElementById('difficulty-cadet');
const introSkip = document.getElementById('intro-skip');
const privacyBanner = document.getElementById('privacy-banner');
const privacyAccept = document.getElementById('privacy-accept');
const privacyReject = document.getElementById('privacy-reject');
const missionBrief = document.getElementById('mission-brief');
const missionKicker = document.getElementById('mission-kicker');
const missionTitle = document.getElementById('mission-title');
const missionCopy = document.getElementById('mission-copy');
const missionObjectiveText = document.getElementById('mission-objective-text');
const missionProgress = document.getElementById('mission-progress');
const missionStatus = document.getElementById('mission-status');
const hud = document.getElementById('hud');
const AUDIO_SETTINGS_KEY = 'vehemence.audio';
const MISSION_SAVE_KEY = 'vehemence.missionSave';
const HIGH_SCORES_KEY = 'vehemence.highScores';
const DEFAULT_AUDIO_SETTINGS = {
  master: 0.72,
  music: 0.42,
  sfx: 0.85,
  voice: 2.2,
};
const HIGH_SCORE_MISSIONS = [
  ['mission01', 'Mission 1'],
  ['mission02', 'Mission 2'],
  ['mission03', 'Mission 3'],
  ['mission04', 'Mission 4'],
  ['mission05', 'Mission 5'],
  ['mission06', 'Mission 6'],
];
const DEFAULT_HIGH_SCORES = {
  pilot: {
    mission01: { name: 'RENARD', score: 580 },
    mission02: { name: 'ORION', score: 520 },
    mission03: { name: 'COBRA', score: 470 },
    mission04: { name: 'NOVA', score: 410 },
    mission05: { name: 'LYNX', score: 350 },
    mission06: { name: 'CORBEAU', score: 290 },
  },
  cadet: {
    mission01: { name: 'ASTER', score: 420 },
    mission02: { name: 'VEGA', score: 360 },
    mission03: { name: 'SIRIUS', score: 310 },
    mission04: { name: 'MIRAGE', score: 260 },
    mission05: { name: 'ATLAS', score: 190 },
    mission06: { name: 'ECHO', score: 120 },
  },
};

const MODEL_PRELOADS = [
  HERO_MODEL,
  ...Object.values(ENEMY_TYPES),
  MOTHERSHIP_MODEL,
  VEHEMENCE_MODEL,
  SHIELD_SATELLITE_MODEL,
  HEGEMONY_CAPITAL_MODEL,
];
const MIN_BRIEF_DURATION = 30000;
let selectedMission = 'mission01';
let selectedDifficulty = 'pilot';

function loadIntroAudioSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY));
    return { ...DEFAULT_AUDIO_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function saveIntroAudioSettings(settings) {
  localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
}

function updateIntroAudioControl(key, value) {
  if (introAudioControls[key]) introAudioControls[key].value = Math.round(value * 100);
  if (introAudioLabels[key]) introAudioLabels[key].textContent = Math.round(value * 100);
}

function setupIntroAudioControls() {
  const settings = loadIntroAudioSettings();
  for (const [key, control] of Object.entries(introAudioControls)) {
    if (!control) continue;
    updateIntroAudioControl(key, settings[key]);
    control.addEventListener('input', () => {
      settings[key] = Number(control.value) / 100;
      saveIntroAudioSettings(settings);
      updateIntroAudioControl(key, settings[key]);
    });
  }
}

function readMissionSave() {
  try {
    return JSON.parse(localStorage.getItem(MISSION_SAVE_KEY));
  } catch {
    return null;
  }
}

function updateIntroSaveStatus() {
  if (!introSaveStatus) return;
  const save = readMissionSave();
  if (!save) {
    introSaveStatus.textContent = 'Aucune sauvegarde de mission.';
    return;
  }
  const date = new Date(save.savedAt).toLocaleString('fr-FR');
  const boss = save.bossStarted ? ` Boss ${Math.round(save.bossProgress * 100)}%.` : '';
  introSaveStatus.textContent = `Derniere sauvegarde : ${date}. Score ${save.score}, bouclier ${save.hp}%, temps ${save.missionTime}s.${boss}`;
}

function updateIntroHighScores() {
  if (!introHighscores) return;
  let scores = DEFAULT_HIGH_SCORES;
  try {
    scores = { ...DEFAULT_HIGH_SCORES, ...(JSON.parse(localStorage.getItem(HIGH_SCORES_KEY)) || {}) };
  } catch {
    scores = DEFAULT_HIGH_SCORES;
  }
  introHighscores.innerHTML = ['pilot', 'cadet'].map((difficulty) => {
    const title = difficulty === 'pilot' ? 'PILOTE' : 'CADET';
    const rows = HIGH_SCORE_MISSIONS.map(([id, label]) => {
      const entry = scores?.[difficulty]?.[id] || DEFAULT_HIGH_SCORES[difficulty][id];
      const score = Math.max(0, Math.floor(Number(entry.score ?? entry) || 0));
      const name = String(entry.name || 'AQUILA').slice(0, 10).toUpperCase();
      return `<li>${label} - ${name}<span>${score}</span></li>`;
    }).join('');
    return `<section><h3>${title}</h3><ol>${rows}</ol></section>`;
  }).join('');
}

function setIntroTool(tool) {
  const highScores = tool === 'scores';
  const audio = tool === 'audio';
  const save = tool === 'save';
  introHighscoresToggle?.classList.toggle('active', highScores);
  introAudioToggle?.classList.toggle('active', audio);
  introSaveToggle?.classList.toggle('active', save);
  introHighscoresToggle?.setAttribute('aria-pressed', highScores ? 'true' : 'false');
  introAudioToggle?.setAttribute('aria-pressed', audio ? 'true' : 'false');
  introSaveToggle?.setAttribute('aria-pressed', save ? 'true' : 'false');
  introHighscoresPanel?.classList.toggle('hidden', !highScores);
  introAudioPanel?.classList.toggle('hidden', !audio);
  introSavePanel?.classList.toggle('hidden', !save);
  if (highScores) updateIntroHighScores();
  if (save) updateIntroSaveStatus();
}

function requestInitialPointerLock() {
  if (document.pointerLockElement) return;
  try {
    const lock = document.body.requestPointerLock?.();
    lock?.catch?.(() => {});
  } catch {
    // Le clic manuel sur le jeu restera disponible si le navigateur refuse.
  }
}

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
  mission04: {
    kicker: "MISSION 4 // DIRECTEMENT CHEZ L'HEGEMONIE",
    title: 'BRISER LE BOUCLIER PLANETAIRE',
    copy:
      "Aquila entre dans le système de l'Hégémonie. La planète rouge est protégée par des satellites qui maintiennent un champ de force orbital.",
    objective: 'Mode libre orbital : contourner la planète, détruire les satellites-boucliers.',
  },
  mission05: {
    kicker: "MISSION 5 // COULOIR DE LA CAPITALE",
    title: "PLONGER VERS LA CAPITALE",
    copy:
      "Le bouclier est ouvert. Aquila redescend dans les canyons de la planète rouge pour atteindre la capitale de l'Hégémonie.",
    objective: 'Vol sur rails : éviter montagnes et canyons, abattre les chasseurs, atteindre la capitale.',
  },
  mission06: {
    kicker: "MISSION 6 // ASSAUT AU SOL",
    title: "MARCHER SUR LA CAPITALE",
    copy:
      "Le Véhémence a posé ses troupes. L'armée de la Confédération avance au sol vers la capitale de l'Hégémonie.",
    objective: "Assaut terrestre en troisième personne : progresser avec les troupes alliées et briser les lignes de soldats ennemis.",
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
  trackEvent('difficulty_selected', { difficulty });
}

function setMission(missionId) {
  selectedMission = missionId;
  mission01.classList.toggle('active', missionId === 'mission01');
  mission02.classList.toggle('active', missionId === 'mission02');
  mission03.classList.toggle('active', missionId === 'mission03');
  mission04.classList.toggle('active', missionId === 'mission04');
  mission05.classList.toggle('active', missionId === 'mission05');
  mission06.classList.toggle('active', missionId === 'mission06');
  mission01.setAttribute('aria-pressed', missionId === 'mission01' ? 'true' : 'false');
  mission02.setAttribute('aria-pressed', missionId === 'mission02' ? 'true' : 'false');
  mission03.setAttribute('aria-pressed', missionId === 'mission03' ? 'true' : 'false');
  mission04.setAttribute('aria-pressed', missionId === 'mission04' ? 'true' : 'false');
  mission05.setAttribute('aria-pressed', missionId === 'mission05' ? 'true' : 'false');
  mission06.setAttribute('aria-pressed', missionId === 'mission06' ? 'true' : 'false');
  trackEvent('mission_selected', { missionId });
}

async function startGame(difficulty = selectedDifficulty, options = {}) {
  if (game || starting) return;
  starting = true;
  trackEvent('game_start', {
    missionId: selectedMission,
    difficulty,
    skipBrief: options.skipBrief ? 1 : 0,
    initialScore: options.initialScore || 0,
  });
  const brief = MISSION_BRIEFS[selectedMission];
  missionKicker.textContent = brief.kicker;
  missionTitle.textContent = brief.title;
  missionCopy.textContent = brief.copy;
  missionObjectiveText.textContent = brief.objective;
  introVideo.pause();
  intro.classList.add('hidden');
  missionBrief.classList.remove('hidden');
  missionStatus.textContent = 'CHARGEMENT DES MODELES 3D';
  missionProgress.style.transform = 'scaleX(0.08)';
  const briefStartedAt = performance.now();
  const briefDuration = options.skipBrief ? 1200 : MIN_BRIEF_DURATION;
  const progressTimer = setInterval(() => {
    const elapsed = performance.now() - briefStartedAt;
    missionProgress.style.transform = `scaleX(${Math.min(0.94, elapsed / briefDuration)})`;
  }, 100);

  const preloadTasks = [
    preloadShipModels(MODEL_PRELOADS),
    new Promise((resolve) => setTimeout(resolve, briefDuration)),
  ];
  if (selectedMission !== 'mission05' && selectedMission !== 'mission06') {
    preloadTasks.push(preloadImage(assetUrl('/images/interieur_vehemence.png')));
  }
  await Promise.all(preloadTasks);
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
  trackEvent('intro_transmission_started', { difficulty: selectedDifficulty });
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
mission04.addEventListener('click', () => setMission('mission04'));
mission05.addEventListener('click', () => setMission('mission05'));
mission06.addEventListener('click', () => setMission('mission06'));
difficultyPilot.addEventListener('click', () => setDifficulty('pilot'));
difficultyCadet.addEventListener('click', () => setDifficulty('cadet'));
introStart.addEventListener('click', () => {
  requestInitialPointerLock();
  startGame();
});
introSkip.addEventListener('click', () => {
  requestInitialPointerLock();
  startGame();
});
introVideo.addEventListener('ended', () => startGame());
introVideo.addEventListener('error', () => startGame());
introHighscoresToggle?.addEventListener('click', () => setIntroTool('scores'));
introAudioToggle?.addEventListener('click', () => setIntroTool('audio'));
introSaveToggle?.addEventListener('click', () => setIntroTool('save'));
introClearSave?.addEventListener('click', () => {
  localStorage.removeItem(MISSION_SAVE_KEY);
  updateIntroSaveStatus();
  trackEvent('save_cleared');
});
initAnalytics({ banner: privacyBanner, accept: privacyAccept, reject: privacyReject });
setupIntroAudioControls();
updateIntroSaveStatus();
updateIntroHighScores();

if (
  requestedMission === 'mission01' ||
  requestedMission === 'mission02' ||
  requestedMission === 'mission03' ||
  requestedMission === 'mission04' ||
  requestedMission === 'mission05' ||
  requestedMission === 'mission06'
) {
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
