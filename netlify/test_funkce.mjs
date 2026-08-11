/* Lokální test online databáze (mimo Netlify): náhradní úložiště v paměti,
 * TAJEMSTVI_RELACE a ADMIN_INIT_HESLO jen pro tenhle běh testu. */
process.env.TAJEMSTVI_RELACE = 'testovaci-tajemstvi-jen-pro-lokalni-beh';
process.env.ADMIN_INIT_HESLO = 'Docasne.Heslo.123';
const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async seznam(prefix) { return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (prefix || '')))
    .map(x => x.slice(nazev.length + 1)); },
});

import prihlaseni from './functions/prihlaseni.mjs';
import ja from './functions/ja.mjs';
import uzivatele from './functions/uzivatele.mjs';
import program from './functions/program.mjs';
import firma from './functions/firma.mjs';
import zakazky from './functions/zakazky.mjs';
import zaloha from './functions/zaloha.mjs';
import zalohaNocni from './functions/zaloha_nocni.mjs';
import zalohaVynuceno from './functions/zaloha_vynuceno.mjs';
import { ADMIN_EMAIL } from './lib/sdilene.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const zk = require('../src/zakazka.js');
const ZC = require('../src/zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const post = (fn, url, telo, cookie) => fn(new Request(url, { method: 'POST',
  headers: cookie ? { cookie } : {}, body: JSON.stringify(telo) }));
const get = (fn, url, cookie) => fn(new Request(url, { headers: cookie ? { cookie } : {} }));

/* 0) BALENÍ FUNKCÍ — proč tahle sada existuje
 *
 * 4. 8. 2026 hlásila nasazená aplikace „Neuloženo online: server odpověděl 502"
 * při každém uložení zakázky. Testy přitom byly zelené, protože Node si moduly
 * najde na disku sám. Netlify ale funkci před nasazením ZABALÍ (esbuild) do
 * jednoho souboru a s sebou vezme jen to, co dokáže v kódu vystopovat. Vzor
 *
 *     const require = createRequire(import.meta.url);
 *     require('../../src/engine.js');
 *
 * vystopovat nelze: `require` je tu obyčejná proměnná, ne příkaz bundleru.
 * Zdrojáky se do balíčku nedostaly, funkce spadla už při načtení a Netlify
 * vrátilo holou 502 – bez jediné české věty, na které by se dalo stavět.
 * Padly tak všechny čtyři funkce s tímhle vzorem (/api/zakazky, /api/program,
 * /api/firma, /api/vypocet), zatímco zálohy a účty, které zdrojáky nepotřebují,
 * běžely dál. Odtud i ta matoucí zpráva „zálohy fungují, ukládání ne".
 *
 * Kontroly níž hlídají, aby se to nemohlo vrátit: v serverovém kódu nesmí být
 * ani jeden `createRequire`, jádro se natahuje jediným místem (jadro_moduly.cjs,
 * kde je `require` skutečný příkaz CommonJS a bundler ho vystopuje) a všechny
 * cesty v něm musí na disku existovat. */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = dirname(fileURLToPath(import.meta.url));
const serverovéSoubory = [
  ...readdirSync(resolve(KOREN, 'functions')).filter(f => f.endsWith('.mjs')).map(f => 'functions/' + f),
  ...readdirSync(resolve(KOREN, 'lib')).filter(f => /\.(mjs|cjs)$/.test(f)).map(f => 'lib/' + f),
];

/* Komentáře se před kontrolou odstraní. Bez toho by kontrola hlásila i soubory,
 * které o starém vzoru jen VYPRAVUJÍ – a právě takové tu jsou dva: rozbor chyby
 * v lib/jadro_moduly.cjs a poznámka v functions/vypocet.mjs. Vysvětlení chyby
 * je cenné a nesmí ho test tlačit ven; hlídá se skutečný kód. */
const bezKomentaru = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')      // blokové komentáře
  .replace(/^\s*\/\/.*$/gm, ' ');         // řádkové komentáře na začátku řádku

