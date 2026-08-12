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
test('vrací stejný počet bloků jako definice', d.bloky.length === NABIDKA_PROJ_DEF.length,
  d.bloky.length + '/' + NABIDKA_PROJ_DEF.length);
test('žádný blok nemá prázdný nadpis',
  d.bloky.every(b => b.typ === 'pozn' || (b.nadpis || b.text)));
test('žádná částka není undefined ani NaN',
  d.bloky.filter(b => b.typ === 'cena').every(b => typeof b.castka === 'string' && !/undefined|NaN/.test(b.castka)),
  d.bloky.filter(b => b.typ === 'cena').map(b => b.castka).join(' | '));
test('rozsahové bloky mají řádky', d.bloky.filter(b => b.typ === 'rozsah').every(b => b.radky.length > 0));

/* --- 3) ceny sedí na vypocetProj, nic se nedopočítává --- */
const kc = n => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kč';
const cenaZa = r.sekce.find(s => s.key === 'zamereni').celkem;
const blokZa = d.bloky.find(b => b.typ === 'cena' && b.sekce === 'zamereni');
test('cena ZAMĚŘENÍ je přesně z Kalkulace PROJ', blokZa.castka === kc(cenaZa), blokZa.castka + ' vs ' + kc(cenaZa));
test('část 1 studie a ZAMĚŘENÍ mají tutéž cenu (tatáž činnost)',
  d.bloky.filter(b => b.typ === 'cena' && b.sekce === 'zamereni').every(b => b.castka === kc(cenaZa)));
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
test('nulové sekce se hlásí jako neuvedené, ne nulovou cenou',
  cenove.every(b => b.neuvedena && b.castka === 'není součástí této nabídky'),
  cenove.map(b => b.castka).join(' | '));
test('paušály zůstávají uvedené i při nulové kalkulaci',
  dN.bloky.filter(b => b.typ === 'cena' && !b.sekce).every(b => !b.neuvedena));
test('rekapitulace nulové nabídky je prázdná', dN.rekapitulace.length === 0);
test('souhrn nulové nabídky je nula', dN.souhrn.bezDph === 0 && dN.souhrn.sDph === 0);

/* --- 5) popis záměru: vlastní text, jinak srozumitelná výzva --- */
test('bez popisu záměru se blok označí jako prázdný',
  (d.bloky.find(b => b.typ === 'proza' && /Popis záměru/i.test(b.nadpis)) || {}).prazdny === true);
const zakP = zk.novaZakazka(); zakP.popisZameru = 'Bytový dům, přístavba výtahu do zrcadla schodiště.';
const dP = nabidkaProjData(zakP, zakP.varianty[0]);
const blokP = dP.bloky.find(b => b.typ === 'proza' && /Popis záměru/i.test(b.nadpis));
test('vyplněný popis záměru se přenese doslova',
  blokP.odstavce[0] === 'Bytový dům, přístavba výtahu do zrcadla schodiště.' && !blokP.prazdny, blokP.odstavce[0]);

/* --- 6) hlavička a název souboru --- */
test('placeholdery hlavičky jsou vyplněné ze zakázky',
  d.placeholders.OBJEDNATEL === 'SVJ Ulice 1' && d.placeholders.ADRESA === 'Ulice 1, 170 00 Praha 7'
  && d.placeholders.DATUM === '26.07.2026' && d.placeholders.CISLO_NABIDKY === '2026OVPCN0101',
  JSON.stringify([d.placeholders.OBJEDNATEL, d.placeholders.DATUM, d.placeholders.CISLO_NABIDKY]));
/* Číslo nabídky PROJ se bere z hlavičky OCK (zadání 29. 7. 2026) – stejně jako
 * v krycím listu PROJ. Kdyby to platilo jen pro krycí list, nesl by každý ze
 * dvou dokumentů jiné číslo. */
const zakCis = zk.novaZakazka();
zakCis.cislo = '2026-OVP-CN-0500'; zakCis.projHlavicka.cislo = '2026-PROJ-CN-9999';
const dCis = nabidkaProjData(zakCis, zakCis.varianty[0]);
test('nabídka PROJ bere číslo z hlavičky OCK',
  dCis.placeholders.CISLO_NABIDKY === '2026-OVP-CN-0500', dCis.placeholders.CISLO_NABIDKY);
test('vlastní číslo v hlavičce PROJ zůstalo v datech nedotčené',
  zakCis.projHlavicka.cislo === '2026-PROJ-CN-9999', zakCis.projHlavicka.cislo);

test('firemní údaje (SET-3) jsou v placeholderech',
  Object.keys(d.placeholders).some(k => /^FIRMA/.test(k)),
  Object.keys(d.placeholders).filter(k => /^FIRMA/.test(k)).join(','));
