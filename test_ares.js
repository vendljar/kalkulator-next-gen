/* Test #17 – archiv historických kalkulací a alternativní nabídka.
 *
 * Model v archiv.js je bez DOM, takže se dá otestovat v Node. Otevírání
 * souborů, panel a tlačítka se testují až nad sestavením (overit_lista.mjs).
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne – funkce
 * sdílené mezi moduly se globalizují ručně, jinak podmínky
 * `typeof fn === 'function'` tiše spadnou do záložní větve a test by
 * ověřoval jinou cestu kódem, než jaká poběží v aplikaci. */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
global.novaVarianta = zk.novaVarianta; global.novaVariantaData = zk.novaVariantaData;
global.aktivniVarianta = zk.aktivniVarianta; global.ridiciVarianta = zk.ridiciVarianta;
const { novaZakazka, importZakazka } = zk;

const zm = require('./zamek.js');
global.zajistiZamek = zm.zajistiZamek; global.variantaCislo = zm.variantaCislo;
global.variantaUzamcena = zm.variantaUzamcena; global.dalsiPriponaVarianty = zm.dalsiPriponaVarianty;
global.zamekOtisk = zm.zamekOtisk;
const { zamkniVariantu, klonujVariantu, variantaCislo, zamekOtisk } = zm;

const sz = require('./seznam.js');
global.seznamNorm = sz.seznamNorm; global.seznamStav = sz.seznamStav;
global.seznamStavPopis = sz.seznamStavPopis; global.seznamPorovnej = sz.seznamPorovnej;

const ar = require('./archiv.js');
const { ARCHIV_SLOUPCE, ARCHIV_CENIKY, archivKlic, archivOdeslanoZa, archivZaznam,
        archivZaznamyZeZakazky, archivPridej, archivOdeberSoubor, archivSoubory,
        archivHledej, archivSerad, archivZobraz, alternativaNazev, archivCenikPopis,
        vytvorAlternativu, puvodPopis } = ar;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* ---------- pomůcky: dvě „historické" zakázky ze souborů ---------- */

/* Adresa je zvlášť za variantami: hledá se i podle ní, takže dvě zakázky
 * nesmí sdílet jednu adresu – jinak by test hledání měřil něco jiného,
 * než si myslí. */
function zakazka(cislo, akce, objednatel, datum, varianty, adresa) {
  const z = novaZakazka();
  z.cislo = cislo; z.nazevAkce = akce; z.objednatel = objednatel; z.datum = datum;
  z.adresa = adresa || '';
  z.varianty = [];
  varianty.forEach((v, i) => {
    const nv = zk.novaVarianta(v.nazev);
    nv.pripona = i;
    nv.zakaznik = v.zakaznik || '';
    nv.pozn = v.pozn || '';
    nv.ridici = i === 0;
    if (v.odeslanoZa != null) {
      zamkniVariantu(nv, { typ: 'nabidkaTisk', cislo: variantaCislo(z, nv),
        kdy: '2025-11-04T08:00:00.000Z',
        otisk: zamekOtisk({ celkemBezDph: v.odeslanoZa }) });
    }
    z.varianty.push(nv);
  });
  z.aktivni = z.varianty[0].id;
  z.priponaMax = varianty.length - 1;
  return importZakazka(z);
}

const stara = zakazka('2025 - OPR - CN - 0410', 'Výtahová šachta Hejtmánská', 'Stavby Morava s.r.o.', '2025-11-03', [
  { nazev: 'Základní', zakaznik: 'Stavby Morava', odeslanoZa: 1250000 },
  { nazev: 'Bez opláštění', pozn: 'levnější varianta' },
], 'Hejtmánská 12, Přerov');
const loni = zakazka('2024 - OPR - CN - 0207', 'Úvoz Brno – nástavba', 'Reality Úvoz a.s.', '2024-06-20', [
  { nazev: 'Varianta 1', odeslanoZa: 880000 },
], 'Úvoz 3, Brno');

