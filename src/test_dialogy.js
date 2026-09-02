/* HLÍDAČ: žádné nativní dialogy v aplikaci (2. 9. 2026)
 * ============================================================
 *
 * Nativní `confirm()` / `alert()` / `prompt()` zastaví celý renderer.
 * Aplikace pak přestane reagovat na cokoli zvenčí — při testu 2. 9. 2026
 * zamrzla na „✚ Nová zakázka" i na přepínači ceníku a nešlo pokračovat
 * jinak než naslepo Enterem a reloadem stránky. Proto se všechna volání
 * převedla na in-app modál (`src/ui/dialog.js`: potvrd / hlaska / dotaz).
 *
 * Tahle sada je zábrana, aby se nativní dialogy nevrátily zadními vrátky:
 * projde `src/**` a spadne, jakmile někde najde `confirm(`, `alert(`
 * nebo `prompt(` mimo `src/ui/dialog.js` a testovací soubory.
 *
 * Když nový dialog opravdu potřebujete, použijte:
 *     if (!await potvrd('Otázka?')) return;      // místo confirm
 *     hlaska('Sdělení.');                        // místo alert
 *     const t = await dotaz('Zadejte:', '');     // místo prompt
 * a nezapomeňte volající funkci označit `async`.
 */
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const KOREN = __dirname;
const VYJIMKY = new Set(['ui/dialog.js']);          // jediné místo, kde smí být „dialog"
const jeTest = (rel) => /(^|\/)test[_.]/.test(rel) || /\/test_/.test(rel);

function soubory(dir, rel = '') {
  const out = [];
  for (const jm of fs.readdirSync(dir)) {
    const p = path.join(dir, jm), r = rel ? rel + '/' + jm : jm;
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (jm !== 'test_data' && jm !== 'node_modules') out.push(...soubory(p, r)); }
    else if (jm.endsWith('.js')) out.push({ p, rel: r });
  }
  return out;
}

const VZOR = /(?<![\w.$])(confirm|alert|prompt)\s*\(/g;
const nalezy = [];
for (const { p, rel } of soubory(KOREN)) {
  if (VYJIMKY.has(rel) || jeTest(rel)) continue;
  const radky = fs.readFileSync(p, 'utf8').split('\n');
  radky.forEach((r, i) => {
    /* Komentáře se nepočítají — v poznámkách se o nativních dialozích mluví. */
    const bezKomentare = r.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    for (const m of bezKomentare.matchAll(VZOR)) nalezy.push(rel + ':' + (i + 1) + '  ' + m[1] + '(');
  });
}

test('v src/ není žádné nativní confirm / alert / prompt', nalezy.length === 0,
  '\n      ' + nalezy.join('\n      ')
  + '\n      → použijte potvrd() / hlaska() / dotaz() z ui/dialog.js'
  + '\n        (volající funkci označte async; viz hlavička téhle sady)');

/* Modul dialogů musí existovat, nést všechny tři funkce a mít stabilní
 * data- atributy, na které se váže automatizované testování. */
const dlg = fs.readFileSync(path.join(KOREN, 'ui', 'dialog.js'), 'utf8');
test('ui/dialog.js nabízí potvrd, hlaska i dotaz',
  /function potvrd\(/.test(dlg) && /function hlaska\(/.test(dlg) && /function dotaz\(/.test(dlg));
test('modál má stabilní id a data- atributy',
  /el\.id = 'dlg'/.test(dlg) && /data-dlg="ano"/.test(dlg)
  && /data-dlg="ne"/.test(dlg) && /data-dlg="text"/.test(dlg));
test('text dialogu se escapuje (B26) a zachovává řádkování',
  /dlgEsc\(text\)/.test(dlg) && /esc\(/.test(dlg));
test('dialogy se řadí za sebe, nepřekrývají se', /DLG\.fronta/.test(dlg) && /DLG\.bezi/.test(dlg));
test('Esc ruší a Enter potvrzuje', /'Escape'/.test(dlg) && /'Enter'/.test(dlg));
test('modál se netiskne', /noprint/.test(dlg));

/* Modul musí být v seznamu souborů buildu — jinak by funkce v aplikaci
 * nebyly a všechna převedená volání by spadla na „potvrd is not defined". */
const build = fs.readFileSync(path.join(KOREN, '..', 'build.py'), 'utf8');
test('ui/dialog.js je součástí buildu', /'ui\/dialog\.js'/.test(build));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
