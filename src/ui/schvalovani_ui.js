/* ================= ZÁLOŽKA SCHVALOVÁNÍ SLEV =========================
 * (zadání 5. 8. 2026: „Vytvoř novou záložku ‚schvalování slev'.")
 *
 * PROČ VLASTNÍ ZÁLOŽKA
 * Schvalování dosud viselo v kartě „Sleva na nabídku" pod výpočtem: kdo měl
 * kartu na obrazovce, viděl tlačítko „Schválit slevu", vybral si v seznamu
 * roli nadřízeného a odklepl si vlastní žádost sám. Rozhraní tím schvalování
 * jen předstíralo — nešlo poznat, kdo o slevě opravdu rozhodl, a nikde nebyl
 * seznam žádostí, na který by se vedoucí mohl podívat. Tady je obojí:
 * pracovní seznam za celou zakázku a rozhodnutí podepsané přihlášeným
 * člověkem.
 *
 * KDO SEM VIDÍ
 * Záložku vidí každý, protože obchodník potřebuje vědět, jak jeho žádost
 * dopadla — bez toho by čekal naslepo. Rozhodovat ale smí jen ten, komu
 * administrátor přidělil právo `sleva.schvalovani` (Nastavení → Zobrazení)
 * A ZÁROVEŇ jehož vlastní strop slevu pokrývá: vedoucí se stropem 15 %
 * odklepne žádost na 8 %, žádost na 20 % mu zůstane jen ke čtení a půjde dál
 * k administrátorovi. Obchodník tedy v seznamu vidí i své žádosti, ale
 * tlačítka u nich nemá.
 *
 * PROČ SE ROZHODNUTÍ PODEPISUJE PŘIHLÁŠENÝM JMÉNEM
 * Dřív se do pole „schválil" psala vybraná ROLE („Vedoucí"), ne člověk. Po
 * půl roce z toho nešlo zjistit nic — kdo tu slevu vlastně pustil. Teď se
 * zapisuje jméno z přihlášení i s rolí; v offline režimu jméno z Nastavení.
 * ==================================================================== */

/* Rozepsané důvody zamítnutí. Drží se mimo zakázku: dokud se nezamítne,
 * není to údaj o nabídce, jen rozepsaný text v okně. Kdyby se ukládal do
 * varianty rovnou, každé klepnutí do políčka by měnilo zakázku (a plnilo
 * historii i automatické zálohy). */
const SCHV_DUVODY = {};
function schvDuvod(id, val) { SCHV_DUVODY[id] = String(val || ''); }

/* Kdo rozhoduje – jméno i role, aby šlo po čase dohledat člověka, ne roli. */
function schvKdoJsem() {
  const ja = (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV) ? ONLINE_STAV.ja : null;
  const role = (typeof zobrazeniRole === 'function') ? zobrazeniRole() : (NAST.jeAdmin ? 'Administrátor' : 'Obchodník');
  const jmeno = ja ? (ja.jmeno || ja.email) : (NAST.uzivatel || '');
  return jmeno ? jmeno + ' (' + role + ')' : role;
}

/* Podklady pro seznam: základ ceny a nákladu za každou variantu. Bere se
 * z téhož výpočtu jako porovnání variant, aby v obou přehledech stála
 * stejná čísla. */
function schvVypocty() {
  const out = {};
  ((ZAK && ZAK.varianty) || []).forEach(v => {
    let r = null;
    try { r = vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes); } catch (e) {}
    if (r && r.souhrn) out[v.id] = { zakladCena: r.souhrn.zakladCena, zakladNaklad: r.souhrn.zakladNaklad };
  });
  return out;
}

/* Srovnání stavů se skutečností před vykreslením. Bez toho by schválení
 * drželo i poté, co se variantě změnil ceník a sleva se propadla pod
 * minimální marži. Uzamčené varianty se přeskakují — odeslaná nabídka je
 * doklad a nesmí se v ní nic přepisovat ani dopočítávat. */
function schvPrepoctiVse(vypocty) {
  ((ZAK && ZAK.varianty) || []).forEach(v => {
    const sl = v.data && v.data.sleva;
    if (!sl) return;
    if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) return;
    const z = vypocty[v.id];
    schvalovaniPrepocti(sl, z ? slevaVyhodnot(z.zakladCena, z.zakladNaklad, sl, NAST.slevy) : null);
  });
}

