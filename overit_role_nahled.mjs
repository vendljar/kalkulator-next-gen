/* Kontrola v prohlížeči: obchodník se nesmí sám povýšit na administrátora
 * (nález z 5. 8. 2026, pravidlo v src/prava.js).
 *
 * Proč to nestačí otestovat v Node: pravidlo samo je pár řádek a testy má
 * v `src/test_prava_klient.js`. Tady jde o něco jiného — jestli je opravdu
 * zapojené do sestavené aplikace. Chyba byla přesně tohoto druhu: funkce
 * `jeAdmin()` fungovala správně, jen ji šlo přepnout tlačítkem, na které
 * nikdo nemyslel. Takové věci se dají chytit jen v běžící stránce.
 *
 * Průchod je stejný jako u snímků manuálu: pravé serverové funkce přes most
 * `page.route`, administrátor založí obchodníka, obchodník se přihlásí.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_role_nahled.mjs
 */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-jen-pro-kontrolu-roli';
process.env.ADMIN_INIT_HESLO = 'Zkusebni.Heslo.123';
const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async seznam(prefix) {
    return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (prefix || '')))
      .map(x => x.slice(nazev.length + 1));
  },
});

import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import zdravi from './netlify/functions/zdravi.mjs';
import ja from './netlify/functions/ja.mjs';
import prihlaseni from './netlify/functions/prihlaseni.mjs';
import odhlaseni from './netlify/functions/odhlaseni.mjs';
import uzivatele from './netlify/functions/uzivatele.mjs';
import program from './netlify/functions/program.mjs';
import zakazky from './netlify/functions/zakazky.mjs';
import zaloha from './netlify/functions/zaloha.mjs';
import firma from './netlify/functions/firma.mjs';
import zobrazeni from './netlify/functions/zobrazeni.mjs';
import zalohaVynuceno from './netlify/functions/zaloha_vynuceno.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Playwright není k dispozici. NODE_PATH=$(npm root -g) node overit_role_nahled.mjs');
  process.exit(2);
}

const FUNKCE = {
  '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/odhlaseni': odhlaseni, '/api/uzivatele': uzivatele,
  '/api/program': program, '/api/zakazky': zakazky, '/api/zaloha': zaloha,
  '/api/firma': firma, '/api/zobrazeni': zobrazeni, '/api/zaloha_vynuceno': zalohaVynuceno,
};

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const html = readFileSync(path.resolve('dist/kalkulacka.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ADRESA = 'http://127.0.0.1:' + server.address().port;

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
/* Odmítnutí se hlásí přes alert(); dialog se musí odklepnout, jinak by
 * stránka zamrzla a další kontrola by vypršela. Text si zapamatujeme. */
let poslednihlaska = '';
page.on('dialog', d => { poslednihlaska = d.message(); d.accept(); });
const chyby = [];
page.on('pageerror', e => chyby.push(String(e)));

let cookieJar = '';
await page.route('**/api/**', async route => {
  const r = route.request();
  const url = new URL(r.url());
  const fn = FUNKCE[url.pathname];
  if (!fn) return route.fulfill({ status: 404, body: '{"ok":false}' });
  const init = { method: r.method(), headers: { cookie: cookieJar } };
  if (r.method() === 'POST') init.body = r.postData() || '';
  const odp = await fn(new Request(r.url(), init));
  const setc = odp.headers.get('set-cookie');
  if (setc) cookieJar = setc.split(';')[0];
  route.fulfill({ status: odp.status, contentType: 'application/json; charset=utf-8',
    body: await odp.text() });
});

const prihlas = async (email, heslo) => {
  await page.fill('#onlineEmail', email);
  await page.fill('#onlineHeslo', heslo);
  await page.click('#prihlaseni-box >> text=Přihlásit');
  await page.waitForTimeout(600);
};
const cekejPrihlasen = () => page.waitForFunction(
  () => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } }, null, { timeout: 10000 });
const odhlas = async () => {
  await page.evaluate(() => onlineOdhlas());
  await page.waitForFunction(() => { try { return ONLINE_STAV.ja === null; } catch (e) { return false; } });
  await page.reload();
  await page.waitForFunction(() => typeof window.render === 'function');
  await page.waitForTimeout(400);
};

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(500);

/* ---------- 1) administrátor: pohled si přepnout smí ---------- */

await prihlas('vendl.jaroslav@engineers-cz.cz', 'Zkusebni.Heslo.123');
await cekejPrihlasen();
test('administrátor je po přihlášení v pohledu administrátora',
  await page.evaluate(() => NAST.jeAdmin === true));
test('administrátorovi funguje náhled běžného uživatele',
  await page.evaluate(() => { nastSetAdmin(false); return NAST.jeAdmin === false; }));
test('z náhledu vede tlačítko zpět a je vidět',
  await page.locator('#btnZpetAdmin').isVisible());
test('administrátor se z náhledu vrátí',
  await page.evaluate(() => { nastSetAdmin(true); return NAST.jeAdmin === true; }));

/* Založíme obchodníka a odhlásíme se. */
await page.evaluate(() => { otevriNastaveni(); nastPanel('uzivatele'); });
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivateleNacteno; } catch (e) { return false; } });
await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
await page.fill('#onlineUzJmeno', 'Petr Novák');
await page.fill('#onlineUzHeslo', 'ObchodniHeslo1');
await page.click('#nastaveni-panel >> text=Založit účet');
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivatele.length === 2; } catch (e) { return false; } });
await page.evaluate(() => zavriNastaveni());
await odhlas();

/* ---------- 2) obchodník: pohled administrátora nedostane ---------- */

await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo1');
await cekejPrihlasen();
await page.waitForTimeout(600);

test('obchodník je v pohledu běžného uživatele',
  await page.evaluate(() => NAST.jeAdmin === false));
test('stránka nese třídu role-user',
  await page.evaluate(() => document.body.classList.contains('role-user')));
test('stránka NEnese třídu muze-admin',
  await page.evaluate(() => !document.body.classList.contains('muze-admin')));

/* Jádro nálezu: tlačítko „← Ukončit náhled uživatele" svítilo i obchodníkovi. */
test('tlačítko „Ukončit náhled uživatele" obchodník nevidí',
  !(await page.locator('#btnZpetAdmin').isVisible()));

/* Skrýt nestačí — funkce jde zavolat z konzole prohlížeče. */
poslednihlaska = '';
await page.evaluate(() => nastSetAdmin(true));
await page.waitForTimeout(200);
test('volání nastSetAdmin(true) z konzole roli nezmění',
  await page.evaluate(() => NAST.jeAdmin === false));
test('odmítnutí se uživateli vysvětlí', /Administrátor/.test(poslednihlaska), poslednihlaska);

/* A hlavně: ceníkové záložky musí zůstat schované. Právě v nich jsou
 * náklady, které se k obchodníkovi dostat nesmí. */
test('záložka Ceník OCK zůstává skrytá',
  await page.evaluate(() => tabViditelny('cenik') === false));
test('záložka Ceník projekce zůstává skrytá',
  await page.evaluate(() => tabViditelny('cenikproj') === false));
test('ozubené kolečko Nastavení obchodník nevidí',
  !(await page.locator('#btnNastaveni').isVisible()));
test('náklady zůstávají skryté (třída skryt-naklady)',
  await page.evaluate(() => document.body.classList.contains('skryt-naklady')));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await prohlizec.close();
server.close();

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
