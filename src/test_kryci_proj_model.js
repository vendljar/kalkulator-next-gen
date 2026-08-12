/* ============================================================
 * Test kryci_proj.js – DATOVÝ MODEL krycího listu zakázky PROJ
 *
 * PROČ ZVLÁŠŤ OD test_kryci_proj_docx.js
 *
 * Sada `test_kryci_proj_docx.js` vede hotový list až do Wordu: rozbalí
 * .docx a kouká, co v něm stojí. Je pomalá a při každém selhání se musí
 * rozhodnout, jestli je chyba v modelu, nebo v generátoru dokumentů.
 * Tahle sada se dokumentu vůbec nedotýká a zůstává u dat: definice polí,
 * napojení na kalkulaci PROJ, hlavička a symboly do šablony.
 *
 * Tři věci, které se v projekčním krycím listu rozbíjejí nejčastěji:
 *
 *  1) NEOCENĚNÁ ČINNOST. Zásada shodná s cenovou nabídkou PROJ: ceny se
 *     nikdy nevymýšlejí. Činnost, která v kalkulaci není oceněná, se
 *     vypíše jako „není součástí nabídky" — nikdy nulou (to by se četlo
 *     jako „uděláme to zdarma") ani odhadem (to by se četlo jako závazek).
 *  2) MÍCHÁNÍ OCK A PROJ. Oba krycí listy mají stejně pojmenovaná pole
 *     (`splatnostDni`, `sazbaDph`, `typSmlouvy`), ale každý čte jiné
 *     úložiště a jinou sazbu DPH. Kdyby si sáhly do stejného místa,
 *     nesl by projekční list podmínky dodávky konstrukce.
 *  3) HLAVIČKA. Hlavička PROJ je samostatná; pro výstup se ale prázdné
 *     pole čte z hlavičky OCK, aby na listu nechyběl název akce. Čtení
 *     přitom nesmí do uložených dat nic zapsat.
 *
 * Ceny se v testech nepíšou jako čísla — odvozují se z vypocetProj() nad
 * zkušebním ceníkem. Skutečné sazby do zdrojáků nepatří.
 * ============================================================ */

/* V prohlížeči jsou moduly v jednom scope, v Node ne. Hlavičkové funkce
 * ze zakazka.js se musí doplnit do globálu — bez nich by kryciProjCtx
 * spadl do nouzové větve a sada by ověřovala jiný kód, než jaký běží
 * v aplikaci. */