/* ---------- 1) záznamy ze zakázky ---------- */

const zStara = archivZaznamyZeZakazky(stara, { soubor: 'zakazka_0410.json', kdy: '2026-07-29T10:00:00.000Z' });
const zLoni = archivZaznamyZeZakazky(loni, { soubor: 'zakazka_0207.json', kdy: '2026-07-29T10:00:01.000Z' });

test('každá varianta dá jeden záznam', zStara.length === 2 && zLoni.length === 1);
test('záznam nese číslo nabídky varianty, ne jen zakázky',
  zStara[0].cislo === '2025 - OPR - CN - 0410' && zStara[1].cislo === '2025 - OPR - CN - 0410.1',
  zStara.map(z => z.cislo));
test('záznam nese hlavičku zakázky', zStara[0].nazevAkce === 'Výtahová šachta Hejtmánská'
  && zStara[0].objednatel === 'Stavby Morava s.r.o.' && zStara[0].datum === '2025-11-03');
test('záznam nese název varianty', zStara[1].varianta === 'Bez opláštění');
test('odeslaná varianta má stav „odeslaná"', zStara[0].stav === 'odeslana' && zStara[0].stavPopis === 'odeslaná');
test('rozpracovaná varianta má stav „rozpracovaná"', zStara[1].stav === 'rozpracovana');
test('u odeslané je částka z otisku zámku', zStara[0].odeslanoZa === 1250000);
test('u rozpracované není částka nula, ale nic', zStara[1].odeslanoZa === null);
test('záznam si pamatuje soubor, ze kterého se nahlédlo', zStara[0].soubor === 'zakazka_0410.json');
test('data varianty jsou kopie, ne odkaz do načtené zakázky',
  zStara[0].data !== stara.varianty[0].data
  && JSON.stringify(zStara[0].data) === JSON.stringify(stara.varianty[0].data));
test('klíč záznamu spojuje číslo nabídky a variantu',
  zStara[0].klic === archivKlic('2025 - OPR - CN - 0410', stara.varianty[0].id));
test('otisk bez částky nedá číslo', archivOdeslanoZa({ zamek: { zamceno: true, otisk: {} } }) === null);
test('varianta bez zámku nemá odeslanou částku', archivOdeslanoZa({}) === null);

/* ---------- 2) slučování nahlédnutých souborů ---------- */

let A = [];
let r = archivPridej(A, zStara); A = r.archiv;
test('první soubor přidal dva záznamy', r.pridano === 2 && r.nahrazeno === 0 && r.celkem === 2);
r = archivPridej(A, zLoni); A = r.archiv;
test('druhý soubor přidal třetí záznam', r.pridano === 1 && r.celkem === 3);
r = archivPridej(A, archivZaznamyZeZakazky(stara, { soubor: 'zakazka_0410.json' })); A = r.archiv;
test('stejný soubor podruhé nezdvojí záznamy', r.pridano === 0 && r.nahrazeno === 2 && r.celkem === 3);
test('přehled souborů říká, kolik z kterého je',
  JSON.stringify(archivSoubory(A)) === JSON.stringify([
    { soubor: 'zakazka_0410.json', pocet: 2 }, { soubor: 'zakazka_0207.json', pocet: 1 }]),
  archivSoubory(A));
const bezStare = archivOdeberSoubor(A, 'zakazka_0410.json');
test('odebrání souboru vyjme jeho záznamy', bezStare.odebrano === 2 && bezStare.archiv.length === 1);
test('odebrání nesahá do původního pole (archiv se nahrazuje, ne mutuje)', A.length === 3);

/* ---------- 3) hledání ---------- */

