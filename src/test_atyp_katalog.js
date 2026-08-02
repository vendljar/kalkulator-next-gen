/* Test #7 (OCK-2) – napojení ATYP položek na katalog a ceník.
 *
 * Čeho se to týká: u atypické zakázky se dělají věci, které v předloze nejsou —
 * netradiční tvar šachty, napojení na stavbu, zámečnické práce navíc. Do
 * 30. 7. 2026 se jejich cena psala ručně do pole `Z.zamecnikAtypKc` přímo
 * v zakázce. Číslo tak vzniklo mimo výpočet a mimo ceník: nikdo ho příště
 * nedohledal, nikdo ho neaktualizoval a nabídka stála na hodnotě, kterou si
 * kdysi někdo zapamatoval. Pravidlo projektu je přitom jednoznačné — ceny se
 * nevymýšlejí, všechny částky pocházejí z výpočtu.
 *
 * Přirážku za atyp (#22) tohle neřeší, ta má vlastní sadu (test_atyp.js).
 * Tady jde o POLOŽKY: odkud berou cenu a co se stane, když ji nemají.
 *
 * Co se hlídá:
 *   1) katalog má sekci ATYP a její položky doputují do kalkulace,
 *   2) cena atypové zámečnické práce se bere z CENÍKU; číslo v zakázce je
 *      přepis pro jednu zakázku (stejná logika jako u PROJ, #8) — prázdno
 *      znamená „platí ceník", nula je platná dohoda,
 *   3) položka bez ceny NEPROPADNE tiše jako nula: je označená v datech
 *      i v kontrole před nabídkou,
 *   4) staré zakázky počítají dál stejně.
 *
 * Očekávání se odvozují ze zadání a ceníku, ne z opsaných čísel — v repozitáři
 * jsou nulové ceny a opsaná hodnota by hlídala vzorek místo pravidla.
 */
