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
await dlgStub(page);
};

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(500);

await dlgStub(page);

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

await page.evaluate(() => { window.__dlgTexty = []; });
await page.evaluate(() => onlineZverejniZobrazeni());
await page.waitForTimeout(800);
poslednihlaska = await dlgPosledni(page);
test('zveřejnění se administrátora nejdřív zeptá', /Zveřejnit/.test(poslednihlaska), poslednihlaska);
test('zveřejnění poslalo matici na server',
  volani.includes('POST /api/zobrazeni'), volani.join(', '));
test('server matici přijal a vrátil ji zpět',
  await page.evaluate(() => !!(ONLINE_STAV.zobrazeni && ONLINE_STAV.zobrazeni.matice
    && ONLINE_STAV.zobrazeni.matice['tab.detail']['Obchodník'] === true)));
test('u zveřejnění se pamatuje, kdo a kdy',
  await page.evaluate(() => !!(ONLINE_STAV.zobrazeni.kdo && ONLINE_STAV.zobrazeni.kdy)));

/* ---------- 3z) automatické ukládání matice (22. 8. 2026) ----------
 *
 * Hlášeno J. V.: „neukládají se nám zobrazení v nastavení, při novém buildu
 * se zaškrtnutí resetuje." Příčina: zaškrtnutí žilo jen v paměti prohlížeče
 * a na server šlo teprve tlačítkem. Matice se ale při každém přihlášení bere
 * ze serveru, takže neuložená volba nemá kde přežít. Tady se hlídá, že
 * zaškrtnutí samo doputuje na server BEZ jakéhokoli tlačítka. */

const pocetZapisu = () => volani.filter(x => x === 'POST /api/zobrazeni').length;
/* Čeká se na DOBĚHNUTÍ zápisu, ne na pevný počet milisekund — pod zátěží
 * (šest prohlížečů naráz) se pevná prodleva občas netrefila a test padal,
 * i když samoukládání fungovalo. */
const cekejUlozeno = () => page.waitForFunction(
  () => { try { return ZOBR_ULOZ.stav === 'ulozeno'; } catch (e) { return false; } },
  null, { timeout: 15000 });
const predSamoulozenim = pocetZapisu();
await page.evaluate(() => { ZOBR_ULOZ.stav = ''; zobrSet('tab.kryci', 'Vedoucí', true); });
await cekejUlozeno();
test('zaškrtnutí se uloží samo, bez tlačítka',
  pocetZapisu() > predSamoulozenim, 'zápisů: ' + predSamoulozenim + ' → ' + pocetZapisu());
test('server má i to, co se uložilo samo',
  await page.evaluate(() => (ONLINE_STAV.zobrazeni.matice['tab.kryci'] || {})['Vedoucí'] === true));
test('panel dá vědět, že je uloženo',
  (await page.locator('#nastaveni-panel').innerText()).includes('Uloženo online'));

/* Proklikání víc políček za sebou = JEDEN zápis, ne pět. Bez toho by se při
 * skládání matice poslalo na server dvacet dotazů po sobě. */
const predDavkou = pocetZapisu();
await page.evaluate(() => {
  ZOBR_ULOZ.stav = '';
  zobrSet('tab.proj', 'Vedoucí', true);
  zobrSet('tab.detailproj', 'Vedoucí', true);
  zobrSet('tab.kryciproj', 'Vedoucí', true);
});
await cekejUlozeno();
await page.waitForTimeout(300);   // kdyby se chystal druhý zápis, tady by se projevil
test('rychlé proklikání víc políček je jeden zápis',
  pocetZapisu() === predDavkou + 1, 'zápisů: ' + (pocetZapisu() - predDavkou));
test('uložilo se všechno proklikané',
  await page.evaluate(() => ['tab.proj', 'tab.detailproj', 'tab.kryciproj']
    .every(k => (ONLINE_STAV.zobrazeni.matice[k] || {})['Vedoucí'] === true)));

/* ---------- 3b) režimy sekcí kalkulace + přidávání položek (19. 8. 2026) ----------
 *
 * Administrátor u každé sekce OCK i PROJ volí selectem zobrazit / skrýt /
 * srolovat; volba se ukládá na server HNED (bez potvrzovacího okna) a řídí,
 * jak sekci uvidí obchodník. Admin vidí vždy vše. Vedle toho má každá sekce
 * dvě přidávací tlačítka: „+ přidat položku" (i obchodník — právo
 * kalk.pridatPolozku) a „+ přidat položku trvale" (jen admin). */

test('admin má v nadpisu sekce OCK select režimu',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    const el = document.getElementById('ock-sek-rezie');
    return !!el && el.innerHTML.includes('sekceRezimSet') && el.innerHTML.includes('srolovat');
  }));
/* Od 1. 9. 2026 zůstává v kalkulaci JEN „+ přidat položku" (řádek téhle
 * zakázky); trvalé položky se zakládají v ceníku. Atypická zmizela 20. 8. */
test('admin má u sekce OCK jen „+ přidat položku" (trvalá i atypická jsou pryč)',
  await page.evaluate(() => {
    const html = document.getElementById('page-kalk').innerHTML;
    return html.includes('+ přidat položku<') && !html.includes('+ přidat položku trvale')
      && !html.includes('+ přidat atypickou položku');
  }));
test('admin má select i u sekcí PROJ, ale bez tlačítek „… trvale"',
  await page.evaluate(() => {
    prepniTab('proj'); render();
    const html = document.getElementById('page-proj').innerHTML;
    return html.includes('sekceRezimSet') && !html.includes('položku trvale')
      && html.includes('+ přidat hodinovou položku') && html.includes('+ přidat fixní položku');
  }));
test('trvalé položky projekce mají místo v ceníku PROJ',
  await page.evaluate(() => {
    prepniTab('cenikproj'); render();
    const html = document.getElementById('page-cenikproj').innerHTML;
    /* Od 1. 9. 2026 jsou sekce projekce ROVNOU v tabulce ceníku (jako v OCK),
     * ne v samostatné kartě — kontroluje se tedy tlačítko i to, že sedí uvnitř
     * téže tabulky jako ceníkové řádky. */
    const tb = document.querySelector('#page-cenikproj .ceniktbl');
    return /cenikProjTrvaleAdd\(/.test(html) && !!tb && /cenikProjTrvaleAdd\(/.test(tb.innerHTML)
      && /přidat trvalou hodinovou položku/.test(tb.innerHTML);
  }));

/* volba se uloží na server okamžitě (žádné potvrzovací okno) */
await page.evaluate(() => { sekceRezimSet('ock.rezie', 'skryt'); });
await page.waitForTimeout(400);
await page.evaluate(() => { sekceRezimSet('proj.zamereni', 'srolovat'); });
await page.waitForTimeout(400);
test('volby sekcí odešly na server hned',
  volani.filter(x => x === 'POST /api/zobrazeni').length >= 3, volani.join(', '));
test('server volby sekcí přijal a vrací je v matici',
  await page.evaluate(() => !!(ONLINE_STAV.zobrazeni && ONLINE_STAV.zobrazeni.matice.sekce
    && ONLINE_STAV.zobrazeni.matice.sekce['ock.rezie'] === 'skryt'
    && ONLINE_STAV.zobrazeni.matice.sekce['proj.zamereni'] === 'srolovat')));
/* 20. 8. 2026 (zadání J. V. „když nastavím srolování sekce, sroluj ji i u mě"):
 * SROLOVÁNÍ platí i pro administrátora, SKRYTÍ ne — skrytou sekci vidí dál jen
 * on, protože v jejím nadpisu je jediný ovládací prvek, kterým jde skrytí
 * vrátit. Že je skrytá ostatním, mu říká štítek. */
test('administrátorovi se skrytá sekce dál kreslí (jinak by ji nešlo vrátit)',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    return !!document.getElementById('ock-sek-rezie');
  }));
test('a nese štítek „skrytá ostatním", ať si admin nemyslí, že ji vidí i obchodník',
  await page.evaluate(() => {
    const el = document.getElementById('ock-sek-rezie');
    return !!el && el.innerHTML.includes('skrytá ostatním');
  }));
