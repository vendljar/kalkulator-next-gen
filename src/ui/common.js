/* ================= SPOLEČNÝ ZÁKLAD UI =================
 * Stav aplikace: ZAK (zakázka) + reference na data aktivní varianty.
 * Z, C   – zadání a ceník OCK        OCK – {zadani, fixes}
 * PJ, PC – zadání a ceník PROJ       TS  – technická specifikace
 * Reference míří přímo do ZAK.varianty[aktivní].data, takže každá
 * změna přes set() se ukládá rovnou do varianty. */

let ZAK = novaZakazka();
let Z, C, OCK, PJ, PC, TS, KL, KLP, SL, SLP, ZO, ZOP;

function syncVarianta() {
  const v = aktivniVarianta(ZAK);
  ZAK.aktivni = v.id;
  if (!v.data.kryci) v.data.kryci = { hodnoty: {} };
  if (!v.data.kryci.hodnoty) v.data.kryci.hodnoty = {};
  if (!v.data.kryciProj) v.data.kryciProj = { hodnoty: {} };     // krycí list PROJ (KLP-1)
  if (!v.data.kryciProj.hodnoty) v.data.kryciProj.hodnoty = {};
  if (!v.data.sleva) v.data.sleva = slevaDefault();
  /* #134: projekce má vlastní slevu. Variantě uložené dřív se dosadí
   * prázdná – hodnotu ze zrušeného pole „Globální sleva PROJ" převede
   * migrace v zakazka.js, aby se cena nezměnila. */
  if (!v.data.slevaProj) v.data.slevaProj = slevaDefault();
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
  KL = v.data.kryci; KLP = v.data.kryciProj; SL = v.data.sleva; SLP = v.data.slevaProj;
  ZO = v.data.zaokr; ZOP = v.data.zaokrProj;
  // trvalé (katalogové) položky ceníku → do zadání; idempotentní, páruje přes kid
  katalogAplikuj(KATALOG, Z);
  // totéž pro PROJ (19. 8. 2026): trvalé položky ceníku PROJ → do zadání PROJ
  if (typeof projKatalogAplikuj === 'function') projKatalogAplikuj(PC, PJ);
}
syncVarianta();

