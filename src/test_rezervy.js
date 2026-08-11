/* Rezervy v kalkulaci OCK – čtyři pole, čtyři různé účinky.
 *
 * PROČ TAHLE SADA VZNIKLA
 *
 * Zadání zná několik nezávislých rezerv: procento na profily, procento na
 * plechy, procento k základní ceně a procento k příplatkům. Každá z nich je
 * obchodní rozhodnutí („na tuhle šachtu si necháme rezervu na materiál"),
 * které se zadává v jednom poli a musí se projevit v jednom místě výpočtu.
 *
 * Mutační testování jádra (mutace_jadro.mjs) ukázalo, že dvě z nich dosud
 * nehlídal nikdo:
 *
 *   – Rezerva profilů a rezerva plechů se v testech nikdy nenastavovaly, obě
 *     zůstávaly na nule. Kdyby se v jádře prohodily, ovlivňovala by obě pole
 *     tutéž položku a to druhé by nedělalo vůbec nic – a všechny sady by
 *     zůstaly zelené. Obchodník by zadával rezervu na plechy a měnila by se
 *     mu hmotnost profilů.
 *   – Rezerva příplatků se nenastavovala vůbec. Celá větev byla netestovaná:
 *     rezerva se spočítala, ukázala v mezivýsledku a pak zahodila.
 *
 * Testy proto zadávají rezervy RŮZNÉ a nenulové – jen tak je poznat, která
 * se kam propsala. Tvrdí se VZTAHY (o kolik se co zvedlo proti běhu bez
 * rezervy), ne konkrétní částky: čísla ze zkušebního ceníku by se při jeho
 * výměně rozešla a test by pak hlídal vzorek místo pravidla.
 */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const zadani = () => JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const cenik = () => ZC.zkusebniCenik();
const CEIL = eng.CEIL;
const blizko = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/* Dvě schválně RŮZNÁ procenta. Kdyby byla stejná, záměna polí by se v číslech
 * vůbec neprojevila a test by mlčel i nad rozbitým jádrem. */
const REZ_PROFILY = 0.10;
const REZ_PLECHY  = 0.25;

const PLECHY_HLAVNI = 'PLECHY - HLAVNÍ KONSTRUKČNÍ PLECHY';
const plechRadek = r => r.sekce.hrubaOck.find(x => x.origNazev === PLECHY_HLAVNI);

/* ============================================================
 * 1) Rezerva profilů a rezerva plechů jsou dvě různá pole
 * ============================================================ */

const bezRezerv = eng.vypocet(zadani(), cenik(), JEKLY, true);

const zObe = zadani();
zObe.rezervaProfilyPct = REZ_PROFILY;
zObe.rezervaPlechyPct = REZ_PLECHY;
const rObe = eng.vypocet(zObe, cenik(), JEKLY, true);

/* Rezerva profilů se přičítá k hmotnosti, délce i ploše profilů – ke všem
 * třem stejným podílem, protože jde o tentýž materiál navíc. */
test('rezerva profilů zvedne hmotnost profilů o zadané procento',
  blizko(rObe.profily.celkemKg, bezRezerv.profily.celkemKg * (1 + REZ_PROFILY), 1e-6),
  rObe.profily.celkemKg + ' vs ' + bezRezerv.profily.celkemKg * (1 + REZ_PROFILY));
test('rezerva profilů zvedne stejným dílem i délku a plochu profilů',
  blizko(rObe.profily.celkemM, bezRezerv.profily.celkemM * (1 + REZ_PROFILY), 1e-6)
  && blizko(rObe.profily.celkemM2, bezRezerv.profily.celkemM2 * (1 + REZ_PROFILY), 1e-6));

/* Účtované množství plechů je hmotnost spojů PLUS rezerva plechů. Podklad
 * (r.plechy.kg) zůstává bez rezervy – je to výsledek konstrukce, ne obchodní
 * rozhodnutí, a v detailu se čte jako „kolik plechu tam doopravdy je". */
