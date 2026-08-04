/* Ověření ONLINE DATABÁZE v prohlížeči (4. 8. 2026).
 *
 * Node testy (netlify/test_funkce.mjs) ověřují serverové funkce, smoke.mjs
 * hlídá, že aplikace nad file:// mlčí. Tady se testuje to, co ani jeden
 * z nich neumí: SKUTEČNÝ klient proti SKUTEČNÉMU serverovému kódu.
 *
 * Jak: sestavená aplikace se servíruje přes lokální http server (online
 * vrstva se probouzí jen nad http/https) a každé volání /api/* se předá
 * OPRAVDOVÝM funkcím z netlify/functions — s pamětovým úložištěm místo
 * Blobs a s vlastní správou cookie. Testuje se tedy celá cesta: formulář →
 * fetch → funkce → Blobs → odpověď → obrazovka. Žádný mock chování.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_online.mjs
 */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-jen-pro-harness';
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

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Playwright není k dispozici. NODE_PATH=$(npm root -g) node overit_online.mjs');
  process.exit(2);
}

const FUNKCE = {
  '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/odhlaseni': odhlaseni, '/api/uzivatele': uzivatele,
  '/api/program': program, '/api/zakazky': zakazky, '/api/zaloha': zaloha,
};

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : JSON.stringify(info)); }
};

/* ---- lokální http server jen pro aplikaci (API řeší route níže) ---- */
const html = readFileSync(path.resolve('dist/kalkulacka.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ADRESA = 'http://127.0.0.1:' + server.address().port;

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ acceptDownloads: true });
const page = await ctx.newPage();

const chyby = [];
page.on('console', m => {
  const t = m.text();
  // 401/403 z /api jsou v testu záměr (špatné heslo, cizí role) – prohlížeč
  // je hlásí jako chybu sítě, ale aplikace s nimi počítá a uklidí je.
  if (m.type() === 'error' && !/status of (401|403|400|409)/.test(t)) chyby.push('console: ' + t);
});
page.on('pageerror', e => chyby.push('pageerror: ' + e.message));

/* Dialogy: prompt (zdůvodnění zveřejnění) dostane text, confirm se odkývá. */
page.on('dialog', d => (d.type() === 'prompt' ? d.accept('zkušební zveřejnění') : d.accept()));

/* Most na serverové funkce: cookie si vede harness sám (fetch z prohlížeče
 * ji posílá, Playwright route ji ale funkcím musí předat ručně). */
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

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(400);

const kartaHtml = () => page.locator('#page-zakazka').innerHTML();

/* ---- 1) probuzení online vrstvy nad http ---- */
test('sonda /api/zdravi proběhla a karta ví, že server běží',
  await page.evaluate(() => ONLINE_STAV.bezi === true));
test('karta vyzývá k přihlášení', (await kartaHtml()).includes('Přihlaste se e-mailem a heslem'));

/* ---- 2) špatné heslo ---- */
await page.evaluate(() => prepniTab('zakazka'));
await page.fill('#onlineEmail', 'vendl.jaroslav@engineers-cz.cz');
await page.fill('#onlineHeslo', 'spatne-heslo');
await page.click('text=Přihlásit');
await page.waitForTimeout(300);
test('špatné heslo se odmítne a důvod je vidět',
  (await kartaHtml()).includes('Nesprávný e-mail nebo heslo'));

/* ---- 3) první přihlášení administrátora (bootstrap z ADMIN_INIT_HESLO) ---- */
await page.fill('#onlineHeslo', 'Zkusebni.Heslo.123');
await page.click('text=Přihlásit');
await page.waitForFunction(() => !!ONLINE_STAV.ja);
await page.waitForTimeout(400);
test('administrátor je přihlášený',
  await page.evaluate(() => ONLINE_STAV.ja.role === 'Administrátor'));
test('jméno ze serveru se propsalo do aplikace (razítka, protokol)',
  await page.evaluate(() => NAST.uzivatel === 'Jaroslav Vendl' && NAST.jeAdmin === true));
test('online databáze programu je zatím prázdná',
  await page.evaluate(() => ONLINE_STAV.db === null));

/* ---- 4) zveřejnění ceníku online a jeho nasazení v aplikaci ---- */
await page.evaluate(() => prepniTab('cenik'));
await page.waitForTimeout(200);
test('karta Online ceník stojí na záložce Ceník',
  (await page.locator('#page-cenik').innerHTML()).includes('Online ceník programu'));
await page.evaluate(() => onlineZverejni());
await page.waitForFunction(() => ONLINE_STAV.db && ONLINE_STAV.db.platny);
await page.waitForTimeout(500);
test('zveřejnění založilo online verzi 1',
  await page.evaluate(() => ONLINE_STAV.db.platny.verze === 1));
test('poznámka z dialogu se zapsala',
  await page.evaluate(() => ONLINE_STAV.db.platny.poznamka === 'zkušební zveřejnění'));
