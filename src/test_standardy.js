/* Smluvní standardy firmy a výběr sazby smluvní pokuty (10. 8. 2026).
 *
 * PROČ TAHLE SADA VZNIKLA
 *
 * Do 10. 8. 2026 stály tři věty — platnost nabídky, způsob fakturace a čím je
 * definován rozsah díla — natvrdo v kódu jako výchozí hodnota krycího listu.
 * Obchodník je viděl v každé zakázce jako pole k přepsání, přestože to nejsou
 * údaje zakázky, ale firemní standard: mění se jednou za rok a pro všechny
 * naráz. Přesunuly se proto do Nastavení → Firma.
 *
 * Zároveň se smluvní pokuta změnila z volného pole na výběr. Volné pole
 * svádělo k překlepu, který se propsal do nabídky i do krycího listu — a
 * pokuta je jediný údaj v podmínkách, který se v případě sporu čte doslova.
 * Předvyplněná je nově NULA, tedy bez pokuty; do té doby tu stálo
 * 0,05 % / den a sjednávalo se to i tam, kde to nikdo nechtěl.
 *
 * Sada hlídá tři věci, které se dají snadno rozbít zpátky:
 *   1. že se ty tři věty opravdu berou z firemního nastavení a ne z kódu,
 *   2. že náhradní hodnota funguje pro starší konfigurace bez těch polí,
 *   3. že se číselník pokut v OCK a v PROJ nerozešel na dva různé seznamy.
 */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