test('rezerva plechů zvedne účtované množství plechů o zadané procento',
  blizko(plechRadek(rObe).mnozstvi, rObe.plechy.kg * (1 + REZ_PLECHY), 1e-6),
  plechRadek(rObe).mnozstvi + ' vs ' + rObe.plechy.kg * (1 + REZ_PLECHY));
test('rezerva plechů nemění spočtenou hmotnost spojů',
  blizko(rObe.plechy.kg, bezRezerv.plechy.kg, 1e-9), rObe.plechy.kg);

/* Tohle je jádro celé sady: každé pole si hlídá svoje. Kdyby se v jádře
 * použilo procento profilů na plechy (nebo naopak), vyšel by tady poměr
 * toho druhého pole. */
test('každá rezerva se propíše svým vlastním procentem, ne procentem té druhé',
  blizko(rObe.profily.celkemKg / bezRezerv.profily.celkemKg, 1 + REZ_PROFILY, 1e-9)
  && blizko(plechRadek(rObe).mnozstvi / plechRadek(bezRezerv).mnozstvi, 1 + REZ_PLECHY, 1e-9),
  (rObe.profily.celkemKg / bezRezerv.profily.celkemKg) + ' / '
  + (plechRadek(rObe).mnozstvi / plechRadek(bezRezerv).mnozstvi));

/* A ještě jednou obráceně, každé pole samostatně: samotná rezerva profilů se
 * nesmí dotknout plechů a samotná rezerva plechů profilů. */
const zJenProfily = zadani(); zJenProfily.rezervaProfilyPct = REZ_PROFILY;
const rJenProfily = eng.vypocet(zJenProfily, cenik(), JEKLY, true);
test('rezerva profilů nechává účtované množství plechů beze změny',
  blizko(plechRadek(rJenProfily).mnozstvi, plechRadek(bezRezerv).mnozstvi, 1e-9),
  plechRadek(rJenProfily).mnozstvi + ' vs ' + plechRadek(bezRezerv).mnozstvi);

const zJenPlechy = zadani(); zJenPlechy.rezervaPlechyPct = REZ_PLECHY;
const rJenPlechy = eng.vypocet(zJenPlechy, cenik(), JEKLY, true);
test('rezerva plechů nechává hmotnost profilů beze změny',
  blizko(rJenPlechy.profily.celkemKg, bezRezerv.profily.celkemKg, 1e-9),
  rJenPlechy.profily.celkemKg + ' vs ' + bezRezerv.profily.celkemKg);

/* Obě rezervy jsou materiál navíc, takže musí cenu zvednout – ne snížit. */
test('obě rezervy zvednou nákladovou cenu',
  rJenProfily.souhrn.zakladNaklad > bezRezerv.souhrn.zakladNaklad
  && rJenPlechy.souhrn.zakladNaklad > bezRezerv.souhrn.zakladNaklad);

/* ============================================================
 * 2) Rezerva příplatků
 * ============================================================
 * Příplatky mají vlastní rezervu a vlastní součet: v nabídce jdou zvlášť,
 * protože zákazník si je vybírá. Rezerva se do toho součtu MUSÍ započítat –
 * jinak se zadá, ukáže v kalkulaci a při odeslání zmizí. */

const REZ_PRIPLATKY = 0.10;
const soucetSMarzi = r => r.priplatky.reduce((a, p) => a + p.sMarzi, 0);
const soucetNakladu = r => r.priplatky.reduce((a, p) => a + p.naklad, 0);

const zPrip = zadani(); zPrip.rezervaPriplatkyPct = REZ_PRIPLATKY;
const rPrip = eng.vypocet(zPrip, cenik(), JEKLY, true);

test('bez rezervy je cena příplatků jen zaokrouhlený součet řádků',
  blizko(bezRezerv.souhrn.priplatkyCena, CEIL(soucetSMarzi(bezRezerv), 1000), 1e-6),
  bezRezerv.souhrn.priplatkyCena + ' vs ' + CEIL(soucetSMarzi(bezRezerv), 1000));
test('rezerva nemění jednotlivé řádky příplatků, jen jejich součet',
  blizko(soucetSMarzi(rPrip), soucetSMarzi(bezRezerv), 1e-6));
