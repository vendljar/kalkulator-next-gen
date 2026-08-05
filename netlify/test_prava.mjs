/* ============================================================
 * KŘÍŽOVÁ MATICE OPRÁVNĚNÍ ONLINE VRSTVY (bezpečnostní audit 5. 8. 2026)
 *
 * PROČ TAHLE SADA EXISTUJE VEDLE test_funkce.mjs
 *
 * test_funkce.mjs ověřuje, že online vrstva DĚLÁ, co má: ceník se zveřejní,
 * zakázka se uloží, záloha se pořídí. Práva v ní jsou ověřená jen tam, kudy
 * zrovna vedla cesta příběhu — „obchodník NEspravuje uživatele", „záloha jen
 * pro administrátora". To je málo. Díra v právech nevzniká na cestě, kterou
 * jsme šli; vzniká na té, na kterou nikdo nesáhl.
 *
 * Tahle sada proto jde systematicky: KAŽDÁ serverová cesta × KAŽDÁ role
 * × nepřihlášený, jedno políčko = jeden test. Když někdo přidá funkci
 * a nezapíše ji do matice, spadne kontrola úplnosti na konci — matice se
 * porovnává se seznamem souborů ve `functions/`. Tím se drží pravidlo, že
 * nová cesta ven se nedá zavést mlčky.
 *
 * ROLE: Obchodník / Vedoucí / Administrátor (sdilene.mjs → ROLE).
 * Vedoucí dnes NEMÁ na serveru žádné právo navíc oproti obchodníkovi —
 * jeho role se uplatňuje jen ve schvalování slev v prohlížeči. Matice to
 * říká nahlas, aby se z toho nestal nepsaný předpoklad.
 *
 * Spouští se `node netlify/test_prava.mjs`.
 * ============================================================ */

process.env.TAJEMSTVI_RELACE = 'testovaci-tajemstvi-jen-pro-lokalni-beh';
process.env.ADMIN_INIT_HESLO = 'Docasne.Heslo.123';

const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async seznam(prefix) {
    return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (prefix || '')))
      .map(x => x.slice(nazev.length + 1));
  },
});

import prihlaseni from './functions/prihlaseni.mjs';
import odhlaseni from './functions/odhlaseni.mjs';
import ja from './functions/ja.mjs';
import uzivatele from './functions/uzivatele.mjs';
import program from './functions/program.mjs';
import firma from './functions/firma.mjs';
import zakazky from './functions/zakazky.mjs';
import vypocet from './functions/vypocet.mjs';
import zaloha from './functions/zaloha.mjs';
import zalohaNocni from './functions/zaloha_nocni.mjs';
import zalohaVynuceno from './functions/zaloha_vynuceno.mjs';
import zdravi from './functions/zdravi.mjs';
import { config as configNocni } from './functions/zaloha_nocni.mjs';
import { ADMIN_EMAIL, ROLE } from './lib/sdilene.mjs';

import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const KOREN = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const zk = require('../src/zakazka.js');
const ZC = require('../src/zkusebni_cenik.js');
const fmod = require('../src/firma.js');
const CEN = require('../src/cenik.js');
const zam = require('../src/zamek.js');

let ok = 0, fail = 0;
const selhalo = [];
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; selhalo.push(n); console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const post = (fn, url, telo, cookie) => fn(new Request(url, {
  method: 'POST', headers: cookie ? { cookie } : {}, body: JSON.stringify(telo) }));
const get = (fn, url, cookie) => fn(new Request(url, { headers: cookie ? { cookie } : {} }));

async function prihlas(email, heslo) {
  const r = await post(prihlaseni, 'http://x/api/prihlaseni', { email, heslo });
  const t = await r.clone().json();
  if (!t.ok) throw new Error('Přihlášení selhalo pro ' + email + ': ' + JSON.stringify(t));
  return (r.headers.get('set-cookie') || '').split(';')[0];
}

/* ============================================================
 * PŘÍPRAVA: jeden účet od každé role + data, na kterých se dá pracovat
 * ============================================================ */

const cAdmin = await prihlas(ADMIN_EMAIL, 'Docasne.Heslo.123');

const UCTY = {
  'Obchodník': { email: 'matice.obchodnik@example.com', heslo: 'MaticeHeslo1' },
  'Vedoucí': { email: 'matice.vedouci@example.com', heslo: 'MaticeHeslo2' },
  'Administrátor': { email: 'matice.admin@example.com', heslo: 'MaticeHeslo3' },
};
for (const role of ROLE) {
  const u = UCTY[role];
  const r = await (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'zaloz', email: u.email, jmeno: 'Matice ' + role, role, heslo: u.heslo }, cAdmin)).json();
  if (!r.ok) throw new Error('Účet ' + role + ' se nezaložil: ' + JSON.stringify(r));
  u.cookie = await prihlas(u.email, u.heslo);
}

