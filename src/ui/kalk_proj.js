/* ================= ZÁLOŽKA KALKULACE PROJ =================
 * Kalkulace projekčních prací dle vzoru Kalkulator_projekce.xlsx.
 * Sekce: položky hodiny×sazba / fixní částky, doprava bez přirážky,
 * globální přirážka (PC.marze) po sekcích s možností vlastního % sekce.
 * Sleva projekce je vlastní (#134) a odečítá se až od hotové ceny.
 *
 * VZHLED (schválený návrh A2, 31. 7. 2026): tabulka vypadá stejně jako
 * kalkulace OCK — jedna tabulka pro celou kalkulaci a v ní sekce vždy ve
 * stejném pořadí řádků:
 *      světlý pruh s názvem sekce (tr.sechd)
 *      → položky → doprava → „+ přidat" (tr.pridat)
 *      → tmavý součet sekce (tr.sectot)
 * a na konci jediný uzavírací tr.tot. Nic mezi tím: mezisoučtové pruhy
 * (tr.sec) a řádek „Náklad sekce" jsou pryč, částky patří do sloupců.
 * Hlídá to src/test_proj_vzhled.js. */

function pjSekce(i) { return PJ.sekce[i]; }
function pjSet(i, cesta, val) {
  const ks = cesta.split('.'); const last = ks.pop();
  ks.reduce((o, k) => o[k], PJ.sekce[i])[last] = val;
  /* Úprava TRVALÉHO řádku (kid z ceníku PROJ) se propíše zpět do ceníku,
   * aby nové zakázky nedostávaly „Nová položka / 0", kterou už nikdo tak
   * nevidí (19. 8. 2026). Ceník téhle varianty i globální ceník aplikace. */
  const mCesta = cesta.match(/^polozky\.(\d+)\./);
  if (mCesta) {
    const p = PJ.sekce[i].polozky[+mCesta[1]];
    if (p && p.kid && typeof projKatalogPropis === 'function') {
      projKatalogPropis(PC, PJ.sekce[i].key, p);
      if (typeof DEFAULT_CENIK_PROJ !== 'undefined')
        projKatalogPropis(DEFAULT_CENIK_PROJ, PJ.sekce[i].key, p);
    }
  }
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function pjPolozkaAdd(i, typ) {
  PJ.sekce[i].polozky.push(typ === 'hod'
    ? { nazev: 'Nová položka', typ: 'hod', sazba: 'projektant', hodiny: 0, rezerva: 0, vlastni: true }
    : { nazev: 'Nová položka', typ: 'fix', cena: 0, vlastni: true });
  render();
}
/* „+ přidat položku trvale" (19. 8. 2026, jen administrátor): položka se
 * založí v CENÍKU PROJ dané sekce (PC.vlastniPolozky) — platí pro všechny
 * budoucí zakázky, přežije obnovení stránky (ceník cestuje s variantou a
 * zveřejňuje se do platného ceníku programu). Zapíše se i do globálního
 * DEFAULT_CENIK_PROJ, aby ji hned dostala každá nová zakázka v této relaci. */
function pjPolozkaAddTrvale(i, typ) {
  if (!jeAdmin()) return;
  const key = PJ.sekce[i].key;
  const it = projKatalogPridej(PC, key, { typ: typ === 'hod' ? 'hod' : 'fix' });
  if (typeof DEFAULT_CENIK_PROJ !== 'undefined' && DEFAULT_CENIK_PROJ !== PC) {
    /* stejné kid v obou cenících; čítač srovnat, ať se id nikdy nepotkají */
    DEFAULT_CENIK_PROJ.vlastniSeq = Math.max(+DEFAULT_CENIK_PROJ.vlastniSeq || 0, +PC.vlastniSeq || 0);
    if (!projKatalogSekce(DEFAULT_CENIK_PROJ, key).some(k => k.kid === it.kid))
      projKatalogSekce(DEFAULT_CENIK_PROJ, key).push(JSON.parse(JSON.stringify(it)));
  }
  projKatalogAplikuj(PC, PJ);
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
/* Smazat jde jen vlastní řádek. Předlohová položka se z kalkulace nevyhazuje —
 * od toho je vyřazení (pjVyrazeno): zůstane vidět, co u téhle stavby neděláme
 * a za kolik, a příště se vrátí jedním kliknutím.
 * Trvalý řádek (kid) se maže jen v TÉTO zakázce a zapamatuje se, ať se
 * nevrací; v ceníku PROJ a v nových nabídkách zůstává (stejně jako OCK). */
function pjPolozkaDel(i, j) {
  const p = PJ.sekce[i].polozky[j];
  if (p && p.kid) {
    if (!confirm('Položka „' + p.nazev + '" je trvalá (z ceníku PROJ).\n\nSmazat ji jen v této zakázce?\nV ceníku a v nových nabídkách zůstane.')) return;
    if (typeof projKatalogZapamatujOdebrani === 'function') projKatalogZapamatujOdebrani(PJ, p);
  }
  PJ.sekce[i].polozky.splice(j, 1);
  render();
}

/* ---- ruční přepisy položky PROJ (#8) ----
 * Prázdné pole = přepis není a platí ceník; nula je platný přepis
 * („děláme zdarma"), proto se tu rozlišuje prázdno, ne nepravda. */
function pjPrepis(i, j, pole, hodnota) {
  const p = PJ.sekce[i].polozky[j];
  if (hodnota === '' || hodnota === null) delete p[pole];
  else p[pole] = +hodnota || 0;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
function pjVyrazeno(i, j, vyrazeno) {
  const p = PJ.sekce[i].polozky[j];
  if (vyrazeno) p.vyrazeno = true; else delete p.vyrazeno;
  /* ZAMĚŘENÍ × STUDIE se VYLUČUJÍ (rozhodnutí 17. 8. 2026). Studie
   * proveditelnosti zaměření už obsahuje (její část 1 je totéž zaměření
   * a zpracování výstupů) — kdyby se počítaly obě sekce, nabídka by
   * zaměření účtovala dvakrát. Zapnutí položky v jedné sekci proto
   * automaticky vyřadí všechny položky té druhé; kdo chce zpět, jedním
   * kliknutím druhou sekci zase zapne (a vyřadí se tahle). */
  if (!vyrazeno) {
    const kde = PJ.sekce[i].key;
    const druha = kde === 'zamereni' ? 'studie' : (kde === 'studie' ? 'zamereni' : null);
    if (druha) {
      const ds = PJ.sekce.find(x => x.key === druha);
      if (ds) ds.polozky.forEach(q => { q.vyrazeno = true; });
    }
  }
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}
/* Zaškrtávátko ZA CELOU SEKCI (17. 8. 2026 večer): jedno kliknutí zapne nebo
 * vyřadí všechny položky sekce najednou. Při zapnutí platí totéž vyloučení
 * ZAMĚŘENÍ × STUDIE jako u jednotlivých položek. */
function pjSekceVse(i, pocitat) {
  PJ.sekce[i].polozky.forEach(q => { if (pocitat) delete q.vyrazeno; else q.vyrazeno = true; });
  if (pocitat) {
    const kde = PJ.sekce[i].key;
    const druha = kde === 'zamereni' ? 'studie' : (kde === 'studie' ? 'zamereni' : null);
    if (druha) {
      const ds = PJ.sekce.find(x => x.key === druha);
      if (ds) ds.polozky.forEach(q => { q.vyrazeno = true; });
    }
  }
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

function pjPozn(i, j, text) {
  const p = PJ.sekce[i].polozky[j];
  const t = String(text || '').trim();
  if (t) p.pozn = t; else delete p.pozn;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

/* ---- přetahování řádků v rámci sekce (jen admin) ----
 * Samotné přehození drží čistá funkce presunPolozku v engine_proj.js, aby
 * šlo otestovat bez prohlížeče. Tady zbývá jen obsluha myši. Přetahuje se
 * pouze uvnitř jedné sekce – řádek z DPS nemá v Zaměření co dělat. */
let _pjDragSek = null, _pjDragIdx = null;
function pjDragStart(e, i, j) {
  _pjDragSek = i; _pjDragIdx = j;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(j)); } catch (_) {}
  }
}
function pjDragOver(e, tr) {
  if (_pjDragIdx == null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  if (tr) tr.classList.add('drag-over');
}
function pjDragLeave(tr) { if (tr) tr.classList.remove('drag-over'); }
function pjDragDrop(e, i, j, tr) {
  e.preventDefault();
  if (tr) tr.classList.remove('drag-over');
  if (_pjDragSek === i && _pjDragIdx != null && _pjDragIdx !== j) {
    PJ.sekce[i].polozky = presunPolozku(PJ.sekce[i].polozky, _pjDragIdx, j);
    aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  }
  _pjDragSek = null; _pjDragIdx = null;
  render();
}

function renderProj() {
  let r;
  try { r = vypocetProj(PJ, PC); }
  catch (e) { document.getElementById('page-proj').innerHTML = `<div class="card"><div class="body neg">Chyba výpočtu: ${esc(e.message)}</div></div>`; return; }

  /* Sloupce podle role řeší stejná funkce jako v OCK (kalkSloupce), ať se obě
   * kalkulace nemůžou rozejít: běžný uživatel zatím vidí hodiny i sazbu, ale
   * nikdy náklad a přirážku. */
  const col = kalkSloupce();
  const POPIS_SL = 5;                       // Položka · Hodiny · Rezerva · Celkem h · Sazba
  const NC = POPIS_SL + (col.showCost ? 2 : 0) + 1 + (col.admin ? 1 : 0);

  /* Koncovou cenu skládá zaokrouhleni.js (#38) – hlavička i souhrn musí ukazovat
   * totéž číslo, které pak odejde v nabídce. Od 12. 8. 2026 (#135) se zaokrouhluje
   * cena každé činnosti zvlášť, takže součet je zaokrouhlený sám od sebe a nabídka
   * už nepotřebuje dorovnávací řádek. */
  const cnp = (typeof cenaNabidkyProj === 'function') ? cenaNabidkyProj(r, SLP, ZOP) : null;
  const projCena = cnp ? cnp.cena : r.souhrn.celkem;
  const projZaokr = cnp ? cnp.zaokrKc : 0;

  /* Přirážka položky se v jádře počítá až za celou sekci (naklad × procento
   * sekce). Pro sloupce v tabulce se rozpočítá na řádky – součet sedí, protože
   * jde o tentýž jednotný podíl. Od #141 je procento JEDNO: výchozí globální
   * z ceníku, sekce ho může přepsat — řádky sekce proto počítají s procentem
   * SVÉ sekce, ne s globálním. Doprava přirážku nenese, proto u ní pomlčka. */
  const marzeSekce = (s, n) => n * ((s.pouzitePct || 0) / 100);
  const penize = (naklad, marze, cena) =>
    (col.showCost ? `<td>${fmt(naklad)}</td><td>${marze === null ? '—' : fmt(marze)}</td>` : '') +
    `<td>${fmt(cena)}</td>`;

  /* ---------------- hlavička: dlaždice úplně stejné jako v OCK ---------------- */
  const naklad = r.souhrn.naklad + r.souhrn.doprava;
  const hrubyZisk = projCena - naklad;
  const marze = projCena > 0 ? hrubyZisk / projCena : 0;
  /* Poskytnutá sleva projekce (#134) – z vlastní slevy PROJ, ne z OCK
   * a ne z bývalého pole „Globální sleva PROJ". */
  const slevaProjPodil = cnp ? cnp.slevaPct : ((typeof slevaPodil === 'function') ? slevaPodil(SLP) : 0);
  const _dph = cenaSDph(projCena, PC.dph), dphKc = _dph.dphKc, celkemSDph = _dph.sDph;   // #14 krok 1
  const kv = NAST.kpiViditelne || {};
  const vidKpi = k => col.admin || kv[k];
  const kpiChk = k => col.admin ? `<input type="checkbox" class="kpi-chk" ${kv[k] ? 'checked' : ''} onchange="kpiVidSet('${k}', this.checked)" title="zviditelnit pro běžného uživatele">` : '';
  const kpiLine = (k, label, val) => vidKpi(k)
    ? `<div class="kpi-line"><span class="kl">${label}${kpiChk(k)}</span><span class="kv">${val}</span></div>` : '';
  const pct = x => (Math.round(x * 1000) / 10).toLocaleString('cs-CZ') + ' %';
  const box3 = kpiLine('naklad', 'Náklad', fmt0(naklad)) + kpiLine('hrubyZisk', 'Hrubý zisk', fmt0(hrubyZisk));
  const box4 = kpiLine('sleva', 'Poskytnutá sleva', pct(slevaProjPodil)) + kpiLine('marze', 'Marže', pct(marze));
  /* Obchodní zaokrouhlení má od 1. 8. 2026 vlastní sekci pod výpočtem (#38)
   * a vypisuje se i vlastním řádkem v souhrnné tabulce. V hlavičce by byl
   * jen třetí opis téhož čísla, tak tam není. Cena nabídky ale zůstává –
   * je to částka, která odchází zákazníkovi, a ta patří nahoru vždycky,
   * i když se zrovna nezaokrouhluje. */
  const cenaLine = `<div class="kpi-line"><span class="kl">Cena nabídky bez DPH</span><span class="kv">${fmt0(projCena)}</span></div>`;

  /* Přirážka a sleva jsou DVĚ oddělené veličiny (zadání 31. 7. 2026:
   * „a je to vždy rozdělené, tzn. globální sleva a globální přirážka").
   * V hlavičce zůstává jen globální přirážka = PC.marze z ceníku PROJ:
   * přičítá se k nákladu sekce, je předvyplněná z ceníkové databáze
   * a jde ji tady rovnou přepsat.
   *   Sleva projekce má vlastní kartu pod výpočtem (#134, 12. 8. 2026) a
   *   počítá se z ceny projekce – patří k ceně, která jde ven, ne k tomu,
   *   z čeho se počítá. Popisky sedí vpravo u svých hodnot (.prm). */
  const hlava = `<div class="kalk-title">${ZAK.cislo ? `<span class="kt-cislo">${esc(ZAK.cislo)}</span>` : ''}${esc(ZAK.nazevAkce || 'Bez názvu akce')}</div>
  <div class="grand">
    <div class="kpi main"><div class="l">Základní cena bez DPH</div><div class="v">${fmt0(r.souhrn.cena)}</div></div>
    <div class="kpi kpi-multi">
      ${cenaLine}
      <div class="kpi-line"><span class="kl">DPH ${Math.round(PC.dph * 100)} %</span><span class="kv">${fmt0(dphKc)}</span></div>
      <div class="kpi-line"><span class="kl">Celkem s DPH</span><span class="kv">${fmt0(celkemSDph)}</span></div>
    </div>
    ${box3 ? `<div class="kpi kpi-multi">${box3}</div>` : ''}
    ${box4 ? `<div class="kpi kpi-multi">${box4}</div>` : ''}
  </div>
  ${col.admin ? `<div class="prm"><span class="prm-l">Globální přirážka <span class="note">(z ceníku PROJ, platí pro všechny sekce)</span></span>
    <input type="number" step="1" style="width:76px" value="${Math.round(PC.marze * 10000) / 100}"
      onchange="set('PC.marze', (+this.value) / 100)"><span class="prm-u">%</span></div>` : ''}`;

  /* ---------------- tabulka kalkulace ---------------- */
  const hlavicka = `<tr><th>Položka</th><th>Hodiny</th><th>Rezerva h</th><th>Celkem h</th><th>Sazba Kč/h · fix</th>`
    + `${col.showCost ? `<th>Náklad</th><th>Přirážka ${num(PC.marze * 100)} %</th>` : ''}<th>Cena</th>`
    + `${col.admin ? '<th class="admincol" title="odškrtnutím se položka přestane počítat">Počítat</th>' : ''}</tr>`;

  const sekceHtml = r.sekce.map((s, i) => {
    const zdroj = pjSekce(i);

    /* Režim sekce (19. 8. 2026 večer, stejné pravidlo jako OCK): skrytou
     * sekci obchodník/vedoucí vůbec nedostane (počítá se dál!), srolovaná
     * ukáže jen nadpis + CELKEM a jde rozbalit. Administrátor vidí vždy vše
     * a v nadpisu má select s volbou zobrazit / skrýt / srolovat. */
    const rezimSek = sekceRezim('proj', s.key);
    if (rezimSek === 'skryt') return '';
    const sbalenoSek = sekceSbalena('proj', s.key);
    const vpravoSek = col.admin ? sekceRezimSelect('proj', s.key)
      : (rezimSek === 'srolovat' ? sekceRozbalBtn('proj', s.key) : '');

    /* Vyřazená položka je informace pro nás, ne pro zákazníka: běžný uživatel
     * ji nevidí vůbec (zadání „přeškrtnuté položky odstraň"), admin ji vidí
     * ztlumenou a přeškrtnutou, aby věděl, co u téhle stavby vyřadil.
     * Index j se nese s sebou – ukazuje do PJ.sekce[i].polozky, takže filtr
     * nesmí řádky přečíslovat. */
    const vsechny = s.polozky.map((p, j) => ({ p, j }));
    const viditelne = col.admin ? vsechny : vsechny.filter(x => !x.p.vyrazeno);

    const radky = viditelne.map(({ p, j }) => {
      const dz = col.admin ? ` ondragover="pjDragOver(event,this)" ondragleave="pjDragLeave(this)" ondrop="pjDragDrop(event,${i},${j},this)"` : '';
      const grip = col.admin ? `<span class="grip" draggable="true" ondragstart="pjDragStart(event,${i},${j})" title="přetáhnout řádek">⠿</span>` : '';
      const del = p.vlastni
        ? `<button class="mini noprint" onclick="pjPolozkaDel(${i},${j})" title="smazat vlastní řádek">✕</button>` : '';
      /* Poznámka je interní (pravidlo #37) – do nabídky ani do krycího listu
       * nejde, a proto ji nevidí ani běžný uživatel. Vypadá všude stejně,
       * ať už je vyplněná, nebo v ní svítí jen nápověda. */
      /* Vlastní řádek smí upravit i ten, kdo ho směl přidat (19. 8. 2026,
       * právo kalk.pridatPolozku) — viz stejné pravidlo v Kalkulaci OCK. */
      /* Trvalý řádek z ceníku PROJ (p.kid) upravuje jen admin — obchodník by
       * jinak nevědomky měnil položku, která platí pro všechny nové nabídky. */
      const vlEd = !col.admin && p.vlastni && !p.kid && smiZobrazit('kalk.pridatPolozku');
      const nazev = col.admin
        ? `<div class="vol-name">${grip}<input type="text" class="nazev-ed" value="${esc(p.nazev)}" onchange="pjSet(${i}, 'polozky.${j}.nazev', this.value)">${del}</div>`
          + `<input type="text" class="pozn-ed noprint" value="${esc(p.pozn || '')}" placeholder="poznámka (interní)"
               onchange="pjPozn(${i},${j},this.value)" title="proč je tu tahle částka – do nabídky ani do krycího listu nejde">`
        : vlEd
          ? `<input type="text" class="nazev-ed" style="width:70%" value="${esc(p.nazev)}" onchange="pjSet(${i}, 'polozky.${j}.nazev', this.value)">${del}`
          : esc(p.nazev);
      const pocitat = col.admin
        ? `<td class="admincol"><input type="checkbox" class="noprint" ${p.vyrazeno ? '' : 'checked'}
            onchange="pjVyrazeno(${i},${j},!this.checked)"
            title="${p.vyrazeno ? 'položka se nepočítá – zaškrtnutím ji vrátíte do výpočtu' : 'odškrtnutím položku vyřadíte z výpočtu (zůstane v seznamu)'}"></td>`
        : '';
      const tr = `<tr${p.vyrazeno ? ' class="vyrazeno"' : ''}${dz}>`;
      const cena = p.naklad + marzeSekce(s, p.naklad);

      if (p.typ === 'hod') {
        /* Sloupec Sazba: číslo z ceníku + drobný štítek činnosti (zadání
         * „s malým štítkem je super"). Sazby statika, projektanta a zaměřovače
         * zůstávají v Ceníku nákladů PROJ, tady jsou jen informativně —
         * a číslo v poli je dohoda pro TUHLE zakázku, ceník nechá být. */
        const sazbaEd = col.admin
          ? `<span class="pill mut" title="sazba z Ceníku nákladů PROJ – mění se tam, platí pro všechny zakázky">${esc(p.sazba)}</span>
             <input type="number" step="50" class="prepis-ed${p.sazbaPrepsana ? ' aktivni' : ''}" style="width:86px" value="${p.sazbaPrepsana ? p.sazbaKc : ''}"
               placeholder="${num(p.sazbaZCeniku)}" onchange="pjPrepis(${i},${j},'sazbaPrepis',this.value)"
               title="sjednaná sazba jen pro tuto zakázku (prázdné = ${num(p.sazbaZCeniku)} Kč z ceníku)">
             ${p.sazbaPrepsana ? `<button class="mini noprint" onclick="pjPrepis(${i},${j},'sazbaPrepis','')" title="vrátit sazbu z ceníku (${num(p.sazbaZCeniku)} Kč)">↺</button>` : ''}`
          : num(p.sazbaKc);
        return `${tr}<td>${nazev}</td>
          <td>${(col.admin || vlEd) ? `<input type="number" step="1" style="width:66px" value="${p.hodiny}" onchange="pjSet(${i}, 'polozky.${j}.hodiny', +this.value)">` : num(p.hodiny)}</td>
          <td>${col.admin ? `<input type="number" step="1" style="width:66px" value="${p.rezerva}" onchange="pjSet(${i}, 'polozky.${j}.rezerva', +this.value)">` : num(p.rezerva)}</td>
          <td>${num(p.hodinyCelkem)}</td>
          <td style="white-space:nowrap">${sazbaEd}</td>
          ${penize(p.naklad, marzeSekce(s, p.naklad), cena)}${pocitat}</tr>`;
      }

      /* Fixní částka. Do 30. 7. 2026 se tímhle polem přepisoval CENÍK, takže
       * dohodnutá cena u jedné stavby posunula cenu i všem ostatním zakázkám.
       * Teď se zapisuje přepis do zakázky; ceník se mění v záložce Ceník PROJ. */
      const fixEd = col.admin
        ? (p.fixKey
          ? `<input type="number" step="500" class="prepis-ed${p.cenaPrepsana ? ' aktivni' : ''}" style="width:86px" value="${p.cenaPrepsana ? p.cenaEfekt : ''}"
               placeholder="${num(p.cenaZCeniku)}" onchange="pjPrepis(${i},${j},'cenaPrepis',this.value)"
               title="cena jen pro tuto zakázku (prázdné = ${num(p.cenaZCeniku)} Kč z Ceníku nákladů PROJ)">
             ${p.cenaPrepsana ? `<button class="mini noprint" onclick="pjPrepis(${i},${j},'cenaPrepis','')" title="vrátit cenu z ceníku (${num(p.cenaZCeniku)} Kč)">↺</button>` : ''}`
          : `<input type="number" step="500" style="width:86px" value="${p.cena}" onchange="pjSet(${i}, 'polozky.${j}.cena', +this.value)">`)
        : (vlEd && !p.fixKey
          ? `<input type="number" step="500" style="width:86px" value="${p.cena}" title="částka této položky (jen pro tuto zakázku)" onchange="pjSet(${i}, 'polozky.${j}.cena', +this.value)">`
          : num(p.cenaEfekt));
      return `${tr}<td>${nazev}</td>
        <td colspan="3" class="note" style="text-align:right">${p.fixKey
          ? (p.cenaPrepsana ? 'fixní částka – přepsáno pro tuto zakázku' : 'fixní částka (ceník PROJ)')
          : 'fixní částka'}</td>
        <td style="white-space:nowrap">${fixEd}</td>
        ${penize(p.naklad, marzeSekce(s, p.naklad), cena)}${pocitat}</tr>`;
    }).join('');

    /* Doprava je běžný řádek sekce, jen z ní přirážka neplyne (dle předlohy).
     * Příplatek „mimo Prahu" se od 17. 8. 2026 POČÍTÁ ZE VZDÁLENOSTI:
     * km / 60 × 1000 Kč (hodina cesty při 60 km/h à 1 000 Kč). Zaškrtnutí ho
     * přičte k ceně dopravy; vypočtená částka je vidět hned vedle, žádné
     * ruční pole. Starší zakázky s ručním Kč příplatkem (doprava.pausal) ho
     * nesou dál — jejich cena se změnit nesmí — a ukazuje se štítkem. */
    const mimoKc = (+((zdroj.doprava || {}).km) || 0) / 60 * 1000;
    const rucni = +((zdroj.doprava || {}).pausal) || 0;
    const rucniPill = rucni ? ` <span class="pill mut" title="ruční příplatek dopravy ze starší zakázky – přičítá se dál, ať se cena nezmění">+ ${fmt(rucni)}</span>` : '';
    const doprava = !zdroj.doprava ? ''
      : col.admin
        ? `<tr><td><span class="grip" style="visibility:hidden">⠿</span>Doprava (${num(PC.dopravaKmKc)} Kč/km)
             <span class="pill mut" style="margin-left:6px">bez přirážky</span></td>
           <td><input type="number" step="1" style="width:66px" value="${zdroj.doprava.km}" onchange="pjSet(${i}, 'doprava.km', +this.value)" title="km"></td>
           <td class="note">km</td>
           <td style="white-space:nowrap"><label title="příplatek mimo Prahu = km / 60 × 1000 Kč (hodina cesty à 1 000 Kč); po Praze nechte odškrtnuté">
             <input type="checkbox" ${zdroj.doprava.mimoPrahu ? 'checked' : ''} onchange="pjSet(${i}, 'doprava.mimoPrahu', this.checked)"> mimo Prahu</label></td>
           <td class="note" style="white-space:nowrap" title="příplatek mimo Prahu: ${num(zdroj.doprava.km)} km / 60 × 1 000 Kč">${zdroj.doprava.mimoPrahu ? fmt(mimoKc) : '—'}${rucniPill}</td>
           ${penize(s.dopravaKc, null, s.dopravaKc)}<td class="admincol"></td></tr>`
        : (s.dopravaKc
          ? `<tr><td>Doprava${zdroj.doprava.mimoPrahu ? ' (mimo Prahu)' : ''}</td><td>${num(zdroj.doprava.km)}</td><td class="note">km</td><td></td>
             <td class="note">${zdroj.doprava.mimoPrahu ? fmt(mimoKc) : '—'}${rucniPill}</td>${penize(s.dopravaKc, null, s.dopravaKc)}</tr>` : '');

    /* Sjednocený řádek přidávání (19. 8. 2026 večer, stejné pravidlo jako
     * OCK): „+ přidat …" = vlastní řádek jen této zakázky (obchodník,
     * vedoucí i admin — právo kalk.pridatPolozku); „… trvale" = JEN admin,
     * položka se založí v ceníku PROJ dané sekce a platí pro všechny
     * budoucí zakázky. */
    const pridatBtns = [];
    if (col.admin || smiZobrazit('kalk.pridatPolozku'))
      pridatBtns.push(`<button class="mini" title="vlastní řádek jen této zakázky" onclick="pjPolozkaAdd(${i}, 'hod')">+ přidat hodinovou položku</button>`,
        `<button class="mini" title="vlastní řádek jen této zakázky" onclick="pjPolozkaAdd(${i}, 'fix')">+ přidat fixní položku</button>`);
    if (col.admin)
      pridatBtns.push(`<button class="mini" title="zapíše položku natrvalo do ceníku PROJ – bude ve všech nových nabídkách" onclick="pjPolozkaAddTrvale(${i}, 'hod')">+ přidat hodinovou položku trvale</button>`,
        `<button class="mini" title="zapíše položku natrvalo do ceníku PROJ – bude ve všech nových nabídkách" onclick="pjPolozkaAddTrvale(${i}, 'fix')">+ přidat fixní položku trvale</button>`);
    const pridat = pridatBtns.length
      ? `<tr class="pridat noprint"><td colspan="${NC}">${pridatBtns.join(' ')}</td></tr>`
      : '';

    /* Vlastní % sekce nemá vlastní pruh přes celou šířku – ten uživatel
     * vyškrtl. Zůstává jako malé pole vpravo v pruhu s názvem sekce, aby se
     * hodnota dala pořád měnit a hlavně aby nebyla neviditelná: prázdné pole
     * znamená „platí globální přirážka z ceníku" a rovnou ji ukazuje. */
    /* Co se ukáže v prázdném poli (#132): globální přirážka z ceníku PROJ.
     * Je to táž hodnota, se kterou počítá jádro — kdyby se rozešly, pole by
     * slibovalo jedno procento a počítalo se druhé. */
    const prirGlob = num(Math.round((PC.marze || 0) * 10000) / 100);
    const prirPopis = `globální přirážka ${prirGlob} % z ceníku PROJ`;
    /* „vlastní % sekce" se 17. 8. večer posunulo DOLEVA a napravo od něj
     * přibylo zaškrtávátko ZA CELOU SEKCI — sedí na kraji pruhu, tedy ve
     * sloupci Počítat, a je tmavě modré, ať se od položkových liší. */
    const vlastniPct = col.admin
      ? `<span class="note" style="font-weight:400;white-space:nowrap">vlastní % sekce
           <input type="number" step="1" style="width:64px" value="${zdroj.prirazkaPct == null ? '' : zdroj.prirazkaPct}"
             placeholder="${prirGlob}" onchange="pjSet(${i}, 'prirazkaPct', this.value === '' ? null : +this.value)"
             title="vlastní % jen pro tuhle sekci: kladné číslo přirazí, záporné slevu (prázdné = ${prirPopis}). Nula znamená „u téhle sekce nepřirážíme nic“."> %</span>`
      : '';
    const vseZaskrtnuto = s.polozky.length > 0 && s.polozky.every(p => !p.vyrazeno);
    const sekceChk = col.admin
      ? `<input type="checkbox" class="noprint sekce-chk" ${vseZaskrtnuto ? 'checked' : ''}
           onchange="pjSekceVse(${i}, this.checked)"
           style="accent-color:#1e3a8a;transform:scale(1.25);margin-left:18px"
           title="${vseZaskrtnuto ? 'odškrtnutím vyřadíte VŠECHNY položky sekce' : 'zaškrtnutím zapnete VŠECHNY položky sekce'}">`
      : '';

    // id řádku s názvem sekce = cíl kotvy v klouzající liště (kalkLista)
    return `<tr class="sechd" id="proj-sek-${i}"><td colspan="${NC}">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="flex:1">${esc(s.nazev)}</span>${vlastniPct}${vpravoSek}${sekceChk}</div></td></tr>`
      + (sbalenoSek ? '' : radky + doprava + pridat)
      /* Součtový řádek: závorka z názvu se stěhuje AŽ ZA slovo CELKEM
       * (zadání 18. 8.) — „KOLAUDACE CELKEM (pro 1 ks výtahu)". */
      + `<tr class="sectot"><td colspan="${POPIS_SL}">${esc(nazevBezZavorek(s.nazev))} CELKEM${
          (String(s.nazev).match(/\s*(\([^)]*\))\s*$/) || [, ''])[1]
            ? ' ' + esc((String(s.nazev).match(/\s*(\([^)]*\))\s*$/) || [, ''])[1]) : ''}</td>`
      + penize(s.naklad + s.dopravaKc, s.marze, s.celkem)
      + `${col.admin ? '<td class="admincol"></td>' : ''}</tr>`;
  }).join('');

  const kalkulace = `<table>
    ${hlavicka}
    ${sekceHtml}
    <tr class="tot"><td colspan="${POPIS_SL}">CELKEM PROJEKČNÍ PRÁCE</td>
      ${penize(naklad, r.souhrn.marze, r.souhrn.celkem)}${col.admin ? '<td class="admincol"></td>' : ''}</tr>
  </table>
  ${col.admin ? `<div class="note">Řádky přetáhnete úchopem <b>⠿</b> vlevo (v rámci sekce) – stejně jako v Kalkulaci OCK.
    Zaškrtávátko <b>Počítat</b> položku vyřadí z výpočtu, ale nechá ji v seznamu; běžný uživatel vyřazenou položku nevidí.
    Prázdné pole ve sloupci Sazba znamená „drž se ceníku"; co do něj napíšete, je dohoda jen pro tuhle zakázku (nula je platná dohoda – „děláme zdarma") a tlačítkem ↺ se vrátí ceníková hodnota.
    Poznámka pod názvem položky je <b>interní</b> – do nabídky ani do krycího listu se nepřenáší.</div>` : ''}`;

  /* Souhrn: od #141 je procento sekce JEDNO (výchozí globální, přepsatelné),
   * takže sloupec „Sleva/přir." zmizel — býval to druhý zápis téhož a právě
   * z té dvojice vzniklo dvojí započtení přirážky. */
  const souhrnTbl = `<table>
    <tr><th>Sekce</th><th>Náklad</th><th>Přirážka</th><th>Doprava</th><th>Celkem</th></tr>
    ${r.sekce.filter(s => s.celkem !== 0 || s.naklad !== 0).map(s =>
      `<tr><td>${esc(s.nazev)}</td><td>${fmt(s.naklad)}</td><td>${num(s.pouzitePct)} % ⇒ ${fmt(s.marze)}</td>
       <td>${fmt(s.dopravaKc)}</td><td>${fmt(s.celkem)}</td></tr>`).join('')}
    <tr class="tot"><td>CELKEM</td><td>${fmt(r.souhrn.naklad)}</td><td>${fmt(r.souhrn.marze)}</td><td>${fmt(r.souhrn.doprava)}</td>
      <td><b>${fmt0(r.souhrn.celkem)}</b></td></tr>
    ${projZaokr && typeof zaokrKc === 'function' ? `
    <tr><td colspan="4">Obchodní zaokrouhlení${typeof zaokrStav === 'function' && zaokrStav(r.souhrn.celkem, ZOP).popis ? ' (' + esc(zaokrStav(r.souhrn.celkem, ZOP).popis) + ')' : ''}</td>
      <td>${esc(zaokrKc(projZaokr))}</td></tr>
    <tr class="tot"><td colspan="4">CENA NABÍDKY PROJ</td><td><b>${fmt0(projCena)}</b></td></tr>` : ''}
  </table>`;

  document.getElementById('page-proj').innerHTML =
    zakazkaHlavicka(false) +
    `<div class="card"><div class="body">${hlava}
       <div class="row noprint" style="margin-top:6px"><label>Zakázka je jen projekce (bez OCK)
         <span class="note">(vypne hlídání a porovnávání části OCK)</span></label>
         <input type="checkbox" ${ZAK.jenProj ? 'checked' : ''} onchange="set('ZAK.jenProj', this.checked)"><span class="u"></span></div>
       ${marzeLista({ cast: 'proj' })}</div></div>` +
    card('Cenová kalkulace PROJ', kalkulace, false, 'proj-kalkulace') +
    /* Sleva a obchodní zaokrouhlení stojí hned pod výpočtem, přesně jako
     * v Kalkulaci OCK (zadání 1. 8. 2026). Ty dvě karty se ale od 4. 8. 2026
     * chovají různě:
     *   • SLEVA zůstává jedna schvalovací politika nad celou zakázkou –
     *     karta se vykresluje podruhé jen s vlastní kotvou, stav je týž (SL).
     *     Druhá sada polí by znamenala dvě politiky nad jednou zakázkou.
     *   • ZAOKROUHLENÍ je naopak rozdělené: tady se nastavuje výhradně cena
     *     projekčních prací (stav ZOP), cena výtahové šachty se nastavuje
     *     v Kalkulaci OCK (stav ZO). Zadání ze 4. 8. 2026: „do kalkulace ock
     *     patří pouze část týkající se výtahové šachty, část týkající se
     *     projekčních prací pak patří do sekce kalkulace proj." */
    /* Sleva stojí od 17. 8. 2026 až POD souhrnem (zadání J. V.) — obchodník
     * napřed vidí, z čeho cena vzešla, a teprve pak z ní slevuje. */
    (typeof zaokrKarta === 'function' ? zaokrKarta('proj') : '') +
    card('Souhrn projekčních prací', souhrnTbl, false, 'proj-souhrn') +
    (typeof slevaKarta === 'function' ? slevaKarta('proj') : '') +
    (typeof nabidkaProjKarta === 'function' ? card('Cenová nabídka PROJ', nabidkaProjKarta(), false, 'proj-nabidka') : '') +
    `<div class="note">Globální přirážku PROJ zadáte přímo v hlavičce nahoře (stejně jako v Kalkulaci OCK); platí pro všechny sekce a je proto započtená i u sekcí, které se u téhle stavby nepoužijí. Slevu a obchodní zaokrouhlení najdete v sekcích pod výpočtem. Sazby (projektant/statik/zaměření), fixní ceny subdodávek a sazbu dopravy nastavíte v záložce <b>Ceník nákladů PROJ</b> — ty platí pro všechny zakázky.
     Doprava se počítá bez přirážky; sleva/přirážka sekce se počítá z ceny včetně dopravy (dle předlohy).</div>`;
}
