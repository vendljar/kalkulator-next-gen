/* Kontrola hotové příručky obchodníka — /home/claude/work/deliver/MANUAL_OBCHODNIK_v*.html
 *
 * Proč vlastní harness: příručka je jeden zapečený soubor o 2 MB, který se
 * posílá dál e-mailem. Kdyby se při zabalení jediný snímek poškodil, v HTML
 * po něm zůstane prázdný rámeček — a to se pouhým pohledem do zdrojáku
 * nepozná, base64 vypadá vždycky stejně. Prohlížeč to naopak pozná okamžitě:
 * `naturalWidth === 0` je rozbitý obrázek.
 *
 * Kontroluje se i věcná stránka: že v příručce zůstala kapitola o červené
 * liště (kvůli ní vznikla), že varovná věta o zkušebních číslech nezmizela
 * (jinak by si obchodník spletl 100 Kč/kg s naší sazbou) a že v textu není
 * ani stopa po skutečném ceníku.
 *
 * Spuštění:  node overit_manual.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NODE_PATH
  ? 'playwright' : 'playwright');

const KAM = '/home/claude/work/deliver';
/* Verze se řadí čísly, ne abecedou: textově je „v5.8.9“ větší než „v5.8.15“
 * a harness by pak kontroloval starou příručku a hlásil nesmyslné chyby. */
