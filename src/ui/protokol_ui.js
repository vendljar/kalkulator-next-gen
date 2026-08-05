/* ============================================================
 * PROTOKOL O KALKULACI – obrazovka (#41)
 *
 * Karta na záložce Zakázka, úplně dole. Logika je celá v protokol.js;
 * tady je jen zápis do protokolu v běhu aplikace a jeho vypsání.
 *
 * Tři věci, které se tu dělají schválně jinak, než by se čekalo:
 *
 *   – Zapisuje se se zpožděním (PROTOKOL_KLID), ne po každém překreslení.
 *     Každé písmeno v poli „Název akce“ spustí render(). Kdyby se zapisovalo
 *     hned, měl by protokol dvacet řádků o jednom slově a informace by v nich
 *     utonula. Otisk se proto porovná až po chvilce klidu; z celého ťukání
 *     vznikne jeden řádek „prázdné → Bytový dům Kolbenova“. Sloučení stejného
 *     pole navíc řeší i protokol.js, aby se dvě pauzy v jednom poli nepočítaly
 *     jako dvě rozhodnutí.
 *
 *   – protokolTik() stojí v render() PŘED historieTik(). Zapsaný řádek je
 *     změna zakázky jako každá jiná; kdyby přišel až po historii, historie by
 *     ho viděla o překreslení později a „Zpět“ by nejdřív vracelo zápis do
 *     protokolu místo práce uživatele.
 *
 *   – Citlivé hodnoty (ceník = náklady firmy) vidí jen administrátor, a to
 *     přísněji než u marže: marže je stav („jsme pod hranicí“), kdežto tady
 *     by šla o nákupní cenu položky. Běžný uživatel se dozví, že se ceník
 *     měnil a kdo to udělal – částky ne. Kdyby to bylo jinak, byl by protokol
 *     zadními vrátky do ceníku pro toho, kdo do něj nesmí.
 *
 * Protokol se nikdy netiskne a do žádného dokumentu pro zákazníka nejde.
 * ============================================================ */

const PROTOKOL_KLID = 2000;    // ms klidu, než se změny zapíšou
const PROTOKOL_STRANKA = 50;   // kolik řádků se ukáže, než si člověk řekne o víc

const PROT = {
  otisk: null,     // otisk zakázky po posledním zápisu
  klic: null,      // které zakázce ten otisk patří
  log: [],         // poslední známý protokol (pojistka proti kroku „Zpět“)
  timer: null,
};

let PROT_JEN_VARIANTA = false;
let PROT_VSE = false;

function protokolZak() {
  return (typeof ZAK !== 'undefined' && ZAK) ? protokolZajisti(ZAK) : null;
}
function protokolKdo() {
  return (typeof NAST !== 'undefined' && NAST && NAST.uzivatel) ? String(NAST.uzivatel) : '';
}

/* Kdo smí vidět čísla. Viz hlavička: přísněji než marzeSmiCisla(). */
function protokolSmiCisla() {
  return typeof smiZobrazit === 'function' ? smiZobrazit('protokol.cisla') : false;
}

/* ---------- zápis v běhu aplikace ---------- */

/* Volá se na konci každého render(). Sám nic nezapisuje – jen si pohlídá,
 * že sedí otisk, vrátí případné vygumované záznamy a naplánuje zápis. */
function protokolTik() {
  const zak = protokolZak();
  if (!zak) return;
  if (PROT.klic !== zak.protokolKlic) {
    /* Jiná zakázka (nová, otevřená ze souboru, načtená ze složky). Její
     * protokol si přinesla s sebou; předchozí se sem nesmí přimíchat. */
    PROT.klic = zak.protokolKlic;
    PROT.log = zak.protokol.slice();
    PROT.otisk = protokolOtisk(zak);
    protokolZrusTimer();
    return;
  }
  /* Táž zakázka, ale možná jiný objekt – po kroku „Zpět“ je v ní starší
   * a kratší protokol. Co se stalo, se neodestává. */
  protokolDopln(zak, PROT.log);
  PROT.log = zak.protokol.slice();
  if (PROT.otisk === null) { PROT.otisk = protokolOtisk(zak); return; }
  if (protokolOtisk(zak) === PROT.otisk) return;
  protokolNaplanuj();
}

