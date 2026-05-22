// =====================================================================
// FILE: src/lobby.js
// Room creation, lobby snapshots, and broadcast helpers
// =====================================================================
const { STAKE_TIERS } = require('./constants');
const GameRoom = require('./gameRoom');

// Global state shared across modules
const rooms = new Map();        // roomId -> GameRoom
const lobbyUsers = new Map();   // sid -> { name, avatar }

function initLobbyRooms() {
  for (const tier of STAKE_TIERS) {
    for (let i = 1; i <= 2; i++) {
      const rid = `${tier.id.toUpperCase()}-${String(i).padStart(2, '0')}`;
      rooms.set(rid, new GameRoom(
        rid, tier.id, tier.name,
        tier.sb, tier.bb, tier.buyIn,
        tier.minPlayers, tier.maxPlayers
      ));
    }
  }
}

function lobbySnapshot() {
  let totalInRooms = 0;
  for (const r of rooms.values()) {
    totalInRooms += r.players.size + r.spectators.size;
  }
  return {
    online: lobbyUsers.size + totalInRooms,
    tiers: STAKE_TIERS.map(t => ({ id: t.id, name: t.name })),
    rooms: Array.from(rooms.values()).map(r => ({
      id: r.roomId,
      tier: r.tierId,
      tier_name: r.tierName,
      sb: r.SB,
      bb: r.BB,
      buy_in: r.buyIn,
      players: r.players.size,
      max_players: r.maxPlayers,
      phase: r.phase,
      starts_in: r.startsIn(),
    })),
  };
}

function tableSnapshot(room, viewerSid = null, includeHand = true) {
  const reveal = (viewerSid && room.players.has(viewerSid) && includeHand) ? [viewerSid] : [];
  return {
    room_id: room.roomId,
    tier_name: room.tierName,
    players: room.publicPlayers(reveal),
    state: room.getState(),
    starts_in: room.startsIn(),
    spectator: viewerSid ? room.spectators.has(viewerSid) : false,
  };
}

function broadcastLobby(io) {
  io.to('LOBBY').emit('lobby_state', lobbySnapshot());
}

function broadcastTableUpdate(io, room) {
  // Each player sees their own hand
  for (const sid of room.players.keys()) {
    io.to(sid).emit('table_update', {
      players: room.publicPlayers([sid]),
      starts_in: room.startsIn(),
    });
  }
  for (const sid of room.spectators) {
    io.to(sid).emit('table_update', {
      players: room.publicPlayers(),
      starts_in: room.startsIn(),
    });
  }
  broadcastLobby(io);
}

function broadcastResult(io, room, result, logMsg, actionLabel, actorSid = null) {
  const [eventType, eventData] = result;
  const state = room.getState();
  const targets = [...room.players.keys(), ...room.spectators];

  if (eventType === 'turn') {
    const nextSid = eventData;
    for (const ps of targets) {
      const isPlayer = room.players.has(ps);
      io.to(ps).emit('player_acted', {
        log: logMsg,
        action_label: actionLabel,
        actor_sid: actorSid,
        state,
        players: room.publicPlayers(isPlayer ? [ps] : []),
        your_turn: nextSid === ps && isPlayer,
      });
    }
  } else if (eventType === 'phase_change') {
    const labels = {
      flop: '── Flop ──',
      turn: '── Turn ──',
      river: '── River ──',
    };
    const nextSid = room.toAct[0] || null;
    for (const ps of targets) {
      const isPlayer = room.players.has(ps);
      io.to(ps).emit('phase_changed', {
        log: logMsg,
        phase_log: labels[eventData] || eventData,
        state,
        players: room.publicPlayers(isPlayer ? [ps] : []),
        your_turn: nextSid === ps && isPlayer,
      });
    }
  } else if (eventType === 'hand_over') {
    const winners = eventData;
    recordWinners(room, winners);
    room.nextDealer();
    for (const ps of targets) {
      const isPlayer = room.players.has(ps);
      io.to(ps).emit('hand_over', {
        log: logMsg,
        winners,
        state,
        players: room.publicPlayers(isPlayer ? [ps] : []),
      });
    }
    setTimeout(() => handFinished(io, room), 3000);
  } else if (eventType === 'showdown') {
    const winners = eventData;
    recordWinners(room, winners);
    const activeSids = [];
    for (const [sid, p] of room.players) {
      if (p.inHand && !p.folded) activeSids.push(sid);
    }
    room.nextDealer();
    for (const ps of targets) {
      const isPlayer = room.players.has(ps);
      io.to(ps).emit('showdown', {
        log: logMsg,
        winners,
        state,
        players: room.publicPlayers(isPlayer ? [...activeSids, ps] : activeSids),
      });
    }
    setTimeout(() => handFinished(io, room), 4000);
  }
}

function recordWinners(room, winners) {
  const { recordHandResult, updatePlayerChips } = require('./db');
  // Save chip balances for all players in hand
  const winnerSids = new Set(winners.map(w => w.sid));
  for (const [sid, p] of room.players) {
    updatePlayerChips(p.name, p.chips);
    if (p.inHand) {
      const isWinner = winnerSids.has(sid);
      const amount = isWinner
        ? (winners.find(w => w.sid === sid)?.potWon || 0)
        : 0;
      const handName = winners.find(w => w.sid === sid)?.handName || '';
      recordHandResult(p.name, isWinner, amount, handName, room.roomId);
    }
  }
}

function handFinished(io, room) {
  // Remove busted players, prepare for next round
  const { refillChipsIfBusted } = require('./db');
  const busted = [];
  for (const [sid, p] of room.players) {
    if (p.chips <= 0) busted.push(sid);
  }
  for (const sid of busted) {
    if (room.players.has(sid)) {
      const p = room.players.get(sid);
      // Refill from DB if they have chips, else they leave the table
      const dbChips = refillChipsIfBusted(p.name);
      if (dbChips > 0 && dbChips >= room.buyIn / 4) {
        p.chips = Math.min(dbChips, room.buyIn);
      } else {
        io.to(sid).emit('error', { msg: 'Chips bitdi — lobbiyə qayıdırsınız' });
        const socket = io.sockets.sockets.get(sid);
        if (socket) socket.leave(room.roomId);
        room.players.delete(sid);
      }
    }
  }
  room.phase = 'waiting';
  if (room.players.size >= room.minPlayers) {
    const { autoStartRoom } = require('./events');
    room.scheduleAutostart(autoStartRoom);
  }
  broadcastTableUpdate(io, room);
}

module.exports = {
  rooms,
  lobbyUsers,
  initLobbyRooms,
  lobbySnapshot,
  tableSnapshot,
  broadcastLobby,
  broadcastTableUpdate,
  broadcastResult,
  handFinished,
};

