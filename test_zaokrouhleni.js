/* Test #34 – zámek vytištěné nabídky + číslování variant (#17).
 *
 * Model v zamek.js je záměrně čistý (žádné DOM), takže se dá otestovat
 * v Node stejně jako porovnání variant. Blokování editace v UI se testuje
 * až nad sestaveným buildem (overit_lista.mjs).
 *
 * Pozor na konvenci projektu: prohlížeč má jeden jmenný prostor, Node ne.
 * Funkce sdílené mezi moduly se musí globalizovat ručně – jinak podmínky
 * `typeof fn === 'function'` tiše spadnou do záložní větve. */
const fs = require('fs');
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
const { novaZakazka, importZakazka, porovnaniVariant } = zk;

const zm = require('./zamek.js');
// zakazka.js volá zajistiZamek() přes guard – bez globalizace by migrace
// v importZakazka() tiše neproběhla a test by ověřoval jinou cestu kódem.
global.zajistiZamek = zm.zajistiZamek;
global.variantaCislo = zm.variantaCislo; global.variantaUzamcena = zm.variantaUzamcena;
global.variantaEditovatelna = zm.variantaEditovatelna; global.zamekInfo = zm.zamekInfo;
global.dokumentZamyka = zm.dokumentZamyka; global.dokumentPopis = zm.dokumentPopis;

const { ZAMEK_DOKUMENTY, dokumentZamyka, dokumentPopis, variantaPripona,
        dalsiPriponaVarianty, variantaCislo, klonujVariantu, zamekInfo,
        variantaUzamcena, variantaEditovatelna, zamkniVariantu, odemkniVariantu,
        zamekOtisk, zamekOtiskZPorovnani, zajistiZamek } = zm;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* ---------- 1) které dokumenty zámek armují ---------- */
test('nabídka OCK (Word) zamyká', dokumentZamyka('nabidka') === true);
test('nabídka OCK (tisk) zamyká', dokumentZamyka('nabidkaTisk') === true);
test('nabídka PROJ (Word) zamyká', dokumentZamyka('nabidkaProj') === true);
test('nabídka PROJ (tisk) zamyká', dokumentZamyka('nabidkaProjTisk') === true);
test('krycí list nezamyká', dokumentZamyka('kryci') === false);
test('krycí list PROJ nezamyká', dokumentZamyka('kryciProj') === false);
test('technická specifikace nezamyká', dokumentZamyka('techspec') === false);
test('náhled podkladů nezamyká', dokumentZamyka('podklady') === false);
test('porovnání variant nezamyká', dokumentZamyka('porovnani') === false);
test('neznámý typ dokumentu nezamyká', dokumentZamyka('neco-jineho') === false);
test('popis neznámého typu vrací sám typ', dokumentPopis('xyz') === 'xyz');
test('každý zamykající dokument má popis',
  Object.keys(ZAMEK_DOKUMENTY).every(k => typeof ZAMEK_DOKUMENTY[k].popis === 'string'
                                          && ZAMEK_DOKUMENTY[k].popis.length > 3));

/* ---------- 2) číslování: původní varianta nese holé číslo ---------- */
const zak = novaZakazka();
zak.cislo = '2026 - OPR - CN - 0500';
const v1 = zak.varianty[0];
test('bez přípony je číslo varianty holé číslo zakázky',
  variantaCislo(zak, v1) === '2026 - OPR - CN - 0500', variantaCislo(zak, v1));
test('výchozí varianta má příponu 0', variantaPripona(v1) === 0);
test('první volná přípona je 1', dalsiPriponaVarianty(zak) === 1);

/* ---------- 3) klon dostane .1, další .2 – přípony se nevnořují ---------- */
const k1 = klonujVariantu(zak, v1.id);
test('klon má příponu .1', variantaCislo(zak, k1) === '2026 - OPR - CN - 0500.1',
  variantaCislo(zak, k1));
test('klon je v téže zakázce', zak.varianty.length === 2 && zak.varianty[1] === k1);
test('klon se stane aktivní variantou', zak.aktivni === k1.id);
test('klon si pamatuje předlohu', k1.klonZ === v1.id
  && k1.klonZCislo === '2026 - OPR - CN - 0500');

