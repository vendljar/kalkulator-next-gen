/* ================= ARES v hlavičce: „kdo to vlastně je?" (#10) =================
 * Tlačítko u pole IČO se zeptá rejstříku a ukáže, jaká firma se pod číslem
 * skrývá. Přepsat hlavičku nabídne až potom – a jmenovitě, řádek po řádku,
 * s tím, co v poli stojí teď a co by v něm stálo. Nic se nepřepíše samo
 * (zadání z 30. 7. 2026: „ukaž jaká firma se pod IČO skrývá a přidej volbu
 * data přepsat po potvrzení").
 *
 * Aplikace běží často z lokálního souboru, kde prohlížeč dotaz na cizí server
 * zablokuje. To není chyba, se kterou by šlo něco udělat – proto se výpadek
 * hlásí větou, ne vykřičníkem, a vždy s poznámkou, že hlavička zůstává, jak
 * byla, a jde vyplnit ručně.
 *
 * Stav je jeden pro celou aplikaci a nese v sobě, u které hlavičky se zeptalo
 * (`kde`). Obě hlavičky jsou vidět zároveň na Přehledu nabídek; bez toho by
 * odpověď pro OCK vyskočila i pod hlavičkou PROJ a přepsala by se špatná. */

const ARES = { kde: '', ico: '', hleda: false, subjekt: null, chyba: '', cas: 0 };
const ARES_CEKANI = 12000;   // rejstřík odpovídá do vteřiny; delší ticho = výpadek

/* Které hlavičce ta odpověď patří. 'ock' jsou pole přímo na zakázce,
 * 'proj' je oddělená hlavička projekce (ZAK.projHlavicka). */
function aresHlavicka(kde) {
  /* Od 19. 8. 2026 je hlavička jedna společná — ARES z obou kalkulací
   * píše do týchž polí ZAK.*; `kde` dál rozlišuje jen otevřený panel.
   * Od 21. 8. 2026 umí ARES plnit i KARTU ZÁKAZNÍKA (`kde === 'zakaznik'`):
   * ta má jiná jména polí, takže si `zakaznici_ui.js` podává průhledný
   * převodník — ARES o něm nemusí vědět nic navíc. */
  if (kde === 'zakaznik' && typeof zakaznikAresHlavicka === 'function')
    return zakaznikAresHlavicka();
  return ZAK;
}

function aresZavri() { ARES.kde = ''; ARES.subjekt = null; ARES.chyba = ''; ARES.hleda = false; render(); }

async function aresHledej(kde) {
  const hl = aresHlavicka(kde);
  const ico = hl.ico;
  ARES.kde = kde; ARES.subjekt = null; ARES.chyba = ''; ARES.ico = icoNormalizuj(ico);

  if (!icoVyplneno(ico)) { ARES.chyba = aresHlaska('prazdne'); render(); return; }
  const url = aresUrl(ico);
  if (!url) { ARES.chyba = aresHlaska('neplatne', ico); render(); return; }

  ARES.hleda = true; render();
  /* Bez časového stropu by se ve špatné síti točilo kolečko donekonečna
   * a uživatel by neměl jak poznat, že už se čeká zbytečně. */
  const stop = (typeof AbortController === 'function') ? new AbortController() : null;
  const hodiny = stop ? setTimeout(() => stop.abort(), ARES_CEKANI) : null;
  try {
    const odp = await fetch(url, stop ? { signal: stop.signal } : undefined);
    if (odp.status === 404) { ARES.chyba = aresHlaska('nenalezeno', ico); }
    else if (!odp.ok) { ARES.chyba = aresHlaska('jina', ico); }
    else {
      const s = aresZpracuj(await odp.json());
      if (!s) ARES.chyba = aresHlaska('nenalezeno', ico);
      else ARES.subjekt = s;
    }
  } catch (e) {
    /* Sem spadne odmítnutí kvůli CORS, běh ze souboru i utnutý časový strop –
     * pro uživatele je to všechno jedna situace: rejstřík není k dispozici. */
    ARES.chyba = aresHlaska('sit', ico);
  } finally {
    if (hodiny) clearTimeout(hodiny);
    ARES.hleda = false;
    render();
  }
}