test('srolovaná sekce se sroluje i administrátorovi (řádky sekce zmizí, zůstane nadpis)',
  await page.evaluate(() => {
    sekceRezimSet('ock.rezie', 'srolovat');
    prepniTab('kalk'); render();
    const html = document.getElementById('page-kalk').innerHTML;
    const hlava = !!document.getElementById('ock-sek-rezie');
    /* v srolované sekci nesmí být řádek s přidávacím tlačítkem té sekce */
    const bezRadku = !/onclick="vlastniAdd\('rezie'\)"/.test(html);
    const rozbalit = document.getElementById('ock-sek-rezie').innerHTML.includes('sekceRozbal');
    return hlava && bezRadku && rozbalit;
  }));
test('a jde rozbalit — po kliknutí jsou řádky zase vidět',
  await page.evaluate(() => {
    sekceRozbal('ock.rezie');
    const html = document.getElementById('page-kalk').innerHTML;
    return /onclick="vlastniAdd\('rezie'\)"/.test(html);
  }));
await page.evaluate(() => { sekceRezimSet('ock.rezie', 'skryt'); });
await page.waitForTimeout(400);

/* ---------- režim i u KARET, ne jen u sekcí tabulky (20. 8. 2026) ----------
 * „Příplatkové položky" a „Detail mezivýpočtů" jsou z pohledu obchodníka
 * stejné bloky jako sekce kalkulace, ale volbu zobrazit/skrýt/srolovat
 * neměly (dotaz J. V.). Teď ji mají přes kartaRezim(). */
test('karty Příplatkové položky i Detail mezivýpočtů mají select režimu',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    const p = document.getElementById('ock-priplatky');
    const d = document.getElementById('ock-detail');
    return !!p && !!d && p.innerHTML.includes("sekceRezimSet('ock.priplatky'")
      && d.innerHTML.includes("sekceRezimSet('ock.detailMezivypoctu'");
  }));
test('srolování karty ji zavře (třída closed) a jde rozbalit',
  await page.evaluate(() => {
    sekceRezimSet('ock.priplatky', 'srolovat');
    prepniTab('kalk'); render();
    const zavrena = document.getElementById('ock-priplatky').classList.contains('closed');
    sekceRozbal('ock.priplatky');
    const otevrena = !document.getElementById('ock-priplatky').classList.contains('closed');
    sekceRezimSet('ock.priplatky', 'zobrazit');
    return zavrena && otevrena;
  }));

/* ---------- tisková tlačítka krycích listů (20. 8. 2026) ----------
 * Přestěhovala se dolů nad smlouvu, Word zmizel z obrazovky (funkce zůstala)
 * a obě PDF cesty jsou modré. */
test('krycí list OCK: PDF tlačítka jsou modrá, Word už tlačítko nemá',
  await page.evaluate(() => {
    prepniTab('kryci'); if (typeof renderKryci === 'function') renderKryci();
    const h = document.getElementById('page-kryci').innerHTML;
    return /class="primary"[^>]*onclick="kryciTiskPohled\('bo'\)"/.test(h)
      && /class="primary"[^>]*onclick="kryciTiskPohled\('techdata'\)"/.test(h)
      && !h.includes('kryciWord()') && typeof kryciWord === 'function';
  }));
test('a stojí až NAD sekcí se smlouvou o dílo',
  await page.evaluate(() => {
    const h = document.getElementById('page-kryci').innerHTML;
    return h.indexOf("kryciTiskPohled('bo')") < h.indexOf('Smlouva o dílo (OCK)');
  }));
test('krycí list PROJ: totéž',
  await page.evaluate(() => {
    prepniTab('kryciproj'); if (typeof renderKryciProj === 'function') renderKryciProj();
    const h = document.getElementById('page-kryciproj').innerHTML;
    return /class="primary"[^>]*onclick="kryciProjTiskPohled\('bo'\)"/.test(h)
      && !h.includes('kryciProjWord()') && typeof kryciProjWord === 'function'
      && h.indexOf("kryciProjTiskPohled('bo')") < h.indexOf('Smlouva o dílo a plná moc (PROJ)');
  }));
test('krycí listy mluví o ZÁKAZNÍKOVI, ne o objednateli (objednatel je pojem smluvní)',
  await page.evaluate(() => {
    const h = document.getElementById('page-kryciproj').innerHTML;
    prepniTab('kryci'); if (typeof renderKryci === 'function') renderKryci();
    const o = document.getElementById('page-kryci').innerHTML;
    const bezObjednatele = x => !/objednatel/i.test(x.replace(/OBJEDNATEL_[A-Z_]+/g, ''));
    return bezObjednatele(h) && bezObjednatele(o)
      && o.includes('Adresa (sídlo) zákazníka') && o.includes('Zástupci a kontakty zákazníka');
  }));
test('telefon a e-mail mají všude vlastní pole (žádný slepenec „tel / mail")',
  await page.evaluate(() => {
    const h = document.getElementById('page-kryci').innerHTML;
    return h.includes('ZAK.zastupci.technickyTel') && h.includes('ZAK.zastupci.technickyEmail')
      && h.includes('ZAK.zastupci.smluvniPozice');
  }));

/* ---------- Standard OCK (#163, 21. 8. 2026) ----------
 * Kontrola nic neblokuje, takže se její chyba pozná jen tichým „zeleno"
 * tam, kde má být červená. Sada hlídá cestu od vypínače po štítek. */
test('vypnutá kontrola (výchozí stav) nekreslí žádný štítek',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    return NAST.standard.zapnuto === false
      && !document.querySelector('.kalk-lista .std-pill');
  }));
test('zapnutá kontrola štítek ukáže a pozná atyp',
  await page.evaluate(() => {
    NAST.standard.zapnuto = true;
    Z.typSachty = 'exteriérová'; Z.hloubka = 2.48; Z.profily.sloupek.dim = '80x80';
    render();
    const p = document.querySelector('.kalk-lista .std-pill');
    return !!p && /ATYP OCK/.test(p.textContent) && p.className.includes('atyp');
  }));
test('rozpis se rozbalí a vypíše limit i zadanou hodnotu',
  await page.evaluate(() => {
    standardRozpisPrepni();
    const t = (document.querySelector('.std-panel') || {}).textContent || '';
    return /max 2000 mm/.test(t) && /2480 mm/.test(t);
  }));
test('u atypu nabídne zapnout přirážku',
  await page.evaluate(() => {
    const t = (document.querySelector('.std-panel') || {}).textContent || '';
    return /Zapnout ATYP a přirážku/.test(t);
  }));

/* ---------- ATYP se u nestandardní šachty zaškrtne sám (21. 8. 2026 večer) --
 * Zadání J. V. Je to vědomý ústup od původního „přirážku zapíná vždycky
 * člověk", takže se hlídají všechny tři pojistky: automat běží jen při
 * změně zadání (ne při každém vykreslení), respektuje ruční odškrtnutí
 * a nikdy nic nevypíná. */
test('změna zadání mimo standard zaškrtne ATYP sama',
  await page.evaluate(() => {
    Z.atyp = false; delete Z.atypRucneVypnut;
    Z.hloubka = 1.515; render();
    set('Z.hloubka', 2.48);          // přes set(), jako by to napsal člověk
    return Z.atyp === true;
  }));
test('ruční odškrtnutí automat respektuje',
  await page.evaluate(() => {
    atypPrepni(false);               // člověk říká „vím o tom"
    const znacka = Z.atypRucneVypnut === true;
    set('Z.hloubka', 2.49);          // další změna zadání
    return znacka && Z.atyp === false;
  }));
test('návrat do standardu značku zruší a příští odchylka zase zabere',
  await page.evaluate(() => {
    set('Z.hloubka', 1.9);           // zpátky ve standardu
    const zruseno = !Z.atypRucneVypnut;
    set('Z.hloubka', 2.48);
    return zruseno && Z.atyp === true;
  }));
