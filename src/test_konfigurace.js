/* Testy trvalé konfigurace (N3 / SET-2): export a import konfigurace.json.
   Spuštění: cd src && node test_konfigurace.js */
const P = require('./preklad.js');
global.tr = P.tr; global.trStav = P.trStav;
global.prekladExport = P.prekladExport; global.prekladImport = P.prekladImport;
global.PREKLAD = P.PREKLAD; global.PREKLAD_IDX = P.PREKLAD_IDX;

const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.TS_C = tsm.TS_C; global.tsHodnota = tsm.tsHodnota;
const kat = require('./katalog.js');
global.katalogExport = kat.katalogExport; global.katalogImport = kat.katalogImport;
global.katalogPocet = kat.katalogPocet; global.KATALOG_SEKCE = kat.KATALOG_SEKCE;

const K = require('./konfigurace.js');
const { konfiguraceExport, konfiguraceImport, konfiguracePopis, konfiguraceNazevSouboru,
  konfigNahradVMiste, KONFIG_SEKCE, KONFIG_VERZE } = K;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

/* --- pomocné: čerstvý kontext podobný běhu v prohlížeči --- */
function novyNast() {
  return {
    jeAdmin: true,
    panel: 'obecne',
    tabViditelnost: { kalk: true, detail: true, spec: true, zakazka: true },
    zobrazitNaklady: true,
    kpiViditelne: { naklad: false, hrubyZisk: false, sleva: false, marze: false },
    jazyk: 'cz',
    role: ['Obchodník', 'Jednatel'],
    uzivatele: [{ jmeno: 'Vzorový obchodník', email: 'a@b.cz', role: 'Obchodník', aktivni: true }],
    slevy: { minMarze: 0.10, stropy: { 'Obchodník': 0.05, 'Jednatel': 1 }, schemata: [{ nazev: 'Standardní', typ: 'percentage', popis: '' }] },
  };
}
// ---- 1. EXPORT: struktura a hlavička --------------------------------------
const NAST = novyNast();
const KATALOG = kat.katalogPrazdny();
kat.katalogPridej(KATALOG, kat.KATALOG_SEKCE[0], { nazev: 'Trvalá položka', mnozstvi: 2, cena: 1500, jednotka: 'ks' });
const SABLONY = { nabidka: { nazev: 'Sablona_NABIDKA_CN_v3.docx', data: new ArrayBuffer(8) },
  nabidka_en: { nazev: 'Sablona_NABIDKA_CN_v3_EN.docx', data: new ArrayBuffer(8) } };
const ctx = { NAST, TS_C: tsm.TS_C, TECHSPEC_DEF: tsm.TECHSPEC_DEF, KATALOG, SABLONY, build: 'v26.7.5', datum: '2026-07-26' };

const exp = konfiguraceExport(ctx);
test('export nese identifikaci aplikace a verzi', exp.aplikace === 'Kalkulátor OCK' && exp.verze === KONFIG_VERZE);
test('export nese build a datum', exp.build === 'v26.7.5' && exp.vytvoreno === '2026-07-26');
test('export obsahuje všech 5 sekcí', KONFIG_SEKCE.every(s => exp[s.kod] !== undefined),
  KONFIG_SEKCE.filter(s => exp[s.kod] === undefined).map(s => s.kod).join(','));
test('nastavení neobsahuje jeAdmin (bezpečnost)', exp.nastaveni.jeAdmin === undefined);
test('nastavení neobsahuje stav relace panel', exp.nastaveni.panel === undefined);
test('nastavení nese uživatele a slevy', exp.nastaveni.uzivatele.length === 1 && exp.nastaveni.slevy.minMarze === 0.10);
test('specifikace nese číselníky i výchozí hodnoty',
  Object.keys(exp.specifikace.ciselniky).length > 5 && Object.keys(exp.specifikace.vychozi).length > 5,
  Object.keys(exp.specifikace.ciselniky).length + '/' + Object.keys(exp.specifikace.vychozi).length);
test('katalog nese vloženou položku', kat.katalogPocet(KATALOG) === 1 && JSON.stringify(exp.katalog).includes('Trvalá položka'));
test('slovník nese hesla', Object.keys(exp.slovnik.hesla).length > 50, Object.keys(exp.slovnik.hesla).length);
test('šablony nesou jen názvy, ne binární data',
  exp.sablony.nabidka.nazev === 'Sablona_NABIDKA_CN_v3.docx' && exp.sablony.nabidka.data === undefined);
