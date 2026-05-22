// =====================================================================
// FILE: src/constants.js
// Configuration values
// =====================================================================

// (id, name, sb, bb, buy_in, min_players, max_players)
const STAKE_TIERS = [
  { id: 'micro', name: 'Micro · 0.20/0.40', sb: 0.20, bb: 0.40, buyIn: 20, minPlayers: 4, maxPlayers: 6 },
  { id: 'low',   name: 'Low · 1/2',         sb: 1,    bb: 2,    buyIn: 100, minPlayers: 4, maxPlayers: 6 },
  { id: 'mid',   name: 'Mid · 5/10',        sb: 5,    bb: 10,   buyIn: 500, minPlayers: 4, maxPlayers: 6 },
  { id: 'high',  name: 'High · 25/50',      sb: 25,   bb: 50,   buyIn: 2500, minPlayers: 4, maxPlayers: 6 },
  { id: 'vip',   name: 'VIP · 100/200',     sb: 100,  bb: 200,  buyIn: 10000, minPlayers: 4, maxPlayers: 6 },
  { id: 'elite', name: 'Elite · 500/1000',  sb: 500,  bb: 1000, buyIn: 50000, minPlayers: 4, maxPlayers: 6 },
];

const AVATARS = ['🦁', '🐯', '🐺', '🦊', '🐻', '🐼', '🐸', '🦅', '🐲', '🦄', '👑', '🎭'];

const TURN_TIMEOUT = 30;        // seconds for player turn
const AUTOSTART_WAIT = 30;      // seconds before auto-start when min players reached

const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind',
  'Straight Flush', 'Royal Flush',
];

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VAL = {};
RANKS.forEach((r, i) => { RANK_VAL[r] = i + 2; });

const STARTING_CHIPS = 10000;   // chips for new players

module.exports = {
  STAKE_TIERS,
  AVATARS,
  TURN_TIMEOUT,
  AUTOSTART_WAIT,
  HAND_NAMES,
  SUITS,
  RANKS,
  RANK_VAL,
  STARTING_CHIPS,
};
