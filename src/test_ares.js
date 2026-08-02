/* Test dotažení firmy z rejstříku ARES (#10).
 *
 * Sítě se tenhle test nedotkne. Testuje se to, co může tiše rozbít hlavičku
 * nabídky: jak se z odpovědi rejstříku vyčtou údaje a co přesně se z nich smí
 * přepsat. Odpověď ARES je proto uložená tady v souboru – stejná struktura,
 * jakou vrací `/ekonomicke-subjekty/{ico}`.
 *
 * Tři věci, které tu hlídáme nejvíc:
 *   a) přepis se nikdy nestane sám – `aresRozdily` je seznam k potvrzení
 *      a `aresPrepis` provede přesně jeho obsah, nic navíc,
 *   b) prázdný údaj z rejstříku nesmí vygumovat ručně vyplněné pole,
 *   c) na neplatné IČO se dotaz vůbec nesestaví (rejstřík by ho nenašel
 *      a uživatel by čekal na odpověď, o které dopředu víme, jak dopadne).
 */
const zk = require('./zakazka.js');
global.icoPlatne = zk.icoPlatne;
global.icoNormalizuj = zk.icoNormalizuj;
const ar = require('./ares.js');
const { aresUrl, aresPsc, aresAdresa, aresZpracuj, aresPopis,
        aresRozdily, aresPrepis, aresHlaska, ARES_ZAKLAD, ARES_POLE } = ar;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

/* Uložená odpověď rejstříku. IČO 25596641 je platné podle kontrolní číslice
 * (test nesmí záviset na tom, že tahle konkrétní firma v rejstříku opravdu
 * je – ověřuje se zpracování odpovědi, ne obsah rejstříku). */
const ODPOVED = {
  ico: '25596641',
  obchodniJmeno: 'Zkušební strojírny s.r.o.',
  sidlo: {
    kodStatu: 'CZ', nazevStatu: 'Česká republika',
    nazevObce: 'Brno', nazevCastiObce: 'Černovice',
    nazevUlice: 'Vlárská', cisloDomovni: 22, cisloOrientacni: 3,
    psc: 61800, textovaAdresa: 'Vlárská 22/3, Černovice, 618 00 Brno',
  },
  pravniForma: '112', dic: 'CZ25596641', datumVzniku: '1999-04-01',
};

/* ---------- 1) adresa URL ---------- */
test('platné IČO dá adresu do rejstříku', aresUrl('25596641') === ARES_ZAKLAD + '25596641', aresUrl('25596641'));
test('IČO s mezerami se před dotazem srovná', aresUrl('255 966 41') === ARES_ZAKLAD + '25596641', aresUrl('255 966 41'));
test('neplatné IČO se do rejstříku vůbec neposílá', aresUrl('12345678') === '');
test('prázdné pole dotaz nesestaví', aresUrl('') === '' && aresUrl(null) === '');
test('DIČ není IČO – dotaz se nesestaví', aresUrl('CZ25596641') === '');

/* ---------- 2) PSČ a adresa ---------- */
test('PSČ z čísla se píše s mezerou', aresPsc(61800) === '618 00', aresPsc(61800));
test('PSČ, které není pětimístné, se nechá být', aresPsc('61 8') === '618');
test('adresa se bere hotová z rejstříku',
  aresAdresa(ODPOVED.sidlo) === 'Vlárská 22/3, Černovice, 618 00 Brno', aresAdresa(ODPOVED.sidlo));
const bezText = JSON.parse(JSON.stringify(ODPOVED.sidlo)); delete bezText.textovaAdresa;
test('bez hotové adresy se poskládá z dílů',
  aresAdresa(bezText) === 'Vlárská 22/3, 618 00 Brno', aresAdresa(bezText));
test('obec bez ulice se nezahodí',
  aresAdresa({ nazevObce: 'Slavkov', cisloDomovni: 7, psc: 68401 }) === 'Slavkov 7, 684 01 Slavkov',
  aresAdresa({ nazevObce: 'Slavkov', cisloDomovni: 7, psc: 68401 }));
test('prázdné sídlo neshodí', aresAdresa(null) === '' && aresAdresa({}) === '');

/* ---------- 3) zpracování odpovědi ---------- */
const s = aresZpracuj(ODPOVED);
test('z odpovědi se vyčte název', s.nazev === 'Zkušební strojírny s.r.o.', s.nazev);
test('z odpovědi se vyčte IČO i DIČ', s.ico === '25596641' && s.dic === 'CZ25596641');
test('z odpovědi se vyčte adresa sídla', s.adresa === 'Vlárská 22/3, Černovice, 618 00 Brno', s.adresa);
test('živá firma se nehlásí jako zaniklá', s.zanikla === false && s.datumZaniku === '');
const zanikla = aresZpracuj(Object.assign({}, ODPOVED, { datumZaniku: '2020-12-31' }));
test('zaniklá firma se pozná', zanikla.zanikla === true && zanikla.datumZaniku === '2020-12-31');
test('cizí odpověď se nevydává za subjekt',
  aresZpracuj({ kod: 'NENALEZENO' }) === null && aresZpracuj({}) === null && aresZpracuj(null) === null);
