import { sample, seededRandom, seedFor } from './odds.js';
import { legalActions } from './engine.js';
let generation = 0;
self.onmessage = ({ data }) => {
  const token = ++generation;
  if (data.cancel) return;
  const { id, observation } = data;
  const actions = legalActions(observation.hands[0], observation.available, observation.handCount);
  const results = Object.fromEntries(actions.map(action => [action, { win: 0, push: 0, lose: 0, n: 0 }]));
  const rng = Object.fromEntries(actions.map(action => [action, seededRandom(seedFor(JSON.stringify(observation) + action))]));
  function batch() {
    if (token !== generation) return;
    try {
      for (const action of actions) {
        const r = results[action];
        for (let i = 0; i < 250; i++) { r[sample(observation, action, rng[action])]++; r.n++; }
      }
      const n = results[actions[0]]?.n || 0;
      if (n === 500 || n === 2000 || n >= 6000) self.postMessage({ id, results, complete: n >= 6000 });
      if (n < 6000 && n > 0) setTimeout(batch, 0);
    } catch { self.postMessage({ id, error: true }); }
  }
  batch();
};
