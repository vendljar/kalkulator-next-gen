/* ================= NASTAVENÍ (ozubené kolo, jen administrátor) =================
 * Modální panel s vnitřními záložkami:
 *   Obecné      – role/přístup, viditelnost záložek, zobrazení nákladů, přístupová práva.
 *   Uživatelé   – příprava správy účtů (zatím náhled, bez přihlášení – viz SET-1).
 *   Slevy       – návrh slevových schémat, stropy dle role, schvalování (viz ZAK-10).
 *   Šablony     – nahrané .docx šablony + jejich jazykové mutace (N1).
 *   Konfigurace – export/import konfigurace.json (N3 / SET-2), jen administrátor.
 * Vše je zatím v rámci relace (NAST v common.js); konfigurace.json je most, než
 * bude skutečné úložiště. */

function otevriNastaveni() { renderNastaveni(); document.getElementById('nastaveni-overlay').style.display = 'flex'; }
function zavriNastaveni() { document.getElementById('nastaveni-overlay').style.display = 'none'; }
function nastOtevreno() { const o = document.getElementById('nastaveni-overlay'); return o && o.style.display !== 'none'; }
function nastRefresh() {
  // změna v Nastavení = důvod zapsat do složky (se zpožděním, viz ui/nastaveni_db_ui.js)
  if (typeof nastdbZmeneno === 'function') nastdbZmeneno();
  render(); if (nastOtevreno()) renderNastaveni();
}
/* Vnitřní záložky Nastavení (#136). Do 5. 8. 2026 se skládaly ručně přímo
 * v renderNastaveni() a dvě z nich (Firma, Konfigurace, Slovník) měly kolem
 * sebe `jeAdmin() ? … : ''`. Od zavedení matice zobrazení se každá záložka
 * ptá na svůj klíč, takže se dá vedoucímu přidělit třeba Slovník bez toho,
 * aby dostal zbytek administrátorských funkcí. Seznam je tu jako data,
 * protože ho potřebují dvě místa (proužek záložek i výběr těla panelu)
 * a rozejít se nesmí — jinak by šlo otevřít panel, ke kterému není tlačítko.
 *
 * Záložky bez klíče (Obecné) vidí každý, kdo se do Nastavení dostal. */
const NAST_PANELY = [
  { id: 'obecne', nazev: 'Obecné', telo: () => nastObecne() },
  { id: 'firma', nazev: 'Firma', klic: 'nastaveni.firma', telo: () => nastFirma() },
  { id: 'uzivatele', nazev: 'Uživatelé', klic: 'nastaveni.uzivatele', telo: () => nastUzivatele() },
  { id: 'slevy', nazev: 'Slevy', klic: 'nastaveni.slevy', telo: () => nastSlevy() },
  { id: 'sablony', nazev: 'Šablony', klic: 'nastaveni.sablony', telo: () => nastSablony() },
  { id: 'zobrazeni', nazev: 'Zobrazení', klic: 'nastaveni.zobrazeni', telo: () => nastZobrazeni() },
  { id: 'konfigurace', nazev: 'Konfigurace', klic: 'nastaveni.konfigurace', telo: () => nastKonfigurace() },
  { id: 'slovnik', nazev: 'Slovník', klic: 'nastaveni.slovnik', telo: () => nastSlovnik() },
  /* Analytika (#25+#26+#27) je JEN pro administrátora — natvrdo, ne přes
   * matici zobrazení: časy zakázek a čísla provozu se nepřidělují (rozhodnutí
   * 17. 8. 2026), takže by řádek v matici jen sváděl k omylu. */
  { id: 'analytika', nazev: 'Analytika', jenAdmin: true, telo: () => nastAnalytika() },
];
function nastPanelSmi(x) {
  if (x.jenAdmin && !(typeof jeAdmin === 'function' && jeAdmin())) return false;
  return !x.klic || typeof smiZobrazit !== 'function' || smiZobrazit(x.klic);
}
function nastPanelyViditelne() { return NAST_PANELY.filter(nastPanelSmi); }
/* Vybraný panel se dohledává přes „smí ho vidět" — kdyby v NAST.panel zůstal
 * z dřívějška panel, na který uživatel po změně matice nárok nemá (nebo se
 * funkce zavolala z konzole), spadne to zpátky na Obecné, ne na prázdno. */
function nastPanelAktivni() {
  const p = NAST.panel || 'obecne';
  return nastPanelyViditelne().find(x => x.id === p) || NAST_PANELY[0];
}
function nastPanel(p) { NAST.panel = p; renderNastaveni(); }

/* Přepínač rolí je z doby před přihlašováním – byl to náhled pro toho,
 * kdo si soubor otevřel na svém disku. Od chvíle, kdy role chodí ze
 * serveru, se přes něj nesmí zapnout pohled administrátora nikomu, komu
 * ho server nepřiznal: skryté záložky Ceník OCK a Ceník projekce se
 * schovávají právě podle `NAST.jeAdmin` a data v prohlížeči už jsou.
 * Skrýt tlačítko nestačí, funkce jde zavolat i z konzole. */
function nastSetAdmin(v) {
  if (v && typeof smiPohledAdmina === 'function' && !smiPohledAdmina()) {
    alert('Pohled administrátora má jen účet s rolí Administrátor. '
      + 'Potřebujete-li vidět ceník, požádejte administrátora.');
    return;
  }
  NAST.jeAdmin = !!v; nastRefresh();
}
function nastToggleTab(t, v) { NAST.tabViditelnost[t] = !!v; nastRefresh(); }
function nastSetNaklady(v) { NAST.zobrazitNaklady = !!v; nastRefresh(); }

/* ---- Uživatelé ---- */
function uzAdd() { NAST.uzivatele.push({ jmeno: 'Nový uživatel', email: '', role: NAST.role[0], aktivni: true }); nastRefresh(); }
function uzDel(i) { NAST.uzivatele.splice(i, 1); nastRefresh(); }
function uzSet(i, k, v) { NAST.uzivatele[i][k] = v; nastRefresh(); }

/* ---- Firemní údaje (SET-3) – jen administrátor ---- */
function firmaSet(id, v) {
  if (!jeAdmin()) return;
  if (!NAST.firma) NAST.firma = firmaDefault();
  NAST.firma[id] = v;
  /* #40 – kdo si údaje přepsal ručně, už nepracuje se vzorkem. Značku
   * ukázkových dat sundáváme při první změně, ne až po vyplnění všech
   * polí: rozdělaná pravda je pořád pravda, jen neúplná. */
  if (typeof ukazkoveOcisti === 'function') ukazkoveOcisti(NAST.firma);
  nastRefresh();
}
function firmaLogoNahraj() {
  if (!jeAdmin()) return alert('Firemní údaje smí měnit jen administrátor.');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/svg+xml';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (f.size > 400 * 1024) return alert('Logo je příliš velké (' + Math.round(f.size / 1024)
      + ' kB). Použijte obrázek do 400 kB – ukládá se přímo do konfigurace.');
    const fr = new FileReader();
    fr.onload = () => { NAST.firma.logo = fr.result; NAST.firma.logoNazev = f.name; nastRefresh(); };
    fr.readAsDataURL(f);
  };
  inp.click();
}
function firmaLogoSmaz() { if (!jeAdmin()) return; NAST.firma.logo = ''; NAST.firma.logoNazev = ''; nastRefresh(); }
function firmaObnovVychozi() {
  if (!jeAdmin()) return alert('Firemní údaje smí měnit jen administrátor.');
  if (!confirm('Vrátit firemní údaje na výchozí hodnoty? Ruční změny se ztratí.')) return;
  konfigNahradVMiste(NAST.firma, firmaDefault());
  /* Vzorek nese značku ukázkových dat, a onlineTik má nasazovat online firmu
   * právě podle ní – bez tohohle řádku by se do vteřiny vrátila zpátky a
   * tlačítko by vypadalo rozbitě. Vědomé vrácení vzorku má přednost;
   * online verze se nasadí zas až po novém přihlášení nebo „Načíst online
   * znovu". (4. 8. 2026) */
  if (typeof ONLINE_STAV !== 'undefined') ONLINE_STAV.firmaPouzita = true;
  nastRefresh();
}

