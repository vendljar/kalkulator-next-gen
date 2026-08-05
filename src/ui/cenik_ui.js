/* ================= ZÁLOŽKA CENÍK NÁKLADŮ =================
 * Definice CENIK_DEF / CENIK_DEF_PROJ jsou v CORE (cenik.js) – jeden zdroj
 * pravdy pro záložku i pro Excel import/export. */

/* mapování ceníkových sekcí na sekce katalogu/kalkulace (kam patří vlastní položky).
 * Odvozeno z KATALOG_SEKCE_NAZEV – jeden zdroj pravdy; nová sekce katalogu tak
 * automaticky dostane i tlačítko „+ přidat“ v ceníku. */
const CENIK_GRP_SEKCE = (() => {
  const m = {};
  Object.keys(KATALOG_SEKCE_NAZEV).forEach(k => { m[KATALOG_SEKCE_NAZEV[k]] = k; });
  return m;
})();

function cenikRows(def) {
  return def.map(([grp, items]) => {
    const body = items.map(([path, l, u, note, typ]) => {
      const val = get(path);
      let ed;
      if (typ === 'text') ed = `<input type="text" style="width:130px;text-align:left" value="${esc(val)}" onchange="set('${path}', this.value)">`;
      else if (typ === 'selLak') ed = `<select style="width:130px" onchange="set('${path}', this.value)">
          <option value="tomas" ${val === 'tomas' ? 'selected' : ''}>Tomáš</option>
          <option value="lakovna" ${val === 'lakovna' ? 'selected' : ''}>lakovna</option></select>`;
      else ed = `<input type="number" step="any" value="${val}" onchange="set('${path}', +this.value)">`;
      return `<tr><td>${l}</td><td>${ed}</td><td>${u}</td><td>${note}</td></tr>`;
    }).join('');
    return `<tr class="sec"><td colspan="4">${grp}</td></tr>${body}${cenikCustomRows(CENIK_GRP_SEKCE[grp])}`;
  }).join('');
}
/* Vlastní položky přidané přímo v ceníku (per sekce) = TRVALÉ položky.
 * Zdrojem pravdy je KATALOG (mimo zakázku), takže se propíšou do každé nové
 * cenové nabídky. Změna se okamžitě promítne i do aktuální zakázky. */
function cenikCustomRows(sekceKey) {
  if (!sekceKey || !jeAdmin()) return '';
  const arr = katalogSekce(KATALOG, sekceKey);
  const rows = arr.map(p => `<tr>
      <td><input type="text" value="${esc(p.nazev)}" onchange="katSet('${sekceKey}','${p.kid}','nazev',this.value)"></td>
      <td><input type="number" step="any" value="${+p.cena || 0}" onchange="katSet('${sekceKey}','${p.kid}','cena',this.value)"></td>
      <td><input type="number" step="any" style="width:70px" value="${+p.mnozstvi || 1}" onchange="katSet('${sekceKey}','${p.kid}','mnozstvi',this.value)" title="výchozí množství v nové nabídce"></td>
      <td><span class="pill ok" title="je součástí každé nové cenové nabídky">trvalá</span>
          <button class="mini noprint" title="odebrat z ceníku i z této zakázky" onclick="katDel('${sekceKey}','${p.kid}')">✕</button></td></tr>`).join('');
  const lokal = katalogCil(Z, sekceKey).filter(p => !p.kid).length;
  const info = lokal ? `<tr><td colspan="4"><span class="note">V této zakázce je navíc ${lokal} položka/y přidaná přímo v kalkulaci
      (dočasná). Tlačítkem 📌 v Kalkulaci OCK ji uložíš sem natrvalo.</span></td></tr>` : '';
  return rows + info + `<tr class="pridat noprint"><td colspan="4"><button class="mini" onclick="katAdd('${sekceKey}')">+ přidat trvalou položku do sekce</button></td></tr>`;
}

