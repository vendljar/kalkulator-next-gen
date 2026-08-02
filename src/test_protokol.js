/* Test protokolu o kalkulaci (#41).
 *
 * Otázka, na kterou protokol odpovídá, zní vždycky stejně: „proč je ta cena
 * jiná, než jsem si pamatoval?" Dnes se to nedá zjistit vůbec – zakázka je
 * jeden JSON, který se přepisuje na místě, a kdo do něj kdy sáhl, nikde není.
 *
 * Hlídají se čtyři věci, každá jiný způsob, jak by protokol mohl selhat:
 *
 *   a) rozdíl se počítá z DAT, ne z odchycených kliknutí. Kdyby se zapisovalo
 *      jen tam, kde si na to někdo vzpomene, tichá cesta (katalog, ceník,
 *      technická specifikace) by se do protokolu nikdy nedostala,
 *   b) zápis nesmí zbytnět: výměna celého ceníku je jedna událost, ne dvě stě
 *      řádků, jinak se v protokolu nedá nic najít,
 *   c) čísla z ceníku jsou náklady – v protokolu se označí jako citlivá a
 *      běžný uživatel je nevidí (stejné pravidlo jako u marže a KPI),
 *   d) obsah interních poznámek se do protokolu neopisuje a protokol sám se
 *      nedostane do žádného dokumentu pro zákazníka.
 */
const fs = require('fs');

/* Prohlížeč má jeden jmenný prostor, Node ne. */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const slm = require('./sleva.js');
global.slevaPodil = slm.slevaPodil; global.slevaDefault = slm.slevaDefault;
const zom = require('./zaokrouhleni.js');
global.zaokrDefault = zom.zaokrDefault;
const pzm = require('./poznamky.js');
Object.keys(pzm).forEach(k => { if (global[k] === undefined) global[k] = pzm[k]; });
const zk = require('./zakazka.js');
Object.keys(zk).forEach(k => { if (global[k] === undefined) global[k] = zk[k]; });

const pr = require('./protokol.js');
const { PROTOKOL_MAX, PROTOKOL_DAVKA_MAX,
        protokolZajisti, protokolOtisk, protokolRozdil, protokolZapis,
        protokolZaznamenej, protokolSeznam, protokolText, protokolShrnuti,
        protokolHodnota, protokolDopln } = pr;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const nova = () => protokolZajisti(zk.novaZakazka());
const kopie = o => JSON.parse(JSON.stringify(o));

/* ---------- 1) zajištění pole ---------- */
const z = nova();
test('zajisti vytvoří protokol', Array.isArray(z.protokol) && z.protokol.length === 0);
test('zajisti je idempotentní', protokolZajisti(z) === z && z.protokol.length === 0);
test('zajisti snese null', protokolZajisti(null) === null);

/* ---------- 2) ruční zápis události ---------- */
const e1 = protokolZapis(z, { kde: 'Dokumenty', co: 'Vytištěna cenová nabídka OCK',
  kdo: 'Vendl', kdy: '2026-07-30T08:00:00.000Z' });
test('událost se zapíše', z.protokol.length === 1 && e1.co === 'Vytištěna cenová nabídka OCK');
test('událost si pamatuje kdo, kdy a kde',
  e1.kdo === 'Vendl' && e1.kdy === '2026-07-30T08:00:00.000Z' && e1.kde === 'Dokumenty');
const e2 = protokolZapis(z, { kde: 'Dokumenty', co: 'Uzamčena varianta', kdo: 'Vendl' });
test('id se neopakuje', e2.id !== e1.id);
test('zápis bez popisu se neprovede',
  protokolZapis(z, { kde: 'Dokumenty' }) === null && z.protokol.length === 2);
test('zápis do ničeho nespadne', protokolZapis(null, { co: 'x' }) === null);

/* Protokol nesmí růst donekonečna – zakázka se nosí v jednom souboru.
 * Ubývá se odspodu, tedy od nejstaršího. */
const zdlouhy = nova();
for (let i = 0; i < PROTOKOL_MAX + 5; i++)
  protokolZapis(zdlouhy, { kde: 'Test', co: 'krok ' + i, kdy: '2026-07-30T00:00:00.000Z' });