const k2 = klonujVariantu(zak, k1.id);   // klon klonu
test('klon klonu je .2, ne .1.1', variantaCislo(zak, k2) === '2026 - OPR - CN - 0500.2',
  variantaCislo(zak, k2));
test('původní varianta si číslo drží', variantaCislo(zak, v1) === '2026 - OPR - CN - 0500');
test('klon .1 si číslo drží', variantaCislo(zak, k1) === '2026 - OPR - CN - 0500.1');

/* ---------- 4) klon je hluboká kopie dat ---------- */
k2.data.ock.zadani.sirka = 9999;
test('změna v klonu neovlivní předlohu', v1.data.ock.zadani.sirka !== 9999);
test('klon má vlastní id', k1.id !== v1.id && k2.id !== k1.id);
test('klon není řídící', k1.ridici === false && k2.ridici === false);
test('řídící zůstala původní varianta', v1.ridici === true);

/* ---------- 5) číslo se nepoužije podruhé ani po smazání ---------- */
zak.varianty = zak.varianty.filter(v => v.id !== k2.id);   // uživatel smaže .2
const k3 = klonujVariantu(zak, v1.id);
test('po smazání .2 dostane další klon .3 (číslo se neopakuje)',
  variantaCislo(zak, k3) === '2026 - OPR - CN - 0500.3', variantaCislo(zak, k3));

/* ---------- 6) uzamčení při tisku ---------- */
const zak2 = novaZakazka();
zak2.cislo = '2026 - OPR - CN - 0600';
const a = zak2.varianty[0];
test('nová varianta je editovatelná', variantaEditovatelna(a) === true);
test('nová varianta není zamčená', variantaUzamcena(a) === false);
test('zamekInfo nezamčené varianty je null', zamekInfo(a) === null);

/* Audit 1. 8. 2026 (N3): DPH jde do otisku po částech – sazba i Kč zvlášť
 * pro OCK a zvlášť pro PROJ. Jediná společná sazba by u rozdílných sazeb
 * (21 % OCK / 12 % PROJ) zapekla do zámku špatné číslo. */
const otisk = zamekOtisk({ ockZaklad: 100000, slevaPct: 0.05, slevaKc: 5000,
                           ockPoSleve: 95000, projCelkem: 20000,
                           celkemBezDph: 115000,
                           dphOckSazba: 0.21, dphOckKc: 19950,
                           dphProjSazba: 0.12, dphProjKc: 2400,
                           celkemSDph: 137350, priplatky: 3000,
                           ockNaklad: 70000, marzeKc: 25000 });
test('otisk nese dohodnutá pole', otisk.celkemSDph === 137350 && otisk.ockZaklad === 100000);
test('otisk nese DPH po částech (OCK i PROJ zvlášť)',
  otisk.dphOckSazba === 0.21 && otisk.dphOckKc === 19950
  && otisk.dphProjSazba === 0.12 && otisk.dphProjKc === 2400);
test('otisk neobsahuje náklad ani marži',
  !('ockNaklad' in otisk) && !('marzeKc' in otisk));
test('chybějící hodnota v otisku je null', zamekOtisk({}).celkemBezDph === null);

const z = zamkniVariantu(a, { typ: 'nabidka', kdy: '2026-07-29T10:00:00.000Z',
                              kdo: 'Novák', cislo: variantaCislo(zak2, a), otisk });
test('po tisku je varianta zamčená', variantaUzamcena(a) === true);
test('po tisku není editovatelná', variantaEditovatelna(a) === false);
test('zámek nese typ dokumentu', z.typ === 'nabidka');
test('zámek nese popis dokumentu', z.popis === 'Cenová nabídka OCK (Word)');
test('zámek nese datum odeslání', z.kdy === '2026-07-29T10:00:00.000Z');
test('zámek nese číslo nabídky', z.cislo === '2026 - OPR - CN - 0600');
test('zámek nese otisk částek', z.otisk && z.otisk.celkemSDph === 137350);
test('zámek eviduje jeden tisk', z.tisky.length === 1);

