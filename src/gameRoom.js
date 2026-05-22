// =====================================================================
// FILE: src/gameRoom.js
// Full state machine for a single poker table
// =====================================================================
const { makeDeck, shuffleDeck, bestHandScore, compareScores } = require('./cards');
const { TURN_TIMEOUT, AUTOSTART_WAIT, HAND_NAMES } = require('./constants');

class GameRoom {
  constructor(roomId, tierId, tierName, sb, bb, buyIn, minPlayers, maxPlayers) {
    this.roomId = roomId;
    this.tierId = tierId;
    this.tierName = tierName;
    this.SB = sb;
    this.BB = bb;
    this.buyIn = buyIn;
    this.minPlayers = minPlayers;
    this.maxPlayers = maxPlayers;

    this.players = new Map();      // sid -> player object (preserves insertion order)
    this.spectators = new Set();
    this.phase = 'waiting';
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.dealerIdx = 0;
    this.toAct = [];               // ordered array of sids
    this.roundNum = 0;
    this.sbSid = null;
    this.bbSid = null;
    this.lastRaise = bb;

    this.turnTimer = null;
    this.autostartTimer = null;
    this.autostartAt = null;       // epoch ms when auto-start fires
    this._autofoldCb = null;
  }

  _sids() {
    return Array.from(this.players.keys());
  }

  _active() {
    const result = [];
    for (const [sid, p] of this.players) {
      if (p.inHand && !p.folded) {
        result.push([sid, p]);
      }
    }
    return result;
  }

  startsIn() {
    if (this.autostartAt === null) return null;
    const rem = Math.floor((this.autostartAt - Date.now()) / 1000);
    return Math.max(0, rem);
  }

  // ---------- AUTO-START ----------
  scheduleAutostart(onFire) {
    this.cancelAutostart();
    if (this.phase !== 'waiting') return;
    if (this.players.size < this.minPlayers) return;
    this.autostartAt = Date.now() + AUTOSTART_WAIT * 1000;
    this.autostartTimer = setTimeout(() => {
      if (this.phase === 'waiting' && this.players.size >= this.minPlayers) {
        onFire(this);
      }
    }, AUTOSTART_WAIT * 1000);
  }

  cancelAutostart() {
    if (this.autostartTimer) {
      clearTimeout(this.autostartTimer);
      this.autostartTimer = null;
    }
    this.autostartAt = null;
  }

  // ---------- ROUND / BLINDS ----------
  startRound() {
    this.deck = shuffleDeck(makeDeck());
    this.community = [];
    this.pot = 0;
    this.currentBet = this.BB;
    this.phase = 'preflop';
    this.lastRaise = this.BB;
    this.roundNum += 1;
    this.cancelAutostart();
    this._cancelTimer();

    const sids = this._sids();
    const n = sids.length;
    for (const sid of sids) {
      const p = this.players.get(sid);
      p.hand = [this.deck.pop(), this.deck.pop()];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
      p.inHand = true;
    }

    let sbIdx, bbIdx;
    if (n === 2) {
      sbIdx = this.dealerIdx % n;
      bbIdx = (this.dealerIdx + 1) % n;
    } else {
      sbIdx = (this.dealerIdx + 1) % n;
      bbIdx = (this.dealerIdx + 2) % n;
    }

    this.sbSid = sids[sbIdx];
    this.bbSid = sids[bbIdx];
    this._postBlind(this.sbSid, this.SB);
    this._postBlind(this.bbSid, this.BB);

    const firstIdx = n === 2 ? sbIdx : (bbIdx + 1) % n;
    this._buildToAct(firstIdx);
    if (this.toAct.length > 0) {
      this._scheduleTimerInternal();
    }
    return { sbSid: this.sbSid, bbSid: this.bbSid };
  }