const fs = require('fs');
const nacti = (f) => { const m = require(f); Object.keys(m).forEach(k => { if (global[k] === undefined) global[k] = m[k]; }); return m; };
const ZC = require('./zkusebni_cenik.js');
nacti('./engine.js');
global.DEFAULT_CENIK = ZC.zkusebniCenik();
nacti('./engine_proj.js');
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
nacti('./techspec.js');
nacti('./sleva.js');
nacti('./zaokrouhleni.js');    // cenaNabidkyProj, zaokrProjZ – cena musí sedět s nabídkou PROJ
nacti('./firma.js');
nacti('./nabidka_proj.js');    // NABIDKA_PROJ_SAZBY – splatnost a paušály
const zk = nacti('./zakazka.js');
const kr = nacti('./kryci.js');        // sdílený stavitel symbolů + číselník pokut
const kp = nacti('./kryci_proj.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const VSECHNA_POLE = [].concat(...kp.KRYCI_PROJ_SEKCE.map(s => s.pole));
const pole = (id) => VSECHNA_POLE.find(p => p.id === id);
const kc = (n) => Math.round(n || 0).toLocaleString('cs-CZ') + ' Kč';

/* Smyšlená zakázka – skutečný zákazník ani skutečná akce do zdrojáků nepatří. */
const zak = zk.novaZakazka();
zak.cislo = '2026 - OVP - CN - 401';
zak.nazevAkce = 'Zkušební vestavba do zrcadla schodiště';
zak.adresa = 'Zkušební 1, Zkušebín';
zak.objednatel = 'Zkušební ocelárna s.r.o.';
zak.kontakt = 'Jan Zkušební';
zak.ico = '12345679';
const v = zak.varianty[0];

global.NAST = { firma: global.firmaDefault() };

const rProj = global.vypocetProj(v.data.proj.zadani, v.data.proj.cenik);
const c = kp.kryciProjCtx(zak, v);

/* ============================================================
 * 1) Definice polí – jedno místo pro dvě verze listu
 * ============================================================ */

test('krycí list PROJ má sekce a v každé aspoň jedno pole',
  kp.KRYCI_PROJ_SEKCE.length > 0 && kp.KRYCI_PROJ_SEKCE.every(s => s.sekce && s.pole && s.pole.length),
  kp.KRYCI_PROJ_SEKCE.map(s => s.sekce + ':' + (s.pole || []).length).join(' | '));
test('názvy sekcí jsou unikátní',
  new Set(kp.KRYCI_PROJ_SEKCE.map(s => s.sekce)).size === kp.KRYCI_PROJ_SEKCE.length,
  kp.KRYCI_PROJ_SEKCE.map(s => s.sekce).join(' | '));
test('každé pole má id', VSECHNA_POLE.every(p => !!p.id));
test('každé pole má popisek', VSECHNA_POLE.every(p => !!p.label),
  (VSECHNA_POLE.find(p => !p.label) || {}).id);

/* Pole rozsahu (`cin_…`) a stupňů (`st_…`) se generují ze stejného
 * seznamu činností. Kdyby se prefixy vynechaly, měl by seznam rozsahu
 * a seznam stupňů stejná id a přepisovaly by si hodnoty navzájem. */
const idcka = VSECHNA_POLE.map(p => p.id);
test('id polí jsou unikátní napříč všemi sekcemi',
  new Set(idcka).size === idcka.length,
  idcka.filter((x, i) => idcka.indexOf(x) !== i).join(','));

test('každé pole patří aspoň do jedné verze',
  VSECHNA_POLE.every(p => Array.isArray(p.verze) && p.verze.length),
  (VSECHNA_POLE.find(p => !Array.isArray(p.verze) || !p.verze.length) || {}).id);
test('verze jsou jen „bo" a „techdata"',
  VSECHNA_POLE.every(p => p.verze.every(x => x === 'bo' || x === 'techdata')),
  VSECHNA_POLE.filter(p => p.verze.some(x => x !== 'bo' && x !== 'techdata')).map(p => p.id).join(','));
test('obě verze mají svá pole',
  VSECHNA_POLE.some(p => p.verze.includes('bo')) && VSECHNA_POLE.some(p => p.verze.includes('techdata')));
/* Rozdělení má smysl jen tehdy, když se verze obsahem liší: backoffice
 * vidí ceny činností, technické oddělení jen ANO/NE. */
test('verze se v obsahu liší (nejsou to dva stejné listy)',
  VSECHNA_POLE.some(p => p.verze.length === 1 && p.verze[0] === 'bo')
  && VSECHNA_POLE.some(p => p.verze.length === 1 && p.verze[0] === 'techdata'));

test('pole s výběrem má nabídku možností',
  VSECHNA_POLE.filter(p => p.typ === 'radio' || p.typ === 'vyber')
    .every(p => Array.isArray(p.o) && p.o.length > 1),
  VSECHNA_POLE.filter(p => (p.typ === 'radio' || p.typ === 'vyber') && !(p.o || []).length).map(p => p.id).join(','));
test('předvyplněná hodnota přepínače je z jeho vlastní nabídky',
  VSECHNA_POLE.filter(p => p.typ === 'radio' && p.prefill)
    .every(p => p.o.includes(String(p.prefill(c)))),
  VSECHNA_POLE.filter(p => p.typ === 'radio' && p.prefill && !p.o.includes(String(p.prefill(c)))).map(p => p.id).join(','));

/* ============================================================
 * 2) Napojení na kalkulaci PROJ
 * ============================================================ */

/* Nejdůležitější vazba celého modulu: seznam činností krycího listu se
 * NESMÍ rozejít se sekcemi kalkulace. Kdyby v kalkulaci přibyla sekce,
 * krycí list by o ní mlčel a zákazník by dostal podklad pro smlouvu,
 * ve kterém chybí činnost, kterou platí. */
test('krycí list zná přesně tytéž činnosti jako kalkulace PROJ',
  kp.KRYCI_PROJ_CINNOSTI.map(x => x[0]).join(',') === rProj.sekce.map(s => s.key).join(','),
  kp.KRYCI_PROJ_CINNOSTI.map(x => x[0]).join(',') + '  vs  ' + rProj.sekce.map(s => s.key).join(','));
test('každá činnost má řádek v rozsahu (verze BO)',
  kp.KRYCI_PROJ_CINNOSTI.every(([key]) => !!pole('cin_' + key)),
  kp.KRYCI_PROJ_CINNOSTI.filter(([key]) => !pole('cin_' + key)).map(x => x[0]).join(','));
test('každá činnost má řádek ve stupních dokumentace (verze Techdata)',
  kp.KRYCI_PROJ_CINNOSTI.every(([key]) => !!pole('st_' + key)));
test('řádky rozsahu jsou jen pro backoffice, stupně jen pro techdata',
  kp.KRYCI_PROJ_CINNOSTI.every(([key]) =>
    pole('cin_' + key).verze.join() === 'bo' && pole('st_' + key).verze.join() === 'techdata'));

const ocenena = rProj.sekce.find(s => s.celkem > 0);
const neocenena = rProj.sekce.find(s => !(s.celkem > 0));
test('zkušební ceník dává aspoň jednu oceněnou i jednu neoceněnou činnost',
  !!ocenena && !!neocenena, rProj.sekce.map(s => s.key + ':' + s.celkem).join(' | '));

/* Oceněná činnost nese částku přesně z kalkulace – ne přepočítanou,
 * ne zaokrouhlenou jinak. Krycí list a nabídka musí říkat totéž. */
test('oceněná činnost se vypíše s ANO a s částkou z kalkulace',
  pole('cin_' + ocenena.key).prefill(c) === 'ANO – ' + kc(ocenena.celkem),
  pole('cin_' + ocenena.key).prefill(c));

/* TOHLE je pravidlo, kvůli kterému modul vznikl. Neoceněná činnost se
 * nesmí vypsat nulou („uděláme to zdarma") ani odhadem („počítáme s tím,
 * i když to nikdo nespočítal"). Jediná správná odpověď je věta, která
 * říká, že se to nenabízí. */
test('neoceněná činnost se vypíše jako „není součástí nabídky"',
  pole('cin_' + neocenena.key).prefill(c) === 'není součástí nabídky',
  pole('cin_' + neocenena.key).prefill(c));
test('neoceněná činnost se nikdy nevypíše nulou',
  !/0\s*Kč/.test(pole('cin_' + neocenena.key).prefill(c)));
test('žádná neoceněná činnost nedostane částku',
  rProj.sekce.filter(s => !(s.celkem > 0))
    .every(s => pole('cin_' + s.key).prefill(c) === 'není součástí nabídky'),
  rProj.sekce.filter(s => !(s.celkem > 0)).map(s => s.key + '=' + pole('cin_' + s.key).prefill(c)).join(' | '));

/* Technická verze ceny neuvádí vůbec – jen ANO/NE. */
test('technická verze u oceněné činnosti říká ANO', pole('st_' + ocenena.key).prefill(c) === 'ANO');
test('technická verze u neoceněné činnosti říká NE', pole('st_' + neocenena.key).prefill(c) === 'NE');
test('technická verze neuvádí u činností žádnou částku',
  kp.KRYCI_PROJ_CINNOSTI.every(([key]) => !/Kč/.test(pole('st_' + key).prefill(c))));

/* Hodnota zakázky = cena projekční části z nabídky, tedy po obchodním
 * zaokrouhlení. Kdyby se sem přičetlo OCK, byly by tytéž peníze ve dvou
 * smlouvách – dodávka konstrukce má vlastní krycí list. */
const projCena = global.cenaNabidkyProj(rProj, null, global.zaokrProjZ(v.data)).cena;
test('hodnota zakázky odpovídá ceně projekce z nabídky (včetně zaokrouhlení)',
  c.hodnota === kc(projCena), [c.hodnota, kc(projCena)]);
const rOck = global.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes);
test('do hodnoty projekční zakázky se část OCK nepřičítá',
  rOck.souhrn.zakladCena > 0 && c.hodnota !== kc(projCena + rOck.souhrn.zakladCena),
  [c.hodnota, kc(projCena + rOck.souhrn.zakladCena)]);
