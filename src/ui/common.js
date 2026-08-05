/* ================= SPOLEČNÝ ZÁKLAD UI =================
 * Stav aplikace: ZAK (zakázka) + reference na data aktivní varianty.
 * Z, C   – zadání a ceník OCK        OCK – {zadani, fixes}
 * PJ, PC – zadání a ceník PROJ       TS  – technická specifikace
 * Reference míří přímo do ZAK.varianty[aktivní].data, takže každá
 * změna přes set() se ukládá rovnou do varianty. */

let ZAK = novaZakazka();
let Z, C, OCK, PJ, PC, TS, KL, KLP, SL, ZO, ZOP;

function syncVarianta() {
  const v = aktivniVarianta(ZAK);
  ZAK.aktivni = v.id;
  if (!v.data.kryci) v.data.kryci = { hodnoty: {} };
  if (!v.data.kryci.hodnoty) v.data.kryci.hodnoty = {};
  if (!v.data.kryciProj) v.data.kryciProj = { hodnoty: {} };     // krycí list PROJ (KLP-1)
  if (!v.data.kryciProj.hodnoty) v.data.kryciProj.hodnoty = {};
  if (!v.data.sleva) v.data.sleva = slevaDefault();
  // #38: obchodní zaokrouhlení. Nová varianta si nastavení nese už z
  // novaVariantaData(); chybí-li pole úplně, jde o zakázku uloženou ještě
  // před #38 – té se cena otevřením v novější verzi měnit nesmí, proto
  // vypnuto, ne výchozí nastavení.
  // Od 4. 8. 2026 má každá část nabídky vlastní nastavení (ZO = výtahová
  // šachta, ZOP = projekční práce). Variantě, která zná jen společné pole,
  // se dosadí dosavadní hodnota do obou – cena se rozdělením nemění.
  if (!v.data.zaokr) v.data.zaokr = zaokrVypnuto();
  zaokrZajisti(v.data);
  OCK = v.data.ock; Z = v.data.ock.zadani; C = v.data.cenik;
  PJ = v.data.proj.zadani; PC = v.data.proj.cenik; TS = v.data.techspec;
  KL = v.data.kryci; KLP = v.data.kryciProj; SL = v.data.sleva;
  ZO = v.data.zaokr; ZOP = v.data.zaokrProj;
  // trvalé (katalogové) položky ceníku → do zadání; idempotentní, páruje přes kid
  katalogAplikuj(KATALOG, Z);
}
syncVarianta();

/* ---------- nastavení aplikace (ozubené kolo, jen admin) ---------- */
const NAST = {
  jeAdmin: true,               // dnes je vše admin; přepínač role je v Nastavení
  tabViditelnost: { kalk: true, detail: true, spec: true, specdata: true, kryci: true, proj: true, kryciproj: true, cenik: true, cenikproj: true, zakazka: true, schvalovani: true },
  zobrazitNaklady: true,       // sloupce Náklad/Přirážka v tabulce kalkulace (jen admin)
  kpiViditelne: { naklad: false, hrubyZisk: false, sleva: false, marze: false }, // KPI v hlavičce viditelné i běžnému uživateli
  panel: 'obecne',             // aktivní vnitřní záložka Nastavení: obecne | uzivatele | slevy
  /* Matice „co která role vidí" (#136). Seznam prvků i pravidla jsou v
   * src/zobrazeni.js; tady leží jen zvolené hodnoty. Výchozí matice se rovná
   * dnešnímu chování, takže dokud ji administrátor neotevře, nikdo nepozná,
   * že přibyla. Platí pro celou firmu, proto se zveřejňuje na server
   * (/api/zobrazeni) stejnou cestou jako firemní údaje. */
  zobrazeni: typeof zobrazeniVychozi === 'function' ? zobrazeniVychozi() : {},
  /* Kterou rolí se administrátor právě dívá, když si vypnul pohled
   * administrátora. Prázdno = Obchodník. Běžného uživatele se to netýká –
   * jeho role chodí ze serveru a předstírat cizí nejde. */
  nahledRole: '',
  jazyk: 'cz',                 // jazyk dokumentů: cz | en | de | fr (N1 – jazykové mutace)

  // --- Firemní údaje pro dokumenty (SET-3; jen admin) – viz firma.js ---
  firma: firmaDefault(),

  // --- Uživatelé (příprava účtů; zatím jen náhled, bez přihlášení – viz SET-1) ---
  /* Tři role (zjednodušení 2. 8. 2026, příprava na online #24). Starší data
   * se čtyřmi rolemi převádí roleMigruj/stropyMigruj ve sleva.js. */
  role: ['Obchodník', 'Vedoucí', 'Administrátor'],
  uzivatele: [
    { jmeno: 'Vzorový obchodník', email: 'obchodnik@priklad.cz', role: 'Obchodník', aktivni: true },
  ],

  // --- Slevy (návrh schémat + stropy dle role + schvalování) ---
  // UKÁZKOVÉ HODNOTY. Skutečná sleva­vá politika – kolik smí která role dát
  // bez schválení a pod jakou marži se nesmí jít – je obchodní tajemství a
  // patří do verzovaného `_program.json` ve složce `_DB`, kde je u každé
  // změny vidět kdo, kdy a proč. Odtud se načte při spuštění a tyhle
  // hodnoty přepíše. Čísla níž jsou schválně kulatá, aby si je nikdo
  // nespletl se skutečnými.
  slevy: {  // STROPY A MIN. MARŽE VYNULOVÁNY pro GitHub (pripravit_github.py)
    ukazkove: true,            // #40 – vymyšlené hodnoty; zhasne načtením _program.json
    minMarze: 0,            // pojistka: sleva nesmí stlačit marži pod tuto hranici
    /* Maximum globální slevy (zadání 2. 8. 2026: „nastav maximální globální
     * slevu na 30 %"). Hlídá pole „Globální sleva PROJ" – sleva ZAK-10 má
     * vlastní stropy dle role výše. Zákonná třicítka to není, proto je
     * editovatelná v Nastavení → Slevy; záloha v kontroly.js se s ní musí
     * shodovat (hlídá test_kontroly.js). */
    maxGlobalni: 0,
    stropy: {                  // max sleva bez schválení dle role (podíl z ceny bez DPH)
      'Obchodník': 0, 'Vedoucí': 0, 'Administrátor': 0,
    },
    schemata: [
      { nazev: 'Standardní obchodní sleva', typ: 'percentage', popis: 'Běžná vyjednávací sleva na cenu bez DPH.' },
      { nazev: 'Množstevní / více šachet', typ: 'percentage', popis: 'Při více kusech OCK v jedné zakázce.' },
      { nazev: 'Partnerská / opakovaný zákazník', typ: 'percentage', popis: 'Stálý partner, rámcová spolupráce.' },
      { nazev: 'Akční (časově omezená)', typ: 'percentage', popis: 'Kampaň, konec kvartálu apod.' },
      { nazev: 'Mimořádná sleva', typ: 'percentage', popis: 'Nad rámec stropu role → vyžaduje schválení nadřízeným.' },
    ],
  },
};

/* Otisk výchozí podoby nastavení, pořízený dřív, než ho stihne cokoli
 * přepsat (import konfigurace, _DB/_nastaveni.json, matice ze serveru).
 * Slouží jako vzor pro konfigDorovnejNast(): když přijde nastavení uložené
 * starší verzí, dorovnají se z něj přepínače, které tehdy ještě nebyly.
 * Bez něj by se s každou novou záložkou opakovalo hlášení z 5. 8. 2026
 * („nevidím záložku schvalování slev") – stará konfigurace klíč nenesla,
 * a protože se nastavení nahrazuje celé, prostě zmizel. */
const NAST_VYCHOZI = JSON.parse(JSON.stringify({
  tabViditelnost: NAST.tabViditelnost,
  kpiViditelne: NAST.kpiViditelne,
  zobrazeni: NAST.zobrazeni,
}));

function jeAdmin() { return !!NAST.jeAdmin; }
/* Smí si přihlášený zapnout pohled administrátora? Pravidlo je v
 * `src/prava.js` a má vlastní testy; tady se jen dohledá, kdo je
 * přihlášený. Guardy `typeof` jsou kvůli pořadí sestavení — render()
 * může proběhnout dřív, než se online vrstva ohlásí. */
