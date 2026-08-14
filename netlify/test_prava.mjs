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
import zobrazeni from './functions/zobrazeni.mjs';
import schvalovaniFn from './functions/schvalovani.mjs';
import sablonyFn from './functions/sablony.mjs';
import pdPole from './functions/pd_pole.mjs';
import pdDealy from './functions/pd_dealy.mjs';
import pdDeal from './functions/pd_deal.mjs';
import { config as configNocni } from './functions/zaloha_nocni.mjs';
import { ADMIN_EMAIL, ROLE, POKUSY_MAX, zpozdeniMs, pokusyReset,
         uloziste, PODPIS_ULOZISTE } from './lib/sdilene.mjs';

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

/* Druhý obětní účet — jen pro řádek matice „smazání účtu". Mazání je nevratné,
 * takže se nesmí dělat na tercovi, se kterým pracují ostatní řádky. Účet je
 * bez zakázek: matice se ptá výhradně na to, KDO smí akci vyvolat, ne co
 * všechno se přitom kontroluje (to hlídá oddíl MAZÁNÍ ÚČTŮ níž). */
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'smaz.terc@example.com', jmeno: 'Terč ke smazání',
    role: 'Obchodník', heslo: 'SmazTercHeslo1' }, cAdmin);

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

  /* Mazání účtu (11. 8. 2026). V matici je schválně vedle archivace a převodu:
   * je to nejsilnější akce nad cizím účtem a jediná nevratná — kdyby ji směl
   * kdokoli, dal by se kolega odstranit z firmy jedním požadavkem. Role se
   * kontroluje dřív než existence účtu, takže první tři průchody účet nesmažou. */
  { fn: uzivatele, nazev: 'uživatelé — smazání účtu (POST akce=smaz)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: () => ({ akce: 'smaz', email: 'smaz.terc@example.com' }),
    proc: 'nevratné odstranění kolegy z databáze patří jen administrátorovi',
    prava: JEN_ADMIN },

  { fn: uzivatele, nazev: 'moje heslo (POST akce=mojeheslo)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: (r) => (r === 'nepřihlášený'
      ? { akce: 'mojeheslo', stare: 'CokoliHeslo1', nove: 'CokoliHeslo2' }
      : { akce: 'mojeheslo', stare: UCTY[r].heslo, nove: UCTY[r].heslo }),
    proc: 'vlastní heslo si mění každý sám, ale jen se znalostí toho starého',
    prava: PRIHLASENY_OK },

  /* Profil a podpis (#145): údaje, kterými se člověk podepisuje pod cenovou
   * nabídkou. Svoje si spravuje každý sám — kdyby to musel dělat správce,
   * v praxi by se telefon nezměnil nikdy a z nabídek by odcházel starý
   * kontakt. Cizí profil je JEN_ADMIN a hlídá ho samostatná sada
   * (netlify/test_profil.mjs), protože se pozná až podle pole `email`. */
  { fn: uzivatele, nazev: 'můj profil — titul, funkce, telefon (POST akce=profil)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: () => ({ akce: 'profil', titul: 'Ing.', funkce: 'Obchodní technik',
                   telefon: '+420 602 000 000' }),
    proc: 'jméno a kontakt pod nabídkou patří tomu, kdo ji dělal — musí si je změnit sám',
    prava: PRIHLASENY_OK },

  { fn: uzivatele, nazev: 'můj podpis s razítkem (POST akce=podpis)', metoda: 'POST',
    url: 'http://x/api/uzivatele',
    telo: () => ({ akce: 'podpis', obrazek: '' }),
    proc: 'sken podpisu je osobní věc — nahrát ho smí každý jen sám sobě',
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

  /* Matice zobrazení (#136). Záměrně stejná dvojice práv jako u firmy: číst ji
   * musí i obchodník — právě jemu podle ní rozhraní schová sloupce a záložky,
   * a kdyby ji nedostal, viděl by výchozí (nejpřísnější) stav a administrátor
   * by mu nic nepřidělil. Zapisovat ji smí jen administrátor: je to rozhodnutí
   * za celou firmu, ne osobní předvolba. */
  { fn: zobrazeni, soubor: 'zobrazeni.mjs', nazev: 'zobrazení — čtení matice (GET /api/zobrazeni)', metoda: 'GET',
    url: 'http://x/api/zobrazeni',
    proc: 'podle matice si rozhraní skládá sám prohlížeč — potřebuje ji každý přihlášený',
    prava: PRIHLASENY_OK },

  { fn: zobrazeni, nazev: 'zobrazení — zveřejnění matice (POST /api/zobrazeni)', metoda: 'POST',
    url: 'http://x/api/zobrazeni',
    telo: () => ({ matice: { 'tab.detail': { 'Obchodník': false, 'Vedoucí': true } } }),
    proc: 'kdo co v aplikaci vidí, rozhoduje administrátor za celou firmu',
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


  /* Napojení na Pipedrive (#16). Čtení smí každý přihlášený — obchodník bez
   * seznamu zakázek v CRM nemá nad čím počítat. Ven z aplikace se tím nic
   * nedostane: token žije jen v prostředí serveru a v odpovědi není.
   * V téhle sadě není nastavené napojení, takže funkce odpovídají „napojení
   * není nastavené" — a právě to je i jejich zkouška: bez tokenu se nesmí
   * rozbít ani prozradit, jestli token vůbec existuje. */
  { fn: pdDealy, soubor: 'pd_dealy.mjs', nazev: 'Pipedrive — seznam případů (GET /api/pd/dealy)',
    metoda: 'GET', url: 'http://x/api/pd/dealy',
    proc: 'obchodník potřebuje vybrat zakázku, nad kterou bude počítat',
    prava: PRIHLASENY_OK },

  { fn: pdDeal, soubor: 'pd_deal.mjs', nazev: 'Pipedrive — detail případu (GET /api/pd/deal)',
    metoda: 'GET', url: 'http://x/api/pd/deal?id=1',
    proc: 'z detailu se plní hlavička kalkulace a krycí list',
    prava: PRIHLASENY_OK },

  /* Sdílený rejstřík žádostí o slevu (#102). Čte ho každý přihlášený —
   * rozhodnutí z 10. 8. 2026 zní, že všichni vidí všechny zakázky (#103),
   * a rejstřík navíc nenese žádnou částku. Rozhodovat o žádosti je jiná věc:
   * to hlídá strop role. */
  { fn: schvalovaniFn, soubor: 'schvalovani.mjs',
    nazev: 'schvalování — sdílený rejstřík (GET /api/schvalovani)',
    metoda: 'GET', url: 'http://x/api/schvalovani',
    proc: 'schvalovatel musí vidět, že někde vznikla žádost, aniž by tu zakázku otevíral',
    prava: PRIHLASENY_OK },

  { fn: pdPole, soubor: 'pd_pole.mjs', nazev: 'Pipedrive — mapa vlastních polí (GET /api/pd/pole)',
    metoda: 'GET', url: 'http://x/api/pd/pole',
    proc: 'názvy polí v CRM nejsou tajemství; vynucené obnovení už jen pro správce',
    prava: PRIHLASENY_OK },

  /* Centrální šablony dokumentů (#139). Číst smí každý přihlášený — obchodník
   * z platné šablony tiskne. Zveřejnit a přepínat režim smí JEN administrátor:
   * kdyby šablonu mohl vyměnit kdokoli, celé centrální řízení by nic neřídilo. */
  { fn: sablonyFn, soubor: 'sablony.mjs', nazev: 'šablony — rejstřík (GET /api/sablony)',
    metoda: 'GET', url: 'http://x/api/sablony',
    proc: 'obchodník tiskne z platné šablony, musí ji tedy umět stáhnout',
    prava: PRIHLASENY_OK },

  { fn: sablonyFn, soubor: 'sablony.mjs', nazev: 'šablony — zveřejnění (POST /api/sablony)',
    metoda: 'POST', url: 'http://x/api/sablony',
    telo: () => ({ akce: 'zverejnit', typ: 'nabidka', nazev: 'x.docx', data: 'UEsDBAAA' }),
    proc: 'výměna šablony mění dokumenty celé firmy — to je rozhodnutí administrátora',
    prava: JEN_ADMIN },

  { fn: sablonyFn, soubor: 'sablony.mjs', nazev: 'šablony — přepnutí režimu (POST /api/sablony)',
    metoda: 'POST', url: 'http://x/api/sablony',
    telo: () => ({ akce: 'rezim', rezim: 'mekky' }),
    proc: 'měkký režim vypíná záruku „nikdo netiskne ze staré verze" — jen administrátor',
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

/* ============================================================
 * BRZDA PROTI HÁDÁNÍ HESEL A ČAS ODPOVĚDI (#92 a #93, 9. 8. 2026)
 *
 * Obě opatření mají společné to, že se dají zavést špatně a vypadat dobře.
 *
 * #92: zámek účtu po N pokusech je zbraň, kterou lze obrátit proti majiteli
 * — stačí zkoušet hesla k cizímu účtu a jeho majitel se ten den nepřihlásí.
 * Proto se tady netestuje jen „po deseti pokusech to přestane pouštět", ale
 * hlavně opak: že SPRÁVNÉ heslo projde i uprostřed útoku.
 *
 * #93: hláška je správně neurčitá, ale čas odpovědi ji prozradí. Měří se
 * proto skutečné trvání obou větví, ne jen text hlášky.
 * ============================================================ */

/* ============================================================
 * SDÍLENÝ REJSTŘÍK ŽÁDOSTÍ O SLEVU (#102 a #103, 10. 8. 2026)
 *
 * Dvě rozhodnutí z 10. 8. 2026, zapsaná sem, aby se nezměnila mlčky:
 *
 * #103 — „všichni vidí všechny zakázky, resp. kalkulace." Zapsáno doslova,
 * protože je to rozhodnutí, které se dělá tím, že se neudělá: dosud to tak
 * server dělal, ale nikde nestálo, že to tak MÁ být.
 *
 * #102 — fronta schvalování jde napříč zakázkami. Právě proto tu je celá
 * druhá půlka téhle sady: přehled napříč zakázkami je jediné místo, kde jde
 * jedním požadavkem obejít matici zobrazení. Kdyby rejstřík vozil částky,
 * uviděl by cenu i ten, komu ji administrátor v zakázce nepřidělil.
 * ============================================================ */

/* ============================================================
 * ARCHIVACE ÚČTŮ A PŘEVOD ZAKÁZEK (11. 8. 2026)
 *
 * Účet po odchodu kolegy se dosud jen vypnul a zůstal v seznamu navždy.
 * Smazat ho nejde — jeho jméno je podepsané pod odeslanými nabídkami.
 * Archiv je proto odsunutí z očí, ne mazání; a protože práce po kolegovi
 * musí mít nového hospodáře, jde k tomu převést autorství zakázek.
 * ============================================================ */

console.log('\n===== ARCHIVACE ÚČTŮ A PŘEVOD ZAKÁZEK =====\n');

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'odchazi@example.com', jmeno: 'Odcházející',
    role: 'Obchodník', heslo: 'OdchaziHeslo1' }, cAdmin);
const cOdchazi = await prihlas('odchazi@example.com', 'OdchaziHeslo1');

/* Dvě zakázky založené odcházejícím kolegou — autor se razítkuje serverem. */
for (const c of ['2026 - OPR - CN - 0930', '2026 - OPR - CN - 0931'])
  await post(zakazky, 'http://x/api/zakazky', { zakazka: zakazkaCislo(c) }, cOdchazi);
const rejPred = await (await get(zakazky, 'http://x/api/zakazky', cAdmin)).json();
const mojeOdchazi = rejPred.rejstrik.zakazky.filter(z => z.autor === 'odchazi@example.com');
test('server zapíše autora zakázky sám', mojeOdchazi.length === 2,
  JSON.stringify(rejPred.rejstrik.zakazky.map(z => z.autor)));

/* Autor se razítkuje jen jednou. Kdyby ho přepsal každý, kdo zakázku uloží,
 * stal by se „autorem" ten, kdo si ji naposledy otevřel. */
const znovu = await (await get(zakazky,
  'http://x/api/zakazky?soubor=2026-OPR-CN-0930.json', cAdmin)).json();
await post(zakazky, 'http://x/api/zakazky', { zakazka: znovu.zakazka }, cAdmin);
const poUlozeni = await (await get(zakazky,
  'http://x/api/zakazky?soubor=2026-OPR-CN-0930.json', cAdmin)).json();
test('autor se uložením cizí rukou nepřepíše',
  poUlozeni.zakazka.autor === 'odchazi@example.com', poUlozeni.zakazka.autor);
test('kdo naposledy uložil, se ale zaznamená',
  poUlozeni.zakazka.upravil === ADMIN_EMAIL, poUlozeni.zakazka.upravil);

test('archivovat účet smí jen administrátor',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'archiv', email: 'odchazi@example.com', archiv: true }, cObch)).status === 403);
const arch = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'archiv', email: 'odchazi@example.com', archiv: true }, cAdmin)).json();
test('archivace projde', arch.ok === true, JSON.stringify(arch));
test('archivovaný účet se nepřihlásí',
  (await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: 'odchazi@example.com', heslo: 'OdchaziHeslo1' })).status === 401);
