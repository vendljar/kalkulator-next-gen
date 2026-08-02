/* Test #35 – stáří ceníku u načtené zakázky a nabídka přepočtu.
 *
 * Model v cenik_stari.js je bez DOM, takže se dá otestovat v Node. Vykreslení
 * (ui/cenik_stari_ui.js) se ověřuje až nad sestaveným buildem v overit_lista.mjs.
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne – funkce
 * sdílené mezi moduly se musí globalizovat ručně, jinak podmínky
 * `typeof fn === 'function'` tiše spadnou do záložní větve a test by
 * ověřoval jinou cestu kódem, než jaká poběží v aplikaci. */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const sl = require('./sleva.js');
global.slevaPodil = sl.slevaPodil; global.slevaDefault = sl.slevaDefault;
const ck = require('./cenik.js');
global.CENIK_DEF = ck.CENIK_DEF; global.CENIK_DEF_PROJ = ck.CENIK_DEF_PROJ;
global.cenikGet = ck.cenikGet; global.cenikSet = ck.cenikSet;
const zk = require('./zakazka.js');
global.novaVarianta = zk.novaVarianta; global.novaVariantaData = zk.novaVariantaData;
global.aktivniVarianta = zk.aktivniVarianta; global.ridiciVarianta = zk.ridiciVarianta;
const { novaZakazka } = zk;
const zm = require('./zamek.js');
global.zajistiZamek = zm.zajistiZamek; global.variantaCislo = zm.variantaCislo;
global.variantaUzamcena = zm.variantaUzamcena; global.variantaEditovatelna = zm.variantaEditovatelna;
global.zamekInfo = zm.zamekInfo; global.zamekOtisk = zm.zamekOtisk;
const { zamkniVariantu } = zm;

/* Značka ukázkových dat se srovnává v ukazkove.js; v prohlížeči je to jeden
 * jmenný prostor, v Node ji musíme podstrčit ručně – jinak by cenik_stari.js
 * tiše spadl do větve „funkce není" a test by neověřoval nic. */
const ukz = require('./ukazkove.js');
global.ukazkoveSrovnejZnacku = ukz.ukazkoveSrovnejZnacku;

const cs = require('./cenik_stari.js');
const { cenikSledovane, cenikAktualizovano, cenikDniOd, cenikStariCeniku,
        cenikHodnota, cenikNastavHodnotu, cenikRozdily, cenikOtisk, cenikSouhrn,
        cenikKvitovat, cenikZrusKvitanci, cenikJeKvitovano, cenikPrehled,
        cenikProcento, cenikVarovaniText, cenikDatumCz, cenikPrepocti,
        cenikOznacJakoDnesni } = cs;
Object.assign(global, cs);

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

const DNES = () => ({ cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK)),
                      proj: { cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)) } });

/* Varianta se „starým" ceníkem: pár položek posuneme, ostatní necháme být.
 *
 * Staré ceny se ODVOZUJÍ z dnešních, nepíšou se jako čísla. V repozitáři jsou
 * ukázkové ceny a ty se mění; kdyby tu stálo „dnes 250", stačilo by vyměnit
 * vzorek a test by buď hlídal jiný rozdíl, nebo by položka splynula s dnešní
 * hodnotou a rozdíl by tiše zmizel (přesně to se stalo při očištění zdrojáků).
 * Takhle test hlídá to, co má: že se rozdíl najde a spočítá se správně. */
const POSUN_POWERTECH = 0.25;   // dnes je o čtvrtinu dráž → +25 %, největší změna
const POSUN_MONTAZ = -0.20;     // dnes je o pětinu levněji → −20 %
const POSUN_NORDLOCK = 0.10;    // vnořená cesta ve spojovacím materiálu
const POSUN_PROJ_MARZE = 0.15;  // druhý ceník

/* stará cena taková, aby (dnes − stará) / stará = posun */
const stara = (dnes, posun) => dnes / (1 + posun);

const STARA_POWERTECH = stara(DEFAULT_CENIK.powertechExt, POSUN_POWERTECH);
const STARA_MONTAZ = stara(DEFAULT_CENIK.montazHodKc, POSUN_MONTAZ);