function smiPohledAdmina() {
  const ja = (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV) ? ONLINE_STAV.ja : null;
  return typeof pravaSmiAdmin === 'function' ? pravaSmiAdmin(ja) : true;
}
/* ---------- kdo se dívá a co smí vidět (#136) ----------
 * Do 5. 8. 2026 mělo rozhraní jediné dělítko: `jeAdmin()`. Buď administrátor
 * a vidí vše, nebo běžný uživatel a nevidí ceníky, náklady ani Nastavení.
 * Role „Vedoucí" přitom existovala — jen v rozhraní neznamenala nic.
 *
 * Teď se každý skrytý prvek ptá `smiZobrazit('klic')` a odpověď skládá
 * `zobrazeniSmi()` ze src/zobrazeni.js z matice v NAST.zobrazeni. Výchozí
 * matice odpovídá dosavadnímu chování do posledního prvku, takže se změnou
 * samotnou nikomu nic nepřibylo ani neubylo.
 *
 * Skutečnou hranici drží dál server: zveřejnit ceník, spravovat účty nebo
 * pořídit otisk databáze smí podle netlify/functions/* jen administrátor
 * a upravený prohlížeč s tím nic nesvede. Tohle je vrstva pohodlí — co má
 * kdo na obrazovce, ne co smí provést. */
function zobrazeniRole() {
  const ja = (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV) ? ONLINE_STAV.ja : null;
  /* Náhled cizí role smí zapnout jen ten, kdo má nárok na pohled
   * administrátora (přihlášený admin nebo offline záložní soubor).
   * Obchodníkovi se role bere ze serveru — vlastní přepínač by byl k ničemu,
   * protože přidat si práva by stejně nešlo, a jen by ho mátl. */
  if (typeof smiPohledAdmina === 'function' && smiPohledAdmina())
    return NAST.jeAdmin ? 'Administrátor' : (NAST.nahledRole || 'Obchodník');
  return (ja && ja.role) ? ja.role : 'Obchodník';
}
function smiZobrazit(klic) {
  if (typeof zobrazeniSmi !== 'function') return true;   // pojistka při sestavení
  return zobrazeniSmi(zobrazeniRole(), klic, NAST.zobrazeni);
}
/* Některá místa skrývají celý blok až tehdy, když je skrytý každý jeho kus —
 * třeba řádek tlačítek ceníku nemá smysl kreslit prázdný. */
function smiZobrazitVse(klice) { return klice.every(k => smiZobrazit(k)); }

/* aktivní jazyk dokumentů a zkratka pro překlad (viz preklad.js) */
function jazyk() { return NAST.jazyk || 'cz'; }
function jazykSet(k) { NAST.jazyk = JAZYK_IDX[k] === undefined && k !== 'cz' ? 'cz' : k;
  if (typeof nastdbZmeneno === 'function') nastdbZmeneno(); render(); }
function T(cz) { return tr(cz, jazyk()); }
function kpiVidSet(k, v) { if (!NAST.kpiViditelne) NAST.kpiViditelne = {}; NAST.kpiViditelne[k] = !!v;
  if (typeof nastdbZmeneno === 'function') nastdbZmeneno(); render(); }

/* Úložiště nahraných šablon dokumentů (SET-6). Relace; { typ: {nazev, data:ArrayBuffer} }.
 * Generátor (nabídka, budoucí SoD) je bere odtud místo výběru souboru pokaždé. */
const SABLONY = {};
/* je záložka viditelná? (skryté ceníky/detaily pro běžného uživatele) */
const TAB_ZOBRAZENI_KLIC = { cenik: 'tab.cenik', cenikproj: 'tab.cenikproj', detail: 'tab.detail', specdata: 'tab.specdata' };
function tabViditelny(t) {
  if (!NAST.tabViditelnost[t]) return false;
  /* Dřív tu stálo `!NAST.jeAdmin && (cenik|cenikproj|detail|specdata)`.
   * Matice #136 se ve výchozím stavu chová stejně, jen jde po jednotlivých
   * záložkách — vedoucí tak může dostat Detail výpočtu, aniž by dostal ceník. */
  const k = TAB_ZOBRAZENI_KLIC[t];
  if (k && !smiZobrazit(k)) return false;
  return true;
}

/* #14 krok 3: pravidla formátů bydlí ve format.js — tady jen krátká jména. */
const fmt = n => formatKc2(n);
const fmt0 = n => formatKc0(n);
const num = (n, d = 2) => formatCislo(n, d);
/* ---------- escapování textu vkládaného do HTML (#6) ----------
 * Celé UI se skládá jako řetězec a přiřazuje přes innerHTML. Do těch řetězců
 * se dostávají jména položek ceníku, názvy variant, poznámky, popisky ze
 * specifikace, hlášky výjimek – tedy text, který napsal uživatel nebo přišel
 * z importu. Bez escapování stačí, aby se někdo do názvu položky strefil
 * znakem `<` nebo uvozovkou, a rozpadne se rozvržení stránky (v horším případě
 * se spustí cizí kód). Proto platí pravidlo: do šablony nepatří holá hodnota.
 *
 * esc()   – text i obsah atributů v uvozovkách. Escapuje i apostrof a `>`,
 *           aby byl bezpečný i v atributu psaném apostrofy.
 * escJs() – argument předávaný do obslužné rutiny v atributu, např.
 *           onclick="neco('${escJs(klic)}')". Tady nestačí HTML entita:
 *           prohlížeč nejdřív rozkóduje entity a teprve výsledek čte jako
 *           JavaScript, takže z `&#39;` vznikne apostrof, který ukončí řetězec.
 *           Escapujeme proto nejdřív pro JavaScript (zpětné lomítko) a až
 *           potom pro HTML. */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escJs = s => esc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

function rootObj() { return { Z, C, OCK, PJ, PC, TS, ZAK, SL }; }
function get(path) { return path.split('.').reduce((o, k) => o[k], rootObj()); }
/* Zápis do dat aktivní varianty. Zámek (#34): do vytištěné = odeslané nabídky
 * se už nepíše. Cesty začínající „ZAK." jsou výjimka – to jsou údaje zakázky
 * (číslo, zákazník, hlavička), ne obsah konkrétní varianty; ty musí jít
 * upravit i tehdy, když je některá varianta zamčená. */
function set(path, v) {
  if (!path.startsWith('ZAK.') && typeof zamekStop === 'function' && zamekStop()) return;
  const ks = path.split('.'); const last = ks.pop();
  ks.reduce((o, k) => o[k], rootObj())[last] = v;
  aktivniVarianta(ZAK).upraveno = new Date().toISOString();
  render();
}

function inp(path, opts = {}) {
  const val = get(path);
  const step = opts.step ?? 'any', u = opts.u ?? '';
  if (opts.type === 'check')
    return `<div class="row"><label>${opts.l}</label><input type="checkbox" ${val ? 'checked' : ''} onchange="set('${path}', this.checked)"><span class="u"></span></div>`;
  if (opts.type === 'sel')
    return `<div class="row"><label>${opts.l}</label><select onchange="set('${path}', this.value)">${opts.o.map(o =>
      `<option ${String(o[0]) === String(val) ? 'selected' : ''} value="${o[0]}">${o[1]}</option>`).join('')}</select><span class="u"></span></div>`;
  if (opts.type === 'text')
    return `<div class="row"><label>${opts.l}</label><input type="text" style="width:170px;text-align:left" value="${esc(val)}" onchange="set('${path}', this.value)"><span class="u"></span></div>`;
  if (opts.type === 'date')
    return `<div class="row"><label>${opts.l}</label><input type="date" value="${esc(val)}" onchange="set('${path}', this.value)"><span class="u"></span></div>`;
  if (opts.type === 'pct')   // uloženo jako desetinné číslo (0,30), zobrazeno a zadáváno v % (30)
    return `<div class="row"><label>${opts.l}</label><input type="number" step="${opts.step ?? 1}" value="${Math.round(val * 10000) / 100}" onchange="set('${path}', (+this.value) / 100)"><span class="u">%</span></div>`;
  return `<div class="row"><label>${opts.l}</label><input type="number" step="${step}" value="${val}" onchange="set('${path}', +this.value)"><span class="u">${u}</span></div>`;
}

function card(title, inner, closed = false, id = '') {
  // id slouží kotvám v klouzající liště kalkulací (kalkLista) – kliknutí sroluje na kartu
  return `<div class="card ${closed ? 'closed' : ''}"${id ? ` id="${id}"` : ''}><h2 onclick="this.parentElement.classList.toggle('closed')">${title}</h2><div class="body">${inner}</div></div>`;
}

/* Krátké názvy kotev v liště PROJ (zadání z 29. 7. 2026). Mapuje se přes `key`
 * sekce, ne přes pořadí – kdyby se sekce někdy prohodily nebo přibyla nová,
 * kotvy se nerozjedou a chybějící klíč prostě spadne zpátky na název sekce.
 * Názvy samotných karet sekcí zůstávají beze změny. */
const KOTVY_PROJ = {
  zamereni: 'Zaměření', studie: 'Studie', projednani: 'Projednání studie',
  dpz: 'DPZ', ic: 'IČ', dps: 'DPS', ezc: 'EZC',
  kolaudace: 'Kolaudace', geodet: 'Geodetické zaměření',
};

