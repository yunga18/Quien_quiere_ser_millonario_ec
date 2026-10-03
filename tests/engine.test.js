import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../js/questions.js';
import { PRIZES, createGame, currentQuestion, selectAnswer, cancelSelection, lockAnswer, revealAnswer, advanceGame, retire, useLifeline, restoreGame } from '../js/engine.js';

const answer = (game, correct = true) => {
  const q = currentQuestion(game);
  const index = correct ? q.correct : [0, 1, 2, 3].find(i => i !== q.correct && !game.eliminated.includes(i));
  return revealAnswer(lockAnswer(selectAnswer(game, index)));
};
function atQuestion(number) {
  let g = createGame(QUESTIONS, 'Yunga');
  for (let i = 1; i < number; i++) g = advanceGame(answer(g));
  return g;
}
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('90 distinct, complete questions and 18 choices per difficulty pool', () => {
  assert.equal(QUESTIONS.length, 90);
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, 90);
  assert.equal(new Set(QUESTIONS.map(q => q.question)).size, 90);
  for (let difficulty = 1; difficulty <= 5; difficulty++) assert.equal(QUESTIONS.filter(q => q.difficulty === difficulty).length, 18);
  for (const q of QUESTIONS) {
    assert.equal(q.answers.length, 4); assert.equal(new Set(q.answers).size, 4);
    assert.ok(q.question && q.category && q.explanation);
    if (q.source) assert.ok(q.source.startsWith('https://'));
  }
});
test('games draw 15 unique questions with increasing difficulty and shuffled answers', () => {
  const positions = new Set();
  const starts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = createGame(QUESTIONS, '  Yunga  ', random(seed));
    assert.equal(g.name, 'Yunga'); assert.equal(g.questions.length, 15);
    assert.equal(new Set(g.questions.map(q => q.id)).size, 15);
    g.questions.forEach((q, i) => {
      assert.equal(q.difficulty, Math.floor(i / 3) + 1);
      assert.equal(q.answers[q.correct], QUESTIONS.find(original => original.id === q.id).answers[0]);
      positions.add(q.correct);
    });
    starts.add(g.questions[0].id);
  }
  assert.equal(positions.size, 4); assert.ok(starts.size > 1);
});
test('a new game avoids the previous game when enough unused questions exist', () => {
  const first = createGame(QUESTIONS, 'A', random(1));
  const ids = first.questions.map(q => q.id);
  const next = createGame(QUESTIONS, 'B', random(1), ids);
  assert.ok(next.questions.every(q => !ids.includes(q.id)));
  assert.equal(createGame(QUESTIONS, '', random(2), QUESTIONS.map(q => q.id)).questions.length, 15);
});
test('selection can be cancelled; confirmation locks the answer until reveal', () => {
  const g = createGame(QUESTIONS);
  assert.equal(revealAnswer(g), g); assert.equal(lockAnswer(g), g);
  const selected = selectAnswer(g, 0); assert.equal(selected.selected, 0);
  assert.equal(cancelSelection(selected).selected, null);
  const locked = lockAnswer(selected); assert.equal(locked.phase, 'locked');
  assert.equal(selectAnswer(locked, 1), locked); assert.equal(retire(locked), locked);
  assert.equal(useLifeline(locked, 'fifty'), locked);
  assert.equal(selectAnswer(g, 4), g); assert.equal(selectAnswer(g, -1), g);
});
test('all 15 prize amounts, both checkpoints, and the million-dollar victory', () => {
  let g = createGame(QUESTIONS);
  for (let i = 0; i < 15; i++) {
    g = answer(g);
    assert.equal(g.won, PRIZES[i]);
    assert.equal(g.safe, i < 4 ? 0 : i < 9 ? 1000 : 32000);
    const repeat = revealAnswer(g); assert.equal(repeat, g);
    g = advanceGame(g);
  }
  assert.equal(g.phase, 'ended'); assert.equal(g.result.reason, 'won');
  assert.equal(g.result.prize, 1000000); assert.equal(g.result.correctCount, 15);
  assert.equal(advanceGame(g), g);
});
test('a mistake pays only the last completed checkpoint, including checkpoint questions', () => {
  for (const [question, payout] of [[1, 0], [5, 0], [6, 1000], [10, 1000], [11, 32000], [15, 32000]]) {
    const g = advanceGame(answer(atQuestion(question), false));
    assert.equal(g.result.reason, 'lost'); assert.equal(g.result.prize, payout);
    assert.equal(g.result.correctCount, question - 1);
  }
});
test('retirement pays earned money, including above a checkpoint', () => {
  for (const question of [1, 2, 5, 6, 9, 11, 15]) {
    const g = retire(atQuestion(question));
    assert.equal(g.result.reason, 'retired'); assert.equal(g.result.prize, question === 1 ? 0 : PRIZES[question - 2]);
    assert.equal(g.result.correctCount, question - 1);
  }
});
test('50:50 eliminates exactly two wrong options; each lifeline is usable once per game', () => {
  let g = createGame(QUESTIONS);
  g = useLifeline(g, 'fifty', random(3));
  assert.equal(g.eliminated.length, 2); assert.equal(new Set(g.eliminated).size, 2);
  assert.ok(!g.eliminated.includes(currentQuestion(g).correct));
  assert.equal(selectAnswer(g, g.eliminated[0]), g); assert.equal(useLifeline(g, 'fifty'), g);
  g = advanceGame(answer(g));
  assert.equal(g.eliminated.length, 0); assert.equal(g.lifelines.fifty, true);
  assert.equal(useLifeline(g, 'fifty'), g);
});
test('public votes sum to 100, respect prior 50:50, and phone suggestions remain available', () => {
  for (let seed = 0; seed < 50; seed++) {
    let g = atQuestion(13); g = useLifeline(g, 'fifty', random(seed));
    g = useLifeline(g, 'audience', random(seed + 1));
    assert.equal(g.helpers.audience.reduce((a, b) => a + b, 0), 100);
    assert.ok(g.helpers.audience.every(v => Number.isInteger(v) && v >= 0));
    g.eliminated.forEach(i => assert.equal(g.helpers.audience[i], 0));
    assert.equal(useLifeline(g, 'audience'), g);
    g = useLifeline(g, 'phone', random(seed + 2));
    assert.ok(!g.eliminated.includes(g.helpers.phone.answer));
    assert.equal(useLifeline(g, 'phone'), g);
    const next = advanceGame(answer(g));
    assert.deepEqual(next.helpers, { audience: null, phone: null });
    assert.deepEqual(next.lifelines, { fifty: true, audience: true, phone: true });
  }
});
test('simulated public and phone advice can be wrong', () => {
  const g = atQuestion(14);
  assert.notEqual(useLifeline(g, 'phone', () => 0.99).helpers.phone.answer, currentQuestion(g).correct);
  const publicGame = useLifeline(g, 'audience', () => 0.99);
  assert.notEqual(publicGame.helpers.audience.indexOf(Math.max(...publicGame.helpers.audience)), currentQuestion(g).correct);
});
test('reload retains the question order, used helpers, and safe and earned prizes', () => {
  let g = atQuestion(11);
  g = useLifeline(useLifeline(useLifeline(g, 'fifty'), 'audience'), 'phone');
  const restored = restoreGame(JSON.stringify(g), QUESTIONS);
  assert.deepEqual(restored, g);
  const revealed = answer(g);
  assert.deepEqual(restoreGame(JSON.stringify(revealed), QUESTIONS), revealed);
});
test('reload during suspense safely returns to the same unanswered question', () => {
  const g = atQuestion(6);
  const locked = lockAnswer(selectAnswer(g, currentQuestion(g).correct));
  const restored = restoreGame(JSON.stringify(locked), QUESTIONS);
  assert.equal(restored.phase, 'question'); assert.equal(restored.selected, null);
  assert.equal(restored.won, 1000); assert.equal(restored.safe, 1000);
  assert.equal(restored.questions[5].id, g.questions[5].id);
});
test('corrupt or incompatible saves are rejected and facts come from the canonical bank', () => {
  const g = atQuestion(7);
  assert.equal(restoreGame('{', QUESTIONS), null);
  assert.equal(restoreGame({ ...g, version: 999 }, QUESTIONS), null);
  assert.equal(restoreGame({ ...g, index: 16 }, QUESTIONS), null);
  assert.equal(restoreGame({ ...g, phase: 'ended' }, QUESTIONS), null);
  const fake = structuredClone(g); fake.questions[0].question = '<script>fake</script>'; fake.won = 1000000; fake.safe = 1000000;
  const restored = restoreGame(fake, QUESTIONS);
  assert.equal(restored.questions[0].question, g.questions[0].question);
  assert.equal(restored.won, 2000); assert.equal(restored.safe, 1000);
  fake.questions[0].answers[0] = 'not a valid option'; assert.equal(restoreGame(fake, QUESTIONS), null);
  const repeated = structuredClone(g); repeated.questions[1] = repeated.questions[0]; assert.equal(restoreGame(repeated, QUESTIONS), null);
});
