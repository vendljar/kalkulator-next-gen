/* ============================================================
 * SMLOUVY O DÍLO A PLNÁ MOC – UI (#143, 15. 8. 2026)
 *
 * Jedna společná obsluha pro tři dokumenty: SoD realizace (typ `sod`,
 * karta v Kalkulaci OCK), SoD projekčních prací (`sodProj`) a plná moc
 * (`plnaMoc`, obojí v Kalkulaci PROJ). Cesta k souboru je stejná jako
 * u nabídek: napřed platná centrální šablona ze serveru (#139), místní
 * soubor jen v měkkém režimu nebo bez přihlášení; generuje jednotný
 * registr dokumentů (dokumenty.js), zamyká zamekPoTisku — plnou moc
 * zámek sám přeskočí (ZAMEK_DOKUMENTY: plnaMoc nezamyká).
 *
 * Ceny ve smlouvě jsou VŽDY ceny nabídky — buildery v sod.js jsou obálky
 * nad nabidkaData/nabidkaProjData, žádný druhý výpočet neexistuje.
 * Symboly, které aplikace nezná (SOD_*, SODP_*, PM_*, OBJEDNATEL_*),
 * zůstávají v dokumentu viditelné jako {{…}} a doplní se ve Wordu.
 * ============================================================ */

/* místní šablony pro relaci – jen nouzová cesta (měkký režim / bez serveru) */
const SOD_DOCX = {};   // { typ: {nazev, data:ArrayBuffer} }

/* Stavový řádek každého typu zvlášť (třídou, ne id – karta OCK je v aplikaci
 * dvakrát: Kalkulace OCK i Přehled cenových nabídek, stejně jako u nabídky). */
function sodStavText(typ, txt) {
  document.querySelectorAll('.sodStav_' + typ).forEach(e => { e.textContent = txt; });
}

/* Plná moc je jednojazyčný úřední dokument pro ČESKÉ úřady – volba jazyka
 * tisku se na ni nevztahuje; smlouvy jazyk tisku respektují (mutace šablony). */
function sodJazyk(typ) {
  if (typ === 'plnaMoc') return 'cz';
  return (typeof tiskJazyk === 'function') ? tiskJazyk()
    : ((typeof jazyk === 'function') ? jazyk() : 'cz');
}

function sodWord(typ) {
  const L = sodJazyk(typ);
  sablonaProTisk(typ, L).then(srv => {
    if (srv) { sodWordGeneruj(typ, srv); return; }
    // místní cesta – přednost má šablona nahraná v Nastavení → Šablony (SET-6)
    if (typeof SABLONY !== 'undefined' && SABLONY[typ]) SOD_DOCX[typ] = SABLONY[typ];
    if (SOD_DOCX[typ]) { sodWordGeneruj(typ, null); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.docx';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.arrayBuffer().then(buf => {
        SOD_DOCX[typ] = { nazev: f.name, data: buf };
        if (typeof SABLONY !== 'undefined') SABLONY[typ] = SOD_DOCX[typ];   // zapamatuj pro další generování
        sodWordGeneruj(typ, null);
      });
    };
    inp.click();
  }).catch(err => sodStavText(typ, 'Chyba: ' + err.message));
}

