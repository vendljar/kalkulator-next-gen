/* Kouřový test sestavené aplikace (dist/kalkulacka.html).
 *
 * Node testy v src/ ověřují jádro, ale nikdy nespustí prohlížeč. Jednosouborový
 * build přitom může selhat způsobem, který se v Node neprojeví: pořadí souborů
 * v bundlu, chybějící modul v build.py, překlep v inline onclick, výjimka při
 * prvním render(). Takové rozbití by se poznalo až u obchodníka.
 *
 * Test proto otevře opravdu sestavený soubor a hlídá to, co Node neuvidí:
 *   – žádná chyba v konzoli a žádná neodchycená výjimka při startu,
 *   – všechny záložky se přepnou a vykreslí,
 *   – historie (#1): Zpět/Znovu opravdu vrací stav, záloha se zapíše do
 *     úložiště a po refreshi se nabídne obnova,
 *   – štítek režimu výpočtu (#2) říká pravdu o fixes,
 *   – administrátorské panely nastavení včetně Slovníku (#5) se vykreslí.
 *
 * Spuštění: node smoke.mjs
 * Vyžaduje playwright (lokálně nebo globálně: npm i -g playwright).
 * Při globální instalaci je potřeba NODE_PATH=$(npm root -g).
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

// require (ne import) kvůli globální instalaci: import v ESM NODE_PATH ignoruje
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Playwright není k dispozici. Nainstalujte: npm i -g playwright'
    + '\na spusťte: NODE_PATH=$(npm root -g) node smoke.mjs');
  process.exit(2);
}

const SOUBOR = path.resolve('dist/kalkulacka.html');
let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : JSON.stringify(info)); }
};

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext();
const page = await ctx.newPage();

const chyby = [];
page.on('console', m => { if (m.type() === 'error') chyby.push('console: ' + m.text()); });
page.on('pageerror', e => chyby.push('pageerror: ' + e.message));

await page.goto(pathToFileURL(SOUBOR).href);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(300);

/* ---- start bez chyb ---- */
test('aplikace nastartovala bez chyby v konzoli', chyby.length === 0, chyby);
/* Hned po startu, dokud jsme do zakázky nesáhli: prázdná historie. Kdyby se
 * sem něco dostalo, znamenalo by to, že se ZAK mění mezi prvním a druhým
 * renderem (migrace, katalog) a „Zpět" by uživatele vrátilo někam, kde nikdy
 * nebyl. Proto se to testuje dřív než cokoli jiného. */
test('tlačítko Zpět je po startu zakázané', await page.locator('#btnHistZpet').isDisabled());
test('výpočet se vykreslil', (await page.locator('#outputs').innerHTML()).length > 500);
test('verze je v hlavičce', /\d+\.\d+\.\d+/.test(await page.locator('body').innerText()));

/* ---- štítek režimu (#2) ---- */
const pill = page.locator('#rezimPill');
test('štítek režimu je vidět', await pill.isVisible());
test('výchozí režim je 1:1 s Excelem', (await pill.innerText()).includes('1:1'), await pill.innerText());
test('štítek varuje barvou', (await pill.getAttribute('class') || '').includes('warn'));

await page.evaluate(() => { set('OCK.fixes', 'fix'); });
await page.waitForTimeout(150);
test('po přepnutí režimu štítek přestane varovat',
  (await pill.innerText()).includes('opravený') && !(await pill.getAttribute('class') || '').includes('warn'),
  await pill.innerText());
await page.evaluate(() => { set('OCK.fixes', 'compat'); });
await page.waitForTimeout(150);

/* ---- záložky ---- */
const taby = await page.evaluate(() => TABY);
for (const t of taby) {
  await page.evaluate(x => prepniTab(x), t);
  await page.waitForTimeout(60);
}
await page.evaluate(() => prepniTab('kalk'));
test('všechny záložky se přepnuly bez chyby', chyby.length === 0, chyby);

