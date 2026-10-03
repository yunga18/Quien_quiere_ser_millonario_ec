import { QUESTIONS } from './questions.js';
import { PRIZES, LETTERS, SAFE_LEVELS, createGame, currentQuestion, currentPrize, selectAnswer, cancelSelection, lockAnswer, revealAnswer, advanceGame, retire, useLifeline, restoreGame } from './engine.js';
import { StudioAudio, speak } from './audio.js';

const $ = id => document.getElementById(id);
const money = value => '$' + new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 }).format(value);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const KEYS = { save: 'millonario.ec.game.v1', preferences: 'millonario.ec.preferences.v1', history: 'millonario.ec.history.v1' };
let storageAvailable = true;
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { storageAvailable = false; return false; } }
function remove(key) { try { localStorage.removeItem(key); } catch { storageAvailable = false; } }
try { localStorage.setItem('millonario.ec.storage-test', '1'); localStorage.removeItem('millonario.ec.storage-test'); } catch { storageAvailable = false; }
const storedPreferences = read(KEYS.preferences, {});
const preferences = { sound: storedPreferences?.sound !== false, voice: storedPreferences?.voice === true, name: typeof storedPreferences?.name === 'string' ? storedPreferences.name.slice(0, 32) : '' };
let history = read(KEYS.history, []);
if (!Array.isArray(history)) history = [];
history = history.filter(h => h && typeof h.id === 'string' && typeof h.name === 'string' && typeof h.endedAt === 'string' && Number.isInteger(h.correctCount) && h.correctCount >= 0 && h.correctCount <= 15 && [0, ...PRIZES].includes(h.prize)).slice(0, 20);
let savedGame = restoreGame(read(KEYS.save, null), QUESTIONS);
if (!savedGame) remove(KEYS.save);
let game = null;
let screen = 'home';
let dialogType = null;
let phoneInterval = null;
let revealTimeout = null;
let toastTimeout = null;
const audio = new StudioAudio(preferences.sound);
const dialog = $('dialog');

