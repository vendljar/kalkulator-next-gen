/* Test: úvodní fotka cenové nabídky OCK v datovém modelu zakázky.
 * Fotka se ukládá jako data URL přímo do zakázky, aby se přenesla se souborem. */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./engine.js'); nacti('./engine_proj.js'); nacti('./techspec.js'); nacti('./zakazka.js');

let fails = 0, passes = 0;
function test(name, cond, info) {
  if (cond) { passes++; console.log('  ok  ' + name); }
  else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
}

// ---- nová zakázka má pole úvodní fotky, ale prázdná -------------------------
const z = novaZakazka();
['uvodniFoto', 'uvodniFotoNazev', 'uvodniFotoPopis'].forEach(k =>
  test('nová zakázka má pole ' + k, z[k] === '', z[k]));

// ---- fotka přežije export i import (uloží se do souboru zakázky) ------------
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
z.uvodniFoto = DATA_URL;
z.uvodniFotoNazev = 'dum.png';
z.uvodniFotoPopis = 'Bytový dům Dlouhá 12, stávající stav';

const kolo = importZakazka(JSON.parse(JSON.stringify(z)));
test('fotka přežije uložení a načtení zakázky', kolo.uvodniFoto === DATA_URL, kolo.uvodniFoto);
test('název souboru fotky přežije', kolo.uvodniFotoNazev === 'dum.png', kolo.uvodniFotoNazev);
test('popisek fotky přežije', kolo.uvodniFotoPopis === z.uvodniFotoPopis, kolo.uvodniFotoPopis);

// ---- fotka je na zakázce, ne na variantě: platí pro všechny varianty --------
test('fotka není uložená ve variantě', kolo.varianty.every(v => v.data.uvodniFoto === undefined));

// ---- migrace staré zakázky bez fotky ---------------------------------------
const stara = novaZakazka();
delete stara.uvodniFoto; delete stara.uvodniFotoNazev; delete stara.uvodniFotoPopis;
const m = importZakazka(JSON.parse(JSON.stringify(stara)));
['uvodniFoto', 'uvodniFotoNazev', 'uvodniFotoPopis'].forEach(k =>
  test('migrace doplní prázdné pole ' + k, m[k] === '', m[k]));

// ---- nabídka OCK se bez fotky vypočítá stejně (fotka do cen nezasahuje) -----
const bezFoto = novaZakazka();
const sFoto = novaZakazka();
sFoto.uvodniFoto = DATA_URL;
const nd = require('./nabidka.js');
Object.keys(nd).forEach(k => { global[k] = nd[k]; });
nacti('./firma.js'); nacti('./sleva.js'); nacti('./preklad.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));
const a = nabidkaData(bezFoto, bezFoto.varianty[0], JEKLY);
const b = nabidkaData(sFoto, sFoto.varianty[0], JEKLY);
test('úvodní fotka nemění cenu nabídky', a.placeholders.CENA_S_DPH === b.placeholders.CENA_S_DPH,
  [a.placeholders.CENA_S_DPH, b.placeholders.CENA_S_DPH]);

// ---- patička a logo se berou z firemních údajů (společné pro OCK i PROJ) ----
test('firmaPaticka() vrací neprázdný text z výchozích údajů', !!firmaPaticka(firmaDefault()));
/* Patička začíná názvem firmy – jakým, to je věc firemních údajů (v repozitáři
 * ukázkových, ve složce _DB skutečných), ne testu. */
test('patička začíná názvem firmy',
  firmaPaticka(firmaDefault()).indexOf(firmaDefault().nazev) === 0,
  firmaPaticka(firmaDefault()));


/* ============================================================
 * ÚVODNÍ FOTKA DO WORDU (11. 8. 2026)
 *
 * Do 11. 8. 2026 se fotka ukazovala jen v online náhledu nabídky. Ve Wordu
 * byla na titulní straně natvrdo vložená fotografie JEDNÉ KONKRÉTNÍ STAVBY
 * ze šablony — takže každá nabídka odcházela zákazníkovi s cizím objektem.
 *
 * Nově jde fotka do dokumentu jako obrázek pod symbolem {{UVODNI_FOTO}}
 * (stejným způsobem jako sken podpisu) a k němu dva textové symboly.
 * ============================================================ */

const zakF = novaZakazka();
test('bez nahrané fotky se do dokumentu nepošle žádný obrázek',
  Object.keys(uvodniFotoObrazky(zakF)).length === 0);
/* Prázdno je tu podstatné: docxgen podle něj tvar ze šablony ODSTRANÍ.
 * Nabídka bez fotky je lepší než nabídka s fotkou cizí stavby. */
test('a symboly popisku jsou prázdné, ne „undefined"',
  uvodniFotoSymboly(zakF).UVODNI_FOTO_POPIS === ''
  && uvodniFotoSymboly(zakF).UVODNI_FOTO_NAZEV === '');

zakF.uvodniFoto = 'data:image/png;base64,iVBORw0KGgo=';
zakF.uvodniFotoNazev = 'stavba-sever.png';
zakF.uvodniFotoPopis = 'Pohled na objekt z ulice';
test('nahraná fotka jde do dokumentu pod symbolem UVODNI_FOTO',
  uvodniFotoObrazky(zakF).UVODNI_FOTO === zakF.uvodniFoto);
test('popisek a název jdou do dokumentu jako textové symboly',
  uvodniFotoSymboly(zakF).UVODNI_FOTO_POPIS === 'Pohled na objekt z ulice'
  && uvodniFotoSymboly(zakF).UVODNI_FOTO_NAZEV === 'stavba-sever.png');
/* Fotka se předává přesně tak, jak ji prohlížeč vyrobil — žádné překódování.
 * Kdyby se cestou měnila, rozešel by se náhled na obrazovce s dokumentem. */
test('fotka se cestou nepřekódovává',
  uvodniFotoObrazky(zakF).UVODNI_FOTO.indexOf('data:image/png;base64,') === 0);
test('prázdný řetězec se chová jako nenahraná fotka',
  Object.keys(uvodniFotoObrazky({ uvodniFoto: '' })).length === 0);
test('chybějící zakázka funkce neshodí',
  Object.keys(uvodniFotoObrazky(null)).length === 0
  && uvodniFotoSymboly(null).UVODNI_FOTO_POPIS === '');

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