test('součet oceněných činností odpovídá hodnotě před zaokrouhlením',
  Math.abs(rProj.sekce.reduce((a, s) => a + s.celkem, 0) - rProj.souhrn.celkem) < 1,
  [rProj.sekce.reduce((a, s) => a + s.celkem, 0), rProj.souhrn.celkem]);

test('počet oceněných činností se vypisuje jako „N z M činností"',
  c.ocenene === rProj.sekce.filter(s => s.celkem > 0).length + ' z ' + rProj.sekce.length + ' činností',
  c.ocenene);
/* Seznam činností mimo nabídku je jediné místo, kde zákazník uvidí, co
 * v ceně NENÍ. Prázdný řádek by se četl jako „všechno je zahrnuto". */
test('činnosti mimo nabídku se vypíšou jmenovitě',
  rProj.sekce.filter(s => !(s.celkem > 0)).every(s => c.neocenene.includes(s.nazev)), c.neocenene);
/* Opačný okraj: když je oceněné všechno, nesmí řádek zůstat prázdný.
 * Prázdné místo v podkladu pro smlouvu se čte jako nevyplněný údaj, ne
 * jako „nic nechybí". Zkušební data se dopočítají tak, aby žádná sekce
 * nezůstala na nule – hodnoty jsou smyšlené, jde jen o to, aby cena byla
 * nenulová. */
