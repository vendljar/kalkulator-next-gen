/* ================= ZÁLOŽKA PŘEHLED CENOVÝCH NABÍDEK =================
 * (dříve „Zakázka a varianty") Správa variant řešení/zákazníků v rámci
 * jedné zakázky (číslo CN) + obě cenové nabídky – OCK i PROJ – na jednom
 * místě. Právě jedna varianta je „řídící“ = aktuálně platná pro nabídku.
 * Vše se ukládá do jednoho JSON souboru zakázky (StorageAdapter). */

/* Nová varianta = klon otevřené. Od #34 jde přes klonujVariantu, aby dostala
 * vlastní příponu čísla nabídky (.1, .2 …) a nezdědila zámek zdroje. */
function varNova() {
  const zdroj = aktivniVarianta(ZAK);
  const v = (typeof klonujVariantu === 'function')
    ? klonujVariantu(ZAK, zdroj.id, { nazev: 'Varianta ' + (ZAK.varianty.length + 1) })
    : null;
  if (!v) {   // pojistka pro sestavení bez zamek.js
    const z = novaVarianta('Varianta ' + (ZAK.varianty.length + 1),
      JSON.parse(JSON.stringify(zdroj.data)));
    ZAK.varianty.push(z); ZAK.aktivni = z.id;
  }
  syncVarianta(); render();
}
function varAktivuj(id) { ZAK.aktivni = id; syncVarianta(); render(); }
function varRidici(id) { nastavRidici(ZAK, id); render(); }
function varSmaz(id) {
  if (ZAK.varianty.length <= 1) { alert('Poslední variantu nelze smazat.'); return; }
  const v = ZAK.varianty.find(x => x.id === id);
  // #34: odeslanou nabídku běžný uživatel nemaže – je to doklad o tom, co
  // zákazník dostal. Správce ano (má i odemknutí), ale s výslovným varováním.
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) {
    if (!smiZobrazit('varianta.smazatUzamcenou')) {
      alert(`Varianta „${v.nazev}" (${variantaCislo(ZAK, v)}) je uzamčená jako odeslaná nabídka `
        + 'a nelze ji smazat.\n\nZáznam o tom, co odešlo zákazníkovi, musí v zakázce zůstat.');
      return;
    }
    if (!confirm(`Varianta „${v.nazev}" (${variantaCislo(ZAK, v)}) je UZAMČENÁ – byla vytištěna `
      + 'jako cenová nabídka, tedy odeslána zákazníkovi.\n\nOpravdu ji smazat i s dokladem o odeslání?')) return;
  } else if (!confirm(`Smazat variantu „${v.nazev}“?`)) return;
  ZAK.varianty = ZAK.varianty.filter(x => x.id !== id);
  if (!ZAK.varianty.some(x => x.ridici)) ZAK.varianty[0].ridici = true;
  if (ZAK.aktivni === id) ZAK.aktivni = ZAK.varianty[0].id;
  syncVarianta(); render();
}
/* Pole v přehledové tabulce (název, zákazník, poznámka). Zámek se tu řeší
 * ručně, ne obecným obalením: varSet pracuje s libovolnou variantou podle id,
 * ne jen s otevřenou. */
function varSet(id, k, val) {
  const v = ZAK.varianty.find(x => x.id === id);
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) {
    alert(`Varianta „${v.nazev}" (${variantaCislo(ZAK, v)}) je uzamčená jako odeslaná nabídka `
      + '– její údaje se už nemění.\n\nPokračujte tlačítkem „Klonovat" na jejím řádku.');
    render();   // vrátí do políčka uloženou hodnotu
    return;
  }
  v[k] = val; v.upraveno = new Date().toISOString();
  render();
}
function novaZakazkaUI() {
  if (!confirm('Založit novou prázdnou zakázku? Neuložené změny aktuální zakázky se ztratí.')) return;
  ZAK = novaZakazka(); syncVarianta();
  /* Nová zakázka nesmí zdědit jméno té předchozí – jinak by ji brána
   * automatického ukládání považovala za „už uloženou" a hned by ji sama
   * zapsala do databáze jako záznam bez čísla (4. 8. 2026). */
  if (typeof zakOdpojUlozeni === 'function') zakOdpojUlozeni();
  if (typeof seznamReset === 'function') seznamReset();   // #18 – viz nactiZakazku
  render(); prepniTab('kalk');
}

/* #18: tabulka variant má vlastní modul (seznam.js + ui/seznam_ui.js), protože
 * k ní přibylo řazení, filtr a hledání. Tady zůstala jen hlavička zakázky,
 * nabídky a souhrny. */
