/* ============================================================
 * KONTROLA LOGICKÝCH CHYB – panel před nabídkou (#33, UI)
 *
 * Logika je v kontroly.js; tady je jen to, kde se nálezy ukážou a jak se
 * odklepnou.
 *
 * PROČ PANEL A NE confirm(): zadání z 30. 7. 2026 zní „pouze rozsviť
 * varování před nabídkou". Modální okno by se navíc otevřelo úplně vždycky –
 * sestavení nese ukázkový ceník, takže pravidlo „ukazkovyCenik" svítí od
 * první vteřiny po instalaci. Dialog, který vyskočí pokaždé, se odklikává
 * poslepu; do týdne by ho nikdo nečetl. Panel v kartě nabídky je vidět
 * stejně dobře, ale nestojí v cestě.
 *
 * Dvě místa, jako u marže (#36) a ukázkových dat (#40):
 *   – karta cenové nabídky (OCK i PROJ) … než se dokument vygeneruje,
 *   – náhled tisku … poslední okamžik, kdy je ještě co zastavit.
 *
 * Kdo vidí čísla: stejné pravidlo jako u marže – částky o nákladech patří
 * administrátorovi (nebo tomu, komu se KPI „Marže" zviditelnila). Věty
 * o tom, ŽE je něco špatně, vidí každý; nabídku posílá právě on.
 *
 * Odklepnutí se ukládá k variantě (v.kontroly), aby ho protokol o kalkulaci
 * (#41) uměl vypsat – kdo to viděl a co konkrétně odklepl. Platí ale jen na
 * to, co se odklepávalo: přibude-li nový nález, panel se rozsvítí znovu.
 * Tiché umlčení nového problému starým odklepnutím by byla ztráta pojistky,
 * které by si nikdo nevšiml.
 * ============================================================ */

/* Kontext pro kontroly ze stavu běžící aplikace. Ceníky se berou z globálů
 * C a PC, což jsou (viz syncVarianta) ceníky OTEVŘENÉ VARIANTY – tedy to,
 * z čeho se právě počítá, ne výchozí vzorek ve zdrojácích. */
