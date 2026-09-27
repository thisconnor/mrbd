import { total, value } from './engine.js';

// Multi-deck S17, double after split, no surrender.
// Reference: wizardofodds.com/games/blackjack/strategy/4-decks/
export function bookAction(hand, upcard, legal = ['hit', 'stand', 'double', 'split']) {
  const { points: p, soft } = total(hand.cards), d = value(upcard);
  if (legal.includes('split') && hand.cards.length === 2 && value(hand.cards[0]) === value(hand.cards[1])) {
    const r = value(hand.cards[0]);
    if (r === 1 || r === 8 || ([2, 3, 7].includes(r) && d >= 2 && d <= 7) ||
        (r === 4 && [5, 6].includes(d)) || (r === 6 && d >= 2 && d <= 6) ||
        (r === 9 && [2, 3, 4, 5, 6, 8, 9].includes(d))) return 'split';
  }
  const double = fallback => legal.includes('double') && hand.cards.length === 2 ? 'double' : fallback;
  if (soft) {
    if (p >= 19) return 'stand';
    if (p === 18) {
      if (d >= 3 && d <= 6) return double('stand');
      return [2, 7, 8].includes(d) ? 'stand' : 'hit';
    }
    if ((p === 17 && d >= 3 && d <= 6) || ([15, 16].includes(p) && d >= 4 && d <= 6) ||
        ([13, 14].includes(p) && [5, 6].includes(d))) return double('hit');
    return 'hit';
  }
  if (p >= 17) return 'stand';
  if (p >= 13) return d >= 2 && d <= 6 ? 'stand' : 'hit';
  if (p === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if ((p === 11 && d !== 1) || (p === 10 && d >= 2 && d <= 9) || (p === 9 && d >= 3 && d <= 6)) return double('hit');
  return 'hit';
}
export function advice(hand, upcard, legal) {
  const action = bookAction(hand, upcard, legal);
  const preferred = bookAction(hand, upcard);
  const t = total(hand.cards), dealer = value(upcard) === 1 ? 'A' : value(upcard);
  return { action, reason: preferred !== action
    ? `${preferred[0].toUpperCase() + preferred.slice(1)} unavailable · ${action} instead`
    : `${t.soft ? 'Soft' : 'Hard'} ${t.points} against dealer ${dealer}` };
}
