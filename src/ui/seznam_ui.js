/* ================= SEZNAM KALKULACÍ – UI (#18) =================
 *
 * Model (řazení, filtr, hledání, název kopie) je v seznam.js; tady je jen
 * vykreslení tabulky a stav ovládacích prvků.
 *
 * PROČ SE PŘEKRESLUJE JEN TĚLO SEZNAMU A NE CELÁ APLIKACE:
 * hledá se při psaní, tedy po každém stisku klávesy. Globální render()
 * přestaví celou stránku včetně vyhledávacího políčka – kurzor by z něj
 * vyskočil po prvním písmenu. Ovládací lišta proto zůstává na místě
 * a mění se jen obsah #seznamTelo (renderSeznam).
 *
 * PROČ SE POHLED NEUKLÁDÁ DO ZAKÁZKY:
 * je to nastavení okna, ne dat. V uloženém JSON by cestovalo mezi lidmi
 * a působilo, že se zakázce ztratily varianty. Po načtení jiné zakázky
 * se pohled proto resetuje (seznamReset volá načtení i „Nová zakázka"). */

const SEZNAM_POHLED = { hledat: '', filtr: 'vse', klic: '', smer: 1 };

function seznamReset() {
  SEZNAM_POHLED.hledat = ''; SEZNAM_POHLED.filtr = 'vse';
  SEZNAM_POHLED.klic = ''; SEZNAM_POHLED.smer = 1;
}

/* Zrušení zúžení nechává řazení být – uživatel chtěl vidět všechno,
 * ne přeházet sloupce zpátky. */
function seznamZrusZuzeni() {
  SEZNAM_POHLED.hledat = ''; SEZNAM_POHLED.filtr = 'vse';
  const el = document.getElementById('seznamHledat');
  if (el) el.value = '';
  const f = document.getElementById('seznamFiltr');
  if (f) f.value = 'vse';
  renderSeznam();
}

function seznamHledatSet(val) {
  SEZNAM_POHLED.hledat = val;
  renderSeznam();
}

function seznamFiltrSet(val) {
  SEZNAM_POHLED.filtr = val;
  renderSeznam();
}

/* Klik na hlavičku: první kliknutí řadí vzestupně, druhé obrátí směr,
 * třetí řazení zruší a vrátí původní pořadí variant. Ta třetí možnost
 * tam je schválně – pořadí, v jakém varianty vznikaly, je samo o sobě
 * informace a jinak by se k němu nešlo vrátit. */
function seznamRadit(klic) {
  if (SEZNAM_POHLED.klic !== klic) { SEZNAM_POHLED.klic = klic; SEZNAM_POHLED.smer = 1; }
  else if (SEZNAM_POHLED.smer === 1) { SEZNAM_POHLED.smer = -1; }
  else { SEZNAM_POHLED.klic = ''; SEZNAM_POHLED.smer = 1; }
  renderSeznam();
}

/* ---------- kopie varianty ----------
 * „Kopie" a „klon" je totéž – klonujVariantu (#34) přidělí kopii další
 * číslo nabídky. Liší se jen název: tlačítko v seznamu pojmenuje kopii
 * podle zdroje, aby se v delším seznamu poznalo, z čeho vznikla. */
function varKopie(id) {
  const zdroj = ZAK.varianty.find(x => x.id === id) || aktivniVarianta(ZAK);
  if (!zdroj) return;
  const nazev = (typeof seznamKopieNazev === 'function')
    ? seznamKopieNazev(ZAK, zdroj.nazev) : ('Kopie – ' + (zdroj.nazev || ''));
  const kopie = klonujVariantu(ZAK, zdroj.id, { nazev });
  if (!kopie) return;
  syncVarianta();
  render();
  if (typeof nabidkaStavTextBezpecne === 'function')
    nabidkaStavTextBezpecne(`Založena kopie „${kopie.nazev}" s číslem ${variantaCislo(ZAK, kopie)} `
      + `(zdroj ${variantaCislo(ZAK, zdroj)}). Pokračujte v ní.`);
}

/* ---------- data pro vykreslení ---------- */

function seznamPohled() {
  const ceny = {};
  ZAK.varianty.forEach(v => {
    const c = spocitejVariantu(v);
    ceny[v.id] = {
      ock: c.ock ? c.ock.souhrn.zakladCena : null,
      proj: c.proj ? c.proj.souhrn.celkem : null,
    };
  });
  return seznamZobraz(ZAK, ceny, SEZNAM_POHLED);
}

/* ---------- ovládací lišta ---------- */