const vVse = zk.novaVarianta('Vše oceněno', JSON.parse(JSON.stringify(v.data)));
vVse.data.proj.zadani.sekce.forEach(s => (s.polozky || []).forEach(p => {
  if (p.typ === 'hod') p.hodiny = Math.max(p.hodiny || 0, 1);
}));
Object.keys(vVse.data.proj.cenik.fixy).forEach(k => {
  vVse.data.proj.cenik.fixy[k] = Math.max(vVse.data.proj.cenik.fixy[k] || 0, 1000);
});
const cVse = kp.kryciProjCtx(zak, vVse);
test('zkušební data pro tenhle případ opravdu ocení všechny činnosti',
  global.vypocetProj(vVse.data.proj.zadani, vVse.data.proj.cenik).sekce.every(s => s.celkem > 0),
  global.vypocetProj(vVse.data.proj.zadani, vVse.data.proj.cenik).sekce
    .filter(s => !(s.celkem > 0)).map(s => s.key).join(','));
test('když jsou oceněné všechny činnosti, řekne se to větou, ne prázdnem',
  /^žádná/.test(cVse.neocenene), cVse.neocenene);
test('počet oceněných pak sedí na všechny činnosti',
  cVse.ocenene === rProj.sekce.length + ' z ' + rProj.sekce.length + ' činností', cVse.ocenene);

/* Kalkulace, která neproběhne, nesmí shodit celý list – a hlavně nesmí
 * vyplodit nulovou cenu. */
const vRozbita = zk.novaVarianta('Rozbitá', JSON.parse(JSON.stringify(v.data)));
vRozbita.data.proj.cenik = null;
let cRozbita = null, spadlo = false;
try { cRozbita = kp.kryciProjCtx(zak, vRozbita); } catch (e) { spadlo = true; }
test('nespočítaná kalkulace PROJ krycí list neshodí', !spadlo && !!cRozbita);
test('bez spočtené ceny se do hodnoty nepíše nula, ale pomlčka',
  cRozbita && cRozbita.hodnota === '—', cRozbita && cRozbita.hodnota);
test('bez spočtené kalkulace se nepředstírá, že je něco oceněné',
  cRozbita && cRozbita.ocenene === '—' && cRozbita.neocenene === '—',
  cRozbita && [cRozbita.ocenene, cRozbita.neocenene]);
/* Neznámou činnost nesmí prefill vydat za neoceněnou – to by tvrdilo
 * něco o činnosti, o které se nic neví. */
test('neznámá činnost zůstane bez odpovědi, ne „není součástí nabídky"',
  cRozbita && pole('cin_' + ocenena.key).prefill(cRozbita) === '',
  cRozbita && pole('cin_' + ocenena.key).prefill(cRozbita));

/* ============================================================
 * 3) Hlavička PROJ v krycím listu
 * ============================================================ */

test('prázdné pole hlavičky PROJ se pro list dočte z hlavičky OCK',
  c.hl.nazevAkce === zak.nazevAkce && c.hl.objednatel === zak.objednatel,
  JSON.stringify([c.hl.nazevAkce, c.hl.objednatel]));
test('popisek zdroje přizná, že hodnota přišla z hlavičky OCK',
  c.hlSrc('nazevAkce') === 'z hlavičky kalkulace OCK', c.hlSrc('nazevAkce'));

const zakVlastni = zk.novaZakazka();
zakVlastni.cislo = '2026 - OVP - CN - 402';
zakVlastni.nazevAkce = 'Akce podle hlavičky OCK';
zakVlastni.objednatel = 'Zkušební ocelárna s.r.o.';
zakVlastni.projHlavicka.objednatel = 'Zkušební projekce s.r.o.';
const cVlastni = kp.kryciProjCtx(zakVlastni, zakVlastni.varianty[0]);
test('vyplněná hlavička PROJ má přednost před OCK',
  cVlastni.hl.objednatel === 'Zkušební projekce s.r.o.', cVlastni.hl.objednatel);
