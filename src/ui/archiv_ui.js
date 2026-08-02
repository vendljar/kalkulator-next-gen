/* ========== HISTORICKÉ KALKULACE A ALTERNATIVNÍ NABÍDKA – UI (#17) =========
 *
 * Model (záznamy, hledání, řazení, založení alternativy) je v archiv.js;
 * tady je jen panel, otevírání souborů a vykreslení tabulky.
 *
 * ODKUD SE BEROU „HISTORICKÉ" KALKULACE:
 * aplikace zatím nemá server ani sdílené úložiště (#11, #29), zakázky žijí
 * jako soubory JSON na disku. Uživatel proto do archivu sám ukáže soubory,
 * do kterých chce nahlédnout – klidně několik najednou. Otevřená zakázka se
 * tím nezavírá; nahlédnutí je vedle ní, ne místo ní.
 *
 * PROČ SE ARCHIV NEUKLÁDÁ DO PROHLÍŽEČE:
 * v záznamech jsou ceny, náklady i marže cizích zakázek. Na sdíleném počítači
 * by se v prohlížeči postupně nasbírala celá historie firmy a zůstala tam i
 * pro toho, kdo si jen půjčil místo u stolu. Archiv proto žije jen do zavření
 * záložky – po obnovení stránky se soubory ukazují znovu.
 *
 * PROČ SE Z ARCHIVU NEDĚLÁ NOVÁ ZAKÁZKA:
 * z historické kalkulace se dělá alternativa k tomu, co se právě počítá –
 * tedy další varianta uvnitř otevřené zakázky. Dostane vlastní číslo nabídky
 * v řadě zakázky (.1, .2, .3 …), takže je z papíru vidět, že patří k ní. */

let ARCHIV = [];
const ARCHIV_POHLED = { hledat: '', klic: 'datum', smer: -1 };
let ARCHIV_ZPRAVA = '';

/* ---------- otevření a zavření panelu ---------- */

function otevriArchiv() {
  renderArchiv();
  const o = document.getElementById('archiv-overlay');
  if (o) o.style.display = 'flex';
  const h = document.getElementById('archivHledat');
  if (h) h.focus();
}

function zavriArchiv() {
  const o = document.getElementById('archiv-overlay');
  if (o) o.style.display = 'none';
}

function archivOtevreno() {
  const o = document.getElementById('archiv-overlay');
  return !!(o && o.style.display !== 'none');
}

/* ---------- nahlédnutí do souborů ----------
 * Soubory se čtou všechny naráz a chyba jednoho neshodí zbytek – kdo označí
 * deset souborů, nechce kvůli jednomu poškozenému začínat znovu. */
function archivNactiSoubory(ev) {
  const soubory = [...(ev.target.files || [])];
  ev.target.value = '';
  if (!soubory.length) return;

  Promise.all(soubory.map(f => f.text().then(
    t => ({ jmeno: f.name, text: t }),
    e => ({ jmeno: f.name, chyba: e.message }))))
    .then(vysledky => {
      let pridano = 0, nahrazeno = 0, souboru = 0;
      const chyby = [];
      vysledky.forEach(r => {
        if (r.chyba) { chyby.push(r.jmeno + ' (' + r.chyba + ')'); return; }
        let zak;
        try { zak = StorageAdapter.importuj(r.text); }
        catch (e) { chyby.push(r.jmeno + ' (' + e.message + ')'); return; }
        const zaznamy = archivZaznamyZeZakazky(zak, { soubor: r.jmeno });
        if (!zaznamy.length) { chyby.push(r.jmeno + ' (žádná kalkulace uvnitř)'); return; }
        const v = archivPridej(ARCHIV, zaznamy);
        ARCHIV = v.archiv; pridano += v.pridano; nahrazeno += v.nahrazeno; souboru++;
      });

      const casti = [];
      if (souboru) casti.push('Nahlédnuto do ' + souboru + ' ' + (souboru === 1 ? 'souboru' : 'souborů'));
      /* Čeština má u počtů tři tvary: 1 kalkulace přibyla, 2–4 kalkulace přibyly,
       * od 5 výš přibylo kalkulací. Bez toho hlásí panel „přibylo 4 kalkulací“,
       * což vypadá jako chyba programu, i když je načtení v pořádku. */
      if (pridano) casti.push(pridano === 1 ? 'přibyla 1 kalkulace'
        : (pridano < 5 ? 'přibyly ' + pridano + ' kalkulace' : 'přibylo ' + pridano + ' kalkulací'));
      if (nahrazeno) casti.push(nahrazeno + '× obnoven dřívější záznam');
      if (chyby.length) casti.push('nepodařilo se načíst: ' + chyby.join(', '));
      ARCHIV_ZPRAVA = casti.join(' · ') || 'Nenačetlo se nic.';
      renderArchiv();
    });
}