function seznamOvladani() {
  const f = SEZNAM_FILTRY.map(x =>
    `<option value="${x.id}" ${SEZNAM_POHLED.filtr === x.id ? 'selected' : ''}>${esc(x.popis)}</option>`).join('');
  return `<div class="seznam-ovladani noprint">
    <input type="search" id="seznamHledat" class="seznam-hledat" placeholder="Hledat v kalkulacích…"
      title="Hledá se v názvu, čísle nabídky, stavu, zákazníkovi i poznámce. Diakritika ani velká písmena nehrají roli."
      value="${esc(SEZNAM_POHLED.hledat)}" oninput="seznamHledatSet(this.value)">
    <select id="seznamFiltr" onchange="seznamFiltrSet(this.value)" title="filtr podle stavu kalkulace">${f}</select>
    <button class="mini" onclick="seznamZrusZuzeni()" title="zrušit hledání i filtr">Zrušit zúžení</button>
    <span class="sp"></span>
    <span class="note" id="seznamPocet"></span>
  </div>`;
}

/* ---------- tělo seznamu ---------- */

function seznamHlavicka(p) {
  const th = (id, popis, styl) => {
    const akt = p.klic === id;
    const sipka = akt ? (p.smer === 1 ? ' ▲' : ' ▼') : '';
    return `<th class="sort${akt ? ' aktivni' : ''}"${styl ? ` style="${styl}"` : ''}
      onclick="seznamRadit('${id}')"
      title="seřadit podle sloupce ${esc(popis)} (opakovaným kliknutím obrátíte směr, potřetí řazení zrušíte)"
      >${esc(popis)}<span class="sipka">${sipka}</span></th>`;
  };
  return `<tr><th title="otevřená varianta">Otevř.</th>
    ${th('nazev', 'Název varianty')}
    ${th('cislo', 'Číslo nabídky')}
    ${th('stav', 'Stav')}
    ${th('zakaznik', 'Zákazník')}
    ${th('pozn', 'Poznámka')}
    ${th('ock', 'Cena OCK bez DPH')}
    ${th('proj', 'Cena PROJ')}
    ${th('celkem', 'Celkem')}
    <th title="řídící (aktuálně platná) varianta">Řídící ✓</th>
    ${th('upraveno', 'Změna')}
    <th></th></tr>`;
}

function seznamRadekHtml(r) {
  const v = r.varianta;
  const ro = r.zamceno ? ' readonly title="uzamčená – odeslaná nabídka"' : '';
  const stav = (typeof zamekStavText === 'function') ? zamekStavText(v) : esc(r.stavPopis);
  /* #17 – u varianty převzaté z archivu se za číslem ukáže značka; celá věta
   * o původu (z jaké nabídky a kterým ceníkem) je v bublině, aby se sloupec
   * kvůli ní nerozšiřoval. */
  const puvod = (typeof puvodPopis === 'function') ? puvodPopis(v) : '';
  const puvodZn = puvod ? ` <span class="pill mut" title="${esc(puvod)}">⤺</span>` : '';
  /* zvýraznění otevřené varianty je třídou, ne stylem v atributu – sloupec
   * s tlačítky se přilepuje k pravému okraji a musí mít stejný podklad */
  return `<tr class="${r.aktivni ? 'aktivni' : ''}">
    <td><input type="radio" name="varAkt" ${r.aktivni ? 'checked' : ''} onchange="varAktivuj('${escJs(r.id)}')" title="otevřít variantu"></td>
    <td><input type="text" value="${esc(r.nazev)}"${ro} onchange="varSet('${escJs(r.id)}', 'nazev', this.value)"></td>
    <td class="note" style="white-space:nowrap">${esc(r.cislo)}${puvodZn}</td>
    <td>${stav}</td>
    <td><input type="text" value="${esc(r.zakaznik)}" placeholder="varianta zákazníka"${ro} onchange="varSet('${escJs(r.id)}', 'zakaznik', this.value)"></td>
    <td><input type="text" value="${esc(r.pozn)}" placeholder="poznámka"${ro} onchange="varSet('${escJs(r.id)}', 'pozn', this.value)"></td>
    <td>${r.ock == null ? '—' : fmt0(r.ock)}</td>
    <td>${r.proj == null ? '—' : fmt0(r.proj)}</td>
    <td>${r.celkem == null ? '—' : fmt0(r.celkem)}</td>
    <td style="text-align:center"><input type="checkbox" ${r.ridici ? 'checked' : ''} onchange="varRidici('${escJs(r.id)}')"
        title="řídící (aktuálně platná) varianta"></td>
    <td class="note">${esc((r.upraveno || '').slice(0, 10))}</td>
    <td style="white-space:nowrap"><button class="mini" onclick="varKopie('${escJs(r.id)}')"
        title="založit kopii této kalkulace s dalším číslem nabídky a pokračovat v ní">⧉</button>
      <button class="mini" onclick="varSmaz('${escJs(r.id)}')" title="smazat variantu">✕</button></td>
  </tr>`;
}

