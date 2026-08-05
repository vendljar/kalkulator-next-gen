/* Test ZAK-2 – porovnání variant vedle sebe.
 * porovnaniVariant() nic nepočítá ani nemění; jen skládá už spočtené
 * hodnoty a dopočítává rozdíl proti řídící variantě. Testuje se proto
 * s podstrčenými výsledky – nezávisle na engine.js. */
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
const { porovnaniVariant, POROVNANI_METRIKY } = zk;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const blizko = (a, b, t = 1e-6) => a != null && b != null && Math.abs(a - b) < t;
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

/* pomocník: falešný výsledek vypocet()/vypocetProj() */
const mkOck = (zaklad, naklad, pripl = 0) => ({ souhrn: {
  zakladCena: zaklad, zakladNaklad: naklad, zakladMarze: zaklad - naklad,
  zakladDph: zaklad * 0.21, zakladSDph: zaklad * 1.21,
  priplatkyCena: pripl, priplatkyDph: pripl * 0.21, priplatkySDph: pripl * 1.21 } });
const mkProj = celkem => ({ souhrn: { naklad: 0, marze: 0, doprava: 0, cena: celkem, sleva: 0, celkem } });
const metrika = (p, klic) => p.metriky.find(m => m.klic === klic);

/* ---------- 1) základní tvar: 3 varianty, řídící uprostřed ---------- */
const zak = zk.novaZakazka();
zak.cislo = '2026 - OPR - CN - 0201';
const v1 = zak.varianty[0];
v1.nazev = 'A – základ';
const v2 = zk.novaVarianta('B – dražší'); zak.varianty.push(v2);
const v3 = zk.novaVarianta('C – levnější'); zak.varianty.push(v3);
[v1, v2, v3].forEach(v => { v.data.cenik.dph = 0.21; v.data.proj.cenik.dph = 0.12; v.data.sleva = sl.slevaDefault(); });
zk.nastavRidici(zak, v1.id);
zak.aktivni = v2.id;

const vyp = [
  { id: v1.id, ock: mkOck(1000000, 800000, 50000), proj: mkProj(100000) },
  { id: v2.id, ock: mkOck(1200000, 900000, 0),     proj: mkProj(120000) },
  { id: v3.id, ock: mkOck(900000, 750000, 0),      proj: mkProj(100000) },
];
const p = porovnaniVariant(zak, vyp);

test('řídící je varianta A', p.ridiciId === v1.id && p.ridiciNazev === 'A – základ');
test('sloupce v pořadí variant', p.varianty.map(x => x.nazev).join('|') === 'A – základ|B – dražší|C – levnější');
test('příznak otevřené varianty', p.varianty[1].aktivni === true && p.varianty[0].aktivni === false);
test('žádná varianta nehlásí chybu', p.varianty.every(x => !x.chyba));

/* ---------- 2) hodnoty bez slevy ---------- */
const mCelkem = metrika(p, 'celkemBezDph');
test('celkem bez DPH = OCK + PROJ', blizko(mCelkem.hodnoty[0], 1100000)
  && blizko(mCelkem.hodnoty[1], 1320000) && blizko(mCelkem.hodnoty[2], 1000000), mCelkem.hodnoty);
const mSDph = metrika(p, 'celkemSDph');
/* Audit 1. 8. 2026 (N3): DPH se počítá po částech – OCK sazbou z ceníku OCK,
 * PROJ sazbou z ceníku PROJ. Sazby jsou tu schválně různé (21 % / 12 %), aby
 * test spadl, kdyby někdo na celek zase pustil jedinou sazbu. */
test('DPH OCK v Kč sazbou OCK', blizko(metrika(p, 'dphOckKc').hodnoty[0], 1000000 * 0.21),
  metrika(p, 'dphOckKc') && metrika(p, 'dphOckKc').hodnoty[0]);
test('DPH PROJ v Kč sazbou PROJ', blizko(metrika(p, 'dphProjKc').hodnoty[0], 100000 * 0.12),
  metrika(p, 'dphProjKc') && metrika(p, 'dphProjKc').hodnoty[0]);