function archivZapomen(soubor) {
  const v = archivOdeberSoubor(ARCHIV, soubor);
  ARCHIV = v.archiv;
  ARCHIV_ZPRAVA = 'Soubor ' + soubor + ' se přestal ukazovat (na disku zůstal beze změny) – '
    + 'skryto ' + v.odebrano + ' ' + (v.odebrano === 1 ? 'kalkulace' : 'kalkulací') + '.';
  renderArchiv();
}

function archivZapomenVse() {
  ARCHIV = [];
  ARCHIV_POHLED.hledat = '';
  ARCHIV_ZPRAVA = 'Archiv je prázdný. Na disku se nic nezměnilo.';
  renderArchiv();
}

/* ---------- hledání a řazení ----------
 * Překresluje se jen tělo tabulky, ne celý panel: hledá se při psaní a
 * z překresleného políčka by kurzor vyskočil po prvním písmenu. */
function archivHledatSet(val) {
  ARCHIV_POHLED.hledat = val;
  renderArchivTelo();
}

function archivZrusHledani() {
  ARCHIV_POHLED.hledat = '';
  const el = document.getElementById('archivHledat');
  if (el) el.value = '';
  renderArchivTelo();
}

/* Třetí kliknutí vrací výchozí pohled (nejnovější zakázka nahoře), ne žádné
 * řazení – v archivu z více souborů by „původní pořadí" nic neznamenalo. */
function archivRadit(klic) {
  if (ARCHIV_POHLED.klic !== klic) { ARCHIV_POHLED.klic = klic; ARCHIV_POHLED.smer = 1; }
  else if (ARCHIV_POHLED.smer === 1) { ARCHIV_POHLED.smer = -1; }
  else { ARCHIV_POHLED.klic = 'datum'; ARCHIV_POHLED.smer = -1; }
  renderArchivTelo();
}

/* ---------- převzetí do otevřené zakázky ---------- */

function archivVezmi(klic, cenik) {
  const z = ARCHIV.find(x => x.klic === klic);
  if (!z) return;
  const v = vytvorAlternativu(ZAK, z, { cenik });
  if (!v) { alert('Kalkulaci se nepodařilo převzít – záznam nemá data.'); return; }
  syncVarianta();
  zavriArchiv();
  render();
  if (typeof nabidkaStavTextBezpecne === 'function')
    nabidkaStavTextBezpecne(`Založena alternativa „${v.nazev}" s číslem ${variantaCislo(ZAK, v)} – `
      + `${puvodPopis(v)}. Zadání zkontrolujte, hlavička zakázky zůstala beze změny.`);
}

/* ---------- vykreslení ---------- */

function archivPohled() {
  return archivZobraz(ARCHIV, ARCHIV_POHLED);
}

