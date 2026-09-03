/* Ověření v prohlížeči: řada ceníku ČR / Zahraničí (#181, 31. 8. 2026).
 *
 * Proč harness a ne jen jednotkový test: pravidla samotná hlídá
 * `src/test_cenik_rady.js`. Tady jde o to, jestli je celý řetěz propojený —
 * přepínač v hlavičce → dotaz → přepsané ceny → podbarvení → razítko → štítek
 * v přehledu. Právě tenhle řetěz se v aplikaci trhá nejčastěji.
 *
 * Spuštění: node overit_zahranicni.mjs
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

/* Dialogy jsou od 2. 9. 2026 v aplikaci (src/ui/dialog.js), ne nativní —
 * `page.on('dialog')` už tedy nic nechytí. Harness si proto potvrzování
 * zjednoduší: potvrd/hlaska/dotaz se nahradí funkcemi, které si text
 * zapamatují a rovnou odpoví „ano". Skutečný modál (kliknutí, Esc, Enter,
 * ovladatelnost stránky po zavření) ověřuje samostatný overit_dialogy.mjs. */
const dlgStub = async (page) => page.evaluate(() => {
  window.__dlgTexty = [];
  window.potvrd = (t) => { window.__dlgTexty.push(String(t)); return Promise.resolve(true); };
  window.hlaska = (t) => { window.__dlgTexty.push(String(t)); return Promise.resolve(); };
  window.dotaz = (t, v) => { window.__dlgTexty.push(String(t)); return Promise.resolve(v == null ? '' : v); };
});
const dlgPosledni = async (page) => page.evaluate(() =>
  (window.__dlgTexty && window.__dlgTexty.length) ? window.__dlgTexty[window.__dlgTexty.length - 1] : '');

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const html = readFileSync('dist/kalkulacka.html');
const server = createServer((q, r) => {
  r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
const chyby = [];
page.on('pageerror', e => chyby.push(String(e)));
page.on('console', m => { if (m.type() === 'error') chyby.push(m.text()); });
let posledniDialog = '';
/* nativní dialogy nahradil in-app modál — text se čte z dlgPosledni() */

await page.goto('http://127.0.0.1:' + server.address().port);
await page.waitForFunction(() => typeof window.render === 'function');

await dlgStub(page);
await page.addStyleTag({ content: '#prihlaseni-overlay{display:none !important}' });
await page.evaluate(() => { NAST.jeAdmin = true; prepniTab('kalk'); render(); });
await page.waitForTimeout(300);

/* ---------- 1) výchozí stav je tuzemsko ---------- */
test('nová zakázka je tuzemská',
  await page.evaluate(() => cenikRadaVarianty(aktivniVarianta(ZAK).data) === 'cr'));
test('přepínač ČR / Zahraničí je v hlavičce',
  await page.evaluate(() => {
    const p = document.querySelector('#page-kalk .rada-prep');
    return !!p && /ČR/.test(p.textContent) && /Zahrani/.test(p.textContent);
  }));
test('hlavička není podbarvená',
  await page.evaluate(() => !document.querySelector('#page-kalk .zak-bar.rada-zahr')));

/* ---------- 2) bez odchylek se nepřepíná ---------- */
await page.evaluate(() => { window.__dlgTexty = []; });
await page.evaluate(() => cenikRadaPrepniUI('zahr'));
await page.waitForTimeout(200);
posledniDialog = await dlgPosledni(page);
test('prázdný zahraniční ceník přepnutí odmítne a poradí',
  /Zahraniční ceník zatím nemá žádnou odchylku/.test(posledniDialog), posledniDialog.slice(0, 60));
test('a řada zůstala tuzemská',
  await page.evaluate(() => cenikRadaVarianty(aktivniVarianta(ZAK).data) === 'cr'));

/* ---------- 3) s odchylkami: dotaz, přepsané ceny, podbarvení ---------- */
await page.evaluate(() => {
  CENIK_ZAHR.ceny['C.montazHodKc'] = 1000;
  CENIK_ZAHR.ceny['C.prekladyKc'] = 15000;
  CENIK_ZAHR.jenZahr['C.prekladyKc'] = true;
  DEFAULT_CENIK.montazHodKc = 750;
  const d = aktivniVarianta(ZAK).data;
  d.cenik.montazHodKc = 750;
  d.cenik.marze = 0.40;                 // zakázková hodnota — přepnutí se jí nesmí dotknout
  render();
});
await page.evaluate(() => { window.__dlgTexty = []; });
await page.evaluate(() => cenikRadaPrepniUI('zahr'));
await page.waitForTimeout(300);
posledniDialog = await dlgPosledni(page);
test('přepnutí se nejdřív zeptá a vypíše dopad',
  /Dotkne se to \d+ ceníkových položek/.test(posledniDialog), posledniDialog.slice(0, 80));
test('řada se přepnula',
  await page.evaluate(() => cenikRadaVarianty(aktivniVarianta(ZAK).data) === 'zahr'));
test('ceníková cena se přepsala na zahraniční',
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.montazHodKc === 1000));
test('globální přirážka zůstala po obchodníkovi',
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze === 0.40));
test('hlavička se jemně podbarvila',
  await page.evaluate(() => !!document.querySelector('#page-kalk .zak-bar.rada-zahr')));