const fs = require('fs');
const eng = require('./engine.js');
const kat = require('./katalog.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
const kopie = o => JSON.parse(JSON.stringify(o));

const CENIK = ZC.zkusebniCenik();
const zadaniZ = zmeny => { const z = kopie(eng.DEFAULT_ZADANI); if (zmeny) zmeny(z); return z; };
const spocti = (z, c) => eng.vypocet(z, c || CENIK, JEKLY, true);
const najdi = (r, cast) => r.sekce.hrubaOck.find(x => (x.origNazev || x.nazev).indexOf(cast) >= 0);

/* ---------- 1) katalog zná sekci ATYP ---------- */
test('katalog má sekci atyp', kat.KATALOG_SEKCE.indexOf('atyp') >= 0, kat.KATALOG_SEKCE.join(','));
test('sekce atyp má lidský název',
  !!kat.KATALOG_SEKCE_NAZEV.atyp && /ATYP/i.test(kat.KATALOG_SEKCE_NAZEV.atyp), kat.KATALOG_SEKCE_NAZEV.atyp);

const K = kat.katalogPrazdny();
const Zk = zadaniZ();
kat.katalogPridej(K, 'atyp', { nazev: 'Napojení na stavbu – atypický detail', mnozstvi: 2, cena: 3000 });
const dopl = kat.katalogAplikuj(K, Zk);
test('katalogová atyp položka se doplní do zadání', dopl === 1, dopl);
test('atyp položka má v zadání vlastní cíl',
  Array.isArray(Zk.vlastniPolozky.atyp) && Zk.vlastniPolozky.atyp.length === 1,
  JSON.stringify(Zk.vlastniPolozky && Zk.vlastniPolozky.atyp));

/* ---------- 2) položka z katalogu se propíše do výpočtu ---------- */
const rBez = spocti(zadaniZ());
const rSAtyp = spocti(Zk);
const radek = najdi(rSAtyp, 'Napojení na stavbu');
test('atyp položka z katalogu je v sekci HRUBÁ OCK', !!radek);
test('atyp položka se spočítá množství × cena', radek && radek.naklad === 2 * 3000, radek && radek.naklad);
test('atyp položka je označená jako atypová', radek && radek.atyp === true, radek && radek.atyp);
test('atyp položka zvedne náklad sekce přesně o svou hodnotu',
  Math.abs((rSAtyp.souctySekci.hrubaOck.naklad - rBez.souctySekci.hrubaOck.naklad) - 6000) < 0.001,
  rSAtyp.souctySekci.hrubaOck.naklad - rBez.souctySekci.hrubaOck.naklad);
test('atyp položka se promítne i do celkové ceny nabídky',
  rSAtyp.souhrn.zakladCena > rBez.souhrn.zakladCena);

/* ---------- 3) cena zámečnické atyp práce pochází z ceníku ---------- */
const CEN = kopie(CENIK); CEN.zamecnikAtypKc = 900;
const zZam = zadaniZ(z => { z.zamecnikAtypKs = 3; delete z.zamecnikAtypKc; });
const rZam = najdi(spocti(zZam, CEN), 'ZÁMEČNÍKA - OSTATNÍ');
test('bez přepisu se sazba atyp zámečníka vezme z ceníku', rZam && rZam.cena === 900, rZam && rZam.cena);
test('náklad atyp zámečníka = množství × ceníková sazba', rZam && rZam.naklad === 3 * 900, rZam && rZam.naklad);

/* Přepis v zakázce má přednost — je to dohoda pro jednu stavbu, ceník zůstává. */
const zPrepis = zadaniZ(z => { z.zamecnikAtypKs = 3; z.zamecnikAtypKc = 1200; });
const rPrepis = najdi(spocti(zPrepis, CEN), 'ZÁMEČNÍKA - OSTATNÍ');
test('číslo v zakázce přebije ceníkovou sazbu', rPrepis && rPrepis.naklad === 3 * 1200, rPrepis && rPrepis.naklad);
test('přepis nesahá do ceníku', CEN.zamecnikAtypKc === 900, CEN.zamecnikAtypKc);

/* Nula je platná dohoda („tohle uděláme zdarma"), ne nevyplněno — jinak by se
 * ústupek zákazníkovi tiše přepsal ceníkovou sazbou a nabídka by byla dražší,
 * než co bylo domluveno. */
const zNula = zadaniZ(z => { z.zamecnikAtypKs = 3; z.zamecnikAtypKc = 0; });
const rNula = najdi(spocti(zNula, CEN), 'ZÁMEČNÍKA - OSTATNÍ');
test('nula v zakázce je platný přepis, ne návrat k ceníku', rNula && rNula.naklad === 0, rNula && rNula.naklad);

/* ---------- 4) položka bez ceny nepropadne jako nula ---------- */
const CEN0 = kopie(CENIK); CEN0.zamecnikAtypKc = 0;
const zBezCeny = zadaniZ(z => { z.zamecnikAtypKs = 2; delete z.zamecnikAtypKc; });
const rBezCeny = najdi(spocti(zBezCeny, CEN0), 'ZÁMEČNÍKA - OSTATNÍ');
test('atyp práce bez ceny je v datech označená', rBezCeny && rBezCeny.bezCeny === true, rBezCeny && rBezCeny.bezCeny);

const K2 = kat.katalogPrazdny();
const Z2 = zadaniZ();
kat.katalogPridej(K2, 'atyp', { nazev: 'Atypický prvek bez ceny', mnozstvi: 1, cena: 0 });
kat.katalogAplikuj(K2, Z2);
const rK2 = najdi(spocti(Z2), 'Atypický prvek bez ceny');
test('katalogová atyp položka s nulovou cenou je označená', rK2 && rK2.bezCeny === true, rK2 && rK2.bezCeny);

/* Nepoužitá položka (množství 0) není chyba — nikdo ji do nabídky nedává. */
const K3 = kat.katalogPrazdny();
const Z3 = zadaniZ();
kat.katalogPridej(K3, 'atyp', { nazev: 'Nepoužitý atyp', mnozstvi: 0, cena: 0 });
kat.katalogAplikuj(K3, Z3);
const rK3 = najdi(spocti(Z3), 'Nepoužitý atyp');
test('nepoužitá položka (množství 0) se za chybu nepovažuje', rK3 && !rK3.bezCeny, rK3 && rK3.bezCeny);

/* Oceněná položka nesmí svítit — jinak si na varování všichni zvyknou. */
test('oceněná atyp položka označená není', radek && !radek.bezCeny, radek && radek.bezCeny);

/* ---------- 5) kontrola před nabídkou na to upozorní ---------- */
const kt = require('./kontroly.js');
/* Katalog pravidel (kontrolyPravidla) nese jen popis – vyhodnocuje se přes
 * kontrolyProved, tedy stejnou cestou, jakou jde aplikace. */
const pravidlo = kt.kontrolyPravidla().find(p => p.kod === 'atypBezCeny');
test('kontrola „atypBezCeny“ existuje', !!pravidlo);
test('kontrola patří ke Kalkulaci OCK', pravidlo && pravidlo.kde === 'Kalkulace OCK', pravidlo && pravidlo.kde);
test('kontrola neblokuje, jen varuje (úroveň 2)',
  pravidlo && pravidlo.uroven === kt.KONTROLY_UROVEN && !pravidlo.zabranaMozna,
  pravidlo && (pravidlo.uroven + '/' + pravidlo.zabranaMozna));

const ctxS = { zadani: zBezCeny, cenik: CEN0, vysledek: spocti(zBezCeny, CEN0) };
const vyslS = kt.kontrolyProved(ctxS);
const nalez = vyslS.nalezy.find(n => n.kod === 'atypBezCeny');
test('nad položkou bez ceny se kontrola rozsvítí', !!nalez, JSON.stringify(vyslS.kody));
test('kontrola pojmenuje konkrétní položku',
  nalez && /ZÁMEČNÍKA/i.test(nalez.text), nalez && nalez.text);
/* Běžný uživatel nevidí náklady (#36) – text tedy nesmí nést částku. */
test('text kontroly neprozrazuje částky', nalez && !/\d[\d\u00a0 ]*\s*Kč/.test(nalez.text), nalez && nalez.text);
/* Nesmí zastavit dokument – zábrana zůstává jen u prázdného ceníku. */
test('nález atypBezCeny nebrání vzniku dokumentu', vyslS.kodyBrani.indexOf('atypBezCeny') < 0, vyslS.kodyBrani.join(','));

const ctxOk = { zadani: Zk, cenik: CENIK, vysledek: rSAtyp };
test('nad oceňovanou atyp položkou kontrola mlčí',
  kt.kontrolyProved(ctxOk).kody.indexOf('atypBezCeny') < 0, kt.kontrolyProved(ctxOk).kody.join(','))

/* ---------- 6) staré zakázky se nesmí hnout ---------- */
const zStara = zadaniZ(z => { z.zamecnikAtypKs = 4; z.zamecnikAtypKc = 750; });
const cenikStary = kopie(CENIK); delete cenikStary.zamecnikAtypKc;
const rStara = najdi(spocti(zStara, cenikStary), 'ZÁMEČNÍKA - OSTATNÍ');
test('zakázka s vlastní cenou počítá i nad ceníkem bez nové položky stejně',
  rStara && rStara.naklad === 4 * 750, rStara && rStara.naklad);

const bezAtypu = zadaniZ();
test('zakázka bez atypu nemá v HRUBÉ OCK žádný atypový řádek',
  spocti(bezAtypu).sekce.hrubaOck.every(x => !x.atyp));
test('zakázka bez atypu má stejný souhrn jako dřív (nic se nepřidalo)',
  Math.abs(spocti(bezAtypu).souhrn.zakladCena - rBez.souhrn.zakladCena) < 0.001);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
