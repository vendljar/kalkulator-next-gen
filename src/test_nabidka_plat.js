/* Platební podmínky a splatnost ze zakázky do šablony nabídky (5. 8. 2026, #147).
 *
 * Zadání: „Navaž v šabloně % platebních podmínek a splatností na informaci
 * z kalkulace sekce smluvní a platební podmínky."
 *
 * Do dneška byla procenta splátek (50 / 40 / zbytek) a splatnost (14 dní)
 * natvrdo napsaná v .docx šabloně. Obchodník je mohl v souhrnu nabídky
 * i v krycím listu přepsat — do dokumentu se to ale nepropsalo a odešla
 * nabídka, která říkala něco jiného než krycí list ke stejné zakázce.
 *
 * Řešení: každé pole sekcí „Typ smlouvy a produktu" a „Platební podmínky"
 * dostane symbol {{PODM_…}}. Symbol nese celý text pole tak, jak ho obchodník
 * vidí; k tomu se odvodí dvě podoby pro místa v šabloně, kde má stát holé
 * číslo (_CISLO) nebo procento (_PROC).
 *
 * Co tahle sada hlídá především: PROCENTO SE NIKDY NEVYMÝŠLÍ. Když v poli
 * žádné procento není („dle rámcové smlouvy"), zůstane symbol _PROC prázdný.
 * Radši v dokumentu chybí údaj, který si člověk doplní ve Wordu, než aby tam
 * stálo číslo, které nikdo nezadal — to je totéž pravidlo jako u cen.
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
Object.keys(kr).forEach(k => { global[k] = kr[k]; });
const krp = require('./kryci_proj.js');
Object.keys(krp).forEach(k => { global[k] = krp[k]; });
const nb = require('./nabidka.js');
const nbp = require('./nabidka_proj.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9147'; zak.objednatel = 'Vzorový odběratel s.r.o.';
zak.nazevAkce = 'Vestavba OCK + projekce';
const v = zak.varianty[0];
if (!v.data.kryci) v.data.kryci = { hodnoty: {} };
if (!v.data.kryciProj) v.data.kryciProj = { hodnoty: {} };

/* ---------- 1) kryci.js ty funkce vůbec vyváží ---------- */
test('kryci.js vyváží kryciCisloZTextu', typeof kr.kryciCisloZTextu === 'function');
test('kryci.js vyváží kryciProcentoZTextu', typeof kr.kryciProcentoZTextu === 'function');
test('kryci.js vyváží kryciPodminkoveSymboly', typeof kr.kryciPodminkoveSymboly === 'function');
test('kryci_proj.js vyváží kryciProjPodminkoveSymboly',
  typeof krp.kryciProjPodminkoveSymboly === 'function');

/* ---------- 2) čtení čísla z volného textu ----------
 * Pole krycího listu jsou volný text, protože obchodník do nich píše i to,
 * KDY se fakturuje („50 % – po podpisu smlouvy"). Do šablony ale patří
 * na některých místech jen to číslo. */
const cis = kr.kryciCisloZTextu;
test('číslo: „50 % – po podpisu smlouvy" → 50', cis('50 % – po podpisu smlouvy') === '50', cis('50 % – po podpisu smlouvy'));
test('číslo: holé „14" → 14', cis('14') === '14');
test('číslo: „14 dní" → 14 (jednotka se nekopíruje)', cis('14 dní') === '14', cis('14 dní'));
test('číslo: desetinná čárka zůstane česky („0,05 % / den")', cis('0,05 % / den') === '0,05', cis('0,05 % / den'));
test('číslo: „NEUPLATNĚN limit 10 %" → 10', cis('NEUPLATNĚN limit 10 %') === '10', cis('NEUPLATNĚN limit 10 %'));
test('číslo: text bez čísla nedá nic („Bez zálohy")', cis('Bez zálohy') === '');
test('číslo: prázdno, null i undefined dají prázdno',
  cis('') === '' && cis(null) === '' && cis(undefined) === '');

/* ---------- 3) čtení procenta ----------
 * Procento se pozná podle znaku %, ne podle toho, že v poli je nějaké číslo.
 * „14" ve splatnosti jsou dny, ne procenta – kdyby se z toho udělalo „14 %",
 * odešla by nabídka s vymyšlenou platební podmínkou. */
const pro = kr.kryciProcentoZTextu;
test('procento: „50 % – po podpisu smlouvy" → 50 %', pro('50 % – po podpisu smlouvy') === '50 %', pro('50 % – po podpisu smlouvy'));
test('procento: „40%" bez mezery se srovná na „40 %"', pro('40%') === '40 %', pro('40%'));
test('procento: „0,05 % / den" → 0,05 %', pro('0,05 % / den') === '0,05 %', pro('0,05 % / den'));
test('procento: holé „14" NENÍ procento', pro('14') === '', pro('14'));
test('procento: „14 dní" NENÍ procento', pro('14 dní') === '', pro('14 dní'));
test('procento: „po dohodě" nedá nic', pro('po dohodě') === '');
test('procento: „50 procent" slovem se nedopočítává', pro('50 procent') === '', pro('50 procent'));