test('když potřeba atypu pomine, automat svoje zaškrtnutí zase vypne',
  await page.evaluate(() => {
    Z.atyp = false; delete Z.atypRucneVypnut; delete Z.atypAutomat;
    set('Z.hloubka', 2.48);                    // mimo standard → zapne se
    const zapnuto = Z.atyp === true && Z.atypAutomat === true;
    set('Z.hloubka', 1.9);                     // zpátky ve standardu
    return zapnuto && Z.atyp === false && !Z.atypAutomat;
  }));
test('ručně zaškrtnutý ATYP ale automat nikdy nevypne',
  await page.evaluate(() => {
    Z.atyp = false; delete Z.atypRucneVypnut; delete Z.atypAutomat;
    atypPrepni(true);                          // člověk, ne automat
    set('Z.hloubka', 1.91);                    // šachta je ve standardu
    const drzi = Z.atyp === true;
    atypPrepni(false); delete Z.atypRucneVypnut;
    return drzi;
  }));
test('vypnutá kontrola ATYP nezapíná',
  await page.evaluate(() => {
    NAST.standard.zapnuto = false;
    Z.atyp = false; delete Z.atypRucneVypnut;
    set('Z.hloubka', 2.6);
    const klid = Z.atyp === false;
    NAST.standard.zapnuto = true; Z.atyp = false; delete Z.atypRucneVypnut;
    return klid;
  }));
/* Ve výchozím zadání jsou v nabídce DVĚ skla (VSG i SKN) — to je „nelze
 * posoudit", ne standard. Pro zkoušku zelené se jedno vyškrtne ze sloupce
 * Nabídka, ať zbyde jeden druh zasklení. */
test('standardní šachta má zelený štítek',
  await page.evaluate(() => {
    Z.hloubka = 1.9; Z.priplatkyVynechat = ['skn']; render();
    const p = document.querySelector('.kalk-lista .std-pill');
    return !!p && /STANDARD OCK/.test(p.textContent) && p.className.includes('ok');
  }));
test('můstek bez rozměrů hlásí „nelze posoudit", ne atyp',
  await page.evaluate(() => {
    Z.mustek = true; render();
    const p = document.querySelector('.kalk-lista .std-pill');
    return !!p && /NELZE POSOUDIT/.test(p.textContent) && p.className.includes('nejisto');
  }));
test('rozměry můstku se v zadání ptají, teprve když můstek je',
  await page.evaluate(() => {
    const s = document.getElementById('page-kalk').innerHTML;
    Z.mustek = false; render();
    const bez = document.getElementById('page-kalk').innerHTML;
    return s.includes('Z.mustekHloubkaMm') && !bez.includes('Z.mustekHloubkaMm');
  }));
test('štítek je i v technické specifikaci',
  await page.evaluate(() => {
    prepniTab('spec'); renderTechspec();
    return !!document.querySelector('#page-spec .std-pill');
  }));
test('do vytištěné specifikace štítek nejde (noprint)',
  await page.evaluate(() => {
    const p = document.querySelector('#page-spec .std-pill');
    return !!p && p.closest('.noprint') !== null;
  }));
test('stav nabídky je v tlačítkové liště a je to celá věta',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    const p = document.querySelector('.kalk-lista .stav-pill');
    prepniTab('proj'); render();
    const pp = document.querySelector('#page-proj .kalk-lista .stav-pill');
    return !!p && /Nabídka aktivní/.test(p.textContent)
      && !!pp && /Nabídka aktivní/.test(pp.textContent);
  }));
/* ---------- Nastavení → Standard OCK po úklidu (21. 8. 2026 večer) ----------
 * Zadání J. V.: „sjednoť vizuál nastavení standardu OCK podle vnitřní
 * šachty, ve standardu interiér nám chybí ještě sklo do rámečků, do
 * standardu exteriér přesuň sekci můstky a označ pole, která zatím
 * nehlídáme." */
const std = await page.evaluate(() => {
  NAST.jeAdmin = true;
  otevriNastaveni(); nastPanel('standard');
  const el = document.getElementById('nastaveni-panel');
  const html = el ? el.innerHTML : '';
  const nadpisy = [...el.querySelectorAll('.sec-title')].map(x => x.textContent.trim());
  const tabulek = el.querySelectorAll('table.sd-tbl').length;
  const iExt = nadpisy.findIndex(x => /^Exteriér/.test(x));
  const iMustek = nadpisy.findIndex(x => /Můstek/.test(x));
  const iInt = nadpisy.findIndex(x => /^Interiér/.test(x));
  zavriNastaveni();
  return { nadpisy, tabulek, iExt, iMustek, iInt,
    nehlidame: (html.match(/zatím nehlídáme/g) || []).length,
    bezPopisu: !/Popis opláštění/i.test(html) && !/>Opláštění\s*</.test(html),
    zaskleniBloku: (html.match(/Povolené způsoby\s*\n?\s*zasklení/g) || []).length
      || (html.match(/zasklívací terče na profily/g) || []).length,
    ramecek: /sklo do rámečku/i.test(html),
    ramecekZaskrtnuty: (NAST.standard.interier.zaskleniPovolene || []).indexOf('mezi příčníky') >= 0 };
});
test('exteriér i interiér mají stejnou tabulku limitů po profilech',
  std.tabulek === 2, JSON.stringify(std.nadpisy));
test('sekce Můstek stojí u exteriéru, ne za interiérem',
  std.iExt >= 0 && std.iMustek === std.iExt + 1 && std.iInt > std.iMustek,
  JSON.stringify(std.nadpisy));
/* Po úklidu 21. 8. večer zbylo jediné takové pole: konstrukční řešení
 * můstku. Popisná pole „Opláštění" z nastavení zmizela úplně — nikde se
 * nekontrolovala a jen budila dojem, že se podle nich něco hlídá. */
test('pole, které se nehlídá, je označené', std.nehlidame === 1, String(std.nehlidame));
test('popisná pole opláštění z nastavení zmizela', std.bezPopisu, String(std.bezPopisu));
test('sklo do rámečku je ve standardu interiéru a je zaškrtnuté',
  std.ramecek && std.ramecekZaskrtnuty);
test('povolené způsoby zasklení se zadávají v OBOU větvích stejně',
  std.zaskleniBloku === 2, String(std.zaskleniBloku));
test('a šachta se sklem do rámečku projde jako standard',
  await page.evaluate(() => {
    prepniTab('kalk');
    Z.typSachty = 'interiérová'; Z.profily.sloupek.dim = '80x50';
    Z.hloubka = 1.5; Z.sirka = 1.5; Z.mustek = false;
    Z.atyp = false; delete Z.atypRucneVypnut;
    set('Z.zaskleni', 'mezi příčníky');
    const p = document.querySelector('.kalk-lista .std-pill');
    return !!p && /STANDARD OCK/.test(p.textContent);
  }));

await page.evaluate(() => {
  NAST.standard.zapnuto = false; Z.typSachty = 'exteriérová'; Z.zaskleni = 'na terče';
  Z.profily.sloupek.dim = '80x80'; Z.hloubka = 1.515; Z.sirka = 1.51;
  Z.atyp = false; delete Z.atypRucneVypnut; Z.mustek = false; render();
});

/* ---------- volitelné položky: co smí obchodník (nález J. V. 20. 8. 2026) ----------
 * Obchodník tu neměl zaškrtávátka a viděl JEN položky, které už zahrnuté
 * byly — nemohl tedy žádnou přidat ani ubrat. Zahrnutí je přitom JEHO volba
 * (levé zaškrtávátko); co vůbec smí vidět, řídí sloupec Viditelné vpravo. */
test('obchodník vidí všechny NESKRYTÉ volitelné položky, ne jen zahrnuté',
  await page.evaluate(() => {
    NAST.jeAdmin = true; NAST.nahledRole = ''; prepniTab('kalk'); render();
    const vsech = document.querySelectorAll('#page-kalk tr').length;
    const r = vypocet(Z, C, JEKLY, OCK.fixes);
    const pocetKatalogu = r.volitelneKatalog.filter(x => !x.vlastni).length;
    const zahrnutych = r.volitelneKatalog.filter(x => x.zahrnuto).length;
    NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
    const html = document.getElementById('page-kalk').innerHTML;
    const sekce = html.slice(html.indexOf('ock-sek-volitelne'), html.indexOf('VOLITELNÉ CELKEM'));
    const chk = (sekce.match(/volitelneToggle/g) || []).length;
    NAST.jeAdmin = true; NAST.nahledRole = ''; render();
    return vsech > 0 && zahrnutych < pocetKatalogu && chk === pocetKatalogu;
  }));