const seznamA = await (await get(uzivatele, 'http://x/api/uzivatele', cAdmin)).json();
const zaznamA = seznamA.uzivatele.find(x => x.email === 'odchazi@example.com');
test('seznam účtů archiv přizná', zaznamA && zaznamA.archiv === true && zaznamA.aktivni === false);
test('účet se archivací nesmazal', !!zaznamA);

/* Hlavní administrátorský účet nejde archivovat — jinak by nezůstal nikdo,
 * kdo archiv vrátí zpět. */
test('hlavní administrátorský účet nejde archivovat',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'archiv', email: ADMIN_EMAIL, archiv: true }, cAdmin)).status === 400);

test('převádět sám na sebe nedává smysl a neprojde',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'prevod', email: 'odchazi@example.com', na: 'odchazi@example.com' }, cAdmin)).status === 400);
/* Cíl musí být ČINNÝ účet. Převod na další archivovaný by práci po kolegovi
 * ztratil podruhé — a přišlo by se na to zase až za rok. */
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'odesel.driv@example.com', jmeno: 'Odešel dřív',
    role: 'Obchodník', heslo: 'OdeselHeslo1' }, cAdmin);
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'archiv', email: 'odesel.driv@example.com', archiv: true }, cAdmin);
test('převádět na archivovaný účet nejde',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'prevod', email: 'odchazi@example.com', na: 'odesel.driv@example.com' }, cAdmin)).status === 400);
test('převádět na neexistující účet nejde',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'prevod', email: 'odchazi@example.com', na: 'nikdo.takovy@example.com' }, cAdmin)).status === 404);
const prev = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'prevod', email: 'odchazi@example.com', na: UCTY['Obchodník'].email }, cAdmin)).json();
test('převod ohlásí, kolik zakázek přepsal', prev.ok && prev.prevedeno === 2,
  JSON.stringify(prev));