/* ---------- 4) symboly z krycího listu OCK ---------- */
let S = kr.kryciPodminkoveSymboly(zak, v, JEKLY);
test('symbol nese celý text pole (záloha č. 1)',
  S.PODM_ZALOHA1 === '50 % – po podpisu smlouvy', S.PODM_ZALOHA1);
test('procento zálohy č. 1 je 50 %', S.PODM_ZALOHA1_PROC === '50 %', S.PODM_ZALOHA1_PROC);
test('procento dílčí faktury č. 2 je 40 %', S.PODM_FAKTURA2_PROC === '40 %', S.PODM_FAKTURA2_PROC);
test('procento konečné faktury je 10 %', S.PODM_FAKTURA_KONC_PROC === '10 %', S.PODM_FAKTURA_KONC_PROC);
test('splatnost jako holé číslo je 14', S.PODM_SPLATNOST_DNI_CISLO === '14', S.PODM_SPLATNOST_DNI_CISLO);
test('splatnost jako text je také 14', S.PODM_SPLATNOST_DNI === '14', S.PODM_SPLATNOST_DNI);
test('splatnost není procento (žádné % v poli)', S.PODM_SPLATNOST_DNI_PROC === '', S.PODM_SPLATNOST_DNI_PROC);
test('záruka v měsících je 60', S.PODM_ZARUKA_MESICU_CISLO === '60', S.PODM_ZARUKA_MESICU_CISLO);
test('typ smlouvy se veze s podmínkami', S.PODM_TYP_SMLOUVY === 'Naše bez úprav', S.PODM_TYP_SMLOUVY);
test('platnost nabídky nese celé sousloví i s jednotkou',
  S.PODM_PLATNOST_NABIDKY === '2 měsíce', S.PODM_PLATNOST_NABIDKY);
test('sazba DPH jde z hlavičky kalkulace, ne z pevného textu',
  S.PODM_SAZBA_DPH === Math.round(v.data.cenik.dph * 100) + ' %', S.PODM_SAZBA_DPH);

/* každé pole obou sekcí má svůj symbol – aby přidané pole nezůstalo bez vazby */
const poleOck = kr.KRYCI_SEKCE.filter(s => kr.KRYCI_NABIDKA_SEKCE.includes(s.sekce)).flatMap(s => s.pole);
test('žádné pole podmínek nezůstalo bez symbolu',
  poleOck.every(p => (kr.PODM_PREFIX + kr.kryciSymbolId(p.id)) in S),
  poleOck.filter(p => !((kr.PODM_PREFIX + kr.kryciSymbolId(p.id)) in S)).map(p => p.id).join(','));
test('symboly nesou jen podmínky, ne celý krycí list',
  !('PODM_NAZEV_AKCE' in S) && !('PODM_ADRESA_STAVBY' in S));

/* ---------- 5) ruční přepis se propíše do dokumentu ----------
 * To je jádro zadání: co obchodník změní v podmínkách u nabídky (nebo
 * v krycím listu, je to jedno úložiště), to musí být i v .docx. */
v.data.kryci.hodnoty.zaloha1 = '30 % – po podpisu smlouvy';
v.data.kryci.hodnoty.faktura2 = '60 % – po dodání materiálu';
v.data.kryci.hodnoty.splatnostDni = '30';
S = kr.kryciPodminkoveSymboly(zak, v, JEKLY);
test('změněná záloha se propíše (30 %)', S.PODM_ZALOHA1_PROC === '30 %', S.PODM_ZALOHA1_PROC);
test('změněná dílčí faktura se propíše (60 %)', S.PODM_FAKTURA2_PROC === '60 %', S.PODM_FAKTURA2_PROC);
test('změněná splatnost se propíše (30 dní)', S.PODM_SPLATNOST_DNI_CISLO === '30', S.PODM_SPLATNOST_DNI_CISLO);

/* ---------- 6) co se nedá přečíst, se nevymýšlí ---------- */
v.data.kryci.hodnoty.zaloha1 = 'dle rámcové smlouvy';
S = kr.kryciPodminkoveSymboly(zak, v, JEKLY);
test('text bez procenta nechá symbol _PROC prázdný', S.PODM_ZALOHA1_PROC === '', S.PODM_ZALOHA1_PROC);
test('vlastní text obchodníka se ale neztratí',
  S.PODM_ZALOHA1 === 'dle rámcové smlouvy', S.PODM_ZALOHA1);
delete v.data.kryci.hodnoty.zaloha1;
delete v.data.kryci.hodnoty.faktura2;
delete v.data.kryci.hodnoty.splatnostDni;