/* ---- Slevy ---- */
function slMinMarze(v) { NAST.slevy.minMarze = (+v) / 100; nastRefresh(); }
function slMaxGlobalni(v) { NAST.slevy.maxGlobalni = Math.max(0, (+v) / 100); nastRefresh(); }
function slStrop(role, v) { NAST.slevy.stropy[role] = (+v) / 100; nastRefresh(); }
function slSchemaAdd() { NAST.slevy.schemata.push({ nazev: 'Nové schéma', typ: 'percentage', popis: '' }); nastRefresh(); }
function slSchemaDel(i) { NAST.slevy.schemata.splice(i, 1); nastRefresh(); }
function slSchemaSet(i, k, v) { NAST.slevy.schemata[i][k] = v; nastRefresh(); }

const NAST_TAB_LABELS = {
  detail: 'Detail výpočtu', spec: 'Technická specifikace OCK', specdata: 'Technická specifikace OCK Data',
  kryci: 'Krycí list zakázky OCK',
  proj: 'Kalkulace PROJ', detailproj: 'Detail výpočtu PROJ', kryciproj: 'Krycí list zakázky PROJ',
  cenik: 'Ceník nákladů OCK', cenikproj: 'Ceník nákladů PROJ', zakazka: 'Přehled cenových nabídek',
  schvalovani: 'Schvalování slev',
};

/* ---------- sazba přirážky za ATYP (#22) ----------
 * Sazba je součástí ceníku (C.atypPrirazka), takže cestuje se zakázkou – dvě
 * starší zakázky se stejným zaškrtnutým ATYP se tedy nepřepočítají zpětně, když
 * firma sazbu změní. Měnit ji smí jen administrátor, stejně jako ostatní ceny. */
function atypSazbaProc() {
  const s = (C && C.atypPrirazka != null) ? +C.atypPrirazka : 0.30;
  return Math.round(s * 1000) / 10;
}
function nastSetAtyp(v) {
  if (!jeAdmin()) return alert('Sazbu přirážky za ATYP smí měnit jen administrátor.');
  let proc = parseFloat(String(v).replace(',', '.'));
  if (!isFinite(proc) || proc < 0) proc = 0;
  if (proc > 300) proc = 300;          // pojistka proti překlepu (3000 místo 30)
  C.atypPrirazka = proc / 100;
  nastRefresh();
}

/* ---------- vnitřní záložka: Obecné ---------- */
function nastObecne() {
  const chk = (checked, on) => `<input type="checkbox" ${checked ? 'checked' : ''} onchange="${on}">`;
  const tabRows = Object.keys(NAST_TAB_LABELS).map(t => {
    const skrytoRoli = !NAST.jeAdmin && (t === 'cenik' || t === 'cenikproj' || t === 'detail' || t === 'specdata');
    return `<label style="display:flex;align-items:center;gap:8px;margin:5px 0">
      ${chk(NAST.tabViditelnost[t], `nastToggleTab('${t}', this.checked)`)} ${NAST_TAB_LABELS[t]}
      ${skrytoRoli ? '<span class="pill mut" style="font-size:10px">skryto rolí</span>' : ''}</label>`;
  }).join('');

  const adminFeatures = [
    'Ceník nákladů OCK a Ceník nákladů PROJ (celé záložky)',
    'Editace jednotkových cen přímo v kalkulaci (obousměrně s ceníkem)',
    'Globální přirážka a sloupce <b>Náklad</b> / <b>Přirážka</b>',
    'Režim výpočtu (Model 2 – opravený / Model 1 – 1:1 jako Excel)',
    'Rezervy a záložka <b>Detail výpočtu</b>',
    'Záložka <b>Technická specifikace OCK Data</b> (editace číselníků a výchozích hodnot)',
    '<b>Import / Export dat</b> – ceník do/z Excelu, export dat specifikace (jen administrátor)',
    '<b>Slevy</b> – zadání slevy, schvalování nad rámec stropu role (viz záložka Slevy)',
    '<b>Úložiště šablon dokumentů</b> (Nastavení → Šablony)',
    '<b>Firemní údaje pro dokumenty</b> (Nastavení → Firma) – IČO, DIČ, sídlo, banka, logo; propisují se do nabídky i krycího listu',
    'Toto <b>Nastavení</b> (ozubené kolo) včetně záložek Firma, Uživatelé, Slevy a Šablony',
  ];
  const navrhy = [
        '<b>Číselné řady CN</b> – automatické číslování nové zakázky (2026-OPR-CN-xxxx).',
    '<b>Výchozí hodnoty</b> – DPH, globální přirážka, splatnost, záruka, platební milníky.',
    '<b>Rozvržení</b> – pořadí a přejmenování záložek, výchozí otevřená záložka.',
    '<b>Vzhled</b> – světlý/tmavý motiv, firemní barvy, jazyk.',
    '<b>Zálohy / export</b> – hromadný export všech zakázek, napojení na databázi (rosti.cz / Pipedrive).',
  ];

  return `
    ${typeof nastdbBlok === 'function' ? nastdbBlok() : ''}
    <div class="sec-title">Role a přístup</div>
    <div class="kl-radio">
      <label><input type="radio" name="nastRole" ${NAST.jeAdmin ? 'checked' : ''} onchange="nastSetAdmin(true)"> Administrátor</label>
      <label><input type="radio" name="nastRole" ${!NAST.jeAdmin ? 'checked' : ''} onchange="nastSetAdmin(false)"> Běžný uživatel (náhled)</label>
    </div>
    <div class="note">Role chodí z přihlášení (záložka <b>Uživatelé</b>); tenhle přepínač je jen náhled pro administrátora.
      Co přesně „běžný uživatel" uvidí, se od 5. 8. 2026 nastavuje po jednotlivých prvcích v záložce
      <b>Zobrazení</b> — dokud tam nic nezměníte, platí dosavadní stav: skryté ceníky, detail výpočtu,
      data specifikace a sloupce Náklad/Přirážka. Náhled konkrétní role (obchodník / vedoucí) je také tam.</div>

    <div class="sec-title">Viditelnost záložek</div>
    ${tabRows}

    <div class="sec-title">Zobrazení kalkulace (admin)</div>
    <label style="display:flex;align-items:center;gap:8px">${chk(NAST.zobrazitNaklady, 'nastSetNaklady(this.checked)')} Zobrazovat sloupce <b>Náklad</b> a <b>Přirážka</b> v kalkulaci</label>

    <div class="sec-title">Parametry výpočtu</div>
    <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span>Přirážka za <b>ATYP</b> (projekční a koordinační práce) — <b>pro tuto zakázku</b>:</span>
      <input type="number" step="1" min="0" max="300" style="width:90px"
             value="${atypSazbaProc()}" ${jeAdmin() ? '' : 'disabled'}
             onchange="nastSetAtyp(this.value)"> %
    </label>
    <div class="note">Zaškrtnutí <b>ATYP (nestandardní zakázka)</b> v kalkulaci OCK přidá do sekce
      <b>Režie</b> samostatný řádek „PŘIRÁŽKA ZA ATYP – PROJEKČNÍ A KOORDINAČNÍ PRÁCE" ve výši tohoto
      procenta z nákladu <b>celé sekce Režie</b> (včetně 3D zaměření a výstupu pro zákazníka).
      Sazba je uložená v ceníku zakázky, takže se mění <b>u jednotlivé zakázky</b> a ukládá se s ní –
      dřívější nabídky se změnou nepřepočítají. Nová zakázka začíná na 30 %.${jeAdmin() ? '' : ' Měnit ji smí jen administrátor.'}</div>

    <div class="sec-title">Přístupová práva (příprava pro role)</div>
    <div class="note">Tyto vlastnosti budou v budoucnu skryté běžným uživatelům (napojení na role a přihlášení):</div>
    <ul style="margin:6px 0 0;padding-left:20px;font-size:13px">${adminFeatures.map(x => `<li style="margin:3px 0">${x}</li>`).join('')}</ul>

    <div class="sec-title">Návrhy dalších možností do Nastavení</div>
    <ul style="margin:6px 0 0;padding-left:20px;font-size:13px">${navrhy.map(x => `<li style="margin:4px 0">${x}</li>`).join('')}</ul>`;
}

