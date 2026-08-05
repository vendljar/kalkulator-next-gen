/* Kontrola okna „Můj profil" v prohlížeči (#145).
 *
 * Zadání: „V cenové nabídce se musí zobrazovat jméno a kontaktní údaje
 * obchodníka = Obchodního technika, která nabídku tvořil. … v rámci registrace
 * uživatele musíme doplnit i titul před jménem a telefonní číslo … Zároveň tam
 * přidej možnost uživateli nahrát snímek s podpisem a rozítkem."
 *
 * Serverovou logiku hlídá netlify/test_profil.mjs. Tady jde o to, na co se
 * v Node přijít nedá: jestli se uživatel k těm polím vůbec DOSTANE, jestli
 * to, co vyplní, opravdu odejde na server, a jestli se nahraný obrázek
 * v okně zobrazí. Zadání totiž nezačalo chybou ve výpočtu — začalo tím,
 * že pod každou nabídkou bylo natvrdo jméno jednoho kolegy.
 *
 * Server je tady falešný a drží účty v paměti. Nezkouší se jím bezpečnost
 * (to dělá netlify/test_prava.mjs), ale chování obrazovky nad odpověďmi,
 * které skutečný server posílá.
 *
 * Spuštění:  NODE_PATH=$(npm root -g) node overit_profil.mjs
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HTML = readFileSync('/home/claude/work/kng/dist/kalkulacka.html', 'utf8');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* --- falešný server ------------------------------------------------------ */

/* Zkušební účty jsou vymyšlené. Skutečná jména kolegů ani ceny sem nepatří. */
const UCTY = {
  'sef@zkusebni.cz': { email: 'sef@zkusebni.cz', jmeno: 'Jan Zkušební', titul: 'Ing.',
    funkce: 'Obchodní technik', telefon: '+420 111 222 333',
    role: 'Administrátor', aktivni: true },
};
const PODPISY = {};
/* Co server od prohlížeče opravdu dostal — na tom se pozná, jestli obrazovka
 * odesílá vyplněná pole, nebo je jen ukazuje. */
const PRIJATO = [];
let prihlasen = '';

