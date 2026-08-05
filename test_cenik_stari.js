/* Test – PŘEPOČET ROZPRACOVANÝCH NABÍDEK PŘI ZMĚNĚ CENÍKU
 * (zadání z 31. 7. 2026, mění pravidlo z #35/#39/#41)
 *
 * Původní pravidlo znělo „přepočet je vždycky vědomý krok člověka". Provoz
 * ukázal, že to je obráceně, než jak se s nabídkami skutečně pracuje:
 *
 *   „Rozpracované nabídky by se měly při změně ceníku samy přepočíst. Pokud
 *    nejsou vytištěné = zamčené. Zamčené nabídky už se naopak přepočítávat
 *    nesmějí a musí zůstat uložené ve stavu vytištění."
 *
 * Rozpracovaná nabídka ještě nikam neodešla, takže staré ceny v ní nejsou
 * doklad, ale past: kdo ji za týden otevře a odešle, počítal by z ceníku,
 * který už neplatí. Vytištěná nabídka je naopak doklad o tom, co zákazník
 * dostal na papíře, a ta se nesmí hnout ani o korunu.
 *
 * Co zůstává v platnosti: ZADÁNÍ (rozměry, hodiny, počty) se nepřepisuje
 * nikdy – to je práce uživatele, ne ceník. Ruční přepis ceny u položky
 * („tohle sklo máme dohodnuté za…") je taky součást zadání a přežije.
 * A varianta, u které uživatel výslovně řekl „ceny jsou dohodnuté"
 * (kvitance z #35), se automaticky nepřepisuje – to je jeho vědomé
 * prohlášení, ne opomenutí; přepočítá se, až kvitanci zruší.
 */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI;
global.DEFAULT_CENIK = ZC.zkusebniCenik();
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
Object.assign(global, zm);
const { zajistiZamek, zamkniVariantu, klonujVariantu, variantaUzamcena } = zm;
const cs = require('./cenik_stari.js');
Object.assign(global, cs);
const { cenikOtisk, cenikHodnota, cenikKvitovat, cenikJeKvitovano,
        cenikPrepoctiRozpracovane, cenikDopadText } = cs;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const DNES = () => ({ cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK)),
                      proj: { cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)) } });

/* Zakázka se dvěma variantami, obě mají ceník o čtvrtinu levnější než dnešní. */
function zakazkaSeStarymCenikem() {
  const zak = zajistiZamek(novaZakazka());
  const v1 = zak.varianty[0];
  v1.data.cenik.powertechExt = DEFAULT_CENIK.powertechExt / 1.25;
  const v2 = klonujVariantu(zak, v1.id, { nazev: 'Varianta 2' });
  return { zak, v1, v2 };
}

const STARA = () => DEFAULT_CENIK.powertechExt / 1.25;

/* ---------- rozpracovaná se přepočítá sama ---------- */
{
  const { zak, v1, v2 } = zakazkaSeStarymCenikem();
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4, platnoOd: '2026-07-31' });

  test('rozpracovaná varianta má po zveřejnění nové ceny',
    cenikHodnota(v1.data, 'C.powertechExt') === DEFAULT_CENIK.powertechExt,
    cenikHodnota(v1.data, 'C.powertechExt'));
  test('přepočítají se všechny rozpracované varianty zakázky, ne jen aktivní',
    cenikHodnota(v2.data, 'C.powertechExt') === DEFAULT_CENIK.powertechExt,
    cenikHodnota(v2.data, 'C.powertechExt'));
  test('výsledek řekne, kolika variant se to týkalo', r.prepocteno === 2, r);
  test('a kolik cen se v nich změnilo', r.zmen >= 2, r);
  test('razítko přepočtené varianty nese novou verzi ceníku',
    v1.data.cenikRazitko && v1.data.cenikRazitko.verze === 4
      && v1.data.cenikRazitko.platnoOd === '2026-07-31', v1.data.cenikRazitko);
  test('po přepočtu už varianta proti dnešnímu ceníku nezaostává',
    cenikPrehled(v1, DNES(), { dnes: '2026-07-31', verze: 4 }).rozdily.length === 0);
}

/* ---------- zamčená (vytištěná) zůstává, jak odešla ---------- */
{
  const { zak, v1, v2 } = zakazkaSeStarymCenikem();
  zamkniVariantu(v1, { typ: 'nabidkaTisk', kdy: '2026-06-01T10:00:00.000Z', cislo: 'CN-1' });
  const razitkoPred = JSON.stringify(v1.data.cenikRazitko || null);
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4 });

  test('zamčená varianta si drží ceny, za které odešla',
    cenikHodnota(v1.data, 'C.powertechExt') === STARA(), cenikHodnota(v1.data, 'C.powertechExt'));
  test('zamčené se nesáhne ani na razítko ceníku',
    JSON.stringify(v1.data.cenikRazitko || null) === razitkoPred, v1.data.cenikRazitko);
  test('zámek přepočtem nezmizí', variantaUzamcena(v1) === true);
  test('výsledek zamčené vykáže zvlášť', r.zamcene === 1 && r.prepocteno === 1, r);
  test('vedle zamčené se rozpracovaná přepočítá dál',
    cenikHodnota(v2.data, 'C.powertechExt') === DEFAULT_CENIK.powertechExt);
}

