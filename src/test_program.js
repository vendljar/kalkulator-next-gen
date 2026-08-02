/* Test – databáze programu ve složce (program.js).
 *
 * Předmětem je model: číslování verzí, historie s datem konce platnosti,
 * obrana proti poškozenému nebo cizímu souboru a dotazy nad historií.
 * Práce se složkou (ui/program_ui.js) se ověřuje až nad sestavením
 * v overit_program.mjs, protože File System Access API existuje jen
 * v prohlížeči.
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne. Funkce
 * sdílené mezi moduly se musí globalizovat ručně, jinak guardy
 * `typeof fn === 'function'` tiše spadnou do záložní větve a test by
 * ověřoval jinou cestu kódem, než jaká poběží v aplikaci. */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const sl = require('./sleva.js');
global.slevaPodil = sl.slevaPodil; global.slevaDefault = sl.slevaDefault;
const ck = require('./cenik.js');
global.CENIK_DEF = ck.CENIK_DEF; global.CENIK_DEF_PROJ = ck.CENIK_DEF_PROJ;
global.cenikGet = ck.cenikGet; global.cenikSet = ck.cenikSet;
const cs = require('./cenik_stari.js');
global.CENIK_STARI_EXTRA = cs.CENIK_STARI_EXTRA; global.cenikSledovane = cs.cenikSledovane;
global.cenikHodnota = cs.cenikHodnota; global.cenikOtisk = cs.cenikOtisk;
global.cenikRozdily = cs.cenikRozdily; global.cenikDatumCz = cs.cenikDatumCz;
const zk = require('./zakazka.js');
global.novaVarianta = zk.novaVarianta; global.novaVariantaData = zk.novaVariantaData;
global.aktivniVarianta = zk.aktivniVarianta; global.ridiciVarianta = zk.ridiciVarianta;
const zm = require('./zamek.js');
global.zajistiZamek = zm.zajistiZamek; global.variantaCislo = zm.variantaCislo;
global.variantaUzamcena = zm.variantaUzamcena; global.zamekInfo = zm.zamekInfo;
const sez = require('./seznam.js');
global.seznamNorm = sez.seznamNorm; global.seznamSlova = sez.seznamSlova;
const kat = require('./katalog.js');
global.KATALOG_SEKCE = kat.KATALOG_SEKCE; global.katalogPrazdny = kat.katalogPrazdny;
const U = require('./uloziste.js');
const { uloJeZakazkovySoubor } = U;

const P = require('./program.js');
const { PROG_SOUBOR, PROG_SCHEMA, PROG_HISTORIE_MAX, PROG_ODDILY,
        programData, programOtisk, programZaznam, programNovy, programNormalizuj,
        programRozdily, programBezeZmeny, programNovaVerze, programVerze,
        programProDatum, programPocetKatalogu, programPopisVerze, programSouhrn } = P;

let ok = 0, fail = 0;
function test(popis, podminka) {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis); }
}
function chyba(popis, fn) {
  let hodilo = false;
  try { fn(); } catch (e) { hodilo = true; }
  test(popis, hodilo);
}
const kopie = v => JSON.parse(JSON.stringify(v));

/* Kontext jedné verze – ceníky z buildu, aby se testovalo nad skutečnými daty. */
function ctx(zmena) {
  const c = {
    cenik: kopie(DEFAULT_CENIK),
    cenikProj: kopie(DEFAULT_CENIK_PROJ),
    katalog: katalogPrazdny(),
    slevy: { minMarze: 0.10, stropy: { 'Obchodník': 0.05, 'Jednatel': 1 }, schemata: [] },
    build: '30.7.4', kdo: 'Vendl', poznamka: 'zdražení oceli',
    kdy: '2026-07-30T09:00:00.000Z', platnoOd: '2026-07-30',
  };
  return Object.assign(c, zmena || {});
}

console.log('\nDatabáze programu – soubor a jméno');

test('soubor se jmenuje _program.json', PROG_SOUBOR === '_program.json');
test('program se nepovažuje za zakázku', uloJeZakazkovySoubor(PROG_SOUBOR) === false);
test('databáze má čtyři oddíly', PROG_ODDILY.length === 4);
test('oddíly pokrývají ceník, projekci, katalog i slevy',
  PROG_ODDILY.map(o => o.kod).join(',') === 'cenik,cenikProj,katalog,slevy');

console.log('\nZaložení první verze');