/* ---------- klouzající lišta kalkulací (OCK i PROJ) ----------
 * Duplikáty Zpět/Znovu (třídy jsHistZpet/jsHistZnovu drží historie.js
 * ve stejném stavu jako tlačítka ve vrchní liště) + kotvy na sekce dané
 * záložky. Lišta je position:sticky, proto stojí ZA kartou hlavičky,
 * ne v ní – .card má overflow:hidden a sticky by uvnitř nefungovalo. */
function kalkLista(ock) {
  const chips = ock
    ? [['ock-zadani', 'Zadání šachty'], ['ock-profily', 'Dimenze profilů'], ['ock-prace', 'Práce a režie'],
       ['ock-kalkulace', 'Cenová kalkulace'], ['ock-sek-hrubaOck', 'Hrubá OCK'], ['ock-sek-oplasteni', 'Opláštění'],
       ['ock-sek-volitelne', 'Volitelné'], ['ock-sek-rezie', 'Režie'], ['ock-priplatky', 'Příplatky'],
       ['ock-sleva', 'Sleva'], ['ock-nabidka', 'Cenová nabídka']]
    : PJ.sekce.map((s, i) => ['proj-sek-' + i, KOTVY_PROJ[s.key] || s.nazev])
        .concat([['proj-sleva', 'Sleva'], ['proj-souhrn', 'Souhrn'], ['proj-nabidka', 'Cenová Nabídka']]);
  return `<div class="kalk-lista noprint">
    <button class="hist2 jsHistZpet" disabled onclick="historieZpet()">↶ Zpět</button>
    <button class="hist2 jsHistZnovu" disabled onclick="historieZnovu()">↷ Znovu</button>
    <span class="odd"></span>
    ${chips.map(([id, t]) => `<a class="dv-kotva" href="#${id}">${esc(t)}</a>`).join('')}
  </div>`;
}

/* ---------- sdílená hlavička: zakázka + přepínač otevřené varianty ----------
 * Zobrazuje se na začátku záložek Kalkulace OCK i Kalkulace PROJ, aby byl
 * kontext (jaká zakázka a která varianta se počítá) vždy na očích.
 * Kompletní správa a přehled variant zůstává v záložce „Přehled cenových nabídek". */
function zakazkaHlavicka(ock) {
  const akt = aktivniVarianta(ZAK), rid = ridiciVarianta(ZAK);
  zajistiProjHlavicku(ZAK);   // starší zakázka hlavičku PROJ ještě nemá – doplní se
  const opts = ZAK.varianty.map(v =>
    `<option value="${v.id}" ${v.id === akt.id ? 'selected' : ''}>${esc(v.nazev)}${v.ridici ? ' · řídící' : ''}</option>`).join('');
  const txt = (path, label) => `<div class="row"><label>${label}</label>
    <input type="text" value="${esc(get(path))}" onchange="set('${path}', this.value)"></div>`;

  /* IČO objednatele (zadání z 30. 7. 2026) – v hlavičce stojí mezi kontaktní
   * osobou a sazbou DPH. Vedle popisku svítí štítek, když je vyplněné IČO
   * neplatné podle kontrolní číslice. NEBLOKUJE se nic: pole jde uložit
   * i s chybou a nabídka se z něj vytiskne. Stejná chyba se objeví i v panelu
   * kontrol (#33) – tady je hned u pole, kde se opravuje. */
  const icoRow = (path) => {
    const h = get(path);
    const spatne = (typeof icoVyplneno === 'function') && icoVyplneno(h) && !icoPlatne(h);
    const pill = spatne ? `<span class="pill warn" style="margin-left:12px"
      title="osm číslic a kontrolní číslice nesedí – zkontrolujte překlep">neplatné IČO</span>` : '';
    /* Pod polem stojí dotaz do rejstříku (#10). Je to nabídka, ne krok
     * v postupu – hlavička se dá vyplnit ručně a nabídka odejde i tak. */
    const kde = path.indexOf('projHlavicka') >= 0 ? 'proj' : 'ock';
    const ares = (typeof aresRadek === 'function') ? aresRadek(kde) : '';
    return `<div class="row"><label>IČO objednatele${pill}</label>
      <input type="text" value="${esc(h)}" placeholder="8 číslic"
        title="IČO objednatele; přebírá ho krycí list. Prázdné pole se nikde nehlásí."
        onchange="set('${path}', this.value)"></div>${ares}`;
  };

  // indikátor řídící varianty přímo za popiskem „Otevřená varianta" (odsazený)
  const ridiciPill = `<span class="pill ${akt.ridici ? '' : 'mut'}" style="margin-left:12px" title="řídící = aktuálně platná varianta pro nabídku">${akt.ridici ? '✓ řídící' : 'není řídící'}</span>`;
  const variantaRow = `<div class="row"><label>Otevřená varianta${ridiciPill}</label>
    <select onchange="varAktivuj(this.value)" title="přepnout počítanou variantu">${opts}</select></div>`;
  const ridiciBtn = akt.ridici ? '' : `<div class="row"><label></label><button class="mini noprint" onclick="varRidici('${akt.id}')">nastavit jako řídící (platná je „${esc(rid.nazev)}")</button></div>`;
  const rezimRow = `<div class="row"><label>Režim výpočtu</label>
    <select onchange="set('OCK.fixes', this.value==='fix')" title="přepnutí opravený / 1:1 jako Excel">
      <option value="fix" ${OCK.fixes ? 'selected' : ''}>opravený</option>
      <option value="compat" ${!OCK.fixes ? 'selected' : ''}>1:1 jako Excel</option></select></div>`;
  const datumRow = `<div class="row na-konec"><label>Datum vytvoření</label>
    <input type="date" value="${esc(ZAK.datum)}" onchange="set('ZAK.datum', this.value)"></div>`;

  // globální přirážka (admin) + DPH ve světlých polích 2. sloupce
  /* Globální přirážka je nákladové číslo — kdo ji vidí, dopočítá si z ceny
   * náklad. Proto se řídí právem `pole.prirazka` a řádek se nekreslí vůbec;
   * dřívější třída `admin-only` uměla jen „admin / neadmin", ne přidělení roli. */
  const prirazkaRow = !smiZobrazit('pole.prirazka') ? '' : `<div class="row"><label>Globální přirážka</label>
    <span class="pct-wrap"><input type="number" step="1" value="${Math.round(C.marze * 10000) / 100}" onchange="set('C.marze', (+this.value) / 100)"> %</span></div>`;
  const dphRow = `<div class="row"><label>Sazba DPH</label>
    <select onchange="set('C.dph', +this.value)">
      <option value="0.12" ${C.dph === 0.12 ? 'selected' : ''}>12 % snížená</option>
      <option value="0.21" ${C.dph === 0.21 ? 'selected' : ''}>21 % základní</option></select></div>`;

  // PROJ má vlastní sazbu DPH (ceník PROJ) – projekční práce bývají v jiné sazbě než stavební část
  const dphRowProj = `<div class="row"><label>Sazba DPH</label>
    <select onchange="set('PC.dph', +this.value)">
      <option value="0.12" ${PC.dph === 0.12 ? 'selected' : ''}>12 % snížená</option>
      <option value="0.21" ${PC.dph === 0.21 ? 'selected' : ''}>21 % základní</option></select></div>`;
  const datumRowProj = `<div class="row na-konec"><label>Datum vytvoření</label>
    <input type="date" value="${esc(ZAK.projHlavicka.datum)}" onchange="set('ZAK.projHlavicka.datum', this.value)"></div>`;

  /* Globální přirážka PROJ (zadání 31. 7. 2026) – stejné místo i chování jako
   * v hlavičce OCK. Do 31. 7. se nastavovala jen v záložce Ceník nákladů PROJ,
   * takže při počítání nabídky nebyla vidět a nikdo si jí nevšiml. */
  const prirazkaRowProj = !smiZobrazit('pole.prirazka') ? '' : `<div class="row"><label>Globální přirážka</label>
    <span class="pct-wrap"><input type="number" step="1" value="${Math.round(PC.marze * 10000) / 100}" onchange="set('PC.marze', (+this.value) / 100)"> %</span></div>`;

  /* #17 – varianta převzatá z historické kalkulace nese větu o původu.
   * Bez ní by se po pár dnech nedalo poznat, že se nepočítalo od nuly, a
   * hlavně kterým ceníkem se počítalo. */
  const puvodVeta = (typeof puvodPopis === 'function') ? puvodPopis(akt) : '';
  const puvodRadek = puvodVeta ? `<div class="zak-puvod noprint">⤺ ${esc(puvodVeta)}</div>` : '';
  const archivBtn = `<button class="mini" onclick="otevriArchiv()"
    title="nahlédnout do uložených zakázek a převzít historickou kalkulaci jako alternativu">↩ Historická kalkulace…</button>`;

  /* Tlačítko „Převzít údaje z hlavičky OCK/PROJ" v liště obou kalkulací bylo
   * 5. 8. 2026 na pokyn zrušeno. Lišta kalkulace má nést jen to, co se dělá
   * pořád (uložit / načíst / nová zakázka, varianty), ne jednorázový úkon při
   * zakládání zakázky. Přenos hlavičky zůstal tam, kde se hlavičky vyplňují —
   * v Přehledu cenových nabídek u karty „Zakázka – hlavička PROJ“. */

  if (!ock) {   // Kalkulace PROJ – vlastní, na OCK nezávislá hlavička
    // Režim výpočtu se zde záměrně nezobrazuje: řídí ho engine OCK (vypocet),
    // nikoli vypocetProj, a nastavuje se v Kalkulaci OCK. Globální přirážka PROJ
    // (PC.marze) naopak od 31. 7. 2026 v hlavičce je – stejně jako v OCK –,
    // aby byla vidět při počítání nabídky; sazby zůstávají v Ceníku nákladů PROJ.
    const inner = `<div class="zak-head">
        <div class="zak-head-col">
          ${txt('ZAK.projHlavicka.cislo', 'Číslo nabídky (CN)')}${txt('ZAK.projHlavicka.nazevAkce', 'Název akce')}${txt('ZAK.projHlavicka.adresa', 'Adresa stavby')}${datumRowProj}
        </div>
        <div class="zak-head-col">
          ${txt('ZAK.projHlavicka.objednatel', 'Objednatel')}${txt('ZAK.projHlavicka.kontakt', 'Kontaktní osoba')}${icoRow('ZAK.projHlavicka.ico')}${dphRowProj}
        </div>
        <div class="zak-head-col">${variantaRow}${ridiciBtn}${prirazkaRowProj}</div>
      </div>${puvodRadek}
      <div class="zak-cena noprint">
        ${zakTrojice()}
        <span class="zak-cena-del"></span>
        <button class="mini" onclick="varNova()">+ Nová varianta (kopie otevřené)</button>
        ${archivBtn}
        <button class="mini" onclick="prepniTab('zakazka')">Přehled cenových nabídek →</button>
      </div>${zakUlozeniRadek()}`;
    return `<div class="card zak-bar"><div class="zak-bar-h">Zakázka a varianta</div><div class="body">${inner}</div></div>`
      + kalkLista(false);
  }

  const inner = `<div class="zak-head">
      <div class="zak-head-col">
        ${txt('ZAK.cislo', 'Číslo nabídky (CN)')}${txt('ZAK.nazevAkce', 'Název akce')}${txt('ZAK.adresa', 'Adresa stavby')}${datumRow}
      </div>
      <div class="zak-head-col">
        ${txt('ZAK.objednatel', 'Objednatel')}${txt('ZAK.kontakt', 'Kontaktní osoba')}${icoRow('ZAK.ico')}${dphRow}
      </div>
      <div class="zak-head-col">
        ${variantaRow}${ridiciBtn}${rezimRow}${prirazkaRow}
      </div>
    </div>${puvodRadek}
    <div class="zak-cena noprint">
      ${zakTrojice()}
      <span class="zak-cena-del"></span>
      <button class="mini" onclick="varNova()">+ Nová varianta (kopie otevřené)</button>
      ${archivBtn}
      <button class="mini" onclick="prepniTab('zakazka')">Přehled cenových nabídek →</button>
    </div>${zakUlozeniRadek()}`;
  return `<div class="card zak-bar"><div class="zak-bar-h">Zakázka a varianta</div><div class="body">${inner}</div></div>`
    + kalkLista(true);
}

