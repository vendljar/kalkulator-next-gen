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
    return card('Schvalování slev', schvPrepinacRozsahu() + uvod
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

  return card('Schvalování slev', schvPrepinacRozsahu() + uvod
    + '<div style="margin-top:6px">' + stat + '</div>'
    + tab + bezMarze + (schvSmiRozhodovat() ? kdoJsem : ''), false, 'schv-seznam');
}

/* ---------- žádosti z ostatních zakázek (#102, 10. 8. 2026) ----------
 *
 * Rozhodnutí J. V. z 10. 8. 2026: „ano, ale prvně by měly být vidět otevřené
 * a pak mít možnost přepnout i na ostatní, bude-li třeba." Výchozí pohled tedy
 * zůstává otevřená zakázka; ostatní se dotahují až na vyžádání.
 *
 * Dotahují se až na kliknutí schválně. Rejstřík se skládá čtením všech zakázek
 * na serveru — u tří set zakázek je to tři sta čtení a spouštět je pokaždé,
 * když si někdo otevře záložku, by byl provoz zadarmo. */
const SCHV_CIZI = { rozsah: 'zakazka', stav: 'nic', zadosti: [], chyba: '', vse: false };

function schvPrepniRozsah(rozsah) {
  SCHV_CIZI.rozsah = rozsah;
  if (rozsah === 'vse' && SCHV_CIZI.stav === 'nic') { schvNactiCizi(); return; }
  render();
}

function schvZobrazitRozhodnute(zapnout) {
  SCHV_CIZI.vse = !!zapnout;
  schvNactiCizi();
}

function schvNactiCizi() {
  if (typeof onlineApi !== 'function') {
    SCHV_CIZI.stav = 'chyba';
    SCHV_CIZI.chyba = 'Přehled napříč zakázkami potřebuje online databázi.';
    render();
    return;
  }
  SCHV_CIZI.stav = 'nacitam'; SCHV_CIZI.chyba = ''; render();
  onlineApi('/api/schvalovani' + (SCHV_CIZI.vse ? '?vse=1' : ''))
    .then((d) => {
      /* Pojistka proti tomu, aby se do sdíleného přehledu časem propašovala
       * částka: kdyby server začal posílat pole, které neznáme, radši to
       * řekneme nahlas, než abychom to mlčky vykreslili. */
      const cizi = schvalovaniRejstrikNeznameKlice(d.zadosti);
      if (cizi.length) {
        SCHV_CIZI.stav = 'chyba';
        SCHV_CIZI.chyba = 'Server poslal v rejstříku neznámé údaje (' + cizi.join(', ')
          + '). Přehled se nezobrazí, dokud se to nevysvětlí.';
      } else {
        SCHV_CIZI.stav = 'hotovo';
        SCHV_CIZI.zadosti = d.zadosti || [];
        SCHV_CIZI.pocetCeka = d.pocetCeka;
        SCHV_CIZI.neuplny = !!d.neuplny;
        SCHV_CIZI.prohledano = d.prohledano;
      }
      render();
    })
    .catch((e) => {
      SCHV_CIZI.stav = 'chyba';
      SCHV_CIZI.chyba = 'Seznam se nepodařilo načíst: ' + e.message;
      render();
    });
}

function schvPrepinacRozsahu() {
  const tl = (id, popis) => `<button class="mini ${SCHV_CIZI.rozsah === id ? 'primary' : ''}"
      onclick="schvPrepniRozsah('${escJs(id)}')">${esc(popis)}</button>`;
  return `<div style="margin-top:6px">${tl('zakazka', 'Tato zakázka')} ${tl('vse', 'Všechny zakázky')}</div>`;
}