/* ---------- vnitřní záložka: Firma (SET-3) ---------- */
function nastFirma() {
  if (!jeAdmin()) return `<div class="note">Firemní údaje pro dokumenty smí měnit <b>jen administrátor</b>.</div>`;
  const f = NAST.firma || (NAST.firma = firmaDefault());
  const kontrola = firmaKontrola(f);

  const poleHtml = p => {
    if (p.typ === 'check')
      return `<label style="display:flex;align-items:center;gap:8px;margin:6px 0">
        <input type="checkbox" ${f[p.id] ? 'checked' : ''} onchange="firmaSet('${p.id}', this.checked)"> ${esc(p.label)}</label>`;
    const chybi = p.povinne && !String(f[p.id] || '').trim();
    return `<div class="row"><label>${esc(p.label)}${p.povinne ? ' <span class="mut">*</span>' : ''}</label>
      <input type="text" value="${esc(f[p.id] == null ? '' : f[p.id])}"
        ${chybi ? 'style="border-color:var(--warn)"' : ''}
        onchange="firmaSet('${p.id}', this.value)">
      ${p.symbol ? `<span class="note" style="flex:none;width:210px;font-size:11.5px"><code>{{${p.symbol}}}</code></span>` : '<span style="flex:none;width:210px"></span>'}</div>`;
  };

  const sekce = FIRMA_SEKCE.map(s => {
    const pole = FIRMA_POLE.filter(p => p.sekce === s);
    const skryt = s === 'Korespondenční adresa' && f.korShodna;
    return `<div class="sec-title">${esc(s)}</div>
      ${pole.filter(p => !(skryt && p.id !== 'korShodna')).map(poleHtml).join('')}
      ${skryt ? '<div class="note">Použije se sídlo firmy.</div>' : ''}`;
  }).join('');

  const symboly = firmaSymboly().map(s => `<code>{{${s}}}</code>`).join(' ');

  return `<div class="note">Údaje <b>naší firmy</b> (zhotovitele). Propisují se do <b>cenové nabídky</b>
      (zástupné symboly <code>{{FIRMA_…}}</code> v šabloně a v tiskovém náhledu) a do <b>krycího listu</b>
      (sekce „Dodavatel (naše firma)"). Ukládají se do <code>konfigurace.json</code>, sekce Nastavení.
      Editace = <b>jen administrátor</b>.</div>

    ${kontrola.ok ? '' : `<div class="note" style="margin-top:8px;color:var(--warn)">
      ⚠ Nevyplněná povinná pole (${kontrola.pocet}): ${esc(kontrola.chybi.join(', '))}.
      Dokumenty se vygenerují i tak – na těchto místech zůstane prázdno.</div>`}

    ${sekce}

    <div class="sec-title">Logo firmy</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      ${f.logo ? `<img src="${esc(f.logo)}" alt="logo" style="max-height:56px;max-width:220px;border:1px solid var(--line);border-radius:6px;padding:4px">` : '<span class="note">Logo zatím nenahráno.</span>'}
      <div class="btns"><button onclick="firmaLogoNahraj()">Nahrát logo</button>
        ${f.logo ? '<button class="mini" onclick="firmaLogoSmaz()">Odebrat</button>' : ''}</div>
      ${f.logoNazev ? `<span class="note">${esc(f.logoNazev)}</span>` : ''}
    </div>
    <div class="note" style="margin-top:6px">PNG / JPG / SVG do 400 kB. Ukládá se přímo do konfigurace (data URL),
      aby se přeneslo spolu s ostatním nastavením. Logo se zobrazuje v hlavičce tiskových náhledů.</div>

    <div class="sec-title">Zástupné symboly do .docx šablon</div>
    <div class="note" style="line-height:1.9">${symboly}</div>
    <div class="note" style="margin-top:6px">Odvozené symboly skládají více polí do jednoho řádku:
      <code>{{FIRMA_SIDLO}}</code>, <code>{{FIRMA_KORESPONDENCNI}}</code>, <code>{{FIRMA_BANKA_RADEK}}</code>,
      <code>{{FIRMA_ICO_DIC}}</code> a <code>{{FIRMA_PATICKA}}</code> (celá firemní patička dokumentu).</div>

    ${typeof onlineFirmaPanel === 'function' ? onlineFirmaPanel() : ''}

    <div class="btns" style="margin-top:12px"><button class="mini" onclick="firmaObnovVychozi()">↺ Obnovit výchozí údaje</button></div>`;
}

/* ---------- vnitřní záložka: Uživatelé ----------
 * Od 4. 8. 2026 je tohle SKUTEČNÁ správa účtů online databáze (schaftscalc):
 * založení uživatele s rolí a počátečním heslem, reset hesla, změna role,
 * vypnutí účtu. Obsluhu i vykreslení dodává ui/online_ui.js – táž logika,
 * kterou hlídá server. Bez spojení se serverem (nouzovka ze souboru) zůstává
 * jen vysvětlení; místní seznam NAST.uzivatele se dál nikde needituje, ale
 * v datech se ponechává (nic se nemaže bez dotazu). */
function nastUzivatele() {
  const online = typeof onlineMozne === 'function' && onlineMozne()
    && typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV.bezi;
  if (!online)
    return `<div class="note">Účty žijí v online databázi (schaftscalc.netlify.app) – spravují se tam,
      kde se proti nim lidé přihlašují. Tady v nouzovém režimu (aplikace spuštěná ze souboru,
      bez serveru) se účty spravovat nedají.</div>`;
  if (!(typeof jeAdminOnline === 'function' && jeAdminOnline()))
    return `<div class="note">Správa účtů je přístupná jen přihlášenému administrátorovi.</div>`;
  if (!ONLINE_STAV.uzivateleNacteno) {
    // seznam se donačte jednou a panel si o překreslení řekne sám
    onlineUzivateleNacti().then(() => { if (nastOtevreno()) renderNastaveni(); });
    return `<div class="note">Načítám seznam účtů…</div>`;
  }
  return onlineUzivateleHtml();
}

