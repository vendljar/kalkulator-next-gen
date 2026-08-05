/* Test #33 – kontrola logických chyb před odesláním nabídky.
 *
 * Deset pravidel, která hlídají to, co výpočet spočítá bez mrknutí oka, ale
 * co člověku nedává smysl: šachta o jednom nástupišti, opláštění bez
 * konstrukce, dveře širší než šachta, prázdná hlavička. Kalkulačka je počítá
 * poslušně dál – a právě proto se to při čtení výsledku snadno přehlédne.
 *
 * Tři věci, na kterých to stojí a které se snadno rozejdou:
 *
 *  1) NIC SE NEBLOKUJE (zadání Ad2 z 30. 7. 2026: „pouze rozsviť varování
 *     před nabídkou"). Všechna pravidla jsou úroveň 2 – varování. Kdyby se
 *     sem jednou vloudila tvrdá zábrana, uživatel by ji obešel tím, že by
 *     zadal nesmysl jinam, a hlídání by ztratilo důvěru.
 *  2) Čísla o nákladech a marži nepatří běžnému uživateli (stejné pravidlo
 *     jako u #36). Varování ale vidět musí – nabídku posílá právě on. Proto
 *     dvě podoby textu a test, že v té nepodrobné nezůstane ani koruna.
 *  3) Odklepnuté varování platí jen na to, co se odklepávalo. Kdyby
 *     potvrzení umlčelo i problém, který přibyl potom, byla by to tichá
 *     ztráta pojistky – horší než žádná pojistka.
 *
 * Očekávání se odvozují ze zadání a ceníku, ne z opsaných čísel: v repozitáři
 * jsou ukázkové ceny a opsaná hodnota by hlídala vzorek místo pravidla.
 */
const fs = require('fs');
const eng = require('./engine.js');
const ep = require('./engine_proj.js');

/* Modul si sousedy bere přes globální jména – v prohlížeči je všechno v jednom
 * skriptu, v Node se to musí podstrčit stejně, jako to udělá sestavení. */
const sl = require('./sleva.js');
global.slevaPodil = sl.slevaPodil;
global.slevaVyhodnot = sl.slevaVyhodnot;
const zo = require('./zaokrouhleni.js');
global.cenaNabidkyOck = zo.cenaNabidkyOck;
global.cenaNabidkyProj = zo.cenaNabidkyProj;
const mz = require('./marze.js');
const ZC = require('./zkusebni_cenik.js');
global.marzePrehled = mz.marzePrehled;
global.marzeText = mz.marzeText;
global.marzeKc = mz.marzeKc;
global.marzePct = mz.marzePct;
const uk = require('./ukazkove.js');
global.ukazkoveStav = uk.ukazkoveStav;
global.ukazkoveKratce = uk.ukazkoveKratce;
const zk = require('./zakazka.js');
global.hlavickaVyplneno = zk.hlavickaVyplneno;

const kt = require('./kontroly.js');
const { KONTROLY_UROVEN, KONTROLY_UROVEN_ZABRANA, KONTROLY_VYSKA_DVERI,
        kontrolyPravidla, kontrolyProved,
        kontrolyText, kontrolyPotvrzeni, kontrolyPotvrzeniPlati } = kt;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

/* ---------- podklad: zdravá zakázka, na které nesmí svítit nic ---------- */
const kopie = o => JSON.parse(JSON.stringify(o));
const NAST = { slevy: { minMarze: mz.MARZE_MIN_VYCHOZI, maxGlobalni: 0.30, stropy: { 'Obchodník': 0.05 } } };

/* Ceníky se zbaví značky ukázkových dat – jinak by K9 svítila v každém testu
 * a zdravý podklad by neexistoval. Že ji výchozí vzorek nese, hlídá #40. */
const CENIK = ZC.zkusebniCenik();
const CENIK_PROJ = ZC.zkusebniCenikProj();

