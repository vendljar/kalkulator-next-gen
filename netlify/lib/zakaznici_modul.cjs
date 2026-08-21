/* ============================================================
 * MODUL ZÁKAZNÍKŮ PRO SERVER (21. 8. 2026)
 *
 * PROČ NESTAČÍ `jadro_moduly.cjs`
 * Nález J. V. 21. 8. 2026: „karta zákazníci se poprvé načítá dlouho."
 * Funkce /api/zakaznici si přes `jadro()` tahala CELÉ jádro — engine,
 * engine_proj, preklad (110 kB), docxgen, zakázky, ceníky, třicet souborů —
 * jen kvůli třem funkcím ze `src/zakaznici.js`, které nemají jedinou
 * závislost. Při studeném startu instance to jsou vteřiny čekání u prázdného
 * seznamu.
 *
 * PROČ VLASTNÍ SOUBOR A NE `createRequire` PŘÍMO VE FUNKCI
 * Bundler Netlify (esbuild) umí vystopovat jen `require` jako SKUTEČNÝ
 * příkaz CommonJS s doslovnou cestou. Vzor
 *     const require = createRequire(import.meta.url); require('../../src/x.js')
 * je pro něj obyčejná proměnná — zdroják se do balíčku nedostane a funkce
 * spadne v nasazení na holou 502 (přesně tohle se stalo 4. 8. 2026, viz
 * rozbor v jadro_moduly.cjs). Kontrola v `netlify/test_funkce.mjs` proto
 * `createRequire` v obsluze zakazuje. Tenhle soubor je .cjs, takže tu je
 * `require` doopravdy příkaz a bundler cestu najde.
 * ============================================================ */
module.exports = require('../../src/zakaznici.js');
