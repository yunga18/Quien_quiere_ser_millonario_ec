import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
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
  for (const width of [320, 390, 768, 1024]) {
    const responsive = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 681, hasTouch: width < 681, serviceWorkers: 'block' });
    const phone = await responsive.newPage(); watch(phone); await phone.goto(url); await phone.locator('#start-form').waitFor();
    if (width === 390) await screenshot(phone, '09-inicio-celular');
    await phone.locator('#player-name').fill('Ecuador'); await phone.locator('#start-form button').click();
    await phone.locator('#game-screen:not([hidden])').waitFor();
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${width}px has horizontal overflow`);
    if (width === 390) {
      await screenshot(phone, '10-estudio-celular');
      await phone.locator('#ladder-toggle').click(); assert.equal(await phone.locator('#prize-ladder').isVisible(), true);
      await screenshot(phone, '11-premios-celular');
    }
    await responsive.close();
  }
  check('La interfaz funciona sin desbordamiento a 320, 390, 768 y 1024 píxeles');
  const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const off = await offline.newPage(); watch(off); await off.goto(url); await off.locator('#start-form').waitFor();
  await off.evaluate(() => navigator.serviceWorker.ready);
  await off.reload(); await off.locator('#start-form').waitFor();
  await offline.setOffline(true); await off.reload(); await off.locator('#start-form').waitFor();
  await off.locator('#start-form button').click(); await off.locator('#game-screen:not([hidden])').waitFor();
  assert.ok(await off.locator('#question-text').textContent());
  check('El juego se vuelve a abrir y se puede jugar sin conexión tras la primera carga');
  assert.deepEqual(report.errors, []); check('Sin errores JavaScript en ninguna de las pruebas');
} catch (error) {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
} finally {
  await writeFile(`${dir}/resultado.json`, JSON.stringify(report, null, 2));
  await browser?.close(); server.kill();
}
