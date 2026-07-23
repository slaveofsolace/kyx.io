export const GAME_MODES = [
  {
    id:        'deathmatch',
    name:      'OFFLINE PRACTICE',
    icon:      '⚔',
    tag:       'SOLO',
    desc:      'One local player versus seven explicitly labeled practice bots for eight minutes.',
    color:     '#ff5c5c',
    botCount:  7,
    noRespawn: false,
    timeLimit: 480,
    lives:     Infinity,
    waves:     false,
    isZombie:  false,
  },
  {
    id:        'survival',
    name:      'SOLO WAVE PRACTICE',
    icon:      '🧟',
    tag:       'SOLO',
    desc:      'Local solo wave defense with automatic recovery. No teammates or online session.',
    color:     '#44cc22',
    botCount:  0,
    noRespawn: true,
    timeLimit: 0,
    lives:     Infinity,
    waves:     false,
    isZombie:  true,
  },
];

export function getMode(id) {
  return GAME_MODES.find(m => m.id === id) || GAME_MODES[0];
}
