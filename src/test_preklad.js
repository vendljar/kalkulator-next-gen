// Testy jazykových mutací (CZ/EN/DE/FR) – slovník PREKLAD + tr().
// Spuštění: cd src && node test_preklad.js
const P = require('./preklad.js');
const TS = require('./techspec.js');

const T = [];
const ok = (name, got, want = true) => T.push([got === want ? 'OK ' : 'FAIL', name, String(got), String(want)]);
const eq = (name, got, want) => T.push([got === want ? 'OK ' : 'FAIL', name, String(got), String(want)]);

// ---- 1. základ ------------------------------------------------------------
ok('4 jazyky v nabídce', P.JAZYKY.length === 4);
ok('pořadí jazyků cz,en,de,fr', P.JAZYKY.map(j => j.kod).join(',') === 'cz,en,de,fr');
ok('slovník má aspoň 250 hesel', Object.keys(P.PREKLAD).length >= 250);

// ---- 2. překlad ze slovníku ----------------------------------------------
eq('EN sekce', P.tr('ZÁKLADNÍ PARAMETRY ŠACHTY', 'en'), 'SHAFT CORE PARAMETERS');
eq('DE sekce', P.tr('ZÁKLADNÍ PARAMETRY ŠACHTY', 'de'), 'PARAMETER DES SCHACHTGERÜSTS');
eq('EN popisek', P.tr('UMÍSTĚNÍ ŠACHTY', 'en'), 'SHAFT LOCATION');
eq('CZ vrací originál', P.tr('UMÍSTĚNÍ ŠACHTY', 'cz'), 'UMÍSTĚNÍ ŠACHTY');
eq('bez jazyka vrací originál', P.tr('UMÍSTĚNÍ ŠACHTY'), 'UMÍSTĚNÍ ŠACHTY');
eq('neznámý jazyk vrací originál', P.tr('UMÍSTĚNÍ ŠACHTY', 'xx'), 'UMÍSTĚNÍ ŠACHTY');

// normalizace klíče: mezery navíc, koncová dvojtečka, velikost písmen
eq('tolerance dvojtečky', P.tr('Číslo nabídky', 'en'), P.tr('Číslo nabídky:', 'en'));
eq('tolerance mezer', P.tr('  UMÍSTĚNÍ   ŠACHTY ', 'en'), 'SHAFT LOCATION');
ok('normalizace nezávislá na velikosti', P.prekladNorm('ABC Def') === P.prekladNorm('abc dEF'));

// ---- 3. vzory pro řetězce s čísly ----------------------------------------
eq('vzor jekl EN', P.tr('jekl 80x40', 'en'), 'SHS 80x40');
eq('vzor jekl DE', P.tr('jekl 100x60', 'de'), 'Hohlprofil 100x60');
eq('vzor cca FR', P.tr('cca 1250 mm', 'fr'), 'env. 1250 mm');
eq('vzor rozměrů EN', P.tr('šířka 1 600 × hloubka 1 400', 'en'), 'width 1 600 × depth 1 400');
eq('vzor rozměrů DE', P.tr('šířka 1 600 × hloubka 1 400', 'de'), 'Breite 1 600 × Tiefe 1 400');
ok('vzor je označen jako přeložený', P.trStav('jekl 80x40', 'en').zdroj === 'vzor');

// ---- 4. neutrální řetězce (čísla, pomlčky) --------------------------------
ok('pomlčka je neutrální', P.prekladNeutral(' -'));
ok('číslo je neutrální', P.prekladNeutral('12,5'));
ok('RAL je neutrální', P.prekladNeutral('RAL 7016'));
eq('neutrální se nemění', P.tr(' -', 'de'), ' -');
ok('neutrální se nepočítá jako chybějící', P.trStav('3 / 3', 'en').prelozeno === true);