/* Ukazatele Náklad / Hrubý zisk / Marže v hlavičce řídí právo `kpi.marze`,
 * NE `sloupce.naklad` (oprava 22. 8. 2026 večer — J. V. je v náhledu
 * obchodníka viděl, protože obchodník má sloupce nákladů kvůli přirážce). */
test('obchodník se sloupci nákladů, ale bez kpi.marze, ukazatele v hlavičce NEVIDÍ',
  await page.evaluate(() => {
    try {
      NAST.jeAdmin = true; NAST.nahledRole = '';
      zobrSet('sloupce.naklad', 'Obchodník', true);
      zobrSet('kpi.marze', 'Obchodník', false);
      NAST.kpiViditelne = { naklad: false, hrubyZisk: false, sleva: false, marze: false };
      NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; prepniTab('kalk'); render();
      const h = document.getElementById('page-kalk').innerText;
      window.__kpi1 = { zakl: /Základní cena/i.test(h), hz: /Hrubý zisk/i.test(h), smiN: smiZobrazit('sloupce.naklad'), smiK: smiZobrazit('kpi.marze') };
      return window.__kpi1.zakl && !window.__kpi1.hz && window.__kpi1.smiN && !window.__kpi1.smiK;
    } catch (e) { window.__kpi1 = String(e); return false; }
    finally { NAST.jeAdmin = true; NAST.nahledRole = ''; render(); }
  }), await page.evaluate(() => JSON.stringify(window.__kpi1)));
test('po přidělení kpi.marze obchodník ukazatele vidí; bez přidělení je zase ztratí',
  await page.evaluate(() => {
    try {
      NAST.jeAdmin = true; NAST.nahledRole = '';
      zobrSet('kpi.marze', 'Obchodník', true);
      NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
      const vidi = /Hrubý zisk/i.test(document.getElementById('page-kalk').innerText);
      NAST.jeAdmin = true; NAST.nahledRole = '';
      zobrSet('kpi.marze', 'Obchodník', false);
      NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
      const nevidi = !/Hrubý zisk/i.test(document.getElementById('page-kalk').innerText);
      return vidi && nevidi;
    } catch (e) { return false; }
    finally { NAST.jeAdmin = true; NAST.nahledRole = ''; zobrSet('sloupce.naklad', 'Obchodník', false); render(); }
  }));
test('a sloupce Viditelné / Výchozí u nich obchodník nemá',
  await page.evaluate(() => {
    NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
    const html = document.getElementById('page-kalk').innerHTML;
    const ma = html.includes('viditelnostSet') || html.includes('vychoziPolozkaSet');
    NAST.jeAdmin = true; NAST.nahledRole = ''; render();
    return !ma;
  }));
test('skrytá položka obchodníkovi zmizí i tak (sloupec Viditelné pořád platí)',
  await page.evaluate(() => {
    const r = vypocet(Z, C, JEKLY, OCK.fixes);
    const prvni = r.volitelneKatalog.find(x => !x.vlastni);
    viditelnostSet(prvni.key, false);
    NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
    const html = document.getElementById('page-kalk').innerHTML;
    const sekce = html.slice(html.indexOf('ock-sek-volitelne'), html.indexOf('VOLITELNÉ CELKEM'));
    const chk = (sekce.match(/volitelneToggle/g) || []).length;
    NAST.jeAdmin = true; NAST.nahledRole = '';
    viditelnostSet(prvni.key, true); render();
    return chk === r.volitelneKatalog.filter(x => !x.vlastni).length - 1;
  }));

/* ---------- záložky v matici (nález J. V. 20. 8. 2026) ---------- */
test('každá záložka lišty (kromě domovské) se dá řídit maticí',
  await page.evaluate(() => TABY.filter(x => x !== 'kalk')
    .every(x => !!TAB_ZOBRAZENI_KLIC[x] && !!zobrazeniPrvek(TAB_ZOBRAZENI_KLIC[x])),
    ));
test('v Nastavení → Obecné už druhý seznam záložek není',
  await page.evaluate(() => {
    otevriNastaveni(); nastPanel('obecne');
    const h = document.getElementById('nastaveni-panel').innerHTML;
    zavriNastaveni();
    return !h.includes('nastToggleTab') && h.includes('Přesunuto do záložky');
  }));

/* ---------- úpravy krycích listů z 20. 8. 2026 odpoledne ---------- */
test('„Kontakt stavba" v krycích listech není (je to týž člověk jako technický zástupce)',
  await page.evaluate(() => {
    prepniTab('kryci'); if (typeof renderKryci === 'function') renderKryci();
    const o = document.getElementById('page-kryci').innerHTML;
    prepniTab('kryciproj'); if (typeof renderKryciProj === 'function') renderKryciProj();
    const p = document.getElementById('page-kryciproj').innerHTML;
    return !/Kontakt stavba/.test(o) && !/Kontakt stavba/.test(p);
  }));
test('sekce Podpis se jmenuje Ostatní a má obě „Informováno"',
  await page.evaluate(() => {
    const p = document.getElementById('page-kryciproj').innerHTML;
    prepniTab('kryci'); if (typeof renderKryci === 'function') renderKryci();
    const o = document.getElementById('page-kryci').innerHTML;
    const sedi = h => />Ostatní</.test(h) && !/>Podpis</.test(h)
      && h.includes('Informováno Backoffice') && h.includes('Informováno Technické odd.')
      && h.includes('>Obchodník') && !h.includes('Podpis obchodníka');
    return sedi(o) && sedi(p);
  }));
test('pole Dne se předvyplňuje dnešním datem (datum tisku)',
  await page.evaluate(() => {
    const d = new Date();
    const dva = n => String(n).padStart(2, '0');
    const dnes = d.getFullYear() + '-' + dva(d.getMonth() + 1) + '-' + dva(d.getDate());
    return kryciDnesIso() === dnes
      && kryciData(ZAK, aktivniVarianta(ZAK), JEKLY, 'bo').sekce
           .some(s => s.radky.some(r => r[0] === 'Dne' && r[1] === dnes));
  }));
test('krycí list PROJ má odpovědnou osobu za projekci (vyplňuje obchodník)',
  await page.evaluate(() => {
    prepniTab('kryciproj'); if (typeof renderKryciProj === 'function') renderKryciProj();
    const p = document.getElementById('page-kryciproj').innerHTML;
    return p.includes('Odpovědná osoba za projekci')
      && p.includes('odpovednyTel') && p.includes('odpovednyEmail');
  }));

/* ---------- Nastavení: Smlouvy / Šablony a filtr analytiky ---------- */
test('záložka Nastavení se jmenuje „Smlouvy / Šablony" a začíná standardy a logem',
  await page.evaluate(() => {
    otevriNastaveni(); nastPanel('sablony');
    const panel = document.getElementById('nastaveni-panel').innerHTML;
    const zalozky = [...document.querySelectorAll('#nastaveni-panel, #nastaveni')]
      .map(e => e.textContent).join(' ');
    const iStd = panel.indexOf('Smluvní standardy');
    const iLogo = panel.indexOf('Logo firmy');
    const iSab = panel.indexOf('Šablony dokumentů');
    return zalozky.includes('Smlouvy / Šablony')
      && iStd >= 0 && iLogo > iStd && iSab > iLogo;
  }));
test('v Nastavení → Firma už standardy ani logo nejsou',
  await page.evaluate(() => {
    nastPanel('firma');
    const panel = document.getElementById('nastaveni-panel').innerHTML;
    return !panel.includes('>Logo firmy<') && panel.includes('Smlouvy / Šablony');
  }));
/* Nastavení se schválně NEZAVÍRÁ — pozdější krok sady zakládá účet
 * v panelu Uživatelé a potřebuje ho otevřený. */
await page.evaluate(() => { nastPanel('obecne'); });

