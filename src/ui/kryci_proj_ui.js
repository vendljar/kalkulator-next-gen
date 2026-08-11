/* ================= ZÁLOŽKA KRYCÍ LIST ZAKÁZKY PROJ =================
 * Obdoba záložky Krycí list zakázky OCK, ale navázaná na KALKULACI PROJ.
 * Pole se předvyplňují z vypocetProj (Kalkulace PROJ), ze zakázky a
 * z firemních údajů; ruční hodnoty se ukládají ve variantě
 * (data.kryciProj.hodnoty) a mají přednost (↺ vrátí prefill).
 * Vlastní prefix klp* / kryciProj*, aby se názvy nemíchaly s OCK verzí. */

function klpSet(id, v) {
  if (!KLP.hodnoty) KLP.hodnoty = {};
  if (v === '' || v == null) delete KLP.hodnoty[id]; else KLP.hodnoty[id] = v;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function klpReset(id) { if (KLP.hodnoty) delete KLP.hodnoty[id]; render(); }
/* Rozbalené „jiné znění" u projekčního krycího listu — viz KL_JINA v kryci_ui.js. */
const KLP_JINA = {};
function klpVyber(id, v) {
  if (v === KL_JINE_ZNENI) {
    KLP_JINA[id] = true;
    if (KLP.hodnoty) delete KLP.hodnoty[id];
    render();
    return;
  }
  delete KLP_JINA[id];
  klpSet(id, v);
}
function klpManual(id) { const h = KLP.hodnoty || {}; return h[id] !== undefined && h[id] !== ''; }
function klpVal(id, prefill) {
  const h = KLP.hodnoty || {};
  return klpManual(id) ? h[id] : (prefill != null ? prefill : '');
}

/* jeden řádek krycího listu PROJ; opts: {prefill, type:'text|textarea|date|radio|link', o:[...], src:'zdroj'} */
function klpRow(id, label, opts = {}) {
  opts = opts || {};
  const pref = opts.prefill != null ? String(opts.prefill) : '';
  const val = klpVal(id, pref);
  const manual = klpManual(id);
  let field;
  if (opts.type === 'dph' && opts.dphBind) {   // KL-7 – viz klDphPole() v kryci_ui.js
    return `<div class="kl-row"><div class="lbl">${label}</div><div>${klDphPole(opts.dphBind)}</div>
      <div class="src"><span class="note" style="font-size:10px">${esc(opts.src || 'hlavička kalkulace')} ↔</span></div></div>`;
  }
  if (opts.type === 'textarea')
    field = `<textarea onchange="klpSet('${id}', this.value)" placeholder="${esc(opts.ph || '')}">${esc(val)}</textarea>`;
  else if (opts.type === 'date')
    field = `<input type="date" value="${esc(val)}" onchange="klpSet('${id}', this.value)">`;
  else if (opts.type === 'radio')
    field = `<div class="kl-radio">${opts.o.map(x =>
      `<label><input type="radio" name="${klSkupina('klp', id)}" ${String(val) === String(x) ? 'checked' : ''}
        onchange="klpSet('${id}', this.value)" value="${esc(x)}">${esc(x)}</label>`).join('')}</div>`;
  else if (opts.type === 'vyber' && Array.isArray(opts.o)) {
    /* Výběr z číselníku s možností vlastního znění — zrcadlo klRow() z OCK
     * verze (10. 8. 2026, smluvní pokuty). Stav rozbalovátka drží KLP_JINA,
     * do zakázky se ukládá jen napsaná hodnota. */
    const jina = KLP_JINA[id] || (klpManual(id) && opts.o.indexOf(String(val)) < 0);
    const volby = opts.o.map(x =>
      `<option value="${esc(x)}" ${!jina && String(val) === String(x) ? 'selected' : ''}>${esc(x)}</option>`).join('');
    field = `<select onchange="klpVyber('${id}', this.value)">${volby}`
      + `<option value="${KL_JINE_ZNENI}" ${jina ? 'selected' : ''}>jiné znění…</option></select>`
      + (jina ? ` <input type="text" value="${esc(klpManual(id) ? val : '')}"
           onchange="klpSet('${id}', this.value)" placeholder="${esc(opts.ph || 'např. 0,2 % / den')}">` : '');
  }
  else if (opts.type === 'link')   // KL-6: scoring je odkaz (klOdkaz je sdílený s OCK verzí)
    field = `<input type="url" value="${esc(val)}" onchange="klpSet('${id}', this.value)" placeholder="${esc(opts.ph || 'https://…')}">${klOdkaz(val)}`;
  else
    field = `<input type="text" value="${esc(val)}" onchange="klpSet('${id}', this.value)" placeholder="${esc(opts.ph || '')}">`;
  const meta = opts.src
    ? (manual ? '<span class="pill mut" style="font-size:10px">ručně</span>'
              : `<span class="note" style="font-size:10px">${opts.src}</span>`)
    : '';
  const reset = (manual && opts.prefill != null)
    ? ` <button class="mini noprint" title="vrátit automatiku (${esc(pref)})" onclick="klpReset('${id}')">↺</button>` : '';
  return `<div class="kl-row"><div class="lbl">${label}</div><div>${field}</div><div class="src">${meta}${reset}</div></div>`;
}

/* ---- Smluvní a platební podmínky v souhrnu cenové nabídky PROJ (5. 8. 2026) ----
 * Zrcadlo kryciPodminkyBlok() z kryci_ui.js, jen nad druhým úložištěm
 * (varianta.data.kryciProj.hodnoty) a druhou konstantou. Právě proto se OCK
 * a PROJ nemají jak propsat jeden do druhého: nejsou to dvě kopie jedněch dat,
 * ale dvě oddělené sady od začátku — stejně jako jsou oddělené obě hlavičky. */
function kryciProjPodminkyBlok() {
  let c = null;
  try { c = kryciProjCtx(ZAK, aktivniVarianta(ZAK)); } catch (e) { c = null; }
  const sekceHtml = KRYCI_PROJ_SEKCE.filter(s => KRYCI_PROJ_NABIDKA_SEKCE.indexOf(s.sekce) >= 0).map(s => {
    const rows = s.pole.filter(p => !p.bind).map(p => {
      let pref = null;
      if (p.prefill && c) { try { pref = p.prefill(c); } catch (e) { pref = null; } }
      const zdroj = typeof p.src === 'function' ? (c ? p.src(c) : '') : p.src;
      return klpRow(p.id, p.label, { prefill: pref, type: p.typ, o: p.o, src: zdroj, ph: p.ph, dphBind: p.dphBind });
    }).join('');
    return `<h3>${s.sekce}</h3>${rows}`;
  }).join('');
  /* Sbalovací karta, ve výchozím stavu otevřená — viz kryciPodminkyBlok().
   * Rovněž bez id (nabidkaProjKarta() se vykresluje v Kalkulaci PROJ i v
   * Přehledu cenových nabídek); poznávací značkou je třída kl-podminky-proj. */
  return card('Smluvní a platební podmínky (PROJ)',
    `<div class="note" style="margin-bottom:8px">Totéž, co je v záložce <b>Krycí list zakázky PROJ</b> — jeden a týž záznam,
    ne kopie. Co změníte tady, uvidíte tam a naopak. Prázdné pole znamená automatiku (↺ vrátí předvyplněnou hodnotu).
    Podmínky OCK se řídí zvlášť u nabídky OCK — projekce a ocelová konstrukce mají vlastní splatnost i pokuty.</div>
    <div class="kl-podminky kl-podminky-proj">${sekceHtml}</div>`);
}

function renderKryciProj() {
  const el = document.getElementById('page-kryciproj'); if (!el) return;
  const c = kryciProjCtx(ZAK, aktivniVarianta(ZAK));   // kontext prefillů (jeden zdroj pravdy: KRYCI_PROJ_SEKCE)
  /* Prázdný ceník zhasíná výstupy – krycí list nese ceny stejně jako nabídka. */
  const zab = (typeof ukazkoveZabranaAttr === 'function') ? ukazkoveZabranaAttr() : '';

  const znacka = verze => verze.includes('bo') && verze.includes('techdata')
    ? '<span class="pill mut kl-verze" title="v obou verzích">BO+Tech</span>'
    : (verze.includes('techdata') ? '<span class="pill kl-verze" title="jen Technické oddělení">Tech</span>'
      : '<span class="pill kl-verze" title="jen Backoffice">BO</span>');

  const sekceHtml = KRYCI_PROJ_SEKCE.map(s => {
    const rows = s.pole.map(p => {
      const zdroj = typeof p.src === 'function' ? p.src(c) : p.src;   // popisek zdroje smí být i funkce
      if (p.bind) {   // obousměrné provázání s hlavičkou zakázky – žádný ruční přepis
        /* Je-li pole v hlavičce PROJ prázdné, zobrazí se hodnota z hlavičky OCK
         * (stejná, jaká půjde do dokumentu). Zápisem se uloží do hlavičky PROJ. */
        /* Vyplněnost se posuzuje stejně jako v dokumentu (hlavickaVyplneno),
         * aby na obrazovce nesvítilo něco jiného, než co se vytiskne – třeba
         * nedopsaná předloha čísla nabídky. */
        const zapsano = get(p.bind);
        const jeVyplneno = (typeof hlavickaVyplneno === 'function') ? hlavickaVyplneno(zapsano) : (zapsano != null && zapsano !== '');
        const val = jeVyplneno ? zapsano : (p.prefill ? (p.prefill(c) || '') : '');
        return `<div class="kl-row"><div class="lbl">${p.label} ${znacka(p.verze)}</div>
          <div><input type="text" value="${esc(val)}" onchange="set('${p.bind}', this.value)"></div>
          <div class="src"><span class="note" style="font-size:10px">${esc(zdroj || 'hlavička kalkulace')} ↔</span></div></div>`;
      }
      const pref = p.prefill ? p.prefill(c) : null;
      return klpRow(p.id, p.label + ' ' + znacka(p.verze),
        { prefill: pref, type: p.typ, o: p.o, src: zdroj, ph: p.ph, dphBind: p.dphBind });
    }).join('');
    return `<h3>${s.sekce}</h3>${rows}`;
  }).join('');

  el.innerHTML = `<div class="kl-doc">
    <h1>Krycí list zakázky PROJ</h1>
    <div class="note" style="margin-bottom:6px">Podklad pro objednávku / smlouvu o dílo na <b>projekční a inženýrskou činnost</b>.
    Vyčíslené položky se berou z <b>Kalkulace PROJ</b> (rozsah činností i hodnota zakázky), zbytek z hlavičky zakázky
    a z Nastavení → Firma; ruční přepis má přednost (↺ vrátí automatiku). Činnost, která v kalkulaci nemá cenu,
    se vypíše jako <b>„není součástí nabídky“</b> – nikdy nulou ani odhadem. Štítky <b>BO</b> / <b>Tech</b> / <b>BO+Tech</b>
    ukazují, do které verze výstupu pole patří.</div>
    ${typeof ukazkoveZabranaPanel === 'function' ? ukazkoveZabranaPanel() : ''}
    <div class="btns noprint" style="margin-bottom:10px">
      <button class="primary"${zab} onclick="kryciProjWord()">Generovat krycí list PROJ (Word) – obě verze</button>
      <button${zab} onclick="kryciProjTiskPohled('bo')">Tisk PDF – Backoffice</button>
      <button${zab} onclick="kryciProjTiskPohled('techdata')">Tisk PDF – Technické odd.</button>
    </div>
    <div class="note noprint" id="kryciProjStav">Vygenerují se <b>dva</b> soubory: <b>Backoffice</b> (obchodní část) a <b>Techdata</b> (technická část).</div>
    ${sekceHtml}
  </div>`;
}

/* Tiskový pohled krycího listu PROJ → PDF přes tisk prohlížeče. Vždy JEDNA
 * verze (samostatný soubor), aby šla distribuovat odděleně. Text lze před
 * uložením do PDF ručně upravit (TISK-1) – do kalkulace se změny nepropíšou. */
function kryciProjTiskPohled(verze) {
  /* Pojistka pro případ, že by se sem někdo dostal jinudy než tlačítkem
   * (zhasnutým) – tiskový náhled je dokument pro zákazníka jako každý jiný. */
  if (typeof dokumentZabrana === 'function') {
    const duvod = dokumentZabrana();
    if (duvod) { alert(duvod); return; }
  }
  const v = aktivniVarianta(ZAK);
  const e2 = esc;   // #6: sjednoceno se sdíleným escapováním (ošetří i uvozovky a apostrof)
  const d = kryciProjData(ZAK, v, JEKLY, verze);
  const sekHtml = d.sekce.map(s =>
    `<h2>${e2(s.sekce)}</h2><table>${s.radky.map(r => `<tr><td class="l">${e2(r[0])}</td><td>${e2(r[1] || '')}</td></tr>`).join('')}</table>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>${e2(d.nazevSouboru)}</title>
    <style>body{font:12px/1.45 "Segoe UI",sans-serif;color:#111;max-width:800px;margin:16px auto;padding:0 16px}
    h1{font-size:17px;margin:2px 0 8px} h2{font-size:11.5px;background:#2b3850;color:#fff;padding:4px 8px;margin:12px 0 4px;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;margin-bottom:2px} td{border:1px solid #c7d0db;padding:3px 7px;vertical-align:top}
    td.l{width:38%;font-weight:600;background:#eef2f8}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px;z-index:5}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    ${tiskListaCss()}
    @page{size:A4;margin:12mm} @media print{.noprint{display:none} body{margin:0}}</style></head>
    <body>${tiskListaHtml({ pozn: 'Verze ' + d.verzeNazev + ' — uložte jako samostatný soubor (' + d.nazevSouboru + '.pdf).' })}
    <div id="dok"><section><h1>${e2(d.nadpis)}</h1>${sekHtml}</section></div>
    ${tiskListaSkript()}</body></html>`);
  w.document.close();
}

/* Generování krycího listu PROJ do Wordu – VŽDY obě verze (Backoffice + Techdata). */
function kryciProjWord() {
  const stav = document.getElementById('kryciProjStav');
  const v = aktivniVarianta(ZAK);
  const verze = [['kryciproj_bo', 'Backoffice'], ['kryciproj_techdata', 'Techdata']];
  if (stav) stav.textContent = 'Generuji obě verze (Backoffice + Techdata)…';
  let hotovo = 0;
  verze.forEach(([typ, label], i) => {
    // malý odstup mezi stažením obou souborů, ať je prohlížeč nezablokuje
    setTimeout(() => {
      dokumentVygeneruj(typ, null, ZAK, v, JEKLY)
        .then(res => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(res.blob);
          a.download = res.nazevSouboru + '.docx';
          a.click();
          if (stav && ++hotovo === verze.length)
            stav.textContent = 'Hotovo – ve Stažených jsou 2 soubory (Backoffice + Techdata). Otevři ve Wordu, doplň a případně vytiskni do PDF.';
        })
        .catch(err => { if (stav) stav.textContent = 'Chyba (' + label + '): ' + err.message; });
    }, i * 400);
  });
}