test('v hlavičce svítí štítek zahraničního ceníku',
  await page.evaluate(() => /zahraniční ceník/.test(
    (document.querySelector('#page-kalk .zak-bar-h') || {}).textContent || '')));
test('u zahraniční zakázky je vidět kurz',
  await page.evaluate(() => /Kurz pro nabídku/.test(
    (document.querySelector('#page-kalk .zak-bar') || {}).textContent || '')));

/* ---------- 4) položka jen pro zahraničí ---------- */
test('položka „jen pro zahraničí" je v zahraniční kalkulaci',
  await page.evaluate(() => {
    const r = spocitejVariantu(aktivniVarianta(ZAK));
    return (r.ock.sekce.rezie || []).some(x => /PŘEKLADY/.test(String(x.origNazev || x.nazev)));
  }));

/* ---------- 5) zpátky do tuzemska ---------- */
await page.evaluate(() => cenikRadaPrepniUI('cr'));
await page.waitForTimeout(300);
test('návrat vrátí tuzemskou cenu',
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.montazHodKc === 750));
test('a položka jen pro zahraničí z kalkulace zmizí',
  await page.evaluate(() => {
    const r = spocitejVariantu(aktivniVarianta(ZAK));
    return !(r.ock.sekce.rezie || []).some(x => /PŘEKLADY/.test(String(x.origNazev || x.nazev)));
  }));
test('podbarvení zmizelo',
  await page.evaluate(() => !document.querySelector('#page-kalk .zak-bar.rada-zahr')));

/* ---------- 6) ceník: sloupec jen pro administrátora ---------- */
test('administrátor vidí v ceníku sloupec Zahraničí',
  await page.evaluate(() => {
    NAST.jeAdmin = true; prepniTab('cenik'); render();
    return /Cena Zahraničí/.test((document.getElementById('page-cenik') || {}).innerHTML || '');
  }));
test('obchodník sloupec Zahraničí nevidí',
  await page.evaluate(() => {
    NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
    const t = (document.getElementById('page-cenik') || {}).innerHTML || '';
    NAST.jeAdmin = true; NAST.nahledRole = ''; render();
    return !/Cena Zahraničí/.test(t);
  }));

/* ---------- 6b) globální přirážka pro zahraničí (3. 9. 2026) ----------
 * V prohlížeči jde o to, co administrátor uvidí a nakliká: že u globální
 * přirážky je druhé pole „pro ZAHRANIČÍ", že se zapíše do odchylek ceníku
 * a že přepnutí zakázky přirážku opravdu vymění. Počítání hlídá
 * `src/test_cenik_rady.js`. */
test('u globální přirážky je v ceníku i pole pro zahraničí',
  await page.evaluate(() => {
    NAST.jeAdmin = true; prepniTab('cenik'); render();
    return /pro ZAHRANIČÍ/.test((document.getElementById('page-cenik') || {}).innerHTML || '');
  }));
