/* Test přirážky za ATYP (#22).
 *
 * Zaškrtnutí „ATYP (nestandardní zakázka)" bylo dřív mrtvý příznak – nic
 * nepočítalo. Nově přidává do sekce Režie samostatný řádek s přirážkou za
 * projekční a koordinační práce. Testy hlídají tři věci, na kterých to stojí:
 *   a) bez ATYP se nic nezmění (jinak by se rozešly staré nabídky i sada test.js),
 *   b) přirážka je opravdu procento z NÁKLADU sekce Režie a je vidět jako řádek,
 *   c) sazba se bere z ceníku (C.atypPrirazka), aby šla měnit v Nastavení.
 */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const RADEK = 'PŘIRÁŽKA ZA ATYP - PROJEKČNÍ A KOORDINAČNÍ PRÁCE';
const zadani = () => JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const cenik = () => ZC.zkusebniCenik();
const najdi = r => r.sekce.rezie.filter(x => x.nazev === RADEK);
const nakladRezie = r => r.sekce.rezie.filter(x => x.nazev !== RADEK).reduce((a, x) => a + x.naklad, 0);

/* 1) výchozí stav – ATYP nezaškrtnutý */
const zBez = zadani(); zBez.atyp = false;
const rBez = eng.vypocet(zBez, cenik(), JEKLY, false);
test('bez ATYP nevzniká řádek přirážky', najdi(rBez).length === 0);

/* 2) ATYP zaškrtnutý – jeden řádek, sazba z ceníku
 *
 * Sazba se nesmí do testu opsat jako číslo: v repozitáři jsou ukázkové ceny
 * a ty se mění. Test má hlídat, že se použije C.atypPrirazka – ne to, kolik
 * zrovna je. Skutečnou sazbu si aplikace načte ze složky _DB. */
const SAZBA = cenik().atypPrirazka;
const sazbaPct = Math.round(SAZBA * 1000) / 10;   // 0.2 → 20
test('ceník má nenulovou sazbu ATYP, jinak nemá co testovat', SAZBA > 0, SAZBA);

const zAtyp = zadani(); zAtyp.atyp = true;
const rAtyp = eng.vypocet(zAtyp, cenik(), JEKLY, false);
const radky = najdi(rAtyp);
test('s ATYP vzniká právě jeden řádek přirážky', radky.length === 1, radky.length);
if (radky.length === 1) {
  const ocekavano = nakladRezie(rAtyp) * SAZBA;
  test('přirážka = sazba z ceníku × náklad ostatních položek režie',
    Math.abs(radky[0].naklad - ocekavano) < 0.01, radky[0].naklad + ' vs ' + ocekavano);
  test('přirážka má množství 1', radky[0].mnozstvi === 1, radky[0].mnozstvi);
  test('poznámka uvádí sazbu', new RegExp(String(sazbaPct).replace('.', '[.,]') + ' %')
    .test(radky[0].pozn || ''), radky[0].pozn);
}

/* 3) ATYP zvyšuje celkovou cenu, ale nemění hrubou konstrukci */
test('ATYP zvýší celkový základ', rAtyp.souhrn.zakladCena > rBez.souhrn.zakladCena,
  rAtyp.souhrn.zakladCena + ' vs ' + rBez.souhrn.zakladCena);
test('ATYP nezasahuje do sekce hrubá OCK',
  Math.abs(rAtyp.souctySekci.hrubaOck.sMarzi - rBez.souctySekci.hrubaOck.sMarzi) < 0.01);

/* 4) sazba se řídí ceníkem (editace v Nastavení) */
const c50 = cenik(); c50.atypPrirazka = 0.50;
const r50 = eng.vypocet(zadani.call(null), c50, JEKLY, false);   // bez ATYP
test('změna sazby bez ATYP nic nezmění', najdi(r50).length === 0);

const zA = zadani(); zA.atyp = true;
const rA50 = eng.vypocet(zA, c50, JEKLY, false);
const r50radky = najdi(rA50);
test('sazba 50 % z ceníku se použije', r50radky.length === 1 &&
  Math.abs(r50radky[0].naklad - nakladRezie(rA50) * 0.50) < 0.01);

const c0 = cenik(); c0.atypPrirazka = 0;
const rA0 = eng.vypocet(zA, c0, JEKLY, false);
test('sazba 0 % řádek nevytvoří', najdi(rA0).length === 0);

/* 5) chování v obou režimech výpočtu */
const rAtypFix = eng.vypocet(zA, cenik(), JEKLY, true);
test('přirážka funguje i v opraveném režimu', najdi(rAtypFix).length === 1);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
