/* Kontrola v prohlížeči: matice zobrazení (#136) — Nastavení → Zobrazení.
 *
 * Proč to nestačí ověřit v Node: pravidla samotná má `src/test_zobrazeni.js`
 * (33 kontrol) a serverová práva `netlify/test_prava.mjs`. Tady jde o to,
 * jestli je celý řetěz opravdu propojený:
 *
 *   administrátor zaškrtne políčko  →  NAST.zobrazeni
 *   → „Zveřejnit online"            →  POST /api/zobrazeni (store `program`)
 *   → obchodník se přihlásí         →  GET /api/zobrazeni  →  NAST.zobrazeni
 *   → rozhraní se podle toho složí   (tabViditelny / smiZobrazit)
 *
 * Kdyby kterýkoli článek chyběl — a při stavbě chyběl hned dvakrát, jednou
 * v serverovém zavaděči modulů a jednou v seznamu ukládaných klíčů — matice
 * by se tvářila, že funguje, jen by se k obchodníkovi nikdy nedostala.
 * Přesně to se z jednotkových testů poznat nedá.
 *
 * Průchod je stejný jako u overit_role_nahled.mjs: pravé serverové funkce
 * přes most `page.route`, administrátor založí obchodníka, obchodník se
 * přihlásí. Data drží paměťové úložiště, nic se nikam nezapisuje.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_zobrazeni.mjs
 */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-jen-pro-kontrolu-zobrazeni';
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
  console.error('Playwright není k dispozici. NODE_PATH=$(npm root -g) node overit_zobrazeni.mjs');
  process.exit(2);
}

const FUNKCE = {
  '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/odhlaseni': odhlaseni, '/api/uzivatele': uzivatele,
  '/api/program': program, '/api/zakazky': zakazky, '/api/zaloha': zaloha,
  '/api/firma': firma, '/api/zobrazeni': zobrazeni,
  '/api/zaloha_vynuceno': zalohaVynuceno,
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
/* Zveřejnění i předlohy se ptají přes confirm(), odmítnutí přes alert().
 * Dialog se musí odklepnout, jinak stránka zamrzne. Text si pamatujeme. */
let poslednihlaska = '';
page.on('dialog', d => { poslednihlaska = d.message(); d.accept(); });
const chyby = [];
page.on('pageerror', e => chyby.push(String(e)));

let cookieJar = '';
const volani = [];          // které cesty aplikace opravdu zavolala
await page.route('**/api/**', async route => {
  const r = route.request();
  const url = new URL(r.url());
  volani.push(r.method() + ' ' + url.pathname);
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

/* ---------- 1) administrátor: panel Zobrazení existuje a je úplný ---------- */

await prihlas('vendl.jaroslav@engineers-cz.cz', 'Zkusebni.Heslo.123');
await cekejPrihlasen();
test('po přihlášení se matice zobrazení načetla ze serveru',
  volani.includes('GET /api/zobrazeni'), volani.join(', '));

await page.evaluate(() => { otevriNastaveni(); nastPanel('zobrazeni'); });
await page.waitForTimeout(300);

test('v liště Nastavení je záložka „Zobrazení"',
  await page.locator('.nast-tabs >> text=Zobrazení').isVisible());
test('panel vypíše všechny prvky matice',
  await page.evaluate(() => document.querySelectorAll(
    '#nastaveni-panel input[onchange^="zobrSet"]').length
    === ZOBRAZENI_PRVKY.filter(p => !p.pevne).length * ZOBRAZENI_ROLE_PRIDELITELNE.length));
test('prvky držené serverem nemají políčko k zaškrtnutí',
  await page.evaluate(() => {
    const pevne = ZOBRAZENI_PRVKY.filter(p => p.pevne).map(p => p.klic);
    const html = document.getElementById('nastaveni-panel').innerHTML;
    return pevne.length > 0 && pevne.every(k => !html.includes(`zobrSet('${k}'`));
  }));
test('u prvků držených serverem se to i napíše',
  (await page.locator('#nastaveni-panel').innerText()).includes('drží server'));

/* ---------- 2) přidělení: obchodník dostane Detail výpočtu ---------- */

await page.evaluate(() => zobrSet('tab.detail', 'Obchodník', true));
await page.waitForTimeout(200);
test('zaškrtnutí se propíše do matice v paměti',
  await page.evaluate(() => NAST.zobrazeni['tab.detail']['Obchodník'] === true));
test('změna se pozná proti dnešnímu stavu',
  await page.evaluate(() => zobrazeniZmeny(NAST.zobrazeni)
    .some(z => z.klic === 'tab.detail' && z.role === 'Obchodník')));

/* Prvek držený serverem nesmí jít přidělit ani obchvatem z konzole. */
await page.evaluate(() => zobrSet('nastaveni.uzivatele', 'Obchodník', true));
await page.waitForTimeout(150);
test('prvek držený serverem zůstane nepřidělený i po zásahu z konzole',
  await page.evaluate(() => zobrazeniSmi('Obchodník', 'nastaveni.uzivatele', NAST.zobrazeni) === false));

/* ---------- 3) zveřejnění online ---------- */

poslednihlaska = '';
await page.evaluate(() => onlineZverejniZobrazeni());
await page.waitForTimeout(800);
test('zveřejnění se administrátora nejdřív zeptá', /Zveřejnit/.test(poslednihlaska), poslednihlaska);
test('zveřejnění poslalo matici na server',
  volani.includes('POST /api/zobrazeni'), volani.join(', '));
test('server matici přijal a vrátil ji zpět',
  await page.evaluate(() => !!(ONLINE_STAV.zobrazeni && ONLINE_STAV.zobrazeni.matice
    && ONLINE_STAV.zobrazeni.matice['tab.detail']['Obchodník'] === true)));
test('u zveřejnění se pamatuje, kdo a kdy',
  await page.evaluate(() => !!(ONLINE_STAV.zobrazeni.kdo && ONLINE_STAV.zobrazeni.kdy)));

/* Založíme obchodníka a odhlásíme se. */
await page.evaluate(() => { nastPanel('uzivatele'); });
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivateleNacteno; } catch (e) { return false; } });
await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
await page.fill('#onlineUzJmeno', 'Petr Novák');
await page.fill('#onlineUzHeslo', 'ObchodniHeslo1');
await page.click('#nastaveni-panel >> text=Založit účet');
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivatele.length === 2; } catch (e) { return false; } });
await page.evaluate(() => zavriNastaveni());
await odhlas();

