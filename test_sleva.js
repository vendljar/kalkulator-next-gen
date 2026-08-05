/* Test #18 – seznam kalkulací: řazení, filtr, hledání, stav, kopie.
 *
 * Model v seznam.js je bez DOM, takže se dá otestovat v Node. Vykreslení
 * (ui/seznam_ui.js) se ověřuje až nad sestaveným buildem v overit_lista.mjs.
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne – funkce
 * sdílené mezi moduly se musí globalizovat ručně, jinak podmínky
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
const zk = require('./zakazka.js');
global.novaVarianta = zk.novaVarianta; global.novaVariantaData = zk.novaVariantaData;
global.aktivniVarianta = zk.aktivniVarianta; global.ridiciVarianta = zk.ridiciVarianta;
const { novaZakazka } = zk;

const zm = require('./zamek.js');
global.zajistiZamek = zm.zajistiZamek;
global.variantaCislo = zm.variantaCislo; global.variantaUzamcena = zm.variantaUzamcena;
global.variantaEditovatelna = zm.variantaEditovatelna; global.zamekInfo = zm.zamekInfo;
global.dokumentZamyka = zm.dokumentZamyka; global.dokumentPopis = zm.dokumentPopis;
const { klonujVariantu, zamkniVariantu, odemkniVariantu, variantaCislo } = zm;

const sz = require('./seznam.js');
const { SEZNAM_STAVY, SEZNAM_FILTRY, SEZNAM_SLOUPCE, seznamStav, seznamStavPopis,
        seznamFiltr, seznamSloupec, seznamNorm, seznamSlova, seznamRadky,
        seznamHledej, seznamPouzijFiltr, seznamSerad, seznamPocty,
        seznamZobraz, seznamKopieNazev } = sz;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* ---------- příprava vzorové zakázky ----------
 * Čtyři varianty pokrývají všechny tři stavy i variantu bez ceny. */
function vzorek() {
  const zak = novaZakazka();
  zak.cislo = '2026 - OPR - CN - 0500';
  const v1 = zak.varianty[0];
  v1.nazev = 'Základní řešení';
  v1.zakaznik = 'Výtahy Hejtmánská';
  v1.pozn = 'původní zadání';
  v1.upraveno = '2026-07-20T08:00:00.000Z';

  const v2 = klonujVariantu(zak, v1.id, { nazev: 'Úsporná varianta' });
  v2.zakaznik = 'Výtahy Hejtmánská';
  v2.pozn = 'bez opláštění';
  v2.upraveno = '2026-07-22T08:00:00.000Z';

  const v3 = klonujVariantu(zak, v1.id, { nazev: 'Ždírec – panorama' });
  v3.zakaznik = 'Schindler CZ';
  v3.pozn = 'prosklení';
  v3.upraveno = '2026-07-21T08:00:00.000Z';

  const v4 = klonujVariantu(zak, v1.id, { nazev: 'Alternativa bez ceny' });
  v4.zakaznik = '';
  v4.pozn = '';
  v4.upraveno = '2026-07-19T08:00:00.000Z';

  zak.aktivni = v2.id;
  v1.ridici = true; v2.ridici = false; v3.ridici = false; v4.ridici = false;

  // v1 odeslaná, v3 odemčená správcem, v2 a v4 rozpracované
  zamkniVariantu(v1, { typ: 'nabidkaTisk', cislo: variantaCislo(zak, v1), kdo: 'JV' });
  zamkniVariantu(v3, { typ: 'nabidka', cislo: variantaCislo(zak, v3), kdo: 'JV' });
  odemkniVariantu(v3, { jeAdmin: true, duvod: 'překlep v adrese', kdo: 'JV' });

  const ceny = {};
  ceny[v1.id] = { ock: 300000, proj: 40000 };
  ceny[v2.id] = { ock: 250000, proj: 40000 };
  ceny[v3.id] = { ock: 410000, proj: 0 };
  ceny[v4.id] = { ock: NaN, proj: NaN };
  return { zak, ceny, v1, v2, v3, v4 };
}

