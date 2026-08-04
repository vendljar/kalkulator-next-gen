/* Ověření ONLINE DATABÁZE v prohlížeči (4. 8. 2026; rozšířeno o přihlašovací
 * stránku, lištu v rohu, změnu vlastního hesla a role).
 *
 * Node testy (netlify/test_funkce.mjs) ověřují serverové funkce, smoke.mjs
 * hlídá, že aplikace nad file:// mlčí. Tady se testuje to, co ani jeden
 * z nich neumí: SKUTEČNÝ klient proti SKUTEČNÉMU serverovému kódu.
 *
 * Jak: sestavená aplikace se servíruje přes lokální http server (online
 * vrstva se probouzí jen nad http/https) a každé volání /api/* se předá
 * OPRAVDOVÝM funkcím z netlify/functions — s pamětovým úložištěm místo
 * Blobs a s vlastní správou cookie. Žádný mock chování.
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
  // 401/403/400/409 z /api jsou v testu záměr – aplikace s nimi počítá.
  if (m.type() === 'error' && !/status of (401|403|400|409)/.test(t)) chyby.push('console: ' + t);
});
page.on('pageerror', e => chyby.push('pageerror: ' + e.message));
page.on('dialog', d => (d.type() === 'prompt' ? d.accept('zkušební zveřejnění') : d.accept()));

/* Most na serverové funkce: cookie si vede harness sám. */
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

const gate = () => page.locator('#prihlaseni-box').innerHTML();
const gateViditelna = () => page.evaluate(() =>
  document.getElementById('prihlaseni-overlay').style.display !== 'none');
const prihlas = async (email, heslo) => {
  await page.fill('#onlineEmail', email);
  await page.fill('#onlineHeslo', heslo);
  await page.click('#prihlaseni-box >> text=Přihlásit');
  await page.waitForTimeout(400);
};

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(400);

/* ---- 1) přihlašovací stránka zakrývá aplikaci ---- */
test('přihlašovací stránka je vidět a nese název aplikace',
  await gateViditelna() && (await gate()).includes('Kalkulátor Next Gen'));
test('stránka má pole pro e-mail (uživatelské jméno) i heslo',
  (await gate()).includes('uživatelské jméno') && (await gate()).includes('onlineHeslo'));

/* ---- 2) špatné heslo ---- */
await prihlas('vendl.jaroslav@engineers-cz.cz', 'spatne-heslo');
test('špatné heslo se odmítne s důvodem přímo na přihlašovací stránce',
  (await gate()).includes('Nesprávný e-mail nebo heslo'));
test('stránka po chybě zůstává', await gateViditelna());

/* ---- 3) přihlášení administrátora (bootstrap) ---- */
await prihlas('vendl.jaroslav@engineers-cz.cz', 'Zkusebni.Heslo.123');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
await page.waitForTimeout(400);
test('po přihlášení přihlašovací stránka zmizí', !(await gateViditelna()));
test('administrátor je přihlášený',
  await page.evaluate(() => ONLINE_STAV.ja.role === 'Administrátor'));
const roh = () => page.locator('#onlineLista').innerHTML();
test('v rohu hlavičky je vidět, kdo je přihlášený',
  (await roh()).includes('Jaroslav Vendl') && (await roh()).includes('Administrátor'));
test('roh nabízí Změnit heslo i Odhlásit',
  (await roh()).includes('Změnit heslo') && (await roh()).includes('Odhlásit'));

/* ---- 4) zveřejnění ceníku online a jeho nasazení ---- */
await page.evaluate(() => prepniTab('cenik'));
await page.evaluate(() => onlineZverejni());
await page.waitForFunction(() => { try { return !!(ONLINE_STAV.db && ONLINE_STAV.db.platny); } catch (e) { return false; } });
await page.waitForTimeout(500);
test('zveřejnění založilo online verzi 1',
  await page.evaluate(() => ONLINE_STAV.db.platny.verze === 1));
test('online ceník se v aplikaci sám nasadil',
  await page.evaluate(() => ONLINE_STAV.cenikPouzit === true));

/* ---- 5) zakázka online: uložit, seznam, otevřít ---- */
await page.evaluate(() => { ZAK.cislo = '2026 - OPR - CN - 0555'; ZAK.nazevAkce = 'Online ověření'; render(); });
await page.evaluate(() => onlineUloz());
await page.waitForFunction(() => { try { return ONLINE_STAV.soubor !== ''; } catch (e) { return false; } });
test('zakázka se uložila online pod jménem ze svého čísla',
  await page.evaluate(() => ONLINE_STAV.soubor.includes('0555')));
await page.evaluate(() => otevriOnline());
await page.waitForTimeout(300);
test('panel Zakázky online ukazuje uloženou zakázku',
  (await page.locator('#online-panel').innerHTML()).includes('Online ověření'));
await page.evaluate(() => onlineOtevri(ONLINE_STAV.soubor));
await page.waitForTimeout(400);
test('zakázka se otevřela online a číslo sedí',
  await page.evaluate(() => ZAK.cislo === '2026 - OPR - CN - 0555'));

/* ---- 6) správa účtů v Nastavení ---- */
await page.evaluate(() => { otevriNastaveni(); nastPanel('uzivatele'); });
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivateleNacteno; } catch (e) { return false; } });
await page.waitForTimeout(300);
const nastav = () => page.locator('#nastaveni-panel').innerHTML();
test('Nastavení → Uživatelé ukazuje účty online databáze',
  (await nastav()).includes('vendl.jaroslav@engineers-cz.cz') && (await nastav()).includes('hlavní'));