function archivOvladani() {
  return `<div class="seznam-ovladani noprint">
    <button class="primary" onclick="document.getElementById('archivIn').click()"
      title="vybrat uložené soubory zakázek (.json) – klidně několik najednou">Nahlédnout do souborů…</button>
    <input type="file" id="archivIn" accept=".json" multiple style="display:none" onchange="archivNactiSoubory(event)">
    <input type="search" id="archivHledat" class="seznam-hledat" placeholder="Hledat v archivu…"
      title="Hledá se v čísle nabídky, názvu akce, objednateli, variantě, stavu i názvu souboru. Diakritika ani velká písmena nehrají roli."
      value="${esc(ARCHIV_POHLED.hledat)}" oninput="archivHledatSet(this.value)">
    <button class="mini" onclick="archivZrusHledani()" title="zrušit hledání">Zrušit hledání</button>
    <span class="sp"></span>
    <span class="note" id="archivPocet"></span>
  </div>`;
}

function archivSouboryHtml(p) {
  if (!p.soubory.length) return '';
  const chipy = p.soubory.map(s =>
    `<span class="archiv-chip">${esc(s.soubor)} <span class="note">${s.pocet}</span>
      <button class="mini" onclick="archivZapomen('${escJs(s.soubor)}')"
        title="přestat ukazovat kalkulace z tohoto souboru (soubor na disku zůstane)">✕</button></span>`).join('');
  return `<div class="archiv-soubory noprint">Nahlédnuto do: ${chipy}
    <button class="mini" onclick="archivZapomenVse()" title="vyprázdnit archiv v tomto okně">Vyprázdnit archiv</button></div>`;
}

/* Sloupec „Soubor" se v tabulce nevypisuje, i když se v něm hledá: názvy
 * souborů bývají dlouhé a vytlačily by z okna částku i tlačítka. Ze kterých
 * souborů se nahlédlo, je vidět nad tabulkou, a u každého řádku v bublině. */
const ARCHIV_SLOUPCE_UI = ['cislo', 'nazevAkce', 'objednatel', 'varianta', 'stav', 'odeslanoZa', 'datum'];

function archivDatumCz(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return (d && m && y) ? `${d}.${m}.${y}` : String(iso || '');
}

function archivHlavicka(p) {
  const th = (id, popis) => {
    const akt = p.klic === id;
    const sipka = akt ? (p.smer === 1 ? ' ▲' : ' ▼') : '';
    return `<th class="sort${akt ? ' aktivni' : ''}" onclick="archivRadit('${id}')"
      title="seřadit podle sloupce ${esc(popis)} (opakovaným kliknutím obrátíte směr)"
      >${esc(popis)}<span class="sipka">${sipka}</span></th>`;
  };
  return '<tr>' + ARCHIV_SLOUPCE_UI.map(id => {
    const s = archivSloupec(id);
    return s ? th(s.id, s.popis) : '';
  }).join('') + '<th></th></tr>';
}

function archivRadekHtml(z) {
  const castka = z.odeslanoZa == null ? '—' : fmt0(z.odeslanoZa);
  const stav = z.stav === 'odeslana' ? '🔒 ' + esc(z.stavPopis) : esc(z.stavPopis);
  const zdroj = z.soubor ? ` title="ze souboru ${esc(z.soubor)}"` : '';
  return `<tr${zdroj}>
    <td class="note" style="white-space:nowrap">${esc(z.cislo)}</td>
    <td>${esc(z.nazevAkce)}</td>
    <td>${esc(z.objednatel)}</td>
    <td>${esc(z.varianta)}</td>
    <td style="white-space:nowrap">${stav}</td>
    <td style="text-align:right;white-space:nowrap">${castka}</td>
    <td class="note" style="white-space:nowrap">${esc(archivDatumCz(z.datum))}</td>
    <td style="white-space:nowrap">
      <button class="mini primary" onclick="archivVezmi('${escJs(z.klic)}', 'aktualni')"
        title="založí v otevřené zakázce novou variantu se zadáním z této kalkulace, ale s dnešním ceníkem">Dnešní ceny</button>
      <button class="mini" onclick="archivVezmi('${escJs(z.klic)}', 'historicky')"
        title="založí novou variantu 1:1 podle historie včetně tehdejšího ceníku – pro reklamace a doobjednávky">1:1 historie</button>
    </td>
  </tr>`;
}