const marze = await page.evaluate(() => {
  cenikZahrSet('C.marze', 0.44);
  prepniTab('kalk');
  const v = aktivniVarianta(ZAK);
  /* Tuzemská přirážka musí být i v PLATNÉM ceníku: návrat do tuzemska bere
   * hodnotu odtud, ne z toho, co bylo v zakázce před přepnutím. */
  DEFAULT_CENIK.marze = 0.27;
  v.data.cenik.marze = 0.27;
  delete v.data.cenikRucni['C.marze'];      // obchodník se jí nedotkl
  render();
  return { odchylka: CENIK_ZAHR.ceny['C.marze'], pred: v.data.cenik.marze };
});
test('procenta se do odchylek uloží jako podíl', marze.odchylka === 0.44, marze.odchylka);
await page.evaluate(() => cenikRadaPrepniUI('zahr'));
await page.waitForTimeout(300);
test('přepnutí na zahraničí použije zahraniční přirážku',
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze === 0.44),
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze));
await page.evaluate(() => cenikRadaPrepniUI('cr'));
await page.waitForTimeout(300);
test('návratem se vrátí tuzemská přirážka',
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze === 0.27),
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze));

/* Dohodnutá marže jedné nabídky je víc než předvolba z ceníku (#177). */
await page.evaluate(() => { set('C.marze', 0.29); });
await page.evaluate(() => cenikRadaPrepniUI('zahr'));
await page.waitForTimeout(300);
test('ručně nastavenou přirážku přepnutí nepřepíše',
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze === 0.29),
  await page.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze));
test('a aplikace o tom obchodníka zpraví',
  /nastavil sám/.test(await dlgPosledni(page)), await dlgPosledni(page));
await page.evaluate(() => {
  cenikRadaPrepniUI('cr'); cenikZahrSet('C.marze', '');
  delete aktivniVarianta(ZAK).data.cenikRucni['C.marze'];
});
await page.waitForTimeout(300);

/* ---------- 6c) zahraniční přirážka i v ceníku projekce (3. 9. 2026) ---------- */
test('u globální přirážky PROJ je také pole pro zahraničí',
  await page.evaluate(() => {
    NAST.jeAdmin = true; prepniTab('cenikproj'); render();
    return /pro ZAHRANIČÍ/.test((document.getElementById('page-cenikproj') || {}).innerHTML || '');
  }));
const marzeProj = await page.evaluate(() => {
  cenikZahrSet('PC.marze', 0.66);
  DEFAULT_CENIK_PROJ.marze = 0.55;
  const v = aktivniVarianta(ZAK);
  v.data.proj.cenik.marze = 0.55;
  delete v.data.cenikRucni['PC.marze'];
  prepniTab('kalk'); render();
  return CENIK_ZAHR.ceny['PC.marze'];
});
test('odchylka přirážky projekce se uloží', marzeProj === 0.66, marzeProj);
await page.evaluate(() => cenikRadaPrepniUI('zahr'));
await page.waitForTimeout(300);
test('přepnutí vymění i přirážku projekce',
  await page.evaluate(() => aktivniVarianta(ZAK).data.proj.cenik.marze === 0.66),
  await page.evaluate(() => aktivniVarianta(ZAK).data.proj.cenik.marze));
await page.evaluate(() => cenikRadaPrepniUI('cr'));
await page.waitForTimeout(300);
test('a návrat vrátí tuzemskou přirážku projekce',
  await page.evaluate(() => aktivniVarianta(ZAK).data.proj.cenik.marze === 0.55),
  await page.evaluate(() => aktivniVarianta(ZAK).data.proj.cenik.marze));
await page.evaluate(() => { cenikZahrSet('PC.marze', ''); });

/* ---------- 7) uzamčená varianta se nepřepíná ---------- */
test('uzamčená (odeslaná) varianta se nepřepne',
  await page.evaluate(() => {
    prepniTab('kalk');
    const v = aktivniVarianta(ZAK);
    zamkniVariantu(v, { typ: 'nabidkaOck', kdo: 'test', cislo: 'X' });
    render();
    cenikRadaPrepniUI('zahr');
    const stav = cenikRadaVarianty(v.data) === 'cr';
    delete v.zamek; render();
    return stav;
  }));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await b.close(); server.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
