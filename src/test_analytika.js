/* Test: analytika užívání (#25 + #26 + #27, 17. 8. 2026)
 *
 * Zásady, které sada hlídá (rozhodnutí J. V. ze 17. 8. 2026):
 *  - Ukládají se VÝHRADNĚ agregáty (součty), nikdy stopa jednotlivce.
 *  - Klíč prvku nesmí nést data zakázky (argumenty volání se zahazují),
 *    jinak by v analytice končily identifikátory variant a názvy zákazníků.
 *  - Čas se měří jen při aktivní práci: mezera nad 2 minuty se nepočítá.
 *  - Čas se dělí OCK / PROJ podle záložky; ceník a nastavení se nepočítají.
 *  - Retence 24 měsíců; starší dny se mažou.
 *  - GDPR text zatím PRÁZDNÝ (čeká na právníka) — dokud je prázdný,
 *    aplikace nesmí nic zobrazovat, ale konstanta musí existovat.
 */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./analytika.js');

let fails = 0, passes = 0;
function test(name, cond, info) {
  if (cond) { passes++; console.log('  ok  ' + name); }
  else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
}

// ---- klíč prvku ------------------------------------------------------------
test('klíč skládá záložku, značku a popis',
  analytikaKlic('kalk', 'BUTTON', 'nabidkaWord()') === 'kalk|BUTTON|nabidkaWord(…)');
test('argumenty volání se zahazují (žádná data zakázky v klíči)',
  analytikaKlic('zakazka', 'BUTTON', "varAktivuj('v170255012')") === "zakazka|BUTTON|varAktivuj(…)",
  analytikaKlic('zakazka', 'BUTTON', "varAktivuj('v170255012')"));
test('víceřádkový popis se srazí na jednu řádku s jednou mezerou',
  analytikaKlic('kalk', 'BUTTON', 'ulozit \n  zakazku') === 'kalk|BUTTON|ulozit zakazku');
test('dlouhý popis se ořízne na 80 znaků',
  analytikaKlic('kalk', 'INPUT', 'x'.repeat(300)).length <= 'kalk|INPUT|'.length + 80);
test('prázdný popis nevyrábí prázdný klíč', analytikaKlic('kalk', 'BUTTON', '') === 'kalk|BUTTON|?');

// ---- denní agregát ---------------------------------------------------------
const den = analytikaNovyDen();
test('nový den má mapy kliků, zdržení a záložek + počty',
  den && den.kliky && den.zdrz && den.zalozky && den.pocty
  && den.pocty.zakazky === 0 && den.pocty.tiskyWord === 0);

analytikaPridej(den, { typ: 'klik', klic: 'kalk|BUTTON|nabidkaWord(…)' });
analytikaPridej(den, { typ: 'klik', klic: 'kalk|BUTTON|nabidkaWord(…)' });
analytikaPridej(den, { typ: 'zdrz', klic: 'kalk|INPUT|sirka', sek: 12 });
analytikaPridej(den, { typ: 'zdrz', klic: 'kalk|INPUT|sirka', sek: 5 });
analytikaPridej(den, { typ: 'zalozka', tab: 'proj' });
analytikaPridej(den, { typ: 'pocet', co: 'tiskyWord' });
analytikaPridej(den, { typ: 'neznamy', klic: 'x' });                 // ignoruje se
test('kliky se sčítají', den.kliky['kalk|BUTTON|nabidkaWord(…)'] === 2);
test('zdržení se sčítá v sekundách', den.zdrz['kalk|INPUT|sirka'] === 17);
test('záložky se počítají', den.zalozky.proj === 1);
test('počty se počítají', den.pocty.tiskyWord === 1);
test('neznámý typ události se tiše ignoruje', Object.keys(den.kliky).length === 1);

/* Strop počtu klíčů: bez něj by rozbitý klient (nebo útočník) nafoukl denní
 * záznam do nekonečna. Přeteklé klíče se slévají do „…ostatní". */
