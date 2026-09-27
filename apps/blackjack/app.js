import { Blackjack, MIN_BET, SUITS, RANKS, total, value } from './engine.js';
import { advice } from './strategy.js';

const game = new Blackjack();
const $ = id => document.getElementById(id);
const denominations = [500, 1000, 2500, 5000, 10000];
const state = { training:false, sound:true, buyin:200, chips:[0,1,0,0,0], focus:'buyin', busy:false, view:0,
  oddsKey:null, odds:null, oddsError:false, job:0, worker:null, lastAction:'hit', dealing:false, repeat:0 };
const money = cents => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits:cents % 100 ? 2 : 0, maximumFractionDigits:2 });
const bet = () => state.chips.reduce((sum, n, i) => sum + n * denominations[i], 0);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const announce = text => { $('announcement').textContent = text; };
let audio, toastTimer;

function sound(kind = 'chip') {
  if (!state.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
    const o = audio.createOscillator(), g = audio.createGain(), now = audio.currentTime;
    const frequencies = { chip:550, deal:310, win:740, lose:240, push:440 };
    o.type = 'sine'; o.frequency.setValueAtTime(frequencies[kind] || 440, now);
    if (kind === 'win') o.frequency.exponentialRampToValueAtTime(980, now + .12);
    const length = kind === 'deal' || kind === 'chip' ? .055 : .16;
    g.gain.setValueAtTime(.018, now); g.gain.exponentialRampToValueAtTime(.001, now + length);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(now + length + .01);
  } catch { /* Audio is optional; game input remains available. */ }
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
}
function targets() { return [...document.querySelectorAll('[data-focus]')].filter(el => !el.disabled && el.getClientRects().length); }
function setFocus(id, user = false) {
  state.focus = id;
  if (['hit','stand','double','split'].includes(id)) state.lastAction = id;
  document.querySelectorAll('.focus').forEach(el => el.classList.remove('focus'));
  const target = targets().find(el => el.dataset.focus === id);
  target?.classList.add('focus');
  if (user) target?.focus({ preventScroll:true });
  renderOdds();
}
function maintainFocus() {
  const list = targets();
  if (!list.some(el => el.dataset.focus === state.focus)) state.focus = list[0]?.dataset.focus || '';
  setFocus(state.focus);
}
function move(step) {
  if (state.busy) return;
  const list = targets(), index = list.findIndex(el => el.dataset.focus === state.focus);
  if (list.length) setFocus(list[(index + step + list.length) % list.length].dataset.focus, true);
}
function activate() {
  if (state.busy) return;
  if (state.focus === 'buyin') { setFocus('start', true); return; }
  targets().find(el => el.dataset.focus === state.focus)?.click();
}
function cancelOdds() {
  state.job++; state.worker?.postMessage({ cancel:true }); state.oddsKey = null;
  state.odds = null; state.oddsError = false;
}
function updateOdds() {
  if (!state.training || state.busy || game.phase !== 'player') {
    if (state.oddsKey) cancelOdds();
    return;
  }
  const observation = game.observation(), key = JSON.stringify(observation);
  if (key === state.oddsKey) return;
  state.oddsKey = key; state.odds = null; state.oddsError = false;
  const id = ++state.job;
  try {
    if (!state.worker) {
      state.worker = new Worker(new URL('./worker.js', import.meta.url), { type:'module' });
      state.worker.onmessage = ({ data }) => {
        if (data.id !== state.job || !state.training || game.phase !== 'player') return;
        state.odds = data.results || null; state.oddsError = !!data.error; renderOdds();
      };
      state.worker.onerror = () => { state.oddsError = true; state.worker?.terminate(); state.worker = null; renderOdds(); };
    }
    state.worker.postMessage({ id, observation });
  } catch { state.oddsError = true; }
}
function renderOdds() {
  const show = state.training && game.phase === 'player' && !state.busy;
  $('odds').hidden = !show;
  if (!show) return;
  const action = game.actions().includes(state.lastAction) ? state.lastAction : 'hit';
  $('oddsLabel').textContent = (action === 'split' ? 'Split profit after ' : 'Win after ') + action.toUpperCase();
  const r = state.odds?.[action];
  $('oddsValue').textContent = r ? '≈' + Math.round(r.win / r.n * 100) + '%' : '—';
  $('oddsDetail').textContent = r ? `${action === 'split' ? 'Combined split hands · break even' : 'Push'} ≈${Math.round(r.push / r.n * 100)}% · ${r.n < 6000 ? 'refining…' : 'estimate'}` : state.oddsError ? 'Estimate unavailable' : 'Estimating from visible cards…';
}
function paintCards(id, cards, hideHole = false) {
  const row = $(id), n = cards.length;
  const step = Math.min(82, (544 - 70) / Math.max(1, n - 1));
  const span = 70 + step * (n - 1);
  row.classList.toggle('fan', n > 6);
  cards.forEach((card, i) => {
    const hidden = hideHole && i === 1;
    const key = `${game.round}-${id === 'playerCards' ? state.view : 'dealer'}-${hidden ? 'hidden' : card}-${i}`;
    let el = row.children[i];
    if (!el || el.dataset.key !== key) {
      const wasHidden = el?.classList.contains('back');
      const next = document.createElement('div'); next.dataset.key = key;
      next.className = 'card' + (hidden ? ' back' : card % 4 === 1 || card % 4 === 2 ? ' red' : '') + (wasHidden ? ' reveal' : ' arrive');
      if (hidden) { next.textContent = '◇'; next.setAttribute('aria-label','Face-down card'); }
      else {
        next.innerHTML = `<span class="rank">${RANKS[Math.floor(card / 4)]}</span><span class="suit">${SUITS[card % 4]}</span>`;
        next.setAttribute('aria-label', `${RANKS[Math.floor(card / 4)]} ${['spades','hearts','diamonds','clubs'][card % 4]}`);
      }
      if (state.dealing) next.style.setProperty('--delay', `${i * 200 + (id === 'dealerCards' ? 100 : 0)}ms`);
      if (el) el.replaceWith(next); else row.appendChild(next);
      el = next;
    }
    el.style.left = `${(544 - span) / 2 + i * step}px`;
  });
  while (row.children.length > n) row.lastElementChild.remove();
}
function render() {
  const phase = game.phase;
  const atTable = ['player','dealer','settled'].includes(phase);
  $('stage').classList.toggle('normal', !state.training);
  $('setup').hidden = phase !== 'setup'; $('betting').hidden = phase !== 'bet'; $('table').hidden = !atTable; $('broke').hidden = phase !== 'broke';
  $('balanceLabel').textContent = phase === 'setup' ? 'Buy-in' : 'Available';
  $('balance').textContent = money(phase === 'setup' ? state.buyin * 100 : game.balance);
  $('betLabel').textContent = phase === 'setup' ? 'Blackjack' : 'Bet';
  $('headerBet').textContent = phase === 'setup' ? '3:2' : money(phase === 'bet' ? bet() : game.hands.reduce((n,h)=>n+h.bet,0));
  $('mode').textContent = state.training ? 'TRAINING ON' : 'NORMAL'; $('mode').setAttribute('aria-pressed', String(state.training));
  $('sound').textContent = state.sound ? '♪ ON' : '♪ OFF'; $('sound').setAttribute('aria-pressed',String(state.sound)); $('sound').setAttribute('aria-label',state.sound?'Sound on':'Sound off');
  $('start').disabled = state.busy;
  $('betTotal').textContent = money(bet());
  $('betHint').textContent = bet() < MIN_BET ? 'Add chips to reach the $10 minimum' : '$10 minimum · $5 increments';
  $('go').disabled = state.busy || bet() < MIN_BET || bet() > game.balance;
  $('clear').disabled = state.busy || bet() === 0;
  denominations.forEach((n,i)=>{
    $('chip'+i).disabled = state.busy || (bet()+n > game.balance && state.chips[i] === 0);
    $('qty'+i).textContent = '× ' + state.chips[i]; $('remove'+i).disabled = state.busy || !state.chips[i];
  });
  const legal = game.actions();
  for (const action of ['hit','stand','double','split']) $(action).disabled = state.busy || !legal.includes(action);
  $('actions').hidden = phase !== 'player'; $('next').hidden = phase !== 'settled'; $('next').disabled = state.busy;
  if (atTable) {
    if (phase === 'player') state.view = game.active;
    state.view = Math.min(state.view, game.hands.length - 1);
    const hand = game.hands[state.view], score = total(hand.cards);
    $('handLabel').textContent = game.hands.length > 1 ? `Your hand ${state.view + 1} of ${game.hands.length} · ${money(hand.bet)}` : 'Your hand';
    $('dealerTotal').hidden = $('playerTotal').hidden = !state.training;
    $('dealerTotal').textContent = game.revealed ? String(total(game.dealer).points) : (value(game.dealer[0]) === 1 ? 'A' : value(game.dealer[0])) + ' + ?';
    $('playerTotal').textContent = (score.soft ? 'Soft ' : '') + score.points;
    paintCards('dealerCards', game.dealer, !game.revealed); paintCards('playerCards', hand.cards);
    $('handStrip').hidden = game.hands.length < 2;
    const strip = game.hands.map((h,i)=> {
      const status = h.result ? h.result.toUpperCase() : i === game.active && phase === 'player' ? 'PLAY' : h.done ? 'DONE' : 'WAIT';
      return `<button class="hand-chip ${i === state.view?'current':''}" ${phase === 'settled'?`data-focus="hand${i}"`:'disabled'} data-hand="${i}">${i+1} · ${state.training ? total(h.cards).points+' · ' : ''}${status}</button>`;
    }).join('');
    if ($('handStrip').innerHTML !== strip) $('handStrip').innerHTML = strip;
    $('coach').hidden = !state.training && phase === 'player' && !state.busy;
    if (state.busy || phase === 'dealer') {
      $('advice').textContent = state.dealing ? game.justShuffled ? 'FRESH SHOE · DEALING' : 'DEALING' : phase === 'dealer' ? 'DEALER’S TURN' : 'DEALING';
      $('reason').textContent = phase === 'dealer' && !state.dealing ? 'Dealer stands on all 17s' : 'Blackjack pays 3:2';
    } else if (phase === 'settled') {
      const prefix = hand.result === 'blackjack' ? 'BLACKJACK' : hand.result === 'push' ? 'PUSH' : hand.result === 'win' ? 'YOU WIN' : hand.result === 'bust' ? 'BUST' : 'YOU LOSE';
      $('advice').textContent = prefix + (hand.net ? ' '+(hand.net>0?'+':'−')+money(Math.abs(hand.net)) : '');
      $('reason').textContent = game.hands.length > 1 ? `Round ${game.net >= 0 ? '+' : '−'}${money(Math.abs(game.net))} · select a hand to review` : 'Bet settled · choose Next Hand when ready';
    } else if (phase === 'player' && state.training) {
      const tip = advice(hand, game.dealer[0], legal);
      $('advice').textContent = 'Book says ' + tip.action.toUpperCase(); $('reason').textContent = tip.reason;
    }
  }
  $('remaining').textContent = money(game.balance);
  $('hint').textContent = state.busy ? 'Cards in play…' : phase === 'setup' ? '← → choose · ↑ ↓ adjust · pinch select' : phase === 'bet' ? '← → choose · ↑ add · ↓ remove · pinch select' : phase === 'settled' ? 'Pinch for next hand · back to apps' : phase === 'broke' ? 'Refresh to start again · back to apps' : '← → choose · pinch play · back to apps';
  if (!state.busy) maintainFocus();
  else document.querySelectorAll('.focus').forEach(el => el.classList.remove('focus'));
  updateOdds(); renderOdds();
}
function changeBuyin(delta) {
  if (game.phase !== 'setup') return;
  state.buyin = Math.max(15, Math.min(200, state.buyin + delta)); $('buyin').value = state.buyin; render();
}
function changeChip(i, delta) {
  if (state.busy || game.phase !== 'bet') return;
  if (delta > 0 && bet()+denominations[i] > game.balance) return;
  state.chips[i] = Math.max(0, state.chips[i]+delta); if (delta > 0) sound(); render();
}
async function finishDealer() {
  if (game.phase !== 'dealer') return;
  cancelOdds(); game.reveal(); render(); sound('deal'); await delay(reducedMotion?70:280);
  while (game.dealerHit()) { render(); sound('deal'); await delay(reducedMotion?70:270); }
  game.settle(); state.busy = false; state.view = 0; state.focus = 'next'; render();
  sound(game.net > 0?'win':game.net < 0?'lose':'push');
  announce(`Round complete. ${game.net >= 0 ? 'Won' : 'Lost'} ${money(Math.abs(game.net))}. Available ${money(game.balance)}.`);
}
async function play(action) {
  if (state.busy || !game.actions().includes(action)) return;
  state.busy = true; cancelOdds();
  try {
    game.act(action); state.lastAction = 'hit'; state.focus = 'hit'; render();
    if (action !== 'stand') sound('deal');
    await delay(reducedMotion?40:240);
    if (game.phase === 'dealer') await finishDealer();
    else { state.busy = false; render(); }
  } catch (error) { state.busy = false; toast(error.message); render(); }
}
denominations.forEach((n,i)=> {
  const stack = document.createElement('div'); stack.className='chip-stack';
  stack.innerHTML=`<button class="chip" id="chip${i}" data-focus="chip${i}" aria-label="Add ${money(n)} chip">${money(n)}</button><span class="quantity" id="qty${i}">× 0</span><button class="remove" id="remove${i}" aria-label="Remove ${money(n)} chip">−</button>`;
  $('chipRail').appendChild(stack);
  $('chip'+i).addEventListener('click',()=>changeChip(i,1)); $('remove'+i).addEventListener('click',()=>changeChip(i,-1));
});
$('mode').addEventListener('click',()=>{ if(state.busy)return; state.training=!state.training;cancelOdds();render(); });
$('sound').addEventListener('click',()=>{state.sound=!state.sound;sound();render();});
$('less').addEventListener('click',()=>changeBuyin(-1)); $('more').addEventListener('click',()=>changeBuyin(1));
$('buyin').addEventListener('change',()=>{
  const value=Number($('buyin').value); state.buyin=Math.max(15,Math.min(200,Math.round(value||15)));$('buyin').value=state.buyin;render();
});
$('start').addEventListener('click',()=>{
  if(game.phase!=='setup'||state.busy)return;
  try { game.start(state.buyin*100);state.focus='chip0';sound();render();announce('Choose chips, then Go.'); } catch(e){toast(e.message);}
});
$('clear').addEventListener('click',()=>{if(state.busy)return;state.chips=[0,0,0,0,0];state.focus='chip0';render();});
$('go').addEventListener('click',async()=>{
  if(state.busy||game.phase!=='bet')return;
  try {
    game.deal(bet());state.busy=true;state.dealing=true;state.view=0;state.focus='hit';state.lastAction='hit';cancelOdds();render();sound('deal');
    await delay(reducedMotion?80:540);state.dealing=false;
    if(game.phase==='dealer')await finishDealer();else{state.busy=false;render();announce('Your turn.');}
  } catch(e){state.busy=false;state.dealing=false;toast(e.message);render();}
});
for(const action of ['hit','stand','double','split']) $(action).addEventListener('click',()=>play(action));
$('next').addEventListener('click',()=>{
  if(state.busy||!game.next())return;
  if(bet()>game.balance)state.chips=[0,1,0,0,0];
  state.focus=game.phase==='broke'?'exit':'go';cancelOdds();render();
});
$('handStrip').addEventListener('click',e=>{
  const button=e.target.closest('[data-hand]');if(!button||state.busy||game.phase!=='settled')return;
  state.view=Number(button.dataset.hand);state.focus='hand'+state.view;render();
});
$('exit').addEventListener('click',()=>{location.href='../../index.html';});
document.addEventListener('focusin',e=>{if(e.target.dataset.focus)setFocus(e.target.dataset.focus);});
document.addEventListener('pointerover',e=>{const b=e.target.closest('[data-focus]');if(b&&!b.disabled&&!state.busy)setFocus(b.dataset.focus);});
function gesture(direction) {
  if(state.busy)return;
  if(direction==='left'||direction==='right'){move(direction==='left'?-1:1);return;}
  if(direction==='pinch'){activate();return;}
  const delta=direction==='up'?1:-1;
  if(game.phase==='setup'&&state.focus==='buyin')changeBuyin(delta*(state.repeat>7?10:1));
  else if(game.phase==='bet'&&/^chip\d$/.test(state.focus))changeChip(Number(state.focus.slice(4)),delta);
  else move(delta===1?-1:1);
}
document.addEventListener('keydown',e=>{
  const map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Enter:'pinch',' ':'pinch'};
  if(e.key==='Escape'||(e.key==='Backspace'&&e.target!==$('buyin'))){e.preventDefault();if(!state.busy)location.href='../../index.html';return;}
  const g=map[e.key];if(!g)return;e.preventDefault();
  if(e.repeat){if(game.phase==='setup'&&state.focus==='buyin'&&['up','down'].includes(g))state.repeat++;else return;}else state.repeat=0;
  if(g==='pinch'&&e.target.matches('button')&&!e.target.dataset.focus){e.target.click();return;}
  gesture(g);
});
document.addEventListener('keyup',()=>{state.repeat=0;});
let touch=null;
document.addEventListener('touchstart',e=>{const t=e.changedTouches[0];touch={x:t.clientX,y:t.clientY};},{passive:true});
document.addEventListener('touchend',e=>{
  if(!touch)return;const t=e.changedTouches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y;touch=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))>=30){e.preventDefault();gesture(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');}
  else if(!e.target.closest('button,input')){e.preventDefault();gesture('pinch');}
},{passive:false});
document.addEventListener('touchcancel',()=>{touch=null;});
window.addEventListener('pagehide',()=>{cancelOdds();state.worker?.terminate();state.worker=null;audio?.close().catch(()=>{});audio=null;});
window.addEventListener('pageshow',event=>{if(event.persisted)render();});
render();