/* Obětní účet, na kterém se zkouší správa cizích účtů (reset hesla, změna
 * role, vypnutí) — nikdy na účtech, kterými se matice sama přihlašuje. */
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'terc@example.com', jmeno: 'Terč', role: 'Obchodník', heslo: 'TercHeslo1' }, cAdmin);

/* Skutečná firma (ne ukázková) a platný ceník, aby „povolená" políčka
 * matice opravdu něco udělala a nespadla na chybějících datech. */
const FIRMA = fmod.firmaDefault();
delete FIRMA.ukazkove;
FIRMA.nazev = 'Zkušební firma pro matici s.r.o.';
FIRMA.ico = '12345678';
await post(firma, 'http://x/api/firma', { udaje: FIRMA }, cAdmin);

let cenikPoradi = 0;
function cenikJinak() {
  const c = ZC.zkusebniCenik();
  /* Pokaždé jiná cena profilů → server nesmí odpovědět „beze změny". Musí to
   * být políčko, které se počítá do otisku (cenikSet nad C.profilasKgKc);
   * přilepený vlastní klíč by se při normalizaci zahodil a matice by pak
   * hlásila 400 tam, kde ve skutečnosti práva drží. */
  CEN.cenikSet(c, 'C.profilasKgKc',
    (CEN.cenikGet(c, 'C.profilasKgKc') || 0) + (++cenikPoradi));
  return c;
}
await post(program, 'http://x/api/program',
  { cenik: cenikJinak(), cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1 } }, cAdmin);

/* Jedna uložená zakázka, aby šlo testovat čtení konkrétního souboru. */
function zakazkaCislo(cislo) {
  const z = zk.novaZakazka();
  z.cislo = cislo;
  z.nazevAkce = 'Matice práv';
  return z;
}
const ulozena = await (await post(zakazky, 'http://x/api/zakazky',
  { zakazka: zakazkaCislo('2026 - OPR - CN - 0901') }, cAdmin)).json();
if (!ulozena.ok) throw new Error('Přípravná zakázka se neuložila: ' + JSON.stringify(ulozena));

/* ============================================================
 * MATICE
 *
 * ocekavani: co má vrátit nepřihlášený / Obchodník / Vedoucí / Administrátor
 *   'ok'      → 2xx (akce se povoluje)
 *   401 / 403 → přesný stav (401 = nepřihlášen, 403 = nedostatečná role)
 *   'verejne' → cesta je veřejná ZÁMĚRNĚ (přihlašovací a stavové cesty)
 * ============================================================ */

const R = ['nepřihlášený', 'Obchodník', 'Vedoucí', 'Administrátor'];
const cookieRole = (r) => (r === 'nepřihlášený' ? null : UCTY[r].cookie);

const PRIHLASENY_OK = { 'nepřihlášený': 401, 'Obchodník': 'ok', 'Vedoucí': 'ok', 'Administrátor': 'ok' };
const JEN_ADMIN = { 'nepřihlášený': 401, 'Obchodník': 403, 'Vedoucí': 403, 'Administrátor': 'ok' };