function ctxZdravy(zmeny) {
  const zadani = kopie(eng.DEFAULT_ZADANI);
  const zadaniProj = kopie(ep.DEFAULT_ZADANI_PROJ);
  const ctx = {
    zadani, cenik: CENIK, cenikProj: CENIK_PROJ,
    projZadani: zadaniProj,
    sleva: sl.slevaDefault(),
    nast: NAST,
    zak: { cislo: '2026 - OPR - CN - 014', nazevAkce: 'Bytový dům Kolbenova',
           objednatel: 'Stavby s.r.o.' },
    zaokr: null,
  };
  if (zmeny) zmeny(ctx);
  /* Výpočty se dělají až po úpravě zadání, aby odvozené hodnoty odpovídaly. */
  try { ctx.vysledek = eng.vypocet(ctx.zadani, ctx.cenik, JEKLY, true); } catch (e) { ctx.vysledek = null; }
  try { ctx.projVysledek = ep.vypocetProj(ctx.projZadani, ctx.cenikProj); } catch (e) { ctx.projVysledek = null; }
  return ctx;
}

const kody = v => v.nalezy.map(n => n.kod);
const svitiJen = (v, kod) => kody(v).length === 1 && kody(v)[0] === kod;

/* ---------- 0) globální sleva PROJ nad maximum (N4, audit 1. 8. 2026) ----------
 * Pole má v UI meze, ale data přijdou i importem nebo starší zakázkou –
 * kontrola proto hlídá hodnotu v datech, ne jen formulář. Jen varování,
 * nic se neblokuje (pravidlo #10). */
{
  const nadMax = kontrolyProved(ctxZdravy(c => { c.projZadani.slevaPct = -50; }));
  test('sleva PROJ nad maximum se ohlásí', kody(nadMax).includes('slevaProjMax'),
    kody(nadMax).join(','));
  test('sleva PROJ nad maximum jen varuje, neblokuje', nadMax.brani === false);
  const vMezich = kontrolyProved(ctxZdravy(c => { c.projZadani.slevaPct = -20; }));
  test('sleva PROJ v mezích neruší', !kody(vMezich).includes('slevaProjMax'),
    kody(vMezich).join(','));
  /* Bez nastavení platí výchozí maximum 30 % – stejná hodnota jako
   * NAST.slevy.maxGlobalni v ui/common.js (hlídá se textově níže). */
  const bezNast = kontrolyProved(ctxZdravy(c => {
    c.projZadani.slevaPct = -50; c.nast = { slevy: { minMarze: 0.10 } }; }));
  test('maximum platí i bez nastavení (výchozích 30 %)',
    kody(bezNast).includes('slevaProjMax'), kody(bezNast).join(','));
  const prirazka = kontrolyProved(ctxZdravy(c => { c.projZadani.slevaPct = 15; }));
  test('kladné procento (přirážka) maximum slevy neporušuje',
    !kody(prirazka).includes('slevaProjMax'), kody(prirazka).join(','));
}

/* výchozí maxGlobalni v ui/common.js se musí shodovat se záložním v kontroly.js */
const fs2 = require('fs');
const COMMON_TXT = fs2.readFileSync(__dirname + '/ui/common.js', 'utf8');
const mMax = COMMON_TXT.match(/maxGlobalni:\s*([0-9.]+)/);
test('ui/common.js má výchozí maxGlobalni', !!mMax && Math.abs(parseFloat(mMax[1]) - 0.30) < 1e-9,
  mMax && mMax[1]);

/* ---------- 0b) zakázka jen projekce (bez OCK), 2. 8. 2026 ----------
 * „Někdy jí prodáváme zvlášť." Když je zakázka označená jako jen projekce,
 * pravidla nad zadáním OCK mlčí — jinak by každá čistě projekční nabídka
 * svítila varováními o šachtě, kterou nikdo neprodává. Pravidla PROJ a
 * zábrana ukázkového ceníku platí dál. */
{
  const jenProj = kontrolyProved(ctxZdravy(c => {
    c.jenProj = true;
    c.zadani.sirka = 0;                       // rozbité zadání OCK…
    c.projZadani.slevaPct = -50;              // …a zároveň chyba v PROJ
  }));
  test('u zakázky jen PROJ pravidla OCK mlčí', !kody(jenProj).includes('rozmery'),
    kody(jenProj).join(','));
  test('pravidla PROJ platí dál', kody(jenProj).includes('slevaProjMax'),
    kody(jenProj).join(','));
  const sOck = kontrolyProved(ctxZdravy(c => { c.zadani.sirka = 0; }));
  test('bez příznaku se OCK hlídá jako dřív', kody(sOck).includes('rozmery'));
}