const cislaVerze = (f) => (f.match(/v(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
const soubor = readdirSync(KAM)
  /* Od 20. 8. 2026 mají výstupy dávky jméno v ISO tvaru
   * `RRRR-MM-DD_kalkulator_v<verze>_<druh>.<přípona>` — sorted podle jména
   * je tak zároveň seřazeno podle času. Starší tvar `MANUAL_OBCHODNIK_v*.html`
   * se dál uznává, ať se historické příručky nepřestanou hlídat. */
  .filter((f) => /^MANUAL_OBCHODNIK_v.*\.html$/.test(f)
    || /^\d{4}-\d{2}-\d{2}_kalkulator_v.*_MANUAL_OBCHODNIK\.html$/.test(f))
  /* Nejdřív podle DATA v názvu, teprve pak podle čísla verze. Verze je
   * DEN.MĚSÍC.pořadí, takže na přelomu měsíce je „v1.9.1" číselně MENŠÍ než
   * „v31.8.5", i když je novější — 1. 9. 2026 tahle kontrola sáhla po staré
   * příručce a hlásila, že nesedí verze. Datum v ISO tvaru roste vždycky. */
  .sort((a, b) => {
    const d = (f) => (f.match(/^(\d{4}-\d{2}-\d{2})/) || ['', ''])[1];
    if (d(a) !== d(b)) return d(a) < d(b) ? -1 : 1;
    const x = cislaVerze(a), y = cislaVerze(b);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  }).pop();
if (!soubor) { console.error('Příručka nenalezena v ' + KAM); process.exit(1); }
const html = readFileSync(KAM + '/' + soubor, 'utf8');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* ---------- 1) statické kontroly nad zdrojem ---------- */

test('soubor je jednosouborový (žádný odkaz mimo data:)',
  !/(?:src|href)="(?!data:|#)[^"]+"/.test(html.replace(/href="https?:[^"]*"/g, '')),
  (html.match(/(?:src|href)="(?!data:|#)[^"]+"/g) || []).slice(0, 3).join(' '));
test('obsahuje 25 zapečených snímků',
  (html.match(/src="data:image\/png;base64,/g) || []).length === 25,
  (html.match(/src="data:image\/png;base64,/g) || []).length);
test('kapitola o červené liště je uvnitř', /Vidím červenou lištu/.test(html));
test('varování o zkušebních číslech je uvnitř',
  /nejsou naše ceny/i.test(html));
/* Verze se hlídá proti verze.txt, ne proti napsanému číslu (20. 8. 2026):
 * pevné „v5.8" v testu znamenalo, že zastaralá příručka procházela zeleně
 * ještě dva týdny po vydání nové aplikace. */
const verzeApp = readFileSync(new URL('./verze.txt', import.meta.url), 'utf8').trim();
test('příručka nese AKTUÁLNÍ verzi aplikace (v' + verzeApp + ')',
  html.includes('v' + verzeApp), verzeApp);
test('příručka popisuje obnovu rozpracované kalkulace',
  /Rozpracovanou kalkulaci neztratíte|Obnovit rozpracovanou kalkulaci/.test(html));
/* Od 1. 9. 2026 se trvalé položky zakládají JEN v ceníku (pokyn J. V.),
 * takže příručka musí říkat obojí: co dělá tlačítko v kalkulaci a kde se
 * zakládá trvalá položka. */
test('příručka popisuje přidávání položek (vlastní × trvalé)',
  /platí jen v téhle zakázce/i.test(html)
  && /přidat trvalou položku do sekce/.test(html)
  && /Trvalé položky projekce/.test(html)
  && !/Vedle stojí <b>„\+ přidat položku trvale/.test(html));
test('příručka popisuje skryté a srolované sekce',
  /srolovat/i.test(html) && /skrytá sekce <b>se dál počítá<\/b>|se dál počítá/i.test(html));
test('příručka říká, kde se tvoří smlouva o dílo',
  /Krycí list zakázky OCK/.test(html) && /Kde se tvoří dokumenty/.test(html));
test('příručka popisuje databázi zákazníků',
  /Zákazníci: co vyplníte jednou/.test(html) && /Zakázka je vždycky pán/.test(html));
test('příručka popisuje Standard OCK a jeho tři stavy',
  /Standard OCK: pozná se atyp sám/.test(html) && /NELZE POSOUDIT/.test(html)
  && /Nic to neblokuje/.test(html));
/* Obsah s prokliky (1. 9. 2026, zadání J. V.: „přidej na úvod seznam
 * s jednotlivými kapitolami … aby se dalo klikem přeskočit na kapitolu"). */
{
  const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map(m => m[1]);
  const odkazy = [...html.matchAll(/<li[^>]*><a href="#(kap-[^"]+)"/g)].map(m => m[1]);
  test('příručka má na úvod obsah', /id="obsah"/.test(html) && /obsah-list/.test(html));
  test('každá kapitola má svou kotvu', ids.length >= 40, ids.length);
  test('obsah odkazuje na všechny kapitoly', odkazy.length === ids.length,
    odkazy.length + ' odkazů vs ' + ids.length + ' kapitol');
  test('žádný odkaz v obsahu nemíří do prázdna',
    odkazy.every(o => ids.includes(o)), odkazy.filter(o => !ids.includes(o)).join(', '));
  test('obsah stojí PŘED první kapitolou',
    html.indexOf('id="obsah"') < html.indexOf('<h2 id='));
  test('od každé kapitoly vede šipka zpět na obsah',
    (html.match(/class="nahoru" href="#obsah"/g) || []).length === ids.length);
}

test('příručka používá pojem zákazník, ne objednatel',
  /v aplikaci se všude říká „zákazník"|Zástupci a kontakty zákazníka/i.test(html));
test('žádné skutečné ceníkové soubory v textu',
  !/cenik_skutecny|_soukrome/.test(html));
test('žádná hesla v textu',
  !/ObchodniHeslo1|Zkusebni\.Heslo|TAJEMSTVI_RELACE/.test(html));

/* ---------- 2) kontrola v prohlížeči ---------- */

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const port = server.address().port;

const prohlizec = await chromium.launch();
const stranka = await prohlizec.newPage();
const chyby = [];
stranka.on('pageerror', (e) => chyby.push(String(e)));
stranka.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
await stranka.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });

const obr = await stranka.evaluate(() => [...document.images].map((i, n) => ({
  n: n + 1, w: i.naturalWidth, h: i.naturalHeight,
  alt: (i.alt || '').slice(0, 40),
})));
test('prohlížeč našel 25 obrázků', obr.length === 25, obr.length);
const rozbite = obr.filter((o) => !o.w || !o.h);
test('žádný obrázek není rozbitý', rozbite.length === 0,
  rozbite.map((o) => o.n + ' ' + o.alt).join(', '));
const bezPopisku = obr.filter((o) => !o.alt);
test('každý obrázek má alternativní popis', bezPopisku.length === 0,
  bezPopisku.map((o) => o.n).join(', '));
test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

const nadpisy = await stranka.evaluate(() =>
  [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()));
test('příručka má aspoň 16 kapitol', nadpisy.length >= 16, nadpisy.length);

/* Nadpisy se při vkládání kapitoly přečíslovávají ručně, takže se hlídá,
 * že číslovaná řada opravdu jde 1, 2, 3 … a nezůstala v ní dvojka navíc. */
const cislovane = nadpisy.map((t) => (t.match(/^(\d+)\. /) || [])[1])
  .filter(Boolean).map(Number);
test('nadpisy kapitol jsou číslované vzestupně bez děr',
  cislovane.length >= 16 && cislovane.every((c, i) => c === i + 1),
  cislovane.join(','));

/* Kapitoly, které přibyly 5. 8. 2026 — bez nich by příručka mlčela o tom,
 * proč se sleva nad strop role nepropíše do nabídky, a o podmínkách pod
 * cenou. Obojí je změna, kterou obchodník uvidí hned první den. */
test('kapitola o slevě a jejím schválení je uvnitř',
  /Sleva a její schválení/.test(html));
test('kapitola vysvětluje, že rozhodnutí je podepsané',
  /rozhodnutí je podepsané/i.test(html));
test('kapitola říká, že zvýšení procenta vrací slevu k rozhodnutí',
  /vrátí\s+do stavu/.test(html.replace(/\s+/g, ' ')));
test('příručka popisuje smluvní a platební podmínky pod cenou',
  /Smluvní a platební podmínky/.test(html));
test('a říká, že to není kopie, ale týž záznam',
  /není kopie/.test(html));

/* Kapitola „Můj profil" přibyla s v5.8.14/15. Do té doby stálo v bloku
 * „Vypracoval" natvrdo jméno jednoho kolegy a obchodník ho po vygenerování
 * přepisoval ručně. Když by tahle kapitola z příručky vypadla, nikdo se
 * nedozví, kde si telefon a podpis vyplnit — a nabídky budou dál chodit
 * s prázdným kontaktem. */
test('kapitola Můj profil je uvnitř', /Můj profil/.test(html));
test('příručka jmenuje blok Vypracoval v nabídce',
  /„Vypracoval“|„Vypracoval"/.test(html));
test('příručka popisuje podpis s razítkem',
  /podpis s razítkem/i.test(html));
test('příručka zmiňuje titul, funkci i telefon u účtu',
  /Titul před jménem/.test(html) && /Telefon/.test(html) && /Funkce/.test(html));
test('příručka vysvětluje sazbu DPH jako volbu 12 / 21 %',
  /12 % snížená/.test(html) && /21 % základní/.test(html)
  && /nepíše ručně, ale vybírá/.test(html));
test('příručka zmiňuje zvýraznění vybrané volby u přepínačů',
  /vybraná volba je zřetelně zvýrazněná/i.test(html));

/* Popisky obrázků musí jít od 1 bez děr — přečíslování při vkládání nových
 * figur je ruční práce a jediná vynechaná číslice se v textu hledá špatně. */
const popisky = [...html.matchAll(/<b>Obrázek (\d+)\.<\/b>/g)].map((m) => Number(m[1]));
test('popisky obrázků jsou 1..25 bez děr a bez duplicit',
  popisky.length === 25 && popisky.every((c, i) => c === i + 1),
  popisky.join(','));

const vyska = await stranka.evaluate(() => document.body.scrollHeight);
test('stránka není prázdná', vyska > 3000, vyska);

await prohlizec.close();
server.close();

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo  (' + soubor + ')');
process.exit(fail ? 1 : 0);