const MATICE = [
  { fn: zdravi, soubor: 'zdravi.mjs', nazev: 'zdraví (GET /api/zdravi)', metoda: 'GET',
    url: 'http://x/api/zdravi',
    proc: 'stavová cesta pro kontrolu, že server žije — nesmí nést nic z databáze',
    prava: { 'nepřihlášený': 'verejne', 'Obchodník': 'verejne', 'Vedoucí': 'verejne', 'Administrátor': 'verejne' } },

  { fn: prihlaseni, soubor: 'prihlaseni.mjs', nazev: 'přihlášení (POST /api/prihlaseni)', metoda: 'POST',
    url: 'http://x/api/prihlaseni', telo: () => ({ email: 'nikdo@example.com', heslo: 'ChybneHeslo1' }),
    proc: 'jediná cesta, která MUSÍ být otevřená všem — jinak se nikdo nepřihlásí',
    prava: { 'nepřihlášený': 401, 'Obchodník': 401, 'Vedoucí': 401, 'Administrátor': 401 },
    poznamka: 'se špatným heslem vrací 401 každému, i už přihlášenému' },

  { fn: odhlaseni, soubor: 'odhlaseni.mjs', nazev: 'odhlášení (POST /api/odhlaseni)', metoda: 'POST',
    url: 'http://x/api/odhlaseni', telo: () => ({}),
    proc: 'smazání cookie musí projít i nepřihlášenému — jinak by šlo uvíznout v rozbité relaci',
    prava: { 'nepřihlášený': 'verejne', 'Obchodník': 'verejne', 'Vedoucí': 'verejne', 'Administrátor': 'verejne' } },

  { fn: ja, soubor: 'ja.mjs', nazev: 'já (GET /api/ja)', metoda: 'GET', url: 'http://x/api/ja',
    proc: 'kdo je přihlášen — po obnovení stránky se tím obnovuje stav aplikace',
    prava: PRIHLASENY_OK },

  { fn: uzivatele, soubor: 'uzivatele.mjs', nazev: 'uživatelé — seznam (GET /api/uzivatele)', metoda: 'GET',
    url: 'http://x/api/uzivatele',
    proc: 'seznam kolegů s rolemi je interní údaj',
    prava: JEN_ADMIN },

  { fn: uzivatele, nazev: 'uživatelé — založení účtu (POST akce=zaloz)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: (r) => ({ akce: 'zaloz', email: 'novy.' + r.replace(/\W/g, '') + '@example.com',
                    jmeno: 'Nový', role: 'Obchodník', heslo: 'NovyHeslo123' }),
    proc: 'zakládat účty smí jen administrátor — jinak by si kdokoli udělal druhý účet s vyšší rolí',
    prava: JEN_ADMIN },

  { fn: uzivatele, nazev: 'uživatelé — reset cizího hesla (POST akce=heslo)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: () => ({ akce: 'heslo', email: 'terc@example.com', heslo: 'ResetHeslo123' }),
    proc: 'rozhodnutí 3. 8. 2026: reset hesla dělá vždy administrátor',
    prava: JEN_ADMIN },

  { fn: uzivatele, nazev: 'uživatelé — změna role (POST akce=role)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: () => ({ akce: 'role', email: 'terc@example.com', role: 'Obchodník' }),
    proc: 'povýšení sebe sama je klasická cesta k převzetí aplikace',
    prava: JEN_ADMIN },

  { fn: uzivatele, nazev: 'uživatelé — zapnutí/vypnutí účtu (POST akce=aktivni)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: () => ({ akce: 'aktivni', email: 'terc@example.com', aktivni: true }),
    proc: 'vypnutím cizího účtu by šlo vyřadit kolegu z práce',
    prava: JEN_ADMIN },

  { fn: uzivatele, nazev: 'moje heslo (POST akce=mojeheslo)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: (r) => (r === 'nepřihlášený'
      ? { akce: 'mojeheslo', stare: 'CokoliHeslo1', nove: 'CokoliHeslo2' }
      : { akce: 'mojeheslo', stare: UCTY[r].heslo, nove: UCTY[r].heslo }),
    proc: 'vlastní heslo si mění každý sám, ale jen se znalostí toho starého',
    prava: PRIHLASENY_OK },

  { fn: program, soubor: 'program.mjs', nazev: 'program — čtení ceníku (GET /api/program)', metoda: 'GET',
    url: 'http://x/api/program',
    proc: 'platný ceník potřebuje ke kalkulaci každý obchodník',
    prava: PRIHLASENY_OK },

  { fn: program, nazev: 'program — zveřejnění ceníku (POST /api/program)', metoda: 'POST',
    url: 'http://x/api/program',
    telo: () => ({ cenik: cenikJinak(), cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1 } }),
    proc: 'pravidlo: platný ceník smí zveřejnit jen administrátor',
    prava: JEN_ADMIN },

  { fn: firma, soubor: 'firma.mjs', nazev: 'firma — čtení údajů (GET /api/firma)', metoda: 'GET',
    url: 'http://x/api/firma',
    proc: 'hlavičku nabídky potřebuje každý, kdo nabídku tiskne',
    prava: PRIHLASENY_OK },

  { fn: firma, nazev: 'firma — zveřejnění údajů (POST /api/firma)', metoda: 'POST',
    url: 'http://x/api/firma',
    telo: (r) => ({ udaje: { ...FIRMA, nazev: FIRMA.nazev + ' / ' + r } }),
    proc: 'firemní údaje jdou do hlavičky každé nabídky — mění je jen administrátor',
    prava: JEN_ADMIN },

  { fn: zakazky, soubor: 'zakazky.mjs', nazev: 'zakázky — rejstřík (GET /api/zakazky)', metoda: 'GET',
    url: 'http://x/api/zakazky',
    proc: 'společná databáze zakázek firmy — vidí do ní každý přihlášený',
    prava: PRIHLASENY_OK },

  { fn: zakazky, nazev: 'zakázky — načtení jedné (GET /api/zakazky?soubor=…)', metoda: 'GET',
    url: 'http://x/api/zakazky?soubor=' + encodeURIComponent(ulozena.soubor),
    proc: 'zakázky se ve firmě sdílejí; omezení „jen své" nikdo nezadal',
    prava: PRIHLASENY_OK },

  { fn: zakazky, nazev: 'zakázky — uložení (POST /api/zakazky)', metoda: 'POST',
    url: 'http://x/api/zakazky',
    telo: (r) => ({ zakazka: zakazkaCislo('2026 - OPR - CN - 09' + (10 + R.indexOf(r))) }),
    proc: 'ukládat zakázky je běžná práce obchodníka',
    prava: PRIHLASENY_OK },

  { fn: vypocet, soubor: 'vypocet.mjs', nazev: 'výpočet (POST /api/vypocet)', metoda: 'POST',
    url: 'http://x/api/vypocet',
    telo: () => ({ zakazka: zakazkaCislo('2026 - OPR - CN - 0999'), program: {} }),
    proc: 'serverový výpočet je práce navíc pro server a patří dovnitř aplikace, ne ven',
    prava: PRIHLASENY_OK },

  { fn: zaloha, soubor: 'zaloha.mjs', nazev: 'záloha ke stažení (GET /api/zaloha)', metoda: 'GET',
    url: 'http://x/api/zaloha',
    proc: 'jedním požadavkem vydá celou databázi — nejcitlivější cesta v aplikaci',
    prava: JEN_ADMIN },

  { fn: zalohaVynuceno, soubor: 'zaloha_vynuceno.mjs', nazev: 'vynucená záloha — přehled (GET /api/zaloha_vynuceno)',
    metoda: 'GET', url: 'http://x/api/zaloha_vynuceno',
    proc: 'kdy naposledy vznikla záloha je provozní údaj správce',
    prava: JEN_ADMIN },

  { fn: zalohaVynuceno, nazev: 'vynucená záloha — pořízení (POST /api/zaloha_vynuceno)', metoda: 'POST',
    url: 'http://x/api/zaloha_vynuceno', telo: () => ({ duvod: 'matice' }),
    proc: 'zálohu vyvolává správce; běžný uživatel by tím jen zatěžoval server',
    prava: JEN_ADMIN },
];