function announce(text) { $('announcer').textContent = text; }
function toast(message) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimeout);
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message;
  document.body.append(el); toastTimeout = setTimeout(() => el.remove(), 4200);
}
function setScreen(next) {
  screen = next;
  for (const name of ['home', 'game', 'result']) $(name + '-screen').hidden = name !== next;
  document.body.dataset.screen = next;
  if (next !== 'game') { audio.stopAmbience(); speak('', false); }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function saveGame() {
  if (!game || game.phase === 'ended') return;
  savedGame = game;
  write(KEYS.save, game);
}
function updateResume() {
  $('resume-button').hidden = !savedGame;
  if (savedGame) $('resume-button').querySelector('span').textContent = `Continuar · ${savedGame.name} · pregunta ${savedGame.index + 1}`;
  $('player-name').value = preferences.name || savedGame?.name || '';
}
function home() {
  if (game?.phase === 'locked') { toast('La respuesta se está revelando. Espera un momento.'); return; }
  if (screen === 'game') saveGame();
  setScreen('home'); updateResume();
  $('player-name').focus({ preventScroll: true });
}
function readQuestion() {
  if (!game || game.phase !== 'question') return;
  const q = currentQuestion(game);
  const answers = q.answers.map((answer, i) => game.eliminated.includes(i) ? '' : `${LETTERS[i]}. ${answer}.`).join(' ');
  speak(`Pregunta ${game.index + 1}. Por ${money(currentPrize(game))} dólares virtuales. ${q.question} ${answers}`, preferences.voice);
}
function startGame(name) {
  const recentIds = history.slice(0, 3).flatMap(h => Array.isArray(h.questionIds) ? h.questionIds : []);
  game = createGame(QUESTIONS, name, Math.random, recentIds);
  preferences.name = game.name; write(KEYS.preferences, preferences);
  audio.cue('start'); audio.startAmbience();
  setScreen('game'); renderGame(true); saveGame(); readQuestion();
}
function resume() {
  if (!savedGame) return;
  game = savedGame; audio.cue('start'); audio.startAmbience();
  setScreen('game'); renderGame(true);
  if (game.phase === 'question') readQuestion();
}

function renderGame(focus = false) {
  const q = currentQuestion(game);
  const questionNumber = String(game.index + 1).padStart(2, '0');
  $('contestant-name').textContent = game.name;
  $('question-number').textContent = `PREGUNTA ${questionNumber} / 15`;
  $('question-category').textContent = q.category.toLocaleUpperCase('es');
  $('question-value').textContent = `POR ${money(currentPrize(game))}`;
  $('question-text').textContent = q.question;
  $('earned-prize').textContent = money(game.won);
  $('safe-prize').textContent = money(game.safe);
  const answers = $('answer-grid'); answers.replaceChildren();
  q.answers.forEach((answer, i) => {
    const button = document.createElement('button');
    button.className = 'answer-button'; button.dataset.answer = i;
    button.disabled = game.phase !== 'question' || game.eliminated.includes(i);
    button.setAttribute('aria-label', `${LETTERS[i]}: ${answer}${game.eliminated.includes(i) ? ', eliminada' : ''}`);
    button.setAttribute('aria-pressed', String(game.selected === i));
    button.innerHTML = '<span class="answer-inner"><span class="answer-letter"></span><span class="answer-text"></span><span class="answer-diamond" aria-hidden="true">◆</span></span>';
    button.querySelector('.answer-letter').textContent = LETTERS[i] + ':';
    button.querySelector('.answer-text').textContent = answer;
    if (game.eliminated.includes(i)) button.classList.add('eliminated');
    if (game.selected === i) button.classList.add('selected');
    if (game.phase === 'locked') button.classList.add('locked');
    if (game.phase === 'revealed') {
      if (i === q.correct) button.classList.add('correct');
      else if (i === game.selected) button.classList.add('wrong');
    }
    button.addEventListener('click', () => chooseAnswer(i));
    answers.append(button);
  });
  for (const type of ['fifty', 'audience', 'phone']) {
    const button = $('lifeline-' + type);
    button.disabled = game.lifelines[type] || game.phase !== 'question' || game.selected !== null;
    button.classList.toggle('used', game.lifelines[type]);
    button.setAttribute('aria-label', ({ fifty: 'Cincuenta cincuenta', audience: 'Ayuda del público', phone: 'Llamada a un amigo' })[type] + (game.lifelines[type] ? ', ya utilizado' : ', disponible'));
  }
  const ladder = $('prize-ladder'); ladder.replaceChildren();
  PRIZES.map((amount, index) => ({ amount, index })).reverse().forEach(({ amount, index }) => {
    const step = document.createElement('li'); step.className = 'prize-step'; step.value = index + 1;
    if (SAFE_LEVELS.includes(index + 1)) step.classList.add('is-safe');
    if (index < game.index || (index === game.index && game.lastCorrect)) step.classList.add('is-completed');
    if (index === game.index) { step.classList.add('is-current'); step.setAttribute('aria-current', 'step'); }
    step.innerHTML = `<span class="step-number">${index + 1}</span><span class="step-mark" aria-hidden="true"></span><span class="step-amount">${money(amount)}</span>`;
    step.setAttribute('aria-label', `Pregunta ${index + 1}, ${money(amount)}${SAFE_LEVELS.includes(index + 1) ? ', nivel seguro' : ''}`);
    ladder.append(step);
  });
  $('explanation').hidden = game.phase !== 'revealed';
  $('explanation').classList.toggle('is-wrong', game.lastCorrect === false);
  if (game.phase === 'revealed') {
    const safeHit = game.lastCorrect && SAFE_LEVELS.includes(game.index + 1);
    $('explanation-heading').textContent = game.lastCorrect ? (safeHit ? `¡Nivel seguro! ${money(game.safe)} son tuyos pase lo que pase.` : `¡Respuesta correcta! Ya tienes ${money(game.won)}.`) : `La respuesta correcta era ${LETTERS[q.correct]}: ${q.answers[q.correct]}.`;
    $('explanation-text').textContent = q.explanation;
    $('explanation-source').hidden = !q.source;
    if (q.source) $('explanation-source').href = q.source;
    $('explanation').querySelector('use').setAttribute('href', game.lastCorrect ? '#i-check' : '#i-info');
  }
  $('retire-button').hidden = game.phase !== 'question';
  $('pause-button').hidden = game.phase !== 'question';
  $('next-button').hidden = game.phase !== 'revealed';
  $('next-button').innerHTML = (game.lastCorrect && game.index < 14 ? 'Siguiente pregunta ' : 'Ver mi resultado ') + icon('arrow');
  $('game-hint').textContent = game.phase === 'locked' ? 'Respuesta definitiva. El estudio guarda silencio…' : game.phase === 'revealed' ? (game.lastCorrect ? 'Cada vez estás más cerca del millón.' : `Conservas tu seguro de ${money(game.safe)}.`) : 'Elige una respuesta. Tómate tu tiempo.';
  $('host-caption').textContent = game.phase === 'locked' ? 'Bien… ¡es el momento de revelar la respuesta!' : game.phase === 'revealed' ? (game.lastCorrect ? (game.index === 14 ? '¡Ecuador tiene un nuevo millonario!' : '¡Correcto! ¿Seguimos hacia el millón?') : 'Lo siento, esa no era la respuesta correcta.') : (game.selected !== null ? '¿Esa es tu respuesta definitiva?' : game.index === 0 ? 'Bienvenido al estudio. ¡Vamos por ese millón!' : SAFE_LEVELS.includes(game.index + 1) ? 'Esta pregunta asegura tu premio. Piénsala bien.' : `La siguiente pregunta es por ${money(currentPrize(game))}.`);
  document.querySelector('.helper-reopen')?.remove();
  if (game.phase === 'question' && (game.helpers.audience || game.helpers.phone)) {
    const row = document.createElement('div'); row.className = 'helper-reopen';
    if (game.helpers.audience) { const b = document.createElement('button'); b.textContent = 'Ver votos del público'; b.addEventListener('click', () => showAudience()); row.append(b); }
    if (game.helpers.phone) { const b = document.createElement('button'); b.textContent = 'Recordar la llamada'; b.addEventListener('click', () => showPhone(false)); row.append(b); }
    answers.after(row);
  }
  if (focus) $('question-text').focus({ preventScroll: true });
}

function openDialog(type, html) {
  if (dialog.open) return false;
  dialogType = type; $('dialog-content').innerHTML = html; dialog.showModal(); return true;
}
function closeDialog() {
  clearInterval(phoneInterval); phoneInterval = null;
  const cancelAnswer = dialogType === 'confirm' && game?.phase === 'question';
  const oldSelection = game?.selected;
  if (dialogType === 'phone') speak('', false);
  dialogType = null;
  if (cancelAnswer) { game = cancelSelection(game); renderGame(); }
  dialog.close();
  if (cancelAnswer) document.querySelector(`[data-answer="${oldSelection}"]`)?.focus({ preventScroll: true });
}
$('dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });

function chooseAnswer(index) {
  const next = selectAnswer(game, index);
  if (next === game) return;
  game = next; audio.cue('select'); renderGame();
  openDialog('confirm', '<span class="dialog-eyebrow">EL MOMENTO DE DECIDIR</span><h2 id="dialog-title">¿Respuesta definitiva?</h2><p id="confirm-question"></p><div class="definitive-answer"><b id="confirm-letter"></b><span id="confirm-answer"></span></div><p class="fine-print">Una vez confirmada, no podrás cambiarla.</p><div class="dialog-actions"><button class="outline-button" id="confirm-cancel">Pensarlo de nuevo</button><button class="gold-button" id="confirm-final">Sí, definitiva ' + icon('check') + '</button></div>');
  $('confirm-question').textContent = currentQuestion(game).question;
  $('confirm-letter').textContent = LETTERS[index] + ':';
  $('confirm-answer').textContent = currentQuestion(game).answers[index];
  $('confirm-cancel').addEventListener('click', closeDialog);
  $('confirm-final').addEventListener('click', () => {
    if (game.phase !== 'question' || game.selected === null) return;
    game = lockAnswer(game); closeDialog(); audio.cue('lock'); speak('', false);
    renderGame(); saveGame(); announce('Respuesta definitiva. Revelando la respuesta.');
    const id = game.id;
    clearTimeout(revealTimeout);
    revealTimeout = setTimeout(() => {
      if (game?.id !== id || game.phase !== 'locked') return;
      game = revealAnswer(game); renderGame(); saveGame();
      const milestone = game.lastCorrect && (SAFE_LEVELS.includes(game.index + 1) || game.index === 14);
      audio.cue(game.lastCorrect ? (milestone ? 'milestone' : 'correct') : 'wrong');
      const message = $('explanation-heading').textContent;
      announce(message); speak(message, preferences.voice);
      $('next-button').focus({ preventScroll: true });
    }, 2100);
  });
  $('confirm-final').focus();
}

function takeLifeline(type) {
  const next = useLifeline(game, type);
  if (next === game) return;
  game = next; audio.cue('lifeline'); renderGame(); saveGame();
  if (type === 'fifty') { announce('Se eliminaron dos respuestas incorrectas.'); toast('Dos respuestas menos. La decisión sigue siendo tuya.'); }
  if (type === 'audience') showAudience();
  if (type === 'phone') showPhone(true);
}
function showAudience() {
  if (!game.helpers.audience) return;
  if (!openDialog('audience', '<span class="dialog-eyebrow">COMODÍN · AYUDA DEL PÚBLICO</span><h2 id="dialog-title">El estudio ha votado.</h2><p>Cien voces. Una pista para tu decisión.</p><div id="audience-chart" class="audience-chart" role="img"></div><p class="fine-print">Público simulado. Sus votos pueden equivocarse; tú tienes la última palabra.</p><div class="dialog-actions"><button class="gold-button" id="audience-done">Volver a la pregunta ' + icon('arrow') + '</button></div>')) return;
  const chart = $('audience-chart');
  chart.setAttribute('aria-label', game.helpers.audience.map((v, i) => `${LETTERS[i]}: ${v}%`).join(', '));
  game.helpers.audience.forEach((votes, i) => {
    const column = document.createElement('div'); column.className = 'audience-column'; column.setAttribute('aria-hidden', 'true');
    column.innerHTML = `<span class="vote-count">${votes}%</span><div class="audience-bar" style="height:${Math.max(1, votes) * 1.4}px"></div><span class="vote-letter">${LETTERS[i]}</span>`;
    chart.append(column);
  });
  $('audience-done').addEventListener('click', closeDialog);
}
function showPhone(timed) {
  const advice = game.helpers.phone;
  if (!advice) return;
  if (!openDialog('phone', '<span class="dialog-eyebrow">COMODÍN · LLAMADA A UN AMIGO</span><h2 id="dialog-title">Tu amigo está en línea.</h2><div class="phone-timer" id="phone-timer" aria-label="Tiempo de llamada">30</div><div class="phone-message"><p id="phone-advice"></p></div><p class="fine-print">Llamada simulada. Tu amigo puede equivocarse. Este reloj solo mide la llamada, no tu tiempo para responder.</p><div class="dialog-actions"><button class="gold-button" id="phone-done">Volver a la pregunta ' + icon('arrow') + '</button></div>')) return;
  const answer = currentQuestion(game).answers[advice.answer];
  const message = advice.confident ? `«Creo que es ${LETTERS[advice.answer]}: ${answer}. Estoy bastante seguro. ¡Tú puedes!»` : `«Me inclino por ${LETTERS[advice.answer]}: ${answer}. No estoy completamente seguro; piénsalo bien.»`;
  $('phone-advice').textContent = message;
  $('phone-done').addEventListener('click', closeDialog);
  if (!timed) { $('phone-timer').hidden = true; return; }
  speak(message, preferences.voice);
  const end = Date.now() + 30000;
  phoneInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    if (!$('phone-timer')) { clearInterval(phoneInterval); return; }
    $('phone-timer').textContent = remaining;
    if (remaining === 0) { clearInterval(phoneInterval); $('phone-timer').setAttribute('aria-label', 'La llamada ha finalizado'); $('phone-timer').textContent = '✓'; }
  }, 250);
}

