/* Test sirotčích ručních přepisů (#4).
 *
 * Ruční přepis množství, ceny a názvu je klíčovaný NÁZVEM položky. To je
 * pohodlné, dokud se položka nepřejmenuje – pak přepis zůstane v datech viset
 * na klíči, na který už nic nesedí. Obchodník vidí, že se jeho ruční úprava
 * „ztratila", a v souboru zakázky se hromadí balast, který cestuje do dalších
 * variant i exportů.
 *
 * Testy hlídají čtyři věci:
 *   a) rejstřík r.nazvyPolozek z engine.js opravdu obsahuje i položky, které
 *      se do výsledku nedostaly (jinak by se hlásili falešní sirotci),
 *   b) prepisySirotci() najde jen skutečné sirotky a nic nemaže samo,
 *   c) prepisyPrejmenuj() přenese přepisy na nový název a nepřepíše to,
 *      co uživatel zadal už pod novým názvem,
 *   d) přejmenování položky v ceníku (katalogUpravVc) migraci opravdu spustí.
 */
const fs = require('fs');
const eng = require('./engine.js');
const P = require('./prepisy.js');
const K = require('./katalog.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const zadani = () => JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const cenik = () => ZC.zkusebniCenik();
const spocti = z => eng.vypocet(z, cenik(), JEKLY, false);

/* ---- a) rejstřík názvů ---- */
const r = spocti(zadani());
test('výsledek nese rejstřík názvů', Array.isArray(r.nazvyPolozek) && r.nazvyPolozek.length > 20,
  r.nazvyPolozek && r.nazvyPolozek.length);
test('rejstřík obsahuje položky sekcí',
  Object.keys(r.sekce).every(s => r.sekce[s].every(x => r.nazvyPolozek.indexOf(x.nazev) >= 0
    || r.nazvyPolozek.indexOf(x.origNazev) >= 0)));
test('rejstřík obsahuje příplatky',
  r.priplatky.every(x => r.nazvyPolozek.indexOf(x.origNazev || x.nazev) >= 0));
test('rejstřík je bez duplicit', new Set(r.nazvyPolozek).size === r.nazvyPolozek.length);

/* Položky nedostupné pro daný typ šachty (interiér vs. exteriér) se do výsledku
 * nedostanou, ale jejich název v rejstříku být MUSÍ – jinak by ruční přepis
 * u exteriérové položky vypadal na interiérové šachtě jako sirotek. */
const zInt = zadani(); zInt.typSachty = 'interiérová';
const zExt = zadani(); zExt.typSachty = 'exteriérová';
const rInt = spocti(zInt), rExt = spocti(zExt);
const chybi = rExt.volitelneKatalog.map(x => x.origNazev || x.nazev)
  .filter(n => rInt.nazvyPolozek.indexOf(n) < 0);
test('rejstřík interiérové šachty zná i exteriérové volitelné položky', chybi.length === 0, chybi);

/* ---- b) hledání sirotků ---- */
const z1 = zadani();
z1.mnozstviPrepis = {};
z1.cenyPrepis = {};
z1.nazvyPrepis = {};
const zivyNazev = r.sekce.rezie[0].origNazev || r.sekce.rezie[0].nazev;
z1.mnozstviPrepis[zivyNazev] = 3;
z1.mnozstviPrepis['POLOŽKA, KTERÁ NEEXISTUJE'] = 5;
z1.cenyPrepis['DÁVNO SMAZANÁ POLOŽKA'] = 1234.5;
z1.nazvyPrepis[zivyNazev] = 'Přejmenovaná režie';

const r1 = spocti(z1);
const s1 = P.prepisySirotci(z1, r1.nazvyPolozek);
test('sirotci najdou jen neexistující klíče', s1.length === 2, s1.map(x => x.klic));
test('sirotek nese mapu i popis', s1[0].mapa === 'mnozstviPrepis' && !!s1[0].popis, s1[0]);
test('živý přepis se nehlásí jako sirotek', !s1.some(x => x.klic === zivyNazev));
test('hledání sirotků nic nemaže',
  Object.keys(z1.mnozstviPrepis).length === 2 && Object.keys(z1.cenyPrepis).length === 1);
test('přejmenování položky nedělá ze svého klíče sirotka',
  !P.prepisySirotci(z1, r1.nazvyPolozek).some(x => x.mapa === 'nazvyPrepis'));

/* ---- úklid ---- */
const smazano = P.prepisyUklid(z1, s1);
test('úklid smaže právě nalezené sirotky', smazano === 2);
test('úklid nechá živé přepisy být', z1.mnozstviPrepis[zivyNazev] === 3 && Object.keys(z1.cenyPrepis).length === 0);
test('po úklidu už žádní sirotci nejsou', P.prepisySirotci(z1, r1.nazvyPolozek).length === 0);
test('opakovaný úklid nic nehlásí', P.prepisyUklid(z1, s1) === 0);

/* ---- c) migrace při přejmenování ---- */
const z2 = { mnozstviPrepis: { 'STARÝ NÁZEV': 7 }, cenyPrepis: { 'STARÝ NÁZEV': 99 }, nazvyPrepis: {} };
test('přejmenování přenese všechny mapy', P.prepisyPrejmenuj(z2, 'STARÝ NÁZEV', 'NOVÝ NÁZEV') === 2);
test('přepisy sedí na novém názvu', z2.mnozstviPrepis['NOVÝ NÁZEV'] === 7 && z2.cenyPrepis['NOVÝ NÁZEV'] === 99);
test('starý klíč zmizel', !('STARÝ NÁZEV' in z2.mnozstviPrepis) && !('STARÝ NÁZEV' in z2.cenyPrepis));
test('přejmenování na stejný název nic nedělá', P.prepisyPrejmenuj(z2, 'NOVÝ NÁZEV', 'NOVÝ NÁZEV') === 0);
test('přejmenování bez přepisů nic nedělá', P.prepisyPrejmenuj(z2, 'NIC TAKOVÉHO', 'JINÝ') === 0);

const z3 = { mnozstviPrepis: { A: 1, B: 2 } };
P.prepisyPrejmenuj(z3, 'A', 'B');
test('existující přepis pod novým názvem má přednost', z3.mnozstviPrepis.B === 2, z3.mnozstviPrepis);
test('starý klíč zmizí i tak', !('A' in z3.mnozstviPrepis));

/* ---- d) přejmenování v ceníku spustí migraci ----
 * V prohlížeči jsou obě části jeden skript, takže katalog.js vidí
 * prepisyPrejmenuj jako globální funkci. V Node to musíme dorovnat. */
global.prepisyPrejmenuj = P.prepisyPrejmenuj;

const kat = K.katalogPrazdny();
const z4 = zadani();
K.katalogPridejVc(kat, z4, 'rezie', { nazev: 'DOPRAVA NA STAVBU', mnozstvi: 1, cena: 1000 });
z4.mnozstviPrepis = { 'DOPRAVA NA STAVBU': 4 };
z4.cenyPrepis = { 'DOPRAVA NA STAVBU': 1500 };
const kid = K.katalogSekce(kat, 'rezie')[0].kid;
K.katalogUpravVc(kat, z4, 'rezie', kid, 'nazev', 'DOPRAVA A PŘESUN HMOT');
test('přejmenování v ceníku přenese ruční množství', z4.mnozstviPrepis['DOPRAVA A PŘESUN HMOT'] === 4, z4.mnozstviPrepis);
test('přejmenování v ceníku přenese ruční cenu', z4.cenyPrepis['DOPRAVA A PŘESUN HMOT'] === 1500);
test('po přejmenování v ceníku nevznikne sirotek',
  P.prepisySirotci(z4, spocti(z4).nazvyPolozek).length === 0,
  P.prepisySirotci(z4, spocti(z4).nazvyPolozek));
K.katalogUpravVc(kat, z4, 'rezie', kid, 'cena', 2000);
test('změna ceny v ceníku přepisy neruší', z4.cenyPrepis['DOPRAVA A PŘESUN HMOT'] === 1500);

/* ---- popisky hodnot do UI ---- */
test('popis hodnoty u přejmenování', P.prepisHodnotaText({ mapa: 'nazvyPrepis', hodnota: 'Nový' }).indexOf('Nový') > 0);
test('popis hodnoty u ceny má Kč', P.prepisHodnotaText({ mapa: 'cenyPrepis', hodnota: 1234.567 }) === '1234.57 Kč');
test('popis hodnoty u množství je holé číslo', P.prepisHodnotaText({ mapa: 'mnozstviPrepis', hodnota: '4' }) === '4');

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