const telo = (req) => new Promise((h) => {
  let s = '';
  req.on('data', (c) => { s += c; });
  req.on('end', () => { try { h(JSON.parse(s || '{}')); } catch (e) { h({}); } });
});
const odpoved = (res, data, kod) => {
  res.writeHead(kod || 200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const profilVen = (u) => ({ email: u.email, jmeno: u.jmeno || '', titul: u.titul || '',
  funkce: u.funkce || '', telefon: u.telefon || '', role: u.role });

const server = createServer(async (req, res) => {
  const cesta = req.url.split('?')[0];
  if (!cesta.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML); return;
  }
  if (cesta === '/api/zdravi') return odpoved(res, { ok: true });
  if (cesta === '/api/ja') {
    if (!prihlasen) return odpoved(res, { ok: false, chyba: 'Nepřihlášen.' }, 401);
    return odpoved(res, { ok: true, ...profilVen(UCTY[prihlasen]),
      podpis: PODPISY[prihlasen] || '' });
  }
  if (cesta === '/api/prihlaseni') {
    const t = await telo(req);
    const u = UCTY[String(t.email || '').toLowerCase()];
    if (!u) return odpoved(res, { ok: false, chyba: 'Nesprávný e-mail nebo heslo.' }, 401);
    prihlasen = u.email;
    return odpoved(res, { ok: true, ...profilVen(u), podpis: PODPISY[u.email] || '' });
  }
  if (cesta === '/api/uzivatele') {
    if (!prihlasen) return odpoved(res, { ok: false, chyba: 'Nepřihlášen.' }, 401);
    if (req.method !== 'POST')
      return odpoved(res, { ok: true, uzivatele: Object.values(UCTY).map(profilVen) });
    const t = await telo(req);
    PRIJATO.push(t);
    const ja = UCTY[prihlasen];
    if (t.akce === 'profil') {
      Object.assign(ja, { jmeno: t.jmeno || '', titul: t.titul || '',
        funkce: t.funkce || '', telefon: t.telefon || '' });
      return odpoved(res, { ok: true, ...profilVen(ja) });
    }
    if (t.akce === 'podpis') {
      const s = String(t.obrazek || '');
      if (s && !/^data:image\/(png|jpeg);base64,/.test(s))
        return odpoved(res, { ok: false, chyba: 'Podpis musí být obrázek PNG nebo JPEG.' }, 400);
      if (s) PODPISY[prihlasen] = s; else delete PODPISY[prihlasen];
      return odpoved(res, { ok: true });
    }
    if (t.akce === 'zaloz') {
      const e = String(t.email || '').toLowerCase();
      UCTY[e] = { email: e, jmeno: t.jmeno || '', titul: t.titul || '', funkce: t.funkce || '',
        telefon: t.telefon || '', role: t.role, aktivni: true };
      return odpoved(res, { ok: true, ...profilVen(UCTY[e]) });
    }
    return odpoved(res, { ok: true });
  }
  /* zbytek, co si aplikace po přihlášení sáhne — prázdno stačí */
  if (cesta === '/api/program') return odpoved(res, { ok: true, db: null });
  if (cesta === '/api/firma') return odpoved(res, { ok: true, firma: null });
  if (cesta === '/api/zobrazeni') return odpoved(res, { ok: true, zobrazeni: null });
  if (cesta === '/api/zakazky') return odpoved(res, { ok: true, rejstrik: [] });
  return odpoved(res, { ok: true });
}).listen(0);
const port = server.address().port;

const prohlizec = await chromium.launch();
const page = await prohlizec.newPage();
const chyby = [];
page.on('pageerror', (e) => chyby.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
await page.waitForTimeout(600);

/* --- přihlášení ---------------------------------------------------------- */

await page.evaluate(() => {
  ONLINE_STAV.formEmail = 'sef@zkusebni.cz'; ONLINE_STAV.formHeslo = 'jedno-dve-tri';
  return onlinePrihlas();
});
await page.waitForTimeout(400);

test('přihlášení proběhlo',
  await page.evaluate(() => !!(ONLINE_STAV.ja && ONLINE_STAV.ja.email === 'sef@zkusebni.cz')));
test('profil ze serveru dorazil rovnou s přihlášením',
  await page.evaluate(() => ONLINE_STAV.ja.titul === 'Ing.'
    && ONLINE_STAV.ja.funkce === 'Obchodní technik'
    && ONLINE_STAV.ja.telefon === '+420 111 222 333'),
  JSON.stringify(await page.evaluate(() => ONLINE_STAV.ja)));

/* Kdo nabídku dělal, se ukazuje i v liště — s titulem, ne jen holé jméno. */
test('lišta ukazuje jméno s titulem',
  (await page.locator('#onlineLista').innerHTML()).includes('Ing. Jan Zkušební'));
test('lišta nabízí tlačítko „Můj profil"',
  (await page.locator('#onlineLista').innerHTML()).includes('Můj profil'));

/* --- okno Můj profil ----------------------------------------------------- */

await page.evaluate(() => otevriMujProfil());
await page.waitForTimeout(200);

test('okno Můj profil se otevře',
  await page.evaluate(() => getComputedStyle(document.getElementById('profil-overlay')).display !== 'none'));

const pole = await page.evaluate(() => ['profilTitul', 'profilJmeno', 'profilFunkce', 'profilTelefon']
  .map((id) => { const e = document.getElementById(id); return e ? e.value : null; }));
test('pole jsou předvyplněná tím, co je uložené',
  JSON.stringify(pole) === JSON.stringify(['Ing.', 'Jan Zkušební', 'Obchodní technik', '+420 111 222 333']),
  JSON.stringify(pole));
test('e-mail se přes profil měnit nedá',
  await page.evaluate(() => {
    const p = document.getElementById('profil-panel');
    return [...p.querySelectorAll('input')].some((i) => i.disabled && i.value === 'sef@zkusebni.cz');
  }));
test('bez podpisu okno vysvětlí, že se nic nedokresluje',
  (await page.locator('#profil-panel').innerText()).includes('Zatím nemáte nahraný žádný podpis'));

/* --- uložení profilu ----------------------------------------------------- */

await page.evaluate(() => {
  document.getElementById('profilTitul').value = 'Ing. arch.';
  ONLINE_STAV.profil.titul = 'Ing. arch.';
  ONLINE_STAV.profil.telefon = '+420 999 888 777';
  return onlineUlozProfil();
});
await page.waitForTimeout(400);

test('server dostal opravdu vyplněné hodnoty, ne prázdno',
  PRIJATO.some((t) => t.akce === 'profil' && t.titul === 'Ing. arch.'
    && t.telefon === '+420 999 888 777' && t.jmeno === 'Jan Zkušební'),
  JSON.stringify(PRIJATO.filter((t) => t.akce === 'profil')));
test('aplikace si po uložení srovná vlastní stav',
  await page.evaluate(() => ONLINE_STAV.ja.titul === 'Ing. arch.'
    && ONLINE_STAV.ja.telefon === '+420 999 888 777'));
test('a lišta hned ukazuje nový tvar jména',
  (await page.locator('#onlineLista').innerHTML()).includes('Ing. arch. Jan Zkušební'));
test('okno potvrdí, co půjde do dalších nabídek',
  (await page.locator('#profil-panel').innerText()).includes('Profil je uložený'));

/* Jméno razítkuje zámky a protokol — po změně musí platit hned to nové. */
test('jméno pro zámky a protokol jde s profilem',
  await page.evaluate(() => NAST.uzivatel === 'Jan Zkušební'),
  await page.evaluate(() => NAST.uzivatel));

/* --- nahrání podpisu ----------------------------------------------------- */

/* Malý platný PNG (1×1). Přes DataTransfer se vloží do pole tak, jako by ho
 * uživatel vybral z disku — celá cesta FileReader → server se tím projde. */
const nahrano = await page.evaluate(async () => {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const pole = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pole[i] = bin.charCodeAt(i);
  const soubor = new File([pole], 'podpis.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(soubor);
  const vstup = document.getElementById('profilPodpisSoubor');
  vstup.files = dt.files;
  return onlineNahrajPodpis(vstup);
});
await page.waitForTimeout(400);

test('nahrání podpisu skončilo úspěchem', nahrano === true, nahrano);
test('server podpis dostal jako datový zápis PNG',
  /^data:image\/png;base64,/.test(PODPISY['sef@zkusebni.cz'] || ''),
  (PODPISY['sef@zkusebni.cz'] || '').slice(0, 40));
test('okno ukazuje náhled toho, co půjde do dokumentu',
  await page.evaluate(() => {
    const i = document.querySelector('#profil-panel img');
    return !!i && i.src.startsWith('data:image/png;base64,');
  }));
test('aplikace si podpis drží i mimo okno',
  await page.evaluate(() => (ONLINE_STAV.ja.podpis || '').startsWith('data:image/png')));
test('okno napíše, kolik podpis zabírá',
  (await page.locator('#profil-panel').innerText()).includes('Podpis je uložený'));

/* Špatný formát nesmí projít ani na klientovi: chyba musí přijít hned,
 * ne až po odeslání a čekání. */
const poSvg = await page.evaluate(async () => {
  const dt = new DataTransfer();
  dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'podpis.svg',
    { type: 'image/svg+xml' }));
  const vstup = document.getElementById('profilPodpisSoubor');
  vstup.files = dt.files;
  const v = await onlineNahrajPodpis(vstup);
  return { v, hlaska: ONLINE_STAV.profilHlaska, typ: ONLINE_STAV.profilTyp,
    podpis: ONLINE_STAV.ja.podpis || '' };
});
test('SVG se odmítne', poSvg.v === false, JSON.stringify(poSvg.hlaska));
test('a odmítnutí je vysvětlené, ne jen červené',
  /PNG nebo JPEG/.test(poSvg.hlaska) && poSvg.typ === 'chyba', poSvg.hlaska);
test('odmítnutý soubor nesmaže dřívější podpis',
  poSvg.podpis.startsWith('data:image/png'));
test('a server o odmítnutém souboru nic nedostal',
  PRIJATO.filter((t) => t.akce === 'podpis').length === 1,
  PRIJATO.filter((t) => t.akce === 'podpis').length);

/* --- odebrání podpisu ---------------------------------------------------- */

await page.evaluate(() => onlineOdeberPodpis());
await page.waitForTimeout(300);
test('podpis jde odebrat', !PODPISY['sef@zkusebni.cz']);
test('po odebrání se náhled ztratí',
  await page.evaluate(() => !document.querySelector('#profil-panel img')));
test('a okno řekne, co to znamená pro další nabídky',
  (await page.locator('#profil-panel').innerText()).includes('vygenerují bez něj'));

await page.evaluate(() => zavriMujProfil());
await page.waitForTimeout(150);
test('okno jde zavřít',
  await page.evaluate(() => getComputedStyle(document.getElementById('profil-overlay')).display === 'none'));

/* --- zakládání účtu administrátorem -------------------------------------- */

await page.evaluate(() => { NAST.jeAdmin = true; return onlineUzivateleNacti(); });
await page.waitForTimeout(300);
const formular = await page.evaluate(() => onlineUzivateleHtml());
test('formulář nového účtu má pole Titul před jménem', formular.includes('Titul před jménem'));
test('formulář nového účtu má pole Funkce', formular.includes('>Funkce<'));
test('formulář nového účtu má pole Telefon', formular.includes('>Telefon<'));
test('a vysvětluje, kam se ty údaje v nabídce dostanou',
  formular.includes('Vypracoval'));

const zalozeno = await page.evaluate(() => {
  ONLINE_STAV.uzForm = { email: 'novy@zkusebni.cz', jmeno: 'Petr Nováček', titul: 'Bc.',
    funkce: 'Obchodní technik', telefon: '+420 777 111 222', role: 'Obchodník',
    heslo: 'aspon-osm-znaku' };
  return onlineUzZaloz();
});
await page.waitForTimeout(400);
test('nový účet vznikl', zalozeno !== false);
test('titul, funkce i telefon odešly rovnou při založení',
  PRIJATO.some((t) => t.akce === 'zaloz' && t.titul === 'Bc.'
    && t.funkce === 'Obchodní technik' && t.telefon === '+420 777 111 222'),
  JSON.stringify(PRIJATO.filter((t) => t.akce === 'zaloz')));
test('formulář se po úspěchu vyprázdnil i v nových polích',
  await page.evaluate(() => ONLINE_STAV.uzForm.titul === '' && ONLINE_STAV.uzForm.telefon === ''));

const tabulka = await page.evaluate(() => onlineUzivateleHtml());
test('tabulka účtů ukazuje titul', tabulka.includes('Bc.'));
test('tabulka účtů ukazuje telefon', tabulka.includes('+420 777 111 222'));
test('tabulka účtů ukazuje funkci', tabulka.includes('Obchodní technik'));
/* Rozbalený řádek resetu hesla musí překlenout všechny sloupce — po přidání
 * dvou nových by jinak tabulka „ujela" a vypadala rozbitě. */
const rozbaleny = await page.evaluate(() => {
  ONLINE_STAV.hesloPro = 'novy@zkusebni.cz';
  const h = onlineUzivateleHtml();
  ONLINE_STAV.hesloPro = '';
  const hlavicka = (h.match(/<th[^>]*>/g) || []).length;
  const span = /colspan="(\d+)"/.exec(h);
  return { hlavicka, span: span ? Number(span[1]) : 0 };
});
test('řádek resetu hesla překlenuje celou tabulku',
  rozbaleny.span === rozbaleny.hlavicka, JSON.stringify(rozbaleny));

/* --- žádná tichá chyba --------------------------------------------------- */

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await prohlizec.close();
server.close();

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