test('představení firmy nese název, IČO i adresu',
  /Zkušební strojírny/.test(aresPopis(s)) && /25596641/.test(aresPopis(s)) && /Vlárská/.test(aresPopis(s)),
  aresPopis(s));
test('představení prázdného subjektu je prázdné', aresPopis(null) === '');

/* ---------- 4) seznam změn k potvrzení ---------- */
const prazdna = { cislo: 'CN-1', objednatel: '', adresaObjednatele: '', ico: '25596641', kontakt: 'Ing. Nový' };
const r1 = aresRozdily(prazdna, s);
test('do prázdné hlavičky se nabídne název i sídlo', r1.length === 2, r1.map(x => x.klic).join(','));
test('IČO, které už sedí, se v seznamu neopakuje', r1.every(x => x.klic !== 'ico'));
test('u každé změny je vidět, co tam je teď', r1.every(x => 'ted' in x && 'nove' in x));
test('kontaktní osoba mezi změnami není – rejstřík ji nevede',
  ARES_POLE.every(p => p.klic !== 'kontakt'));

const jina = { objednatel: 'Stará firma a.s.', adresaObjednatele: 'Někde 1', ico: '' };
const r2 = aresRozdily(jina, s);
test('rozdílné údaje se nabídnou všechny tři', r2.length === 3, r2.map(x => x.klic).join(','));
test('u přepisu je vidět původní hodnota',
  r2.find(x => x.klic === 'objednatel').ted === 'Stará firma a.s.');

const bezNazvu = aresZpracuj(Object.assign({}, ODPOVED, { obchodniJmeno: '' }));
test('údaj, který rejstřík nezná, se nenabídne k přepsání',
  aresRozdily(jina, bezNazvu).every(x => x.klic !== 'objednatel'));
test('prázdný subjekt nenabídne nic', aresRozdily(jina, null).length === 0);
test('shodná hlavička nenabídne nic',
  aresRozdily({ objednatel: s.nazev, adresaObjednatele: s.adresa, ico: s.ico }, s).length === 0);

/* ---------- 5) samotný přepis ---------- */
const hl = { objednatel: 'Stará firma a.s.', adresaObjednatele: '', ico: '', kontakt: 'Ing. Nový', cislo: 'CN-7' };
const pocet = aresPrepis(hl, s);
test('přepis změní právě tolik polí, kolik jich bylo v seznamu', pocet === 3, String(pocet));
test('objednatel se přepsal', hl.objednatel === 'Zkušební strojírny s.r.o.');
test('sídlo se doplnilo', hl.adresaObjednatele === 'Vlárská 22/3, Černovice, 618 00 Brno');
test('IČO se doplnilo', hl.ico === '25596641');
test('kontaktní osoba zůstala nedotčená', hl.kontakt === 'Ing. Nový');
test('číslo nabídky zůstalo nedotčené', hl.cislo === 'CN-7');
test('druhý přepis už nemá co měnit', aresPrepis(hl, s) === 0);

const hl2 = { objednatel: 'Ručně napsaný odběratel', adresaObjednatele: 'Ručně 5', ico: '' };
aresPrepis(hl2, bezNazvu);
test('prázdný údaj z rejstříku nevygumuje ručně vyplněné pole',
  hl2.objednatel === 'Ručně napsaný odběratel', hl2.objednatel);

/* ---------- 6) hlášky ---------- */
test('hláška u neplatného IČO mluví o kontrolní číslici', /kontrolní číslici/.test(aresHlaska('neplatne')));
test('hláška u prázdného pole pošle uživatele vyplnit IČO', /vyplňte IČO/i.test(aresHlaska('prazdne')));
test('hláška u nenalezeného subjektu obsahuje hledané IČO',
  /25596641/.test(aresHlaska('nenalezeno', '255 966 41')), aresHlaska('nenalezeno', '255 966 41'));
test('hláška u výpadku sítě říká, že se hlavička nemění',
  /nemění|beze změny/.test(aresHlaska('sit')), aresHlaska('sit'));
test('každá hláška nabídne ruční cestu',
  ['neplatne', 'prazdne', 'nenalezeno', 'sit', 'jina'].every(k => aresHlaska(k).length > 30));

/* ---------- 7) modul je v sestavení ---------- */
const fs = require('fs');
const BUILD = fs.readFileSync(__dirname + '/../build.py', 'utf8');
test('ares.js je v seznamu souborů aplikace', /ares\.js/.test(BUILD));
test('obsluha ARES je v seznamu UI souborů', /ares_ui\.js/.test(BUILD));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
