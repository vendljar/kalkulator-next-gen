/* ============================================================
 * Test kryci.js – datový model krycího listu objednávky / SoD (OCK)
 *
 * PROČ TAHLE SADA
 *
 * Krycí list je poslední papír mezi nabídkou a smlouvou. Backoffice podle
 * něj zakládá zakázku a technické oddělení podle něj vyrábí — proto se
 * generuje ve dvou verzích z jedné definice. Vedle toho z týchž polí od
 * 5. 8. 2026 vzniká i to, co obchodník vidí pod „Celkem s DPH" v nabídce,
 * a symboly {{PODM_…}} do wordové šablony. Jeden zdroj pravdy, tři místa
 * použití — a tři místa, kde se to dá tiše rozejít.
 *
 * Sada nesahá na generování .docx (to má test_kryci_docx.js) ani na
 * firemní standardy (test_standardy.js). Hlídá samotný model:
 *
 *  1) DEFINICE POLÍ. Každé pole má id a popisek a rozdělení na verze
 *     BO / Techdata. Duplicitní id znamená, že si dvě pole sahají do
 *     stejného úložiště a přepisují se navzájem.
 *  2) POŘADÍ ZDROJŮ. Ruční hodnota > prefill > prázdno. U polí svázaných
 *     s hlavičkou (bind, dphBind) se ruční hodnota naopak nečte vůbec —
 *     jinak by krycí list nesl jinou sazbu DPH, než jakou se počítalo.
 *  3) SYMBOLY DO ŠABLONY. Procento se pozná jen podle znaku %; „14" ve
 *     splatnosti jsou dny. Kdyby z toho vzniklo „14 %", odešla by nabídka
 *     s platební podmínkou, kterou nikdo nezadal.
 *  4) MIGRACE. Starý volný text zádržného a ruční sazba DPH z verzí před
 *     KL-5 / KL-7.
 *
 * Ceny se v testech nikdy nepíšou jako čísla — odvozují se z výpočtu nad
 * zkušebním ceníkem (src/zkusebni_cenik.js). Skutečné ceny ani sazby do
 * zdrojáků nepatří.
 * ============================================================ */