const kodSouboru = new Map(serverovéSoubory.map(
  f => [f, bezKomentaru(readFileSync(resolve(KOREN, f), 'utf8'))]));

const sCreateRequire = serverovéSoubory.filter(f => /createRequire/.test(kodSouboru.get(f)));
test('žádná serverová funkce nesahá na zdrojáky přes createRequire (bundler to neuveze)',
  sCreateRequire.length === 0, sCreateRequire.join(', '));

/* Pojistka na pojistku: kontrola výš by byla k ničemu, kdyby `bezKomentaru`
 * omylem vymazalo i kód. Na známém vzorku se ověří, že maže jen komentáře. */
test('odstraňovač komentářů nechává kód být',
  bezKomentaru('/* a */ const x = 1; // b\n  // c\n  const y = 2;').includes('const x = 1;')
  && bezKomentaru('/* a */ const x = 1;\n  // c\n  const y = 2;').includes('const y = 2;')
  && !bezKomentaru('/* createRequire */ const x = 1;').includes('createRequire'));

test('jádro pro server je na jednom místě (lib/jadro_moduly.cjs)',
  existsSync(resolve(KOREN, 'lib/jadro_moduly.cjs')));

/* Všechny relativní cesty, na které serverový kód sahá – ať už importem
 * nebo requirem – musí existovat. Překlep v cestě se jinak pozná až
 * v nasazení, a zase jako 502 bez vysvětlení. */
let cestKontrolovano = 0;
for (const f of serverovéSoubory) {
  const text = kodSouboru.get(f);
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
    cestKontrolovano++;
    test('cesta ' + m[1] + ' z ' + f + ' existuje',
      existsSync(resolve(KOREN, dirname(f), m[1])));
  }
}
test('relativní cesty se opravdu kontrolovaly (našlo se jich víc než deset)', cestKontrolovano > 10, cestKontrolovano);

/* Každá funkce musí vyvézt obsluhu a adresu (nebo rozvrh u noční dávky).
 * Funkce bez `path` se nedá zavolat, funkce bez `default` se nedá spustit. */
for (const jm of readdirSync(resolve(KOREN, 'functions')).filter(f => f.endsWith('.mjs'))) {
  const mod = await import('./functions/' + jm);
  test(jm + ' vyváží obsluhu i nastavení',
    typeof mod.default === 'function' && !!(mod.config && (mod.config.path || mod.config.schedule)));
}

/* 1) bez přihlášení nikam */
test('program bez přihlášení odmítnut', (await get(program, 'http://x/api/program')).status === 401);
test('zakázky bez přihlášení odmítnuty', (await get(zakazky, 'http://x/api/zakazky')).status === 401);

/* 2) první přihlášení administrátora (bootstrap z prostředí) */
const spatne = await post(prihlaseni, 'http://x/api/prihlaseni', { email: ADMIN_EMAIL, heslo: 'jine' });
test('špatné heslo odmítnuto', spatne.status === 401);
const r1 = await post(prihlaseni, 'http://x/api/prihlaseni', { email: ADMIN_EMAIL, heslo: 'Docasne.Heslo.123' });
const o1 = await r1.json();
test('bootstrap administrátora funguje', o1.ok && o1.role === 'Administrátor', JSON.stringify(o1));
const cookie = (r1.headers.get('set-cookie') || '').split(';')[0];
test('relace se vydala v cookie', cookie.startsWith('relace='));
test('/api/ja zná přihlášeného', (await (await get(ja, 'http://x/api/ja', cookie)).json()).email === ADMIN_EMAIL);

/* 3) uživatelé: založení obchodníka + jeho omezená práva */
const z1 = await (await post(uzivatele, 'http://x/api/uzivatele', { akce: 'zaloz', email: 'obchodnik@engineers-cz.cz', jmeno: 'Test Obchodník', role: 'Obchodník', heslo: 'ObchodHeslo1' }, cookie)).json();
test('administrátor založí účet', z1.ok === true, JSON.stringify(z1));
const r2 = await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'obchodnik@engineers-cz.cz', heslo: 'ObchodHeslo1' });
const cookieObch = (r2.headers.get('set-cookie') || '').split(';')[0];
test('obchodník se přihlásí', (await r2.json()).role === 'Obchodník');
test('obchodník NEspravuje uživatele', (await get(uzivatele, 'http://x/api/uzivatele', cookieObch)).status === 403);
test('obchodník NEzaloží účet (POST admin akce)', (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'x@y.cz', role: 'Obchodník', heslo: 'HesloHeslo1' }, cookieObch)).status === 403);