/* ---------- sloupec Výchozí (20. 8. 2026) ----------
 * Zaškrtnutí neplatí pro otevřenou zakázku, ale pro každou NOVOU: ukládá se
 * do matice (klíč `vychozi`) a novou zakázku upraví zobrazeniVychoziAplikuj.
 * Do 20. 8. sloupec zapisoval do zadání zakázky, kde ho nikdo nečetl. */
test('kalkulace OCK má u volitelných položek sloupec Výchozí napojený na matici',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    const html = document.getElementById('page-kalk').innerHTML;
    return html.includes("vychoziPolozkaSet('ock.haky'") && !html.includes('volitelneVychoziSet');
  }));
test('kalkulace PROJ má sloupec Výchozí u každé položky (dřív chyběl úplně)',
  await page.evaluate(() => {
    prepniTab('proj'); render();
    const html = document.getElementById('page-proj').innerHTML;
    /* sekce ZAMĚŘENÍ je v téhle sadě srolovaná (viz krok výše) a od 20. 8.
     * se roluje i adminovi — proto se sloupec hledá u rozbalené STUDIE. */
    return html.includes('>Výchozí</th>') && html.includes("vychoziPolozkaSet('proj.studie.Studie'");
  }));
await page.evaluate(() => {
  vychoziPolozkaSet('ock.haky', true, false);
  vychoziPolozkaSet('proj.studie.Studie', false, true);
});
await page.waitForTimeout(500);
test('výchozí zaškrtnutí odešlo na server a vrátilo se v matici',
  await page.evaluate(() => {
    const v = ONLINE_STAV.zobrazeni && ONLINE_STAV.zobrazeni.matice.vychozi;
    return !!v && v['ock.haky'] === true && v['proj.studie.Studie'] === false;
  }));
test('NOVÁ zakázka si výchozí zaškrtnutí vezme (OCK i PROJ)',
  await page.evaluate(() => {
    ZAK = novaZakazka(); syncVarianta();
    const d = aktivniVarianta(ZAK).data;
    zobrazeniVychoziAplikuj(NAST.zobrazeni, d.ock.zadani, d.proj.zadani);
    const st = d.proj.zadani.sekce.find(s => s.key === 'studie');
    return d.ock.zadani.volitelne.haky === true && st.polozky[0].vyrazeno === true;
  }));

/* Trvalé položky se od 1. 9. 2026 zakládají JEN V CENÍKU (pokyn J. V.:
 * „nově už budeme trvalé položky přidávat pouze v cenících"). Kontroluje se
 * tedy obojí: že z kalkulace tlačítka zmizela a že v ceníku fungují. */
test('v kalkulaci OCK ani PROJ už nejsou tlačítka „přidat položku trvale"',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    const ock = document.getElementById('page-kalk').innerHTML;
    prepniTab('proj'); render();
    const proj = document.getElementById('page-proj').innerHTML;
    return !/položku trvale/.test(ock) && !/položku trvale/.test(proj)
      && !/vlastniAddTrvale\(/.test(ock) && !/pjPolozkaAddTrvale\(/.test(proj)
      && !/vlastniDoCeniku\(/.test(ock);
  }));
/* trvalá položka PROJ: zakládá se v ceníku PROJ, sekci si vybere administrátor */
test('ceník PROJ založí trvalou položku do své sekce',
  await page.evaluate(() => {
    prepniTab('cenikproj'); render();
    const pred = ((PC.vlastniPolozky || {}).studie || []).length;
    cenikProjTrvaleAdd('studie', 'fix');
    const arr = (PC.vlastniPolozky || {}).studie || [];
    const g = ((DEFAULT_CENIK_PROJ.vlastniPolozky || {}).studie || []);
    return arr.length === pred + 1 && /^pk\d+$/.test(arr[arr.length - 1].kid)
      && g.some(k => k.kid === arr[arr.length - 1].kid)
      && PJ.sekce.some(s => (s.polozky || []).some(p => p.kid === arr[arr.length - 1].kid && p.vlastni));
  }));
test('a hned ji jde v ceníku pojmenovat i ocenit',
  await page.evaluate(() => {
    const arr = (PC.vlastniPolozky || {}).studie || [];
    const kid = arr[arr.length - 1].kid;
    cenikProjTrvaleSet('studie', kid, 'nazev', 'Zkušební trvalá');
    cenikProjTrvaleSet('studie', kid, 'cena', 4321);
    const it = ((PC.vlastniPolozky || {}).studie || []).find(k => k.kid === kid);
    const vKalk = PJ.sekce.some(s => (s.polozky || []).some(p => p.kid === kid
      && p.nazev === 'Zkušební trvalá' && +p.cena === 4321));
    return it && it.nazev === 'Zkušební trvalá' && +it.cena === 4321 && vKalk;
  }));
/* trvalá položka OCK: pořád tlačítkem v tabulce ceníku */
test('ceník OCK založí trvalou položku do katalogu',
  await page.evaluate(() => {
    prepniTab('cenik'); render();
    const pred = KATALOG.polozky.rezie.length;
    katAdd('rezie');
    return KATALOG.polozky.rezie.length === pred + 1
      && Z.vlastniPolozky.rezie.some(p => p.kid === KATALOG.polozky.rezie[KATALOG.polozky.rezie.length - 1].kid);
  }));

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

const postuPredObchodnikem = volani.filter(x => x === 'POST /api/zobrazeni').length;

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

/* ---------- 4b) obchodník a režimy sekcí + přidávání (19. 8. 2026) ---------- */

test('skrytá sekce OCK (REŽIE) se obchodníkovi vůbec nekreslí',
  await page.evaluate(() => {
    prepniTab('kalk'); render();
    return !document.getElementById('ock-sek-rezie')
      && !!document.getElementById('ock-sek-hrubaOck');   // ostatní sekce zůstávají
  }));
test('obchodník nemá žádný select režimu sekce',
  await page.evaluate(() => !document.getElementById('page-kalk').innerHTML.includes('sekceRezimSet')));
test('obchodník má „+ přidat položku", ale NE „… trvale"',
  await page.evaluate(() => {
    const html = document.getElementById('page-kalk').innerHTML;
    return html.includes('+ přidat položku<') && !html.includes('+ přidat položku trvale')
      && !html.includes('+ přidat atypickou položku');
  }));
test('srolovaná sekce PROJ (ZAMĚŘENÍ) je sbalená: nadpis a CELKEM ano, položky ne',
  await page.evaluate(() => {
    prepniTab('proj'); render();
    const html = document.getElementById('page-proj').innerHTML;
    const hlava = document.getElementById('proj-sek-0');
    return !!hlava && hlava.innerHTML.includes('rozbalit')
      && html.includes('ZAMĚŘENÍ CELKEM');
  }));
test('rozbalení srolované sekce funguje (a jde zase srolovat)',
  await page.evaluate(() => {
    sekceRozbal('proj.zamereni');
    const po = document.getElementById('proj-sek-0').innerHTML.includes('srolovat');
    sekceRozbal('proj.zamereni');
    const zpet = document.getElementById('proj-sek-0').innerHTML.includes('rozbalit');
    return po && zpet;
  }));
/* Trvalá položka PROJ se k ostatním dostane zveřejněním platného ceníku
 * (program DB) — stejná cesta jako katalog OCK. Tady se ověřuje, že se k ní
 * obchodník nedostane rovnou: nemá tlačítko „… trvale" a kdyby položku
 * z ceníku dostal, needituje ji (kontrola aplikace je v jednotkových
 * testech test_katalog.js; UI pravidlo hlídá podmínka !p.kid u vlEd). */
test('obchodník nemá v PROJ žádné tlačítko „… trvale"',
  await page.evaluate(() => !document.getElementById('page-proj').innerHTML.includes('pjPolozkaAddTrvale(')));
test('obchodník v PROJ má přidávání vlastní položky (hodinová/fixní), bez „trvale"',
  await page.evaluate(() => {
    const html = document.getElementById('page-proj').innerHTML;
    return html.includes('+ přidat hodinovou položku') && html.includes('+ přidat fixní položku')
      && !html.includes('trvale');
  }));

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
/* Obchodníkův pokus nesmí přidat ani jeden POST. Počítá se PŘÍRŮSTEK oproti
 * stavu před jeho pokusem (od 20. 8. 2026): pevné číslo tu drželo počet POSTů
 * administrátora a rozbilo se pokaždé, když sada přibrala další nastavení. */
test('a na server se přitom nic neposlalo',
  volani.filter(x => x === 'POST /api/zobrazeni').length === postuPredObchodnikem,
  'před: ' + postuPredObchodnikem + ', po: ' + volani.filter(x => x === 'POST /api/zobrazeni').length);

/* ---------- sloupec Výchozí u VŠECH položek kalkulace OCK (21. 8. 2026) ----
 * Zadání J. V.: „přidej ke všem položkám kalkulace OCK možnost zaškrtnout
 * výchozí počítání." Do té doby ho měly jen volitelné položky a u sekce
 * Hrubá OCK zůstával sloupec prázdný. */
const vych = await page.evaluate(() => {
  NAST.jeAdmin = true; NAST.nahledRole = ''; NAST.nahledUzivatel = null;
  ONLINE_STAV.ja = { email: 'a@b.cz', jmeno: 'Správce', role: 'Administrátor' };
  prepniTab('kalk'); render();
  const tab = [...document.querySelectorAll('#page-kalk table')]
    .find(t => /HRUBÁ OCK/.test(t.textContent));
  if (!tab) return { chyba: 'tabulka kalkulace nenalezena' };
  /* Řádek POLOŽKY se pozná podle úchopu ⠿ (jen ty se dají přetahovat);
   * součty, rezerva a řádky „+ přidat položku" položky nejsou. */
  const radky = [...tab.querySelectorAll('tr')].filter(r => r.querySelector('.grip'));
  const sChk = radky.filter(r => {
    const b = [...r.querySelectorAll('td.admincol')];
    return b.length === 2 && b[1].querySelector('input[type=checkbox]');
  });
  return { radku: radky.length, sChk: sChk.length,
    tds: [...tab.querySelectorAll('tr')].slice(0, 4).map(r => r.querySelectorAll('td').length) };
});
test(`Výchozí je u každého řádku kalkulace (${vych.sChk}/${vych.radku})`,
  vych.radku > 5 && vych.sChk === vych.radku, JSON.stringify(vych));
test('odškrtnutí zapíše odchylku do matice a nová zakázka ji převezme',
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('#page-kalk table')]
      .find(t => /HRUBÁ OCK/.test(t.textContent));
    /* Název položky je adminovi k dispozici jako editační pole, ne jako
     * text buňky — hledá se proto podle hodnoty vstupu. */
    const radek = [...tab.querySelectorAll('tr')].filter(r => r.querySelector('.grip'))
      .find(r => { const i = r.querySelector('input[type=text]');
        return i && /PROFILY - HLAVNÍ NOSNÉ PRVKY/i.test(i.value); });
    const chk = radek && [...radek.querySelectorAll('td.admincol input[type=checkbox]')].pop();
    if (!chk) return false;
    chk.click();
    const klic = ZOBRAZENI_POCITAT + 'PROFILY - HLAVNÍ NOSNÉ PRVKY';
    const vMatici = (NAST.zobrazeni.vychozi || {})[klic] === false;
    const zadani = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
    zobrazeniVychoziAplikuj(NAST.zobrazeni, zadani, null);
    const vNove = (zadani.nepocitat || []).indexOf('PROFILY - HLAVNÍ NOSNÉ PRVKY') >= 0;
    /* Zaškrtnutí překreslilo stránku, takže původní prvek už v dokumentu
     * není — pro návrat zpět se musí najít znovu. */
    zobrazeniPolozkaVychoziNastav(NAST.zobrazeni, klic, true, true);
    const uklizeno = !((NAST.zobrazeni.vychozi || {})[klic] === false);
    render();
    return vMatici && vNove && uklizeno;
  }));