function showRules() {
  if (!openDialog('rules', '<span class="dialog-eyebrow">ASÍ SE LLEGA AL MILLÓN</span><h2 id="dialog-title">Quince pasos. Una oportunidad.</h2><ol class="rules-list"><li><span class="rule-number">01</span><div><strong>Quince preguntas sobre Ecuador</strong><p>Cuatro opciones, una respuesta correcta. La dificultad aumenta. Puedes pensar sin límite de tiempo.</p></div></li><li><span class="rule-number">02</span><div><strong>Tu respuesta tiene que ser definitiva</strong><p>Elige una opción y confírmala. Si fallas, la partida termina y conservas el último premio seguro.</p></div></li><li><span class="rule-number">03</span><div><strong>Dos premios seguros</strong><p>Acertar la pregunta 5 asegura $1.000; acertar la 10 asegura $32.000. Antes del primer seguro, un fallo deja $0.</p></div></li><li><span class="rule-number">04</span><div><strong>Tres comodines, una vez cada uno</strong><p>50:50 elimina dos opciones incorrectas. El público y la llamada son simulaciones: pueden equivocarse. Se pueden combinar.</p></div></li><li><span class="rule-number">05</span><div><strong>Retírate cuando quieras</strong><p>Antes de confirmar una respuesta, puedes llevarte lo ganado. «Guardar y salir» permite continuar la partida en este navegador.</p></div></li></ol><p class="fine-print">Los premios son virtuales. Tu nombre, partida y mejores resultados se guardan solo en este navegador. Sonidos y voz del presentador se controlan arriba. En computadora puedes elegir con A, B, C o D.</p><div class="dialog-actions"><button class="gold-button" id="rules-done">¡Entendido! ' + icon('check') + '</button></div>')) return;
  $('rules-done').addEventListener('click', closeDialog);
}
function showHistory() {
  if (!openDialog('history', '<span class="dialog-eyebrow">TUS GRANDES MOMENTOS</span><h2 id="dialog-title">El salón de la fama.</h2><p>Las cinco mejores partidas de este navegador.</p><ol class="history-list" id="history-list"></ol><p class="fine-print" id="history-empty">Aún no hay partidas terminadas. Tu primer gran momento te espera.</p><div class="dialog-actions"><button class="outline-button" id="history-clear">Borrar marcas</button><button class="gold-button" id="history-done">Volver ' + icon('arrow') + '</button></div>')) return;
  $('history-empty').hidden = history.length > 0;
  $('history-clear').hidden = history.length === 0;
  [...history].sort((a, b) => b.prize - a.prize || b.correctCount - a.correctCount).slice(0, 5).forEach((h, i) => {
    const row = document.createElement('li'); row.className = 'history-row';
    row.innerHTML = `<span class="history-rank">${i + 1}</span><span class="history-name"></span><strong class="history-prize">${money(h.prize)}</strong>`;
    row.querySelector('.history-name').textContent = h.name;
    const date = new Date(h.endedAt); const small = document.createElement('small');
    small.textContent = `${h.correctCount} aciertos · ${Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-EC')}`;
    row.querySelector('.history-name').append(small); $('history-list').append(row);
  });
  $('history-done').addEventListener('click', closeDialog);
  $('history-clear').addEventListener('click', () => {
    const b = $('history-clear');
    if (b.dataset.confirm !== 'true') { b.textContent = 'Confirmar borrado'; b.dataset.confirm = 'true'; return; }
    history = []; write(KEYS.history, history); $('history-list').replaceChildren(); $('history-empty').hidden = false; b.hidden = true;
  });
}

