/* Test format.js (#14, krok 3) — charakterizace: konsolidace formátů NESMÍ
 * změnit jediný znak výstupu proti stavu před ní. Očekávané hodnoty jsou
 * proto zapsané přesně tak, jak je aplikace tiskla dřív. */
const f = require('./format.js');
let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const NBSP = ' ';

test('formatKc2: dvě desetinná místa, mezery v tisících',
  f.formatKc2(1234567.5) === '1' + NBSP + '234' + NBSP + '567,50 Kč', f.formatKc2(1234567.5));
test('formatKc2: nečíslo je nula', f.formatKc2(undefined) === '0,00 Kč');
test('formatKc0: zaokrouhlené koruny', f.formatKc0(1234.6) === '1' + NBSP + '235 Kč', f.formatKc0(1234.6));
test('formatCislo: výchozí 2 desetinná místa', f.formatCislo(3.14159) === '3,14');
test('formatCislo: volitelná přesnost', f.formatCislo(3.14159, 3) === '3,142');
test('formatPctTypo: typografické minus u záporné marže',
  f.formatPctTypo(-0.238) === '−23,8 %', f.formatPctTypo(-0.238));
test('formatPctTypo: kladné procento bez znaménka', f.formatPctTypo(0.15) === '15 %');
test('formatPctTypo: bez hodnoty je pomlčka', f.formatPctTypo(null) === '—');
test('formatKcTypo: typografické minus u částky',
  f.formatKcTypo(-12345) === '−12' + NBSP + '345 Kč', f.formatKcTypo(-12345));

/* Delegace: marze.js s načteným format.js tiskne PŘESNĚ totéž co format.js. */
Object.assign(global, f);
const mz = require('./marze.js');
test('marzePct deleguje na format.js', mz.marzePct(-0.238) === f.formatPctTypo(-0.238));
test('marzeKc deleguje na format.js', mz.marzeKc(-12345) === f.formatKcTypo(-12345));

/* ---------- „prázdno není nula" (#14, krok 2) ---------- */
test('prázdno není přepis', !f.prepisPlati(undefined) && !f.prepisPlati(null) && !f.prepisPlati(''));
test('nula JE platný přepis (zdarma)', f.prepisPlati(0) === true);
test('číslo i text jsou přepis', f.prepisPlati(950) && f.prepisPlati('950'));

/* OCK engine sdílí stejnou sémantiku: '' došlé importem není cena 0 Kč. */
{
  const eng = require('./engine.js');
  const ZC = require('./zkusebni_cenik.js');
  const fs3 = require('fs');
  const JEKLY3 = JSON.parse(fs3.readFileSync(__dirname + '/jekly.json', 'utf8'));
  const zad = JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
  const cen = ZC.zkusebniCenik();
  const cisty = eng.vypocet(zad, cen, JEKLY3, true).souhrn.zakladCena;
  const zadPrazdno = JSON.parse(JSON.stringify(zad));
  zadPrazdno.cenyPrepis = { 'REŽIE KANCELÁŘE': '' };       // '' z importu, ne z formuláře
  const sPrazdnem = eng.vypocet(zadPrazdno, cen, JEKLY3, true).souhrn.zakladCena;
  test('OCK: prázdný přepis ceny z importu nechává ceníkovou cenu',
    Math.abs(sPrazdnem - cisty) < 1e-6, sPrazdnem + ' vs ' + cisty);
  const zadNula = JSON.parse(JSON.stringify(zad));
  zadNula.mnozstviPrepis = {};
  const r0 = eng.vypocet(zadNula, cen, JEKLY3, true);
  test('OCK: výpočet bez přepisů beze změny', Math.abs(r0.souhrn.zakladCena - cisty) < 1e-6);
}

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
