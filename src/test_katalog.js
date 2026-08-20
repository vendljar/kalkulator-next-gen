// Testy trvalých (katalogových) položek ceníku – KATALOG + jejich zapojení do enginu.
// Spuštění: cd src && node test_katalog.js
const KAT = require('./katalog.js');
const { vypocet, DEFAULT_ZADANI, DEFAULT_CENIK } = require('./engine.js');
const jekly = require('./jekly.json');
const ZC = require('./zkusebni_cenik.js');

const T = [];
const chk = (name, got, want, tol = 0.01) => T.push([Math.abs(got - want) <= tol ? 'OK ' : 'FAIL', name, got, want]);
const boolChk = (name, got, want = true) => T.push([got === want ? 'OK ' : 'FAIL', name, String(got), String(want)]);

// ---- 1. katalog samotný ----------------------------------------------------
const kat = KAT.katalogPrazdny();
KAT.katalogPridej(kat, 'spojovaci', { nazev: 'Šrouby M8', mnozstvi: 100, cena: 4.5 });
KAT.katalogPridej(kat, 'lakovani', { nazev: 'Práškový lak RAL', mnozstvi: 2, cena: 1200 });
KAT.katalogPridej(kat, 'priplatky', { nazev: 'Doprava navíc', mnozstvi: 1, cena: 5000 });
KAT.katalogPridej(kat, 'hrubaOck', { nazev: 'Kotvicí sada', mnozstvi: 4, cena: 850 });
boolChk('katalog má 4 položky', KAT.katalogPocet(kat) === 4);

const z1 = {};
chk('aplikace do prázdné zakázky', KAT.katalogAplikuj(kat, z1), 4, 0);
boolChk('spojovací dorazil', z1.vlastniPolozky.spojovaci[0].nazev === 'Šrouby M8');
boolChk('lakování dorazilo', z1.vlastniPolozky.lakovani[0].nazev === 'Práškový lak RAL');
boolChk('příplatek dorazil', z1.priplatkyVlastni[0].nazev === 'Doprava navíc');
chk('idempotence – druhý běh nic nepřidá', KAT.katalogAplikuj(kat, z1), 0, 0);

// odebrání v zakázce se pamatuje a položka se nevrací
const smaz = z1.vlastniPolozky.spojovaci[0];
KAT.katalogZapamatujOdebrani(z1, smaz);
z1.vlastniPolozky.spojovaci.splice(0, 1);
chk('po odebrání se položka nevrací', KAT.katalogAplikuj(kat, z1), 0, 0);
boolChk('sekce spojovací zůstala prázdná', z1.vlastniPolozky.spojovaci.length === 0);

// nová zakázka dostane vše
const z2 = {};
chk('nová zakázka dostane celý katalog', KAT.katalogAplikuj(kat, z2), 4, 0);

// export/import (→ konfigurace.json)
const dump = JSON.parse(JSON.stringify(KAT.katalogExport(kat)));
const kat2 = KAT.katalogPrazdny();
KAT.katalogImport(kat2, dump);
chk('import zachová počet', KAT.katalogPocet(kat2), KAT.katalogPocet(kat), 0);
chk('seq po importu (kolize kid)', kat2.seq, kat.seq, 0);

// úprava a smazání
const kid = KAT.katalogSekce(kat, 'lakovani')[0].kid;
KAT.katalogUprav(kat, 'lakovani', kid, 'cena', 1500);
chk('úprava ceny v katalogu', KAT.katalogNajdi(kat, 'lakovani', kid).cena, 1500, 0);
KAT.katalogSmaz(kat, 'lakovani', kid);
boolChk('smazání z katalogu', KAT.katalogNajdi(kat, 'lakovani', kid) == null);
chk('počet po smazání', KAT.katalogPocet(kat), 3, 0);

// ---- 2. zapojení do výpočtu ------------------------------------------------
const cenik = ZC.zkusebniCenik();
const zBase = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
const rBase = vypocet(JSON.parse(JSON.stringify(zBase)), cenik, jekly, false);

const katE = KAT.katalogPrazdny();
KAT.katalogPridej(katE, 'spojovaci', { nazev: 'Trvalé šrouby', mnozstvi: 10, cena: 100 }); // 1 000 Kč
KAT.katalogPridej(katE, 'lakovani', { nazev: 'Trvalý lak', mnozstvi: 2, cena: 500 });      // 1 000 Kč
KAT.katalogPridej(katE, 'priplatky', { nazev: 'Trvalý příplatek', mnozstvi: 1, cena: 7000 });
const zK = JSON.parse(JSON.stringify(zBase));
KAT.katalogAplikuj(katE, zK);
const rK = vypocet(zK, cenik, jekly, false);

chk('spojovací materiál +1 000 Kč', rK.spojovaci.celkem - rBase.spojovaci.celkem, 1000, 0.5);
boolChk('spojovací řádek je vidět v detailu', !!rK.spojovaci.rows.find(x => x.nazev === 'Trvalé šrouby' && x.vlastni));
chk('lakování +1 000 Kč', rK.lakovani.pouzito - rBase.lakovani.pouzito, 1000, 0.5);
chk('lakování vlastniKc', rK.lakovani.vlastniKc, 1000, 0.5);
boolChk('lakování řádek v detailu', !!(rK.lakovani.vlastniRows || []).find(x => x.nazev === 'Trvalý lak'));
const pripK = rK.priplatky.find(x => x.nazev === 'Trvalý příplatek');
boolChk('trvalý příplatek v seznamu', !!pripK);
boolChk('trvalý příplatek nese kid', !!(pripK && pripK.kid));
boolChk('trvalý příplatek má poznámku', !!(pripK && pripK.pozn === 'trvalá položka z ceníku'));