const rejPo = await (await get(zakazky, 'http://x/api/zakazky', cAdmin)).json();
test('po převodu nemá odcházející v rejstříku žádnou zakázku',
  rejPo.rejstrik.zakazky.every(z => z.autor !== 'odchazi@example.com'));
/* „aspoň dvě" schválně: obchodník má v téhle sadě i vlastní zakázky
 * z křížové matice, takže přesné číslo by test svazovalo s cizím oddílem. */
test('a nový hospodář je má',
  rejPo.rejstrik.zakazky.filter(z => z.autor === UCTY['Obchodník'].email).length >= 2,
  rejPo.rejstrik.zakazky.filter(z => z.autor === UCTY['Obchodník'].email).length);
const zakPo = await (await get(zakazky,
  'http://x/api/zakazky?soubor=2026-OPR-CN-0931.json', cAdmin)).json();
test('autor se přepsal i v samotné zakázce, nejen v rejstříku',
  zakPo.zakazka.autor === UCTY['Obchodník'].email, zakPo.zakazka.autor);
test('převod smí jen administrátor',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'prevod', email: 'odchazi@example.com', na: ADMIN_EMAIL }, cObch)).status === 403);

/* Archiv jde vzít zpět — kolega se může vrátit. */
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'archiv', email: 'odchazi@example.com', archiv: false }, cAdmin);
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'aktivni', email: 'odchazi@example.com', aktivni: true }, cAdmin);
test('vrácení z archivu účet zase pustí dovnitř',
  (await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: 'odchazi@example.com', heslo: 'OdchaziHeslo1' })).status === 200);