test('zadaná rezerva příplatků se do jejich celkové ceny opravdu započte',
  rPrip.souhrn.priplatkyCena > bezRezerv.souhrn.priplatkyCena,
  rPrip.souhrn.priplatkyCena + ' vs ' + bezRezerv.souhrn.priplatkyCena);

/* Opravený režim počítá rezervu z NÁKLADU řádků a marži k ní přidá jednou –
 * stejné pravidlo jako u rezervy k základní ceně. */
const MARZE = cenik().marze;
test('rezerva příplatků = procento z nákladu řádků, marže se přidá jednou',
  blizko(rPrip.souhrn.priplatkyCena,
    CEIL(soucetSMarzi(rPrip) + soucetNakladu(rPrip) * REZ_PRIPLATKY * (1 + MARZE), 1000), 1e-6),
  rPrip.souhrn.priplatkyCena);
/* Daň se počítá z ceny včetně rezervy – jinak by základ, DPH a součet
 * v nabídce nedávaly dohromady. */
test('DPH příplatků se počítá z ceny včetně rezervy',
  blizko(rPrip.souhrn.priplatkyDph, rPrip.souhrn.priplatkyCena * cenik().dph, 1e-6)
  && blizko(rPrip.souhrn.priplatkySDph, rPrip.souhrn.priplatkyCena * (1 + cenik().dph), 1e-6));

/* Kompatibilní režim napodobuje chybu šablony: základem rezervy je cena
 * VČETNĚ marže, takže marže vyjde dvakrát a rezerva je vyšší. Rozdíl mezi
 * režimy je dokumentovaný a musí zůstat vidět. */
const rPripKompat = eng.vypocet(zPrip, cenik(), JEKLY, false);
test('kompatibilní režim počítá rezervu příplatků z ceny s marží (chyba šablony)',
  blizko(rPripKompat.souhrn.priplatkyCena,
    CEIL(soucetSMarzi(rPripKompat) + soucetSMarzi(rPripKompat) * REZ_PRIPLATKY * (1 + MARZE), 1000), 1e-6),
  rPripKompat.souhrn.priplatkyCena);
test('rezerva příplatků vyjde v kompatibilním režimu výš než v opraveném',
  rPripKompat.souhrn.priplatkyCena > rPrip.souhrn.priplatkyCena,
  rPripKompat.souhrn.priplatkyCena + ' vs ' + rPrip.souhrn.priplatkyCena);

/* Nula znamená „žádná rezerva", ne „spočítej si něco". */
const zNula = zadani(); zNula.rezervaPriplatkyPct = 0;
test('nulová rezerva příplatků cenu nemění',
  eng.vypocet(zNula, cenik(), JEKLY, true).souhrn.priplatkyCena === bezRezerv.souhrn.priplatkyCena);

/* ============================================================
 * 3) Rezerva k základní ceně
 * ============================================================
 * Doplněk k oběma předchozím: rezerva k základní ceně je čtvrté, nezávislé
 * pole. Hlídá se hlavně to, že se nepřebíjí s rezervami materiálu. */

const REZ_ZAKLAD = 0.05;
const zZaklad = zadani(); zZaklad.rezervaZakladPct = REZ_ZAKLAD;
const rZaklad = eng.vypocet(zZaklad, cenik(), JEKLY, true);
test('rezerva k základní ceně je procento z nákladu všech sekcí',
  blizko(rZaklad.rezerva.naklad,
    (rZaklad.souhrn.zakladNaklad - rZaklad.rezerva.naklad) * REZ_ZAKLAD, 1e-6),
  rZaklad.rezerva.naklad);
test('rezerva k základní ceně nesahá na množství materiálu',
  blizko(rZaklad.profily.celkemKg, bezRezerv.profily.celkemKg, 1e-9)
  && blizko(plechRadek(rZaklad).mnozstvi, plechRadek(bezRezerv).mnozstvi, 1e-9));
test('rezerva k základní ceně se netýká příplatků',
  rZaklad.souhrn.priplatkyCena === bezRezerv.souhrn.priplatkyCena,
  rZaklad.souhrn.priplatkyCena + ' vs ' + bezRezerv.souhrn.priplatkyCena);

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
