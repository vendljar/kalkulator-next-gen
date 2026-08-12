/* ===== Kalkulace PROJ vypadá jako kalkulace OCK (návrh A2, schváleno 31. 7. 2026) =====
 *
 * Zadání uživatele: „Můžeme sjednotit vizuály Kalkulací tak, aby Kalkulace PROJ
 * vypadala vizuálně stejně jako kalkulace OCK … Jde mi zejména o názvy sekcí
 * a součtové řádky, možnost přesouvání položek." + schválený návrh A2
 * („s malým štítkem je super", „přeškrtnuté položky odstraň", „všechny poznámky
 * převeď na text poznámka (interní)").
 *
 * Vzhled se testuje na ZDROJOVÉM KÓDU, ne v prohlížeči: to, co dělá tabulku
 * OCK a PROJ stejnou, je pár konkrétních tříd řádků a jedno pravidlo pořadí
 * (světlý název sekce → položky → doprava → „+ přidat" → tmavý součet). Kdyby
 * se do PROJ vrátil `tr.sec` nebo rolovací seznam sazeb, prohlížeč to nepozná
 * jako chybu — jen to zase přestane sedět. Proto to hlídá tenhle test.
 * Chování (přesun položky) se testuje na čisté funkci z engine_proj.js.
 */
const fs = require('fs');
const { presunPolozku } = require('./engine_proj.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n + (info ? '  – ' + info : '')); }
};
const kalk = fs.readFileSync(__dirname + '/ui/kalk_proj.js', 'utf8');
/* Verze bez komentářů: co je jen popsané v komentáři, se v tabulce nevykreslí.
 * Bez tohohle by test padal na vlastní vysvětlivce („řádek Náklad sekce je pryč"). */
const kod = kalk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ---------- 1) stavba tabulky: stejné třídy řádků jako v OCK ---------- */
test('PROJ nepoužívá tr.sec (mezisoučtové pruhy uprostřed sekce jsou pryč)',
  !/tr class="sec"/.test(kalk));