function archivPrazdno(p) {
  if (p.prazdny) {
    return `<div class="seznam-prazdno">Archiv je zatím prázdný. Tlačítkem
      <b>Nahlédnout do souborů…</b> vyberte uložené zakázky (.json) – otevřená zakázka zůstane,
      kde je. Nahlédnuté kalkulace žijí jen do zavření této záložky prohlížeče.</div>`;
  }
  return `<div class="seznam-prazdno">Hledání „<b>${esc(p.hledat)}</b>" neodpovídá žádná
    z ${p.celkem} nahlédnutých kalkulací.
    <button class="mini" onclick="archivZrusHledani()">Zobrazit všechny</button></div>`;
}

function archivPocetText(p) {
  if (p.prazdny) return '';
  const kolik = p.zuzeno ? `Zobrazeno ${p.zobrazeno} z ${p.celkem}`
    : `${p.celkem} ${p.celkem === 1 ? 'kalkulace' : (p.celkem < 5 ? 'kalkulace' : 'kalkulací')}`;
  const zdroju = p.soubory.length;
  return kolik + ' · ' + zdroju + ' ' + (zdroju === 1 ? 'soubor' : (zdroju < 5 ? 'soubory' : 'souborů'));
}

function renderArchivTelo() {
  const el = document.getElementById('archivTelo');
  if (!el) return;
  const p = archivPohled();
  el.innerHTML = p.zobrazeno
    ? `<table class="vartbl archtbl">${archivHlavicka(p)}${p.radky.map(archivRadekHtml).join('')}</table>`
    : archivPrazdno(p);
  const c = document.getElementById('archivPocet');
  if (c) c.textContent = archivPocetText(p);
  const s = document.getElementById('archivSoubory');
  if (s) s.innerHTML = archivSouboryHtml(p);
}

function renderArchiv() {
  const el = document.getElementById('archiv-panel');
  if (!el) return;
  const akt = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : null;
  const kam = akt ? `Nová varianta vznikne v zakázce <b>${esc(ZAK.cislo || '(bez čísla)')}</b>
    – ${esc(ZAK.nazevAkce || 'bez názvu akce')} vedle otevřené varianty <b>${esc(akt.nazev)}</b>.` : '';
  el.innerHTML = `<h2>Historické kalkulace
      <span class="note" style="font-weight:400">načtené ze souborů zakázek</span>
      <button class="mini" style="margin-left:auto" onclick="zavriArchiv()">Zavřít</button></h2>
    <div class="body">
      <div class="note">${kam} Převzetím se založí <b>alternativa</b> – další varianta téže zakázky
        s vlastním číslem nabídky (.1, .2, .3 …). Hlavička zakázky (číslo, akce, objednatel) se nemění,
        přebírá se jen kalkulace.</div>
      ${archivOvladani()}
      ${ARCHIV_ZPRAVA ? `<div class="seznam-varovani">${esc(ARCHIV_ZPRAVA)}</div>` : ''}
      <div id="archivSoubory"></div>
      <div id="archivTelo"></div>
      <div class="note"><b>Dnešní ceny</b> jsou to, co chcete skoro vždycky: převezme se zadání
        z historie, ale spočítá se dnešním ceníkem otevřené zakázky. <b>1:1 historie</b>
        ponechá i tehdejší ceník – hodí se, když se dokládá, jak stará cena vznikla, nebo se
        doobjednává za původních podmínek. Který ceník se použil, zůstane u varianty zapsané.</div>
      <div class="note">Archiv je jen v tomto okně – neukládá se do prohlížeče ani do zakázky,
        protože by se na sdíleném počítači postupně nasbíraly ceny a marže cizích zakázek.</div>
    </div>`;
  renderArchivTelo();
}