test('popisek zdroje přizná, že hodnota je z hlavičky PROJ',
  cVlastni.hlSrc('objednatel') === 'hlavička Kalkulace PROJ', cVlastni.hlSrc('objednatel'));
/* Číslo nabídky se zatím přebírá z hlavičky OCK – jedna zakázka, jedno
 * číslo. Přepsat se přitom smí jen v hlavičce, ne v krycím listu. */
test('číslo nabídky v listu je číslo z hlavičky OCK',
  c.hl.cislo === zak.cislo, c.hl.cislo);
/* Sestavení kontextu je čtení. Kdyby dosazené číslo skončilo v datech,
 * osamostatnila by se hlavička PROJ sama od sebe – a rozdíl mezi
 * „dočteno z OCK" a „vyplněno ručně" by zmizel. */
test('sestavení kontextu nic nezapíše do uložené hlavičky',
  zak.projHlavicka.cislo === zk.ZAK_CISLO_PREDLOHA && zak.projHlavicka.nazevAkce === '',
  JSON.stringify(zak.projHlavicka));

/* ============================================================
 * 4) Pořadí zdrojů: ruční hodnota > prefill > prázdno
 * ============================================================ */

const klPrazdny = { hodnoty: {} };
test('bez ruční hodnoty se použije prefill',
  kp.kryciProjHodnota(pole('predmet'), klPrazdny, c) === 'Projekční a inženýrská činnost (PROJ)');
test('ruční hodnota má přednost před prefillem',
  kp.kryciProjHodnota(pole('predmet'), { hodnoty: { predmet: 'Jen zaměření' } }, c) === 'Jen zaměření');
/* „Prázdno není nula": smazáním obsahu se pole vrací k automatice,
 * nevyprazdňuje se natrvalo. */
test('prázdná ruční hodnota se vrací k prefillu',
  kp.kryciProjHodnota(pole('predmet'), { hodnoty: { predmet: '' } }, c)
    === 'Projekční a inženýrská činnost (PROJ)');
test('pole bez prefillu i bez ruční hodnoty zůstane prázdné',
  kp.kryciProjHodnota(pole('hlavniProjektant'), klPrazdny, c) === '');
test('chybějící úložiště ručních hodnot nespadne',
  kp.kryciProjHodnota(pole('predmet'), null, c) === 'Projekční a inženýrská činnost (PROJ)');
/* Ručně přepsaná činnost přebije údaj z kalkulace – zákazník si občas
 * vymíní jiné znění, než jaké vyjde z čísel. */
test('neoceněnou činnost lze ručně přepsat vlastním zněním',
  kp.kryciProjHodnota(pole('cin_' + neocenena.key),
    { hodnoty: { ['cin_' + neocenena.key]: 'ANO – dle samostatné objednávky' } }, c)
    === 'ANO – dle samostatné objednávky');

test('pole svázané s hlavičkou čte hlavičku, ne ruční přepis',
  kp.kryciProjHodnota(pole('nazevAkce'), { hodnoty: { nazevAkce: 'Něco jiného' } }, c) === zak.nazevAkce,
  kp.kryciProjHodnota(pole('nazevAkce'), { hodnoty: { nazevAkce: 'Něco jiného' } }, c));
test('sazba DPH se ručním přepisem přebít nedá',
  kp.kryciProjHodnota(pole('sazbaDph'), { hodnoty: { sazbaDph: '19 %' } }, c) === c.dph + ' %',
  kp.kryciProjHodnota(pole('sazbaDph'), { hodnoty: { sazbaDph: '19 %' } }, c));
const rozbitePole = { id: 'zkouska', label: 'Zkouška', verze: ['bo'], prefill: () => { throw new Error('rozbito'); } };
let spadlPrefill = false, hodnotaRozbita = null;
try { hodnotaRozbita = kp.kryciProjHodnota(rozbitePole, klPrazdny, c); } catch (e) { spadlPrefill = true; }
test('výjimka v prefillu neshodí krycí list a končí prázdnem',
  !spadlPrefill && hodnotaRozbita === '', spadlPrefill ? 'výjimka' : hodnotaRozbita);

/* ============================================================
 * 5) OCK a PROJ se nemíchají
 * ============================================================ */

/* Projekční práce bývají v jiné sazbě DPH než stavební část. Kdyby
 * projekční list bral sazbu z ceníku OCK, nesedělo by „Celkem s DPH"
 * v nabídce PROJ s tím, co stojí v podkladu pro smlouvu. */
