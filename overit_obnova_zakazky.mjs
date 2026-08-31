/* Ověření: rozdělaná zakázka přežije obnovení stránky (31. 8. 2026).
 *
 * Hlášeno J. V.: „globální přirážka se resetuje i při refreshi stránky."
 * Přirážka se neresetovala — obnovení začalo NOVOU prázdnou zakázkou, která má
 * přirážku z ceníku, zatímco rozdělaná ležela v pořádku na serveru. Aplikace si
 * teď pamatuje, na čem se pracovalo, a po přihlášení se tam vrátí.
 *
 * Běží proti SKUTEČNÝM serverovým funkcím nad paměťovým úložištěm.
 * Spuštění: node overit_obnova_zakazky.mjs */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-pro-pokus-s-marzi';
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
await prihlas();

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* 1) zakázka s vlastní přirážkou 40 % a uložení */
await page.evaluate(async () => {
  set('ZAK.cislo', '2026 - OPR - CN - 0999');
  set('ZAK.nazevAkce', 'Německo — pokus');
  set('C.marze', 0.40);
  await zakUlozUI();
});
await page.waitForTimeout(1200);
const pred = await page.evaluate(() => ({
  marze: aktivniVarianta(ZAK).data.cenik.marze, soubor: ONLINE_STAV.soubor,
}));
test('zakázka se uložila s přirážkou 40 %', pred.marze === 0.40 && !!pred.soubor, JSON.stringify(pred));

/* 2) obnovení stránky (F5) */
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(1200);
const po = await page.evaluate(() => ({
  marze: aktivniVarianta(ZAK).data.cenik.marze, cislo: ZAK.cislo,
  soubor: ONLINE_STAV.soubor, prihlasen: !!ONLINE_STAV.ja,
}));
test('po obnovení stránky je zakázka zase otevřená', po.soubor === pred.soubor, JSON.stringify(po));
test('a přirážka v ní zůstala 40 %', po.marze === 0.40, po.marze);
test('i číslo nabídky sedí', /0999/.test(po.cislo), po.cislo);

/* 3) nová zakázka značku zahodí — po refreshi se pak není kam vracet */
await page.evaluate(() => { novaZakazkaUI(); });
await page.waitForTimeout(400);
test('nová zakázka odpojí návrat', await page.evaluate(() =>
  !Uloziste.cti('kng_posledni_zakazka_v1')));

/* 4) na serveru je pořád ta správná hodnota */
test('na serveru leží zakázka s přirážkou 40 %', (() => {
  for (const [k, v] of pamet) if (k.startsWith('zakazky/z/')) {
    const z = JSON.parse(v);
    return ((z.varianty || [])[0] || {}).data.cenik.marze === 0.40;
  }
  return false;
})());

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await b.close(); server.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
