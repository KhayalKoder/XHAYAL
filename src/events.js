// =====================================================================
// FILE: src/events.js
// Socket.IO event handlers
// =====================================================================
const { AVATARS } = require('./constants');
const {
  rooms, lobbyUsers,
  lobbySnapshot, tableSnapshot,
  broadcastLobby, broadcastTableUpdate, broadcastResult,
} = require('./lobby');
const {
  getOrCreatePlayer, updatePlayerChips, getLeaderboard, getPlayerStats,
} = require('./db');

let ioRef = null;

// Auto-start callback (referenced from lobby.js)
function autoStartRoom(room) {
  const io = ioRef;
  if (!io) return;
  if (room.phase !== 'waiting') return;
  if (room.players.size < room.minPlayers) return;

  room.startRound();
  const state = room.getState();

  // Send to active players with their own hand
  for (const sid of room.players.keys()) {
    const p = room.players.get(sid);
    const yourTurn = room.toAct.length > 0 && room.toAct[0] === sid;
    io.to(sid).emit('round_started', {
      hand: p.hand,
      state,
      players: room.publicPlayers([sid]),
      sb: room.SB,
      bb: room.BB,
      your_turn: yourTurn,
    });
  }

  // Spectators (no cards)
  for (const sid of room.spectators) {
    io.to(sid).emit('round_started', {
      hand: [],
      state,
      players: room.publicPlayers(),
      sb: room.SB,
      bb: room.BB,
      your_turn: false,
    });
  }

  broadcastLobby(io);
}

// Autofold callback
function autofoldPlayer(room, sid) {
  const io = ioRef;
  if (!io || !room.players.has(sid)) return;
  const name = room.players.get(sid).name;
  const result = room.applyFold(sid);
  io.to(room.roomId).emit('player_autofold', { name });
  broadcastResult(io, room, result, `${name} vaxt keçdiyinə görə fold etdi`, 'FOLD');
}