/* ============================================================
 * MAZÁNÍ ÚČTŮ (11. 8. 2026)
 *
 * Zadání majitele: „Uživatele bych ještě potřeboval mít i možnost mazat."
 * Mazání je jediná nevratná akce nad účtem, takže se tu neověřuje jen to,
 * že se povedlo, ale hlavně čtyři věci, které se povést NESMÍ:
 *   · smaže to někdo bez role Administrátor,
 *   · zmizí hlavní administrátorský účet nebo ten, kdo zrovna maže,
 *   · zmizí účet i s prací, která pak zůstane podepsaná duchem,
 *   · účet sice zmizí ze seznamu, ale někudy jinudy pořád projde
 *     (přihlášení, stará cookie, záloha) nebo po sobě nechá podpis.
 *
 * Poslední bod je jádro věci. Úložiště klíč odstranit neumí, takže se účet
 * maže NÁHROBKEM — na jeho klíč se zapíše prázdno. Testy níž proto chodí
 * na všechny cesty, kudy se účet čte, ne jen na seznam.
 * ============================================================ */

console.log('\n===== MAZÁNÍ ÚČTŮ =====\n');

/* Nejmenší platný datový zápis PNG — obsah nikoho nezajímá, jde o to, že
 * podpis v úložišti opravdu je a po smazání účtu tam být nesmí. */
const PODPIS_PNG = 'data:image/png;base64,iVBORw0KGgo=';

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'mazany@example.com', jmeno: 'Ke smazání',
    role: 'Obchodník', heslo: 'MazanyHeslo1' }, cAdmin);
const cMazany = await prihlas('mazany@example.com', 'MazanyHeslo1');
await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'podpis', email: 'mazany@example.com', obrazek: PODPIS_PNG }, cAdmin);
const podpisUloziste = await uloziste(PODPIS_ULOZISTE);
test('příprava: mazaný účet má nahraný podpis',
  !!(await podpisUloziste.cti('mazany@example.com')));

/* Dvě zakázky, a na jedné z nich RAZÍTKA: zámek odeslané nabídky a podpis
 * pod rozhodnutím o slevě. Obojí musí smazání účtu přežít beze změny —
 * říkají, kdo co tehdy udělal, a to se nepřepisuje. */
const razitkova = zakazkaCislo('2026 - OPR - CN - 0940');
razitkova.varianty[0].data.sleva = { procenta: 12, role: 'Obchodník',
  stav: 'schváleno', schvalil: 'mazany@example.com',
  schvalilKdy: new Date().toISOString(), poznamka: '' };
zam.zamkniVariantu(razitkova.varianty[0],
  { typ: 'nabidka', kdy: new Date().toISOString(), kdo: 'mazany@example.com' });
await post(zakazky, 'http://x/api/zakazky', { zakazka: razitkova }, cMazany);
await post(zakazky, 'http://x/api/zakazky',
  { zakazka: zakazkaCislo('2026 - OPR - CN - 0941') }, cMazany);

test('smazat účet smí jen administrátor',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'smaz', email: 'mazany@example.com' }, cObch)).status === 403);
test('a nepomůže ani role vedoucího',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'smaz', email: 'mazany@example.com' }, UCTY['Vedoucí'].cookie)).status === 403);

/* Hlavní účet a vlastní účet — dvě pojistky proti omylu správce, ne proti
 * útočníkovi. Obě končí tím, že by v aplikaci nezbyl nikdo, kdo ji spravuje. */
/* Maže DRUHÝ administrátor, ne hlavní účet sám sebe. Kdyby se hlavní účet
 * rušil vlastní rukou, zastavila by ho už zábrana „sám sebe smazat nelze"
 * a o pojistce na ADMIN_EMAIL by test neřekl vůbec nic. (Přišlo se na to
 * mutačním testem: vypnutá pojistka na hlavním účtu prošla zeleně.) */
const smazHlavniho = await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'smaz', email: ADMIN_EMAIL }, UCTY['Administrátor'].cookie);
test('hlavní administrátorský účet nejde smazat ani jinému administrátorovi',
  smazHlavniho.status === 400, smazHlavniho.status);
test('a odmítnutí vysvětlí proč, ne jen „nelze"',
  /dveře|zamkl/i.test((await smazHlavniho.json()).chyba || ''));
test('hlavní administrátor po pokusu o smazání dál funguje',
  (await get(zaloha, 'http://x/api/zaloha', cAdmin)).status === 200);

const smazSebe = await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'smaz', email: UCTY['Administrátor'].email }, UCTY['Administrátor'].cookie);
test('sám sebe smazat nejde', smazSebe.status === 400);
test('a správce, který to zkusil, pracuje dál',
  (await get(ja, 'http://x/api/ja', UCTY['Administrátor'].cookie)).status === 200);

test('smazat neexistující účet vrátí 404, ne tichý souhlas',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'smaz', email: 'nikdo.takovy@example.com' }, cAdmin)).status === 404);