function schvSmiRozhodovat() { return smiZobrazit('sleva.schvalovani'); }

/* Rozhodnutí o jedné žádosti. `co` = 'schvalit' | 'zamitnout' | 'vratit'. */
function schvRozhodni(id, co) {
  const v = ((ZAK && ZAK.varianty) || []).find(x => x.id === id);
  if (!v || !v.data || !v.data.sleva) return;
  if (!schvSmiRozhodovat()) {
    alert('O slevách rozhoduje vedoucí nebo administrátor.\n\n'
      + 'Právo „Schvalování slevy nad strop role" přiděluje administrátor '
      + 'v Nastavení → Zobrazení.');
    return;
  }
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) {
    alert(`Varianta „${v.nazev}" je uzamčená – byla vytištěna jako cenová nabídka, `
      + 'tedy odeslána zákazníkovi.\n\nCo v ní odešlo, se zpětně neschvaluje ani nemění. '
      + 'Pro jinou slevu založte novou variantu.');
    return;
  }
  const pct = +v.data.sleva.procenta || 0;
  const role = (typeof zobrazeniRole === 'function') ? zobrazeniRole() : 'Obchodník';
  if (co !== 'vratit' && !schvalovaniSmiRozhodnout(role, pct, NAST.slevy)) {
    const kdo = schvalovaniKdoMuze(pct, NAST.slevy, NAST.role);
    alert(`Sleva ${pct} % přesahuje strop role „${role}".\n\n`
      + (kdo.length ? 'Rozhodnout o ní může: ' + kdo.join(', ') + '.'
                    : 'Podle nastavení stropů o ní nemůže rozhodnout žádná role – '
                      + 'zkontrolujte Nastavení → Slevy.'));
    return;
  }
  if (co === 'schvalit') schvalovaniSchval(v.data.sleva, schvKdoJsem());
  else if (co === 'zamitnout') schvalovaniZamitni(v.data.sleva, schvKdoJsem(), null, SCHV_DUVODY[id] || '');
  else schvalovaniVrat(v.data.sleva);
  render();
}

/* Přepnutí do kalkulace na variantu, o které se rozhoduje – vedoucí si chce
 * skoro vždy nejdřív prohlédnout, co za tou slevou stojí. */
function schvOtevriVariantu(id) {
  if (!((ZAK && ZAK.varianty) || []).some(x => x.id === id)) return;
  ZAK.aktivni = id;
  if (typeof syncVarianta === 'function') syncVarianta();
  prepniTab('kalk');
  render();
}

const SCHV_PILL = {
  ceka: ['warn', '⏳ čeká na rozhodnutí'],
  schvaleno: ['', '✓ schváleno'],
  auto: ['', '✓ schváleno automaticky'],
  zamitnuto: ['neg', '✕ zamítnuto'],
  podMarzi: ['neg', '✕ pod minimální marží'],
  bez: ['mut', 'bez slevy'],
};

function schvPct(x) { return (Math.round(x * 10000) / 100).toLocaleString('cs-CZ') + ' %'; }

/* Jeden řádek seznamu + řádek s podrobnostmi pod ním. Podrobnosti jsou
 * vlastní řádek přes celou šířku, ne tooltip: důvod zamítnutí a poznámka
 * obchodníka jsou to hlavní, o čem se rozhoduje, a schovávat je za najetí
 * myší by znamenalo, že je nikdo nepřečte. */
