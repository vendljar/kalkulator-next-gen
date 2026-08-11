/* ============================================================
 * Test prava.js – co smí která role v prohlížeči vidět
 *
 * PROČ SAMOSTATNÁ SADA VEDLE test_prava_klient.js
 *
 * test_prava_klient.js popisuje NÁLEZ z 5. 8. 2026: obchodník si mohl
 * tlačítkem v liště zapnout pohled administrátora a dostat se tak
 * k ceníkům a nákladům. Je to zápis jedné konkrétní opravy.
 *
 * Tahle sada popisuje PRAVIDLO, které z opravy zbylo, a dívá se na ně
 * z druhé strany: ne „co se stalo", ale „co smí každá z těch tří rolí,
 * které aplikace zná". Rozdíl je v tom, co obě sady hlídají do budoucna:
 *
 *   – klientská sada spadne, když se vrátí tlačítko,
 *   – tahle sada spadne, když se PŘIBERE role (třeba „Technik") a nikdo
 *     nerozhodne, jestli vidí náklady, nebo když se role někde
 *     PŘEJMENUJE a `prava.js` o tom neví.
 *
 * Druhá věc je právě to přejmenování. Jména rolí žijí v `sleva.js`
 * (ROLE_VYCHOZI) a `prava.js` si drží vlastní řetězec 'Administrátor'.
 * Kdyby se v jednom místě přepsalo a ve druhém ne, nepoznal by to nikdo:
 * `pravaSmiAdmin()` by prostě začala odpovídat „ne" úplně všem a
 * administrátor by přišel o ceníkové záložky. Chyba, která se hlásí jako
 * „mně se to nezobrazuje" a hledá se hodiny. Proto se tu obě strany
 * porovnávají.
 *
 * Připomínka, aby se sada nečetla jako víc, než je: skutečná práva hlídá
 * server. Tohle rozhoduje jen o tom, co se komu VYKRESLÍ.
 * ============================================================ */