const denStrop = analytikaNovyDen();
for (let i = 0; i < ANALYTIKA_MAX_KLICU + 50; i++)
  analytikaPridej(denStrop, { typ: 'klik', klic: 'kalk|BUTTON|k' + i + '(…)' });
test('počet klíčů v mapě má strop', Object.keys(denStrop.kliky).length <= ANALYTIKA_MAX_KLICU + 1);
test('přeteklé klíče se slévají do „…ostatní"', denStrop.kliky['…ostatni'] === 50);

// ---- slévání (server přičítá dávku klienta ke dni) --------------------------
const a = analytikaNovyDen(), b = analytikaNovyDen();
analytikaPridej(a, { typ: 'klik', klic: 'kalk|BUTTON|x(…)' });
analytikaPridej(b, { typ: 'klik', klic: 'kalk|BUTTON|x(…)' });
analytikaPridej(b, { typ: 'klik', klic: 'proj|BUTTON|y(…)' });
analytikaPridej(b, { typ: 'zdrz', klic: 'kalk|INPUT|s', sek: 9 });
analytikaPridej(b, { typ: 'pocet', co: 'prihlaseni' });
const slite = analytikaSlij(a, b);
test('slévání sčítá společné klíče', slite.kliky['kalk|BUTTON|x(…)'] === 2);
test('slévání přebírá nové klíče', slite.kliky['proj|BUTTON|y(…)'] === 1);
test('slévání sčítá zdržení i počty', slite.zdrz['kalk|INPUT|s'] === 9 && slite.pocty.prihlaseni === 1);
test('slévání snese chybějící části (stará data)', analytikaSlij({}, b).kliky['proj|BUTTON|y(…)'] === 1);

// ---- počty odvozené z kliků (jedna pravda pro klienta) ----------------------
test('klik na novou zakázku se počítá jako založená zakázka',
  analytikaPocetZKliku('zakazka|BUTTON|novaZakazkaUI(…)') === 'zakazky');
test('klik na Word nabídky/SoD je tisk Word',
  analytikaPocetZKliku('kalk|BUTTON|nabidkaWord(…)') === 'tiskyWord'
  && analytikaPocetZKliku("proj|BUTTON|sodWord(…)") === 'tiskyWord');
test('klik na tiskový náhled je tisk náhledem',
  analytikaPocetZKliku('kalk|BUTTON|nabidkaOckDokument(…)') === 'tiskyNahled'
  && analytikaPocetZKliku('proj|BUTTON|nabidkaProjNahled(…)') === 'tiskyNahled');
test('obyčejný klik žádný počet nezvyšuje', analytikaPocetZKliku('kalk|BUTTON|prepniTab(…)') === null);

// ---- měření času (#25): aktivní práce, ne otevřené okno ---------------------
const MIN = 60000;
let stav = casNovy();
stav = casKrok(stav, 1000, 'ock');                       // první aktivita nic nepřičítá
test('první aktivita čas nezakládá', stav.ock === 0 && stav.proj === 0);
stav = casKrok(stav, 1000 + 30000, 'ock');               // +30 s práce v OCK
test('mezera pod limitem se přičítá části, kde se pracovalo', stav.ock === 30);
stav = casKrok(stav, 1000 + 30000 + 3 * MIN, 'ock');     // 3 min pauza — nepočítá se
test('mezera nad 2 minuty se NEpočítá (odešel od počítače)', stav.ock === 30);
stav = casKrok(stav, 1000 + 30000 + 3 * MIN + 45000, 'proj');  // 45 s, ale v OCK záložce
test('mezera se přičítá části, kde běžela PŘEDCHOZÍ aktivita', stav.ock === 75 && stav.proj === 0);
stav = casKrok(stav, 1000 + 30000 + 3 * MIN + 45000 + 20000, 'proj');
test('práce v PROJ se přičítá projekci', stav.proj === 20);
stav = casKrok(stav, stav.posledni + 30000, null);       // ceník/nastavení: cast=null
stav = casKrok(stav, stav.posledni + 40000, null);
/* Mezera PROJ→ceník (30 s) se přičte projekci — těch 30 s se pracovalo
 * v PROJ, klik do ceníku je až její konec. Mezera ceník→ceník už nikam. */
