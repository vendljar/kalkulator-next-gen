/* ================= ZÁLOŽKA TECHNICKÁ SPECIFIKACE =================
 * Dokument „Technická specifikace výtahové šachty“ (příloha SoD).
 * Pole s prefill se plní živě z kalkulace OCK; ruční úprava má přednost
 * (badge „ručně“, tlačítko ↺ vrátí automatiku). */

function tsSet(id, val) {
  if (val === '') delete TS.hodnoty[id]; else TS.hodnoty[id] = val;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function tsReset(id) { delete TS.hodnoty[id]; render(); }
/* výběr z rozbalovacího seznamu; „vlastní text…" umožní libovolnou hodnotu */
function tsSelect(id, sel) {
  if (sel.value === '__VLASTNI__') {
    const t = window.prompt('Vlastní text položky:', sel.getAttribute('data-cur') || '');
    if (t != null && t.trim() !== '') tsSet(id, t); else render();
    return;
  }
  tsSet(id, sel.value);
}
function tsExtraAdd() { TS.extra.push({ label: 'NOVÁ POLOŽKA', hodnota: '' }); render(); }
function tsExtraDel(i) { TS.extra.splice(i, 1); render(); }
function tsExtraSet(i, k, val) { TS.extra[i][k] = val; render(); }

/* ---------- jazykové mutace (N1) ----------
 * Editace probíhá vždy v češtině; přepnutím jazyka se zobrazí přeložený
 * náhled dokumentu určený k tisku / předání zákazníkovi. Fráze, ke kterým
 * ve slovníku překlad není, zůstávají česky a jsou vyznačené. */

function tsJazykBar() {
  const akt = jazyk();
  const btns = JAZYKY.map(j =>
    `<button class="mini${j.kod === akt ? ' aktivni' : ''}" title="${esc(j.nazev)}"
       onclick="jazykSet('${j.kod}')">${j.vlajka}</button>`).join(' ');
  const pokr = akt === 'cz' ? null : prekladPokryti(tsVsechnyFraze(), akt);
  const stav = pokr
    ? `<span class="pill ${pokr.procenta >= 90 ? 'ok' : 'warn'}" title="přeloženo ${pokr.prelozeno} z ${pokr.celkem} frází">
         přeloženo ${pokr.procenta} %</span>` : '';
  const dopl = (pokr && pokr.chybi.length && jeAdmin())
    ? ` <button class="mini noprint" title="stáhnout seznam nepřeložených frází pro překladatele"
         onclick="tsChybejiciExport()">⤓ chybí ${pokr.chybi.length}</button>` : '';
  return `<div class="btns noprint" style="margin-bottom:10px;align-items:center">
    <span class="mut">Jazyk dokumentu:</span> ${btns} ${stav}${dopl}</div>`;
}

/* všechny fráze dokumentu (popisky i hodnoty) – podklad pro měření pokrytí */
function tsVsechnyFraze() {
  let r = null;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  const out = [];
  TECHSPEC_DEF.forEach(sk => {
    out.push(sk.sekce);
    if (sk.pozn) out.push(sk.pozn);
    sk.pole.forEach(p => { out.push(p.label); out.push(tsHodnota(p, TS, r, Z, C).text); });
  });
  TS.extra.forEach(e => { out.push(e.label); out.push(e.hodnota); });
  return out;
}

/* CSV se seznamem nepřeložených frází (pro překladatele; jen admin) */
function tsChybejiciExport() {
  const lang = jazyk();
  const chybi = prekladPokryti(tsVsechnyFraze(), lang).chybi;
  const q = t => '"' + String(t).replace(/"/g, '""') + '"';
  const csv = '\ufeff' + ['čeština;' + lang.toUpperCase() + ' (doplňte)']
    .concat(chybi.map(t => q(t) + ';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'neprelozene_' + lang + '.csv';
  a.click();
}

/* ---------- TS-1: kontrola vyplnění (jen upozornění, nic neblokuje) ----------
 * Pruh nad dokumentem ukáže počet nevyplněných povinných položek a vyjmenuje
 * je. Tisk, export ani uložení se nikdy nezastaví – uživatel může dokument
 * vytisknout i s prázdnými poli, jen o tom ví. */

function tsKontrolaStav() {
  let r = null;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  return tsKontrola(TS, r, Z, C, ZAK);
}

function tsKontrolaBar() {
  const k = tsKontrolaStav();
  if (k.ok) return `<div class="ts-kontrola noprint">
    <span class="pill ok">✓ ${esc(T('Kontrola vyplnění'))}</span>
    <span class="mut">${esc(T('Všechna povinná pole jsou vyplněna.'))}</span></div>`;

  const skupiny = {};
  k.chybi.forEach(x => { (skupiny[x.sekce] = skupiny[x.sekce] || []).push(x.label); });
  const seznam = Object.keys(skupiny).map(s =>
    `<div class="ts-kontrola-sekce"><b>${esc(T(s))}:</b> ${skupiny[s].map(l => esc(T(l))).join(', ')}</div>`).join('');

  return `<div class="ts-kontrola warn noprint">
    <div><span class="pill warn">⚠ ${esc(T('Nevyplněná povinná pole'))}: ${k.pocet}</span>
      <span class="mut">${esc(T('Upozornění nic neblokuje – dokument lze vytisknout i takto.'))}</span></div>
    ${seznam}</div>`;
}

/* je povinné pole prázdné? (pro zvýraznění řádku ve formuláři) */
function tsChybi(pole, text) {
  return TS_POVINNE.indexOf(pole.id) >= 0 && tsPrazdna(text);
}

/* přeložený řádek náhledu; nepřeložené fráze označí tečkovaně */
function tsPrelozText(t) {
  const st = trStav(t, jazyk());
  return st.prelozeno ? esc(st.text)
    : `<span class="neprelozeno" title="zatím není ve slovníku – zobrazeno česky">${esc(st.text)}</span>`;
}

/* náhled dokumentu v cizím jazyce (jen ke čtení a tisku) */
function renderTechspecPreklad() {
  let r = null;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  const lang = jazyk();

  const row = (lbl, val) => `<div class="spec-row ro"><div class="lbl">${tsPrelozText(lbl)}</div>
    <div>${tsPrelozText(val)}</div><div></div></div>`;

  const sekce = TECHSPEC_DEF.map(sk =>
    `<h3>${tsPrelozText(sk.sekce)}</h3>` +
    sk.pole.map(p => row(p.label, tsHodnota(p, TS, r, Z, C).text)).join('') +
    (sk.pozn ? `<div class="note">${tsPrelozText(sk.pozn)}</div>` : '')
  ).join('');

  const extra = TS.extra.map(e => row(e.label, e.hodnota)).join('');

  document.getElementById('page-spec').innerHTML = `
    <div class="spec-doc">
      ${tsJazykBar()}
      ${tsKontrolaBar()}
      <h1>${tsPrelozText('Technická specifikace výtahové šachty')}</h1>
      <div class="sub">${tsPrelozText('(tato technická specifikace bude použita jako příloha Smlouvy o dílo nebo závazné objednávky)')}</div>
      ${row('ČÍSLO NABÍDKY', ZAK.cislo)}
      ${row('OBJEDNATEL', ZAK.objednatel)}
      ${row('DATUM', ZAK.datum)}
      ${row('NÁZEV AKCE', TS.nazevAkce)}
      ${row('ADRESA STAVBY', ZAK.adresa)}
      ${sekce}
      ${extra ? `<h3>${tsPrelozText('DALŠÍ UJEDNÁNÍ')}</h3>` + extra : ''}
      <div class="btns noprint" style="margin-top:14px">
        <button onclick="prepniTab('spec'); window.print()">${esc(T('Tisk specifikace / PDF'))}</button>
      </div>
      <div class="note noprint">Náhled v cizím jazyce je jen ke čtení – obsah se edituje v české verzi
      (přepněte na CZ). Tečkovaně zvýrazněné fráze zatím nemají překlad ve slovníku a zůstávají česky.</div>
    </div>`;
}

function renderTechspec() {
  if (jazyk() !== 'cz') return renderTechspecPreklad();
  let r = null;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}

  const specRow = (pole) => {
    const h = tsHodnota(pole, TS, r, Z, C);
    const rucne = TS.hodnoty[pole.id] != null;
    const badge = rucne ? '<span class="pill warn src">ručně</span>'
      : (h.zdroj === 'z kalkulace' ? '<span class="pill src">z kalkulace</span>' : '<span class="pill mut src">výchozí</span>');
    let control;
    if (pole.ciselnik) {
      /* <select> vždy nabídne kompletní číselník (na rozdíl od <datalist>,
       * který Chrome filtruje podle aktuální hodnoty a část variant skryl). */
      const cur = h.text || '';
      const vlastni = cur !== '' && !pole.ciselnik.includes(cur);
      const opts = ['<option value="">— nevyplněno —</option>']
        .concat(pole.ciselnik.map(o =>
          `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`));
      if (vlastni) opts.push(`<option value="${esc(cur)}" selected>${esc(cur)} (vlastní)</option>`);
      opts.push(`<option value="__VLASTNI__">✎ vlastní text…</option>`);
      control = `<select data-cur="${esc(cur)}" onchange="tsSelect('${escJs(pole.id)}', this)">${opts.join('')}</select>`;
    } else {
      control = `<input type="text" value="${esc(h.text)}" onchange="tsSet('${pole.id}', this.value)">`;
    }
    /* TS-1: povinné a prázdné pole se jen označí – zápis ani tisk se neblokuje */
    const chybi = tsChybi(pole, h.text);
    const varovani = chybi
      ? ` <span class="pill warn" title="povinná položka dokumentu – zatím nevyplněno">${esc(T('nevyplněno'))}</span>` : '';
    return `<div class="spec-row${chybi ? ' chybi' : ''}"><div class="lbl">${esc(pole.label)}</div>
      <div>${control}</div>
      <div>${badge}${varovani}${rucne ? ` <button class="mini noprint" title="vrátit automatické plnění" onclick="tsReset('${escJs(pole.id)}')">↺</button>` : ''}</div>
    </div>`;
  };

  const sekce = TECHSPEC_DEF.map(s =>
    `<h3>${esc(s.sekce)}</h3>` + s.pole.map(specRow).join('') +
    (s.pozn ? `<div class="note">${esc(s.pozn)}</div>` : '')
  ).join('');

  const extra = TS.extra.map((e, i) =>
    `<div class="spec-row"><div class="lbl"><input type="text" style="font-weight:600" value="${esc(e.label)}"
        onchange="tsExtraSet(${i}, 'label', this.value)"></div>
     <div><input type="text" value="${esc(e.hodnota)}" onchange="tsExtraSet(${i}, 'hodnota', this.value)"></div>
     <div><button class="mini noprint" onclick="tsExtraDel(${i})">✕</button></div></div>`).join('');

  document.getElementById('page-spec').innerHTML = `
    <div class="spec-doc">
      ${tsJazykBar()}
      ${tsKontrolaBar()}
      <h1>Technická specifikace výtahové šachty</h1>
      <div class="sub">(tato technická specifikace bude použita jako příloha Smlouvy o dílo nebo závazné objednávky)</div>
      <div class="spec-row"><div class="lbl">ČÍSLO NABÍDKY</div><div><input type="text" value="${esc(ZAK.cislo)}" onchange="set('ZAK.cislo', this.value)"></div><div></div></div>
      <div class="spec-row"><div class="lbl">OBJEDNATEL</div><div><input type="text" value="${esc(ZAK.objednatel)}" onchange="set('ZAK.objednatel', this.value)"></div><div></div></div>
      <div class="spec-row"><div class="lbl">DATUM</div><div><input type="date" style="text-align:left" value="${esc(ZAK.datum)}" onchange="set('ZAK.datum', this.value)"></div><div></div></div>
      <div class="spec-row"><div class="lbl">NÁZEV AKCE</div><div><input type="text" value="${esc(TS.nazevAkce)}" onchange="set('TS.nazevAkce', this.value)"></div><div></div></div>
      <div class="spec-row"><div class="lbl">ADRESA STAVBY</div><div><input type="text" value="${esc(ZAK.adresa)}" onchange="set('ZAK.adresa', this.value)"></div><div></div></div>
      ${sekce}
      ${extra ? '<h3>DALŠÍ UJEDNÁNÍ</h3>' + extra : ''}
      <div class="btns noprint" style="margin-top:14px">
        <button onclick="tsExtraAdd()">+ přidat vlastní řádek</button>
        <button onclick="prepniTab('spec'); window.print()">Tisk specifikace / PDF</button>
      </div>
      <div class="note noprint">Pole se štítkem „z kalkulace“ se přepočítávají podle zadání OCK.
      Jakmile pole přepíšete, platí ruční hodnota (štítek „ručně“); tlačítkem ↺ vrátíte automatiku.
      Vlastní hodnoty lze psát do všech polí, rozbalovací návrhy odpovídají číselníkům ze šablony.</div>
    </div>`;
}