function renderZakazka() {
  const rid = ridiciVarianta(ZAK);
  const rc = spocitejVariantu(rid);
  const ridOck = rc.ock ? rc.ock.souhrn.zakladCena : 0;
  const ridOckDph = rc.ock ? rc.ock.souhrn.zakladSDph : 0;
  const ridProj = rc.proj ? rc.proj.souhrn.celkem : 0;

  zajistiProjHlavicku(ZAK);   // starší zakázka hlavičku PROJ ještě nemá

  document.getElementById('page-zakazka').innerHTML =
    card('Zakázka – hlavička OCK',
      /* Trojice stojí i tady, na začátku karty (zadání 4. 8. 2026: „na
       * začátek lišty"). Právě v téhle kartě se hlavička vyplňuje, takže
       * hláška „vyplňte CN a název akce, pak uložte" musí být vidět přesně
       * tady — ne o dvě obrazovky jinde. */
      `<div class="zak-cena noprint" style="margin-top:0">${zakTrojice()}</div>${zakUlozeniRadek()}` +
      inp('ZAK.cislo', { type: 'text', l: 'Číslo nabídky (CN)' }) +
      inp('ZAK.nazevAkce', { type: 'text', l: 'Název akce' }) +
      inp('ZAK.adresa', { type: 'text', l: 'Adresa stavby' }) +
      inp('ZAK.objednatel', { type: 'text', l: 'Objednatel' }) +
      // KL-2: sídlo objednatele je jiná adresa než stavba. Do krycího listu
      // (fakturace, smlouva) patří sídlo; prázdné pole se tam neuvede.
      inp('ZAK.adresaObjednatele', { type: 'text', l: 'Adresa (sídlo) objednatele' }) +
      inp('ZAK.kontakt', { type: 'text', l: 'Kontaktní osoba objednatele' }) +
      // IČO stojí i tady hned za kontaktní osobou, aby se obě hlavičky četly
      // ve stejném pořadí jako lišta nad kalkulací (zadání z 30. 7. 2026).
      inp('ZAK.ico', { type: 'text', l: 'IČO objednatele' }) +
      // dotaz do rejstříku ARES (#10) – ukáže firmu a teprve na potvrzení přepíše
      (typeof aresRadek === 'function' ? aresRadek('ock', true) : '') +
      inp('ZAK.datum', { type: 'date', l: 'Datum' }) +
      `<div class="note">Adresa stavby a sídlo objednatele se často liší (developer sídlí jinde,
      než staví). Krycí list bere <b>Adresu stavby</b> do řádku „Adresa stavby" a <b>sídlo</b>
      do řádku „Adresa objednatele" – dokud sídlo nevyplníte, zůstane v krycím listu prázdné.</div>` +
      /* Původní trojice se 4. 8. 2026 přestěhovala nahoru a míří do databáze.
       * Tady zůstala jen práce se SOUBOREM – nic se nemazalo, jen se
       * tlačítka jmenují podle toho, co opravdu dělají (dřív se „Uložit
       * zakázku (JSON)" tvářilo jako uložení zakázky a přitom jen stáhlo
       * soubor do Stažených; do databáze se nezapsalo nic). Soubor je
       * záchrana pro každého: funguje i bez serveru a bez složky. */
      `<div class="btns" style="margin-top:10px">
        <button onclick="ulozZakazku()">Uložit do souboru (JSON)</button>
        <button onclick="document.getElementById('fileIn').click()">Načíst ze souboru</button>
      </div>
      <div class="note">Soubor zakázky obsahuje všechny varianty včetně zadání OCK, technické specifikace,
      kalkulace PROJ i ceníků. Starší soubory „zadání“ z předchozí verze aplikace lze také načíst –
      převedou se na zakázku s jednou variantou. <b>Do databáze</b> zakázku uloží tlačítko
      „Uložit zakázku" nahoře; po prvním uložení se ukládá sama po každé změně.</div>`) +
    (typeof renderOnlineKarta === 'function' ? renderOnlineKarta() : '') +
    /* Složka _DB je věc administrátora (zadání 4. 8. 2026): běžný uživatel
     * pracuje čistě s online databází a mapování Disku nikdy nevidí. */
    (smiZobrazit('uloziste.slozka') && typeof renderUlozisteKarta === 'function' ? renderUlozisteKarta() : '') +
    card('Zakázka – hlavička PROJ (cenová nabídka projekce)',
      inp('ZAK.projHlavicka.cislo', { type: 'text', l: 'Číslo nabídky (CN)' }) +
      inp('ZAK.projHlavicka.nazevAkce', { type: 'text', l: 'Název akce' }) +
      inp('ZAK.projHlavicka.adresa', { type: 'text', l: 'Adresa stavby' }) +
      inp('ZAK.projHlavicka.objednatel', { type: 'text', l: 'Objednatel' }) +
      // KL-2: sídlo objednatele je jiná adresa než stavba (viz hlavička OCK)
      inp('ZAK.projHlavicka.adresaObjednatele', { type: 'text', l: 'Adresa (sídlo) objednatele' }) +
      inp('ZAK.projHlavicka.kontakt', { type: 'text', l: 'Kontaktní osoba objednatele' }) +
      inp('ZAK.projHlavicka.ico', { type: 'text', l: 'IČO objednatele' }) +
      (typeof aresRadek === 'function' ? aresRadek('proj', true) : '') +
      inp('ZAK.projHlavicka.datum', { type: 'date', l: 'Datum' }) +
      `<div class="row" style="margin-top:8px"><label>Zakázka je jen projekce (bez OCK)</label>
        <input type="checkbox" ${ZAK.jenProj ? 'checked' : ''} onchange="set('ZAK.jenProj', this.checked)"><span class="u"></span></div>
      <div class="note">Projekce se někdy prodává samostatně (2. 8. 2026). Se zaškrtnutím přestanou
        platit kontroly nad zadáním OCK, sleva ZAK-10 (počítá se z ceny šachty) a část OCK
        v porovnání variant i v marži nabídky — čistě projekční nabídka tak nesvítí varováními
        o šachtě, kterou nikdo neprodává. Data OCK zůstávají, jen se nikam nepočítají;
        odškrtnutím se vše vrátí.</div>
      <div class="btns" style="margin-top:10px">
        <button onclick="zakHlavickaKopiruj('doProj')">⇦ Převzít údaje z hlavičky OCK</button>
        <button onclick="zakHlavickaKopiruj('doOck')">⇨ Přenést tyto údaje do hlavičky OCK</button>
      </div>
      <div class="note">Projekční část má vlastní číslo nabídky, náplň i objednatele, proto je tato
      hlavička <b>oddělená</b> od hlavičky OCK a nic se mezi nimi nepropisuje samo. Když se obě části
      řeší společně, přeneste údaje jedním z tlačítek výše a pak je doupravte — je to jediné místo
      v aplikaci, kde se hlavičky přenášejí (z lišty obou kalkulací tato tlačítka 5. 8. 2026 zmizela).
      Tato pole se používají v cenové nabídce PROJ (OVP-CN) a v krycím listu zakázky PROJ.</div>`) +
    seznamKarta() +
    /* #37 – interní zápisník zakázky. Stojí nad kartami nabídek schválně:
     * „proč jsme šli s cenou dolů" je potřeba mít na očích právě ve chvíli,
     * kdy se nabídka chystá ven. Do žádného dokumentu se nedostane. */
    (typeof poznamkyKarta === 'function'
      ? card('Interní poznámky a přílohy k zakázce (netisknou se)', poznamkyKarta()) : '') +
    /* Obě cenové nabídky na jednom místě. Nabídky se nikam neukládají –
     * generují se vždy živě z dat otevřené varianty; stejné karty zůstávají
     * i na konci záložek Kalkulace OCK a Kalkulace PROJ (nic se neodebralo). */
    card('Cenová nabídka OCK (CN)', nabidkaKarta()) +
    card('Cenová nabídka PROJ (OVP-CN)',
      typeof nabidkaProjKarta === 'function' ? nabidkaProjKarta() : '') +
    porovnaniKarta() +
    porovnaniPolozkyKarta() +
    card('Souhrn řídící varianty — ' + esc(rid.nazev),
      `<div class="grand">
        <div class="kpi"><div class="l">OCK bez DPH</div><div class="v">${fmt0(ridOck)}</div></div>
        <div class="kpi"><div class="l">OCK s DPH</div><div class="v">${fmt0(ridOckDph)}</div></div>
        <div class="kpi"><div class="l">PROJ celkem</div><div class="v">${fmt0(ridProj)}</div></div>
        <div class="kpi main"><div class="l">OCK + PROJ bez DPH</div><div class="v">${fmt0(ridOck + ridProj)}</div></div>
      </div>`) +
    /* #41 – protokol o kalkulaci. Stojí naopak úplně dole: není to nástroj
     * k práci, ale doklad, do kterého se chodí, když se někdo ptá zpětně. */
    (typeof protokolKarta === 'function'
      ? card('Protokol o kalkulaci (kdo, kdy a co změnil)', protokolKarta(), true) : '') +
    `<div class="note">Cenové nabídky se nikam neukládají – generují se vždy živě z aktuálních dat
     (kartami výše, nebo na konci záložek <b>Kalkulace OCK</b> a <b>Kalkulace PROJ</b> – obojí je totéž).
     Uložená jsou jen data v souboru zakázky. Údaje objednatele výše se do nabídek propíší.</div>`;

  /* Tělo seznamu se plní až po vložení karty do stránky – ovládací lišta
   * je v HTML výše, ale řádky doplňuje renderSeznam, aby se stejnou cestou
   * překreslovaly i při psaní do hledání (bez globálního render()). */
  renderSeznam();
  // Stejný důvod jako u seznamu: tělo protokolu se plní až po vložení karty
  // do stránky, aby šlo překreslit samotný protokol i mimo globální render().
  if (typeof renderProtokol === 'function') renderProtokol();
}

/* ============================================================
 * ZAK-2 – POROVNÁNÍ VARIANT VEDLE SEBE
 * Jen čtení: bere hotové výsledky ze spocitejVariantu() a skládá je
 * funkcí porovnaniVariant() (zakazka.js). Nemění žádná data ani výpočet.
 * Sloupec rozdílu se počítá proti ŘÍDÍCÍ variantě.
 * ============================================================ */

function porovnaniData() {
  const vypocty = ZAK.varianty.map(v => ({ id: v.id, ...spocitejVariantu(v) }));
  return porovnaniVariant(ZAK, vypocty);
}

/* metriky, které smí vidět uživatel podle role (náklad a marže jen admin) */
function porovnaniMetriky(p) {
  return p.metriky.filter(m => !m.admin || smiZobrazit('porovnani.naklad'));
}

const pctFmt = (n, d = 1) =>
  n == null ? '—' : (n * 100).toLocaleString('cs-CZ', { maximumFractionDigits: d }) + ' %';

