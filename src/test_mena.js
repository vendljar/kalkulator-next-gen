/* Test měny dokumentu (#155, 19. 8. 2026) — kurz EUR z ceníku.
 *
 * Pravidla (rozhodnutí J. V. 19. 8. 2026):
 *   – jazyk CZ → koruny beze změny, kurz se vůbec nepoužije,
 *   – jiná mutace → VŠECHNY částky v eurech, CELÁ EURA NAHORU,
 *   – v dokumentu jen eura; kurz se nikde neukazuje,
 *   – bez kurzu se cizojazyčný dokument nevytvoří (ceny se nevymýšlejí). */
const F = require('./format.js');
global.menaKc = F.menaKc; global.menaDokumentu = F.menaDokumentu;
global.formatKc2 = F.formatKc2; global.formatCislo = F.formatCislo;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* ---------- 1) jednotka: menaKc ---------- */
test('CZ vrací korunový formát beze změny', F.menaKc('cz', 0)(1234.5) === F.formatKc2(1234.5));
test('CZ nepotřebuje kurz', typeof F.menaKc('cz', undefined) === 'function');
const eur = F.menaKc('en', 25.2);
test('EN převádí kurzem a zaokrouhluje na celá eura NAHORU',
  eur(96000) === '€ ' + (3810).toLocaleString('cs-CZ'), eur(96000));       // 96000/25.2 = 3809,52 → 3810
test('nikdy dolů: 25,20 Kč → 1 €', eur(25.2) === '€ 1' && eur(25.21) === '€ 2', eur(25.21));
test('nula zůstává nulou', eur(0) === '€ 0');
test('v generovaném textu není kurz ani koruny', !/25|Kč/.test(eur(96000)), eur(96000));
let chyba = null;
try { F.menaKc('de', 0); } catch (e) { chyba = e; }
test('bez kurzu se cizí mutace zastaví srozumitelnou chybou',
  !!chyba && chyba.kod === 'CHYBI_KURZ_EUR' && /Kurz EUR/.test(chyba.message), chyba && chyba.message);

/* ---------- 2) integrace: nabídka PROJ v EN ---------- */
const ep = require('./engine_proj.js');
Object.keys(ep).forEach(k => { global[k] = ep[k]; });
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
Object.keys(tsm).forEach(k => { global[k] = tsm[k]; });
const zk = require('./zakazka.js');
global.projHlavicka = zk.projHlavicka;
global.projHlavickaEfektivni = zk.projHlavickaEfektivni;
global.projCisloNabidky = zk.projCisloNabidky;
global.cisloSVariantou = zk.cisloSVariantou;
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const pr = require('./preklad.js');
Object.keys(pr).forEach(k => { global[k] = pr[k]; });
const SLV = require('./sleva.js');
global.slevaPodil = SLV.slevaPodil;
const NP = require('./nabidka_proj.js');

const zak = zk.novaZakazka();
zak.cislo = '2026 - OVP - CN - 777'; zak.nazevAkce = 'Test EUR'; zak.objednatel = 'Zkušební s.r.o.';
const v = zak.varianty[0];

/* česká mutace: koruny jako dřív */
const dCz = NP.nabidkaProjData(zak, v, 'cz');
const textCz = JSON.stringify(dCz.placeholders);
test('CZ mutace nese koruny', /Kč/.test(textCz) && !/€/.test(textCz));

/* anglická mutace bez kurzu: dokument nevznikne */
let chybaEn = null;
try { NP.nabidkaProjData(zak, v, 'en'); } catch (e) { chybaEn = e; }
test('EN bez kurzu v ceníku se zastaví', !!chybaEn && /Kurz EUR/.test(chybaEn.message),
  chybaEn && chybaEn.message);