/* V prohlížeči jsou moduly v jednom scope, v Node ne — doplní se ručně. */
const fs = require('fs');
const nacti = (f) => { const m = require(f); Object.keys(m).forEach(k => { if (global[k] === undefined) global[k] = m[k]; }); return m; };
const ZC = require('./zkusebni_cenik.js');
nacti('./engine.js');
global.DEFAULT_CENIK = ZC.zkusebniCenik();
nacti('./engine_proj.js');
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
nacti('./techspec.js');       // tsHodnota – z ní se čte 3D zaměření
nacti('./sleva.js');          // slevaPodil – hodnota zakázky je po schválené slevě
nacti('./zaokrouhleni.js');   // cenaNabidkyOck – hodnota musí sedět s nabídkou
nacti('./firma.js');
const zk = nacti('./zakazka.js');
const kr = nacti('./kryci.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const VSECHNA_POLE = [].concat(...kr.KRYCI_SEKCE.map(s => s.pole));
const pole = (id) => VSECHNA_POLE.find(p => p.id === id);
const kc = (n) => Math.round(n || 0).toLocaleString('cs-CZ') + ' Kč';

/* Smyšlená zakázka – skutečný zákazník do zdrojáků nepatří. */
const zak = zk.novaZakazka();
zak.cislo = '2026 - OPR - CN - 301';
zak.nazevAkce = 'Zkušební vestavba šachty';
zak.adresa = 'Zkušební 1, Zkušebín';
zak.adresaObjednatele = 'Sídlištní 2, Zkušebín';
zak.objednatel = 'Zkušební ocelárna s.r.o.';
zak.kontakt = 'Jan Zkušební';
zak.ico = '12345679';
const v = zak.varianty[0];

/* Firma pro prefill – ukázkové údaje z firma.js, nikoli z _DB. */
global.NAST = { firma: global.firmaDefault() };

const c = kr.kryciCtx(zak, v, JEKLY);

/* ============================================================
 * 1) Definice polí – jedno místo pro dvě verze listu
 * ============================================================ */

test('krycí list má sekce a v každé aspoň jedno pole',
  kr.KRYCI_SEKCE.length > 0 && kr.KRYCI_SEKCE.every(s => s.sekce && s.pole && s.pole.length),
  kr.KRYCI_SEKCE.map(s => s.sekce + ':' + (s.pole || []).length).join(' | '));
test('názvy sekcí jsou unikátní',
  new Set(kr.KRYCI_SEKCE.map(s => s.sekce)).size === kr.KRYCI_SEKCE.length,
  kr.KRYCI_SEKCE.map(s => s.sekce).join(' | '));

test('každé pole má id', VSECHNA_POLE.every(p => !!p.id),
  JSON.stringify(VSECHNA_POLE.find(p => !p.id)));
test('každé pole má popisek', VSECHNA_POLE.every(p => !!p.label),
  (VSECHNA_POLE.find(p => !p.label) || {}).id);
/* Dvě pole se stejným id čtou a zapisují tutéž hodnotu ve
 * varianta.data.kryci.hodnoty – přepsáním jednoho se změní i druhé a na
 * dokumentu se objeví tentýž údaj na dvou různých řádcích. */
const idcka = VSECHNA_POLE.map(p => p.id);
test('id polí jsou unikátní napříč všemi sekcemi',
  new Set(idcka).size === idcka.length,
  idcka.filter((x, i) => idcka.indexOf(x) !== i).join(','));

test('každé pole patří aspoň do jedné verze',
  VSECHNA_POLE.every(p => Array.isArray(p.verze) && p.verze.length),
  (VSECHNA_POLE.find(p => !Array.isArray(p.verze) || !p.verze.length) || {}).id);
/* Verze se v kryciData porovnává přes includes(). Překlep („techdat")
 * pole tiše vypustí z obou verzí a nikdo si toho nevšimne. */
test('verze jsou jen „bo" a „techdata"',
  VSECHNA_POLE.every(p => p.verze.every(x => x === 'bo' || x === 'techdata')),
  VSECHNA_POLE.filter(p => p.verze.some(x => x !== 'bo' && x !== 'techdata')).map(p => p.id).join(','));
test('obě verze mají svá pole',
  VSECHNA_POLE.filter(p => p.verze.includes('bo')).length > 0
  && VSECHNA_POLE.filter(p => p.verze.includes('techdata')).length > 0);
/* Verze nejsou dvě jména pro totéž: backoffice řeší platební podmínky,
 * technické oddělení atypy. Kdyby se seznamy shodovaly, znamenalo by to,
 * že se rozdělení někde ztratilo. */
test('verze se v obsahu liší (nejsou to dva stejné listy)',
  VSECHNA_POLE.some(p => p.verze.length === 1 && p.verze[0] === 'bo')
  && VSECHNA_POLE.some(p => p.verze.length === 1 && p.verze[0] === 'techdata'));

test('pole s výběrem má nabídku možností',
  VSECHNA_POLE.filter(p => p.typ === 'radio' || p.typ === 'vyber')
    .every(p => Array.isArray(p.o) && p.o.length > 1),
  VSECHNA_POLE.filter(p => (p.typ === 'radio' || p.typ === 'vyber') && !(p.o || []).length).map(p => p.id).join(','));
/* Předvyplněná hodnota přepínače, která v nabídce není, by se ve
 * formuláři nedala vybrat zpátky – uživatel by ji jednou přepsal a už
 * by se k ní nedostal. */
test('předvyplněná hodnota přepínače je z jeho vlastní nabídky',
  VSECHNA_POLE.filter(p => p.typ === 'radio' && p.prefill)
    .every(p => p.o.includes(String(p.prefill(c)))),
  VSECHNA_POLE.filter(p => p.typ === 'radio' && p.prefill && !p.o.includes(String(p.prefill(c)))).map(p => p.id).join(','));
test('sazba DPH je výběr navázaný na hlavičku, ne volný text',
  pole('sazbaDph').typ === 'dph' && pole('sazbaDph').dphBind === 'C.dph',
  JSON.stringify([pole('sazbaDph').typ, pole('sazbaDph').dphBind]));
test('nabízené sazby DPH jsou 12 a 21 %',
  JSON.stringify(kr.KRYCI_DPH_SAZBY) === JSON.stringify([12, 21]), kr.KRYCI_DPH_SAZBY.join(','));

/* ============================================================
 * 2) Kontext prefillu – co se dotáhne z kalkulace a hlavičky
 * ============================================================ */

test('kontext zná zakázku, firmu i sazbu DPH z ceníku',
  c.zak === zak && !!c.firma && c.dph === Math.round(v.data.cenik.dph * 100),
  [c.dph, v.data.cenik.dph]);

const rOck = global.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes);
const rProj = global.vypocetProj(v.data.proj.zadani, v.data.proj.cenik);
const ockCena = global.cenaNabidkyOck(rOck, v.data.sleva || {}, v.data.zaokr).cena;

test('hodnota zakázky odpovídá ceně OCK z nabídky (včetně zaokrouhlení)',
  c.hodnota === kc(ockCena), [c.hodnota, kc(ockCena)]);
