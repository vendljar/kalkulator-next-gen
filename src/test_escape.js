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

/* ---- dva útočné vzorky, na kterých se poznávají obě chyby najednou ----
 * Vzorky jsou schválně realistické. „Novák & syn "OK" <s.r.o.>" je jméno,
 * které nám do políčka objednatele opravdu může někdo napsat; obsahuje
 * ampersand, uvozovky i ostré závorky, tedy všechno, co rozbíjí HTML.
 * Druhý vzorek je klasický pokus o vložení skriptu — kdyby se do stránky
 * dostal neescapovaný, prohlížeč by ho spustil. */
const VZORKY = ['<img src=x onerror=alert(1)>', 'Novák & syn "OK" <s.r.o.>'];
for (const v of VZORKY) {
  const e = esc(v);
  test('esc: „' + v + '" nezanechá ostrou závorku', !/[<>]/.test(e), e);
  test('esc: „' + v + '" nezanechá uvozovku ani apostrof', !/["']/.test(e), e);
  /* Kontrola, že se text nepoškodil: po zpětném dekódování musí být stejný. */
  test('esc: „' + v + '" jde beze ztráty dekódovat zpět', dekoduj(e) === v, dekoduj(e));
  /* A totéž pro argument v onclick: po dekódování entit to musí být JS řetězec
   * s původním obsahem, ne kus kódu navíc. */
  test('escJs: „' + v + '" přežije cestu do onclick', vyzkousej(v) === v, escJs(v));
}

/* ================================================================
 * HLÍDAČ ZDROJŮ — aby se neescapovaný text nedostal do UI příště
 * ================================================================
 * Bezpečnostní úklid z 5. 8. 2026 prošel všech 30 souborů src/ui/ a nenašel
 * jedinou díru: každá interpolace, která nese text od uživatele, už tehdy
 * procházela esc(), escJs() nebo keyAttr(). Jenže revize je jednorázová věc
 * a soubory rostou dál. Proto ten nález zůstává zapsaný tady jako test:
 * projde se zdroj, vytáhnou se všechny interpolace ${…} na řádcích, které
 * skládají HTML, a ty, které vypadají na uživatelský text bez escapování,
 * se porovnají se seznamem míst prověřených při té revizi.
 *
 * Když někdo napíše nové `${zakaznik}` bez esc(), sada spadne a v hlášce
 * uvidí, kde. Má pak dvě možnosti: buď to obalí esc()/escJs() (skoro vždy
 * správně), nebo — pokud jde prokazatelně o vývojářský literál či hotový
 * kus HTML — si to místo přidá do PROVERENO níž i s důvodem. To druhé má
 * být vědomé rozhodnutí, ne omylem přehlédnutý řádek.
 *
 * Klíčem je soubor + text výrazu (ne číslo řádku — to se posouvá při každé
 * úpravě a seznam by za týden neseděl). */

/* Jména, která napovídají, že hodnota přichází od uživatele nebo z importu. */
const RIZIKO = /\b(nazev|jmeno|popis|pozn|poznamka|text|email|kdo|firma|objednatel|stavba|adresa|ico|dic|mesto|ulice|psc|soubor|hlaska|chyba|zprava|cislo|klic|key|label|titul|kontakt|telefon|web|banka|ucet|zakaznik|vzkaz|duvod|misto|projekt|varianta|verze|puvod|orig|autor|uzivatel|role|znacka|typ|kod|sekce|polozka|item)\b/i;
/* Funkce, po kterých je hodnota prokazatelně bezpečná. */
const OBALY = /^(esc|escJs|keyAttr|num|fmt|fmt0|fmtKc|T|tsPrelozText|zapisTridaHlasky|JSON\.stringify|encodeURIComponent|e2|xmlEsc)$/;
const KONSTANTA = /^('[^'\\$]*'|"[^"\\$]*"|`[^`\\$]*`|[-+]?[0-9.]+|true|false|null|undefined)$/;

/* Vytáhne z řádku obsahy ${…}. Nestačí regulární výraz `\$\{[^}]*\}` —
 * uvnitř bývají objekty i vnořené šablony, takže se závorky musí počítat
 * a řetězce přeskakovat. */
function vyrazy(r) {
  const ven = [];
  for (let i = 0; i < r.length - 1; i++) {
    if (r[i] !== '$' || r[i + 1] !== '{') continue;
    let d = 1, j = i + 2, q = null;
    while (j < r.length && d > 0) {
      const c = r[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = null; }
      else if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') d++;
      else if (c === '}') d--;
      j++;
    }
    if (d === 0) { ven.push(r.slice(i + 2, j - 1)); i = j - 2; }
  }
  return ven;
}
/* Vnořená šablona uvnitř výrazu se posuzuje po částech: rozhoduje to,
 * co se doopravdy tiskne, ne obal kolem. */
function listy(v, ven) {
  if (v.indexOf('`') >= 0) { for (const w of vyrazy(v)) listy(w, ven); return; }
  ven.push(v);
}
/* Projde výraz a ohlásí jen znaky mimo řetězce a mimo závorky —
 * kvůli hledání ternárního operátoru a spojování na nejvyšší úrovni. */
function mimo(v, cb) {
  let d = 0, q = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.indexOf(c) >= 0) { d++; continue; }
    if (')]}'.indexOf(c) >= 0) { d--; continue; }
    if (d === 0) cb(i, c);
  }
}
/* Podmínka ternáru nás nezajímá — do stránky se tiskne jen jedna z větví. */
function ternar(v) {
  let iq = -1, ic = -1, hloubka = 0;
  mimo(v, (i, c) => {
    if (c === '?' && v[i + 1] !== '.' && v[i + 1] !== '?' && v[i - 1] !== '?') {
      if (iq < 0) iq = i; else hloubka++;
    } else if (c === ':' && iq >= 0 && ic < 0) {
      if (hloubka > 0) hloubka--; else ic = i;
    }
  });
  return (iq >= 0 && ic > iq) ? [v.slice(iq + 1, ic), v.slice(ic + 1)] : null;
}
function rozdel(v) {
  const rez = [];
  mimo(v, (i, c) => {
    if (c === '+' && v[i - 1] !== '+' && v[i + 1] !== '+') rez.push(i);
    else if (c === '|' && v[i + 1] === '|') rez.push(i);
  });
  if (!rez.length) return null;
  const casti = []; let z = 0;
  for (const i of rez) { casti.push(v.slice(z, i)); z = i + (v[i] === '|' ? 2 : 1); }
  casti.push(v.slice(z));
  return casti;
}
function celeVolani(v) {
  const m = v.match(/^([A-Za-z_$][\w$.]*)\s*\(/);
  return (m && v.endsWith(')')) ? m[1] : null;
}
/* Bezpečné je to, co se prokazatelně nedá naplnit textem od uživatele:
 * konstanta, číselné převedení, volání escapovací funkce — a dál rekurzivně
 * větve ternáru a jednotlivé sčítance skládaného řetězce. */
function hodnotaBezpecna(v) {
  const t = v.trim();
  if (!t) return true;
  if (KONSTANTA.test(t)) return true;
  if (/^[+-]\s*[A-Za-z_$(]/.test(t)) return true;
  const fn = celeVolani(t);
  if (fn && OBALY.test(fn)) return true;
  const tt = ternar(t);
  if (tt) return hodnotaBezpecna(tt[0]) && hodnotaBezpecna(tt[1]);
  const casti = rozdel(t);
  if (casti && casti.length > 1) return casti.every(hodnotaBezpecna);
  if (/^\(.*\)$/.test(t)) return hodnotaBezpecna(t.slice(1, -1));
  return false;
}

/* Místa prověřená ručně 5. 8. 2026. U každého je napsáno, PROČ je v pořádku —
 * kdyby se okolní kód změnil, důvod musí platit dál, jinak řádek ze seznamu
 * patří pryč. Nový záznam sem přidávejte jen po skutečné kontrole zdroje. */
const PROVERENO = {
  'common.js': {
    'label': 'popisek pole ve formulářové šabloně txt(path, label) – volá se s literály',
  },
  'detail_ui.js': {
    'nazev': 'název kroku výpočtu z pevného seznamu DETAIL_KROKY',
  },
  'kalk_ock.js': {
    'col.admin ? pripNazev(x) : esc(x.nazev)': 'obě větve escapují – pripNazev skládá HTML přes esc() uvnitř',
    'key': 'klíč jeklu z pevného výčtu profilů, ne uživatelský text',
    'label': 'popisek řádku / KPI psaný vývojářem (profRow, sumRadek, kpiLine)',
    'orig': 'o pár řádků výš: const orig = keyAttr(r.origNazev) – tedy escJs',
    'popis': 'text tlačítka „+ …" předaný literálem do radekPridat()',
    'pozn': 'hotový úsek HTML `<span class="note">(${esc(r.pozn)})</span>`',
    'r.sekce': 'klíč sekce kalkulace z pevného výčtu',
  },
  'kalk_proj.js': {
    'label': 'popisek KPI psaný vývojářem',
    'nazev': 'hotový úsek HTML – jméno položky je uvnitř escapované esc(p.nazev)',
  },
  'kryci_ui.js': {
    'label': 'popisek pole z konstanty KRYCI_SEKCE',
    'p.label': 'popisek pole z konstanty KRYCI_SEKCE',
    's.sekce': 'název sekce z konstanty KRYCI_SEKCE',
    "tiskListaHtml({ pozn: 'Verze ' + d.verzeNazev + ' — uložte jako samostatný soubor (' + d.nazevSouboru + '.pdf).' })":
      'tiskListaHtml vypisuje pozn přes esc(); nazevSouboru je navíc očištěn už v kryci.js',
    'znacka(p.verze)': 'znacka() vrací tři pevné HTML štítky (BO / Tech / BO+Tech)',
  },
  'kryci_proj_ui.js': {
    'label': 'popisek pole z konstanty KRYCI_SEKCE (zrcadlo kryci_ui.js)',
    'p.label': 'popisek pole z konstanty KRYCI_SEKCE',
    's.sekce': 'název sekce z konstanty KRYCI_SEKCE',
    "tiskListaHtml({ pozn: 'Verze ' + d.verzeNazev + ' — uložte jako samostatný soubor (' + d.nazevSouboru + '.pdf).' })":
      'tiskListaHtml vypisuje pozn přes esc(); nazevSouboru je očištěn v kryci_proj.js',
    'znacka(p.verze)': 'znacka() vrací tři pevné HTML štítky',
  },
  'nastaveni_ui.js': {
    "d.jenVApp.slice(0, 40).map(x => esc(x.klic)).join(' · ')": 'každý klíč prochází esc() uvnitř map()',
    'label': 'popisek řádku šablony psaný vývojářem',
    "m ? 'hotovo: ' + esc(m.nazev) + ' – kliknutím přegeneruji' : 'vyrobit ' + l.toUpperCase() + ' mutaci z české šablony'":
      'jméno souboru mutace prochází esc(), zbytek jsou literály',
    'popis': 'popisný text bloku nastavení psaný vývojářem',
    'pozn': 'poznámka k řádku šablony psaná vývojářem',
    's.kod': 'kód volby konfigurace z konstanty KONFIG_SEKCE',
    'sekce': 'hotový úsek HTML poskládaný výš (uvnitř už escapovaný)',
    'typ': "klíč šablony ('CN', 'OVP' …) z pevného výčtu",
  },
  'online_ui.js': {
    'hlaska': 'hotový úsek HTML `<div class="…">${esc(ONLINE_STAV.hlaska)}</div>`',
  },
  'poznamky_ui.js': {
    'd.kod': 'kód druhu poznámky z pevného číselníku',
    'kdo': "výš: const kdo = p.kdo ? esc(p.kdo) : 'neuvedeno'",
  },
  'program_ui.js': {
    'z.verze': 'pořadové číslo verze ceníku – číslo, ne text',
  },
  'protokol_ui.js': {
    'kdo': "výš: const kdo = z.kdo ? esc(z.kdo) : 'neuvedeno'",
  },
  'schvalovani_ui.js': {
    'duvod': 'hotový úsek HTML poskládaný o pár řádků výš – hodnota v něm '
      + 'prochází esc(SCHV_DUVODY[z.id]) a id přes escJs()',
  },
  'techspec_ui.js': {
    'j.kod': 'kód jazyka z konstanty JAZYKY',
  },
  'zakazka_ui.js': {
    'nazev': 'popisek pole v náhledu nabídky – pole() se volá s literály',
  },
};

const uiDir = __dirname + '/ui';
const nove = [];
const nepouzite = [];
for (const f of fs.readdirSync(uiDir).sort()) {
  if (!f.endsWith('.js')) continue;
  const videno = new Set();
  fs.readFileSync(uiDir + '/' + f, 'utf8').split('\n').forEach((r, i) => {
    /* Řádek musí vypadat, že skládá HTML – jinak jde o běžný kód. */
    if (!/[<>]|innerHTML|title=|value=|placeholder=/.test(r)) return;
    const ven = [];
    for (const v of vyrazy(r)) listy(v, ven);
    for (const v of ven) {
      if (hodnotaBezpecna(v) || !RIZIKO.test(v)) continue;
      const norm = v.replace(/\s+/g, ' ').trim();
      videno.add(norm);
      if (!(PROVERENO[f] && Object.prototype.hasOwnProperty.call(PROVERENO[f], norm)))
        nove.push(f + ':' + (i + 1) + '  ${' + norm + '}');
    }
  });
  for (const k of Object.keys(PROVERENO[f] || {}))
    if (!videno.has(k)) nepouzite.push(f + '  ${' + k + '}');
}

test('žádná nová neescapovaná interpolace v src/ui/', nove.length === 0,
  '\n      nalezeno ' + nove.length + ':\n      ' + nove.join('\n      ')
  + '\n      → obalte hodnotu esc() (text a atributy) nebo escJs()/keyAttr()'
  + '\n        (argument uvnitř onclick="fn(\'…\')"); pokud jde prokazatelně'
  + '\n        o vývojářský literál nebo hotové HTML, dopište místo do'
  + '\n        seznamu PROVERENO v src/test_escape.js i s důvodem.');

/* Opačný směr: záznam, který už v kódu není, se má ze seznamu smazat.
 * Jinak seznam zestárne a při dalším úklidu se mu nedá věřit. */
test('seznam PROVERENO neobsahuje zastaralé záznamy', nepouzite.length === 0,
  '\n      už se v kódu nevyskytují:\n      ' + nepouzite.join('\n      ')
  + '\n      → smažte je ze seznamu PROVERENO v src/test_escape.js');

/* Poslední pojistka: HTML se skládá jen v src/ui/. Kdyby někdo začal sázet
 * do stránky text i odjinud, tenhle hlídač by o tom nevěděl. */
const mimoUi = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.js') && !f.startsWith('test'))
  .filter(f => /\.innerHTML\s*=|insertAdjacentHTML|document\.write|\.outerHTML\s*=/
    .test(fs.readFileSync(__dirname + '/' + f, 'utf8')));
test('mimo src/ui/ se do stránky nesází HTML', mimoUi.length === 0, mimoUi.join(', '));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
