import test from 'node:test';
import assert from 'node:assert/strict';
import { Blackjack, total, natural, value } from './engine.js';
import { bookAction } from './strategy.js';
import { estimate, seededRandom } from './odds.js';

const c = (rank, suit = 0) => (rank - 1) * 4 + suit;
function rig(ranks, bankroll = 20000) {
  const game = new Blackjack(seededRandom(731)); game.start(bankroll);
  const cards = ranks.map(r => Array.isArray(r) ? c(...r) : c(r));
  for (const card of cards) { const i = game.shoe.indexOf(card); assert.ok(i >= 0); game.shoe.splice(i,1); }
  game.shoe.push(...cards.reverse()); return game;
}

test('bankroll and bets enforce whole dollars, chip units, minimum, and available funds', () => {
  for (const n of [1499,20001,1550,NaN,Infinity]) assert.throws(()=>new Blackjack().start(n));
  const g=rig([10,6,7,10],1500);
  for(const n of [500,1100,2000,1000.5])assert.throws(()=>g.deal(n));
  g.deal(1000);assert.equal(g.balance,500);assert.deepEqual(g.actions(),['hit','stand']);
  assert.throws(()=>g.start(20000));assert.throws(()=>g.deal(1000));
});
test('six decks, correct ace totals, and natural distinction',()=>{
  const g=new Blackjack(seededRandom(1));g.start(20000);assert.equal(g.shoe.length,312);
  for(let i=0;i<52;i++)assert.equal(g.shoe.filter(c=>c===i).length,6);
  assert.deepEqual(total([c(1),c(6)]),{points:17,soft:true});
  assert.deepEqual(total([c(1),c(6),c(10)]),{points:17,soft:false});
  assert.deepEqual(total([c(1),c(1),c(9)]),{points:21,soft:true});
  assert.equal(natural({cards:[c(1),c(10)],fromSplit:true}),false);
});
test('3:2 pays exact cents, returns stake, and settles only once',()=>{
  const g=rig([10,9,1,7]);g.deal(1500);assert.equal(g.phase,'dealer');assert.equal(g.balance,18500);
  g.resolveDealer();assert.equal(g.balance,22250);assert.equal(g.net,2250);assert.equal(g.hands[0].result,'blackjack');
  assert.equal(g.settle(),false);assert.equal(g.balance,22250);assert.equal(g.dealer.length,2);
});
test('both naturals push; dealer peek prevents playing against a natural',()=>{
  const g=rig([1,10,10,1]);g.deal(1000);assert.equal(g.phase,'dealer');g.resolveDealer();assert.equal(g.balance,20000);
  const h=rig([10,1,9,10]);h.deal(1000);assert.equal(h.phase,'dealer');assert.deepEqual(h.actions(),[]);h.resolveDealer();assert.equal(h.balance,19000);
});
test('dealer stands on soft 17 and draws on hard 16',()=>{
  const g=rig([10,1,7,6]);g.deal(1000);g.act('stand');g.resolveDealer();assert.equal(g.dealer.length,2);assert.equal(g.hands[0].result,'push');
  const h=rig([10,10,8,6,3]);h.deal(1000);h.act('stand');h.resolveDealer();assert.equal(total(h.dealer).points,19);assert.equal(h.balance,19000);
});
test('double takes one card and exactly one extra stake',()=>{
  const g=rig([5,6,6,10,10,2]);g.deal(1000);g.act('double');assert.equal(g.hands[0].bet,2000);assert.equal(g.hands[0].cards.length,3);assert.equal(g.balance,18000);
  assert.throws(()=>g.act('double'));g.resolveDealer();assert.equal(g.balance,22000);
});
test('bust loses immediately; dealer reveals but need not draw',()=>{
  const g=rig([10,5,6,10,10]);g.deal(1000);g.act('hit');assert.equal(g.phase,'dealer');
  g.resolveDealer();assert.equal(g.hands[0].result,'bust');assert.equal(g.balance,19000);assert.equal(g.dealer.length,2);assert.equal(g.revealed,true);
});
test('split aces get one card, cannot resplit, and split 21 pays 1:1',()=>{
  const g=rig([1,10,1,10,10,9]);g.deal(1000);g.act('split');assert.equal(g.hands.length,2);assert.equal(g.phase,'dealer');
  g.resolveDealer();assert.equal(g.hands[0].result,'win');assert.equal(g.hands[0].net,1000);assert.equal(g.hands[1].result,'push');assert.equal(g.balance,21000);
});
test('resplits stop at four hands and double after split remains available',()=>{
  const g=rig([8,6,[8,1],10,[8,2],[8,3],8,[8,1],2,3]);g.deal(1000);
  g.act('split');g.act('split');g.act('split');assert.equal(g.hands.length,4);assert.equal(g.balance,16000);
  assert.equal(g.actions().includes('double'),true);assert.equal(g.actions().includes('split'),false);
  g.act('stand');g.act('stand');assert.equal(g.actions().includes('split'),false);
});
test('insufficient funds forbid split and double; next round requires minimum',()=>{
  const g=rig([8,10,8,9],1500);g.deal(1000);assert.equal(g.actions().includes('split'),false);
  assert.equal(bookAction(g.hands[0],g.dealer[0],g.actions()),'hit');g.act('stand');g.resolveDealer();g.next();assert.equal(g.phase,'broke');assert.equal(g.balance,500);
});
test('shuffle happens only between rounds at the cut card',()=>{
  const g=rig([10,6,7,10,2]);g.deal(1000);const shoe=g.shoeNumber;g.shoe=g.shoe.slice(-79);
  g.act('stand');g.resolveDealer();assert.equal(g.shoeNumber,shoe);g.next();g.deal(1000);assert.equal(g.shoeNumber,shoe+1);assert.equal(g.shoe.length,308);
});
test('public observations do not leak hidden card or future shoe',()=>{
  const a=rig([5,6,6,10]),b=rig([5,6,6,9]);a.deal(1000);b.deal(1000);
  assert.notEqual(a.dealer[1],b.dealer[1]);assert.deepEqual(a.observation(),b.observation());
  assert.equal(a.observation().counts.reduce((x,y)=>x+y,0),309);
  assert.deepEqual(estimate(a.observation(),'hit',1500,17),estimate(b.observation(),'hit',1500,17));
});