/* ---------- 1) stav varianty ---------- */
{
  const { v1, v2, v3 } = vzorek();
  test('vytištěná varianta má stav „odeslaná"', seznamStav(v1) === 'odeslana');
  test('nedotčená varianta je rozpracovaná', seznamStav(v2) === 'rozpracovana');
  test('po odemčení správcem je stav „odemčená"', seznamStav(v3) === 'odemcena');
  test('stav bez zámku i bez odemčení je rozpracovaná', seznamStav({}) === 'rozpracovana');
  test('popis stavu je lidský', seznamStavPopis('odeslana') === 'odeslaná');
  test('neznámý stav popis nezhavaruje', seznamStavPopis('cosi') === 'cosi');
  test('všechny stavy mají pořadí pro řazení',
    Object.keys(SEZNAM_STAVY).every(k => typeof SEZNAM_STAVY[k].poradi === 'number'));
}

/* ---------- 2) sestavení řádků ---------- */
{
  const { zak, ceny, v1, v2, v4 } = vzorek();
  const r = seznamRadky(zak, ceny);
  test('řádků je tolik co variant', r.length === 4, r.length);
  test('řádek nese číslo nabídky varianty', r[1].cislo === variantaCislo(zak, v2), r[1].cislo);
  test('první varianta drží holé číslo zakázky', r[0].cislo === '2026 - OPR - CN - 0500', r[0].cislo);
  test('klon má příponu .1', r[1].cislo === '2026 - OPR - CN - 0500.1', r[1].cislo);
  test('celkem je součet OCK a PROJ', r[0].celkem === 340000, r[0].celkem);
  test('chybějící cena je null, ne nula', r[3].ock === null && r[3].celkem === null,
    JSON.stringify([r[3].ock, r[3].celkem]));
  test('nula jako cena PROJ zůstává nulou', r[2].proj === 0, r[2].proj);
  test('otevřená varianta je označená', r[1].aktivni === true && r[0].aktivni === false);
  test('řídící varianta je označená', r[0].ridici === true && r[1].ridici === false);
  test('zamčená varianta je označená', r[0].zamceno === true && r[1].zamceno === false);
  test('řádek si pamatuje původní pořadí', r.map(x => x.poradi).join(',') === '0,1,2,3');
  test('ceny lze předat i funkcí',
    seznamRadky(zak, () => ({ ock: 1, proj: 2 }))[0].celkem === 3);
  test('zakázka bez variant vrátí prázdný seznam', seznamRadky(null, {}).length === 0);
  void v1; void v4;
}

/* ---------- 3) normalizace a hledání ---------- */
{
  test('normalizace shodí diakritiku i velikost', seznamNorm('Ždírec Nad Doubravou') === 'zdirec nad doubravou',
    seznamNorm('Ždírec Nad Doubravou'));
  test('normalizace snese null', seznamNorm(null) === '');
  test('dotaz se rozpadne na slova', seznamSlova('  opr   0500 ').join('|') === 'opr|0500');
  test('prázdný dotaz nemá slova', seznamSlova('   ').length === 0);

  const { zak, ceny } = vzorek();
  const r = seznamRadky(zak, ceny);
  test('prázdný dotaz vrátí vše', seznamHledej(r, '').length === 4);
  test('hledání ignoruje diakritiku', seznamHledej(r, 'zdirec').length === 1,
    seznamHledej(r, 'zdirec').map(x => x.nazev).join(','));
  test('hledání ignoruje velikost písmen', seznamHledej(r, 'HEJTMÁNSKÁ').length === 2);
  test('více slov zužuje (AND)', seznamHledej(r, 'hejtmanska usporna').length === 1,
    seznamHledej(r, 'hejtmanska usporna').map(x => x.nazev).join(','));
  test('slova nemusí být vedle sebe', seznamHledej(r, 'opr 0500.1').length === 1);
  test('hledá se i v poznámce', seznamHledej(r, 'prosklení').length === 1);
  test('hledá se i ve stavu', seznamHledej(r, 'odeslaná').length === 1);
  test('nic nenalezeno = prázdný seznam', seznamHledej(r, 'traktor').length === 0);
  test('hledání nemění vstupní pole', r.length === 4);
}