function protokolZrusTimer() {
  if (PROT.timer) { clearTimeout(PROT.timer); PROT.timer = null; }
}

function protokolNaplanuj() {
  protokolZrusTimer();
  PROT.timer = setTimeout(() => { PROT.timer = null; protokolZapisTed(); }, PROTOKOL_KLID);
}

/* Porovná otisk se stavem a rozdíl zapíše. Vrací počet zapsaných řádků.
 * Nevolá render() sama od sebe: karta se překreslí při nejbližší akci a
 * překreslovat obrazovku kvůli řádku v protokolu by uživateli utíkalo pod
 * rukama. Jedinou výjimkou je otevřená karta protokolu – tam by prodleva
 * vypadala jako že protokol nefunguje. */
function protokolZapisTed() {
  protokolZrusTimer();          // volá se i mimo časovač (před uložením)
  const zak = protokolZak();
  if (!zak || PROT.otisk === null) return 0;
  let pred = null;
  try { pred = JSON.parse(PROT.otisk); } catch (e) { pred = null; }
  if (!pred) { PROT.otisk = protokolOtisk(zak); return 0; }
  const zapsane = protokolZaznamenej(zak, pred, { kdo: protokolKdo() });
  PROT.otisk = protokolOtisk(zak);
  PROT.log = zak.protokol.slice();
  if (zapsane.length && document.getElementById('protokolTelo')) renderProtokol();
  return zapsane.length;
}

/* ---------- vykreslení ---------- */

function protokolVariantaPrepni() { PROT_JEN_VARIANTA = !PROT_JEN_VARIANTA; render(); }
function protokolVsePrepni() { PROT_VSE = !PROT_VSE; render(); }

function protokolRadekHtml(z, cisla) {
  const kdo = z.kdo ? esc(z.kdo) : 'neuvedeno';
  const varianta = z.variantaNazev
    ? `<span class="prot-var">${esc(z.variantaNazev)}</span>` : '';
  let hodnoty = '';
  if (z.pred !== undefined || z.po !== undefined) {
    hodnoty = (cisla || !z.citlive)
      ? `<span class="prot-hod"><span class="pred">${esc(protokolHodnota(z.pred))}</span>
         <span class="sip">→</span> <span class="po">${esc(protokolHodnota(z.po))}</span></span>`
      : `<span class="prot-hod skryto">hodnoty vidí administrátor</span>`;
  }
  return `<li class="prot-radek${z.citlive ? ' citlivy' : ''}">
    <div class="prot-hlava">
      <span class="prot-kde">${esc(z.kde || 'Zakázka')}</span>
      ${varianta}
      <span class="prot-kdy">${esc(protokolDatum(z.kdy))}, ${kdo}</span>
    </div>
    <div class="prot-co">${esc(z.co)} ${hodnoty}</div></li>`;
}

/* Tělo se plní zvlášť, aby šlo překreslit jen protokol (po zápisu ze
 * setTimeout) bez globálního render(). */