/* ---------- 7) další tisk už zamčené varianty jen přibude do historie ---------- */
zamkniVariantu(a, { typ: 'nabidkaTisk', kdy: '2026-07-30T08:00:00.000Z', kdo: 'Novák' });
test('druhý tisk přibude do historie', a.zamek.tisky.length === 2);
test('druhý tisk nepřepíše datum odeslání', a.zamek.kdy === '2026-07-29T10:00:00.000Z');
test('druhý tisk nepřepíše otisk', a.zamek.otisk.celkemSDph === 137350);
test('historie zná typ druhého tisku', a.zamek.tisky[1].typ === 'nabidkaTisk');

/* ---------- 8) pokračuje se klonem ---------- */
const b = klonujVariantu(zak2, a.id);
test('klon zamčené varianty je editovatelný', variantaEditovatelna(b) === true);
test('klon zamčené varianty nemá zámek', b.zamek === null);
test('klon má číslo .1', variantaCislo(zak2, b) === '2026 - OPR - CN - 0600.1');
test('zamčená předloha zůstává zamčená', variantaUzamcena(a) === true);

/* ---------- 9) odemknutí je výjimka pro správce ---------- */
const r1 = odemkniVariantu(a, { jeAdmin: false, duvod: 'překlep v ceně' });
test('běžný uživatel neodemkne', r1.ok === false && variantaUzamcena(a) === true);
test('odmítnutí vysvětlí proč', /správce/.test(r1.duvod), r1.duvod);
const r2 = odemkniVariantu(a, { jeAdmin: true, duvod: '   ' });
test('ani správce neodemkne bez důvodu', r2.ok === false && variantaUzamcena(a) === true);
const r3 = odemkniVariantu(a, { jeAdmin: true, duvod: 'překlep v ceně',
                                kdo: 'Vedoucí', kdy: '2026-07-31T09:00:00.000Z' });
test('správce s důvodem odemkne', r3.ok === true);
test('po odemčení je varianta editovatelná', variantaEditovatelna(a) === true);
test('odemčení se eviduje', a.odemceni.length === 1 && a.odemceni[0].duvod === 'překlep v ceně');
test('odemčení si schová původní zámek', a.odemceni[0].zamek.kdy === '2026-07-29T10:00:00.000Z');
test('odemčení eviduje kdo a kdy',
  a.odemceni[0].kdo === 'Vedoucí' && a.odemceni[0].kdy === '2026-07-31T09:00:00.000Z');
const r4 = odemkniVariantu(a, { jeAdmin: true, duvod: 'znovu' });
test('odemknout nezamčenou variantu nejde', r4.ok === false);

/* ---------- 10) otisk z porovnání variant ---------- */
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
const mkOck = (zaklad, naklad, pripl = 0) => ({ souhrn: {
  zakladCena: zaklad, zakladNaklad: naklad, zakladMarze: zaklad - naklad,
  zakladDph: zaklad * 0.21, zakladSDph: zaklad * 1.21,
  priplatkyCena: pripl, priplatkyDph: pripl * 0.21, priplatkySDph: pripl * 1.21 } });
const mkProj = celkem => ({ souhrn: { naklad: 0, marze: 0, doprava: 0, cena: celkem, sleva: 0, celkem } });
const por = porovnaniVariant(zak2, [
  { id: a.id, ock: mkOck(200000, 150000, 4000), proj: mkProj(30000) },
  { id: b.id, ock: mkOck(210000, 150000, 4000), proj: mkProj(30000) },
]);
const oa = zamekOtiskZPorovnani(por, a.id);
test('otisk z porovnání sedí na základní cenu', oa.ockZaklad === 200000, JSON.stringify(oa));
test('otisk z porovnání spočítá celkem bez DPH', oa.celkemBezDph === 230000, JSON.stringify(oa));
test('otisk z porovnání zná příplatky', oa.priplatky === 4000);
test('otisk neznámé varianty je prázdný, ne pád',
  zamekOtiskZPorovnani(por, 'neexistuje').celkemSDph === null);