function porovnaniHodnota(m, h) {
  if (h == null) return '—';
  return m.format === 'pct' ? pctFmt(h) : fmt0(h);
}

/* rozdíl proti řídící variantě: znaménko + barva; u ceny je „+" dráž */
function porovnaniRozdil(m, r, rPct) {
  if (r == null || Math.abs(r) < 0.5) return '<span class="note">—</span>';
  const znak = r > 0 ? '+' : '−';
  const txt = znak + fmt0(Math.abs(r)).replace('-', '');
  const pct = (rPct != null && Math.abs(rPct) > 0.0005)
    ? ` <span class="note">(${znak}${(Math.abs(rPct) * 100).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %)</span>` : '';
  return `<span class="${r > 0 ? 'neg' : 'pos'}">${txt}</span>${pct}`;
}

function porovnaniKarta() {
  if (ZAK.varianty.length < 2)
    return card('Porovnání variant vedle sebe',
      `<div class="note">Zakázka má zatím jedinou variantu, není co porovnávat.
       Tlačítkem <b>+ Nová varianta</b> výše vytvoříte kopii otevřené varianty a tabulka se objeví.</div>`);

  const p = porovnaniData();
  const met = porovnaniMetriky(p);
  const vs = p.varianty;

  const hlavicka = vs.map(v =>
    `<th class="${v.ridici ? 'ridici' : ''}">${esc(v.nazev)}${v.ridici ? ' <span class="tag">řídící</span>' : ''}
     ${v.zakaznik ? `<div class="note">${esc(v.zakaznik)}</div>` : ''}</th>
     ${v.ridici ? '' : '<th class="rozdil">rozdíl</th>'}`).join('');

  const telo = met.map(m => {
    const bunky = vs.map((v, i) => {
      const h = m.hodnoty[i];
      return `<td class="${v.ridici ? 'ridici' : ''}">${porovnaniHodnota(m, h)}</td>`
        + (v.ridici ? '' : `<td class="rozdil">${m.bezRozdilu ? '<span class="note">—</span>'
            : porovnaniRozdil(m, m.rozdily[i], m.rozdilyPct[i])}</td>`);
    }).join('');
    return `<tr class="${m.hlavni ? 'hlavni' : ''}${m.pozn ? ' pozn' : ''}">
      <th class="lbl">${esc(m.popis)}</th>${bunky}</tr>`;
  }).join('');

  const chyby = vs.filter(v => v.chyba)
    .map(v => `<div class="neg">Varianta „${esc(v.nazev)}": ${esc(v.chyba)}.</div>`).join('');

  return card('Porovnání variant vedle sebe',
    `<div style="overflow-x:auto"><table class="portbl">
       <tr><th class="lbl"></th>${hlavicka}</tr>
       ${telo}
     </table></div>
     ${chyby}
     <div class="btns" style="margin-top:10px">
       <button onclick="porovnaniTisk()">🖨 Tisk / PDF porovnání</button>
     </div>
     <div class="note">Tabulka je <b>jen ke čtení</b> – nic nepřepočítává ani neukládá, jen ukazuje
     už spočtené hodnoty jednotlivých variant. Sloupec <b>rozdíl</b> je vždy proti řídící variantě
     „${esc(p.ridiciNazev)}" (červeně dráž, zeleně levněji). <b>Celkem</b> = cena OCK po schválené
     slevě + kalkulace PROJ, stejně jako v cenové nabídce; <b>příplatky</b> se do celku nezapočítávají,
     nabízejí se zvlášť. Sazba DPH se přebírá z ceníku dané varianty a použije se i na část PROJ.
     ${smiZobrazit('porovnani.naklad') ? 'Řádky s nákladem a marží vidí jen role, které na ně mají právo.' : ''}</div>`);
}

/* ============================================================
 * ZAK-2b – DETAIL KONKRÉTNÍCH POLOŽEK, KTERÉ SE LIŠÍ
 * Opět jen čtení: porovnaniPolozek() (zakazka.js) porovná položky
 * každé varianty proti ŘÍDÍCÍ variantě a označí je jako přidané,
 * odebrané nebo změněné. Nic se nepřepočítává ani neukládá.
 * ============================================================ */

function porovnaniPolozkyData() {
  const vypocty = ZAK.varianty.map(v => ({ id: v.id, ...spocitejVariantu(v) }));
  return porovnaniPolozek(ZAK, vypocty);
}

/* atributy, které smí vidět uživatel podle role (náklad jen admin) */
function porovnaniAtributy() {
  return POROVNANI_ATRIBUTY.filter(a => a.typ !== 'text' && a.klic !== 'sMarzi' &&
                                        (!a.admin || smiZobrazit('porovnani.naklad')));
}

const POR_STAV_POPIS = { pridano: 'přidáno', odebrano: 'odebráno', zmeneno: 'změněno', shodne: 'beze změny' };
const POR_STAV_ZNAK = { pridano: '+', odebrano: '−', zmeneno: '≠', shodne: '=' };

/* „100,00 → 118,50"; chybějící strana se ukáže jako pomlčka */
function porovnaniDvojice(sr, sv, format, zvyrazni) {
  const f = v => v == null ? '—' : (format === 'kc' ? fmt0(v)
    : (+v).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }));
  if (sr == null && sv == null) return '<span class="note">—</span>';
  if (sr == null) return `<span class="note">—</span> → <b>${f(sv)}</b>`;
  if (sv == null) return `${f(sr)} → <span class="note">—</span>`;
  if (!zvyrazni) return f(sv);
  return `<span class="note">${f(sr)}</span> → <b>${f(sv)}</b>`;
}