test('název souboru neobsahuje zakázané znaky', !/[\\/:*?"<>|]/.test(d.nazevSouboru), d.nazevSouboru);

/* --- 7) jazykové mutace: nadpisy se překládají, próza zůstává česky --- */
['en', 'de', 'fr'].forEach(L => {
  const dl = nabidkaProjData(zak, v, L);
  test(`mutace ${L}: stejná struktura`, dl.bloky.length === d.bloky.length);
  test(`mutace ${L}: ceny se nemění`, dl.souhrn.bezDph === d.souhrn.bezDph);
  test(`mutace ${L}: název souboru nese jazyk`, dl.nazevSouboru.endsWith('_' + L.toUpperCase()), dl.nazevSouboru);
  test(`mutace ${L}: souvislá próza zůstává česky (nic se nevymýšlí)`,
    dl.bloky.find(b => b.typ === 'proza' && b.odstavce.length > 1).odstavce.join(' ')
      === d.bloky.find(b => b.typ === 'proza' && b.odstavce.length > 1).odstavce.join(' '));
});

/* --- 8) nikdy nespadne a nic nemění --- */
test('bez zakázky i varianty nespadne', (() => {
  const x = nabidkaProjData();
  return x && Array.isArray(x.bloky) && x.bloky.length === NABIDKA_PROJ_DEF.length;
})());
test('s prázdnou variantou nespadne', typeof nabidkaProjData({}, {}) === 'object');
test('s variantou bez sekce proj nespadne', typeof nabidkaProjData({}, { data: {} }) === 'object');
test('nemění data zakázky', (() => {
  const z = zk.novaZakazka();
  const pred = JSON.stringify(z);
  nabidkaProjData(z, z.varianty[0], 'en');
  return JSON.stringify(z) === pred;
})());
test('nemění sazebník ani definici', (() => {
  const pred = JSON.stringify([NABIDKA_PROJ_SAZBY, NABIDKA_PROJ_DEF]);
  nabidkaProjData(zak, v, 'de');
  return JSON.stringify([NABIDKA_PROJ_SAZBY, NABIDKA_PROJ_DEF]) === pred;
})());


/* ---------- #71 + #134: dvě slevy, každá nad svou cenou ----------
 *
 * „Sleva na OCK i PROJ globálně být nemá. Tedy pokud je to rozdělené zvlášť,
 * pak je to správně." (1. 8. 2026) — a 12. 8. 2026 k tomu přibylo: „každá
 * kalkulace musí počítat slevy ze svých vlastních cen a nepropisovat je
 * vzájemně."
 *
 * Do 12. 8. 2026 to platilo jen zpola: sleva OCK sice do ceny projekce
 * nevstupovala, ale karta slevy se pod výpočtem projekce vykreslovala s čísly
 * z výtahové šachty a projekce měla vedle toho druhou, úplně jinou slevu bez
 * schvalování. Teď má projekce vlastní slevu se stejnými pravidly a nabídka
 * ji vykazuje samostatným řádkem. */
const zo = require('./zaokrouhleni.js');
test('cenaNabidkyProj bere slevu projekce (tři parametry jako u OCK)',
  typeof zo.cenaNabidkyProj === 'function' && zo.cenaNabidkyProj.length === 3,
  zo.cenaNabidkyProj && zo.cenaNabidkyProj.length);

/* Sleva na výtahovou šachtu nesmí s cenou projekce hnout ani o korunu. */
{
  const before = JSON.stringify({ bezDph: d.souhrn.bezDph, sDph: d.souhrn.sDph });
  v.data.sleva = { procenta: 10, stav: 'schváleno', role: 'Vedoucí',
                   schvalil: 'Vedoucí', schvalilKdy: '2026-08-01T10:00:00.000Z' };
  const d2 = nabidkaProjData(zak, v);
  const after = JSON.stringify({ bezDph: d2.souhrn.bezDph, sDph: d2.souhrn.sDph });
  test('schválená sleva OCK 10 % nezmění cenu PROJ ani o korunu',
    before === after, before + ' vs ' + after);
  const rPo = vypocetProj(v.data.proj.zadani, v.data.proj.cenik);
  test('výpočet projekce se slevou OCK vůbec nepočítá',
    Math.abs(rPo.souhrn.celkem - r.souhrn.celkem) < 1e-9);
}

/* A naopak: sleva projekce cenu projekce změnit MUSÍ — a to přesně o své
 * procento, dokud je schválená. */
{
  const bez = nabidkaProjData(zak, v).souhrn;
  v.data.slevaProj = { procenta: 10, stav: 'schváleno', role: 'Vedoucí',
                       schvalil: 'Vedoucí', schvalilKdy: '2026-08-12T10:00:00.000Z' };
  const se = nabidkaProjData(zak, v).souhrn;
  test('schválená sleva projekce cenu projekce sníží', se.bezDph < bez.bezDph,
    bez.bezDph + ' → ' + se.bezDph);
  test('sleva se počítá ze součtu sekcí projekce',
    Math.abs(se.slevaKc - se.soucetSekci * 0.1) < 0.01, JSON.stringify(se));
  test('rozpad sedí: součet sekcí − sleva + zaokrouhlení = cena',
    Math.abs(se.soucetSekci - se.slevaKc + se.zaokrKc - se.bezDph) < 0.01, JSON.stringify(se));

  /* Neschválená sleva se do dokumentu nepropíše — stejné pravidlo jako u OCK.
   * Nabídka je závazná nabídka, ne přání obchodníka. */
  v.data.slevaProj = { procenta: 25, stav: 'čeká na schválení', role: 'Obchodník' };
  test('neschválená sleva projekce se do nabídky nepropíše',
    Math.abs(nabidkaProjData(zak, v).souhrn.bezDph - bez.bezDph) < 0.01);

  /* Dokument slevu ukazuje vlastním řádkem, ne schovanou v ceně sekcí. */
  v.data.slevaProj = { procenta: 10, stav: 'schváleno', role: 'Vedoucí' };
  const ph = nabidkaProjData(zak, v).placeholders;
  test('nabídka PROJ vypisuje procento slevy', /10/.test(ph.PROJ_SLEVA_PROC), ph.PROJ_SLEVA_PROC);
  test('nabídka PROJ vypisuje slevu v Kč', !!ph.PROJ_SLEVA_KC, ph.PROJ_SLEVA_KC);
  test('nabídka PROJ vypisuje cenu před slevou', !!ph.PROJ_CENA_PRED_SLEVOU, ph.PROJ_CENA_PRED_SLEVOU);

  /* Bez slevy zůstávají řádky prázdné. Nula by v dokumentu vypadala jako
   * „slevu jsme dali a byla nulová". */
  v.data.slevaProj = { procenta: 0, stav: '', role: 'Obchodník' };
  const ph0 = nabidkaProjData(zak, v).placeholders;
  test('bez slevy zůstanou řádky slevy v nabídce PROJ prázdné',
    ph0.PROJ_SLEVA_KC === '' && ph0.PROJ_SLEVA_PROC === '' && ph0.PROJ_CENA_PRED_SLEVOU === '');
}

/* ---------- popis záměru do Wordu (12. 8. 2026) ----------
 * Ve VZORu je na tom místě popis jedné konkrétní stavby. V šabloně ho vystřídal
 * symbol {{POPIS_ZAMERU}}, aby se do nabídky dostalo to, co obchodník napsal
 * v aplikaci — jinak by každá nabídka odešla s popisem cizího domu. */
{
  const zpz = zk.novaZakazka();
  const v0 = zpz.varianty[0];
  test('nevyplněný popis záměru zůstane ve Wordu prázdný',
    nabidkaProjData(zpz, v0).placeholders.POPIS_ZAMERU === '',
    nabidkaProjData(zpz, v0).placeholders.POPIS_ZAMERU);
  zpz.popisZameru = '  Bytový dům, přístavba výtahu do zrcadla schodiště.  ';
  test('vyplněný popis záměru jde do Wordu bez okrajových mezer',
    nabidkaProjData(zpz, v0).placeholders.POPIS_ZAMERU
      === 'Bytový dům, přístavba výtahu do zrcadla schodiště.');
}

/* ---------- úvodní fotka projekční nabídky (12. 8. 2026) ----------
 * Nabídka PROJ se od 12. 8. tiskne i do Wordu a bere si do dokumentu vlastní
 * fotku. Test hlídá, že si nebere fotku nabídky OCK — obě nabídky odcházejí
 * samostatně a fotka šachty na titulní straně projekční nabídky by byla chyba,
 * které si nikdo nevšimne, dokud ji neuvidí zákazník. */
{
  global.uvodniFotoObrazky = zk.uvodniFotoObrazky;
  global.uvodniFotoSymboly = zk.uvodniFotoSymboly;
  const zf = zk.novaZakazka();
  const v0 = zf.varianty[0];
  test('bez nahrané fotky nejde do nabídky PROJ žádný obrázek',
    !nabidkaProjData(zf, v0).obrazky.UVODNI_FOTO);

  zf.uvodniFoto = 'data:image/png;base64,T0NL';          // fotka nabídky OCK
  test('fotka nabídky OCK se do nabídky PROJ nepropíše',
    !nabidkaProjData(zf, v0).obrazky.UVODNI_FOTO);

  zf.uvodniFotoProj = 'data:image/png;base64,UFJPSg==';  // fotka nabídky PROJ
  zf.uvodniFotoProjPopis = 'Bytový dům, pohled z ulice';
  const dF = nabidkaProjData(zf, v0);
  test('vlastní fotka PROJ jde do dokumentu pod symbolem UVODNI_FOTO',
    dF.obrazky.UVODNI_FOTO === zf.uvodniFotoProj, dF.obrazky.UVODNI_FOTO);
  test('popisek fotky PROJ jde do dokumentu jako textový symbol',
    dF.placeholders.UVODNI_FOTO_POPIS === 'Bytový dům, pohled z ulice',
    dF.placeholders.UVODNI_FOTO_POPIS);
}

console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY NABÍDKY PROJ OK');
process.exit(fail ? 1 : 0);
