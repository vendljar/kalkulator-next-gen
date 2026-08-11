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

/* Skupina přepínačů je v HTML určena atributem `name` a platí pro CELÝ
 * dokument. Podmínky se přitom vykreslují vícekrát na jedné stránce —
 * v Kalkulaci OCK, v Přehledu cenových nabídek a v Krycím listu — a dokud
 * všechny kopie sdílely `name="kl_typSmlouvy"`, nechal prohlížeč zaškrtnutou
 * jen tu poslední vykreslenou. Obchodník klikl v Kalkulaci, hodnota se
 * uložila správně, ale kolečko zůstalo prázdné (hlášení 5. 8. 2026:
 * „není vidět volba po vybrání ano / ne nebo typ smlouvy").
 *
 * Řešení je dát každé vykreslené kopii vlastní název skupiny. Na název se
 * nikde nespoléháme — hodnotu zapisuje obsluha onchange, ne formulář — takže
 * je jedno, že se s každým překreslením mění. */
let KL_SKUPINA_N = 0;
function klSkupina(predpona, id) { return predpona + '_' + id + '_' + (++KL_SKUPINA_N); }

/* Které řádky mají rozbalené „jiné znění". Schválně jen v paměti obrazovky:
 * je to stav ovládacího prvku, ne údaj zakázky, a do uloženého souboru
 * nepatří. Po načtení zakázky se pozná z hodnoty (není v číselníku). */
const KL_JINA = {};
const KL_JINE_ZNENI = '__jine__';

function klVyber(id, v) {
  if (v === KL_JINE_ZNENI) {
    /* Rozbalí textové pole a hodnotu smaže — dokud člověk nic nenapíše,
     * platí prefill. Nastavit sem rovnou prázdný řetězec by znamenalo
     * tvářit se, že si vybral prázdno. */
    KL_JINA[id] = true;
    if (KL.hodnoty) delete KL.hodnoty[id];
    render();
    return;
  }
  delete KL_JINA[id];
  klSet(id, v);
}

/* KL-7 (hlášení 5. 8. 2026): „Sazba DPH nemůže být přepisovatelná, ale musí
 * být volitelná 12/21 % a navázaná na hlavičku kalkulace."
 *
 * Do 5. 8. byl řádek „Sazba DPH" v podmínkách obyčejné textové pole. Šlo do
 * něj napsat „19 %" — a krycí list i nabídka pak tvrdily jinou sazbu, než
 * jakou se počítalo „Celkem s DPH" o kus výš. Rozdíl nešlo poznat jinak než
 * porovnáním dvou míst v dokumentu, takže se dřív nebo později dostal do
 * nabídky pro zákazníka.
 *
 * Řešení je stejné jako u ostatních polí s `bind`: žádná vlastní hodnota se
 * neukládá, výběr zapisuje rovnou do sazby v hlavičce kalkulace (C.dph pro
 * OCK, PC.dph pro projekci). Tím je vyloučeno, aby se ta dvě čísla rozešla —
 * je to jedno číslo ve dvou pohledech, ne dvě kopie. Funkce je sdílená pro
 * OCK i PROJ (celé UI je jeden skript), liší se jen cesta v `bind`. */
function klDphPole(bind) {
  const sazby = (typeof KRYCI_DPH_SAZBY !== 'undefined') ? KRYCI_DPH_SAZBY : [12, 21];
  let ted = 0;
  try { ted = Math.round((get(bind) || 0) * 100); } catch (e) { ted = 0; }
  /* Kdyby v zakázce byla uložená jiná sazba (starší zakázka, dřívější právní
   * stav), nabídne se navíc — jinak by ji vykreslení výběru tiše přepsalo. */
  const nabidka = sazby.includes(ted) || !ted ? sazby.slice() : sazby.concat([ted]).sort((a, b) => a - b);
  const popis = { 12: '12 % snížená', 21: '21 % základní' };
  const opts = nabidka.map(s =>
    `<option value="${s}" ${s === ted ? 'selected' : ''}>${esc(popis[s] || (s + ' %'))}</option>`).join('');
  return `<select onchange="set('${bind}', (+this.value) / 100)">${opts}</select>`;
}

/* jeden řádek krycího listu; opts: {prefill, type:'text|textarea|date|radio|link|dph', o:[...], src:'zdroj', dphBind:'C.dph'} */
function klRow(id, label, opts = {}) {
  opts = opts || {};
  const pref = opts.prefill != null ? String(opts.prefill) : '';
  const val = klVal(id, pref);
  const manual = klManual(id);
  let field;
  if (opts.type === 'dph' && opts.dphBind) {
    /* Bez „ručně" a bez ↺: není co vracet, hodnota nikdy nebyla ruční. */
    return `<div class="kl-row"><div class="lbl">${label}</div><div>${klDphPole(opts.dphBind)}</div>
      <div class="src"><span class="note" style="font-size:10px">${esc(opts.src || 'hlavička kalkulace')} ↔</span></div></div>`;
  }
  if (opts.type === 'textarea')
    field = `<textarea onchange="klSet('${id}', this.value)" placeholder="${esc(opts.ph || '')}">${esc(val)}</textarea>`;
  else if (opts.type === 'date')
    field = `<input type="date" value="${esc(val)}" onchange="klSet('${id}', this.value)">`;
  else if (opts.type === 'radio')
    field = `<div class="kl-radio">${opts.o.map(x =>
      `<label><input type="radio" name="${klSkupina('kl', id)}" ${String(val) === String(x) ? 'checked' : ''}
        onchange="klSet('${id}', this.value)" value="${esc(x)}">${esc(x)}</label>`).join('')}</div>`;
  else if (opts.type === 'vyber' && Array.isArray(opts.o)) {
    /* Výběr z číselníku s možností vlastního znění (10. 8. 2026, smluvní pokuty).
     *
     * Volné pole u pokuty svádělo k překlepu, který se propsal do nabídky
     * i do krycího listu — a pokuta je jediný údaj v podmínkách, který se
     * v případě sporu čte doslova. Zároveň se nesmělo zavřít docela: zákazník
     * si občas prosadí jinou sazbu a nabídka na to musí umět odpovědět.
     *
     * Že si člověk vybral „jiné znění", se nikam neukládá. Poznat to jde
     * z hodnoty samotné (není v číselníku), a dokud je pole prázdné, drží se
     * to jen v paměti obrazovky (KL_JINA) — do zakázky se ukládá jenom to,
     * co je opravdu napsané. Uložený soubor tak nenese stav rozbalovátka. */
    const jina = KL_JINA[id] || (klManual(id) && opts.o.indexOf(String(val)) < 0);
    const volby = opts.o.map(x =>
      `<option value="${esc(x)}" ${!jina && String(val) === String(x) ? 'selected' : ''}>${esc(x)}</option>`).join('');
    field = `<select onchange="klVyber('${id}', this.value)">${volby}`
      + `<option value="${KL_JINE_ZNENI}" ${jina ? 'selected' : ''}>jiné znění…</option></select>`
      + (jina ? ` <input type="text" value="${esc(klManual(id) ? val : '')}"
           onchange="klSet('${id}', this.value)" placeholder="${esc(opts.ph || 'např. 0,2 % / den')}">` : '');
  }
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
      return klRow(p.id, p.label, { prefill: pref, type: p.typ, o: p.o, src: p.src, ph: p.ph, dphBind: p.dphBind });
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
        { prefill: pref, type: p.typ, o: p.o, src: p.src, ph: p.ph, dphBind: p.dphBind });
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