function porovnaniPolozkyKarta() {
  if (ZAK.varianty.length < 2)
    return card('Detail položek – co se mezi variantami liší',
      `<div class="note">Zakázka má zatím jedinou variantu, není co porovnávat.</div>`);

  const p = porovnaniPolozkyData();
  const atr = porovnaniAtributy();

  const bloky = p.souhrn.map((s, idx) => {
    if (s.ridici) return '';
    if (s.chyba)
      return `<div class="neg" style="margin-top:8px">Varianta „${esc(s.nazev)}": ${esc(s.chyba)}.</div>`;

    const stitky = ['pridano', 'odebrano', 'zmeneno']
      .filter(k => s.pocty[k] > 0)
      .map(k => `<span class="stav ${k}">${POR_STAV_ZNAK[k]} ${s.pocty[k]} ${esc(POR_STAV_POPIS[k])}</span>`)
      .join(' ') || '<span class="note">beze změn v položkách</span>';

    const skupiny = p.skupiny.map(g => {
      const v = g.varianty[idx];
      if (!v.polozky.length) return '';
      const radky = v.polozky.map(it => {
        const zm = k => it.zmeny.indexOf(k) >= 0;
        const bunky = atr.map(a =>
          `<td>${porovnaniDvojice(it[a.klic + 'Ridici'], it[a.klic],
             a.typ === 'kc' ? 'kc' : 'cislo', it.stav === 'zmeneno' && zm(a.klic))}</td>`).join('');
        const cena = porovnaniDvojice(it.sMarziRidici, it.sMarzi, 'kc',
                                      it.stav === 'zmeneno' && zm('sMarzi'));
        const prejm = (it.stav === 'zmeneno' && zm('nazev'))
          ? `<div class="note">dříve: ${esc(it.nazevRidici || '')}</div>` : '';
        return `<tr class="st-${it.stav}">
          <td class="stavc"><span class="stav ${it.stav}">${POR_STAV_ZNAK[it.stav]} ${esc(POR_STAV_POPIS[it.stav])}</span></td>
          <td class="lbl">${esc(it.popis)}${it.vlastni ? ' <span class="tag">ruční</span>' : ''}${prejm}</td>
          ${bunky}<td>${cena}</td>
          <td class="rozdil">${porovnaniRozdil({ format: 'kc' }, it.rozdilKc, null)}</td></tr>`;
      }).join('');
      const souhrnG = `<span class="${v.rozdilKc > 0 ? 'neg' : (v.rozdilKc < 0 ? 'pos' : 'note')}">
          ${v.rozdilKc > 0 ? '+' : (v.rozdilKc < 0 ? '−' : '')}${fmt0(Math.abs(v.rozdilKc))} Kč</span>`;
      return `<tr class="skup"><th class="lbl" colspan="${3 + atr.length}">${esc(g.popis)}
                ${g.mimoCelek ? '<span class="tag">mimo celkovou cenu</span>' : ''}</th>
              <th class="rozdil">${souhrnG}</th></tr>${radky}`;
    }).join('');

    const hlavicka = `<tr><th>Stav</th><th class="lbl">Položka</th>
      ${atr.map(a => `<th>${esc(a.popis)}</th>`).join('')}
      <th>Cena položky</th><th class="rozdil">rozdíl</th></tr>`;

    const telo = skupiny || `<tr><td colspan="${4 + atr.length}" class="note">
      Varianta je položkově shodná s řídící variantou „${esc(p.ridiciNazev)}".</td></tr>`;

    const celkem = `<div class="note" style="margin:6px 0 2px">
      Rozdíl v ceně porovnávaných položek: <b class="${s.rozdilKc > 0 ? 'neg' : (s.rozdilKc < 0 ? 'pos' : '')}">
      ${s.rozdilKc > 0 ? '+' : (s.rozdilKc < 0 ? '−' : '')}${fmt0(Math.abs(s.rozdilKc))} Kč</b>
      ${Math.abs(s.rozdilMimoCelek) >= 0.5 ? `· příplatky mimo celkovou cenu:
        <b>${s.rozdilMimoCelek > 0 ? '+' : '−'}${fmt0(Math.abs(s.rozdilMimoCelek))} Kč</b>` : ''}
      · shodných položek: ${s.pocty.shodne}</div>`;

    return `<details class="pordet" ${s.bezeZmen ? '' : 'open'}>
      <summary><b>${esc(s.nazev)}</b> proti „${esc(p.ridiciNazev)}" &nbsp; ${stitky}</summary>
      ${celkem}
      <div style="overflow-x:auto"><table class="portbl poltbl">${hlavicka}${telo}</table></div>
    </details>`;
  }).join('');

  return card('Detail položek – co se mezi variantami liší',
    `${bloky}
     <div class="btns" style="margin-top:10px">
       <button onclick="porovnaniPolozkyTisk()">🖨 Tisk / PDF detailu položek</button>
     </div>
     <div class="note">Přehled je <b>jen ke čtení</b>. Každá varianta se porovnává proti řídící variantě
     „${esc(p.ridiciNazev)}": <b>+ přidáno</b> = položka je navíc, <b>− odebráno</b> = ve variantě není,
     <b>≠ změněno</b> = liší se množství, jednotková cena nebo název. Položky beze změny se neuvádějí,
     jejich počet je v souhrnu. <b>Volitelné položky</b> se řídí zaškrtnutím v kalkulaci, u <b>příplatků</b>
     znamená nulové množství, že se nenabízejí. Ceny položek jsou <b>s marží, bez DPH</b>; příplatky se
     do celkové ceny nezapočítávají.${smiZobrazit('porovnani.naklad') ? ' Sloupec Náklad položky vidí jen role, které na něj mají právo.' : ''}</div>`);
}