/* ---------- 7) pole s vlastním procentem přebíjí odvozený symbol ----------
 * Zádržné má v krycím listu dvě dvojice řádků: přepínač Ano/Ne a k němu
 * samostatné pole s procentem (`zadrzneZarukaProc`). Jeho symbol se jmenuje
 * stejně jako odvozený _PROC symbol přepínače – vyhrát musí skutečné pole,
 * jinak by se do šablony dostalo prázdno místo zadaného čísla. */
v.data.kryci.hodnoty.zadrzneZaruka = 'Ano';
v.data.kryci.hodnoty.zadrzneZarukaProc = '5';
S = kr.kryciPodminkoveSymboly(zak, v, JEKLY);
test('PODM_ZADRZNE_ZARUKA_PROC nese zadané procento z vlastního pole',
  S.PODM_ZADRZNE_ZARUKA_PROC === '5', S.PODM_ZADRZNE_ZARUKA_PROC);
test('přepínač zádržného zůstal svým symbolem', S.PODM_ZADRZNE_ZARUKA === 'Ano', S.PODM_ZADRZNE_ZARUKA);
delete v.data.kryci.hodnoty.zadrzneZaruka;
delete v.data.kryci.hodnoty.zadrzneZarukaProc;

/* ---------- 8) chybějící krycí list nesmí shodit nabídku ----------
 * Starší zakázky uložené před zavedením krycího listu nemají data.kryci vůbec. */
const zak2 = zk.novaZakazka();
const v2 = zak2.varianty[0];
delete v2.data.kryci;
let S2 = null, spadlo = false;
try { S2 = kr.kryciPodminkoveSymboly(zak2, v2, JEKLY); } catch (e) { spadlo = true; }
test('zakázka bez krycího listu symboly spočítá z předvyplnění', !spadlo && !!S2);
test('a záloha v ní má výchozích 50 %', S2 && S2.PODM_ZALOHA1_PROC === '50 %', S2 && S2.PODM_ZALOHA1_PROC);

/* ---------- 9) symboly opravdu dorazí do dat nabídky ---------- */
const dataCn = nb.nabidkaData(zak, v, JEKLY, 'cz');
test('nabídka OCK zná {{PODM_ZALOHA1_PROC}}',
  dataCn.placeholders.PODM_ZALOHA1_PROC === '50 %', dataCn.placeholders.PODM_ZALOHA1_PROC);
test('nabídka OCK zná {{PODM_FAKTURA2_PROC}}',
  dataCn.placeholders.PODM_FAKTURA2_PROC === '40 %', dataCn.placeholders.PODM_FAKTURA2_PROC);
test('nabídka OCK zná {{PODM_SPLATNOST_DNI_CISLO}}',
  dataCn.placeholders.PODM_SPLATNOST_DNI_CISLO === '14', dataCn.placeholders.PODM_SPLATNOST_DNI_CISLO);
test('nabídka OCK si nepřepsala vlastní cenové symboly',
  !!dataCn.placeholders.CENA_BEZ_DPH && !!dataCn.placeholders.DPH_SAZBA);

const dataProj = nbp.nabidkaProjData(zak, v, 'cz');
test('nabídka PROJ zná své podmínky ({{PODM_SPLATNOST_DNI_CISLO}})',
  /^\d+$/.test(String(dataProj.placeholders.PODM_SPLATNOST_DNI_CISLO || '')),
  dataProj.placeholders.PODM_SPLATNOST_DNI_CISLO);
test('nabídka PROJ nese i způsob fakturace',
  !!dataProj.placeholders.PODM_ZPUSOB_FAKTURACE, dataProj.placeholders.PODM_ZPUSOB_FAKTURACE);
test('podmínky PROJ jsou jiné než OCK (dva samostatné krycí listy)',
  dataProj.placeholders.PODM_ZPUSOB_FAKTURACE !== dataCn.placeholders.PODM_ZPUSOB_FAKTURACE,
  dataProj.placeholders.PODM_ZPUSOB_FAKTURACE + ' / ' + dataCn.placeholders.PODM_ZPUSOB_FAKTURACE);

/* ---------- 10) překlad hodnot je volitelný a čísla nechává být ---------- */
const SP = kr.kryciPodminkoveSymboly(zak, v, JEKLY, t => '«' + t + '»');
test('překladač se pustí na text podmínky', SP.PODM_ZALOHA1 === '«50 % – po podpisu smlouvy»', SP.PODM_ZALOHA1);
test('ale odvozené procento zůstane číslem', SP.PODM_ZALOHA1_PROC === '50 %', SP.PODM_ZALOHA1_PROC);
test('a odvozené číslo splatnosti taky', SP.PODM_SPLATNOST_DNI_CISLO === '14', SP.PODM_SPLATNOST_DNI_CISLO);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