test('sazba DPH OCK z ceníku OCK', blizko(metrika(p, 'dphOckSazba').hodnoty[0], 0.21));
test('sazba DPH PROJ z ceníku PROJ', blizko(metrika(p, 'dphProjSazba').hodnoty[0], 0.12));
test('celkem s DPH = základ + DPH OCK + DPH PROJ',
  blizko(mSDph.hodnoty[0], 1100000 + 210000 + 12000), mSDph.hodnoty[0]);
test('jediná společná sazba DPH už v metrikách není',
  !metrika(p, 'dphSazba') && !metrika(p, 'dphKc'));
test('příplatky se do celku NEzapočítávají', blizko(metrika(p, 'priplatky').hodnoty[0], 50000)
  && blizko(mCelkem.hodnoty[0], 1100000));

/* ---------- 3) rozdíl proti řídící variantě ---------- */
test('řídící sloupec nemá rozdíl', mCelkem.rozdily[0] === null);
test('B je o 220 000 dráž', blizko(mCelkem.rozdily[1], 220000), mCelkem.rozdily[1]);
test('C je o 100 000 levněji', blizko(mCelkem.rozdily[2], -100000), mCelkem.rozdily[2]);
test('rozdíl v % proti řídící', blizko(mCelkem.rozdilyPct[1], 0.2, 1e-9), mCelkem.rozdilyPct[1]);
test('procentní metriky rozdíl nemají', metrika(p, 'slevaPct').rozdily.every(r => r === null)
  && metrika(p, 'dphOckSazba').rozdily.every(r => r === null)
  && metrika(p, 'dphProjSazba').rozdily.every(r => r === null));

/* ---------- 4) marže a náklad ---------- */
test('náklad OCK se přenáší', blizko(metrika(p, 'ockNaklad').hodnoty[0], 800000));
test('marže OCK bez slevy = základ − náklad', blizko(metrika(p, 'marzeKc').hodnoty[0], 200000));
test('marže v % bez slevy', blizko(metrika(p, 'marzePct').hodnoty[0], 0.2, 1e-9));
test('náklad a marže jsou admin-only', ['ockNaklad', 'marzeKc', 'marzePct']
  .every(k => POROVNANI_METRIKY.find(m => m.klic === k).admin === true));

/* ---------- 5) schválená sleva se promítne, neschválená ne ---------- */
v2.data.sleva = { procenta: 10, role: 'Obchodní ředitel', stav: 'schváleno' };
v3.data.sleva = { procenta: 10, role: 'Obchodník', stav: 'čeká na schválení' };
const p2 = porovnaniVariant(zak, vyp);
test('schválená sleva 10 % → sleva v Kč', blizko(metrika(p2, 'slevaKc').hodnoty[1], 120000));
test('schválená sleva sníží cenu OCK', blizko(metrika(p2, 'ockPoSleve').hodnoty[1], 1080000));
test('schválená sleva sníží celkem', blizko(metrika(p2, 'celkemBezDph').hodnoty[1], 1200000));
test('čekající sleva se NEuplatní', blizko(metrika(p2, 'slevaKc').hodnoty[2], 0)
  && blizko(metrika(p2, 'ockPoSleve').hodnoty[2], 900000));
test('marže se počítá až po slevě', blizko(metrika(p2, 'marzeKc').hodnoty[1], 180000), metrika(p2, 'marzeKc').hodnoty[1]);
test('rozdíl se přepočítá po slevě', blizko(metrika(p2, 'celkemBezDph').rozdily[1], 100000));

/* ---------- 6) změna řídící varianty překlopí referenci ---------- */
zk.nastavRidici(zak, v3.id);
const p3 = porovnaniVariant(zak, vyp);
test('nová řídící = C', p3.ridiciId === v3.id);
test('rozdíl A proti nové řídící', blizko(metrika(p3, 'celkemBezDph').rozdily[0], 100000),
  metrika(p3, 'celkemBezDph').rozdily[0]);