/* Tiskový pohled detailu položek – popisky v jazyce dokumentů */
function porovnaniPolozkyTisk() {
  const p = porovnaniPolozkyData();
  const atr = porovnaniAtributy();
  const L = jazyk();
  const f0 = v => v == null ? '—' : fmt0(v);
  const fn = v => v == null ? '—' : (+v).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });

  const bloky = p.souhrn.map((s, idx) => {
    if (s.ridici || s.chyba) return '';
    const skupiny = p.skupiny.map(g => {
      const v = g.varianty[idx];
      if (!v.polozky.length) return '';
      const radky = v.polozky.map(it => {
        const bunky = atr.map(a => `<td>${a.typ === 'kc'
          ? (f0(it[a.klic + 'Ridici']) + ' → ' + f0(it[a.klic]))
          : (fn(it[a.klic + 'Ridici']) + ' → ' + fn(it[a.klic]))}</td>`).join('');
        const r = it.rozdilKc;
        return `<tr><td>${esc(T(POR_STAV_POPIS[it.stav]))}</td><th>${esc(it.popis)}</th>${bunky}
          <td>${f0(it.sMarziRidici)} → ${f0(it.sMarzi)}</td>
          <td>${Math.abs(r) < 0.5 ? '—' : (r > 0 ? '+' : '−') + fmt0(Math.abs(r))}</td></tr>`;
      }).join('');
      return `<tr class="skup"><th colspan="${4 + atr.length}">${esc(T(g.popis))}</th></tr>${radky}`;
    }).join('');

    const pocty = ['pridano', 'odebrano', 'zmeneno']
      .map(k => `${esc(T(POR_STAV_POPIS[k]))}: ${s.pocty[k]}`).join(' · ');

    return `<h2>${esc(s.nazev)}</h2><div class="sub">${pocty} · ${esc(T('beze změny'))}: ${s.pocty.shodne}</div>
      <table><tr><th>${esc(T('Stav'))}</th><th>${esc(T('Položka'))}</th>
        ${atr.map(a => `<th>${esc(T(a.popis))}</th>`).join('')}
        <th>${esc(T('Cena položky'))}</th><th>${esc(T('rozdíl'))}</th></tr>
        ${skupiny || `<tr><td colspan="${4 + atr.length}">${esc(T('Varianta je položkově shodná s řídící variantou.'))}</td></tr>`}
      </table>`;
  }).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="${L}"><head><meta charset="utf-8">
    <title>${esc(T('Detail položek'))} ${esc(ZAK.cislo || '')}</title>
    <style>body{font:12px/1.5 "Segoe UI",sans-serif;color:#1a2332;max-width:1100px;margin:24px auto;padding:0 16px}
    h1{font-size:19px;margin-bottom:2px} h2{font-size:15px;margin:18px 0 2px}
    .sub{color:#6b7686;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{border:1px solid #dfe4ec;padding:4px 8px;text-align:right;vertical-align:top}
    th:nth-child(2),td:nth-child(2){text-align:left}
    tr:first-child th{text-align:center;background:#eef2f8}
    tr.skup th{text-align:left;background:#f6f8fc;font-weight:700}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    @page{size:A4 landscape;margin:12mm} @media print{.noprint{display:none} body{margin:0;max-width:none}}</style></head><body>
    <div class="bar noprint"><button onclick="window.print()">🖨 ${esc(T('Tisk / Uložit jako PDF'))}</button></div>
    <h1>${esc(T('Detail položek'))}${ZAK.cislo ? ' – ' + esc(ZAK.cislo) : ''}</h1>
    <div class="sub">${esc(ZAK.nazevAkce || '')}${ZAK.objednatel ? ' · ' + esc(ZAK.objednatel) : ''} ·
      ${esc(T('řídící varianta'))}: ${esc(p.ridiciNazev)}</div>
    ${bloky || `<p class="sub">${esc(T('Varianta je položkově shodná s řídící variantou.'))}</p>`}
    <p class="sub">${esc(T('Rozdíl je počítán proti řídící variantě.'))} ${esc(T('Ceny jsou v Kč.'))}
       ${esc(T('Položky beze změny se neuvádějí.'))}</p>
    </body></html>`);
  w.document.close();
}

/* Tiskový pohled – popisky v jazyce dokumentů (Nastavení → jazyk) */
function porovnaniTisk() {
  const p = porovnaniData();
  const met = porovnaniMetriky(p);
  const vs = p.varianty;
  const L = jazyk();

  const hlavicka = vs.map(v =>
    `<th>${esc(v.nazev)}${v.ridici ? `<br><span class="tag">${esc(T('řídící varianta'))}</span>` : ''}</th>`
    + (v.ridici ? '' : `<th>${esc(T('rozdíl'))}</th>`)).join('');

  const telo = met.map(m => {
    const bunky = vs.map((v, i) => {
      const h = m.hodnoty[i];
      const r = m.rozdily[i];
      const rTxt = (m.bezRozdilu || r == null || Math.abs(r) < 0.5) ? '—'
        : (r > 0 ? '+' : '−') + fmt0(Math.abs(r)).replace('-', '');
      return `<td>${porovnaniHodnota(m, h)}</td>` + (v.ridici ? '' : `<td>${rTxt}</td>`);
    }).join('');
    return `<tr class="${m.hlavni ? 'hlavni' : ''}"><th>${esc(T(m.popis))}</th>${bunky}</tr>`;
  }).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="${L}"><head><meta charset="utf-8">
    <title>${esc(T('Porovnání variant'))} ${esc(ZAK.cislo || '')}</title>
    <style>body{font:13px/1.5 "Segoe UI",sans-serif;color:#1a2332;max-width:1000px;margin:24px auto;padding:0 16px}
    h1{font-size:19px;margin-bottom:2px} .sub{color:#6b7686;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #dfe4ec;padding:5px 9px;text-align:right;vertical-align:top}
    th:first-child{text-align:left;width:34%;font-weight:600;background:#f6f8fc}
    thead th,tr:first-child th{text-align:center;background:#eef2f8}
    tr.hlavni td,tr.hlavni th{font-weight:700;background:#f2f6ff}
    .tag{font-weight:400;font-size:11px;color:#1d4ed8}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    @page{size:A4 landscape;margin:12mm} @media print{.noprint{display:none} body{margin:0;max-width:none}}</style></head><body>
    <div class="bar noprint"><button onclick="window.print()">🖨 ${esc(T('Tisk / Uložit jako PDF'))}</button></div>
    <h1>${esc(T('Porovnání variant'))}${ZAK.cislo ? ' – ' + esc(ZAK.cislo) : ''}</h1>
    <div class="sub">${esc(ZAK.nazevAkce || '')}${ZAK.objednatel ? ' · ' + esc(ZAK.objednatel) : ''}</div>
    <table><tr><th></th>${hlavicka}</tr>${telo}</table>
    <p class="sub">${esc(T('Rozdíl je počítán proti řídící variantě.'))} ${esc(T('Ceny jsou v Kč.'))}</p>
    </body></html>`);
  w.document.close();
}

/* Náhled dat nabídky + kontrola vyplnění – vždy z OTEVŘENÉ varianty */
function nabidkaKarta() {
  const akt = aktivniVarianta(ZAK), rid = ridiciVarianta(ZAK);
  /* Prázdný ceník zhasíná tlačítka, která vyrábějí dokument pro zákazníka. */
  const zab = (typeof ukazkoveZabranaAttr === 'function') ? ukazkoveZabranaAttr() : '';
  let ph = null, chyba = '', priplNahled = 0;
  try { const nd = nabidkaData(ZAK, akt, JEKLY); ph = nd.placeholders; priplNahled = nd.priplatky.length; }
  catch (e) { chyba = e.message; }
  const pole = (nazev, hodnota, povinne) => {
    const prazdne = !hodnota || hodnota === '…';
    return `<tr><td style="font-weight:600">${nazev}</td>
      <td class="${prazdne && povinne ? 'neg' : ''}" style="text-align:left">${prazdne ? (povinne ? 'NEVYPLNĚNO – doplňte v kartě Zakázka výše' : '—') : esc(hodnota)}</td></tr>`;
  };
  const nahled = ph ? `<table style="max-width:640px">
      ${pole('Objednatel', ph.OBJEDNATEL, true)}
      ${pole('Kontaktní osoba', ph.OBJEDNATEL_KONTAKT, false)}
      ${pole('Datum', ph.DATUM, false)}
      ${pole('Název akce', ph.NAZEV_AKCE, true)}
      ${pole('Číslo nabídky', ph.CISLO_NABIDKY, true)}
      ${pole('Adresa stavby', ph.ADRESA, true)}
      ${pole('Cena bez DPH', ph.CENA_BEZ_DPH, false)}
      ${pole('DPH ' + ph.DPH_SAZBA + ' %', ph.DPH_KC, false)}
      ${pole('Celkem s DPH', ph.CENA_S_DPH, false)}
      ${pole('Příplatky do nabídky', priplNahled + ' položek (výběr sloupcem „Nabídka" v kalkulaci OCK)', false)}
    </table>` : `<div class="neg">Chyba výpočtu: ${esc(chyba)}</div>`;
  return `<div class="note">Nabídka se generuje z <b>otevřené varianty</b> („${esc(akt.nazev)}")${akt.id !== rid.id
      ? ` – pozor, řídící je „${esc(rid.nazev)}"; při generování dostanete na výběr` : ''} do šablony
    <b>Sablona_NABIDKA_CN.docx</b> (složka _CN). Vyplní se hlavička níže, kompletní technická specifikace
    (přesně jak je v záložce Technická specifikace OCK) a ceny z Kalkulace OCK. Popis záměru, platební
    podmínky, termíny a další příplatky doladíte ve Wordu; PDF: Soubor → Uložit jako → PDF.</div>
    <div class="note" style="font-weight:600;margin-top:8px">Co se vyplní do nabídky (živý náhled):</div>
    ${nahled}
    ${typeof kryciPodminkyBlok === 'function' ? kryciPodminkyBlok() : ''}
    ${nabidkaFotoKarta()}
    ${typeof kontrolyPanel === 'function' ? kontrolyPanel() : ''}
    ${typeof ukazkoveZabranaPanel === 'function' ? ukazkoveZabranaPanel() : ''}
    <div class="btns" style="margin-top:10px">
      <button class="primary"${zab} onclick="nabidkaOckDokument()">Kompletní náhled a tisk nabídky</button>
      <button${zab} onclick="nabidkaWord()">Vytvořit nabídku (Word)</button>
      <button onclick="nabidkaNahled()">Kompletní náhled podkladů</button>
    </div>
    <div class="note" style="margin-top:6px">Tlačítko <b>Kompletní náhled a tisk nabídky</b> otevře celou cenovou nabídku
      přímo v aplikaci – stejně jako u nabídky PROJ. V náhledu lze zaškrtnout <b>✏️ Upravit text před tiskem</b> a nabídku
      ručně doladit ještě před uložením do PDF; <b>↺ Vrátit původní znění</b> vrátí text vygenerovaný z kalkulace.
      Ruční úpravy platí <b>jen pro daný výtisk</b> – do zakázky ani do kalkulace se nepropisují. Cesta přes Word
      i náhled podkladů zůstávají beze změny.</div>
    <div class="note nabidkaStav">${SABLONA_DOCX ? 'Šablona načtena (' + esc(SABLONA_DOCX.nazev) + ').' : 'Při prvním použití budete vyzváni k výběru souboru šablony ze složky _CN.'}</div>`;
}

/* Stavový řádek nabídky OCK je v aplikaci dvakrát (Kalkulace OCK i Přehled
 * cenových nabídek). Kdyby zůstal na id, hlášky o průběhu generování by
 * doputovaly jen do první kopie – proto se nastavují přes třídu na všech. */
function nabidkaStavText(txt) { document.querySelectorAll('.nabidkaStav').forEach(e => { e.textContent = txt; }); }
function nabidkaStavHtml(html) { document.querySelectorAll('.nabidkaStav').forEach(e => { e.innerHTML = html; }); }

/* Varianta pro generování: otevřená; liší-li se od řídící, dá na výběr */
function nabidkaVarianta() {
  const akt = aktivniVarianta(ZAK), rid = ridiciVarianta(ZAK);
  if (akt.id === rid.id) return akt;
  return confirm(`Otevřená varianta „${akt.nazev}" není řídící (řídící je „${rid.nazev}").\n\n`
    + `OK = generovat z OTEVŘENÉ varianty (přesně to, co teď vidíte v záložkách)\n`
    + `Zrušit = generovat z ŘÍDÍCÍ varianty „${rid.nazev}"`) ? akt : rid;
}

/* ---------- generování nabídky do Wordu (lokálně, bez Apps Script) ---------- */
let SABLONA_DOCX = null;   // {nazev, data:ArrayBuffer} – drží se jen po dobu otevřené aplikace

function nabidkaWord() {
  /* Odkud vzít šablonu, rozhoduje sablonaProTisk (#139): přednost má platná
   * šablona ze serveru; místní cesta (Nastavení / výběr souboru) zůstává jen
   * pro měkký režim a pro práci bez serveru. Přísný režim tady může skončit
   * odmítnutím — česká věta z něj jde rovnou do stavového řádku. */
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  sablonaProTisk('nabidka', L).then(srv => {
    if (srv) { nabidkaWordGeneruj(srv); return; }
    // místní cesta – přednost má šablona nahraná v Nastavení → Šablony (SET-6)
    if (typeof SABLONY !== 'undefined' && SABLONY.nabidka) SABLONA_DOCX = SABLONY.nabidka;
    if (SABLONA_DOCX) { nabidkaWordGeneruj(null); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.docx';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.arrayBuffer().then(buf => {
        SABLONA_DOCX = { nazev: f.name, data: buf };
        if (typeof SABLONY !== 'undefined') SABLONY.nabidka = SABLONA_DOCX;   // zapamatuj pro další generování
        nabidkaWordGeneruj(null);
      });
    };
    inp.click();
  }).catch(err => nabidkaStavText('Chyba: ' + err.message));
}

