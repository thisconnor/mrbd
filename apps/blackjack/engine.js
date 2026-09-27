// Six-deck, S17, 3:2 blackjack. All money is integer cents.
export const MIN_BET = 1000;
export const CHIP_UNIT = 500;
export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const value = card => Math.min(10, Math.floor(card / 4) + 1);
export function total(cards) {
  let points = 0, aces = 0;
  for (const c of cards) { const v = value(c); points += v; if (v === 1) aces++; }
  const soft = aces > 0 && points + 10 <= 21;
  return { points: points + (soft ? 10 : 0), soft };
}
export const natural = hand => !hand.fromSplit && hand.cards.length === 2 && total(hand.cards).points === 21;
export function legalActions(hand, available, handCount) {
  if (!hand || hand.done || hand.splitAces || total(hand.cards).points >= 21) return [];
  const actions = ['hit', 'stand'];
  if (hand.cards.length === 2 && available >= hand.bet) {
    actions.push('double');
    if (handCount < 4 && value(hand.cards[0]) === value(hand.cards[1])) actions.push('split');
  }
  return actions;
}
const makeHand = (cards, bet, fromSplit = false, splitAces = false) => ({ cards, bet, fromSplit, splitAces, done: false, result: null, net: 0 });
export class Blackjack {
  constructor(random = Math.random) {
    this.random = random; this.phase = 'setup'; this.balance = 0; this.hands = [];
    this.dealer = []; this.active = 0; this.round = 0; this.shoeNumber = 0;
    this.shoe = []; this.unknown = []; this.revealed = false; this.net = 0;
  }
  start(cents) {
    if (this.phase !== 'setup' || !Number.isInteger(cents) || cents % 100 || cents < 1500 || cents > 20000) throw new Error('Choose a whole-dollar bankroll from $15 to $200.');
    this.balance = cents; this.startingBalance = cents; this.phase = 'bet'; this.shuffle();
  }
  shuffle() {
    this.shoe = Array.from({ length: 312 }, (_, i) => i % 52);
    for (let i = this.shoe.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]];
    }
    this.unknown = [0, 24, 24, 24, 24, 24, 24, 24, 24, 24, 96];
    this.shoeNumber++; this.justShuffled = true;
  }
  draw(exposed = true) {
    if (!this.shoe.length) throw new Error('The shoe is exhausted.');
    const card = this.shoe.pop();
    if (exposed) this.unknown[value(card)]--;
    return card;
  }
  deal(bet) {
    if (this.phase !== 'bet') throw new Error('Finish this round first.');
    if (!Number.isInteger(bet) || bet < MIN_BET || bet % CHIP_UNIT || bet > this.balance) throw new Error('Choose an affordable bet in $5 chips, minimum $10.');
    this.justShuffled = this.round === 0;
    // 75% cut card, with a reserve for even an unusually long split round.
    if (this.shoe.length < 80) this.shuffle();
    this.round++; this.roundStart = this.balance; this.balance -= bet;
    this.revealed = false; this.net = 0; this.active = 0;
    const hand = makeHand([], bet); this.hands = [hand]; this.dealer = [];
    hand.cards.push(this.draw()); this.dealer.push(this.draw());
    hand.cards.push(this.draw()); this.dealer.push(this.draw(false));
    this.phase = 'player';
    // The peek is public information; the hole card itself remains secret.
    if (natural(hand) || total(this.dealer).points === 21) { hand.done = true; this.phase = 'dealer'; }
  }
  actions() { return this.phase === 'player' ? legalActions(this.hands[this.active], this.balance, this.hands.length) : []; }
  act(action) {
    if (!this.actions().includes(action)) throw new Error('That action is not available.');
    const hand = this.hands[this.active];
    if (action === 'hit') {
      hand.cards.push(this.draw());
      if (total(hand.cards).points >= 21) hand.done = true;
    } else if (action === 'stand') hand.done = true;
    else if (action === 'double') {
      this.balance -= hand.bet; hand.bet *= 2;
      hand.cards.push(this.draw()); hand.done = true;
    } else {
      this.balance -= hand.bet;
      const aces = value(hand.cards[0]) === 1;
      const left = makeHand([hand.cards[0], this.draw()], hand.bet, true, aces);
      const right = makeHand([hand.cards[1], this.draw()], hand.bet, true, aces);
      left.done = aces || total(left.cards).points === 21;
      right.done = aces || total(right.cards).points === 21;
      this.hands.splice(this.active, 1, left, right);
    }
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active >= this.hands.length) this.phase = 'dealer';
  }
  reveal() {
    if (this.phase !== 'dealer') return;
    if (!this.revealed) { this.unknown[value(this.dealer[1])]--; this.revealed = true; }
  }
  dealerNeedsCard() {
    return this.phase === 'dealer' && this.revealed && total(this.dealer).points < 17 &&
      this.hands.some(h => total(h.cards).points <= 21 && !natural(h));
  }
  dealerHit() { if (!this.dealerNeedsCard()) return false; this.dealer.push(this.draw()); return true; }
  settle() {
    if (this.phase !== 'dealer' || !this.revealed || this.dealerNeedsCard()) return false;
    const dealerTotal = total(this.dealer).points;
    const dealerBJ = this.dealer.length === 2 && dealerTotal === 21;
    for (const hand of this.hands) {
      const p = total(hand.cards).points;
      if (p > 21) hand.result = 'bust';
      else if (dealerBJ) hand.result = natural(hand) ? 'push' : 'lose';
      else if (natural(hand)) hand.result = 'blackjack';
      else if (dealerTotal > 21 || p > dealerTotal) hand.result = 'win';
      else hand.result = p === dealerTotal ? 'push' : 'lose';
      hand.net = hand.result === 'blackjack' ? hand.bet * 3 / 2 : hand.result === 'win' ? hand.bet : hand.result === 'push' ? 0 : -hand.bet;
      this.balance += hand.bet + hand.net;
    }
    this.net = this.balance - this.roundStart; this.phase = 'settled'; return true;
  }
  resolveDealer() { this.reveal(); while (this.dealerHit()) {} return this.settle(); }
  next() {
    if (this.phase !== 'settled') return false;
    this.phase = this.balance < MIN_BET ? 'broke' : 'bet'; return true;
  }
  observation() {
    if (this.phase !== 'player') return null;
    // Only public information leaves the engine for the training worker.
    return {
      upcard: this.dealer[0], counts: this.unknown.slice(), available: this.balance,
      handCount: this.hands.length, peeked: [1, 10].includes(value(this.dealer[0])),
      hands: this.hands.slice(this.active).filter(h => !h.done).map(h => ({
        cards: h.cards.slice(), bet: h.bet, fromSplit: h.fromSplit, splitAces: h.splitAces, done: false,
      })),
    };
  }
}
