/* REGRESNÍ VZOR „KORNPFORTSTRASSE" (2025-OPR-0640, 2. 9. 2026)
 * ============================================================
 *
 * Zakázka do Koblenz, kterou J. V. 2. 9. 2026 vyplnil v ostré aplikaci 1:1
 * podle excelové předlohy (soubor „…Kornpfortstraße Koblenz kalkulace…",
 * list KALKULÁK, tisk 9. 10. 2025) a porovnal řádek po řádku. Sada ji
 * zafixuje jako vzor: kdyby se jádro rozešlo s předlohou, spadne to tady
 * a ne až u zákazníka.
 *
 * V SADĚ NEJSOU ŽÁDNÉ KORUNY. Hlídají se rozměry, kusy, kilogramy, plochy
 * a hodiny — tedy geometrie a množství, která na ceníku nezávisí. Částky
 * patří přes chkKc() do `_soukrome/` (viz hlavička test.js) a proto tuhle
 * sadu jde spustit i bez ostrého ceníku.
 *
 * DVA MODELY. Zakázka se počítá v obou:
 *   – Model 1 (1:1 jako Excel, fixes = false) MUSÍ sedět s předlohou,
 *     včetně jejích chyb — to je celý smysl toho přepínače,
 *   – Model 2 (opravený, fixes = true) se liší jen tam, kde předloha chybuje;
 *     tady u kotvících lišt (nález V1) a u počtu plechů (starší kompat. rozdíl).
 */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};
const bl = (n, got, want, tol = 1e-6) => test(n + ' = ' + want, Math.abs(got - want) <= tol, got);

/* ---------- zadání podle předlohy ---------- */
function zadaniKornpfort() {
  const z = JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
  Object.assign(z, {
    prejezd: 3.5, zdvih: 11.2, prohluben: 0.5,
    sirka: 1.14, hloubka: 0.93, roztec: 1.25,
    rohoveSloupky: 4, nastupiste: 5,
    typSachty: 'interiérová', typPortalu: 'zapuštěný', zaskleni: 'mezi příčníky',
    svetlikNadDvermi: false, svetlikyBoky: 0,
    cistyVstupMm: 650, sirkaRamuMm: 100,
    prechodovePlechy: true,
    montazZakladHod: 24, montazAtypHod: 0,
    projekceZakladHod: 50, projekceAtypHod: 0,
    oplechOstatniKg: 10, oplechOstatniHod: 5,
    vystupZamereni: false, atyp: false,
    rezervaProfilyPct: 0, rezervaPlechyPct: 0,
    rezervaZakladPct: 0, rezervaPriplatkyPct: 0,
  });
  z.profily = {
    sloupek: { dim: '80x40', tl: 4 },
    precnikBok: { dim: '80x40', tl: 3 },
    sloupekPortal: { dim: '40x40', tl: 3 },
    precnikPortal: { dim: '80x40', tl: 3 },
    spojka: { dim: '70x30', tl: 3 },
    lemovani: { dim: '60x30', tl: 2 },
  };
  return z;
}

const spocti = (fixes) => eng.vypocet(zadaniKornpfort(), ZC.zkusebniCenik(), JEKLY, fixes);
const M1 = spocti(false);   // 1:1 jako Excel
const M2 = spocti(true);    // opravený

/* ---------- odvozené rozměry ---------- */
bl('výška šachty [m]', M1.odvozene.vyskaSachty, 15.2);
bl('výška podlaží [m]', M1.odvozene.vyskaPodlazi, 2.8);
bl('světlá výška nástupiště [m]', M1.odvozene.svetlaVyska, 2.6);
bl('výška prosklené části [m]', M1.odvozene.vyskaProsklene, 14.7);
bl('šířka otvoru dveří [m]', M1.odvozene.sirkaDveri, 0.89);

/* ---------- počty ---------- */
bl('počet rámů', M1.parametry.ramy, 15);
bl('portálové příčníky', M1.parametry.portPricniky, 15);
bl('spojky sloupků', M1.parametry.spojky, 20);
bl('čílka', M1.parametry.pocetCilek, 120);

