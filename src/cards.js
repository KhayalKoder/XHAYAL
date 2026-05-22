// =====================================================================
// FILE: src/cards.js
// Deck creation and 5-card hand evaluation
// =====================================================================
const { SUITS, RANKS, RANK_VAL } = require('./constants');

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, red: suit === '♥' || suit === '♦' });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function _rv(card) {
  return RANK_VAL[card.rank];
}

function evaluate5(cards) {
  const vals = cards.map(_rv).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;

  // Check for straight
  let isStraight = true;
  for (let i = 0; i < 4; i++) {
    if (vals[i] - vals[i + 1] !== 1) {
      isStraight = false;
      break;
    }
  }

  // Wheel straight: A-2-3-4-5
  let normalizedVals = [...vals];
  if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    isStraight = true;
    normalizedVals = [5, 4, 3, 2, 1];
  }

  // Count occurrences
  const counts = {};
  for (const v of vals) {
    counts[v] = (counts[v] || 0) + 1;
  }
  const grp = Object.entries(counts)
    .map(([k, v]) => [parseInt(k), v])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (isStraight && isFlush) {
    return [normalizedVals[0] === 14 ? 9 : 8, normalizedVals];
  }
  if (grp[0][1] === 4) {
    return [7, [grp[0][0], grp[1][0]]];
  }
  if (grp[0][1] === 3 && grp[1][1] === 2) {
    return [6, [grp[0][0], grp[1][0]]];
  }
  if (isFlush) {
    return [5, vals];
  }
  if (isStraight) {
    return [4, normalizedVals];
  }
  if (grp[0][1] === 3) {
    return [3, [grp[0][0], ...grp.slice(1).map(g => g[0]).sort((a, b) => b - a)]];
  }
  if (grp[0][1] === 2 && grp[1][1] === 2) {
    return [2, [Math.max(grp[0][0], grp[1][0]), Math.min(grp[0][0], grp[1][0]), grp[2][0]]];
  }
  if (grp[0][1] === 2) {
    return [1, [grp[0][0], ...grp.slice(1).map(g => g[0]).sort((a, b) => b - a)]];
  }
  return [0, vals];
}

// Compare two hand scores: [category, kickers]
function compareScores(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  for (let i = 0; i < Math.min(a[1].length, b[1].length); i++) {
    if (a[1][i] !== b[1][i]) return a[1][i] - b[1][i];
  }
  return 0;
}

function combinations(arr, k) {
  const result = [];
  function helper(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }
  helper(0, []);
  return result;
}

function bestHandScore(hole, community) {
  const allCards = [...hole, ...community];
  if (allCards.length < 5) {
    return evaluate5(allCards);
  }
  let best = null;
  for (const combo of combinations(allCards, 5)) {
    const sc = evaluate5(combo);
    if (best === null || compareScores(sc, best) > 0) {
      best = sc;
    }
  }
  return best;
}

module.exports = {
  makeDeck,
  shuffleDeck,
  evaluate5,
  compareScores,
  bestHandScore,
};