function sodWordGeneruj(typ, srv) {
  const L = sodJazyk(typ);
  const mutace = (!srv && L !== 'cz' && typeof SABLONY !== 'undefined') ? SABLONY[typ + '_' + L] : null;
  const sablona = srv ? srv.data : (mutace ? mutace.data : SOD_DOCX[typ].data);
  const mutaceChybi = srv ? srv.mutaceChybi : (L !== 'cz' && !mutace);
  /* Razítko šablony do zámku varianty (#139) – u smlouvy je doložitelnost
   * ještě důležitější než u nabídky: podepisuje se. */
  const sablonaInfo = srv
    ? { zdroj: 'server', typ: srv.typ, verze: srv.verze, otisk: srv.otisk, nazev: srv.nazev }
    : { zdroj: 'mistni', nazev: (mutace || SOD_DOCX[typ]).nazev || '' };
  const popis = (typeof dokumentPopis === 'function' && dokumentPopis(typ)) || typ;
  sodStavText(typ, 'Vyplňuji šablonu…' + (L !== 'cz' ? ' (' + L.toUpperCase() + ')' : '')
    + (srv ? ' [serverová verze ' + srv.verze + ']' : ''));
  /* Stejná otázka „otevřená, nebo řídící varianta?" jako u nabídek – smlouva
   * se nikdy nesmí vytisknout z jiné varianty, než jakou má obchodník před
   * sebou (a jakou nese odeslaná nabídka). */
  const varianta = (typeof nabidkaVarianta === 'function')
    ? nabidkaVarianta()
    : ((typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : (ZAK.varianty || [])[0]);
  dokumentVygeneruj(typ, sablona.slice(0), ZAK, varianta, JEKLY, L)
    .then(res => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.blob);
      a.download = res.nazevSouboru + '.docx';
      a.click();
      let zamcenoText = '';
      if (typeof zamekPoTisku === 'function') {
        const z = zamekPoTisku(typ, varianta.id, sablonaInfo);   // plnou moc přeskočí sám
        if (z) zamcenoText = ' Varianta ' + (z.cislo || '') + ' je nyní uzamčená; pokračujte jejím klonem.';
      }
      sodStavText(typ, 'Hotovo – soubor ' + res.nazevSouboru + '.docx je ve Stažených. '
        + 'Žlutě značené symboly {{…}} (termíny, splátky, zástupci objednatele) doplňte ve Wordu.'
        + (srv ? ' Použita centrální šablona (verze ' + srv.verze + ').'
               : (sablonyOnlineAktivni() ? ' POZOR: použita MÍSTNÍ šablona (měkký režim) – do zámku se to zapsalo.' : ''))
        + (mutaceChybi ? ' Pozor: pevný text šablony zůstal český – jazykovou mutaci šablony '
          + 'zveřejní administrátor v Nastavení → Šablony.' : '')
        + zamcenoText);
    })
    .catch(err => {
      /* Zahodit schválně – nejčastější příčina je vybraný špatný soubor;
       * kdyby zůstal v paměti, nešlo by vybrat jiný. */
      delete SOD_DOCX[typ];
      sodStavText(typ, 'Chyba: ' + err.message);
    });
}

/* ---------- karta v Kalkulaci OCK: smlouva o dílo — realizace ---------- */
function sodKarta() {
  const zab = (typeof ukazkoveZabranaAttr === 'function') ? ukazkoveZabranaAttr() : '';
  return `<div class="note" style="font-weight:600;margin-top:14px">Smlouva o dílo — realizace (Word):</div>
    <div class="note">Smlouva se plní <b>stejnými daty jako cenová nabídka</b> (hlavička zakázky, cena bez DPH,
      platební podmínky z krycího listu, firemní údaje) – cenu si nikdy nepočítá sama, takže se s nabídkou
      nemůže rozejít. Co aplikace nezná – <b>termíny, splátkový kalendář, zástupci objednatele, číslo
      smlouvy</b> – zůstane v dokumentu viditelně jako <code>{{SOD_…}}</code> a doplní se ve Wordu.
      Vytištěná smlouva variantu <b>uzamkne</b> stejně jako odeslaná nabídka.</div>
    <div class="btns" style="margin-top:6px">
      <button class="primary"${zab} onclick="sodWord('sod')">Vytvořit smlouvu o dílo (Word)</button>
    </div>
    <div class="note sodStav_sod" style="margin-top:4px"></div>`;
}

/* ---------- karta v Kalkulaci PROJ: SoD projekce + plná moc ---------- */
function sodProjKarta() {
  const zab = (typeof ukazkoveZabranaAttr === 'function') ? ukazkoveZabranaAttr() : '';
  return `<div class="note" style="font-weight:600;margin-top:14px">Smlouva o dílo a plná moc (Word):</div>
    <div class="note">Smlouva o dílo na projekční práce nese <b>cenu z nabídky PROJ</b> (číslo nabídky, celkem
      bez DPH, podmínky z krycího listu PROJ). Symboly <code>{{SODP_…}}</code> (platby po fázích, termíny
      odevzdání) se doplňují ve Wordu; vytištěná smlouva variantu <b>uzamkne</b>.
      <b>Plná moc</b> je administrativa k objektu – nese firemní údaje zmocněnce a adresu stavby (z hlavičky
      PROJ, případně OCK); údaje zmocnitele <code>{{PM_…}}</code> se doplní ručně a varianta se <b>nezamyká</b>.</div>
    <div class="btns" style="margin-top:6px">
      <button class="primary"${zab} onclick="sodWord('sodProj')">Vytvořit smlouvu o dílo PROJ (Word)</button>
      <button class="primary"${zab} onclick="sodWord('plnaMoc')">Vytvořit plnou moc (Word)</button>
    </div>
    <div class="note sodStav_sodProj" style="margin-top:4px"></div>
    <div class="note sodStav_plnaMoc"></div>`;
}