function nabidkaWordGeneruj(srv) {
  // jazyk dokumentu (N1) – hodnoty se dosazují v něm; pevný text jen tehdy,
  // existuje-li jazyková mutace šablony (na serveru, nebo v Nastavení → Šablony)
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  const mutace = (!srv && L !== 'cz' && typeof SABLONY !== 'undefined') ? SABLONY['nabidka_' + L] : null;
  const sablona = srv ? srv.data : (mutace ? mutace.data : SABLONA_DOCX.data);
  const mutaceChybi = srv ? srv.mutaceChybi : (L !== 'cz' && !mutace);
  /* Razítko šablony do zámku varianty (#139): u serverové verze číslo
   * a otisk, u místní jméno souboru — dohledatelné v obou případech. */
  const sablonaInfo = srv
    ? { zdroj: 'server', typ: srv.typ, verze: srv.verze, otisk: srv.otisk, nazev: srv.nazev }
    : { zdroj: 'mistni', nazev: (mutace || SABLONA_DOCX).nazev || '' };
  nabidkaStavText('Vyplňuji šablonu…' + (L !== 'cz' ? ' (' + L.toUpperCase() + ')' : '')
    + (srv ? ' [serverová verze ' + srv.verze + ']' : ''));
  // varianta se určuje jednou dopředu – potřebujeme ji i pro zámek (#34)
  const varianta = nabidkaVarianta();
  // jednotný registr dokumentů (dokumenty.js) – stejná cesta jako krycí list apod.
  dokumentVygeneruj('nabidka', sablona.slice(0), ZAK, varianta, JEKLY, L)
    .then(res => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.blob);
      a.download = res.nazevSouboru + '.docx';
      a.click();
      // stažený .docx je hotová nabídka pro zákazníka → varianta se uzamyká
      let zamcenoText = '';
      if (typeof zamekPoTisku === 'function') {
        const z = zamekPoTisku('nabidka', varianta.id, sablonaInfo);
        if (z) zamcenoText = ' Varianta ' + (z.cislo || '') + ' je nyní uzamčená jako odeslaná nabídka; '
          + 'pokračujte jejím klonem.';
      }
      nabidkaStavText('Hotovo – soubor ' + res.nazevSouboru + '.docx je ve Stažených. '
        + 'Uložte jej do složky _CN, doupravte ve Wordu a vytiskněte do PDF.'
        + (srv ? ' Použita centrální šablona (verze ' + srv.verze + ').'
               : (sablonyOnlineAktivni() ? ' POZOR: použita MÍSTNÍ šablona (měkký režim) – do zámku se to zapsalo.' : ''))
        + (mutaceChybi ? ' Pozor: pevný text šablony zůstal český – jazykovou mutaci šablony '
          + 'vyrobíte v Nastavení → Šablony.' : '')
        + zamcenoText);
    })
    .catch(err => {
      SABLONA_DOCX = null;
      nabidkaStavText('Chyba: ' + err.message);
    });
}

/* Cesta přes Apps Script (tlačítko „Google Docs" a jeho obsluha) byla
 * odstraněna 2. 8. 2026 na pokyn uživatele – nabídky se generují výhradně
 * lokálně (Word / tiskový náhled). Byla to jediná cesta k dokumentu bez
 * zábrany ukázkového ceníku (audit, N9); teď žádná taková výjimka není. */

/* Kompletní tiskový náhled cenové nabídky.
 * N1 – tiskne se ve zvoleném jazyce dokumentů (cz / en / de / fr): hodnoty
 * překládá nabidkaData, popisky a nadpisy nabidkaNahledSekce + P() níže.
 * Neznámý výraz zůstává česky (slovník, preklad.js) – nic se nevymýšlí. */
