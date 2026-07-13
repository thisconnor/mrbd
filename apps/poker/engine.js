/**
 * Poker engine for the Poker HUD app - pure math, no DOM.
 *
 * Loaded two ways from index.html:
 *   - as a normal <script> for hand analysis / advice on the main thread
 *   - via importScripts() inside the equity Web Worker
 *
 * Card encoding: id 0..51, rank = id >> 2 (0 = deuce .. 12 = ace),
 * suit = id & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣).
 *
 * evaluate() packs a 5-7 card hand into one comparable integer:
 * category << 20, then up to five 4-bit tiebreak nibbles at bits 16..0
 * (higher is better in a plain numeric comparison).
 */
(function (root) {
  'use strict';

  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUITS = ['♠', '♥', '♦', '♣']; // ♠ ♥ ♦ ♣
  const RED = [false, true, true, false];
  const CATS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
    'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

  // Highest rank of a straight in a 13-bit rank mask, or -1. The wheel
  // (A-2-3-4-5) reports 3 (the five) as its high card.
  function straightHigh(mask) {
    for (let r = 12; r >= 4; r--) {
      if (((mask >> (r - 4)) & 0x1f) === 0x1f) return r;
    }
    if ((mask & 0x100f) === 0x100f) return 3;
    return -1;
  }

  function evaluate(cards) {
    const rankCnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const suitCnt = [0, 0, 0, 0];
    const suitMask = [0, 0, 0, 0];
    let rankMask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], r = c >> 2, s = c & 3;
      rankCnt[r]++;
      suitCnt[s]++;
      suitMask[s] |= 1 << r;
      rankMask |= 1 << r;
    }

    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) { flushSuit = s; break; }
    if (flushSuit >= 0) {
      const sf = straightHigh(suitMask[flushSuit]);
      if (sf >= 0) return (8 << 20) | (sf << 16);
    }

    let quad = -1;
    const trips = [], pairs = [];
    for (let r = 12; r >= 0; r--) {
      const n = rankCnt[r];
      if (n === 4) quad = r;
      else if (n === 3) trips.push(r);
      else if (n === 2) pairs.push(r);
    }

    if (quad >= 0) {
      let k = -1;
      for (let r = 12; r >= 0; r--) if (rankCnt[r] > 0 && r !== quad) { k = r; break; }
      return (7 << 20) | (quad << 16) | ((k < 0 ? 0 : k) << 12);
    }
    // 7 cards can hold two trips but never trips + pair + trips, so the best
    // full-house pair is either the second trips or the highest true pair.
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const t = trips[0];
      const p = trips.length > 1 ? trips[1] : pairs[0];
      return (6 << 20) | (t << 16) | (p << 12);
    }
    if (flushSuit >= 0) {
      let v = 5 << 20, n = 0;
      const m = suitMask[flushSuit];
      for (let r = 12; r >= 0 && n < 5; r--) if (m & (1 << r)) { v |= r << (16 - 4 * n); n++; }
      return v;
    }
    const st = straightHigh(rankMask);
    if (st >= 0) return (4 << 20) | (st << 16);
    if (trips.length) {
      const t = trips[0];
      let v = (3 << 20) | (t << 16), n = 0;
      for (let r = 12; r >= 0 && n < 2; r--) if (rankCnt[r] > 0 && r !== t) { v |= r << (12 - 4 * n); n++; }
      return v;
    }
    if (pairs.length >= 2) {
      const p1 = pairs[0], p2 = pairs[1];
      let k = -1;
      for (let r = 12; r >= 0; r--) if (rankCnt[r] > 0 && r !== p1 && r !== p2) { k = r; break; }
      return (2 << 20) | (p1 << 16) | (p2 << 12) | ((k < 0 ? 0 : k) << 8);
    }
    if (pairs.length === 1) {
      const p = pairs[0];
      let v = (1 << 20) | (p << 16), n = 0;
      for (let r = 12; r >= 0 && n < 3; r--) if (rankCnt[r] > 0 && r !== p) { v |= r << (12 - 4 * n); n++; }
      return v;
    }
    let v = 0, n = 0;
    for (let r = 12; r >= 0 && n < 5; r--) if (rankCnt[r] > 0) { v |= r << (16 - 4 * n); n++; }
    return v;
  }

  // Deterministic xorshift32 so equity runs are reproducible per seed.
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function equitySetup(hero, board, opps) {
    const used = new Set(hero.concat(board));
    const deck = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    return {
      hero: hero.slice(), board: board.slice(), opps, deck,
      win: 0, tie: 0, lose: 0, eq: 0, iters: 0,
    };
  }

  // Run n Monte Carlo deals against `opps` random hands. eq accumulates the
  // hero's expected pot share (1 for a win, 1/k for a k-way chop).
  function mcRun(st, n, rand) {
    const { hero, board, opps, deck } = st;
    const missing = 5 - board.length;
    const need = opps * 2 + missing;
    const len = deck.length;
    const full = board.slice();
    const h7 = [0, 0, 0, 0, 0, 0, 0];
    for (let it = 0; it < n; it++) {
      for (let i = 0; i < need; i++) {
        const j = i + ((rand() * (len - i)) | 0);
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
      let di = 0;
      for (let b = 0; b < missing; b++) full[board.length + b] = deck[di++];
      h7[0] = hero[0]; h7[1] = hero[1];
      for (let b = 0; b < 5; b++) h7[2 + b] = full[b];
      const hv = evaluate(h7);
      let best = -1, bestCount = 0;
      for (let o = 0; o < opps; o++) {
        h7[0] = deck[di++]; h7[1] = deck[di++];
        const ov = evaluate(h7);
        if (ov > best) { best = ov; bestCount = 1; }
        else if (ov === best) bestCount++;
      }
      if (hv > best) { st.win++; st.eq += 1; }
      else if (hv === best) { st.tie++; st.eq += 1 / (bestCount + 1); }
      else st.lose++;
      st.iters++;
    }
  }

  // Exact heads-up equity by enumerating every runout + opponent hand.
  // Cheap enough on the turn (46 x 990) and river (990); use MC elsewhere.
  function exactHeadsUp(hero, board) {
    const used = new Set(hero.concat(board));
    const deck = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const riverNeeded = 5 - board.length; // 0 or 1
    const full = board.slice();
    while (full.length < 5) full.push(-1);
    const h7 = [0, 0, 0, 0, 0, 0, 0];
    let win = 0, tie = 0, lose = 0, eq = 0, iters = 0;
    const riverCount = riverNeeded ? deck.length : 1;
    for (let ri = 0; ri < riverCount; ri++) {
      if (riverNeeded) full[4] = deck[ri];
      h7[0] = hero[0]; h7[1] = hero[1];
      for (let b = 0; b < 5; b++) h7[2 + b] = full[b];
      const hv = evaluate(h7);
      for (let i = 0; i < deck.length; i++) {
        if (riverNeeded && i === ri) continue;
        for (let j = i + 1; j < deck.length; j++) {
          if (riverNeeded && j === ri) continue;
          h7[0] = deck[i]; h7[1] = deck[j];
          const ov = evaluate(h7);
          if (hv > ov) { win++; eq += 1; }
          else if (hv === ov) { tie++; eq += 0.5; }
          else lose++;
          iters++;
        }
      }
    }
    return { win, tie, lose, eq, iters, exact: true };
  }

  function madeName(v) {
    const cat = v >> 20, a = (v >> 16) & 15, b = (v >> 12) & 15;
    const R = RANKS;
    switch (cat) {
      case 8: return a === 12 ? 'ROYAL FLUSH' : 'STRAIGHT FLUSH · ' + R[a] + ' HIGH';
      case 7: return 'QUADS · ' + R[a] + 's';
      case 6: return 'FULL HOUSE · ' + R[a] + 's / ' + R[b] + 's';
      case 5: return 'FLUSH · ' + R[a] + ' HIGH';
      case 4: return 'STRAIGHT · ' + R[a] + ' HIGH';
      case 3: return 'TRIPS · ' + R[a] + 's';
      case 2: return 'TWO PAIR · ' + R[a] + ' & ' + R[b];
      case 1: return 'PAIR OF ' + R[a] + 's';
      default: return R[a] + ' HIGH';
    }
  }

  // Current made hand plus live draws / outs. Draws and outs only make sense
  // with 3-4 board cards; outs = unknown cards that jump the hand category.
  function analyze(hero, board) {
    const all = hero.concat(board);
    const v = evaluate(all);
    const cat = v >> 20;
    const res = { cat, name: madeName(v), draws: [], outs: 0, sfHigh: cat === 8 ? (v >> 16) & 15 : -1 };
    if (board.length >= 3 && board.length < 5) {
      const suitCnt = [0, 0, 0, 0];
      let rankMask = 0;
      for (const c of all) { suitCnt[c & 3]++; rankMask |= 1 << (c >> 2); }
      if (cat < 5) {
        for (let s = 0; s < 4; s++) if (suitCnt[s] === 4) { res.draws.push('FLUSH DRAW'); break; }
      }
      if (cat < 4) {
        let completing = 0;
        for (let r = 0; r < 13; r++) {
          if (rankMask & (1 << r)) continue;
          if (straightHigh(rankMask | (1 << r)) >= 0) completing++;
        }
        if (completing >= 2) res.draws.push('OPEN-ENDED');
        else if (completing === 1) res.draws.push('GUTSHOT');
      }
      if (cat <= 1) {
        let bMax = -1;
        for (const c of board) bMax = Math.max(bMax, c >> 2);
        const h1 = hero[0] >> 2, h2 = hero[1] >> 2;
        if (h1 > bMax && h2 > bMax && h1 !== h2) res.draws.push('2 OVERCARDS');
      }
      const used = new Set(all);
      for (let c = 0; c < 52; c++) {
        if (used.has(c)) continue;
        if ((evaluate(all.concat(c)) >> 20) > cat) res.outs++;
      }
    }
    return res;
  }

  function handLabel(hero) {
    const r1 = hero[0] >> 2, r2 = hero[1] >> 2;
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    if (hi === lo) return 'POCKET ' + RANKS[hi] + 's';
    const suited = (hero[0] & 3) === (hero[1] & 3);
    return RANKS[hi] + '-' + RANKS[lo] + (suited ? ' SUITED' : ' OFFSUIT');
  }

  // Equity-based action guidance. share = expected pot share (0..1),
  // players = total seats including hero, so 1/players is the break-even
  // "random hand" baseline.
  function advise(share, players, street, info) {
    const r = share * players;
    const pct = Math.round(share * 100) + '%';
    const drawing = !!(info && info.draws && info.draws.some(
      (d) => d === 'FLUSH DRAW' || d === 'OPEN-ENDED'));
    if (share >= 0.8 || r >= 2.2) {
      return { action: 'RAISE BIG', tone: 'strong', sub: pct + ' · dominating — bet large' };
    }
    if (r >= 1.55) {
      return { action: 'RAISE', tone: 'strong', sub: pct + ' · well ahead — raise for value' };
    }
    if (r >= 1.15) {
      return { action: 'BET / CALL', tone: 'good', sub: pct + ' · ahead of the field' };
    }
    if (r >= 0.9) {
      return { action: 'CHECK · CALL', tone: 'ok', sub: pct + ' · marginal — keep the pot small' };
    }
    if (drawing && street !== 'RIVER') {
      return { action: 'CHECK · CALL', tone: 'ok', sub: pct + ' now · live draw — call if cheap' };
    }
    return { action: 'CHECK / FOLD', tone: 'bad', sub: pct + ' · behind — fold to a bet' };
  }

  // Break-even equity to call a bet of the given fraction of the pot:
  // call c into pot p + c means you need c / (p + 2c).
  const CALL_PRICES = [
    { label: '⅓', be: 1 / 5 },      // ⅓ pot
    { label: '½', be: 1 / 4 },      // ½ pot
    { label: '⅔', be: 2 / 7 },      // ⅔ pot
    { label: 'POT', be: 1 / 3 },
    { label: '2×', be: 2 / 5 },
  ];

  const api = {
    RANKS, SUITS, RED, CATS, CALL_PRICES,
    straightHigh, evaluate, makeRng,
    equitySetup, mcRun, exactHeadsUp,
    madeName, analyze, handLabel, advise,
  };

  root.PokerEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