/* ---------- vnitřní záložka: Slevy ---------- */
function nastSlevy() {
  const pct = v => (Math.round(v * 10000) / 100);
  const stropRows = NAST.role.map(r => `
    <tr>
      <td>${esc(r)}</td>
      <td style="text-align:right">
        ${r === 'Administrátor'
          ? '<span class="pill">bez limitu (jen pojistka marže)</span>'
          : `<input type="number" step="0.5" style="width:80px;text-align:right" value="${pct(NAST.slevy.stropy[r] || 0)}" onchange="slStrop('${escJs(r)}', this.value)"> %`}
      </td>
    </tr>`).join('');
  const schemaRows = NAST.slevy.schemata.map((s, i) => `
    <tr>
      <td><input type="text" value="${esc(s.nazev)}" onchange="slSchemaSet(${i},'nazev',this.value)"></td>
      <td><select onchange="slSchemaSet(${i},'typ',this.value)">
        <option value="percentage" ${s.typ === 'percentage' ? 'selected' : ''}>% z ceny</option>
        <option value="amount" ${s.typ === 'amount' ? 'selected' : ''}>pevná částka</option></select></td>
      <td><input type="text" value="${esc(s.popis)}" onchange="slSchemaSet(${i},'popis',this.value)"></td>
      <td style="text-align:center"><button class="mini noprint" onclick="slSchemaDel(${i})">✕</button></td>
    </tr>`).join('');

  return `
    <div class="note" style="margin-bottom:8px"><b>Návrh</b> slevového modelu. Sleva se zadává na úrovni
      <b>řídící varianty / cenové nabídky</b> jako % (nebo pevná částka) z ceny bez DPH. Model má tři vrstvy:
      schémata slev, stropy dle role a schvalování nad rámec stropu.</div>

    <div class="sec-title">1) Pojistka marže (tvrdý strop)</div>
    <div class="row" style="max-width:420px"><label>Minimální marže po slevě</label>
      <span class="pct-wrap"><input type="number" step="0.5" style="width:80px;text-align:right" value="${pct(NAST.slevy.minMarze)}" onchange="slMinMarze(this.value)"> %</span></div>
    <div class="note">Žádná sleva (ani se schválením) nesmí stlačit marži pod tuto hranici. Chrání před ztrátovou zakázkou.</div>

    <div class="row" style="max-width:420px;margin-top:8px"><label>Maximální globální sleva</label>
      <span class="pct-wrap"><input type="number" step="0.5" style="width:80px;text-align:right" value="${pct(NAST.slevy.maxGlobalni != null ? NAST.slevy.maxGlobalni : 0.30)}" onchange="slMaxGlobalni(this.value)"> %</span></div>
    <div class="note">Strop pole „Globální sleva PROJ" v kartě slevy (zadání 2. 8. 2026, výchozích 30 %).
      Sleva na nabídku ZAK-10 má vlastní stropy dle role níže. Hodnota nad strop se při zadání přistřihne;
      přijde-li vyšší importem starší zakázky, rozsvítí se kontrola.</div>

    <div class="sec-title">2) Stropy slev dle role (bez schválení)</div>
    <table class="sd-tbl" style="max-width:480px">
      <thead><tr><th>Role</th><th style="text-align:right">Max sleva bez schválení</th></tr></thead>
      <tbody>${stropRows}</tbody>
    </table>
    <div class="note">Do stropu si sleva „projde" sama. Nad strop → stav <b>„Čeká na schválení"</b> a putuje nadřízenému.</div>

    <div class="sec-title">3) Schémata slev</div>
    <table class="sd-tbl">
      <thead><tr><th>Název schématu</th><th>Typ</th><th>Popis</th><th></th></tr></thead>
      <tbody>${schemaRows}</tbody>
    </table>
    <div class="noprint" style="margin-top:8px"><button class="mini" onclick="slSchemaAdd()">+ přidat schéma</button></div>

    <div class="sec-title">4) Workflow schvalování (návrh)</div>
    <ol style="margin:6px 0 0;padding-left:20px;font-size:13px">
      <li>Obchodník zadá slevu u řídící varianty (schéma + %).</li>
      <li>Je-li ≤ strop jeho role a marže ≥ pojistka → <b>schváleno automaticky</b>.</li>
      <li>Je-li &gt; strop role → stav <b>„Čeká na schválení"</b>, nabídku/SoD nelze generovat, dokud nadřízený neschválí.</li>
      <li>Nadřízený (vyšší role) <b>schválí / zamítne</b> s poznámkou; uloží se <b>kdo, kdy, důvod</b>.</li>
      <li>Po schválení lze slevu propsat do Pipedrive jako <i>deal discount</i> (viz API manuál).</li>
    </ol>
    <div class="note" style="margin-top:8px">Toto je návrh k odsouhlasení. Po tvém OK zapracuji zadávání slevy do
      hlavičky kalkulace (řídící varianta) a stav schválení do přehledu zakázky (<code>ZAK-10</code>).</div>`;
}

/* ---------- vnitřní záložka: Šablony dokumentů (SET-6) ---------- */
function sablonaNahraj(typ) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.docx';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.arrayBuffer().then(buf => { SABLONY[typ] = { nazev: f.name, data: buf }; nastRefresh(); }); };
  inp.click();
}
function sablonaSmaz(typ) {
  delete SABLONY[typ];
  ['en', 'de', 'fr'].forEach(l => { delete SABLONY[typ + '_' + l]; });   // mutace bez originálu nedávají smysl
  nastRefresh();
}

/* ---------- jazykové mutace šablony (N1) – jen administrátor ----------
 * Z nahrané české šablony vyrobí EN/DE/FR variantu: pevný text se přeloží
 * slovníkem (preklad.js), symboly {{...}} zůstanou. Výsledek se uloží do
 * SABLONY[typ_jazyk] (použije se při generování v daném jazyce) a zároveň
 * se stáhne jako soubor, aby šel doladit ve Wordu a nahrát zpět. */