/* ---------- 1) katalog pravidel ---------- */
const pravidla = kontrolyPravidla();
/* Počet je tu schválně napevno: pravidlo přidané omylem (např. dvakrát
 * zkopírovaný blok) se jinak nepozná. Při vědomém přidání pravidla se
 * číslo zvedne spolu s testem toho pravidla. 12 = 10 z vlny B + „ico"
 * + „atypBezCeny" (obojí 30. 7. 2026; atypBezCeny má vlastní sadu
 * v test_atyp_katalog.js). 13. pravidlo „slevaProjMax" přibylo po auditu
 * 1. 8. 2026 (N4): globální sleva PROJ nad firemní maximum. */
test('pravidel je třináct', pravidla.length === 13, pravidla.length);
test('kódy pravidel jsou jedinečné',
  new Set(pravidla.map(p => p.kod)).size === pravidla.length,
  pravidla.map(p => p.kod).join(','));
test('každé pravidlo se umí pojmenovat a říct, kam patří',
  pravidla.every(p => p.kod && p.nazev && p.kde), JSON.stringify(pravidla));

/* ---------- 2) zdravá zakázka mlčí ---------- */
const zdravy = kontrolyProved(ctxZdravy());
test('nad zdravou zakázkou se nerozsvítí nic',
  zdravy.varovat === false && zdravy.nalezy.length === 0, JSON.stringify(kody(zdravy)));
test('mlčení znamená prázdný text', kontrolyText(zdravy) === '' && kontrolyText(zdravy, { cisla: true }) === '');
test('prázdný kontext se nehádá', kontrolyProved(null).varovat === false
  && kontrolyProved({}).varovat === false);

/* ---------- 3) jednotlivá pravidla ---------- */

/* K1 – nesmyslný rozměr. Nula i záporné číslo projdou výpočtem bez chyby. */
const k1 = kontrolyProved(ctxZdravy(c => { c.zadani.sirka = 0; }));
test('K1 pozná nulový rozměr', svitiJen(k1, 'rozmery'), JSON.stringify(kody(k1)));
test('K1 řekne, který rozměr to je', /šířk/i.test(k1.nalezy[0].text), k1.nalezy[0].text);
const k1b = kontrolyProved(ctxZdravy(c => { c.zadani.prohluben = -0.5; }));
test('K1 pozná zápornou prohlubeň', kody(k1b).includes('rozmery'), JSON.stringify(kody(k1b)));
test('K1 nechá nulovou prohlubeň projít',
  !kody(kontrolyProved(ctxZdravy(c => { c.zadani.prohluben = 0; }))).includes('rozmery'));

/* K2 – jedno nástupiště. Výška podlaží by se dělila nulou. */
const k2 = kontrolyProved(ctxZdravy(c => { c.zadani.nastupiste = 1; }));
test('K2 pozná jediné nástupiště', kody(k2).includes('stanice'), JSON.stringify(kody(k2)));

/* K3 – výšky nesedí. Ne „součet nesedí s výškou šachty": výška šachty je
 * v engine.js DOPOČÍTANÁ (prejezd + zdvih + prohlubeň), takže se s vlastním
 * součtem rozejít nemůže. Rozejít se dají dvě jiné věci, a ty se hlídají. */
const k3 = kontrolyProved(ctxZdravy(c => { c.zadani.nastupiste = 12; }));
test('K3 pozná nízkou světlou výšku podlaží', kody(k3).includes('vysky'), JSON.stringify(kody(k3)));
test('K3 se odvolá na dveřní otvor',
  new RegExp(String(KONTROLY_VYSKA_DVERI).replace('.', '[.,]')).test(k3.nalezy.find(n => n.kod === 'vysky').text),
  k3.nalezy.find(n => n.kod === 'vysky').text);
const k3b = kontrolyProved(ctxZdravy(c => { c.zadani.cistyVstupMm = 1600; }));
test('K3 pozná dveře širší než šachta', kody(k3b).includes('vysky'), JSON.stringify(kody(k3b)));
test('K3 nad výchozím zadáním mlčí', !kody(zdravy).includes('vysky'));

/* K4 – opláštění bez konstrukce. Sáhne se přímo do součtů sekcí, protože
 * přesně tak to vypadá v nabídce: sklo je, nosit ho nemá co. */
const ctx4 = ctxZdravy();
ctx4.vysledek = kopie(ctx4.vysledek);
ctx4.vysledek.souctySekci.hrubaOck = { naklad: 0, marze: 0, sMarzi: 0 };
const k4b = kontrolyProved(ctx4);
test('K4 pozná opláštění bez konstrukce', kody(k4b).includes('oplasteniBezKonstrukce'),
  JSON.stringify(kody(k4b)));
