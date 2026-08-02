/* ============================================================
 * STÁŘÍ CENÍKU – lišta, okno s rozdíly, přepočet (#35, UI)
 *
 * Logika je v cenik_stari.js; tady je jen to, co potřebuje DOM.
 *
 * Upozornění se ukazuje na třech místech, protože každé odpovídá na jinou
 * otázku ve chvíli, kdy ji uživatel má:
 *   – na záložce Ceník („koukám na ceny, jsou aktuální?"),
 *   – nad tlačítkem tisku v náhledu nabídky („tohle za chvíli odejde ven"),
 *   – ve stavovém řádku po načtení zakázky ze souboru („otevřel jsem něco starého").
 *
 * Nikde to není tvrdá zábrana. Ceník bývá u konkrétní zakázky upravený
 * záměrně a aplikace nemá jak poznat rozdíl mezi „zapomenutá cena" a
 * „dohodnutá cena" – to ví jen člověk. Rozsvítit varování je maximum, co si
 * může dovolit; kdo ceny drží schválně, hlídání jedním kliknutím ztiší.
 * ============================================================ */

/* Dnešní ceník = ten, který nese sestavení aplikace. */
function cenikDnesniData() {
  return { cenik: (typeof DEFAULT_CENIK !== 'undefined') ? DEFAULT_CENIK : {},
           proj: { cenik: (typeof DEFAULT_CENIK_PROJ !== 'undefined') ? DEFAULT_CENIK_PROJ : {} } };
}

/* Verze ceníku, která teď platí (#39). Bez načtené složky žádná není –
 * `progPlatnaVerzeInfo` v tom případě vrací prázdno a přehled o verzích
 * mlčí, místo aby si nějaké číslo domyslel. */
function cenikPlatnaVerzeInfo() {
  return (typeof progPlatnaVerzeInfo === 'function')
    ? progPlatnaVerzeInfo() : { verze: null, platnoOd: '' };
}

function cenikPrehledAkt() {
  const v = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : null;
  if (!v) return null;
  return cenikPrehled(v, cenikDnesniData(),
    Object.assign({ datum: ZAK && ZAK.datum }, cenikPlatnaVerzeInfo()));
}

/* Lišta pro záložku Ceník i pro náhled nabídky. Prázdný řetězec = ticho. */
function cenikStariLista(opts) {
  opts = opts || {};
  const p = cenikPrehledAkt();
  if (!p || !p.varovat) return '';
  const veta = cenikVarovaniText(p);
  const tlacitka = opts.bezTlacitek ? '' : `
    <div class="btns" style="margin-top:6px">
      <button class="mini primary" onclick="otevriPrepocet()">Zobrazit rozdíly a přepočítat…</button>
      <button class="mini" onclick="cenikDohodnute()"
        title="ceny v této variantě jsou sjednané a mají zůstat – upozornění se ztiší, dokud se ceník znovu nezmění">Ceny jsou dohodnuté</button>
    </div>`;
  return `<div class="cenik-stari noprint">⚠ ${esc(veta)}${tlacitka}</div>`;
}

/* Ze které verze ceníku tahle kalkulace počítá (#39).
 *
 * Tichá informace, ne poplach – proto `note`, ne varovný pruh. Ukazuje se
 * i tehdy, když se nic neliší: právě tehdy je nejlevnější si toho všimnout.
 * Když verze zaostává, přidá se rovnou i to, co to znamená – „co s tím teď
 * mám dělat" je otázka, která přijde hned po „ceník se změnil". */
function cenikVerzeLista() {
  const p = cenikPrehledAkt();
  if (!p || !p.verze) return '';
  let t = 'Kalkulace počítá z ' + (p.verzeText || ('verze ' + p.verze + ' ceníku'));
  if (p.verzeOdvozena) t += ' (podle shody cen – razítko verze v zakázce chybí)';
  t += '.';
  if (p.verzeZaostava) t += ' Teď platí '
    + (p.verzeDnesText || ('verze ' + p.verzeDnes + ' ceníku')) + '. ' + cenikDopadText();
  return `<div class="note noprint">${esc(t)}</div>`;
}