function sablonaPrelozStav(typ, lang, text) {
  const el = document.getElementById('sablStav-' + typ);
  if (el) el.textContent = text;
}
function sablonaPrelozit(typ, lang) {
  if (!jeAdmin()) return alert('Jazykové mutace šablon smí vytvářet jen administrátor.');
  const s = SABLONY[typ];
  if (!s) return alert('Nejdřív nahrajte českou šablonu .docx.');
  const stat = {};
  sablonaPrelozStav(typ, lang, 'Překládám do ' + lang.toUpperCase() + '…');
  docxPrelozSablonu(s.data.slice(0), lang, stat)
    .then(blob => blob.arrayBuffer().then(buf => {
      const nazev = s.nazev.replace(/\.docx$/i, '') + '_' + lang.toUpperCase() + '.docx';
      SABLONY[typ + '_' + lang] = { nazev, data: buf };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nazev;
      a.click();
      const chybi = stat.chybi.length;
      sablonaPrelozStav(typ, lang, `Hotovo: ${lang.toUpperCase()} – přeloženo ${stat.prelozeno} `
        + `z ${stat.celkem - stat.neutralni} odstavců (${stat.procenta} %)`
        + (chybi ? `, ${chybi} zůstalo česky – doplňte je ve Wordu nebo do slovníku.` : '.'));
      nastRefresh();
    }))
    .catch(err => sablonaPrelozStav(typ, lang, 'Chyba: ' + err.message));
}
/* seznam nepřeložených frází z poslední mutace → CSV pro překladatele */
function sablonaChybejiciCsv(typ, lang) {
  const s = SABLONY[typ]; if (!s) return;
  const stat = {};
  docxPrelozSablonu(s.data.slice(0), lang, stat).then(() => {
    const csv = '﻿' + ['český text;překlad (' + lang.toUpperCase() + ')']
      .concat(stat.chybi.map(t => '"' + t.replace(/"/g, '""') + '";')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'sablona_' + typ + '_nepreloz_' + lang + '.csv';
    a.click();
  }).catch(err => sablonaPrelozStav(typ, lang, 'Chyba: ' + err.message));
}

/* ---------- zveřejnění šablony online (#139) – jen administrátor ---------- */
function sablonaOnlineStav(text, chyba) {
  const el = document.getElementById('sablOnlineStav');
  if (el) { el.textContent = text || ''; el.style.color = chyba ? 'var(--red, #c0392b)' : ''; }
}
function sablonaZverejniOnline(typ) {
  if (!jeAdmin()) return alert('Zveřejnit šablonu smí jen administrátor.');
  const s = SABLONY[typ];
  if (!s) return alert('Nejdřív nahrajte .docx soubor šablony.');
  /* Zveřejňuje se česká šablona A VŠECHNY hotové jazykové mutace najednou —
   * zveřejnit jen češtinu by znamenalo, že anglická nabídka pojede z jiné
   * (starší) verze než česká, což je přesně to, čemu má centrála zabránit. */
  const mutace = ['en', 'de', 'fr'].filter(l => SABLONY[typ + '_' + l]);
  if (!confirm('Zveřejnit „' + s.nazev + '" jako platnou šablonu pro celý program?'
    + (mutace.length ? '\nSpolu s ní se zveřejní jazykové mutace: ' + mutace.map(l => l.toUpperCase()).join(', ') + '.' : '')
    + '\n\nOd této chvíle z ní budou tisknout všichni přihlášení.')) return;
  const pozn = prompt('Čím se změna zdůvodňuje (nepovinné):', '') || '';
  sablonaOnlineStav('Zveřejňuji…');
  let fronta = Promise.resolve();
  const vysledky = [];
  [[typ, s]].concat(mutace.map(l => [typ + '_' + l, SABLONY[typ + '_' + l]])).forEach(([t, sab]) => {
    fronta = fronta
      .then(() => onlineSablonaZverejni(t, sab.nazev, sab.data.slice(0), pozn))
      .then(o => vysledky.push(t + ' → verze ' + o.verze))
      .catch(e => {
        /* „Beze změny" není chyba zveřejnění, jen informace. */
        vysledky.push(t + ': ' + e.message);
      });
  });
  fronta.then(() => { sablonaOnlineStav('Hotovo: ' + vysledky.join(' · ')); nastRefresh(); });
}
function sablonyRezimUI(rezim) {
  if (!jeAdmin()) return;
  if (rezim === 'mekky' && !confirm('Přepnout šablony do MĚKKÉHO režimu?\n\n'
    + 'Obchodníci pak budou moci tisknout i z místních souborů. Používejte jen při výpadku '
    + 'online části; po jeho odeznění přepněte zpět na přísný.')) { nastRefresh(); return; }
  onlineSablonyRezimNastav(rezim)
    .then(() => { sablonaOnlineStav('Režim přepnut.'); nastRefresh(); })
    .catch(e => { sablonaOnlineStav('Chyba: ' + e.message, true); nastRefresh(); });
}

function nastSablony() {
  /* Řádek platné serverové verze daného typu (#139). Ukazuje se každému
   * přihlášenému — obchodník má vědět, ze které verze se tiskne. */
  const onlineInfo = (typ) => {
    if (!sablonyOnlineAktivni()) return '';
    const kusy = [typ].concat(['en', 'de', 'fr'].map(l => typ + '_' + l)).map(t => {
      const m = (typeof onlineSablonaMeta === 'function') ? onlineSablonaMeta(t) : null;
      if (!m) return null;
      const j = t === typ ? '' : ' ' + t.slice(-2).toUpperCase();
      return `verze ${m.verze}${j} (${esc(m.nazev)}, zveřejnil ${esc(m.zverejnil)} ${esc((m.kdy || '').slice(0, 10))})`;
    }).filter(Boolean);
    return `<div class="note" style="margin-top:6px">☁ Na serveru: ${kusy.length
      ? kusy.join(' · ') : '<b>žádná šablona zatím zveřejněná</b>'}</div>`;
  };
  const radek = (typ, label, pozn) => {
    const s = SABLONY[typ];
    const mutace = ['en', 'de', 'fr'].map(l => {
      const m = SABLONY[typ + '_' + l];
      return `<button class="mini ${m ? 'aktivni' : ''}" onclick="sablonaPrelozit('${typ}','${l}')"
        title="${m ? 'hotovo: ' + esc(m.nazev) + ' – kliknutím přegeneruji' : 'vyrobit ' + l.toUpperCase() + ' mutaci z české šablony'}"
        >${m ? '✓ ' : ''}${l.toUpperCase()}</button>`;
    }).join('');
    return `<div style="margin:8px 0;padding:10px;border:1px solid var(--line);border-radius:8px">
      <b>${label}</b> ${pozn ? `<span class="note">— ${pozn}</span>` : ''}<br>
      <span class="${s ? '' : 'note'}" style="font-size:12.5px">${s ? '✓ nahráno: ' + esc(s.nazev) : 'zatím nenahráno (použije se výběr souboru při generování)'}</span>
      <div class="btns" style="margin-top:6px"><button onclick="sablonaNahraj('${typ}')">Nahrát .docx</button>
        ${s ? `<button class="mini" onclick="sablonaSmaz('${typ}')">Odebrat</button>` : ''}
        ${s && jeAdmin() && sablonyOnlineAktivni()
          ? `<button class="primary" onclick="sablonaZverejniOnline('${typ}')">☁ Zveřejnit online jako platnou</button>` : ''}</div>
      ${onlineInfo(typ)}
      ${s && jeAdmin() ? `<div style="margin-top:8px;border-top:1px dashed var(--line);padding-top:8px">
        <span class="note">Jazyková mutace šablony (N1):</span>
        <div class="btns" style="margin-top:4px">${mutace}
          <button class="mini" onclick="sablonaChybejiciCsv('${typ}','en')">⤓ chybí EN</button>
          <button class="mini" onclick="sablonaChybejiciCsv('${typ}','de')">⤓ chybí DE</button>
          <button class="mini" onclick="sablonaChybejiciCsv('${typ}','fr')">⤓ chybí FR</button></div>
        <div id="sablStav-${typ}" class="note" style="margin-top:6px"></div></div>` : ''}
      </div>`;
  };
  /* Přepínač režimu (#139) — jen administrátor, jen online. Věty u voleb
   * říkají důsledek, ne mechanismus: administrátor rozhoduje o tom, co se
   * stane obchodníkovi u tisku. */
  const rezimBlok = () => {
    if (!sablonyOnlineAktivni()) return '';
    const rezim = (typeof onlineSablonyRezim === 'function') ? onlineSablonyRezim() : 'prisny';
    const r = ONLINE_STAV.sablonyRejstrik || {};
    if (!jeAdmin())
      return `<div class="note" style="margin-top:8px">Režim šablon: <b>${rezim === 'prisny'
        ? 'přísný — tiskne se výhradně z centrálních šablon' : 'měkký — při výpadku lze použít místní soubor'}</b>.</div>`;
    return `<div style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:8px">
      <b>Režim centrálních šablon</b>
      <div class="btns" style="margin-top:6px">
        <select onchange="sablonyRezimUI(this.value)">
          <option value="prisny" ${rezim === 'prisny' ? 'selected' : ''}>PŘÍSNÝ — bez serverové šablony dokument nevznikne (doporučeno)</option>
          <option value="mekky" ${rezim === 'mekky' ? 'selected' : ''}>MĚKKÝ — při výpadku serveru lze tisknout z místního souboru</option>
        </select></div>
      <div class="note" style="margin-top:6px">Přísný režim zaručuje, že žádný obchodník netiskne ze staré verze.
        Měkký je nouzová výjimka pro výpadek online části — každý tisk z místního souboru se zapíše do zámku
        varianty jako „místní šablona", takže zůstává dohledatelný.
        ${r.rezimZmenil ? `Naposledy přepnul ${esc(r.rezimZmenil)} ${esc((r.rezimKdy || '').slice(0, 10))}.` : ''}</div>
      <div id="sablOnlineStav" class="note" style="margin-top:6px"></div></div>`;
  };
  return `<div class="note">Šablony <b>.docx</b> se od 13. 8. 2026 řídí <b>centrálně</b> (#139): administrátor je zveřejní
    na serveru a všichni přihlášení z nich automaticky tisknou — nikdo nemůže omylem použít starou verzi. Nahrání
    souboru níže je příprava (a nouzová cesta pro práci bez serveru); teprve <b>„Zveřejnit online"</b> ji učiní platnou
    pro všechny. Šablony se plní zástupnými symboly <code>{{KLÍČ}}</code> a jsou součástí všech záloh.</div>
    ${rezimBlok()}
    ${radek('nabidka', 'Šablona cenové nabídky OCK', 'používá se pro „Vytvořit nabídku (Word)" v Kalkulaci OCK')}
    ${radek('nabidkaProj', 'Šablona cenové nabídky PROJ (OVP-CN)',
      'používá se pro „Vytvořit nabídku PROJ (Word)" v Kalkulaci PROJ – je to jiný dokument než nabídka OCK')}
    ${radek('sod', 'Šablona smlouvy o dílo — REALIZACE (OCK)',
      'Sablona_SOD_REALIZACE.docx – strany, cena, podmínky a termíny přes symboly {{…}}')}
    ${radek('sodProj', 'Šablona smlouvy o dílo — PROJEKČNÍ PRÁCE',
      'Sablona_SOD_PROJEKCE.docx – strany, cena, sankce a platby po fázích přes symboly {{…}}')}
    ${radek('plnaMoc', 'Šablona plné moci',
      'Sablona_PLNA_MOC.docx – zmocnitel, nemovitost a firemní údaje přes symboly {{…}}')}
    <div class="note" style="margin-top:10px">Mutace vzniká překladem <b>pevného textu</b> šablony; nepřeložené fráze
      zůstanou česky a jsou v CSV k doplnění. <b>Hodnoty</b> dosazované do <code>{{…}}</code> se překládají zvlášť podle
      jazyka zvoleného v technické specifikaci. Vytváření mutací a export seznamů = <b>jen administrátor</b>.</div>`;
}

/* ================= KONFIGURACE (N3 / SET-2) – jen administrátor =================
 * Export a import souboru konfigurace.json (logika je v konfigurace.js).
 * Umožňuje přenést nastavení aplikace, číselníky specifikace, katalog ceníku
 * a slovník překladů mezi počítači / relacemi, dokud nemáme skutečné úložiště.
 * Výběr sekcí je stav dialogu (ne nastavení), proto žije mimo NAST. */
const KONFIG_VOLBY = {};
KONFIG_SEKCE.forEach(s => { KONFIG_VOLBY[s.kod] = true; });

function konfigBuild() {
  const h = document.querySelector('h1');
  const m = h && h.textContent.match(/v[\d.]+/);
  return m ? m[0] : '';
}
function konfigVolba(kod, v) { KONFIG_VOLBY[kod] = !!v; konfigStav(''); }
function konfigStav(text, chyba) {
  const el = document.getElementById('konfigStav');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = chyba ? 'var(--red, #c0392b)' : '';
}
function konfigCtx() {
  return { NAST, TS_C, TECHSPEC_DEF, KATALOG, SABLONY, build: konfigBuild(),
    datum: new Date().toISOString().slice(0, 10) };
}

function konfigExportSoubor() {
  if (!jeAdmin()) return alert('Export konfigurace smí spustit jen administrátor.');
  if (!KONFIG_SEKCE.some(s => KONFIG_VOLBY[s.kod])) return konfigStav('Vyberte aspoň jednu sekci.', true);
  try {
    const data = konfiguraceExport(konfigCtx(), KONFIG_VOLBY);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = konfiguraceNazevSouboru(konfigBuild());
    a.click();
    konfigStav('Uloženo: ' + a.download + ' — ' + konfiguracePopis(data).map(r => r.text).join('; '));
  } catch (err) { konfigStav('Chyba exportu: ' + err.message, true); }
}

function konfigImportSoubor() {
  if (!jeAdmin()) return alert('Import konfigurace smí spustit jen administrátor.');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      let data;
      try { data = JSON.parse(fr.result); }
      catch (e) { return konfigStav('Soubor není platný JSON: ' + e.message, true); }
      const popis = konfiguracePopis(data).filter(r => KONFIG_VOLBY[r.kod]);
      if (!popis.length) return konfigStav('Soubor neobsahuje žádnou z vybraných sekcí.', true);
      const otazka = 'Soubor: ' + f.name + '\n' + (data.build ? 'Build: ' + data.build + '\n' : '')
        + (data.vytvoreno ? 'Vytvořeno: ' + data.vytvoreno + '\n' : '')
        + '\nPŘEPÍŠE se:\n' + popis.map(r => '• ' + r.text).join('\n')
        + '\n\nSoučasná nastavení v těchto sekcích budou nahrazena.'
        + ((typeof nastdbSlozkaJede === 'function' && nastdbSlozkaJede())
            ? '\nSložka je připojená, takže se přepíše i ' + NASTDB_SOUBOR + ' v ní.'
            + (data.katalog || data.slevy ? '\nKatalog a slevové stropy se z konfigurace do složky nepřenášejí'
              + ' – ty se mění zveřejněním ceníku (databáze programu).' : '')
            : '')
        + '\n\nPokračovat?';
      if (!confirm(otazka)) return konfigStav('Import zrušen.');
      try {
        const v = konfiguraceImport(data, konfigCtx(), KONFIG_VOLBY);
        nastRefresh();                       // překreslí panel – stav se doplní až potom
        // nastRefresh() naplánuje zápis do složky; u importu nemá smysl čekat
        if (typeof nastdbUlozHned === 'function') nastdbUlozHned();
        konfigStav('Načteno: ' + (v.zmeneno.join('; ') || 'nic')
          + (v.varovani.length ? ' — POZOR: ' + v.varovani.join('; ') : ''));
      } catch (err) { konfigStav('Chyba importu: ' + err.message, true); }
    };
    fr.readAsText(f, 'utf-8');
  };
  inp.click();
}

function nastKonfigurace() {
  if (!jeAdmin()) return `<div class="note">Export a import konfigurace je dostupný <b>jen administrátorovi</b>.</div>`;
  const sekce = KONFIG_SEKCE.map(s => `<div class="row" style="align-items:flex-start">
      <label style="flex:none;width:auto"><input type="checkbox" ${KONFIG_VOLBY[s.kod] ? 'checked' : ''}
        onchange="konfigVolba('${s.kod}', this.checked)"> ${esc(s.nazev)}</label></div>`).join('');
  return `<div class="note">Přenos nastavení mezi relacemi a počítači jedním souborem
      <code>konfigurace.json</code>. Vyberte, co má soubor obsahovat (výběr platí i pro import –
      z načteného souboru se použijí jen zaškrtnuté sekce).
      <b>Zakázka se sem neukládá</b>, ta má vlastní soubor. Export i import = <b>jen administrátor</b>.</div>
    <div class="note">Od chvíle, kdy je připojená složka, je zdrojem pravdy ona: nastavení si drží
      <code>${esc(typeof NASTDB_SOUBOR !== 'undefined' ? NASTDB_SOUBOR : '_nastaveni.json')}</code>,
      ceny, slevové stropy a katalog verzovaný <code>_program.json</code>. Konfigurace zůstává
      <b>cestou mezi počítači</b> – vezme se ze složky, přenese a na druhé straně se do složky zase zapíše.
      Katalog a slevy se přitom do složky nepřenesou; ty se mění zveřejněním ceníku, aby u nich zůstalo
      datum, autor a zdůvodnění.</div>
    <div style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:8px">${sekce}</div>
    <div class="btns"><button class="primary" onclick="konfigExportSoubor()">⤓ Uložit konfiguraci do souboru</button>
      <button onclick="konfigImportSoubor()">⤒ Načíst konfiguraci ze souboru</button></div>
    <div id="konfigStav" class="note" style="margin-top:8px"></div>
    <div class="note" style="margin-top:12px">Šablony <code>.docx</code> se přenášejí <b>jen názvem</b> – binární obsah
      by soubor neúměrně nafoukl, po importu je nahrajte znovu v záložce Šablony. Role administrátora se z konfigurace
      nikdy nepřebírá.</div>`;
}

/* ================= SLOVNÍK ↔ VOCABULARY XLSX (#5) – jen administrátor =========
 * Porovnání běží nad souborem, který uživatel vybere; nic se nikam neposílá
 * a nic se nezapisuje samo. Logika porovnání je v CORE (slovnik.js), tady je
 * jen výběr souboru, výpis a tlačítka. Zápis do slovníku je import dat, takže
 * platí stejné pravidlo jako jinde: smí ho spustit jen administrátor. */
let SLOV_STAV = null;          // { soubor, list, polozky, rozdil } – výsledek posledního porovnání
const SLOV_LIMIT = 150;        // kolik řádků vypsat; zbytek se jen spočítá (viz poznámka pod tabulkou)

function slovStav(text, chyba) {
  const el = document.getElementById('slovStav');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = chyba ? 'var(--red, #c0392b)' : '';
}
function slovNacti() {
  if (!jeAdmin()) return alert('Porovnání slovníku smí spustit jen administrátor.');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    slovStav('Načítám ' + f.name + '…');
    f.arrayBuffer()
      .then(buf => xlsxPrecti(new Uint8Array(buf)))
      .then(sheets => {
        const vyber = slovnikVyberList(sheets);
        if (!vyber) throw new Error('V sešitu není list se sloupci CZ a aspoň jedním cizím jazykem. Zkontrolujte, že jde o soubor Vocabulary.');
        const rozdil = slovnikPorovnej(PREKLAD, vyber.rozbor.polozky, prekladNorm);
        // polozky si držíme kvůli přepočtu po každém zápisu (slovPrepocti) –
        // soubor už v ruce nemáme a znovu ho po uživateli chtít nebudeme
        SLOV_STAV = { soubor: f.name, list: vyber.list, polozky: vyber.rozbor.polozky, rozdil };
        nastRefresh();
      })
      .catch(err => slovStav('Chyba čtení souboru: ' + err.message, true));
  };
  inp.click();
}
function slovDoplnitVse() {
  if (!jeAdmin() || !SLOV_STAV) return;
  const zm = SLOV_STAV.rozdil.doplnit;
  if (!zm.length) return;
  if (!confirm('Doplnit ' + zm.length + ' chybějící překlad/y z tabulky?\n\nPřepisuje se jen tam, kde aplikace překlad nemá – nic hotového se nepřepíše.')) return;
  const n = slovnikAplikuj(zm, prekladNastav);
  slovPrepocti('Doplněno ' + n + ' překladů.');
}
function slovVezmi(kategorie, i) {
  if (!jeAdmin() || !SLOV_STAV) return;
  const z = (SLOV_STAV.rozdil[kategorie] || [])[i];
  if (!z) return;
  slovnikAplikuj([z], prekladNastav);
  slovPrepocti('Převzato z tabulky: ' + z.cz + ' (' + z.jazyk.toUpperCase() + ')');
}
function slovPridejNove() {
  if (!jeAdmin() || !SLOV_STAV) return;
  const zm = slovnikNoveJakoZmeny(SLOV_STAV.rozdil.nove);
  if (!zm.length) return;
  if (!confirm('Přidat do slovníku ' + SLOV_STAV.rozdil.nove.length + ' hesel z tabulky (' + zm.length + ' překladů)?\n\nJsou to hesla, která aplikace zatím nezná. Nic stávajícího se nepřepíše.')) return;
  const n = slovnikAplikuj(zm, prekladNastav);
  slovPrepocti('Přidáno ' + n + ' překladů v nových heslech.');
}
/* Po každém zápisu porovnáme znovu proti témuž souboru – bez toho by tabulka
 * ukazovala stav před zápisem a uživatel by klikal do prázdna. Původní položky
 * z listu si držíme v SLOV_STAV.polozky. */
