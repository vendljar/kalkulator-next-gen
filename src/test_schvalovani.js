/* Test schvalovani.js – žádosti o schválení slevy, kdo o nich smí rozhodnout
 * a jak se rozhodnutí drží při dalším přepočtu.
 *
 * Proč vlastní sada a ne rozšíření test_sleva.js: sleva.js počítá DOPAD slevy
 * (kolik Kč, jaká marže, jaký strop). Schvalování je něco jiného – je to
 * rozhodovací proces nad hotovým výpočtem: kdo smí odklepnout, co se stane
 * s rozhodnutím, když obchodník potom procento změní, a jak se z variant
 * zakázky složí seznam žádostí pro novou záložku. Míchat obojí do jedné sady
 * by znamenalo, že po každé změně schvalování musím znovu číst i testy
 * výpočtu, abych našel, co vlastně selhalo. */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const sl = require('./sleva.js');
Object.assign(global, sl);
const zk = require('./zakazka.js');
const sch = require('./schvalovani.js');
Object.assign(global, sch);

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

/* UKÁZKOVÁ slevová politika – stejný důvod jako v test_sleva.js: skutečné
 * stropy a minimální marže jsou obchodní tajemství a leží v _DB/_program.json,
 * do repozitáře nepatří ani jako testovací vzorek. */
const STROP_OBCH = 3;      // %
const STROP_VED = 10;      // %
/* Minimální marže je tu záměrně nízká (2 %). Zkušební ceník dává marži jen
 * 16,7 %, takže při realistických 10 % by se pod minimum propadla už sleva
 * 8 % — a všechny testy schvalování by místo stavu „čeká na schválení"
 * dostávaly „zamítnuto kvůli marži". Vzorek se tu volí tak, aby zůstal prostor
 * mezi stropem role a hranicí marže; obojí zvlášť prověřuje test_sleva.js. */
const NAST = {
  minMarze: 0.02,
  stropy: { 'Obchodník': STROP_OBCH / 100, 'Vedoucí': STROP_VED / 100, 'Administrátor': 1 },
};
const DO_STROPU = STROP_OBCH;            // přesně na stropu obchodníka → projde samo
const NAD_STROP = STROP_OBCH + 3;        // nad obchodníkem, pod vedoucím → žádost
const NAD_VEDOUCIHO = STROP_VED + 5;     // nad vedoucím → rozhodne jen administrátor

/* Zakázka s jednou variantou a spočtenou cenou OCK – z ní se berou základy
 * pro slevaVyhodnot(). */
const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9101';
zak.varianty[0].data.ock.fixes = true;
const v1 = zak.varianty[0];
const r1 = eng.vypocet(v1.data.ock.zadani, v1.data.cenik, JEKLY, true);
const ZAKLAD = r1.souhrn.zakladCena, NAKLAD = r1.souhrn.zakladNaklad;
const VYP = {};
VYP[v1.id] = { zakladCena: ZAKLAD, zakladNaklad: NAKLAD };

/* Procento, které srazí marži pod minimum – dopočítá se z ceny a nákladu,
 * aby test nezávisel na konkrétním ceníku. */
function podMarziPct() {
  for (let p = 1; p <= 95; p++) {
    const d = slevaVyhodnot(ZAKLAD, NAKLAD, { procenta: p, role: 'Administrátor' }, NAST);
    if (d.podMarzi) return p;
  }
  return 90;
}
const POD_MARZI = podMarziPct();

function slevaVar(varianta, procenta, role) {
  varianta.data.sleva = Object.assign(slevaDefault(), { procenta, role: role || 'Obchodník' });
  return varianta.data.sleva;
}
function prepocti(varianta) {
  const s = varianta.data.sleva;
  return schvalovaniPrepocti(s, slevaVyhodnot(ZAKLAD, NAKLAD, s, NAST));
}

/* ---------- 1) kategorie žádosti ---------- */

