/* Test #39 – verzování ceníku: zakázka nese verzi, ze které počítala.
 *
 * Databáze programu (`_program.json`, #41) už verze umí: každé zveřejnění
 * zvedne číslo, doplní „platné od" a starou verzi odloží do historie. Co
 * chybělo, je druhá polovina – aby si VARIANTA pamatovala, ze které verze
 * své ceny má. Bez toho se u půl roku staré nabídky dá dohledat, co tehdy
 * platilo v ceníku, ale ne to, jestli z toho ta nabídka opravdu počítala.
 *
 * Razítko ceníku (#35) k tomu bylo skoro připravené – neslo datum, otisk a
 * sestavení. Tady k němu přibývá `verze` a `platnoOd` a věta, která rozdíl
 * pojmenuje: „Kalkulace počítá z verze 2 ceníku, teď platí verze 3."
 *
 * Pravidlo z 31. 7. 2026: rozpracovaná zakázka se změnou ceníku přepočítá
 * sama, uzamčená (vytištěná) nikdy. Verzování na tom nic nemění – jen díky
 * němu jde doložit, z které verze ceníku nabídka počítá.
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
global.zajistiZamek = zm.zajistiZamek; global.variantaCislo = zm.variantaCislo;
global.variantaUzamcena = zm.variantaUzamcena; global.variantaEditovatelna = zm.variantaEditovatelna;
global.zamekInfo = zm.zamekInfo; global.zamekOtisk = zm.zamekOtisk;

const cs = require('./cenik_stari.js');
Object.assign(global, cs);
const { cenikOtisk, cenikPrehled, cenikPrepocti, cenikOznacJakoDnesni,
        cenikVerzeText, cenikVerzeVeta, cenikVarovaniText, cenikDopadText } = cs;
const pg = require('./program.js');
Object.assign(global, pg);
const { programNovy, programNovaVerze } = pg;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const DNES = () => ({ cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK)),
                      proj: { cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)) } });

/* Varianta, jejíž ceník zaostal: jedna položka je levnější než dnešní. */
function staraVarianta() {
  const zak = zajistiZamek(novaZakazka());
  const v = zak.varianty[0];
  v.data.cenik.powertechExt = DEFAULT_CENIK.powertechExt / 1.25;   // dnes je o čtvrtinu dráž
  return { zak, v };
}

/* ---------- razítko nese verzi ---------- */
{
  const data = DNES();
  const r = cenikOznacJakoDnesni(data, { dnes: '2026-07-31', build: 'v30.7.21',
                                         verze: 3, platnoOd: '2026-07-01' });
  test('razítko si pamatuje, ze které verze ceníku data jsou',
    r.verze === 3 && r.platnoOd === '2026-07-01', r);
  test('razítko dál nese datum, sestavení i otisk',
    r.datum === '2026-07-31' && r.build === 'v30.7.21' && r.otisk === cenikOtisk(data), r);
}

test('bez zadané verze razítko žádnou nepředstírá', (() => {
  const r = cenikOznacJakoDnesni(DNES(), { dnes: '2026-07-31' });
  return r.verze === null && r.platnoOd === '';
})());

/* Verze je pořadové číslo zveřejnění, začíná jedničkou. Nula, prázdno a
 * nesmysl znamenají „nevíme" – a to se má říct, ne zaokrouhlit na verzi 0. */
test('nesmyslné číslo verze se čte jako „nevíme"', (() => {
  const zk0 = cenikOznacJakoDnesni(DNES(), { verze: 0 }).verze;
  const zkP = cenikOznacJakoDnesni(DNES(), { verze: '' }).verze;
  const zkT = cenikOznacJakoDnesni(DNES(), { verze: 'třetí' }).verze;
  const zkZ = cenikOznacJakoDnesni(DNES(), { verze: -2 }).verze;
  return zk0 === null && zkP === null && zkT === null && zkZ === null;
})());

/* ---------- popis verze ---------- */
test('verze se popisuje česky i s platností od',
  cenikVerzeText({ verze: 2, platnoOd: '2026-03-01' }) === 'verze 2 ceníku (platná od 1. 3. 2026)',
  cenikVerzeText({ verze: 2, platnoOd: '2026-03-01' }));
test('bez data platnosti se datum nevymýšlí',
  cenikVerzeText({ verze: 2 }) === 'verze 2 ceníku', cenikVerzeText({ verze: 2 }));