/* Ruční přenos hlavičky mezi OCK a PROJ. Ptá se, jen pokud by přepsal
 * neprázdná a odlišná pole – pak vypíše, kterých se to týká. */
function zakHlavickaKopiruj(smer) {
  const doProj = smer === 'doProj';
  const cil = doProj ? 'Kalkulace PROJ' : 'Kalkulace OCK';
  const zdroj = doProj ? 'Kalkulace OCK' : 'Kalkulace PROJ';
  if (zakazkaHlavickyShodne(ZAK)) {
    alert('Obě hlavičky už mají shodné údaje – není co přenášet.');
    return;
  }
  const nazvy = { cislo: 'Číslo nabídky', nazevAkce: 'Název akce', adresa: 'Adresa stavby',
                  objednatel: 'Objednatel', kontakt: 'Kontaktní osoba',
                  ico: 'IČO objednatele', datum: 'Datum vytvoření' };
  const kolize = zakazkaHlavickaKolize(ZAK, smer);
  if (kolize.length && !confirm('Přenést údaje z hlavičky ' + zdroj + ' do hlavičky ' + cil + '?\n\n'
      + 'Přepíše se ' + kolize.length + ' již vyplněné pole:\n· '
      + kolize.map(k => nazvy[k] || k).join('\n· ')
      + '\n\nPo přenosu můžete kterékoli pole ručně upravit.')) return;
  zakazkaKopirujHlavicku(ZAK, smer);
  render();
}
/* Štítek režimu výpočtu v hlavičce (#2).
 * Výchozí režim je fixes:false, tedy 1:1 se šablonou v Excelu VČETNĚ jejích
 * osmi zdokumentovaných chyb. To je záměr (čísla musí sedět se starými
 * nabídkami), ale z obrazovky to dřív nešlo poznat – štítek psal jen
 * „kompatibilní s Excelem", což zní jako přednost, ne jako varování.
 * Proto je teď režim 1:1 označený oranžově a s vysvětlením v tooltipu.
 * Obnovuje se z render(), ne z renderOutputs(): kdyby výpočet spadl na chybě
 * v zadání, renderOutputs skončí předčasně a štítek by zůstal viset na
 * předchozí hodnotě – tedy lhal by přesně v okamžiku, kdy na tom záleží. */
function renderRezimPill() {
  const el = document.getElementById('rezimPill');
  if (!el) return;
  const opraveno = !!(OCK && OCK.fixes);
  el.textContent = opraveno ? 'výpočet: opravený' : 'výpočet: 1:1 jako Excel (vč. jeho chyb)';
  el.className = 'pill' + (opraveno ? '' : ' warn');
  el.title = opraveno
    ? 'Opravený režim: odstraněny známé chyby vzorců v šabloně. Výsledky se mohou lišit od starých nabídek počítaných v Excelu.'
    : 'Režim shody s Excelem: vzorce se chovají přesně jako šablona VZOR, včetně jejích osmi zdokumentovaných chyb. Vhodné pro porovnání se staršími nabídkami. Přepnout lze v hlavičce kalkulace.';
}

function renderKalkHlavicka() {
  const el = document.getElementById('kalk-hlavicka');
  if (el) el.innerHTML = zakazkaHlavicka(true);   // v OCK i s přepínačem režimu výpočtu
}
function renderNabidkaOck() {
  const el = document.getElementById('kalk-nabidka');
  if (el) el.innerHTML = slevaKarta() + zaokrKarta()
    + card('Cenová nabídka (CN)', nabidkaKarta(), false, 'ock-nabidka');
}

/* ---------- Sleva (ZAK-10): zadání, stropy dle role, schvalování ---------- */
/* Přepočte a uloží stav slevy do SL; ruční rozhodnutí drží, dokud se nezmění %.
 *
 * Samotný stavový automat („do stropu projde sám, nad strop čeká, pod marží
 * nelze") se 5. 8. 2026 přestěhoval do `schvalovani.js` – tady visel uvnitř
 * vykreslovací funkce, takže se nedal prověřit bez prohlížeče a schvalování
 * v nové záložce by muselo pravidla opsat podruhé. Dvě kopie stejného pravidla
 * se dřív nebo později rozejdou; proto jen jedna, v CORE, s vlastní testovou
 * sadou (`test_schvalovani.js`).
 *
 * Uzamčená varianta se nepřepočítává: co odešlo zákazníkovi, je doklad. Stav
 * slevy se v ní jen zobrazí tak, jak byl v okamžiku tisku. */
function slevaRefreshStav() {
  let r = null; try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  if (!r) return null;
  const v = slevaVyhodnot(r.souhrn.zakladCena, r.souhrn.zakladNaklad, SL, NAST.slevy);
  const zamceno = (typeof variantaUzamcena === 'function')
    && variantaUzamcena(aktivniVarianta(ZAK));
  if (!zamceno) schvalovaniPrepocti(SL, v);
  return v;
}
function slevaSetProc(val) { SL.procenta = Math.max(0, +val || 0); render(); }
function slevaSetRole(val) { SL.role = val; render(); }
function slevaSetSchema(val) { SL.schema = val; render(); }
/* render() i tady: karta slevy je v aplikaci dvakrát (OCK i PROJ) nad jedním
 * stavem a instance, ve které se poznámka NEnapsala, by jinak při nejbližším
 * překreslení vrátila starý text (audit 1. 8. 2026, N5). onchange pálí až
 * při opuštění pole, takže překreslení kurzor nekrade. */
