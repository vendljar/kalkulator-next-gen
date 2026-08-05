/* ============================================================
 * JÁDRO APLIKACE PRO SERVER (4. 8. 2026)
 *
 * Serverové funkce počítají a migrují zakázky STEJNÝM kódem, jaký běží
 * v prohlížeči – jinak by se obě strany časem rozešly a nabídka spočítaná
 * na serveru by nesouhlasila s tou na obrazovce. Moduly v `src/` jsou psané
 * pro prohlížeč: nemají importy, mluví spolu přes globální jména a build.py
 * je prostě slepí za sebe. V Node se tedy musí naskládat do `globalThis`
 * ručně a ve STEJNÉM POŘADÍ, v jakém je slepuje build.py (seznam CORE).
 *
 * PROČ JE TENHLE SOUBOR CommonJS (.cjs) A PROČ JE JEDINÝ
 * Do 4. 8. 2026 si každá funkce natahovala zdrojáky sama vzorem
 *
 *     const require = createRequire(import.meta.url);
 *     Object.assign(globalThis, require('../../src/engine.js'));
 *
 * V Node to funguje. Netlify ale funkci před nasazením zabalí (esbuild) do
 * jediného souboru a přibalí jen to, co dokáže v kódu vystopovat – a `require`
 * z createRequire je pro bundler obyčejná proměnná, ne příkaz. Zdrojáky se
 * do balíčku nedostaly, funkce spadla hned při načtení a Netlify odpovědělo
 * holou chybou 502 („Neuloženo online: server odpověděl 502"). Padaly tak
 * /api/zakazky, /api/program, /api/firma i /api/vypocet, zatímco zálohy a účty,
 * které zdrojáky nepotřebují, běžely dál – proto to zvenčí vypadalo, že
 * „databáze funguje, jen ukládání ne".
 *
 * V souboru .cjs je `require` skutečný příkaz CommonJS s doslovnou cestou.
 * Bundler ho vystopuje a zdrojáky do balíčku vezme; kdyby Netlify někdy
 * přešlo na sledování souborů místo balení, cesty sedí taky. Jedno místo
 * navíc znamená, že na nový modul nemůže žádná funkce zapomenout.
 *
 * SEZNAM JE ÚMYSLNĚ MENŠÍ NEŽ CORE V build.py: server nemá DOM, takže sem
 * nepatří moduly, které kreslí nebo skládají dokumenty (docxgen, xlsx,
 * nabidka*, kryci*, ares, archiv, seznam…). Pořadí uvnitř výběru ale
 * odpovídá build.py – závislosti při načtení se tím nemůžou rozejít.
 * ============================================================ */

Object.assign(globalThis, require('../../src/preklad.js'));
Object.assign(globalThis, require('../../src/format.js'));
Object.assign(globalThis, require('../../src/engine.js'));
Object.assign(globalThis, require('../../src/engine_proj.js'));
Object.assign(globalThis, require('../../src/techspec.js'));
Object.assign(globalThis, require('../../src/zakazka.js'));
Object.assign(globalThis, require('../../src/uloziste.js'));
Object.assign(globalThis, require('../../src/zamek.js'));
Object.assign(globalThis, require('../../src/sleva.js'));
Object.assign(globalThis, require('../../src/zaokrouhleni.js'));
Object.assign(globalThis, require('../../src/marze.js'));
Object.assign(globalThis, require('../../src/kontroly.js'));
Object.assign(globalThis, require('../../src/firma.js'));
Object.assign(globalThis, require('../../src/cenik.js'));
Object.assign(globalThis, require('../../src/cenik_stari.js'));
Object.assign(globalThis, require('../../src/konfigurace.js'));
Object.assign(globalThis, require('../../src/program.js'));
Object.assign(globalThis, require('../../src/ukazkove.js'));
Object.assign(globalThis, require('../../src/zobrazeni.js'));
Object.assign(globalThis, require('../../src/sluzba.js'));   // jen server (služba K2)

/* Pojmenované držáky pro moduly, které se v kódu funkcí volají přes tečku
 * (ULO.uloJmenoSouboru, fm.firmaLzeZverejnit) – ať se nemíchá s globály. */
module.exports = {
  ULO: require('../../src/uloziste.js'),
  fm: require('../../src/firma.js'),
  /* Matice zobrazení (#136). Server ji čte i zapisuje v /api/zobrazeni a
   * očistu dělá TÝMŽ kódem jako prohlížeč — jinak by mohl uložit klíč, který
   * v aplikaci nic neznamená, nebo přidělit prvek držený serverem. */
  ZOB: require('../../src/zobrazeni.js'),
  JEKLY: require('../../src/jekly.json'),
};