// vlastní položka bez kid = ruční
const zR = JSON.parse(JSON.stringify(zBase));
zR.vlastniPolozky = { hrubaOck: [{ nazev: 'Ruční', mnozstvi: 1, cena: 500 }] };
const rR = vypocet(zR, cenik, jekly, false);
const ruc = rR.sekce.hrubaOck.find(x => x.nazev === 'Ruční');
boolChk('ruční položka bez kid', !!ruc && ruc.kid == null && ruc.pozn === 'ruční položka');

// ---- 5. trvalé položky ceníku PROJ (19. 8. 2026) ----------------------------
/* „+ přidat položku trvale" v Kalkulaci PROJ zapisuje do ceníku PROJ dané
 * sekce (pc.vlastniPolozky), aby položka platila pro všechny budoucí zakázky.
 * Aplikace do zadání je idempotentní (kid) a respektuje ruční odebrání. */
const pc = ZC.zkusebniCenikProj();
const itF = KAT.projKatalogPridej(pc, 'dpz', { nazev: 'Radonový průzkum', typ: 'fix', cena: 8000 });
const itH = KAT.projKatalogPridej(pc, 'studie', { nazev: 'Vizualizace', typ: 'hod', sazba: 'projektant', hodiny: 6 });
boolChk('fixní položka dostala kid', /^pk\d+$/.test(itF.kid));
boolChk('hodinová položka dostala kid', /^pk\d+$/.test(itH.kid) && itH.kid !== itF.kid);
boolChk('ceník PROJ nese obě položky',
  pc.vlastniPolozky.dpz.length === 1 && pc.vlastniPolozky.studie.length === 1);

const { DEFAULT_ZADANI_PROJ, vypocetProj } = require('./engine_proj.js');
const pj = JSON.parse(JSON.stringify(DEFAULT_ZADANI_PROJ));
chk('aplikace do zadání PROJ přidá 2 položky', KAT.projKatalogAplikuj(pc, pj), 2, 0);
chk('idempotence – druhý běh nic nepřidá', KAT.projKatalogAplikuj(pc, pj), 0, 0);
const sDpz = pj.sekce.find(s => s.key === 'dpz');
const pRadon = sDpz.polozky.find(p => p.kid === itF.kid);
boolChk('fixní položka dorazila do sekce DPZ jako vlastní',
  !!pRadon && pRadon.vlastni === true && pRadon.typ === 'fix' && pRadon.cena === 8000);
const sStudie = pj.sekce.find(s => s.key === 'studie');
const pViz = sStudie.polozky.find(p => p.kid === itH.kid);
boolChk('hodinová položka dorazila do sekce STUDIE se sazbou a hodinami',
  !!pViz && pViz.typ === 'hod' && pViz.sazba === 'projektant' && pViz.hodiny === 6);
const rProj = vypocetProj(pj, pc);
boolChk('výpočet PROJ trvalou fixní položku počítá',
  rProj.sekce.find(s => s.key === 'dpz').polozky.some(p => p.nazev === 'Radonový průzkum' && p.naklad === 8000));

/* ruční odebrání v jedné zakázce se respektuje */
KAT.projKatalogZapamatujOdebrani(pj, pRadon);
sDpz.polozky.splice(sDpz.polozky.indexOf(pRadon), 1);
chk('po odebrání se položka do zakázky nevrací', KAT.projKatalogAplikuj(pc, pj), 0, 0);

/* úprava trvalé položky se propíše do ceníku PROJ */
pViz.hodiny = 9; pViz.nazev = 'Vizualizace exteriéru';
KAT.projKatalogPropis(pc, 'studie', pViz);
boolChk('úprava řádku se propsala do ceníku PROJ',
  pc.vlastniPolozky.studie[0].hodiny === 9 && pc.vlastniPolozky.studie[0].nazev === 'Vizualizace exteriéru');

/* nová zakázka (čerstvé zadání) dostane trvalé položky z ceníku */
const pj2 = JSON.parse(JSON.stringify(DEFAULT_ZADANI_PROJ));
chk('čerstvé zadání dostane z ceníku 2 položky', KAT.projKatalogAplikuj(pc, pj2), 2, 0);
boolChk('a hodinová už nese upravených 9 hodin',
  pj2.sekce.find(s => s.key === 'studie').polozky.some(p => p.kid === itH.kid && p.hodiny === 9));

/* smazání z ceníku PROJ */
boolChk('smazání trvalé položky z ceníku PROJ', KAT.projKatalogSmaz(pc, 'studie', itH.kid) === true);
boolChk('po smazání v ceníku není', pc.vlastniPolozky.studie.length === 0);

let fail = 0;
for (const [st, name, got, want] of T) {
  if (st === 'FAIL') fail++;
  console.log(`${st} ${name}: ${typeof got === 'number' ? got.toFixed(4) : got} (očekáváno ${want})`);
}
console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY KATALOG OK');
process.exit(fail ? 1 : 0);