function slevaSetPozn(val) { SL.poznamka = val; render(); }
/* `slevaSetSchvalitel` a `slevaSchval` tu skončily 5. 8. 2026: schvalování
 * má vlastní záložku (`ui/schvalovani_ui.js`). Pole `SL.schvalitel` ve
 * starých zakázkách zůstává – migrace rolí v `zakazka.js` ho dál převádí,
 * aby se archivní data nerozbila. */
function slevaZrus() { Object.assign(SL, slevaDefault()); render(); }

/* Maximum globální slevy v % pro UI (výchozích 30 %; nastavuje se
 * v Nastavení → Slevy jako podíl, stejně jako minMarze). */
function slevaGlobalniMaxPct() {
  const v = NAST && NAST.slevy ? NAST.slevy.maxGlobalni : null;
  const podil = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0.30;
  return Math.round(podil * 1000) / 10;
}

/* Obsluha pole „Globální sleva PROJ": kladné zadání → záporné uložení,
 * přistřižené na 0 až firemní maximum (audit 1. 8. 2026, N4). Přistřihává
 * se tady, ne ve výpočtu – vypocetProj musí umět i přirážku a starší data
 * mimo mez má nahlásit kontrola, ne tiše přepsat. */
function pjSlevaGlobal(val) {
  const omez = Math.max(0, Math.min(slevaGlobalniMaxPct(), +val || 0));
  set('PJ.slevaPct', -omez);
}

/* Karta stojí pod výpočtem OCK i pod výpočtem PROJ (zadání 1. 8. 2026:
 * „sekce sleva na nabídku … tak jak to máme v kalkulaci OCK, tzn. pod
 * výpočetním oknem"). Je to jedna karta nad jedním stavem SL – vykreslená
 * podruhé s vlastní kotvou. V kalkulaci PROJ k ní přibude pole globální slevy
 * PROJ, které se sem přestěhovalo z hlavičky. */
function slevaKarta(kontext) {
  const proj = kontext === 'proj';
  const v = slevaRefreshStav();

  /* Globální sleva PROJ (PJ.slevaPct) se 1. 8. 2026 přestěhovala z hlavičky
   * kalkulace sem, k ostatním slevám. Zadává se KLADNĚ jako poskytnutá sleva,
   * v datech zůstává záporné číslo – stejné pole u sekce umí i přirážku
   * (+30 % u zaměření), a obracet znaménko ve výpočtu by rozbilo sekce.
   * Sekce s vlastním % globální slevu nepřebírají.
   *   Sleva ZAK-10 nad tím se počítá z ceny šachty (OCK); že jsou to dvě
   * různé věci, říká karta rovnou nahlas, ať nikdo nehledá, proč se procento
   * shora neprojevilo v projekci. Pole je jako dřív jen pro admina.
   *   Meze: 0 až firemní maximum (audit 1. 8. 2026, N4) – překlep 150 místo 15
   * dělal zápornou cenu, na kterou hlídání marže nezareaguje (marže z ceny
   * ≤ 0 neexistuje). Obsluha hodnotu navíc přistřihne, protože max na inputu
   * je jen nápověda prohlížeče, ne zábrana. Hodnoty mimo mez došlé importem
   * hlídá kontrola „slevaProjMax" v kontroly.js. */
  const projBlok = (proj && typeof kalkSloupce === 'function' && kalkSloupce().admin)
    ? `<div class="row" style="max-width:520px;margin-top:10px">
         <label>Globální sleva PROJ <span class="note">(sekce s vlastním % ji nepřebírají)</span></label>
         <span class="pct-wrap"><input type="number" step="1" min="0" max="${slevaGlobalniMaxPct()}" value="${-(PJ.slevaPct || 0)}"
           onchange="pjSlevaGlobal(this.value)"> %</span></div>
       <div class="note">Sleva na nabídku (ZAK-10) výše se počítá z ceny výtahové šachty (OCK);
         projekční práce mají vlastní globální slevu v tomhle poli, nejvýš ${slevaGlobalniMaxPct()} %
         (mez se nastavuje v Nastavení → Slevy). V nabídce i v krycím listu se obě vykazují zvlášť.</div>`
    : '';

  /* Bez výpočtu OCK se sleva ZAK-10 vyhodnotit nedá – počítá se z ceny šachty.
   * Karta se ale kvůli tomu nesmí ztratit celá: v PROJ nese i globální slevu
   * projekce, která s OCK nesouvisí (audit 1. 8. 2026, N6 – v v31.7.7 pole
   * žilo v hlavičce a chyba OCK na něj nedosáhla; přesunem sem se na ni
   * navázalo). V OCK zůstává dosavadní chování: bez výpočtu není co ukázat. */
  if (!v) {
    if (!proj) return '';
    const inner = `<div class="note">Sleva na nabídku (ZAK-10) se počítá z ceny výtahové šachty
        a výpočet OCK se teď nepodařil – zadání ZAK-10 je v záložce Kalkulace OCK.</div>${projBlok}`;
    return card('Sleva na nabídku (ZAK-10)', inner, false, 'proj-sleva');
  }
  const schemata = NAST.slevy.schemata || [];
  const schemaOpts = ['<option value="">— schéma slevy —</option>']
    .concat(schemata.map(s => `<option ${s.nazev === SL.schema ? 'selected' : ''}>${esc(s.nazev)}</option>`)).join('');
  const roleOpts = NAST.role.map(rr => `<option ${rr === SL.role ? 'selected' : ''}>${esc(rr)}</option>`).join('');
  const strop = v.strop;

  /* Stavů je pět, ale „zamítnuto" znamená dvě různé věci: buď slevu srazila
   * pod minimální marži (rozhodnout o ní nemůže nikdo), nebo ji někdo konkrétní
   * zamítl (a po snížení procenta půjde znovu). Rozliší je kategorie ze
   * `schvalovani.js` – v kartě se to musí poznat, protože rada uživateli je
   * v každém případě jiná. */
  const kat = schvalovaniKategorie(SL);
  const stavMap = {
    bez: ['mut', 'bez slevy'],
    auto: ['', '✓ schváleno automaticky (v mezích role)'],
    schvaleno: ['', '✓ schváleno – ' + esc(SL.schvalil || 'nadřízený')],
    ceka: ['warn', '⏳ čeká na rozhodnutí – záložka Schvalování slev'],
    zamitnuto: ['neg', '✕ zamítnuto – ' + esc(SL.zamitl || 'nadřízeným')],
    podMarzi: ['neg', '✕ pod minimální marží – nelze schválit'],
  };
  const [pillCls, pillTxt] = stavMap[kat] || ['mut', String(SL.stav || '')];
  const pct = x => (Math.round(x * 10000) / 100).toLocaleString('cs-CZ') + ' %';

  const dopad = +SL.procenta > 0 ? `<table class="sd-tbl" style="max-width:520px;margin-top:6px">
      <tr><td>Cena před slevou (bez DPH)</td><td style="text-align:right">${fmt0(v.cenaPoSleve + v.slevaKc)}</td></tr>
      <tr><td>Sleva ${pct(v.procenta)}</td><td style="text-align:right;color:#b91c1c">− ${fmt0(v.slevaKc)}</td></tr>
      <tr><td><b>Cena po slevě (bez DPH)</b></td><td style="text-align:right;font-weight:700">${fmt0(v.cenaPoSleve)}</td></tr>
      <tr><td>Marže po slevě <span class="note">(min. ${pct(v.minMarze)})</span></td>
        <td style="text-align:right;color:${v.podMarzi ? '#b91c1c' : '#15803d'}">${pct(v.marzePoSleve)}</td></tr>
      <tr><td>Strop role „${esc(SL.role)}"</td><td style="text-align:right">${pct(strop)}</td></tr>
    </table>` : '<div class="note">Zadej slevu v % z ceny bez DPH. Do stropu role projde automaticky, nad strop půjde ke schválení.</div>';

  /* Rozhodnutí o slevě se odsud 5. 8. 2026 přestěhovalo do vlastní záložky.
   * Do té doby tu stálo tlačítko „Schválit slevu" i rozbalovací seznam
   * „Schvaluje (nadřízený)" – kdokoli měl kartu na obrazovce, odklepl si
   * vlastní žádost sám a do zakázky se zapsala jen ROLE, ne člověk. Tady
   * proto zůstává jen stav a odkaz, kde se rozhoduje; rozhodovat smí ten,
   * komu administrátor přidělil právo „Schvalování slevy nad strop role". */
  const schvalBlok = kat === 'ceka'
    ? `<div class="note" style="margin-top:6px">Sleva přesahuje strop role „${esc(SL.role)}"
         (${pct(strop)}), takže čeká na rozhodnutí. Rozhoduje se v záložce
         <b>Schvalování slev</b>${schvalovaniKdoMuze(+SL.procenta || 0, NAST.slevy, NAST.role).length
           ? ' – o téhle slevě může rozhodnout: '
             + esc(schvalovaniKdoMuze(+SL.procenta || 0, NAST.slevy, NAST.role).join(', ')) : ''}.
         ${tabViditelny('schvalovani')
           ? '<button class="mini" style="margin-left:6px" onclick="prepniTab(\'schvalovani\')">Přejít na schvalování</button>' : ''}</div>`
    : (kat === 'schvaleno' && SL.schvalilKdy
        ? `<div class="note">Schválil: <b>${esc(SL.schvalil)}</b> · ${new Date(SL.schvalilKdy).toLocaleString('cs-CZ')}</div>`
        : (kat === 'zamitnuto'
            ? `<div class="note">Zamítl: <b>${esc(SL.zamitl || 'nadřízený')}</b>${SL.zamitlKdy
                ? ' · ' + new Date(SL.zamitlKdy).toLocaleString('cs-CZ') : ''}${SL.zamitnutoDuvod
                ? ' – ' + esc(SL.zamitnutoDuvod) : ''}. Sníženou slevu lze poslat ke schválení znovu.</div>` : ''));

  const inner = `<div class="zak-head" style="grid-template-columns:1fr 1fr 1fr">
      <div class="row"><label>Schéma slevy</label><select onchange="slevaSetSchema(this.value)">${schemaOpts}</select></div>
      <div class="row"><label>Role zadavatele</label><select onchange="slevaSetRole(this.value)">${roleOpts}</select></div>
      <div class="row"><label>Sleva</label><span class="pct-wrap"><input type="number" step="0.5" min="0" value="${+SL.procenta || 0}" onchange="slevaSetProc(this.value)"> %</span></div>
    </div>
    <div class="row" style="max-width:100%"><label>Poznámka ke slevě</label>
      <input type="text" value="${esc(SL.poznamka || '')}" onchange="slevaSetPozn(this.value)" placeholder="důvod, kampaň, partner…"></div>
    <div style="margin-top:6px">Stav: <span class="pill ${pillCls}">${pillTxt}</span>
      ${slevaPlati(SL) ? '<span class="note" style="margin-left:8px">propíše se do ceny nabídky ↓</span>' : (+SL.procenta > 0 ? '<span class="note" style="margin-left:8px">neschválená sleva se do nabídky nepropíše</span>' : '')}</div>
    ${dopad}${schvalBlok}${projBlok}
    ${+SL.procenta > 0 ? '<div class="btns" style="margin-top:6px"><button class="mini" onclick="slevaZrus()">Zrušit slevu</button></div>' : ''}`;
  return card('Sleva na nabídku (ZAK-10)', inner, false, proj ? 'proj-sleva' : 'ock-sleva');
}