test('protokol se drží pod stropem', zdlouhy.protokol.length === PROTOKOL_MAX, zdlouhy.protokol.length);
test('ubývá od nejstaršího', zdlouhy.protokol[0].co === 'krok 5', zdlouhy.protokol[0].co);

/* ---------- 3) otisk ---------- */
const zo = nova();
protokolZapis(zo, { kde: 'Test', co: 'něco' });
test('otisk protokol sám neobsahuje', protokolOtisk(zo).indexOf('"protokol"') < 0);
test('otisk je platný JSON zakázky', JSON.parse(protokolOtisk(zo)).cislo === zo.cislo);
test('otisk snese null', protokolOtisk(null) === '');

/* ---------- 4) rozdíl v hlavičce ---------- */
const a = zk.novaZakazka();
let b = kopie(a);
test('beze změny není co hlásit', protokolRozdil(a, b).length === 0,
  JSON.stringify(protokolRozdil(a, b)));

b.nazevAkce = 'Bytový dům Kolbenova';
const rh = protokolRozdil(a, b);
test('změna hlavičky se pozná', rh.length === 1, JSON.stringify(rh));
test('a je popsaná česky', rh[0].kde === 'Hlavička zakázky' && rh[0].co === 'Název akce',
  JSON.stringify(rh[0]));
test('drží starou i novou hodnotu', rh[0].pred === '' && rh[0].po === 'Bytový dům Kolbenova');
test('hlavička není citlivá', rh[0].citlive === false);

/* Protokol se do rozdílu nesmí počítat sám – jinak by každý zápis vyvolal
 * další zápis a protokol by se donekonečna zaznamenával při psaní. */
b = kopie(a); protokolZajisti(b);
protokolZapis(b, { kde: 'Test', co: 'zápis' });
test('protokol sám se do rozdílu nepočítá', protokolRozdil(a, b).length === 0,
  JSON.stringify(protokolRozdil(a, b)));

/* ---------- 5) varianty ---------- */
b = kopie(a); b.varianty[0].nazev = 'Varianta se sklem';
const rv = protokolRozdil(a, b);
test('přejmenování varianty se pozná', rv.length === 1 && /Název varianty/i.test(rv[0].co),
  JSON.stringify(rv));
test('rozdíl ví, které varianty se týká', rv[0].varianta === a.varianty[0].id);

b = kopie(a); b.varianty.push(JSON.parse(JSON.stringify(a.varianty[0])));
b.varianty[1].id = 'v-nova'; b.varianty[1].nazev = 'Varianta 2'; b.varianty[1].ridici = false;
const rp = protokolRozdil(a, b);
test('přidaná varianta se pozná', rp.some(x => /Přidána varianta/i.test(x.co)),
  JSON.stringify(rp));

b = kopie(a); b.varianty.push({ id: 'v-x', nazev: 'Varianta 2', data: {} });
const c = kopie(b); c.varianty.splice(1, 1);
test('smazaná varianta se pozná',
  protokolRozdil(b, c).some(x => /Smazána varianta/i.test(x.co)),
  JSON.stringify(protokolRozdil(b, c)));

/* ---------- 6) zadání versus ceník ---------- */
b = kopie(a); b.varianty[0].data.ock.zadani.zdvih = (a.varianty[0].data.ock.zadani.zdvih || 0) + 3;
const rz = protokolRozdil(a, b);
test('změna zadání se pozná', rz.length === 1, JSON.stringify(rz));
test('a míří do zadání OCK', /Zadání OCK/i.test(rz[0].kde), rz[0].kde);
test('zadání není citlivé', rz[0].citlive === false);

b = kopie(a);
const cenikKlic = Object.keys(a.varianty[0].data.cenik).find(k => typeof a.varianty[0].data.cenik[k] === 'number');
b.varianty[0].data.cenik[cenikKlic] = a.varianty[0].data.cenik[cenikKlic] + 1;
const rc = protokolRozdil(a, b);
test('změna ceníku se pozná', rc.length === 1, JSON.stringify(rc));
test('ceník je označený jako citlivý', rc[0].citlive === true && /Ceník/i.test(rc[0].kde),
  JSON.stringify(rc[0]));

