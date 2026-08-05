/* Test firma.js (SET-3) – firemní údaje pro dokumenty.
   Čistá logika bez DOM: skládání adres, bankovního řádku, patičky,
   zástupných symbolů {{FIRMA_…}} a neblokující kontroly povinných polí. */
const fm = require('./firma.js');

/* Očekávané hodnoty se ODVOZUJÍ z DEFAULT_FIRMA, nepíšou se jako text.
 * V repozitáři je ukázková firma (skutečné údaje leží v _DB/_nastaveni.json),
 * takže opsané jméno nebo IČO by test svázalo s konkrétním vzorkem – a hlavně
 * by se skutečné údaje vrátily zpátky do zdrojáků, ze kterých je smyslem je
 * dostat pryč. Test má hlídat SKLÁDÁNÍ řádků, ne obsah vzorku. */
const D = fm.DEFAULT_FIRMA;
const SIDLO = D.sidloUlice + ', ' + D.sidloPsc + ' ' + D.sidloMesto;
const ICO = 'IČO: ' + D.ico;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* --- 1) definice polí --- */
test('FIRMA_POLE má unikátní id', new Set(fm.FIRMA_POLE.map(p => p.id)).size === fm.FIRMA_POLE.length);
const symboly = fm.FIRMA_POLE.filter(p => p.symbol).map(p => p.symbol);
test('symboly jsou unikátní', new Set(symboly).size === symboly.length);
test('všechny symboly mají prefix FIRMA_', symboly.every(s => s.startsWith('FIRMA_')));
test('každé pole patří do známé sekce', fm.FIRMA_POLE.every(p => fm.FIRMA_SEKCE.includes(p.sekce)),
  (fm.FIRMA_POLE.find(p => !fm.FIRMA_SEKCE.includes(p.sekce)) || {}).id);
test('6 povinných polí', fm.FIRMA_POLE.filter(p => p.povinne).length === 6,
  fm.FIRMA_POLE.filter(p => p.povinne).length);
test('korShodna je checkbox bez symbolu',
  fm.firmaPole('korShodna').typ === 'check' && !fm.firmaPole('korShodna').symbol);
test('neznámé pole = null', fm.firmaPole('neexistuje') === null);

/* --- 2) výchozí údaje jsou samostatná kopie --- */
const f = fm.firmaDefault();
f.nazev = 'ZMĚNA';
test('firmaDefault vrací hlubokou kopii', fm.DEFAULT_FIRMA.nazev !== 'ZMĚNA', fm.DEFAULT_FIRMA.nazev);

const F = fm.firmaDefault();

/* --- 3) adresy --- */
test('sídlo na jeden řádek', fm.firmaSidlo(F) === SIDLO, fm.firmaSidlo(F));
test('česká země se do adresy nepíše', !/Česká republika/.test(fm.firmaSidlo(F)), fm.firmaSidlo(F));
const Fsk = fm.firmaDefault();
Fsk.sidloZeme = 'Slovensko';
test('cizí země se do adresy připojí', /, Slovensko$/.test(fm.firmaSidlo(Fsk)), fm.firmaSidlo(Fsk));
test('prázdná adresa vrací prázdný řetězec', fm.firmaAdresaRadek({}, 'sidlo') === '');

test('korShodna = true → korespondenční je sídlo',
  fm.firmaKorespondencni(F) === fm.firmaSidlo(F), fm.firmaKorespondencni(F));
const Fkor = fm.firmaDefault();
Fkor.korShodna = false; Fkor.korUlice = 'Poštovní 1'; Fkor.korPsc = '110 00'; Fkor.korMesto = 'Praha 1';
test('korShodna = false → vlastní adresa',
  fm.firmaKorespondencni(Fkor) === 'Poštovní 1, 110 00 Praha 1', fm.firmaKorespondencni(Fkor));
const Fprazd = fm.firmaDefault();
Fprazd.korShodna = false;
test('korShodna = false a prázdná adresa → fallback na sídlo',
  fm.firmaKorespondencni(Fprazd) === fm.firmaSidlo(Fprazd), fm.firmaKorespondencni(Fprazd));

/* --- 4) složené řádky --- */
test('IČO bez prázdného DIČ', fm.firmaIcoDic(F) === ICO, fm.firmaIcoDic(F));
const Fdic = fm.firmaDefault(); Fdic.dic = 'CZ00000000';
test('IČO + DIČ', fm.firmaIcoDic(Fdic) === ICO + ', DIČ: CZ00000000', fm.firmaIcoDic(Fdic));
test('prázdná identifikace = prázdný řetězec', fm.firmaIcoDic({}) === '');