/* 3b) vlastní heslo: každý přihlášený, ale jen se znalostí starého */
test('změna vlastního hesla se ŠPATNÝM starým heslem se odmítne',
  (await post(uzivatele, 'http://x/api/uzivatele', { akce: 'mojeheslo', stare: 'spatne', nove: 'NoveHeslo123' }, cookieObch)).status === 401);
test('příliš krátké nové heslo se odmítne',
  (await post(uzivatele, 'http://x/api/uzivatele', { akce: 'mojeheslo', stare: 'ObchodHeslo1', nove: 'kratke' }, cookieObch)).status === 400);
const mh = await (await post(uzivatele, 'http://x/api/uzivatele', { akce: 'mojeheslo', stare: 'ObchodHeslo1', nove: 'NoveHeslo123' }, cookieObch)).json();
test('obchodník si změní vlastní heslo', mh.ok === true, JSON.stringify(mh));
test('staré heslo už neplatí', (await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'obchodnik@engineers-cz.cz', heslo: 'ObchodHeslo1' })).status === 401);
test('novým heslem se přihlásí', (await (await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'obchodnik@engineers-cz.cz', heslo: 'NoveHeslo123' })).json()).ok === true);
/* administrátorský reset zpátky (bez znalosti starého — to je jeho role) */
test('administrátor resetuje heslo bez znalosti starého',
  (await (await post(uzivatele, 'http://x/api/uzivatele', { akce: 'heslo', email: 'obchodnik@engineers-cz.cz', heslo: 'ObchodHeslo1' }, cookie)).json()).ok === true);
test('po resetu platí heslo od administrátora', (await (await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'obchodnik@engineers-cz.cz', heslo: 'ObchodHeslo1' })).json()).ok === true);

/* 4) program: zveřejnění (admin) a čtení (obchodník) */
const pub = await (await post(program, 'http://x/api/program', { cenik: ZC.zkusebniCenik(), cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1, maxGlobalni: 0.3, stropy: { 'Obchodník': 0.05 } }, poznamka: 'první online verze' }, cookie)).json();
test('administrátor zveřejní ceník (verze 1)', pub.ok && pub.verze === 1, JSON.stringify(pub));
test('obchodník ceník zveřejnit NEsmí', (await post(program, 'http://x/api/program', { cenik: {} }, cookieObch)).status === 403);
const cteni = await (await get(program, 'http://x/api/program', cookieObch)).json();
test('obchodník platný ceník přečte', cteni.ok && cteni.db.platny.verze === 1);
const pub2 = await (await post(program, 'http://x/api/program', { cenik: ZC.zkusebniCenik(), cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1, maxGlobalni: 0.3, stropy: { 'Obchodník': 0.05 } } }, cookie)).json();
test('beze změny se nezveřejňuje', pub2.ok === false, JSON.stringify(pub2));
const cen2 = ZC.zkusebniCenik(); cen2.profilKgKc = (cen2.profilKgKc || 0) + 1;
const pub3 = await (await post(program, 'http://x/api/program', { cenik: cen2, cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1 } }, cookie)).json();
test('změna ceny → verze 2 a stará verze do historie', pub3.ok && pub3.verze === 2, JSON.stringify(pub3));

/* 4b) firemní údaje online (4. 8. 2026) — obchodník složku _DB nemapuje,
 * takže skutečnou hlavičku nabídky má odkud vzít jen ze serveru. */
