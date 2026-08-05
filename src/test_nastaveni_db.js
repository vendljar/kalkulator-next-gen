/* Test – nastavení aplikace ve složce (nastaveni_db.js).
 *
 * Předmětem je model: co se do složky ukládá a co ne, obrana proti
 * poškozenému nebo cizímu souboru a to nejdůležitější – že se načtením
 * ze složky nepřepíšou věci, které patří do _program.json (slevové
 * stropy a katalog). Práci se složkou dělá ui/nastaveni_db_ui.js
 * a ověřuje se až nad sestavením v overit_nastaveni.mjs.
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne. Funkce
 * sdílené mezi moduly se musí globalizovat ručně, jinak guardy
 * `typeof fn === 'function'` tiše spadnou do záložní větve a test by
 * ověřoval jinou cestu kódem, než jaká poběží v aplikaci. */
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.TS_C = tsm.TS_C;
const pr = require('./preklad.js');
global.PREKLAD = pr.PREKLAD; global.PREKLAD_IDX = pr.PREKLAD_IDX;
global.prekladNorm = pr.prekladNorm;
global.prekladExport = pr.prekladExport; global.prekladImport = pr.prekladImport;
const kat = require('./katalog.js');
global.KATALOG_SEKCE = kat.KATALOG_SEKCE; global.katalogPrazdny = kat.katalogPrazdny;
global.katalogExport = kat.katalogExport; global.katalogImport = kat.katalogImport;
global.katalogPocet = kat.katalogPocet;
const kf = require('./konfigurace.js');
global.KONFIG_VERZE = kf.KONFIG_VERZE; global.KONFIG_SEKCE = kf.KONFIG_SEKCE;
global.KONFIG_NAST_KLICE = kf.KONFIG_NAST_KLICE;
global.konfiguraceExport = kf.konfiguraceExport; global.konfiguraceImport = kf.konfiguraceImport;
global.konfigNahradVMiste = kf.konfigNahradVMiste;
const U = require('./uloziste.js');
const { uloJeZakazkovySoubor } = U;

const N = require('./nastaveni_db.js');
const { NASTDB_SOUBOR, NASTDB_SCHEMA, NASTDB_SEKCE, NASTDB_CIZI, NASTDB_NEUKLADAT,
        nastdbKlice, nastdbData, nastdbNovy, nastdbNormalizuj, nastdbOtisk,
        nastdbStejne, nastdbPouzij, nastdbSouhrn } = N;

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

/* Kontext = to, co v prohlížeči drží globální NAST, TS_C a slovník.
 * NAST je tu záměrně kompletní včetně jeAdmin, panel a slev, protože
 * právě jejich vynechání je předmětem testu. */
function novyNast() {
  return {
    jeAdmin: true,
    panel: 'slevy',
    tabViditelnost: { kalk: true, detail: false },
    zobrazitNaklady: true,
    kpiViditelne: { naklad: false, marze: true },
    jazyk: 'en',
    firma: { nazev: 'Zkušební s.r.o.', ico: '123', telefon: '+420 111 222 333' },
    role: ['Obchodník', 'Jednatel'],
    uzivatele: [{ jmeno: 'Vzorový obchodník', email: 'a@b.cz', role: 'Obchodník', aktivni: true }],
    slevy: { minMarze: 0.08, stropy: { 'Obchodník': 0.03 }, schemata: [] },
  };
}
function ctx(zmena) {
  const c = {
    NAST: novyNast(),
    TS_C: kopie(TS_C),
    TECHSPEC_DEF: kopie(TECHSPEC_DEF),
    KATALOG: katalogPrazdny(),
    build: '30.7.5', kdo: 'Vendl',
    kdy: '2026-07-30T09:00:00.000Z', datum: '2026-07-30',
  };
  return Object.assign(c, zmena || {});
}

console.log('\n— co se do složky ukládá —');

const c1 = ctx();
const d1 = nastdbData(c1);

test('soubor se jmenuje _nastaveni.json', NASTDB_SOUBOR === '_nastaveni.json');
test('podtržítko drží soubor mimo seznam zakázek', uloJeZakazkovySoubor(NASTDB_SOUBOR) === false);
test('nese firemní údaje', d1.nastaveni.firma.nazev === 'Zkušební s.r.o.');
test('nese uživatele a role', d1.nastaveni.uzivatele.length === 1 && d1.nastaveni.role.length === 2);
test('nese viditelnost záložek a KPI',
  d1.nastaveni.tabViditelnost.detail === false && d1.nastaveni.kpiViditelne.marze === true);
test('nese jazyk dokumentů', d1.nastaveni.jazyk === 'en');
test('nese číselníky specifikace', !!d1.specifikace && !!d1.specifikace.ciselniky.umisteniSachty);
test('nese výchozí hodnoty polí specifikace',
  !!d1.specifikace.vychozi && Object.keys(d1.specifikace.vychozi).length > 0);
