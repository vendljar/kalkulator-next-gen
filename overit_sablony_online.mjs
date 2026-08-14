/* Ověření v prohlížeči: CENTRÁLNÍ ŠABLONY DOKUMENTŮ (#139, 13. 8. 2026)
 *
 * Jednotkové testy hlídají rejstřík (src/test_sablony_online.js) a serverovou
 * funkci (netlify/test_funkce.mjs, test_prava.mjs). Tenhle harness hlídá to,
 * co z nich vidět není: SKUTEČNÝ klient proti SKUTEČNÉMU serverovému kódu —
 * že administrátor šablonu zveřejní z obrazovky Nastavení, že obchodníkovi
 * se z ní opravdu vygeneruje Word, že v PŘÍSNÉM režimu bez serverové šablony
 * žádný dokument nevznikne a že v MĚKKÉM režimu tisk z místního souboru
 * dostane razítko do zámku varianty.
 *
 * Stavba stejná jako overit_online.mjs: aplikace přes lokální http server,
 * /api/* se předává OPRAVDOVÝM funkcím z netlify/functions s pamětovým
 * úložištěm. Žádný mock chování.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_sablony_online.mjs
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
import sablonyFn from './netlify/functions/sablony.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { zipPrecti } = require('/home/claude/work/kng/src/docxgen.js');

const FUNKCE = {
  '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/odhlaseni': odhlaseni, '/api/uzivatele': uzivatele,
  '/api/program': program, '/api/zakazky': zakazky, '/api/zaloha': zaloha,
  '/api/firma': firma, '/api/zobrazeni': zobrazeni,
  '/api/zaloha_vynuceno': zalohaVynuceno, '/api/sablony': sablonyFn,
};

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n, info === undefined ? '' : JSON.stringify(info)); }
};

const html = readFileSync('dist/kalkulacka.html');
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
  if (m.type() === 'error' && !/status of (400|401|403|404|409)/.test(t)) chyby.push('console: ' + t);
});
page.on('pageerror', e => chyby.push('pageerror: ' + e.message));
page.on('dialog', d => (d.type() === 'prompt' ? d.accept('zkušební zveřejnění') : d.accept()));

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
await page.waitForTimeout(300);
await page.fill('#onlineEmail', 'vendl.jaroslav@engineers-cz.cz');
await page.fill('#onlineHeslo', 'Zkusebni.Heslo.123');
await page.click('#prihlaseni-box >> text=Přihlásit');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
await page.waitForTimeout(400);

/* Zkušební ceník, ať má nabídka co počítat (zábrana ukázkového ceníku). */
const ZC = require('/home/claude/work/kng/src/zkusebni_cenik.js');
await page.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta();
  Object.assign(ZAK.projHlavicka, { cislo: '2026 OVP CN 0177', objednatel: 'SVJ Harness 1',
    kontakt: 'Ing. Test', adresa: 'Zkušební 1, Praha', nazevAkce: 'Harness šablon' });
  render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await page.waitForTimeout(200);

/* ---------- 1) výchozí stav: přísný režim, žádná šablona ---------- */
console.log('\npřísný režim bez zveřejněné šablony');
test('po přihlášení se načetl rejstřík šablon',
  await page.evaluate(() => ONLINE_STAV.sablonyRejstrik !== null && ONLINE_STAV.sablonyRejstrik !== undefined));
test('výchozí režim je přísný', await page.evaluate(() => onlineSablonyRezim() === 'prisny'));

const odmitnuti = await page.evaluate(() =>
  sablonaProTisk('nabidkaProj', 'cz').then(() => 'prošlo', e => e.message));
test('tisk Wordu se v přísném režimu bez serverové šablony odmítne',
  odmitnuti !== 'prošlo' && /přísném režimu/i.test(odmitnuti), odmitnuti);
test('odmítnutí říká, kdo to napraví (administrátor)',
  /administrátor/i.test(odmitnuti), odmitnuti);

/* ---------- 2) administrátor zveřejní šablonu ---------- */
console.log('\nzveřejnění šablony administrátorem');
const sablonaB64 = readFileSync('/home/claude/work/sablona_proj/Sablona_NABIDKA_PROJ.docx').toString('base64');
const zverejneni = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  SABLONY.nabidkaProj = { nazev: 'Sablona_NABIDKA_PROJ.docx', data: u8.buffer };
  const o = await onlineSablonaZverejni('nabidkaProj', 'Sablona_NABIDKA_PROJ.docx', u8.buffer, 'harness');
  return { verze: o.verze, meta: onlineSablonaMeta('nabidkaProj') };
}, sablonaB64);
test('zveřejnění vrátilo verzi 1', zverejneni.verze === 1, zverejneni);
test('rejstřík v aplikaci hned zná platnou verzi',
  zverejneni.meta && zverejneni.meta.verze === 1 && zverejneni.meta.zverejnil === 'vendl.jaroslav@engineers-cz.cz');
