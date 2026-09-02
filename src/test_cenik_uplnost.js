/* ÚPLNOST CENÍKU — každá cena má svůj řádek a každý řádek svou cenu
 * (1. 9. 2026, zadání J. V. po kontrole pokrytí ceníku).
 *
 * Proč tahle sada vznikla: v datech zůstal klíč `priplatky.zabranyPadKc`,
 * který neměl řádek v ceníku a žádná kalkulace ho nepoužívala — tichý
 * pozůstatek, na který se přišlo až ruční kontrolou. Cena, kterou nikdo
 * nemůže nastavit, je horší než žádná: v kalkulaci se tváří jako nula
 * (tedy „zdarma"), a nikdo neví proč.
 *
 * Hlídají se tři směry najednou:
 *   1. každá `cenaPath` z jádra má řádek v CENIK_DEF / CENIK_DEF_PROJ,
 *   2. každý cenový klíč v DEFAULT_CENIK / DEFAULT_CENIK_PROJ má řádek
 *      v ceníku — s bílou listinou záměrných výjimek a důvodem u každé,
 *   3. každý řádek ceníku má odpovídající klíč v datech.
 *
 * Sada čte JÁDRO JAKO TEXT (regulárním výrazem hledá cenaPath). Je to
 * schválně: kdyby se procházel jen výsledek výpočtu, viděly by se cesty
 * jen těch řádků, které v konkrétním zadání vznikly — a právě ty vzácné
 * (interiérová šachta, průchozí šachta) by kontrolou propadly.
 */
const fs = require('fs');
const ck = require('./cenik.js');
const eng = require('./engine.js');
const ep = require('./engine_proj.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* ---------- co ceník nabízí ---------- */
const radky = new Set();
[[ck.CENIK_DEF, 'C'], [ck.CENIK_DEF_PROJ, 'PC']].forEach(([def]) =>
  def.forEach(([, items]) => items.forEach(it => radky.add(it[0]))));

/* ---------- co jádro používá ---------- */
const zdroj = fs.readFileSync(__dirname + '/engine.js', 'utf8')
  + fs.readFileSync(__dirname + '/engine_proj.js', 'utf8');
const cesty = new Set();
for (const m of zdroj.matchAll(/cenaPath:\s*'((?:C|PC)\.[A-Za-z0-9_.]+)'/g)) cesty.add(m[1]);
/* Cesty skládané za běhu (`cenaPath: 'C.spojovaci.' + k`) sem nespadnou —
 * jsou to celé skupiny, které bod 3 pokryje z druhé strany. */

test('jádro nabízí aspoň 40 ceníkových cest (dnes 43)', cesty.size >= 40, cesty.size);
{
  const chybi = [...cesty].filter(c => !radky.has(c) && !c.startsWith('Z.'));
  test('každá cena použitá v kalkulaci má řádek v ceníku', chybi.length === 0,
    chybi.join(', '));
}

/* ---------- klíče v datech ---------- */
function klice(obj, prefix, ven) {
  Object.keys(obj || {}).forEach(k => {
    const v = obj[k], cesta = prefix + '.' + k;
    if (v && typeof v === 'object' && !Array.isArray(v)) klice(v, cesta, ven);
    else ven.push(cesta);
  });
  return ven;
}

/* Bílá listina: klíče, které v ceníku ŘÁDEK MÍT NEMAJÍ — a proč.
 * Každá nová výjimka je rozhodnutí, ne úlitba testu. */
const VYJIMKY = {
  /* Pozn.: `rada`, `jenZahr` a `vlastniSeq` se do ceníku přidávají až za běhu
   * (řada ceníku, značky a čítač id), v DEFAULT_CENIK nejsou — proto tu být
   * nemusí. Kdyby se tam někdy dostaly, test to ohlásí a bude to rozhodnutí. */
  'C.dph': 'sazba DPH je zakázková hodnota; v ceníku jsou jen PŘEDVOLBY (C.dphZakladni…)',
  'C.marze': 'globální přirážka má vlastní pole nad tabulkou, ne řádek v tabulce',
  'C.prazdny': 'značka „ceník je prázdný" (ukázková data), ne cena',
  'C.ukazkove': 'značka ukázkových dat, ne cena',
  'PC.dph': 'jako C.dph',
  'PC.marze': 'jako C.marze — vlastní pole nad tabulkou ceníku PROJ',
  'PC.prazdny': 'jako C.prazdny',
  'PC.ukazkove': 'jako C.ukazkove',
  'PC.dopravaPausalKc': 'mrtvý klíč starých uložených ceníků; paušál se od 17. 8. 2026 '
    + 'počítá vzorcem km/60×1000 v engine_proj.js. Editovatelné číslo bez účinku '
    + 'je past, proto řádek nemá — a smazat ho nejde, nesou ho staré ceníky.',
};

const dataKlice = klice(eng.DEFAULT_CENIK, 'C', []).concat(klice(ep.DEFAULT_CENIK_PROJ, 'PC', []));
{
  const chybi = dataKlice.filter(c => !radky.has(c) && !VYJIMKY[c]
    && !/^(C|PC)\.vlastniPolozky\./.test(c));
  test('každý cenový klíč v datech má řádek v ceníku', chybi.length === 0,
    chybi.join(', ') + '  ← buď doplňte řádek do CENIK_DEF, nebo klíč zahoďte '
    + '(migrace na konci engine.js), nebo ho zapište do VYJIMKY i s důvodem');
}
{
  const zbytecne = Object.keys(VYJIMKY).filter(c => radky.has(c) || !dataKlice.includes(c));
  test('bílá listina nenese nic, co už neplatí', zbytecne.length === 0, zbytecne.join(', '));
}
{
  const chybi = [...radky].filter(c => !dataKlice.includes(c));
  test('každý řádek ceníku má klíč v datech', chybi.length === 0, chybi.join(', '));
}

/* ---------- osm příplatků z excelové předlohy (1. 9. 2026) ----------
 * Ráno se `zabranyPadKc` zahazoval jako mrtvý klíč, odpoledne ho J. V. vrátil
 * k životu spolu se sedmi dalšími („zaveď je všechny, tak jak jsou"). Test
 * proto hlídá opak než ráno: že těch osm položek v ceníku JE — a že migrace
 * nikomu nemaže hodnotu, kterou si do nich zadá. */
{
  const osm = ['zabranyPadKc', 'demontazOhrazeniKc', 'malbaSchodnicKc', 'naterOhrazeniKc',
               'naterOkopovychKc', 'prosklenaStenaKc', 'demontazVytahuKc', 'destovySvodKc']
    .map(k => 'C.priplatky.' + k);
  test('osm příplatků z předlohy má řádek v ceníku',
    osm.every(c => radky.has(c)), osm.filter(c => !radky.has(c)).join(', '));
  test('a klíč v datech', osm.every(c => dataKlice.includes(c)),
    osm.filter(c => !dataKlice.includes(c)).join(', '));
  test('migrace jim hodnotu nemaže', (() => {
    const c = { priplatky: { zabranyPadKc: 1234, leseniHlavaFix: 9 } };
    eng.cenikMigraceLeseni(c);
    return c.priplatky.zabranyPadKc === 1234 && c.priplatky.leseniHlavaFix === undefined;
  })());
}

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