test('bez slevy není co schvalovat', schvalovaniKategorie(slevaDefault()) === 'bez');
test('chybějící záznam slevy nespadne', schvalovaniKategorie(null) === 'bez');

slevaVar(v1, DO_STROPU); prepocti(v1);
test('sleva do stropu role projde sama',
  schvalovaniKategorie(v1.data.sleva) === 'auto', JSON.stringify(v1.data.sleva));

slevaVar(v1, NAD_STROP); prepocti(v1);
test('sleva nad strop role čeká na rozhodnutí',
  schvalovaniKategorie(v1.data.sleva) === 'ceka', JSON.stringify(v1.data.sleva));

slevaVar(v1, POD_MARZI, 'Administrátor'); prepocti(v1);
test('sleva pod minimální marží je zamítnutá výpočtem, ne člověkem',
  schvalovaniKategorie(v1.data.sleva) === 'podMarzi', JSON.stringify(v1.data.sleva));

/* ---------- 2) kdo smí rozhodnout ---------- */

test('obchodník nerozhoduje o slevě nad svým stropem',
  schvalovaniSmiRozhodnout('Obchodník', NAD_STROP, NAST) === false);
test('obchodník rozhodne o slevě do svého stropu',
  schvalovaniSmiRozhodnout('Obchodník', DO_STROPU, NAST) === true);
test('vedoucí rozhodne o slevě do svého stropu',
  schvalovaniSmiRozhodnout('Vedoucí', NAD_STROP, NAST) === true);
test('vedoucí nerozhoduje nad svým stropem',
  schvalovaniSmiRozhodnout('Vedoucí', NAD_VEDOUCIHO, NAST) === false);
/* Administrátor nesmí zůstat viset na konfiguraci: kdyby se mu někdo pokusil
 * strop v _program.json snížit, přestala by být zakázka schvalitelná vůbec
 * kýmkoli a nešlo by to odkud spravit. */
test('administrátor rozhodne vždy, i bez stropu v konfiguraci',
  schvalovaniSmiRozhodnout('Administrátor', NAD_VEDOUCIHO, { stropy: {} }) === true);
test('bez role nerozhoduje nikdo', schvalovaniSmiRozhodnout('', 1, NAST) === false);

const kdo = schvalovaniKdoMuze(NAD_STROP, NAST, ['Obchodník', 'Vedoucí', 'Administrátor']);
test('seznam rozhodujících vynechá roli s nízkým stropem',
  kdo.join(',') === 'Vedoucí,Administrátor', kdo.join(','));
test('nad stropem vedoucího zbude administrátor',
  schvalovaniKdoMuze(NAD_VEDOUCIHO, NAST, ['Obchodník', 'Vedoucí', 'Administrátor']).join(',') === 'Administrátor');

/* ---------- 3) rozhodnutí: schválení ---------- */

slevaVar(v1, NAD_STROP); prepocti(v1);
schvalovaniSchval(v1.data.sleva, 'Jana Nová (Vedoucí)', '2026-08-05T09:00:00.000Z');
test('schválení zapíše kdo a kdy',
  v1.data.sleva.stav === 'schváleno' && v1.data.sleva.schvalil === 'Jana Nová (Vedoucí)'
  && v1.data.sleva.schvalilKdy === '2026-08-05T09:00:00.000Z', JSON.stringify(v1.data.sleva));
test('schválená sleva se propíše do nabídky', slevaPlati(v1.data.sleva) === true);
prepocti(v1);
test('schválení přežije přepočet na stejném procentu',
  v1.data.sleva.stav === 'schváleno', JSON.stringify(v1.data.sleva));

/* Tohle je jádro celé záložky: odklepnutá sleva platí pro ODKLEPNUTÉ procento.
 * Kdyby obchodník mohl po schválení procento zvednout a razítko zůstalo,
 * schvalování by nic neznamenalo. */
v1.data.sleva.procenta = NAD_STROP + 2; prepocti(v1);
test('po zvýšení procenta padá schválení zpět do žádosti',
  schvalovaniKategorie(v1.data.sleva) === 'ceka', JSON.stringify(v1.data.sleva));