test('záložky mimo kalkulace samy čas nesbírají', stav.ock === 75 && stav.proj === 20 + 30);

test('mapování záložek: OCK', ['kalk', 'detail', 'spec', 'specdata', 'kryci']
  .every(t => analytikaCastZTabu(t) === 'ock'));
test('mapování záložek: PROJ', ['proj', 'detailproj', 'kryciproj'].every(t => analytikaCastZTabu(t) === 'proj'));
test('mapování záložek: ceníky a přehled se neměří',
  ['cenik', 'cenikproj', 'zakazka', 'schvalovani'].every(t => analytikaCastZTabu(t) === null));

// ---- retence 24 měsíců ------------------------------------------------------
const dnes = '2026-08-17';
const stare = analytikaRetence(
  ['den/2024-08-16', 'den/2024-08-18', 'den/2026-08-01', 'den/spatny-klic', 'jine/2020-01-01'],
  dnes);
test('den starší 24 měsíců se maže', stare.includes('den/2024-08-16'));
test('den uvnitř 24 měsíců zůstává', !stare.includes('den/2024-08-18') && !stare.includes('den/2026-08-01'));
test('cizí a vadné klíče se nemažou', !stare.includes('jine/2020-01-01') && !stare.includes('den/spatny-klic'));

// ---- součty za období + srovnání měsíců -------------------------------------
const d1 = analytikaNovyDen(); analytikaPridej(d1, { typ: 'pocet', co: 'zakazky' });
const d2 = analytikaNovyDen(); analytikaPridej(d2, { typ: 'pocet', co: 'zakazky' });
analytikaPridej(d2, { typ: 'klik', klic: 'kalk|BUTTON|x(…)' });
const d3 = analytikaNovyDen(); analytikaPridej(d3, { typ: 'pocet', co: 'tiskyWord' });
const souhrn = analytikaObdobi([
  ['den/2026-07-30', d1], ['den/2026-08-02', d2], ['den/2026-08-15', d3],
]);
test('součet za období sčítá všechny dny',
  souhrn.celkem.pocty.zakazky === 2 && souhrn.celkem.pocty.tiskyWord === 1);
test('měsíční řada pro srovnání (měsíc/rok) drží počty po měsících',
  souhrn.poMesicich['2026-07'].pocty.zakazky === 1
  && souhrn.poMesicich['2026-08'].pocty.zakazky === 1
  && souhrn.poMesicich['2026-08'].pocty.tiskyWord === 1);

// ---- režim sběru ------------------------------------------------------------
const rez = analytikaRezimNovy();
test('sběr je ve výchozím stavu zapnutý', rez.sber === true);
const vyp = analytikaRezimNastav(rez, false, 'admin@x.cz', '2026-08-17T10:00:00Z');
test('vypnutí se podepisuje (kdo + kdy)', vyp.sber === false && vyp.kdo === 'admin@x.cz' && !!vyp.kdy);
test('nastavení nebool hodnoty se odmítne', analytikaRezimNastav(rez, 'ne', 'x', 'y') === null);

// ---- GDPR text čeká na právníka --------------------------------------------
test('konstanta GDPR textu existuje a je zatím PRÁZDNÁ (rozhodnutí 17. 8.)',
  typeof ANALYTIKA_GDPR_TEXT === 'string' && ANALYTIKA_GDPR_TEXT === '');