/* Potvrzení přepisu. Mění se přesně ty řádky, které byly na obrazovce –
 * `aresRozdily` se počítá znovu z týchž dat, takže mezi zobrazením a klikem
 * nemůže přibýt pole, které uživatel neviděl. Změny hlavičky si zapisuje
 * protokol zakázky sám (porovnává stav před a po), tady se nic neloguje ručně. */
function aresPrepisPotvrd(kde) {
  const hl = aresHlavicka(kde);
  if (!ARES.subjekt) return;
  const pocet = aresPrepis(hl, ARES.subjekt);
  if (pocet) aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  ARES.kde = ''; ARES.subjekt = null; ARES.chyba = '';
  render();
}

/* Tlačítko pod polem IČO + panel s odpovědí. Vrací celý řádek, aby se dal
 * vložit za IČO v obou hlavičkách beze změny `inp()`.
 *
 * `sJednotkou` řeší zarovnání (zadání 31. 7. 2026). Řádky z `inp()` končí
 * prázdným sloupečkem jednotky `<span class="u">` (34 px + 8 px mezera), takže
 * jejich pravý okraj nesahá až na kraj řádku. Bez téhož sloupečku by tlačítko
 * na kartě „Zakázka – hlavička" trčelo o 42 px doprava mimo řadu ostatních
 * buněk. V liště nad kalkulací se jednotky nepoužívají – tam se volá bez
 * parametru a řádek zůstává, jak byl. */
/* `navic` (21. 8. 2026) = další tlačítka do TÉHOŽ řádku. Používá ho hlavička
 * zakázky pro databázi zákazníků: „najít v ARES" a „vybrat z databáze" jsou
 * dvě odpovědi na jednu otázku (odkud vzít údaje o firmě), takže patří vedle
 * sebe, ne pod sebe. */
function aresRadek(kde, sJednotkou, navic) {
  const hl = aresHlavicka(kde);
  const muze = typeof icoVyplneno === 'function' && icoVyplneno(hl.ico);
  /* `margin-left:auto` drží ARES u PRAVÉ hrany řádku, ať jsou vedle něj dvě
   * tlačítka databáze zákazníků, nebo žádné. Zarovnání pravé hrany s polem
   * IČO hlídá overit_lista.mjs. */
  const tlacitko = `<button class="mini noprint" style="margin-left:auto" onclick="aresHledej('${kde}')"
    title="${muze ? 'zeptat se rejstříku ARES, jaká firma pod tímto IČO je'
                  : 'nejdřív vyplňte IČO zákazníka'}"${muze ? '' : ' disabled'}>Najít firmu v ARES</button>`;
  const panel = (ARES.kde === kde) ? aresPanel(kde) : '';
  /* Prázdný sloupeček „jednotka" se kreslí jen tam, kde ho mají i řádky
   * s poli — jinak by tlačítková řada končila o 42 px JINDE než pole nad ní.
   * Do 21. 8. 2026 stála hlavička v kartě Přehledu, jejíž řádky z inp()
   * jednotku měly, a spacer byl proto vždycky. Po přestěhování hlavičky
   * do lišty nad kalkulací (kde se řádky skládají bez jednotky) by ale
   * pravou hranu naopak rozhodil. Rozhoduje tedy volající. Zarovnání
   * hlídá overit_lista.mjs. */
  const jednotka = sJednotkou ? '<span class="u"></span>' : '';
  /* Pořadí (21. 8. 2026, zadání J. V.): nejdřív databáze zákazníků, pak
   * uložení, ARES až nakonec — u známého zákazníka je databáze rychlejší
   * cesta než rejstřík. Řádek se roztahuje přes popisek i pole, takže levá
   * hrana lícuje s textem „IČO zákazníka" a pravá s koncem pole. */
  /* `space-between` roztáhne trojici přes celou šířku řádku: první tlačítko
   * lícuje zleva s popiskem „IČO zákazníka", poslední zprava s koncem pole
   * IČO (zadání J. V. 21. 8. 2026). Zarovnání pravé hrany hlídá
   * overit_lista.mjs — proto je ARES schválně poslední. */
  /* Řádek si NEPŘENASTAVUJE gap: `.row` má 8 px a podle nich se počítá, kde
   * končí sloupec s poli. Vlastních 6 px posunulo pravou hranu o dva pixely
   * a zarovnání se rozešlo (nález ze zkoušky 21. 8. 2026). */
  /* JEDEN ŘÁDEK, NE DVA (21. 8. 2026 večer). `flex-wrap:wrap` lámal poslední
   * tlačítko pod ostatní, jakmile se trojice o pár pixelů nevešla — a vypadalo
   * to jako porucha. Zalamování je proto vypnuté a tlačítka se smějí zúžit
   * (`min-width:0`); místo na to vzniklo tím, že z popisků zmizely ikonky
   * a tři tečky (zadání J. V.: „pokud se tlačítka vedle sebe nevejdou,
   * odstraň z tlačítek ikonky"). Delší popisek se v úzkém okně zkrátí
   * výpustkou, ale řádek zůstane jeden. */
  return `<div class="row noprint">
      <div class="ares-tlacitka">${navic || ''}${tlacitko}</div>
      ${jednotka}</div>${panel}`;
}