/* anglická mutace s kurzem: jen eura, kurz nikde */
v.data.proj.cenik.kurzEurKc = 25;
const dEn = NP.nabidkaProjData(zak, v, 'en');
const textEn = JSON.stringify(dEn.placeholders);
test('EN mutace nese jen eura (žádné Kč)', /€/.test(textEn) && !/Kč/.test(textEn), textEn.slice(0, 200));
test('kurz se v dokumentu nikde neukazuje', !/25\s*(Kč|CZK)|kurz/i.test(textEn));
test('částky jsou celá eura (žádné desetinné čárky u €)', !/€ \d+[.,]\d/.test(textEn));

/* ---------- 3) DOROVNÁNÍ (zadání 19. 8. 2026 večer) ----------
 * „Součet všech položek po zaokrouhlení musí sedět jak v cenové nabídce,
 * tak v kalkulaci." Převádějí se tedy POLOŽKY (celá eura nahoru) a součty
 * se SČÍTAJÍ z převedených položek — stejný princip jako #135 u korun.
 * DPH se počítá až z eurového základu (nahoru) a celkem s DPH je přesný
 * součet základu a DPH. */
const naCislo = s => +String(s).replace(/[^0-9]/g, '');

/* PROJ: rekapitulace = položky; celkem bez DPH musí být jejich přesný součet */
const soucetPolozek = dEn.rekapitulace.reduce((a, x) => a + naCislo(x[1]), 0);
test('PROJ: celkem bez DPH = přesný součet eurových položek rekapitulace',
  naCislo(dEn.placeholders.PROJ_CELKEM_BEZ_DPH) === soucetPolozek,
  dEn.placeholders.PROJ_CELKEM_BEZ_DPH + ' vs ' + soucetPolozek);
test('PROJ: celkem s DPH = celkem bez DPH + DPH (na euro přesně)',
  naCislo(dEn.placeholders.PROJ_CELKEM_S_DPH)
    === naCislo(dEn.placeholders.PROJ_CELKEM_BEZ_DPH) + naCislo(dEn.placeholders.PROJ_DPH_KC),
  [dEn.placeholders.PROJ_CELKEM_BEZ_DPH, dEn.placeholders.PROJ_DPH_KC, dEn.placeholders.PROJ_CELKEM_S_DPH].join(' | '));

/* OCK: bez DPH + DPH = s DPH, a sleva = cena před slevou − cena po slevě */
global.docxVyplnSablonu = global.docxVyplnSablonu || (() => { throw new Error('netestuje se'); });
const NB = require('./nabidka.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));
v.data.cenik.kurzEurKc = 25;
const dOck = NB.nabidkaData(zak, v, JEKLY, 'en');
test('OCK EN: nese jen eura', /€/.test(dOck.placeholders.CENA_BEZ_DPH)
  && !/Kč/.test(JSON.stringify(dOck.placeholders)), dOck.placeholders.CENA_BEZ_DPH);
test('OCK EN: bez DPH + DPH = s DPH (na euro přesně)',
  naCislo(dOck.placeholders.CENA_S_DPH)
    === naCislo(dOck.placeholders.CENA_BEZ_DPH) + naCislo(dOck.placeholders.DPH_KC),
  [dOck.placeholders.CENA_BEZ_DPH, dOck.placeholders.DPH_KC, dOck.placeholders.CENA_S_DPH].join(' | '));
test('OCK EN: cena před slevou − sleva = cena po slevě',
  naCislo(dOck.placeholders.CENA_PRED_SLEVOU) - naCislo(dOck.placeholders.SLEVA_KC || '0')
    === naCislo(dOck.placeholders.CENA_BEZ_DPH),
  [dOck.placeholders.CENA_PRED_SLEVOU, dOck.placeholders.SLEVA_KC, dOck.placeholders.CENA_BEZ_DPH].join(' | '));
test('OCK bez kurzu se zastaví', (() => {
  v.data.cenik.kurzEurKc = 0;
  try { NB.nabidkaData(zak, v, JEKLY, 'de'); return false; }
  catch (e) { return /Kurz EUR/.test(e.message); }
  finally { v.data.cenik.kurzEurKc = 25; }
})());

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