/* ---------- nastavení aplikace (ozubené kolo, jen admin) ---------- */
const NAST = {
  jeAdmin: true,               // dnes je vše admin; přepínač role je v Nastavení
  /* `tabViditelnost` je od 20. 8. 2026 MRTVÉ POLE. Býval to druhý, globální
   * vypínač záložek v Nastavení → Obecné: platil všem včetně administrátora,
   * žil jen v paměti prohlížeče a dělal totéž co matice zobrazení — jen hůř.
   * Pole zůstává kvůli uloženým konfiguracím (nic se nemaže bez dotazu),
   * ale `tabViditelny()` ho už nečte. */
  tabViditelnost: { kalk: true, detail: true, spec: true, specdata: true, kryci: true, proj: true, detailproj: true, kryciproj: true, cenik: true, cenikproj: true, zakazka: true, schvalovani: true },
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
  /* Náhled KONKRÉTNÍHO uživatele (20. 8. 2026). Náhled role výše říká „co
   * uvidí nějaký obchodník"; tohle říká „co uvidí Petr Novák". Drží
   * { email, jmeno, role }; null = dívám se svýma očima. Přepíná se v pravém
   * horním rohu klikem na jméno a v Nastavení → Zobrazení. Náhled je vždy
   * JEN KE ČTENÍ (zamek_ui.js) a po odhlášení i po obnovení stránky se ruší:
   * nikdo se nesmí omylem dívat cizíma očima a myslet si, že jsou jeho. */
  /* Firemní standard OCK (#163, 21. 8. 2026). Výchozí znění je v
   * standard_ock.js; zveřejňuje se na server jako ceník a matice zobrazení.
   * Kontrola je ve výchozím stavu VYPNUTÁ. */
  standard: (typeof STANDARD_VYCHOZI !== 'undefined')
    ? JSON.parse(JSON.stringify(STANDARD_VYCHOZI)) : {},
  nahledUzivatel: null,
  nahledMenu: false,           // rozbalená nabídka náhledu pod jménem v liště
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
/* ---------- náhled pohledem konkrétního uživatele (20. 8. 2026) ---------- */

function nahledAktivni() { return !!(NAST.nahledUzivatel && NAST.nahledUzivatel.email); }

/* Zapnutí: role vybraného účtu se stane rolí rozhraní. Pohled administrátora
 * se zhasne (`NAST.jeAdmin = false`), jinak by matice vůbec nezačala platit —
 * stejná mechanika jako u náhledu role, jen s konkrétním člověkem. */
function nahledZapni(email) {
  if (typeof smiPohledAdmina === 'function' && !smiPohledAdmina()) return;
  const u = ((typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV.uzivatele) || [])
    .find(x => x.email === email);
  if (!u) return;
  NAST.nahledUzivatel = { email: u.email, jmeno: u.jmeno || u.email, role: u.role || 'Obchodník' };
  NAST.nahledRole = NAST.nahledUzivatel.role;
  NAST.jeAdmin = false;
  NAST.nahledMenu = false;
  render();
}

function nahledVypni() {
  NAST.nahledUzivatel = null;
  NAST.nahledRole = '';
  NAST.jeAdmin = true;
  NAST.nahledMenu = false;
  render();
}

/* Zápis se v náhledu neprovede. Vrací true = „zastaveno", takže volající
 * funkce se vrátí bez změny. Stejný tvar jako zamekStop() v zamek.js. */
function nahledStop(popis) {
  if (!nahledAktivni()) return false;   // rolový náhled zápis neblokuje (chová se jako dosud)
  const kdo = NAST.nahledUzivatel.jmeno || NAST.nahledUzivatel.email;
  alert('Prohlížíte aplikaci jako ' + kdo + ' — v náhledu se nic nezapisuje.\n\n'
    + (popis ? 'Akce: ' + popis + '\n\n' : '')
    + 'Náhled ukončíte kliknutím na jméno vpravo nahoře; pak se změna zapíše pod vaším jménem.');
  return true;
}

/* Červený pruh TESTOVACÍHO webu (20. 8. 2026).
 *
 * Testovací kalkulačka běží na vlastní Netlify site, a má tedy i vlastní
 * databázi (Blobs jsou per-site) — data se s ostrým provozem nepotkají.
 * Zbývá jediné riziko: dvě stejně vypadající kalkulačky vedle sebe svádějí
 * k tomu udělat nabídku v testu a poslat ji zákazníkovi. Pruh je proto
 * NEPŘEHLÉDNUTELNÝ a je na každé záložce. Ostrý web nemá nic navíc:
 * bez proměnné PROSTREDI=test se nekreslí. */
function renderProstrediLista() {
  const el = document.getElementById('prostrediLista');
  if (!el) return;
  const t = (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV) ? ONLINE_STAV : {};
  /* Jméno prostředí i do TITULKU KARTY prohlížeče (21. 8. 2026). Pruh je
   * vidět, jen když je aplikace na obrazovce; v přepínači oken a v seznamu
   * karet se ostrá a testovací kalkulačka bez tohohle nerozeznají. */
  if (typeof document !== 'undefined') {
    const zaklad = 'Kalkulátor OCK + PROJ';
    document.title = (t.prostredi === 'test') ? ('[TEST] ' + zaklad) : zaklad;
  }
  if (t.prostredi !== 'test') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="prostredi-pruh">🧪
    <span><b>TESTOVACÍ PROSTŘEDÍ</b> — vlastní databáze, ostrých dat se nedotkne.
      ${esc(t.prostrediPopis || 'Nabídky odsud neposílejte zákazníkům.')}</span></div>`;
}

/* Oranžový pruh přes celou šířku — je vidět na každé záložce, takže se nedá
 * zapomenout, že se člověk dívá cizíma očima. */
function renderNahledLista() {
  const el = document.getElementById('nahledLista');
  if (!el) return;
  const rolovy = !nahledAktivni() && !NAST.jeAdmin
    && typeof smiPohledAdmina === 'function' && smiPohledAdmina();
  if (!nahledAktivni() && !rolovy) { el.innerHTML = ''; return; }
  /* Od 20. 8. 2026 pokrývá pruh OBA náhledy — konkrétního uživatele
   * i obecnou roli. Do té doby měl náhled role vlastní tlačítko v horní
   * liště („← Ukončit náhled uživatele"), takže při náhledu uživatele
   * svítily dvě cesty ven vedle sebe. Tlačítko je pryč, pruh zůstal. */
  const kdoHtml = nahledAktivni()
    ? `<b>Náhled: ${esc(NAST.nahledUzivatel.jmeno || NAST.nahledUzivatel.email)}</b>`
      + ` (${esc(NAST.nahledUzivatel.role)}) — vidíte přesně to, co on.`
    : `<b>Náhled role: ${esc(NAST.nahledRole || 'Obchodník')}</b> — vidíte to, co uvidí tahle role.`;
  el.innerHTML = `<div class="nahled-pruh">
    <span style="display:inline-flex;color:#92400e">${typeof IKONA_OKO === 'string' ? IKONA_OKO : '·'}</span>
    <span>${kdoHtml} Zápis je vypnutý.</span>
    <button class="mini" style="margin-left:auto" onclick="nahledVypni()">Ukončit náhled</button></div>`;
}

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

/* ---------- režimy sekcí kalkulace: zobrazit / skrýt / srolovat ----------
 * (zadání 19. 8. 2026 večer) Administrátor u každé sekce kalkulace OCK i
 * PROJ malým selectem v nadpisu volí, jak sekci uvidí obchodník a vedoucí.
 * Volba žije v matici zobrazení (NAST.zobrazeni.sekce, model zobrazeni.js),
 * ukládá se na server (/api/zobrazeni) hned při změně — platí pro všechny
 * a přežije obnovení stránky. Administrátor vidí vždy vše. */

/* Režim sekce tak, jak se má PRÁVĚ TEĎ vykreslit přihlášenému uživateli.
 *
 * Změna 20. 8. 2026 (zadání J. V. „když nastavím srolování sekce, sroluj ji
 * i u mě"): srolování platí pro VŠECHNY včetně administrátora — jinak admin
 * nevidí, co vlastně nastavil, a musel by se přihlašovat za obchodníka.
 * Skrytí zůstává výjimkou: administrátorovi se skrytá sekce dál kreslí,
 * protože v jejím nadpisu je jediný ovládací prvek, kterým jde skrytí
 * vrátit — kdyby zmizela, nešlo by ji už nikdy zobrazit. Že je skrytá
 * ostatním, mu říká štítek vedle selectu (sekceRezimSelect). */
function sekceRezim(oblast, sekceKey) {
  if (typeof zobrazeniSekceVolba !== 'function') return 'zobrazit';
  const v = zobrazeniSekceVolba(NAST.zobrazeni, oblast + '.' + sekceKey);
  if (v === 'skryt' && jeAdmin()) return 'zobrazit';      // admin o ovládání nepřijde
  return v;
}

/* Rozbalení srolované sekce je stav TÉTO obrazovky, ne nastavení — proto
 * obyčejný objekt v paměti, žádné úložiště. */
const SEKCE_ROZBALENO = {};
function sekceRozbal(klic) { SEKCE_ROZBALENO[klic] = !SEKCE_ROZBALENO[klic]; render(); }
function sekceSbalena(oblast, sekceKey) {
  return sekceRezim(oblast, sekceKey) === 'srolovat' && !SEKCE_ROZBALENO[oblast + '.' + sekceKey];
}

/* Odeslání matice zobrazení na server. Sdílí ji volba režimu sekce
 * i sloupec Výchozí (20. 8. 2026) — obojí je jedno zaškrtnutí, ne celá
 * matice, takže se ukládá hned a bez potvrzovacího okna. */
function zobrazeniMaticiUloz(coSeNepovedlo) {
  if (typeof onlineApi === 'function' && typeof jeAdminOnline === 'function' && jeAdminOnline()) {
    onlineApi('/api/zobrazeni', { matice: NAST.zobrazeni })
      .then(() => { if (typeof onlineNactiZobrazeni === 'function') onlineNactiZobrazeni(); })
      .catch(e => { if (typeof onlineZprava === 'function') {
        onlineZprava(coSeNepovedlo + ' se nepodařilo uložit na server: ' + e.message, 'varovani'); render();
      } });
  } else if (typeof onlineZprava === 'function') {
    onlineZprava(coSeNepovedlo + ' platí jen do obnovení stránky – na server ji uloží až přihlášený administrátor.', 'varovani');
  }
}

function sekceRezimSet(klic, volba) {
  if (!jeAdmin() || typeof zobrazeniSekceNastav !== 'function') return;
  if (!NAST.zobrazeni) NAST.zobrazeni = (typeof zobrazeniVychozi === 'function') ? zobrazeniVychozi() : {};
  zobrazeniSekceNastav(NAST.zobrazeni, klic, volba);
  /* Rozbalení je stav obrazovky: po přepnutí na „srolovat" se sekce má
   * opravdu srolovat i tomu, kdo ji měl před chvílí ručně rozbalenou. */
  delete SEKCE_ROZBALENO[klic];
  zobrazeniMaticiUloz('Volbu zobrazení sekce');
  render();
}

/* ---------- sloupec „Výchozí“ u položek kalkulace (20. 8. 2026) ----------
 * Zaškrtnutí neplatí pro otevřenou zakázku, ale pro VŠECHNY NOVÉ: ukládá se
 * do matice zobrazení (klíč `vychozi`, model v zobrazeni.js) a nová zakázka
 * si ho vyzvedne v zobrazeniVychoziAplikuj(). Do 20. 8. 2026 sloupec zapisoval
 * do zadání otevřené zakázky, kde ho nikdo nečetl — proto „nefungoval". */
function vychoziPolozkaSet(klic, hodnota, zaklad) {
  if (!jeAdmin() || typeof zobrazeniPolozkaVychoziNastav !== 'function') return;
  if (!NAST.zobrazeni) NAST.zobrazeni = (typeof zobrazeniVychozi === 'function') ? zobrazeniVychozi() : {};
  zobrazeniPolozkaVychoziNastav(NAST.zobrazeni, klic, hodnota, zaklad);
  zobrazeniMaticiUloz('Výchozí zaškrtnutí položky');
  render();
}

/* Zaškrtávátko do sloupce Výchozí. `zaklad` = tvrdá výchozí hodnota z kódu
 * (DEFAULT_ZADANI / DEFAULT_ZADANI_PROJ) — proti ní se měří odchylka. */
function vychoziPolozkaChk(klic, zaklad, popis) {
  if (typeof zobrazeniPolozkaVychozi !== 'function') return '';
  const v = zobrazeniPolozkaVychozi(NAST.zobrazeni, klic, zaklad);
  const zmeneno = !!v !== !!zaklad;
  /* Do 20. 8. 2026 měla přenastavená položka tmavší zaškrtávátko
   * (accent-color). Vypadalo to jako porucha vykreslování, ne jako
   * informace — zaškrtávátka v jednom sloupci mají být stejná.
   * Že je hodnota přenastavená proti kódu, se dozvíte z nápovědy. */
  return `<input type="checkbox" class="noprint" ${v ? 'checked' : ''}
    onchange="vychoziPolozkaSet('${escJs(klic)}', this.checked, ${zaklad ? 'true' : 'false'})"
    title="${esc(popis || 'výchozí stav v NOVÉ zakázce (platí pro všechny)')}${zmeneno ? ' — přenastaveno oproti výchozímu stavu aplikace' : ''}">`;
}

/* Malý select do pravé části nadpisu sekce (kreslí se JEN administrátorovi). */
function sekceRezimSelect(oblast, sekceKey) {
  if (!jeAdmin() || typeof zobrazeniSekceVolba !== 'function') return '';
  const klic = oblast + '.' + sekceKey;
  const v = zobrazeniSekceVolba(NAST.zobrazeni, klic);
  const opt = (val, text) => `<option value="${val}" ${v === val ? 'selected' : ''}>${esc(text)}</option>`;
  /* 20. 8. 2026: srolovaná sekce se roluje i administrátorovi, takže vedle
   * selectu potřebuje i tlačítko rozbalení; u skryté sekce (kterou admin
   * jediný pořád vidí) svítí štítek, aby si nemyslel, že ji vidí i ostatní. */
  const doplnek = v === 'srolovat' ? ' ' + sekceRozbalBtn(oblast, sekceKey)
    : (v === 'skryt' ? ` <span class="pill mut" title="obchodník ani vedoucí tuhle sekci nevidí; počítá se dál">skrytá ostatním</span>` : '');
  return `<select class="mini noprint sekce-rezim" onchange="sekceRezimSet('${escJs(klic)}', this.value)"
      title="jak tuhle sekci uvidí obchodník a vedoucí (skrytou sekci vidí dál jen administrátor)">
      ${opt('zobrazit', 'zobrazit')}${opt('skryt', 'skrýt')}${opt('srolovat', 'srolovat')}</select>${doplnek}`;
}

/* Tlačítko rozbalení pro obchodníka/vedoucího u srolované sekce. */
function sekceRozbalBtn(oblast, sekceKey) {
  const klic = oblast + '.' + sekceKey;
  const sbaleno = !SEKCE_ROZBALENO[klic];
  return `<button class="mini noprint" onclick="sekceRozbal('${escJs(klic)}')"
      title="${sbaleno ? 'rozbalit sekci' : 'srolovat sekci'}">${sbaleno ? '▸ rozbalit' : '▾ srolovat'}</button>`;
}

/* aktivní jazyk dokumentů a zkratka pro překlad (viz preklad.js) */
function jazyk() { return NAST.jazyk || 'cz'; }
function jazykSet(k) { NAST.jazyk = JAZYK_IDX[k] === undefined && k !== 'cz' ? 'cz' : k;
  if (typeof nastdbZmeneno === 'function') nastdbZmeneno(); render(); }
function T(cz) { return tr(cz, jazyk()); }

/* Jazyk TISKU dokumentů (#143). Nastavení → jazyk dokumentů platí pro celou
 * aplikaci; tady jde o jednorázovou volbu „tuhle nabídku vytiskni anglicky"
 * přímo u tlačítka, bez cesty do Nastavení a zpět. Prázdná hodnota = řídí se
 * Nastavením (výchozí stav). Volba je jen pro relaci – neukládá se, aby po
 * jedné německé nabídce neodcházely německy i všechny další. */
let TISK_JAZYK = '';
function tiskJazyk() { return TISK_JAZYK || jazyk(); }
function tiskJazykNastav(v) {
  TISK_JAZYK = (v && (v === 'cz' || JAZYK_IDX[v] !== undefined)) ? v : '';
}
function tiskJazykVyber() {
  const moznosti = [['', 'dle Nastavení (' + jazyk().toUpperCase() + ')'],
    ['cz', 'česky'], ['en', 'anglicky'], ['de', 'německy'], ['fr', 'francouzsky']];
  return '<label class="note" style="margin-left:8px">Jazyk tisku:&nbsp;<select '
    + 'onchange="tiskJazykNastav(this.value)" title="Jazyk tohoto výtisku – pevný text dodá jazyková mutace šablony, hodnoty přeloží aplikace">'
    + moznosti.map(([v, t]) => '<option value="' + v + '"' + (v === TISK_JAZYK ? ' selected' : '')
      + '>' + t + '</option>').join('')
    + '</select></label>';
}
function kpiVidSet(k, v) { if (!NAST.kpiViditelne) NAST.kpiViditelne = {}; NAST.kpiViditelne[k] = !!v;
  if (typeof nastdbZmeneno === 'function') nastdbZmeneno(); render(); }

/* Úložiště nahraných šablon dokumentů (SET-6). Relace; { typ: {nazev, data:ArrayBuffer} }.
 * Generátor (nabídka, budoucí SoD) je bere odtud místo výběru souboru pokaždé.
 * Od #139 (13. 8. 2026) je to NOUZOVÁ cesta — přednost mají centrální šablony
 * ze serveru (viz sablonaProTisk níž). */
const SABLONY = {};

/* ---------- odkud vzít šablonu pro tisk (#139, 13. 8. 2026) ----------
 *
 * Jediné místo, které rozhoduje, ze které šablony se generuje Word. Pravidla:
 *
 *  1) Běží-li aplikace online a uživatel je přihlášen, bere se PLATNÁ šablona
 *     ze serveru (v jazyce dokumentů, když má server mutaci; jinak česká
 *     s upozorněním). Obchodník tak NIKDY netiskne ze staré verze.
 *  2) Když serverová šablona není nebo se nedá stáhnout, rozhoduje režim:
 *     PŘÍSNÝ (výchozí) — dokument nevznikne, stejně jako nevznikne bez
 *     platného ceníku. MĚKKÝ — povolí se místní soubor, ale tisk dostane
 *     do zámku varianty razítko „místní šablona", aby nešel zapřít.
 *  3) Nad file:// (jednosouborová kopie bez serveru) platí dosavadní chování:
 *     místní šablona z Nastavení, nebo výběr souboru.
 *
 * Vrací Promise: objekt { data, nazev, zdroj:'server', verze, otisk, typ,
 * mutaceChybi } — nebo null („pokračuj místní cestou"; jen mimo přísný
 * režim) — nebo odmítnutí s českou větou, kterou jde rovnou ukázat. */
function sablonyOnlineAktivni() {
  return typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV.bezi && !!ONLINE_STAV.ja;
}
function sablonaProTisk(typ, lang) {
  if (!sablonyOnlineAktivni()) return Promise.resolve(null);
  const L = lang || 'cz';
  const rezim = (typeof onlineSablonyRezim === 'function') ? onlineSablonyRezim() : 'prisny';
  const typJazyk = L !== 'cz' ? typ + '_' + L : null;
  const metaJ = typJazyk && onlineSablonaMeta(typJazyk);
  const meta = onlineSablonaMeta(typ);
  const popis = (typeof dokumentPopis === 'function' && dokumentPopis(typ)) || typ;

  if (metaJ || meta) {
    const vybrany = metaJ ? typJazyk : typ;
    return onlineSablonaStahni(vybrany)
      .then(v => ({ data: v.data, nazev: v.nazev, zdroj: 'server', verze: v.verze,
                    otisk: v.otisk, typ: vybrany, mutaceChybi: !!(typJazyk && !metaJ) }))
      .catch(err => {
        if (rezim === 'prisny')
          throw new Error('Šablonu „' + popis + '" se nepodařilo stáhnout ze serveru ('
            + err.message + '). V přísném režimu se dokument z místních souborů negeneruje – '
            + 'zkuste to za chvíli znovu, nebo ať administrátor přepne šablony do měkkého režimu '
            + '(Nastavení → Šablony).');
        return null;
      });
  }
  if (rezim === 'prisny')
    return Promise.reject(new Error('Na serveru zatím není zveřejněná šablona „' + popis + '". '
      + 'V přísném režimu se dokument z místních souborů negeneruje – šablonu zveřejní '
      + 'administrátor v Nastavení → Šablony.'));
  return Promise.resolve(null);
}
/* je záložka viditelná? (skryté ceníky/detaily pro běžného uživatele) */
/* Detail výpočtu PROJ (17. 8. 2026) se řídí TÝMŽ právem jako detail OCK —
 * oba rozepisují nákladové sazby a rozdávat je zvlášť by jen mátlo. */
/* Každá záložka má od 20. 8. 2026 svůj klíč v matici zobrazení (nález J. V.:
 * „nastavení → zobrazení nereflektuje aktuální stav aplikace"). Do té doby
 * měly klíč jen čtyři a zbytek se dal zhasnout výhradně přepínačem
 * v Nastavení → Obecné — jenže ten platil VŠEM VČETNĚ ADMINISTRÁTORA a byl
 * jen v paměti prohlížeče. Tenhle druhý mechanismus je proto pryč
 * (viz `NAST.tabViditelnost`); rozhoduje výhradně matice, která se
 * zveřejňuje na server a jde nastavit po rolích.
 * `kalk` klíč nemá schválně: je domovská a náhrada za každou skrytou. */
const TAB_ZOBRAZENI_KLIC = {
  cenik: 'tab.cenik', cenikproj: 'tab.cenikproj', detail: 'tab.detail',
  detailproj: 'tab.detailproj', specdata: 'tab.specdata', spec: 'tab.spec',
  kryci: 'tab.kryci', proj: 'tab.proj', kryciproj: 'tab.kryciproj',
  zakazka: 'tab.zakazka', zakaznici: 'tab.zakaznici', schvalovani: 'tab.schvalovani',
};
function tabViditelny(t) {
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

/* Nadpis bez informativních závorek. Od 17. 8. 2026 večer platí UŽŠÍ pravidlo
 * (oprava zadání): u NÁZVŮ SEKCÍ kalkulace závorky ZŮSTÁVAJÍ („pro 1 ks
 * výtahu", „celý projekt" jsou věcná informace) — bez závorek jsou jen
 * nadpisy karet s interními čísly úkolů (Sleva, Obchodní zaokrouhlení). */
const nazevBezZavorek = t => String(t || '').replace(/\s*\([^)]*\)/g, '').trim();

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
  /* Změna zadání může posunout šachtu mimo standard — ATYP se pak zaškrtne
   * sám (zadání J. V. 21. 8. 2026 večer). Stojí to TADY, ne v render():
   * render se volá i z míst, kde se nic nemění, a zápis do dat uvnitř
   * vykreslování je cesta k nekonečné smyčce. */
  if (path.startsWith('Z.') && typeof standardAtypAutomat === 'function') standardAtypAutomat();
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
  if (opts.type === 'anone')   // rolovací Ano / Ne; ukládá se 1 / 0 (17. 8. 2026 večer)
    return `<div class="row"><label>${opts.l}</label><select onchange="set('${path}', +this.value)">
      <option value="1" ${val ? 'selected' : ''}>Ano</option>
      <option value="0" ${!val ? 'selected' : ''}>Ne</option></select><span class="u"></span></div>`;
  if (opts.type === 'pct')   // uloženo jako desetinné číslo (0,30), zobrazeno a zadáváno v % (30)
    return `<div class="row"><label>${opts.l}</label><input type="number" step="${opts.step ?? 1}" value="${Math.round(val * 10000) / 100}" onchange="set('${path}', (+this.value) / 100)"><span class="u">%</span></div>`;
  return `<div class="row"><label>${opts.l}</label><input type="number" step="${step}" value="${esc(val)}" onchange="set('${path}', +this.value)"><span class="u">${u}</span></div>`;
}

function card(title, inner, closed = false, id = '') {
  // id slouží kotvám v klouzající liště kalkulací (kalkLista) – kliknutí sroluje na kartu
  return `<div class="card ${closed ? 'closed' : ''}"${id ? ` id="${id}"` : ''}><h2 onclick="this.parentElement.classList.toggle('closed')">${title}</h2><div class="body">${inner}</div></div>`;
}

/* Štítek stavu otevřené varianty vedle čísla nabídky (21. 8. 2026, zadání
 * J. V.: „vždy zobrazuj, zda je nabídka aktivní nebo uzamčená").
 *
 * Zámek se dosud poznal jen podle lišty nad kalkulací, která se dá přerolovat
 * — a rozdíl mezi „tuhle nabídku ještě můžu měnit" a „tahle už odešla
 * zákazníkovi" je to nejdůležitější, co o otevřené variantě potřebujete
 * vědět. Štítek je proto přímo v nadpisu, v OCK i v PROJ. */
function variantaStavPill() {
  const v = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : null;
  if (!v) return '';
  const z = (typeof zamekInfo === 'function') ? zamekInfo(v) : null;
  /* Text je celá věta (21. 8. 2026, zadání J. V.): samotné „aktivní" vedle
   * čísla nabídky se dalo číst i jako stav zakázky nebo účtu. Štítek sedí
   * v tlačítkové liště nad kalkulací, kde je vidět i po odrolování. */
  if (z) {
    const kdy = String(z.kdy || '').slice(0, 10);
    return `<span class="stav-pill zamcena" title="Odeslaná nabídka se zpětně needituje.${
      z.popis ? ' ' + esc(z.popis) : ''}${kdy ? ' (' + esc(kdy) + ')' : ''} Pokračujte klonem varianty."
      >🔒 Nabídka uzamčena</span>`;
  }
  return `<span class="stav-pill aktivni" title="Rozpracovaná varianta — dá se měnit a počítá se z ní nabídka."
    >● Nabídka aktivní</span>`;
}

/* ---------- štítek Standard OCK (#163, 21. 8. 2026) ----------
 * Vyhodnocení drží čistá funkce `standardVyhodnot` v src/standard_ock.js;
 * tady je jen štítek do lišty a rozpis pod ním. Kontrola nic neblokuje
 * a nic nepřepočítává — je to informace, ne zábrana. Když je vypnutá
 * (výchozí stav), štítek se vůbec nekreslí. */
let STD_ROZPIS = false;      // je rozpis nálezů rozbalený? (stav obrazovky)

function standardVysledek() {
  if (typeof standardVyhodnot !== 'function') return null;
  let r;
  try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) { r = null; }
  const vyska = r && r.odvozene ? r.odvozene.vyskaSachty : null;
  /* Jednotypovost zasklení: názvy skel, která opravdu jdou do nabídky.
   * „Zvolené" znamená dvě věci najednou — příplatek NENÍ vyškrtnutý ze
   * sloupce Nabídka a má nenulové množství. Bez druhé podmínky by se
   * hlásilo míchání skel i u šachty, kde je druhé sklo jen v ceníku
   * s nulou. Míchání dvou druhů není standard (rozhodnutí J. V. 21. 8.). */
  const vynechane = Z.priplatkyVynechat || [];
  const skla = (r && r.priplatky ? r.priplatky : [])
    .filter(x => x && /sklo/i.test(String(x.nazev || ''))
      && vynechane.indexOf(x.key) < 0 && (+x.mnozstvi || 0) > 0)
    .map(x => x.nazev);
  return standardVyhodnot(Z, vyska, NAST.standard, skla);
}

function standardPill() {
  const v = standardVysledek();
  if (!v || v.stav === 'vypnuto') return '';
  const tridy = { standard: 'ok', atyp: 'atyp', nelze: 'nejisto' };
  const popis = {
    standard: 'Šachta odpovídá firemnímu standardu OCK. Kliknutím rozbalíte, co se kontrolovalo.',
    atyp: 'Šachta je mimo firemní standard. Kliknutím rozbalíte nálezy.',
    nelze: 'K posouzení chybí údaj. Kliknutím rozbalíte, který.',
  };
  return `<span class="std-pill ${tridy[v.stav]}" onclick="standardRozpisPrepni()"
    title="${esc(popis[v.stav])}">${esc(standardPopis(v))} ${STD_ROZPIS ? '▴' : '▾'}</span>`;
}

function standardRozpisPrepni() { STD_ROZPIS = !STD_ROZPIS; render(); }

/* ---------- ATYP se u nestandardní šachty zaškrtne sám (21. 8. 2026 večer) ----
 *
 * Zadání J. V.: „pokud je zakázka vyhodnocena jako nestandardní, automaticky
 * zaškrtni políčko ATYP." Je to vědomý ústup od zásady „přirážku zapíná
 * vždycky člověk" (návrh z 21. 8. ráno) — proto tři pojistky, aby se z toho
 * nestal stroj, který obchodníkovi přepisuje práci:
 *
 *  1. VYPÍNÁ JEN SVOJE. Vrátí-li se šachta do standardu, automat odškrtne
 *     ATYP, který sám zaškrtl (`Z.atypAutomat`). ATYPu zaškrtnutého ČLOVĚKEM
 *     se nedotkne — důvodů k atypu je víc než rozměry a ty aplikace nezná.
 *  2. RUČNÍ ODŠKRTNUTÍ SE RESPEKTUJE. Kdo ATYP u nestandardní šachty vypne,
 *     řekl tím „vím o tom". Zapamatuje se to v zadání (`atypRucneVypnut`)
 *     a automat na tu zakázku už nesáhne, dokud se šachta nevrátí
 *     do standardu. Bez toho by se zaškrtávátko po každé změně vracelo
 *     a nešlo by vypnout vůbec.
 *  3. NESAHÁ NA ZAMČENOU VARIANTU ANI V NÁHLEDU. Odeslaná nabídka se nemění
 *     nikdy a náhled cizíma očima je jen ke čtení.
 *
 * Vrací true, když opravdu přepnul (pro testy a pro hlášku). */
function standardAtypAutomat() {
  if (typeof standardVysledek !== 'function' || typeof atypPrepni !== 'function') return false;
  if (typeof nahledAktivni === 'function' && nahledAktivni()) return false;
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(aktivniVarianta(ZAK))) return false;

  let v = null;
  try { v = standardVysledek(); } catch (e) { return false; }
  if (!v || v.stav === 'vypnuto') return false;

  if (v.stav !== 'atyp') {
    /* Zpátky ve standardu: ruční „ne" ztrácí platnost, aby příští odchylka
     * zase zabrala. */
    if (Z.atypRucneVypnut) delete Z.atypRucneVypnut;
    /* A pomine-li potřeba atypu, automat SVOJE zaškrtnutí zase vypne
     * (21. 8. 2026 večer, zadání J. V.: „když pomine potřeba atyp,
     * automaticky tlačítko zase vypni"). Ručně zaškrtnutý ATYP zůstává —
     * ten značku `atypAutomat` nenese. */
    if (Z.atyp && Z.atypAutomat) { atypPrepni(false, { automat: true }); return true; }
    return false;
  }
  if (Z.atyp || Z.atypRucneVypnut) return false;
  atypPrepni(true, { automat: true });
  return true;
}

/* Rozpis pod lištou — kreslí se jen rozbalený a jen tam, kde má smysl
 * (Kalkulace OCK a Technická specifikace). */
function standardRozpis() {
  if (!STD_ROZPIS) return '';
  const v = standardVysledek();
  if (!v || v.stav === 'vypnuto') return '';
  const barva = v.stav === 'standard' ? 'background:#dcfce7;color:#166534'
    : (v.stav === 'atyp' ? 'background:#fee2e2;color:#991b1b' : 'background:#fff7e6;color:#92400e');
  const radky = v.nalezy.length
    ? v.nalezy.map(n => `<tr><td>${esc(n.co)}</td><td>${esc(n.limit)}</td>
        <td style="font-weight:600">${esc(n.zadano)}${n.stav === 'nelze' ? ' <span class="pill mut">nelze posoudit</span>' : ''}</td></tr>`).join('')
    : `<tr><td colspan="3">Všech ${v.kontrol} kontrolovaných pravidel sedí.</td></tr>`;
  /* Nabídka zapnout ATYP se ukazuje jen u skutečného atypu a jen tomu, kdo
   * na to má právo. Nikdy se nezapíná sama — přirážka mění cenu. */
  /* Věta u tlačítka přepsána 22. 8. 2026 („co znamená ať přirážku
   * nezapínáme sami? nerozumím" — J. V.): má říkat, CO tlačítko udělá
   * a PROČ tu vůbec je, když jindy ATYP zaškrtává automat. Automat sahá
   * na zakázku jen při ZMĚNĚ zadání — u zakázky, která se nestandardní
   * teprve NAČETLA (nebo kde byl ATYP ručně odškrtnut), by tiché zapnutí
   * změnilo cenu bez vědomí obchodníka. */
  const nabidka = (v.stav === 'atyp' && !Z.atyp && smiZobrazit('sloupce.naklad'))
    ? `<div style="padding:8px 12px;border-top:1px solid var(--line)">
         <button class="mini" onclick="atypPrepni(true)">Zapnout ATYP a přirážku</button>
         <span class="note" style="margin-left:8px">Zaškrtne ATYP v zadání a přidá do Režie přirážku
           za projekční a koordinační práce — cena se zvýší. U načtené zakázky to necháváme
           na vás, aby se cena nezměnila jen otevřením souboru.</span>
       </div>` : '';
  return `<div class="std-panel noprint">
    <div class="hd" style="${barva}">${esc(standardPopis(v))} — kontrolováno ${v.kontrol} pravidel</div>
    <table><tr><th>Pravidlo</th><th>Standard</th><th>V zadání</th></tr>${radky}</table>${nabidka}</div>`;
}

/* Karta s režimem sekce (20. 8. 2026, zadání J. V.).
 *
 * Volba zobrazit / skrýt / srolovat byla do 20. 8. jen u sekcí UVNITŘ tabulky
 * kalkulace (řádek tr.sechd). Karty jako „Příplatkové položky" nebo „Detail
 * mezivýpočtů" ji neměly — přitom jsou to z pohledu obchodníka úplně stejné
 * bloky a admin je potřebuje řídit stejně. Tahle obálka nad card() jim ji dává:
 * v nadpisu je pro admina týž `<select class="sekce-rezim">`, skrytá karta se
 * obchodníkovi nekreslí a srolovaná se otevře kliknutím na nadpis (mechanika
 * card(closed) zůstává).
 *
 * `event.stopPropagation()` u selectu je nutné: nadpis karty sám o sobě
 * sbaluje a rozbaluje, takže bez něj by každá změna volby kartu i překlopila. */
function kartaRezim(oblast, sekceKey, title, inner, id = '') {
  const rezim = sekceRezim(oblast, sekceKey);
  if (rezim === 'skryt') return '';
  const vpravo = jeAdmin() ? sekceRezimSelect(oblast, sekceKey)
    : (rezim === 'srolovat' ? sekceRozbalBtn(oblast, sekceKey) : '');
  const nadpis = `<span style="flex:1">${title}</span>`
    + (vpravo ? `<span onclick="event.stopPropagation()" style="font-weight:400">${vpravo}</span>` : '');
  const zavreno = sekceSbalena(oblast, sekceKey);
  return `<div class="card ${zavreno ? 'closed' : ''}"${id ? ` id="${id}"` : ''}>
    <h2 onclick="this.parentElement.classList.toggle('closed')"
      style="display:flex;align-items:center;gap:12px">${nadpis}</h2>
    <div class="body">${inner}</div></div>`;
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
    <span style="margin-left:auto;display:inline-flex;gap:8px;align-items:center">${
      typeof variantaStavPill === 'function' ? variantaStavPill() : ''}${
      typeof standardPill === 'function' ? standardPill() : ''}</span>
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
  const txt = (path, label, pill) => `<div class="row"><label>${label}${pill || ''}</label>
    <input type="text" value="${esc(get(path))}" onchange="set('${path}', this.value)"></div>`;

  /* Pole „Zákazník" našeptává z kartotéky i z rejstříku zakázek (22. 8. 2026,
   * zadání J. V.). `kde` je 'ock' nebo 'proj' — obě hlavičky jsou v dokumentu
   * zároveň, takže box potřebuje vlastní id. Zapisuje se přes onchange jako
   * dosud; našeptávač jen nabízí, nic nevyplňuje sám. */
  /* Pole Zákazník s našeptávačem. Od 22. 8. 2026 se výběrem (i ručním
   * dopsáním celého jména) dotáhnou z kartotéky i prázdné údaje hlavičky —
   * kontaktní osoba, IČO, adresa, zástupci. Vyplněné pole se nepřepisuje,
   * na to je tlačítko „Vybrat z databáze zákazníků". Kartotéka se při
   * prvním kliknutí do pole doptá serveru, jinak by našeptávač nabízel jen
   * jména z dřívějších zakázek a dotahovat by neměl z čeho. */
  const zakaznikRow = (kde) => `<div class="row"><label>Zákazník</label>
    <span class="nasept-wrap" style="flex:1"><input type="text" style="width:100%" autocomplete="off"
      value="${esc(get('ZAK.objednatel'))}"
      title="Při psaní se nabízejí zákazníci z databáze a z dřívějších zakázek. Výběrem se doplní prázdná pole hlavičky (kontaktní osoba, IČO, adresa); už vyplněné údaje zůstanou a celou hlavičku přepíše tlačítko „Vybrat z databáze zákazníků“."
      onchange="set('ZAK.objednatel', this.value); if(typeof zakaznikDotahniPodleNazvu==='function')zakaznikDotahniPodleNazvu(this.value)"
      oninput="naseptavacZakKresli('${kde}', this.value)"
      onfocus="if(typeof zakazniciNactiProNaseptavac==='function')zakazniciNactiProNaseptavac(); naseptavacZakKresli('${kde}', this.value)"
      onblur="naseptavacZakSchovej('${kde}')"
      onkeydown="if(event.key==='Escape')naseptavacZakSchovej('${kde}')">
    <span class="nasept-box" id="naseptBoxZak_${kde}" style="display:none"></span></span></div>`;

  /* Kontrola duplicit (19. 8. 2026): číslo i název se porovnávají s online
   * rejstříkem zakázek; kolize svítí štítkem hned u pole, kde se opravuje.
   * Tvrdá pojistka je na serveru (cizí zakázku pod stejným číslem odmítne). */
  const dup = (typeof zakazkaDuplicita === 'function' && typeof ONLINE_STAV !== 'undefined')
    ? zakazkaDuplicita(ZAK, ONLINE_STAV.rejstrik, ONLINE_STAV.soubor)
    : { cislo: '', nazevAkce: '' };
  const dupPill = (soubor, co) => !soubor ? '' : `<span class="pill warn" style="margin-left:12px"
    title="Stejné ${co} už má uložená zakázka ${esc(soubor)}. Server uložení pod cizím číslem odmítne — zvolte vlastní.">duplicitní</span>`;
  const dupCislo = dupPill(dup.cislo, 'číslo nabídky');
  const dupNazev = dupPill(dup.nazevAkce, 'název akce');

  /* Hlavička je od 19. 8. 2026 JEDNA SPOLEČNÁ pro OCK i PROJ (zadání J. V.:
   * „prostě je to stejná hlavička jako v OCK… to že svítí stejná hlavička
   * v obou kalkulacích není problém"). Obě kalkulace čtou i píší tatáž pole
   * ZAK.* — obchodník v každé záložce jen počítá odpovídající část. */

  /* IČO objednatele (zadání z 30. 7. 2026) – v hlavičce stojí mezi kontaktní
   * osobou a sazbou DPH. Vedle popisku svítí štítek, když je vyplněné IČO
   * neplatné podle kontrolní číslice. NEBLOKUJE se nic: pole jde uložit
   * i s chybou a nabídka se z něj vytiskne. Stejná chyba se objeví i v panelu
   * kontrol (#33) – tady je hned u pole, kde se opravuje. */
  const icoRow = (path, kdeAres) => {
    const h = get(path);
    const spatne = (typeof icoVyplneno === 'function') && icoVyplneno(h) && !icoPlatne(h);
    const pill = spatne ? `<span class="pill warn" style="margin-left:12px"
      title="osm číslic a kontrolní číslice nesedí – zkontrolujte překlep">neplatné IČO</span>` : '';
    /* Pod polem stojí dotaz do rejstříku (#10). Je to nabídka, ne krok
     * v postupu – hlavička se dá vyplnit ručně a nabídka odejde i tak. */
    const kde = kdeAres || (path.indexOf('projHlavicka') >= 0 ? 'proj' : 'ock');
    /* Vedle ARES stojí od 20. 8. 2026 cesta do databáze zákazníků (#162):
     * u zákazníka, kterého už jednou někdo vyplnil, se všechno přenese
     * jedním kliknutím. Je to nabídka, ne krok v postupu — hlavička se dá
     * pořád vyplnit ručně. */
    /* Tlačítka databáze zákazníků stojí od 21. 8. 2026 v TÉMŽE řádku jako
     * „Najít firmu v ARES" (zadání J. V.) — jsou to tři varianty jedné věci:
     * odkud vzít údaje o firmě. Na vlastním řádku pod ARES vypadala jako
     * něco jiného a odsouvala datum o kus níž. */
    /* Řádek „odkud vzít údaje o firmě" (21. 8. 2026, zadání J. V.):
     * VŠECHNA tři tlačítka v jednom řádku, v pořadí databáze → uložit → ARES,
     * zarovnaná zleva s popiskem „IČO zákazníka" a zprava s koncem pole IČO.
     * Proto vlastní řádek s `justify-content:space-between`, ne mřížka .row
     * s prázdným popiskem — ta začínala až u pole a tlačítka se lámala. */
    /* Tlačítka databáze zákazníků se kreslí VŽDY (22. 8. 2026, hlášeno
     * J. V.: „v offline html se nám nezobrazují"). Databáze žije na
     * serveru, takže bez přihlášení fungovat nemůžou — ale zmizelé
     * tlačítko vypadá jako chyba. Zhasnuté tlačítko s důvodem v bublině
     * říká pravdu: funkce existuje, jen tady není k dispozici. */
    const zakMozne = typeof zakazniciMozne === 'function' && zakazniciMozne();
    const zakDuvod = zakMozne ? ''
      : (typeof onlineMozne === 'function' && !onlineMozne()
        ? ' — databáze zákazníků žije na serveru; v souboru spuštěném z disku není dostupná'
        : ' — nejdřív se přihlaste k databázi (Nastavení → Databáze)');
    const zakVyp = zakMozne ? '' : ' disabled';
    /* Tlačítka jsou od 22. 8. 2026 v OBOU hlavičkách (zadání J. V.: „tato
     * funkce má být přístupná i v kalkulaci proj"). Hlavička je jedna
     * společná — obě kalkulace čtou a píší tatáž pole ZAK.* —, takže
     * omezení na OCK nedávalo smysl: kdo zakládal zakázku z Kalkulace PROJ,
     * musel kvůli zákazníkovi přepnout do OCK. */
    const zakDbBtns = `<button class="mini noprint"${zakVyp} onclick="prepniTab('zakaznici')"
           title="vybrat zákazníka z databáze — přenese hlavičku i kontakty do krycích listů${esc(zakDuvod)}"
           >Vybrat z databáze zákazníků</button>
         <button class="mini noprint"${zakVyp} onclick="zakaznikZeZakazkyUI()"
           title="uložit údaje z téhle hlavičky jako novou kartu zákazníka${esc(zakDuvod)}">Uložit jako zákazníka</button>`;
    const aresBtns = (typeof aresRadek === 'function') ? aresRadek(kde, false, zakDbBtns) : zakDbBtns;
    return `<div class="row"><label>IČO zákazníka${pill}</label>
      <input type="text" value="${esc(h)}" placeholder="8 číslic"
        title="IČO zákazníka; přebírá ho krycí list. Prázdné pole se nikde nehlásí."
        onchange="set('${path}', this.value)"></div>${aresBtns}`;
  };

  // indikátor řídící varianty přímo za popiskem „Otevřená varianta" (odsazený)
  const ridiciPill = `<span class="pill ${akt.ridici ? '' : 'mut'}" style="margin-left:12px" title="řídící = aktuálně platná varianta pro nabídku">${akt.ridici ? '✓ řídící' : 'není řídící'}</span>`;
  const variantaRow = `<div class="row"><label>Otevřená varianta${ridiciPill}</label>
    <select onchange="varAktivuj(this.value)" title="přepnout počítanou variantu">${opts}</select></div>`;
  const ridiciBtn = akt.ridici ? '' : `<div class="row"><label></label><button class="mini noprint" onclick="varRidici('${escJs(akt.id)}')">nastavit jako řídící (platná je „${esc(rid.nazev)}")</button></div>`;
  const rezimRow = `<div class="row"><label>Režim výpočtu</label>
    <select onchange="set('OCK.fixes', this.value==='fix')" title="přepnutí Model 2 – opravený / Model 1 – 1:1 jako Excel">
      <option value="fix" ${OCK.fixes ? 'selected' : ''}>Model 2 – opravený</option>
      <option value="compat" ${!OCK.fixes ? 'selected' : ''}>Model 1 – 1:1 jako Excel</option></select></div>`;
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
  /* datumRowProj zanikl 19. 8. 2026 — hlavička je jedna společná (ZAK.datum). */

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
          ${txt('ZAK.cislo', 'Číslo nabídky (CN)', dupCislo)}${txt('ZAK.nazevAkce', 'Název akce', dupNazev)}${txt('ZAK.adresa', 'Adresa stavby')}${datumRow}
        </div>
        <div class="zak-head-col">
          ${zakaznikRow('proj')}${txt('ZAK.kontakt', 'Kontaktní osoba')}${icoRow('ZAK.ico', 'proj')}${dphRowProj}
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
        ${txt('ZAK.cislo', 'Číslo nabídky (CN)', dupCislo)}${txt('ZAK.nazevAkce', 'Název akce', dupNazev)}${txt('ZAK.adresa', 'Adresa stavby')}${datumRow}
      </div>
      <div class="zak-head-col">
        ${zakaznikRow('ock')}${txt('ZAK.kontakt', 'Kontaktní osoba')}${icoRow('ZAK.ico')}${dphRow}
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
                  objednatel: 'Zákazník', kontakt: 'Kontaktní osoba',
                  ico: 'IČO zákazníka', datum: 'Datum vytvoření' };
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
  el.textContent = opraveno ? 'výpočet: Model 2 – opravený' : 'výpočet: Model 1 – 1:1 jako Excel (vč. jeho chyb)';
  el.className = 'pill' + (opraveno ? '' : ' warn');
  el.title = opraveno
    ? 'Model 2 – opravený režim: odstraněny známé chyby vzorců v šabloně. Výsledky se mohou lišit od starých nabídek počítaných v Excelu.'
    : 'Model 1 – režim shody s Excelem: vzorce se chovají přesně jako šablona VZOR, včetně jejích osmi zdokumentovaných chyb. Vhodné pro porovnání se staršími nabídkami. Přepnout lze v hlavičce kalkulace.';
}

