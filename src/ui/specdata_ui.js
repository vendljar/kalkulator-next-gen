/* ================= ZÁLOŽKA TECHNICKÁ SPECIFIKACE OCK DATA (jen admin) =================
 * Editor podkladových dat pro Technickou specifikaci OCK.
 *  Panel 1 – Rolovací seznamy (číselníky): úprava jednotlivých položek každého
 *            seznamu (přejmenování, přidání, smazání, pořadí). Seznam může být
 *            sdílený více pozicemi – úprava se promítne do všech naráz.
 *  Panel 2 – Výchozí hodnoty pozic: pro každou pozici volba výchozí položky
 *            (u polí bez číselníku volný text).
 * Změny se projeví okamžitě (i v záložce Technická specifikace). Trvale se
 * „zapékají do zdroje" – tlačítkem Export vygeneruješ JSON, který zanesu do
 * techspec.js při dalším buildu. */

/* ---- úpravy číselníků (in-place, aby zůstaly reference z polí platné) ---- */
/* Číselníky i výchozí hodnoty jsou nastavení aplikace – jdou do složky
 * (ui/nastaveni_db_ui.js). Tyhle settery míjejí nastRefresh(), takže si
 * ohlášení změny musí obstarat samy. */
function sdZmena() { if (typeof nastdbZmeneno === 'function') nastdbZmeneno(); render(); }
function sdItemSet(key, i, val) {
  const v = (val ?? '').trim();
  if (v === '') return;                 // prázdnou položku nepovolíme (smaž tlačítkem ✕)
  TS_C[key][i] = v; sdZmena();
}
function sdItemAdd(key) { TS_C[key].push('nová položka'); sdZmena(); }
function sdItemDel(key, i) {
  if (TS_C[key].length <= 1) { alert('Seznam musí mít alespoň jednu položku.'); return; }
  TS_C[key].splice(i, 1); sdZmena();
}
function sdItemMove(key, i, dir) {
  const a = TS_C[key], j = i + dir;
  if (j < 0 || j >= a.length) return;
  const t = a[i]; a[i] = a[j]; a[j] = t; sdZmena();
}

/* ---- výchozí hodnota pozice ---- */
function sdDefSet(id, val) { const p = tsPole(id); if (p) p.def = val; sdZmena(); }
function sdDefVlastni(id, sel) {
  if (sel.value === '__VLASTNI__') {
    const t = window.prompt('Vlastní výchozí text:', sel.getAttribute('data-cur') || '');
    if (t != null && t.trim() !== '') sdDefSet(id, t); else render();
    return;
  }
  sdDefSet(id, sel.value);
}

/* ---- reset + export do zdroje ---- */
function sdResetVse() {
  if (!confirm('Vrátit všechny číselníky i výchozí hodnoty na původní stav ze zdroje?')) return;
  Object.keys(TS_C_ORIG).forEach(k => {
    if (!TS_C[k]) return;
    TS_C[k].length = 0;                 // mutace na místě – reference z polí zůstávají
    TS_C_ORIG[k].forEach(x => TS_C[k].push(x));
  });
  TECHSPEC_DEF.forEach(s => s.pole.forEach(p => {
    if (Object.prototype.hasOwnProperty.call(TS_DEF_ORIG, p.id)) p.def = TS_DEF_ORIG[p.id];
  }));
  sdZmena();
}
function sdExport() {
  const vychozi = {};
  TECHSPEC_DEF.forEach(s => s.pole.forEach(p => { if (p.def !== undefined) vychozi[p.id] = p.def; }));
  const data = { _popis: 'Data Technické specifikace OCK – ciselniky (TS_C) + vychozi (pole.def). Zapéct do techspec.js.',
                 ciselniky: TS_C, vychozi };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'techspec_data.json';
  a.click();
}