function schvRadek(z, muzeVidetMarzi) {
  const [pillCls, pillTxt] = SCHV_PILL[z.kategorie] || ['mut', z.kategorie];
  const role = (typeof zobrazeniRole === 'function') ? zobrazeniRole() : 'Obchodník';
  const smiTeď = schvSmiRozhodovat() && !z.zamceno && schvalovaniSmiRozhodnout(role, z.procenta, NAST.slevy);

  const tlacitka = [];
  if (smiTeď) {
    if (z.kategorie === 'ceka' || z.kategorie === 'zamitnuto')
      tlacitka.push(`<button class="primary mini" onclick="schvRozhodni('${escJs(z.id)}','schvalit')">Schválit</button>`);
    if (z.kategorie === 'ceka' || z.kategorie === 'schvaleno' || z.kategorie === 'auto')
      tlacitka.push(`<button class="mini" onclick="schvRozhodni('${escJs(z.id)}','zamitnout')">Zamítnout</button>`);
    if (z.kategorie === 'schvaleno' || z.kategorie === 'zamitnuto')
      tlacitka.push(`<button class="mini" onclick="schvRozhodni('${escJs(z.id)}','vratit')">Vrátit rozhodnutí</button>`);
  }
  tlacitka.push(`<button class="mini" onclick="schvOtevriVariantu('${escJs(z.id)}')">Otevřít v kalkulaci</button>`);

  /* Proč tlačítka nejsou – vysvětlení místo prázdného sloupce. Prázdné místo
   * vede k dotazu „proč to nejde"; věta na to odpoví rovnou. */
  let proc = '';
  if (!smiTeď) {
    if (z.zamceno) proc = 'Varianta je uzamčená jako odeslaná nabídka – rozhodnutí už nelze měnit.';
    else if (!schvSmiRozhodovat()) proc = 'O slevách rozhoduje vedoucí nebo administrátor.';
    else proc = `Sleva přesahuje strop role „${esc(role)}" – rozhodne ${z.kdoMuze.length ? esc(z.kdoMuze.join(' nebo ')) : 'administrátor'}.`;
  }

  const marze = muzeVidetMarzi && z.spocteno
    ? `<td style="text-align:right;color:${z.podMarzi ? '#b91c1c' : '#15803d'}">${schvPct(z.marzePoSleve)}</td>`
    : '<td style="text-align:right" class="note">—</td>';

  const podrobnosti = [];
  if (z.schema) podrobnosti.push('Schéma: <b>' + esc(z.schema) + '</b>');
  if (z.role) podrobnosti.push('Zadal jako: <b>' + esc(z.role) + '</b>');
  if (z.strop != null) podrobnosti.push('Strop role: ' + schvPct(z.strop));
  if (z.poznamka) podrobnosti.push('Poznámka: ' + esc(z.poznamka));
  if (z.kategorie === 'schvaleno' && z.schvalil)
    podrobnosti.push('Schválil: <b>' + esc(z.schvalil) + '</b>'
      + (z.schvalilKdy ? ' · ' + new Date(z.schvalilKdy).toLocaleString('cs-CZ') : ''));
  if (z.kategorie === 'zamitnuto' && z.zamitl)
    podrobnosti.push('Zamítl: <b>' + esc(z.zamitl) + '</b>'
      + (z.zamitlKdy ? ' · ' + new Date(z.zamitlKdy).toLocaleString('cs-CZ') : '')
      + (z.zamitnutoDuvod ? ' – ' + esc(z.zamitnutoDuvod) : ''));
  if (z.kategorie === 'podMarzi')
    podrobnosti.push('Sleva by srazila marži pod firemní minimum'
      + (z.minMarze != null ? ' (' + schvPct(z.minMarze) + ')' : '') + '. Schválit ji nelze nikým.');
  if (!z.spocteno)
    podrobnosti.push('Výpočet OCK této varianty se nepodařil – dopad slevy v Kč proto nelze ukázat.');
  if (proc) podrobnosti.push('<span class="note">' + proc + '</span>');

  const duvod = smiTeď && (z.kategorie === 'ceka' || z.kategorie === 'schvaleno' || z.kategorie === 'auto')
    ? `<div class="row" style="max-width:520px;margin-top:4px"><label>Důvod zamítnutí <span class="note">(nepovinný)</span></label>
         <input type="text" value="${esc(SCHV_DUVODY[z.id] || '')}" placeholder="proč slevu nepustit…"
           onchange="schvDuvod('${escJs(z.id)}', this.value)"></div>`
    : '';

  return `<tr>
      <td>${esc(z.nazev)}${z.ridici ? ' <span class="pill">řídící</span>' : ''}${z.zamceno ? ' <span class="pill mut">uzamčená</span>' : ''}</td>
      <td style="text-align:right">${esc(String(z.procenta))} %</td>
      <td style="text-align:right">${z.spocteno ? fmt0(z.slevaKc) : '—'}</td>
      <td style="text-align:right">${z.spocteno ? fmt0(z.cenaPoSleve) : '—'}</td>
      ${marze}
      <td><span class="pill ${pillCls}">${pillTxt}</span></td>
      <td><div class="btns" style="margin:0">${tlacitka.join('')}</div></td>
    </tr>
    <tr><td colspan="7" style="padding-top:0">
      <div class="note">${podrobnosti.join(' · ')}</div>${duvod}</td></tr>`;
}