test('export je serializovatelný do JSON', typeof JSON.stringify(exp) === 'string' && JSON.stringify(exp).length > 500);

// ---- 2. EXPORT: výběrové volby --------------------------------------------
const expJenKatalog = konfiguraceExport(ctx, { katalog: true });
test('volby omezí export na vybrané sekce',
  expJenKatalog.katalog !== undefined && expJenKatalog.nastaveni === undefined
  && expJenKatalog.slovnik === undefined && expJenKatalog.specifikace === undefined);

// ---- 3. IMPORT: kolečko export → změna → import ----------------------------
const NAST2 = novyNast();
NAST2.uzivatele.push({ jmeno: 'Druhý', email: 'c@d.cz', role: 'Jednatel', aktivni: false });
NAST2.slevy.minMarze = 0.15;
NAST2.zobrazitNaklady = false;
NAST2.jazyk = 'de';
const exp2 = konfiguraceExport({ NAST: NAST2 }, { nastaveni: true });

const cil = novyNast();
const refUziv = cil.uzivatele, refSlevy = cil.slevy, refTab = cil.tabViditelnost;
const vysl = konfiguraceImport(exp2, { NAST: cil });
test('import vrátil seznam změn', Array.isArray(vysl.zmeneno) && vysl.zmeneno.length === 1, JSON.stringify(vysl));
test('import přenesl uživatele', cil.uzivatele.length === 2 && cil.uzivatele[1].jmeno === 'Druhý');
test('import přenesl slevový strop', cil.slevy.minMarze === 0.15);
test('import přenesl skalární hodnoty', cil.zobrazitNaklady === false && cil.jazyk === 'de');
test('import zachoval reference objektů (mění na místě)',
  cil.uzivatele === refUziv && cil.slevy === refSlevy && cil.tabViditelnost === refTab);
test('import NEPŘEPSAL roli administrátora', cil.jeAdmin === true);
test('import nezměnil stav relace panel', cil.panel === 'obecne');

// ---- 4. IMPORT: hluboká kopie, ne sdílená reference ------------------------
exp2.nastaveni.uzivatele[0].jmeno = 'ZMĚNĚNO PO IMPORTU';
test('importovaná data jsou kopie, ne sdílené reference', cil.uzivatele[0].jmeno !== 'ZMĚNĚNO PO IMPORTU',
  cil.uzivatele[0].jmeno);

// ---- 5. IMPORT: specifikace mění TS_C na místě -----------------------------
const TS_C_ref = tsm.TS_C.umisteniSachty;
const puvodniDelka = TS_C_ref.length;
const expSpec = {
  aplikace: 'Kalkulátor OCK', verze: 1,
  specifikace: { ciselniky: { umisteniSachty: ['v exteriéru', 'v interiéru', 'NOVÁ VOLBA'], zcelaNovy: ['a', 'b'] },
    vychozi: { umisteni: 'v interiéru', neexistujiciPole: 'x' } },
};
const v5 = konfiguraceImport(expSpec, { TS_C: tsm.TS_C, TECHSPEC_DEF: tsm.TECHSPEC_DEF });
test('číselník se změnil NA MÍSTĚ (reference platí)', tsm.TS_C.umisteniSachty === TS_C_ref);
test('číselník má nový obsah', TS_C_ref.length === 3 && TS_C_ref[2] === 'NOVÁ VOLBA', TS_C_ref.join('|'));
test('pole specifikace vidí změnu číselníku přes referenci',
  tsm.TECHSPEC_DEF.some(s => s.pole.some(p => p.id === 'umisteni' && p.ciselnik === TS_C_ref)));
test('nový číselník se přidal', Array.isArray(tsm.TS_C.zcelaNovy) && tsm.TS_C.zcelaNovy.length === 2);
test('výchozí hodnota pole se změnila',
  tsm.TECHSPEC_DEF.some(s => s.pole.some(p => p.id === 'umisteni' && p.def === 'v interiéru')));
test('neznámé pole specifikace je jen varování, ne chyba',
  v5.varovani.some(t => /neexistujiciPole/.test(t)), JSON.stringify(v5.varovani));
// vrátit číselník do původního stavu, ať neovlivníme další testy
konfigNahradVMiste(TS_C_ref, tsm.TS_C_ORIG ? tsm.TS_C_ORIG.umisteniSachty : ['v exteriéru', 'v interiéru']);
delete tsm.TS_C.zcelaNovy;
test('číselník se vrátil do výchozí délky', TS_C_ref.length === puvodniDelka || puvodniDelka === 3);

