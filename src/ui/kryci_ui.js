/* ================= ZÁLOŽKA KRYCÍ LIST ZAKÁZKY OCK =================
 * Krycí list objednávky / SoD (dle přiloženého xlsx). Pole se předvyplňují
 * z kalkulace OCK, zakázky a technické specifikace; ruční hodnoty se ukládají
 * ve variantě (data.kryci.hodnoty), ruční přepis má přednost (↺ vrátí prefill).
 * Tisk do PDF vlastním tlačítkem u náhledu krycího listu (od 4. 8. 2026;
 * z hlavičky aplikace společné tlačítko „Tisk / PDF" zmizelo). */

function klSet(id, v) {
  if (!KL.hodnoty) KL.hodnoty = {};
  if (v === '' || v == null) delete KL.hodnoty[id]; else KL.hodnoty[id] = v;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function klReset(id) { if (KL.hodnoty) delete KL.hodnoty[id]; render(); }
function klManual(id) { const h = KL.hodnoty || {}; return h[id] !== undefined && h[id] !== ''; }
function klVal(id, prefill) {
  const h = KL.hodnoty || {};
  return klManual(id) ? h[id] : (prefill != null ? prefill : '');
}

/* KL-6: pole typu odkaz (scoring Cribis / Pipedrive). Odkaz se zobrazí jen
 * u http(s) adres – jiné schéma (např. javascript:) se do stránky nedostane. */
function klOdkaz(val) {
  return /^https?:\/\//i.test(String(val || ''))
    ? ` <a class="mini noprint" href="${esc(val)}" target="_blank" rel="noopener noreferrer" title="otevřít odkaz">↗</a>` : '';
}

/* jeden řádek krycího listu; opts: {prefill, type:'text|textarea|date|radio|link', o:[...], src:'zdroj'} */
function klRow(id, label, opts = {}) {
  opts = opts || {};
  const pref = opts.prefill != null ? String(opts.prefill) : '';
  const val = klVal(id, pref);
  const manual = klManual(id);
  let field;
  if (opts.type === 'textarea')
    field = `<textarea onchange="klSet('${id}', this.value)" placeholder="${esc(opts.ph || '')}">${esc(val)}</textarea>`;
  else if (opts.type === 'date')
    field = `<input type="date" value="${esc(val)}" onchange="klSet('${id}', this.value)">`;
  else if (opts.type === 'radio')
    field = `<div class="kl-radio">${opts.o.map(x =>
      `<label><input type="radio" name="kl_${id}" ${String(val) === String(x) ? 'checked' : ''}
        onchange="klSet('${id}', this.value)" value="${esc(x)}">${esc(x)}</label>`).join('')}</div>`;
  else if (opts.type === 'link')
    field = `<input type="url" value="${esc(val)}" onchange="klSet('${id}', this.value)" placeholder="${esc(opts.ph || 'https://…')}">${klOdkaz(val)}`;
  else
    field = `<input type="text" value="${esc(val)}" onchange="klSet('${id}', this.value)" placeholder="${esc(opts.ph || '')}">`;
  const meta = opts.src
    ? (manual ? '<span class="pill mut" style="font-size:10px">ručně</span>'
              : `<span class="note" style="font-size:10px">${opts.src}</span>`)
    : '';
  const reset = (manual && opts.prefill != null)
    ? ` <button class="mini noprint" title="vrátit automatiku (${esc(pref)})" onclick="klReset('${id}')">↺</button>` : '';
  return `<div class="kl-row"><div class="lbl">${label}</div><div>${field}</div><div class="src">${meta}${reset}</div></div>`;
}

/* ---- Smluvní a platební podmínky v souhrnu cenové nabídky OCK (5. 8. 2026) ----
 * Zadání: „Přidej do souhrnu cenových nabídek OCK i PROJ pod Celkem s DPH
 * smluvní a platební podmínky. A provaž je s odpovídajícími krycími listy.
 * Tzn. cokoliv se v nich změní vzájemně se propíše."
 *
 * Provázání se NEPROGRAMUJE. Blok vykresluje tytéž řádky z KRYCI_SEKCE
 * (sekce vyjmenované v KRYCI_NABIDKA_SEKCE) a stejným klRow() zapisuje do
 * stejného úložiště varianta.data.kryci.hodnoty jako záložka Krycí list.
 * Nevznikne tedy druhá kopie hodnot, která by se mohla rozejít — je to jeden
 * záznam ve dvou pohledech. Kdyby se to dělalo kopírováním, obchodník by po
 * změně splatnosti v nabídce musel doufat, že se to někam propsalo; takhle
 * fyzicky není kam se rozejít.
 *
 * Pole s `bind` (objednatel, číslo nabídky…) se sem záměrně nedávají — ta se
 * vyplňují v kartě „Zakázka – hlavička" o kus výš na téže stránce a dvakrát
 * na jedné obrazovce by mátla. Štítky BO/Tech se tu také nezobrazují: v
 * nabídce nejde o to, do které verze krycího listu pole patří. */
function kryciPodminkyBlok() {
  let c = null;
  try { c = kryciCtx(ZAK, aktivniVarianta(ZAK), JEKLY); } catch (e) { c = null; }
  const sekceHtml = KRYCI_SEKCE.filter(s => KRYCI_NABIDKA_SEKCE.indexOf(s.sekce) >= 0).map(s => {
    const rows = s.pole.filter(p => !p.bind).map(p => {
      let pref = null;
      if (p.prefill && c) { try { pref = p.prefill(c); } catch (e) { pref = null; } }
      return klRow(p.id, p.label, { prefill: pref, type: p.typ, o: p.o, src: p.src, ph: p.ph });
    }).join('');
    return `<h3>${s.sekce}</h3>${rows}`;
  }).join('');
  /* Sbalovací karta (card) — podmínek je přes patnáct řádků a souhrn nabídky
   * má zůstat přehledný. Otevřená je ale ve výchozím stavu: zadání bylo, že
   * podmínky mají být pod cenou vidět, ne schované za dalším kliknutím.
   *
   * Záměrně BEZ id: nabidkaKarta() se vykresluje dvakrát — v Kalkulaci OCK
   * (karta „Cenová nabídka (CN)") i v Přehledu cenových nabídek — a dvě stejná
   * id v jednom dokumentu by byla chyba. Blok se proto pozná podle třídy
   * kl-podminky-ock (tu používá i harness overit_podminky.mjs). */
  return card('Smluvní a platební podmínky (OCK)',
    `<div class="note" style="margin-bottom:8px">Totéž, co je v záložce <b>Krycí list zakázky OCK</b> — jeden a týž záznam,
    ne kopie. Co změníte tady, uvidíte tam a naopak; do nabídky i do krycího listu jde vždy poslední hodnota.
    Prázdné pole znamená automatiku (↺ vrátí předvyplněnou hodnotu). Podmínky PROJ se řídí zvlášť u nabídky PROJ.</div>
    <div class="kl-podminky kl-podminky-ock">${sekceHtml}</div>`);
}

function renderKryci() {
  const el = document.getElementById('page-kryci'); if (!el) return;
  const c = kryciCtx(ZAK, aktivniVarianta(ZAK), JEKLY);   // kontext prefillů (jeden zdroj pravdy: KRYCI_SEKCE)
  /* Prázdný ceník zhasíná výstupy – krycí list nese ceny stejně jako nabídka. */
  const zab = (typeof ukazkoveZabranaAttr === 'function') ? ukazkoveZabranaAttr() : '';

  const znacka = verze => verze.includes('bo') && verze.includes('techdata')
    ? '<span class="pill mut kl-verze" title="v obou verzích">BO+Tech</span>'
    : (verze.includes('techdata') ? '<span class="pill kl-verze" title="jen Technické oddělení">Tech</span>'
      : '<span class="pill kl-verze" title="jen Backoffice">BO</span>');

  const sekceHtml = KRYCI_SEKCE.map(s => {
    const rows = s.pole.map(p => {
      if (p.bind) {   // obousměrné provázání s hlavičkou kalkulace (ZAK) – žádný ruční přepis
        return `<div class="kl-row"><div class="lbl">${p.label} ${znacka(p.verze)}</div>
          <div><input type="text" value="${esc(get(p.bind))}" onchange="set('${p.bind}', this.value)"></div>
          <div class="src"><span class="note" style="font-size:10px">${esc(p.src || 'hlavička kalkulace')} ↔</span></div></div>`;
      }
      const pref = p.prefill ? p.prefill(c) : null;
      return klRow(p.id, p.label + ' ' + znacka(p.verze),
        { prefill: pref, type: p.typ, o: p.o, src: p.src, ph: p.ph });
    }).join('');
    return `<h3>${s.sekce}</h3>${rows}`;
  }).join('');

  el.innerHTML = `<div class="kl-doc">
    <h1>Krycí list objednávky / SoD</h1>
    <div class="note" style="margin-bottom:6px">Podklad pro objednávku / smlouvu o dílo. Pole se předvyplňují z kalkulace OCK,
    zakázky a technické specifikace; ruční přepis má přednost (↺ vrátí automatiku). Štítky <b>BO</b> / <b>Tech</b> / <b>BO+Tech</b>
    ukazují, do které verze výstupu pole patří.</div>
    ${typeof ukazkoveZabranaPanel === 'function' ? ukazkoveZabranaPanel() : ''}
    <div class="btns noprint" style="margin-bottom:10px">
      <button class="primary"${zab} onclick="kryciWord()">Generovat krycí list (Word) – obě verze</button>
      <button${zab} onclick="kryciTiskPohled('bo')">Tisk PDF – Backoffice</button>
      <button${zab} onclick="kryciTiskPohled('techdata')">Tisk PDF – Technické odd.</button>
    </div>
    <div class="note noprint" id="kryciStav">Vygenerují se <b>dva</b> soubory: <b>Backoffice</b> (obchodní část) a <b>Techdata</b> (technická část).</div>
    ${sekceHtml}
  </div>`;
}

/* Tiskový pohled krycího listu → PDF přes tisk prohlížeče. Vždy JEDNA verze
 * (samostatný soubor), aby šla distribuovat odděleně – Backoffice (finance) vs
 * Technické oddělení (bez finančních detailů). */
function kryciTiskPohled(verze) {
  /* Pojistka pro případ, že by se sem někdo dostal jinudy než tlačítkem
   * (zhasnutým) – tiskový náhled je dokument pro zákazníka jako každý jiný. */
  if (typeof dokumentZabrana === 'function') {
    const duvod = dokumentZabrana();
    if (duvod) { alert(duvod); return; }
  }
  const v = aktivniVarianta(ZAK);
  const e2 = esc;   // #6: sjednoceno se sdíleným escapováním (ošetří i uvozovky a apostrof)
  const d = kryciData(ZAK, v, JEKLY, verze);
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

/* Generování krycího listu do Wordu – VŽDY obě verze (Backoffice + Techdata). */
function kryciWord() {
  const stav = document.getElementById('kryciStav');
  const v = aktivniVarianta(ZAK);
  const verze = [['kryci_bo', 'Backoffice'], ['kryci_techdata', 'Techdata']];
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