/* Výsledky výpočtů pro libovolnou variantu (pro přehledy) */
function spocitejVariantu(v) {
  let ock = null, proj = null;
  try { ock = vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes); } catch (e) {}
  try { proj = vypocetProj(v.data.proj.zadani, v.data.proj.cenik); } catch (e) {}
  return { ock, proj };
}

/* ================= TISKOVÝ NÁHLED S RUČNÍMI ÚPRAVAMI (TISK-1) =================
 * Náhledy dokumentů (cenová nabídka, krycí listy, detail výpočtu) se otevírají
 * v samostatném okně a tisknou se do PDF. Před uložením je často potřeba text
 * ještě doladit – dopsat větu, upravit formulaci, škrtnout odstavec.
 *
 * Lišta níže proto umí přepnout náhled do režimu ruční úpravy (contenteditable
 * nad obsahem v <div id="dok">) a kdykoli vrátit původní znění vygenerované
 * z kalkulace. ÚPRAVY PLATÍ JEN PRO TENTO VÝTISK – do zakázky ani do kalkulace
 * se nepropisují, takže se čísla v aplikaci nemohou nepozorovaně rozejít.
 *
 * Použití v náhledu: tiskListaCss() do <style>, tiskListaHtml() na začátek
 * <body>, obsah zabalit do <div id="dok">…</div> a na konec tiskListaSkript().
 * ============================================================================ */

/* CSS pro lištu a vizuální označení rozepsaného dokumentu (do <style> náhledu) */
function tiskListaCss() {
  return `#dok.editace{outline:2px dashed #93b4f7;outline-offset:8px;border-radius:6px;background:#fdfeff}
    #dok.editace:focus{outline-color:#1d4ed8}
    .bar .stav{margin-left:12px;color:#6b7686;font-size:11.5px}
    .bar label.edit{margin-left:12px;font-size:12.5px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none}
    .bar button.sek{background:#fff;color:#1d4ed8}
    .zamek-tisk{background:#fff7ed;border:1px solid #fdba74;color:#7c2d12;border-radius:6px;
      padding:7px 11px;margin:0 0 8px;font-size:12px;line-height:1.5}
    .cenik-stari{background:#fef3c7;border:1px solid #fcd34d;color:#78350f;border-radius:6px;
      padding:7px 11px;margin:0 0 8px;font-size:12px;line-height:1.5}
    .marze-lista{background:#fff1f2;border:1px solid #fda4af;color:#881337;border-radius:6px;
      padding:7px 11px;margin:0 0 8px;font-size:12px;line-height:1.5}
    .kontroly-tisk{background:#fffbeb;border:1px solid #fbbf24;color:#78350f;border-radius:6px;
      padding:7px 11px;margin:0 0 8px;font-size:12px;line-height:1.5}
    @media print{#dok.editace{outline:0;background:#fff}}`;
}

/* Ovládací lišta náhledu. Popisky lze přeložit (v cizojazyčné mutaci nabídky).
 *
 * o.zamekTyp – typ dokumentu podle ZAMEK_DOKUMENTY (#34). Je-li vyplněný a jde
 * o dokument, který jde zákazníkovi, doplní lišta viditelné upozornění, že
 * tiskem se varianta uzamkne. Upozornění patří sem, nad tlačítko tisku:
 * zámek se armuje na otevření tiskového dialogu, takže i zrušený Ctrl+P
 * variantu zamkne – a to musí uživatel vědět předem, ne až potom. */
function tiskListaHtml(o) {
  o = o || {};
  const btnTisk = o.tisk || 'Tisk / Uložit jako PDF';
  const btnUpravy = o.upravy || 'Upravit text před tiskem';
  const btnVratit = o.vratit || 'Vrátit původní znění';
  const pozn = o.pozn || '';
  const zamyka = o.zamekTyp && typeof dokumentZamyka === 'function' && dokumentZamyka(o.zamekTyp);
  const varovani = zamyka
    ? `<div class="zamek-tisk noprint">🔒 ${esc(o.zamekPozn
        || 'Tisk se bere jako odeslání nabídky – varianta se tím uzamkne proti dalším úpravám. '
         + 'Pokračovat se pak dá jejím klonem (další číslo nabídky). Zámek se aktivuje už otevřením '
         + 'tiskového dialogu, tedy i když tisk nakonec zrušíte.')}</div>`
    : '';
  /* #35 – poslední místo, kde má smysl na starý ceník upozornit: za chvíli to
   * odejde ven. Tlačítka se sem nedávají, náhled běží ve vlastním okně a na
   * funkce aplikace by nedosáhl – opravuje se to na záložce Ceník. */
  const stari = (typeof cenikStariLista === 'function')
    ? cenikStariLista({ bezTlacitek: true }) : '';
  /* #40 – a úplně nahoru to nejhorší, co se může stát: dokument spočítaný
   * z vymyšlených cen na cestě k zákazníkovi. */
  const ukazka = (typeof ukazkoveTiskLista === 'function') ? ukazkoveTiskLista() : '';
  /* #36 – totéž pro marži. Náhled odchází ven, takže se tu čísla o nákladech
   * neukazují nikomu; kdo na ně má právo, vidí je v kalkulaci. */
  const marze = (typeof marzeLista === 'function')
    ? marzeLista({ bezCisel: true }) : '';
  /* #33 – deset otázek, které by položil kolega přes rameno. Tady je poslední
   * místo, kde je ještě co zastavit; bez čísel, náhled odchází ven. */
  const kontroly = (typeof kontrolyTiskLista === 'function') ? kontrolyTiskLista() : '';
  return `${ukazka}${varovani}${stari}${marze}${kontroly}<div class="bar noprint">
    <button onclick="window.print()">🖨 ${esc(btnTisk)}</button>
    <label class="edit"><input type="checkbox" id="tiskEditCheck" onchange="tiskEditace(this.checked)"> ✏️ ${esc(btnUpravy)}</label>
    <button class="sek" onclick="tiskVratPuvodni()">↺ ${esc(btnVratit)}</button>
    <span class="stav" id="tiskStav">${esc(pozn)}</span>
  </div>`;
}