  _postBlind(sid, amount) {
    const p = this.players.get(sid);
    const actual = Math.min(amount, p.chips);
    p.chips = round(p.chips - actual);
    p.bet = round(actual);
    this.pot = round(this.pot + actual);
    if (p.chips <= 0) {
      p.allIn = true;
      const idx = this.toAct.indexOf(sid);
      if (idx >= 0) this.toAct.splice(idx, 1);
    }
  }

  _buildToAct(firstIdx) {
    const sids = this._sids();
    const n = sids.length;
    this.toAct = [];
    for (let i = 0; i < n; i++) {
      const sid = sids[(firstIdx + i) % n];
      const p = this.players.get(sid);
      if (p.inHand && !p.folded && !p.allIn) {
        this.toAct.push(sid);
      }
    }
  }

  // ---------- TURN TIMER ----------
  _cancelTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  attachAutofoldCallback(cb) {
    this._autofoldCb = cb;
  }

  _scheduleTimerInternal() {
    this._cancelTimer();
    if (this.toAct.length === 0 || !this._autofoldCb) return;
    const sid = this.toAct[0];
    this.turnTimer = setTimeout(() => {
      if (this.toAct.length > 0 && this.toAct[0] === sid) {
        this._autofoldCb(this, sid);
      }
    }, TURN_TIMEOUT * 1000);
  }

  // ---------- PLAYER ACTIONS ----------
  canCheck(sid) {
    return this.players.get(sid).bet >= this.currentBet;
  }

  _removeFromToAct(sid) {
    const idx = this.toAct.indexOf(sid);
    if (idx >= 0) this.toAct.splice(idx, 1);
  }

  applyFold(sid) {
    this._cancelTimer();
    const p = this.players.get(sid);
    p.folded = true;
    p.inHand = false;
    this._removeFromToAct(sid);
    return this._afterAction();
  }

  applyCheck(sid) {
    this._cancelTimer();
    this._removeFromToAct(sid);
    return this._afterAction();
  }

  applyCall(sid) {
    this._cancelTimer();
    const p = this.players.get(sid);
    const amount = round(Math.min(this.currentBet - p.bet, p.chips));
    p.chips = round(p.chips - amount);
    p.bet = round(p.bet + amount);
    this.pot = round(this.pot + amount);
    if (p.chips <= 0) p.allIn = true;
    this._removeFromToAct(sid);
    return this._afterAction();
  }

  applyRaise(sid, raiseBy) {
    this._cancelTimer();
    const p = this.players.get(sid);
    const callAmt = Math.max(0, this.currentBet - p.bet);
    raiseBy = Math.max(raiseBy, this.lastRaise);
    const total = round(Math.min(callAmt + raiseBy, p.chips));
    p.chips = round(p.chips - total);
    p.bet = round(p.bet + total);
    this.pot = round(this.pot + total);

    const actualRaise = p.bet - this.currentBet;
    if (actualRaise > this.lastRaise) {
      this.lastRaise = actualRaise;
    }
    this.currentBet = p.bet;
    if (p.chips <= 0) p.allIn = true;

    const sids = this._sids();
    const n = sids.length;
    const raiserIdx = sids.indexOf(sid);
    this.toAct = [];
    for (let i = 1; i < n; i++) {
      const nxt = sids[(raiserIdx + i) % n];
      const pp = this.players.get(nxt);
      if (pp.inHand && !pp.folded && !pp.allIn) {
        this.toAct.push(nxt);
      }
    }
    return this._afterAction();
  }

  applyAllin(sid) {
    return this.applyRaise(sid, this.players.get(sid).chips);
  }

  // ---------- STATE MACHINE ----------
  _afterAction() {
    const active = this._active();
    if (active.length === 1) {
      const [wSid, wPlayer] = active[0];
      const won = this._potTo(wSid);
      this.phase = 'hand_over';
      this._cancelTimer();
      return ['hand_over', [{
        sid: wSid,
        name: wPlayer.name,
        avatar: wPlayer.avatar || '',
        hand: wPlayer.hand,
        handName: '',
        potWon: won,
      }]];
    }
    if (this.toAct.length > 0) {
      this._scheduleTimerInternal();
      return ['turn', this.toAct[0]];
    }
    return this._nextPhase();
  }