// evidenční čísla a kódy jsou identifikátory – nepřekládají se ani se nehlásí
ok('číslo nabídky je neutrální', P.prekladNeutral('2026 - OPR - CN - '));
ok('číslo nabídky s pořadím je neutrální', P.prekladNeutral('2026-OPR-CN-9001'));
ok('kód s lomítky je neutrální', P.prekladNeutral('DPS/2026/14'));
eq('číslo nabídky se nemění', P.tr('2026 - OPR - CN - ', 'de'), '2026 - OPR - CN - ');
// … ale text zůstane textem: diakritika ani delší slova neutrální nejsou
ok('český nadpis neutrální není', !P.prekladNeutral('DODAVATEL'));
ok('nadpis s číslem neutrální není', !P.prekladNeutral('SEKCE ČÍSLO 2'));
ok('anglické slovo s číslem neutrální není', !P.prekladNeutral('SUPPLIER 2'));

// ---- 5. fallback a evidence chybějících -----------------------------------
const st = P.trStav('zcela neznámá fráze pro test', 'en');
eq('fallback vrací češtinu', st.text, 'zcela neznámá fráze pro test');
ok('fallback je označen jako nepřeložený', st.prelozeno === false);
ok('chybějící heslo se zaeviduje',
  Object.values(P.PREKLAD_CHYBI).some(x => x.cz === 'zcela neznámá fráze pro test' && x.jazyk === 'en'));

// ---- 6. údržba slovníku ---------------------------------------------------
P.prekladNastav('zcela neznámá fráze pro test', 'en', 'completely unknown test phrase');
eq('po doplnění se přeloží', P.tr('zcela neznámá fráze pro test', 'en'), 'completely unknown test phrase');
P.prekladSmaz('zcela neznámá fráze pro test');
eq('po smazání zpět fallback', P.tr('zcela neznámá fráze pro test', 'en'), 'zcela neznámá fráze pro test');

// ---- 7. export/import (konfigurace.json / N3) -----------------------------
const dump = JSON.parse(JSON.stringify(P.prekladExport()));
ok('export nese jazyky', dump.jazyky.join(',') === 'cz,en,de,fr');
ok('export nese hesla', Object.keys(dump.hesla).length === Object.keys(P.PREKLAD).length);
P.prekladNastav('TEST IMPORT', 'de', 'PŮVODNÍ');
P.prekladImport({ hesla: { 'TEST IMPORT': ['x', 'IMPORTOVÁNO', ''] } });
eq('import přepíše heslo', P.tr('TEST IMPORT', 'de'), 'IMPORTOVÁNO');
P.prekladSmaz('TEST IMPORT');

// ---- 8. pokrytí nad reálnými řetězci aplikace -----------------------------
const sekce = TS.TECHSPEC_DEF.map(s => s.sekce);
const popisky = TS.TECHSPEC_DEF.flatMap(s => s.pole.map(p => p.label));
const volby = Object.values(TS.TS_C).flat();

const pSekce = P.prekladPokryti(sekce, 'en');
eq('všech 7 sekcí má EN', pSekce.prelozeno, 7);
const pPopisky = P.prekladPokryti(popisky, 'en');
ok('EN popisky pokryty aspoň z 80 %', pPopisky.procenta >= 80);
const pVolby = P.prekladPokryti(volby, 'en');
ok('pokrytí voleb je změřené (report níže)', pVolby.celkem > 100);

// ---- 9. POJISTKA: kolize klíčů ve slovníku (A3) ----------------------------
// Vyhledávání ve slovníku je necitlivé na velikost písmen a normalizuje mezery
// i koncovou dvojtečku. Dva klíče, které se liší JEN tímhle, si tedy přepíšou
// význam – v indexu vyhraje ten pozdější a dřívější heslo tiše zmizí.
// (Přesně tak dřív „Množství“ přebilo „množství“ a rozbilo nabídku.)
const skupiny = {};
Object.keys(P.PREKLAD).forEach(k => {
  const n = P.prekladNorm(k);
  (skupiny[n] = skupiny[n] || []).push(k);
});
const kolize = Object.values(skupiny).filter(g => g.length > 1);
ok('slovník nemá kolizní klíče (velikost písmen / mezery / dvojtečka)', kolize.length === 0);
if (kolize.length) kolize.forEach(g => console.log('   KOLIZE: ' + g.map(x => JSON.stringify(x)).join('  ×  ')));

// tvar hesel: hodnota je pole [EN, DE, FR] o třech prvcích, samé řetězce
const spatnyTvar = Object.entries(P.PREKLAD).filter(([, v]) =>
  !Array.isArray(v) || v.length !== 3 || v.some(x => typeof x !== 'string'));