test('Výchozí je i u příplatkových položek',
  await page.evaluate(() => {
    NAST.jeAdmin = true; prepniTab('kalk'); render();
    const tab = [...document.querySelectorAll('#page-kalk table')]
      .find(t => /Nabídka/.test((t.querySelector('tr') || {}).textContent || ''));
    if (!tab) return false;
    const radky = [...tab.querySelectorAll('tr')]
      .filter(r => r.querySelectorAll('td.admincol').length === 2);
    return radky.length > 0
      && radky.every(r => [...r.querySelectorAll('td.admincol')]
        .every(td => td.querySelector('input[type=checkbox]') || td.textContent.trim() === ''));
  }));
test('odškrtnutý příplatek se v nové zakázce nedostane do nabídky',
  await page.evaluate(() => {
    const klic = ZOBRAZENI_PRIPLATEK + 'vsgFolie';
    zobrazeniPolozkaVychoziNastav(NAST.zobrazeni, klic, false, true);
    const zadani = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
    zobrazeniVychoziAplikuj(NAST.zobrazeni, zadani, null);
    const je = (zadani.priplatkyVynechat || []).indexOf('vsgFolie') >= 0;
    zobrazeniPolozkaVychoziNastav(NAST.zobrazeni, klic, true, true);
    render();
    return je;
  }));

/* ---------- Přehled cenových nabídek po úklidu (21. 8. 2026 večer) ---------- */
test('Nastavení má novou záložku Databáze s kartou online databáze',
  await page.evaluate(() => {
    otevriNastaveni();
    const je = [...document.querySelectorAll('#nastaveni-panel .nast-tabs button')]
      .some(b => b.textContent.trim() === 'Databáze');
    nastPanel('databaze');
    const html = document.getElementById('nastaveni-panel').innerHTML;
    zavriNastaveni();
    return je && /Online databáze/.test(html);
  }));
test('seznam nabídek má sloupec Obchodník i druh OCK/PROJ',
  await page.evaluate(() => {
    ONLINE_STAV.ja = { email: 'a@b.cz', jmeno: 'Zkušební Obchodník', role: 'Administrátor' };
    ONLINE_STAV.rejstrik = [
      { soubor: 'a.json', cislo: '2026 - OPR - CN - 1', nazevAkce: 'Šachta', objednatel: 'SVJ',
        autor: 'a@b.cz', autorJmeno: 'Jan Novák', datum: '2026-08-01', variant: 1, odeslane: 0, upraveno: '' },
      { soubor: 'b.json', cislo: '2026 - OVP - CN - 2', nazevAkce: 'Studie', objednatel: 'Firma',
        autor: 'c@d.cz', autorJmeno: '', datum: '2026-08-02', variant: 1, odeslane: 0, upraveno: '' },
    ];
    prepniTab('zakazka'); render();
    const hl = [...document.querySelectorAll('#prehledHledaniTelo th')].map(x => x.textContent.trim());
    const radky = [...document.querySelectorAll('#prehledHledaniTelo tr')].map(r => r.textContent);
    /* Obchodník stojí na KONCI řádku (zadání J. V. 21. 8. večer):
     * poslední sloupec před tlačítkem Otevřít. */
    const naKonci = hl.indexOf('Obchodník') === hl.length - 2;
    return hl.includes('Obchodník') && hl.includes('Druh') && naKonci
      && radky.some(r => /Jan Novák/.test(r) && /OCK/.test(r))
      && radky.some(r => /c@d\.cz/.test(r) && /PROJ/.test(r));
  }));
test('seznam nabídek se roluje (pět řádků a dál posuvník)',
  await page.evaluate(() => {
    const el = document.querySelector('#prehledHledaniTelo .prehled-seznam');
    if (!el) return false;
    const max = getComputedStyle(el).maxHeight;
    return /auto|scroll/.test(getComputedStyle(el).overflowY) && max && max !== 'none';
  }));