  _startStreetBetting() {
    for (const p of this.players.values()) {
      p.bet = 0;
    }
    this.currentBet = 0;
    this.lastRaise = this.BB;
    const sids = this._sids();
    const n = sids.length;
    const firstIdx = n ? (this.dealerIdx + 1) % n : 0;
    this._buildToAct(firstIdx);
    if (this.toAct.length > 0) {
      this._scheduleTimerInternal();
    }
    return this.toAct.length > 0;
  }

  _nextPhase() {
    this._cancelTimer();
    if (this.phase === 'preflop') {
      this.community = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      this.phase = 'flop';
    } else if (this.phase === 'flop') {
      this.community.push(this.deck.pop());
      this.phase = 'turn';
    } else if (this.phase === 'turn') {
      this.community.push(this.deck.pop());
      this.phase = 'river';
    } else if (this.phase === 'river') {
      return this._showdown();
    }

    const canBet = this._startStreetBetting();
    if (!canBet) {
      return this._nextPhase();
    }
    return ['phase_change', this.phase];
  }

  _showdown() {
    this.phase = 'showdown';
    this._cancelTimer();
    const active = this._active();

    if (active.length === 1) {
      const [wSid, wPlayer] = active[0];
      const won = this._potTo(wSid);
      return ['showdown', [{
        sid: wSid,
        name: wPlayer.name,
        avatar: wPlayer.avatar || '',
        hand: wPlayer.hand,
        handName: '',
        potWon: won,
      }]];
    }

    const results = [];
    for (const [sid, p] of active) {
      const score = bestHandScore(p.hand, this.community);
      results.push({
        sid,
        name: p.name,
        avatar: p.avatar || '',
        score,
        hand: p.hand,
        handName: HAND_NAMES[score[0]],
      });
    }

    let bestScore = results[0].score;
    for (const r of results) {
      if (compareScores(r.score, bestScore) > 0) bestScore = r.score;
    }
    const winners = results.filter(r => compareScores(r.score, bestScore) === 0);
    const share = round(this.pot / winners.length);
    for (const w of winners) {
      const p = this.players.get(w.sid);
      p.chips = round(p.chips + share);
      w.potWon = share;
    }
    this.pot = 0;
    return ['showdown', winners];
  }

  _potTo(sid) {
    const amount = round(this.pot);
    this.players.get(sid).chips = round(this.players.get(sid).chips + amount);
    this.pot = 0;
    return amount;
  }

  nextDealer() {
    const sids = this._sids();
    if (sids.length > 0) {
      this.dealerIdx = (this.dealerIdx + 1) % sids.length;
    }
  }

  // ---------- SNAPSHOT API ----------
  getState() {
    return {
      phase: this.phase,
      community: this.community,
      pot: round(this.pot),
      current_bet: round(this.currentBet),
      current_player: this.toAct[0] || null,
      round_num: this.roundNum,
      small_blind: this.SB,
      big_blind: this.BB,
      min_raise: this.lastRaise,
    };
  }

  publicPlayers(revealSids = []) {
    const reveal = new Set(revealSids);
    const sids = this._sids();
    const n = sids.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      const sid = sids[i];
      const p = this.players.get(sid);
      const isDealer = n > 0 && i === (this.dealerIdx % n);
      const pd = {
        sid,
        name: p.name,
        avatar: p.avatar || '🦁',
        chips: round(p.chips),
        bet: round(p.bet),
        folded: p.folded,
        all_in: p.allIn || false,
        in_hand: p.inHand || false,
        is_current: this.toAct.length > 0 && this.toAct[0] === sid,
        is_dealer: isDealer,
        is_sb: sid === this.sbSid,
        is_bb: sid === this.bbSid,
      };
      if (reveal.has(sid)) {
        pd.hand = p.hand || [];
      }
      result.push(pd);
    }
    return result;
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = GameRoom;