test('prázdné bankovní spojení = prázdný řetězec', fm.firmaBankaRadek(F) === '', fm.firmaBankaRadek(F));
const Fb = fm.firmaDefault();
Fb.banka = 'Komerční banka'; Fb.ucet = '123456789/0100'; Fb.iban = 'CZ6501000000000123456789'; Fb.swift = 'KOMBCZPP';
test('bankovní spojení složené',
  fm.firmaBankaRadek(Fb) === 'Komerční banka, č. ú. 123456789/0100, IBAN CZ6501000000000123456789, SWIFT KOMBCZPP',
  fm.firmaBankaRadek(Fb));
const Fb2 = fm.firmaDefault(); Fb2.ucet = '123456789/0100';
test('bankovní spojení jen s účtem', fm.firmaBankaRadek(Fb2) === 'č. ú. 123456789/0100', fm.firmaBankaRadek(Fb2));

test('patička obsahuje název, sídlo, IČO, telefon i web', (() => {
  const pat = fm.firmaPaticka(F);
  return [D.nazev, SIDLO, ICO, 'tel. ' + D.telefon, D.web].every(x => pat.includes(x));
})(), fm.firmaPaticka(F));
test('patička nemá prázdné části (žádné „, ,“)', !/, ,/.test(fm.firmaPaticka(F)), fm.firmaPaticka(F));
test('patička prázdné firmy = prázdný řetězec', fm.firmaPaticka({}) === '');

/* --- 5) zástupné symboly --- */
const ph = fm.firmaPlaceholders(F);
const chybi = fm.firmaSymboly().filter(s => ph[s] == null || String(ph[s]).includes('undefined'));
test('všech ' + fm.firmaSymboly().length + ' symbolů vyplněno (bez undefined)', chybi.length === 0, chybi.join(','));
test('firmaSymboly = pole se symbolem + 5 odvozených',
  fm.firmaSymboly().length === symboly.length + 5, fm.firmaSymboly().length);
test('FIRMA_NAZEV', ph.FIRMA_NAZEV === D.nazev, ph.FIRMA_NAZEV);
test('FIRMA_SIDLO odvozený', ph.FIRMA_SIDLO === SIDLO, ph.FIRMA_SIDLO);
test('FIRMA_KORESPONDENCNI = sídlo', ph.FIRMA_KORESPONDENCNI === ph.FIRMA_SIDLO, ph.FIRMA_KORESPONDENCNI);
test('FIRMA_ICO_DIC odvozený', ph.FIRMA_ICO_DIC === ICO, ph.FIRMA_ICO_DIC);
test('nevyplněné pole je prázdný řetězec, ne undefined', ph.FIRMA_DIC === '' && ph.FIRMA_BANKA === '');
test('korShodna se do symbolů nedostane', ph.korShodna === undefined && ph.FIRMA_KORSHODNA === undefined);

// překládá se JEN země – vlastní jména, adresy a čísla nikdy
const phP = fm.firmaPlaceholders(F, t => t === 'Česká republika' ? 'Czech Republic' : 'PŘELOŽENO');
test('země se přeloží', phP.FIRMA_SIDLO_ZEME === 'Czech Republic', phP.FIRMA_SIDLO_ZEME);
test('název firmy se nepřekládá', phP.FIRMA_NAZEV === D.nazev, phP.FIRMA_NAZEV);
test('ulice se nepřekládá', phP.FIRMA_SIDLO_ULICE === D.sidloUlice, phP.FIRMA_SIDLO_ULICE);
test('prázdná země se nepřekládá', fm.firmaPlaceholders({}, () => 'X').FIRMA_SIDLO_ZEME === '');

/* --- 6) řádky pro náhled a krycí list --- */
const r = fm.firmaRadky(F);
const labely = r.map(x => x[0]);
test('řádky vynechávají prázdné hodnoty', !labely.includes('DIČ') && !labely.includes('Bankovní spojení'), labely.join('|'));
test('řádky obsahují název, sídlo, telefon, web, vypracoval',
  ['Název firmy', 'Sídlo', 'Telefon', 'Web', 'Vypracoval'].every(l => labely.includes(l)), labely.join('|'));
test('korespondenční adresa se při shodě se sídlem neduplikuje',
  !labely.includes('Korespondenční adresa'), labely.join('|'));
test('korespondenční adresa se ukáže, liší-li se',
  fm.firmaRadky(Fkor).map(x => x[0]).includes('Korespondenční adresa'));