const fmod = require('../src/firma.js');
test('firma bez přihlášení odmítnuta', (await get(firma, 'http://x/api/firma')).status === 401);
const fPrazdno = await (await get(firma, 'http://x/api/firma', cookieObch)).json();
test('dokud nikdo nezveřejnil, vrací se prázdno', fPrazdno.ok === true && fPrazdno.firma === null, JSON.stringify(fPrazdno));
const fUkazkova = await post(firma, 'http://x/api/firma', { udaje: fmod.firmaDefault() }, cookie);
test('ukázkovou firmu server zveřejnit nenechá', fUkazkova.status === 400);
test('a řekne proč', /ukázkov/i.test((await fUkazkova.json()).chyba || ''));
const SKUT = fmod.firmaDefault(); delete SKUT.ukazkove;
SKUT.nazev = 'Zkušební firma pro test s.r.o.'; SKUT.ico = '12345678';
test('obchodník firmu zveřejnit NEsmí',
  (await post(firma, 'http://x/api/firma', { udaje: SKUT }, cookieObch)).status === 403);
const dira = JSON.parse(JSON.stringify(SKUT)); dira.telefon = '';
test('firma bez povinného pole se odmítne',
  (await post(firma, 'http://x/api/firma', { udaje: dira }, cookie)).status === 400);
const fPub = await (await post(firma, 'http://x/api/firma', { udaje: SKUT }, cookie)).json();
test('administrátor firmu zveřejní', fPub.ok === true && !!fPub.kdy, JSON.stringify(fPub));
const fCteni = await (await get(firma, 'http://x/api/firma', cookieObch)).json();
test('obchodník si firmu přečte', fCteni.ok && fCteni.firma.udaje.nazev === SKUT.nazev, JSON.stringify(fCteni.firma));
test('zveřejněná firma nese, kdo a kdy',
  fCteni.firma.kdo === ADMIN_EMAIL && /^\d{4}-\d{2}-\d{2}T/.test(fCteni.firma.kdy));
test('zveřejněná firma nenese značku ukázkových dat', fCteni.firma.udaje.ukazkove === undefined);

/* 5) zakázky: uložení, rejstřík, načtení, ochrana zámku */
Object.assign(globalThis, require('../src/format.js'), require('../src/engine.js'), require('../src/engine_proj.js'), require('../src/techspec.js'), require('../src/sleva.js'), require('../src/zaokrouhleni.js'), require('../src/zamek.js'));
const zm = require('../src/zamek.js');
const zak = zk.novaZakazka(); zak.cislo = '2026 - OPR - CN - 0777'; zak.nazevAkce = 'Online test';
const ul1 = await (await post(zakazky, 'http://x/api/zakazky', { zakazka: zak }, cookieObch)).json();
test('zakázka se uloží online', ul1.ok === true && !!ul1.soubor, JSON.stringify(ul1));
const rej = await (await get(zakazky, 'http://x/api/zakazky', cookieObch)).json();
test('rejstřík zakázku eviduje', rej.ok && rej.rejstrik.zakazky.length === 1 && rej.rejstrik.zakazky[0].soubor === ul1.soubor);
const nact = await (await get(zakazky, 'http://x/api/zakazky?soubor=' + encodeURIComponent(ul1.soubor), cookieObch)).json();
test('zakázka se načte zpět beze změny čísla', nact.ok && nact.zakazka.cislo === zak.cislo);
zm.zamkniVariantu(zak.varianty[0], { typ: 'nabidka', kdy: new Date().toISOString(), kdo: 'Test' });
await post(zakazky, 'http://x/api/zakazky', { zakazka: zak }, cookieObch);   // uložit se zámkem
const zakUtok = JSON.parse(JSON.stringify(zak));
zakUtok.varianty[0].data.ock.zadani.sirka = 9.99;                            // pokus změnit odeslanou nabídku
const utok = await post(zakazky, 'http://x/api/zakazky', { zakazka: zakUtok }, cookieObch);
test('uzamčená (odeslaná) nabídka se nepřepíše', utok.status === 409);