test('řídící C nemá rozdíl', metrika(p3, 'celkemBezDph').rozdily[2] === null);
zk.nastavRidici(zak, v1.id);

/* ---------- 7) chybějící / nespočitatelná varianta ---------- */
const pChyba = porovnaniVariant(zak, [vyp[0], vyp[1], { id: v3.id, ock: null, proj: null }]);
test('nespočitatelná varianta hlásí chybu', !!pChyba.varianty[2].chyba, pChyba.varianty[2].chyba);
test('nespočitatelná varianta má prázdné hodnoty', metrika(pChyba, 'celkemBezDph').hodnoty[2] === null);
// pozor: varianta B má z bodu 5 schválenou slevu 10 %, takže celkem = 1 080 000 + 120 000
test('ostatní sloupce chybou netrpí', blizko(metrika(pChyba, 'celkemBezDph').hodnoty[1], 1200000),
  metrika(pChyba, 'celkemBezDph').hodnoty[1]);

/* ---------- 8) jediná varianta ---------- */
const zak1 = zk.novaZakazka();
zak1.varianty[0].data.cenik.dph = 0.21;
const p1 = porovnaniVariant(zak1, [{ id: zak1.varianty[0].id, ock: mkOck(500000, 400000), proj: mkProj(0) }]);
test('jedna varianta → jeden sloupec, žádné rozdíly', p1.varianty.length === 1
  && p1.metriky.every(m => m.rozdily.every(r => r === null)));

/* ---------- 9) neměnnost dat (jen čtení) ---------- */
const otisk = JSON.stringify(zak);
porovnaniVariant(zak, vyp);
test('porovnání nemění zakázku', JSON.stringify(zak) === otisk);

/* ---------- 10) skutečný výpočet enginu projde bez výjimky ---------- */
const zakR = zk.novaZakazka();
const vR = zakR.varianty[0]; vR.data.ock.fixes = true;
const vR2 = zk.novaVarianta('Varianta 2', JSON.parse(JSON.stringify(vR.data)));
vR2.data.ock.zadani.zdvih = (vR.data.ock.zadani.zdvih || 0) + 3;   // vyšší šachta = víc profilů i skla
zakR.varianty.push(vR2);
const vypR = zakR.varianty.map(v => ({ id: v.id,
  ock: eng.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes),
  proj: ep.vypocetProj(v.data.proj.zadani, v.data.proj.cenik) }));
const pR = porovnaniVariant(zakR, vypR);
const cR = metrika(pR, 'celkemBezDph');
test('reálná data: obě varianty spočteny', cR.hodnoty.every(h => h != null && h > 0), cR.hodnoty);
test('reálná data: vyšší zdvih = dráž', cR.rozdily[1] > 0, cR.rozdily[1]);
test('reálná data: rozdíl sedí na hodnoty', blizko(cR.rozdily[1], cR.hodnoty[1] - cR.hodnoty[0], 1e-6));

/* ---------- 11) všechny popisy metrik jsou ve slovníku ---------- */
const pk = require('./preklad.js');
const chybi = POROVNANI_METRIKY.map(m => m.popis)
  .concat(['Porovnání variant', 'řídící varianta', 'rozdíl', 'Tisk / Uložit jako PDF',
           'Rozdíl je počítán proti řídící variantě.', 'Ceny jsou v Kč.'])
  .filter(s => ['en', 'de', 'fr'].some(j => !pk.trStav(s, j).prelozeno));
test('popisky porovnání mají překlad v EN/DE/FR', chibiPrazdne(chybi), chybi.join(' | '));
function chibiPrazdne(a) { return a.length === 0; }

/* ============================================================
 * ZAK-2b – detail konkrétních položek (porovnaniPolozek)
 * ============================================================ */
const { porovnaniPolozek, POROVNANI_SKUPINY, POROVNANI_ATRIBUTY } = zk;

/* pomocník: položka a falešný výsledek vypocet() se seznamy položek */
const pol = (nazev, mnozstvi, cena, extra) => Object.assign(
  { nazev, origNazev: nazev, mnozstvi, cena, naklad: mnozstvi * cena,
    sMarzi: mnozstvi * cena * 1.3, vlastni: false }, extra || {});
