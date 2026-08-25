/* Test nabidka_proj.js – cenová nabídka PROJ podle VZORu ENGINEERS CZ.
   Klíčové vlastnosti, které se hlídají:
     – struktura dokumentu je kompletní a odpovídá VZORu,
     – ceny se berou z Kalkulace PROJ (vypocetProj) a nikdy se nevymýšlejí,
     – nulová sekce se označí jako „není součástí této nabídky“,
     – funkce nikdy nespadne a nikdy nemění data zakázky. */
const ep = require('./engine_proj.js');
Object.keys(ep).forEach(k => { global[k] = ep[k]; });
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();  // ceník v sestavení je prázdný, testy potřebují čísla
const tsm = require('./techspec.js');
Object.keys(tsm).forEach(k => { global[k] = tsm[k]; });
const zk = require('./zakazka.js');
/* Nabídka PROJ čte vlastní hlavičku PROJ a prázdná pole si bere z hlavičky OCK.
 * V Node se moduly načítají zvlášť, takže funkce doplníme do globálu – jinak by
 * se testovala nouzová větev místo kódu, který poběží v aplikaci. */
global.projHlavicka = zk.projHlavicka;
global.projHlavickaEfektivni = zk.projHlavickaEfektivni;
global.projCisloNabidky = zk.projCisloNabidky;
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const pr = require('./preklad.js');
Object.keys(pr).forEach(k => { global[k] = pr[k]; });
/* sleva.js kvůli slevaPodil() – nabidka_proj.js ho volá přes typeof, takže
 * bez něj by se sleva tiše nepočítala a test by měřil nulu. */
const SLV = require('./sleva.js');
global.slevaPodil = SLV.slevaPodil;
const NP = require('./nabidka_proj.js');
const { nabidkaProjData, NABIDKA_PROJ_DEF, NABIDKA_PROJ_SAZBY, NABIDKA_PROJ_SEKCE } = NP;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const zak = zk.novaZakazka();
zak.cislo = '2026 OVP CN 0101'; zak.objednatel = 'SVJ Ulice 1'; zak.kontakt = 'Ing. Novák / předseda';
zak.adresa = 'Ulice 1, 170 00 Praha 7'; zak.datum = '2026-07-26'; zak.nazevAkce = 'Výstavba výtahu';
/* Datum má hlavička PROJ vlastní a předvyplněné dneškem – je tedy vyplněné
 * a z hlavičky OCK se nepřebírá. Ve fixtuře ho proto nastavíme na obou místech,
 * ať test hlídá přenos do dokumentu, ne dnešní datum. */
zak.projHlavicka.datum = '2026-07-26';
const v = zak.varianty[0];
const d = nabidkaProjData(zak, v);
const r = vypocetProj(v.data.proj.zadani, v.data.proj.cenik);

/* --- 1) struktura dokumentu podle VZORu --- */
const TYPY = ['nadpis', 'proza', 'rozsah', 'cena', 'seznam', 'pary', 'pozn'];
test('definice není prázdná a má rozumný rozsah', NABIDKA_PROJ_DEF.length >= 30, NABIDKA_PROJ_DEF.length);
test('všechny bloky mají známý typ',
  NABIDKA_PROJ_DEF.every(b => TYPY.includes(b.typ)),
  NABIDKA_PROJ_DEF.filter(b => !TYPY.includes(b.typ)).map(b => b.typ).join(','));
test('každý cenový blok míří na sekci kalkulace nebo na paušál',
  NABIDKA_PROJ_DEF.filter(b => b.typ === 'cena').every(b => b.sekce || b.pausal),
  NABIDKA_PROJ_DEF.filter(b => b.typ === 'cena' && !b.sekce && !b.pausal).map(b => b.nadpis).join(','));