function showResult() {
  const result = game.result;
  const won = result.reason === 'won';
  const retired = result.reason === 'retired';
  if (!history.some(h => h.id === game.id)) {
    history.unshift({ id: game.id, name: game.name, ...result, questionIds: game.questions.map(q => q.id) });
    history = history.slice(0, 20); write(KEYS.history, history);
  }
  savedGame = null; remove(KEYS.save); audio.stopAmbience();
  setScreen('result');
  $('result-eyebrow').textContent = won ? 'QUINCE RESPUESTAS. UN GRAN TRIUNFO.' : retired ? 'SABER CUÁNDO PARAR TAMBIÉN CUENTA' : 'CADA PARTIDA ES UN NUEVO APRENDIZAJE';
  $('result-title').textContent = won ? `¡Eres millonario, ${game.name}!` : retired ? 'Te retiras con lo ganado.' : game.safe ? 'Tu seguro está a salvo.' : 'El millón puede esperar.';
  $('result-message').textContent = won ? 'Llegaste a lo más alto. Ecuador tiene un nuevo campeón del conocimiento.' : retired ? `${game.name}, elegiste cerrar tu partida con ${result.correctCount} respuestas correctas. ¡Buen juego!` : `${game.name}, acertaste ${result.correctCount} ${result.correctCount === 1 ? 'pregunta' : 'preguntas'}. La próxima vez puedes llegar aún más lejos.`;
  $('result-prize').textContent = money(result.prize);
  $('result-correct').textContent = `${result.correctCount} / 15`;
  $('result-lifelines').textContent = `${Object.values(game.lifelines).filter(Boolean).length} / 3`;
  $('result-save-note').textContent = storageAvailable ? 'Tu resultado se guardó en este dispositivo.' : 'Tu navegador no permite guardar resultados. Puedes seguir jugando.';
  $('result-icon').innerHTML = icon(won ? 'trophy' : retired ? 'logout' : 'shield');
  const confetti = $('confetti'); confetti.replaceChildren();
  if (won && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 65; i++) {
      const piece = document.createElement('i');
      piece.style.setProperty('--left', `${Math.random() * 100}%`); piece.style.setProperty('--delay', `${Math.random() * 3}s`);
      piece.style.setProperty('--duration', `${3 + Math.random() * 4}s`); piece.style.setProperty('--rotate', `${Math.random() * 360}deg`); confetti.append(piece);
    }
  }
  if (retired) audio.cue('retired');
  announce(`${$('result-title').textContent} Ganaste ${money(result.prize)} virtuales.`);
  $('play-again').focus({ preventScroll: true });
}