const mkOckP = (o) => ({
  souhrn: { zakladCena: 0, zakladNaklad: 0 },
  sekce: { hrubaOck: o.hrubaOck || [], oplasteni: o.oplasteni || [],
           volitelne: (o.volitelneKatalog || []).filter(x => x.zahrnuto !== false), rezie: o.rezie || [] },
  volitelneKatalog: o.volitelneKatalog || [], priplatky: o.priplatky || [] });

const zakP = zk.novaZakazka();
const pv1 = zakP.varianty[0]; pv1.nazev = 'Řídící';
const pv2 = zk.novaVarianta('Odlišná'); zakP.varianty.push(pv2);
const pv3 = zk.novaVarianta('Stejná'); zakP.varianty.push(pv3);
zk.nastavRidici(zakP, pv1.id);

const zakladPolozky = {
  hrubaOck: [pol('PROFILY', 100, 80), pol('PLECHY', 20, 150)],
  oplasteni: [pol('SKLO BOKY', 50, 1900)],
  rezie: [pol('REŽIE KANCELÁŘE', 1, 12000)],
  volitelneKatalog: [pol('PŘECHODOVÉ PLECHY', 10, 650, { key: 'prechodove', zahrnuto: true }),
                     pol('LEŠENÍ - vnější', 100, 400, { key: 'leseniVnejsi', zahrnuto: false })],
  priplatky: [pol('Sklo VSG', 30, 250, { key: 'vsgFolie' }),
              pol('Ventilátor', 0, 22000, { key: 'ventilator' })],
};
const kopie = o => JSON.parse(JSON.stringify(o));

const zmenene = kopie(zakladPolozky);
zmenene.hrubaOck[0].mnozstvi = 120;                       // změna množství
zmenene.hrubaOck[0].sMarzi = 120 * 80 * 1.3;
zmenene.hrubaOck[0].naklad = 120 * 80;
zmenene.hrubaOck[1].nazev = 'PLECHY POZINK';              // přejmenování
zmenene.oplasteni[0].cena = 2100;                         // změna jednotkové ceny
zmenene.rezie.push(pol('MIMOŘÁDNÁ KOORDINACE', 8, 1200, { vlastni: true }));  // přidáno
zmenene.volitelneKatalog[0].zahrnuto = false;             // odebráno odškrtnutím
zmenene.volitelneKatalog[1].zahrnuto = true;              // přidáno zaškrtnutím
zmenene.priplatky[1].mnozstvi = 1;                        // příplatek se začal nabízet
zmenene.priplatky[1].naklad = 22000;
zmenene.priplatky[1].sMarzi = 22000 * 1.3;

const vypP = [
  { id: pv1.id, ock: mkOckP(kopie(zakladPolozky)) },
  { id: pv2.id, ock: mkOckP(zmenene) },
  { id: pv3.id, ock: mkOckP(kopie(zakladPolozky)) },
];
const pp = porovnaniPolozek(zakP, vypP);
const skup = k => pp.skupiny.find(g => g.klic === k);
const polozka = (k, iVar, popis) => skup(k).varianty[iVar].polozky.find(x => x.popis === popis);

/* ---------- 12) tvar výsledku ---------- */
test('detail: řídící je první varianta', pp.ridiciId === pv1.id && pp.ridiciNazev === 'Řídící');
test('detail: skupiny odpovídají definici',
  pp.skupiny.map(g => g.klic).join('|') === POROVNANI_SKUPINY.map(g => g.klic).join('|'));
test('detail: sloupce pro všechny varianty', pp.sloupce.length === 3 && pp.souhrn.length === 3);
test('detail: řídící varianta nemá vlastní rozdíly',
  pp.souhrn[0].pocty.pridano === 0 && pp.souhrn[0].pocty.odebrano === 0 && pp.souhrn[0].pocty.zmeneno === 0);

