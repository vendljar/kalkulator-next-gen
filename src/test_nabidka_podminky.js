/* Smluvní a platební podmínky pod souhrnem cenové nabídky (5. 8. 2026).
 *
 * Zadání: „Přidej do souhrnu cenových nabídek OCK i PROJ pod Celkem s DPH
 * smluvní a platební podmínky. A provaž je s odpovídajícími krycími listy.
 * Tzn. cokoliv se v nich změní vzájemně se propíše. OCK do OCK a PROJ do PROJ."
 *
 * Klíčové rozhodnutí, které tahle sada hlídá: NIC SE NESYNCHRONIZUJE.
 * Souhrn nabídky i krycí list vykreslují TYTÉŽ řádky z jedné konstanty
 * (KRYCI_SEKCE / KRYCI_PROJ_SEKCE) a zapisují do TÉHOŽ úložiště ve variantě
 * (data.kryci.hodnoty / data.kryciProj.hodnoty). Dvě kopie hodnot, které by
 * se mohly rozejít, tedy vůbec nevzniknou. Testy proto ověřují:
 *   1) seznam sekcí pro nabídku odkazuje na sekce, které opravdu existují
 *      (přejmenování sekce v krycím listu by jinak nabídku tiše vyprázdnilo),
 *   2) v těchto sekcích nejsou pole hlavičky (bind) – ta patří do karty Zakázka,
 *   3) zápis se projeví na obou stranách, protože úložiště je jedno,
 *   4) OCK a PROJ jsou oddělené – zápis do OCK se do PROJ nepropíše a naopak.
 */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