test('hledání bez dotazu vrátí vše', archivHledej(A, '').length === 3);
test('hledá se bez diakritiky', archivHledej(A, 'hejtmanska').length === 2);
test('hledá se podle objednatele', archivHledej(A, 'reality').length === 1);
test('hledá se podle čísla nabídky', archivHledej(A, '0410.1').length === 1);
test('hledá se podle názvu varianty', archivHledej(A, 'oplášt').length === 1);
test('hledá se podle poznámky', archivHledej(A, 'levnější').length === 1);
test('hledá se podle názvu souboru', archivHledej(A, '0207.json').length === 1);
test('všechna slova musí sedět (AND)', archivHledej(A, 'hejtmanska oplášt').length === 1);
test('nesmyslný dotaz nenajde nic', archivHledej(A, 'kosmodrom').length === 0);
test('stav je hledatelný slovem', archivHledej(A, 'odeslaná').length === 2);

/* ---------- 4) řazení a přehled ---------- */

const podleData = archivSerad(A, 'datum', -1);
test('výchozí řazení dává nejnovější zakázku první',
  podleData[0].datum === '2025-11-03' && podleData[2].datum === '2024-06-20');
const podleCeny = archivSerad(A, 'odeslanoZa', -1);
test('řazení podle částky dává nejdražší první', podleCeny[0].odeslanoZa === 1250000);
test('záznam bez částky je při řazení podle částky poslední',
  podleCeny[podleCeny.length - 1].odeslanoZa === null);
const podleAkce = archivSerad(A, 'nazevAkce', 1);
/* České řazení: Ú patří k U, tedy před V – ne až za všechna písmena
 * s háčky a čárkami, jak by to dopadlo při prostém porovnání kódů. */
test('řazení podle akce je české (Ú před V)',
  podleAkce[0].nazevAkce === 'Úvoz Brno – nástavba'
  && podleAkce[podleAkce.length - 1].nazevAkce === 'Výtahová šachta Hejtmánská',
  podleAkce.map(z => z.nazevAkce));

const pohled = archivZobraz(A, { hledat: 'hejtmanska' });
test('přehled vrátí zúžený počet i celek', pohled.celkem === 3 && pohled.zobrazeno === 2 && pohled.skryto === 1);
test('přehled ví, že je zúžený', pohled.zuzeno === true);
test('přehled bez dotazu není zúžený', archivZobraz(A, {}).zuzeno === false);
test('prázdný archiv se pozná', archivZobraz([], {}).prazdny === true && archivZobraz(A, {}).prazdny === false);
test('přehled nese seznam souborů', archivZobraz(A, {}).soubory.length === 2);
test('výchozí klíč řazení je datum sestupně',
  archivZobraz(A, {}).klic === 'datum' && archivZobraz(A, {}).smer === -1);

/* ---------- 5) alternativní nabídka ---------- */

/* Otevřená zakázka, do které se alternativa přináší. Má vlastní číslo,
 * vlastního objednatele a vlastní (dnešní) ceník. */
const dnes = novaZakazka();
dnes.cislo = '2026 - OPR - CN - 0500';
dnes.nazevAkce = 'Rekonstrukce výtahu Olomouc';
dnes.objednatel = 'Město Olomouc';
dnes.varianty[0].data.cenik.marze = 0.33;                 // dnešní ceník
const zaznam = A.find(z => z.cislo === '2025 - OPR - CN - 0410');
zaznam.data.cenik.marze = 0.19;                            // historický ceník
zaznam.data.ock.zadani.pocetStanic = 7;                    // historické zadání

const alt = vytvorAlternativu(dnes, zaznam, { kdy: '2026-07-29T11:00:00.000Z' });
test('alternativa vznikla', !!alt);
test('alternativa je varianta téže zakázky, ne nová zakázka',
  dnes.varianty.length === 2 && dnes.varianty[1] === alt);
test('alternativa nemění hlavičku otevřené zakázky',
  dnes.cislo === '2026 - OPR - CN - 0500' && dnes.objednatel === 'Město Olomouc');