/* Hlídka nasazené verze (19. 8. 2026): otevřená stránka × verze na serveru.
 * Serverovou verzi plní online_ui ze sondy /api/zdravi (při startu a pak
 * každých 10 minut) — porovnání dělá buildVerzeHlaska v build_info.js. */
function renderVerzePill() {
  const el = document.getElementById('verzePill');
  if (!el) return;
  const veta = (typeof buildVerzeHlaska === 'function')
    ? buildVerzeHlaska(typeof buildVerze === 'function' ? buildVerze() : '',
        (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV.serverVerze) || '')
    : '';
  el.style.display = veta ? '' : 'none';
  el.textContent = veta;
  el.title = veta ? 'Nasazení nové dávky otevřenou stránku samo nepřekreslí — obnovte ji. '
    + 'Zakázka je uložená online, obnovením o nic nepřijdete.' : '';
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

/* ---------- Sleva (ZAK-10): zadání, stropy dle role, schvalování ----------
 *
 * DVĚ SLEVY, DVĚ CENY (#134, 12. 8. 2026).
 *
 * Do 12. 8. 2026 tu byla jedna sleva a její karta se vykreslovala dvakrát —
 * pod výpočtem OCK a znovu pod výpočtem PROJ. V projekci tedy stálo „Cena
 * před slevou" s částkou za výtahovou šachtu a pod ní marže a strop role
 * spočítané z ceny, se kterou projekce nemá nic společného. Projekce k tomu
 * měla ještě druhou, úplně jinou slevu (pole „Globální sleva PROJ") bez
 * schvalování a bez stropu.
 *
 * Nově má každá kalkulace svou vlastní slevu nad svou vlastní cenou:
 *   SL  … sleva na cenu výtahové šachty (OCK)
 *   SLP … sleva na cenu projekčních prací (PROJ)
 * Pravidla jsou pro obě stejná (strop dle role, schvalování nad strop,
 * pojistka minimální marže), ale čísla se nikdy nemíchají. Obě kalkulace
 * spolu nemusí souviset a většinou nesouvisí.
 *
 * Karta se proto skládá jednou funkcí nad popisem části — kdyby existovaly
 * dvě kopie, rozejdou se. */

/* Popis jedné části: kde má data, z čeho se počítá základ a náklad, jak se
 * jmenují její obslužné funkce a kam se v aplikaci kotví. */
function slevaCast(cast) {
  const proj = cast === 'proj';
  return {
    cast: proj ? 'proj' : 'ock',
    proj,
    obj: proj ? (typeof SLP !== 'undefined' ? SLP : null) : (typeof SL !== 'undefined' ? SL : null),
    /* Interní čísla úkolů v nadpisech skončila 17. 8. 2026 (zadání J. V.:
     * „Odstraň v nadpisech sekcí informativní text v závorkách.") */
    nazev: proj ? 'Sleva na nabídku PROJ' : 'Sleva na nabídku OCK',
    kotva: proj ? 'proj-sleva' : 'ock-sleva',
    /* Dva tvary, aby věty dávaly česky smysl: „cena projekčních prací"
     * (2. pád) a „platí jen pro projekční práce" (4. pád). */
    coJe: proj ? 'projekčních prací' : 'výtahové šachty',
    coJeAkuz: proj ? 'projekční práce' : 'výtahovou šachtu',
    fn: proj ? 'slevaProjSet' : 'slevaSet',
    zrus: proj ? 'slevaProjZrus()' : 'slevaZrus()',
  };
}

/* Základ a náklad té části, ze které se sleva počítá. Vrací null, když se
 * výpočet nepodařil — cena se nikdy neodhaduje. */
function slevaZaklad(cast) {
  if (cast === 'proj') {
    let r = null; try { r = vypocetProj(PJ, PC); } catch (e) {}
    if (!r || !r.souhrn) return null;
    /* Náklad projekce zahrnuje dopravu — cena ji obsahuje, tak ji musí
     * obsahovat i náklad, se kterým se poměřuje (audit 1. 8. 2026, N2). */
    return { zaklad: r.souhrn.celkem, naklad: r.souhrn.naklad + (r.souhrn.doprava || 0) };
  }
  let r = null; try { r = vypocet(Z, C, JEKLY, OCK.fixes); } catch (e) {}
  if (!r || !r.souhrn) return null;
  return { zaklad: r.souhrn.zakladCena, naklad: r.souhrn.zakladNaklad };
}

/* Přepočte a uloží stav slevy dané části; ruční rozhodnutí drží, dokud se
 * nezmění %.
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
function slevaRefreshStavCast(cast) {
  const c = slevaCast(cast);
  const z = slevaZaklad(c.cast);
  if (!z || !c.obj) return null;
  const v = slevaVyhodnot(z.zaklad, z.naklad, c.obj, NAST.slevy);
  const zamceno = (typeof variantaUzamcena === 'function')
    && variantaUzamcena(aktivniVarianta(ZAK));
  if (!zamceno) schvalovaniPrepocti(c.obj, v);
  return v;
}
/* Zpětně kompatibilní jméno pro slevu OCK – používá ho zbytek aplikace. */
function slevaRefreshStav() { return slevaRefreshStavCast('ock'); }
function slevaProjRefreshStav() { return slevaRefreshStavCast('proj'); }

/* Settery. Obě části mají vlastní jména, protože ochrana zamčené varianty
 * (zamek_ui.js) je vypisuje jmenovitě — a seznam, ve kterém by jedno jméno
 * zastupovalo dvě různé slevy, se špatně kontroluje.
 *
 * render() i u poznámky: karta je v aplikaci na dvou místech a instance,
 * ve které se poznámka NEnapsala, by jinak při nejbližším překreslení vrátila
 * starý text (audit 1. 8. 2026, N5). onchange pálí až při opuštění pole,
 * takže překreslení kurzor nekrade. */
function slevaSet(pole, val) {
  if (!SL) return;
  if (pole === 'procenta') SL.procenta = Math.max(0, +val || 0); else SL[pole] = val;
  render();
}
function slevaProjSet(pole, val) {
  if (!SLP) return;
  if (pole === 'procenta') SLP.procenta = Math.max(0, +val || 0); else SLP[pole] = val;
  render();
}
/* `slevaSetSchvalitel` a `slevaSchval` tu skončily 5. 8. 2026: schvalování
 * má vlastní záložku (`ui/schvalovani_ui.js`). Pole `SL.schvalitel` ve
 * starých zakázkách zůstává – migrace rolí v `zakazka.js` ho dál převádí,
 * aby se archivní data nerozbila. */
function slevaZrus() { Object.assign(SL, slevaDefault()); render(); }
function slevaProjZrus() { Object.assign(SLP, slevaDefault()); render(); }

/* Maximum globální slevy v % pro UI (výchozích 30 %; nastavuje se
 * v Nastavení → Slevy jako podíl, stejně jako minMarze). */
function slevaGlobalniMaxPct() {
  const v = NAST && NAST.slevy ? NAST.slevy.maxGlobalni : null;
  const podil = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0.30;
  return Math.round(podil * 1000) / 10;
}

/* Karta stojí pod výpočtem OCK i pod výpočtem PROJ (zadání 1. 8. 2026:
 * „sekce sleva na nabídku … tak jak to máme v kalkulaci OCK, tzn. pod
 * výpočetním oknem"). Od 12. 8. 2026 jsou to ale DVĚ karty nad DVĚMA
 * slevami — každá počítá z ceny své vlastní kalkulace. */
function slevaKarta(kontext) {
  const c = slevaCast(kontext);
  const SLC = c.obj;
  const v = slevaRefreshStavCast(c.cast);

  /* Bez výpočtu není co ukázat – cena se neodhaduje. Dřív se v projekci
   * karta vykreslovala i tak, protože nesla globální slevu PROJ; ta je
   * zrušená, takže tahle výjimka padla s ní. */
  if (!v || !SLC) return '';

  const schemata = NAST.slevy.schemata || [];
  const schemaOpts = ['<option value="">— schéma slevy —</option>']
    .concat(schemata.map(s => `<option ${s.nazev === SLC.schema ? 'selected' : ''}>${esc(s.nazev)}</option>`)).join('');
  const roleOpts = NAST.role.map(rr => `<option ${rr === SLC.role ? 'selected' : ''}>${esc(rr)}</option>`).join('');
  const strop = v.strop;

  /* Stavů je pět, ale „zamítnuto" znamená dvě různé věci: buď slevu srazila
   * pod minimální marži (rozhodnout o ní nemůže nikdo), nebo ji někdo konkrétní
   * zamítl (a po snížení procenta půjde znovu). Rozliší je kategorie ze
   * `schvalovani.js` – v kartě se to musí poznat, protože rada uživateli je
   * v každém případě jiná. */
  const kat = schvalovaniKategorie(SLC);
  const stavMap = {
    bez: ['mut', 'bez slevy'],
    auto: ['', '✓ schváleno automaticky (v mezích role)'],
    schvaleno: ['', '✓ schváleno – ' + esc(SLC.schvalil || 'nadřízený')],
    ceka: ['warn', '⏳ čeká na rozhodnutí – záložka Schvalování slev'],
    zamitnuto: ['neg', '✕ zamítnuto – ' + esc(SLC.zamitl || 'nadřízeným')],
    podMarzi: ['neg', '✕ pod minimální marží – nelze schválit'],
  };
  const [pillCls, pillTxt] = stavMap[kat] || ['mut', String(SLC.stav || '')];
  const pct = x => (Math.round(x * 10000) / 100).toLocaleString('cs-CZ') + ' %';

  const dopad = +SLC.procenta > 0 ? `<table class="sd-tbl" style="max-width:520px;margin-top:6px">
      <tr><td>Cena ${esc(c.coJe)} před slevou (bez DPH)</td><td style="text-align:right">${fmt0(v.cenaPoSleve + v.slevaKc)}</td></tr>
      <tr><td>Sleva ${pct(v.procenta)}</td><td style="text-align:right;color:#b91c1c">− ${fmt0(v.slevaKc)}</td></tr>
      <tr><td><b>Cena po slevě (bez DPH)</b></td><td style="text-align:right;font-weight:700">${fmt0(v.cenaPoSleve)}</td></tr>
      <tr><td>Marže po slevě <span class="note">(min. ${pct(v.minMarze)})</span></td>
        <td style="text-align:right;color:${v.podMarzi ? '#b91c1c' : '#15803d'}">${pct(v.marzePoSleve)}</td></tr>
      <tr><td>Strop role „${esc(SLC.role)}"</td><td style="text-align:right">${pct(strop)}</td></tr>
    </table>` : `<div class="note">Zadej slevu v % z ceny ${esc(c.coJe)} bez DPH. Do stropu role projde automaticky, nad strop půjde ke schválení.</div>`;

  /* Rozhodnutí o slevě se odsud 5. 8. 2026 přestěhovalo do vlastní záložky.
   * Do té doby tu stálo tlačítko „Schválit slevu" i rozbalovací seznam
   * „Schvaluje (nadřízený)" – kdokoli měl kartu na obrazovce, odklepl si
   * vlastní žádost sám a do zakázky se zapsala jen ROLE, ne člověk. Tady
   * proto zůstává jen stav a odkaz, kde se rozhoduje; rozhodovat smí ten,
   * komu administrátor přidělil právo „Schvalování slevy nad strop role". */
  const schvalBlok = kat === 'ceka'
    ? `<div class="note" style="margin-top:6px">Sleva přesahuje strop role „${esc(SLC.role)}"
         (${pct(strop)}), takže čeká na rozhodnutí. Rozhoduje se v záložce
         <b>Schvalování slev</b>${schvalovaniKdoMuze(+SLC.procenta || 0, NAST.slevy, NAST.role).length
           ? ' – o téhle slevě může rozhodnout: '
             + esc(schvalovaniKdoMuze(+SLC.procenta || 0, NAST.slevy, NAST.role).join(', ')) : ''}.
         ${tabViditelny('schvalovani')
           ? '<button class="mini" style="margin-left:6px" onclick="prepniTab(\'schvalovani\')">Přejít na schvalování</button>' : ''}</div>`
    : (kat === 'schvaleno' && SLC.schvalilKdy
        ? `<div class="note">Schválil: <b>${esc(SLC.schvalil)}</b> · ${new Date(SLC.schvalilKdy).toLocaleString('cs-CZ')}</div>`
        : (kat === 'schvaleno'
            ? `<div class="note">Schválil: <b>${esc(SLC.schvalil)}</b></div>`
            : (kat === 'zamitnuto'
                ? `<div class="note">Zamítl: <b>${esc(SLC.zamitl || 'nadřízený')}</b>${SLC.zamitlKdy
                    ? ' · ' + new Date(SLC.zamitlKdy).toLocaleString('cs-CZ') : ''}${SLC.zamitnutoDuvod
                    ? ' – ' + esc(SLC.zamitnutoDuvod) : ''}. Sníženou slevu lze poslat ke schválení znovu.</div>` : '')));

  /* Věta, proč tahle sleva nesahá na tu druhou část. Stojí tu proto, že
   * dokud se obě karty tvářily stejně, hledal každý, kam se procento zadané
   * v jedné z nich ztratilo. */
  const oddeleni = `<div class="note" style="margin-top:8px">Tahle sleva platí jen pro
      ${esc(c.coJeAkuz)} a počítá se z ${c.proj ? 'jejich' : 'její'} ceny. ${c.proj
        ? 'Výtahová šachta (OCK) má vlastní slevu v záložce Kalkulace OCK'
        : 'Projekční práce mají vlastní slevu v záložce Kalkulace PROJ'} – slevy se
      nepropisují jedna do druhé a v nabídce i v krycím listu se vykazují zvlášť.</div>`;

  const inner = `<div class="zak-head" style="grid-template-columns:1fr 1fr 1fr">
      <div class="row"><label>Schéma slevy</label><select onchange="${c.fn}('schema', this.value)">${schemaOpts}</select></div>
      <div class="row"><label>Role zadavatele</label><select onchange="${c.fn}('role', this.value)">${roleOpts}</select></div>
      <div class="row"><label>Sleva</label><span class="pct-wrap"><input type="number" step="0.5" min="0" value="${+SLC.procenta || 0}" onchange="${c.fn}('procenta', this.value)"> %</span></div>
    </div>
    <div class="row" style="max-width:100%"><label>Poznámka ke slevě</label>
      <input type="text" value="${esc(SLC.poznamka || '')}" onchange="${c.fn}('poznamka', this.value)" placeholder="důvod, kampaň, partner…"></div>
    <div style="margin-top:6px">Stav: <span class="pill ${pillCls}">${pillTxt}</span>
      ${slevaPlati(SLC) ? '<span class="note" style="margin-left:8px">propíše se do ceny nabídky ↓</span>' : (+SLC.procenta > 0 ? '<span class="note" style="margin-left:8px">neschválená sleva se do nabídky nepropíše</span>' : '')}</div>
    ${dopad}${schvalBlok}${oddeleni}
    ${+SLC.procenta > 0 ? `<div class="btns" style="margin-top:6px"><button class="mini" onclick="${c.zrus}">Zrušit slevu</button></div>` : ''}`;
  return card(c.nazev, inner, false, c.kotva);
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

/* Podpisový blok obchodníka na KONEC tiskové nabídky (zadání 17. 8. 2026):
 * jméno, funkce a kontakt PŘIHLÁŠENÉHO zpracovatele + sken podpisu s razítkem,
 * je-li nahraný v profilu (Můj profil). Ve Wordu totéž dělají symboly ZPRAC_*
 * a {{ZPRAC_PODPIS}} v šabloně — tohle je táž informace pro online tisk.
 * Bez přihlášení se blok skládá z firemních údajů (offline build). */
function dokPodpisHtml(prekl) {
  const P = typeof prekl === 'function' ? prekl : (t => t);
  const f = (typeof firmaAktualni === 'function') ? firmaAktualni() : null;
  const p = (typeof zpracovatelPlaceholders === 'function') ? zpracovatelPlaceholders(f) : {};
  const obr = (typeof zpracovatelObrazky === 'function') ? zpracovatelObrazky() : {};
  if (!p.ZPRAC_JMENO && !obr.ZPRAC_PODPIS) return '';
  const kontakt = [p.ZPRAC_FUNKCE, p.ZPRAC_TEL, p.ZPRAC_EMAIL].filter(Boolean).join(' · ');
  return `<div class="podpis-blok" style="margin:28px 0 10px;page-break-inside:avoid">
    <div style="font-size:11px;color:#6b7686;text-transform:uppercase;letter-spacing:.03em">${esc(P('Vypracoval'))}</div>
    ${obr.ZPRAC_PODPIS ? `<img src="${esc(obr.ZPRAC_PODPIS)}" alt=""
      style="max-height:84px;max-width:250px;display:block;margin:6px 0 2px">` : ''}
    <div style="font-weight:700">${esc(p.ZPRAC_JMENO || '')}</div>
    ${kontakt ? `<div style="font-size:12px;color:#42506b">${esc(kontakt)}</div>` : ''}
  </div>`;
}

/* ---------- záložky ---------- */
let TAB = 'kalk';
const TABY = ['kalk', 'detail', 'spec', 'specdata', 'kryci', 'proj', 'detailproj', 'kryciproj', 'cenik', 'cenikproj', 'zakazka', 'zakaznici', 'schvalovani'];
function prepniTab(t) {
  if (!tabViditelny(t)) t = 'kalk';
  TAB = t;
  /* Přepnutí záložky jen přepíná viditelnost, NEVYKRESLUJE (21. 8. 2026).
   * Záložka Zákazníci si data stahuje až při otevření — bez tohohle řádku
   * zůstala viset na „Načítám zákazníky…", dokud uživatel neobnovil stránku
   * (hlášeno J. V.). Načtení si samo zavolá překreslení, až dorazí. */
  if (t === 'zakaznici' && typeof zakazniciNacti === 'function'
      && typeof ZAK_DB !== 'undefined' && !ZAK_DB.nacteno) zakazniciNacti();
  /* Přehled cenových nabídek je od 21. 8. 2026 večer především VYHLEDÁVÁNÍ
   * nabídek (zadání J. V.), takže při jeho otevření má smysl mít čerstvý
   * rejstřík — kolega mohl mezitím uložit další. Selhání se neřeší:
   * seznam se prostě vypíše z toho, co je v paměti. */
  if (t === 'zakazka' && typeof onlineNactiRejstrik === 'function'
      && typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV.ja)
    onlineNactiRejstrik().then(() => { if (TAB === 'zakazka') renderPrehledHledaniTelo(); }).catch(() => {});
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
    /* heat mapa (#26) jede s uživatelem: každé překreslení aplikace
     * překreslí i ji — jinak by po přepnutí záložky ukazovala staré prvky */
    if (typeof heatPoRenderu === 'function') heatPoRenderu();
    /* Otevřené okno Nastavení se překresluje SPOLU s aplikací (21. 8. 2026
     * večer). Do té doby ho obnovoval jen `nastRefresh()` — jenže od chvíle,
     * kdy se do Nastavení přestěhovala karta Databáze, sedí v modálním okně
     * tlačítka („Zálohovat teď", „Uložit online", „Odhlásit"), jejichž obsluhy
     * volají obyčejný `render()`. Ten okno neznal, takže se po kliknutí
     * viditelně nestalo nic — hlášku i nový stav nikdo nevykreslil.
     * Hlášeno J. V.: „tlačítko zálohovat teď databázi nefunguje." */
    if (typeof nastOtevreno === 'function' && nastOtevreno()
        && typeof renderNastaveni === 'function') renderNastaveni();
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
  if (typeof renderNahledLista === 'function') renderNahledLista();
  if (typeof renderProstrediLista === 'function') renderProstrediLista();
  if (typeof renderZapisLista === 'function') renderZapisLista();
  if (typeof renderUkazkoveLista === 'function') renderUkazkoveLista();
  if (typeof renderBuildLista === 'function') renderBuildLista();
  renderRezimPill();
  renderVerzePill();
  renderKalkHlavicka();
  renderInputs(); renderOutputs();
  renderNabidkaOck();
  renderDetail();
  if (typeof renderDetailProj === 'function') renderDetailProj();
  renderTechspec();
  renderSpecData();
  renderKryci();
  renderProj();
  renderKryciProj();
  renderCenik();
  renderCenikProj();
  renderZakazka();
  if (typeof renderZakaznici === 'function') renderZakaznici();
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