console.log('\n===== KŘÍŽOVÁ MATICE: cesta × role =====\n');

for (const radek of MATICE) {
  for (const role of R) {
    const c = cookieRole(role);
    const odpoved = radek.metoda === 'GET'
      ? await get(radek.fn, radek.url, c)
      : await post(radek.fn, radek.url, radek.telo ? radek.telo(role) : {}, c);
    const cekano = radek.prava[role];
    const stav = odpoved.status;
    let sedi, popis;
    if (cekano === 'ok' || cekano === 'verejne') { sedi = stav < 400; popis = 'projde (2xx)'; }
    else { sedi = stav === cekano; popis = 'odmítnuto ' + cekano; }
    test(`${radek.nazev} · ${role} → ${popis}`, sedi, 'vrátil ' + stav);
  }
}

/* Kontrola úplnosti: každý soubor ve functions/ musí být v matici zastoupen.
 * Bez toho by nová cesta ven mohla přibýt, aniž by se kdy ověřilo, kdo na ni smí. */
const souboryFunkci = readdirSync(resolve(KOREN, 'functions')).filter(f => f.endsWith('.mjs'));
const vMatici = new Set(MATICE.map(r => r.soubor).filter(Boolean));
vMatici.add('zaloha_nocni.mjs');   // plánovaná funkce, nemá cestu — ověřuje se níž zvlášť
const chybi = souboryFunkci.filter(f => !vMatici.has(f));
test('matice pokrývá všechny serverové funkce', chybi.length === 0,
  'v matici chybí: ' + chybi.join(', '));

/* ============================================================
 * RELACE: co všechno se NESMÍ dát vydávat za přihlášení
 * ============================================================ */

console.log('\n===== RELACE A PODVRŽENÍ =====\n');

const cObch = UCTY['Obchodník'].cookie;
const telo64 = cObch.replace('relace=', '').split('.')[0];
const podpis64 = cObch.split('.')[1];

test('podvržená relace s cizím podpisem neprojde',
  (await get(ja, 'http://x/api/ja', 'relace=' + telo64 + '.' + 'x'.repeat(podpis64.length))).status === 401);