test('prázdná firma = žádné řádky', fm.firmaRadky({}).length === 0, fm.firmaRadky({}).length);
test('popisky se překládají, hodnoty ne', (() => {
  const rp = fm.firmaRadky(F, t => t === 'Název firmy' ? 'Company name' : t);
  return rp[0][0] === 'Company name' && rp[0][1] === D.nazev;
})());

/* --- 7) kontrola vyplnění – NEBLOKUJE --- */
const k = fm.firmaKontrola(F);
test('výchozí údaje projdou kontrolou', k.ok && k.pocet === 0, JSON.stringify(k.chybi));
const kPrazd = fm.firmaKontrola({});
test('prázdná firma hlásí 6 chybějících', kPrazd.pocet === 6 && !kPrazd.ok, kPrazd.pocet);
test('kontrola vrací popisky, ne id', kPrazd.chybi.includes('Název firmy') && kPrazd.chybi.includes('IČO'),
  kPrazd.chybi.join('|'));
const Fbez = fm.firmaDefault(); Fbez.telefon = '   ';
test('bílé znaky se počítají jako nevyplněné', fm.firmaKontrola(Fbez).chybi.includes('Telefon'));
test('kontrola nic nevyhazuje ani pro null', typeof fm.firmaKontrola(null) === 'object');

/* --- 8) zveřejnění firemních údajů do online databáze (4. 8. 2026) ---
 * Obchodník složku _DB nemapuje, takže skutečné údaje k němu můžou přijít
 * jen ze serveru. Zveřejnit se ale smí výhradně to, co je opravdu skutečné –
 * jinak by se vzorová adresa rozeslala všem najednou místo jednomu. */
test('ukázkové údaje ze sestavení se zveřejnit nedají', (() => {
  const v = fm.firmaLzeZverejnit(fm.firmaDefault());
  return v.ok === false && /ukázkov/i.test(v.duvod);
})(), JSON.stringify(fm.firmaLzeZverejnit(fm.firmaDefault())));
const Fskut = fm.firmaDefault(); delete Fskut.ukazkove;
test('skutečné a vyplněné údaje se zveřejnit dají', fm.firmaLzeZverejnit(Fskut).ok === true,
  fm.firmaLzeZverejnit(Fskut).duvod);
const Fdira = fm.firmaDefault(); delete Fdira.ukazkove; Fdira.ico = '';
test('chybějící povinné pole zveřejnění zastaví', (() => {
  const v = fm.firmaLzeZverejnit(Fdira);
  return v.ok === false && v.duvod.includes('IČO');
})(), JSON.stringify(fm.firmaLzeZverejnit(Fdira)));
test('nic (null) se zveřejnit nedá', fm.firmaLzeZverejnit(null).ok === false);
test('kopie ke zveřejnění nenese značku ukázkových dat',
  fm.firmaKZverejneni(fm.firmaDefault()).ukazkove === undefined);
test('kopie ke zveřejnění nese všechna vyplněná pole',
  fm.firmaKZverejneni(Fskut).nazev === D.nazev && fm.firmaKZverejneni(Fskut).sidloMesto === D.sidloMesto);
test('kopie ke zveřejnění zahodí cizí klíče', (() => {
  const s = fm.firmaDefault(); s.necoCizeho = 'x'; delete s.ukazkove;
  return fm.firmaKZverejneni(s).necoCizeho === undefined;
})());
test('logo se ke zveřejnění bere s sebou', (() => {
  const s = fm.firmaDefault(); delete s.ukazkove; s.logo = 'data:image/png;base64,AAA'; s.logoNazev = 'l.png';
  const k = fm.firmaKZverejneni(s);
  return k.logo === s.logo && k.logoNazev === 'l.png';
})());
test('zveřejněná kopie projde kontrolou stejně jako originál',
  fm.firmaLzeZverejnit(fm.firmaKZverejneni(Fskut)).ok === true);
/* Past, do které jsem 4. 8. 2026 spadl: kontrola se pouštěla až na kopii,
 * a protože kopie značku neopisuje, ukázková firma jí prošla. Test to drží. */
test('kontrola na KOPII ukázkové firmy nic nepozná – proto se ptá originálu',
  fm.firmaLzeZverejnit(fm.firmaKZverejneni(fm.firmaDefault())).ok === true
  && fm.firmaLzeZverejnit(fm.firmaDefault()).ok === false);