test('nese slovník překladů', !!d1.slovnik && Object.keys(d1.slovnik.hesla).length > 0);

test('slevové stropy tu nejsou – patří do _program.json', d1.nastaveni.slevy === undefined);
test('katalog tu není – patří do _program.json', d1.katalog === undefined);
test('role administrátora se neukládá', d1.nastaveni.jeAdmin === undefined);
test('otevřená záložka Nastavení se neukládá (stav relace)', d1.nastaveni.panel === undefined);
test('šablony se neukládají (binární obsah stejně nepřenese)', d1.sablony === undefined);

test('matice zobrazení tu není – patří na server (/api/zobrazeni)', d1.nastaveni.zobrazeni === undefined);

test('seznam ukládaných klíčů = klíče konfigurace bez slev a matice zobrazení',
  nastdbKlice().join(',') === KONFIG_NAST_KLICE.filter(k => k !== 'slevy' && k !== 'zobrazeni').join(','));
test('vynechané klíče jsou pojmenované', NASTDB_NEUKLADAT.indexOf('slevy') >= 0
  && NASTDB_NEUKLADAT.indexOf('jeAdmin') >= 0 && NASTDB_NEUKLADAT.indexOf('panel') >= 0
  && NASTDB_NEUKLADAT.indexOf('zobrazeni') >= 0);
test('cizí oddíly jsou pojmenované', NASTDB_CIZI.indexOf('katalog') >= 0 && NASTDB_CIZI.indexOf('slevy') >= 0);
test('oddíly souboru jsou tři', NASTDB_SEKCE.length === 3);

console.log('\n— hlavička souboru —');

const s1 = nastdbNovy(c1);
test('hlavička nese aplikaci', s1.aplikace === 'Kalkulátor OCK');
test('hlavička nese schéma', s1.schema === NASTDB_SCHEMA);
test('hlavička nese razítko zápisu', s1.razitko === '2026-07-30T09:00:00.000Z');
test('hlavička nese, kdo zapsal', s1.kdo === 'Vendl');
test('hlavička nese sestavení', s1.build === '30.7.5');
test('hlavička vysvětluje, k čemu soubor je', /nastaven/i.test(s1._popis));
test('razítko bez zadaného času se doplní samo', /^\d{4}-\d{2}-\d{2}T/.test(nastdbNovy(ctx({ kdy: null })).razitko));

console.log('\n— obrana proti poškozenému souboru —');

chyba('nesmyslný JSON se odmítne', () => nastdbNormalizuj('{tohle není json'));
chyba('pole místo objektu se odmítne', () => nastdbNormalizuj('[1,2,3]'));
chyba('null se odmítne', () => nastdbNormalizuj('null'));
chyba('cizí aplikace se odmítne', () => nastdbNormalizuj(
  JSON.stringify(Object.assign({}, s1, { aplikace: 'Jiný program' }))));
chyba('novější schéma se odmítne', () => nastdbNormalizuj(
  JSON.stringify(Object.assign({}, s1, { schema: NASTDB_SCHEMA + 1 }))));
chyba('novější formát konfigurace se odmítne', () => nastdbNormalizuj(
  JSON.stringify(Object.assign({}, s1, { verze: KONFIG_VERZE + 1 }))));
chyba('soubor bez jediného známého oddílu se odmítne', () => nastdbNormalizuj(
  JSON.stringify({ aplikace: 'Kalkulátor OCK', schema: 1, neco: 1 })));

/* Do složky může někdo ručně zkopírovat celý konfigurace.json. Ten nese
 * i katalog a slevy – a ty musí zůstat výhradně v _program.json, jinak by
 * se verzovaný ceník tiše přepsal ze souboru, který žádnou historii nemá. */
const podvrh = JSON.parse(JSON.stringify(s1));
podvrh.katalog = { verze: 1, seq: 3, sekce: { hrubaOck: [{ kid: 'k1', nazev: 'Pašovaná položka', cena: 1 }] } };
podvrh.nastaveni.slevy = { minMarze: 0.99, stropy: { 'Obchodník': 0.5 }, schemata: [] };
podvrh.nastaveni.jeAdmin = true;
podvrh.sablony = { nabidka: { nazev: 'x.docx' } };
const cist = nastdbNormalizuj(JSON.stringify(podvrh));
test('podstrčený katalog se ze souboru vyhodí', cist.katalog === undefined);
test('podstrčené slevy se ze souboru vyhodí', cist.nastaveni.slevy === undefined);
test('podstrčená role administrátora se vyhodí', cist.nastaveni.jeAdmin === undefined);
test('podstrčené šablony se vyhodí', cist.sablony === undefined);
test('zbytek podvrženého souboru se použije', cist.nastaveni.firma.nazev === 'Zkušební s.r.o.');

console.log('\n— otisk a zbytečné zápisy —');