function staraVarianta() {
  const zak = zajistiZamek(novaZakazka());
  const v = zak.varianty[0];
  v.data.cenik.powertechExt = STARA_POWERTECH;
  v.data.cenik.montazHodKc = STARA_MONTAZ;
  v.data.cenik.skloBokyNazev = DEFAULT_CENIK.skloBokyNazev + ' – starší text';
  v.data.cenik.spojovaci.nordlock = stara(DEFAULT_CENIK.spojovaci.nordlock, POSUN_NORDLOCK);
  v.data.proj.cenik.marze = stara(DEFAULT_CENIK_PROJ.marze, POSUN_PROJ_MARZE);
  return { zak, v };
}

/* ---------- seznam sledovaných položek ---------- */
const sledovane = cenikSledovane();
/* Audit 1. 8. 2026 (N8): sazba DPH projekce musí být sledovaná stejně jako
 * C.dph – jinak změna jen téhle sazby nezmění otisk, programBezeZmeny řekne
 * „beze změny" a zveřejnění ceníku se odmítne. */
test('PC.dph je mezi sledovanými položkami',
  sledovane.some(x => x.cesta === 'PC.dph' && x.sekce === 'PROJ'));
{
  const a = DNES(), b = DNES();
  b.proj.cenik.dph = a.proj.cenik.dph === 0.12 ? 0.21 : 0.12;
  const roz = cenikRozdily(a, b);
  test('změna jen PC.dph se objeví v rozdílech',
    roz.length === 1 && roz[0].cesta === 'PC.dph', JSON.stringify(roz.map(r => r.cesta)));
  test('změna jen PC.dph změní otisk ceníku', cenikOtisk(a) !== cenikOtisk(b));
}
test('sledují se položky OCK i PROJ',
  sledovane.some(p => p.cesta === 'C.powertechExt') && sledovane.some(p => p.cesta.indexOf('PC.') === 0),
  sledovane.length);
test('sledují se i marže a DPH, které v definici ceníku nejsou',
  ['C.marze', 'C.dph', 'PC.marze'].every(c => sledovane.some(p => p.cesta === c)));
test('žádná položka není v seznamu dvakrát',
  new Set(sledovane.map(p => p.cesta)).size === sledovane.length);

/* ---------- stáří ceníku podle poznámek ---------- */
test('z poznámky se přečte datum aktualizace',
  cenikAktualizovano('aktualizováno 26.1.2026') === '2026-01-26',
  cenikAktualizovano('aktualizováno 26.1.2026'));
test('jednociferný den i měsíc se doplní nulou',
  cenikAktualizovano('aktualizováno 3.5.2023') === '2023-05-03');
test('poznámka bez data nic nepředstírá',
  cenikAktualizovano('počítá se se 4 osobami') === '' && cenikAktualizovano('') === '');
test('rozdíl dnů se počítá přes celé dny',
  cenikDniOd('2026-07-01', '2026-07-29') === 28, cenikDniOd('2026-07-01', '2026-07-29'));
test('bez data se dny nedopočítávají', cenikDniOd('', '2026-07-29') === null);

const st = cenikStariCeniku('2026-07-29');
test('nejstarší datovaná položka jsou Profily z 3.5.2023',
  st.nejstarsi && st.nejstarsi.cesta === 'C.profilasKgKc' && st.nejstarsi.datum === '2023-05-03',
  st.nejstarsi);
test('u nejstarší položky se ví, jak je stará',
  st.nejstarsi.dni > 1100, st.nejstarsi.dni);
test('položky bez data se počítají zvlášť, netváří se jako čerstvé',
  st.sDatem === 3 && st.bezData === st.celkem - 3, { sDatem: st.sDatem, bezData: st.bezData });

/* ---------- rozdíly proti dnešnímu ceníku ---------- */
const { zak, v } = staraVarianta();
const rozd = cenikRozdily(v.data, DNES());
const cesty = rozd.map(r => r.cesta);
test('najdou se všechny posunuté položky a nic navíc',
  rozd.length === 5 && ['C.powertechExt', 'C.montazHodKc', 'C.skloBokyNazev',
    'C.spojovaci.nordlock', 'PC.marze'].every(c => cesty.includes(c)), cesty);