/* ---------- 7) poznámky se do protokolu neopisují ---------- */
const TAJNE = 'TAJNÁ INTERNÍ VĚTA 4711';
b = kopie(a); poznamkyZajisti(b);
poznamkyPridej(b, TAJNE, { kdo: 'Vendl' });
const rn = protokolRozdil(a, b);
test('přibylá poznámka se ohlásí', rn.length >= 1 && /poznám/i.test(rn[0].co + rn[0].kde),
  JSON.stringify(rn));
test('ale její text se do protokolu neopíše', JSON.stringify(rn).indexOf(TAJNE) < 0,
  JSON.stringify(rn));

/* ---------- 8) zaznamenání dávky ---------- */
const zz = nova();
const pred = JSON.parse(protokolOtisk(zz));
zz.nazevAkce = 'Bytový dům Kolbenova';
zz.objednatel = 'Stavby s.r.o.';
const davka = protokolZaznamenej(zz, pred, { kdo: 'Vendl' });
test('dávka zapíše obě změny', davka.length === 2 && zz.protokol.length === 2,
  JSON.stringify(davka));
test('a podepíše je uživatelem', zz.protokol.every(x => x.kdo === 'Vendl'));
test('beze změny se nezapisuje nic',
  protokolZaznamenej(zz, JSON.parse(protokolOtisk(zz)), { kdo: 'Vendl' }).length === 0
  && zz.protokol.length === 2);
test('zaznamenání snese null', protokolZaznamenej(null, pred).length === 0);

/* Výměna celého ceníku (načtení _program.json) je jedna událost, ne dvě stě
 * řádků. Protokol, ve kterém se nedá nic najít, je stejně k ničemu jako žádný. */
const zc = nova();
const predC = JSON.parse(protokolOtisk(zc));
Object.keys(zc.varianty[0].data.cenik).forEach(k => {
  if (typeof zc.varianty[0].data.cenik[k] === 'number') zc.varianty[0].data.cenik[k] += 1;
});
const davkaC = protokolZaznamenej(zc, predC, { kdo: 'Vendl' });
test('velká dávka se zkrátí', davkaC.length <= PROTOKOL_DAVKA_MAX + 1, davkaC.length);
test('a řekne, kolik změn se nevypsalo',
  davkaC.length < 2 || /dalších/i.test(davkaC[davkaC.length - 1].co),
  davkaC[davkaC.length - 1].co);

/* ---------- 9) seznam, text a shrnutí ---------- */
test('seznam je od nejnovější', (() => {
  const l = protokolSeznam(zz);
  for (let i = 1; i < l.length; i++) if (l[i - 1].kdy < l[i].kdy) return false;
  return true;
})());
test('seznam se dá filtrovat podle varianty',
  protokolSeznam(zc, { varianta: zc.varianty[0].id }).length === protokolSeznam(zc).length);
test('seznam snese null', protokolSeznam(null).length === 0);

const txtAdmin = protokolText(zc, { cisla: true });
const txtBezni = protokolText(zc, { cisla: false });
test('administrátor v textu čísla vidí', /→/.test(txtAdmin), txtAdmin.slice(0, 160));
test('běžný uživatel citlivé hodnoty nevidí',
  !/→/.test(txtBezni) || /skryt/i.test(txtBezni), txtBezni.slice(0, 200));
test('text prázdného protokolu je prázdný', protokolText(nova()) === '');

const sh = protokolShrnuti(zz);
test('shrnutí spočítá záznamy', sh.pocet === 2, JSON.stringify(sh));
test('shrnutí zná první i poslední', !!sh.prvni && !!sh.posledni);
test('shrnutí vyjmenuje uživatele', sh.uzivatele.indexOf('Vendl') >= 0, JSON.stringify(sh.uzivatele));
test('shrnutí snese null', protokolShrnuti(null).pocet === 0);

/* ---------- 10) přenos souborem a mlčení v dokumentech ---------- */
const znovu = zk.importZakazka(JSON.parse(zk.StorageAdapter.exportuj(zz)));
protokolZajisti(znovu);
test('protokol přežije uložení a načtení', protokolSeznam(znovu).length === 2);

