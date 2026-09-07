/* Ověření v prohlížeči: OBNOVA DATABÁZE ZE ZÁLOHY (nález V26, 7. 9. 2026)
 * ======================================================================
 *
 * Hlášeno J. V. 7. 9. 2026: „online databázi zřejmě umím stáhnout, ale
 * nedokážu ji hromadně nahrát zpět." Do té doby uměla aplikace zálohu jen
 * vydat — endpoint, který ji přijme, neexistoval.
 *
 * Počítání hlídají serverové sady (netlify/test_funkce.mjs, test_prava.mjs);
 * tady jde o to, co administrátor UVIDÍ a proklikne: že se panel otevře,
 * že se bez náhledu nedá obnovit, že náhled ukáže čísla, že obnova zakázku
 * opravdu vrátí a že se přitom sám pořídí otisk stavu před obnovou.
 *
 * Běží proti SKUTEČNÝM serverovým funkcím nad paměťovým úložištěm.
 * Spuštění: node overit_obnovu_db.mjs */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-pro-obnovu-db';
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
import zaloha from './netlify/functions/zaloha.mjs';
import zalohaVynuceno from './netlify/functions/zaloha_vynuceno.mjs';
import obnova from './netlify/functions/obnova.mjs';

const dlgStub = async (page) => page.evaluate(() => {
  window.__dlgTexty = [];
  window.potvrd = (t) => { window.__dlgTexty.push(String(t)); return Promise.resolve(true); };
  window.hlaska = (t) => { window.__dlgTexty.push(String(t)); return Promise.resolve(); };
  window.dotaz = (t, v) => { window.__dlgTexty.push(String(t)); return Promise.resolve(v == null ? '' : v); };
});
const dlgTexty = async (page) => page.evaluate(() => window.__dlgTexty || []);

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const FUNKCE = { '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/uzivatele': uzivatele, '/api/program': programF, '/api/zakazky': zakazky,
  '/api/firma': firma, '/api/zobrazeni': zobrazeni, '/api/zakaznici': zakaznici,
  '/api/sablony': sablony, '/api/analytika': analytika, '/api/zaloha': zaloha,
  '/api/zaloha_vynuceno': zalohaVynuceno, '/api/obnova': obnova };

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
const zakazekVPameti = () => [...pamet.keys()].filter(k => k.startsWith('zakazky/z/')).length;

/* 1) něco, o co jde přijít */
await page.evaluate(async () => {
  set('ZAK.cislo', '2026 - OPR - CN - 0901');
  set('ZAK.nazevAkce', 'Zakázka před zálohou');
  await zakUlozUI();
});
await page.waitForTimeout(1200);
const soubor = await page.evaluate(() => ONLINE_STAV.soubor);
test('zkušební zakázka je na serveru', zakazekVPameti() === 1 && !!soubor, soubor);

/* 2) záloha (serverový otisk) přes tlačítko Zálohovat teď */
await page.evaluate(() => onlineZalohaTed());
await page.waitForTimeout(800);
const den = new Date().toISOString().slice(0, 10);
test('otisk databáze vznikl pod dnešním dnem', pamet.has('zalohy/' + den));

/* 3) panel obnovy — existuje a otevře se
 * Karta Databáze žije v modálu Nastavení; dokud se neotevře, není v obrazovce
 * vidět ani písmeno (a innerText nic nevrátí). */
await page.evaluate(() => { otevriNastaveni(); nastPanel('databaze'); });
await page.waitForTimeout(400);
test('v kartě Databáze je tlačítko „Obnovit ze zálohy…"',
  await page.evaluate(() => /Obnovit ze zálohy/.test(document.body.innerText)));
await page.evaluate(() => onlineObnovaPrepni());
await page.waitForTimeout(500);
const panel = await page.evaluate(() => {
  const t = document.body.innerText;
  return { nadpis: /Obnova databáze ze zálohy/.test(t),
           zdroje: /serverový otisk/.test(t) && /nahraný soubor zálohy/.test(t),
           rezimy: /doplnit jen chybějící/.test(t) && /přepsat vším ze zálohy/.test(t) };
});
test('panel obnovy se otevře', panel.nadpis, JSON.stringify(panel));
test('nabízí oba zdroje i oba režimy', panel.zdroje && panel.rezimy, JSON.stringify(panel));