test('sekce cenových bloků existují v zadání Kalkulace PROJ', (() => {
  const klice = new Set(DEFAULT_ZADANI_PROJ.sekce.map(s => s.key));
  return NABIDKA_PROJ_DEF.filter(b => b.typ === 'cena' && b.sekce).every(b => klice.has(b.sekce));
})(), NABIDKA_PROJ_DEF.filter(b => b.typ === 'cena' && b.sekce).map(b => b.sekce).join(','));
test('paušály cenových bloků jsou v sazebníku',
  NABIDKA_PROJ_DEF.filter(b => b.typ === 'cena' && b.pausal).every(b => NABIDKA_PROJ_SAZBY[b.pausal] > 0));
test('rekapitulační seznam sekcí sedí na Kalkulaci PROJ', (() => {
  const klice = new Set(DEFAULT_ZADANI_PROJ.sekce.map(s => s.key));
  return NABIDKA_PROJ_SEKCE.every(k => klice.has(k)) && new Set(NABIDKA_PROJ_SEKCE).size === NABIDKA_PROJ_SEKCE.length;
})(), NABIDKA_PROJ_SEKCE.join(','));

/* povinné části VZORu – ať se omylem nevypustí celý oddíl */
const nadpisy = NABIDKA_PROJ_DEF.map(b => b.nadpis || b.text || '').join(' | ');
['ROZSAH NABÍDKY', 'ZAMĚŘENÍ A ZPRACOVÁNÍ VÝSTUPŮ (ZA)', 'STUDIE PROVEDITELNOSTI (ST)',
 'DOKUMENTACE PRO POVOLENÍ ZÁMĚRU (DPZ)', 'INŽENÝRSKÁ ČINNOST (IČ)',
 'DOKUMENTACE PRO PROVEDENÍ STAVBY (DPS)', 'EKONOMICKÁ ZADÁVACÍ ČÁST (EZC)',
 'ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ', 'GEODETICKÉ ZAMĚŘENÍ', 'ROZŠÍŘENÁ NABÍDKA',
 'AUTORSKÝ DOZOR (AD)', 'CENA NEZAHRNUJE', 'POŽADOVÁNO OD INVESTORA', 'TERMÍNY']
  .forEach(n => test('VZOR obsahuje oddíl ' + n, nadpisy.includes(n)));
test('platební podmínky jsou u všech sedmi činností',
  NABIDKA_PROJ_DEF.filter(b => b.typ === 'pary' && /PLATEBNÍ PODMÍNKY/.test(b.nadpis || '')).length === 7,
  NABIDKA_PROJ_DEF.filter(b => b.typ === 'pary' && /PLATEBNÍ PODMÍNKY/.test(b.nadpis || '')).length);

/* --- 2) výstup: bloky --- */
/* Od 17. 8. 2026 (rozhodnutí J. V.) se sekce mimo kalkulační rozsah v nabídce
 * NEUVÁDĚJÍ VŮBEC — bloků proto může být méně než v definici, nikdy víc,
 * a žádný vypsaný cenový blok nesmí být neuvedený. */
test('bloky nesou jen sekce v rozsahu (mimo rozsah se vynechávají)',
  d.bloky.length <= NABIDKA_PROJ_DEF.length
  && d.bloky.filter(b => b.typ === 'cena' && b.sekce).every(b => !b.neuvedena),
  d.bloky.length + '/' + NABIDKA_PROJ_DEF.length);
test('žádný blok nemá prázdný nadpis',
  d.bloky.every(b => b.typ === 'pozn' || (b.nadpis || b.text)));
test('žádná částka není undefined ani NaN',
  d.bloky.filter(b => b.typ === 'cena').every(b => typeof b.castka === 'string' && !/undefined|NaN/.test(b.castka)),
  d.bloky.filter(b => b.typ === 'cena').map(b => b.castka).join(' | '));
test('rozsahové bloky mají řádky', d.bloky.filter(b => b.typ === 'rozsah').every(b => b.radky.length > 0));

/* --- 3) ceny sedí na vypocetProj, nic se nedopočítává --- */
const kc = n => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kč';
/* Výchozí rozsah je od 17. 8. 2026 večer STUDIE (zaměření prázdné a tedy
 * mimo dokument) — cena proti kalkulaci se proto kontroluje na studii. */