/* ---------- 4) filtr podle stavu ---------- */
{
  const { zak, ceny } = vzorek();
  const r = seznamRadky(zak, ceny);
  test('filtry mají všechny id i popis',
    SEZNAM_FILTRY.every(f => f.id && f.popis && typeof f.test === 'function'));
  test('neznámý filtr spadne na „vše"', seznamFiltr('nesmysl').id === 'vse');
  test('filtr „vše" nechá vše', seznamPouzijFiltr(r, 'vse').length === 4);
  test('filtr „odeslané" vybere jednu', seznamPouzijFiltr(r, 'odeslane').length === 1);
  test('filtr „odemčené" vybere jednu', seznamPouzijFiltr(r, 'odemcene').length === 1);
  test('filtr „rozpracované" vybere dvě', seznamPouzijFiltr(r, 'rozpracovane').length === 2);
  test('filtr „jen řídící" vybere řídící', seznamPouzijFiltr(r, 'ridici').length === 1
    && seznamPouzijFiltr(r, 'ridici')[0].ridici === true);
  test('součet filtrů podle stavu = všechny řádky',
    seznamPouzijFiltr(r, 'odeslane').length + seznamPouzijFiltr(r, 'odemcene').length
    + seznamPouzijFiltr(r, 'rozpracovane').length === r.length);
}

/* ---------- 5) řazení ---------- */
{
  const { zak, ceny } = vzorek();
  const r = seznamRadky(zak, ceny);
  test('sloupec se najde podle id', seznamSloupec('ock').typ === 'cislo');
  test('neznámý sloupec vrátí null', seznamSloupec('xx') === null);
  test('bez klíče se řadí původním pořadím',
    seznamSerad(r, '', 1).map(x => x.poradi).join(',') === '0,1,2,3');

  const dleCeny = seznamSerad(r, 'ock', 1).map(x => x.ock);
  test('vzestupně podle ceny', JSON.stringify(dleCeny) === JSON.stringify([250000, 300000, 410000, null]),
    JSON.stringify(dleCeny));
  const dleCenySest = seznamSerad(r, 'ock', -1).map(x => x.ock);
  test('sestupně podle ceny', JSON.stringify(dleCenySest) === JSON.stringify([410000, 300000, 250000, null]),
    JSON.stringify(dleCenySest));
  test('prázdná cena je poslední v obou směrech',
    dleCeny[3] === null && dleCenySest[3] === null);

  const dleNazvu = seznamSerad(r, 'nazev', 1).map(x => x.nazev);
  test('české řazení: Ž je až za Z i za Ú',
    dleNazvu[dleNazvu.length - 1] === 'Ždírec – panorama', JSON.stringify(dleNazvu));
  test('sestupné řazení je obrácené',
    JSON.stringify(seznamSerad(r, 'nazev', -1).map(x => x.nazev))
    === JSON.stringify(dleNazvu.slice(0).reverse()));

  const dleStavu = seznamSerad(r, 'stav', 1).map(x => x.stav);
  test('řazení podle stavu jde odeslané → odemčené → rozpracované',
    JSON.stringify(dleStavu) === JSON.stringify(['odeslana', 'odemcena', 'rozpracovana', 'rozpracovana']),
    JSON.stringify(dleStavu));

  const dleZmeny = seznamSerad(r, 'upraveno', -1).map(x => x.upraveno.slice(0, 10));
  test('nejnovější změna nahoře', dleZmeny[0] === '2026-07-22', JSON.stringify(dleZmeny));

  // stabilita: dva shodné stavy si nesmí prohodit pořadí
  const stabil = seznamSerad(r, 'stav', 1).filter(x => x.stav === 'rozpracovana').map(x => x.poradi);
  test('shodné hodnoty drží původní pořadí', JSON.stringify(stabil) === JSON.stringify([1, 3]),
    JSON.stringify(stabil));
  test('řazení nemění vstupní pole', r.map(x => x.poradi).join(',') === '0,1,2,3');
  test('prázdný text jde na konec i vzestupně',
    seznamSerad(r, 'zakaznik', 1).map(x => x.zakaznik).pop() === '');
}

/* ---------- 6) počty ---------- */
{
  const { zak, ceny } = vzorek();
  const p = seznamPocty(seznamRadky(zak, ceny));
  test('počty souhlasí', p.vse === 4 && p.odeslane === 1 && p.odemcene === 1
    && p.rozpracovane === 2 && p.ridici === 1, JSON.stringify(p));
}