/* Prázdný výsledek nesmí vypadat jako prázdná zakázka – proto se místo
 * tabulky ukáže věta, co se s tím dá dělat. */
function seznamPrazdno(p) {
  return `<div class="seznam-prazdno">Žádná kalkulace neodpovídá zúžení
    ${p.hledat ? `„<b>${esc(p.hledat)}</b>"` : ''}${p.hledat && p.filtr !== 'vse' ? ' a ' : ''}
    ${p.filtr !== 'vse' ? `filtru <b>${esc(seznamFiltr(p.filtr).popis)}</b>` : ''}.
    V zakázce je celkem ${p.celkem} ${p.celkem === 1 ? 'kalkulace' : 'kalkulací'}.
    <button class="mini" onclick="seznamZrusZuzeni()">Zobrazit všechny</button></div>`;
}

function seznamTelo() {
  const p = seznamPohled();
  const varovani = p.aktivniSkryta
    ? `<div class="seznam-varovani">Otevřená varianta <b>${esc(p.aktivniNazev)}</b> není v tomto výběru vidět –
       pracujete v ní, ale seznam ji skrývá.
       <button class="mini" onclick="seznamZrusZuzeni()">Zobrazit všechny</button></div>`
    : '';
  const telo = p.zobrazeno
    ? `<table class="vartbl">${seznamHlavicka(p)}${p.radky.map(seznamRadekHtml).join('')}</table>`
    : seznamPrazdno(p);
  return { html: varovani + telo, pohled: p };
}

function seznamPocetText(p) {
  const c = p.pocty;
  const stavy = [];
  if (c.rozpracovane) stavy.push(c.rozpracovane + '× rozpracovaná');
  if (c.odeslane) stavy.push('🔒 ' + c.odeslane + '× odeslaná');
  if (c.odemcene) stavy.push('🔓 ' + c.odemcene + '× odemčená');
  const kolik = p.zuzeno
    ? `Zobrazeno ${p.zobrazeno} z ${p.celkem}`
    : `${p.celkem} ${p.celkem === 1 ? 'kalkulace' : (p.celkem < 5 ? 'kalkulace' : 'kalkulací')}`;
  return kolik + (stavy.length ? ' · ' + stavy.join(' · ') : '');
}

function renderSeznam() {
  const el = document.getElementById('seznamTelo');
  if (!el) return;
  const { html, pohled } = seznamTelo();
  el.innerHTML = html;
  const p = document.getElementById('seznamPocet');
  if (p) p.textContent = seznamPocetText(pohled);
}

/* ---------- celá karta ---------- */

function seznamKarta() {
  return card('Kalkulace v zakázce (varianty řešení a zákazníků)',
    seznamOvladani() +
    '<div id="seznamTelo"></div>' +
    `<div class="btns" style="margin-top:10px">
      <button class="primary" onclick="varNova()">+ Nová varianta (kopie otevřené)</button>
      <button onclick="otevriArchiv()"
        title="nahlédnout do uložených zakázek a převzít historickou kalkulaci jako alternativu">↩ Historická kalkulace…</button>
    </div>
    <div class="note">Přepínačem vlevo otevřete variantu k úpravám (záložky Kalkulace OCK, Technická
    specifikace i Kalkulace PROJ pak pracují s jejími daty). Zaškrtnutím ve sloupci <b>Řídící</b> určíte
    jedinou aktuálně platnou variantu zakázky – ta se použije pro cenovou nabídku a SoD.</div>
    <div class="note">Každá varianta má <b>vlastní číslo nabídky</b>: první nese číslo zakázky, každá
    další dostane příponu .1, .2, .3 … Vytištěním cenové nabídky se varianta uzamkne (🔒 odeslána) –
    co odešlo zákazníkovi, musí zůstat doslova. Pokračuje se tlačítkem <b>⧉</b> na jejím řádku, které
    založí kopii s dalším číslem.</div>
    <div class="note">Tlačítko <b>↩ Historická kalkulace…</b> otevře uložené zakázky (.json) a převezme
    z nich kalkulaci jako další variantu téhle zakázky – v čísle je pak poznat značkou <b>⤺</b>,
    po najetí myší se ukáže, z jaké nabídky pochází a kterým ceníkem se počítala.</div>
    <div class="note">Hledání i filtr mění jen to, co je vidět – žádná varianta se jimi nemaže a
    nastavení se neukládá do souboru zakázky. Kliknutím na záhlaví sloupce seznam seřadíte,
    druhým kliknutím obrátíte směr, třetím se vrátíte k pořadí, v jakém varianty vznikaly.</div>`);
}