function schvCiziKarta() {
  const prepinac = schvPrepinacRozsahu();
  if (SCHV_CIZI.stav === 'nacitam')
    return card('Schvalování slev', prepinac + '<div class="note" style="margin-top:8px">Načítám žádosti ze všech zakázek…</div>',
      false, 'schv-seznam');
  if (SCHV_CIZI.stav === 'chyba')
    return card('Schvalování slev', prepinac
      + `<div class="warn" style="margin-top:8px">${esc(SCHV_CIZI.chyba)}</div>`
      + `<div style="margin-top:6px"><button class="mini" onclick="schvNactiCizi()">Zkusit znovu</button></div>`,
      false, 'schv-seznam');

  const seznam = schvalovaniSeznamRejstrik(SCHV_CIZI.zadosti);
  const uvod = `<div class="note">Žádosti ze <b>všech zakázek v databázi</b>${SCHV_CIZI.vse ? '' : ' , které čekají na rozhodnutí'}.
      <b>Částky se tu nezobrazují</b> — sdílený přehled nese jen číslo zakázky, procento slevy a stav.
      Cenu a marži uvidíte po otevření zakázky, kde platí obvyklá pravidla zobrazení.</div>`;
  const volba = `<div style="margin-top:6px">
      <label><input type="checkbox" ${SCHV_CIZI.vse ? 'checked' : ''}
        onchange="schvZobrazitRozhodnute(this.checked)"> zobrazit i už rozhodnuté žádosti</label>
      <button class="mini" style="margin-left:8px" onclick="schvNactiCizi()">Obnovit</button></div>`;
  const strop = SCHV_CIZI.neuplny
    ? `<div class="warn" style="margin-top:8px">Prošlo se prvních ${SCHV_CIZI.prohledano} zakázek —
        v databázi jich je víc. Zbytek se v tomhle přehledu neukáže.</div>` : '';

  if (!seznam.length)
    return card('Schvalování slev', prepinac + uvod + volba
      + '<div class="note" style="margin-top:8px">Žádná žádost'
      + (SCHV_CIZI.vse ? '' : ' nečeká na rozhodnutí') + '. Prošlo se '
      + (SCHV_CIZI.prohledano || 0) + ' zakázek.</div>' + strop, false, 'schv-seznam');

  const radky = seznam.map((z) => {
    const [pillCls, pillTxt] = SCHV_PILL[z.kategorie] || ['mut', z.kategorie];
    return `<tr>
      <td><b>${esc(z.cislo || '—')}</b><div class="note">${esc(z.nazevAkce || '')}</div></td>
      <td>${esc(z.nazev)}${z.ridici ? ' <span class="pill">řídicí</span>' : ''}</td>
      <td style="text-align:right">${schvPct(z.procenta / 100)}</td>
      <td><span class="pill ${pillCls}">${pillTxt}</span>
        ${z.zamceno ? ' <span class="pill mut">uzamčeno</span>' : ''}</td>
      <td class="note">${esc(z.schvalil || z.zamitl || '')}${(z.schvalilKdy || z.zamitlKdy)
        ? ' · ' + esc(String(z.schvalilKdy || z.zamitlKdy).slice(0, 10)) : ''}</td>
      <td><button class="mini" onclick="schvOtevriZakazku('${escJs(z.klic)}')">Otevřít zakázku</button></td>
    </tr>`;
  }).join('');

  const tab = `<table class="sd-tbl" style="margin-top:8px">
      <tr><th>Zakázka</th><th>Varianta</th><th style="text-align:right">Sleva</th>
        <th>Stav</th><th>Rozhodl</th><th></th></tr>${radky}</table>`;

  return card('Schvalování slev', prepinac + uvod + volba + tab + strop, false, 'schv-seznam');
}

/* Rozhodovat se dá až v otevřené zakázce. Je to schválně: rozhodnutí se
 * zapisuje do zakázky a ta se musí uložit — odklepnout slevu z přehledu,
 * aniž by se zakázka načetla, by znamenalo psát do souboru, který nemám
 * před sebou. Navíc rozhodující člověk má vidět, o čem rozhoduje. */
function schvOtevriZakazku(klic) {
  if (typeof onlineOtevri !== 'function') return;
  onlineOtevri(klic).then((otevreno) => {
    /* Po otevření zakázky přepneme zpátky na její vlastní seznam — tam už
     * jsou částky i tlačítka a je nad čím rozhodovat. */
    if (otevreno) { SCHV_CIZI.rozsah = 'zakazka'; render(); }
  });
}

function renderSchvalovani() {
  const el = document.getElementById('page-schvalovani');
  if (el) el.innerHTML = (SCHV_CIZI.rozsah === 'vse') ? schvCiziKarta() : schvalovaniKarta();
}