/* Účet s prací na sobě se nesmaže rovnou — jinak by zakázky zůstaly
 * podepsané e-mailem, který už neexistuje. */
const odmitnuto = await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'smaz', email: 'mazany@example.com' }, cAdmin);
const odmitnutoT = await odmitnuto.json();
test('účet se zakázkami se bez převodu nesmaže', odmitnuto.status === 409,
  odmitnuto.status);
test('odmítnutí řekne, kolik zakázek na účtu visí',
  odmitnutoT.zakazek === 2 && /2 zakázky/.test(odmitnutoT.chyba || ''),
  JSON.stringify(odmitnutoT));
test('odmítnutí poradí, že se má nejdřív převést',
  /převe/i.test(odmitnutoT.chyba || ''), odmitnutoT.chyba);
test('a odmítnutý účet se opravdu nesmazal — pořád se jím jde přihlásit',
  (await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: 'mazany@example.com', heslo: 'MazanyHeslo1' })).status === 200);

const prevodPredSmazanim = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'prevod', email: 'mazany@example.com', na: UCTY['Vedoucí'].email }, cAdmin)).json();
test('převod před smazáním přepíše obě zakázky',
  prevodPredSmazanim.ok === true && prevodPredSmazanim.prevedeno === 2,
  JSON.stringify(prevodPredSmazanim));

const smazano = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'smaz', email: 'mazany@example.com' }, cAdmin)).json();
test('po převodu už smazání projde',
  smazano.ok === true && smazano.smazano === true, JSON.stringify(smazano));

/* --- a teď všechny cesty, kudy se účet čte --- */

test('smazaný účet se nepřihlásí',
  (await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: 'mazany@example.com', heslo: 'MazanyHeslo1' })).status === 401);
const seznamPoSmazani = await (await get(uzivatele, 'http://x/api/uzivatele', cAdmin)).json();
test('smazaný účet není v seznamu účtů',
  seznamPoSmazani.uzivatele.every(x => x.email !== 'mazany@example.com'),
  seznamPoSmazani.uzivatele.map(x => x.email).join(','));
test('v seznamu nezůstal ani prázdný řádek po náhrobku',
  seznamPoSmazani.uzivatele.every(x => !!x.email && !x.smazano));

/* Relace žije 12 hodin, účet ne. Cookie cMazany byla vydaná PŘED smazáním —
 * kdyby s ní šlo dál pracovat, znamenalo by smazání účtu půl dne nic. */
test('smazaný účet neprojde ani s cookie vydanou před smazáním (/api/ja)',
  (await get(ja, 'http://x/api/ja', cMazany)).status === 401);
test('smazaný účet neprojde ani na zakázky',
  (await get(zakazky, 'http://x/api/zakazky', cMazany)).status === 401);
test('smazaný účet neuloží zakázku',
  (await post(zakazky, 'http://x/api/zakazky',
    { zakazka: zakazkaCislo('2026 - OPR - CN - 0949') }, cMazany)).status === 401);

test('podpis se smazal spolu s účtem (nezůstal v úložišti podpisů)',
  !(await podpisUloziste.cti('mazany@example.com')),
  JSON.stringify(await podpisUloziste.cti('mazany@example.com')).slice(0, 80));

/* Záloha čte úložiště účtů po klíčích. Kdyby si s náhrobkem neporadila,
 * vrátila by se smazaný účet do databáze při první obnově ze zálohy. */
const zalohaPoSmazani = await (await get(zaloha, 'http://x/api/zaloha', cAdmin)).json();
test('smazaný účet neveze ani záloha ke stažení',
  zalohaPoSmazani.zaloha.uzivatele.every(x => x && x.email !== 'mazany@example.com'),
  zalohaPoSmazani.zaloha.uzivatele.map(x => x && x.email).join(','));
test('a v seznamu účtů zálohy nezůstal prázdný záznam',
  zalohaPoSmazani.zaloha.uzivatele.every(x => x && !!x.email));

/* Náhrobek: úložiště klíč odstranit neumí, takže klíč zůstane — ale čte se
 * jako prázdno. Kdyby na něm zůstal jakýkoli obsah, choval by se někde
 * v aplikaci jako účet. */
const uctyUloziste = await uloziste('uzivatele');
test('klíč smazaného účtu v úložišti zůstal (mazat klíče API neumí)',
  (await uctyUloziste.seznam()).includes('mazany@example.com'));
test('ale čte se jako neexistující účet (náhrobek je prázdný)',
  (await uctyUloziste.cti('mazany@example.com')) == null,
  JSON.stringify(await uctyUloziste.cti('mazany@example.com')));
const kniha = await (await uloziste('smazani')).cti('mazany@example.com');
test('v knize smazaných účtů je zapsáno kdo a kdy',
  !!kniha && kniha.smazano === true && kniha.kdo === ADMIN_EMAIL && !!kniha.kdy,
  JSON.stringify(kniha));

/* Razítka pod odeslanými nabídkami a podpisy pod rozhodnutími o slevách se
 * NEPŘEPISUJÍ. Autor („kdo to má dnes na starost") se převodem změnil,
 * razítko („kdo to tehdy udělal") zůstalo. */
const razitkaPo = await (await get(zakazky,
  'http://x/api/zakazky?soubor=2026-OPR-CN-0940.json', cAdmin)).json();