const hromadne = await page.evaluate(() => {
    /* Rejstřík se nastavuje znovu: přepnutí na Přehled si ho od 21. 8. 2026
     * načítá ze serveru, a ten v harnessu vrací prázdno. */
    ONLINE_STAV.ja = { email: 'a@b.cz', jmeno: 'Správce', role: 'Administrátor' };
    NAST.jeAdmin = true;
    ONLINE_STAV.rejstrik = [
      { soubor: 'a.json', cislo: '2026 - OPR - CN - 1', nazevAkce: 'Šachta', objednatel: 'SVJ',
        autor: 'a@b.cz', autorJmeno: 'Jan Novák', datum: '2026-08-01', variant: 1, odeslane: 0, upraveno: '' },
      { soubor: 'b.json', cislo: '2026 - OVP - CN - 2', nazevAkce: 'Studie', objednatel: 'Firma',
        autor: 'c@d.cz', autorJmeno: '', datum: '2026-08-02', variant: 1, odeslane: 0, upraveno: '' },
    ];
    renderPrehledHledaniTelo();
    const lista = document.querySelector('#prehledHledaniTelo .prehled-vyber');
    if (!lista) return { lista: false };
    const smazat = [...lista.querySelectorAll('button')].find(b => /Smazat vybrané/.test(b.textContent));
    const predVyberem = !!smazat && smazat.disabled;      // bez výběru je zhasnuté
    onlineVyberPrepni('a.json', true);
    const poVyberu = [...document.querySelectorAll('#prehledHledaniTelo .prehled-vyber button')]
      .find(b => /Smazat vybrané/.test(b.textContent));
    const zaskrtnutych = document.querySelectorAll(
      '#prehledHledaniTelo tbody input[type=checkbox]:checked, #prehledHledaniTelo tr input[type=checkbox]:checked').length;
    onlineVyberZrus();
    return { lista: true, predVyberem, poVyberu: !!poVyberu,
      zhasnuto: poVyberu ? poVyberu.disabled : null, zaskrtnutych };
  });
test('administrátor může zakázky hromadně vybrat a smazat',
  hromadne.lista && hromadne.predVyberem && hromadne.poVyberu
  && hromadne.zhasnuto === false && hromadne.zaskrtnutych >= 1, JSON.stringify(hromadne));
test('obchodníkovi se hromadné mazání vůbec nenabízí',
  await page.evaluate(() => {
    const zaloha = ONLINE_STAV.ja;
    ONLINE_STAV.ja = { email: 'o@b.cz', jmeno: 'Obchodník', role: 'Obchodník' };
    NAST.jeAdmin = false;
    render();
    const je = !!document.querySelector('#prehledHledaniTelo .prehled-vyber');
    ONLINE_STAV.ja = zaloha; NAST.jeAdmin = true; render();
    return !je;
  }));