test('online ceník se v aplikaci sám nasadil (složka není připojená)',
  await page.evaluate(() => ONLINE_STAV.cenikPouzit === true));
test('server otiskl, kdo zveřejnil',
  await page.evaluate(() => ONLINE_STAV.db.platny.kdo === 'vendl.jaroslav@engineers-cz.cz'));

/* ---- 5) zakázka online: uložit, seznam, otevřít ---- */
await page.evaluate(() => { ZAK.cislo = '2026 - OPR - CN - 0555'; ZAK.nazevAkce = 'Online ověření'; render(); });
await page.evaluate(() => onlineUloz());
await page.waitForFunction(() => ONLINE_STAV.soubor !== '');
test('zakázka se uložila online pod jménem ze svého čísla',
  await page.evaluate(() => ONLINE_STAV.soubor.includes('0555')));
test('rejstřík online ji eviduje',
  await page.evaluate(() => ONLINE_STAV.rejstrik.length === 1 && ONLINE_STAV.rejstrik[0].cislo === ZAK.cislo));

await page.evaluate(() => otevriOnline('zakazky'));
await page.waitForTimeout(300);
test('panel Zakázky online ukazuje uloženou zakázku',
  (await page.locator('#online-panel').innerHTML()).includes('Online ověření'));
await page.evaluate(() => onlineOtevri(ONLINE_STAV.soubor));
await page.waitForTimeout(400);
test('zakázka se otevřela online a číslo sedí',
  await page.evaluate(() => ZAK.cislo === '2026 - OPR - CN - 0555'));

/* ---- 6) správa účtů ---- */
await page.evaluate(() => otevriOnline('uzivatele'));
await page.waitForTimeout(400);
const panel = await page.locator('#online-panel').innerHTML();
test('seznam účtů ukazuje administrátora jako hlavní účet',
  panel.includes('vendl.jaroslav@engineers-cz.cz') && panel.includes('hlavní'));
await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
await page.fill('#onlineUzJmeno', 'Zkušební Obchodník');
await page.fill('#onlineUzHeslo', 'ObchodniHeslo1');
await page.evaluate(() => onlineUzZaloz());
await page.waitForFunction(() => ONLINE_STAV.uzivatele.length === 2);
test('nový účet obchodníka je založený',
  await page.evaluate(() => ONLINE_STAV.uzivatele.some(u => u.email === 'obchodnik@engineers-cz.cz' && u.role === 'Obchodník')));
await page.evaluate(() => zavriOnline());

/* ---- 7) záloha ke stažení (soubor s datem v názvu) ---- */
const [stazeni] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(() => onlineZaloha(false)),
]);
test('záloha se stáhne pod jménem s dnešním datem',
  stazeni.suggestedFilename() === 'zaloha_online_' + new Date().toISOString().slice(0, 10) + '.json');

/* ---- 8) relace přežije obnovení stránky ---- */
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
/* Pozor: ONLINE_STAV je top-level const – bare identifikátor funguje,
 * window.ONLINE_STAV ne. Než se skript vůbec vyhodnotí, identifikátor
 * neexistuje, proto try/catch. */
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } },
  null, { timeout: 8000 });
await page.waitForTimeout(400);
test('po obnovení stránky je uživatel dál přihlášený (cookie relace)',
  await page.evaluate(() => ONLINE_STAV.ja.email === 'vendl.jaroslav@engineers-cz.cz'));
test('i po obnovení se jméno dočetlo z účtu (ne jen e-mail)',
  await page.evaluate(() => NAST.uzivatel === 'Jaroslav Vendl'));
test('platný ceník se po obnovení načetl a nasadil sám',
  await page.evaluate(() => ONLINE_STAV.db.platny.verze === 1 && ONLINE_STAV.cenikPouzit === true));
test('rejstřík zakázek se po obnovení načetl sám',
  await page.evaluate(() => ONLINE_STAV.rejstrik.length === 1));

/* ---- 9) odhlášení ---- */
await page.evaluate(() => prepniTab('zakazka'));
await page.evaluate(() => onlineOdhlas());
await page.waitForFunction(() => ONLINE_STAV.ja === null);
await page.waitForTimeout(300);
test('odhlášení vrátí kartu k přihlašovacímu formuláři',
  (await kartaHtml()).includes('Přihlaste se e-mailem a heslem') || (await kartaHtml()).includes('onlineEmail'));
test('po odhlášení online ceník nevládne',
  await page.evaluate(() => ONLINE_STAV.cenikPouzit === false && ONLINE_STAV.db === null));
const ja2 = await page.evaluate(() => fetch('/api/ja', { credentials: 'same-origin' }).then(r => r.status));
test('server relaci opravdu zrušil (cookie je pryč)', ja2 === 401);

/* ---- 10) čistá konzole ---- */
test('za celý průchod nevznikla nečekaná chyba v konzoli', chyby.length === 0, chyby);

await prohlizec.close();
server.close();
console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