$('start-form').addEventListener('submit', event => {
  event.preventDefault(); audio.unlock();
  const name = $('player-name').value;
  if (!savedGame) { startGame(name); return; }
  openDialog('new-game', '<span class="dialog-eyebrow">TUS OPCIONES</span><h2 id="dialog-title">Tu asiento sigue reservado.</h2><p>Tienes una partida guardada. Puedes continuarla o empezar una nueva.</p><p class="fine-print">Una nueva partida reemplaza la partida en curso. Tus mejores marcas se conservan.</p><div class="dialog-actions"><button class="outline-button" id="new-cancel">Continuar partida</button><button class="gold-button" id="new-confirm">Empezar de nuevo</button></div>');
  $('new-cancel').addEventListener('click', () => { closeDialog(); resume(); });
  $('new-confirm').addEventListener('click', () => { closeDialog(); startGame(name); });
});
$('resume-button').addEventListener('click', resume);
$('home-rules').addEventListener('click', showRules);
$('rules-button').addEventListener('click', showRules);
$('history-button').addEventListener('click', showHistory);
$('pause-button').addEventListener('click', () => { home(); if (!storageAvailable) toast('No se pudo guardar la partida: el almacenamiento de este navegador está bloqueado.'); });
$('retire-button').addEventListener('click', () => {
  if (game.phase !== 'question') return;
  openDialog('retire', '<span class="dialog-eyebrow">LA DECISIÓN ES TUYA</span><h2 id="dialog-title">¿Te retiras con tu premio?</h2><p id="retire-copy"></p><div class="dialog-actions"><button class="outline-button" id="retire-cancel">Seguir jugando</button><button class="gold-button" id="retire-confirm">Me llevo mi premio</button></div>');
  $('retire-copy').textContent = `Has ganado ${money(game.won)} virtuales. Si te retiras, te llevas esa cantidad y termina esta partida.`;
  $('retire-cancel').addEventListener('click', closeDialog);
  $('retire-confirm').addEventListener('click', () => { game = retire(game); closeDialog(); showResult(); });
});
$('next-button').addEventListener('click', () => {
  const next = advanceGame(game); if (next === game) return;
  game = next;
  if (game.phase === 'ended') showResult();
  else { renderGame(true); saveGame(); readQuestion(); announce(`Pregunta ${game.index + 1}. Por ${money(currentPrize(game))}. ${currentQuestion(game).question}`); }
});
for (const type of ['fifty', 'audience', 'phone']) $('lifeline-' + type).addEventListener('click', () => takeLifeline(type));
$('play-again').addEventListener('click', () => startGame(game.name));
$('result-home').addEventListener('click', home);
document.querySelector('.wordmark').addEventListener('click', event => { event.preventDefault(); home(); });
$('ladder-toggle').addEventListener('click', () => {
  const panel = document.querySelector('.prize-panel'); panel.classList.toggle('ladder-open');
  const expanded = panel.classList.contains('ladder-open'); $('ladder-toggle').setAttribute('aria-expanded', String(expanded));
  $('ladder-toggle').setAttribute('aria-label', expanded ? 'Ocultar escala de premios' : 'Mostrar escala de premios');
});

