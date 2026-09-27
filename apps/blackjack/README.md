# Blackjack HUD

A self-contained 600×600 blackjack game for the MRBD launcher. No dependencies,
external services, account, or real money. All game assets are local; the initial
load needs a connection, but a loaded game makes no network requests for play.

Choose any whole-dollar starting bankroll from $15 to $200. Build bets with
$5 / $10 / $25 / $50 / $100 chips, then select GO. Minimum bet: $10. Bankrolls
and winnings are held only in memory; refreshing starts a new session. There
is no automatic refill. Winnings can take the balance above the initial $200 cap.

## Controls

- Left/right: move the gold focus. Pinch / Enter / Space: activate.
- Bankroll: up/down changes $1; holding an arrow accelerates to $10 steps.
  Desktop users can also type a whole-dollar amount.
- Chips: up adds one of the selected chip; down removes one. Pinch adds one.
- Normal/Training and sound controls remain available during the session.
- Back / Escape: return to the app launcher. In a number field, Backspace edits.
- Touch swipes use the same directions; buttons also accept ordinary taps/clicks.

## Rules

- Six decks; shuffle between rounds at about 75% penetration, with a minimum
  80-card reserve before dealing a new round. Never shuffle mid-hand.
- Dealer stands on all 17s. Dealer takes a hole card and checks for blackjack
  when showing an ace or ten-value card, before player decisions.
- Natural blackjack pays 3:2; ordinary wins 1:1; equal hands push. A natural
  beats a non-natural 21. Split-hand 21 pays 1:1.
- Double any first two cards, including after non-ace splits, with sufficient
  funds. Exactly one additional card is dealt.
- Split equal-value pairs into at most four hands, with sufficient funds.
  Split aces receive one card each; no resplitting aces.
- No surrender, insurance, side bets, or other player seats.
- Accounting uses integer cents. For example, a $15 natural blackjack earns
  $22.50 profit, plus the returned stake. Fractional balances remain available,
  although bets use $5 chips. A balance below $10 ends the session.

## Training

Training shows hard/soft totals, a rule-matched book action, and estimated win
and push probabilities for the highlighted action. Normal hides all totals,
odds, and recommendations, including split-hand totals. The dealer's hidden
total is never displayed before the reveal.

The strategy is multi-deck S17 with double after split and without surrender,
checked against the [Wizard of Odds strategy reference](https://wizardofodds.com/games/blackjack/strategy/4-decks/).
Unavailable split/double actions have legal fallbacks. Advice maximizes expected
return; the most profitable action need not have the highest win probability.

Odds use up to 6,000 sampled completions per legal action in a small module
worker. Calculations use only public cards, remaining unknown rank counts, and
the public result of the dealer's blackjack check. They cannot see the actual
hole card or future shuffled order. After the highlighted action, remaining
decisions follow the same book strategy and available bankroll constraints.
The worker also completes other pending player hands before resolving the
shared dealer. Normal mode performs no simulations.

Win means positive net profit from the active hand. If an action splits that
hand, it means positive combined profit from its descendant split hands; an
offsetting win/loss is break-even. Results for other pre-existing hands are
excluded. Percentages are approximate, rounded to whole numbers, and may
refine briefly as more samples finish. The book recommendation is independent
of simulation noise. Obsolete jobs are cancelled.

## Verification

Run `npm test` from the repository root. The tests cover money invariants,
3:2 payouts, natural precedence, aces, split limits, double funding, shuffle
timing, every strategy-table cell, hidden-card independence, sampled probability
checks, and 1,500 seeded rounds. Run them before publishing through the existing
Pages deployment workflow.

`index.html`, `style.css`, and `app.js` implement the interface, short CSS card
transitions, and optional synthesized Web Audio cues. `engine.js` contains the
rules; `strategy.js` the deterministic advice; `odds.js`/`worker.js` the training
simulation. Reduced motion is respected and audio/worker failure does not
prevent ordinary play. Physical glasses and Neural Band behavior still require
device testing; desktop validation exercises the same keyboard event mapping.