/* Věta o stáří samotného ceníku aplikace. Platí i pro úplně novou zakázku,
 * takže se ukazuje vždy, ne jen při rozdílu. */
function cenikStariAplikaceText() {
  const s = cenikStariCeniku(new Date().toISOString().slice(0, 10));
  if (!s.nejstarsi) return '';
  return 'Nejstarší datovaná cena v ceníku aplikace je „' + s.nejstarsi.popis + '" z '
    + cenikDatumCz(s.nejstarsi.datum) + '. U ' + s.bezData + ' z ' + s.celkem
    + ' položek není v poznámce uvedeno, kdy se naposledy ověřovaly.';
}

function cenikDohodnute() {
  const v = aktivniVarianta(ZAK);
  const p = cenikPrehledAkt();
  if (!v || !p) return;
  cenikKvitovat(v, p.otisk, (typeof zamekKdo === 'function') ? zamekKdo() : '');
  syncVarianta();
  render();
}

/* ---------- okno s rozdíly ---------- */

/* Výběr položek k přepočtu. Zaškrtnuté je všechno, ale dá se to rozebrat –
 * typicky se přebírá nový ceník kromě jedné dohodnuté ceny. */
let PREPOCET_VYBER = null;   // Set(cest) nebo null, když je okno zavřené

function otevriPrepocet() {
  const p = cenikPrehledAkt();
  if (!p || !p.rozdily.length) return;
  PREPOCET_VYBER = new Set(p.rozdily.map(r => r.cesta));
  document.getElementById('prepocet-overlay').style.display = 'flex';
  renderPrepocet();
}
function zavriPrepocet() {
  PREPOCET_VYBER = null;
  const el = document.getElementById('prepocet-overlay');
  if (el) el.style.display = 'none';
}
function prepocetOtevreno() {
  const el = document.getElementById('prepocet-overlay');
  return !!(el && el.style.display !== 'none');
}

function prepocetPrepni(cesta, zap) {
  if (!PREPOCET_VYBER) return;
  if (zap) PREPOCET_VYBER.add(cesta); else PREPOCET_VYBER.delete(cesta);
  prepocetPocetSet();
}
function prepocetVse(zap) {
  const p = cenikPrehledAkt();
  if (!p || !PREPOCET_VYBER) return;
  PREPOCET_VYBER = new Set(zap ? p.rozdily.map(r => r.cesta) : []);
  renderPrepocet();
}
function prepocetPocetSet() {
  const el = document.getElementById('prepocetPocet');
  if (el) el.textContent = PREPOCET_VYBER ? String(PREPOCET_VYBER.size) : '0';
  const btn = document.getElementById('prepocetBtn');
  if (btn) btn.disabled = !PREPOCET_VYBER || PREPOCET_VYBER.size === 0;
}

function cenikCisloText(r) {
  if (!r.cislo) return { stara: String(r.stara == null ? '—' : r.stara),
                         nova: String(r.nova == null ? '—' : r.nova) };
  const f = (x) => (typeof fmt === 'function') ? fmt(x) : String(x);
  const podil = /podíl/.test(r.jed || '');
  const g = (x) => podil ? (Math.round(x * 1000) / 10).toString().replace('.', ',') + ' %' : f(x);
  return { stara: g(r.stara), nova: g(r.nova) };
}

function prepocetRadek(r) {
  const t = cenikCisloText(r);
  const zn = r.zmena == null ? '' : (r.zmena > 0 ? 'up' : 'down');
  const zaskrt = PREPOCET_VYBER && PREPOCET_VYBER.has(r.cesta);
  return `<tr>
    <td><input type="checkbox" ${zaskrt ? 'checked' : ''}
      onchange="prepocetPrepni('${escJs(r.cesta)}', this.checked)"></td>
    <td>${esc(r.popis)}<div class="note" style="margin:0">${esc(r.skupina)} · ${esc(r.sekce)}</div></td>
    <td style="text-align:right;white-space:nowrap">${esc(t.stara)}</td>
    <td style="text-align:right;white-space:nowrap">${esc(t.nova)}</td>
    <td style="text-align:right;white-space:nowrap" class="zm-${zn}">${esc(cenikProcento(r.zmena))}</td>
    <td class="note">${esc(r.jed || '')}</td>
  </tr>`;
}