function nabidkaNahled() {
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  const P = t => (L !== 'cz' && typeof tr === 'function') ? tr(t, L) : t;
  const data = nabidkaData(ZAK, nabidkaVarianta(), JEKLY, L);
  const p = data.placeholders;
  const radek = (l, v) => `<tr><td style="font-weight:600">${esc(l)}</td><td>${esc(v)}</td></tr>`;
  const sekceHtml = nabidkaNahledSekce(p, L).map(s =>
    `<h2>${esc(s.sekce)}</h2><table>${s.radky.map(r => radek(r[0], r[1])).join('')}</table>`).join('');
  const nadpisPripl = `<h2>${esc('II. ' + P('ROZŠÍŘENÍ CENOVÉ NABÍDKY – PŘÍPLATKY'))}</h2>`;
  const priplatkyHtml = data.priplatky.length
    ? `${nadpisPripl}<table>${data.priplatky.map(pr =>
        `<tr><td style="font-weight:600">${esc(pr.nazev)}<br><span style="font-weight:400;color:#6b7686">${esc(pr.popis)}</span></td>
         <td>${esc(pr.cena)} ${esc(P('bez DPH'))}</td></tr>`).join('')}</table>`
    : `${nadpisPripl}<p>${esc(P('žádné příplatky nejsou vybrány'))}</p>`;

  // hlavička s logem a patička s firemními údaji (SET-3) – společné pro obě nabídky
  const logoHtml = dokLogoHtml();
  const patickaHtml = dokPatickaHtml(P);

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="${L === 'cz' ? 'cs' : L}"><head><meta charset="utf-8">
    <title>${esc(data.nazevSouboru)}</title>
    <style>body{font:13px/1.5 "Segoe UI",sans-serif;color:#1a2332;max-width:860px;margin:24px auto;padding:0 16px}
    h1{font-size:19px} h2{font-size:13px;background:#eef2f8;padding:6px 10px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.03em}
    table{width:100%;border-collapse:collapse} td{border-bottom:1px solid #eee;padding:4px 8px;vertical-align:top}
    td:first-child{width:46%}
    ${dokHlavickaCss()}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    @page{size:A4;margin:14mm} @media print{.noprint{display:none} body{margin:0}}</style></head><body>
    <div class="bar noprint"><button onclick="window.print()">🖨 ${esc(P('Tisk / Uložit jako PDF'))}</button></div>
    ${logoHtml}
    <h1>${esc(P('Podklady nabídky'))} ${esc(p.CISLO_NABIDKY)}</h1>
    <p class="noprint">${esc(P('Přesně tyto hodnoty se vyplní do šablony nabídky. Tlačítkem výše vytisknete do PDF.'))}</p>
    ${sekceHtml}
    ${priplatkyHtml}
    ${patickaHtml}
    </body></html>`);
  w.document.close();
}

/* ============================================================================
 * ÚVODNÍ FOTKA CENOVÉ NABÍDKY (OCK i PROJ)
 *
 * Fotka objektu (nebo vizualizace) na úvod nabídky. Ukládá se jako data URL
 * přímo do zakázky, takže se přenese spolu se souborem zakázky a nabídka jde
 * vytisknout i na jiném počítači.
 *
 * Od 12. 8. 2026 má KAŽDÁ z obou nabídek vlastní fotku (`cast` = 'ock' /
 * 'proj', pole drží zakazka.js → uvodniFotoPole). Důvod je stejný jako
 * u hlaviček: nabídka na šachtu a nabídka na projekci odcházejí samostatně
 * a projekce se často prodává bez šachty. Jedno sdílené pole by znamenalo,
 * že výměna fotky v jedné nabídce potichu změní titulní stranu druhé —
 * a všimne si toho až zákazník. Přenést fotku mezi částmi jde tlačítkem.
 * ============================================================================ */
function nabidkaFotoPole(cast) {
  return (typeof uvodniFotoPole === 'function')
    ? uvodniFotoPole(cast)
    : { foto: 'uvodniFoto', nazev: 'uvodniFotoNazev', popis: 'uvodniFotoPopis' };
}
const NABIDKA_FOTO_NAZVY = { ock: 'OCK', proj: 'PROJ' };

function nabidkaFotoNahraj(cast) {
  const p = nabidkaFotoPole(cast);
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) return alert('Fotka je příliš velká (' + Math.round(f.size / 1024)
      + ' kB). Použijte obrázek do 2 MB – ukládá se přímo do souboru zakázky.');
    const fr = new FileReader();
    fr.onload = () => {
      ZAK[p.foto] = fr.result; ZAK[p.nazev] = f.name;
      render();
    };
    fr.readAsDataURL(f);
  };
  inp.click();
}
function nabidkaFotoSmaz(cast) {
  const p = nabidkaFotoPole(cast);
  if (!confirm('Odebrat úvodní fotku z cenové nabídky ' + (NABIDKA_FOTO_NAZVY[cast] || 'OCK') + '?')) return;
  ZAK[p.foto] = ''; ZAK[p.nazev] = '';
  render();
}
/* Přenos fotky mezi nabídkami – vědomý, na tlačítko, jako u hlaviček.
 * Přepisuje se cíl, zdroj zůstává; obě nabídky tak můžou mít i nadále
 * každá svou. */
function nabidkaFotoPrevezmi(cast) {
  const cil = nabidkaFotoPole(cast);
  const zdroj = nabidkaFotoPole(cast === 'proj' ? 'ock' : 'proj');
  if (!ZAK[zdroj.foto]) return alert('Druhá nabídka žádnou úvodní fotku nahranou nemá.');
  if (ZAK[cil.foto] && !confirm('Nahradit fotku této nabídky fotkou z druhé nabídky?')) return;
  ZAK[cil.foto] = ZAK[zdroj.foto];
  ZAK[cil.nazev] = ZAK[zdroj.nazev];
  ZAK[cil.popis] = ZAK[zdroj.popis];
  render();
}
/* popisek pod fotkou – bez překreslení, aby při psaní neutíkal kurzor */
function nabidkaFotoPopis(val, cast) { ZAK[nabidkaFotoPole(cast).popis] = val; }

/* Fotka do tiskového dokumentu (prázdné, není-li nahraná). */
function nabidkaFotoHtml(cast) {
  const p = nabidkaFotoPole(cast);
  if (!ZAK[p.foto]) return '';
  const popis = (ZAK[p.popis] || '').trim();
  return `<figure class="uvod-foto"><img src="${esc(ZAK[p.foto])}" alt="">`
    + (popis ? `<figcaption>${esc(popis)}</figcaption>` : '') + `</figure>`;
}

/* Ovládání úvodní fotky v kartě nabídky (Kalkulace OCK / Kalkulace PROJ). */
function nabidkaFotoKarta(cast) {
  const c = cast === 'proj' ? 'proj' : 'ock';
  const p = nabidkaFotoPole(c);
  const arg = `'${c}'`;
  const druha = nabidkaFotoPole(c === 'proj' ? 'ock' : 'proj');
  const druhaNazev = c === 'proj' ? 'OCK' : 'PROJ';
  const nahled = ZAK[p.foto]
    ? `<img src="${esc(ZAK[p.foto])}" alt="úvodní fotka"
         style="max-height:120px;max-width:260px;border:1px solid var(--line);border-radius:6px;padding:3px">`
    : '<span class="note">Fotka zatím nenahraná – nabídka se vytiskne bez ní.</span>';
  return `<div class="note" style="font-weight:600;margin-top:10px">Úvodní fotka nabídky
      ${NABIDKA_FOTO_NAZVY[c]}:</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px">
      ${nahled}
      <div class="btns"><button onclick="nabidkaFotoNahraj(${arg})">${ZAK[p.foto] ? 'Vyměnit fotku' : 'Nahrát fotku'}</button>
        ${ZAK[p.foto] ? `<button class="mini" onclick="nabidkaFotoSmaz(${arg})">Odebrat</button>` : ''}
        ${ZAK[druha.foto] ? `<button class="mini" onclick="nabidkaFotoPrevezmi(${arg})">⇦ Převzít fotku z nabídky ${druhaNazev}</button>` : ''}</div>
      ${ZAK[p.nazev] ? `<span class="note">${esc(ZAK[p.nazev])}</span>` : ''}
    </div>
    <input type="text" style="width:100%;margin-top:6px;text-align:left" placeholder="Popisek pod fotkou (nepovinné) – např. Bytový dům Dlouhá 12, stávající stav"
      value="${esc(ZAK[p.popis] || '')}" oninput="nabidkaFotoPopis(this.value, ${arg})">
    <div class="note" style="margin-top:4px">JPG / PNG / WEBP do 2 MB. Ukládá se přímo do souboru zakázky,
      takže se přenese i na jiný počítač. Tiskne se hned pod hlavičkou nabídky.
      Nabídka ${NABIDKA_FOTO_NAZVY[c]} má <b>vlastní</b> fotku – nabídka ${druhaNazev} tím zůstává nedotčená.</div>`;
}

/* ============================================================================
 * CENOVÁ NABÍDKA OCK – kompletní dokument k tisku a ruční úpravě
 *
 * Totéž, co umí nabídka PROJ: celý dokument v aplikaci, lišta „✏️ Upravit text
 * před tiskem" nad obsahem v <div id="dok"> a tisk do PDF. Word (šablona
 * Sablona_NABIDKA_CN.docx) i „Kompletní náhled podkladů" zůstávají beze změny
 * jako druhá cesta – nic se neodebralo.
 * ============================================================================ */
function nabidkaOckDokument() {
  /* Pojistka pro případ, že by se sem někdo dostal jinudy než tlačítkem
   * (zhasnutým) – tiskový náhled je dokument pro zákazníka jako každý jiný. */
  if (typeof dokumentZabrana === 'function') {
    const duvod = dokumentZabrana();
    if (duvod) { alert(duvod); return; }
  }
  const L = (typeof jazyk === 'function') ? jazyk() : 'cz';
  const P = t => (L !== 'cz' && typeof tr === 'function') ? tr(t, L) : t;
  const varianta = nabidkaVarianta();   // drží se kvůli zámku (#34)
  const data = nabidkaData(ZAK, varianta, JEKLY, L);
  const p = data.placeholders;

  /* sekce z nabidka.js: [0] hlavička (tiskne se jako tabulka nahoře),
   * pak technická část, obchodní část (rozepsaná níže vlastní tabulkou)
   * a nakonec nepovinný Dodavatel. */
  const vse = nabidkaNahledSekce(p, L);
  let iObchod = vse.findIndex(s => s.radky.some(r => r[1] === p.CENA_S_DPH));
  if (iObchod < 0) iObchod = vse.length - 1;
  const radek = (l, v) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`;
  const sekceHtml = vse.slice(1, iObchod).map(s =>
    `<h2>${esc(s.sekce)}</h2><table>${s.radky.map(r => radek(r[0], r[1])).join('')}</table>`).join('');
  const dodavatelHtml = vse.slice(iObchod + 1).map(s =>
    `<h2>${esc(s.sekce)}</h2><table>${s.radky.map(r => radek(r[0], r[1])).join('')}</table>`).join('');

  /* obchodní část – cena, případná schválená sleva, DPH, celkem */
  const slevaRadky = (p.SLEVA_PROC && p.SLEVA_PROC !== '0')
    ? `<tr><td>${esc(P('Cena před slevou'))}</td><td class="castka">${esc(p.CENA_PRED_SLEVOU)}</td></tr>
       <tr><td>${esc(P('Sleva'))} ${esc(p.SLEVA_PROC)} %</td><td class="castka">− ${esc(p.SLEVA_KC)}</td></tr>` : '';
  /* Řádek „obchodní zaokrouhlení" v nabídce od 12. 8. 2026 NENÍ (#135):
   * zaokrouhlují se rovnou položky, takže součet vychází sám. Zákazník čte
   * položky, ne naše zaokrouhlovací pravidlo. */
  const cenaHtml = `<table class="rekap">
      ${slevaRadky}
      <tr class="tot"><td><b>${esc(P('Výtahová šachta (bez DPH)'))}</b></td><td class="castka"><b>${esc(p.CENA_BEZ_DPH)}</b></td></tr>
      <tr><td>${esc(P('DPH'))} ${esc(p.DPH_SAZBA)} % (${esc(p.DPH_NAZEV)} ${esc(P('sazba'))})</td><td class="castka">${esc(p.DPH_KC)}</td></tr>
      <tr class="tot"><td><b>${esc(P('CELKEM za nabídku (včetně DPH)'))}</b></td><td class="castka"><b>${esc(p.CENA_S_DPH)}</b></td></tr>
    </table>`;

  const nadpisPripl = `<h2>${esc('II. ' + P('ROZŠÍŘENÍ CENOVÉ NABÍDKY – PŘÍPLATKY'))}</h2>`;
  const priplatkyHtml = data.priplatky.length
    ? `${nadpisPripl}<table>${data.priplatky.map(pr =>
        `<tr><td><b>${esc(pr.nazev)}</b><br><span class="popis">${esc(pr.popis)}</span></td>
         <td class="castka">${esc(pr.cena)}<br><span class="popis">${esc(P('bez DPH'))}</span></td></tr>`).join('')}</table>`
    : `${nadpisPripl}<p class="popis">${esc(P('žádné příplatky nejsou vybrány'))}</p>`;

  // logo a patička – shodné pro nabídku OCK i PROJ (common.js), vždy uvedeny
  const logoHtml = dokLogoHtml();
  const patickaHtml = dokPatickaHtml(P);

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="${L === 'cz' ? 'cs' : L}"><head><meta charset="utf-8">
    <title>${esc(data.nazevSouboru)}</title>
    <style>body{font:13px/1.55 "Segoe UI",sans-serif;color:#1a2332;max-width:860px;margin:24px auto;padding:0 16px}
    h1{font-size:20px;margin:6px 0} h1.sekce{font-size:15px;background:#1d4ed8;color:#fff;padding:7px 10px;margin:26px 0 10px;
      text-transform:uppercase;letter-spacing:.04em;page-break-after:avoid}
    h2{font-size:13px;background:#eef2f8;padding:6px 10px;margin:20px 0 6px;text-transform:uppercase;
      letter-spacing:.03em;page-break-after:avoid}
    p{margin:6px 0;text-align:justify}
    table{width:100%;border-collapse:collapse;margin:6px 0;page-break-inside:avoid}
    td{border-bottom:1px solid #eef1f6;padding:4px 8px;vertical-align:top}
    td:first-child{width:46%}
    .castka{text-align:right;font-weight:700;white-space:nowrap}
    .popis{font-weight:400;font-size:11px;color:#6b7686}
    table.rekap td{border-bottom:1px solid #dfe4ec} table.rekap tr.tot td{background:#f2f6ff}
    .hlav td{border-bottom:0;padding:2px 8px}
    figure.uvod-foto{margin:14px 0 18px;text-align:center;page-break-inside:avoid}
    figure.uvod-foto img{max-width:100%;max-height:320px;border-radius:6px}
    figure.uvod-foto figcaption{font-size:11px;color:#6b7686;margin-top:5px}
    .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e9f0;padding:8px 0;margin-bottom:8px;z-index:5}
    .bar button{font:13px "Segoe UI";padding:6px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer}
    ${dokHlavickaCss()}
    ${tiskListaCss()}
    @page{size:A4;margin:14mm} @media print{.noprint{display:none} body{margin:0}}</style></head><body>
    ${tiskListaHtml({
      tisk: P('Tisk / Uložit jako PDF'),
      upravy: P('Upravit text před tiskem'),
      vratit: P('Vrátit původní znění'),
      pozn: P('Nabídku lze před uložením do PDF ručně upravit; do kalkulace se změny nepropíšou.'),
      zamekTyp: 'nabidkaTisk',
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
    ${nabidkaFotoHtml()}
    <h1 class="sekce">${esc('I. ' + P('TECHNICKÁ ČÁST – SPECIFIKACE DODÁVKY'))}</h1>
    ${sekceHtml}
    <h1 class="sekce">${esc(P('B. OBCHODNÍ ČÁST – CENOVÁ NABÍDKA'))}</h1>
    ${cenaHtml}
    ${priplatkyHtml}
    ${dodavatelHtml}
    ${patickaHtml}
    </div>
    ${tiskListaSkript({
      zap: P('Úpravy zapnuté – klikněte do dokumentu a pište. Změny platí jen pro tento výtisk.'),
      vyp: P('Úpravy vypnuté. Ruční změny zůstávají, jen se do dokumentu už nedá psát.'),
      vraceno: P('Vráceno původní znění z kalkulace.'),
      zamceno: P('Varianta byla uzamčena jako odeslaná nabídka. Další úpravy provádějte v jejím klonu.'),
    }, { typ: 'nabidkaTisk', varId: varianta.id })}
    </body></html>`);
  w.document.close();
}