/* --- 9) shoda s online kopií (5. 8. 2026, #142) ---
 *
 * Zadání: „Proč musím pořád zveřejňovat firemní údaje? Ty už jsem nahrál
 * a zveřejnil." Server si zveřejněnou kopii drží spolehlivě – co chybělo, byla
 * věta, která administrátorovi řekne, že online kopie je táž jako to, co má
 * v Nastavení → Firma. Panel místo toho pokaždé nabízel plné modré tlačítko
 * „Zveřejnit firemní údaje online", tedy přesně gesto, které už jednou udělal.
 *
 * Porovnává se přes firmaKZverejneni(), protože právě to server ukládá:
 * srovnávat celý NAST.firma by hlásilo rozdíl kvůli klíčům, které se nahoru
 * ani neposílají. */
const Fon = fm.firmaKZverejneni(Fskut);
test('shoda: tytéž údaje jsou shodné', (() => {
  const v = fm.firmaShodaSOnline(Fskut, Fon);
  return v.maOnline === true && v.shodne === true && v.rozdily.length === 0;
})(), JSON.stringify(fm.firmaShodaSOnline(Fskut, Fon)));
test('shoda: změna jednoho pole se pozná a pojmenuje popiskem', (() => {
  const m = fm.firmaKZverejneni(Fskut); m.telefon = '+420 999 888 777';
  const v = fm.firmaShodaSOnline(m, Fon);
  return v.shodne === false && v.rozdily.length === 1 && v.rozdily[0] === 'Telefon';
})(), JSON.stringify(fm.firmaShodaSOnline((() => { const m = fm.firmaKZverejneni(Fskut); m.telefon = 'x'; return m; })(), Fon)));
test('shoda: když online kopie není, není co srovnávat', (() => {
  const v = fm.firmaShodaSOnline(Fskut, null);
  return v.maOnline === false && v.shodne === false;
})());
/* Klíče navíc (značka `ukazkove`, nebo cokoli, co si aplikace drží u sebe)
 * nesmí dělat rozdíl – jinak by panel hlásil „liší se" hned po zveřejnění. */
test('shoda: klíče, které se nahoru neposílají, rozdíl nedělají', (() => {
  const m = fm.firmaKZverejneni(Fskut); m.necoCizeho = 'x';
  return fm.firmaShodaSOnline(m, Fon).shodne === true;
})());
/* Prázdné pole se dá zapsat jako '', undefined nebo mezera – pro člověka je to
 * pořád „nevyplněno" a rozdíl to dělat nemá. */
test('shoda: prázdno, undefined a mezera jsou totéž', (() => {
  const a = fm.firmaKZverejneni(Fskut); a.dic = '';
  const b = fm.firmaKZverejneni(Fskut); b.dic = '   ';
  const c = fm.firmaKZverejneni(Fskut); delete c.dic;
  return fm.firmaShodaSOnline(a, b).shodne === true && fm.firmaShodaSOnline(a, c).shodne === true;
})());
test('shoda: zaškrtávátko se srovnává jako ano/ne, ne jako text', (() => {
  const a = fm.firmaKZverejneni(Fskut); a.korShodna = true;
  const b = fm.firmaKZverejneni(Fskut); b.korShodna = 1;
  const c = fm.firmaKZverejneni(Fskut); delete c.korShodna;
  return fm.firmaShodaSOnline(a, b).shodne === true && fm.firmaShodaSOnline(a, c).shodne === false;
})());
test('shoda: jiné logo je rozdíl a jmenuje se Logo', (() => {
  const a = fm.firmaKZverejneni(Fskut); a.logo = 'data:image/png;base64,AAA';
  const v = fm.firmaShodaSOnline(a, Fon);
  return v.shodne === false && v.rozdily.includes('Logo');
})());
test('shoda: nic (null) na obou stranách nespadne',
  typeof fm.firmaShodaSOnline(null, null) === 'object'
  && fm.firmaShodaSOnline(null, Fon).shodne === false);
/* Značka ukázkových dat srovnání neřeší – ta se posuzuje zvlášť
 * (firmaLzeZverejnit) a panel se jí ptá první. Srovnání odpovídá na jinou
 * otázku: „je nahoře totéž, co mám tady?" */
test('shoda: značka ukázkových dat sama o sobě rozdíl nedělá',
  fm.firmaShodaSOnline(fm.firmaDefault(), Fon).shodne === true);
test('shoda: jiná firma se pozná', (() => {
  const j = fm.firmaKZverejneni(Fskut); j.nazev = 'Úplně jiná ocelárna s.r.o.';
  const v = fm.firmaShodaSOnline(j, Fon);
  return v.shodne === false && v.rozdily.includes('Název firmy');
})());

console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY FIRMA OK');
process.exit(fail ? 1 : 0);