test('rozdíl se počítá i ve vnořené cestě (spojovací materiál)',
  rozd.find(r => r.cesta === 'C.spojovaci.nordlock').nova === DEFAULT_CENIK.spojovaci.nordlock);
test('procentní změna je podíl proti staré ceně (+25 %)',
  Math.abs(rozd.find(r => r.cesta === 'C.powertechExt').zmena - POSUN_POWERTECH) < 1e-9,
  rozd.find(r => r.cesta === 'C.powertechExt').zmena);
test('zlevnění má záporné znaménko (−20 %)',
  Math.abs(rozd.find(r => r.cesta === 'C.montazHodKc').zmena - POSUN_MONTAZ) < 1e-9,
  rozd.find(r => r.cesta === 'C.montazHodKc').zmena);
test('u textové položky se procento nevymýšlí',
  rozd.find(r => r.cesta === 'C.skloBokyNazev').zmena === null
  && rozd.find(r => r.cesta === 'C.skloBokyNazev').cislo === false);
test('řadí se od největší změny',
  Math.abs(rozd[0].zmena || 0) >= Math.abs(rozd[1].zmena || 0), rozd.map(r => r.zmena));
test('shodné ceníky nemají žádný rozdíl', cenikRozdily(DNES(), DNES()).length === 0);
test('dělení nulou nevyrobí nesmysl', (() => {
  const a = DNES(); a.cenik.cisteniKc = 0;
  const r = cenikRozdily(a, DNES()).find(x => x.cesta === 'C.cisteniKc');
  return r && r.zmena === null && r.cislo === true;
})());

const s = cenikSouhrn(rozd);
test('souhrn rozliší zdražení, zlevnění a text',
  s.pocet === 5 && s.zdrazeni === 3 && s.zlevneni === 1 && s.textove === 1, s);
test('souhrn ukáže největší změnu', s.nejvetsi.cesta === rozd[0].cesta);
test('procento se píše česky s desetinnou čárkou',
  cenikProcento(0.25) === '+25 %' && cenikProcento(-0.125) === '-12,5 %',
  [cenikProcento(0.25), cenikProcento(-0.125)]);

/* ---------- otisk ---------- */
const o1 = cenikOtisk(v.data);
test('otisk je stabilní – dvakrát totéž dá totéž', o1 === cenikOtisk(v.data));
test('změna ceny otisk změní', (() => {
  const kopie = JSON.parse(JSON.stringify(v.data));
  kopie.cenik.powertechExt = 201;
  return cenikOtisk(kopie) !== o1;
})());
test('dvě varianty se stejným ceníkem mají stejný otisk',
  cenikOtisk(DNES()) === cenikOtisk(DNES()));

/* ---------- přehled a varovná věta ---------- */
const p = cenikPrehled(v, DNES(), { dnes: '2026-07-29', datum: '2025-05-01' });
test('přehled u načtené zakázky varuje', p.varovat === true && p.souhrn.pocet === 5);
test('přehled zná datum, ke kterému se ceny vztahují',
  p.datum === '2025-05-01' && p.dni === 454, { datum: p.datum, dni: p.dni });
const veta = cenikVarovaniText(p);
test('věta řekne počet i nejvyšší změnu',
  /5 položek/.test(veta) && /\+25 %/.test(veta), veta);
test('věta řekne, z kdy ceny jsou', /1\. 5\. 2025/.test(veta) && /454 dny/.test(veta), veta);
test('datum se vypisuje česky', cenikDatumCz('2026-01-06') === '6. 1. 2026');
test('bez rozdílu se nevaruje', (() => {
  const zak2 = zajistiZamek(novaZakazka());
  const pr = cenikPrehled(zak2.varianty[0], DNES(), { dnes: '2026-07-29' });
  return pr.varovat === false && cenikVarovaniText(pr) === '';
})());

/* ---------- kvitance ---------- */
cenikKvitovat(v, p.otisk, 'JV', '2026-07-29T10:00:00.000Z');
const pKvit = cenikPrehled(v, DNES(), { dnes: '2026-07-29' });
test('po potvrzení „ceny jsou dohodnuté" se přestane varovat',
  pKvit.kvitovano === true && pKvit.varovat === false);