/* KL-2: krycí list OCK je podkladem pro objednávku na DODÁVKU KONSTRUKCE.
 * Kdyby se do hodnoty přičetla i projekce, byly by tytéž peníze ve dvou
 * smlouvách – projekce má vlastní krycí list s vlastní hodnotou. */
test('do hodnoty zakázky se projekční část nepřičítá',
  rProj.souhrn.celkem > 0 && c.hodnota !== kc(ockCena + rProj.souhrn.celkem),
  [c.hodnota, kc(ockCena + rProj.souhrn.celkem)]);

/* Sleva se do hodnoty propíše, jen když je schválená – neschválená sleva
 * je zatím jen návrh obchodníka a do podkladu pro smlouvu nepatří. */
const vNavrh = zk.novaVarianta('Návrh slevy', JSON.parse(JSON.stringify(v.data)));
vNavrh.data.sleva = { procenta: 10, stav: '' };
test('neschválená sleva hodnotu zakázky nesnižuje',
  kr.kryciCtx(zak, vNavrh, JEKLY).hodnota === c.hodnota,
  kr.kryciCtx(zak, vNavrh, JEKLY).hodnota);
const vSleva = zk.novaVarianta('Schválená sleva', JSON.parse(JSON.stringify(v.data)));
vSleva.data.sleva = { procenta: 10, stav: 'schváleno' };
test('schválená sleva se do hodnoty zakázky propíše',
  kr.kryciCtx(zak, vSleva, JEKLY).hodnota !== c.hodnota,
  kr.kryciCtx(zak, vSleva, JEKLY).hodnota);

/* KL-3: čistě projekční zakázka není šachta. Škatulka se odvozuje z toho,
 * co je oceněné, ne z toho, co je vyplněné v technické specifikaci. */
test('zakázka s OCK i projekcí se popíše jako šachta + projekce',
  /šachta \+ projekce$/.test(c.typProduktu), c.typProduktu);
test('typ šachty (interiérová / exteriérová) přijde z kalkulace OCK',
  c.ext === (v.data.ock.zadani.typSachty === 'exteriérová')
  && new RegExp(c.ext ? 'Exteriérová' : 'Interiérová').test(c.typProduktu), c.typProduktu);

/* KL-4: „Zaměření strojovna" i stupně dokumentace se v aplikaci už jednou
 * zadávají. Ptát se na ně v krycím listu znovu znamená mít dvě odpovědi
 * na jednu otázku a nevědět, která platí. */
test('3D zaměření se přebírá z technické specifikace jako Ano/Ne',
  c.sken3d === 'Ano' || c.sken3d === 'Ne' || c.sken3d === '', JSON.stringify(c.sken3d));
test('oceněná sekce kalkulace PROJ znamená ANO',
  c.projAno('dps') === (rProj.sekce.find(s => s.key === 'dps').celkem > 0 ? 'Ano' : 'Ne'),
  c.projAno('dps'));
/* Neznámý klíč nesmí skončit prázdnem, které se v dokumentu čte jako
 * nevyplněný řádek – žádná činnost = NE. */
test('neznámá sekce kalkulace PROJ končí u NE, ne u prázdna',
  c.projAno('neexistuje') === 'Ne', c.projAno('neexistuje'));

/* Kalkulace OCK, která neproběhne (nenačetla se tabulka jeklů), nesmí
 * shodit celý krycí list — obchodník potřebuje aspoň smluvní podmínky,
 * i když cena chybí. */
let cBezJeklu = null, spadlo = false;
try { cBezJeklu = kr.kryciCtx(zak, v, null); } catch (e) { spadlo = true; }
test('nespočítaná kalkulace OCK krycí list neshodí', !spadlo && !!cBezJeklu);
/* „Prázdno není nula": nespočítaná cena se vypíše pomlčkou. Nula by se
 * v podkladu pro smlouvu četla jako „zdarma". */
test('bez spočtené ceny se do hodnoty nepíše nula, ale pomlčka',
  cBezJeklu && cBezJeklu.hodnota === '—', cBezJeklu && cBezJeklu.hodnota);
/* KL-3: když je oceněná jen projekce, není to šachta. Škatulka se řídí
 * tím, co je oceněné — čistě projekční zakázka se nesmí označit jako
 * dodávka konstrukce. */
test('bez ceny OCK a s oceněnou projekcí je typ produktu Projekce',
  cBezJeklu && cBezJeklu.typProduktu === 'Projekce', cBezJeklu && cBezJeklu.typProduktu);
/* Opačný případ: projekce se nespočítá, OCK ano – v typu produktu pak
 * nesmí zůstat viset „+ projekce". */