// ---- 6. IMPORT: katalog ----------------------------------------------------
const KAT2 = kat.katalogPrazdny();
const refPolozky = KAT2.polozky;
const expKat = { aplikace: 'Kalkulátor OCK', verze: 1, katalog: kat.katalogExport(KATALOG) };
const v6 = konfiguraceImport(expKat, { KATALOG: KAT2 });
test('katalog se importoval', kat.katalogPocet(KAT2) === 1,
  kat.katalogPocet(KAT2) + ' / ' + JSON.stringify(v6));
test('import katalogu hlásí počet položek', /1 položek/.test(v6.zmeneno.join('|')), v6.zmeneno.join('|'));

// ---- 7. IMPORT: slovník ----------------------------------------------------
const expSlov = { aplikace: 'Kalkulátor OCK', verze: 1,
  slovnik: { verze: 1, hesla: { 'zkušební heslo n3': ['n3 test term', 'n3 Testbegriff', 'terme n3'] } } };
const v7 = konfiguraceImport(expSlov, {});
test('slovník se importoval', P.tr('zkušební heslo n3', 'en') === 'n3 test term', P.tr('zkušební heslo n3', 'en'));
test('import slovníku hlásí počet hesel', /1 hesel/.test(v7.zmeneno.join('|')), v7.zmeneno.join('|'));
P.prekladSmaz('zkušební heslo n3');

// ---- 8. IMPORT: šablony jen jako varování -----------------------------------
const v8 = konfiguraceImport({ aplikace: 'Kalkulátor OCK', verze: 1,
  sablony: { nabidka: { nazev: 'Sablona_NABIDKA_CN_v3.docx' } } }, {});
test('šablony se hlásí jen jako varování k opětovnému nahrání',
  !v8.zmeneno.length && v8.varovani.some(t => /Sablona_NABIDKA_CN_v3\.docx/.test(t)), JSON.stringify(v8));

// ---- 9. IMPORT: výběrové volby ----------------------------------------------
const cil9 = novyNast();
const KAT9 = kat.katalogPrazdny();
const v9 = konfiguraceImport(konfiguraceExport(ctx), { NAST: cil9, KATALOG: KAT9 }, { katalog: true });
test('volby omezí import – katalog ano', kat.katalogPocet(KAT9) === 1);
test('volby omezí import – nastavení ne', cil9.uzivatele.length === 1 && cil9.uzivatele[0].jmeno === 'Vzorový obchodník');

// ---- 10. IMPORT: odmítnutí nevalidních souborů -------------------------------
const chyba = f => { try { f(); return ''; } catch (e) { return e.message; } };
test('odmítne nesmyslný text', /JSON/.test(chyba(() => konfiguraceImport('tohle není json', {}))));
test('odmítne pole místo objektu', /objekt/.test(chyba(() => konfiguraceImport([1, 2, 3], {}))));
test('odmítne soubor jiné aplikace',
  /jiné aplikaci/.test(chyba(() => konfiguraceImport({ aplikace: 'Excel', nastaveni: {} }, {}))));
test('odmítne novější verzi souboru',
  /novější/.test(chyba(() => konfiguraceImport({ aplikace: 'Kalkulátor OCK', verze: 99, nastaveni: {} }, {}))));
test('odmítne soubor bez známé sekce',
  /žádnou známou sekci/.test(chyba(() => konfiguraceImport({ aplikace: 'Kalkulátor OCK', verze: 1, neco: 1 }, {}))));
test('přijme JSON jako řetězec',
  konfiguraceImport(JSON.stringify(konfiguraceExport({ NAST: novyNast() }, { nastaveni: true })),
    { NAST: novyNast() }).zmeneno.length === 1);

// ---- 11. POPIS pro potvrzovací dialog ----------------------------------------
const popis = konfiguracePopis(exp);
test('popis má řádek pro každou sekci', popis.length === KONFIG_SEKCE.length, JSON.stringify(popis));
test('popis uvádí počty', popis.every(r => /\d/.test(r.text)), JSON.stringify(popis));
test('popis prázdného souboru je prázdný', konfiguracePopis(null).length === 0);

// ---- 12. NÁZEV SOUBORU --------------------------------------------------------
test('název souboru nese build', konfiguraceNazevSouboru('v26.7.5') === 'konfigurace_v26.7.5.json',
  konfiguraceNazevSouboru('v26.7.5'));