test('rozdíly se ale nepřestanou počítat – jen se z nich nedělá poplach',
  pKvit.souhrn.pocet === 5);
test('kvitance platí jen pro ten ceník, ke kterému se dala', (() => {
  const kopie = JSON.parse(JSON.stringify(v));
  kopie.data.cenik.cestovniKc = 12345;
  const pr = cenikPrehled(kopie, DNES(), { dnes: '2026-07-29' });
  return pr.kvitovano === false && pr.varovat === true;
})());
cenikZrusKvitanci(v);
test('kvitanci jde zrušit', cenikJeKvitovano(v, p.otisk) === false);

/* ---------- zamčená varianta ---------- */
test('zamčená varianta se nehlídá – její cena už odešla', (() => {
  const kopie = JSON.parse(JSON.stringify(v));
  zamkniVariantu(kopie, { typ: 'nabidkaOck', kdo: 'JV', cislo: '2026 - OPR - CN - 0500',
                          otisk: zamekOtisk({ celkemBezDph: 500000 }) });
  const pr = cenikPrehled(kopie, DNES(), { dnes: '2026-07-29' });
  return pr.zamceno === true && pr.varovat === false;
})());

/* ---------- přepočet ---------- */
const { v: vp } = staraVarianta();
const zadaniPred = JSON.stringify(vp.data.ock.zadani);
const vysl = cenikPrepocti(vp, DNES(), { dnes: '2026-07-29', build: 'v29.7.21' });
test('přepočet přepsal všech pět položek', vysl.zmen === 5, vysl.zmen);
test('po přepočtu je ceník shodný s dnešním',
  cenikRozdily(vp.data, DNES()).length === 0);
test('přepočet se nedotkl zadání – to je to, co uživatel spočítal',
  JSON.stringify(vp.data.ock.zadani) === zadaniPred);
test('přepočet zapsal razítko s datem i sestavením',
  vp.data.cenikRazitko.datum === '2026-07-29' && vp.data.cenikRazitko.build === 'v29.7.21');
test('razítko nese otisk ceníku po přepočtu',
  vp.data.cenikRazitko.otisk === cenikOtisk(vp.data));
test('přepočet posunul čas poslední úpravy', !!vp.upraveno);

test('přepočítat jde i jen vybrané položky – dohodnutá cena zůstane', (() => {
  const { v: vv } = staraVarianta();
  const r = cenikPrepocti(vv, DNES(), { cesty: ['C.powertechExt'], dnes: '2026-07-29' });
  return r.zmen === 1 && vv.data.cenik.powertechExt === DEFAULT_CENIK.powertechExt
    && vv.data.cenik.montazHodKc === STARA_MONTAZ;
})());

test('zamčená varianta se přepočítat nedá', (() => {
  const { v: vv } = staraVarianta();
  zamkniVariantu(vv, { typ: 'nabidkaOck', kdo: 'JV', cislo: '2026 - OPR - CN - 0500',
                       otisk: zamekOtisk({ celkemBezDph: 500000 }) });
  const r = cenikPrepocti(vv, DNES(), { dnes: '2026-07-29' });
  return r.zmen === 0 && vv.data.cenik.powertechExt === STARA_POWERTECH;
})());

test('přepočet zruší starou kvitanci – vztahovala se k jiným cenám', (() => {
  const { v: vv } = staraVarianta();
  cenikKvitovat(vv, cenikOtisk(vv.data), 'JV');
  cenikPrepocti(vv, DNES(), { dnes: '2026-07-29' });
  return !vv.cenikKvitance;
})());

/* ---------- razítko u nové varianty ---------- */
test('nová varianta se dá označit dnešním razítkem', (() => {
  const data = DNES();
  const r = cenikOznacJakoDnesni(data, { dnes: '2026-07-29', build: 'v29.7.21' });
  return r.datum === '2026-07-29' && r.otisk === cenikOtisk(data)
    && data.cenikRazitko.build === 'v29.7.21';
})());
test('přehled dá přednost razítku před datem zakázky', (() => {
  const { v: vv } = staraVarianta();
  cenikOznacJakoDnesni(vv.data, { dnes: '2026-03-01' });
  const pr = cenikPrehled(vv, DNES(), { dnes: '2026-07-29', datum: '2020-01-01' });
  return pr.datum === '2026-03-01';
})());