/* 4) bez náhledu se obnovit nedá — tlačítko je zhasnuté */
test('tlačítko Obnovit databázi je bez náhledu zhasnuté', await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Obnovit databázi/.test(x.textContent));
  return !!b && b.disabled;
}));
await page.evaluate(() => onlineObnovaProved());
await page.waitForTimeout(300);
test('a i kdyby se zavolala, řekne si o náhled',
  (await dlgTexty(page)).join(' ').indexOf('náhled') === -1
    && await page.evaluate(() => /náhled/.test(ONLINE_STAV.obnova.hlaska)),
  await page.evaluate(() => ONLINE_STAV.obnova.hlaska));

/* 5) ztráta dat a náhled */
pamet.delete('zakazky/z/' + soubor);
test('zakázka je pryč (simulovaná havárie)', zakazekVPameti() === 0);
await page.evaluate(d => { onlineObnovaVolba('zdroj', 'otisk'); onlineObnovaVolba('den', d); }, den);
await page.evaluate(() => onlineObnovaNahled());
await page.waitForTimeout(800);
const nahled = await page.evaluate(() => ONLINE_STAV.obnova.nahled);
test('náhled spočítá, že zakázka přibude', !!nahled && nahled.plan.zakazky.novych === 1,
  JSON.stringify(nahled && nahled.plan.zakazky));
test('náhled sám nic nezapsal', zakazekVPameti() === 0);
test('tabulka náhledu je vidět v obrazovce', await page.evaluate(() =>
  /Přepsaných/.test(document.body.innerText) && /Přeskočeno/.test(document.body.innerText)));
test('tlačítko Obnovit databázi se po náhledu rozsvítí', await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Obnovit databázi/.test(x.textContent));
  return !!b && !b.disabled;
}));

/* 6) vlastní obnova */
await page.evaluate(() => onlineObnovaProved());
await page.waitForTimeout(1500);
test('obnova zakázku vrátila', zakazekVPameti() === 1);
test('a je to táž zakázka', (() => {
  const k = [...pamet.keys()].find(x => x.startsWith('zakazky/z/'));
  return /0901/.test(JSON.parse(pamet.get(k)).cislo);
})());
test('rejstřík zakázku zase eviduje',
  ((JSON.parse(pamet.get('zakazky/_rejstrik') || '{}').zakazky) || []).length === 1);
const texty = (await dlgTexty(page)).join(' | ');
test('potvrzení říká, že se předtím pořídí otisk', /otisk současného stavu/.test(texty), texty.slice(-160));
test('a že uzamčené nabídky se nepřepíšou', /[Uu]zamčené \(odeslané\) nabídky/.test(texty), texty.slice(-160));
test('hlášení po obnově zmiňuje zdroj', await page.evaluate(() =>
  /Obnoveno ze zdroje/.test(ONLINE_STAV.obnova.hlaska)), await page.evaluate(() => ONLINE_STAV.obnova.hlaska));

/* 7) obchodník tlačítko vůbec nevidí */
await page.evaluate(async () => {
  await onlineApi('/api/uzivatele', { akce: 'zaloz', email: 'obchodnik@engineers-cz.cz',
    jmeno: 'Zkušební Obchodník', role: 'Obchodník', heslo: 'ObchodHeslo1' });
  await onlineOdhlas();
});
await page.waitForTimeout(600);
await page.fill('#onlineEmail', 'obchodnik@engineers-cz.cz');
await page.fill('#onlineHeslo', 'ObchodHeslo1');
await page.click('#prihlaseni-box >> text=Přihlásit');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } }, null, { timeout: 10000 });
await page.waitForTimeout(700);
await page.evaluate(() => { otevriNastaveni(); nastPanel('databaze'); });
await page.waitForTimeout(400);
test('obchodník tlačítko „Obnovit ze zálohy…" v obrazovce nemá',
  await page.evaluate(() => !/Obnovit ze zálohy/.test(document.body.innerText)));
const zamitnuto = await page.evaluate(() => onlineApi('/api/obnova',
  { zdroj: 'soubor', nahled: true, zaloha: { porizena: new Date().toISOString(), zakazky: {} } })
  .then(() => 'prošlo').catch(e => 'odmítnuto'));
test('a kdyby si cestu zavolal ručně, server ho odmítne', zamitnuto === 'odmítnuto', zamitnuto);

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await b.close(); server.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