const GENERATORY = ['nabidka.js', 'nabidka_proj.js', 'kryci.js', 'kryci_proj.js',
                    'docxgen.js', 'dokumenty.js', 'techspec.js'];
const hrisnici = GENERATORY.filter(f =>
  /\bprotokol\b/i.test(fs.readFileSync(__dirname + '/' + f, 'utf8')));
test('generátory dokumentů o protokolu nevědí', hrisnici.length === 0, hrisnici.join(', '));

test('hodnoty se do textu překládají čitelně',
  protokolHodnota('') === '(prázdné)' && protokolHodnota(true) === 'ano'
  && protokolHodnota(false) === 'ne' && protokolHodnota(12) === '12',
  [protokolHodnota(''), protokolHodnota(true), protokolHodnota(12)].join(' | '));

/* ---------- 11) doťukávání jedné hodnoty a nezničitelnost protokolu ---------- */
/* Uživatel přepisuje jedno pole nadvakrát – v protokolu má být jeden řádek
 * od původní k výsledné hodnotě, ne cesta přes všechny mezistavy. */
const zs = nova();
let sn = kopie(zs);
zs.nazevAkce = 'Bytový dům';
protokolZaznamenej(zs, sn, { kdo: 'Vendl' });
sn = kopie(zs);
zs.nazevAkce = 'Bytový dům Kolbenova';
protokolZaznamenej(zs, sn, { kdo: 'Vendl' });
test('doťukávání téhož pole je jeden záznam', zs.protokol.length === 1,
     JSON.stringify(zs.protokol.map(x => x.co + ' ' + x.pred + '→' + x.po)));
test('a drží první i poslední hodnotu',
     zs.protokol[0].pred === '' && zs.protokol[0].po === 'Bytový dům Kolbenova',
     JSON.stringify(zs.protokol[0]));

/* Vrácení hodnoty na původní nemá v protokolu zůstat – nic se nezměnilo. */
sn = kopie(zs);
zs.nazevAkce = '';
protokolZaznamenej(zs, sn, { kdo: 'Vendl' });
test('vrácení hodnoty na původní záznam ruší', zs.protokol.length === 0,
     JSON.stringify(zs.protokol));

/* Jiné pole mezi tím sloučení přeruší. */
const zj = nova();
sn = kopie(zj); zj.nazevAkce = 'A'; protokolZaznamenej(zj, sn, { kdo: 'V' });
sn = kopie(zj); zj.adresa = 'Praha'; protokolZaznamenej(zj, sn, { kdo: 'V' });
sn = kopie(zj); zj.nazevAkce = 'B'; protokolZaznamenej(zj, sn, { kdo: 'V' });
test('jiné pole mezi tím sloučení přeruší', zj.protokol.length === 3,
     JSON.stringify(zj.protokol.map(x => x.co)));

/* Zakázka má vlastní klíč, aby šlo poznat, že jde po kroku „Zpět“
 * pořád o tutéž zakázku, a ne o cizí soubor. */
test('zakázka dostane vlastní klíč', !!zj.protokolKlic && zj.protokolKlic !== nova().protokolKlic);
test('klíč přežije uložení a načtení',
     zk.importZakazka(JSON.parse(zk.StorageAdapter.exportuj(zj))).protokolKlic === zj.protokolKlic);

/* Krok „Zpět“ dosadí starší otisk zakázky – včetně staršího, kratšího
 * protokolu. Záznamy, které v něm chybí, se musí vrátit; jinak by šel celý
 * zápis vygumovat klávesou Ctrl+Z. */
const zstary = kopie(zj);          // otisk se dvěma záznamy…
zstary.protokol = zj.protokol.slice(0, 1);
protokolDopln(zstary, zj.protokol);
test('krok zpět protokol nevygumuje', zstary.protokol.length === 3,
     String(zstary.protokol.length));
test('a nic v něm nezdvojí', protokolDopln(zstary, zj.protokol).length === 3);
test('doplnění drží pořadí podle času',
     zstary.protokol.map(x => x.id).join('|') === zj.protokol.map(x => x.id).join('|'));
test('doplnění snese prázdný seznam', protokolDopln(nova(), []).length === 0);

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