/* ---------- značka ukázkových dat jde s cenami ----------
 * Hlášení uživatele 31. 7. 2026: „připojení jsem potvrdil, ale ceník se stále
 * nestahuje" – a na obrazovce přitom svítily skutečné částky. Varianta vzniklá
 * bez připojené složky si nese zmrazenou kopii prázdného ceníku VČETNĚ značky.
 * Přepočet do ní zapsal ostré ceny, ale značku nechal být, takže lišta dál
 * tvrdila „není z čeho počítat" a dokument zůstal zablokovaný. Značka patří
 * k číslům: když se čísla vymění, musí se vyměnit i ona – oběma směry. */
function znackovanaVarianta() {
  const { zak, v } = staraVarianta();
  v.data.cenik.ukazkove = true; v.data.cenik.prazdny = true;
  v.data.proj.cenik.ukazkove = true; v.data.proj.cenik.prazdny = true;
  return { zak, v };
}
test('přepočet na ostrý ceník sundá značku z obou ceníků varianty', (() => {
  const { v } = znackovanaVarianta();
  cenikPrepocti(v, DNES(), { dnes: '2026-07-31' });
  return !v.data.cenik.ukazkove && !v.data.cenik.prazdny
    && !v.data.proj.cenik.ukazkove && !v.data.proj.cenik.prazdny;
})());
test('přepočet zpět na prázdné sestavení značku zase nasadí', (() => {
  const { v } = staraVarianta();
  const prazdny = DNES();
  prazdny.cenik.ukazkove = true; prazdny.cenik.prazdny = true;
  prazdny.proj.cenik.ukazkove = true; prazdny.proj.cenik.prazdny = true;
  cenikPrepocti(v, prazdny, { dnes: '2026-07-31' });
  return v.data.cenik.ukazkove === true && v.data.cenik.prazdny === true
    && v.data.proj.cenik.ukazkove === true;
})());
test('značka zmizí i tam, kde se žádná cena nezměnila (uživatelův zaseknutý stav)', (() => {
  const zak = zajistiZamek(novaZakazka());
  const v = zak.varianty[0];
  v.data.cenik.ukazkove = true; v.data.cenik.prazdny = true;
  v.data.proj.cenik.ukazkove = true; v.data.proj.cenik.prazdny = true;
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: '2026-07' });
  return cenikRozdily(v.data, DNES()).length === 0
    && !v.data.cenik.ukazkove && !v.data.proj.cenik.prazdny && r.znacky === 2;
})());
test('když se značka měnit nemusí, počítadlo zůstane na nule', (() => {
  const zak = zajistiZamek(novaZakazka());
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: '2026-07' });
  return r.znacky === 0;
})());
test('zamčená varianta si značku ponechá – je to doklad o odeslané nabídce', (() => {
  const { zak, v } = znackovanaVarianta();
  zamkniVariantu(v, { typ: 'nabidkaOck', kdy: '2026-07-30T08:00:00.000Z' });
  cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: '2026-07' });
  return v.data.cenik.ukazkove === true && v.data.cenik.prazdny === true;
})());
test('dohodnutá (kvitovaná) varianta se značky taky nedotkne', (() => {
  const { zak, v } = znackovanaVarianta();
  cenikKvitovat(v, cenikOtisk(v.data), { kdy: '2026-07-30T08:00:00.000Z' });
  cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: '2026-07' });
  return v.data.cenik.ukazkove === true;
})());

/* ---------- odolnost ---------- */
test('varianta bez dat nespadne', (() => {
  const pr = cenikPrehled({ id: 'x' }, DNES(), { dnes: '2026-07-29' });
  return pr.varovat === false && pr.souhrn.pocet === 0
    && cenikPrepocti({ id: 'x' }, DNES()).zmen === 0;
})());
test('chybějící ceník PROJ se doplní, ne že se ztratí', (() => {
  const { v: vv } = staraVarianta();
  delete vv.data.proj;
  cenikNastavHodnotu(vv.data, 'PC.marze', 0.4);
  return vv.data.proj.cenik.marze === 0.4;
})());

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail) process.exit(1);