/* --- obsluha trvalých (katalogových) položek ceníku --- */
function katAdd(sekceKey) {
  katalogPridejVc(KATALOG, Z, sekceKey, { nazev: 'Nová položka', mnozstvi: 1, cena: 0 });
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function katSet(sekceKey, kid, klic, hodnota) {
  katalogUpravVc(KATALOG, Z, sekceKey, kid, klic, hodnota);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function katDel(sekceKey, kid) {
  const p = katalogNajdi(KATALOG, sekceKey, kid);
  if (!confirm('Odebrat trvalou položku „' + ((p && p.nazev) || '') + '" z ceníku?\n\nZmizí i z této zakázky a nebude součástí nových nabídek.')) return;
  katalogSmazVc(KATALOG, Z, sekceKey, kid);
  render();
}

const CENIK_POZN = `<div class="note">Ceník je součástí aktivní varianty a ukládá se se zakázkou (tlačítko „Uložit zakázku") –
  změna cen tady se dotkne <b>jen této varianty</b>. Trvale, tedy pro všechny nové nabídky, se ceny mění
  tlačítkem <b>Zveřejnit</b> v kartě Databáze programu nahoře; bez připojené složky platí ceník ze sestavení aplikace.</div>`;

function renderCenik() {
  document.getElementById('page-cenik').innerHTML =
    `${smiZobrazit('cenik.zverejnit') ? renderProgramKarta() : ''}
     ${smiZobrazit('cenik.zverejnit') && typeof renderOnlineCenikKarta === 'function' ? renderOnlineCenikKarta() : ''}
     <div class="card"><h2 style="cursor:default">Ceník nákladů OCK – číselník jednotkových cen
       <span class="pill warn" style="float:right">každou cenu před nabídkou překontrolovat!</span></h2>
     <div class="body">
       ${cenikStariLista()}
       ${cenikVerzeLista()}
       <div class="note">Globální přirážku a sazbu DPH nastavíš v hlavičce Kalkulace OCK. Tlačítkem
         „+ přidat <b>trvalou</b> položku do sekce" založíš položku, která je od té chvíle součástí
         <b>každé nové cenové nabídky</b> (žije mimo zakázku, v katalogu). Položka přidaná přímo v Kalkulaci OCK
         platí jen pro danou zakázku – natrvalo ji uložíš tlačítkem 📌 u řádku. Výchozí zaškrtnutí volitelných
         řešíš v hlavním výpočtovém poli (sloupec „Výchozí").</div>
       <table class="ceniktbl">
         <tr><th>Položka</th><th>Cena</th><th>Jednotka</th><th>Poznámka</th></tr>
         ${cenikRows(CENIK_DEF)}
       </table>
       ${smiZobrazit('cenik.import') ? `<div class="btns" style="margin-top:12px">
         <button class="primary" onclick="cenikExport()">⭳ Export do Excelu (OCK+PROJ)</button>
         <button onclick="cenikImport()">⭱ Import z Excelu</button>
       </div>` : ''}
       <div class="btns" style="margin-top:8px">
         <button onclick="resetCenik()">Obnovit výchozí ceník OCK</button>
       </div>
       <div class="note" id="cenikStav">Export vytvoří <b>.xlsx</b> se dvěma listy (Ceník OCK, Ceník PROJ). Uprav ceny v Excelu a nahraj zpět tlačítkem Import – před uložením uvidíš přehled změn.</div>
       ${CENIK_POZN}
     </div></div>`;
}

function renderCenikProj() {
  document.getElementById('page-cenikproj').innerHTML =
    /* Táž karta Databáze programu jako na záložce OCK (zadání 2. 8. 2026).
     * Zveřejnění a verzování je jedno pro obě sady — _program.json nese ceník
     * OCK i PROJ v jedné verzi — takže tohle je druhé vykreslení téže karty
     * nad týmž stavem, stejný vzor jako karty slevy a zaokrouhlení. Karta
     * nenese žádné id (card() bez čtvrtého argumentu), dvojí vykreslení
     * proto nic nezdvojí; hlídá to overit_program.mjs. */
    `${smiZobrazit('cenik.zverejnit') ? renderProgramKarta() : ''}
     ${smiZobrazit('cenik.zverejnit') && typeof renderOnlineCenikKarta === 'function' ? renderOnlineCenikKarta() : ''}
     <div class="card"><h2 style="cursor:default">Ceník nákladů PROJ – projekční práce
       <span class="pill warn" style="float:right">každou cenu před nabídkou překontrolovat!</span></h2>
     <div class="body">
       ${cenikStariLista()}
       ${cenikVerzeLista()}
       <div class="row" style="max-width:420px">
         ${inp('PC.marze', { type: 'pct', l: 'GLOBÁLNÍ PŘIRÁŽKA PROJ' })}
       </div>
       <table class="ceniktbl">
         <tr><th>Položka</th><th>Cena</th><th>Jednotka</th><th>Poznámka</th></tr>
         ${cenikRows(CENIK_DEF_PROJ)}
       </table>
       ${smiZobrazit('cenik.import') ? `<div class="btns" style="margin-top:12px">
         <button class="primary" onclick="cenikExport()">⭳ Export do Excelu (OCK+PROJ)</button>
         <button onclick="cenikImport()">⭱ Import z Excelu</button>
       </div>` : ''}
       <div class="btns" style="margin-top:8px">
         <button onclick="resetCenikProj()">Obnovit výchozí ceník PROJ</button>
       </div>
       <div class="note">Fixní částky sekcí jsou provázané s kalkulací – změna zde se ihned projeví
       v záložce <b>Kalkulace PROJ</b> (a naopak, úprava částky u položky v kalkulaci se propíše sem).
       Hodiny jednotlivých položek se zadávají v kalkulaci; vlastní přidané položky mají cenu přímo u sebe.</div>
       ${CENIK_POZN}
       <div class="note">Ceník PROJ se zveřejňuje spolu s ceníkem OCK – jedním tlačítkem <b>Zveřejnit</b>
         v kartě <b>Databáze programu</b> nahoře (karta je na obou záložkách ceníku a je to táž karta).
         Obě sady tak vždy patří k téže verzi.</div>
     </div></div>`;
}

function resetCenik() {
  if (confirm('Vrátit ceny OCK na platný ceník programu?\n\nPřepíše se jen ceník této varianty, platná verze se nemění.')) {
    aktivniVarianta(ZAK).data.cenik = JSON.parse(JSON.stringify(DEFAULT_CENIK));
    syncVarianta(); render();
  }
}
function resetCenikProj() {
  if (confirm('Vrátit ceny PROJ na platný ceník programu?\n\nPřepíše se jen ceník této varianty, platná verze se nemění.')) {
    aktivniVarianta(ZAK).data.proj.cenik = JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ));
    syncVarianta(); render();
  }
}