test('po odhlášení platí zase výchozí (nejpřísnější) matice',
  await page.evaluate(() => zobrazeniZmeny(NAST.zobrazeni).length === 0));

/* ---------- 4) obchodník: přidělené vidí, ostatní ne ---------- */

await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo1');
await cekejPrihlasen();
await page.waitForTimeout(700);

test('obchodníkovi dorazila zveřejněná matice',
  await page.evaluate(() => NAST.zobrazeni['tab.detail']['Obchodník'] === true));
test('přidělená záložka Detail výpočtu je pro obchodníka viditelná',
  await page.evaluate(() => tabViditelny('detail') === true));
test('a je opravdu v liště vidět',
  await page.locator('#tab-detail').isVisible());
test('nepřidělený Ceník OCK zůstává skrytý',
  await page.evaluate(() => tabViditelny('cenik') === false));
test('nepřidělený Ceník projekce zůstává skrytý',
  await page.evaluate(() => tabViditelny('cenikproj') === false));
test('Nastavení obchodník dál nevidí',
  await page.evaluate(() => smiZobrazit('nastaveni.otevrit') === false));
test('ozubené kolečko Nastavení obchodník nevidí',
  !(await page.locator('#btnNastaveni').isVisible()));

/* Matice je vrstva pohodlí — hranici drží server. Ověříme obojí: */
poslednihlaska = '';
await page.evaluate(() => zobrSet('tab.cenik', 'Obchodník', true));
await page.waitForTimeout(200);
test('obchodník si sám nic nepřidělí (zobrSet je jen pro administrátora)',
  await page.evaluate(() => tabViditelny('cenik') === false));

/* Odmítnutí nechodí přes alert(), ale hláškou v online liště (ONLINE_STAV.hlaska) —
 * proto se čte odtud, ne z odchyceného dialogu. */
const pokusOZverejneni = await page.evaluate(async () => {
  const v = await onlineZverejniZobrazeni();
  return { v, hlaska: ONLINE_STAV.hlaska, typ: ONLINE_STAV.hlaskaTyp };
});
test('a zveřejnit matici nesmí', pokusOZverejneni.v === false
  && /administrátor/i.test(pokusOZverejneni.hlaska), JSON.stringify(pokusOZverejneni));
test('obchodníkovi se odmítnutí vysvětlí v liště',
  pokusOZverejneni.typ === 'varovani', pokusOZverejneni.typ);
test('a na server se přitom nic neposlalo',
  volani.filter(x => x === 'POST /api/zobrazeni').length === 1, volani.join(', '));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await prohlizec.close();
server.close();

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