ok('všechna hesla mají tvar [EN, DE, FR]', spatnyTvar.length === 0);
if (spatnyTvar.length) console.log('   ŠPATNÝ TVAR: ' + spatnyTvar.slice(0, 5).map(x => x[0]).join(', '));

// heslo bez jediného překladu je zbytečné – buď se doplní, nebo smaže
const prazdna = Object.entries(P.PREKLAD).filter(([, v]) => Array.isArray(v) && v.every(x => !String(x).trim()));
ok('slovník neobsahuje zcela prázdná hesla', prazdna.length === 0);
if (prazdna.length) console.log('   PRÁZDNÁ: ' + prazdna.slice(0, 10).map(x => x[0]).join(', '));

// klíč nesmí být prázdný ani mít přebytečné okraje
const spatnyKlic = Object.keys(P.PREKLAD).filter(k => !k.trim() || k !== k.trim());
ok('klíče nemají přebytečné mezery', spatnyKlic.length === 0);
if (spatnyKlic.length) console.log('   ŠPATNÝ KLÍČ: ' + spatnyKlic.map(x => JSON.stringify(x)).join(', '));

// ---- 10. POJISTKA: pokrytí specifikace 100 % v EN/DE/FR (A3) ---------------
// Technická specifikace je to, co se tiskne zákazníkovi. Nesmí v ní zůstat
// čeština ani v jedné mutaci – tenhle test hlídá, že to tak zůstane.
const CILE = { sekce, popisky, volby };
for (const lang of ['en', 'de', 'fr']) {
  Object.entries(CILE).forEach(([nazev, seznam]) => {
    const c = P.prekladPokryti(seznam, lang);
    ok(`pokrytí ${lang.toUpperCase()} – ${nazev} 100 % (${c.prelozeno}/${c.celkem})`, c.chybi.length === 0);
    if (c.chybi.length) console.log('   CHYBÍ ' + lang.toUpperCase() + ': '
      + c.chybi.slice(0, 12).map(x => JSON.stringify(x)).join(', ')
      + (c.chybi.length > 12 ? ` … (+${c.chybi.length - 12})` : ''));
  });
}

// ---- 11. POJISTKA: hlášky kontroly vyplnění (TS-1) ve všech mutacích -------
// Upozornění se ukazuje i v cizojazyčném náhledu dokumentu, takže musí být
// přeložené – jinak by zákazník viděl české hlášky v anglické specifikaci.
const TS1 = ['Kontrola vyplnění', 'Všechna povinná pole jsou vyplněna.', 'Nevyplněná povinná pole',
  'Upozornění nic neblokuje – dokument lze vytisknout i takto.', 'nevyplněno', 'HLAVIČKA DOKUMENTU'];
for (const lang of ['en', 'de', 'fr']) {
  const c = P.prekladPokryti(TS1, lang);
  ok(`hlášky kontrole vyplnění (TS-1) mají ${lang.toUpperCase()} (${c.prelozeno}/${c.celkem})`, c.chybi.length === 0);
  if (c.chybi.length) console.log('   CHYBÍ ' + lang.toUpperCase() + ': ' + c.chybi.join(', '));
}
// povinné položky se v cizojazyčném náhledu vypisují popiskem – ty už kryje sekce 10

let fail = 0;
for (const [st2, name, got, want] of T) {
  if (st2 === 'FAIL') fail++;
  console.log(`${st2} ${name}: ${got}${st2 === 'FAIL' ? ` (očekáváno ${want})` : ''}`);
}

console.log('\n--- POKRYTÍ SLOVNÍKU ---');
for (const lang of ['en', 'de', 'fr']) {
  const s = P.prekladPokryti(sekce, lang), l = P.prekladPokryti(popisky, lang), v = P.prekladPokryti(volby, lang);
  console.log(`${lang.toUpperCase()}  sekce ${s.prelozeno}/${s.celkem}` +
    `  popisky ${l.prelozeno}/${l.celkem} (${l.procenta} %)` +
    `  volby ${v.prelozeno}/${v.celkem} (${v.procenta} %)`);
}

console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY PŘEKLAD OK');
process.exit(fail ? 1 : 0);