function slovPrepocti(hlaska) {
  if (SLOV_STAV && SLOV_STAV.polozky) SLOV_STAV.rozdil = slovnikPorovnej(PREKLAD, SLOV_STAV.polozky, prekladNorm);
  nastRefresh();
  slovStav(hlaska || '');
}
function slovCsvJenVApp() {
  if (!SLOV_STAV) return;
  const csv = slovnikCsvJenVApp(SLOV_STAV.rozdil.jenVApp);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'slovnik_jen_v_aplikaci.csv';
  a.click();
  slovStav('Uloženo: ' + a.download + ' — pošlete překladatelům k doplnění do tabulky.');
}

function slovTabulka(rows, kategorie, tlacitko) {
  const vypsat = rows.slice(0, SLOV_LIMIT);
  const telo = vypsat.map((z, i) => `<tr>
      <td style="white-space:normal">${esc(z.cz)}</td>
      <td>${z.jazyk.toUpperCase()}</td>
      <td style="white-space:normal">${z.aplikace ? esc(z.aplikace) : '<span class="note">— chybí —</span>'}</td>
      <td style="white-space:normal">${esc(z.tabulka)}</td>
      <td class="noprint">${tlacitko ? `<button class="mini" title="převzít znění z tabulky" onclick="slovVezmi('${kategorie}', ${i})">převzít</button>` : ''}</td>
    </tr>`).join('');
  const zbytek = rows.length > vypsat.length
    ? `<div class="note">Vypsáno prvních ${vypsat.length} z ${rows.length} – zbytek se zpracuje hromadným tlačítkem.</div>` : '';
  return `<table class="ceniktbl"><tr><th>České heslo</th><th>Jazyk</th><th>V aplikaci</th><th>V tabulce</th><th class="noprint"></th></tr>
    ${telo}</table>${zbytek}`;
}