const telaAdmin = Buffer.from(JSON.stringify({
  email: UCTY['Obchodník'].email, role: 'Administrátor', exp: Date.now() + 3600000 })).toString('base64url');
test('přepsaná role v těle relace bez platného podpisu neprojde',
  (await get(zaloha, 'http://x/api/zaloha', 'relace=' + telaAdmin + '.' + podpis64)).status === 401);

const podpisJinym = (t) => createHmac('sha256', 'uplne-jine-tajemstvi-nez-server').update(t).digest('base64url');
test('relace podepsaná jiným tajemstvím neprojde',
  (await get(ja, 'http://x/api/ja', 'relace=' + telaAdmin + '.' + podpisJinym(telaAdmin))).status === 401);

const podpisSpravnym = (t) => createHmac('sha256', process.env.TAJEMSTVI_RELACE).update(t).digest('base64url');
const teloProsle = Buffer.from(JSON.stringify({
  email: UCTY['Obchodník'].email, role: 'Obchodník', exp: Date.now() - 1000 })).toString('base64url');
test('prošlá relace neprojde, i když je podepsaná správně',
  (await get(ja, 'http://x/api/ja', 'relace=' + teloProsle + '.' + podpisSpravnym(teloProsle))).status === 401);

test('nesmyslný obsah cookie neshodí server (vrátí 401)',
  (await get(ja, 'http://x/api/ja', 'relace=tohle.neni.relace')).status === 401);
test('prázdná cookie relace neprojde',
  (await get(ja, 'http://x/api/ja', 'relace=')).status === 401);

/* Role se bere VÝHRADNĚ z podepsané relace. Kdyby ji šlo poslat v těle nebo
 * v hlavičce, stačilo by k převzetí aplikace přepsat jeden řádek požadavku. */
test('role poslaná v těle požadavku roli nepovýší',
  (await post(program, 'http://x/api/program',
    { role: 'Administrátor', cenik: cenikJinak() }, cObch)).status === 403);
test('role poslaná v hlavičce roli nepovýší',
  (await zaloha(new Request('http://x/api/zaloha',
    { headers: { cookie: cObch, 'x-role': 'Administrátor', role: 'Administrátor' } }))).status === 403);

const prihlaseniOdpoved = await post(prihlaseni, 'http://x/api/prihlaseni',
  { email: UCTY['Obchodník'].email, heslo: UCTY['Obchodník'].heslo, role: 'Administrátor' });
test('role vnucená při přihlášení se ignoruje (platí role účtu)',
  (await prihlaseniOdpoved.json()).role === 'Obchodník');

const setCookie = prihlaseniOdpoved.headers.get('set-cookie') || '';
test('cookie relace je HttpOnly (nepřečte ji JavaScript stránky)', /HttpOnly/i.test(setCookie), setCookie);
test('cookie relace je Secure (nejde po nešifrovaném spojení)', /Secure/i.test(setCookie), setCookie);
test('cookie relace je SameSite=Lax (brání cizí stránce poslat požadavek za uživatele)',
  /SameSite=Lax/i.test(setCookie), setCookie);
test('cookie relace má omezenou platnost', /Max-Age=\d+/.test(setCookie), setCookie);

/* ============================================================
 * ÚČET SE MEZITÍM ZMĚNIL — relace platí 12 hodin, stav účtu se ale mění hned
 *
 * Tohle je jádro auditu. Role i příznak „aktivní" jsou zapečené v cookie
 * v okamžiku přihlášení. Kdyby se práva odvozovala JEN z cookie, znamenalo by
 * to: vypnutý účet pracuje dál až 12 hodin a snížená role si až 12 hodin drží
 * stará práva. Pro firmu je to přesně ten okamžik, kdy na právech záleží —
 * kolega odchází a jeho účet se vypíná.
 * ============================================================ */

console.log('\n===== ZMĚNA ÚČTU BĚHEM PLATNÉ RELACE =====\n');

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'degradovany@example.com', jmeno: 'Bývalý správce',
    role: 'Administrátor', heslo: 'DegradHeslo1' }, cAdmin);
const cDegrad = await prihlas('degradovany@example.com', 'DegradHeslo1');
test('správce zálohu stáhne, dokud správcem je',
  (await get(zaloha, 'http://x/api/zaloha', cDegrad)).status === 200);
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'role', email: 'degradovany@example.com', role: 'Obchodník' }, cAdmin);
test('po snížení role stará relace na zálohu už nesmí',
  (await get(zaloha, 'http://x/api/zaloha', cDegrad)).status === 403);