global.vypocetProj = ep.vypocetProj;
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
const docx = require('./docxgen.js');
global.docxVyplnSablonu = docx.docxVyplnSablonu; global.docxDokumentBlob = docx.docxDokumentBlob;
const dokM = require('./dokumenty.js');
global.dokumentRegistruj = dokM.dokumentRegistruj;
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const kr = require('./kryci.js');
global.KRYCI_SEKCE = kr.KRYCI_SEKCE; global.kryciCtx = kr.kryciCtx; global.kryciData = kr.kryciData;
const krp = require('./kryci_proj.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9100'; zak.objednatel = 'Vzorový odběratel s.r.o.';
zak.nazevAkce = 'Vestavba OCK + projekce';
const v = zak.varianty[0];
if (!v.data.kryci) v.data.kryci = { hodnoty: {} };
if (!v.data.kryciProj) v.data.kryciProj = { hodnoty: {} };

/* ---------- 1) seznam sekcí pro nabídku ukazuje na existující sekce ---------- */
const nazvyOck = kr.KRYCI_SEKCE.map(s => s.sekce);
const nazvyProj = krp.KRYCI_PROJ_SEKCE.map(s => s.sekce);

test('kryci.js vyváží KRYCI_NABIDKA_SEKCE', Array.isArray(kr.KRYCI_NABIDKA_SEKCE));
test('kryci_proj.js vyváží KRYCI_PROJ_NABIDKA_SEKCE', Array.isArray(krp.KRYCI_PROJ_NABIDKA_SEKCE));
test('sekce nabídky OCK existují i v krycím listu OCK',
  (kr.KRYCI_NABIDKA_SEKCE || []).every(s => nazvyOck.includes(s)),
  JSON.stringify(kr.KRYCI_NABIDKA_SEKCE) + ' vs ' + JSON.stringify(nazvyOck));
test('sekce nabídky PROJ existují i v krycím listu PROJ',
  (krp.KRYCI_PROJ_NABIDKA_SEKCE || []).every(s => nazvyProj.includes(s)),
  JSON.stringify(krp.KRYCI_PROJ_NABIDKA_SEKCE) + ' vs ' + JSON.stringify(nazvyProj));
test('nabídka OCK zahrnuje platební podmínky',
  (kr.KRYCI_NABIDKA_SEKCE || []).includes('Platební podmínky'));
test('nabídka PROJ zahrnuje platební podmínky',
  (krp.KRYCI_PROJ_NABIDKA_SEKCE || []).includes('Platební podmínky'));
test('nabídka OCK zahrnuje i smluvní část (typ smlouvy)',
  (kr.KRYCI_NABIDKA_SEKCE || []).some(s => /smlouv/i.test(s)), JSON.stringify(kr.KRYCI_NABIDKA_SEKCE));
test('nabídka PROJ zahrnuje i smluvní část (typ smlouvy)',
  (krp.KRYCI_PROJ_NABIDKA_SEKCE || []).some(s => /smlouv/i.test(s)), JSON.stringify(krp.KRYCI_PROJ_NABIDKA_SEKCE));

/* ---------- 2) žádná pole hlavičky (bind) v podmínkách ---------- */
const poleOck = kr.KRYCI_SEKCE.filter(s => (kr.KRYCI_NABIDKA_SEKCE || []).includes(s.sekce)).flatMap(s => s.pole);
const poleProj = krp.KRYCI_PROJ_SEKCE.filter(s => (krp.KRYCI_PROJ_NABIDKA_SEKCE || []).includes(s.sekce)).flatMap(s => s.pole);
test('podmínky OCK neobsahují pole hlavičky (bind)', poleOck.every(p => !p.bind),
  poleOck.filter(p => p.bind).map(p => p.id).join(','));
test('podmínky PROJ neobsahují pole hlavičky (bind)', poleProj.every(p => !p.bind),
  poleProj.filter(p => p.bind).map(p => p.id).join(','));
test('podmínky OCK nesou splatnost i sazbu DPH',
  poleOck.some(p => p.id === 'splatnostDni') && poleOck.some(p => p.id === 'sazbaDph'));
test('podmínky PROJ nesou splatnost i sazbu DPH',
  poleProj.some(p => p.id === 'splatnostDni') && poleProj.some(p => p.id === 'sazbaDph'));
test('podmínky OCK nesou smluvní pokuty', poleOck.some(p => /^pokuta/.test(p.id)));
test('podmínky PROJ nesou smluvní pokuty', poleProj.some(p => /^pokuta/.test(p.id)));

/* ---------- 3) jedno úložiště = propsání oběma směry ---------- */
const cOck = kr.kryciCtx(zak, v, JEKLY);
const polSplat = poleOck.find(p => p.id === 'splatnostDni');
test('bez ručního zápisu čte splatnost OCK předvyplněnou hodnotu',
  kr.kryciHodnota(polSplat, v.data.kryci, cOck) === '14', kr.kryciHodnota(polSplat, v.data.kryci, cOck));

/* zápis „ze souhrnu nabídky" – tj. přesně to, co dělá klSet() v UI */
v.data.kryci.hodnoty.splatnostDni = '30';
test('zápis se čte i z pohledu krycího listu OCK (jedno úložiště)',
  kr.kryciHodnota(polSplat, v.data.kryci, cOck) === '30', kr.kryciHodnota(polSplat, v.data.kryci, cOck));
test('zápis přežije v datech varianty (uloží se do zakázky)',
  JSON.parse(JSON.stringify(zak)).varianty[0].data.kryci.hodnoty.splatnostDni === '30');

const cProj = krp.kryciProjCtx(zak, v);
const polSplatP = poleProj.find(p => p.id === 'splatnostDni');
test('splatnost PROJ zůstala na svém (OCK se do PROJ nepropsalo)',
  krp.kryciProjHodnota(polSplatP, v.data.kryciProj, cProj) !== '30',
  krp.kryciProjHodnota(polSplatP, v.data.kryciProj, cProj));

v.data.kryciProj.hodnoty.splatnostDni = '45';
test('zápis PROJ se čte z pohledu krycího listu PROJ',
  krp.kryciProjHodnota(polSplatP, v.data.kryciProj, cProj) === '45');
test('zápis PROJ nezměnil OCK', kr.kryciHodnota(polSplat, v.data.kryci, cOck) === '30');

/* ---------- 4) prázdná hodnota = návrat k automatice (tlačítko ↺) ---------- */
delete v.data.kryci.hodnoty.splatnostDni;
test('po ↺ se OCK vrátí k předvyplněné hodnotě',
  kr.kryciHodnota(polSplat, v.data.kryci, cOck) === '14');

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