const vDph = zk.novaVarianta('Dvě sazby', JSON.parse(JSON.stringify(v.data)));
vDph.data.cenik.dph = 0.12;
vDph.data.proj.cenik.dph = 0.21;
const cDph = kp.kryciProjCtx(zak, vDph);
const cDphOck = kr.kryciCtx(zak, vDph, JEKLY);
test('projekční list bere sazbu DPH z ceníku projekce', cDph.dph === 21, cDph.dph);
test('krycí list OCK bere sazbu DPH z ceníku OCK', cDphOck.dph === 12, cDphOck.dph);
test('sazba DPH obou listů se nemíchá', cDph.dph !== cDphOck.dph);
/* Starší zakázka vlastní sazbu projekce nemá – tam se přebírá dosud
 * platná sazba z ceníku OCK, aby se cena hotové nabídky nezměnila. */
const vBezSazby = zk.novaVarianta('Bez sazby PROJ', JSON.parse(JSON.stringify(v.data)));
vBezSazby.data.cenik.dph = 0.12;
delete vBezSazby.data.proj.cenik.dph;
test('bez vlastní sazby projekce se převezme dosud platná sazba z OCK',
  kp.kryciProjCtx(zak, vBezSazby).dph === 12, kp.kryciProjCtx(zak, vBezSazby).dph);

/* Obě sady polí mají stejná id (splatnostDni, typSmlouvy, sazbaDph…),
 * ale každá čte jiné úložiště. Zápis do jednoho listu se nesmí objevit
 * ve druhém – jinak by obchodník změnou splatnosti u projekce přepsal
 * splatnost u dodávky konstrukce. */
const vOba = zk.novaVarianta('Oba listy', JSON.parse(JSON.stringify(v.data)));
vOba.data.kryciProj.hodnoty.splatnostDni = '60';
const symProjOdd = kp.kryciProjPodminkoveSymboly(zak, vOba);
const symOckOdd = kr.kryciPodminkoveSymboly(zak, vOba, JEKLY);
test('ruční splatnost zadaná v listu PROJ platí pro PROJ',
  symProjOdd.PODM_SPLATNOST_DNI === '60', symProjOdd.PODM_SPLATNOST_DNI);
test('ruční splatnost zadaná v listu PROJ se do OCK nepropíše',
  symOckOdd.PODM_SPLATNOST_DNI === '14', symOckOdd.PODM_SPLATNOST_DNI);
vOba.data.kryci.hodnoty.splatnostDni = '7';
test('ruční splatnost zadaná v listu OCK se do PROJ nepropíše',
  kp.kryciProjPodminkoveSymboly(zak, vOba).PODM_SPLATNOST_DNI === '60',
  kp.kryciProjPodminkoveSymboly(zak, vOba).PODM_SPLATNOST_DNI);

/* Číselník sazeb pokut je naopak schválně společný – dvě verze seznamu
 * by znamenaly, že projekce nabízí jiné sazby než dodávka. */
test('projekční list nabízí tytéž sazby pokut jako OCK',
  JSON.stringify(kp.KRYCI_POKUTY_SAZBY) === JSON.stringify(kr.KRYCI_POKUTY),
  JSON.stringify(kp.KRYCI_POKUTY_SAZBY));

/* ============================================================
 * 6) Symboly {{PODM_…}} do šablony nabídky PROJ
 * ============================================================ */

const sym = kp.kryciProjPodminkoveSymboly(zak, v);
test('sekce zobrazené u nabídky PROJ se v krycím listu opravdu jmenují stejně',
  kp.KRYCI_PROJ_NABIDKA_SEKCE.every(n => kp.KRYCI_PROJ_SEKCE.some(s => s.sekce === n)),
  kp.KRYCI_PROJ_NABIDKA_SEKCE.filter(n => !kp.KRYCI_PROJ_SEKCE.some(s => s.sekce === n)).join(','));
test('všechny symboly mají prefix PODM_',
  Object.keys(sym).every(k => k.indexOf(kr.PODM_PREFIX) === 0));
const poleNabidky = [].concat(...kp.KRYCI_PROJ_SEKCE
  .filter(s => kp.KRYCI_PROJ_NABIDKA_SEKCE.includes(s.sekce)).map(s => s.pole));
test('každé pole zobrazené u nabídky PROJ má svůj symbol',
  poleNabidky.every(p => (kr.PODM_PREFIX + kr.kryciSymbolId(p.id)) in sym),
  poleNabidky.filter(p => !((kr.PODM_PREFIX + kr.kryciSymbolId(p.id)) in sym)).map(p => p.id).join(','));
