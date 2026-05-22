// =====================================================================
// FILE: src/db.js
// SQLite database for player accounts, statistics, and leaderboard
// =====================================================================
const Database = require('better-sqlite3');
const path = require('path');
const { STARTING_CHIPS } = require('./constants');

const dbPath = path.join(__dirname, '..', 'data', 'poker.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    avatar TEXT NOT NULL DEFAULT '🦁',
    chips REAL NOT NULL DEFAULT ${STARTING_CHIPS},
    hands_played INTEGER DEFAULT 0,
    hands_won INTEGER DEFAULT 0,
    total_winnings REAL DEFAULT 0,
    biggest_pot REAL DEFAULT 0,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hand_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    room_id TEXT,
    won INTEGER DEFAULT 0,
    amount REAL DEFAULT 0,
    hand_name TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_players_chips ON players(chips DESC);
  CREATE INDEX IF NOT EXISTS idx_players_winnings ON players(total_winnings DESC);
  CREATE INDEX IF NOT EXISTS idx_history_player ON hand_history(player_name);
`);

const stmts = {
  getPlayer: db.prepare('SELECT * FROM players WHERE name = ?'),
  createPlayer: db.prepare(`
    INSERT INTO players (name, avatar, chips) VALUES (?, ?, ?)
  `),
  updateChips: db.prepare('UPDATE players SET chips = ? WHERE name = ?'),
  updateAvatar: db.prepare('UPDATE players SET avatar = ?, last_login = CURRENT_TIMESTAMP WHERE name = ?'),
  recordHand: db.prepare(`
    UPDATE players
    SET hands_played = hands_played + 1,
        hands_won = hands_won + ?,
        total_winnings = total_winnings + ?,
        biggest_pot = MAX(biggest_pot, ?)
    WHERE name = ?
  `),
  logHand: db.prepare(`
    INSERT INTO hand_history (player_name, room_id, won, amount, hand_name)
    VALUES (?, ?, ?, ?, ?)
  `),
  leaderboardChips: db.prepare(`
    SELECT name, avatar, chips, hands_played, hands_won, total_winnings
    FROM players
    ORDER BY chips DESC
    LIMIT ?
  `),
  leaderboardWinnings: db.prepare(`
    SELECT name, avatar, chips, hands_played, hands_won, total_winnings, biggest_pot
    FROM players
    ORDER BY total_winnings DESC
    LIMIT ?
  `),
  playerStats: db.prepare(`
    SELECT name, avatar, chips, hands_played, hands_won, total_winnings, biggest_pot
    FROM players
    WHERE name = ?
  `),
  resetChips: db.prepare(`UPDATE players SET chips = ? WHERE name = ?`),
};

function getOrCreatePlayer(name, avatar) {
  let player = stmts.getPlayer.get(name);
  if (!player) {
    stmts.createPlayer.run(name, avatar, STARTING_CHIPS);
    player = stmts.getPlayer.get(name);
  } else {
    stmts.updateAvatar.run(avatar, name);
    player = stmts.getPlayer.get(name);
  }
  return player;
}

function updatePlayerChips(name, chips) {
  stmts.updateChips.run(Math.max(0, chips), name);
}

function recordHandResult(name, won, amount, handName, roomId) {
  stmts.recordHand.run(won ? 1 : 0, amount, amount, name);
  stmts.logHand.run(name, roomId || '', won ? 1 : 0, amount, handName || '');
}

function getLeaderboard(type = 'chips', limit = 20) {
  if (type === 'winnings') {
    return stmts.leaderboardWinnings.all(limit);
  }
  return stmts.leaderboardChips.all(limit);
}

function getPlayerStats(name) {
  return stmts.playerStats.get(name);
}

function refillChipsIfBusted(name) {
  // Free re-buy if player goes bust (bonus feature for online demo)
  const player = stmts.getPlayer.get(name);
  if (player && player.chips < 100) {
    stmts.resetChips.run(STARTING_CHIPS, name);
    return STARTING_CHIPS;
  }
  return player ? player.chips : STARTING_CHIPS;
}

module.exports = {
  db,
  getOrCreatePlayer,
  updatePlayerChips,
  recordHandResult,
  getLeaderboard,
  getPlayerStats,
  refillChipsIfBusted,
};