test('název souboru bez buildu', konfiguraceNazevSouboru('') === 'konfigurace.json');

// ---- 13. Kolečko export → import → export je stabilní --------------------------
const A = konfiguraceExport(ctx, { nastaveni: true, katalog: true });
const cilN = novyNast(), cilK = kat.katalogPrazdny();
konfiguraceImport(JSON.parse(JSON.stringify(A)), { NAST: cilN, KATALOG: cilK });
const B = konfiguraceExport({ NAST: cilN, KATALOG: cilK, build: ctx.build, datum: ctx.datum },
  { nastaveni: true, katalog: true });
test('roundtrip export→import→export dá stejný obsah',
  JSON.stringify(A.nastaveni) === JSON.stringify(B.nastaveni) && JSON.stringify(A.katalog) === JSON.stringify(B.katalog),
  JSON.stringify(A.nastaveni) + '\n' + JSON.stringify(B.nastaveni));

/* migrace rolí při importu konfigurace (zjednodušení 2. 8. 2026) */
{
  const sl2 = require('./sleva.js');
  global.roleMigruj = sl2.roleMigruj; global.roleMigrujSeznam = sl2.roleMigrujSeznam;
  global.stropyMigruj = sl2.stropyMigruj;
  const NAST2 = { role: [], uzivatele: [], slevy: { stropy: {} } };
  konfiguraceImport({ verze: 1, aplikace: 'Kalkulátor OCK', nastaveni: {
    role: ['Obchodník', 'Vedoucí obchodu', 'Obchodní ředitel', 'Jednatel'],
    uzivatele: [{ jmeno: 'X', role: 'Obchodní ředitel' }],
    slevy: { stropy: { 'Vedoucí obchodu': 0.10, 'Obchodní ředitel': 0.15, 'Jednatel': 1 } },
  } }, { NAST: NAST2 }, { nastaveni: true });
  test('import konfigurace převede role na tři',
    NAST2.role.join('|') === 'Obchodník|Vedoucí|Administrátor', NAST2.role.join('|'));
  test('import převede roli uživatele', NAST2.uzivatele[0].role === 'Vedoucí');
  test('import sloučí stropy na vyšší hodnotu',
    NAST2.slevy.stropy['Vedoucí'] === 0.15 && NAST2.slevy.stropy['Administrátor'] === 1,
    JSON.stringify(NAST2.slevy.stropy));
}