test('symbol nikdy není undefined', Object.keys(sym).every(k => typeof sym[k] === 'string'));
/* Řádky činností do šablony nepatří – rozsah prací má nabídka vlastní. */
test('činnosti se do podmínkových symbolů nedostávají',
  !Object.keys(sym).some(k => /^PODM_CIN_/.test(k)), Object.keys(sym).filter(k => /^PODM_CIN_/.test(k)).join(','));

const symOck = kr.kryciPodminkoveSymboly(zak, v, JEKLY);
/* Nabídka OCK a nabídka PROJ jsou dva samostatné dokumenty, každý se svou
 * šablonou – stejná jména symbolů si proto nepřekážejí. Co si ale
 * překážet nesmí, je OBSAH: podmínka platná jen pro projekci se nesmí
 * objevit v nabídce na dodávku konstrukce. */
test('symboly z podmínek jen pro PROJ v sadě OCK nejsou',
  !('PODM_FAKT_ZAMERENI' in symOck) && !('PODM_POKUTA_TERMIN' in symOck) && !('PODM_POJISTENI' in symOck),
  Object.keys(symOck).filter(k => /FAKT_|POKUTA_TERMIN|POJISTENI/.test(k)).join(','));
test('symboly z podmínek jen pro OCK v sadě PROJ nejsou',
  !('PODM_ZALOHA1' in sym) && !('PODM_ZADRZNE' in sym) && !('PODM_POKUTA_DODAVKA' in sym),
  Object.keys(sym).filter(k => /ZALOHA1|ZADRZNE|POKUTA_DODAVKA/.test(k)).join(','));
/* Zálohy se v obou listech jmenují jinak schválně (`zaloha` vs `zaloha1`),
 * protože projekce má jednu a dodávka konstrukce tři splátky. */
test('záloha projekce má vlastní symbol, ne symbol první splátky OCK',
  'PODM_ZALOHA' in sym && !('PODM_ZALOHA' in symOck), Object.keys(sym).filter(k => /ZALOHA/.test(k)).join(','));
test('sazba DPH se v obou sadách symbolů liší podle své části',
  kp.kryciProjPodminkoveSymboly(zak, vDph).PODM_SAZBA_DPH
    !== kr.kryciPodminkoveSymboly(zak, vDph, JEKLY).PODM_SAZBA_DPH,
  [kp.kryciProjPodminkoveSymboly(zak, vDph).PODM_SAZBA_DPH,
   kr.kryciPodminkoveSymboly(zak, vDph, JEKLY).PODM_SAZBA_DPH]);
test('splatnost dá číslo dnů, ale ne procento',
  sym.PODM_SPLATNOST_DNI_CISLO === String(c.sazby.splatnostDni) && sym.PODM_SPLATNOST_DNI_PROC === '',
  [sym.PODM_SPLATNOST_DNI_CISLO, sym.PODM_SPLATNOST_DNI_PROC]);
const symP = kp.kryciProjPodminkoveSymboly(zak, v, (t) => (t === 'Ano' ? 'Yes' : t));
test('texty symbolů projdou překladem', symP.PODM_PLATCE_DPH === 'Yes', symP.PODM_PLATCE_DPH);

/* ============================================================
 * 7) Sestavená data pro dokument
 * ============================================================ */

const dBo = kp.kryciProjData(zak, v, JEKLY, 'bo');
const dTd = kp.kryciProjData(zak, v, JEKLY, 'techdata');
const radky = (dd) => [].concat(...dd.sekce.map(s => s.radky));
const labely = (dd) => radky(dd).map(r => r[0]);
const najdiRadek = (dd, label) => (radky(dd).find(r => r[0] === label) || [])[1];

test('verze Backoffice obsahuje jen pole své verze',
  radky(dBo).length === VSECHNA_POLE.filter(p => p.verze.includes('bo')).length, radky(dBo).length);
test('verze Techdata obsahuje jen pole své verze',
  radky(dTd).length === VSECHNA_POLE.filter(p => p.verze.includes('techdata')).length, radky(dTd).length);
test('sekce bez jediného řádku se do dokumentu nedostane',
  dBo.sekce.every(s => s.radky.length > 0) && dTd.sekce.every(s => s.radky.length > 0));
/* Ceny činností vidí backoffice, technické oddělení jen stupně.
 * Popisek řádku je vlastní popisek krycího listu („Studie proveditelnosti
 * (ST)"), ne název sekce z kalkulace („ST – STUDIE") – list se čte
 * u zákazníka, kalkulace uvnitř firmy. */
