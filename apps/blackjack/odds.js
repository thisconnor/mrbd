import { total, value, legalActions, natural } from './engine.js';
import { bookAction } from './strategy.js';

export function seededRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export function seedFor(text) {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return n >>> 0;
}
// One completion of public information. Never receives the actual shoe/hole card.
export function sample(observation, firstAction, random) {
  const counts = observation.counts.slice();
  const draw = (excluded = 0) => {
    let n = 0;
    for (let r = 1; r <= 10; r++) if (r !== excluded) n += counts[r];
    if (!n) throw new Error('Not enough unknown cards.');
    let pick = random() * n;
    for (let r = 1; r <= 10; r++) {
      if (r === excluded) continue;
      pick -= counts[r];
      if (pick < 0) { counts[r]--; return (r - 1) * 4; }
    }
    throw new Error('Invalid card distribution.');
  };
  const up = value(observation.upcard);
  const exclude = observation.peeked ? (up === 1 ? 10 : up === 10 ? 1 : 0) : 0;
  const dealer = [observation.upcard, draw(exclude)];
  let available = observation.available, handCount = observation.handCount;
  const hands = observation.hands.map((h, i) => ({ ...h, cards: h.cards.slice(), group: i, done: false }));
  let forced = firstAction;
  for (let i = 0; i < hands.length; i++) {
    const h = hands[i];
    while (!h.done && total(h.cards).points < 21 && !h.splitAces) {
      const legal = legalActions(h, available, handCount);
      const action = forced || bookAction(h, observation.upcard, legal);
      forced = null;
      if (!legal.includes(action)) throw new Error('Illegal simulated action.');
      if (action === 'stand') h.done = true;
      else if (action === 'hit') h.cards.push(draw());
      else if (action === 'double') {
        available -= h.bet; h.bet *= 2; h.cards.push(draw()); h.done = true;
      } else {
        available -= h.bet; handCount++;
        const other = h.cards.pop();
        const aces = value(other) === 1;
        h.fromSplit = true; h.splitAces = aces;
        h.cards.push(draw());
        const right = { cards: [other, draw()], bet: h.bet, fromSplit: true, splitAces: aces, group: h.group, done: aces };
        hands.splice(i + 1, 0, right);
        if (aces) h.done = true;
      }
    }
  }
  if (hands.some(h => total(h.cards).points <= 21 && !natural(h))) {
    while (total(dealer).points < 17) dealer.push(draw());
  }
  const d = total(dealer).points;
  let profit = 0;
  for (const h of hands) {
    if (h.group !== 0) continue;
    const p = total(h.cards).points;
    if (p > 21) profit -= h.bet;
    else if (d > 21 || p > d) profit += h.bet;
    else if (p < d) profit -= h.bet;
  }
  return profit > 0 ? 'win' : profit === 0 ? 'push' : 'lose';
}
export function estimate(observation, action, n = 5000, seed = 1) {
  const random = seededRandom(seed), result = { win: 0, push: 0, lose: 0, n: 0 };
  for (let i = 0; i < n; i++) { result[sample(observation, action, random)]++; result.n++; }
  return result;
}