/* ---- 14. Starší konfigurace nesmí umazat klíč, který tehdy neexistoval ------
 *
 * Proč to vzniklo (5. 8. 2026, hlášení „nevidím záložku schvalování slev"):
 * konfigNahradVMiste() nahrazuje obsah objektu CELÝ – nejdřív smaže všechny
 * klíče cíle a pak nasype klíče zdroje. Pro pole hodnot je to správně (jinak
 * by šlo z nastavení jen přidávat, ne ubírat), ale u struktur typu
 * `tabViditelnost` to znamená, že konfigurace uložená před vznikem záložky
 * „Schvalování slev" tuhle záložku po importu SMAŽE. Nikoli nastaví na false –
 * úplně odstraní, a tabViditelny() pak vrací false. Uživateli záložka zmizí
 * a v konzoli není ani řádek. Totéž potká každý budoucí nový přepínač.
 *
 * Léčba: po importu se CHYBĚJÍCÍ klíče doplní z výchozí struktury aplikace.
 * Doplňuje se jen to, co v souboru vůbec není – vypnuté zůstane vypnuté,
 * jinak by administrátor nemohl nic schovat. A doplňuje se jen u struktur,
 * kde má „chybí = ještě neexistovalo" smysl (viz KONFIG_DOPLNIT_KLICE);
 * firemní údaje ne, tam by se výchozími hodnotami vrátila ukázková firma. */
{
  const vzor = {
    tabViditelnost: { kalk: true, detail: true, spec: true, zakazka: true, schvalovani: true },
    kpiViditelne: { naklad: false, hrubyZisk: false, sleva: false, marze: false, novy: true },
    zobrazeni: { 'sloupce.naklad': ['Administrátor'], 'novy.prvek': ['Vedoucí'] },
    firma: { nazev: 'Ukázková firma s.r.o.', ico: '00000000', web: 'priklad.cz' },
  };
  const stara = {
    verze: 1, aplikace: 'Kalkulátor OCK',
    nastaveni: {
      /* konfigurace z v5.8.7 – schvalovani ještě neexistovalo */
      tabViditelnost: { kalk: true, detail: false, spec: true, zakazka: true },
      kpiViditelne: { naklad: true, hrubyZisk: false, sleva: false, marze: false },
      zobrazeni: { 'sloupce.naklad': ['Administrátor'] },
      firma: { nazev: 'ENGINEERS CZ s.r.o.', ico: '24127663' },
    },
  };
  const N = novyNast();
  N.zobrazeni = { 'sloupce.naklad': ['Administrátor'], 'novy.prvek': ['Vedoucí'] };
  N.firma = { nazev: 'Ukázková firma s.r.o.', ico: '00000000', web: 'priklad.cz' };
  const vysl = konfiguraceImport(JSON.parse(JSON.stringify(stara)),
    { NAST: N, NASTVychozi: vzor }, { nastaveni: true });

  test('import staré konfigurace nesmaže záložku, která tehdy neexistovala',
    N.tabViditelnost.schvalovani === true, JSON.stringify(N.tabViditelnost));
  test('vypnutá záložka zůstane vypnutá (doplňuje se jen chybějící)',
    N.tabViditelnost.detail === false, JSON.stringify(N.tabViditelnost));
  test('zapnutá hodnota ze souboru se doplňováním nepřepíše',
    N.kpiViditelne.naklad === true, JSON.stringify(N.kpiViditelne));
  test('chybějící klíč KPI se doplní z výchozí struktury',
    N.kpiViditelne.novy === true, JSON.stringify(N.kpiViditelne));
  test('chybějící prvek matice zobrazení se doplní',
    JSON.stringify(N.zobrazeni['novy.prvek']) === '["Vedoucí"]', JSON.stringify(N.zobrazeni));
  test('firemní údaje se NEdoplňují (nevrátila by se ukázková firma)',
    N.firma.web === undefined && N.firma.nazev === 'ENGINEERS CZ s.r.o.', JSON.stringify(N.firma));
  test('import o doplnění zpraví ve varováních',
    vysl.varovani.some(v => /schvalovani/.test(v)), JSON.stringify(vysl.varovani));

  /* bez výchozí struktury se nesmí nic pokazit – Node testy jiných modulů
   * ji nepředávají a aplikace musí zvládnout i takový import */
  const N2 = novyNast();
  konfiguraceImport(JSON.parse(JSON.stringify(stara)), { NAST: N2 }, { nastaveni: true });
  test('import bez znalosti výchozí struktury projde bez výjimky',
    N2.tabViditelnost.kalk === true, JSON.stringify(N2.tabViditelnost));
}

/* ---- 15. konfigDoplnChybejici – samostatně ----------------------------------
 * Pomocná funkce se používá i jinde než v importu (matice zobrazení ze
 * serveru chodí stejně stará jako konfigurace), proto má vlastní testy. */
{
  const { konfigDoplnChybejici } = K;
  const cil = { a: 1, vnoreno: { x: 1 } };
  const dop = konfigDoplnChybejici(cil, { a: 9, b: 2, vnoreno: { x: 9, y: 5 } });
  test('doplní jen chybějící klíče', cil.a === 1 && cil.b === 2, JSON.stringify(cil));
  test('doplní i ve vnořeném objektu', cil.vnoreno.x === 1 && cil.vnoreno.y === 5, JSON.stringify(cil));
  test('vrátí seznam doplněných klíčů s tečkovou cestou',
    dop.sort().join(',') === 'b,vnoreno.y', dop.join(','));
  test('hodnota false se nepovažuje za chybějící',
    (() => { const c = { v: false }; konfigDoplnChybejici(c, { v: true }); return c.v === false; })());
  test('null místo objektu nic nerozbije',
    konfigDoplnChybejici(null, { a: 1 }).length === 0 && konfigDoplnChybejici({}, null).length === 0);
  test('pole se nedoplňují po prvcích (nahrazují se celá)',
    (() => { const c = { s: ['a'] }; const d = konfigDoplnChybejici(c, { s: ['a', 'b'] });
      return c.s.length === 1 && d.length === 0; })());
  test('doplněná hodnota je kopie, ne sdílená reference',
    (() => { const vz = { o: { k: 1 } }; const c = {};
      konfigDoplnChybejici(c, vz); c.o.k = 2; return vz.o.k === 1; })());
}

console.log(fail ? `\n${fail} CHYB (${ok} OK)` : `\nVŠECHNY TESTY KONFIGURACE OK (${ok})`);
process.exit(fail ? 1 : 0);