/* ---------- 7) seznamZobraz – jeden vstupní bod pro UI ---------- */
{
  const { zak, ceny } = vzorek();
  const vse = seznamZobraz(zak, ceny, {});
  test('bez zúžení je vidět vše', vse.zobrazeno === 4 && vse.celkem === 4 && vse.skryto === 0);
  test('bez filtru a hledání není pohled zúžený', vse.zuzeno === false);
  test('výchozí směr je vzestupný', vse.smer === 1);
  test('neznámý klíč řazení se zahodí', seznamZobraz(zak, ceny, { klic: 'xx' }).klic === '');

  const jenOdeslane = seznamZobraz(zak, ceny, { filtr: 'odeslane' });
  test('filtr se propíše do výsledku', jenOdeslane.filtr === 'odeslane' && jenOdeslane.zobrazeno === 1);
  test('skryté řádky se spočítají', jenOdeslane.skryto === 3);
  test('zúžený pohled se pozná', jenOdeslane.zuzeno === true);
  test('počty se počítají ze VŠECH řádků, ne z vyfiltrovaných',
    jenOdeslane.pocty.vse === 4, JSON.stringify(jenOdeslane.pocty));
  test('odfiltrovaná otevřená varianta se ohlásí',
    jenOdeslane.aktivniSkryta === true && jenOdeslane.aktivniNazev === 'Úsporná varianta',
    jenOdeslane.aktivniNazev);

  const sAktivni = seznamZobraz(zak, ceny, { filtr: 'rozpracovane' });
  test('když je otevřená varianta vidět, nehlásí se nic', sAktivni.aktivniSkryta === false);

  const kombinace = seznamZobraz(zak, ceny, { filtr: 'rozpracovane', hledat: 'usporna', klic: 'ock', smer: -1 });
  test('filtr + hledání + řazení se skládají',
    kombinace.zobrazeno === 1 && kombinace.radky[0].nazev === 'Úsporná varianta'
    && kombinace.klic === 'ock' && kombinace.smer === -1);
  test('hledání bez výsledku vrátí prázdno, ne chybu',
    seznamZobraz(zak, ceny, { hledat: 'traktor' }).zobrazeno === 0);
  test('seznamZobraz nemění zakázku', zak.varianty.length === 4);
}

/* ---------- 8) název kopie ---------- */
{
  const { zak } = vzorek();
  test('kopie dostane srozumitelný název',
    seznamKopieNazev(zak, 'Základní řešení') === 'Kopie – Základní řešení',
    seznamKopieNazev(zak, 'Základní řešení'));
  zak.varianty[1].nazev = 'Kopie – Základní řešení';
  test('druhá kopie téhož se odliší číslem',
    seznamKopieNazev(zak, 'Základní řešení') === 'Kopie (2) – Základní řešení',
    seznamKopieNazev(zak, 'Základní řešení'));
  test('kopie kopie se nevrší',
    seznamKopieNazev(novaZakazka(), 'Kopie – Základní řešení') === 'Kopie – Základní řešení',
    seznamKopieNazev(novaZakazka(), 'Kopie – Základní řešení'));
  test('kopie číslované kopie se taky nevrší',
    seznamKopieNazev(novaZakazka(), 'Kopie (3) – Ždírec') === 'Kopie – Ždírec',
    seznamKopieNazev(novaZakazka(), 'Kopie (3) – Ždírec'));
  test('prázdný název nespadne', seznamKopieNazev(novaZakazka(), '') === 'Kopie – Varianta');
}

/* ---------- 9) sloupce jsou konzistentní se seznamem ---------- */
{
  const { zak, ceny } = vzorek();
  const r = seznamRadky(zak, ceny)[0];
  test('každý sloupec má odpovídající pole v řádku',
    SEZNAM_SLOUPCE.every(s => Object.prototype.hasOwnProperty.call(r, s.id)),
    SEZNAM_SLOUPCE.filter(s => !Object.prototype.hasOwnProperty.call(r, s.id)).map(s => s.id).join(','));
  test('každý sloupec má známý typ',
    SEZNAM_SLOUPCE.every(s => ['text', 'cislo', 'stav'].includes(s.typ)));
  test('hledá se aspoň v pěti sloupcích',
    SEZNAM_SLOUPCE.filter(s => s.hledat).length >= 5);
}

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