function renderPrepocet() {
  const panel = document.getElementById('prepocet-panel');
  if (!panel) return;
  const p = cenikPrehledAkt();
  if (!p) { panel.innerHTML = ''; return; }
  const v = aktivniVarianta(ZAK);
  const s = p.souhrn;
  panel.innerHTML = `
    <h2>Přepočet ceníku
      <span class="note" style="font-weight:400">varianta „${esc(v ? v.nazev : '')}"</span>
      <button class="mini" style="margin-left:auto" onclick="zavriPrepocet()">Zavřít</button></h2>
    <div class="body">
    <div class="note" style="margin-bottom:8px">
      Porovnává se ceník uložený v této variantě s ceníkem, který nese dnešní sestavení aplikace.
      Zaškrtnuté položky se přepíšou na dnešní ceny, <b>zadání kalkulace se nemění</b>.
      Co je sjednané se zákazníkem nebo dodavatelem, odškrtni – zůstane, jak je.
    </div>
    <div class="archiv-soubory">
      <span>Zdraženo: <b>${s.zdrazeni}</b> · zlevněno: <b>${s.zlevneni}</b>${s.textove ? ` · textových změn: <b>${s.textove}</b>` : ''}</span>
      <button class="mini" onclick="prepocetVse(true)">Zaškrtnout vše</button>
      <button class="mini" onclick="prepocetVse(false)">Odškrtnout vše</button>
    </div>
    <div id="prepocetTelo">
      <table class="archtbl" style="width:100%">
        <tr><th style="width:28px"></th><th>Položka</th><th style="text-align:right">V kalkulaci</th>
            <th style="text-align:right">Dnes</th><th style="text-align:right">Změna</th><th>Jednotka</th></tr>
        ${p.rozdily.map(prepocetRadek).join('')}
      </table>
    </div>
    <div class="btns" style="margin-top:10px">
      <button class="primary" id="prepocetBtn" onclick="prepocetProved()">Přepočítat vybrané (<span id="prepocetPocet">${p.rozdily.length}</span>)</button>
      <button onclick="zavriPrepocet()">Nechat beze změny</button>
    </div>
    <div class="note" style="margin-top:8px">${esc(cenikDopadText())}
      Přepočet jde vrátit zpět (Ctrl+Z) a zamčenou variantu nezmění – ta už odešla zákazníkovi.
      ${esc(cenikStariAplikaceText())}</div>
    </div>`;
  prepocetPocetSet();
}

function prepocetProved() {
  const v = aktivniVarianta(ZAK);
  if (!v || !PREPOCET_VYBER || !PREPOCET_VYBER.size) return;
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) {
    alert('Varianta je uzamčená – ceny odeslané nabídky se nepřepisují. Pokračujte jejím klonem.');
    return;
  }
  /* Krok zpět se nikde nezapisuje ručně – historieTik() na konci render()
   * si snímek pořídí sám, takže Ctrl+Z funguje i po přepočtu. */
  const r = cenikPrepocti(v, cenikDnesniData(), Object.assign({
    cesty: Array.from(PREPOCET_VYBER),
    build: (typeof buildVerze === 'function') ? buildVerze() : '',
  }, cenikPlatnaVerzeInfo()));
  zavriPrepocet();
  syncVarianta();
  render();
  if (typeof nabidkaStavTextBezpecne === 'function')
    nabidkaStavTextBezpecne('Ceník varianty přepočítán – změněno ' + r.zmen
      + (r.zmen === 1 ? ' položka' : (r.zmen < 5 ? ' položky' : ' položek'))
      + '. Zadání zůstalo beze změny, vrátit jde přes Zpět (Ctrl+Z).');
}
