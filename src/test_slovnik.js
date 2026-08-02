/* Test porovnání slovníku s tabulkou Vocabulary (#5).
 *
 * Slovník PREKLAD a tabulka EngineersCZ_Vocabulary_*.xlsx se rozcházejí a
 * ruční sesouhlasení nikdo nedělá. Porovnání je proto užitečné jen tehdy,
 * když mu jde věřit – falešný „rozdíl" kvůli velkému písmenu nebo dvojtečce
 * by uživatele naučil výsledky ignorovat.
 *
 * Testy hlídají:
 *   a) hledání hlavičky – sloupce se v tabulce stěhují, hlavička nemusí být
 *      na prvním řádku a nadpisy se píší různě („CZ", „Česky", „Czech"),
 *   b) výběr listu ze sešitu (uživatel nemusí vědět, jak se list jmenuje),
 *   c) rozpad na čtyři kategorie podle rizika, a to POD normalizací
 *      prekladNorm – tedy stejnou, jakou používá tr(),
 *   d) že se nic nezapisuje samo: slovnikAplikuj zapíše přesně to, co dostane.
 */
const S = require('./slovnik.js');
const { prekladNorm } = require('./preklad.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : JSON.stringify(info)); } };

/* ---- a) hlavička ---- */
const listZakladni = [
  ['CZ', 'EN', 'DE', 'FR'],
  ['Umístění šachty', 'Shaft location', 'Schachtposition', 'Emplacement'],
  ['Nosnost', 'Capacity', 'Tragfähigkeit', 'Capacité'],
];
const h = S.slovnikNajdiHlavicku(listZakladni);
test('hlavička na prvním řádku', h && h.radek === 0, h);
test('sloupce se namapovaly', h && h.sloupce.cz === 0 && h.sloupce.en === 1 && h.sloupce.de === 2 && h.sloupce.fr === 3, h && h.sloupce);

/* Hlavička nebývá první – nad ní bývá nadpis, datum, prázdné řádky. */
const listSHlavou = [
  ['EngineersCZ – Vocabulary'], [], ['aktualizováno 4/2026'],
  ['Český termín', 'English', 'Deutsch', 'Français'],
  ['Nosnost', 'Capacity', '', ''],
];
const h2 = S.slovnikNajdiHlavicku(listSHlavou);
test('hlavička se najde i pod nadpisem', h2 && h2.radek === 3, h2);
test('slovní nadpisy sloupců se poznají', h2 && h2.sloupce.cz === 0 && h2.sloupce.de === 2, h2 && h2.sloupce);

/* Přehozené sloupce – nesmíme spoléhat na pořadí. */
const h3 = S.slovnikNajdiHlavicku([['German', 'Czech', 'Angl.']]);
test('přehozené sloupce', h3 && h3.sloupce.cz === 1 && h3.sloupce.de === 0 && h3.sloupce.en === 2, h3 && h3.sloupce);

test('samotný CZ sloupec nestačí', S.slovnikNajdiHlavicku([['CZ', 'poznámka']]) === null);
test('list bez hlavičky vrací null', S.slovnikNajdiHlavicku([['a', 'b'], ['c', 'd']]) === null);
test('prázdný list nespadne', S.slovnikNajdiHlavicku([]) === null && S.slovnikNajdiHlavicku(null) === null);

/* Hlavička dál než 20 řádků = to už není hlavička, ale nález uprostřed dat. */
const daleko = [];
for (let i = 0; i < 25; i++) daleko.push(['x', 'y']);
daleko.push(['CZ', 'EN']);
test('hlavička dál než 20 řádků se ignoruje', S.slovnikNajdiHlavicku(daleko) === null);

/* ---- rozbor listu ---- */
const rozbor = S.slovnikZListu(listZakladni);
test('rozbor vrátí položky', rozbor.polozky.length === 2, rozbor.polozky);
test('rozbor nese číslo řádku v Excelu', rozbor.polozky[0].radek === 2, rozbor.polozky[0]);
test('rozbor nese všechny jazyky', rozbor.polozky[0].en === 'Shaft location' && rozbor.polozky[0].fr === 'Emplacement');

/* Chybějící cizí sloupec nesmí položku zahodit ani vyhodit výjimku. */
const bezFr = S.slovnikZListu([['CZ', 'EN'], ['Nosnost', 'Capacity']]);
test('chybějící sloupec = prázdný řetězec', bezFr.polozky[0].fr === '' && bezFr.polozky[0].en === 'Capacity', bezFr.polozky[0]);

/* Řádky bez českého hesla jsou oddělovače a mezery, ne data. */
const sMezerami = S.slovnikZListu([['CZ', 'EN'], ['', 'sirotek'], ['Nosnost', 'Capacity'], [null, null]]);
test('řádky bez českého hesla se přeskočí', sMezerami.polozky.length === 1, sMezerami.polozky);

/* Nedělitelná mezera v exportu z Excelu se nesmí propsat do klíče. */
const nbsp = S.slovnikZListu([['CZ', 'EN'], ['Nosnost kabiny ', 'Capacity']]);
test('NBSP a okrajové mezery se čistí', nbsp.polozky[0].cz === 'Nosnost kabiny', nbsp.polozky[0].cz);

test('list bez hlavičky hlásí chybu', !!S.slovnikZListu([['a']]).chyba);

/* ---- b) výběr listu ze sešitu ---- */
const sesit = [
  { nazev: 'Info', rows: [['Verze', '4/2026']] },
  { nazev: 'Vocab', rows: listZakladni },
  { nazev: 'Pokus', rows: [['CZ', 'EN'], ['Nosnost', 'Capacity']] },
];
const vyber = S.slovnikVyberList(sesit);
test('vybere se list s nejvíc řádky', vyber && vyber.list === 'Vocab', vyber && vyber.list);
test('výběr nese rozbor', vyber && vyber.rozbor.polozky.length === 2);
test('sešit bez slovníku vrací null', S.slovnikVyberList([{ nazev: 'Info', rows: [['a']] }]) === null);
test('prázdný sešit nespadne', S.slovnikVyberList([]) === null && S.slovnikVyberList(null) === null);

/* ---- c) porovnání ---- */
const PREKLAD = {
  'Umístění šachty': ['Shaft location', '', 'Emplacement'],   // DE chybí
  'Nosnost': ['Load capacity', 'Tragfähigkeit', ''],          // EN se liší
  'Jen v aplikaci': ['App only', '', ''],
};
const polozky = S.slovnikZListu([
  ['CZ', 'EN', 'DE', 'FR'],
  ['UMÍSTĚNÍ ŠACHTY:', 'Shaft location', 'Schachtposition', 'Emplacement'],
  ['Nosnost', 'Capacity', 'Tragfähigkeit', ''],
  ['Zcela nové heslo', 'Brand new', '', ''],
]).polozky;
const d = S.slovnikPorovnej(PREKLAD, polozky, prekladNorm);

/* Klíčové: „UMÍSTĚNÍ ŠACHTY:" a „Umístění šachty" je pod prekladNorm totéž
 * heslo. Bez normalizace by se hlásilo jako nové a slovník by se zdvojil. */
test('normalizace spáruje odlišný zápis hesla', d.nove.length === 1 && d.nove[0].cz === 'Zcela nové heslo', d.nove);
test('doplnit = jen prázdná místa', d.doplnit.length === 1 && d.doplnit[0].jazyk === 'de'
  && d.doplnit[0].klic === 'Umístění šachty', d.doplnit);
test('doplnit nese původní klíč slovníku, ne zápis z tabulky', d.doplnit[0].klic === 'Umístění šachty' && d.doplnit[0].cz === 'UMÍSTĚNÍ ŠACHTY:');
test('rozdílné = obě strany plné a jiné', d.rozdilne.length === 1 && d.rozdilne[0].jazyk === 'en'
  && d.rozdilne[0].aplikace === 'Load capacity' && d.rozdilne[0].tabulka === 'Capacity', d.rozdilne);
test('shodné se počítají', d.shodne === 3, d.shodne);   // EN+FR u umístění, DE u nosnosti
test('jen v aplikaci', d.jenVApp.length === 1 && d.jenVApp[0].klic === 'Jen v aplikaci', d.jenVApp);

/* Prázdná buňka v tabulce není návrh na smazání překladu. */
test('prázdná hodnota v tabulce se ignoruje',
  !d.doplnit.concat(d.rozdilne).some(x => x.jazyk === 'fr' && x.cz === 'Nosnost'));

test('souhrn sedí', d.souhrn.vTabulce === 3 && d.souhrn.vAplikaci === 3
  && d.souhrn.doplnit === 1 && d.souhrn.rozdilne === 1 && d.souhrn.nove === 1 && d.souhrn.jenVApp === 1, d.souhrn);

/* Nové heslo bez jediného překladu nemá cenu nabízet. */
const dPrazdne = S.slovnikPorovnej({}, S.slovnikZListu([['CZ', 'EN'], ['Heslo bez překladu', '']]).polozky, prekladNorm);
test('nové heslo bez překladu se nenabízí', dPrazdne.nove.length === 0, dPrazdne.nove);

/* Porovnání je čtení – nesmí sáhnout do slovníku. */
const kopie = JSON.parse(JSON.stringify(PREKLAD));
S.slovnikPorovnej(PREKLAD, polozky, prekladNorm);
test('porovnání slovník nemění', JSON.stringify(PREKLAD) === JSON.stringify(kopie));

test('porovnání s prázdnými vstupy nespadne',
  S.slovnikPorovnej(null, null, prekladNorm).souhrn.vTabulce === 0);

/* ---- d) zápis ---- */
const zapsano = [];
const nastav = (klic, jazyk, text) => { zapsano.push([klic, jazyk, text]); return true; };

test('aplikuj zapíše právě předané změny', S.slovnikAplikuj(d.doplnit, nastav) === 1 && zapsano.length === 1);
test('zápis jde pod klíčem slovníku, ne pod zápisem z tabulky',
  zapsano[0][0] === 'Umístění šachty' && zapsano[0][1] === 'de' && zapsano[0][2] === 'Schachtposition', zapsano[0]);

zapsano.length = 0;
test('aplikuj nezapisuje prázdné hodnoty',
  S.slovnikAplikuj([{ klic: 'X', jazyk: 'en', tabulka: '' }, null], nastav) === 0 && zapsano.length === 0);

zapsano.length = 0;
const zmenyNove = S.slovnikNoveJakoZmeny(d.nove);
test('nová hesla se rozpadnou po jazycích', zmenyNove.length === 1 && zmenyNove[0].jazyk === 'en', zmenyNove);
S.slovnikAplikuj(zmenyNove, nastav);
test('nové heslo se zapisuje pod svým českým zněním', zapsano[0][0] === 'Zcela nové heslo', zapsano[0]);

/* Odmítnutý zápis (neznámý jazyk) se nesmí počítat jako úspěch. */
test('neúspěšný zápis se nepočítá',
  S.slovnikAplikuj([{ klic: 'X', jazyk: 'xx', tabulka: 'y' }], () => false) === 0);

/* ---- CSV pro překladatele ---- */
const csv = S.slovnikCsvJenVApp([{ klic: 'Heslo s "uvozovkami"', hodnoty: { en: 'A', de: '', fr: '' } }]);
test('CSV má BOM (jinak Excel rozbije diakritiku)', csv.charCodeAt(0) === 0xFEFF);
test('CSV má hlavičku', csv.indexOf('"CZ";"EN";"DE";"FR"') === 1);
test('CSV zdvojuje uvozovky', csv.indexOf('"Heslo s ""uvozovkami"""') > 0, csv);
test('prázdné CSV má jen hlavičku', S.slovnikCsvJenVApp([]).split('\r\n').length === 1);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