test('obrazovka Nastavení → Šablony verzi ukazuje',
  await page.evaluate(() => /Na serveru: verze 1/.test(nastSablony())));
test('obrazovka nabízí přepínač režimu',
  await page.evaluate(() => /PŘÍSNÝ|MĚKKÝ/.test(nastSablony())));

/* ---------- 3) obchodní cesta: Word ze serverové šablony ---------- */
console.log('\ngenerování Wordu ze serverové šablony');
const vysledek = await page.evaluate(async () => {
  delete SABLONY.nabidkaProj;                      // místní kopie pryč — čerpat se MUSÍ ze serveru
  const srv = await sablonaProTisk('nabidkaProj', 'cz');
  const varianta = aktivniVarianta(ZAK);
  const res = await dokumentVygeneruj('nabidkaProj', srv.data.slice(0), ZAK, varianta, JEKLY, 'cz');
  const bajty = new Uint8Array(await res.blob.arrayBuffer());
  let s = ''; for (let i = 0; i < bajty.length; i++) s += String.fromCharCode(bajty[i]);
  const z = zamekPoTisku('nabidkaProj', varianta.id,
    { zdroj: 'server', typ: srv.typ, verze: srv.verze, otisk: srv.otisk, nazev: srv.nazev });
  return { zdroj: srv.zdroj, verze: srv.verze, nazev: srv.nazev, docx: btoa(s),
           zamek: z && z.tisky[z.tisky.length - 1].sablona };
});
test('šablona přišla ze serveru', vysledek.zdroj === 'server' && vysledek.verze === 1);
test('jméno souboru šablony se neslo s ní', vysledek.nazev === 'Sablona_NABIDKA_PROJ.docx');
const casti = await zipPrecti(new Uint8Array(Buffer.from(vysledek.docx, 'base64')));
const doc = new TextDecoder().decode(casti.find(x => x.nazev === 'word/document.xml').data);
test('dokument je vyplněný (hlavička PROJ)', doc.includes('SVJ Harness 1'));
test('v dokumentu nezůstal žádný symbol {{…}}', !/\{\{[A-Z0-9_]+\}\}/.test(doc));
test('zámek varianty nese razítko serverové šablony (verze i otisk)',
  vysledek.zamek && vysledek.zamek.zdroj === 'server' && vysledek.zamek.verze === 1
  && !!vysledek.zamek.otisk, vysledek.zamek);

/* ---------- 4) měkký režim: místní soubor s razítkem ---------- */
console.log('\nměkký režim');
await page.evaluate(() => onlineSablonyRezimNastav('mekky'));
await page.waitForTimeout(200);
test('režim se přepnul', await page.evaluate(() => onlineSablonyRezim() === 'mekky'));
const mekky = await page.evaluate(async () => {
  /* Server šablonu MÁ — i v měkkém režimu má přednost. Vyzkouší se proto typ,
   * který na serveru není (nabidka OCK): v přísném by spadl, v měkkém vrátí
   * null = „pokračuj místní cestou". */
  const bezServeru = await sablonaProTisk('nabidka', 'cz');
  const seServerem = await sablonaProTisk('nabidkaProj', 'cz');
  return { bezServeru, seServeremZdroj: seServerem && seServerem.zdroj };
});
test('typ bez serverové šablony se v měkkém režimu pustí místní cestou',
  mekky.bezServeru === null);
test('typ SE serverovou šablonou ji používá i v měkkém režimu',
  mekky.seServeremZdroj === 'server');
/* a zpátky přísný — měkký je výjimka, ne stav */
await page.evaluate(() => onlineSablonyRezimNastav('prisny'));
test('návrat do přísného režimu', await page.evaluate(() => onlineSablonyRezim() === 'prisny'));
const znovuOdmitnuti = await page.evaluate(() =>
  sablonaProTisk('nabidka', 'cz').then(() => 'prošlo', e => e.message));
test('po návratu se typ bez šablony zase odmítá', /přísném režimu/.test(znovuOdmitnuti));

/* ---------- 5) záloha nese šablony ---------- */
console.log('\nzáloha');
const zal = await page.evaluate(() => onlineApi('/api/zaloha').then(o => ({
  maSablony: !!(o.zaloha.sablony && o.zaloha.sablony.rejstrik),
  verze: o.zaloha.sablony && o.zaloha.sablony.rejstrik.typy.nabidkaProj.platna.verze,
  souborOk: !!(o.zaloha.sablony && o.zaloha.sablony['data/nabidkaProj/1']
    && o.zaloha.sablony['data/nabidkaProj/1'].data.indexOf('UEsDB') === 0),
})));
test('záloha ke stažení nese rejstřík šablon', zal.maSablony && zal.verze === 1);
test('záloha nese i samotný soubor šablony', zal.souborOk);

test('konzole zůstala čistá', chyby.length === 0, chyby.slice(0, 3));

await prohlizec.close();
server.close();
console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