/* A stopa po starém razítku musí zmizet i ze zakázky, ne jen ze stavu:
 * jinak by u žádosti čekající na rozhodnutí zůstalo viset jméno člověka,
 * který schválil něco jiného, a v souboru zakázky by to tak i zůstalo. */
test('a jméno schvalovatele u ní nezůstane viset',
  !v1.data.sleva.schvalil && v1.data.sleva.schvalenoProc === undefined,
  JSON.stringify(v1.data.sleva));

/* ---------- 4) rozhodnutí: zamítnutí ---------- */

slevaVar(v1, NAD_STROP); prepocti(v1);
schvalovaniZamitni(v1.data.sleva, 'Jana Nová (Vedoucí)', '2026-08-05T09:30:00.000Z', 'marže na téhle akci nedává prostor');
test('zamítnutí zapíše kdo, kdy a důvod',
  v1.data.sleva.stav === 'zamítnuto' && v1.data.sleva.zamitl === 'Jana Nová (Vedoucí)'
  && v1.data.sleva.zamitnutoDuvod === 'marže na téhle akci nedává prostor', JSON.stringify(v1.data.sleva));
test('zamítnutá sleva se do nabídky nepropíše', slevaPlati(v1.data.sleva) === false);
prepocti(v1);
/* Bez téhle pojistky by přepočet zamítnutou žádost vrátil do stavu „čeká na
 * schválení" a vedoucí by ji odmítal donekonečna. */
test('zamítnutí přežije přepočet na stejném procentu',
  schvalovaniKategorie(v1.data.sleva) === 'zamitnuto', JSON.stringify(v1.data.sleva));
test('ruční zamítnutí se pozná od zamítnutí kvůli marži',
  v1.data.sleva.zamitnutoProc === NAD_STROP, JSON.stringify(v1.data.sleva));

v1.data.sleva.procenta = DO_STROPU; prepocti(v1);
test('po snížení pod strop se zamítnutí neuplatní',
  schvalovaniKategorie(v1.data.sleva) === 'auto', JSON.stringify(v1.data.sleva));

/* ---------- 5) vrácení rozhodnutí ---------- */

slevaVar(v1, NAD_STROP); prepocti(v1);
schvalovaniSchval(v1.data.sleva, 'Kdo (Vedoucí)', '2026-08-05T10:00:00.000Z');
schvalovaniVrat(v1.data.sleva); prepocti(v1);
test('vrácení rozhodnutí uvolní žádost zpět ke schválení',
  schvalovaniKategorie(v1.data.sleva) === 'ceka'
  && !v1.data.sleva.schvalil && v1.data.sleva.schvalenoProc === undefined, JSON.stringify(v1.data.sleva));

/* Zamítnutí a schválení se nesmí ve stopě potkat – jinak by karta ukazovala
 * „schválil X" u zamítnuté slevy. */
slevaVar(v1, NAD_STROP); prepocti(v1);
schvalovaniSchval(v1.data.sleva, 'Vedoucí A', '2026-08-05T10:00:00.000Z');
schvalovaniZamitni(v1.data.sleva, 'Vedoucí B', '2026-08-05T11:00:00.000Z', '');
test('zamítnutí smaže stopu předchozího schválení',
  !v1.data.sleva.schvalil && v1.data.sleva.schvalenoProc === undefined
  && v1.data.sleva.zamitl === 'Vedoucí B', JSON.stringify(v1.data.sleva));
schvalovaniSchval(v1.data.sleva, 'Vedoucí C', '2026-08-05T12:00:00.000Z');
test('schválení smaže stopu předchozího zamítnutí',
  !v1.data.sleva.zamitl && v1.data.sleva.zamitnutoProc === undefined
  && v1.data.sleva.schvalil === 'Vedoucí C', JSON.stringify(v1.data.sleva));

/* ---------- 6) seznam žádostí za zakázku ---------- */