test('neznámá verze se nepopisuje vůbec',
  cenikVerzeText(null) === '' && cenikVerzeText({ verze: null, platnoOd: '2026-03-01' }) === '');

/* ---------- přehled: co nese varianta a co platí dnes ---------- */
{
  const { v } = staraVarianta();
  cenikOznacJakoDnesni(v.data, { dnes: '2026-03-05', verze: 2, platnoOd: '2026-03-01' });
  const p = cenikPrehled(v, DNES(), { dnes: '2026-07-31', verze: 3, platnoOd: '2026-07-01' });
  test('přehled ví, z jaké verze varianta počítala', p.verze === 2, p.verze);
  test('přehled ví, která verze platí teď', p.verzeDnes === 3, p.verzeDnes);
  test('a pozná, že varianta zaostává', p.verzeZaostava === true);
  test('popis obou verzí je po ruce pro výpis',
    /verze 2 ceníku/.test(p.verzeText) && /verze 3 ceníku/.test(p.verzeDnesText),
    [p.verzeText, p.verzeDnesText]);

  const veta = cenikVerzeVeta(p);
  test('věta pojmenuje obě čísla', /verze 2/.test(veta) && /verze 3/.test(veta), veta);
  test('věta o verzi se přidá k varování o rozdílech',
    /verze 2/.test(cenikVarovaniText(p)) && /liší od dnešního/.test(cenikVarovaniText(p)),
    cenikVarovaniText(p));
}

/* Stejná verze není o čem mluvit – opakovat „počítá z verze 3, platí verze 3"
 * by z upozornění udělalo šum, kterého si nikdo nevšimne, až o něco půjde. */
test('shodná verze se nekomentuje', (() => {
  const { v } = staraVarianta();
  cenikOznacJakoDnesni(v.data, { verze: 3, platnoOd: '2026-07-01' });
  const p = cenikPrehled(v, DNES(), { dnes: '2026-07-31', verze: 3, platnoOd: '2026-07-01' });
  return cenikVerzeVeta(p) === '' && p.verzeZaostava === false;
})());

/* Starší zakázka razítko nemá. Tvrdit u ní verzi by bylo vymýšlení –
 * rozdíly v cenách se ale hlásit musí dál, na tom verzování nic nemění. */
test('u zakázky bez razítka se verze nedomýšlí, varování zůstává', (() => {
  const { v } = staraVarianta();
  const p = cenikPrehled(v, DNES(), { dnes: '2026-07-31', verze: 3, platnoOd: '2026-07-01' });
  return p.verze === null && p.varovat === true
    && cenikVerzeVeta(p) === '' && !/verze/.test(cenikVarovaniText(p));
})());

/* Výjimka: ceník varianty se do puntíku shoduje s dnešním. Pak varianta z té
 * verze počítá, i když jí to nikdo nenapsal – to není domýšlení, to je fakt
 * plynoucí z obsahu. Poznat to jde přes `verzeOdvozena`. */
test('shodný ceník bez razítka se přiřadí k platné verzi', (() => {
  const zak = zajistiZamek(novaZakazka());
  const p = cenikPrehled(zak.varianty[0], DNES(), { dnes: '2026-07-31', verze: 3, platnoOd: '2026-07-01' });
  return p.verze === 3 && p.verzeOdvozena === true && p.varovat === false;
})());

/* ---------- přepočet přerazítkuje na dnešní verzi ---------- */
test('přepočet zapíše verzi, ze které se přepočítávalo', (() => {
  const { v } = staraVarianta();
  cenikOznacJakoDnesni(v.data, { verze: 2, platnoOd: '2026-03-01' });
  const r = cenikPrepocti(v, DNES(), { dnes: '2026-07-31', build: 'v30.7.21',
                                       verze: 3, platnoOd: '2026-07-01' });
  return r.zmen === 1 && v.data.cenikRazitko.verze === 3
    && v.data.cenikRazitko.platnoOd === '2026-07-01';
})());

/* Přepočet jen vybraných položek nechává ceník jako směs – část z nové
 * verze, část z původní dohody. Taková sada není žádná zveřejněná verze
 * a razítko to nesmí tvrdit. */