test('po snížení role stará relace nesmí ani zveřejnit ceník',
  (await post(program, 'http://x/api/program', { cenik: cenikJinak() }, cDegrad)).status === 403);

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'vypnuty@example.com', jmeno: 'Odešel',
    role: 'Obchodník', heslo: 'VypnutyHeslo1' }, cAdmin);
const cVypnuty = await prihlas('vypnuty@example.com', 'VypnutyHeslo1');
test('účet před vypnutím normálně pracuje',
  (await get(zakazky, 'http://x/api/zakazky', cVypnuty)).status === 200);
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'aktivni', email: 'vypnuty@example.com', aktivni: false }, cAdmin);
test('vypnutý účet se znovu nepřihlásí',
  (await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: 'vypnuty@example.com', heslo: 'VypnutyHeslo1' })).status === 401);
test('vypnutý účet nepracuje dál ani s už vydanou relací',
  (await get(zakazky, 'http://x/api/zakazky', cVypnuty)).status === 401);
test('vypnutý účet se nedozví ani, kdo je přihlášen',
  (await get(ja, 'http://x/api/ja', cVypnuty)).status === 401);

/* Opačný směr: povýšení se má projevit hned, jinak by správce musel kolegu
 * posílat, ať se odhlásí a přihlásí — a to nikdo neudělá. */
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'povyseny@example.com', jmeno: 'Nový správce',
    role: 'Obchodník', heslo: 'PovysenyHeslo1' }, cAdmin);
const cPovyseny = await prihlas('povyseny@example.com', 'PovysenyHeslo1');
test('obchodník na zálohu nesmí', (await get(zaloha, 'http://x/api/zaloha', cPovyseny)).status === 403);
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'role', email: 'povyseny@example.com', role: 'Administrátor' }, cAdmin);
test('po povýšení platí nová role hned, bez odhlášení',
  (await get(zaloha, 'http://x/api/zaloha', cPovyseny)).status === 200);

/* Relace na účet, který v databázi není (smazaný nebo z jiné instalace). */
const teloDuch = Buffer.from(JSON.stringify({
  email: 'duch@example.com', role: 'Administrátor', exp: Date.now() + 3600000 })).toString('base64url');
test('relace na neexistující účet neprojde',
  (await get(zaloha, 'http://x/api/zaloha', 'relace=' + teloDuch + '.' + podpisSpravnym(teloDuch))).status === 401);

/* ============================================================
 * CO SE NESMÍ DOSTAT VEN
 * ============================================================ */

console.log('\n===== ÚNIK ÚDAJŮ =====\n');

const seznamUctu = await (await get(uzivatele, 'http://x/api/uzivatele', cAdmin)).json();
test('seznam účtů nenese otisky hesel',
  !JSON.stringify(seznamUctu).includes('heslo'), JSON.stringify(seznamUctu).slice(0, 200));

const jaObch = await (await get(ja, 'http://x/api/ja', cObch)).json();
test('/api/ja nenese otisk hesla ani cizí účty',
  jaObch.heslo === undefined && JSON.stringify(jaObch).indexOf(ADMIN_EMAIL) === -1,
  JSON.stringify(jaObch));

const zdraviTelo = await (await get(zdravi, 'http://x/api/zdravi')).json();
const zdraviText = JSON.stringify(zdraviTelo);
test('/api/zdravi neprozradí tajemství relace', !zdraviText.includes(process.env.TAJEMSTVI_RELACE));
test('/api/zdravi neprozradí zaváděcí heslo administrátora', !zdraviText.includes(process.env.ADMIN_INIT_HESLO));
test('/api/zdravi nenese data z databáze',
  !zdraviText.includes('Matice práv') && !zdraviText.includes(FIRMA.ico), zdraviText);

const chybaNeplatnyJson = await uzivatele(new Request('http://x/api/uzivatele',
  { method: 'POST', headers: { cookie: cAdmin }, body: 'tohle{není}json' }));
test('neplatný JSON vrátí 400, ne pád serveru', chybaNeplatnyJson.status === 400);
test('chybová hláška neprozrazuje vnitřek serveru',
  !/at \/|node:internal|\.mjs:\d+/.test(JSON.stringify(await chybaNeplatnyJson.json())));

/* Klíč zakázky se skládá jako 'z/' + jméno souboru. Kdyby se dal podvrhnout,
 * šlo by číst rejstřík nebo klíče jiného úložiště. */