const vBezProj = zk.novaVarianta('Bez projekce', JSON.parse(JSON.stringify(v.data)));
vBezProj.data.proj.cenik = null;
test('nespočítaná projekce se do typu produktu nepřidá',
  !/projekce/.test(kr.kryciCtx(zak, vBezProj, JEKLY).typProduktu),
  kr.kryciCtx(zak, vBezProj, JEKLY).typProduktu);

/* ============================================================
 * 3) Pořadí zdrojů: ruční hodnota > prefill > prázdno
 * ============================================================ */

const klPrazdny = { hodnoty: {} };
test('bez ruční hodnoty se použije prefill',
  kr.kryciHodnota(pole('splatnostDni'), klPrazdny, c) === '14',
  kr.kryciHodnota(pole('splatnostDni'), klPrazdny, c));
test('ruční hodnota má přednost před prefillem',
  kr.kryciHodnota(pole('splatnostDni'), { hodnoty: { splatnostDni: '30' } }, c) === '30');
/* „Prázdno není nula": prázdná ruční hodnota neznamená „vymazat", ale
 * „nic jsem nezadal" – vrací se automatika. Jinak by smazání znaku
 * v poli natrvalo vyprázdnilo řádek dokumentu. */
test('prázdná ruční hodnota se vrací k prefillu, nevyprázdní řádek',
  kr.kryciHodnota(pole('splatnostDni'), { hodnoty: { splatnostDni: '' } }, c) === '14');
test('pole bez prefillu i bez ruční hodnoty zůstane prázdné',
  kr.kryciHodnota(pole('kontaktStavba'), klPrazdny, c) === '',
  kr.kryciHodnota(pole('kontaktStavba'), klPrazdny, c));
test('chybějící úložiště ručních hodnot nespadne',
  kr.kryciHodnota(pole('splatnostDni'), null, c) === '14');

/* Pole svázané s hlavičkou (bind) čte přímo ze zakázky. Uložená ruční
 * hodnota by po změně hlavičky nesla starý název akce a nikdo by nevěděl,
 * proč se dokument neaktualizoval. */
test('pole svázané s hlavičkou čte hlavičku, ne ruční přepis',
  kr.kryciHodnota(pole('nazevAkce'), { hodnoty: { nazevAkce: 'Něco jiného' } }, c) === zak.nazevAkce,
  kr.kryciHodnota(pole('nazevAkce'), { hodnoty: { nazevAkce: 'Něco jiného' } }, c));
/* KL-7: totéž pro sazbu DPH. Ruční „19 %" v krycím listu by znamenalo,
 * že podklad pro smlouvu nese jinou sazbu, než jakou se počítalo
 * „Celkem s DPH" v nabídce. */
test('sazba DPH se ručním přepisem přebít nedá',
  kr.kryciHodnota(pole('sazbaDph'), { hodnoty: { sazbaDph: '19 %' } }, c) === c.dph + ' %',
  kr.kryciHodnota(pole('sazbaDph'), { hodnoty: { sazbaDph: '19 %' } }, c));

/* Prefill se počítá z živých dat, takže může spadnout na čemkoli
 * neočekávaném. Krycí list to nesmí odnést celý. */
const rozbitePole = { id: 'zkouska', label: 'Zkouška', verze: ['bo'], prefill: () => { throw new Error('rozbito'); } };
let spadlPrefill = false, hodnotaRozbita = null;
try { hodnotaRozbita = kr.kryciHodnota(rozbitePole, klPrazdny, c); } catch (e) { spadlPrefill = true; }
test('výjimka v prefillu neshodí krycí list a končí prázdnem',
  !spadlPrefill && hodnotaRozbita === '', spadlPrefill ? 'výjimka' : hodnotaRozbita);

/* ============================================================
 * 4) Sestavená data pro dokument (obě verze)
 * ============================================================ */

const dBo = kr.kryciData(zak, v, JEKLY, 'bo');
const dTd = kr.kryciData(zak, v, JEKLY, 'techdata');
const radky = (dd) => [].concat(...dd.sekce.map(s => s.radky));
const labely = (dd) => radky(dd).map(r => r[0]);

test('verze Backoffice obsahuje jen pole své verze',
  radky(dBo).length === VSECHNA_POLE.filter(p => p.verze.includes('bo')).length,
  radky(dBo).length);
test('verze Techdata obsahuje jen pole své verze',
  radky(dTd).length === VSECHNA_POLE.filter(p => p.verze.includes('techdata')).length,
  radky(dTd).length);