function aresPanel(kde) {
  if (ARES.hleda)
    return `<div class="ares-panel"><div class="ares-hlava">Ptám se rejstříku ARES na IČO ${esc(ARES.ico)}…</div></div>`;

  if (ARES.chyba)
    return `<div class="ares-panel chyba">
      <div class="ares-hlava">Firma se nenačetla</div>
      <div class="ares-txt">${esc(ARES.chyba)}</div>
      <div class="ares-btns"><button class="mini" onclick="aresZavri()">Zavřít</button></div>
    </div>`;

  const s = ARES.subjekt;
  if (!s) return '';
  const rozd = aresRozdily(aresHlavicka(kde), s);
  const zanik = s.zanikla
    ? `<div class="ares-txt varovne">Pozor: rejstřík vede tento subjekt jako <b>zaniklý</b>
       (${esc(s.datumZaniku)}). Nabídku mu asi posílat nechcete – zkontrolujte IČO.</div>` : '';

  const tabulka = rozd.length
    ? `<table class="ares-tab"><tr><th>Údaj</th><th>V hlavičce teď</th><th>Z rejstříku</th></tr>
        ${rozd.map(r => `<tr><td>${esc(r.label)}</td>
          <td class="stara">${r.ted ? esc(r.ted) : '<i>prázdné</i>'}</td>
          <td class="nova">${esc(r.nove)}</td></tr>`).join('')}</table>
       <div class="ares-btns">
         <button class="primary" onclick="aresPrepisPotvrd('${kde}')">Přepsat údaje v hlavičce (${rozd.length})</button>
         <button onclick="aresZavri()">Nechat, jak je</button>
       </div>`
    : `<div class="ares-txt">Hlavička už tyhle údaje obsahuje – přepisovat není co.</div>
       <div class="ares-btns"><button onclick="aresZavri()">Zavřít</button></div>`;

  return `<div class="ares-panel">
    <div class="ares-hlava">${esc(s.nazev)}</div>
    <div class="ares-txt">${esc(aresPopis(s))}${s.dic ? ' · DIČ ' + esc(s.dic) : ''}</div>
    ${zanik}
    ${tabulka}
    <div class="ares-zdroj">Zdroj: veřejný rejstřík ARES (Ministerstvo financí ČR).
      Přepis se provede jen na tomhle potvrzení a zapíše se do protokolu zakázky.</div>
  </div>`;
}
