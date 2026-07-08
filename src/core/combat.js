// Règles de dégâts/bouclier partagées entre le joueur et ses ailiers PNJ —
// un seul endroit à ajuster pour que tout l'escadron reste sous les mêmes règles.
export const MAX_HP = 100;
export const REGEN_DELAY = 5; // secondes sans dégât avant régénération du bouclier
export const REGEN_RATE = 4; // points par seconde

export const DIFFICULTIES = {
  pilot: {
    id: 'pilot',
    label: 'PILOTE',
    playerDamageMultiplier: 1,
    receivedDamageMultiplier: 1,
    fireCooldownMultiplier: 1,
    regenRateMultiplier: 1,
    enemyAggressionMultiplier: 1,
  },
  cadet: {
    id: 'cadet',
    label: 'CADET',
    playerDamageMultiplier: 2,
    receivedDamageMultiplier: 0.5,
    fireCooldownMultiplier: 0.5,
    regenRateMultiplier: 2,
    enemyAggressionMultiplier: 0.65,
  },
};

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.pilot;
}
