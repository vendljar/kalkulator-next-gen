/* Kontrola vygenerované roadmapy v prohlížeči.
 *
 * Roadmapa je samostatná stránka bez testů uvnitř — když se v `sablona.html`
 * něco rozbije, pozná se to teprve tím, že se v prohlížeči nic nevykreslí.
 * Tenhle harness proto stránku otevře, projde všechny čtyři pohledy a ověří,
 * že souhlasí počty, že filtry fungují a že v konzoli není chyba.
 *
 * Spuštění:  node overit_roadmapu.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SOUBOR = 'file:///home/claude/work/kng/roadmapa/ROADMAPA.html';

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const page = await prohlizec.newPage({ viewport: { width: 1440, height: 900 } });
const chyby = [];
page.on('pageerror', e => chyby.push(String(e)));
page.on('console', m => { if (m.type() === 'error') chyby.push(m.text()); });

await page.goto(SOUBOR);
await page.waitForTimeout(600);

const cisla = await page.evaluate(() => {
  const st = {};
  document.querySelectorAll('#statistiky div').forEach(d => {
    st[d.dataset.k] = Number((d.querySelector('b') || {}).textContent || 0);
  });
  return {
    st,
    celkemP: RM.polozky.length,
    hotovo: RM.polozky.filter(p => p.stav === 'hotovo').length,
    odlozeno: RM.polozky.filter(p => p.vlna === 'F').length,
    vlny: RM.meta.vlny.map(v => v.id),
    uzlu: document.querySelectorAll('#uzly .uzel').length,
  };
});

test('stránka se vykreslila (uzly v síti)', cisla.uzlu > 0, cisla.uzlu);
test('vlna F je v datech i ve filtru', cisla.vlny.indexOf('F') >= 0, cisla.vlny.join(''));
test('hlavička má vlastní počet odložených',
  cisla.st.odlozeno === cisla.odlozeno, cisla.st.odlozeno + ' × ' + cisla.odlozeno);
test('součet stavů dá celkový počet položek',
  cisla.st.zpracovat + cisla.st.podklad + cisla.st.odlozeno + cisla.st.hotovo === cisla.celkemP,
  JSON.stringify(cisla.st) + ' vs ' + cisla.celkemP);
test('odložené se nepočítají mezi „čeká na cizí podklad"',
  cisla.st.podklad === await page.evaluate(
    () => RM.polozky.filter(p => p.stav === 'blokovano' && p.vlna !== 'F').length));

/* Pohled „Na co se čeká": odložené mají vlastní seznam a nemíchají se
 * mezi blokovanou práci. */
await page.click('nav button[data-p="cekani"]');
await page.waitForTimeout(200);
const cekani = await page.evaluate(() => ({
  odlozene: document.querySelectorAll('#odlozene-telo .blok').length,
  cekani: [...document.querySelectorAll('#cekani-telo .blok h4')].map(h => h.textContent.trim()),
  odlText: document.getElementById('odlozene-telo').textContent,
}));
test('odložené mají vlastní seznam', cekani.odlozene >= 5, cekani.odlozene);
test('každé odložené nese důvod', !/bez uvedeného důvodu/.test(cekani.odlText));
test('odložené nestojí mezi „čeká na cizí podklad"',
  !cekani.cekani.some(t => /#(13|21|32|90|160)\b/.test(t)), cekani.cekani.slice(0, 3).join(' | '));

/* Matice užitek × náročnost je plán práce — odložené do ní nepatří. */
await page.click('nav button[data-p="matice"]');
await page.waitForTimeout(200);
test('odložené nejsou v matici užitku',
  await page.evaluate(() => ![...document.querySelectorAll('#matice-telo .mchip')]
    .some(c => ['13', '21', '32', '90', '160'].indexOf(c.dataset.id) >= 0)));

/* Ve Vlnách naopak vidět MAJÍ — s vypnutým filtrem „Jen ke zpracování". */
await page.click('nav button[data-p="vlny"]');
await page.waitForTimeout(200);
test('vlna F má ve Vlnách vlastní sloupec',
  await page.evaluate(() => [...document.querySelectorAll('#vlny-telo .sloup h2')]
    .some(h => /Odloženo/i.test(h.textContent))));

/* Filtr podle vlny musí umět odložené vytáhnout i schovat. */
await page.evaluate(() => {
  const chip = [...document.querySelectorAll('#f-vlna .chip')].find(c => c.dataset.k === 'F');
  chip.click();
});
await page.waitForTimeout(200);
test('filtrem vlny F se ukážou jen odložené',
  await page.evaluate(() => /zobrazeno 5 z/.test(document.getElementById('pocet').textContent)),
  await page.evaluate(() => document.getElementById('pocet').textContent));

await page.click('#reset');
await page.waitForTimeout(200);
test('reset filtrů vrátí výchozí pohled',
  await page.evaluate(() => document.getElementById('pocet').textContent.indexOf('zobrazeno') === 0));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
