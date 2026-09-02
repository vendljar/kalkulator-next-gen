/* Ověření: globální přirážka se natahuje z ceníku — a ruční přirážka se drží
 * (31. 8. 2026 večer).
 *
 * Hlášeno J. V.: „globální přirážka se nám maže a z ceníku se automaticky
 * nenačítá, na rozdíl od nákladů, které se načtou."
 *
 * Příčina byla v pravidle #177: zakázkové hodnoty (přirážka, DPH) se plošně
 * vynechávaly z přepočtu, takže do prázdné zakázky otevřené při startu se
 * náklady natáhly, ale přirážka ne. Nově se vynechává jen to, co obchodník
 * SÁM nastavil. Harness hlídá obě strany téhož pravidla naráz — jednotkové
 * testy je hlídají zvlášť (src/test_cenik_stari.js), ale rozejít se to může
 * až v provozu, kde ceník přichází ze serveru po přihlášení.
 *
 * Běží proti SKUTEČNÝM serverovým funkcím nad paměťovým úložištěm.
 * Spuštění: node overit_prirazka_cenik.mjs */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-pro-cenikovou-prirazku';
process.env.ADMIN_INIT_HESLO = 'Zkusebni.Heslo.123';
const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async smaz(k) { pamet.delete(nazev + '/' + k); },
  async seznam(p) {
    return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (p || ''))).map(x => x.slice(nazev.length + 1));
  },
});

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import zdravi from './netlify/functions/zdravi.mjs';
import ja from './netlify/functions/ja.mjs';
import prihlaseni from './netlify/functions/prihlaseni.mjs';
import uzivatele from './netlify/functions/uzivatele.mjs';
import programF from './netlify/functions/program.mjs';
import zakazky from './netlify/functions/zakazky.mjs';
import firma from './netlify/functions/firma.mjs';
import zobrazeni from './netlify/functions/zobrazeni.mjs';
import zakaznici from './netlify/functions/zakaznici.mjs';
import sablony from './netlify/functions/sablony.mjs';
import analytika from './netlify/functions/analytika.mjs';

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

const FUNKCE = { '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/uzivatele': uzivatele, '/api/program': programF, '/api/zakazky': zakazky,
  '/api/firma': firma, '/api/zobrazeni': zobrazeni, '/api/zakaznici': zakaznici,
  '/api/sablony': sablony, '/api/analytika': analytika };

const html = readFileSync('dist/kalkulacka.html');
const server = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ADRESA = 'http://127.0.0.1:' + server.address().port;

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
const chyby = []; page.on('pageerror', e => chyby.push(String(e)));
let cookieJar = '';
await page.route('**/api/**', async route => {
  const r = route.request(); const url = new URL(r.url());
  const fn = FUNKCE[url.pathname];
  if (!fn) return route.fulfill({ status: 404, body: '{"ok":false}' });
  const init = { method: r.method(), headers: { cookie: cookieJar } };
  if (r.method() === 'POST') init.body = r.postData() || '';
  const odp = await fn(new Request(r.url(), init));
  const setc = odp.headers.get('set-cookie');
  if (setc) cookieJar = setc.split(';')[0];
  route.fulfill({ status: odp.status, contentType: 'application/json; charset=utf-8', body: await odp.text() });
});

const prihlas = async () => {
  await page.fill('#onlineEmail', 'vendl.jaroslav@engineers-cz.cz');
  await page.fill('#onlineHeslo', 'Zkusebni.Heslo.123');
  await page.click('#prihlaseni-box >> text=Přihlásit');
  await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } }, null, { timeout: 10000 });
  await page.waitForTimeout(500);
};

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');

await dlgStub(page);
await prihlas();


let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};
const stav = () => page.evaluate(() => ({
  def: DEFAULT_CENIK.marze, defProj: DEFAULT_CENIK_PROJ.marze,
  zak: aktivniVarianta(ZAK).data.cenik.marze,
  zakProj: ((aktivniVarianta(ZAK).data.proj || {}).cenik || {}).marze,
  naklad: aktivniVarianta(ZAK).data.cenik.montazHodKc,
  rucni: Object.keys(aktivniVarianta(ZAK).data.cenikRucni || {}),
}));

/* 1) administrátor nastaví v ceníku firemní přirážku a zveřejní ji */
await page.evaluate(async () => {
  prepniTab('cenik');
  set('C.marze', 0.42); set('PC.marze', 0.55); set('C.montazHodKc', 1234);
  await onlineZverejni('firemní přirážka');
});
await page.waitForTimeout(1500);
test('zveřejněný ceník nese přirážku OCK i PROJ', await page.evaluate(() =>
  ONLINE_STAV.db && ONLINE_STAV.db.platny.cenik.marze === 0.42
  && ONLINE_STAV.db.platny.cenikProj.marze === 0.55));

/* 2) obnovení stránky = nová prázdná zakázka, do které ceník teprve dorazí.
 *    Přesně tady se přirážka dřív „ztrácela". */
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(2000);
await dlgStub(page);
const po = await stav();
test('do nové zakázky se natáhne přirážka OCK z ceníku', po.zak === 0.42, JSON.stringify(po));
test('a přirážka PROJ taky', po.zakProj === 0.55, po.zakProj);
test('náklady se natáhnou stejně jako dřív (kontrolní vzorek)', po.naklad === 1234, po.naklad);
test('nová zakázka nemá nic označeného jako ruční', po.rucni.length === 0, JSON.stringify(po.rucni));

/* 3) obchodník si přirážku nastaví sám — od té chvíle je jeho */
await page.evaluate(() => { prepniTab('kalk'); set('C.marze', 0.40); });
await page.waitForTimeout(300);
test('ruční změna se poznamená', (await stav()).rucni.includes('C.marze'));

/* 4) …a zveřejnění jiného ceníku mu ji nepřepíše (pravidlo #177) */
await page.evaluate(async () => {
  DEFAULT_CENIK.marze = 0.42;           // ceník zůstává firemní
  DEFAULT_CENIK.montazHodKc = 4321;     // ale náklad se změnil
  progSrovnejNedotcene({ verze: 9, platnoOd: '2026-08-31' });
});
await page.waitForTimeout(400);
const po2 = await stav();
test('ruční přirážka 40 % zveřejnění ceníku přežije', po2.zak === 0.40, po2.zak);
test('nový náklad se přitom natáhl', po2.naklad === 4321, po2.naklad);

/* 5) uložit → otevřít znovu: ruční přirážka drží i po kolečku přes server */
await page.evaluate(async () => {
  set('ZAK.cislo', '2026 - OPR - CN - 0777');
  set('ZAK.nazevAkce', 'Německo — ruční přirážka');
  await zakUlozUI();
});
await page.waitForTimeout(1200);
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(2000);
await dlgStub(page);
const po3 = await stav();
test('po znovuotevření zakázky je přirážka pořád 40 %', po3.zak === 0.40, po3.zak);
test('a značka „nastavil jsem si ji sám" se uložila taky',
  po3.rucni.includes('C.marze'), JSON.stringify(po3.rucni));

/* 6) nová zakázka začíná zase firemní hodnotou z ceníku */
await page.evaluate(() => novaZakazkaUI());
await page.waitForTimeout(600);
const po4 = await stav();
test('nová zakázka začíná firemní přirážkou z ceníku', po4.zak === 0.42, po4.zak);
test('a nemá nic ručního', po4.rucni.length === 0, JSON.stringify(po4.rucni));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await b.close(); server.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