/* Chybová cesta (4. 8. 2026 večer): krátké heslo dřív formulář tiše smazalo
 * a nic neřeklo. Teď musí hláška stát přímo v panelu a pole zůstat vyplněná. */
await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
await page.fill('#onlineUzJmeno', 'Zkušební Obchodník');
await page.fill('#onlineUzHeslo', 'kratke');
await page.click('#nastaveni-panel >> text=Založit účet');
await page.waitForTimeout(300);
test('krátké heslo: důvod odmítnutí je vidět přímo v panelu Uživatelé',
  (await nastav()).includes('aspoň 8 znaků'));
test('krátké heslo: vyplněná pole se NEsmazala',
  await page.evaluate(() => document.getElementById('onlineUzEmail').value === 'obchodnik@engineers-cz.cz'
    && document.getElementById('onlineUzJmeno').value === 'Zkušební Obchodník'));

/* Úspěch — KLIKEM na tlačítko, přesně jako uživatel. */
await page.fill('#onlineUzHeslo', 'ObchodniHeslo1');
await page.click('#nastaveni-panel >> text=Založit účet');
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivatele.length === 2; } catch (e) { return false; } });
await page.waitForTimeout(300);
test('nový účet obchodníka se založil klikem z Nastavení',
  await page.evaluate(() => ONLINE_STAV.uzivatele.some(u => u.email === 'obchodnik@engineers-cz.cz' && u.role === 'Obchodník')));
test('založení potvrzuje hláška přímo v panelu a nový řádek v tabulce',
  (await nastav()).includes('je založený') && (await nastav()).includes('obchodnik@engineers-cz.cz'));
test('po úspěchu se formulář vyprázdnil',
  await page.evaluate(() => document.getElementById('onlineUzEmail').value === ''
    && document.getElementById('onlineUzHeslo').value === ''));
test('opakované založení téhož účtu řekne důvod (účet už existuje)', await (async () => {
  await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
  await page.fill('#onlineUzHeslo', 'JinaHesla123');
  await page.click('#nastaveni-panel >> text=Založit účet');
  await page.waitForTimeout(400);
  return (await nastav()).includes('Účet už existuje');
})());
await page.evaluate(() => { ONLINE_STAV.uzForm = { email: '', jmeno: '', role: 'Obchodník', heslo: '' }; zavriNastaveni(); });

/* ---- 7) záloha ke stažení ---- */
const [stazeni] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(() => onlineZaloha(false)),
]);
test('záloha se stáhne pod jménem s dnešním datem',
  stazeni.suggestedFilename() === 'zaloha_online_' + new Date().toISOString().slice(0, 10) + '.json');

/* ---- 8) relace přežije obnovení stránky ---- */
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } },
  null, { timeout: 8000 });
await page.waitForTimeout(400);
test('po obnovení stránky je administrátor dál přihlášený a stránka se neukázala',
  !(await gateViditelna()) && await page.evaluate(() => ONLINE_STAV.ja.email === 'vendl.jaroslav@engineers-cz.cz'));
test('platný ceník se po obnovení načetl a nasadil sám',
  await page.evaluate(() => ONLINE_STAV.db.platny.verze === 1 && ONLINE_STAV.cenikPouzit === true));

/* ---- 9) odhlášení → přihlašovací stránka; obchodník a jeho pohled ---- */
await page.evaluate(() => onlineOdhlas());
await page.waitForFunction(() => { try { return ONLINE_STAV.ja === null; } catch (e) { return false; } });
await page.waitForTimeout(300);
test('po odhlášení se vrátí přihlašovací stránka', await gateViditelna());

await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo1');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
await page.waitForTimeout(400);
test('obchodník je přihlášený a roh to říká',
  (await roh()).includes('Zkušební Obchodník') && (await roh()).includes('Obchodník'));
test('obchodník NENÍ administrátor aplikace',
  await page.evaluate(() => NAST.jeAdmin === false));
await page.evaluate(() => prepniTab('zakazka'));
const stranka = await page.locator('#page-zakazka').innerHTML();
test('obchodník nevidí kartu složky _DB (mapování jen pro administrátora)',
  !stranka.includes('Databáze zakázek (složka)'));
test('obchodník kartu Online databáze vidí',
  stranka.includes('Online databáze (schaftscalc.netlify.app)'));

/* ---- 10) změna vlastního hesla přes okno v rohu ---- */
await page.evaluate(() => otevriZmenaHesla());
await page.waitForTimeout(200);
await page.fill('#hesloStare', 'ObchodniHeslo1');
await page.fill('#hesloNove', 'ObchodniHeslo2');
await page.fill('#hesloNove2', 'ObchodniHeslo2');
await page.evaluate(() => onlineZmenHeslo());
await page.waitForTimeout(400);
test('změna vlastního hesla proběhla',
  await page.evaluate(() => ONLINE_STAV.hlaska.includes('Heslo je změněné')));
await page.evaluate(() => onlineOdhlas());
await page.waitForFunction(() => { try { return ONLINE_STAV.ja === null; } catch (e) { return false; } });
await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo1');
test('staré heslo už neplatí', (await gate()).includes('Nesprávný e-mail nebo heslo'));
await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo2');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
test('novým heslem se obchodník přihlásí', !(await gateViditelna()));

/* ---- 11) čistá konzole ---- */
test('za celý průchod nevznikla nečekaná chyba v konzoli', chyby.length === 0, chyby);

await prohlizec.close();
server.close();
console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