function kontrolyCtxAkt() {
  let ock = null, proj = null;
  /* Spadlý výpočet není důvod kontroly vypnout – naopak, část pravidel
   * (rozměry, nástupiště) je právě na takový stav. */
  try { ock = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  try { proj = vypocetProj(PJ, PC); } catch (e) {}
  return {
    zadani: Z,
    vysledek: ock,
    jenProj: (typeof ZAK !== 'undefined') && !!ZAK.jenProj,
    projZadani: PJ,
    projVysledek: proj,
    cenik: C,
    cenikProj: PC,
    sleva: (typeof SL !== 'undefined') ? SL : null,
    /* Sleva projekce je vlastní veličina (#134) – kontroly ji musí
     * dostat zvlášť, jinak by pravidlo hlídalo cizí číslo. */
    slevaProj: (typeof SLP !== 'undefined') ? SLP : null,
    nast: (typeof NAST !== 'undefined') ? NAST : null,
    /* Hlavička zakázky sedí přímo na ZAK (cislo, nazevAkce, objednatel…),
     * ne ve vnořeném objektu – viz novaZakazka() v zakazka.js. */
    zak: (typeof ZAK !== 'undefined') ? ZAK : null,
    zaokr: (typeof ZO !== 'undefined') ? ZO : null,
    /* Od 4. 8. 2026 má PROJ vlastní obchodní zaokrouhlení (#38); kontroly
     * marže musí počítat s tím, které opravdu odejde v nabídce PROJ. */
    zaokrProj: (typeof ZOP !== 'undefined' && ZOP) ? ZOP
                 : (typeof ZO !== 'undefined' ? ZO : null),
  };
}

function kontrolyStavAkt() {
  if (typeof kontrolyProved !== 'function') return { varovat: false, nalezy: [], kody: [] };
  return kontrolyProved(kontrolyCtxAkt());
}

/* Právo na částky – jedno pravidlo pro celou aplikaci, půjčené od marže. */
function kontrolySmiCisla() {
  if (typeof marzeSmiCisla === 'function') return marzeSmiCisla();
  if (typeof smiZobrazit === 'function' && smiZobrazit('kontroly.cisla')) return true;
  return !!(typeof NAST !== 'undefined' && NAST.kpiViditelne && NAST.kpiViditelne.marze);
}

function kontrolyKdo() {
  return (typeof NAST !== 'undefined' && NAST.uzivatel) ? String(NAST.uzivatel) : '';
}

/* Odklepnutí uložené u otevřené varianty, nebo null. */
function kontrolyPotvrzeniAkt() {
  if (typeof aktivniVarianta !== 'function' || typeof ZAK === 'undefined') return null;
  const v = aktivniVarianta(ZAK);
  return (v && v.kontroly) || null;
}

/* Panel do karty cenové nabídky. Prázdný řetězec = všechno v pořádku
 * a nic se neodklepávalo (tichý stav je ten správný stav). */
function kontrolyPanel() {
  const s = kontrolyStavAkt();
  const p = kontrolyPotvrzeniAkt();
  if (!s.varovat) {
    /* Nic nesvítí. Když se předtím něco odklepávalo, stojí za to říct, že
     * je to spravené – jinak by zmizení panelu vypadalo jako závada. */
    if (!p || !p.pocet) return '';
    return `<div class="kontroly-panel ok">
      <span class="ikona">✔</span>
      <span>Kontroly před nabídkou neukazují nic k řešení.</span>
    </div>`;
  }
  const cisla = kontrolySmiCisla();
  const plati = (typeof kontrolyPotvrzeniPlati === 'function') && kontrolyPotvrzeniPlati(p, s);
  const polozky = s.nalezy.map(n => `<li>
      <span class="kde">${esc(n.kde)}</span>
      <span class="txt">${esc(n.text)}${cisla && n.detail ? ' <span class="detail">' + esc(n.detail) + '</span>' : ''}</span>
    </li>`).join('');
  const patka = plati
    ? `<div class="kontroly-odklep">✔ Odklepnuto${p.kdo ? ' (' + esc(p.kdo) + ')' : ''}
        ${p.kdy ? esc(String(p.kdy).slice(0, 10)) : ''} – nabídku lze vytvořit.</div>`
    : `<div class="kontroly-btns">
        <button class="mini" onclick="kontrolyPotvrd()">Beru na vědomí, pokračovat</button>
        <span class="pozn">Nic se neblokuje. Odklepnutí se uloží k variantě, aby bylo dohledatelné,
          že se na to někdo díval.</span>
      </div>`;
  return `<div class="kontroly-panel${plati ? ' odklepnuto' : ''}">
    <div class="kontroly-hlava"><span class="ikona">${plati ? '⚠' : '⚠'}</span>
      <b>Než nabídku odešlete – ${s.nalezy.length === 1 ? 'jedna věc' : s.nalezy.length + ' věci k ověření'}:</b></div>
    <ul class="kontroly-seznam">${polozky}</ul>
    ${patka}
  </div>`;
}

/* „Beru na vědomí." Ukládá se k variantě; odklepnout smí i běžný uživatel –
 * je to jeho podpis pod tím, že nabídku posílá tak, jak je. */
function kontrolyPotvrd() {
  if (typeof aktivniVarianta !== 'function' || typeof kontrolyPotvrzeni !== 'function') return;
  const v = aktivniVarianta(ZAK);
  if (!v) return;
  v.kontroly = kontrolyPotvrzeni(kontrolyStavAkt(), kontrolyKdo());
  if (typeof historieNeulozeno === 'function') historieNeulozeno();
  render();
}

/* Krátká podoba do náhledu dokumentu. Čísla nákladů tam nepatří nikdy –
 * náhled je to, co odchází ven. */
function kontrolyTiskLista() {
  const s = kontrolyStavAkt();
  if (!s.varovat) return '';
  const veta = (typeof kontrolyText === 'function') ? kontrolyText(s, { cisla: false }) : '';
  if (!veta) return '';
  return `<div class="kontroly-tisk noprint">⚠ Kontrola před odesláním: ${esc(veta)}</div>`;
}