test('zámek odeslané nabídky nese pořád jméno toho, kdo ji tehdy odeslal',
  razitkaPo.zakazka.varianty[0].zamek.kdo === 'mazany@example.com',
  JSON.stringify(razitkaPo.zakazka.varianty[0].zamek));
test('podpis pod rozhodnutím o slevě zůstal taky beze změny',
  razitkaPo.zakazka.varianty[0].data.sleva.schvalil === 'mazany@example.com',
  razitkaPo.zakazka.varianty[0].data.sleva.schvalil);
test('autor zakázky je ale nový hospodář, ne smazaný účet',
  razitkaPo.zakazka.autor === UCTY['Vedoucí'].email, razitkaPo.zakazka.autor);

/* E-mail se po smazání dá použít znovu — a nový člověk NESMÍ zdědit
 * podpis po tom předchozím. */
const znovuZalozen = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'mazany@example.com', jmeno: 'Někdo jiný',
    role: 'Obchodník', heslo: 'ZnovuHeslo1' }, cAdmin)).json();
test('smazaný e-mail jde použít pro nový účet', znovuZalozen.ok === true,
  JSON.stringify(znovuZalozen));
const znovuPrihlasen = await (await post(prihlaseni, 'http://x/api/prihlaseni',
  { email: 'mazany@example.com', heslo: 'ZnovuHeslo1' })).json();
test('nový účet se stejným e-mailem nedostane podpis po předchůdci',
  znovuPrihlasen.ok === true && !znovuPrihlasen.podpis,
  String(znovuPrihlasen.podpis || '').slice(0, 40));

/* --- přebití přepínačem: smazat i se zakázkami --- */

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'mazany2@example.com', jmeno: 'Ke smazání i s prací',
    role: 'Obchodník', heslo: 'Mazany2Heslo1' }, cAdmin);
const cMazany2 = await prihlas('mazany2@example.com', 'Mazany2Heslo1');
await post(zakazky, 'http://x/api/zakazky',
  { zakazka: zakazkaCislo('2026 - OPR - CN - 0942') }, cMazany2);

test('i tady platí, že se účet se zakázkami bez převodu nesmaže',
  (await post(uzivatele, 'http://x/api/uzivatele',
    { akce: 'smaz', email: 'mazany2@example.com' }, cAdmin)).status === 409);
const smazSeZakazkami = await (await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'smaz', email: 'mazany2@example.com', i_se_zakazkami: true }, cAdmin)).json();
test('přepínač „i se zakázkami" smazání povolí a řekne, kolik jich odepsal',
  smazSeZakazkami.ok === true && smazSeZakazkami.odepsano === 1,
  JSON.stringify(smazSeZakazkami));
const zakBezAutora = await (await get(zakazky,
  'http://x/api/zakazky?soubor=2026-OPR-CN-0942.json', cAdmin)).json();
test('zakázka po smazaném účtu nezmizela', !!zakBezAutora.zakazka);
test('ale autor je prázdný, ne odkaz na neexistující účet',
  zakBezAutora.zakazka.autor === '', JSON.stringify(zakBezAutora.zakazka.autor));
const rejPoSmazani = await (await get(zakazky, 'http://x/api/zakazky', cAdmin)).json();
test('ani rejstřík nenese odkaz na smazaný účet',
  rejPoSmazani.rejstrik.zakazky.every(z => z.autor !== 'mazany2@example.com'),
  rejPoSmazani.rejstrik.zakazky.map(z => z.autor).join(','));
test('smazaný účet i s prací se nepřihlásí',
  (await post(prihlaseni, 'http://x/api/prihlaseni',
    { email: 'mazany2@example.com', heslo: 'Mazany2Heslo1' })).status === 401);
test('a neprojde ani se svou původní cookie',
  (await get(ja, 'http://x/api/ja', cMazany2)).status === 401);

console.log('\n===== SDÍLENÝ REJSTŘÍK ŽÁDOSTÍ O SLEVU =====\n');

function zakazkaSeSlevou(cislo, procenta, stav) {
  const z = zk.novaZakazka();
  z.cislo = cislo;
  z.nazevAkce = 'Zkušební akce ' + procenta + ' %';
  const v = z.varianty[0];
  v.data.sleva = { procenta, role: 'Obchodník', stav, poznamka: '' };
  return z;
}
/* Zakládá administrátor — obchodník ji pak musí v rejstříku vidět (#103). */
await post(zakazky, 'http://x/api/zakazky',
  { zakazka: zakazkaSeSlevou('2026 - OPR - CN - 0910', 18, 'čeká na schválení') }, cAdmin);
await post(zakazky, 'http://x/api/zakazky',
  { zakazka: zakazkaSeSlevou('2026 - OPR - CN - 0911', 3, 'schváleno automaticky') }, cAdmin);

const rej = await (await get(schvalovaniFn, 'http://x/api/schvalovani', cObch)).json();
test('rejstřík vrátí čekající žádost i z cizí zakázky',
  rej.ok && rej.zadosti.some(z => z.cislo === '2026 - OPR - CN - 0910'),
  JSON.stringify(rej).slice(0, 200));
test('žádost nese číslo zakázky, název akce i procento',
  rej.zadosti.every(z => z.cislo && z.nazevAkce && typeof z.sleva.procenta === 'number'));
test('výchozí přehled ukazuje jen to, co čeká na rozhodnutí',
  rej.zadosti.every(z => z.sleva.stav === 'čeká na schválení'),
  rej.zadosti.map(z => z.sleva.stav).join(','));