test('našeptávač se při psaní PRŮBĚŽNĚ zužuje (ne jen první písmeno)',
  await page.evaluate(() => {
    renderPrehledHledaniTelo(); render();
    /* Filtruje toutéž logikou jako hledání: bez diakritiky, každé slovo. */
    const vse = naseptavacFiltr('a');
    const uzsi = naseptavacFiltr('nov');                 // uprostřed slova
    const bezDia = naseptavacFiltr('sachta');            // „Šachta" bez háčku
    const dveSlova = naseptavacFiltr('jan nov');
    return vse.length > uzsi.length
      && uzsi.some(h => /Novák/.test(h)) && uzsi.every(h => /nov/i.test(h.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      && bezDia.length === 1 && bezDia[0] === 'Šachta'
      && dveSlova.length === 1 && dveSlova[0] === 'Jan Novák'
      && naseptavacFiltr('').length === 0;
  }));
test('nabídka se kreslí pod políčko a klik ji vybere',
  await page.evaluate(() => {
    const inp = document.querySelector('#page-zakazka input.seznam-hledat');
    if (!inp || !document.getElementById('naseptBoxPrehled')) return false;
    naseptavacKresli('naseptBoxPrehled', 'nov', 'prehled');
    const box = document.getElementById('naseptBoxPrehled');
    const radku = box.querySelectorAll('.nasept-radek').length;
    if (!radku || box.style.display === 'none') return false;
    naseptavacVyber('prehled', 'Jan Novák');
    const vysledek = ONLINE_STAV.prehled.hledat === 'Jan Novák'
      && document.querySelector('#page-zakazka input.seznam-hledat').value === 'Jan Novák';
    prehledHledatSet('');
    return vysledek;
  }));
test('klik na řádek otevře zakázku, klik na zaškrtávátko ne',
  await page.evaluate(() => {
    const radek = document.querySelector('#prehledHledaniTelo tr.radek-klik');
    if (!radek || !/prehledRadekOtevri/.test(radek.getAttribute('onclick') || '')) return false;
    /* Otevření se nevolá doopravdy (fetch by spadl) — podstrčí se špión. */
    const puvodni = window.onlineOtevri;
    let volani = 0;
    window.onlineOtevri = () => { volani++; };
    const chk = radek.querySelector('input[type=checkbox]');
    if (chk) prehledRadekOtevri({ target: chk }, 'a.json');          // zaškrtávátko → nic
    prehledRadekOtevri({ target: radek.querySelector('td:nth-child(2)') }, 'a.json'); // buňka → otevřít
    window.onlineOtevri = puvodni;
    return volani === 1;
  }));
test('filtr zúží seznam na PROJ a hledání funguje i podle obchodníka',
  await page.evaluate(() => {
    ONLINE_STAV.ja = { email: 'a@b.cz', jmeno: 'Správce', role: 'Administrátor' };
    NAST.jeAdmin = true;
    ONLINE_STAV.rejstrik = [
      { soubor: 'a.json', cislo: '2026 - OPR - CN - 1', nazevAkce: 'Šachta', objednatel: 'SVJ',
        autor: 'a@b.cz', autorJmeno: 'Jan Novák', datum: '2026-08-01', variant: 1, odeslane: 0, upraveno: '' },
      { soubor: 'b.json', cislo: '2026 - OVP - CN - 2', nazevAkce: 'Studie', objednatel: 'Firma',
        autor: 'c@d.cz', autorJmeno: '', datum: '2026-08-02', variant: 1, odeslane: 0, upraveno: '' },
    ];
    prehledDruhSet('PROJ');
    const jenProj = [...document.querySelectorAll('#prehledHledaniTelo tbody tr, #prehledHledaniTelo tr')]
      .filter(r => r.querySelector('td')).length;
    prehledDruhSet('vse'); prehledHledatSet('Novák');
    const podleJmena = [...document.querySelectorAll('#prehledHledaniTelo tr')]
      .filter(r => r.querySelector('td')).length;
    prehledHledatSet('');
    return jenProj === 1 && podleJmena === 1;
  }));

test('pole Zákazník našeptává z kartotéky i z rejstříku',
  await page.evaluate(() => {
    NAST.jeAdmin = true; prepniTab('kalk');
    const zalohaRej = ONLINE_STAV.rejstrik;      // vrátíme, další test na něm stojí
    ZAK_DB.seznam = [{ nazev: 'Novotný stavby s.r.o.' }, { nazev: 'SVJ Verdunská' }];
    ONLINE_STAV.rejstrik = [{ soubor: 'a.json', cislo: 'x', nazevAkce: 'a',
      objednatel: 'Šachtové konstrukce a.s.', autor: '', autorJmeno: '', datum: '', variant: 1,
      odeslane: 0, upraveno: '' }];
    render();
    /* obě hlavičky mají vlastní box — dvě stejná id by byla chyba */
    if (!document.getElementById('naseptBoxZak_ock')
      || !document.getElementById('naseptBoxZak_proj')) return false;
    naseptavacZakKresli('ock', 'nov');
    const box = document.getElementById('naseptBoxZak_ock');
    const jenNovotny = [...box.querySelectorAll('.nasept-radek')].map(x => x.textContent);
    naseptavacZakKresli('ock', 'sachtove');              // bez diakritiky
    const bezDia = [...box.querySelectorAll('.nasept-radek')].map(x => x.textContent);
    naseptavacZakVyber('SVJ Verdunská');
    const zapsano = ZAK.objednatel === 'SVJ Verdunská';
    ZAK.objednatel = '';
    ONLINE_STAV.rejstrik = zalohaRej; ZAK_DB.seznam = [];
    prepniTab('zakazka'); render();
    return jenNovotny.length === 1 && /Novotný/.test(jenNovotny[0])
      && bezDia.length === 1 && /Šachtové/.test(bezDia[0]) && zapsano;
  }));

/* Výběr z našeptávače dotáhne i zbytek hlavičky (22. 8. 2026, zadání J. V.:
 * „po načtení z našeptávače se stále do hlavičky nedotahuje kontaktní osoba
 * a IČO"). Doplní se JEN prázdná pole — co už je v hlavičce vyplněné jinak,
 * se nepřepíše a řekne se to nahlas. */
test('výběr z našeptávače doplní kontaktní osobu a IČO z kartotéky',
  await page.evaluate(() => {
    NAST.jeAdmin = true; prepniTab('kalk');
    const zalohaRej = ONLINE_STAV.rejstrik;
    ZAK_DB.seznam = [{ nazev: 'Novotný stavby s.r.o.', ico: '12345678',
      kontaktOsoba: 'Ing. Petr Novotný', sidlo: 'Dlouhá 5, Praha' }];
    ZAK.objednatel = ''; ZAK.kontakt = ''; ZAK.ico = ''; ZAK.adresaObjednatele = '';
    render();
    naseptavacZakVyber('Novotný stavby s.r.o.', 'ock');
    const v = ZAK.kontakt === 'Ing. Petr Novotný' && ZAK.ico === '12345678'
      && ZAK.adresaObjednatele === 'Dlouhá 5, Praha' && !!ZAK.zakaznikId;
    ZAK.objednatel = ''; ZAK.kontakt = ''; ZAK.ico = ''; ZAK.adresaObjednatele = '';
    ZAK.zakaznikId = ''; ZAK_DB.seznam = []; ZAK_DB.hlaska = '';
    ONLINE_STAV.rejstrik = zalohaRej;
    return v;
  }));

test('vyplněný údaj se výběrem nepřepíše (zakázka je pán)',
  await page.evaluate(() => {
    const zalohaRej = ONLINE_STAV.rejstrik;
    ZAK_DB.seznam = [{ nazev: 'SVJ Verdunská', ico: '87654321', kontaktOsoba: 'Jan Předseda' }];
    ZAK.objednatel = ''; ZAK.ico = ''; ZAK.kontakt = 'Technik na stavbě';
    render();
    naseptavacZakVyber('SVJ Verdunská', 'ock');
    const v = ZAK.kontakt === 'Technik na stavbě'      // nepřepsáno
      && ZAK.ico === '87654321'                        // prázdné doplněno
      && ZAK.objednatel === 'SVJ Verdunská';
    ZAK.objednatel = ''; ZAK.kontakt = ''; ZAK.ico = ''; ZAK.zakaznikId = '';
    ZAK_DB.seznam = []; ZAK_DB.hlaska = '';
    ONLINE_STAV.rejstrik = zalohaRej;
    prepniTab('zakazka'); render();
    return v;
  }));

/* Víc jmen na kartě = nabídka k výběru, ne tiché doplnění (dávka 3). */
test('víc kontaktů na kartě se nabídne k výběru, nic se nevybere samo',
  await page.evaluate(() => {
    const zalohaRej = ONLINE_STAV.rejstrik;
    ZAK_DB.seznam = [{ nazev: 'Vícehlavá s.r.o.', ico: '11111119',
      kontaktOsoba: 'Anna Recepční', smluvniJmeno: 'Bohumil Jednatel',
      technickyJmeno: 'Cyril Technik' }];
    ZAK.objednatel = ''; ZAK.ico = ''; ZAK.kontakt = '';
    prepniTab('kalk'); render();
    naseptavacZakVyber('Vícehlavá s.r.o.', 'ock');
    const box = document.getElementById('naseptBoxZak_ock');
    const nabidka = box && box.style.display !== 'none' && /Kontaktní osoba/.test(box.innerHTML)
      && /Bohumil Jednatel/.test(box.innerHTML);
    const prazdno = ZAK.kontakt === '';
    naseptavacZakKontaktVyber('Cyril Technik', 'ock');
    const vybrano = ZAK.kontakt === 'Cyril Technik';
    ZAK.objednatel = ''; ZAK.kontakt = ''; ZAK.ico = ''; ZAK.zakaznikId = '';
    ZAK_DB.seznam = []; ZAK_DB.kontaktVolba = '';
    ONLINE_STAV.rejstrik = zalohaRej;
    prepniTab('zakazka'); render();
    return nabidka && prazdno && vybrano;
  }));

/* Tatáž tlačítka musejí být v OBOU kalkulacích (zadání J. V. 22. 8. 2026:
 * „tato funkce má být přístupná i v kalkulaci proj"). */
test('databáze zákazníků je i v hlavičce Kalkulace PROJ',
  await page.evaluate(() => {
    prepniTab('proj'); render();
    const h = document.getElementById('page-proj');
    const txt = h ? h.innerHTML : '';
    const ock = (document.getElementById('page-kalk') || {}).innerHTML || '';
    prepniTab('zakazka'); render();
    return /Vybrat z databáze zákazníků/.test(txt) && /Uložit jako zákazníka/.test(txt)
      && /Vybrat z databáze zákazníků/.test(ock);
  }));

/* B26 (23. 8. 2026): číselná pole zadání se do value="…" vkládají escapovaně.
 * Uložená zakázka může nést v číselném poli řetězec (server importZakazka
 * čísla nepřetypovává); bez escapování by „"><img onerror> spustil skript. */
test('B26: škodlivý řetězec v číselném poli zadání se vykreslí escapovaně (žádný breakout)',
  await page.evaluate(() => {
    const utok = '"><img src=x onerror=window.__xss26=1>';
    window.__xss26 = 0;
    Z.prejezd = utok;           // číselné pole zadání (inp default number branch)
    NAST.jeAdmin = true; NAST.nahledRole = ''; prepniTab('kalk'); render();
    const html = document.getElementById('page-kalk').innerHTML;
    const spusteno = window.__xss26 === 1;
    const surovy = html.includes('<img src=x onerror');   // skutečný breakout z atributu (nezescapované <img)
    Z.prejezd = 2.7; render();
    return !spusteno && !surovy;
  }));

/* Rozepsaná hodnota přežije překreslení (31. 8. 2026, hlášeno J. V.:
 * „uživatelé musejí zadávat data do buňky několikrát, protože se ručně
 * přepsaná hodnota neuloží napoprvé"). Aplikace překresluje celé záložky
 * přes innerHTML — dokud se rozepsaná hodnota nevracela, každé doběhnuté
 * uložení nebo načtení ji smazalo i s kurzorem. */
test('rozepsaná hodnota v poli přežije překreslení aplikace',
  await page.evaluate(async () => {
    NAST.jeAdmin = true; prepniTab('kalk'); render();
    await new Promise(r => setTimeout(r, 100));
    const pole = [...document.querySelectorAll('#page-kalk input[type=number]')]
      .find(x => x.getAttribute('onchange'));
    if (!pole) return false;
    pole.focus();
    pole.value = '12345';                    // uživatel píše, change ještě nebyl
    render();                                // mezitím doběhne autosave
    await new Promise(r => setTimeout(r, 50));
    const a = document.activeElement;
    const ok = a && a.value === '12345' && a.getAttribute('onchange') === pole.getAttribute('onchange');
    if (a) { a.blur(); }
    prepniTab('zakazka'); render();
    return !!ok;
  }));

test('pole bez rozepsané hodnoty se překreslením jen znovu zaostří',
  await page.evaluate(async () => {
    prepniTab('kalk'); render();
    await new Promise(r => setTimeout(r, 100));
    const pole = [...document.querySelectorAll('#page-kalk input[type=number]')]
      .find(x => x.getAttribute('onchange'));
    if (!pole) return false;
    const puvodni = pole.value;
    pole.focus();
    render();
    await new Promise(r => setTimeout(r, 50));
    const a = document.activeElement;
    const ok = a && a.value === puvodni;
    if (a) a.blur();
    prepniTab('zakazka'); render();
    return !!ok;
  }));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await prohlizec.close();
server.close();

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