/* Klonování variant bydlí v zamek.js (kvůli příponám čísel nabídky); tady
 * stačí druhá varianta složená ručně, testuje se seznam, ne klonování. */
const varB = zk.novaVarianta('Varianta 2', JSON.parse(JSON.stringify(v1.data)));
zak.varianty.push(varB);
VYP[varB.id] = { zakladCena: ZAKLAD, zakladNaklad: NAKLAD };

slevaVar(v1, NAD_STROP); prepocti(v1);
slevaVar(varB, 0); prepocti(varB);

let seznam = schvalovaniSeznam(zak, VYP, NAST);
test('seznam vynechá varianty bez slevy', seznam.length === 1 && seznam[0].id === v1.id,
  JSON.stringify(seznam.map(z => z.id)));
test('žádost nese název varianty i procento',
  seznam[0].nazev === v1.nazev && seznam[0].procenta === NAD_STROP, JSON.stringify(seznam[0]));
test('žádost nese dopad slevy v Kč',
  seznam[0].spocteno === true && seznam[0].slevaKc > 0 && seznam[0].cenaPoSleve < ZAKLAD,
  JSON.stringify(seznam[0]));
test('žádost říká, kdo o ní smí rozhodnout',
  seznam[0].kdoMuze.indexOf('Vedoucí') >= 0 && seznam[0].kdoMuze.indexOf('Obchodník') < 0,
  JSON.stringify(seznam[0].kdoMuze));

slevaVar(varB, DO_STROPU); prepocti(varB);
seznam = schvalovaniSeznam(zak, VYP, NAST);
test('seznam zahrne i slevu schválenou automaticky', seznam.length === 2, JSON.stringify(seznam.map(z => z.kategorie)));
/* Čekající patří nahoru – záložka je pracovní seznam, ne archiv. */
test('čekající žádost stojí v seznamu první', seznam[0].kategorie === 'ceka',
  JSON.stringify(seznam.map(z => z.kategorie)));

const souhrn = schvalovaniSouhrn(seznam);
test('souhrn spočítá čekající i automatické',
  souhrn.ceka === 1 && souhrn.auto === 1 && souhrn.celkem === 2, JSON.stringify(souhrn));

/* Bez výsledku výpočtu (rozbité zadání OCK) se žádost nesmí ztratit – jen se
 * u ní neukáží koruny. Kdyby zmizela, vedoucí by o slevě vůbec nevěděl. */
const bezVypoctu = schvalovaniSeznam(zak, {}, NAST);
test('bez výpočtu žádost zůstane, jen bez korun',
  bezVypoctu.length === 2 && bezVypoctu.every(z => z.spocteno === false && z.slevaKc === null),
  JSON.stringify(bezVypoctu.map(z => z.spocteno)));
test('bez výpočtu se stav slevy nepřepisuje',
  bezVypoctu[0].procenta > 0 && typeof bezVypoctu[0].stav === 'string', JSON.stringify(bezVypoctu[0]));

/* Uzamčená varianta je doklad o tom, co odešlo zákazníkovi – rozhodovat
 * o její slevě už nejde a seznam to musí říct, aby UI mělo co skrýt. */
varB.zamek = { zamceno: true, kdy: '2026-08-01T00:00:00.000Z', typ: 'nabidka' };
const seZamkem = schvalovaniSeznam(zak, VYP, NAST);
test('žádost z uzamčené varianty je označená jako neměnná',
  seZamkem.some(z => z.id === varB.id && z.zamceno === true),
  JSON.stringify(seZamkem.map(z => [z.id, z.zamceno])));

/* ---------- 7) prázdná a poškozená vstupní data ---------- */

test('zakázka bez variant dá prázdný seznam', schvalovaniSeznam({}, VYP, NAST).length === 0);
test('null místo zakázky dá prázdný seznam', schvalovaniSeznam(null, VYP, NAST).length === 0);
test('souhrn prázdného seznamu je samé nuly',
  schvalovaniSouhrn([]).celkem === 0 && schvalovaniSouhrn([]).ceka === 0);

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