Object.keys(ep).forEach(k => { global[k] = ep[k]; });
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
global.projHlavicka = zk.projHlavicka;
global.projHlavickaEfektivni = zk.projHlavickaEfektivni;
global.projHlavickaZOck = zk.projHlavickaZOck;
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const kr = require('./kryci.js');
Object.keys(kr).forEach(k => { global[k] = kr[k]; });
const krp = require('./kryci_proj.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const polePodle = (sekce) => [].concat(...sekce.map(s => s.pole));
const najdi = (sekce, id) => polePodle(sekce).find(p => p.id === id);

/* ============================================================
 * 1) Firemní nastavení
 * ============================================================ */

const STANDARDY = ['platnostNabidky', 'zpusobFakturaceOck', 'zpusobFakturaceProj', 'rozsahDefinice'];

test('sekce Smluvní standardy je mezi sekcemi firmy',
  fm.FIRMA_SEKCE.includes('Smluvní standardy'));
STANDARDY.forEach((id) => {
  const p = fm.firmaPole(id);
  test('firemní pole ' + id + ' existuje a patří do Smluvních standardů',
    !!p && p.sekce === 'Smluvní standardy', p && p.sekce);
});
/* Bez symbolu by se standardy nedaly dostat do šablony nabídky. */
test('každý standard má zástupný symbol do šablony',
  STANDARDY.every(id => !!(fm.firmaPole(id) || {}).symbol));
test('výchozí firma má standardy vyplněné',
  STANDARDY.every(id => fm.firmaHodnota(fm.firmaDefault(), id) !== ''),
  STANDARDY.filter(id => fm.firmaHodnota(fm.firmaDefault(), id) === '').join(','));
/* Kontrola úplnosti firemních údajů se týká fakturačních náležitostí —
 * smluvní standardy povinné být nesmí, jinak by prázdné pole blokovalo
 * zveřejnění firmy. */
test('standardy nejsou povinné pole',
  STANDARDY.every(id => !(fm.firmaPole(id) || {}).povinne));

/* ============================================================
 * 2) Krycí list bere standardy z firmy, ne z kódu
 * ============================================================ */

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9101';
zak.nazevAkce = 'Zkušební vestavba';
const v = zak.varianty[0];

function ctx(firma) {
  const c = kr.kryciCtx(zak, v, JEKLY);
  c.firma = firma;
  return c;
}
function hodnota(sekce, id, firma) {
  const p = najdi(sekce, id);
  return p && typeof p.prefill === 'function' ? String(p.prefill(ctx(firma))) : null;
}

const VLASTNI = {
  platnostNabidky: '45 dnů',
  zpusobFakturaceOck: 'po etapách dle harmonogramu',
  zpusobFakturaceProj: 'po odevzdání každého stupně',
  rozsahDefinice: 'je dán technickou specifikací v příloze č. 2',
};

test('OCK: platnost nabídky přijde z firemního nastavení',
  hodnota(kr.KRYCI_SEKCE, 'platnostNabidky', VLASTNI) === '45 dnů',
  hodnota(kr.KRYCI_SEKCE, 'platnostNabidky', VLASTNI));
test('OCK: způsob fakturace přijde z firemního nastavení',
  hodnota(kr.KRYCI_SEKCE, 'zpusobFakturace', VLASTNI) === 'po etapách dle harmonogramu');
test('OCK: rozsah přijde z firemního nastavení',
  hodnota(kr.KRYCI_SEKCE, 'rozsah', VLASTNI) === 'je dán technickou specifikací v příloze č. 2');
test('OCK: u všech tří je vidět, že hodnota je z Nastavení → Firma',
  ['platnostNabidky', 'zpusobFakturace', 'rozsah']
    .every(id => najdi(kr.KRYCI_SEKCE, id).src === 'Nastavení → Firma'));

/* Starší konfigurace ta pole nemá. Krycí list nesmí zůstat prázdný —
 * dokud se firma nedoplní, platí dosavadní znění. */
test('OCK: prázdné firemní pole spadne na dosavadní znění',
  hodnota(kr.KRYCI_SEKCE, 'platnostNabidky', {}) === '2 měsíce',
  hodnota(kr.KRYCI_SEKCE, 'platnostNabidky', {}));
test('OCK: prázdný způsob fakturace spadne na dosavadní znění',
  hodnota(kr.KRYCI_SEKCE, 'zpusobFakturace', {}) === 'Náš standard / měsíční');
test('OCK: prázdný rozsah spadne na dosavadní znění',
  hodnota(kr.KRYCI_SEKCE, 'rozsah', {}).indexOf('přílohou ke smlouvě') >= 0);

function ctxProj(firma) {
  const c = krp.kryciProjCtx(zak, v);
  c.firma = firma;
  return c;
}
function hodnotaProj(id, firma) {
  const p = najdi(krp.KRYCI_PROJ_SEKCE, id);
  return p && typeof p.prefill === 'function' ? String(p.prefill(ctxProj(firma))) : null;
}

test('PROJ: platnost nabídky přijde z firemního nastavení',
  hodnotaProj('platnostNabidky', VLASTNI) === '45 dnů', hodnotaProj('platnostNabidky', VLASTNI));
test('PROJ: způsob fakturace přijde z firemního nastavení',
  hodnotaProj('zpusobFakturace', VLASTNI) === 'po odevzdání každého stupně');
/* Zdroj musí být JEDEN. Kdyby OCK bralo platnost z firmy a PROJ z ceníku,
 * mohla by jedna zakázka nabídnout dvě různé platnosti téže nabídky. */
test('PROJ: platnost nabídky se bere ze stejného místa jako u OCK',
  najdi(krp.KRYCI_PROJ_SEKCE, 'platnostNabidky').src === 'Nastavení → Firma');
test('PROJ: bez firemního pole zůstává náhrada z ceníku projekce',
  /měsíce$/.test(hodnotaProj('platnostNabidky', {})), hodnotaProj('platnostNabidky', {}));

/* ============================================================
 * 3) Smluvní pokuta jako výběr
 * ============================================================ */

const POKUTY_OCK = ['pokutaDodavka', 'pokutaSplatnost'];
const POKUTY_PROJ = ['pokutaTermin', 'pokutaSplatnost'];

test('číselník pokut má tři sazby a začíná nulou',
  kr.KRYCI_POKUTY.length === 3 && kr.KRYCI_POKUTY[0] === '0', kr.KRYCI_POKUTY.join(' | '));
test('číselník obsahuje oba dosavadní standardy',
  kr.KRYCI_POKUTY.includes('0,05 % / den') && kr.KRYCI_POKUTY.includes('0,1 % / den'));
/* Číselník je v kryci.js; kryci_proj.js si v Node testech drží náhradní kopii.
 * Kdyby se ty dva seznamy rozešly, nabízela by projekce jiné sazby než OCK
 * a nikdo by si toho nevšiml — tahle kontrola je jediné místo, kde se to pozná. */
test('OCK a PROJ nabízejí tytéž sazby (seznamy se nerozešly)',
  JSON.stringify(kr.KRYCI_POKUTY) === JSON.stringify(krp.KRYCI_POKUTY_SAZBY),
  JSON.stringify(krp.KRYCI_POKUTY_SAZBY));

/* Výchozí sazba se u obou pokut liší a je to záměr (12. 8. 2026):
 *   prodlení DODÁVKY  → 0, tedy bez pokuty. Prodlení způsobíme my a sjednávat
 *                       si sankci sami na sebe má být vědomé rozhodnutí.
 *   prodlení SPLATNOSTI → 0,05 % / den. To je jediné prodlení, které
 *                       nezpůsobíme my, a bez sankce na pozdní platbu nemáme
 *                       žádnou páku.
 * Kdyby se to prohodilo, odcházely by nabídky s pokutou proti nám a bez
 * pokuty proti zákazníkovi — proto se hlídá každá zvlášť, ne obě jedním
 * cyklem. */
const VYCHOZI_POKUTA = { pokutaDodavka: '0', pokutaSplatnost: '0,05 % / den',
                         pokutaTermin: '0' };
POKUTY_OCK.forEach((id) => {
  const p = najdi(kr.KRYCI_SEKCE, id);
  test('OCK: ' + id + ' je výběr, ne volné pole', p.typ === 'vyber', p.typ);
  test('OCK: ' + id + ' nabízí celý číselník',
    JSON.stringify(p.o) === JSON.stringify(kr.KRYCI_POKUTY));
  test('OCK: ' + id + ' má správnou výchozí sazbu (' + VYCHOZI_POKUTA[id] + ')',
    p.prefill(ctx(VLASTNI)) === VYCHOZI_POKUTA[id], p.prefill(ctx(VLASTNI)));
});
POKUTY_PROJ.forEach((id) => {
  const p = najdi(krp.KRYCI_PROJ_SEKCE, id);
  test('PROJ: ' + id + ' je výběr, ne volné pole', p.typ === 'vyber', p.typ);
  test('PROJ: ' + id + ' má správnou výchozí sazbu (' + VYCHOZI_POKUTA[id] + ')',
    p.prefill(ctxProj(VLASTNI)) === VYCHOZI_POKUTA[id], p.prefill(ctxProj(VLASTNI)));
});

/* ============================================================
 * 3b) Záloha a limit pokut jako rolovací seznam (12. 8. 2026)
 * ============================================================
 *
 * Obojí bývalo volné pole (u projekce trojice přepínačů). Zadání J. V.:
 * záloha z rolovacího seznamu s možností 70 % a vlastní volby, limit pokut
 * také seznamem, protože „UPLATNĚN" a „NEUPLATNĚN" se od sebe liší jedním
 * slovem a znamenají opak. */
{
  const zalohaOck = najdi(kr.KRYCI_SEKCE, 'zaloha1');
  const zalohaProj = najdi(krp.KRYCI_PROJ_SEKCE, 'zaloha');
  test('OCK: záloha je rolovací seznam', zalohaOck.typ === 'vyber', zalohaOck.typ);
  test('PROJ: záloha je rolovací seznam', zalohaProj.typ === 'vyber', zalohaProj.typ);
  test('OCK: záloha nabízí i sedmdesát procent',
    zalohaOck.o.some(x => /70/.test(x)), zalohaOck.o.join(' | '));
  test('PROJ: záloha nabízí i sedmdesát procent',
    zalohaProj.o.some(x => /70/.test(x)), zalohaProj.o.join(' | '));
  test('OCK: záloha nabízí i variantu bez zálohy',
    zalohaOck.o.some(x => /bez zálohy/i.test(x)));
  test('PROJ: záloha nabízí i variantu bez zálohy',
    zalohaProj.o.some(x => /bez zálohy/i.test(x)));
  test('OCK: výchozí záloha je padesát procent',
    /50/.test(zalohaOck.prefill(ctx(VLASTNI))), zalohaOck.prefill(ctx(VLASTNI)));
  test('PROJ: výchozí záloha je padesát procent',
    /50/.test(zalohaProj.prefill(ctxProj(VLASTNI))), zalohaProj.prefill(ctxProj(VLASTNI)));
  /* U výtahové šachty nese volba i milník — v podmínkách nestačí procento,
   * musí být jasné, kdy se fakturuje. U projekce se fakturuje po stupních
   * dokumentace, tam by věta u zálohy mátla. */
  test('OCK: volba zálohy nese i milník, ke kterému se váže',
    /po podpisu/i.test(zalohaOck.prefill(ctx(VLASTNI))), zalohaOck.prefill(ctx(VLASTNI)));

  const limitOck = najdi(kr.KRYCI_SEKCE, 'pokutaLimit');
  const limitProj = najdi(krp.KRYCI_PROJ_SEKCE, 'pokutaLimit');
  test('OCK: limit pokut je rolovací seznam', limitOck.typ === 'vyber', limitOck.typ);
  test('PROJ: limit pokut je rolovací seznam', limitProj.typ === 'vyber', limitProj.typ);
  test('OCK a PROJ nabízejí u limitu pokut totéž',
    JSON.stringify(limitOck.o) === JSON.stringify(limitProj.o), JSON.stringify(limitProj.o));
  test('limit pokut nabízí obě znění, uplatněný i neuplatněný',
    limitOck.o.some(x => /^Uplatněn/.test(x)) && limitOck.o.some(x => /^NEUPLATNĚN/.test(x)),
    limitOck.o.join(' | '));
  test('OCK: výchozí je UPLATNĚNÝ limit',
    /^Uplatněn/.test(limitOck.prefill(ctx(VLASTNI))), limitOck.prefill(ctx(VLASTNI)));
  test('PROJ: výchozí je UPLATNĚNÝ limit',
    /^Uplatněn/.test(limitProj.prefill(ctxProj(VLASTNI))), limitProj.prefill(ctxProj(VLASTNI)));
}

/* Ruční hodnota mimo číselník musí projít — zákazník si občas prosadí
 * jinou sazbu a nabídka na to musí umět odpovědět. */
const klRucne = { hodnoty: { pokutaDodavka: '0,2 % / den, nejvýše 5 % z ceny díla' } };
test('vlastní znění pokuty se do krycího listu dostane',
  kr.kryciHodnota(najdi(kr.KRYCI_SEKCE, 'pokutaDodavka'), klRucne, ctx(VLASTNI))
    === '0,2 % / den, nejvýše 5 % z ceny díla');

/* ============================================================
 * 4) Průchod do hotového dokumentu
 * ============================================================ */

global.NAST = { firma: Object.assign(fm.firmaDefault(), VLASTNI) };
const data = kr.kryciData(zak, v, JEKLY, 'bo');
const radky = [].concat(...data.sekce.map(s => s.radky));
const najdiRadek = (label) => (radky.find(r => r[0] === label) || [])[1];

test('do krycího listu se propíše firemní platnost nabídky',
  najdiRadek('Platnost nabídky') === '45 dnů', najdiRadek('Platnost nabídky'));
test('do krycího listu se propíše firemní způsob fakturace',
  najdiRadek('Způsob fakturace') === 'po etapách dle harmonogramu');
test('do krycího listu se propíše firemní rozsah',
  najdiRadek('Rozsah') === 'je dán technickou specifikací v příloze č. 2');
test('do krycího listu se propíše nulová pokuta za prodlení dodávky',
  najdiRadek('Smluvní pokuta – prodlení dodávky') === '0',
  najdiRadek('Smluvní pokuta – prodlení dodávky'));
test('do krycího listu se propíše pokuta za prodlení splatnosti',
  najdiRadek('Smluvní pokuta – prodlení splatnosti') === '0,05 % / den',
  najdiRadek('Smluvní pokuta – prodlení splatnosti'));

/* Symboly do šablony nabídky — bez nich by se standardy do Wordu nedostaly. */
const sym = fm.firmaSymboly();
test('symboly firmy nesou i smluvní standardy',
  sym.includes('FIRMA_PLATNOST_NABIDKY') && sym.includes('FIRMA_ROZSAH')
  && sym.includes('FIRMA_FAKTURACE_OCK') && sym.includes('FIRMA_FAKTURACE_PROJ'));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