const rejVse = await (await get(schvalovaniFn, 'http://x/api/schvalovani?vse=1', cObch)).json();
test('na vyžádání se ukážou i rozhodnuté žádosti',
  rejVse.zadosti.some(z => z.sleva.stav === 'schváleno automaticky'));
test('rejstřík řekne, kolik žádostí čeká a kolik jich je celkem',
  rejVse.pocetCeka >= 1 && rejVse.pocetCelkem >= 2, rejVse.pocetCeka + '/' + rejVse.pocetCelkem);

/* #103 doslova: obchodník vidí i zakázku, kterou nezaložil. */
test('obchodník vidí v rejstříku i cizí zakázku (rozhodnutí #103)',
  rejVse.zadosti.some(z => z.cislo === '2026 - OPR - CN - 0911'));
test('vedoucí vidí totéž co obchodník',
  (await (await get(schvalovaniFn, 'http://x/api/schvalovani?vse=1',
    UCTY['Vedoucí'].cookie)).json()).zadosti.length === rejVse.zadosti.length);

/* Jádro věci: v rejstříku nesmí být žádná částka. */
const REJ_KLICE = ['klic', 'cislo', 'nazevAkce', 'variantaId', 'variantaNazev',
  'cast', 'ridici', 'zamceno', 'upraveno', 'sleva'];
const REJ_SLEVA = ['procenta', 'role', 'schema', 'poznamka', 'stav', 'schvalil', 'schvalilKdy',
  'schvalenoProc', 'zamitl', 'zamitlKdy', 'zamitnutoProc', 'zamitnutoDuvod'];
const naviec = [];
rejVse.zadosti.forEach((z) => {
  Object.keys(z).forEach(k => { if (!REJ_KLICE.includes(k)) naviec.push(k); });
  Object.keys(z.sleva || {}).forEach(k => { if (!REJ_SLEVA.includes(k)) naviec.push('sleva.' + k); });
});
test('rejstřík nenese nic nad rámec vyjmenovaných údajů', naviec.length === 0, naviec.join(','));
const rejText = JSON.stringify(rejVse);
test('rejstřík neveze cenu, náklad ani marži',
  !/cena|naklad|marze|zaklad/i.test(rejText),
  (rejText.match(/cena|naklad|marze|zaklad/i) || [])[0]);
test('rejstřík neveze data kalkulace ani ceník',
  !rejText.includes('profilas') && !rejText.includes('cenik'));

console.log('\n===== BRZDA PROTI HÁDÁNÍ HESEL =====\n');

test('zpozdeniMs: první dva překlepy se netrestají čekáním',
  zpozdeniMs(0) === 0 && zpozdeniMs(1) === 0 && zpozdeniMs(2) === 0);
test('zpozdeniMs: od třetího neúspěchu zpoždění roste',
  zpozdeniMs(3) > 0 && zpozdeniMs(5) > zpozdeniMs(3));
test('zpozdeniMs: zpoždění má strop (funkce se musí vejít do časového limitu)',
  zpozdeniMs(50) === zpozdeniMs(1000) && zpozdeniMs(50) <= 2000);

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'brzda@example.com', jmeno: 'Terč útoku',
    role: 'Obchodník', heslo: 'BrzdaHeslo1' }, cAdmin);

const spatne = (email) => post(prihlaseni, 'http://x/api/prihlaseni',
  { email, heslo: 'urcite-spatne-heslo' });

let stavy = [];
for (let i = 0; i < POKUSY_MAX; i++) stavy.push((await spatne('brzda@example.com')).status);
test('prvních ' + POKUSY_MAX + ' špatných pokusů dostane obyčejné odmítnutí (401)',
  stavy.every(s => s === 401), stavy.join(','));
const pres = await spatne('brzda@example.com');
test('pokus nad limit se odmítne s 429 (Too Many Requests)', pres.status === 429, pres.status);
test('odmítnutí nad limit říká, že jde o počet pokusů, ne o špatné heslo',
  /mnoho/i.test((await pres.json()).chyba || ''));

/* Jádro věci: útočník vyčerpal limit, majitel se přesto dostane dovnitř. */
const poUtoku = await post(prihlaseni, 'http://x/api/prihlaseni',
  { email: 'brzda@example.com', heslo: 'BrzdaHeslo1' });
test('správné heslo projde i po vyčerpání limitu (útočník majitele nezamkne)',
  poUtoku.status === 200, poUtoku.status);
test('úspěšné přihlášení počítadlo vynuluje',
  (await spatne('brzda@example.com')).status === 401);

/* Totéž pro hlavní administrátorský účet — u něj by zámek byl nejhorší,
 * protože není nikdo, kdo by ho odemkl. */
for (let i = 0; i <= POKUSY_MAX + 1; i++) await spatne(ADMIN_EMAIL);
const adminPoUtoku = await post(prihlaseni, 'http://x/api/prihlaseni',
  { email: ADMIN_EMAIL, heslo: 'Docasne.Heslo.123' });
test('účet hlavního administrátora nejde zamknout hádáním hesel',
  adminPoUtoku.status === 200, adminPoUtoku.status);

/* Počítadlo běží i na e-mail, který v databázi není. Kdyby se počítaly jen
 * existující účty, prozradila by brzda sama, které adresy u nás jsou. */
let stavyNeznamy = [];
for (let i = 0; i <= POKUSY_MAX; i++) stavyNeznamy.push((await spatne('nikdo@example.com')).status);
test('brzda platí i pro neznámý e-mail (jinak by prozradila, kdo u nás je)',
  stavyNeznamy[stavyNeznamy.length - 1] === 429, stavyNeznamy.join(','));