const db1 = programNovy(ctx());
test('první verze má číslo 1', db1.platny.verze === 1);
test('historie je zatím prázdná', db1.historie.length === 0);
test('schéma se zapsalo', db1.schema === PROG_SCHEMA);
test('razítko je ISO čas', /^\d{4}-\d{2}-\d{2}T/.test(db1.razitko));
test('platná verze nemá konec platnosti', db1.platny.platnoDo === undefined);
test('otisk se spočítal', /^[0-9a-f]{8}$/.test(db1.platny.otisk));
test('otisk je stejný jako otisk ceníku ve variantě',
  db1.platny.otisk === cenikOtisk(programData(db1.platny)));
test('ceník se uložil hodnotou, ne odkazem', db1.platny.cenik !== DEFAULT_CENIK);
test('poznámka a autor se nesou s verzí',
  db1.platny.kdo === 'Vendl' && db1.platny.poznamka === 'zdražení oceli');
test('build, ze kterého verze vznikla, se zaznamenal', db1.platny.build === '30.7.4');

console.log('\nDruhá verze – historie a platnost');

const zdrazeny = ctx({ platnoOd: '2026-08-15', poznamka: 'nové ceny profilů' });
cenikSet(zdrazeny.cenik, 'C.profilasKgKc', cenikGet(DEFAULT_CENIK, 'C.profilasKgKc') * 1.1);
const db2 = programNovaVerze(db1, zdrazeny);
test('nová verze má číslo 2', db2.platny.verze === 2);
test('předchozí verze spadla do historie', db2.historie.length === 1 && db2.historie[0].verze === 1);
test('staré verzi se doplnilo, do kdy platila', db2.historie[0].platnoDo === '2026-08-15');
test('nová verze konec platnosti nemá', db2.platny.platnoDo === undefined);
test('otisk se změnou ceny změnil', db2.platny.otisk !== db1.platny.otisk);
test('původní databáze zůstala nedotčená (nový objekt)',
  db1.platny.verze === 1 && db1.historie.length === 0 && db1.platny.platnoDo === undefined);

const db3 = programNovaVerze(db2, ctx({ platnoOd: '2026-09-01', poznamka: 'třetí' }));
test('třetí verze má číslo 3', db3.platny.verze === 3);
test('historie je seřazená od nejnovější', db3.historie.map(z => z.verze).join(',') === '2,1');

console.log('\nRozdíly a zbytečné verze');

test('beze změny se nová verze nezakládá', programBezeZmeny(db1, ctx()) === true);
test('změna ceny je změna', programBezeZmeny(db1, zdrazeny) === false);
test('změna slevových stropů je taky změna',
  programBezeZmeny(db1, ctx({ slevy: { minMarze: 0.1, stropy: {}, schemata: [] } })) === false);
const sKatalogem = ctx();
sKatalogem.katalog.polozky.volitelne = [{ kid: 'k1', nazev: 'Madlo', cena: 1200 }];
test('změna katalogu je taky změna', programBezeZmeny(db1, sKatalogem) === false);
test('jiná poznámka sama o sobě změna není',
  programBezeZmeny(db1, ctx({ poznamka: 'jen jsem si to rozmyslel' })) === true);

const rozdily = programRozdily(db1, zdrazeny);
test('rozdíl se našel', rozdily.length === 1);
test('rozdíl ukazuje starou i novou hodnotu',
  rozdily[0].stara === cenikGet(DEFAULT_CENIK, 'C.profilasKgKc')
  && Math.abs(rozdily[0].nova - rozdily[0].stara * 1.1) < 0.001);
test('rozdíl nese popis položky, ne jen cestu', !!rozdily[0].popis);
test('beze změny není co ukazovat', programRozdily(db1, ctx()).length === 0);

console.log('\nNačtení a obrana proti poškozenému souboru');

const text = JSON.stringify(db2);
const nactena = programNormalizuj(text);
test('databáze projde textem tam a zpět',
  nactena.platny.verze === 2 && nactena.historie.length === 1);
test('otisk po načtení sedí', nactena.platny.otisk === db2.platny.otisk);
test('načtená databáze nehlásí ruční zásah', nactena.platny.otiskNesedi === undefined);
test('normalizace zvládne i objekt', programNormalizuj(kopie(db2)).platny.verze === 2);