function updatePreferenceButtons() {
  $('sound-toggle').innerHTML = icon(preferences.sound ? 'sound' : 'mute');
  $('sound-toggle').setAttribute('aria-pressed', String(preferences.sound));
  $('sound-toggle').setAttribute('aria-label', preferences.sound ? 'Desactivar sonido' : 'Activar sonido');
  $('voice-toggle').setAttribute('aria-pressed', String(preferences.voice));
  $('voice-toggle').setAttribute('aria-label', preferences.voice ? 'Desactivar voz del presentador' : 'Activar voz del presentador');
}
$('sound-toggle').addEventListener('click', () => { preferences.sound = !preferences.sound; audio.setEnabled(preferences.sound); write(KEYS.preferences, preferences); updatePreferenceButtons(); });
$('voice-toggle').addEventListener('click', () => {
  preferences.voice = !preferences.voice; write(KEYS.preferences, preferences); updatePreferenceButtons();
  if (preferences.voice && screen === 'game' && game.phase === 'question') readQuestion();
  else speak(preferences.voice ? 'Voz del presentador activada. Bienvenido a Millonario Ecuador.' : '', preferences.voice);
});
if (!('speechSynthesis' in window)) { $('voice-toggle').disabled = true; $('voice-toggle').title = 'Este navegador no tiene lectura por voz'; }
if (!document.fullscreenEnabled) { $('fullscreen-toggle').hidden = true; }
$('fullscreen-toggle').addEventListener('click', async () => {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
  catch { toast('Tu navegador no permitió activar la pantalla completa.'); }
});
document.addEventListener('keydown', event => {
  if (screen !== 'game' || dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const index = LETTERS.indexOf(event.key.toUpperCase());
  if (index !== -1 && game.phase === 'question') { event.preventDefault(); chooseAnswer(index); }
  if (event.key === 'Enter' && game.phase === 'revealed') { event.preventDefault(); $('next-button').click(); }
});
document.addEventListener('visibilitychange', () => { if (screen === 'game') saveGame(); if (document.hidden) speak('', false); });
window.addEventListener('pagehide', () => { if (screen === 'game') saveGame(); });
updatePreferenceButtons(); updateResume(); setScreen('home');
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