test('částečný přepočet verzi nezapíše, protože ceník už žádnou verzí není', (() => {
  const { v } = staraVarianta();
  v.data.cenik.montazHodKc = DEFAULT_CENIK.montazHodKc / 2;   // druhý rozdíl, dohodnutá cena
  cenikOznacJakoDnesni(v.data, { verze: 2, platnoOd: '2026-03-01' });
  const r = cenikPrepocti(v, DNES(), { dnes: '2026-07-31', cesty: ['C.powertechExt'],
                                       verze: 3, platnoOd: '2026-07-01' });
  return r.zmen === 1 && v.data.cenikRazitko.verze === null
    && v.data.cenik.montazHodKc === DEFAULT_CENIK.montazHodKc / 2;
})());

test('přepočet bez znalosti verze starou verzi nepřepíše na výmysl', (() => {
  const { v } = staraVarianta();
  cenikOznacJakoDnesni(v.data, { verze: 2, platnoOd: '2026-03-01' });
  cenikPrepocti(v, DNES(), { dnes: '2026-07-31' });
  return v.data.cenikRazitko.verze === null;
})());

/* ---------- napojení na databázi programu ---------- */
{
  const db1 = programNovy({ cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK)),
                            cenikProj: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)),
                            kdo: 'JV', platnoOd: '2026-03-01' });
  const drazsi = JSON.parse(JSON.stringify(DEFAULT_CENIK));
  drazsi.powertechExt = DEFAULT_CENIK.powertechExt * 1.25;
  const db2 = programNovaVerze(db1, { cenik: drazsi,
                                      cenikProj: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)),
                                      kdo: 'JV', platnoOd: '2026-07-01' });
  test('databáze programu dá verzi i datum, které razítko potřebuje',
    db1.platny.verze === 1 && db2.platny.verze === 2 && db2.platny.platnoOd === '2026-07-01',
    [db1.platny.verze, db2.platny.verze, db2.platny.platnoOd]);

  /* Varianta vznikla za verze 1, mezitím se zveřejnila verze 2. */
  const zak = zajistiZamek(novaZakazka());
  const v = zak.varianty[0];
  cenikOznacJakoDnesni(v.data, { dnes: '2026-04-10', verze: db1.platny.verze,
                                 platnoOd: db1.platny.platnoOd });
  const dnesni = { cenik: db2.platny.cenik, proj: { cenik: db2.platny.cenikProj } };
  const p = cenikPrehled(v, dnesni, { dnes: '2026-07-31', verze: db2.platny.verze,
                                      platnoOd: db2.platny.platnoOd });
  test('u rozpracované zakázky se pozná stará verze i o kolik se zdražilo',
    p.verze === 1 && p.verzeDnes === 2 && p.souhrn.pocet === 1
    && Math.abs(p.rozdily[0].zmena - 0.25) < 1e-9, { v: p.verze, d: p.verzeDnes, r: p.rozdily });
  test('věta pro rozpracovanou zakázku řekne, z čeho počítá a co platí',
    /verze 1/.test(cenikVarovaniText(p)) && /verze 2/.test(cenikVarovaniText(p)),
    cenikVarovaniText(p));
}

/* ---------- co změna ceníku znamená pro rozpracované zakázky ---------- */
{
  const t = cenikDopadText();
  test('aplikace umí říct, co změna ceníku znamená pro rozpracované zakázky', !!t, t);
  test('a slibuje to, co dělá: rozpracované samy, zamčené nikdy',
    /rozpracovan/i.test(t) && /přepoč/i.test(t) && /uzamčen|zamčen/i.test(t), t);
}

/* ---------- odolnost ---------- */
test('varianta bez dat nespadne ani při dotazu na verzi', (() => {
  const p = cenikPrehled({ id: 'x' }, DNES(), { dnes: '2026-07-31', verze: 3 });
  return p.verze === null && p.verzeDnes === 3 && p.verzeZaostava === false;
})());
test('přehled bez znalosti platné verze mlčí o obojím', (() => {
  const { v } = staraVarianta();
  cenikOznacJakoDnesni(v.data, { verze: 2, platnoOd: '2026-03-01' });
  const p = cenikPrehled(v, DNES(), { dnes: '2026-07-31' });
  return p.verze === 2 && p.verzeDnes === null && cenikVerzeVeta(p) === '';
})());

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail) process.exit(1);