for (const podvrh of ['../_rejstrik', '_rejstrik', '../../uzivatele/' + ADMIN_EMAIL, 'z/../_rejstrik']) {
  const o = await get(zakazky, 'http://x/api/zakazky?soubor=' + encodeURIComponent(podvrh), cObch);
  const t = await o.json();
  test('podvržené jméno souboru nic nevydá: ' + podvrh,
    o.status === 404 || (t.ok === true && t.zakazka === null), JSON.stringify(t).slice(0, 160));
}

/* ============================================================
 * POJISTKY SPRÁVY ÚČTŮ
 *
 * Doplněno po mutačním testu 5. 8. 2026: schválně rozbité pojistky
 * („hlavní administrátor jde vypnout", „jde mu snížit role", „účet
 * s vymyšlenou rolí projde") tehdy prošly zeleně — tyhle zábrany
 * nikdo nehlídal. Nejsou to zábrany proti útočníkovi zvenčí, ale proti
 * omylu administrátora, který si jinak zamkne dveře od vlastní databáze.
 * ============================================================ */

console.log('\n===== POJISTKY SPRÁVY ÚČTŮ =====\n');

const vypniHlavniho = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'aktivni', email: ADMIN_EMAIL, aktivni: false }, cAdmin)).json();
test('hlavní administrátorský účet nejde vypnout',
  vypniHlavniho.ok === false, JSON.stringify(vypniHlavniho));

const snizHlavniho = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'role', email: ADMIN_EMAIL, role: 'Obchodník' }, cAdmin)).json();
test('hlavnímu administrátorovi nejde snížit role',
  snizHlavniho.ok === false, JSON.stringify(snizHlavniho));

test('hlavní administrátor po obou pokusech dál funguje',
  (await get(zaloha, 'http://x/api/zaloha', cAdmin)).status === 200);

const vymyslenaRole = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'vymyslena.role@example.com', jmeno: 'Kdosi',
    role: 'Ředitel vesmíru', heslo: 'NejakeHeslo1' }, cAdmin)).json();
test('účet s neznámou rolí se nezaloží',
  vymyslenaRole.ok === false, JSON.stringify(vymyslenaRole));

const zmenaNaVymyslenou = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'role', email: 'terc@example.com', role: 'Ředitel vesmíru' }, cAdmin)).json();
test('role se nedá přepsat na neznámou',
  zmenaNaVymyslenou.ok === false, JSON.stringify(zmenaNaVymyslenou));

/* ============================================================
 * ZÁMEK ODESLANÉ NABÍDKY
 *
 * Zámek není otázka rolí — obchodník smí zakázky ukládat. Je to otázka
 * důvěryhodnosti toho, co už odešlo zákazníkovi: uzamčená varianta se
 * nesmí přepsat ani odemknout tím, že klient pošle záznam bez zámku.
 * Mutační test ukázal, že vypnutí kontroly `uloKontrolaZamku` samo o sobě
 * nikdo nezachytil — hlídala se jen změna dat pod zámkem, ne zmizení zámku.
 * ============================================================ */

console.log('\n===== ZÁMEK ODESLANÉ NABÍDKY =====\n');

const zamcena = zakazkaCislo('2026 - OPR - CN - 0905');
zam.zamkniVariantu(zamcena.varianty[0],
  { typ: 'nabidka', kdy: new Date().toISOString(), kdo: 'Matice práv' });
const ulozZamcenou = await (await post(zakazky, 'http://x/api/zakazky',
  { zakazka: zamcena }, cObch)).json();
test('zakázku s uzamčenou variantou lze uložit',
  ulozZamcenou.ok === true, JSON.stringify(ulozZamcenou));

const bezZamku = JSON.parse(JSON.stringify(zamcena));
delete bezZamku.varianty[0].zamek;
test('zámek nesmí zmizet tím, že klient pošle záznam bez něj',
  (await post(zakazky, 'http://x/api/zakazky', { zakazka: bezZamku }, cObch)).status === 409);

const jineId = JSON.parse(JSON.stringify(zamcena));
jineId.varianty[0].id = 'podvrzene-id';
test('uzamčená varianta nesmí zmizet ze zakázky',
  (await post(zakazky, 'http://x/api/zakazky', { zakazka: jineId }, cObch)).status === 409);

/* Nesmyslný vstup nesmí funkci shodit: pád by na Netlify skončil holou 502
 * bez vysvětlení a mohl by v odpovědi vynést kus vnitřku serveru. */
const nesmyslZakazka = await post(zakazky, 'http://x/api/zakazky',
  { zakazka: { tohle: 'není zakázka' } }, cObch);
