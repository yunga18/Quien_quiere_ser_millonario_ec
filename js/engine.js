export const PRIZES = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
export const SAFE_LEVELS = [5, 10];
export const GAME_VERSION = 1;
export const LETTERS = ['A', 'B', 'C', 'D'];

export function shuffle(values, rng = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame(bank, name = 'Concursante', rng = Math.random, recentIds = []) {
  const questions = [];
  for (let difficulty = 1; difficulty <= 5; difficulty++) {
    const pool = bank.filter(q => q.difficulty === difficulty);
    if (pool.length < 3) throw new Error(`Faltan preguntas del nivel ${difficulty}.`);
    const fresh = shuffle(pool.filter(q => !recentIds.includes(q.id)), rng);
    const recent = shuffle(pool.filter(q => recentIds.includes(q.id)), rng);
    for (const q of [...fresh, ...recent].slice(0, 3)) {
      const answers = shuffle(q.answers, rng);
      questions.push({ ...q, answers, correct: answers.indexOf(q.answers[0]) });
    }
  }
  return {
    version: GAME_VERSION,
    id: globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${Math.floor(rng() * 1e9)}`,
    name: String(name).trim().slice(0, 32) || 'Concursante',
    questions, index: 0, won: 0, safe: 0,
    phase: 'question', selected: null, lastCorrect: null,
    eliminated: [], lifelines: { fifty: false, audience: false, phone: false },
    helpers: { audience: null, phone: null },
    startedAt: new Date().toISOString(), result: null,
  };
}

export const currentQuestion = game => game.questions[game.index];
export const currentPrize = game => PRIZES[game.index];

export function selectAnswer(game, index) {
  if (game.phase !== 'question' || !Number.isInteger(index) || index < 0 || index > 3 || game.eliminated.includes(index)) return game;
  return { ...game, selected: index };
}

export function cancelSelection(game) {
  return game.phase === 'question' ? { ...game, selected: null } : game;
}

export function lockAnswer(game) {
  if (game.phase !== 'question' || game.selected === null || game.eliminated.includes(game.selected)) return game;
  return { ...game, phase: 'locked' };
}

export function revealAnswer(game) {
  if (game.phase !== 'locked') return game;
  const correct = game.selected === currentQuestion(game).correct;
  const level = game.index + 1;
  return {
    ...game, phase: 'revealed', lastCorrect: correct,
    won: correct ? currentPrize(game) : game.won,
    safe: correct && SAFE_LEVELS.includes(level) ? currentPrize(game) : game.safe,
  };
}

function finish(game, reason, prize) {
  return { ...game, phase: 'ended', result: { reason, prize, correctCount: game.index + (game.lastCorrect === true ? 1 : 0), endedAt: new Date().toISOString() } };
}

export function advanceGame(game) {
  if (game.phase !== 'revealed') return game;
  if (!game.lastCorrect) return finish(game, 'lost', game.safe);
  if (game.index === PRIZES.length - 1) return finish(game, 'won', PRIZES.at(-1));
  return {
    ...game, index: game.index + 1, phase: 'question', selected: null, lastCorrect: null,
    eliminated: [], helpers: { audience: null, phone: null },
  };
}

export function retire(game) {
  if (game.phase !== 'question') return game;
  return finish({ ...game, selected: null }, 'retired', game.won);
}

export function useLifeline(game, type, rng = Math.random) {
  if (game.phase !== 'question' || game.selected !== null || !(type in game.lifelines) || game.lifelines[type]) return game;
  const q = currentQuestion(game);
  const next = { ...game, lifelines: { ...game.lifelines, [type]: true }, helpers: { ...game.helpers } };
  if (type === 'fifty') {
    next.eliminated = shuffle([0, 1, 2, 3].filter(i => i !== q.correct), rng).slice(0, 2);
    // Previous public votes and the phone suggestion remain the original advice.
    return next;
  }
  const visible = [0, 1, 2, 3].filter(i => !game.eliminated.includes(i));
  const wrong = visible.filter(i => i !== q.correct);
  const probability = (type === 'audience' ? 0.97 : 0.96) - (q.difficulty - 1) * 0.065;
  const target = rng() < probability ? q.correct : wrong[Math.min(wrong.length - 1, Math.floor(rng() * wrong.length))];
  if (type === 'audience') {
    const favorite = 49 + Math.floor(rng() * 27);
    const weights = visible.map(i => i === target ? 0 : 1 + rng() * 12);
    const sum = weights.reduce((a, b) => a + b, 0);
    const votes = [0, 0, 0, 0];
    let remaining = 100 - favorite;
    const otherIndices = visible.filter(i => i !== target);
    otherIndices.forEach((i, n) => {
      const value = n === otherIndices.length - 1 ? remaining : Math.floor((100 - favorite) * weights[visible.indexOf(i)] / sum);
      votes[i] = value;
      remaining -= value;
    });
    votes[target] = favorite;
    next.helpers.audience = votes;
  } else {
    next.helpers.phone = { answer: target, confident: q.difficulty <= 2 && rng() < 0.7 };
  }
  return next;
}

// Reject incompatible/corrupt saves and reconstruct facts from the real question bank.
export function restoreGame(raw, bank) {
  try {
    const g = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!g || g.version !== GAME_VERSION || !Array.isArray(g.questions) || g.questions.length !== 15) return null;
    if (!Number.isInteger(g.index) || g.index < 0 || g.index > 14 || !['question', 'locked', 'revealed'].includes(g.phase)) return null;
    if (typeof g.name !== 'string' || typeof g.id !== 'string' || typeof g.startedAt !== 'string') return null;
    if (new Set(g.questions.map(q => q.id)).size !== 15) return null;
    const questions = g.questions.map((saved, index) => {
      const original = bank.find(q => q.id === saved.id);
      if (!original || original.difficulty !== Math.floor(index / 3) + 1 || !Array.isArray(saved.answers) || saved.answers.length !== 4) throw new Error('Invalid question');
      if (new Set(saved.answers).size !== 4 || saved.answers.some(a => !original.answers.includes(a))) throw new Error('Invalid answers');
      return { ...original, answers: saved.answers, correct: saved.answers.indexOf(original.answers[0]) };
    });
    if (!g.lifelines || ['fifty', 'audience', 'phone'].some(k => typeof g.lifelines[k] !== 'boolean')) return null;
    if (!Array.isArray(g.eliminated) || ![0, 2].includes(g.eliminated.length) || new Set(g.eliminated).size !== g.eliminated.length) return null;
    if (g.eliminated.some(i => !Number.isInteger(i) || i < 0 || i > 3 || i === questions[g.index].correct) || (g.eliminated.length && !g.lifelines.fifty)) return null;
    if (g.phase === 'revealed' && (!Number.isInteger(g.selected) || g.selected < 0 || g.selected > 3 || g.eliminated.includes(g.selected))) return null;
    const lastCorrect = g.phase === 'revealed' ? g.selected === questions[g.index].correct : null;
    const completed = g.index + (lastCorrect === true ? 1 : 0);
    const safeLevel = SAFE_LEVELS.filter(level => completed >= level).at(-1);
    const helpers = { audience: null, phone: null };
    if (g.helpers?.audience && g.lifelines.audience) {
      const votes = g.helpers.audience;
      if (!Array.isArray(votes) || votes.length !== 4 || votes.some(v => !Number.isInteger(v) || v < 0 || v > 100) || votes.reduce((a, b) => a + b, 0) !== 100) return null;
      helpers.audience = votes;
    }
    if (g.helpers?.phone && g.lifelines.phone) {
      const p = g.helpers.phone;
      if (!Number.isInteger(p.answer) || p.answer < 0 || p.answer > 3 || typeof p.confident !== 'boolean') return null;
      helpers.phone = p;
    }
    return { ...g, questions, name: g.name.slice(0, 32), phase: g.phase === 'locked' ? 'question' : g.phase,
      selected: g.phase === 'revealed' ? g.selected : null, lastCorrect,
      won: completed ? PRIZES[completed - 1] : 0, safe: safeLevel ? PRIZES[safeLevel - 1] : 0,
      helpers, result: null };
  } catch { return null; }
}