const cenaSt = r.sekce.find(s => s.key === 'studie').celkem;
const blokSt = d.bloky.find(b => b.typ === 'cena' && b.sekce === 'studie' && !b.pausalni && !/variantní/.test(b.nadpis));
test('výchozí rozsah: STUDIE vyplněná, ZAMĚŘENÍ prázdné (mimo dokument)',
  cenaSt > 0 && !d.bloky.some(b => b.typ === 'cena' && b.sekce === 'zamereni'),
  d.bloky.filter(b => b.typ === 'cena').map(b => b.nadpis).join(' | '));
test('cena STUDIE je přesně z Kalkulace PROJ', !!blokSt && blokSt.castka === kc(cenaSt),
  (blokSt || {}).castka + ' vs ' + kc(cenaSt));
const soucet = NABIDKA_PROJ_SEKCE.reduce((a, k) => {
  const s = r.sekce.find(x => x.key === k); return a + (s ? s.celkem : 0);
}, 0);
test('souhrn bez DPH = součet oceněných sekcí', Math.abs(d.souhrn.bezDph - soucet) < 0.005,
  d.souhrn.bezDph + ' vs ' + soucet);
test('DPH se počítá ze sazby ceníku varianty', Math.abs(d.souhrn.dphKc - d.souhrn.bezDph * d.souhrn.dphPct / 100) < 0.005);
test('celkem s DPH = základ + DPH', Math.abs(d.souhrn.sDph - (d.souhrn.bezDph + d.souhrn.dphKc)) < 0.005);
test('placeholder s celkovou cenou odpovídá souhrnu', d.placeholders.PROJ_CELKEM_BEZ_DPH === kc(d.souhrn.bezDph));
test('paušál autorského dozoru je z sazebníku, ne z kalkulace',
  (d.bloky.find(b => /AUTORSK/.test(b.nadpis) && b.typ === 'cena') || {}).castka
    === kc(NABIDKA_PROJ_SAZBY.autorskyDozorKcMesic) + ' / měsíc');

/* --- 4) nulová sekce = „není součástí“, nikdy vymyšlená částka --- */
const zakN = zk.novaZakazka();
const vN = zakN.varianty[0];
vN.data.proj.zadani.sekce.forEach(s => {
  (s.polozky || []).forEach(p => { if (p.hodiny != null) p.hodiny = 0; });
});
Object.keys(vN.data.proj.cenik.fixy).forEach(k => { vN.data.proj.cenik.fixy[k] = 0; });
const dN = nabidkaProjData(zakN, vN);
const cenove = dN.bloky.filter(b => b.typ === 'cena' && b.sekce);
/* Do 17. 8. se nulová sekce hlásila větou „není součástí této nabídky";
 * od 17. 8. se NEUVÁDÍ VŮBEC — v popisu ani v cenách (věta zůstává jen
 * ve Wordu, kde je šablona pevná a odstavce vypustit neumí). */
test('nulové sekce se v nabídce neuvádějí vůbec (rozhodnutí 17. 8. 2026)',
  cenove.length === 0, cenove.map(b => b.nadpis).join(' | '));
test('popisy neoceněných sekcí zmizely také',
  !dN.bloky.some(b => /POVOLENÍ ZÁMĚRU \(DPZ\)|INŽENÝRSKÁ ČINNOST|KOLAUDAČ|GEODETICKÉ/.test(b.nadpis || '')),
  dN.bloky.map(b => b.nadpis || b.text).join(' | '));
test('obecné bloky (autorský dozor, DPH, cena nezahrnuje) zůstávají',
  dN.bloky.some(b => /AUTORSK/.test(b.nadpis || ''))
  && dN.bloky.some(b => /DPH/.test(b.nadpis || ''))
  && dN.bloky.some(b => /CENA NEZAHRNUJE/.test(b.nadpis || '')));