function registerEvents(io) {
  ioRef = io;

  io.on('connection', (socket) => {
    const sid = socket.id;
    console.log(`[+] ${sid}`);

    socket.on('disconnect', () => {
      console.log(`[-] ${sid}`);
      lobbyUsers.delete(sid);

      for (const [roomId, room] of rooms) {
        if (room.spectators.has(sid)) {
          room.spectators.delete(sid);
          socket.leave(roomId);
          broadcastTableUpdate(io, room);
        }
        if (room.players.has(sid)) {
          const p = room.players.get(sid);
          updatePlayerChips(p.name, p.chips);
          const name = p.name;
          if (!['waiting', 'hand_over', 'showdown'].includes(room.phase)) {
            if (room.toAct.length > 0 && room.toAct[0] === sid) {
              const result = room.applyFold(sid);
              io.to(roomId).emit('player_autofold', { name });
              broadcastResult(io, room, result, `${name} ayrıldı → fold`, 'FOLD');
            } else if (p.inHand && !p.folded) {
              p.folded = true;
              p.inHand = false;
              const idx = room.toAct.indexOf(sid);
              if (idx >= 0) room.toAct.splice(idx, 1);
            }
          }
          room.players.delete(sid);
          if (room.players.size < room.minPlayers) room.cancelAutostart();
          io.to(roomId).emit('player_left', { name });
          broadcastTableUpdate(io, room);
        }
      }
      broadcastLobby(io);
    });

    // ---------- LOBBY ----------
    socket.on('lobby_join', (data = {}) => {
      const rawName = (data.name || 'Player').toString().slice(0, 16);
      let avatar = data.avatar || AVATARS[0];
      if (!AVATARS.includes(avatar)) avatar = AVATARS[0];

      // Get or create persistent player record
      const player = getOrCreatePlayer(rawName, avatar);

      lobbyUsers.set(sid, { name: player.name, avatar, chips: player.chips });
      socket.join('LOBBY');
      io.to('LOBBY').emit('lobby_sys', { msg: `${avatar} ${player.name} lobbiyə qoşuldu` });
      broadcastLobby(io);
      socket.emit('lobby_state', lobbySnapshot());
      socket.emit('your_profile', {
        name: player.name,
        avatar,
        chips: player.chips,
        hands_played: player.hands_played,
        hands_won: player.hands_won,
        total_winnings: player.total_winnings,
        biggest_pot: player.biggest_pot,
      });
    });

    socket.on('lobby_chat', (data = {}) => {
      if (!lobbyUsers.has(sid)) return;
      const msg = (data.msg || '').toString().trim().slice(0, 120);
      if (!msg) return;
      const u = lobbyUsers.get(sid);
      io.to('LOBBY').emit('lobby_chat', {
        sid, name: u.name, avatar: u.avatar, msg,
      });
    });

    // ---------- LEADERBOARD / STATS ----------
    socket.on('get_leaderboard', (data = {}) => {
      const type = data.type || 'chips';
      const board = getLeaderboard(type, 20);
      socket.emit('leaderboard_data', { type, entries: board });
    });

    socket.on('get_stats', (data = {}) => {
      const name = data.name || (lobbyUsers.get(sid) || {}).name;
      if (!name) return;
      const stats = getPlayerStats(name);
      if (stats) socket.emit('stats_data', stats);
    });

    // ---------- TABLE ----------
    socket.on('join_table', (data = {}) => {
      const roomId = (data.room_id || '').toString().trim().toUpperCase();
      let spectate = !!data.spectate;

      if (!rooms.has(roomId)) {
        socket.emit('error', { msg: 'Otaq tapılmadı!' });
        return;
      }
      const room = rooms.get(roomId);

      if (!lobbyUsers.has(sid)) {
        socket.emit('error', { msg: 'Lobbiyə daxil olun' });
        return;
      }
      const u = lobbyUsers.get(sid);

      // Check if already in another table
      for (const r of rooms.values()) {
        if (r.players.has(sid) || r.spectators.has(sid)) {
          socket.emit('error', { msg: 'Artıq başqa masadasınız' });
          return;
        }
      }

      // Game in progress → auto spectator
      if (!spectate && room.phase !== 'waiting') {
        spectate = true;
      }

      if (spectate) {
        room.spectators.add(sid);
        socket.join(roomId);
        socket.leave('LOBBY');
        const snap = tableSnapshot(room, sid, false);
        snap.in_game = room.phase !== 'waiting';
        snap.spectator = true;
        socket.emit('joined_table', snap);
        broadcastLobby(io);
        return;
      }

      if (room.players.size >= room.maxPlayers) {
        socket.emit('error', { msg: 'Masa doludur!' });
        return;
      }

      // Check player has enough chips for buy-in
      const persistedChips = u.chips || 0;
      if (persistedChips < room.buyIn) {
        socket.emit('error', { msg: `Bu masaya girmək üçün ${room.buyIn} chips lazımdır (sizdə ${persistedChips} var)` });
        return;
      }

      socket.join(roomId);
      socket.leave('LOBBY');
      // Deduct buy-in from player DB chips, allocate to table
      const newDbChips = persistedChips - room.buyIn;
      updatePlayerChips(u.name, newDbChips);
      lobbyUsers.set(sid, { ...u, chips: newDbChips });

      room.players.set(sid, {
        name: u.name,
        avatar: u.avatar,
        chips: room.buyIn,
        hand: [],
        bet: 0,
        folded: false,
        allIn: false,
        inHand: false,
      });

      room.attachAutofoldCallback(autofoldPlayer);

      const snap = tableSnapshot(room, sid);
      snap.in_game = false;
      snap.spectator = false;
      socket.emit('joined_table', snap);

      if (room.players.size >= room.minPlayers) {
        room.scheduleAutostart(autoStartRoom);
      }
      broadcastTableUpdate(io, room);
    });

    socket.on('leave_table', () => {
      for (const [roomId, room] of rooms) {
        if (room.spectators.has(sid)) {
          room.spectators.delete(sid);
          socket.leave(roomId);
          broadcastTableUpdate(io, room);
        }
        if (room.players.has(sid)) {
          const p = room.players.get(sid);
          // Return remaining chips to DB
          const u = lobbyUsers.get(sid);
          if (u) {
            const newDbChips = (u.chips || 0) + p.chips;
            updatePlayerChips(u.name, newDbChips);
            lobbyUsers.set(sid, { ...u, chips: newDbChips });
            socket.emit('chips_update', { chips: newDbChips });
          }
          const name = p.name;
          if (!['waiting', 'hand_over', 'showdown'].includes(room.phase) && p.inHand) {
            if (room.toAct.length > 0 && room.toAct[0] === sid) {
              const result = room.applyFold(sid);
              broadcastResult(io, room, result, `${name} masadan ayrıldı → fold`, 'FOLD');
            } else {
              p.folded = true;
              p.inHand = false;
              const idx = room.toAct.indexOf(sid);
              if (idx >= 0) room.toAct.splice(idx, 1);
            }
          }
          room.players.delete(sid);
          socket.leave(roomId);
          if (room.players.size < room.minPlayers) room.cancelAutostart();
          io.to(roomId).emit('player_left', { name });
          broadcastTableUpdate(io, room);
        }
      }
      if (lobbyUsers.has(sid)) {
        socket.join('LOBBY');
        socket.emit('lobby_state', lobbySnapshot());
      }
    });

    socket.on('player_action', (data = {}) => {
      let roomId = null;
      for (const [rid, r] of rooms) {
        if (r.players.has(sid)) { roomId = rid; break; }
      }
      if (!roomId) return;
      const room = rooms.get(roomId);

      if (room.toAct.length === 0 || room.toAct[0] !== sid) {
        socket.emit('error', { msg: 'Sıra sizdə deyil!' });
        return;
      }

      const action = data.action;
      const p = room.players.get(sid);
      const pname = p.name;
      let result, logMsg, label;

      if (action === 'fold') {
        result = room.applyFold(sid);
        logMsg = `${pname} fold etdi`;
        label = 'FOLD';
      } else if (action === 'check') {
        if (!room.canCheck(sid)) {
          socket.emit('error', { msg: 'Check edə bilməzsiniz — call edin!' });
          return;
        }
        result = room.applyCheck(sid);
        logMsg = `${pname} check etdi`;
        label = 'CHECK';
      } else if (action === 'call') {
        const callAmt = Math.round(Math.min(room.currentBet - p.bet, p.chips) * 100) / 100;
        result = room.applyCall(sid);
        logMsg = `${pname} call etdi (${callAmt})`;
        label = `CALL ${callAmt}`;
      } else if (action === 'raise') {
        let amount = parseFloat(data.amount);
        if (isNaN(amount)) amount = room.BB;
        amount = Math.max(amount, room.lastRaise);
        result = room.applyRaise(sid, amount);
        logMsg = `${pname} raise (+${amount})`;
        label = `RAISE +${amount}`;
      } else if (action === 'allin') {
        const amount = p.chips;
        result = room.applyAllin(sid);
        logMsg = `${pname} ALL-IN! (${amount})`;
        label = `ALL-IN ${amount}`;
      } else {
        return;
      }

      broadcastResult(io, room, result, logMsg, label, sid);
    });

    socket.on('table_chat', (data = {}) => {
      for (const [rid, room] of rooms) {
        if (room.players.has(sid) || room.spectators.has(sid)) {
          const msg = (data.msg || '').toString().trim().slice(0, 120);
          if (!msg) return;
          let name, avatar;
          if (room.players.has(sid)) {
            const p = room.players.get(sid);
            name = p.name;
            avatar = p.avatar || '';
          } else {
            const u = lobbyUsers.get(sid) || {};
            name = u.name || 'Spectator';
            avatar = u.avatar || '';
          }
          io.to(rid).emit('table_chat', { sid, name, avatar, msg });
          return;
        }
      }
    });
  });
}

module.exports = { registerEvents, autoStartRoom, autofoldPlayer };
