/* Test: centrální šablony dokumentů (#139, 13. 8. 2026)
 *
 * Šablony cenových nabídek se do 13. 8. 2026 nahrávaly ručně do každé relace
 * a po zavření okna zmizely (SET-6 „zatím platí pro relaci"). Horší důsledek:
 * každý obchodník mohl tisknout z jiného souboru a nikdo neměl jak poznat,
 * že nabídka odešla ze staré verze šablony.
 *
 * Nově šablony bydlí na serveru vedle platného ceníku a řídí se stejnými
 * pravidly: zveřejnit smí jen administrátor, verze se číslují, historie se
 * drží a každá verze nese otisk, jméno a datum. Tahle sada testuje rejstřík —
 * čistou logiku bez serveru — přesně jako test_program.js testuje ceník.
 */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./sablony_online.js');

let fails = 0, passes = 0;
function test(name, cond, info) {
  if (cond) { passes++; console.log('  ok  ' + name); }
  else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
}

/* base64 začátek skutečného .docx (ZIP: PK\x03\x04) a ne-docx pro kontrolu */
const DOCX_B64 = 'UEsDBBQABgAIAAAAIQ' + 'A'.repeat(64);
const NE_DOCX_B64 = 'JVBERi0xLjQK' + 'A'.repeat(64);   // %PDF-1.4

// ---- typy ------------------------------------------------------------------
test('nabidka je platný typ', sablonaTypPlatny('nabidka'));
test('nabidkaProj je platný typ', sablonaTypPlatny('nabidkaProj'));
test('sod je platný typ', sablonaTypPlatny('sod'));
/* SoD projekčních prací a plná moc (#142, 13. 8. 2026) — šablony smluv se
 * řídí centrálně stejně jako nabídky; kdo by tiskl smlouvu ze staré verze,
 * poslal by zákazníkovi jiné znění, než které prošlo právníkem. */
test('sodProj je platný typ', sablonaTypPlatny('sodProj'));
test('plnaMoc je platný typ', sablonaTypPlatny('plnaMoc'));
test('mutace sodProj_en je platný typ', sablonaTypPlatny('sodProj_en'));
test('jazyková mutace nabidka_en je platný typ', sablonaTypPlatny('nabidka_en'));
test('jazyková mutace nabidkaProj_de je platný typ', sablonaTypPlatny('nabidkaProj_de'));
test('vymyšlený typ neprojde', !sablonaTypPlatny('faktura'));
test('mutace neznámého jazyka neprojde', !sablonaTypPlatny('nabidka_xx'));
test('prázdný typ neprojde', !sablonaTypPlatny('') && !sablonaTypPlatny(null));
/* Klíč typu jde do klíče úložiště — nesmí v něm být nic, co by cestu rozbilo. */
test('typ s lomítkem neprojde', !sablonaTypPlatny('nabidka/../ceniky'));

// ---- rozpoznání .docx ------------------------------------------------------
/* Word soubor je ZIP a base64 ZIPu začíná „UEsDB". Cokoli jiného se odmítne
 * při zveřejnění — nahrát omylem PDF by znamenalo, že generování spadne až
 * obchodníkovi při tisku, tedy v nejhorší možné chvíli. */
test('docx (ZIP) projde kontrolou', sablonaJeDocxB64(DOCX_B64));
test('PDF kontrolou neprojde', !sablonaJeDocxB64(NE_DOCX_B64));
test('prázdno kontrolou neprojde', !sablonaJeDocxB64('') && !sablonaJeDocxB64(null));

// ---- otisk -----------------------------------------------------------------
test('otisk je deterministický', sablonaOtisk(DOCX_B64) === sablonaOtisk(DOCX_B64));
test('jiná data mají jiný otisk', sablonaOtisk(DOCX_B64) !== sablonaOtisk(DOCX_B64 + 'B'));
test('otisk je krátký hex', /^[0-9a-f]{8,16}$/.test(sablonaOtisk(DOCX_B64)), sablonaOtisk(DOCX_B64));

// ---- rejstřík a zveřejňování ----------------------------------------------
let rej = sablonyNovyRejstrik();
test('nový rejstřík začíná v přísném režimu', rej.rezim === 'prisny', rej.rezim);
test('nový rejstřík nemá žádnou platnou šablonu', sablonaPlatna(rej, 'nabidka') === null);