function nastSlovnik() {
  if (!jeAdmin()) return `<div class="note">Porovnání slovníku s tabulkou Vocabulary je dostupné <b>jen administrátorovi</b>.</div>`;
  const uvod = `<div class="note">Slovník aplikace (<code>PREKLAD</code>) a tabulka
      <code>EngineersCZ_Vocabulary_*.xlsx</code> se časem rozejdou. Vyberte soubor a aplikace ukáže, kde se liší.
      <b>Nic se nezapíše samo</b> – doplnění i převzetí odlišného znění je vždy vaše kliknutí. Soubor zůstává
      ve vašem počítači, nikam se neodesílá. Trvale se změny uloží až exportem konfigurace
      (záložka <b>Konfigurace</b>), jinak platí jen pro tuto relaci.</div>
    <div class="btns"><button class="primary" onclick="slovNacti()">⤒ Vybrat tabulku Vocabulary (.xlsx)</button>
      ${SLOV_STAV ? `<button onclick="slovCsvJenVApp()">⤓ Hesla jen v aplikaci (CSV pro překladatele)</button>` : ''}</div>
    <div id="slovStav" class="note" style="margin-top:8px"></div>`;
  if (!SLOV_STAV) return uvod + `<div class="note" style="margin-top:12px">Aktuálně slovník obsahuje
      <b>${prekladPocet()}</b> hesel — EN ${prekladPocet('en')}, DE ${prekladPocet('de')}, FR ${prekladPocet('fr')}.</div>`;

  const d = SLOV_STAV.rozdil, s = d.souhrn;
  const blok = (nadpis, popis, obsah) => `<div style="margin:14px 0;padding:10px;border:1px solid var(--line);border-radius:8px">
      <div class="sec-title">${nadpis}</div><div class="note">${popis}</div>${obsah}</div>`;

  return uvod + `<div class="note" style="margin-top:10px">Soubor <b>${esc(SLOV_STAV.soubor)}</b>, list
      <b>${esc(SLOV_STAV.list)}</b> — ${s.vTabulce} řádků proti ${s.vAplikaci} heslům aplikace,
      shodných překladů ${s.shodne}.</div>`
    + (s.doplnit ? blok(`Chybí v aplikaci (${s.doplnit})`,
        `Tabulka překlad má, aplikace ne. Doplnění je bezpečné – nic hotového se nepřepíše.`,
        slovTabulka(d.doplnit, 'doplnit', true)
        + `<div class="btns" style="margin-top:8px"><button class="primary" onclick="slovDoplnitVse()">Doplnit všech ${s.doplnit}</button></div>`) : '')
    + (s.rozdilne ? blok(`Odlišné znění (${s.rozdilne})`,
        `Obě strany překlad mají a neshodují se. <b>Tady rozhodujete vy</b> – aplikace nemusí být pozadu,
         někdo mohl znění vědomě upravit. Hromadné tlačítko tu schválně není.`,
        slovTabulka(d.rozdilne, 'rozdilne', true)) : '')
    + (s.nove ? blok(`Hesla jen v tabulce (${s.nove})`,
        `Aplikace je zatím nezná. Přidat je můžete, ale slovník tím poroste i o výrazy, které se nikde nepoužijí.`,
        `<div class="note">${d.nove.slice(0, 40).map(x => esc(x.cz)).join(' · ')}${d.nove.length > 40 ? ' …' : ''}</div>
         <div class="btns" style="margin-top:8px"><button onclick="slovPridejNove()">Přidat všech ${s.nove} do slovníku</button></div>`) : '')
    + (s.jenVApp ? blok(`Hesla jen v aplikaci (${s.jenVApp})`,
        `V tabulce chybí. Tlačítkem nahoře je vyexportujete do CSV a pošlete překladatelům (souvisí s bodem 32 –
         kontrola rodilým mluvčím).`,
        `<div class="note">${d.jenVApp.slice(0, 40).map(x => esc(x.klic)).join(' · ')}${d.jenVApp.length > 40 ? ' …' : ''}</div>`) : '')
    + (!s.doplnit && !s.rozdilne && !s.nove && !s.jenVApp
        ? `<div class="note" style="margin-top:10px"><b>Slovník a tabulka jsou v souladu.</b></div>` : '');
}

/* ---------- vnitřní záložka: Zobrazení (#136) ----------
 *
 * „Vytvořit v nastavení položku nastavení zobrazení, ve které bude podle rolí
 *  možné přiřazovat jednotlivá nastavení sloupců a funkcí v rozhraní napříč
 *  aplikací."
 *
 * Panel je tabulka: řádek = jeden prvek rozhraní, sloupec = role. Seznam
 * prvků i pravidla jsou v src/zobrazeni.js (a mají vlastní testy), tady se
 * jen kreslí a přepíná. Ke každému prvku se ukazuje i to, KDE v aplikaci je
 * a PROČ byl dosud skrytý — bez toho by se u dvaceti klíčů po půl roce
 * nedalo rozhodnout, co je bezpečné pustit ven.
 *
 * Pořadí kroků, které panel předpokládá: administrátor zaškrtá → „Zveřejnit
 * online" (jinak platí jen jemu a po odhlášení se to ztratí). Proto je stav
 * zveřejnění vidět hned nahoře a ne až dole pod tabulkou. */