test('alternativa dostala další volnou příponu', alt.pripona === 1);
test('číslo alternativy navazuje na otevřenou zakázku',
  variantaCislo(dnes, alt) === '2026 - OPR - CN - 0500.1');
test('alternativa se otevře k práci', dnes.aktivni === alt.id);
test('alternativa není řídící', alt.ridici === false);
test('alternativa není zamčená', !alt.zamek);
test('alternativa přebírá historické zadání', alt.data.ock.zadani.pocetStanic === 7);
test('výchozí režim počítá dnešním ceníkem', alt.data.cenik.marze === 0.33);
test('alternativa nese původ (číslo staré nabídky)', alt.puvod.cislo === '2025 - OPR - CN - 0410');
test('původ nese i soubor a akci',
  alt.puvod.soubor === 'zakazka_0410.json' && alt.puvod.nazevAkce === 'Výtahová šachta Hejtmánská');
test('původ si pamatuje, kterým ceníkem se počítalo', alt.puvod.cenik === 'aktualni');
test('název alternativy vychází z názvu původní varianty', alt.nazev === 'Alternativa – Základní');
test('popis původu je věta pro obrazovku',
  puvodPopis(alt).includes('2025 - OPR - CN - 0410') && puvodPopis(alt).includes('dnešním ceníkem'),
  puvodPopis(alt));
test('varianta bez původu popis nemá', puvodPopis(dnes.varianty[0]) === '');

const alt2 = vytvorAlternativu(dnes, zaznam, { cenik: 'historicky' });
test('druhá alternativa dostala další příponu', alt2.pripona === 2);
test('historický režim ponechá starý ceník', alt2.data.cenik.marze === 0.19);
test('historický režim se zapíše do původu', alt2.puvod.cenik === 'historicky');
test('popis původu historický ceník pojmenuje', puvodPopis(alt2).includes('historickým ceníkem'));
test('druhá alternativa z téhož zdroje se jmenuje jinak',
  alt2.nazev === 'Alternativa (2) – Základní', alt2.nazev);
test('alternativa se nedělá z ničeho', vytvorAlternativu(dnes, null) === null
  && vytvorAlternativu(null, zaznam) === null && vytvorAlternativu(dnes, { data: null }) === null);

/* Klon (#34) i alternativa berou z jedné řady čísel – dvě různé cesty
 * nesmí přidělit stejné číslo nabídky. */
const klon = klonujVariantu(dnes, alt.id);
test('klon po alternativě dostane další číslo v řadě', klon.pripona === 3);
test('alternativa po klonu pokračuje v téže řadě',
  vytvorAlternativu(dnes, zaznam).pripona === 4);

test('název nezdvojuje předponu',
  alternativaNazev({ varianty: [] }, 'Alternativa – Základní') === 'Alternativa – Základní');
test('název přepíše předponu kopie',
  alternativaNazev({ varianty: [] }, 'Kopie – Základní') === 'Alternativa – Základní');
test('název bez zdroje nespadne',
  alternativaNazev({ varianty: [] }, '') === 'Alternativa – Varianta');

/* ---------- 6) drobnosti, na kterých se dá uklouznout ---------- */

test('oba režimy ceníku mají popis',
  Object.keys(ARCHIV_CENIKY).every(k => ARCHIV_CENIKY[k].popis.length > 5));
test('neznámý režim ceníku popíše jako dnešní',
  archivCenikPopis('nesmysl') === ARCHIV_CENIKY.aktualni.popis);
test('neznámý režim ceníku se chová jako dnešní',
  vytvorAlternativu(dnes, zaznam, { cenik: 'nesmysl' }).data.cenik.marze === 0.33);
test('každý sloupec má popis', ARCHIV_SLOUPCE.every(s => s.popis.length > 2));
test('záznam z prázdné zakázky nespadne', archivZaznamyZeZakazky(null).length === 0);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
if (fail) process.exit(1);