test('JEKLY se načetly (kontrola prostředí)', Array.isArray(JEKLY) || typeof JEKLY === 'object');

/* ---------- 11) migrace starých zakázek ---------- */
const stara = { schema: 2, cislo: '2026 - OPR - CN - 0300',
                varianty: [ { id: 'x1', nazev: 'Varianta 1', ridici: true, data: {} },
                            { id: 'x2', nazev: 'Varianta 2', data: {} },
                            { id: 'x3', nazev: 'Varianta 3', data: {} } ],
                aktivni: 'x1' };
zajistiZamek(stara);
test('migrace: první varianta zůstává na holém čísle',
  variantaCislo(stara, stara.varianty[0]) === '2026 - OPR - CN - 0300');
test('migrace: druhá varianta dostane .1',
  variantaCislo(stara, stara.varianty[1]) === '2026 - OPR - CN - 0300.1');
test('migrace: třetí varianta dostane .2',
  variantaCislo(stara, stara.varianty[2]) === '2026 - OPR - CN - 0300.2');
test('migrace: nikde nevznikl zámek', stara.varianty.every(v => v.zamek === null));
test('migrace: zakázka si pamatuje nejvyšší příponu', stara.priponaMax === 2);
const snap = JSON.stringify(stara);
zajistiZamek(stara);
test('migrace je idempotentní', JSON.stringify(stara) === snap);
const k4 = klonujVariantu(stara, 'x2');
test('klon po migraci pokračuje .3', variantaCislo(stara, k4) === '2026 - OPR - CN - 0300.3',
  variantaCislo(stara, k4));

/* rozbitý zápis zámku se nesmí brát jako zámek */
const rozbita = { schema: 2, cislo: 'CN', aktivni: 'y1',
                  varianty: [{ id: 'y1', nazev: 'V', ridici: true, data: {}, zamek: { zamceno: false } }] };
zajistiZamek(rozbita);
test('nedokončený zámek se zahodí', rozbita.varianty[0].zamek === null);

/* zámek bez historie tisků se doplní */
const bezHistorie = { schema: 2, cislo: 'CN', aktivni: 'z1', varianty: [
  { id: 'z1', nazev: 'V', ridici: true, data: {},
    zamek: { zamceno: true, kdy: '2026-01-01T00:00:00.000Z', typ: 'nabidka' } }] };
zajistiZamek(bezHistorie);
test('starému zámku se dopočte historie tisků',
  bezHistorie.varianty[0].zamek.tisky.length === 1
  && bezHistorie.varianty[0].zamek.tisky[0].kdy === '2026-01-01T00:00:00.000Z');
test('starý zámek zůstává zámkem', variantaUzamcena(bezHistorie.varianty[0]) === true);

/* ---------- 12) importZakazka migraci spustí ---------- */
const naimportovana = importZakazka(JSON.parse(JSON.stringify({
  schema: 2, cislo: '2026 - OPR - CN - 0400', aktivni: 'i1',
  varianty: [ { id: 'i1', nazev: 'Varianta 1', ridici: true, data: {} },
              { id: 'i2', nazev: 'Varianta 2', data: {} } ] })));
test('import doplní přípony', variantaPripona(naimportovana.varianty[0]) === 0
  && variantaPripona(naimportovana.varianty[1]) === 1);
test('import doplní prázdný zámek', naimportovana.varianty.every(v => v.zamek === null));
test('import zachová číslo první varianty',
  variantaCislo(naimportovana, naimportovana.varianty[0]) === '2026 - OPR - CN - 0400');

/* ---------- 13) zpětná kompatibilita čísla ---------- */
const cista = novaZakazka();
test('nevyplněné číslo zakázky zůstává předlohou',
  variantaCislo(cista, cista.varianty[0]) === cista.cislo);
const kl = klonujVariantu(cista, cista.varianty[0].id);
test('klon nevyplněné zakázky nekončí mezerou před tečkou',
  !/\s\./.test(variantaCislo(cista, kl)), variantaCislo(cista, kl));

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
