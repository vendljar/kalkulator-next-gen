/* ============================================================
 * UI cenové nabídky PROJ (OVP-CN) – karta v Kalkulaci PROJ
 * a kompletní tiskový náhled celé nabídky podle VZORu.
 * Data staví nabidka_proj.js; tady se jen vykreslují.
 * Tisk jde ve zvoleném jazyce dokumentů (cz/en/de/fr) – nadpisy
 * a krátké popisky ze slovníku, souvislá próza zůstává česky.
 * ============================================================ */

/* Popis záměru – jediné pole, které nabídka PROJ potřebuje navíc.
 * Ukládá se do zakázky (ZAK.popisZameru), takže přežije uložení i export. */
function nabidkaProjPopis(val) { ZAK.popisZameru = val; }

/* Karta pod souhrnem Kalkulace PROJ. */
function nabidkaProjKarta() {
  const akt = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : (ZAK.varianty || [])[0];
  const rid = (typeof ridiciVarianta === 'function') ? ridiciVarianta(ZAK) : akt;
  let d = null, chyba = '';
  try { d = nabidkaProjData(ZAK, akt); } catch (e) { chyba = e.message; }
  if (!d) return `<div class="neg">Chyba výpočtu nabídky PROJ: ${esc(chyba)}</div>`;

  const p = d.placeholders;
  const pole = (nazev, hodnota, povinne) => {
    const prazdne = !hodnota || hodnota === '…';
    return `<tr><td style="font-weight:600">${esc(nazev)}</td>
      <td class="${prazdne && povinne ? 'neg' : ''}" style="text-align:left">${prazdne
        ? (povinne ? 'NEVYPLNĚNO – doplňte v kartě Zakázka výše' : '—') : esc(hodnota)}</td></tr>`;
  };
  const neuvedene = d.bloky.filter(b => b.typ === 'cena' && b.neuvedena).length;
  const nahled = `<table style="max-width:640px">
      ${pole('Objednatel', p.OBJEDNATEL, true)}
      ${pole('Kontaktní osoba', p.OBJEDNATEL_KONTAKT, false)}
      ${pole('Datum', p.DATUM, false)}
      ${pole('Název akce', p.NAZEV_AKCE, true)}
      ${pole('Číslo nabídky', p.CISLO_NABIDKY, true)}
      ${pole('Adresa stavby', p.ADRESA, true)}
      ${pole('Oceněných činností', d.rekapitulace.length + ' z ' + NABIDKA_PROJ_SEKCE.length
        + (neuvedene ? ' (' + neuvedene + '× „není součástí této nabídky")' : ''), false)}
      ${pole('Cena bez DPH', p.PROJ_CELKEM_BEZ_DPH, false)}
      ${pole('DPH ' + p.PROJ_DPH_SAZBA + ' %', p.PROJ_DPH_KC, false)}
      ${pole('Celkem s DPH', p.PROJ_CELKEM_S_DPH, false)}
    </table>`;

  const rekap = d.rekapitulace.length
    ? `<table style="max-width:640px;margin-top:8px">
       ${d.rekapitulace.map(r => `<tr><td>${esc(r[0])}</td><td style="text-align:right">${esc(r[1])}</td></tr>`).join('')}
       <tr class="tot"><td><b>CELKEM bez DPH</b></td><td style="text-align:right"><b>${esc(p.PROJ_CELKEM_BEZ_DPH)}</b></td></tr>
       </table>`
    : `<div class="note">Zatím není oceněná žádná činnost – doplňte hodiny a fixní náklady v sekcích Kalkulace PROJ výše.
       Neoceněné činnosti se v nabídce vypíšou jako „není součástí této nabídky“, nikdy s vymyšlenou cenou.</div>`;

  return `<div class="note">Nabídka se sestavuje z <b>otevřené varianty</b> („${esc(akt.nazev)}")${akt.id !== rid.id
      ? ` – pozor, řídící je „${esc(rid.nazev)}"` : ''} podle VZORu <b>ENGINEERS CZ (OVP-CN)</b>.
    Rozsahy činností, platební podmínky a termíny jsou pevné znění VZORu; <b>ceny se berou z Kalkulace PROJ</b>,
    takže se nabídka nikdy nerozejde s kalkulací. Paušály (varianta pro památkáře, autorský dozor) jsou vedeny
    zvlášť – v kalkulaci nejsou.</div>
    <div class="note" style="font-weight:600;margin-top:8px">Hlavička nabídky (živý náhled):</div>
    ${nahled}
    <div class="note" style="font-weight:600;margin-top:8px">Rekapitulace cen:</div>
    ${rekap}
    ${typeof kryciProjPodminkyBlok === 'function' ? kryciProjPodminkyBlok() : ''}
    <div class="note" style="font-weight:600;margin-top:10px">Popis záměru (úvodní odstavec nabídky):</div>
    <textarea rows="4" style="width:100%" placeholder="Např.: Bytový dům, přístavba výtahu do zrcadla schodiště…"
      oninput="nabidkaProjPopis(this.value)">${esc(ZAK.popisZameru || '')}</textarea>
    ${typeof nabidkaFotoKarta === 'function' ? nabidkaFotoKarta('proj') : ''}
    ${typeof kontrolyPanel === 'function' ? kontrolyPanel() : ''}
    ${typeof ukazkoveZabranaPanel === 'function' ? ukazkoveZabranaPanel() : ''}
    <div class="btns" style="margin-top:8px">
      <button class="primary"${typeof ukazkoveZabranaAttr === 'function' ? ukazkoveZabranaAttr() : ''}
        onclick="nabidkaProjWord()">Vytvořit nabídku PROJ (Word)</button>
      <button${typeof ukazkoveZabranaAttr === 'function' ? ukazkoveZabranaAttr() : ''}
        onclick="nabidkaProjNahled()">Kompletní náhled a tisk nabídky</button>
    </div>
    <div class="note nabidkaProjStav" style="margin-top:6px"></div>
    <div class="note">Word se plní <b>šablonou <code>Sablona_NABIDKA_PROJ.docx</code></b> – stejnou cestou jako nabídka OCK.
      Po přihlášení se bere <b>platná centrální šablona ze serveru</b> (#139) – verzi vidíte v Nastavení → Šablony;
      místní soubor je jen nouzová cesta pro práci bez serveru. Ceny, hlavička, platební podmínky i úvodní fotka
      se dosadí ze symbolů <code>{{…}}</code>; pevný text zůstává tak, jak je v šabloně napsaný.</div>
    <div class="note" style="margin-top:6px">V náhledu lze zaškrtnout <b>✏️ Upravit text před tiskem</b> a nabídku ručně doladit
      (dopsat větu, přeformulovat, škrtnout odstavec) ještě před uložením do PDF. Tlačítko <b>↺ Vrátit původní znění</b>
      vrátí text vygenerovaný z kalkulace. Ruční úpravy platí <b>jen pro daný výtisk</b> – do zakázky ani do kalkulace
      se nepropisují, takže se čísla v aplikaci nemohou nepozorovaně rozejít.</div>`;
}

/* ============================================================================
 * NABÍDKA PROJ DO WORDU (12. 8. 2026)
 *
 * Přesně tatáž cesta jako u nabídky OCK (zakazka_ui.js): šablona .docx se
 * symboly {{…}} → dokumentVygeneruj('nabidkaProj', …) → stažený soubor →
 * zámek varianty. Liší se jen šablona (Sablona_NABIDKA_PROJ.docx) a to, že
 * nabídka PROJ nepracuje s příplatky ani s katalogem jeklů.
 *
 * Stav se hlásí přes TŘÍDU, ne přes id: karta nabídky PROJ se v aplikaci
 * vykresluje dvakrát (Kalkulace PROJ a Přehled cenových nabídek) a hlášky
 * o průběhu by jinak doputovaly jen do první kopie.
 * ============================================================================ */
let SABLONA_PROJ_DOCX = null;   // {nazev, data:ArrayBuffer} – drží se po dobu otevřené aplikace

function nabidkaProjStavText(txt) {
  document.querySelectorAll('.nabidkaProjStav').forEach(e => { e.textContent = txt; });
}

function nabidkaProjWord() {
  /* Stejná cesta jako u nabídky OCK (#139): napřed serverová šablona,
   * místní soubor jen v měkkém režimu nebo bez serveru. */
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  sablonaProTisk('nabidkaProj', L).then(srv => {
    if (srv) { nabidkaProjWordGeneruj(srv); return; }
    // místní cesta – přednost má šablona nahraná v Nastavení → Šablony (SET-6)
    if (typeof SABLONY !== 'undefined' && SABLONY.nabidkaProj) SABLONA_PROJ_DOCX = SABLONY.nabidkaProj;
    if (SABLONA_PROJ_DOCX) { nabidkaProjWordGeneruj(null); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.docx';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.arrayBuffer().then(buf => {
        SABLONA_PROJ_DOCX = { nazev: f.name, data: buf };
        if (typeof SABLONY !== 'undefined') SABLONY.nabidkaProj = SABLONA_PROJ_DOCX;   // zapamatuj pro další generování
        nabidkaProjWordGeneruj(null);
      });
    };
    inp.click();
  }).catch(err => nabidkaProjStavText('Chyba: ' + err.message));
}

function nabidkaProjWordGeneruj(srv) {
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  const mutace = (!srv && L !== 'cz' && typeof SABLONY !== 'undefined') ? SABLONY['nabidkaProj_' + L] : null;
  const sablona = srv ? srv.data : (mutace ? mutace.data : SABLONA_PROJ_DOCX.data);
  const mutaceChybi = srv ? srv.mutaceChybi : (L !== 'cz' && !mutace);
  const sablonaInfo = srv
    ? { zdroj: 'server', typ: srv.typ, verze: srv.verze, otisk: srv.otisk, nazev: srv.nazev }
    : { zdroj: 'mistni', nazev: (mutace || SABLONA_PROJ_DOCX).nazev || '' };
  nabidkaProjStavText('Vyplňuji šablonu…' + (L !== 'cz' ? ' (' + L.toUpperCase() + ')' : '')
    + (srv ? ' [serverová verze ' + srv.verze + ']' : ''));
  /* Varianta se určuje jednou dopředu – potřebujeme ji i pro zámek (#34).
   * Otázka „otevřená, nebo řídící varianta?" je stejná jako u OCK, proto se
   * používá tatáž funkce; nabídka se tak nikdy nevytiskne z něčeho jiného,
   * než co má obchodník na obrazovce. */
  const varianta = (typeof nabidkaVarianta === 'function')
    ? nabidkaVarianta()
    : ((typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : (ZAK.varianty || [])[0]);
  dokumentVygeneruj('nabidkaProj', sablona.slice(0), ZAK, varianta, JEKLY, L)
    .then(res => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.blob);
      a.download = res.nazevSouboru + '.docx';
      a.click();
      // stažený .docx je hotová nabídka pro zákazníka → varianta se uzamyká
      let zamcenoText = '';
      if (typeof zamekPoTisku === 'function') {
        const z = zamekPoTisku('nabidkaProj', varianta.id, sablonaInfo);
        if (z) zamcenoText = ' Varianta ' + (z.cislo || '') + ' je nyní uzamčená jako odeslaná nabídka; '
          + 'pokračujte jejím klonem.';
      }
      nabidkaProjStavText('Hotovo – soubor ' + res.nazevSouboru + '.docx je ve Stažených. '
        + 'Uložte jej do složky _CN, doupravte ve Wordu a vytiskněte do PDF.'
        + (srv ? ' Použita centrální šablona (verze ' + srv.verze + ').'
               : (sablonyOnlineAktivni() ? ' POZOR: použita MÍSTNÍ šablona (měkký režim) – do zámku se to zapsalo.' : ''))
        + (mutaceChybi ? ' Pozor: pevný text šablony zůstal český – jazykovou mutaci šablony '
          + 'vyrobíte v Nastavení → Šablony.' : '')
        + zamcenoText);
    })
    .catch(err => {
      /* Šablona se zahazuje schválně: nejčastější příčina je vybraný špatný
       * soubor (třeba šablona OCK). Kdyby zůstala v paměti, další kliknutí by
       * spadlo úplně stejně a nešlo by vybrat jinou. */
      SABLONA_PROJ_DOCX = null;
      nabidkaProjStavText('Chyba: ' + err.message);
    });
}

/* Kompletní tiskový náhled celé nabídky – všechny oddíly VZORu v pořadí. */
function nabidkaProjNahled() {
  /* Pojistka pro případ, že by se sem někdo dostal jinudy než tlačítkem
   * (zhasnutým) – tiskový náhled je dokument pro zákazníka jako každý jiný. */
  if (typeof dokumentZabrana === 'function') {
    const duvod = dokumentZabrana();
    if (duvod) { alert(duvod); return; }
  }
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  const P = t => (L !== 'cz' && typeof tr === 'function') ? tr(t, L) : t;
  const akt = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : (ZAK.varianty || [])[0];
  const d = nabidkaProjData(ZAK, akt, L);
  const p = d.placeholders;

  const html = d.bloky.map(b => {
    if (b.typ === 'nadpis') return `<h1 class="sekce">${esc(b.text)}</h1>`;
    if (b.typ === 'pozn')
      return `<div class="pozn">${b.radky.map(x => `<p>${esc(x)}</p>`).join('')}</div>`;
    if (b.typ === 'proza')
      return `<h2>${esc(b.nadpis)}</h2>${b.odstavce.map(x =>
        `<p${b.prazdny ? ' class="chybi"' : ''}>${esc(x)}</p>`).join('')}`;
    if (b.typ === 'seznam')
      return `<h2>${esc(b.nadpis)}</h2><ul>${b.radky.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (b.typ === 'rozsah')
      return `<h2>${esc(b.nadpis)}</h2>`
        + (b.uvod || []).map(x => `<p>${esc(x)}</p>`).join('')
        + `<table>${b.radky.map(r => r[1]
            ? `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`
            : `<tr class="podnadpis"><td colspan="2">${esc(r[0])}</td></tr>`).join('')}</table>`;
    if (b.typ === 'pary')
      return `<h2>${esc(b.nadpis)}</h2><table>${b.radky.map(r =>
        `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
    /* cena */
    return `<table class="cena"><tr><td><b>${esc(b.nadpis)}</b><br>
        <span class="popis">${esc(b.popis || '')}</span></td>
      <td class="castka${b.neuvedena ? ' chybi' : ''}">${esc(b.castka)}${b.neuvedena ? '' : '<br><span class="popis">'
        + esc(P('bez DPH')) + '</span>'}</td></tr>
      ${b.hvezdicka ? `<tr><td colspan="2" class="popis">*) ${esc(b.hvezdicka)}</td></tr>` : ''}</table>`;
  }).join('');

  const rekapHtml = d.rekapitulace.length ? `<h1 class="sekce">${esc(P('REKAPITULACE CENOVÉ NABÍDKY'))}</h1>
    <table class="rekap">${d.rekapitulace.map(r =>
      `<tr><td>${esc(r[0])}</td><td class="castka">${esc(r[1])}</td></tr>`).join('')}
      ${/* Sleva projekce vlastním řádkem (#134). Rozpad musí sedět sám v sobě:
           součet činností − sleva + zaokrouhlení = celkem bez DPH. Bez toho
           by zákazník viděl součet, který mu nevychází. */ ''}
      ${p.PROJ_SLEVA_KC ? `<tr><td>${esc(P('Cena před slevou'))}</td><td class="castka">${esc(p.PROJ_CENA_PRED_SLEVOU)}</td></tr>
      <tr><td>${esc(P('Sleva'))} ${esc(p.PROJ_SLEVA_PROC)} %</td><td class="castka">− ${esc(p.PROJ_SLEVA_KC)}</td></tr>` : ''}
      <tr class="tot"><td><b>${esc(P('CELKEM bez DPH'))}</b></td><td class="castka"><b>${esc(p.PROJ_CELKEM_BEZ_DPH)}</b></td></tr>
      <tr><td>${esc(P('DPH'))} ${esc(p.PROJ_DPH_SAZBA)} %</td><td class="castka">${esc(p.PROJ_DPH_KC)}</td></tr>
      <tr class="tot"><td><b>${esc(P('CELKEM s DPH'))}</b></td><td class="castka"><b>${esc(p.PROJ_CELKEM_S_DPH)}</b></td></tr>
    </table>` : '';

  // logo a patička jsou společné pro nabídku OCK i PROJ (common.js) – vždy uvedeny
  const logoHtml = dokLogoHtml();
  const patickaHtml = dokPatickaHtml(P);

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="${L === 'cz' ? 'cs' : L}"><head><meta charset="utf-8">
    <title>${esc(d.nazevSouboru)}</title>
    <style>body{font:13px/1.55 "Segoe UI",sans-serif;color:#1a2332;max-width:860px;margin:24px auto;padding:0 16px}
    h1{font-size:20px;margin:6px 0} h1.sekce{font-size:15px;background:#1d4ed8;color:#fff;padding:7px 10px;margin:26px 0 10px;
      text-transform:uppercase;letter-spacing:.04em;page-break-after:avoid}
    h2{font-size:13px;background:#eef2f8;padding:6px 10px;margin:20px 0 6px;text-transform:uppercase;
      letter-spacing:.03em;page-break-after:avoid}
    p{margin:6px 0;text-align:justify} ul{margin:6px 0 6px 18px;padding:0} li{margin:3px 0}
    table{width:100%;border-collapse:collapse;margin:6px 0;page-break-inside:avoid}
    td{border-bottom:1px solid #eef1f6;padding:4px 8px;vertical-align:top}
    td:first-child{width:46%} tr.podnadpis td{background:#f6f8fc;font-weight:700;width:auto}
    table.cena{border:1px solid #dfe4ec;background:#fafbfe;margin:10px 0 18px}
    table.cena td{border-bottom:0} .castka{text-align:right;font-size:15px;font-weight:700;white-space:nowrap}
    .popis{font-weight:400;font-size:11px;color:#6b7686}
    table.rekap td{border-bottom:1px solid #dfe4ec} table.rekap tr.tot td{background:#f2f6ff}
    .chybi{color:#b91c1c}
    .pozn{font-size:11px;color:#6b7686;margin:6px 0 14px} .pozn p{margin:3px 0}
    figure.uvod-foto{margin:14px 0 18px;text-align:center;page-break-inside:avoid}
    figure.uvod-foto img{max-width:100%;max-height:320px;border-radius:6px}
    figure.uvod-foto figcaption{font-size:11px;color:#6b7686;margin-top:5px}
    ${dokHlavickaCss()}
    .hlav td{border-bottom:0;padding:2px 8px}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px;z-index:5}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    ${tiskListaCss()}
    @page{size:A4;margin:14mm} @media print{.noprint{display:none} body{margin:0}}</style></head><body>
    ${tiskListaHtml({
      tisk: P('Tisk / Uložit jako PDF'),
      upravy: P('Upravit text před tiskem'),
      vratit: P('Vrátit původní znění'),
      pozn: P('Nabídku lze před uložením do PDF ručně upravit; do kalkulace se změny nepropíšou.'),
      zamekTyp: 'nabidkaProjTisk',
    })}
    <div id="dok">
    ${logoHtml}
    <h1>${esc(P('CENOVÁ NABÍDKA'))} ${esc(p.CISLO_NABIDKY)}</h1>
    <table class="hlav">
      <tr><td>${esc(P('Objednatel'))}</td><td><b>${esc(p.OBJEDNATEL)}</b></td></tr>
      <tr><td>${esc(P('Kontaktní osoba'))}</td><td>${esc(p.OBJEDNATEL_KONTAKT)}</td></tr>
      <tr><td>${esc(P('Název akce'))}</td><td>${esc(p.NAZEV_AKCE)}</td></tr>
      <tr><td>${esc(P('Adresa stavby'))}</td><td>${esc(p.ADRESA)}</td></tr>
      <tr><td>${esc(P('Datum'))}</td><td>${esc(p.DATUM)}</td></tr>
    </table>
    ${typeof nabidkaFotoHtml === 'function' ? nabidkaFotoHtml('proj') : ''}
    ${html}
    ${rekapHtml}
    ${patickaHtml}
    </div>
    ${tiskListaSkript({
      zap: P('Úpravy zapnuté – klikněte do dokumentu a pište. Změny platí jen pro tento výtisk.'),
      vyp: P('Úpravy vypnuté. Ruční změny zůstávají, jen se do dokumentu už nedá psát.'),
      vraceno: P('Vráceno původní znění z kalkulace.'),
      zamceno: P('Varianta byla uzamčena jako odeslaná nabídka. Další úpravy provádějte v jejím klonu.'),
    }, { typ: 'nabidkaProjTisk', varId: akt && akt.id })}
    </body></html>`);
  w.document.close();
}