function renderProtokol() {
  const el = document.getElementById('protokolTelo');
  if (!el) return;
  const zak = protokolZak();
  if (!zak) { el.innerHTML = ''; return; }
  const akt = (typeof aktivniVarianta === 'function') ? aktivniVarianta(zak) : null;
  const seznam = protokolSeznam(zak,
    PROT_JEN_VARIANTA && akt ? { varianta: akt.id } : {});
  if (!seznam.length) {
    el.innerHTML = `<div class="note">Zatím se nic nezapsalo. Protokol začíná běžet od chvíle,
      kdy se zakázka poprvé otevřela v této verzi aplikace – zpětně se nic dopočítat nedá.</div>`;
    return;
  }
  const cisla = protokolSmiCisla();
  const ukaz = PROT_VSE ? seznam : seznam.slice(0, PROTOKOL_STRANKA);
  const vic = seznam.length - ukaz.length;
  el.innerHTML = `<ul class="prot-seznam">${ukaz.map(z => protokolRadekHtml(z, cisla)).join('')}</ul>`
    + (vic > 0 || PROT_VSE
      ? `<div class="btns" style="margin-top:6px"><button class="mini" onclick="protokolVsePrepni()">
         ${PROT_VSE ? 'Zkrátit na posledních ' + PROTOKOL_STRANKA : 'Zobrazit i starších ' + vic}</button></div>`
      : '');
}

/* Stažení protokolu jako textu. Citlivé hodnoty se řídí stejným pravidlem
 * jako na obrazovce – kdo je nevidí v aplikaci, nedostane je ani souborem. */
function protokolStahni() {
  const zak = protokolZak();
  if (!zak) return;
  const hlavicka = 'Protokol o kalkulaci\nZakázka: ' + (zak.cislo || '') + ' ' + (zak.nazevAkce || '')
    + '\nVytištěno: ' + protokolDatum(protokolTed())
    + (protokolSmiCisla() ? '' : '\nPoznámka: hodnoty z ceníku vidí jen administrátor.')
    + '\n\n';
  const blob = new Blob([hlavicka + protokolText(zak, { cisla: protokolSmiCisla() })],
                        { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'protokol_' + String(zak.cislo || 'zakazka').replace(/[^\w.-]+/g, '_') + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function protokolKarta() {
  const zak = protokolZak();
  if (!zak) return '';
  const sh = protokolShrnuti(zak);
  const akt = (typeof aktivniVarianta === 'function') ? aktivniVarianta(zak) : null;
  const lide = sh.uzivatele.filter(Boolean);
  const souhrn = sh.pocet
    ? `${sh.pocet} záznamů, od ${esc(protokolDatum(sh.prvni))} do ${esc(protokolDatum(sh.posledni))}`
      + (lide.length ? `, zapsali: ${esc(lide.join(', '))}` : ', bez podpisu (není vyplněné jméno uživatele)')
    : 'zatím prázdný';

  const ovladani = `<div class="btns" style="flex-wrap:wrap">
    ${akt ? `<button class="mini${PROT_JEN_VARIANTA ? ' primary' : ''}" onclick="protokolVariantaPrepni()">
       ${PROT_JEN_VARIANTA ? 'Zobrazit celou zakázku' : 'Jen varianta ' + esc(akt.nazev || '')}</button>` : ''}
    <button class="mini" onclick="protokolStahni()">Stáhnout jako text</button>
    <span class="note">${souhrn}</span>
  </div>`;

  return ovladani + `<div id="protokolTelo"></div>`
    + `<div class="note" style="margin-top:10px"><b>Protokol se netiskne</b> – neobjeví se v cenové
       nabídce, krycím listu ani v technické specifikaci; cestuje jen uvnitř souboru zakázky.
       Zapisuje se sám z toho, co se v datech opravdu změnilo, takže zachytí i změny, které nikdo
       nezadal ručně (načtení ceníku, migrace při otevření staršího souboru). Doťukávání jedné
       hodnoty je jeden řádek, ne cesta přes mezistavy. Hromadná změna (nový ceník) se vypíše po
       ${PROTOKOL_DAVKA_MAX} řádcích a zbytek se shrne. Drží se posledních ${PROTOKOL_MAX} záznamů,
       aby zakázka zůstala odeslatelná e-mailem; krok <b>Zpět</b> protokol nemaže.
       ${protokolSmiCisla() ? 'Jako administrátor vidíte i hodnoty z ceníku.'
                            : 'Hodnoty z ceníku jsou skryté – jsou to náklady firmy; vidí je administrátor.'}</div>`;
}