test('sekce začíná světlým pruhem tr.sechd', /tr class="sechd"/.test(kalk));
test('sekce končí tmavým součtem tr.sectot', /tr class="sectot"/.test(kalk));
test('kalkulace končí jedním řádkem tr.tot', /tr class="tot"/.test(kalk));
test('řádek „+ přidat" má třídu pridat jako v OCK', /tr class="pridat/.test(kalk));
test('řádek „Náklad sekce" je zrušený – částka je ve sloupci Náklad na součtu sekce',
  !/Náklad sekce/.test(kod));

/* ---------- 2) kotva klouzající lišty sedí na řádku se jménem sekce ----------
 * Dřív visela na kartě sekce; sekce teď kartu nemá, tak musí být na pruhu
 * s názvem – jinak kalkLista skočí na nic. */
test('kotva proj-sek-<i> je na řádku tr.sechd',
  /tr class="sechd" id="proj-sek-/.test(kalk));

/* ---------- 3) sloupec Sazba: číslo + drobný štítek činnosti ----------
 * „Nastavení viz obr. tj s malým štítkem je super. Práce statika, projektanta
 * a zaměřovače musíme držet v ceníku, abychom je mohli v čase editovat, tedy
 * takto informativně zobrazené je fajn." – tedy žádný rolovací seznam,
 * ale název činnosti u čísla zůstává. */
test('rolovací seznam sazeb je pryč', !/<select/.test(kalk));
test('činnost je vidět jako drobný štítek (pill mut)', /pill mut/.test(kalk));
test('sazba z ceníku se drží v placeholderu pole přepisu', /prepis-ed/.test(kalk));

/* ---------- 4) role: co vidí běžný uživatel ---------- */
test('viditelnost sloupců řeší společná kalkSloupce() jako v OCK', /kalkSloupce\(\)/.test(kalk));
test('náklad a přirážka jen když showCost', /showCost/.test(kalk));
test('přetahování (grip) jen pro admina', /admin \? .*grip|grip[\s\S]{0,80}admin/.test(kalk));
/* Filtr si s sebou nese původní index j – bez něj by obsluha (mazání, přepis,
 * poznámka) po skrytí jedné položky psala do jiného řádku, než na který
 * uživatel klikl. Proto se filtruje pole dvojic {p, j}, ne přímo položky. */
test('vyřazené položky se běžnému uživateli nezobrazují',
  /filter\(x => !x\.p\.vyrazeno\)/.test(kalk));
test('filtr vyřazených si drží původní index položky',
  /polozky\.map\(\(p, j\) => \(\{ p, j \}\)\)/.test(kalk));
test('interní poznámka je jen pro admina',
  /admin[\s\S]{0,400}pozn-ed/.test(kalk));
test('poznámka má všude stejnou podobu s nápovědou „poznámka (interní)"',
  (kalk.match(/placeholder="poznámka \(interní\)"/g) || []).length === 1);

/* ---------- 5) hlavička: dlaždice a zaškrtávátka jako v OCK ---------- */
test('hlavička skládá dlaždice .grand/.kpi jako OCK', /class="grand"/.test(kalk) && /kpi main/.test(kalk));
test('admin rozhoduje zaškrtávátkem, co z dlaždic uvidí uživatel', /kpiVidSet\(/.test(kalk) && /kpi-chk/.test(kalk));
/* V hlavičce zůstává JEDINÝ řádek .prm – globální přirážka. Sleva se
 * z hlavičky odstěhovala do sekce pod výpočtem (zadání 1. 8. 2026:
 * „obchodní zaokrouhlení a globální slevu z hlavičky smaž, budeme to mít
 * v sekci dole"). */
test('v hlavičce zůstal jediný řádek .prm – globální přirážka',
  (kalk.match(/class="prm"/g) || []).length === 1);
test('globální přirážka se bere z ceníku PROJ (PC.marze)', /PC\.marze/.test(kalk));
/* Dlaždice „Poskytnutá sleva" v hlavičce zůstává – je to výsledek, ne zadání.
 * Zmizet musí jen POLE, do kterého se sleva zadávala. */
test('pole globální slevy už v kalkulaci PROJ není', !/set\('PJ\.slevaPct'/.test(kod));
test('dlaždice Poskytnutá sleva v hlavičce zůstává', /Poskytnutá sleva/.test(kod));

/* ---------- 6) přesun položky ---------- */
test('kalkulace PROJ používá čistou funkci presunPolozku', /presunPolozku\(/.test(kalk));

const A = [{ nazev: 'a' }, { nazev: 'b' }, { nazev: 'c' }, { nazev: 'd' }];
const jm = arr => arr.map(p => p.nazev).join('');
test('přesun dolů vloží řádek PŘED cíl (jako v OCK)', jm(presunPolozku(A, 0, 2)) === 'bacd',
  jm(presunPolozku(A, 0, 2)));
test('přesun nahoru vloží řádek na místo cíle', jm(presunPolozku(A, 3, 1)) === 'adbc',
  jm(presunPolozku(A, 3, 1)));
test('přesun na sebe sama nic nemění', jm(presunPolozku(A, 2, 2)) === 'abcd');
test('vstupní pole zůstane nedotčené', jm(A) === 'abcd');
test('mimo rozsah se nic nestane', jm(presunPolozku(A, 0, 9)) === 'abcd' && jm(presunPolozku(A, -1, 1)) === 'abcd');
test('nesmyslný index nespadne', jm(presunPolozku(A, null, 1)) === 'abcd' && jm(presunPolozku(A, 1.5, 0)) === 'abcd');
test('prázdné pole nespadne', presunPolozku(undefined, 0, 1).length === 0);
test('přesunutá položka je tatáž (nekopíruje se)', presunPolozku(A, 0, 2)[1] === A[0]);

/* ---------- 7) sleva a zaokrouhlení mají sekci pod výpočtem (zadání 1. 8. 2026) ----
 * „Ještě mi tam sekce sleva na nabídku a obchodní zaokrouhlení tak jak to máme
 * v kalkulaci OCK, tzn. pod výpočetním oknem."
 *
 * Podstatné je, že jde o TYTÉŽ karty, ne o jejich kopii: sleva drží stav v SL,
 * zaokrouhlení v ZO. Kdyby si PROJ založila vlastní stav, měla by jedna zakázka
 * dvě různé politiky a nikdo by nevěděl, která platí. Proto se karta jen
 * vykreslí podruhé a liší se pouze kotvou (id), aby na ni uměla skočit lišta. */
const spol = fs.readFileSync(__dirname + '/ui/common.js', 'utf8');
const zaokrUi = fs.readFileSync(__dirname + '/ui/zaokrouhleni_ui.js', 'utf8');

test('kalkulace PROJ vykresluje kartu slevy', /slevaKarta\('proj'\)/.test(kod));
test('kalkulace PROJ vykresluje kartu obchodního zaokrouhlení', /zaokrKarta\('proj'\)/.test(kod));
test('karty stojí hned pod výpočetním oknem (za kartou Cenová kalkulace PROJ)',
  /card\('Cenová kalkulace PROJ'[\s\S]{0,200}slevaKarta\('proj'\)[\s\S]{0,120}zaokrKarta\('proj'\)/.test(kod));
test('karta slevy umí druhou kotvu proj-sleva', /'proj-sleva'/.test(spol));
test('karta zaokrouhlení umí druhou kotvu proj-zaokr', /'proj-zaokr'/.test(zaokrUi));
/* Od 12. 8. 2026 (#134) má projekce VLASTNÍ slevu (SLP nad data.slevaProj).
 * Do té doby tu stál opačný test — „PROJ si vlastní stav nezakládá" — a byl
 * to právě ten stav, kvůli kterému se pod výpočtem projekce ukazovala cena
 * výtahové šachty. Karta se pořád skládá jedinou funkcí; co se liší, je
 * část, nad kterou pracuje. */
test('projekce má vlastní stav slevy (SLP)', /\bSLP\b/.test(spol));
test('karta slevy si část odvozuje z jedné funkce, ne dvěma kopiemi',
  /function slevaCast\(/.test(spol) && (spol.match(/function slevaKarta\(/g) || []).length === 1);
test('zrušené pole globální slevy PROJ už v UI není',
  !/PJ\.slevaPct/.test(spol) && !/pjSlevaGlobal/.test(spol + kalk));

/* Hlavička už obchodní zaokrouhlení neopisuje – je v kartě pod výpočtem
 * a v souhrnné tabulce. Cena nabídky v hlavičce naopak zůstává, protože je to
 * číslo, které jde ven. */
test('v hlavičce PROJ už není dlaždicový řádek Obchodní zaokrouhlení',
  !/kl">Obchodní zaokrouhlení/.test(kod));
test('v hlavičce PROJ zůstává Cena nabídky bez DPH', /Cena nabídky bez DPH/.test(kod));
test('souhrnná tabulka zaokrouhlení dál vypisuje vlastním řádkem',
  /colspan="6">Obchodní zaokrouhlení/.test(kod));

/* ---------- 8) ceníková marže nesmí být zadrátovaná ve zdrojácích ----------
 * „Dejme i výchozí hodnotu marže do ceníku a natahujme z ceníkové databáze."
 * Skutečných 30 % žije v _program.json ve složce _DB. Jakmile se stejné číslo
 * objeví ve zdrojáku (i jen jako testovací konstanta), pripravit_github.py to
 * po právu považuje za únik ceníku a odmítne repozitář vydat.
 *
 * Hledaný řetězec se schválně skládá ze dvou kousků. Kdyby tu stál celý,
 * hlásil by strážce sám sebe – tenhle test by pak byl tím, kvůli čemu
 * repozitář nejde vydat. */
const HLEDANE = 'marze: 0.' + '3';
const zdrojaky = fs.readdirSync(__dirname).filter(f => f.endsWith('.js'))
  .concat(fs.readdirSync(__dirname + '/ui').filter(f => f.endsWith('.js')).map(f => 'ui/' + f));
const spatne = zdrojaky.filter(f => f !== 'test_proj_vzhled.js'
  && fs.readFileSync(__dirname + '/' + f, 'utf8').includes(HLEDANE));
test('žádný zdroják nedrží ceníkovou marži natvrdo', spatne.length === 0, spatne.join(', '));

/* ---------- 9) po auditu 1. 8. 2026: mezery, které mutační testování odhalilo ---------- */
const sablona = fs.readFileSync(__dirname + '/app_template.html', 'utf8');
const zakUi = fs.readFileSync(__dirname + '/ui/zakazka_ui.js', 'utf8');

/* N10a a N4 padly 12. 8. 2026 spolu s polem „Globální sleva PROJ" (#134):
 * znaménko ani horní mez se nehlídají u pole, které neexistuje. Sleva
 * projekce se zadává kladně jako každá jiná sleva a hlídá ji stejná trojice
 * pravidel (strop role, schvalování, minimální marže).
 *
 * Co se hlídat MUSÍ: že karta v projekci počítá z ceny projekce. Kdyby se
 * vrátila k výpočtu OCK, byli bychom přesně tam, kde 12. 8. 2026 začínal
 * tenhle nález. */
test('základ slevy se bere podle části', /function slevaZaklad\(/.test(spol));
test('sleva projekce se počítá z výpočtu projekce',
  /slevaZaklad[\s\S]{0,400}vypocetProj\(PJ, PC\)/.test(spol));
test('sleva projekce nebere základ z výpočtu OCK',
  !/cast === 'proj'[\s\S]{0,300}souhrn\.zakladCena/.test(spol));

/* N10b – jedna karta nad jedním stavem: kalkulace PROJ karty jen VOLÁ,
 * nesmí si stavět vlastní (druhý stav by rozdvojil politiku slevy). */
test('kalkulace PROJ kartu slevy volá, nestaví si vlastní',
  /slevaKarta\('proj'\)/.test(kalk) && !/function slevaKarta/.test(kalk));
test('kalkulace PROJ kartu zaokrouhlení volá, nestaví si vlastní',
  /zaokrKarta\('proj'\)/.test(kalk) && !/function zaokrKarta/.test(kalk));
test('funkce slevaKarta existuje právě jednou (v common.js)',
  (spol.match(/function slevaKarta/g) || []).length === 1);

/* N7 – tisk ze záložky PROJ nesmí vynést marži a stropy rolí:
 * karty slevy, zaokrouhlení a nabídky musí být v tiskovém pravidle. */
{
  /* V šabloně je víc @media print bloků; hledá se řádek, který skrývá
   * interní kontejnery (.zak-bar) – karty PROJ musí být na něm. */
  const radek = sablona.split('\n').find(l => l.includes('.zak-bar') && l.includes('display:none'));
  ['#proj-sleva', '#proj-zaokr', '#proj-nabidka'].forEach(id =>
    test('tisk skrývá ' + id, !!radek && radek.includes(id), radek));
}

/* N9 – cesta přes Apps Script je pryč („vždyť bychom ho už neměli vůbec
 * používat", 2. 8. 2026): žádné tlačítko Google Docs, žádný google.script. */
test('v UI zakázky není generování přes Apps Script',
  !/generujNabidkuDocs/.test(zakUi) && !/google\.script/.test(zakUi));

/* Karta se bez výpočtu své části nevykreslí — cena se neodhaduje. Dřív se
 * v projekci vykreslovala i po pádu výpočtu OCK, protože nesla globální slevu
 * PROJ; ta je zrušená, takže výjimka padla s ní (#134). */
test('karta slevy se bez výpočtu nevykreslí', /if \(!v \|\| !SLC\) return '';/.test(spol));

/* Paušál dopravy z ceníku (2. 8. 2026): řádek dopravy má zaškrtávátko
 * „mimo Prahu" napojené na doprava.mimoPrahu — bez něj by položka ceníku
 * „Doprava – paušál mimo Prahu" zase neměla účinek. */
test('doprava má zaškrtávátko „mimo Prahu" napojené na výpočet',
  /doprava\.mimoPrahu/.test(kalk) && /mimo Prahu/.test(kalk));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