/* ---------- Excel export/import ceníku (OCK + PROJ) ---------- */
function cenikStav(t) { const el = document.getElementById('cenikStav'); if (el) el.textContent = t; }

function cenikExport() {
  try {
    const blob = xlsxZapis(cenikToSheets(C, PC));
    const cislo = (ZAK.cislo || '').replace(/\s+/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ('CENIK_' + (cislo || 'ENG') + '.xlsx').replace(/[\\/:*?"<>|]+/g, '-');
    a.click();
    cenikStav('Export hotový – soubor je ve Stažených. Uprav ceny (sloupec Hodnota) a nahraj zpět Importem.');
  } catch (e) { cenikStav('Chyba exportu: ' + e.message); }
}

let CENIK_IMPORT = null;   // {zmeny, chyby, nezname} čekající na potvrzení
function cenikImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    cenikStav('Načítám ' + f.name + '…');
    f.arrayBuffer().then(async buf => {
      try {
        const sheets = await xlsxPrecti(new Uint8Array(buf));
        CENIK_IMPORT = cenikDiffZeSheets(sheets, C, PC);
        cenikImportModal(CENIK_IMPORT);
      } catch (e) { cenikStav('Chyba importu: ' + e.message); }
    });
  };
  inp.click();
}

function cenikImportModal(res) {
  const kc = v => (typeof v === 'number' ? v.toLocaleString('cs-CZ') : String(v));
  const radky = res.zmeny.map(z =>
    `<tr><td>${esc(z.cesta)}</td><td>${esc(z.popis)}</td>
       <td style="text-align:right;color:#6b7686">${esc(kc(z.stara))}</td>
       <td style="text-align:right;font-weight:600">${esc(kc(z.nova))}</td></tr>`).join('');
  const chyby = res.chyby.length ? `<div class="neg" style="margin:8px 0">Chyby (${res.chyby.length}): ${res.chyby.map(esc).join('; ')}</div>` : '';
  const nezname = res.nezname.length ? `<div class="note">Ignorováno neznámých klíčů: ${res.nezname.length}.</div>` : '';
  const telo = res.zmeny.length
    ? `<div class="note">Zkontroluj ${res.zmeny.length} změn. Po potvrzení se zapíšou do ceníku aktivní varianty.</div>
       <table class="sd-tbl"><thead><tr><th>Klíč</th><th>Položka</th><th style="text-align:right">Původní</th><th style="text-align:right">Nová</th></tr></thead>
       <tbody>${radky}</tbody></table>`
    : '<div class="note">Žádné změny oproti aktuálnímu ceníku.</div>';
  const ov = document.getElementById('nastaveni-overlay');   // sdílený overlay pro modály
  const panel = document.getElementById('nastaveni-panel');
  panel.innerHTML = `<h2>Import ceníku z Excelu — přehled změn</h2>
    <div class="body">${chyby}${telo}${nezname}
      <div class="btns" style="margin-top:16px">
        ${res.zmeny.length ? '<button class="primary" onclick="cenikImportPotvrd()">Zapsat změny do ceníku</button>' : ''}
        <button onclick="zavriNastaveni()">Zavřít</button>
      </div></div>`;
  ov.style.display = 'flex';
}
function cenikImportPotvrd() {
  if (!CENIK_IMPORT) return;
  const n = cenikAplikuj(CENIK_IMPORT.zmeny, C, PC);
  CENIK_IMPORT = null;
  zavriNastaveni();
  syncVarianta(); render();
  cenikStav('Import hotový – zapsáno ' + n + ' změn do ceníku.');
}
