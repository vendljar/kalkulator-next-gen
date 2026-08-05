/* Test techspec.js – TS-1: kontrola vyplnění povinných polí.
   Klíčová vlastnost: kontrola JEN upozorňuje a počítá, nikdy nic neblokuje
   a nikdy nevyhazuje výjimku (ani pro prázdné či chybějící vstupy). */
const TS = require('./techspec.js');
const { vypocet, DEFAULT_ZADANI, DEFAULT_CENIK } = require('./engine.js');
const JEKLY = require('./jekly.json');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const Z = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
const C = ZC.zkusebniCenik();
const r = vypocet(Z, C, JEKLY, false);
const novaTs = () => JSON.parse(JSON.stringify(TS.DEFAULT_TECHSPEC));

/* --- 1) definice povinných polí --- */
const vsechnaId = new Set(TS.TECHSPEC_DEF.flatMap(s => s.pole.map(p => p.id)));
test('všechna povinná id existují v definici',
  TS.TS_POVINNE.every(id => vsechnaId.has(id)),
  TS.TS_POVINNE.filter(id => !vsechnaId.has(id)).join(','));
test('seznam povinných polí je bez duplicit', new Set(TS.TS_POVINNE).size === TS.TS_POVINNE.length);
test('povinných polí je rozumný počet (10–40)', TS.TS_POVINNE.length >= 10 && TS.TS_POVINNE.length <= 40, TS.TS_POVINNE.length);
test('hlavička má 5 položek', TS.TS_HLAVICKA.length === 5, TS.TS_HLAVICKA.length);
test('název akce se bere z technické specifikace, ostatní ze zakázky',
  TS.TS_HLAVICKA.filter(p => p.zdroj === 'techspec').map(p => p.id).join(',') === 'nazevAkce');

/* --- 2) co se počítá jako nevyplněné --- */
test('prázdný řetězec je nevyplněno', TS.tsPrazdna(''));
test('samé mezery jsou nevyplněno', TS.tsPrazdna('   '));
test('pomlčka je nevyplněno', TS.tsPrazdna(' -') && TS.tsPrazdna('-') && TS.tsPrazdna('–'));
test('null a undefined jsou nevyplněno', TS.tsPrazdna(null) && TS.tsPrazdna(undefined));
test('nula je vyplněná hodnota', !TS.tsPrazdna(0));
test('text je vyplněno', !TS.tsPrazdna('v exteriéru'));

/* --- 3) plné zadání z kalkulace projde bez chyb --- */
const zak = { cislo: '2026-OPR-CN-9001', objednatel: 'SVJ Ulice 1', datum: '2026-07-26', adresa: 'Ulice 1, Praha' };
const kOk = TS.tsKontrola(novaTs(), r, Z, C, zak);
test('kompletní specifikace nehlásí nic', kOk.ok && kOk.pocet === 0,
  kOk.chybi.map(x => x.id).join(','));
test('výsledek nese seznam i rozpad na hlavičku/pole',
  Array.isArray(kOk.chybi) && Array.isArray(kOk.hlavicka) && Array.isArray(kOk.pole));

/* --- 4) prázdná hlavička = 5 upozornění, nic víc --- */
const tsPrazdnaHlav = novaTs(); tsPrazdnaHlav.nazevAkce = '';
const kHlav = TS.tsKontrola(tsPrazdnaHlav, r, Z, C, { cislo: '', objednatel: '  ', datum: '', adresa: null });
test('prázdná hlavička hlásí 5 položek', kHlav.hlavicka.length === 5, kHlav.hlavicka.map(x => x.id).join(','));
test('prázdná hlavička neovlivní pole dokumentu', kHlav.pole.length === 0, kHlav.pole.map(x => x.id).join(','));
test('chybějící název akce se hlásí z TS, ne ze zakázky', (() => {
  const t = novaTs(); t.nazevAkce = '';
  return TS.tsKontrola(t, r, Z, C, zak).hlavicka.map(x => x.id).join(',') === 'nazevAkce';
})());
test('bez zakázky se hlavička přeskočí', TS.tsKontrola(novaTs(), r, Z, C, null).hlavicka.length === 0);

/* --- 5) ruční vyprázdnění povinného pole se pozná --- */
const tMinus = novaTs();
tMinus.hodnoty.umisteni = ' -';
tMinus.hodnoty.materialOplasteni = '';
const kMinus = TS.tsKontrola(tMinus, r, Z, C, zak);
test('ručně vyprázdněná povinná pole se nahlásí',
  kMinus.pocet === 2 && kMinus.chybi.map(x => x.id).sort().join(',') === 'materialOplasteni,umisteni',
  kMinus.chybi.map(x => x.id).join(','));
test('upozornění nese popisek i sekci',
  kMinus.chybi.every(x => x.label && x.sekce && x.druh === 'pole'), JSON.stringify(kMinus.chybi[0]));
test('nepovinné pole s pomlčkou se nehlásí', (() => {
  const t = novaTs(); t.hodnoty.usazeniBocni = ' -'; t.hodnoty.prosklenaPricka = ' -';
  return TS.tsKontrola(t, r, Z, C, zak).pocet === 0;
})());

/* --- 6) NEBLOKUJE a NEPADÁ ani na neúplných vstupech --- */
test('kontrola bez výsledku kalkulace nespadne', (() => {
  const k = TS.tsKontrola(novaTs(), null, Z, C, zak);
  return typeof k === 'object' && k.pocet >= 0;
})());
test('kontrola úplně bez argumentů nespadne', (() => {
  const k = TS.tsKontrola();
  return typeof k === 'object' && Array.isArray(k.chybi);
})());
test('kontrola s null místo specifikace nespadne', typeof TS.tsKontrola(null, r, Z, C, zak) === 'object');
test('bez kalkulace zůstanou nevyplněná jen pole plněná z výpočtu',
  TS.tsKontrola(novaTs(), null, Z, C, zak).pocet > 0);
test('kontrola nic nemění v datech specifikace', (() => {
  const t = novaTs();
  const pred = JSON.stringify(t);
  TS.tsKontrola(t, r, Z, C, zak);
  return JSON.stringify(t) === pred;
})());

console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY TECHSPEC OK');
process.exit(fail ? 1 : 0);