/* ---------- 13) shodná varianta ---------- */
test('detail: shodná varianta je označena bezeZmen', pp.souhrn[2].bezeZmen === true);
test('detail: shodná varianta nemá žádné vypsané položky',
  pp.skupiny.every(g => g.varianty[2].polozky.length === 0));
test('detail: shodné položky se počítají', pp.souhrn[2].pocty.shodne > 0, pp.souhrn[2].pocty.shodne);

/* ---------- 14) změna množství, ceny a názvu ---------- */
const profily = polozka('hrubaOck', 1, 'PROFILY');
test('detail: změna množství je zachycena',
  profily && profily.stav === 'zmeneno' && profily.zmeny.indexOf('mnozstvi') >= 0, profily && profily.zmeny);
test('detail: původní i nová hodnota množství',
  blizko(profily.mnozstviRidici, 100) && blizko(profily.mnozstvi, 120));
const plechy = polozka('hrubaOck', 1, 'PLECHY POZINK');
test('detail: přejmenovaná položka se páruje podle origNazev',
  plechy && plechy.stav === 'zmeneno' && plechy.zmeny.indexOf('nazev') >= 0
  && plechy.nazevRidici === 'PLECHY', plechy && plechy.zmeny);
const sklo = polozka('oplasteni', 1, 'SKLO BOKY');
test('detail: změna jednotkové ceny je zachycena',
  sklo && sklo.zmeny.indexOf('cena') >= 0 && blizko(sklo.cenaRidici, 1900) && blizko(sklo.cena, 2100));

/* ---------- 15) přidání a odebrání ---------- */
const koordinace = polozka('rezie', 1, 'MIMOŘÁDNÁ KOORDINACE');
test('detail: nová ruční položka je přidáno',
  koordinace && koordinace.stav === 'pridano' && koordinace.vlastni === true);
test('detail: přidaná položka nemá hodnoty řídící varianty',
  koordinace.mnozstviRidici == null && koordinace.sMarziRidici == null);
const prechodove = polozka('volitelne', 1, 'PŘECHODOVÉ PLECHY');
test('detail: odškrtnutá volitelná položka je odebráno',
  prechodove && prechodove.stav === 'odebrano', prechodove && prechodove.stav);
const leseni = polozka('volitelne', 1, 'LEŠENÍ - vnější');
test('detail: zaškrtnutá volitelná položka je přidáno',
  leseni && leseni.stav === 'pridano', leseni && leseni.stav);
const ventilator = polozka('priplatky', 1, 'Ventilátor');
test('detail: příplatek s nulovým množstvím se považuje za nenabízený',
  ventilator && ventilator.stav === 'pridano', ventilator && ventilator.stav);

/* ---------- 16) rozdíly v Kč ---------- */
test('detail: rozdíl přidané položky = její cena', blizko(koordinace.rozdilKc, 8 * 1200 * 1.3));
test('detail: rozdíl odebrané položky je záporný', prechodove.rozdilKc < 0, prechodove.rozdilKc);
test('detail: rozdíl skupiny = součet vypsaných položek',
  blizko(skup('rezie').varianty[1].rozdilKc,
         skup('rezie').varianty[1].polozky.reduce((a, x) => a + x.rozdilKc, 0)));
test('detail: příplatky se počítají mimo celek',
  blizko(pp.souhrn[1].rozdilMimoCelek, skup('priplatky').varianty[1].rozdilKc)
  && Math.abs(pp.souhrn[1].rozdilMimoCelek) > 0.5);
test('detail: souhrn v Kč nezahrnuje příplatky',
  blizko(pp.souhrn[1].rozdilKc, ['hrubaOck', 'oplasteni', 'volitelne', 'rezie']
    .reduce((a, k) => a + skup(k).varianty[1].rozdilKc, 0)));

/* ---------- 17) položky beze změny se nevypisují ---------- */
test('detail: vypsané položky nikdy nemají stav shodne',
  pp.skupiny.every(g => g.varianty.every(v => v.polozky.every(x => x.stav !== 'shodne'))));