test('platební podmínky jsou jen ve verzi Backoffice',
  labely(dBo).includes('Splatnost faktur (dní)') && !labely(dTd).includes('Splatnost faktur (dní)'));
test('atypy OCK jsou jen ve verzi Techdata',
  labely(dTd).includes('Podchozí OCK') && !labely(dBo).includes('Podchozí OCK'));
/* Sekce, ze které v dané verzi nezůstal žádný řádek, se do dokumentu
 * nedostane – prázdný nadpis v tabulce vypadá jako zapomenutá kapitola. */
test('sekce bez jediného řádku se do dokumentu nedostane',
  dBo.sekce.every(s => s.radky.length > 0) && dTd.sekce.every(s => s.radky.length > 0));
test('verze Techdata neobsahuje sekci Atypy OCK navíc než Backoffice',
  dTd.sekce.some(s => s.sekce === 'Atypy OCK') && !dBo.sekce.some(s => s.sekce === 'Atypy OCK'));

test('nadpis říká, o kterou verzi jde',
  /Backoffice$/.test(dBo.nadpis) && /Techdata$/.test(dTd.nadpis), [dBo.nadpis, dTd.nadpis]);
test('název souboru nese verzi i číslo nabídky',
  dBo.nazevSouboru.includes('Backoffice') && dBo.nazevSouboru.includes('301'), dBo.nazevSouboru);
/* Mezery z předlohy čísla („2026 - OPR - CN - 301") i znaky zakázané ve
 * jménech souborů se musí odstranit, jinak stahování selže. */