/* Skript vkládaný do okna náhledu (ne do aplikace – proto je zapsaný jako text).
 * Značka scr+ipt je níže rozdělená, aby neukončila skript v sestavené aplikaci. */
/* zamek = { typ, varId } – viz #34. Náhled běží ve vlastním okně, do aplikace
 * si sáhne přes window.opener. Posloucháme beforeprint, ne kliknutí na tlačítko:
 * tisknout jde i přes Ctrl+P nebo nabídku prohlížeče a nezamčená odeslaná
 * nabídka je horší chyba než zámek navíc (klon je jedno kliknutí). */
function tiskListaSkript(hlasky, zamek) {
  const h = Object.assign({
    zap: 'Úpravy zapnuté – klikněte do dokumentu a pište. Změny platí jen pro tento výtisk.',
    vyp: 'Úpravy vypnuté. Ruční změny zůstávají, jen se do dokumentu už nedá psát.',
    vraceno: 'Vráceno původní znění z kalkulace.',
    zamceno: 'Varianta byla uzamčena jako odeslaná nabídka. Další úpravy provádějte v jejím klonu.',
  }, hlasky || {});
  const z = (zamek && zamek.typ && typeof dokumentZamyka === 'function' && dokumentZamyka(zamek.typ))
    ? { typ: zamek.typ, varId: zamek.varId || '' } : null;
  return '<scr' + 'ipt>'
    + 'var TISK_PUVODNI = null;\n'
    + 'var TISK_HLASKY = ' + JSON.stringify(h) + ';\n'
    + 'var TISK_ZAMEK = ' + JSON.stringify(z) + ';\n'
    + 'var TISK_ZAMEK_KDY = 0;\n'
    + 'function tiskStav(t){var s=document.getElementById("tiskStav");if(s)s.textContent=t||"";}\n'
    + 'function tiskZamkni(){if(!TISK_ZAMEK)return;'
    // beforeprint umí v některých prohlížečích přijít vícekrát za jeden tisk;
    // druhý záznam do historie výtisků by pak byl falešný.
    + 'var t=Date.now();if(t-TISK_ZAMEK_KDY<3000)return;TISK_ZAMEK_KDY=t;'
    + 'try{if(window.opener&&!window.opener.closed&&typeof window.opener.zamekPoTisku==="function"){'
    + 'window.opener.zamekPoTisku(TISK_ZAMEK.typ,TISK_ZAMEK.varId);tiskStav(TISK_HLASKY.zamceno);}}catch(e){}}\n'
    + 'window.addEventListener("beforeprint",tiskZamkni);\n'
    + 'function tiskEditace(zap){var d=document.getElementById("dok");if(!d)return;'
    + 'if(TISK_PUVODNI===null)TISK_PUVODNI=d.innerHTML;'
    + 'd.contentEditable=zap?"true":"false";'
    + 'if(zap)d.classList.add("editace");else d.classList.remove("editace");'
    + 'tiskStav(zap?TISK_HLASKY.zap:TISK_HLASKY.vyp);if(zap)d.focus();}\n'
    + 'function tiskVratPuvodni(){var d=document.getElementById("dok");'
    + 'if(d&&TISK_PUVODNI!==null)d.innerHTML=TISK_PUVODNI;tiskStav(TISK_HLASKY.vraceno);}\n'
    + '<\/scr' + 'ipt>';
}

/* ============================================================================
 * JEDNOTNÁ HLAVIČKA (LOGO) A PATIČKA TISKOVÝCH DOKUMENTŮ
 *
 * Logo i patička jsou u OBOU cenových nabídek – OCK i PROJ – shodné a berou se
 * z firemních údajů (Nastavení → Firma), tedy ze zdroje cenové nabídky OCK.
 * Musí být uvedeny VŽDY: není-li nahrané logo, vypíše se aspoň název firmy;
 * nejsou-li vyplněné kontakty, patička obsahuje aspoň název firmy.
 * Jedno místo pro obojí = obě nabídky se nemohou rozejít.
 * ============================================================================ */

/* CSS loga a patičky do <style> tiskového náhledu */
function dokHlavickaCss() {
  return `.logo{max-height:60px;max-width:250px;display:block;margin-bottom:10px}
    .logo-text{font-size:17px;font-weight:700;letter-spacing:.04em;color:#1d4ed8;margin-bottom:10px}
    .paticka{margin-top:22px;padding-top:8px;border-top:1px solid #e5e9f0;font-size:11px;color:#6b7686;text-align:center}`;
}

/* Logo firmy do hlavičky dokumentu; bez nahraného loga alespoň název firmy. */
function dokLogoHtml() {
  const f = (typeof firmaAktualni === 'function') ? firmaAktualni() : null;
  if (!f) return '';
  const nazev = (typeof firmaHodnota === 'function') ? firmaHodnota(f, 'nazev') : (f.nazev || '');
  if (f.logo) return `<img class="logo" src="${esc(f.logo)}" alt="${esc(nazev)}">`;
  return nazev ? `<div class="logo-text">${esc(nazev)}</div>` : '';
}

/* Patička dokumentu (firemní údaje + zpracovatel). prekl = funkce překladu popisků. */
function dokPatickaHtml(prekl) {
  const P = typeof prekl === 'function' ? prekl : (t => t);
  const f = (typeof firmaAktualni === 'function') ? firmaAktualni() : null;
  if (!f) return '';
  const h = id => (typeof firmaHodnota === 'function') ? firmaHodnota(f, id) : (f[id] || '');
  const text = ((typeof firmaPaticka === 'function') ? firmaPaticka(f) : '') || h('nazev');
  if (!text) return '';
  const zprac = h('zpracoval');
  const kontakt = zprac ? [zprac, h('zpracovalTelefon'), h('zpracovalEmail')].filter(Boolean).join(', ') : '';
  return `<div class="paticka">${esc(text)}${kontakt
    ? '<br>' + esc(P('Vypracoval') + ': ' + kontakt) : ''}</div>`;
}

/* ---------- záložky ---------- */
let TAB = 'kalk';
const TABY = ['kalk', 'detail', 'spec', 'specdata', 'kryci', 'proj', 'kryciproj', 'cenik', 'cenikproj', 'zakazka', 'schvalovani'];
function prepniTab(t) {
  if (!tabViditelny(t)) t = 'kalk';
  TAB = t;
  TABY.forEach(x => {
    document.getElementById('page-' + x).style.display = x === t ? '' : 'none';
    document.getElementById('tab-' + x).className = (x === t ? 'act' : '') + (tabViditelny(x) ? '' : ' skryt');
  });
  document.body.dataset.tab = t;
}
/* promítne viditelnost záložek (Nastavení) do navigace */
function aplikujViditelnostTabu() {
  TABY.forEach(x => {
    const b = document.getElementById('tab-' + x);
    if (b) b.style.display = tabViditelny(x) ? '' : 'none';
  });
  if (!tabViditelny(TAB)) prepniTab('kalk');
}

/* ---------- #42: neúspěšný zápis do složky ----------
 *
 * Složka na disku není databáze se serverem – zápis může selhat, protože
 * Drive zrovna nesynchronizuje, oprávnění vypršelo nebo je disk plný.
 * Aplikace to nesmí spolknout: dokud se soubor nezapíše, změna existuje
 * jen v paměti okna a se zavřením zmizí.
 *
 * Proto tenhle pruh přes celou hlavičku. Karty v Nastavení nestačí – kdo
 * ceník zveřejní a přepne se do kalkulace, už se na ni nepodívá. */

function zapisTridaHlasky(typ) {
  if (typ === 'chyba') return 'seznam-chyba';
  if (typ === 'varovani') return 'seznam-varovani';
  return 'seznam-prazdno';
}

/* Co se právě nepodařilo uložit. Vrací pole popisů; prázdné = klid. */
function zapisSelhani() {
  const s = [];
  if (typeof NASTDB_STAV !== 'undefined' && NASTDB_STAV.zapisSelhal)
    s.push({ co: 'nastavení', soubor: (typeof NASTDB_SOUBOR !== 'undefined') ? NASTDB_SOUBOR : '_nastaveni.json',
             akce: 'nastdbUlozHned()', stahni: 'nastdbStahni()' });
  if (typeof PROG_STAV !== 'undefined' && PROG_STAV.zapisSelhal)
    s.push({ co: 'ceník programu', soubor: (typeof PROG_SOUBOR !== 'undefined') ? PROG_SOUBOR : '_program.json',
             akce: 'progZverejni()', stahni: 'progStahni()' });
  return s;
}