function schvalovaniKarta() {
  const vypocty = schvVypocty();
  schvPrepoctiVse(vypocty);
  const seznam = schvalovaniSeznam(ZAK, vypocty, NAST.slevy, NAST.role);
  const souhrn = schvalovaniSouhrn(seznam);
  const muzeVidetMarzi = smiZobrazit('kpi.marze');

  const uvod = `<div class="note">Seznam slev zadaných v jednotlivých variantách této zakázky
      (číslo ${esc(ZAK.cislo || '—')}). Sleva do stropu role zadavatele projde sama; nad strop
      čeká na rozhodnutí toho, jehož vlastní strop ji pokrývá. Neschválená sleva se do cenové
      nabídky ani do krycího listu nepropíše.</div>`;

  if (!seznam.length)
    return card('Schvalování slev', uvod
      + '<div class="note" style="margin-top:8px">V žádné variantě této zakázky není zadaná sleva – '
      + 'není o čem rozhodovat. Sleva se zadává v kartě „Sleva na nabídku" pod výpočtem '
      + 'v záložce Kalkulace OCK.</div>', false, 'schv-seznam');

  const stat = [
    ['⏳ čeká', souhrn.ceka], ['✓ schváleno', souhrn.schvaleno + souhrn.auto],
    ['✕ zamítnuto', souhrn.zamitnuto], ['✕ pod marží', souhrn.podMarzi],
  ].map(([n, v]) => `<span class="pill ${v ? '' : 'mut'}" style="margin-right:6px">${n}: ${v}</span>`).join('');

  const marzeHlav = muzeVidetMarzi
    ? '<th style="text-align:right">Marže po slevě</th>'
    : '<th style="text-align:right">Marže po slevě <span class="note">(skryto)</span></th>';

  const tab = `<table class="sd-tbl" style="margin-top:8px">
      <tr><th>Varianta</th><th style="text-align:right">Sleva</th><th style="text-align:right">Sleva v Kč</th>
        <th style="text-align:right">Cena po slevě</th>${marzeHlav}<th>Stav</th><th>Rozhodnutí</th></tr>
      ${seznam.map(z => schvRadek(z, muzeVidetMarzi)).join('')}
    </table>`;

  /* Vedoucí, který nevidí marži, rozhoduje naslepo – proto se to napíše
   * nahlas i s tím, kde se to spraví. Právo se nepřiděluje samo: „vidět
   * marži" a „smět schvalovat" jsou dvě různá rozhodnutí administrátora
   * a spojovat je za něj by obcházelo matici zobrazení. */
  const bezMarze = (!muzeVidetMarzi && schvSmiRozhodovat())
    ? '<div class="note" style="margin-top:8px"><b>Marže po slevě se vám nezobrazuje.</b> '
      + 'Rozhodujete tedy jen podle ceny. Zobrazení marže přiděluje administrátor '
      + 'v Nastavení → Zobrazení (položka „Ukazatele Náklad / Hrubý zisk / Marže v hlavičce").</div>'
    : '';

  const kdoJsem = `<div class="note" style="margin-top:8px">Rozhodnutí se podepisuje jako
      <b>${esc(schvKdoJsem())}</b>.</div>`;

  return card('Schvalování slev', uvod + '<div style="margin-top:6px">' + stat + '</div>'
    + tab + bezMarze + (schvSmiRozhodovat() ? kdoJsem : ''), false, 'schv-seznam');
}

function renderSchvalovani() {
  const el = document.getElementById('page-schvalovani');
  if (el) el.innerHTML = schvalovaniKarta();
}