/* ---------- co se přepočtem nesmí hnout ---------- */
{
  const { zak, v1 } = zakazkaSeStarymCenikem();
  v1.data.ock.zadani.sirka = 1234;                  // práce uživatele, ne ceník
  v1.data.proj.zadani.sekce[0].polozky[0].sazbaPrepis = 111;   // dohodnutá sazba u jedné položky
  cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4 });
  test('zadání se přepočtem nemění – přepisuje se ceník, ne kalkulace',
    v1.data.ock.zadani.sirka === 1234, v1.data.ock.zadani.sirka);
  test('ruční přepis ceny u položky přepočet přežije',
    v1.data.proj.zadani.sekce[0].polozky[0].sazbaPrepis === 111,
    v1.data.proj.zadani.sekce[0].polozky[0]);
}

/* Dohodnutá cena je vědomé rozhodnutí uživatele („ceny jsou dohodnuté",
 * kvitance z #35). Automatika ji nesmí tiše přepsat – jinak by z dohodnuté
 * ceny udělala ceníkovou a nikdo by si toho nevšiml. */
{
  const { zak, v1, v2 } = zakazkaSeStarymCenikem();
  cenikKvitovat(v1, cenikOtisk(v1.data), 'JV', '2026-07-01T00:00:00.000Z');
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4 });

  test('varianta s dohodnutými cenami se sama nepřepíše',
    cenikHodnota(v1.data, 'C.powertechExt') === STARA(), cenikHodnota(v1.data, 'C.powertechExt'));
  test('a výsledek to řekne nahlas', r.dohodnute === 1 && r.prepocteno === 1, r);
  test('ostatní varianty to nebrzdí',
    cenikHodnota(v2.data, 'C.powertechExt') === DEFAULT_CENIK.powertechExt);

  // po zrušení kvitance se chová jako každá jiná rozpracovaná
  cenikZrusKvitanci(v1);
  const r2 = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4 });
  test('po zrušení dohody se přepočítá i ona',
    cenikHodnota(v1.data, 'C.powertechExt') === DEFAULT_CENIK.powertechExt && r2.prepocteno === 1, r2);
}

/* ---------- nedotčená varianta: jen razítko, ne hlášení o změně ---------- */
{
  const zak = zajistiZamek(novaZakazka());          // ceník varianty = dnešní
  const v = zak.varianty[0];
  const r = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4, platnoOd: '2026-07-31' });
  test('varianta, které se změna ceníku netýká, se nehlásí jako přepočtená',
    r.prepocteno === 0 && r.zmen === 0, r);
  test('ale verzi ceníku dostane orazítkovanou, aby šlo doložit, z čeho počítá',
    v.data.cenikRazitko && v.data.cenikRazitko.verze === 4, v.data.cenikRazitko);
  const r2 = cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4, platnoOd: '2026-07-31' });
  test('opakované volání už nemá co dělat (nedělá z každého renderu změnu)',
    r2.prepocteno === 0 && r2.orazitkovano === 0, r2);
}

/* ---------- PROJ jede se stejným ceníkem ---------- */
{
  const { zak, v1 } = zakazkaSeStarymCenikem();
  if (v1.data.proj && v1.data.proj.cenik) {
    v1.data.proj.cenik.marze = 0.1;                 // dnes platí jiná globální přirážka
    cenikPrepoctiRozpracovane(zak, DNES(), { dnes: '2026-07-31', verze: 4 });
    test('přepočet se týká i ceníku projekce (PC.marze)',
      cenikHodnota(v1.data, 'PC.marze') === DEFAULT_CENIK_PROJ.marze,
      cenikHodnota(v1.data, 'PC.marze'));
  }
}

/* ---------- odolnost ---------- */
test('zakázka bez variant ani prázdný vstup nespadne', (() => {
  const a = cenikPrepoctiRozpracovane(null, DNES(), {});
  const b = cenikPrepoctiRozpracovane({ varianty: [] }, DNES(), {});
  const c = cenikPrepoctiRozpracovane({ varianty: [null, { id: 'x' }] }, DNES(), {});
  return a.prepocteno === 0 && b.prepocteno === 0 && c.prepocteno === 0;
})());

/* ---------- věta, kterou aplikace slibuje uživateli ---------- */
{
  const t = cenikDopadText();
  test('text o dopadu změny ceníku mluví o automatickém přepočtu rozpracovaných',
    /rozpracovan/i.test(t) && /sam|automatick/i.test(t) && /přepoč/i.test(t), t);
  test('a o tom, že vytištěná (zamčená) nabídka se nemění nikdy',
    /(uzamčen|zamčen|vytištěn)/i.test(t) && /nikdy|nepřepoč|nemění/i.test(t), t);
  test('starý slib „nepřepíše se samo" už v textu není',
    !/sama nepřepíše|nepřepíše\s+–|dokud přepočet nespustíte/i.test(t), t);
}

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail) process.exit(1);
