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
   * píše do týchž polí ZAK.*; `kde` dál rozlišuje jen otevřený panel. */
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
function aresRadek(kde, sJednotkou) {
  const hl = aresHlavicka(kde);
  const muze = typeof icoVyplneno === 'function' && icoVyplneno(hl.ico);
  const tlacitko = `<button class="mini noprint" onclick="aresHledej('${kde}')"
    title="${muze ? 'zeptat se rejstříku ARES, jaká firma pod tímto IČO je'
                  : 'nejdřív vyplňte IČO objednatele'}"${muze ? '' : ' disabled'}>🔎 Najít firmu v ARES</button>`;
  const panel = (ARES.kde === kde) ? aresPanel(kde) : '';
  const jednotka = sJednotkou ? '<span class="u"></span>' : '';
  return `<div class="row"><label></label><div>${tlacitko}</div>${jednotka}</div>${panel}`;
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
