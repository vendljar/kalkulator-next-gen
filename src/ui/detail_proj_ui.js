/* ============================================================
 * DETAIL VÝPOČTU KALKULACE PROJ (zadání 17. 8. 2026)
 *
 * Sesterská záložka k „Detailu výpočtu" OCK: rozepisuje krok za krokem,
 * jak vzniká cena projekčních prací — položky (hodiny × sazba / fixní
 * částky vč. přepisů pro zakázku), jedno procento přirážky sekce (#141),
 * dopravu (km × sazba + mimo Prahu km / 60 × 1000), slevu, obchodní
 * zaokrouhlení a DPH. Používá tytéž stavební kameny dvKrok/dvTab jako
 * detail OCK, ať oba detaily vypadají stejně.
 *
 * Vidí ji jen role s právem `tab.detail` (stejné právo jako detail OCK):
 * rozpis nese nákladové sazby, a ty běžný obchodník nevidí.
 * ============================================================ */

function renderDetailProj() {
  const el = document.getElementById('page-detailproj'); if (!el) return;
  let r;
  try { r = vypocetProj(PJ, PC); }
  catch (e) { el.innerHTML = `<div class="card"><div class="body neg">Chyba výpočtu PROJ: ${esc(e.message)}</div></div>`; return; }

  const K = fmt, pctTxt = p => num(Math.round(p * 100) / 100) + ' %';

  /* 1) sazby a ceník */
  const krCenik = dvKrok('1. Vstupy z Ceníku nákladů PROJ', dvTab([
    ['Sazba – zaměření', K(PC.sazby.zamereni) + '/h', ''],
    ['Sazba – projektant', K(PC.sazby.projektant) + '/h', ''],
    ['Sazba – statik', K(PC.sazby.statik) + '/h', ''],
    ['Globální přirážka', pctTxt((PC.marze || 0) * 100), 'výchozí procento všech sekcí; sekce ho může přepsat (#141)'],
    ['Doprava – sazba za km', K(PC.dopravaKmKc) + '/km', 'po Praze 0 km'],
    ['Příplatek „mimo Prahu"', 'km / 60 × 1 000 Kč', 'hodina cesty při 60 km/h à 1 000 Kč (17. 8. 2026)'],
    ['DPH', Math.round((PC.dph || 0) * 100) + ' %', 'vlastní sazba projekční části'],
  ]), 'dvp-1');

  /* 2) sekce: položky a přirážka */
  const aktivniSekce = r.sekce.filter(s => s.naklad !== 0 || s.celkem !== 0 || s.dopravaKc !== 0);
  const sekceKroky = aktivniSekce.map((s, i) => {
    const radky = s.polozky.filter(p => !p.vyrazeno).map(p => p.typ === 'hod'
      ? [p.nazev, `${num(p.hodinyCelkem)} h × ${K(p.sazbaKc)} = ${K(p.naklad)}`,
         (p.rezerva ? `vč. rezervy ${num(p.rezerva)} h; ` : '')
           + (p.sazbaPrepsana ? `sazba přepsaná pro zakázku (ceník ${K(p.sazbaZCeniku)})` : `sazba „${p.sazba}" z ceníku`)]
      : [p.nazev, K(p.naklad),
         p.cenaPrepsana ? `fixní částka přepsaná pro zakázku (ceník ${K(p.cenaZCeniku)})` : 'fixní částka z ceníku']);
    const vyrazene = s.polozky.filter(p => p.vyrazeno).length;
    if (vyrazene) radky.push(['Vyřazené položky', vyrazene + '×', 'nepočítají se (zaškrtávátko Počítat)']);
    radky.push(['Náklad sekce', K(s.naklad), 'součet položek']);
    radky.push(['Přirážka sekce', `${pctTxt(s.pouzitePct)} ⇒ ${K(s.marze)}`,
      s.prirazkaPct == null ? 'globální přirážka z ceníku' : 'vlastní % sekce (přepisuje globální)']);
    if (s.dopravaKc) {
      const d = (pjSekce(r.sekce.indexOf(s)) || {}).doprava || {};
      radky.push(['Doprava', `${num(d.km || 0)} km × ${K(PC.dopravaKmKc)}`
        + (d.mimoPrahu ? ` + ${num(d.km || 0)} / 60 × 1 000` : '')
        + ((+d.pausal || 0) ? ` + ${K(+d.pausal)} ručně` : '') + ` = ${K(s.dopravaKc)}`,
        'bez přirážky (přeprodává se, jak stojí)']);
    }
    radky.push(['CELKEM sekce', K(s.celkem), 'náklad + přirážka + doprava']);
    const krokCislo = 2 + i;
    return dvKrok(krokCislo + '. ' + s.nazev, dvTab(radky), 'dvp-s' + i);
  }).join('');

  /* 3) od součtu sekcí ke koncové ceně */
  const cnp = (typeof cenaNabidkyProj === 'function') ? cenaNabidkyProj(r, SLP, ZOP) : null;
  const slevaPct = cnp ? cnp.slevaPct : 0;
  const cena = cnp ? cnp.cena : r.souhrn.celkem;
  const dph = cenaSDph(cena, PC.dph);
  const cisloZaveru = 2 + aktivniSekce.length;
  const zaver = dvKrok(cisloZaveru + '. Koncová cena', dvTab([
    ['Součet sekcí (s dopravou)', K(r.souhrn.celkem), 'náklad ' + K(r.souhrn.naklad) + ' + přirážka '
      + K(r.souhrn.marze) + ' + doprava ' + K(r.souhrn.doprava)],
    ['Sleva PROJ', slevaPct ? pctTxt(slevaPct * 100) : 'žádná', 'jen schválená; počítá se z ceny projekce'],
    ['Obchodní zaokrouhlení', cnp && cnp.zaokrKc ? zaokrKc(cnp.zaokrKc) : 'beze změny',
      'zaokrouhluje se cena každé činnosti zvlášť (#135)'],
    ['CENA NABÍDKY PROJ bez DPH', K(cena), ''],
    ['DPH ' + Math.round((PC.dph || 0) * 100) + ' %', K(dph.dphKc), ''],
    ['Celkem s DPH', K(dph.sDph), ''],
  ]), 'dvp-z');

  el.innerHTML = `<div class="card"><h2>Detail výpočtu kalkulace PROJ
      <span class="note" style="font-weight:400">— krok za krokem, přesně jak počítá aplikace</span></h2>
    <div class="body">
      <div class="note">Rozpis ukazuje ŽIVÁ čísla otevřené varianty — každá změna v Kalkulaci PROJ se sem
        propíše okamžitě. Sekce mimo rozsah (bez jediné počítané položky) se nerozepisují, stejně jako se
        neuvádějí v nabídce. Nákladové sazby vidí jen role s právem na Detail výpočtu.</div>
      ${krCenik}
      ${sekceKroky}
      ${zaver}
    </div></div>`;
}