/* ---------- očista dávky od klienta (bezpečnostní audit 22. 8. 2026, B8) ---------- */
test('B8: analytikaCislo — záporné, NaN a řetězec dávají 0', analytikaCislo(-5) === 0 && analytikaCislo('AAA') === 0 && analytikaCislo(NaN) === 0);
test('B8: analytikaCislo — běžné číslo projde, obří se ořízne', analytikaCislo(3.4) === 3 && analytikaCislo(1e12) === ANALYTIKA_MAX_HODNOTA);
test('B8: analytikaKlicOrez — dlouhý klíč se ořízne', analytikaKlicOrez('x'.repeat(5000)).length === ANALYTIKA_MAX_KLIC_ZNAKU);
const oc = analytikaDavkaOcisti({ kliky: { a: 1 }, poUzivateli: { 'x@y': { chyby: 9 } }, zalozky: 'nic', cizi: 1 });
test('B8: analytikaDavkaOcisti — poUzivateli a cizí klíče zahodí, nesmyslný typ nahradí prázdnem',
  oc.kliky.a === 1 && !('poUzivateli' in oc) && !('cizi' in oc) && typeof oc.zalozky === 'object');
const sl = analytikaSlij({ pocty: { chyby: 2 } }, { pocty: { chyby: -10, zakazky: 'zz' }, zalozky: Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['z' + i, 1])) });
test('B8: slití nepřičte záporné ani řetězec', sl.pocty.chyby === 2 && sl.pocty.zakazky === 0);
test('B8: mapa záložek má strop počtu klíčů', Object.keys(sl.zalozky).length <= ANALYTIKA_MAX_KLICU + 1);
const pu = analytikaPrictiUzivateli({ poUzivateli: {} }, 'a@b.cz', { chyby: -3, zakazky: 2 });
test('B8: serverová atribuce také nepřičítá záporné', pu.poUzivateli['a@b.cz'].chyby === 0 && pu.poUzivateli['a@b.cz'].zakazky === 2);

/* ---------- rozpad záložek a prvků po uživatelích (31. 8. 2026) ----------
 * Hlášeno J. V.: „analytika na uživatele nefunguje, zobrazují se souhrnné
 * informace." Filtr uživatele se do té doby týkal jen šesti počítadel;
 * záložky a prvky zůstávaly anonymní, takže se jeho výběrem nic nezměnilo. */
{
  const den = analytikaNovyDen('2026-08-31');
  const davka = { pocty: { zakazky: 1 }, zalozky: { kalk: 3, proj: 1 }, kliky: { 'set|C.marze': 5 } };
  analytikaPrictiUzivateli(den, 'Anna@Example.CZ', davka.pocty, davka);
  analytikaPrictiUzivateli(den, 'bob@example.cz', { zakazky: 2 }, { zalozky: { kalk: 1 }, kliky: {} });

  const anna = analytikaPoctyUzivatele(den, 'anna@example.cz');
  test('uživatel má vlastní rozpad záložek', anna.zalozky.kalk === 3, JSON.stringify(anna.zalozky));
  test('uživatel má vlastní rozpad prvků', anna.kliky['set|C.marze'] === 5, JSON.stringify(anna.kliky));
  test('cizí uživatel má svoje čísla', analytikaPoctyUzivatele(den, 'bob@example.cz').zalozky.kalk === 1);
  test('e-mail se normalizuje na malá písmena', analytikaUzivatele(den).join(',') === 'anna@example.cz,bob@example.cz',
    analytikaUzivatele(den).join(','));
  test('bez filtru se dál ukazuje souhrn dne',
    typeof analytikaPoctyUzivatele(den, '').zalozky === 'object');

  /* Slití dvou dnů nesmí rozpad ztratit — přehled se skládá přes 24 měsíců. */
  const den2 = analytikaNovyDen('2026-09-01');
  analytikaPrictiUzivateli(den2, 'anna@example.cz', { zakazky: 1 }, { zalozky: { kalk: 2 }, kliky: {} });
  const soucet = analytikaSlij(analytikaSlij(null, den), den2);
  test('slitím dnů se rozpad uživatele sečte',
    analytikaPoctyUzivatele(soucet, 'anna@example.cz').zalozky.kalk === 5,
    JSON.stringify(analytikaPoctyUzivatele(soucet, 'anna@example.cz').zalozky));

  /* Zdržení (heat mapa) zůstává anonymní — vědomé rozhodnutí. */
  test('zdržení se k uživateli nepřiřazuje',
    analytikaPoctyUzivatele(den, 'anna@example.cz').zdrz === undefined);
}

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