function zapisLista() {
  const s = zapisSelhani();
  if (!s.length) return '';
  const co = s.map(x => x.co).join(' a ');
  const soubory = s.map(x => x.soubor).join(', ');
  const tlacitka = s.map(x => `<button class="mini" onclick="${x.akce}">Zkusit znovu (${esc(x.soubor)})</button>
      <button class="mini" onclick="${x.stahni}">Stáhnout ${esc(x.soubor)}</button>`).join(' ');
  return `<div class="zapis-lista">
    <span class="ikona">⛔</span>
    <span>Uložení do složky selhalo – ${esc(co)} se nepodařilo zapsat do ${esc(soubory)}.
      Změny zatím nejsou na disku a se zavřením okna se ztratí. Zkuste to znovu,
      nebo si soubor stáhněte a nakopírujte do složky <b>_DB</b> ručně.</span>
    <span class="sp"></span>
    ${tlacitka}
  </div>`;
}

function renderZapisLista() {
  const el = document.getElementById('zapisLista');
  if (el) el.innerHTML = zapisLista();
}

/* Nabídne text ke stažení jako soubor. Používá se jako záchranná cesta,
 * když zápis do složky selže (#42): data se dají stáhnout do Stažených a
 * ručně nakopírovat do _DB, takže rozdělaná práce nepřijde vniveč. */
function souborKeStazeni(jmeno, text, typ) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: typ || 'application/json' }));
  a.download = jmeno;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/* ---------- uložit / načíst zakázku (StorageAdapter 'file') ---------- */
function ulozZakazku() {
  // #41: co je rozepsané, se do protokolu dopíše ještě před exportem –
  // uložený soubor má nést protokol k okamžiku uložení, ne o dvě vteřiny starší.
  if (typeof protokolZapisTed === 'function') protokolZapisTed();
  const blob = new Blob([StorageAdapter.exportuj(ZAK)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = StorageAdapter.nazevSouboru(ZAK);
  a.click();
  // od téhle chvíle je stav na disku – varování při odchodu už není na místě
  if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
  // a nouzová záloha v prohlížeči tím ztratila smysl (jinak se na ni aplikace
  // ptá při každém dalším spuštění, i když je práce dávno v souboru)
  if (typeof historieZalohaHotovo === 'function') historieZalohaHotovo();
}
function nactiZakazku(ev) {
  const f = ev.target.files[0]; if (!f) return;
  f.text().then(t => {
    try {
      ZAK = StorageAdapter.importuj(t); syncVarianta();
      // #18: hledání a filtr patří k oknu, ne k datům – jiná zakázka se musí
      // ukázat celá, ne přes zúžení nastavené nad tou předchozí.
      if (typeof seznamReset === 'function') seznamReset();
      render();
      if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
      // #35: nejčastější případ starého ceníku je právě tenhle – otevřel se
      // soubor odložený před půl rokem. Věta jde do stavového řádku nabídky,
      // opravit se to dá na záložce Ceník; nic se neblokuje.
      if (typeof cenikPrehledAkt === 'function') {
        const p = cenikPrehledAkt();
        if (p && p.varovat && typeof nabidkaStavTextBezpecne === 'function')
          nabidkaStavTextBezpecne(cenikVarovaniText(p) + ' Rozdíly a přepočet najdete na záložce Ceník.');
      }
    }
    catch (e) { alert('Soubor se nepodařilo načíst: ' + e.message); }
    ev.target.value = '';
  });
}

/* ---------- hlavní render ---------- */
/* Přihlášení se kreslí ODDĚLENĚ od zbytku aplikace.
 *
 * Poučení z 5. 8. 2026: přihlašovací lištu i celoplošný překryv kreslil až
 * onlineTik() jako úplně poslední krok render(). Když se cokoli mezitím
 * pokazilo, uživateli zůstala hlavička bez panáčka, bez „Přihlásit se"
 * a bez překryvu – aplikace vypadala funkčně, ale k přihlášení nevedla
 * žádná cesta. Přihlášení je jediný ovládací prvek, přes který se dá
 * z rozbitého stavu dostat ven, takže se kreslí PRVNÍ a nesmí záviset na
 * tom, že se povedlo překreslit tabulky. */
function renderPrihlaseniNejdriv() {
  try {
    if (typeof renderPrihlaseni === 'function') renderPrihlaseni();
    if (typeof renderOnlineLista === 'function') renderOnlineLista();
  } catch (e) { /* i tohle smí selhat – zbytek aplikace se překreslí dál */ }
}

/* Viditelné hlášení místo tiché poloviční obrazovky. Chyba se navíc vyhodí
 * asynchronně dál, aby ji zachytily testy (pageerror) i konzole prohlížeče –
 * skrytá chyba je horší než hlášená. */
function renderChybaBanner(e) {
  let el = document.getElementById('render-chyba');
  if (!el) {
    el = document.createElement('div');
    el.id = 'render-chyba';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:300;background:#b00020;'
      + 'color:#fff;padding:8px 12px;font:13px/1.45 system-ui,sans-serif';
    document.body.appendChild(el);
  }
  el.textContent = 'Překreslení skončilo chybou: ' + ((e && e.message) || e)
    + ' — část obrazovky může být neaktuální. Uložte rozpracovanou zakázku a obnovte stránku (F5).';
  el.style.display = 'block';
}

function render() {
  renderPrihlaseniNejdriv();
  try {
    renderTelo();
    const b = document.getElementById('render-chyba');
    if (b) b.style.display = 'none';
  } catch (e) {
    renderChybaBanner(e);
    renderPrihlaseniNejdriv();          // ať zůstane cesta k přihlášení
    setTimeout(() => { throw e; });
  }
}

function renderTelo() {
  document.body.classList.toggle('role-user', !NAST.jeAdmin);
  document.body.classList.toggle('muze-admin', smiPohledAdmina());
  /* Ozubené kolo je jediný prvek, který se dál schovává třídou (je v šabloně,
   * ne v generovaném HTML). Dřív se řídilo třídou `role-user`; teď právem
   * `nastaveni.otevrit`, aby šlo Nastavení otevřít i vedoucímu. */
  document.body.classList.toggle('smi-nastaveni', smiZobrazit('nastaveni.otevrit'));
  /* „Zobrazit náklady" je přepínač uživatele, `sloupce.naklad` je právo od
   * administrátora. Sloupce se ukážou jen když platí obojí — bez práva zůstává
   * přepínač bez účinku, aby si obchodník nemohl nákladovou cenu odemknout sám. */
  document.body.classList.toggle('skryt-naklady', !(smiZobrazit('sloupce.naklad') && NAST.zobrazitNaklady));
  // #34: obalení zapisujících funkcí je jednorázové, ale musí proběhnout až
  // po sestavení celé aplikace – proto tady, ne na úrovni souboru.
  if (typeof zamekChranFunkce === 'function') zamekChranFunkce();
  if (typeof variantaUzamcena === 'function')
    document.body.classList.toggle('zamceno', variantaUzamcena(aktivniVarianta(ZAK)));
  if (typeof renderZamekLista === 'function') renderZamekLista();
  if (typeof renderZapisLista === 'function') renderZapisLista();
  if (typeof renderUkazkoveLista === 'function') renderUkazkoveLista();
  if (typeof renderBuildLista === 'function') renderBuildLista();
  renderRezimPill();
  renderKalkHlavicka();
  renderInputs(); renderOutputs();
  renderNabidkaOck();
  renderDetail();
  renderTechspec();
  renderSpecData();
  renderKryci();
  renderProj();
  renderKryciProj();
  renderCenik();
  renderCenikProj();
  renderZakazka();
  if (typeof renderSchvalovani === 'function') renderSchvalovani();
  aplikujViditelnostTabu();
  // #41: protokol o kalkulaci. Musí být PŘED historií – zapsaný řádek je změna
  // zakázky jako každá jiná a historie ho má vidět ve stejném překreslení,
  // jinak by „Zpět" vracelo nejdřív zápis do protokolu místo práce uživatele.
  if (typeof protokolTik === 'function') protokolTik();
  // Poslední krok: zaznamenat změnu do historie („Zpět") a naplánovat zálohu.
  // Musí být až tady – historie porovnává stav po dokončení všech úprav.
  if (typeof historieTik === 'function') historieTik();
  // Stejný důvod jako u historie: automatické uložení do složky se plánuje až
  // ze stavu po dokončení všech úprav, jinak by se ukládal rozpracovaný mezistav.
  if (typeof uloTik === 'function') uloTik();
  // Online databáze: nasazení platného ceníku (složka má přednost) a
  // automatické uložení online – stejné načasování jako u složky.
  if (typeof onlineTik === 'function') onlineTik();
}