/* 6) záloha: jen admin, obsahuje program i zakázky, bez otisků hesel */
test('záloha jen pro administrátora', (await get(zaloha, 'http://x/api/zaloha', cookieObch)).status === 403);
const zal = await (await get(zaloha, 'http://x/api/zaloha', cookie)).json();
test('záloha nese program, rejstřík i zakázky', zal.ok && zal.zaloha.program.platny.verze === 2
  && Object.keys(zal.zaloha.zakazky).length === 1 && zal.zaloha.rejstrik.zakazky.length === 1);
test('záloha nese i firemní údaje', !!zal.zaloha.firma && zal.zaloha.firma.udaje.nazev === SKUT.nazev,
  JSON.stringify(zal.zaloha.firma));
test('záloha neobsahuje otisky hesel', !JSON.stringify(zal.zaloha.uzivatele).includes(':')
  || zal.zaloha.uzivatele.every(u => !u.heslo));

/* 7) noční otisk: pořizuje se sám a pod dnešním datem nese úplnou databázi
 * (na rozdíl od zálohy pro Disk VČETNĚ otisků hesel — zůstává v Blobs,
 * aby obnova nevyžadovala reset všech hesel) */
const noc = await (await zalohaNocni()).json();
test('noční otisk proběhne a vrátí dnešní den', noc.ok && noc.den === new Date().toISOString().slice(0, 10));
const otisk = await (await globalThis.__TEST_ULOZISTE('zalohy')).cti(noc.den);
test('otisk nese program, zakázky i rejstřík', !!otisk && otisk.program.platny.verze === 2
  && Object.keys(otisk.zakazky).length === 1 && otisk.rejstrik.zakazky.length === 1);
test('noční otisk nese i firemní údaje', !!otisk.firma && otisk.firma.udaje.ico === SKUT.ico);
test('otisk nese celé účty (obnova bez resetu hesel)', Array.isArray(otisk.uzivatele)
  && otisk.uzivatele.length === 2 && otisk.uzivatele.every(u => typeof u.heslo === 'string' && u.heslo.includes(':')));

/* 8) VYNUCENÁ záloha (zadání 4. 8. 2026 – „proč nefunguje automatické ani
 * vynucené online zálohování"). Noční otisk se do 4. 8. spouštět ručně
 * NEDAL: zaloha_nocni.mjs vyváží jen `schedule`, žádnou cestu, takže
 * neexistoval endpoint, kterým by šel vyvolat, ani způsob, jak zjistit,
 * jestli kdy proběhl. Otisk proto pořizuje sdílená knihovna a vedle
 * plánované funkce stojí obyčejná cesta pro administrátora. */
test('vynucená záloha jen pro administrátora',
  (await post(zalohaVynuceno, 'http://x/api/zaloha_vynuceno', {}, cookieObch)).status === 403);
test('seznam otisků jen pro administrátora',
  (await get(zalohaVynuceno, 'http://x/api/zaloha_vynuceno', cookieObch)).status === 403);
const vyn = await (await post(zalohaVynuceno, 'http://x/api/zaloha_vynuceno', {}, cookie)).json();
test('administrátor vynutí otisk', vyn.ok === true && vyn.den === new Date().toISOString().slice(0, 10), JSON.stringify(vyn));
test('vynucený otisk hlásí, kolik zakázek uložil', vyn.pocetZakazek === 1, JSON.stringify(vyn));
const vynOtisk = await (await globalThis.__TEST_ULOZISTE('zalohy')).cti(vyn.den);
test('vynucený otisk nese celou databázi', !!vynOtisk && vynOtisk.program.platny.verze === 2
  && Object.keys(vynOtisk.zakazky).length === 1 && !!vynOtisk.firma);
test('vynucený otisk je poznat od nočního podle zdroje',
  typeof vynOtisk.zdroj === 'string' && vynOtisk.zdroj.includes('vynuc'), vynOtisk && vynOtisk.zdroj);