chyba('nesmyslný JSON se odmítne', () => programNormalizuj('{tohle není json'));
chyba('pole místo objektu se odmítne', () => programNormalizuj('[]'));
chyba('cizí aplikace se odmítne', () => programNormalizuj(
  JSON.stringify(Object.assign(kopie(db1), { aplikace: 'Něco jiného' }))));
chyba('novější schéma se odmítne', () => programNormalizuj(
  JSON.stringify(Object.assign(kopie(db1), { schema: PROG_SCHEMA + 1 }))));
chyba('soubor bez platné verze se odmítne', () => programNormalizuj(
  JSON.stringify({ aplikace: 'Kalkulátor OCK', schema: 1, historie: [] })));
chyba('platná verze bez ceníku se odmítne', () => programNormalizuj(
  JSON.stringify({ aplikace: 'Kalkulátor OCK', schema: 1, platny: { verze: 1 } })));

const rucne = kopie(db1);
rucne.platny.cenik = kopie(rucne.platny.cenik);
cenikSet(rucne.platny.cenik, 'C.profilasKgKc', 99999);
const podezrela = programNormalizuj(rucne);
test('ruční zásah do cen se pozná podle otisku', !!podezrela.platny.otiskNesedi);
test('otisk se přepočítá podle skutečných dat',
  podezrela.platny.otisk === cenikOtisk(programData(podezrela.platny)));
test('podezřelý soubor se přesto načte (data se nezahodí)',
  cenikHodnota(programData(podezrela.platny), 'C.profilasKgKc') === 99999);

const bezPlatnosti = kopie(db2);
bezPlatnosti.platny.platnoDo = '2026-01-01';
test('platné verzi se konec platnosti smaže',
  programNormalizuj(bezPlatnosti).platny.platnoDo === undefined);

const rozhazena = kopie(db3);
rozhazena.historie = [rozhazena.historie[1], rozhazena.historie[0]];
test('historie se po načtení seřadí',
  programNormalizuj(rozhazena).historie.map(z => z.verze).join(',') === '2,1');
const smetiVHistorii = kopie(db3);
smetiVHistorii.historie.push(null, { verze: 9 });
test('smetí v historii se přeskočí', programNormalizuj(smetiVHistorii).historie.length === 2);

console.log('\nDotazy nad historií');

test('verze se najde podle čísla', programVerze(db3, 1).verze === 1);
test('platná verze se najde taky', programVerze(db3, 3).verze === 3);
test('neexistující verze vrací null', programVerze(db3, 9) === null);

test('k datu před druhou verzí platila první',
  programProDatum(db3, '2026-08-01').verze === 1);
test('k datu začátku platnosti platí nová verze',
  programProDatum(db3, '2026-08-15').verze === 2);
test('k dnešku platí poslední verze',
  programProDatum(db3, '2026-12-31').verze === 3);
test('k datu před vznikem databáze není co vrátit',
  programProDatum(db3, '2020-01-01') === null);
test('bez data se bere platná verze', programProDatum(db3).verze === 3);

console.log('\nStrop historie');

let dlouha = db1;
for (let i = 2; i <= PROG_HISTORIE_MAX + 5; i++) {
  const c = ctx({ platnoOd: '2026-08-' + String((i % 28) + 1).padStart(2, '0') });
  cenikSet(c.cenik, 'C.profilasKgKc', 1000 + i);
  dlouha = programNovaVerze(dlouha, c);
}
test('historie se drží pod stropem', dlouha.historie.length === PROG_HISTORIE_MAX);
test('číslování verzí běží dál i po ořezu', dlouha.platny.verze === PROG_HISTORIE_MAX + 5);
test('v historii zůstávají ty nejnovější',
  dlouha.historie[0].verze === PROG_HISTORIE_MAX + 4);

console.log('\nPopisy pro obsluhu');

test('počet položek katalogu se spočítá', programPocetKatalogu(programZaznam(sKatalogem, 1)) === 1);
test('prázdný katalog je nula', programPocetKatalogu(db1.platny) === 0);
test('chybějící katalog je taky nula', programPocetKatalogu({}) === 0);
test('popis verze uvádí číslo i datum česky',
  /verze 1 od 30\. ?7\. ?2026/.test(programPopisVerze(db1.platny)));
test('popis staré verze uvádí i konec platnosti',
  /do /.test(programPopisVerze(db2.historie[0])));
test('souhrn zmiňuje počet starších verzí', /2 starších verzí/.test(programSouhrn(db3)));
test('bez načtené databáze souhrn nelže', /není načtená/.test(programSouhrn(null)));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