function zobrMatice() {
  if (!NAST.zobrazeni) NAST.zobrazeni = (typeof zobrazeniVychozi === 'function') ? zobrazeniVychozi() : {};
  return NAST.zobrazeni;
}
function zobrSet(klic, role, v) {
  if (!jeAdmin()) return;
  const m = zobrMatice();
  if (!m[klic]) m[klic] = {};
  m[klic][role] = !!v;
  nastRefresh();
}
/* Hromadné přepnutí. `navrh` = doporučení sepsané u každého prvku (podklad
 * k rozhodnutí, ne výchozí stav), `vychozi` = dnešek před zavedením matice. */
function zobrPredloha(ktera) {
  if (!jeAdmin()) return;
  if (!confirm(ktera === 'navrh'
    ? 'Přepsat celou tabulku doporučením?\n\nDoporučení je návrh, co dát obchodníkovi a co vedoucímu. '
      + 'Vaše dosavadní zaškrtnutí se ztratí. Zveřejnit se to musí zvlášť.'
    : 'Vrátit celou tabulku na stav před zavedením tohoto nastavení?\n\n'
      + 'Tedy: administrátor vidí všechno, obchodník i vedoucí nic navíc.')) return;
  const m = zobrMatice();
  ZOBRAZENI_PRVKY.forEach(p => {
    if (!m[p.klic]) m[p.klic] = {};
    ZOBRAZENI_ROLE_PRIDELITELNE.forEach(r => {
      m[p.klic][r] = p.pevne ? false : !!(ktera === 'navrh' ? p.navrh : p.vychozi)[r];
    });
  });
  nastRefresh();
}
/* Náhled cizí role: administrátor si přepne, co uvidí obchodník nebo vedoucí,
 * aniž by se musel odhlašovat a přihlašovat cizím účtem. Pohled se zapíná
 * přes `nastSetAdmin(false)` — tím se z NAST.jeAdmin stane false a rozhraní
 * začne chodit maticí; `nahledRole` řekne, ČÍ pohled to je. */
function zobrNahled(role) {
  NAST.nahledRole = role || '';
  if (role) nastSetAdmin(false); else nastSetAdmin(true);
}

function nastZobrazeni() {
  if (!jeAdmin())
    return `<div class="note">Rozdělení, co která role vidí, nastavuje <b>jen administrátor</b>.
      Tady vidíte, co bylo přiděleno vám.</div>`;
  const m = zobrMatice();
  const zmen = (typeof zobrazeniZmeny === 'function') ? zobrazeniZmeny(m) : [];
  const online = typeof onlineZobrazeniPopis === 'function' ? onlineZobrazeniPopis() : '';

  const bunka = (p, r) => {
    if (p.pevne)
      return `<td style="text-align:center" title="Drží server – přidělit nejde">—</td>`;
    return `<td style="text-align:center"><input type="checkbox" ${m[p.klic] && m[p.klic][r] ? 'checked' : ''}
      onchange="zobrSet('${escJs(p.klic)}', '${escJs(r)}', this.checked)"></td>`;
  };

  const skupiny = ZOBRAZENI_SKUPINY.map(s => {
    const prvky = ZOBRAZENI_PRVKY.filter(p => p.skupina === s.klic);
    if (!prvky.length) return '';
    const radky = prvky.map(p => `<tr>
      <td>
        <b>${esc(p.nazev)}</b>${p.pevne ? ' <span class="note" style="display:inline">(drží server)</span>' : ''}
        <div class="note" style="margin:2px 0 0">${esc(p.kde)}</div>
        <div class="note" style="margin:2px 0 0">${esc(p.popis)}</div>
        <div class="note" style="margin:2px 0 0;font-style:italic">${esc(p.proc)}</div>
      </td>
      ${ZOBRAZENI_ROLE_PRIDELITELNE.map(r => bunka(p, r)).join('')}
      <td class="note" style="font-size:11.5px">${ZOBRAZENI_ROLE_PRIDELITELNE
        .filter(r => p.navrh[r]).map(r => esc(r)).join(', ') || '—'}</td>
    </tr>`).join('');
    return `<div class="sec-title">${esc(s.nazev)}</div>
      <table class="sd-tbl"><thead><tr>
        <th style="width:52%">Prvek rozhraní</th>
        ${ZOBRAZENI_ROLE_PRIDELITELNE.map(r => `<th style="text-align:center">${esc(r)}</th>`).join('')}
        <th>Doporučení</th>
      </tr></thead><tbody>${radky}</tbody></table>`;
  }).join('');

  return `<div class="note" style="margin-top:0">Tabulka říká, co uvidí <b>obchodník</b> a co <b>vedoucí</b>.
      Administrátor vidí vždycky všechno — kdyby si mohl něco odebrat, neměl by se jak dostat zpátky sem.
      Prvky označené <b>(drží server)</b> se nepřidělují: zveřejnit ceník, spravovat účty nebo pořídit
      otisk databáze hlídá i server, takže by tlačítko sice svítilo, ale skončilo by chybou.</div>

    <div class="sec-title">Stav v online databázi</div>
    <div class="note" style="margin-top:0">${esc(online)}</div>
    <div class="note">${zmen.length
      ? esc('Proti výchozímu rozdělení máte v tabulce ' + zmen.length + ' odchylek.')
      : 'V tabulce zatím není žádná odchylka od výchozího rozdělení.'}</div>
    <div class="btns" style="margin-top:8px">
      ${typeof onlineZverejniZobrazeni === 'function'
        ? `<button class="primary" onclick="onlineZverejniZobrazeni()">Zveřejnit nastavení zobrazení online</button>` : ''}
      <button class="mini" onclick="zobrPredloha('navrh')">Použít doporučení</button>
      <button class="mini" onclick="zobrPredloha('vychozi')">Vrátit na dnešní stav</button>
    </div>
    <div class="note">Dokud nastavení nezveřejníte, platí jen vám a po odhlášení se ztratí —
      matice bydlí na serveru, protože obchodník ani vedoucí složku <code>_DB</code> nemapují.</div>

    <div class="sec-title">Náhled cizí role</div>
    <div class="kl-radio">
      <label><input type="radio" name="nastNahled" ${NAST.jeAdmin ? 'checked' : ''}
        onchange="zobrNahled('')"> Administrátor (skutečný pohled)</label>
      ${ZOBRAZENI_ROLE_PRIDELITELNE.map(r => `<label><input type="radio" name="nastNahled"
        ${!NAST.jeAdmin && NAST.nahledRole === r ? 'checked' : ''}
        onchange="zobrNahled('${escJs(r)}')"> ${esc(r)} (náhled)</label>`).join('')}
    </div>
    <div class="note">Náhled přepíná jen to, co je vidět na obrazovce. Co se smí skutečně
      provést, hlídá server podle role účtu — náhledem se práva nezískávají.</div>

    ${skupiny}`;
}

function renderNastaveni() {
  const el = document.getElementById('nastaveni-panel'); if (!el) return;
  const akt = nastPanelAktivni();
  const tab = x => `<button class="${akt.id === x.id ? 'act' : ''}" onclick="nastPanel('${escJs(x.id)}')">${esc(x.nazev)}</button>`;
  const zalozky = nastPanelyViditelne().map(tab).join('');
  const body = akt.telo();
  /* Podtitulek už nesmí říkat „jen administrátor" natvrdo: od zavedení matice
   * (#136) se sem může dostat i vedoucí, kterému administrátor Nastavení
   * přidělil — a ten by se z nadpisu dozvěděl, že tu vlastně nemá co dělat. */
  const komu = jeAdmin() ? '— jen administrátor' : '— vidíte části, které vám přidělil administrátor';

  el.innerHTML = `
    <h2>⚙ Nastavení <span class="note" style="font-weight:400">${esc(komu)}</span></h2>
    <div class="nast-tabs noprint">${zalozky}</div>
    <div class="body">${body}
      <div class="btns" style="margin-top:18px"><button class="primary" onclick="zavriNastaveni()">Zavřít</button></div>
    </div>`;
}