const { PRAVA_ADMIN, pravaSmiAdmin } = require('./prava.js');
const { ROLE_VYCHOZI } = require('./sleva.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

/* Smyšlené účty – v testech nikdy nefigurují skuteční lidé z firmy. */
const ucet = (role) => ({ email: 'jan.zkusebni@priklad.cz', jmeno: 'Jan Zkušební', role });

/* ============================================================
 * 1) Tři role a jejich oprávnění – celá matice najednou
 * ============================================================ */

/* Matice se píše výčtem, ne odvozením z PRAVA_ADMIN. Kdyby se počítala
 * ze zdrojáku („admin ano, ostatní ne"), potvrzovala by jen sama sebe:
 * přepsáním konstanty v prava.js by se přepsalo i očekávání testu. */
const MATICE = [
  ['Obchodník', false],
  ['Vedoucí', false],
  ['Administrátor', true],
];

MATICE.forEach(([role, smi]) => {
  test('role ' + role + (smi ? ' vidí náklady a ceníky' : ' náklady ani ceníky nevidí'),
    pravaSmiAdmin(ucet(role)) === smi, pravaSmiAdmin(ucet(role)));
});

/* Aplikace zná právě tři role. Čtvrtá by se sem musela dopsat i s
 * rozhodnutím, jestli vidí náklady – dokud se to nerozhodne, spadne
 * tenhle test a nikoli nabídka odeslaná zákazníkovi. */
test('sada pokrývá všechny role, které aplikace zná',
  MATICE.length === ROLE_VYCHOZI.length
  && MATICE.every(([role]) => ROLE_VYCHOZI.includes(role)),
  ROLE_VYCHOZI.join(' | '));

/* Jméno role je řetězec, který putuje ze serveru přes sleva.js až sem.
 * Stačí, aby se na jednom z těch míst přepsalo, a administrátor přijde
 * o ceníkové záložky – bez jediné chybové hlášky. */
test('PRAVA_ADMIN je jedna ze známých rolí (jména se nerozešla)',
  ROLE_VYCHOZI.includes(PRAVA_ADMIN), PRAVA_ADMIN);
test('práva zná právě jednu privilegovanou roli',
  MATICE.filter(([, smi]) => smi).length === 1);
test('privilegovaná role v matici je právě PRAVA_ADMIN',
  MATICE.find(([, smi]) => smi)[0] === PRAVA_ADMIN, PRAVA_ADMIN);

/* ============================================================
 * 2) Okrajové případy jména role – výchozí odpověď je „ne"
 * ============================================================ */

/* Role není nikdy uhodnutá. Cokoli, co se nerovná přesně známé roli,
 * končí u pohledu běžného uživatele – i kdyby to vypadalo blízko.
 * Opačné pořadí (nejdřív povolit, pak se ptát) by znamenalo, že každý
 * překlep v účtu otevírá nákupní ceny. */
test('neznámá role nedostane pohled administrátora',
  pravaSmiAdmin(ucet('Technik')) === false);
test('prázdná role nedostane pohled administrátora',
  pravaSmiAdmin(ucet('')) === false);
test('prázdná role není totéž co nepřihlášený (prázdno není nula)',
  pravaSmiAdmin(ucet('')) !== pravaSmiAdmin(null));
test('chybějící role nedostane pohled administrátora',
  pravaSmiAdmin({ email: 'jan.zkusebni@priklad.cz' }) === false);
test('role rovná null nedostane pohled administrátora',
  pravaSmiAdmin(ucet(null)) === false);

/* Role se porovnává doslova, protože doslova ji server i posílá – vybírá
 * ji z pevného seznamu, nepíše ji člověk. Kdyby se sem začaly dostávat
 * hodnoty s jiným zápisem, není to důvod je uznat, ale důvod hledat,
 * kdo je tam dal. */
test('jiná velikost písmen roli neuzná',
  pravaSmiAdmin(ucet('administrátor')) === false);
test('verzálky roli neuznají',
  pravaSmiAdmin(ucet('ADMINISTRÁTOR')) === false);
test('zápis bez diakritiky roli neuzná',
  pravaSmiAdmin(ucet('Administrator')) === false);
test('mezery kolem jména role se netolerují',
  pravaSmiAdmin(ucet(' Administrátor ')) === false);

/* Role starší databáze („Jednatel") se na „Administrátor" převádí
 * migrací v sleva.js, ne tady. Kdyby se prava.js pokusily migrovat samy,
 * měly by dvě místa dvě různá pravidla. */
test('starý název role se tu sám nepřevádí (od toho je migrace v sleva.js)',
  pravaSmiAdmin(ucet('Jednatel')) === false);

/* ============================================================
 * 3) Nikdo přihlášen = záložní offline soubor
 * ============================================================ */

/* Offline záloha nemá server, který by roli přidělil. Kdyby tam
 * odpověď zněla „ne", nedostal by se k vlastnímu ceníku ani ten, komu
 * záloha patří – a k tomu slouží. */
test('bez přihlášení (null) přepínač náhledu zůstává', pravaSmiAdmin(null) === true);
test('bez přihlášení (undefined) přepínač náhledu zůstává', pravaSmiAdmin(undefined) === true);
test('bez přihlášení se nevolá jako bez argumentu jinak', pravaSmiAdmin() === true);

/* ============================================================
 * 4) Odolnost – funkce se ptá render() při každém překreslení
 * ============================================================ */

/* Výjimka by neshodila tlačítko, ale celou stránku. Proto se sem posílá
 * schválně nesmysl: prázdný objekt, pole, řetězec, číslo i funkce. */
[['prázdný objekt', {}, false],
 ['pole', [], false],
 ['řetězec s názvem role', 'Administrátor', false],
 ['číslo', 7, false],
 ['nula', 0, false],
 ['false', false, false],
 ['prázdný řetězec', '', false],
 ['funkce', function () { return { role: 'Administrátor' }; }, false],
].forEach(([popis, vstup, cekano]) => {
  let vysledek;
  let spadlo = false;
  try { vysledek = pravaSmiAdmin(vstup); } catch (e) { spadlo = true; }
  test('nesmysl na vstupu (' + popis + ') funkci neshodí a končí u „ne"',
    !spadlo && vysledek === cekano, spadlo ? 'vyhozena výjimka' : vysledek);
});

/* ============================================================
 * 5) Funkce nic nemění a nic si nepamatuje
 * ============================================================ */

/* Volá se při každém překreslení, tedy mnohokrát za sebou nad týmž
 * objektem. Kdyby si do něj cokoli dopsala nebo si držela stav, chovala
 * by se aplikace po několikátém překreslení jinak než napoprvé. */
const ja = ucet('Obchodník');
const predtim = JSON.stringify(ja);
pravaSmiAdmin(ja);
test('funkce nesahá do předaného účtu', JSON.stringify(ja) === predtim, JSON.stringify(ja));
test('opakované volání dává stejnou odpověď',
  pravaSmiAdmin(ja) === false && pravaSmiAdmin(ja) === false && pravaSmiAdmin(ja) === false);
test('přepnutí role se projeví hned',
  (() => { const u = ucet('Obchodník'); const pred = pravaSmiAdmin(u); u.role = PRAVA_ADMIN;
           return pred === false && pravaSmiAdmin(u) === true; })());

/* ============================================================
 * 6) Rozhraní modulu
 * ============================================================ */

test('modul vydává PRAVA_ADMIN i pravaSmiAdmin',
  typeof PRAVA_ADMIN === 'string' && PRAVA_ADMIN !== '' && typeof pravaSmiAdmin === 'function');
test('pravaSmiAdmin vrací vždy true/false, nikdy „skoro pravdu"',
  [null, undefined, {}, ucet('Obchodník'), ucet(PRAVA_ADMIN), 'x', 0]
    .every(v => typeof pravaSmiAdmin(v) === 'boolean'));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