test('vynucený otisk nese, kdo ho pořídil', vynOtisk.kdo === ADMIN_EMAIL, vynOtisk && vynOtisk.kdo);
const seznamOt = await (await get(zalohaVynuceno, 'http://x/api/zaloha_vynuceno', cookie)).json();
test('seznam otisků vrátí dnešní zálohu', seznamOt.ok && seznamOt.otisky.length >= 1
  && seznamOt.otisky[0].den === vyn.den, JSON.stringify(seznamOt));
test('seznam otisků nese zdroj i čas pořízení',
  !!seznamOt.otisky[0].porizena && !!seznamOt.otisky[0].zdroj);
/* Seznam je hlášení pro obrazovku, ne záloha sama – nesmí z Blobs vytáhnout
 * data zakázek ani otisky hesel (jinak by stačilo otevřít vývojářskou
 * konzoli a číst celou databázi jedním požadavkem). */
const seznamText = JSON.stringify(seznamOt);
test('seznam otisků neveze data zakázek', !seznamText.includes('Online test'), seznamText.slice(0, 200));
test('seznam otisků neveze otisky hesel', !seznamText.includes('heslo'), seznamText.slice(0, 200));
test('seznam otisků nese jen souhrn (den, čas, zdroj, počty)',
  Object.keys(seznamOt.otisky[0]).every(k => ['den', 'porizena', 'zdroj', 'kdo', 'pocetZakazek', 'pocetUctu'].includes(k)),
  Object.keys(seznamOt.otisky[0]).join(','));

/* ============================================================
 * ADRESA HLAVNÍHO ADMINISTRÁTORA JEN NA JEDNOM MÍSTĚ (#95, 9. 8. 2026)
 *
 * Do 8. 8. 2026 byla adresa napsaná dvakrát: na serveru v `ADMIN_EMAIL`,
 * kde ji server vymáhá, a znovu v prohlížeči v `online_ui.js`, kde jen
 * rozhodovala, že se hlavní účet nedá zbavit role ani vypnout. Nebyla to
 * díra — server si pojistku hlídá sám. Byla to past na údržbu: kdyby se
 * adresa změnila na jednom místě a na druhém ne, choval by se prohlížeč
 * jinak než server a nikdo by nepoznal proč.
 *
 * Kontrola prochází zdrojáky aplikace i serveru (testy vynechává, ty se
 * musí umět přihlásit) a trvá na jediném výskytu.
 * ============================================================ */

const KOREN_PROJEKTU = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRESKOCIT = /(^|\/)(node_modules|dist|_soukrome|\.git|deploy|navrh)(\/|$)|(^|\/)(test_|overit_|snimky_|mutace\.mjs)/;

function projdi(slozka, nalezy) {
  for (const jmeno of readdirSync(slozka)) {
    const cesta = join(slozka, jmeno);
    const rel = cesta.slice(KOREN_PROJEKTU.length + 1);
    if (PRESKOCIT.test(rel)) continue;
    if (statSync(cesta).isDirectory()) { projdi(cesta, nalezy); continue; }
    if (!/\.(js|mjs|json|html|toml|py)$/.test(jmeno)) continue;
    const obsah = readFileSync(cesta, 'utf8');
    const kolik = obsah.split(ADMIN_EMAIL).length - 1;
    if (kolik) nalezy.push(rel + ' (' + kolik + 'x)');
  }
  return nalezy;
}

const vyskyty = [];
for (const kde of ['src', 'netlify', 'server']) projdi(join(KOREN_PROJEKTU, kde), vyskyty);
test('adresa hlavního administrátora je ve zdrojácích právě jednou',
  vyskyty.length === 1, vyskyty.join(', ') || 'nikde');
test('a to v netlify/lib/sdilene.mjs, odkud si ji vyzvedne server i prohlížeč',
  vyskyty.length === 1 && vyskyty[0].startsWith('netlify/lib/sdilene.mjs'), vyskyty.join(', '));

const uiKod = readFileSync(join(KOREN_PROJEKTU, 'src', 'ui', 'online_ui.js'), 'utf8');
test('prohlížeč hlavní účet nepoznává podle e-mailu, ale podle příznaku ze serveru',
  /const hlavni = !!u\.hlavni/.test(uiKod));

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