test('název souboru nemá mezery ani znaky zakázané v názvu souboru',
  !/[\s\\/:*?"<>|]/.test(dBo.nazevSouboru), dBo.nazevSouboru);
test('zakázka bez čísla dostane náhradní název souboru',
  kr.kryciData(Object.assign({}, zak, { cislo: '' }), v, JEKLY, 'bo').nazevSouboru.includes('CN'));

/* Hodnoty v dokumentu jdou přes tutéž funkci jako ve formuláři – dokument
 * a obrazovka nesmějí ukazovat dvě různé věci. */
const najdiRadek = (dd, label) => (radky(dd).find(r => r[0] === label) || [])[1];
test('do dokumentu se propíše název akce z hlavičky',
  najdiRadek(dBo, 'Název akce') === zak.nazevAkce, najdiRadek(dBo, 'Název akce'));
test('do dokumentu se propíše IČO objednatele z hlavičky',
  najdiRadek(dBo, 'IČO') === zak.ico, najdiRadek(dBo, 'IČO'));
/* KL-1: sídlo objednatele, ne adresa stavby – ty se běžně liší a do
 * smlouvy patří sídlo. */
test('adresa objednatele v dokumentu je sídlo, ne adresa stavby',
  najdiRadek(dBo, 'Adresa (sídlo) objednatele') === zak.adresaObjednatele
  && najdiRadek(dBo, 'Adresa (sídlo) objednatele') !== zak.adresa,
  najdiRadek(dBo, 'Adresa (sídlo) objednatele'));
test('ruční hodnota se propíše do obou verzí listu', (() => {
  const vr = zk.novaVarianta('Ruční', JSON.parse(JSON.stringify(v.data)));
  vr.data.kryci.hodnoty.podpisInformovan = 'Jan Zkušební';
  return najdiRadek(kr.kryciData(zak, vr, JEKLY, 'bo'), 'Informován') === 'Jan Zkušební'
      && najdiRadek(kr.kryciData(zak, vr, JEKLY, 'techdata'), 'Informován') === 'Jan Zkušební';
})());

/* Sekce zobrazené i v souhrnu nabídky musí existovat pod přesně týmž
 * jménem – přejmenováním sekce by souhrn nabídky tiše zmizel. */
test('sekce zobrazené u nabídky se v krycím listu opravdu jmenují stejně',
  kr.KRYCI_NABIDKA_SEKCE.every(n => kr.KRYCI_SEKCE.some(s => s.sekce === n)),
  kr.KRYCI_NABIDKA_SEKCE.filter(n => !kr.KRYCI_SEKCE.some(s => s.sekce === n)).join(','));

/* ============================================================
 * 5) Symboly {{PODM_…}} do wordové šablony
 * ============================================================ */

test('id pole se na symbol převádí po slovech', kr.kryciSymbolId('splatnostDni') === 'SPLATNOST_DNI');
/* Číslice se od písmen neoddělují, jinak by ze `zaloha1` vzniklo
 * `ZALOHA_1` a šablona by hledala symbol, který nikdo negeneruje. */
test('číslice v id zůstává přilepená', kr.kryciSymbolId('zaloha1') === 'ZALOHA1');
test('víceslovné id se rozdělí na všech hranicích', kr.kryciSymbolId('fakturaKonc') === 'FAKTURA_KONC');
test('prázdné id nespadne', kr.kryciSymbolId(null) === '' && kr.kryciSymbolId(undefined) === '');

test('číslo se vytáhne z věty', kr.kryciCisloZTextu('50 % – po podpisu smlouvy') === '50');
test('desetinná čárka zůstává česky', kr.kryciCisloZTextu('0,05 % / den') === '0,05');
test('bere se první číslo v textu', kr.kryciCisloZTextu('10 % – do 30 dnů') === '10');
test('záporné číslo si nechá znaménko', kr.kryciCisloZTextu('-5 %') === '-5');
test('text bez čísla dá prázdno, ne nulu', kr.kryciCisloZTextu('po předání') === '');
test('prázdný vstup dá prázdno', kr.kryciCisloZTextu('') === '' && kr.kryciCisloZTextu(null) === '');

/* Tohle je jádro celé věci: procento se pozná POUZE podle znaku %.
 * „14" ve splatnosti jsou dny – kdyby z toho vzniklo „14 %", odešla by
 * zákazníkovi nabídka s platební podmínkou, kterou nikdo nezadal. */
test('číslo bez znaku % se za procento nepovažuje', kr.kryciProcentoZTextu('14') === '',
  kr.kryciProcentoZTextu('14'));
test('procento se pozná podle znaku %', kr.kryciProcentoZTextu('50 % – po podpisu smlouvy') === '50 %');
test('procento bez mezery před znakem se pozná také', kr.kryciProcentoZTextu('50% zálohy') === '50 %');
test('procento si nechá desetinnou čárku', kr.kryciProcentoZTextu('0,05 % / den') === '0,05 %');
test('text bez procenta dá prázdno', kr.kryciProcentoZTextu('po předání') === '');

const sym = kr.kryciPodminkoveSymboly(zak, v, JEKLY);
test('všechny symboly mají prefix PODM_',
  Object.keys(sym).every(k => k.indexOf(kr.PODM_PREFIX) === 0),
  Object.keys(sym).filter(k => k.indexOf(kr.PODM_PREFIX) !== 0).join(','));
/* Symboly se neopisují ručně, ale odvozují z KRYCI_NABIDKA_SEKCE – nově
 * přidané pole tak dostane symbol samo a nemůže zůstat bez vazby. */
const poleNabidky = [].concat(...kr.KRYCI_SEKCE.filter(s => kr.KRYCI_NABIDKA_SEKCE.includes(s.sekce)).map(s => s.pole));
test('každé pole zobrazené u nabídky má svůj symbol',
  poleNabidky.every(p => (kr.PODM_PREFIX + kr.kryciSymbolId(p.id)) in sym),
  poleNabidky.filter(p => !((kr.PODM_PREFIX + kr.kryciSymbolId(p.id)) in sym)).map(p => p.id).join(','));
test('pole mimo sekce nabídky symbol nedostávají (atypy do šablony nepatří)',
  !('PODM_ATYP_PODCHOZI' in sym) && !('PODM_TERMIN_PREDANI' in sym));
test('ke každému poli vznikají i tvary _CISLO a _PROC',
  poleNabidky.every(p => (kr.PODM_PREFIX + kr.kryciSymbolId(p.id) + '_CISLO') in sym));
test('symbol nikdy není undefined – do dokumentu by se vypsalo slovo',
  Object.keys(sym).every(k => typeof sym[k] === 'string'),
  Object.keys(sym).filter(k => typeof sym[k] !== 'string').join(','));

test('symbol nese celý text pole tak, jak ho obchodník vidí',
  sym.PODM_ZALOHA1 === '50 % – po podpisu smlouvy', sym.PODM_ZALOHA1);
test('odvozené číslo vynechá slova kolem', sym.PODM_ZALOHA1_CISLO === '50', sym.PODM_ZALOHA1_CISLO);
test('odvozené procento nese i znak %', sym.PODM_ZALOHA1_PROC === '50 %', sym.PODM_ZALOHA1_PROC);
/* Šablona píše „… {{PODM_SPLATNOST_DNI_CISLO}} dní …", takže číslo tam
 * být musí – ale procento u téhož pole musí zůstat prázdné. */
test('splatnost dá číslo dnů', sym.PODM_SPLATNOST_DNI_CISLO === '14', sym.PODM_SPLATNOST_DNI_CISLO);
test('ze splatnosti nevznikne procento', sym.PODM_SPLATNOST_DNI_PROC === '', sym.PODM_SPLATNOST_DNI_PROC);

/* Sráz jmen: přepínač `zadrzne` má odvozený symbol _PROC, který se jmenuje
 * stejně jako skutečné pole `zadrzneProc`. Vyhrát musí zadané číslo, ne
 * prázdno odvozené ze slova „Ano" – jinak by ze smlouvy zmizela výše
 * zádržného, přestože ji obchodník vyplnil. */
const vZadrzne = zk.novaVarianta('Zádržné', JSON.parse(JSON.stringify(v.data)));
vZadrzne.data.kryci.hodnoty.zadrzne = 'Ano';
vZadrzne.data.kryci.hodnoty.zadrzneProc = '10';
const symZ = kr.kryciPodminkoveSymboly(zak, vZadrzne, JEKLY);
test('skutečné pole přebije stejnojmenný odvozený symbol',
  symZ.PODM_ZADRZNE_PROC === '10', symZ.PODM_ZADRZNE_PROC);
test('ruční hodnota se do symbolů propíše', symZ.PODM_ZADRZNE === 'Ano');

/* Symboly se překládají, protože nabídka odchází i v angličtině a němčině.
 * Odvozená čísla se ale nepřekládají – číslo je číslo. */
const symP = kr.kryciPodminkoveSymboly(zak, v, JEKLY, (t) => (t === 'Ano' ? 'Yes' : t));
test('texty symbolů projdou překladem', symP.PODM_PLATCE_DPH === 'Yes', symP.PODM_PLATCE_DPH);
test('odvozená čísla se nepřekládají', symP.PODM_ZALOHA1_CISLO === '50', symP.PODM_ZALOHA1_CISLO);
test('bez překladače se text nezmění', sym.PODM_PLATCE_DPH === 'Ano', sym.PODM_PLATCE_DPH);

/* ============================================================
 * 6) Migrace starších uložených hodnot
 * ============================================================ */

/* KL-5: „Zádržné" bývalo jedno pole s volným textem. Přepínač zná jen
 * Ano/Ne, takže text se musí rozložit – a hlavně se z něj nesmí ztratit
 * ručně zadané procento. */
const zadrzne = (vstup) => kr.kryciMigraceZadrzne(Object.assign({}, vstup));
test('už převedená hodnota Ano zůstane', zadrzne({ zadrzne: 'Ano' }).zadrzne === 'Ano');
test('už převedená hodnota Ne zůstane', zadrzne({ zadrzne: 'Ne' }).zadrzne === 'Ne');
test('starý text začínající ANO se převede na Ano',
  zadrzne({ zadrzne: 'ANO do odstranění vad a nedodělků' }).zadrzne === 'Ano');
test('starý text začínající NE se převede na Ne',
  zadrzne({ zadrzne: 'NE, nesjednáno' }).zadrzne === 'Ne');
test('procento ze starého textu se uloží do vlastního pole',
  zadrzne({ zadrzne: 'ANO do odstranění VaN 10 %' }).zadrzneProc === '10');
test('desetinné procento se převede i s čárkou',
  zadrzne({ zadrzne: 'ANO 2,5 %' }).zadrzneProc === '2,5');
/* Text, který se nedá přeložit, se raději bere jako sjednané zádržné:
 * ztratit ho tichým „Ne" by znamenalo, že se ze smlouvy vypaří pojistka,
 * kterou si někdo výslovně vymínil. */
test('nesrozumitelný text se bere jako sjednané zádržné',
  zadrzne({ zadrzne: 'dle dohody 5 %' }).zadrzne === 'Ano');
test('procento se z nesrozumitelného textu zachrání také',
  zadrzne({ zadrzne: 'dle dohody 5 %' }).zadrzneProc === '5');
test('už vyplněné procento migrace nepřepíše',
  zadrzne({ zadrzne: 'ANO 10 %', zadrzneProc: '7' }).zadrzneProc === '7');
test('prázdná hodnota se z dat odstraní (prázdno není Ano ani Ne)',
  zadrzne({ zadrzne: '' }).zadrzne === undefined);
test('chybějící zádržné migrace neřeší', zadrzne({}).zadrzne === undefined);
test('migrace zádržného nespadne na prázdném vstupu',
  kr.kryciMigraceZadrzne(null) === null && kr.kryciMigraceZadrzne(undefined) === undefined);

/* KL-7: ruční sazba DPH se od 5. 8. 2026 nečte. Vozit ji dál v datech
 * znamená mít v souboru hodnotu, která nikde neplatí. */
test('ruční sazba DPH se z uložených hodnot uklidí',
  kr.kryciMigraceSazbaDph({ sazbaDph: '19 %' }).sazbaDph === undefined);
test('úklid sazby DPH se ostatních hodnot nedotkne',
  kr.kryciMigraceSazbaDph({ sazbaDph: '19 %', splatnostDni: '30' }).splatnostDni === '30');
test('úklid sazby DPH nespadne na prázdném vstupu',
  kr.kryciMigraceSazbaDph(null) === null && kr.kryciMigraceSazbaDph(undefined) === undefined);
/* ============================================================
 * #122 – krycí list nesmí spadnout na variantě bez ceníku
 * ============================================================
 *
 * Výpočet je v kryciCtx() obalený v try/catch právě proto, aby rozbitá
 * kalkulace neshodila celý krycí list. Do 11. 8. 2026 se ale zadání a ceník
 * četly mimo ten blok, takže varianta bez ceníku shodila celou stránku —
 * a to i pole, která z kalkulace vůbec nepocházejí (objednatel, adresa,
 * platební podmínky). Nález z 10. 8. 2026 při psaní testů.
 */
{
  const jekly = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));
  const vada = [
    ['varianta bez ceníku', { data: { ock: { zadani: {}, fixes: false }, proj: {} } }],
    ['varianta bez zadání OCK', { data: { cenik: {}, proj: {} } }],
    ['varianta bez dat', {}],
    ['varianta undefined', undefined],
  ];
  vada.forEach(([popis, v]) => {
    let ctx = null, spadlo = false;
    try { ctx = kryciCtx({ cislo: 'X', nazevAkce: 'Y' }, v, jekly); } catch (e) { spadlo = true; }
    test('krycí list nespadne: ' + popis, !spadlo);
    test('krycí list vrátí kontext: ' + popis, !!ctx);
    /* Neznámá hodnota se ukazuje pomlčkou, ne nulou. Nula by v krycím listu
     * znamenala „zakázka za nic", což je tvrzení, ne chybějící údaj. */
    test('neznámá hodnota je pomlčka, ne nula: ' + popis, !ctx || ctx.hodnota === '—', ctx && ctx.hodnota);
  });
}

