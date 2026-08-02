/* Test escapovacích pomocníků esc() a escJs() (#6).
 *
 * Obě funkce žijí v ui/common.js, které se nedá načíst přes require() – je to
 * kód rozhraní pracující s globálním stavem. Test si proto z toho souboru
 * vytáhne jen deklarace obou konstant a vyhodnotí je. Kdyby je někdo do
 * budoucna přepsal na `function esc(...)`, test spadne s jasnou hláškou –
 * a to je v pořádku, protože pak je potřeba znovu promyslet i tenhle test.
 *
 * Proč to vůbec testujeme: celé UI se skládá do řetězce a přiřazuje přes
 * innerHTML. Názvy položek, poznámky a popisky přitom píše uživatel nebo
 * přicházejí z importu. Apostrof v názvu položky („Kotva 'M8'") dřív rozbil
 * argument v onclick handleru; ostrá závorka rozbila rozvržení stránky.
 */
const fs = require('fs');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

const src = fs.readFileSync(__dirname + '/ui/common.js', 'utf8');
const vytahni = jm => {
  const i = src.indexOf('const ' + jm + ' =');
  if (i < 0) throw new Error('v ui/common.js chybí deklarace `const ' + jm + ' =` (#6)');
  const konec = src.indexOf(';\n', i);
  return src.slice(i, konec + 1);
};
const esc = eval(vytahni('esc') + 'esc');            // eslint-disable-line no-eval
const escJs = eval(vytahni('esc') + vytahni('escJs') + 'escJs');   // eslint-disable-line no-eval

/* ---- esc(): text a obsah atributů ---- */
test('esc escapuje <', esc('<script>') === '&lt;script&gt;', esc('<script>'));
test('esc escapuje uvozovku', esc('a"b') === 'a&quot;b', esc('a"b'));
test('esc escapuje apostrof', esc("a'b") === 'a&#39;b', esc("a'b"));
test('esc escapuje ampersand jako první', esc('&lt;') === '&amp;lt;', esc('&lt;'));
test('esc zvládne null i undefined', esc(null) === '' && esc(undefined) === '');
test('esc nechá českou diakritiku být', esc('Příčník žebřík') === 'Příčník žebřík');
test('esc nechá číslo být', esc(12.5) === '12.5');

/* ---- escJs(): argument v onclick="fn('…')" ----
 * Prohlížeč nejdřív rozkóduje HTML entity a teprve výsledek čte jako JavaScript.
 * Simulujeme to: dekódujeme entity a podíváme se, co uvidí JS parser. */
const dekoduj = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const vyzkousej = vstup => {
  const vJs = dekoduj(escJs(vstup));         // co uvidí JavaScript po dekódování entit
  return eval("'" + vJs + "'");              // eslint-disable-line no-eval
};

test('escJs přežije apostrof v názvu', vyzkousej("Kotva 'M8'") === "Kotva 'M8'", escJs("Kotva 'M8'"));
test('escJs přežije zpětné lomítko', vyzkousej('C:\\temp') === 'C:\\temp', escJs('C:\\temp'));
test('escJs přežije uvozovky', vyzkousej('Profil "40x40"') === 'Profil "40x40"');
test('escJs přežije ostrou závorku', vyzkousej('<b>tučně</b>') === '<b>tučně</b>');
test('escJs nezanechá holý apostrof v HTML', !/[^\\&]'/.test(escJs("a'b")), escJs("a'b"));
test('escJs escapuje i pro HTML', escJs('<x>').indexOf('<') === -1, escJs('<x>'));

/* ---- kontrola, že se ve zdrojích neobjeví holá entita &#39; jako „ochrana" ----
 * Právě tenhle vzorec byl původní chybou (keyAttr v kalk_ock.js): entita se
 * rozkóduje dřív, než se obsah atributu předá JavaScriptu, takže neochrání nic. */
const kalk = fs.readFileSync(__dirname + '/ui/kalk_ock.js', 'utf8');
test('keyAttr už nespoléhá na entitu &#39;', !/replace\(\/'\/g, *'&#39;'\)/.test(kalk));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