test('nesmyslná zakázka vrátí 400, ne pád serveru', nesmyslZakazka.status === 400);
test('odmítnutí nesmyslné zakázky neprozradí vnitřek serveru',
  !/at \/|node:internal|\.mjs:\d+|\.js:\d+/.test(JSON.stringify(await nesmyslZakazka.json())));

const jinyZamek = JSON.parse(JSON.stringify(zamcena));
jinyZamek.varianty[0].zamek = { ...jinyZamek.varianty[0].zamek,
  kdy: new Date(Date.now() + 60000).toISOString() };
test('zámek nesmí být potichu vyměněn za jiný',
  (await post(zakazky, 'http://x/api/zakazky', { zakazka: jinyZamek }, cObch)).status === 409);

/* ============================================================
 * PLÁNOVANÁ FUNKCE
 * ============================================================ */

console.log('\n===== PLÁNOVANÁ NOČNÍ ZÁLOHA =====\n');

test('noční záloha nemá veřejnou cestu (nejde vyvolat z internetu)',
  !configNocni || configNocni.path === undefined, JSON.stringify(configNocni));
test('noční záloha je plánovaná (má schedule)',
  !!(configNocni && configNocni.schedule), JSON.stringify(configNocni));
const nocniVysledek = await (await zalohaNocni()).json();
test('noční záloha proběhne i bez přihlášení (spouští ji Netlify, ne uživatel)',
  nocniVysledek.ok === true, JSON.stringify(nocniVysledek));

/* ============================================================
 * ZDROJOVÁ KONTROLA: každá cesta ven má u sebe kontrolu přihlášení
 *
 * Testy výš ověřují chování. Tahle kontrola hlídá tvar kódu: kdyby někdo
 * přidal funkci a zapomněl na `vyzadujRoli` / `prihlaseny`, chytí se to i bez
 * toho, aby ji někdo doplnil do matice.
 * ============================================================ */

console.log('\n===== ZDROJOVÁ KONTROLA =====\n');

const VEREJNE_ZAMERNE = ['prihlaseni.mjs', 'odhlaseni.mjs', 'zdravi.mjs', 'zaloha_nocni.mjs'];
for (const f of souboryFunkci) {
  if (VEREJNE_ZAMERNE.includes(f)) continue;
  const kod = readFileSync(resolve(KOREN, 'functions', f), 'utf8');
  test('funkce ' + f + ' kontroluje přihlášení',
    /vyzadujRoli\s*\(/.test(kod) || /prihlaseny\s*\(/.test(kod));
}
test('seznam záměrně veřejných cest je krátký a beze změny',
  VEREJNE_ZAMERNE.length === 4 && VEREJNE_ZAMERNE.every(f => souboryFunkci.includes(f)));

const sdilene = readFileSync(resolve(KOREN, 'lib', 'sdilene.mjs'), 'utf8');
test('vyzadujRoli si ověřuje účet v databázi, ne jen cookie',
  /vyzadujRoli[\s\S]{0,900}uloziste\('uzivatele'\)/.test(sdilene));
/* Nestačí, že se slovo timingSafeEqual v souboru někde vyskytne — je i
 * v seznamu importů. Musí být uvnitř hesloSedi, protože tam se rozhoduje.
 * (Doplněno po mutačním testu: záměna za `hash === b.toString('hex')`
 * původní kontrolou prošla, přestože z doby porovnání jde heslo uhodnout
 * znak po znaku.) */
test('hesla se porovnávají časově bezpečně (timingSafeEqual)',
  /function hesloSedi[\s\S]{0,500}timingSafeEqual\s*\(/.test(sdilene));
test('hesla se ukládají jen jako scrypt otisk se solí',
  /scryptSync/.test(sdilene) && /randomBytes\(\d+\)/.test(sdilene));
test('tajemstvi relace se bere z prostředí, není v kódu',
  /process\.env\.TAJEMSTVI_RELACE/.test(sdilene)
  && !/TAJEMSTVI_RELACE\s*=\s*['"]/.test(sdilene.replace(/process\.env\./g, '')));
/* Záložní hodnota „aby to běželo i bez proměnné" je pohodlná a je to díra:
 * tajemství zapsané v kódu si přečte každý, kdo vidí repozitář, a podepíše
 * si vlastní relaci. Raději ať server křičí, že proměnná chybí. */
test('tajemství relace nemá záložní hodnotu v kódu',
  !/TAJEMSTVI_RELACE\s*\|\|/.test(sdilene));

console.log(`\n${ok} prošlo, ${fail} selhalo`);
if (fail) { console.log('\nSelhalo:\n - ' + selhalo.join('\n - ')); }
process.exit(fail ? 1 : 0);