/* Otisk musí být nezávislý na pořadí klíčů: po načtení ze složky se
 * objekty skládají znovu a jiné pořadí by vyrobilo jiný otisk, aplikace
 * by považovala nastavení za změněné a při každém spuštění by zbytečně
 * zapisovala do složky na Disku. */
const prehozene = JSON.parse(JSON.stringify(s1));
prehozene.nastaveni.firma = { telefon: '+420 111 222 333', ico: '123', nazev: 'Zkušební s.r.o.' };
test('otisk nezávisí na pořadí klíčů', nastdbOtisk(prehozene) === nastdbOtisk(s1));
test('otisk nezávisí na čase zápisu',
  nastdbOtisk(nastdbNovy(ctx({ kdy: '2027-01-01T00:00:00.000Z' }))) === nastdbOtisk(s1));
test('otisk nezávisí na tom, kdo zapsal',
  nastdbOtisk(nastdbNovy(ctx({ kdo: 'Někdo jiný' }))) === nastdbOtisk(s1));

const jinyNast = novyNast(); jinyNast.jazyk = 'de';
test('změna jazyka otisk změní', nastdbOtisk(nastdbNovy(ctx({ NAST: jinyNast }))) !== nastdbOtisk(s1));
const jinaFirma = novyNast(); jinaFirma.firma.telefon = '+420 999 888 777';
test('změna telefonu firmy otisk změní', nastdbOtisk(nastdbNovy(ctx({ NAST: jinaFirma }))) !== nastdbOtisk(s1));
const jineSlevy = novyNast(); jineSlevy.slevy.minMarze = 0.5;
test('změna slev otisk NEZMĚNÍ (slevy do souboru nepatří)',
  nastdbOtisk(nastdbNovy(ctx({ NAST: jineSlevy }))) === nastdbOtisk(s1));

test('stejná data se poznají', nastdbStejne(s1, nastdbNormalizuj(JSON.stringify(s1))));
test('jiná data se poznají', nastdbStejne(s1, nastdbNovy(ctx({ NAST: jinyNast }))) === false);
test('proti prázdnu se nesrovnává jako shoda', nastdbStejne(s1, null) === false);

console.log('\n— načtení do běžící aplikace —');

/* Cíl je stav aplikace, do kterého se soubor vrací: jiná firma, jiný
 * jazyk, jiné slevy. Načtení musí přepsat to první a druhé a nechat
 * na pokoji to třetí. */
const cil = ctx({ NAST: novyNast() });
cil.NAST.firma.nazev = 'Něco jiného';
cil.NAST.jazyk = 'cz';
cil.NAST.slevy.minMarze = 0.42;
cil.NAST.uzivatele.length = 0;
const puvodniFirmaRef = cil.NAST.firma;
const puvodniTsRef = cil.TS_C.umisteniSachty;
cil.TS_C.umisteniSachty.length = 0;
cil.TS_C.umisteniSachty.push('smazáno');

const vysl = nastdbPouzij(nastdbNormalizuj(JSON.stringify(s1)), cil);
test('firemní údaje se vrátily', cil.NAST.firma.nazev === 'Zkušební s.r.o.');
test('reference na firmu zůstala platná (formuláře se neodpojí)', cil.NAST.firma === puvodniFirmaRef);
test('jazyk se vrátil', cil.NAST.jazyk === 'en');
test('uživatelé se vrátili', cil.NAST.uzivatele.length === 1);
test('slevové stropy zůstaly nedotčené', cil.NAST.slevy.minMarze === 0.42);
test('role administrátora zůstala nedotčená', cil.NAST.jeAdmin === true);
test('číselník specifikace se vrátil', cil.TS_C.umisteniSachty.length > 1);
test('reference na číselník zůstala platná', cil.TS_C.umisteniSachty === puvodniTsRef);
test('katalog zůstal nedotčený', katalogPocet(cil.KATALOG) === 0);
test('načtení hlásí, co změnilo', Array.isArray(vysl.zmeneno) && vysl.zmeneno.length >= 2);

/* Kolo dokola: co se uloží, to se načte, a znovu uložené je totožné.
 * Bez toho by se soubor při každém spuštění lišil a přepisoval. */
const poNacteni = nastdbNovy(ctx({ NAST: cil.NAST, TS_C: cil.TS_C, TECHSPEC_DEF: cil.TECHSPEC_DEF }));
test('uložit → načíst → uložit dá tentýž otisk', nastdbOtisk(poNacteni) === nastdbOtisk(s1));

console.log('\n— popis pro obsluhu —');
test('souhrn zmiňuje firmu', /Zkušební/.test(nastdbSouhrn(s1)));
test('souhrn zmiňuje počet uživatelů', /1 uživatel/.test(nastdbSouhrn(s1)));
test('bez načtených nastavení souhrn nelže', /není načten/.test(nastdbSouhrn(null)));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