// Independently transcribed S17/DAS chart. Columns: 2 3 4 5 6 7 8 9 10 A.
const hard={4:'HHHHHHHHHH',5:'HHHHHHHHHH',6:'HHHHHHHHHH',7:'HHHHHHHHHH',8:'HHHHHHHHHH',9:'HDDDDHHHHH',10:'DDDDDDDDHH',11:'DDDDDDDDDH',12:'HHSSSHHHHH',13:'SSSSSHHHHH',14:'SSSSSHHHHH',15:'SSSSSHHHHH',16:'SSSSSHHHHH',17:'SSSSSSSSSS',18:'SSSSSSSSSS',19:'SSSSSSSSSS',20:'SSSSSSSSSS'};
const soft={13:'HHHDDHHHHH',14:'HHHDDHHHHH',15:'HHDDDHHHHH',16:'HHDDDHHHHH',17:'HDDDDHHHHH',18:'SDDDDSSHHH',19:'SSSSSSSSSS',20:'SSSSSSSSSS'};
const pairs={1:'PPPPPPPPPP',2:'PPPPPPHHHH',3:'PPPPPPHHHH',4:'HHHPPHHHHH',5:'DDDDDDDDHH',6:'PPPPPHHHHH',7:'PPPPPPHHHH',8:'PPPPPPPPPP',9:'PPPPPSPPSS',10:'SSSSSSSSSS'};
const names={H:'hit',S:'stand',D:'double',P:'split'},upcards=[2,3,4,5,6,7,8,9,10,1];
test('all hard, soft, and pair strategy chart cells match multi-deck S17/DAS',()=>{
  for(const [p,row]of Object.entries(hard)){
    const n=+p, a=n>11?10:Math.floor(n/2),b=n-a;
    for(let i=0;i<10;i++)assert.equal(bookAction({cards:[c(a),c(b)]},c(upcards[i]),['hit','stand','double']),names[row[i]],`hard ${p} vs ${upcards[i]}`);
  }
  for(const [p,row]of Object.entries(soft))for(let i=0;i<10;i++)assert.equal(bookAction({cards:[c(1),c(+p-11)]},c(upcards[i]),['hit','stand','double']),names[row[i]],`soft ${p} vs ${upcards[i]}`);
  for(const [p,row]of Object.entries(pairs))for(let i=0;i<10;i++)assert.equal(bookAction({cards:[c(+p),c(+p)]},c(upcards[i])),names[row[i]],`pair ${p} vs ${upcards[i]}`);
});
test('legal double fallbacks distinguish soft 18 from lower totals',()=>{
  assert.equal(bookAction({cards:[c(1),c(7)]},c(6),['hit','stand']),'stand');
  assert.equal(bookAction({cards:[c(5),c(6)]},c(6),['hit','stand']),'hit');
  assert.equal(bookAction({cards:[c(1),c(3),c(4)]},c(6),['hit','stand']),'stand');
});
test('win estimates match independently sampled six-deck reference ranges',()=>{
  const g=rig([5,6,6,10]);g.deal(1000);const obs=g.observation();
  const stand=estimate(obs,'stand',16000,71),hit=estimate(obs,'hit',16000,72),double=estimate(obs,'double',16000,72);
  assert.ok(Math.abs(stand.win/stand.n-.423)<.02);assert.equal(stand.push,0);
  assert.ok(Math.abs(hit.win/hit.n-.638)<.02);assert.deepEqual(hit,double);
  assert.equal(hit.win+hit.push+hit.lose,hit.n);
});
test('split probability models aggregate net profit and is reproducible',()=>{
  const g=rig([8,6,8,10]);g.deal(1000);const a=estimate(g.observation(),'split',2000,89),b=estimate(g.observation(),'split',2000,89);
  assert.deepEqual(a,b);assert.equal(a.win+a.push+a.lose,2000);assert.ok(a.win>0&&a.lose>0&&a.push>0);
});
test('1,500 seeded rounds preserve funds, legal play, card counts, and integer payouts',()=>{
  let g=new Blackjack(seededRandom(189));g.start(20000);
  for(let round=0;round<1500;round++){
    if(g.phase==='broke'){g=new Blackjack(seededRandom(round+44));g.start(20000);}
    g.deal(1500<=g.balance?1500:1000);
    let decisions=0;
    while(g.phase==='player'){
      assert.ok(++decisions<100);assert.equal(g.balance+g.hands.reduce((n,h)=>n+h.bet,0),g.roundStart);
      const action=bookAction(g.hands[g.active],g.dealer[0],g.actions());assert.ok(g.actions().includes(action));g.act(action);
      assert.ok(g.balance>=0);assert.ok(g.hands.length<=4);
    }
    g.resolveDealer();assert.ok(Number.isInteger(g.balance));assert.ok(g.balance>=0);
    assert.equal(g.net,g.hands.reduce((n,h)=>n+h.net,0));
    assert.ok(g.unknown.every(n=>n>=0));assert.equal(g.unknown.reduce((n,x)=>n+x,0),g.shoe.length);
    g.next();
  }
});