/* ---- historie: Zpět / Znovu (#1) ---- */
const puvodni = await page.evaluate(() => Z.pocetZastavek);
await page.evaluate(() => { set('Z.pocetZastavek', String((+Z.pocetZastavek || 2) + 3)); });
await page.waitForTimeout(150);
test('změna zadání se projeví', await page.evaluate(() => Z.pocetZastavek) !== puvodni);
test('tlačítko Zpět se povolilo', !(await page.locator('#btnHistZpet').isDisabled()));

await page.locator('#btnHistZpet').click();
await page.waitForTimeout(200);
test('Zpět vrátilo původní hodnotu', await page.evaluate(() => Z.pocetZastavek) === puvodni,
  await page.evaluate(() => Z.pocetZastavek));

await page.locator('#btnHistZnovu').click();
await page.waitForTimeout(200);
test('Znovu vrátilo změnu', await page.evaluate(() => Z.pocetZastavek) !== puvodni);
await page.locator('#btnHistZpet').click();
await page.waitForTimeout(200);

/* Ctrl+Z mimo textové pole musí fungovat stejně jako tlačítko. */
await page.evaluate(() => { set('Z.pocetZastavek', String((+Z.pocetZastavek || 2) + 5)); });
await page.waitForTimeout(150);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
test('Ctrl+Z vrací stejně jako tlačítko', await page.evaluate(() => Z.pocetZastavek) === puvodni,
  await page.evaluate(() => Z.pocetZastavek));

/* ---- záloha do úložiště a nabídka obnovy ---- */
await page.evaluate(() => { set('ZAK.nazevAkce', 'Kouřový test výtahu'); });
await page.waitForTimeout(1600);   // HIST_PRODLEVA + rezerva
const zaloha = await page.evaluate(() => { try { return localStorage.getItem('kng_rozpracovano_v1'); } catch (e) { return null; } });
test('záloha se zapsala do úložiště prohlížeče', !!zaloha && zaloha.indexOf('Kouřový test') > 0);
test('popisek zálohy je vidět', (await page.locator('#autoStav').innerText()).indexOf('zálohováno') >= 0,
  await page.locator('#autoStav').innerText());

await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(300);
test('po refreshi se nabídne obnova', await page.locator('#obnovaLista').isVisible());
test('lišta obnovy pojmenuje zakázku',
  (await page.locator('#obnovaLista').innerText()).indexOf('Kouřový test') > 0,
  await page.locator('#obnovaLista').innerText());

await page.locator('#obnovaLista button.primary').click();
await page.waitForTimeout(300);
test('obnova nahrála zálohovanou zakázku',
  await page.evaluate(() => ZAK.nazevAkce) === 'Kouřový test výtahu',
  await page.evaluate(() => ZAK.nazevAkce));

/* ---- nastavení včetně Slovníku (#5) ---- */
await page.evaluate(() => { NAST.jeAdmin = true; otevriNastaveni(); });
await page.waitForTimeout(200);
const panely = ['obecne', 'firma', 'uzivatele', 'slevy', 'sablony', 'konfigurace', 'slovnik'];
for (const p of panely) {
  await page.evaluate(x => nastPanel(x), p);
  await page.waitForTimeout(80);
  const delka = (await page.locator('#nastaveni-panel .body').innerHTML()).length;
  test('panel nastavení „' + p + '" se vykreslil', delka > 200, delka);
}
test('záložka Slovník je v liště', (await page.locator('.nast-tabs').innerText()).includes('Slovník'));
test('Slovník vysvětlí, že se nic nezapíše samo',
  (await page.locator('#nastaveni-panel .body').innerText()).includes('Nic se nezapíše samo'));
await page.evaluate(() => zavriNastaveni());

/* ---- ATYP přirážka (#22) ---- */
await page.evaluate(() => { NAST.jeAdmin = true; nastPanel('obecne'); otevriNastaveni(); });
await page.waitForTimeout(150);
test('nastavení ATYP přirážky je dostupné',
  (await page.locator('#nastaveni-panel .body').innerText()).toUpperCase().includes('ATYP'));
await page.evaluate(() => zavriNastaveni());

/* ---- nic se cestou nerozbilo ---- */
test('za celý průchod nevznikla chyba v konzoli', chyby.length === 0, chyby);

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