rej = sablonyZverejni(rej, { typ: 'nabidka', nazev: 'Sablona_NABIDKA_CN_v8.docx',
  velikost: 81828, otisk: sablonaOtisk(DOCX_B64), kdo: 'admin@priklad.cz',
  poznamka: 'první verze', kdy: '2026-08-13T10:00:00Z' });
const p1 = sablonaPlatna(rej, 'nabidka');
test('zveřejněná šablona je platná verzí 1', p1 && p1.verze === 1, p1);
test('platná verze nese jméno souboru', p1.nazev === 'Sablona_NABIDKA_CN_v8.docx');
test('platná verze nese, kdo ji zveřejnil', p1.zverejnil === 'admin@priklad.cz');
test('platná verze nese datum', p1.kdy === '2026-08-13T10:00:00Z');
test('platná verze nese otisk', p1.otisk === sablonaOtisk(DOCX_B64));
test('jiné typy zveřejněním nedotčeny', sablonaPlatna(rej, 'nabidkaProj') === null);

rej = sablonyZverejni(rej, { typ: 'nabidka', nazev: 'Sablona_NABIDKA_CN_v9.docx',
  velikost: 90000, otisk: 'ffff0000', kdo: 'admin@priklad.cz', kdy: '2026-08-14T08:00:00Z' });
const p2 = sablonaPlatna(rej, 'nabidka');
test('druhé zveřejnění zvedne verzi na 2', p2.verze === 2, p2.verze);
test('historie drží předchozí verzi', rej.typy.nabidka.historie.length === 1
  && rej.typy.nabidka.historie[0].verze === 1, rej.typy.nabidka.historie);
/* Verze v historii je jen metadata — soubor leží zvlášť pod svým klíčem,
 * takže rejstřík zůstává malý i po letech zveřejňování. */
test('historie nenese data souboru', !('data' in rej.typy.nabidka.historie[0]));

rej = sablonyZverejni(rej, { typ: 'nabidkaProj', nazev: 'Sablona_NABIDKA_PROJ.docx',
  velikost: 561972, otisk: 'abcd1234', kdo: 'admin@priklad.cz', kdy: '2026-08-14T09:00:00Z' });
test('každý typ má vlastní řadu verzí (PROJ začíná od 1)',
  sablonaPlatna(rej, 'nabidkaProj').verze === 1);
test('verze nabídky OCK se zveřejněním PROJ nezměnila',
  sablonaPlatna(rej, 'nabidka').verze === 2);

// ---- klíč souboru v úložišti ----------------------------------------------
test('klíč souboru se skládá z typu a verze',
  sablonaKlicSouboru('nabidka', 2) === 'data/nabidka/2', sablonaKlicSouboru('nabidka', 2));

// ---- režim: přísný / měkký -------------------------------------------------
/* Přísný režim = bez serverové šablony dokument nevznikne (jako u ceníku).
 * Měkký je vědomá výjimka pro výpadek: administrátor ho zapne, ale rejstřík
 * si pamatuje kdo a kdy — v protokolu pak nejde zapřít, že se tisklo mimo. */
rej = sablonyRezimNastav(rej, 'mekky', 'admin@priklad.cz', '2026-08-14T10:00:00Z');
test('administrátor přepne do měkkého režimu', rej.rezim === 'mekky');
test('přepnutí režimu se podepisuje', rej.rezimZmenil === 'admin@priklad.cz'
  && rej.rezimKdy === '2026-08-14T10:00:00Z');
rej = sablonyRezimNastav(rej, 'prisny', 'admin@priklad.cz', '2026-08-14T11:00:00Z');
test('a zpět do přísného', rej.rezim === 'prisny');
test('neznámý režim se odmítne (vrací se beze změny)',
  sablonyRezimNastav(rej, 'vypnuto', 'x', 'y').rezim === 'prisny');

// ---- vstupy, kterým nejde věřit -------------------------------------------
test('zveřejnění s neplatným typem vrátí null',
  sablonyZverejni(rej, { typ: 'faktura', nazev: 'x', otisk: 'a', kdo: 'x', kdy: 'x' }) === null);
test('zveřejnění bez názvu vrátí null',
  sablonyZverejni(rej, { typ: 'nabidka', nazev: '', otisk: 'a', kdo: 'x', kdy: 'x' }) === null);
test('rejstřík se vstupem nezměnil (zůstává verze 2)',
  sablonaPlatna(rej, 'nabidka').verze === 2);
test('sablonaPlatna snese chybějící rejstřík', sablonaPlatna(null, 'nabidka') === null);

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
