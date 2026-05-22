// =====================================================================
// FILE: server.js
// Entry point: Express + Socket.IO + static files
// Run: node server.js
// =====================================================================
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { STAKE_TIERS } = require('./src/constants');
const { initLobbyRooms, rooms } = require('./src/lobby');
const { registerEvents } = require('./src/events');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Static files (HTML/CSS/JS frontend)
app.use(express.static(path.join(__dirname, 'static')));

app.get('/health', (req, res) => res.send('ok'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// API: leaderboard
app.get('/api/leaderboard', (req, res) => {
  const { getLeaderboard } = require('./src/db');
  const type = req.query.type || 'chips';
  const limit = parseInt(req.query.limit) || 20;
  res.json({ type, entries: getLeaderboard(type, limit) });
});

// API: player stats
app.get('/api/stats/:name', (req, res) => {
  const { getPlayerStats } = require('./src/db');
  const stats = getPlayerStats(req.params.name);
  if (!stats) return res.status(404).json({ error: 'not found' });
  res.json(stats);
});

// Initialize and register
initLobbyRooms();
registerEvents(io);

const PORT = parseInt(process.env.PORT) || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TEXAS HOLD\'EM POKER — Premium Edition');
  console.log(`  Port: ${PORT}`);
  console.log(`  Tiers: ${STAKE_TIERS.map(t => t.name).join(', ')}`);
  console.log(`  Rooms: ${rooms.size} (${STAKE_TIERS.length} tier × 2)`);
  console.log('  Min oyunçu / masa: 4   ·   Max: 6');
  console.log('  30 saniyə auto-start interval');
  console.log('  SQLite persistent chips & stats');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