test('detail: počty sedí na délku seznamu',
  pp.skupiny.every(g => g.varianty.every(v =>
    v.polozky.length === v.pocty.pridano + v.pocty.odebrano + v.pocty.zmeneno)));

/* ---------- 18) nespočtená varianta ---------- */
const ppChyba = porovnaniPolozek(zakP, [{ id: pv1.id, ock: mkOckP(kopie(zakladPolozky)) },
                                        { id: pv2.id, ock: null }, { id: pv3.id, ock: null }]);
test('detail: nespočtená varianta hlásí chybu a nespadne',
  ppChyba.souhrn[1].chyba !== '' && ppChyba.skupiny.every(g => g.varianty[1].polozky.length === 0));

/* ---------- 19) nemění vstupní data ---------- */
const otiskP = JSON.stringify({ zakP, vypP });
porovnaniPolozek(zakP, vypP);
test('detail: porovnání nemění zakázku ani výsledky', JSON.stringify({ zakP, vypP }) === otiskP);

/* ---------- 20) reálná data z enginu ---------- */
const zakRP = zk.novaZakazka();
const rp1 = zakRP.varianty[0];
const rp2 = zk.novaVarianta('S lešením', JSON.parse(JSON.stringify(rp1.data)));
rp2.data.ock.zadani.volitelne.leseniVnejsi = true;
zakRP.varianty.push(rp2);
const vypRP = zakRP.varianty.map(v => ({ id: v.id,
  ock: eng.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes) }));
const pRP = porovnaniPolozek(zakRP, vypRP);
const volRP = pRP.skupiny.find(g => g.klic === 'volitelne').varianty[1];
test('reálná data: zapnuté vnější lešení je přidaná volitelná položka',
  volRP.polozky.some(x => x.stav === 'pridano' && /LEŠENÍ/i.test(x.popis)),
  volRP.polozky.map(x => x.stav + ':' + x.popis).join(' | '));
test('reálná data: všechny vypsané položky mají popis',
  pRP.skupiny.every(g => g.varianty.every(v => v.polozky.every(x => x.popis && x.popis.length))));

/* ---------- 21) popisky detailu položek jsou ve slovníku ---------- */
const chybiP = POROVNANI_SKUPINY.map(g => g.popis)
  .concat(POROVNANI_ATRIBUTY.map(a => a.popis))
  .concat(['Detail položek', 'Stav', 'přidáno', 'odebráno', 'změněno', 'beze změny',
           'Varianta je položkově shodná s řídící variantou.', 'Položky beze změny se neuvádějí.'])
  .filter(s => ['en', 'de', 'fr'].some(j => !pk.trStav(s, j).prelozeno));
test('popisky detailu položek mají překlad v EN/DE/FR', chibiPrazdne(chybiP), chybiP.join(' | '));

/* ---------- zakázka jen projekce (2. 8. 2026) ---------- */
{
  const zakJP = zk.novaZakazka();
  zakJP.cislo = '2026 - OPR - CN - 0301';
  zakJP.jenProj = true;
  const vJP = zakJP.varianty[0];
  vJP.data.cenik.dph = 0.21; vJP.data.proj.cenik.dph = 0.12; vJP.data.sleva = sl.slevaDefault();
  const pJP = porovnaniVariant(zakJP, [{ id: vJP.id, ock: mkOck(1000000, 800000), proj: mkProj(200000) }]);
  const vv = pJP.varianty[0];
  test('jen PROJ: část OCK se neporovnává', vv.hodnoty.ockZaklad == null
    && vv.hodnoty.ockPoSleve == null && vv.hodnoty.dphOckKc == null,
    JSON.stringify(vv.hodnoty));
  test('jen PROJ: celkem bez DPH = jen projekce', blizko(vv.hodnoty.celkemBezDph, 200000));
  test('jen PROJ: celkem s DPH sazbou PROJ', blizko(vv.hodnoty.celkemSDph, 200000 * 1.12));
  test('jen PROJ: chybějící OCK není chyba', !vv.chyba, vv.chyba);
}

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