/* ---------- dopočet dílčí faktury č. 2 (19. 8. 2026) ----------
 * Zadání: „v platebních podmínkách ock dopočítávej dílčí fakturu č. 2 podle
 * toho kolik zbývá po volbě zálohové faktury, resp. případné změně výše
 * konečné faktury." Tři čísla mají dát dohromady 100 %; prostřední se dopočte. */
const f2 = kr.kryciFaktura2Dopocet;
test('50 % záloha + 10 % konečná → dílčí 2 je 40 %',
  f2('50 % – po podpisu smlouvy', '10 % – po předání', '40 % – po zahájení montáže') === '40 % – po zahájení montáže');
test('70 % záloha + 10 % konečná → dílčí 2 je 20 %',
  f2('70 % – po podpisu smlouvy', '10 % – po předání', '40 % – po zahájení montáže') === '20 % – po zahájení montáže',
  f2('70 % – po podpisu smlouvy', '10 % – po předání', '40 % – po zahájení montáže'));
test('změna konečné na 30 % → dílčí 2 je 20 %',
  f2('50 % – po podpisu smlouvy', '30 % – po předání', '40 % – po zahájení montáže') === '20 % – po zahájení montáže');
test('„Bez zálohy" se počítá jako 0 %',
  f2('Bez zálohy', '10 % – po předání', '40 % – po zahájení montáže') === '90 % – po zahájení montáže',
  f2('Bez zálohy', '10 % – po předání', '40 % – po zahájení montáže'));
test('vlastní dovětek dílčí faktury se zachová',
  f2('50 % – po podpisu smlouvy', '10 % – po předání', '40 % – po dodání materiálu') === '40 % – po dodání materiálu');
test('nečitelné procento konečné faktury dopočet zastaví (nic se nevymýšlí)',
  f2('50 % – po podpisu smlouvy', 'po dohodě', '40 % – po zahájení montáže') === null);
test('záporný zbytek dopočet zastaví',
  f2('70 % – po podpisu smlouvy', '40 % – po předání', '40 %') === null);
test('kryciFaktura2Sync doplní i výchozí hodnoty (nic ručně nezadáno)',
  kr.kryciFaktura2Sync({}) === '40 % – po zahájení montáže', kr.kryciFaktura2Sync({}));
test('kryciFaktura2Sync reaguje na ruční zálohu 70 %',
  kr.kryciFaktura2Sync({ zaloha1: '70 % – po podpisu smlouvy' }) === '20 % – po zahájení montáže',
  kr.kryciFaktura2Sync({ zaloha1: '70 % – po podpisu smlouvy' }));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