function renderSpecData() {
  const el = document.getElementById('page-specdata');
  if (!el) return;
  if (!smiZobrazit('tab.specdata')) { el.innerHTML = '<div class="note">Tato záložka je přístupná jen rolím, které na ni mají právo.</div>'; return; }

  const pouziti = tsCiselnikPouziti();

  /* Panel 1 – číselníky */
  const seznamCard = (key) => {
    const items = TS_C[key];
    const uziv = pouziti[key] || [];
    const pozice = uziv.length
      ? uziv.map(u => esc(u.label)).join(', ')
      : '<span class="mut">nepoužito žádnou pozicí</span>';
    const rows = items.map((it, i) => `
      <div class="sd-item">
        <input type="text" value="${esc(it)}" onchange="sdItemSet('${escJs(key)}', ${i}, this.value)">
        <span class="sd-item-btns noprint">
          <button class="mini" title="nahoru" ${i === 0 ? 'disabled' : ''} onclick="sdItemMove('${escJs(key)}', ${i}, -1)">↑</button>
          <button class="mini" title="dolů" ${i === items.length - 1 ? 'disabled' : ''} onclick="sdItemMove('${escJs(key)}', ${i}, 1)">↓</button>
          <button class="mini" title="smazat položku" onclick="sdItemDel('${escJs(key)}', ${i})">✕</button>
        </span>
      </div>`).join('');
    const titul = `<span class="sd-key">${esc(key)}</span> <span class="pill mut">${items.length} pol.</span>`
      + ` <span class="pill ${uziv.length > 1 ? 'warn' : 'mut'}" title="počet pozic využívajících tento seznam">${uziv.length}× pozice</span>`;
    const body = `<div class="sd-uses note">Používá: ${pozice}</div>
      ${rows}
      <div class="noprint" style="margin-top:6px"><button class="mini" onclick="sdItemAdd('${escJs(key)}')">+ přidat položku</button></div>`;
    return card(titul, body, true);   // sbaleno – rozklikne se dle potřeby
  };
  const panel1 = Object.keys(TS_C).map(seznamCard).join('');

  /* Panel 2 – výchozí hodnoty pozic (dle sekcí) */
  const defRow = (p, sekce) => {
    const cur = p.def != null ? p.def : ' -';
    let control;
    if (p.ciselnik) {
      const vlastni = !p.ciselnik.includes(cur);
      const opts = p.ciselnik.map(o => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`);
      if (vlastni) opts.unshift(`<option value="${esc(cur)}" selected>${esc(cur)} (vlastní)</option>`);
      opts.push('<option value="__VLASTNI__">✎ vlastní text…</option>');
      control = `<select data-cur="${esc(cur)}" onchange="sdDefVlastni('${escJs(p.id)}', this)">${opts.join('')}</select>`;
    } else {
      control = `<input type="text" value="${esc(cur)}" onchange="sdDefSet('${escJs(p.id)}', this.value)">`;
    }
    const tag = p.prefill ? '<span class="pill src" title="živě se plní z kalkulace; toto je záložní výchozí hodnota">z kalkulace</span>'
      : (p.ciselnik ? '' : '<span class="pill mut">volný text</span>');
    return `<div class="spec-row"><div class="lbl">${esc(p.label)}</div><div>${control}</div><div>${tag}</div></div>`;
  };
  const panel2 = TECHSPEC_DEF.map(s =>
    `<h3>${esc(s.sekce)}</h3>` + s.pole.map(p => defRow(p, s.sekce)).join('')
  ).join('');

  el.innerHTML = `
    <div class="spec-doc">
      <h1>Technická specifikace OCK — Data <span class="pill warn" style="vertical-align:middle">jen admin</span></h1>
      <div class="sub">Správa rolovacích seznamů (číselníků) a výchozích hodnot pro záložku Technická specifikace OCK.</div>

      <div class="btns noprint" style="margin:8px 0 14px">
        <button class="primary" onclick="sdExport()">⭳ Export dat ke commitu (JSON)</button>
        <button class="mini" onclick="sdResetVse()">↺ Vrátit vše na výchozí</button>
      </div>
      <div class="note noprint" style="margin-bottom:14px">Úpravy se projeví okamžitě i v záložce <b>Technická specifikace OCK</b>
        (platí pro tuto relaci). Pro trvalé uložení klikni na <b>Export</b> a soubor <code>techspec_data.json</code> předej k zapečení do zdroje.</div>

      <h2 class="sd-h2">1) Rolovací seznamy (číselníky)</h2>
      <div class="note">Každá karta = jeden seznam. Sdílený seznam (žlutý štítek „×pozice") upravuje všechny pozice, které jej používají, naráz.</div>
      <div class="sd-lists">${panel1}</div>

      <h2 class="sd-h2" style="margin-top:22px">2) Výchozí hodnoty pozic</h2>
      <div class="note">Výchozí položka pro každou pozici. U polí „z kalkulace" jde o záložní hodnotu, když kalkulace nedodá vlastní.</div>
      ${panel2}
    </div>`;
}
