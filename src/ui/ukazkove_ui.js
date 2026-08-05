/* ============================================================
 * UKÁZKOVÁ DATA – červená lišta (#40, UI)
 *
 * Logika je v ukazkove.js; tady je jen čtení aktuálního stavu z běžící
 * aplikace a lišta pod hlavičkou.
 *
 * Proč červená a proč se nedá zavřít: lišta stáří sestavení (build_lista)
 * se schovat dá, protože říká „tvoje kopie je stará" – nepříjemné, ale
 * čísla sedí. Tahle říká „čísla nesedí". Kdyby šla utnout jedním
 * kliknutím, přesně to by se stalo hned první den a pak by chyběla ve
 * chvíli, kdy by byla potřeba. Zhasne jediným správným způsobem –
 * připojením složky se skutečnými daty.
 *
 * Ceník se čte z AKTIVNÍ VARIANTY, ne z DEFAULT_CENIK. Varianta má ceník
 * zmrazený v okamžiku vzniku, takže to, co se počítá právě teď, může být
 * vymyšlené i tehdy, když je složka mezitím připojená.
 * ============================================================ */

function ukazkoveStavAkt() {
  const v = (typeof aktivniVarianta === 'function' && typeof ZAK !== 'undefined')
    ? aktivniVarianta(ZAK) : null;
  const d = (v && v.data) || null;
  return ukazkoveStav({
    cenik: d ? d.cenik : (typeof DEFAULT_CENIK !== 'undefined' ? DEFAULT_CENIK : null),
    cenikProj: d && d.proj ? d.proj.cenik
      : (typeof DEFAULT_CENIK_PROJ !== 'undefined' ? DEFAULT_CENIK_PROJ : null),
    slevy: (typeof NAST !== 'undefined') ? NAST.slevy : null,
    firma: (typeof NAST !== 'undefined') ? NAST.firma : null,
  });
}

/* Smí tenhle uživatel vůbec mapovat složku _DB?
 *
 * Od zavedení online databáze (4. 8. 2026) je mapování Disku výhradně věcí
 * administrátora: obchodníkovi teče ceník z online databáze a složku na
 * disku správce nemá a mít nemá. Karta úložiště se mu už skryla, ale lišta
 * ho pořád posílala „Připojit složku _DB" – hlášeno uživatelem tentýž den.
 * Rozhoduje jediná funkce, aby se to příště nerozešlo. */
function ukazkoveSlozkaSmi() {
  return (typeof smiZobrazit !== 'function') || smiZobrazit('uloziste.slozka');
}

function ukazkoveLista() {
  const s = ukazkoveStavAkt();
  if (!s.jsou) return '';
  /* Běžný uživatel: žádné tlačítko, jiná věta – viz ukazkoveSlozkaSmi(). */
  if (!ukazkoveSlozkaSmi())
    return `<div class="ukazkove-lista">
      <span class="ikona">⛔</span>
      <span>${esc(ukazkoveText(s, '', '', true))}</span>
      <span class="sp"></span>
      <span class="kde">${esc(ukazkoveVyctem(s))}</span>
    </div>`;
  /* Tlačítko rovnou v liště. Prohlížeč se na právo k zápisu do složky smí
   * zeptat jen v reakci na kliknutí, takže po restartu (a po otevření
   * nového sestavení, které je pro prohlížeč jiná stránka) zůstane složka
   * odpojená a svítí nuly. Odkaz na Nastavení → Úložiště je správný, ale
   * je to obrazovka navíc přesně ve chvíli, kdy uživatel čeká čísla. */
  const u = (typeof ULO_STAV !== 'undefined') ? ULO_STAV : null;
  const jak = ukazkovePripojeni(u, typeof uloPodporovano === 'function' && uloPodporovano());
  const jmeno = (u && u.jmeno) || '_DB';
  const tlacitko = jak
    ? `<button class="primary" onclick="uloPripojZnovu()">`
      + (jak === 'znovu' ? `Připojit znovu složku „${esc(jmeno)}"` : 'Připojit složku _DB')
      + `</button>`
    : '';
  return `<div class="ukazkove-lista">
    <span class="ikona">⛔</span>
    <span>${esc(ukazkoveText(s, jak, jmeno))}</span>
    ${tlacitko}
    <span class="sp"></span>
    <span class="kde">${esc(ukazkoveVyctem(s))}</span>
  </div>`;
}

function renderUkazkoveLista() {
  const el = document.getElementById('ukazkoveLista');
  if (el) el.innerHTML = ukazkoveLista();
}

/* Varování do náhledu dokumentu – poslední místo před odesláním.
 * Vrací prázdný řetězec, když je všechno skutečné. */
function ukazkoveTiskLista() {
  const s = ukazkoveStavAkt();
  if (!s.jsou) return '';
  return `<div class="ukazkove-tisk noprint">⛔ ${esc(ukazkoveKratce(s, !ukazkoveSlozkaSmi()))}</div>`;
}

/* ---------- zábrana: nulový ceník ----------
 * „Buď se z databáze natáhne ostrý ceník, anebo svítí všude nuly a není
 * z čeho počítat." Dokument spočítaný z nul není nabídka za nula korun,
 * je to prázdný formulář s razítkem – a ten se zákazníkovi poslat nesmí.
 * Vrací důvod (text), nebo prázdný řetězec, když je cesta volná. */
function dokumentZabrana() {
  if (typeof ukazkoveBraniDokumentu !== 'function') return '';
  const s = ukazkoveStavAkt();
  if (!ukazkoveBraniDokumentu(s)) return '';
  return ukazkoveKratce(s, !ukazkoveSlozkaSmi());
}

/* Panel na místo tlačítek. Vysvětluje, co se má stát, ne jen že to nejde –
 * uživatel, který vidí „nelze", hledá chybu v aplikaci; uživatel, který
 * vidí „připojte složku _DB", jde ji připojit. */
function ukazkoveZabranaPanel() {
  const duvod = dokumentZabrana();
  if (!duvod) return '';
  /* Nastavení → Úložiště je jen pro administrátora; běžnému uživateli by
   * tlačítko nabízelo obrazovku, na kterou se nedostane. Dostane místo něj
   * větu, se kterou se dá něco dělat. */
  const cesta = ukazkoveSlozkaSmi()
    ? `<button class="mini" onclick="otevriNastaveni()">Otevřít Nastavení → Úložiště</button>`
    : `<span class="pozn">Zveřejnění platného ceníku je práce administrátora – ozvěte se mu.</span>`;
  return `<div class="zabrana-panel">
    <div class="zabrana-hlava"><span class="ikona">⛔</span> <b>Ceník není nahraný – dokument nevznikne.</b></div>
    <div class="zabrana-txt">${esc(duvod)}</div>
    <div class="zabrana-btns">
      ${cesta}
      <span class="pozn">Tohle je jediná věc v aplikaci, která se nedá odklepnout.
        Nabídka s nulami by vypadala jako platná.</span>
    </div>
  </div>`;
}

/* Atribut do tlačítek, která vytvářejí dokument (`<button ${ukazkoveZabranaAttr()}>`). */
function ukazkoveZabranaAttr() {
  const duvod = dokumentZabrana();
  return duvod ? ` disabled title="${esc(duvod)}"` : '';
}