console.log('\n===== ČAS ODPOVĚDI NEPROZRADÍ EXISTUJÍCÍ ÚČTY =====\n');

await post(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'merene@example.com', jmeno: 'Měřený',
    role: 'Obchodník', heslo: 'MereneHeslo1' }, cAdmin);

/* Měří se mediánem, ne průměrem: jediné zaškobrtnutí sběrače paměti by
 * průměr vychýlilo o víc než celý rozdíl, který hledáme. */
async function medianMs(email) {
  const casy = [];
  for (let i = 0; i < 10; i++) {
    const t0 = process.hrtime.bigint();
    await post(prihlaseni, 'http://x/api/prihlaseni', { email, heslo: 'jineSpatneHeslo' });
    casy.push(Number(process.hrtime.bigint() - t0) / 1e6);
    await pokusyReset(email);   /* ať do měření nezasáhne brzda */
  }
  return casy.sort((a, b) => a - b)[5];
}
const tExistuje = await medianMs('merene@example.com');
const tNeexistuje = await medianMs('vubec.neexistuje@example.com');
test('neexistující účet a špatné heslo vrací tutéž hlášku i stavový kód',
  (await (await spatne('vubec.neexistuje2@example.com')).json()).chyba
  === (await (await spatne('merene@example.com')).json()).chyba);
test('rozdíl časů obou větví je pod 50 ms (neprozradí existující účty)',
  Math.abs(tExistuje - tNeexistuje) < 50,
  'existující ' + tExistuje.toFixed(1) + ' ms vs neexistující ' + tNeexistuje.toFixed(1) + ' ms');
await pokusyReset('merene@example.com');

console.log('\n===== HLAVNÍ ÚČET POZNÁ SERVER, NE PROHLÍŽEČ (#95) =====\n');

const seznamHlavni = await (await get(uzivatele, 'http://x/api/uzivatele', cAdmin)).json();
const radekHlavni = (seznamHlavni.uzivatele || []).filter(x => x.hlavni);
test('seznam účtů označuje právě jeden účet jako hlavní', radekHlavni.length === 1,
  radekHlavni.length);
test('a je to účet z ADMIN_EMAIL', radekHlavni[0] && radekHlavni[0].email === ADMIN_EMAIL);
const jaHlavni = await (await get(ja, 'http://x/api/ja', cAdmin)).json();
test('/api/ja řekne hlavnímu administrátorovi, že hlavní je', jaHlavni.hlavni === true);
const jaObycejny = await (await get(ja, 'http://x/api/ja', cObch)).json();
test('/api/ja u běžného účtu hlavní příznak nenastavuje', jaObycejny.hlavni === false);

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
/* Sůl se hledá UVNITŘ otiskHesla, ne kdekoli v souboru. Volné hledání
 * `randomBytes(` přestalo platit ve chvíli, kdy soubor začal náhodná data
 * používat i jinde (zástupný otisk pro #93) — mutace „sůl je pro všechny
 * stejná" pak procházela, protože slovo v souboru pořád bylo. */
test('hesla se ukládají jen jako scrypt otisk se solí',
  /scryptSync/.test(sdilene)
  && /function otiskHesla[\s\S]{0,300}randomBytes\(\d+\)/.test(sdilene));
test('tajemstvi relace se bere z prostředí, není v kódu',
  /process\.env\.TAJEMSTVI_RELACE/.test(sdilene)
  && !/TAJEMSTVI_RELACE\s*=\s*['"]/.test(sdilene.replace(/process\.env\./g, '')));
/* Záložní hodnota „aby to běželo i bez proměnné" je pohodlná a je to díra:
 * tajemství zapsané v kódu si přečte každý, kdo vidí repozitář, a podepíše
 * si vlastní relaci. Raději ať server křičí, že proměnná chybí. */
test('tajemství relace nemá záložní hodnotu v kódu',
  !/TAJEMSTVI_RELACE\s*\|\|/.test(sdilene));

/* Zpoždění se v testech přeskakuje (jinak by sada běžela o minuty déle),
 * takže žádný test výš nedokáže, že se na ně na serveru opravdu čeká.
 * Hlídá to tahle statická kontrola. */
const kodPrihlaseni = readFileSync(resolve(KOREN, 'functions', 'prihlaseni.mjs'), 'utf8');
test('přihlášení se u neúspěchu skutečně zdrží (pockej + zpozdeniMs)',
  /pockej\s*\(\s*zpozdeniMs\s*\(/.test(kodPrihlaseni));
/* Pořadí je celá podstata #92: kdyby se počítadlo ptalo dřív, než se ověří
 * heslo, dal by se majitel účtu zamknout deseti špatnými pokusy. */
test('heslo se ověřuje dřív, než se rozhoduje o brzdě',
  kodPrihlaseni.indexOf('hesloSedi(') < kodPrihlaseni.indexOf('pokusyNeuspech('));
test('u neznámého účtu se scrypt počítá proti zástupnému otisku (#93)',
  /hesloSedi\([\s\S]{0,120}FALESNY_OTISK/.test(kodPrihlaseni));

console.log(`\n${ok} prošlo, ${fail} selhalo`);
if (fail) { console.log('\nSelhalo:\n - ' + selhalo.join('\n - ')); }
process.exit(fail ? 1 : 0);