test('K4 nad zdravou zakázkou mlčí', !kody(zdravy).includes('oplasteniBezKonstrukce'));

/* K5 – ATYP bez jediné hodiny navíc. Přirážka z ceníku se počítá sama,
 * ale práci navíc nikdo nezadal – to je typicky zapomenutá položka. */
const k5 = kontrolyProved(ctxZdravy(c => { c.zadani.atyp = true; }));
test('K5 pozná atyp bez práce navíc', kody(k5).includes('atypBezProjekce'), JSON.stringify(kody(k5)));
test('K5 zhasne, jakmile se hodiny doplní',
  !kody(kontrolyProved(ctxZdravy(c => { c.zadani.atyp = true; c.zadani.projekceAtypHod = 8; })))
    .includes('atypBezProjekce'));

/* K6 – sleva mimo rozsah. Záporné procento slevaVyhodnot() tiše ořízne na
 * nulu, takže se musí sáhnout na zadanou hodnotu, ne na výsledek. */
const k6 = kontrolyProved(ctxZdravy(c => { c.sleva = { procenta: -5, role: 'Obchodník', stav: '' }; }));
test('K6 pozná zápornou slevu', kody(k6).includes('sleva'), JSON.stringify(kody(k6)));
const k6b = kontrolyProved(ctxZdravy(c => { c.sleva = { procenta: 140, role: 'Obchodník', stav: '' }; }));
test('K6 pozná slevu přes sto procent', kody(k6b).includes('sleva'), JSON.stringify(kody(k6b)));
const k6c = kontrolyProved(ctxZdravy(c => {
  c.sleva = { procenta: 12, role: 'Obchodník', stav: 'čeká na schválení' };
}));
test('K6 pozná slevu nad stropem role bez schválení', kody(k6c).includes('sleva'), JSON.stringify(kody(k6c)));
test('K6 mlčí u slevy v mezích a schválené',
  !kody(kontrolyProved(ctxZdravy(c => {
    c.sleva = { procenta: 3, role: 'Obchodník', stav: 'schváleno automaticky' };
  }))).includes('sleva'));

/* K7 – marže pod minimem. Logika se nepřepisuje, bere se z #36 (marze.js);
 * dvě různá minima v jedné aplikaci by byla horší než žádné. */
const k7 = kontrolyProved(ctxZdravy(c => {
  c.cenik = Object.assign(kopie(CENIK), { marze: 0.03 });
}));
test('K7 pozná marži pod firemním minimem', kody(k7).includes('marze'), JSON.stringify(kody(k7)));
test('K7 nad zdravou zakázkou mlčí', !kody(zdravy).includes('marze'));

/* K8 – cena pod nákladem. Je to zvláštní pravidlo, i když #36 to taky vidí:
 * „malá marže" a „prodělek" se v hlavě čtou jinak. */
const k8 = kontrolyProved(ctxZdravy(c => {
  c.cenik = Object.assign(kopie(CENIK), { marze: 0.02 });
  c.sleva = { procenta: 40, role: 'Ředitel', stav: 'schváleno' };
}));
test('K8 pozná cenu pod nákladem', kody(k8).includes('cenaPodNakladem'), JSON.stringify(kody(k8)));
test('K8 nad zdravou zakázkou mlčí', !kody(zdravy).includes('cenaPodNakladem'));

/* K9 – ceník, který není ostrý. Poslední pojistka před odesláním; značku
 * vyhodnocuje #40, tady se jen připomíná na místě, kde dokument odchází.
 *
 * Od 30. 7. 2026 má dvě polohy a rozdíl mezi nimi je celý smysl pravidla:
 *   – ceník ze sestavení je PRÁZDNÝ (samé nuly) → tvrdá zábrana, nabídka
 *     nesmí vzniknout („za žádnou cenu"),
 *   – ceník je vyplněný, ale nese značku vymyšlených dat → varování.
 * Druhá poloha zůstává reálná: zmrazená kopie u starší varianty, spočítaná
 * ještě z ukázkových cen. */
const CENIK_PRAZDNY = kopie(eng.DEFAULT_CENIK);              // ukazkove + prazdny
const CENIK_UKAZKOVY = Object.assign(ZC.zkusebniCenik(), { ukazkove: true }); // čísla, ale ne ostrá

