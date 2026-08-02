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

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