/* ---------- profily ---------- */
bl('profily délka [m]', M1.profily.celkemM, 131.24, 1e-4);
bl('profily hmotnost [kg]', M1.profily.celkemKg, 771.52436, 1e-4);
bl('profily plocha [m2]', M1.profily.celkemM2, 41.1168, 1e-4);
const profM = (cast) => (M1.profily.rows.find(r => r.nazev.indexOf(cast) >= 0) || {}).m;
bl('sloupek délka [m]', profM('sloupek'), 60, 1e-4);
bl('příčníky bok délka [m]', profM('příčníky bok'), 46.14, 1e-4);
bl('příčníky portálu délka [m]', profM('příčníky portálu'), 17.10, 1e-4);
bl('spojka délka [m]', profM('spojka'), 8.00, 1e-4);

/* ---------- plechy a díly ---------- */
bl('konstrukční plechy [ks]', M1.plechy.ks, 242);
bl('konstrukční plechy [kg]', M1.plechy.kg, 108.774, 1e-4);
bl('oplechování dveří [kg]', M1.dily.oplDvereKg, 24.499125, 1e-5);
bl('oplechování podest [kg]', M1.dily.podestKg, 10.608, 1e-4);
bl('přechodové plechy [kg]', M1.dily.prechKg, 7.565, 1e-4);

/* ---------- zasklívací lišty: NÁLEZ V1 ----------
 * Předloha bere kotvící lišty jako 10 % z POČTU KUSŮ (VZORCE C60 = C59,
 * D60 = C60 × 0,1) a sečte je s metry. Model 1 to kopíruje, Model 2 počítá
 * 10 % z délky. Ověřeno ve dvou zákaznických souborech shodně. */
bl('zasklívací lišty [ks]', M1.dily.listyKs, 180);
bl('Model 1: lišty celkem [bm]', M1.dily.listyBm, 180.12, 1e-4);
bl('Model 1: lišty [kg]', M1.dily.listyKg, 45.9306, 1e-4);
bl('Model 2: lišty celkem [bm]', M2.dily.listyBm, 178.332, 1e-4);
bl('Model 2: lišty [kg]', M2.dily.listyKg, 45.47466, 1e-5);
test('modely se u lišt liší právě o 10 % z kusů minus 10 % z délky',
  Math.abs((M1.dily.listyBm - M2.dily.listyBm) - (180 * 0.1 - 178.332 / 1.1 * 0.1)) < 1e-6,
  M1.dily.listyBm - M2.dily.listyBm);

/* ---------- zasklení ---------- */
bl('zasklení zadní [ks]', M1.zaskleni.zadni.ks, 12);
bl('zasklení zadní [m2]', M1.zaskleni.zadni.m2, 15.4644, 1e-4);
bl('zasklení boční [ks]', M1.zaskleni.bocni.ks, 24);
bl('zasklení boční [m2]', M1.zaskleni.bocni.m2, 25.9308, 1e-4);
bl('zasklení celkem [m2]', M1.zaskleni.celkemM2, 41.3952, 1e-4);
bl('rozměr skla – šířka [m]', M1.zaskleni.rozmer.sir, 1.052, 1e-4);
bl('rozměr skla – výška [m]', M1.zaskleni.rozmer.vys, 1.162, 1e-4);

/* ---------- spojovací materiál a montáž ---------- */
bl('nýtování [ks]', M1.spojovaci.nytovaniKs, 790);
bl('montáž – hodiny navíc', M1.montaz.hodinyNavicCelkem, -4.9, 1e-9);
bl('montáž – hodin celkem', M1.montaz.hodCelkem, 76.4, 1e-9);

/* ---------- lešení ----------
 * ROZHODNUTO J. V. 2. 9. 2026: referenčním odstupem pro Model 1 zůstává
 * 0,25 m — tedy chování aplikace i předlohy CN-0327 Lindnerova. Soubor
 * Kornpfortstraße počítá 0,20 m (nález V2), ale bere se jako odchylka
 * jednoho souboru, ne jako referenční předloha. Hodnota se hlídá tady, ať
 * ji nikdo nezmění omylem. */
bl('lešení věž [m]', M1.odvozene.leseniVez, 15.2);
bl('lešení U-dokola [m2] (0,25 m odstup)', M1.odvozene.leseniU, 58.80, 1e-4);
test('oba modely počítají lešení stejně (odstup se zatím neliší)',
  Math.abs(M1.odvozene.leseniU - M2.odvozene.leseniU) < 1e-9);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