const k9 = kontrolyProved(ctxZdravy(c => { c.cenik = CENIK_PRAZDNY; }));
test('K9 pozná ceník, který není ostrý', kody(k9).includes('ukazkovyCenik'), JSON.stringify(kody(k9)));
const n9 = k9.nalezy.find(n => n.kod === 'ukazkovyCenik');
test('K9 u prázdného ceníku řekne, že se dokument nedá vytvořit',
  /nedá vytvořit/i.test(n9.text), n9.text);
test('K9 u prázdného ceníku je zábrana, ne varování',
  n9.uroven === KONTROLY_UROVEN_ZABRANA && k9.brani === true,
  JSON.stringify({ uroven: n9.uroven, brani: k9.brani }));
test('zábranu vypisuje i kodyBrani', k9.kodyBrani.includes('ukazkovyCenik'), JSON.stringify(k9.kodyBrani));

const k9u = kontrolyProved(ctxZdravy(c => { c.cenik = CENIK_UKAZKOVY; }));
const n9u = k9u.nalezy.find(n => n.kod === 'ukazkovyCenik');
test('K9 u vymyšlených cen jen varuje', /neposílejte/i.test(n9u.text), n9u.text);
test('vymyšlené ceny nic neblokují',
  n9u.uroven === KONTROLY_UROVEN && k9u.brani === false,
  JSON.stringify({ uroven: n9u.uroven, brani: k9u.brani }));
test('zdravý ceník neblokuje nic', zdravy.brani === false && zdravy.kodyBrani.length === 0);

/* K10 – prázdná hlavička. IČO v hlavičce od 30. 7. 2026 je, ale pravidlo
 * „hlavicka" ho záměrně nevyžaduje (nabídka odchází dřív, než je objednatel
 * potvrzený) – hlídá se číslo, název akce a objednatel. Platnost vyplněného
 * IČO řeší samostatné pravidlo „ico", testy má v test_ico.js. */
const k10 = kontrolyProved(ctxZdravy(c => { c.zak = { cislo: zk.ZAK_CISLO_PREDLOHA, nazevAkce: '', objednatel: '' }; }));
test('K10 pozná prázdnou hlavičku', kody(k10).includes('hlavicka'), JSON.stringify(kody(k10)));
test('K10 nepovažuje holou předlohu čísla za vyplněné číslo',
  /číslo/i.test(k10.nalezy.find(n => n.kod === 'hlavicka').text),
  k10.nalezy.find(n => n.kod === 'hlavicka').text);
test('K10 mlčí u vyplněné hlavičky', !kody(zdravy).includes('hlavicka'));

/* ---------- 4) víc problémů najednou ---------- */
const vic = kontrolyProved(ctxZdravy(c => {
  c.zadani.nastupiste = 1;
  c.zadani.sirka = 0;
  c.zak = { cislo: '', nazevAkce: '', objednatel: '' };
}));
test('víc problémů se sejde v jednom seznamu', vic.nalezy.length >= 3, JSON.stringify(kody(vic)));
test('pořadí je stálé (podle pořadí pravidel)',
  JSON.stringify(kody(vic)) === JSON.stringify(
    pravidla.map(p => p.kod).filter(k => kody(vic).includes(k))), JSON.stringify(kody(vic)));
test('žádný nález se neopakuje', new Set(kody(vic)).size === vic.nalezy.length);

/* ---------- 5) blokuje jediná věc, a to vědomě ----------
 * Pravidlo „nic se neblokuje natvrdo" (KONTROLY_UROVEN = 2) platí dál pro
 * všechna pravidla kromě prázdného ceníku. Testuje se obojí: že ostatní
 * nálezy zůstaly varováním, i že ta jedna výjimka opravdu zabírá. */
test('všechny ostatní nálezy jsou varování, ne zákaz',
  vic.nalezy.every(n => n.uroven === KONTROLY_UROVEN) && KONTROLY_UROVEN === 2,
  JSON.stringify(vic.nalezy.map(n => n.uroven)));
test('bez prázdného ceníku nic neblokuje', vic.brani === false, JSON.stringify(kody(vic)));
const textVse = kontrolyText(kontrolyProved(ctxZdravy(c => {
  c.zadani.sirka = 0; c.zadani.atyp = true; c.cenik = CENIK_UKAZKOVY;
})), { cisla: true });
test('text varování nikde nepřikazuje ani neblokuje',
  !/nesmí|zakázán|zakázan|blokov|nelze pokračovat|nelze odeslat/i.test(textVse), textVse);
