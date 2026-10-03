import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { CATEGORIES, filterQuestions } from '../js/categories.js';
import { QUESTIONS } from '../js/questions.js';
const dir = 'test-results';
await mkdir(dir, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8090'], { stdio: 'ignore' });
const url = 'http://127.0.0.1:8090/';
let browser;
const report = { checks: [], errors: [] };
const check = message => { report.checks.push(message); console.log('PASS:', message); };
const watch = page => { page.on('pageerror', e => report.errors.push(e.message)); };
const screenshot = (page, name) => page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
const getGame = page => page.evaluate(() => JSON.parse(localStorage.getItem('millonario.ec.game.v1')));
async function correctAnswer(page) {
  const g = await getGame(page);
  await page.locator(`[data-answer="${g.questions[g.index].correct}"]`).click();
  await page.locator('#confirm-final').click();
  await page.clock.fastForward(2300);
  await page.locator('#explanation:not([hidden])').waitFor();
  assert.ok((await page.locator('#explanation-heading').textContent()).match(/correcta|seguro/i));
}
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage(); watch(page);
  await page.goto(url); await page.locator('#start-form').waitFor();
  await screenshot(page, '01-inicio-computadora');
  await page.locator('#sound-toggle').click();
  await page.clock.install();
  await page.locator('#player-name').fill('Yunga'); await page.locator('#start-form button').click();
  await page.locator('#game-screen:not([hidden])').waitFor();
  await screenshot(page, '02-estudio-computadora');
  const first = await getGame(page);
  await page.locator(`[data-answer="${first.questions[0].correct}"]`).click();
  await screenshot(page, '03-respuesta-definitiva');
  await page.locator('#confirm-cancel').click(); await page.clock.fastForward(100);
  assert.equal(await page.locator('.answer-button.selected').count(), 0);
  check('Una selección se puede cancelar sin perder dinero');
  await page.locator('#lifeline-fifty').click();
  assert.equal(await page.locator('.answer-button.eliminated').count(), 2);
  assert.equal(await page.locator(`[data-answer="${first.questions[0].correct}"]`).isEnabled(), true);
  check('50:50 mantiene la respuesta correcta y elimina dos opciones');
  await page.locator('#lifeline-audience').click();
  const votes = await page.locator('.vote-count').allTextContents();
  assert.equal(votes.reduce((sum, value) => sum + parseInt(value), 0), 100);
  await screenshot(page, '04-publico'); await page.locator('#audience-done').click(); await page.clock.fastForward(100);
  await page.locator('#lifeline-phone').click();
  assert.ok(await page.locator('#phone-advice').textContent());
  await page.clock.fastForward(30001); assert.equal(await page.locator('#phone-timer').textContent(), '✓');
  await page.locator('#phone-done').click(); await page.clock.fastForward(100);
  check('Público y llamada se pueden combinar y no obligan a responder al acabar la llamada');
  await correctAnswer(page); await screenshot(page, '05-respuesta-correcta'); await page.locator('#next-button').click();
  await page.locator('#pause-button').click(); await page.reload(); await page.locator('#resume-button:not([hidden])').click();
  assert.match(await page.locator('#question-number').textContent(), /02/);
  assert.equal(await page.locator('#lifeline-fifty').isEnabled(), false);
  assert.equal(await page.locator('#lifeline-audience').isEnabled(), false);
  assert.equal(await page.locator('#lifeline-phone').isEnabled(), false);
  check('Guardar, recargar y continuar conserva progreso y comodines usados');
  for (let index = 1; index < 15; index++) {
    await correctAnswer(page);
    if (index === 4) assert.match(await page.locator('#safe-prize').textContent(), /1\.000/);
    if (index === 9) assert.match(await page.locator('#safe-prize').textContent(), /32\.000/);
    if (index === 14) await screenshot(page, '06-pregunta-del-millon');
    await page.locator('#next-button').click();
  }
  await page.locator('#result-screen:not([hidden])').waitFor();
  assert.equal((await page.locator('#result-prize').textContent()).replace(/\D/g, ''), '1000000');
  assert.equal(await page.locator('#result-correct').textContent(), '15 / 15');
  await screenshot(page, '07-millonario'); check('Una partida real llega hasta el millón y los dos premios seguros');
  await page.locator('#result-home').click(); await page.locator('#history-button').click();
  assert.match(await page.locator('.history-name').textContent(), /Yunga/);
  await page.locator('#history-done').click(); await page.clock.fastForward(100);
  await page.locator('#start-form button').click(); await correctAnswer(page); await page.locator('#next-button').click();
  await page.locator('#retire-button').click(); await page.locator('#retire-confirm').click();
  await page.locator('#result-screen:not([hidden])').waitFor();
  assert.equal((await page.locator('#result-prize').textContent()).replace(/\D/g, ''), '100');
  check('Retirarse desde la interfaz conserva lo ganado y el historial funciona');
  await page.locator('#play-again').click();
  const badGame = await getGame(page); const wrong = (badGame.questions[0].correct + 1) % 4;
  await page.locator(`[data-answer="${wrong}"]`).click(); await page.locator('#confirm-final').click();
  await page.clock.fastForward(2300); await page.locator('#explanation:not([hidden])').waitFor();
  assert.equal(await page.locator('.answer-button.wrong').count(), 1);
  assert.equal(await page.locator('.answer-button.correct').count(), 1);
  await screenshot(page, '08-respuesta-incorrecta'); await page.locator('#next-button').click();
  assert.equal((await page.locator('#result-prize').textContent()).replace(/\D/g, ''), '0');
  check('Un fallo muestra la respuesta correcta y termina la partida');
  await page.locator('#result-home').click();
  assert.equal(await page.locator('#game-category option').count(), CATEGORIES.length);
  for (const category of CATEGORIES) {
    const hadSave = Boolean(await getGame(page));
    await page.locator('#game-category').selectOption(category.id);
    assert.match(await page.locator('#category-description').textContent(), /preguntas disponibles/);
    await page.locator('#start-form button').click();
    if (hadSave) await page.locator('#new-confirm').click();
    await page.locator('#game-screen:not([hidden])').waitFor();
    const selectedGame = await getGame(page);
    assert.equal(selectedGame.category, category.id);
    const poolIds = new Set(filterQuestions(QUESTIONS, category.id).map(q => q.id));
    assert.ok(selectedGame.questions.every(q => poolIds.has(q.id)), category.id);
    await page.locator('#pause-button').click();
  }
  check('Las ocho categorías se pueden elegir y generan únicamente preguntas del tema seleccionado');

  await page.locator('#game-category').selectOption('general');
  await page.locator('#start-form button').click(); await page.locator('#new-confirm').click();
  await correctAnswer(page); await page.locator('#next-button').click(); await page.locator('#pause-button').click();
  assert.match(await page.locator('#resume-button').textContent(), /Cultura general/);
  await page.locator('#game-category').selectOption('sports');
  await page.reload(); await page.locator('#resume-button:not([hidden])').waitFor();
  assert.equal(await page.locator('#game-category').inputValue(), 'sports');
  await page.locator('#resume-button').click();
  assert.equal((await getGame(page)).category, 'general');
  assert.equal((await getGame(page)).index, 1);
  await page.locator('#retire-button').click(); await page.locator('#retire-confirm').click();
  await page.locator('#result-screen:not([hidden])').waitFor();
  assert.match(await page.locator('#result-save-note').textContent(), /Cultura general/);
  await page.locator('#play-again').click(); assert.equal((await getGame(page)).category, 'general');
  await page.locator('#pause-button').click();
  check('Recargar conserva el selector y continuar o volver a jugar mantiene la categoría de la partida');

  const readHistory = () => page.evaluate(() => JSON.parse(localStorage.getItem('millonario.ec.history.v1')) || []);
  const beforeSaveDelete = await readHistory(); const saveId = (await getGame(page)).id;
  await page.locator('#delete-save-button').click(); await page.locator('#delete-cancel').click();
  assert.equal((await getGame(page)).id, saveId);
  await page.locator('#delete-save-button').click(); await page.locator('#delete-confirm').click();
  assert.equal(await getGame(page), null);
  assert.equal(await page.locator('#resume-button').isVisible(), false);
  assert.deepEqual(await readHistory(), beforeSaveDelete);
  await page.reload(); await page.locator('#start-form').waitFor();
  assert.equal(await page.locator('#delete-save-button').isVisible(), false);
  assert.equal(await page.locator('#resume-button').isVisible(), false);
  check('Borrar la partida guardada exige confirmación, persiste al recargar y conserva el historial');

  await page.locator('#history-button').click();
  const entryCount = await page.locator('.history-row').count(); assert.equal(entryCount, beforeSaveDelete.length);
  await screenshot(page, '12-historial-categorias');
  const deleteEntry = page.locator('.history-delete').first();
  const deleteId = await deleteEntry.getAttribute('data-history-delete');
  await deleteEntry.click(); await page.locator('#delete-cancel').click();
  assert.equal(await page.locator('.history-row').count(), entryCount);
  await page.locator(`[data-history-delete="${deleteId}"]`).click(); await page.locator('#delete-confirm').click();
  const afterEntryDelete = await readHistory();
  assert.equal(afterEntryDelete.length, entryCount - 1);
  assert.ok(!afterEntryDelete.some(h => h.id === deleteId));
  assert.ok(afterEntryDelete.every(h => beforeSaveDelete.some(old => old.id === h.id)));
  await page.locator('#history-done').click();
  check('Borrar un resultado individual conserva todas las demás partidas');

  await page.locator('#game-category').selectOption('science'); await page.locator('#start-form button').click();
  await page.locator('#pause-button').click(); const retainedSave = await getGame(page);
  const retainedPreferences = await page.evaluate(() => JSON.parse(localStorage.getItem('millonario.ec.preferences.v1')));
  await page.locator('#history-button').click(); await page.locator('#history-clear').click();
  await page.locator('#delete-cancel').click(); assert.equal(await page.locator('.history-row').count(), afterEntryDelete.length);
  await page.locator('#history-clear').click(); await page.locator('#delete-confirm').click();
  assert.equal(await page.locator('.history-row').count(), 0); assert.equal(await page.locator('#history-empty').isVisible(), true);
  assert.deepEqual(await getGame(page), retainedSave);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('millonario.ec.preferences.v1'))), retainedPreferences);
  await page.locator('#history-done').click(); await page.reload(); await page.locator('#resume-button:not([hidden])').waitFor();
  await page.locator('#history-button').click(); assert.equal(await page.locator('.history-row').count(), 0);
  await page.locator('#history-done').click();
  check('Vaciar el historial requiere confirmación y conserva la partida en curso y las preferencias');

  for (const width of [320, 390, 768, 1024]) {
    const responsive = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 681, hasTouch: width < 681, serviceWorkers: 'block' });
    const phone = await responsive.newPage(); watch(phone); await phone.goto(url); await phone.locator('#start-form').waitFor();
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${width}px home has horizontal overflow`);
    assert.ok(await phone.evaluate(() => document.querySelector('.home-links').getBoundingClientRect().bottom < document.querySelector('.home-caption').getBoundingClientRect().top), `${width}px home controls overlap the caption`);
    await phone.locator('#game-category').selectOption('general');
    if (width === 390) await screenshot(phone, '09-inicio-celular');
    await phone.locator('#player-name').fill('Ecuador'); await phone.locator('#start-form button').click();
    await phone.locator('#game-screen:not([hidden])').waitFor();
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${width}px has horizontal overflow`);
    if (width === 390) {
      await screenshot(phone, '10-estudio-celular');
      await phone.locator('#ladder-toggle').click(); assert.equal(await phone.locator('#prize-ladder').isVisible(), true);
      await screenshot(phone, '11-premios-celular');
      await phone.locator('#retire-button').click(); await phone.locator('#retire-confirm').click(); await phone.locator('#result-home').click();
      await phone.locator('#start-form button').click(); await phone.locator('#pause-button').click();
      await screenshot(phone, '13-partida-guardada-celular');
      await phone.locator('#history-button').click(); await screenshot(phone, '14-historial-celular');
      await phone.locator('.history-delete').click(); await screenshot(phone, '15-confirmacion-borrado-celular');
      assert.equal(await phone.evaluate(() => document.getElementById('dialog').scrollWidth > document.getElementById('dialog').clientWidth), false);
      await phone.locator('#delete-cancel').click(); await phone.locator('#history-done').click();
    }
    await responsive.close();
  }
  check('La interfaz funciona sin desbordamiento a 320, 390, 768 y 1024 píxeles');
  const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const off = await offline.newPage(); watch(off); await off.goto(url); await off.locator('#start-form').waitFor();
  await off.evaluate(() => navigator.serviceWorker.ready);
  await off.reload(); await off.locator('#start-form').waitFor();
  await offline.setOffline(true); await off.reload(); await off.locator('#start-form').waitFor();
  await off.locator('#game-category').selectOption('general');
  await off.locator('#start-form button').click(); await off.locator('#game-screen:not([hidden])').waitFor();
  assert.ok(await off.locator('#question-text').textContent());
  assert.ok((await getGame(off)).questions.every(q => q.scope === 'general'));
  check('Las categorías y las nuevas preguntas también funcionan sin conexión tras la primera carga');
  assert.deepEqual(report.errors, []); check('Sin errores JavaScript en ninguna de las pruebas');
} catch (error) {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
} finally {
  await writeFile(`${dir}/resultado.json`, JSON.stringify(report, null, 2));
  await browser?.close(); server.kill();
}