test('rozsah s cenami je jen ve verzi Backoffice',
  labely(dBo).includes(pole('cin_' + ocenena.key).label)
  && dBo.sekce.some(s => /^Rozsah projekčních prací/.test(s.sekce))
  && !dTd.sekce.some(s => /^Rozsah projekčních prací/.test(s.sekce)),
  labely(dBo).join(' | '));
test('stupně dokumentace jsou jen ve verzi Techdata',
  dTd.sekce.some(s => /^Stupně dokumentace/.test(s.sekce))
  && !dBo.sekce.some(s => /^Stupně dokumentace/.test(s.sekce)));
test('ve verzi Techdata se u činností neobjeví žádná částka',
  !dTd.sekce.filter(s => /^Stupně dokumentace/.test(s.sekce))
    .some(s => s.radky.some(r => /Kč/.test(String(r[1])))));

test('nadpis říká, že jde o krycí list PROJ a o kterou verzi',
  /^Krycí list zakázky PROJ/.test(dBo.nadpis) && /Backoffice$/.test(dBo.nadpis)
  && /Techdata$/.test(dTd.nadpis), [dBo.nadpis, dTd.nadpis]);
/* Název souboru musí jít poznat od krycího listu OCK – jinak si
 * backoffice ve stažených souborech přepíše jeden druhým. */
test('název souboru nese PROJ, verzi i číslo nabídky',
  dBo.nazevSouboru.indexOf('KRYCI_LIST_PROJ_') === 0 && dBo.nazevSouboru.includes('Backoffice')
  && dBo.nazevSouboru.includes('401'), dBo.nazevSouboru);
test('název souboru krycího listu PROJ se liší od názvu listu OCK',
  dBo.nazevSouboru !== kr.kryciData(zak, v, JEKLY, 'bo').nazevSouboru,
  [dBo.nazevSouboru, kr.kryciData(zak, v, JEKLY, 'bo').nazevSouboru]);
test('název souboru nemá mezery ani znaky zakázané v názvu souboru',
  !/[\s\\/:*?"<>|]/.test(dBo.nazevSouboru), dBo.nazevSouboru);
test('zakázka bez čísla dostane náhradní název souboru',
  kp.kryciProjData(zk.novaZakazka(), zk.novaZakazka().varianty[0], JEKLY, 'bo').nazevSouboru.includes('CN'));

test('do dokumentu se propíše název akce z hlavičky',
  najdiRadek(dBo, 'Název akce') === zak.nazevAkce, najdiRadek(dBo, 'Název akce'));
test('do dokumentu se propíše hodnota projekční části',
  najdiRadek(dBo, 'Hodnota zakázky bez DPH') === c.hodnota, najdiRadek(dBo, 'Hodnota zakázky bez DPH'));
test('do dokumentu se propíše seznam činností mimo nabídku',
  najdiRadek(dBo, 'Činnosti mimo nabídku') === c.neocenene, najdiRadek(dBo, 'Činnosti mimo nabídku'));
test('neoceněná činnost se v dokumentu vypíše větou, ne nulou',
  najdiRadek(dBo, pole('cin_' + neocenena.key).label) === 'není součástí nabídky',
  najdiRadek(dBo, pole('cin_' + neocenena.key).label));
test('oceněná činnost se v dokumentu vypíše s částkou z kalkulace',
  najdiRadek(dBo, pole('cin_' + ocenena.key).label) === 'ANO – ' + kc(ocenena.celkem),
  najdiRadek(dBo, pole('cin_' + ocenena.key).label));

/* ============================================================
 * 8) Migrace
 * ============================================================ */

/* KL-7: ruční sazba DPH uložená starší verzí se z dat uklidí – stejně
 * jako u OCK. Vozit v souboru hodnotu, která se nikde nečte, znamená
 * mást každého, kdo se do dat podívá. */
test('ruční sazba DPH se z uložených hodnot uklidí',
  kp.kryciProjMigraceSazbaDph({ sazbaDph: '19 %' }).sazbaDph === undefined);
test('úklid sazby DPH se ostatních hodnot nedotkne',
  kp.kryciProjMigraceSazbaDph({ sazbaDph: '19 %', splatnostDni: '30' }).splatnostDni === '30');
test('úklid sazby DPH nespadne na prázdném vstupu',
  kp.kryciProjMigraceSazbaDph(null) === null && kp.kryciProjMigraceSazbaDph(undefined) === undefined);

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