test('zábrana má vlastní text, který se dá ukázat samostatně',
  k9.textBrani.length > 0 && k9.textBrani === n9.text, k9.textBrani);
test('v katalogu pravidel je poznat, které umí zastavit dokument',
  pravidla.filter(p => p.zabranaMozna).map(p => p.kod).join(',') === 'ukazkovyCenik',
  JSON.stringify(pravidla.filter(p => p.zabranaMozna).map(p => p.kod)));

/* ---------- 6) dvě podoby textu ---------- */
const penizeStav = kontrolyProved(ctxZdravy(c => {
  c.cenik = Object.assign(kopie(CENIK), { marze: 0.02 });
  c.sleva = { procenta: 40, role: 'Ředitel', stav: 'schváleno' };
}));
const strucne = kontrolyText(penizeStav);
const podrobne = kontrolyText(penizeStav, { cisla: true });
test('stručný text neprozradí žádnou částku', !/Kč/.test(strucne), strucne);
test('stručný text přesto řekne, že je marže pod minimem',
  /marž/i.test(strucne) && /minim/i.test(strucne), strucne);
test('podrobný text částku uvede', /Kč/.test(podrobne), podrobne);
test('bez voleb se čísla neprozrazují', kontrolyText(penizeStav) === strucne);
test('text vyjmenuje všechny nálezy',
  penizeStav.nalezy.every(n => strucne.includes(n.text)), strucne);

/* ---------- 7) potvrzení platí jen na to, co se odklepávalo ---------- */
const p1 = kontrolyPotvrzeni(vic, 'Vendl', '2026-07-30T08:00:00.000Z');
test('potvrzení si pamatuje kdo, kdy a co', p1.kdo === 'Vendl' && p1.kdy === '2026-07-30T08:00:00.000Z'
  && p1.pocet === vic.nalezy.length && p1.kody.length === vic.nalezy.length, JSON.stringify(p1));
test('potvrzení platí na tentýž stav', kontrolyPotvrzeniPlati(p1, vic) === true);
test('bez potvrzení nic neplatí', kontrolyPotvrzeniPlati(null, vic) === false);
const vicPlus = kontrolyProved(ctxZdravy(c => {
  c.zadani.nastupiste = 1;
  c.zadani.sirka = 0;
  c.zak = { cislo: '', nazevAkce: '', objednatel: '' };
  c.cenik = CENIK_UKAZKOVY;                      // přibude vymyšlený ceník
}));
test('nový problém potvrzení zneplatní', kontrolyPotvrzeniPlati(p1, vicPlus) === false,
  JSON.stringify(kody(vicPlus)));

/* Zábranu odklepnout nejde – jinak by to nebyla zábrana, ale varování
 * s tlačítkem navíc. Potvrzení se pořídí přesně na ten stav a stejně neplatí. */
const zabrana = kontrolyProved(ctxZdravy(c => { c.cenik = CENIK_PRAZDNY; }));
const pZab = kontrolyPotvrzeni(zabrana, 'Vendl', '2026-07-30T08:00:00.000Z');
test('zábranu nejde odklepnout ani potvrzením na tentýž stav',
  kontrolyPotvrzeniPlati(pZab, zabrana) === false, JSON.stringify(pZab.kody));
const vicMin = kontrolyProved(ctxZdravy(c => { c.zadani.nastupiste = 1; }));
test('ubere-li se problém, potvrzení dál platí', kontrolyPotvrzeniPlati(p1, vicMin) === true,
  JSON.stringify(kody(vicMin)));
test('potvrzení nad čistým stavem platí vždycky', kontrolyPotvrzeniPlati(p1, zdravy) === true);

/* ---------- 8) rozbité pravidlo nesmí shodit celou kontrolu ---------- */
/* Kontrola běží nad rozdělaným zadáním, kde může chybět cokoli. Kdyby jediné
 * pravidlo spadlo na nedefinované hodnotě a vzalo s sebou panel, zmizela by
 * i varování, která fungují – tichá ztráta všech ostatních pojistek. */
const rozbity = kontrolyProved({ zadani: { sirka: 0 }, zak: null, sleva: null, nast: NAST,
                                 vysledek: { souhrn: null }, projVysledek: undefined });
test('nekompletní kontext nic neshodí a nálezy dorazí',
  rozbity.varovat === true && kody(rozbity).includes('rozmery'), JSON.stringify(kody(rozbity)));

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