test('paušály zůstávají uvedené i při nulové kalkulaci',
  dN.bloky.filter(b => b.typ === 'cena' && !b.sekce).every(b => !b.neuvedena));
test('rekapitulace nulové nabídky je prázdná', dN.rekapitulace.length === 0);

/* --- 4b) jen zaměření: STUDIE PROVEDITELNOSTI se nesmí objevit ---
 * Hlášeno J. V. 23. 8. 2026: zákazníkovi, který si objednal jen zaměření,
 * se v nabídce vytiskla celá hlavička STUDIE PROVEDITELNOSTI i s cenou za
 * „část 1" — tedy nabídka na nekoupenou věc a tatáž částka podruhé.
 * Zaměření je ve VZORu dvakrát (samostatně jako ZA a jako část 1 studie),
 * takže blok visel i na sekci `zamereni`.
 *
 * Výchozí zadání zaměření hodiny nemá (obchodník je doplňuje podle objektu),
 * proto se tu nastavují ručně. */
function projJenSekce(...klice) {
  const z = zk.novaZakazka();
  const vv = z.varianty[0];
  vv.data.proj.zadani.sekce.forEach(s => {
    const chci = klice.indexOf(s.key) >= 0;
    (s.polozky || []).forEach(p => {
      /* `vyrazeno` = položka se v téhle zakázce nepočítá (sloupec Počítat).
       * Výchozí zadání má vyřazené zaměření i další volitelné části. */
      p.vyrazeno = !chci;
      if (p.hodiny != null && chci && !p.hodiny) p.hodiny = 8;
    });
  });
  Object.keys(vv.data.proj.cenik.fixy).forEach(k => {
    vv.data.proj.cenik.fixy[k] = 0;   // fixní subdodávky nechceme, ať cenu dělají jen hodiny
  });
  return { zak: z, varianta: vv };
}

{
  const { zak: zakZ, varianta: vZ } = projJenSekce('zamereni');
  const dZ = nabidkaProjData(zakZ, vZ);
  const nadpisy = dZ.bloky.map(b => b.nadpis || b.text || '').filter(Boolean).join(' | ');
  test('zaměření samotné se v nabídce ocení',
    dZ.bloky.some(b => b.typ === 'cena' && /ZA ZAMĚŘENÍ/.test(b.nadpis || '')), nadpisy);
  test('bez studie se hlavička STUDIE PROVEDITELNOSTI netiskne',
    !dZ.bloky.some(b => /^STUDIE PROVEDITELNOSTI \(ST\)/.test(b.nadpis || '')), nadpisy);
  test('bez studie se netiskne ani cena za „část 1"',
    !dZ.bloky.some(b => /STUDII PROVEDITELNOSTI – část 1/.test(b.nadpis || '')), nadpisy);
  test('cena zaměření je v nabídce jen jednou',
    dZ.bloky.filter(b => b.typ === 'cena' && b.sekce === 'zamereni').length === 1);
}

/* --- 4c) studie objednaná: část 1 (zaměření) se ukáže i s cenou --- */
{
  const { zak: zakS, varianta: vS } = projJenSekce('zamereni', 'studie');
  const dS = nabidkaProjData(zakS, vS);
  const nadpisy = dS.bloky.map(b => b.nadpis || '').filter(Boolean).join(' | ');
  test('se studií se hlavička ST i cena části 1 vytisknou',
    dS.bloky.some(b => /^STUDIE PROVEDITELNOSTI \(ST\)/.test(b.nadpis || ''))
    && dS.bloky.some(b => /STUDII PROVEDITELNOSTI – část 1/.test(b.nadpis || '')), nadpisy);
  const rozsahST = dS.bloky.find(b => /^STUDIE PROVEDITELNOSTI \(ST\)/.test(b.nadpis || ''));
  test('část 1 je uvnitř rozsahu studie i s body zaměření',
    !!rozsahST && rozsahST.radky.some(r => /část 1/.test(r[0] || '')), nadpisy);
}

console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY NABÍDKY PROJ OK');
process.exit(fail ? 1 : 0);
