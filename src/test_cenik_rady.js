/* Test řad ceníku OCK — tuzemsko a zahraničí (#181, 31. 8. 2026).
 *
 * Co se hlídá:
 *   – zahraniční ceník je TABULKA ODCHYLEK: co v něm není, platí z tuzemské,
 *   – přepnutí mění jen ceníkové ceny, ne ruční přepisy ani přirážku,
 *   – položka „jen pro zahraničí" se v tuzemské kalkulaci NEZOBRAZÍ,
 *   – razítko varianty nese řadu, aby šlo po roce doložit, z čeho se počítalo,
 *   – očista odmítne cizí klíče (databáze programu chodí i ze souboru).
 */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./format.js'); nacti('./cenik.js'); nacti('./cenik_stari.js'); nacti('./cenik_rady.js');
const eng = require('./engine.js');
Object.keys(eng).forEach(k => { global[k] = eng[k]; });
const ZC = require('./zkusebni_cenik.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const CR = () => ZC.zkusebniCenik();
const ZAHR = () => ({
  ceny: { 'C.montazHodKc': 1000, 'C.powertechInt': 250, 'C.prekladyKc': 15000, 'C.cestovniKc': 120000 },
  jenZahr: { 'C.prekladyKc': true, 'C.cestovniKc': true },
});

/* ---------- složení řady ---------- */
{
  const cr = CR();
  const slozeny = cenikSlozRadu(cr, ZAHR(), 'zahr');
  test('zahraniční řada přepsala jen své cesty',
    slozeny.montazHodKc === 1000 && slozeny.powertechInt === 250);
  test('co v odchylkách není, zůstalo tuzemské',
    slozeny.profilasKgKc === cr.profilasKgKc, slozeny.profilasKgKc);
  test('složený ceník nese řadu i značky', slozeny.rada === 'zahr' && slozeny.jenZahr['C.prekladyKc']);
  test('tuzemská řada odchylky nebere',
    cenikSlozRadu(cr, ZAHR(), 'cr').montazHodKc === cr.montazHodKc);
  test('složení je kopie — původní ceník se nezměnil', cr.montazHodKc !== 1000);
  test('neznámá řada je tuzemská', cenikRadaPlatna('nesmysl') === 'cr' && cenikRadaPlatna() === 'cr');
}

/* ---------- očista ---------- */
{
  const spinave = cenikZahrOciste({
    ceny: { 'C.montazHodKc': 1000, 'X.podvrh': 999, 'C.profilasKgKc': 'abc' },
    jenZahr: { 'C.cestovniKc': true, 'Y.cizi': true },
  });
  test('cizí cesta se do odchylek nedostane', spinave.ceny['X.podvrh'] === undefined);
  test('známá cesta projde', spinave.ceny['C.montazHodKc'] === 1000);
  test('cizí značka se zahodí', spinave.jenZahr['Y.cizi'] === undefined
    && spinave.jenZahr['C.cestovniKc'] === true);
  test('prázdný vstup dá prázdné odchylky', cenikZahrPrazdna(cenikZahrOciste(null)));
}

/* ---------- rozdíly a přepnutí varianty ---------- */
{
  const cr = CR();
  const rozdily = cenikRadaRozdily(cr, ZAHR());
  test('rozdíly vypíšou všechny odchylky', rozdily.length === 4, rozdily.length);
  test('rozdíl zná tuzemskou i zahraniční cenu', (() => {
    const r = rozdily.find(x => x.cesta === 'C.montazHodKc');
    return r && r.zahr === 1000 && r.cr === cr.montazHodKc;
  })());

  const data = { cenik: CR(), cenikRada: 'cr' };
  const puvodniMarze = data.cenik.marze;
  const v = cenikRadaPrepni(data, cr, ZAHR(), 'zahr');
  test('přepnutí zapsalo řadu', data.cenikRada === 'zahr' && cenikRadaVarianty(data) === 'zahr');
  test('přepnutí změnilo ceníkové ceny', data.cenik.montazHodKc === 1000 && v.zmen >= 3, v.zmen);
  test('globální přirážka se přepnutím nemění', data.cenik.marze === puvodniMarze);
  test('ceník varianty nese značky jen pro zahraničí', !!data.cenik.jenZahr['C.cestovniKc']);

  /* zpátky do tuzemska */
  const v2 = cenikRadaPrepni(data, cr, ZAHR(), 'cr');
  test('návrat vrátí tuzemské ceny', data.cenik.montazHodKc === cr.montazHodKc, data.cenik.montazHodKc);
  test('návrat zapsal řadu zpět', cenikRadaVarianty(data) === 'cr' && v2.zmen >= 3);
}

/* ---------- položky jen pro zahraničí ve výpočtu ---------- */
{
  const zadani = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
  const crCenik = cenikSlozRadu(CR(), ZAHR(), 'cr');
  const zahrCenik = cenikSlozRadu(CR(), ZAHR(), 'zahr');
  const nazvy = r => r.sekce.rezie.map(x => String(x.origNazev || x.nazev));

  const rCr = vypocet(zadani, crCenik, JEKLY, false);
  const rZahr = vypocet(zadani, zahrCenik, JEKLY, false);
  test('v tuzemské kalkulaci překlady vůbec nejsou',
    !nazvy(rCr).some(n => /PŘEKLADY/.test(n)), nazvy(rCr).join(' | '));
  test('v zahraniční kalkulaci překlady jsou',
    nazvy(rZahr).some(n => /PŘEKLADY/.test(n)), nazvy(rZahr).join(' | '));
  test('zahraniční kalkulace je dražší', rZahr.souhrn.zakladCena > rCr.souhrn.zakladCena,
    Math.round(rZahr.souhrn.zakladCena) + ' × ' + Math.round(rCr.souhrn.zakladCena));
  test('bez značek se nic neskrývá', (() => {
    const bezZnacek = cenikSlozRadu(CR(), { ceny: {}, jenZahr: {} }, 'cr');
    return vypocet(zadani, bezZnacek, JEKLY, false).sekce.rezie.length === rZahr.sekce.rezie.length;
  })());
}

/* ---------- razítko nese řadu ---------- */
{
  const data = { cenik: cenikSlozRadu(CR(), ZAHR(), 'zahr'), cenikRada: 'zahr' };
  const r = cenikRazitkoNovy(data, { dnes: '2026-08-31', verze: 4 });
  test('razítko zahraniční varianty nese řadu', r.rada === 'zahr');
  test('a popis se dá vypsat', cenikRazitkoRada(r) === 'zahraniční ceník');
  const rCr = cenikRazitkoNovy({ cenik: CR(), cenikRada: 'cr' }, { dnes: '2026-08-31' });
  test('tuzemské razítko řadu nenese (výchozí stav nepotřebuje štítek)',
    rCr.rada === undefined && cenikRazitkoRada(rCr) === '');
}

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
