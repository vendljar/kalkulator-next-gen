/* ========== ONLINE DATABÁZE – prohlížečová část (4. 8. 2026) ==========
 *
 * Zadání: „Ještě by to chtělo nějak vyřešit online databázi. Zatím se stále
 * mapuje Google drive a to asi není žádoucí. Na google drive se má odlévat
 * záloha databáze."
 *
 * Serverová strana žije v netlify/functions (Netlify Blobs) a testuje se
 * v Node (netlify/test_funkce.mjs). Tady je obsluha v prohlížeči:
 *
 *  - přihlášení e-mailem a heslem (relace = HttpOnly cookie, 12 hodin),
 *  - platný ceník se po přihlášení načte ze serveru a použije stejnou
 *    cestou jako ceník ze složky (progPouzij) — žádná druhá pravda,
 *  - zakázky se ukládají a otevírají online (server hlídá zámky
 *    odeslaných nabídek stejným kódem jako složka),
 *  - správa účtů (jen administrátor; reset hesla vždy administrátorem),
 *  - záloha databáze se ODLÉVÁ na Disk Google: po přihlášení administrátora
 *    se jednou denně sama zapíše do připojené složky, a kdykoli jde pořídit
 *    ručně (do složky i jako stažený soubor).
 *
 * KDO MÁ PŘEDNOST, KDYŽ JE PŘIPOJENÁ I SLOŽKA (přechodné období):
 * složka. Dokud je připojená složka _DB s databází programu, platí ceník
 * z ní — přesně jako dosud. Jakmile složka připojená není (cílový stav),
 * platí ceník online. Rozhoduje se to na jednom místě (onlineTik), takže
 * po odpojení složky se online ceník nasadí sám a aplikace nikdy nezůstane
 * stát na prázdném ceníku ze sestavení, když je odkud brát.
 *
 * NA file:// SE NIC NEVOLÁ: bez http(s) není odkud brát /api, sonda se
 * nespouští a karta jen vysvětlí, že online část ožije na serveru.
 * Harnessy nad file:// tak zůstávají bez síťových chyb v konzoli.
 * ======================================================================= */

const ONLINE_STAV = {
  bezi: false,       // /api/zdravi odpovědělo → běžíme na serveru s funkcemi
  prostredi: 'ostre',   // 'ostre' | 'test' – z /api/zdravi (proměnná PROSTREDI)
  prostrediPopis: '',   // volitelný text do pruhu (PROSTREDI_POPIS)
  sondaHotova: false,// první dotaz na /api/zdravi už doběhl (ať tak, či tak)
  serverVerze: '',   // verze nasazená na serveru (hlídka zastaralé stránky, 19. 8. 2026)
  nouzove: false,    // uživatel vědomě pokračuje bez přihlášení (server neběží)
  /* { email, jmeno, titul, funkce, telefon, role, podpis } po přihlášení.
   * Od 5. 8. 2026 (#145) nese účet i to, čím se člověk podepisuje pod cenovou
   * nabídkou — titul před jménem, funkci, telefon a sken podpisu s razítkem.
   * Dřív byl tenhle blok zapečený v šabloně, takže každá nabídka odcházela
   * pod jménem jednoho kolegy, ať ji dělal kdokoli. */
  ja: null,
  db: null,          // normalizovaná databáze programu ze serveru
  cenikPouzit: false,// online ceník je právě nasazený v aplikaci
  firma: null,       // { udaje, kdo, kdy } – firemní údaje ze serveru
  firmaPouzita: false,// online firemní údaje jsou právě nasazené v aplikaci
  /* Matice zobrazení ze serveru (#136): { matice, kdo, kdy }. Na rozdíl od
   * ceníku a firemních údajů tu není dvojka „ze serveru / ze složky" — matice
   * má jediný domov (server), takže se po načtení rovnou nasadí do NAST. */
  zobrazeni: null,
  rejstrik: [],      // rejstřík online zakázek
  otisky: [],        // souhrny záloh databáze (jen administrátor; bez dat)
  otiskyNacteno: false,
  soubor: '',        // pod jakým jménem je otevřená zakázka online
  razitko: '',
  posledni: '',      // co jsme naposledy zapsali (proti zbytečným zápisům)
  /* Kdy se naposledy povedl zápis do databáze. Lišta z toho ukazuje
   * „uloženo v HH:MM" – bez času vypadá stejně ráno i večer a obchodník
   * z ní nepozná, jestli tam poslední úprava opravdu je. Otevření zakázky
   * čas NENASTAVUJE: otevřít není totéž co uložit. */
  kdyUlozeno: null,
  /* Stav vyhledávání nabídek v záložce Přehled cenových nabídek (21. 8. 2026).
   * Je to nastavení okna, ne dat — do zakázky se neukládá. */
  prehled: { hledat: '', druh: 'vse', vybrane: [] },
  auto: true,
  timer: null,
  hledat: '',
  uzivatele: [],
  uzivateleNacteno: false, // seznam účtů už byl (aspoň jednou) vyžádán
  /* Formulář „založit účet" žije ve stavu, ne jen v polích: panel se při
   * každé akci překresluje a hodnoty v DOM by se ztratily. Maže se až po
   * ÚSPĚŠNÉM založení — po chybě zůstává vyplněný (4. 8. 2026 večer). */
  uzForm: { email: '', jmeno: '', titul: '', funkce: 'Obchodní technik', telefon: '',
            role: 'Obchodník', heslo: '' },
  /* Okno „Můj profil" (#145). Drží rozpracované hodnoty stejně jako uzForm:
   * panel se překresluje po každé akci (třeba po nahrání podpisu) a rozepsaný
   * telefon v poli DOM by se ztratil. */
  profil: null,
  profilHlaska: '',
  profilTyp: '',
  hesloPro: '',      // e-mail účtu, u kterého je rozbalený reset hesla
  formEmail: '',     // přihlašovací formulář přežívá překreslení
  formHeslo: '',
  hlaska: '',
  hlaskaTyp: '',     // '' | 'varovani' | 'chyba'
  hesloHlaska: '',   // hláška v okně změny vlastního hesla
  pracuje: false,
};

/* Počet zakázek česky: 1 zakázka, 2–4 zakázky, jinak (i 0) zakázek. */
function onlinePocetText(n) {
  return n + ' ' + (n === 1 ? 'zakázka' : (n >= 2 && n < 5 ? 'zakázky' : 'zakázek'));
}

function onlineMozne() {
  return typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
    && typeof fetch === 'function';
}

function onlineZprava(text, typ) {
  ONLINE_STAV.hlaska = text || '';
  ONLINE_STAV.hlaskaTyp = typ || '';
}

function jeAdminOnline() {
  return !!(ONLINE_STAV.ja && ONLINE_STAV.ja.role === 'Administrátor');
}

/* Jedno místo pro všechna volání /api. Vypršelá relace (401) se pozná tady:
 * stav přihlášení se shodí, aby karta nelhala, a chyba se předá dál. */
/* `metoda` (20. 8. 2026) je nepovinná — potřebuje ji jen mazání karty
 * zákazníka (DELETE). Bez ní se chová přesně jako dosud: bez těla GET,
 * s tělem POST. */
function onlineApi(cesta, telo, metoda) {
  const o = { credentials: 'same-origin' };
  if (telo !== undefined && telo !== null) {
    o.method = 'POST';
    o.headers = { 'Content-Type': 'application/json' };
    o.body = JSON.stringify(telo);
  }
  if (metoda) o.method = metoda;
  return fetch(cesta, o).then(r => r.json().catch(() => ({})).then(d => {
    if (r.status === 401 && ONLINE_STAV.ja) {
      ONLINE_STAV.ja = null; ONLINE_STAV.db = null; ONLINE_STAV.cenikPouzit = false;
      onlineZprava('Přihlášení vypršelo – přihlaste se prosím znovu.', 'varovani');
    }
    if (!r.ok || d.ok === false) {
      const e = new Error(d.chyba || ('server odpověděl ' + r.status));
      /* Celá odpověď jde s chybou dál (`e.data`). Odmítnutí občas nese vedle
       * hlášky i údaj, se kterým se dá pracovat — třeba počet zakázek, kvůli
       * kterým nešlo smazat účet. Bez toho by ho volající musel luštit z textu. */
      e.data = d; e.stav = r.status;
      throw e;
    }
    return d;
  }));
}

/* ---------- start a přihlášení ---------- */

function onlineStart() {
  if (!onlineMozne()) return;
  ONLINE_STAV.sondaHotova = false;
  renderPrihlaseni();
  fetch('/api/zdravi').then(r => (r.ok ? r.json() : null)).then(z => {
    if (!z || !z.ok) return null;
    ONLINE_STAV.bezi = true;
    ONLINE_STAV.serverVerze = z.verze || '';
    /* Testovací web se musí poznat na první pohled (20. 8. 2026) — viz
     * renderProstrediLista(). */
    ONLINE_STAV.prostredi = z.prostredi || 'ostre';
    ONLINE_STAV.prostrediPopis = z.popisProstredi || '';
    onlineVerzeHlidkaStart();
    // Cookie relace mohla přežít obnovení stránky – zeptáme se, kdo jsme.
    return fetch('/api/ja', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(ja => (ja && ja.ok ? onlinePoPrihlaseni(ja) : null))
      .catch(() => null);
  }).catch(() => null)
    .then(() => { ONLINE_STAV.sondaHotova = true; if (typeof render === 'function') render(); });
}

/* Hlídka nasazené verze (19. 8. 2026): stránka zůstává otevřená celé dny,
 * nasazení nové dávky ji samo nepřekreslí. Každých 10 minut se server zeptáme
 * na verzi; rozdíl ukáže červený štítek v hlavičce (renderVerzePill). */
let onlineVerzeCasovac = null;
function onlineVerzeHlidkaStart() {
  if (onlineVerzeCasovac) return;
  onlineVerzeCasovac = setInterval(onlineVerzeTik, 10 * 60 * 1000);
}
function onlineVerzeTik() {
  return fetch('/api/zdravi').then(r => (r.ok ? r.json() : null)).then(z => {
    if (!z || !z.ok) return false;
    const nova = z.verze || '';
    if (nova === ONLINE_STAV.serverVerze) return false;
    ONLINE_STAV.serverVerze = nova;
    if (typeof renderVerzePill === 'function') renderVerzePill();
    return true;
  }).catch(() => false);
}

function onlinePrihlas() {
  const email = String(ONLINE_STAV.formEmail || '').trim();
  const heslo = String(ONLINE_STAV.formHeslo || '');
  if (!email || !heslo) { onlineZprava('Zadejte e-mail i heslo.', 'varovani'); render(); return Promise.resolve(false); }
  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/prihlaseni', { email, heslo })
    .then(o => { ONLINE_STAV.formHeslo = ''; return onlinePoPrihlaseni(o).then(() => true); })
    .catch(e => { onlineZprava('Přihlášení se nepodařilo: ' + e.message, 'varovani'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
}

/* Po přihlášení se aplikace srovná podle serveru: jméno do razítek a
 * protokolu, role do viditelnosti záložek (skutečná práva beztak hlídá
 * server – upravenému klientovi role v prohlížeči nepomůže). */
function onlinePoPrihlaseni(ja) {
  ONLINE_STAV.ja = { email: ja.email, jmeno: ja.jmeno || '', role: ja.role,
    titul: ja.titul || '', funkce: ja.funkce || '', telefon: ja.telefon || '',
    podpis: ja.podpis || '' };
  ONLINE_STAV.uzivateleNacteno = false;   // seznam účtů se načte čerstvý
  if (typeof NAST !== 'undefined') {
    NAST.uzivatel = ja.jmeno || ja.email;
    NAST.jeAdmin = ja.role === 'Administrátor';
  }
  onlineZprava('Přihlášen: ' + (ja.jmeno || ja.email) + ' (' + ja.role + ').');
  /* Matice zobrazení se načítá spolu s ostatním — a hlavně PŘED prvním
   * překreslením, aby rozhraní hned napoprvé odpovídalo roli. Kdyby dorazila
   * později, obchodník by na okamžik zahlédl ceníky a pak by mu zmizely. */
  return Promise.all([onlineNactiProgram(), onlineNactiFirmu(), onlineNactiZobrazeni(), onlineNactiRejstrik(),
                      onlineNactiSablony(),
                      /* analytika (#27): zjistit, jestli je sběr zapnutý, a nastartovat ho */
                      typeof analytikaPoPrihlaseni === 'function' ? analytikaPoPrihlaseni() : Promise.resolve()])
    .then(() => onlineObnovPosledni())
    .then(() => { if (jeAdminOnline()) onlineZalohaAuto(); });
}

function onlineOdhlas() {
  return onlineApi('/api/odhlaseni', {}).catch(() => null).then(() => {
    const vladlOnline = ONLINE_STAV.cenikPouzit;
    const vladlaFirma = ONLINE_STAV.firmaPouzita;
    ONLINE_STAV.ja = null; ONLINE_STAV.db = null; ONLINE_STAV.cenikPouzit = false;
    ONLINE_STAV.firma = null; ONLINE_STAV.firmaPouzita = false;
    /* Matice zpět na výchozí: odhlášený nemá čím doložit, komu co přidělil
     * administrátor, a výchozí stav je ten opatrnější (navíc nevidí nikdo). */
    ONLINE_STAV.zobrazeni = null; onlineZobrazeniNasad(null);
    if (typeof NAST !== 'undefined') NAST.nahledRole = '';
    ONLINE_STAV.rejstrik = []; ONLINE_STAV.soubor = ''; ONLINE_STAV.razitko = ''; ONLINE_STAV.posledni = '';
    onlinePoslednizapamatuj('');   // po odhlášení se nikam nevracíme
    ONLINE_STAV.kdyUlozeno = null;
    ONLINE_STAV.uzivatele = []; ONLINE_STAV.uzivateleNacteno = false; ONLINE_STAV.formHeslo = '';
    /* Náhled cizího uživatele se odhlášením ruší — po přihlášení nikdy
     * nikdo nesmí zdědit cizí pohled po předchozím sezení (20. 8. 2026). */
    if (typeof nahledVypni === 'function' && NAST.nahledUzivatel) { NAST.nahledUzivatel = null; NAST.nahledRole = ''; NAST.nahledMenu = false; }
    ONLINE_STAV.otisky = []; ONLINE_STAV.otiskyNacteno = false;
    ONLINE_STAV.sablonyRejstrik = null;   // šablony patří přihlášeným (#139)
    /* analytika (#26): případná zapnutá heat mapa po odhlášení zhasne
     * a sběr se zastaví (analytikaBezi bez přihlášení nic nepustí) */
    if (typeof ANL !== 'undefined' && ANL.heat) {
      ANL.heat = false;
      if (typeof heatSmaz === 'function') { heatSmaz(); heatPanelSmaz(); }
    }
    if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
    /* Když v aplikaci vládl online ceník, po odhlášení k němu už není zdroj –
     * návrat k ceníku ze sestavení, stejná úvaha jako při odpojení složky. */
    if (vladlOnline && typeof progJede === 'function' && !progJede()
      && typeof progZpetNaBuild === 'function') progZpetNaBuild();
    /* Totéž s firemními údaji: odhlášený uživatel nemá čím doložit, že v
     * hlavičce nabídky je skutečná firma. Vrátí se vzorek ze sestavení
     * i s červenou lištou — raději viditelně vymyšlené než tiše zastaralé. */
    if (vladlaFirma && typeof NAST !== 'undefined' && typeof konfigNahradVMiste === 'function')
      konfigNahradVMiste(NAST.firma, firmaDefault());
    onlineZprava('Odhlášeno. Aplikace se vrátila k cenám, které má odkud doložit '
      + '(složka, jinak ceník ze sestavení).');
    render();
  });
}

/* ---------- platný ceník ze serveru ---------- */

function onlineNactiProgram() {
  return onlineApi('/api/program').then(o => {
    ONLINE_STAV.db = o.db ? programNormalizuj(o.db) : null;
    /* Nasazení nechává na onlineTik – tam je jediné místo, které ví,
     * jestli zrovna nevládne složka. */
    ONLINE_STAV.cenikPouzit = false;
    return true;
  }).catch(e => {
    onlineZprava('Platný ceník se ze serveru nepodařilo načíst: ' + e.message, 'varovani');
    return false;
  });
}

function onlineVerzeInfo() {
  const p = ONLINE_STAV.db && ONLINE_STAV.db.platny;
  return p ? { verze: p.verze, platnoOd: p.platnoOd || '' } : { verze: null, platnoOd: '' };
}

/* Zveřejnění online – stejná úvaha jako progZverejni nad složkou, jen zápis
 * jde na server (a server si admina i „beze změny" zkontroluje ještě sám). */
function onlineZverejni(preddanaPozn) {
  if (!jeAdminOnline()) { onlineZprava('Zveřejnit ceník smí jen administrátor.', 'varovani'); render(); return Promise.resolve(false); }
  const ctx = progKontext('');
  if (ONLINE_STAV.db && programBezeZmeny(ONLINE_STAV.db, ctx)) {
    onlineZprava('Ceník této varianty se od online verze neliší – není co zveřejňovat.');
    render(); return Promise.resolve(false);
  }
  const rozdily = ONLINE_STAV.db ? programRozdily(ONLINE_STAV.db, ctx) : [];
  const zahrPocet = (ctx.zahranicni && ctx.zahranicni.ceny)
    ? Object.keys(ctx.zahranicni.ceny).length : 0;
  const shrnuti = (ONLINE_STAV.db
    ? (rozdily.length ? rozdily.length + ' změněných položek ceníku' : 'ceník beze změny, mění se katalog nebo slevy')
    : 'založení online databáze programu')
    + (zahrPocet ? ' · zahraniční řada: ' + zahrPocet + ' odchylek' : '');
  const pozn = (typeof preddanaPozn === 'string') ? preddanaPozn
    : prompt('Zveřejnit ceník aktivní varianty jako platný ONLINE pro celý program?\n\n'
    + shrnuti + '.\nOd této chvíle z něj budou vycházet nové nabídky všech přihlášených.\n'
    + 'Rozpracované nabídky se přepočítají samy, vytištěné (uzamčené) zůstanou beze změny.'
    + '\n\nČím se změna zdůvodňuje (nepovinné):', '');
  if (pozn === null) return Promise.resolve(false);

  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/program', {
    cenik: ctx.cenik, cenikProj: ctx.cenikProj, zahranicni: ctx.zahranicni,
    katalog: ctx.katalog,
    slevy: ctx.slevy, poznamka: pozn, build: ctx.build,
  }).then(o => {
    onlineZprava('Zveřejněno online – platí verze ' + o.verze + '.');
    return onlineNactiProgram().then(() => true);
  }).catch(e => { onlineZprava('Zveřejnit online se nepodařilo: ' + e.message, 'chyba'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
}

/* ---------- centrální šablony dokumentů (#139, 13. 8. 2026) ----------
 *
 * Rejstřík (verze, otisky, režim) se načítá hned po přihlášení; SOUBORY
 * šablon se stahují až ve chvíli generování a drží se v paměti podle
 * typu a verze — nová verze na serveru se tedy projeví okamžitě, protože
 * má jiný klíč a stará se z paměti prostě přestane používat. */
const SABLONY_ONLINE_CACHE = {};

function onlineNactiSablony() {
  return onlineApi('/api/sablony').then(o => {
    ONLINE_STAV.sablonyRejstrik = o.rejstrik || null;
    return true;
  }).catch(e => {
    /* Nenačtený rejstřík NENÍ „žádné šablony": v přísném režimu se z něj
     * rozhoduje o zákazu tisku, proto se rozlišuje null (nevím — server
     * nedostupný) a rejstřík bez šablon (vím, že nic není). */
    ONLINE_STAV.sablonyRejstrik = null;
    return false;
  });
}

function onlineSablonyRezim() {
  const r = ONLINE_STAV.sablonyRejstrik;
  return (r && r.rezim) === 'mekky' ? 'mekky' : 'prisny';
}

function onlineSablonaMeta(typ) {
  return (typeof sablonaPlatna === 'function')
    ? sablonaPlatna(ONLINE_STAV.sablonyRejstrik, typ) : null;
}

/* Stažení platné šablony daného typu → Promise<{nazev, verze, otisk, data:ArrayBuffer}>.
 * Vrací null, když šablona na serveru není (o zákazu tisku rozhoduje volající
 * podle režimu — tahle funkce jen přináší data). */
function onlineSablonaStahni(typ) {
  const meta = onlineSablonaMeta(typ);
  if (!meta) return Promise.resolve(null);
  const klic = typ + '/' + meta.verze;
  if (SABLONY_ONLINE_CACHE[klic]) return Promise.resolve(SABLONY_ONLINE_CACHE[klic]);
  return onlineApi('/api/sablony?typ=' + encodeURIComponent(typ)).then(o => {
    const bin = atob(o.data);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const v = { nazev: o.nazev, verze: o.verze, otisk: o.otisk, data: u8.buffer };
    SABLONY_ONLINE_CACHE[klic] = v;
    return v;
  });
}

/* Zveřejnění šablony — volá obrazovka Nastavení → Šablony. Soubor jde na
 * server v base64; verzi, otisk i odmítnutí ne-Wordu řeší server. */
function onlineSablonaZverejni(typ, nazev, arrayBuffer, poznamka) {
  const u8 = new Uint8Array(arrayBuffer);
  let bin = '';
  const KROK = 32768;   // String.fromCharCode má strop na počet argumentů
  for (let i = 0; i < u8.length; i += KROK)
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + KROK));
  return onlineApi('/api/sablony', { akce: 'zverejnit', typ, nazev, data: btoa(bin),
                                     poznamka: String(poznamka || '') })
    .then(o => onlineNactiSablony().then(() => o));
}

function onlineSablonyRezimNastav(rezim) {
  return onlineApi('/api/sablony', { akce: 'rezim', rezim })
    .then(() => onlineNactiSablony());
}

/* ---------- firemní údaje ze serveru (4. 8. 2026) ----------
 *
 * Dokud byly firemní údaje jen v `_DB/_nastaveni.json`, měl je odkud vzít
 * pouze administrátor — složku nikdo jiný nemapuje. Obchodníkovi proto
 * zůstávala „Ukázková firma s.r.o." v hlavičce nabídky a červená lišta
 * „Firemní údaje jsou ukázkové" nešla zhasnout ničím, co by mohl udělat.
 * Online cesta je pro něj jediná — stejná jako u ceníku. */

function onlineNactiFirmu() {
  return onlineApi('/api/firma').then(o => {
    ONLINE_STAV.firma = (o.firma && o.firma.udaje) ? o.firma : null;
    /* Nasazení dělá onlineTik — jen tam se ví, jestli nevládne složka. */
    ONLINE_STAV.firmaPouzita = false;
    return true;
  }).catch(e => {
    onlineZprava('Firemní údaje se ze serveru nepodařilo načíst: ' + e.message, 'varovani');
    return false;
  });
}

/* Srovnání toho, co je v aplikaci, se zveřejněnou kopií (#142).
 * Logika je ve firma.js, tady jen sáhnutí na živý stav. */
function onlineFirmaShoda() {
  if (typeof firmaShodaSOnline !== 'function')
    return { maOnline: false, shodne: false, rozdily: [] };
  return firmaShodaSOnline(typeof NAST !== 'undefined' ? NAST.firma : null,
    ONLINE_STAV.firma ? ONLINE_STAV.firma.udaje : null);
}

/* Krátký popis stavu do Nastavení → Firma. */
function onlineFirmaPopis() {
  if (!ONLINE_STAV.ja) return 'Nepřihlášen – online firemní údaje se načtou po přihlášení.';
  if (!ONLINE_STAV.firma)
    return 'V online databázi firemní údaje zatím nejsou. Dokud je tam nezveřejníte, '
      + 'mají obchodníci v hlavičce nabídky ukázkovou firmu ze sestavení.';
  /* Zadání 5. 8. 2026 (#142): „Proč musím pořád zveřejňovat firemní údaje?
   * Ty už jsem nahrál a zveřejnil." Věta musí sama říct, jestli je nahoře
   * totéž. Dosavadní „· právě platí v aplikaci" na to neodpovídalo: rozsvítilo
   * se jen tomu, komu se online kopie do aplikace opravdu nasadila, a tomu, kdo
   * má připojenou složku _DB, se nenasazuje nikdy – tedy právě administrátorovi,
   * který se ptá. */
  const sh = onlineFirmaShoda();
  return 'Online zveřejněno ' + String(ONLINE_STAV.firma.kdy || '').slice(0, 16).replace('T', ' ')
    + ' (' + (ONLINE_STAV.firma.kdo || '?') + ') · ' + (ONLINE_STAV.firma.udaje.nazev || '')
    + (sh.shodne ? ' · shodné s tím, co máte v Nastavení → Firma'
                 : ' · liší se od toho, co máte tady')
    + (ONLINE_STAV.firmaPouzita ? ' · právě platí v aplikaci' : '');
}

/* Zveřejnění – posílá se to, co je právě v Nastavení → Firma. Posílají se
 * ÚDAJE TAK, JAK JSOU (i se značkou ukázkových dat): server si musí umět sám
 * říct ne, kdyby prohlížeč někdo obešel. Čistou kopii si udělá on. */
function onlineZverejniFirmu() {
  if (!jeAdminOnline()) {
    onlineZprava('Firemní údaje smí zveřejnit jen administrátor.', 'varovani'); render();
    return Promise.resolve(false);
  }
  const lze = firmaLzeZverejnit(typeof NAST !== 'undefined' ? NAST.firma : null);
  if (!lze.ok) {
    onlineZprava('Zveřejnit se nedají: ' + lze.duvod, 'varovani'); render();
    return Promise.resolve(false);
  }
  if (!confirm('Zveřejnit firemní údaje online pro celý program?\n\n'
    + (NAST.firma.nazev || '') + ', ' + firmaSidlo(NAST.firma) + '\n\n'
    + 'Od této chvíle je uvidí v hlavičce nabídky všichni přihlášení, i ti, '
    + 'kdo nemají připojenou složku _DB.')) return Promise.resolve(false);

  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/firma', { udaje: NAST.firma })
    .then(() => onlineNactiFirmu().then(() => {
      onlineZprava('Firemní údaje jsou zveřejněné online – obchodníci je uvidí po přihlášení.');
      return true;
    }))
    .catch(e => { onlineZprava('Zveřejnit firemní údaje se nepodařilo: ' + e.message, 'chyba'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); if (typeof nastRefresh === 'function') nastRefresh(); return v; });
}

/* Panel do Nastavení → Firma (jen administrátor, jen na serveru). */
function onlineFirmaPanel() {
  if (!onlineMozne() || !ONLINE_STAV.bezi || !jeAdminOnline()) return '';
  const lze = firmaLzeZverejnit(typeof NAST !== 'undefined' ? NAST.firma : null);
  const sh = onlineFirmaShoda();
  /* Když je nahoře totéž, co má administrátor u sebe, nemá se po něm chtít
   * gesto, které už jednou udělal (#142). Tlačítko nezmizí – jen přestane být
   * tím hlavním, co panel nabízí, a řekne rovnou, k čemu je: zveřejnit znovu
   * má smysl leda po ruční opravě na serveru. Zmizet nesmí proto, že jediná
   * cesta, jak online kopii přepsat, vede právě tudy. */
  const hotovo = sh.shodne;
  const rozdilVeta = (sh.maOnline && !sh.shodne)
    ? 'Oproti online kopii se liší: ' + sh.rozdily.slice(0, 6).join(', ')
      + (sh.rozdily.length > 6 ? ' a další' : '') + '.'
    : '';
  return `<div class="sec-title">Firemní údaje v online databázi</div>
    <div class="note" style="margin-top:0">${esc(onlineFirmaPopis())}</div>
    ${lze.ok ? '' : `<div class="note" style="color:var(--warn)">⚠ ${esc(lze.duvod)}</div>`}
    ${hotovo ? `<div class="note" style="color:var(--ok)">✓ Online databáze má přesně tyhle údaje.
      Zveřejňovat je znovu není potřeba.</div>` : ''}
    ${rozdilVeta ? `<div class="note" style="color:var(--warn)">⚠ ${esc(rozdilVeta)}
      Dokud je nezveřejníte, platí pro ostatní pořád ta starší verze.</div>` : ''}
    <div class="btns" style="margin-top:8px">
      <button class="${hotovo ? 'mini' : 'primary'}" onclick="onlineZverejniFirmu()"
        ${ONLINE_STAV.pracuje || !lze.ok ? 'disabled' : ''}>${hotovo
          ? 'Zveřejnit znovu (není potřeba)' : 'Zveřejnit firemní údaje online'}</button>
      <button class="mini" onclick="onlineNactiFirmu().then(function(){render();nastRefresh()})">Načíst online znovu</button>
    </div>
    <div class="note">Obchodník ani vedoucí složku <code>_DB</code> nemapují – hlavičku nabídky
      mají odkud vzít jedině odsud. Dokud je připojená složka, má v aplikaci přednost ona;
      bez ní platí tahle online verze.</div>`;
}

/* ---------- matice zobrazení ze serveru (5. 8. 2026, #136) ----------
 *
 * Rozhodnutí „co uvidí obchodník a co vedoucí" je pravidlo pro celou firmu.
 * Kdyby leželo v `_DB/_nastaveni.json`, dostal by se k němu jen administrátor
 * — tedy právě ten, komu je jedno, protože vidí všechno. Proto server, stejně
 * jako u firemních údajů.
 *
 * Nasazení je oproti ceníku i firmě jednoduché: matice se po načtení rovnou
 * zapíše do NAST.zobrazeni. Nemá totiž konkurenci ze složky, kterou by mohla
 * nechtěně přepsat, a když na serveru ještě nic není, platí výchozí matice —
 * ta se do posledního prvku rovná dosavadnímu chování (jediné dělítko
 * `jeAdmin()`), takže se nepřihlášenému ani novému programu nic nemění. */

function onlineZobrazeniNasad(matice) {
  if (typeof NAST === 'undefined') return;
  const m = (typeof zobrazeniOciste === 'function')
    ? zobrazeniOciste(matice)
    : (typeof zobrazeniVychozi === 'function' ? zobrazeniVychozi() : {});
  /* Nahrazení NA MÍSTĚ: na NAST.zobrazeni se drží odkazy jinde v aplikaci
   * (panel Nastavení → Zobrazení pracuje přímo s objektem). */
  if (typeof konfigNahradVMiste === 'function' && NAST.zobrazeni) konfigNahradVMiste(NAST.zobrazeni, m);
  else NAST.zobrazeni = m;
}

function onlineNactiZobrazeni() {
  return onlineApi('/api/zobrazeni').then(o => {
    ONLINE_STAV.zobrazeni = (o.zobrazeni && o.zobrazeni.matice) ? o.zobrazeni : null;
    onlineZobrazeniNasad(ONLINE_STAV.zobrazeni ? ONLINE_STAV.zobrazeni.matice : null);
    return true;
  }).catch(e => {
    onlineZprava('Nastavení zobrazení se ze serveru nepodařilo načíst: ' + e.message
      + ' Platí výchozí rozdělení (vše navíc vidí jen administrátor).', 'varovani');
    onlineZobrazeniNasad(null);
    return false;
  });
}

/* Krátký popis stavu do Nastavení → Zobrazení. */
function onlineZobrazeniPopis() {
  if (!ONLINE_STAV.ja) return 'Nepřihlášen – nastavení zobrazení se načte po přihlášení.';
  if (!ONLINE_STAV.zobrazeni)
    return 'V online databázi zatím žádné rozdělení není. Platí výchozí: obchodník '
      + 'i vedoucí vidí totéž co dosud, všechno ostatní zůstává administrátorovi.';
  return 'Online zveřejněno ' + String(ONLINE_STAV.zobrazeni.kdy || '').slice(0, 16).replace('T', ' ')
    + ' (' + (ONLINE_STAV.zobrazeni.kdo || '?') + ')';
}

/* Uložení matice BEZ PTANÍ (22. 8. 2026, hlášeno J. V.: „neukládají se nám
 * zobrazení v nastavení, při novém buildu se zaškrtnutí resetuje").
 *
 * Do dneška se zaškrtnutí drželo jen v paměti prohlížeče a na server odešlo
 * teprve tlačítkem „Zveřejnit". Kdo tlačítko nestiskl, přišel o práci hned
 * při dalším načtení stránky — matice se totiž při každém přihlášení bere ze
 * serveru, takže neuložené zaškrtnutí nemá kde přežít. Panel proto ukládá
 * sám, krátce po poslední změně; tahle funkce je to samotné uložení.
 *
 * Očistu si server dělá vlastní (týmž kódem), aby ani upravený prohlížeč
 * nepřidělil prvek, který server stejně nepustí. */
function onlineUlozZobrazeniTise() {
  if (!jeAdminOnline()) return Promise.reject(new Error('nastavení zobrazení smí ukládat jen administrátor'));
  return onlineApi('/api/zobrazeni', { matice: NAST.zobrazeni })
    .then(() => onlineNactiZobrazeni())
    .then(() => true);
}

/* Zveřejnění s dotazem – zůstává pro hromadné přepsání tabulky předlohou,
 * kde se vyplatí říct nahlas, kolik odchylek se právě posílá všem. */
function onlineZverejniZobrazeni() {
  if (!jeAdminOnline()) {
    onlineZprava('Nastavení zobrazení smí zveřejnit jen administrátor.', 'varovani'); render();
    return Promise.resolve(false);
  }
  const zmeny = (typeof zobrazeniZmeny === 'function') ? zobrazeniZmeny(NAST.zobrazeni) : [];
  if (!confirm('Zveřejnit nastavení zobrazení online pro celý program?\n\n'
    + (zmeny.length
      ? zmeny.length + ' odchylek od výchozího rozdělení.'
      : 'Beze změny proti výchozímu rozdělení.')
    + '\n\nOd této chvíle platí všem přihlášeným – projeví se jim po dalším '
    + 'přihlášení nebo po načtení stránky.')) return Promise.resolve(false);

  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/zobrazeni', { matice: NAST.zobrazeni })
    .then(() => onlineNactiZobrazeni().then(() => {
      onlineZprava('Nastavení zobrazení je zveřejněné online.');
      return true;
    }))
    .catch(e => { onlineZprava('Zveřejnit nastavení zobrazení se nepodařilo: ' + e.message, 'chyba'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); if (typeof nastRefresh === 'function') nastRefresh(); return v; });
}

/* ---------- zakázky online ---------- */

function onlineNactiRejstrik() {
  return onlineApi('/api/zakazky').then(o => {
    ONLINE_STAV.rejstrik = uloRejstrikSerad(uloRejstrikNormalizuj(o.rejstrik));
    return true;
  }).catch(e => { onlineZprava('Seznam online zakázek se nepodařilo načíst: ' + e.message, 'varovani'); return false; });
}

/* opts.tiche = automatické uložení (neruší prací hláškou, při chybě varuje) */
function onlineUloz(opts) {
  opts = opts || {};
  if (!ONLINE_STAV.ja) {
    if (!opts.tiche) { onlineZprava('Nejdřív se přihlaste.', 'varovani'); render(); }
    return Promise.resolve(false);
  }
  // #41: rozepsané změny do protokolu hned – uložený záznam nese protokol
  // k okamžiku uložení (stejně jako ukládání do složky).
  if (typeof protokolZapisTed === 'function') protokolZapisTed();
  ONLINE_STAV.pracuje = true;
  /* Razítko verze jde se zakázkou (B10, 22. 8. 2026): server odmítne přepsat
   * verzi, ze které jsme nevyšli. Při kolizi se uživatel ptá a může vědomě
   * přepsat (`prepsat: true`). */
  const telo = { zakazka: ZAK, ocekavaneRazitko: ONLINE_STAV.razitko || '' };
  if (opts.prepsat) telo.prepsat = true;
  return onlineApi('/api/zakazky', telo).then(o => {
    ONLINE_STAV.soubor = o.soubor; ONLINE_STAV.razitko = o.razitko || '';
    onlinePoslednizapamatuj(o.soubor);   // po refreshi se sem vrátíme
    ONLINE_STAV.posledni = JSON.stringify(ZAK);
    ONLINE_STAV.kdyUlozeno = new Date();
    onlineZprava('Uloženo online jako ' + o.soubor + ' (' + new Date().toLocaleTimeString('cs-CZ') + ').');
    if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
    /* Zakázka je v databázi – nouzová záloha v prohlížeči už nemá co chránit.
     * Kdyby se nechala ležet, ptá se na ni aplikace při každém dalším spuštění
     * i za měsíc („V prohlížeči je rozpracovaná kalkulace…"). */
    if (typeof historieZalohaHotovo === 'function') historieZalohaHotovo();
    /* Liší-li se hlavička od karty zákazníka, aplikace to NABÍDNE (#162,
     * 20. 8. 2026) — nikdy nezapíše potichu. Selhání nabídky nesmí shodit
     * uložení zakázky, proto .catch(() => {}). */
    if (typeof zakaznikNabidniAktualizaci === 'function') {
      try { Promise.resolve(zakaznikNabidniAktualizaci()).catch(() => {}); } catch (e) { /* nevadí */ }
    }
    return onlineNactiRejstrik().then(() => true);
  }).catch(e => {
    /* Kolize verzí (B10): při ručním uložení se zeptat a případně přepsat;
     * automatické uložení se neptá — jen varuje, ať se nepřepisuje potichu. */
    if (e && e.data && e.data.kolize && !opts.tiche && !opts.prepsat
        && confirm(e.message + '\n\nPřepsat uloženou verzi mými změnami?')) {
      ONLINE_STAV.pracuje = false;
      return onlineUloz({ ...opts, prepsat: true });
    }
    /* Server odmítá i pokus přepsat odeslanou (uzamčenou) nabídku – jeho
     * zdůvodnění se ukáže doslova, je z téhož kódu jako hláška u složky. */
    onlineZprava('Neuloženo online: ' + e.message, 'varovani');
    return false;
  }).then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
}

/* ---------- naposledy otevřená zakázka (31. 8. 2026) ----------
 *
 * Hlášeno J. V.: „globální přirážka se resetuje i při refreshi stránky."
 * Přirážka se neresetovala — obnovení stránky prostě začalo NOVOU prázdnou
 * zakázkou a ta má přirážku z ceníku. Rozdělaná práce zůstala v pořádku
 * uložená na serveru, jen se k ní nikdo nevrátil.
 *
 * Aplikace si proto pamatuje, na které zakázce se naposledy pracovalo, a po
 * přihlášení ji sama otevře. Ukládá se jen JMÉNO souboru, nic z obsahu —
 * data zůstávají na serveru. Když zakázka mezitím zmizela nebo úložiště
 * prohlížeče není k dispozici, nic se neděje a začíná se prázdnou. */
const ONLINE_POSLEDNI_KLIC = 'kng_posledni_zakazka_v1';

function onlinePoslednizapamatuj(soubor) {
  try {
    if (typeof Uloziste === 'undefined' || !Uloziste.kDispozici()) return;
    if (soubor) Uloziste.zapis(ONLINE_POSLEDNI_KLIC, String(soubor));
    else Uloziste.smaz(ONLINE_POSLEDNI_KLIC);
  } catch (e) {}
}

function onlinePosledniZapamatovana() {
  try {
    if (typeof Uloziste === 'undefined' || !Uloziste.kDispozici()) return '';
    return Uloziste.cti(ONLINE_POSLEDNI_KLIC) || '';
  } catch (e) { return ''; }
}

/* Po přihlášení: vrátit se tam, kde uživatel skončil. Otevírá se jen do
 * PRÁZDNÉ zakázky — kdyby už měl rozdělanou práci (obnovená záloha z historie),
 * měla by přednost a nikdo o ni nesmí přijít. */
function onlineObnovPosledni() {
  const soubor = onlinePosledniZapamatovana();
  if (!soubor || ONLINE_STAV.soubor) return Promise.resolve(false);
  const jeVRejstriku = (ONLINE_STAV.rejstrik || []).some(z => z.soubor === soubor);
  if (!jeVRejstriku) { onlinePoslednizapamatuj(''); return Promise.resolve(false); }
  if (typeof historieNeulozeno === 'function' && historieNeulozeno()) return Promise.resolve(false);
  return onlineOtevri(soubor).then(v => {
    if (v) onlineZprava('Otevřena zakázka, na které jste naposledy pracoval: ' + soubor + '.');
    return v;
  }).catch(() => false);
}

function onlineOtevri(soubor) {
  if (!ONLINE_STAV.ja) return Promise.resolve(false);
  if (typeof historieNeulozeno === 'function' && historieNeulozeno()
    && !confirm('Otevřená zakázka má neuložené změny. Otevřít jinou a ty změny zahodit?'))
    return Promise.resolve(false);
  ONLINE_STAV.pracuje = true; renderOnlinePanel();
  return onlineApi('/api/zakazky?soubor=' + encodeURIComponent(soubor)).then(o => {
    ZAK = importZakazka(o.zakazka);
    syncVarianta();
    ONLINE_STAV.soubor = soubor;
    onlinePoslednizapamatuj(soubor);
    ONLINE_STAV.razitko = (typeof uloRazitko === 'function') ? uloRazitko(ZAK) : '';
    ONLINE_STAV.posledni = JSON.stringify(ZAK);
    ONLINE_STAV.kdyUlozeno = null;
    if (typeof seznamReset === 'function') seznamReset();
    /* Otevřít se musí nad ceníkem, který právě platí – rozpracované varianty
     * se srovnají, uzamčené se nedotknou (stejné pravidlo jako u složky). */
    const prep = (typeof uloSrovnejSPlatnymCenikem === 'function') ? uloSrovnejSPlatnymCenikem() : null;
    onlineZprava('Otevřeno online: ' + soubor + '.'
      + (prep && prep.prepocteno && typeof uloPrepocetVeta === 'function' ? ' ' + uloPrepocetVeta(prep) : ''));
    zavriOnline();
    render();
    if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
    return true;
  }).catch(e => { onlineZprava('Zakázku se nepodařilo otevřít: ' + e.message, 'varovani'); renderOnlinePanel(); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; return v; });
}

/* ---------- záloha („odlévání" na Disk Google) ---------- */

function onlineZalohaJmeno() {
  return 'zaloha_online_' + new Date().toISOString().slice(0, 10) + '.json';
}

/* doSlozky=true → zapsat do připojené složky (na Disku Google se pak
 * synchronizuje sama); jinak stažení souborem. */
function onlineZaloha(doSlozky) {
  if (!jeAdminOnline()) { onlineZprava('Zálohu smí pořídit jen administrátor.', 'varovani'); render(); return Promise.resolve(false); }
  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/zaloha').then(o => {
    const jmeno = onlineZalohaJmeno();
    const text = JSON.stringify(o.zaloha, null, 1);
    if (doSlozky && typeof ULO_STAV !== 'undefined' && ULO_STAV.pripraveno) {
      return uloZapisSoubor(jmeno, text).then(() => {
        onlineZprava('Záloha online databáze odlita do složky „' + ULO_STAV.jmeno + '" jako '
          + jmeno + ' – Disk Google si ji zálohuje sám.');
        return true;
      });
    }
    souborKeStazeni(jmeno, text);
    onlineZprava('Záloha ' + jmeno + ' je ve Staženích. Uložte ji na Disk Google.');
    return true;
  }).catch(e => { onlineZprava('Zálohu se nepodařilo pořídit: ' + e.message, 'varovani'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
}

/* ---------- otisky databáze na serveru (vynucená i noční záloha) ---------- */

/* Přehled otisků: kdy záloha naposledy vznikla a odkud. Seznam vozí JEN
 * souhrny (den, čas, zdroj, počty) – obsah otisků z něj vytáhnout nejde,
 * viz netlify/lib/zalohovani.mjs. */
function onlineOtiskyNacti() {
  if (!jeAdminOnline()) return Promise.resolve(false);
  return onlineApi('/api/zaloha_vynuceno').then(o => {
    ONLINE_STAV.otisky = o.otisky || [];
    ONLINE_STAV.otiskyNacteno = true;
    return true;
  }).catch(e => {
    ONLINE_STAV.otiskyNacteno = true;
    onlineZprava('Přehled záloh se nepodařilo načíst: ' + e.message, 'varovani');
    return false;
  });
}

function onlineOtiskPopis() {
  if (!ONLINE_STAV.otiskyNacteno) return 'Zálohy databáze: zjišťuje se…';
  const o = (ONLINE_STAV.otisky || [])[0];
  if (!o) return 'Zálohy databáze: zatím žádná – pořiďte ji tlačítkem „Zálohovat teď".';
  const kdy = o.porizena ? new Date(o.porizena).toLocaleString('cs-CZ') : o.den;
  const zdroj = /vynuc/.test(o.zdroj) ? 'ručně' : 'sama v noci';
  return 'Poslední záloha databáze: ' + kdy + ' (' + zdroj + ', '
    + onlinePocetText(o.pocetZakazek) + ', ' + o.pocetUctu + ' účtů) · '
    + 'v přehledu ' + (ONLINE_STAV.otisky.length) + ' posledních.';
}

/* VYNUCENÁ ZÁLOHA (4. 8. 2026). Do té doby otisk uměla jen plánovaná funkce
 * bez cesty – nešel vyvolat ani ověřit, odtud „vynucené zálohování
 * nefunguje". Teď je to jeden POST; složka u toho nemusí být vůbec. */
function onlineZalohaTed() {
  if (!jeAdminOnline()) { onlineZprava('Zálohu smí pořídit jen administrátor.', 'varovani'); render(); return Promise.resolve(false); }
  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/zaloha_vynuceno', { duvod: 'rucne' }).then(o => {
    onlineZprava('Záloha databáze pořízena (' + o.den + ', ' + onlinePocetText(o.pocetZakazek)
      + ', ' + o.pocetUctu + ' účtů). Leží na serveru; na Disk Google ji odlije tlačítko vedle.');
    return onlineOtiskyNacti();
  }).catch(e => { onlineZprava('Zálohu se nepodařilo pořídit: ' + e.message, 'varovani'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
}

/* SAMOČINNÁ ZÁLOHA po přihlášení administrátora.
 *
 * Co bylo špatně do 4. 8. 2026: první řádek zněl „není-li připojená složka,
 * nedělej nic". Složka se ale mezitím stala věcí administrátora a běžně
 * připojená není – automatická záloha tedy nikdy neproběhla a případná
 * chyba se navíc ztratila v `.catch(() => false)`. Rozhodovalo se to podle
 * NÁSTROJE (složka), ne podle toho, co je potřeba (aby dnešní otisk byl).
 *
 * Nové pořadí: 1) zjisti, jestli dnešní otisk na serveru je; 2) když není,
 * pořiď ho (server, žádná složka); 3) je-li navíc připojená složka, odlij
 * do ní kopii pro Disk Google. Krok 3 je bonus – když selže, otisk na
 * serveru už existuje a hlásí se to jen tiše jako varování. */
function onlineZalohaAuto() {
  if (!jeAdminOnline()) return Promise.resolve(false);
  const dnes = new Date().toISOString().slice(0, 10);
  return onlineOtiskyNacti().then(() => {
    const mameDnesni = (ONLINE_STAV.otisky || []).some(o => o.den === dnes);
    if (mameDnesni) return false;
    return onlineApi('/api/zaloha_vynuceno', { duvod: 'auto' })
      .then(o => onlineOtiskyNacti().then(() => {
        onlineZprava('Dnešní záloha databáze se pořídila sama (' + o.den + ', '
          + onlinePocetText(o.pocetZakazek) + ').');
        return true;
      }))
      .catch(e => { onlineZprava('Dnešní zálohu databáze se nepodařilo pořídit: ' + e.message, 'varovani'); return false; });
  }).then(v => onlineZalohaDoSlozkyAuto().then(() => { render(); return v; }));
}

/* Odlití kopie na Disk Google. Jen když je složka opravdu připojená a
 * dnešní soubor v ní ještě neleží; jinak se mlčky přeskočí. */
function onlineZalohaDoSlozkyAuto() {
  if (typeof ULO_STAV === 'undefined' || !ULO_STAV.pripraveno) return Promise.resolve(false);
  const jmeno = onlineZalohaJmeno();
  return uloCtiSoubor(jmeno).then(t => {
    if (t != null) return false;
    return onlineApi('/api/zaloha')
      .then(o => uloZapisSoubor(jmeno, JSON.stringify(o.zaloha, null, 1)))
      .then(() => {
        onlineZprava('Dnešní záloha online databáze se sama odlila do složky „'
          + ULO_STAV.jmeno + '" (' + jmeno + ').');
        return true;
      });
  }).catch(() => false);
}

/* ---------- správa účtů (jen administrátor) ---------- */

function onlineUzivateleNacti() {
  return onlineApi('/api/uzivatele')
    .then(o => { ONLINE_STAV.uzivatele = o.uzivatele || []; return true; })
    .catch(e => { onlineZprava('Seznam účtů se nepodařilo načíst: ' + e.message, 'varovani'); return false; })
    .then(v => { ONLINE_STAV.uzivateleNacteno = true; return v; });
}

/* Správa účtů se vykresluje v panelu Nastavení (záložka Uživatelé). Po každé
 * akci se překreslí ten, kdo je zrovna otevřený. */
function onlineUzivateleObnov() {
  if (typeof nastOtevreno === 'function' && nastOtevreno() && typeof renderNastaveni === 'function')
    renderNastaveni();
}

/* opts.poUspechu(odpoved) se provede po úspěchu JEŠTĚ PŘED novým načtením
 * seznamu — výsledek akce se promítne do obrazovky okamžitě z odpovědi
 * serveru a nezávisí na tom, kdy se zápis propíše do výpisu úložiště. */
function onlineUzAkce(telo, hotovo, opts) {
  opts = opts || {};
  ONLINE_STAV.pracuje = true; onlineUzivateleObnov();
  return onlineApi('/api/uzivatele', telo)
    .then(o => {
      if (opts.poUspechu) opts.poUspechu(o);
      onlineZprava(hotovo);
      return onlineUzivateleNacti();
    })
    .catch(e => {
      /* opts.priChybe(e) dostane celou chybu i s odpovědí serveru (e.data) —
       * použije se tam, kde odmítnutí není konec, ale rozcestí (mazání účtu
       * se zakázkami nabídne převod). Kdo ho nezadá, dostane hlášku jako dřív. */
      if (opts.priChybe) opts.priChybe(e); else onlineZprava(e.message, 'varovani');
      return false;
    })
    .then(v => { ONLINE_STAV.pracuje = false; onlineUzivateleObnov(); return v; });
}

function onlineUzZaloz() {
  const f = ONLINE_STAV.uzForm;
  const email = String(f.email || '').trim().toLowerCase();
  /* Stejná pravidla jako na serveru, ale s hláškou hned a bez smazání
   * formuláře — serverové odmítnutí vypadalo jako „nic se nestalo". */
  if (!email || email.indexOf('@') < 1) {
    onlineZprava('Vyplňte platný e-mail (bude sloužit jako uživatelské jméno).', 'varovani');
    onlineUzivateleObnov(); return Promise.resolve(false);
  }
  if (!f.heslo || f.heslo.length < 8) {
    onlineZprava('Počáteční heslo musí mít aspoň 8 znaků.', 'varovani');
    onlineUzivateleObnov(); return Promise.resolve(false);
  }
  /* Titul, funkce a telefon jdou na server rovnou při založení účtu (#145):
   * kolega jinak udělá první nabídku dřív, než si profil vyplní, a zákazníkovi
   * odejde patička bez telefonu. Povinné nejsou – kdo je nezná, doplní je později. */
  const profil = { titul: String(f.titul || '').trim(), funkce: String(f.funkce || '').trim(),
                   telefon: String(f.telefon || '').trim() };
  return onlineUzAkce({ akce: 'zaloz', email, jmeno: String(f.jmeno || '').trim(),
      role: f.role, heslo: f.heslo, ...profil },
    'Účet ' + email + ' (' + f.role + ') je založený. Heslo předejte osobně – e-mailem se neposílá.',
    { poUspechu: () => {
      /* nový účet do tabulky hned z odpovědi; formulář se maže až teď */
      if (!ONLINE_STAV.uzivatele.some(u => u.email === email))
        ONLINE_STAV.uzivatele.push({ email, jmeno: String(f.jmeno || '').trim(),
          ...profil, role: f.role, aktivni: true });
      ONLINE_STAV.uzForm = { email: '', jmeno: '', titul: '', funkce: 'Obchodní technik',
        telefon: '', role: 'Obchodník', heslo: '' };
    } });
}

function onlineUzHesloPanel(email) {
  ONLINE_STAV.hesloPro = (ONLINE_STAV.hesloPro === email) ? '' : email;
  onlineUzivateleObnov();
}

function onlineUzHesloUloz(email) {
  const el = document.getElementById('onlineUzNoveHeslo');
  const heslo = el ? el.value : '';
  if (!heslo || heslo.length < 8) { onlineZprava('Nové heslo musí mít aspoň 8 znaků.', 'varovani'); onlineUzivateleObnov(); return; }
  ONLINE_STAV.hesloPro = '';
  onlineUzAkce({ akce: 'heslo', email, heslo },
    'Heslo účtu ' + email + ' je nastavené. Předejte ho osobně.');
}

function onlineUzRoleZmen(email, role) {
  onlineUzAkce({ akce: 'role', email, role }, 'Účet ' + email + ' má roli ' + role + '.');
}

/* ---------- archivace účtu a převod zakázek (11. 8. 2026) ----------
 *
 * Účet po odchodu kolegy se dosud jen vypnul a zůstal v seznamu navždy.
 * Smazat ho nejde: jeho jméno je podepsané pod odeslanými nabídkami a pod
 * rozhodnutími o slevách. Archiv je proto odsunutí z očí — a protože práce
 * po kolegovi musí mít nového hospodáře, nabídne se rovnou převod zakázek.
 *
 * Ptáme se ve dvou krocích schválně: archivace je vratná jedním kliknutím,
 * ale převod autorství se sám nevrátí. Sloučit obojí do jediného „ano" by
 * znamenalo, že si správce nevšimne, co vlastně odklepl. */
function onlineUzArchiv(email, archiv) {
  if (!archiv) {
    onlineApi('/api/uzivatele', { akce: 'archiv', email, archiv: false })
      .then(() => { onlineZprava('Účet ' + email + ' je zpátky v seznamu. '
        + 'Přihlásit se jím půjde, až ho zapnete.'); onlineUzivateleNacti(); })
      .catch(e => onlineZprava('Nepodařilo se vrátit z archivu: ' + e.message, 'varovani'));
    return;
  }
  if (!confirm('Archivovat účet ' + email + '?\n\n'
    + 'Účet se nesmaže — jen zmizí z běžného seznamu a nepůjde se jím přihlásit. '
    + 'Razítka pod odeslanými nabídkami zůstanou beze změny.')) return;
  onlineApi('/api/uzivatele', { akce: 'archiv', email, archiv: true })
    .then(() => {
      onlineZprava('Účet ' + email + ' je v archivu.');
      onlineUzivateleNacti();
      onlineUzPrevodNabidni(email);
    })
    .catch(e => onlineZprava('Archivace se nepovedla: ' + e.message, 'varovani'));
}

/* Nabídka převodu hned po archivaci — je to jediná chvíle, kdy správce ví,
 * proč to dělá. Když ji odmítne, zakázky zůstanou podepsané odcházejícím
 * a dá se to udělat kdykoli později. */
function onlineUzPrevodNabidni(email) {
  const cinni = (ONLINE_STAV.uzivatele || [])
    .filter(u => u.email !== email && !u.archiv && u.aktivni);
  if (!cinni.length) return;
  const seznam = cinni.map((u, i) => (i + 1) + ') ' + u.email).join('\n');
  const volba = prompt('Převést zakázky po ' + email + ' na jiného kolegu?\n\n'
    + seznam + '\n\nNapište číslo kolegy, nebo nechte prázdné a nic se nestane.');
  const n = Number(String(volba || '').trim());
  if (!n || !cinni[n - 1]) return;
  const na = cinni[n - 1].email;
  onlineApi('/api/uzivatele', { akce: 'prevod', email, na })
    .then(o => onlineZprava('Převedeno: ' + o.prevedeno + ' zakázek má nově na starost ' + na
      + '. Razítka pod odeslanými nabídkami zůstala beze změny.'))
    .catch(e => onlineZprava('Převod se nepovedl: ' + e.message, 'varovani'));
}

/* ---------- smazání účtu (11. 8. 2026) ----------
 *
 * Zadání majitele: „Uživatele bych ještě potřeboval mít i možnost mazat."
 *
 * Na rozdíl od archivace je tohle NEVRATNÉ, takže se ptáme jinak: dotaz
 * vypisuje zvlášť, co zmizí, a zvlášť, co zůstane. Správce se u mazání
 * kolegy bojí hlavně toho, že přijde o odeslané nabídky — a to se nestane;
 * kdyby to ale v dotazu nestálo, netroufne si a bude mít v seznamu bývalé
 * kolegy dál. Zároveň se rovnou nabízí archiv jako mírnější varianta.
 *
 * Když server odmítne kvůli zakázkám (409 a `zakazek` v odpovědi), není to
 * konec, ale rozcestí: ukáže se serverová hláška s počtem a hned nato
 * nabídka převodu na jiného kolegu — přesně ta, kterou zná archivace. */
function onlineUzSmaz(email) {
  if (!confirm('Opravdu SMAZAT účet ' + email + '?\n\n'
    + 'CO ZMIZÍ: účet z databáze i ze seznamu, přihlášení (i s už otevřeným '
    + 'oknem) a jeho sken podpisu s razítkem. Vrátit to nejde.\n\n'
    + 'CO ZŮSTANE: razítka pod odeslanými nabídkami a podpisy pod rozhodnutími '
    + 'o slevách — ta říkají, kdo co tehdy udělal, a nepřepisují se. Zakázky '
    + 'zůstanou taky; server smazání odmítne, dokud je nepřevedete na kolegu.\n\n'
    + 'Jde-li jen o odchod kolegy, zvolte raději „Archivovat…" — to je vratné.')) return;
  onlineUzAkce({ akce: 'smaz', email },
    'Účet ' + email + ' je smazaný i s podpisem. Razítka pod odeslanými nabídkami '
    + 'a pod rozhodnutími o slevách zůstala beze změny.',
    { priChybe: (e) => {
      onlineZprava(e.message, 'varovani');
      /* Nabídka převodu se odkládá o tik: prompt() by jinak zakryl obrazovku
       * dřív, než se stihne vykreslit hláška serveru — a správce by se
       * rozhodoval, aniž by věděl, proč se ho aplikace ptá. */
      if (e.data && e.data.zakazek) setTimeout(() => onlineUzPrevodNabidni(email), 0);
    } });
}

function onlineUzAktivni(email, aktivni) {
  onlineUzAkce({ akce: 'aktivni', email, aktivni },
    aktivni ? 'Účet ' + email + ' je zapnutý.' : 'Účet ' + email + ' je vypnutý – přihlášení mu nepůjde.');
}

/* ---------- pravidelný krok (volá se z render) ---------- */

/* Dvě povinnosti:
 * 1) JEDINÉ místo, které rozhoduje, čí ceník platí. Složka má přednost;
 *    bez ní se nasadí online verze. Nasazuje se odloženě (setTimeout),
 *    protože onlineTik běží uvnitř render() a progPouzij si o překreslení
 *    říká sám – synchronně by se render volal rekurzivně.
 * 2) automatické uložení online po chvíli klidu (stejný rytmus jako složka). */
function onlineTik() {
  /* Přihlašovací stránka a roh hlavičky se udržují při každém překreslení –
   * obě místa jen čtou stav, takže je to levné. */
  renderPrihlaseni();
  renderOnlineLista();

  const slozkaVladne = (typeof progJede === 'function') && progJede();
  if (ONLINE_STAV.ja && ONLINE_STAV.db && !slozkaVladne) {
    if (!ONLINE_STAV.cenikPouzit) {
      ONLINE_STAV.cenikPouzit = true;
      setTimeout(() => {
        progPouzij(ONLINE_STAV.db.platny);
        onlineZprava('Platí online ceník – ' + programPopisVerze(ONLINE_STAV.db.platny) + '.');
        render();
      }, 0);
      /* Do 4. 8. 2026 se tu končilo `return` a autosave čekal na další tik.
       * Nasazení ceníku ale běží až v setTimeout, takže tenhle průchod
       * o zakázce nic neví a klidně naplánovat zápis může – návratem se
       * jen zahazovala jedna příležitost uložit rozpracovanou práci. */
    }
  } else if (ONLINE_STAV.cenikPouzit) {
    /* složka se (znovu) připojila, nebo jsme odhlášení – online ceník už
     * nevládne a příště se smí nasadit znovu */
    ONLINE_STAV.cenikPouzit = false;
  }

  /* Firemní údaje ze serveru. Pravidlo je úmyslně opatrné: nasadí se JEN
   * tehdy, když je v aplikaci pořád vzorek ze sestavení (nese značku
   * ukázkových dat). Cokoli skutečného – ze složky _nastaveni.json i ručně
   * přepsaného v Nastavení → Firma – má přednost a online verze ho nepřepíše.
   * Značka po nasazení zmizí sama (konfigNahradVMiste zahodí celý obsah),
   * takže se to nemůže opakovat ani přepsat pozdější práci administrátora. */
  if (ONLINE_STAV.ja && ONLINE_STAV.firma && !ONLINE_STAV.firmaPouzita
      && typeof NAST !== 'undefined' && typeof ukazkoveJe === 'function'
      && ukazkoveJe(NAST.firma) && typeof konfigNahradVMiste === 'function') {
    ONLINE_STAV.firmaPouzita = true;
    setTimeout(() => {
      konfigNahradVMiste(NAST.firma, ONLINE_STAV.firma.udaje);
      render();
    }, 0);
    /* Bez `return` ze stejného důvodu jako u ceníku výše. */
  }

  /* BRÁNA AUTOMATICKÉHO UKLÁDÁNÍ (přepsána 4. 8. 2026).
   * Dřív zněla `… || !ONLINE_STAV.soubor || …`, tedy: ukládej samo jen
   * zakázku, která už v databázi jednou byla. Nová zakázka se tam ale
   * nedostala jinak než ručním kliknutím na „Uložit online" o dvě karty
   * níž — a protože o tom tlačítku nikdo nevěděl, neukládalo se nic.
   * Nově: dokud zakázka v databázi není, stačí vyplněná hlavička
   * (číslo nabídky + název akce, viz uloHlavickaVyplnena) a zakázka se
   * založí sama; od té chvíle se ukládá po každé změně jako dřív.
   * Hlavička se hlídá proto, aby v databázi nevznikaly záznamy
   * „bez-cisla-…", které se pak nedají najít. */
  if (!ONLINE_STAV.auto || !ONLINE_STAV.ja || ONLINE_STAV.pracuje) return;
  if (!ONLINE_STAV.soubor && !uloHlavickaVyplnena(ZAK)) return;
  let text = '';
  try { text = JSON.stringify(ZAK); } catch (e) { return; }
  if (text === ONLINE_STAV.posledni) return;
  if (ONLINE_STAV.timer) clearTimeout(ONLINE_STAV.timer);
  ONLINE_STAV.timer = setTimeout(() => {
    ONLINE_STAV.timer = null;
    onlineUloz({ tiche: true });
  }, ULO_PRODLEVA);
}

function onlineAutoPrepni(zap) {
  ONLINE_STAV.auto = !!zap;
  if (!ONLINE_STAV.auto && ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  renderZakazka();
}

/* ---------- karta na záložce Zakázka ---------- */

function onlineStavPopis() {
  if (!onlineMozne())
    return 'Aplikace běží ze souboru – online část ožije na serveru (schaftscalc.netlify.app).';
  if (!ONLINE_STAV.bezi)
    return 'Serverová část (/api) zatím neodpověděla.';
  if (!ONLINE_STAV.ja)
    return 'Server běží. Přihlaste se e-mailem a heslem.';
  return 'Přihlášen: ' + (ONLINE_STAV.ja.jmeno || ONLINE_STAV.ja.email) + ' (' + ONLINE_STAV.ja.role + ') · '
    + onlinePocetText(ONLINE_STAV.rejstrik.length)
    + ' online · otevřeno: ' + (ONLINE_STAV.soubor || 'zatím neuloženo online');
}

/* ---------- přihlašovací stránka (celoplošná, jen nad http/https) ---------- */

/* Kdy stránku ukázat: běžíme nad http(s), nikdo není přihlášený a uživatel
 * vědomě nezvolil nouzový režim (server neodpovídá). Ze souboru nikdy. */
function prihlaseniViditelne() {
  return onlineMozne() && !ONLINE_STAV.ja && !ONLINE_STAV.nouzove;
}

function onlineNouzove() {
  ONLINE_STAV.nouzove = true;
  onlineZprava('Pokračujete bez přihlášení – online databáze není dostupná. '
    + 'Zakázky lze ukládat jen ručně souborem.', 'varovani');
  render();
}

function onlineZpetKPrihlaseni() {
  ONLINE_STAV.nouzove = false;
  onlineZprava('');
  if (!ONLINE_STAV.bezi) onlineStart();
  render();
}

function renderPrihlaseni() {
  const o = document.getElementById('prihlaseni-overlay');
  const box = document.getElementById('prihlaseni-box');
  if (!o || !box) return;
  if (!prihlaseniViditelne()) { o.style.display = 'none'; return; }
  o.style.display = 'flex';

  const hlaska = ONLINE_STAV.hlaska
    ? `<div class="${zapisTridaHlasky(ONLINE_STAV.hlaskaTyp)}">${esc(ONLINE_STAV.hlaska)}</div>` : '';
  let telo;
  if (!ONLINE_STAV.sondaHotova) {
    telo = `<div class="note">Připojuji se k serveru…</div>`;
  } else if (!ONLINE_STAV.bezi) {
    telo = `${hlaska}
      <div class="seznam-varovani">Serverová část (/api) neodpovídá. Zkuste to za chvíli znovu;
        pokud výpadek trvá, dejte vědět administrátorovi.</div>
      <div class="btns" style="margin-top:12px">
        <button class="primary" onclick="onlineStart()">Zkusit znovu</button>
        <button onclick="onlineNouzove()">Pokračovat bez přihlášení</button>
      </div>`;
  } else {
    telo = `${hlaska}
      <div class="row"><label>E-mail (uživatelské jméno)</label>
        <input type="email" id="onlineEmail" value="${esc(ONLINE_STAV.formEmail)}" autocomplete="username"
          oninput="ONLINE_STAV.formEmail=this.value"
          onkeydown="if(event.key==='Enter')onlinePrihlas()"><span class="u"></span></div>
      <div class="row"><label>Heslo</label>
        <input type="password" id="onlineHeslo" value="${esc(ONLINE_STAV.formHeslo)}" autocomplete="current-password"
          oninput="ONLINE_STAV.formHeslo=this.value"
          onkeydown="if(event.key==='Enter')onlinePrihlas()"><span class="u"></span></div>
      <div class="btns" style="margin-top:14px">
        <button class="primary" onclick="onlinePrihlas()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Přihlásit</button>
      </div>
      <div class="note" style="margin-top:12px">Účty zakládá a hesla nastavuje administrátor – žádná
        samoobslužná registrace ani obnova hesla e-mailem. Zapomenuté heslo vám administrátor resetuje.</div>`;
  }
  box.innerHTML = `<h1>Kalkulátor Next Gen</h1>
    <span class="ver">${esc((typeof buildVerze === 'function' && buildVerze()) || '')} · ENGINEERS CZ</span>
    ${telo}`;
}

/* ---------- pravý horní roh: kdo je přihlášený ---------- */

/* Ikony v liště. Emoji (👤 / 👁) měla vlastní barvu z fontu a nešla sladit
 * se jménem vedle sebe — proto vlastní SVG s `fill="currentColor"`. */
const IKONA_OSOBA = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"
  style="vertical-align:-2px;fill:currentColor"><circle cx="8" cy="4.6" r="3.1"/>
  <path d="M8 9c-3.3 0-6 2-6 4.5V15h12v-1.5C14 11 11.3 9 8 9z"/></svg>`;
const IKONA_OKO = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
  style="vertical-align:-2px;fill:currentColor"><path d="M8 3C4.4 3 1.5 5.6 0.5 8c1 2.4 3.9 5 7.5 5
  s6.5-2.6 7.5-5c-1-2.4-3.9-5-7.5-5zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4z"/>
  <circle cx="8" cy="8" r="1.6"/></svg>`;

function renderOnlineLista() {
  const el = document.getElementById('onlineLista');
  if (!el) return;
  if (!onlineMozne()) { el.innerHTML = ''; return; }
  if (!ONLINE_STAV.ja) {
    /* Tlačítko svítí VŽDY, když nikdo není přihlášený – ne jen v nouzovém
     * režimu. Normálně ho stejně zakryje přihlašovací překryv, takže nikoho
     * neruší; smysl má právě ve chvíli, kdy se překryv z jakéhokoli důvodu
     * nevykreslí. Přesně na tohle narazil uživatel 5. 8. 2026: v hlavičce
     * nebyl ani panáček, ani „Přihlásit se", ani překryv, a k přihlášení
     * nevedla žádná cesta než tvrdé obnovení stránky. */
    el.innerHTML = `<button class="mini" onclick="onlineZpetKPrihlaseni()">Přihlásit se</button>`;
    return;
  }
  /* Titul se ukazuje i v liště: člověk tak hned vidí, v jaké podobě půjde
   * jeho jméno do nabídky, a nemusí kvůli kontrole nic generovat. */
  /* Pořadí a barvy (17. 8. 2026 večer): jméno s funkcí SVĚTLE ZELENĚ, ať je
   * na tmavé liště vidět; přepínač heat mapy stojí až ZA „Změnit heslo". */
  const funkce = ONLINE_STAV.ja.funkce ? ' · ' + ONLINE_STAV.ja.funkce : '';
  /* Jméno v liště je od 20. 8. 2026 zároveň PŘEPÍNAČ NÁHLEDU (zadání J. V.).
   * Klik na postavičku/jméno rozbalí seznam účtů; v náhledu se zelená
   * postavička 👤 změní na červené oko 👁 a v liště stojí jméno toho,
   * jehož očima se administrátor dívá — aby si to nešlo splést s vlastním
   * pohledem. Nabídka se kreslí jen tomu, kdo má nárok na pohled admina. */
  const smiNahled = typeof smiPohledAdmina === 'function' && smiPohledAdmina();
  const nahled = typeof nahledAktivni === 'function' && nahledAktivni();
  const kdo = nahled ? (NAST.nahledUzivatel.jmeno || NAST.nahledUzivatel.email)
    : (onlineJmenoSTitulem() || ONLINE_STAV.ja.email);
  const role = nahled ? NAST.nahledUzivatel.role : ONLINE_STAV.ja.role;
  const barva = nahled ? '#f87171' : '#86e8ad';
  /* Ikona je SVG s `fill: currentColor`, ne emoji (20. 8. 2026): emoji si
   * nese vlastní barvu z fontu, takže postavička zůstávala fialová vedle
   * zeleného jména. SVG se obarví přesně tak jako text. */
  const ikona = nahled ? IKONA_OKO : IKONA_OSOBA;
  const titulek = nahled
    ? 'náhled cizího pohledu — kliknutím ho ukončíte'
    : (smiNahled ? 'kliknutím se podíváte na aplikaci očima jiného uživatele' : '');
  const jmenoHtml = smiNahled
    ? `<button class="mini" onclick="nahledMenuPrepni()" title="${esc(titulek)}"
         style="background:transparent;border-color:${barva};color:${barva};font-weight:700">
         ${ikona} ${esc(kdo)}${esc(nahled ? '' : funkce)} (${esc(role)})</button>`
    : `<b style="color:${barva}">${ikona} ${esc(kdo)}${esc(funkce)}</b>
       <span style="color:${barva};opacity:.85">(${esc(role)})</span>`;
  el.innerHTML = jmenoHtml + nahledMenuHtml() + `
    <button class="mini" onclick="otevriMujProfil()">Můj profil</button>
    <button class="mini" onclick="otevriZmenaHesla()">Změnit heslo</button>
    ${typeof heatPrepinacHtml === 'function' ? heatPrepinacHtml() : ''}
    <button class="mini" onclick="onlineOdhlas()">Odhlásit</button>`;
}

/* Rozbalení nabídky náhledu. Seznam účtů si vyžádá, když ho ještě nemá —
 * jinak by nabídka byla prázdná pro každého, kdo neotevřel Nastavení. */
function nahledMenuPrepni() {
  if (typeof smiPohledAdmina !== 'function' || !smiPohledAdmina()) return;
  NAST.nahledMenu = !NAST.nahledMenu;
  if (NAST.nahledMenu && !ONLINE_STAV.uzivateleNacteno && typeof onlineUzivateleNacti === 'function') {
    Promise.resolve(onlineUzivateleNacti()).then(() => render()).catch(() => render());
  }
  render();
}

/* Nabídka pod jménem: „já" + všechny účty kromě mého. */
function nahledMenuHtml() {
  if (!NAST.nahledMenu) return '';
  const nahled = typeof nahledAktivni === 'function' && nahledAktivni();
  const ja = ONLINE_STAV.ja || {};
  const ucty = (ONLINE_STAV.uzivatele || []).filter(u => u.email && u.email !== ja.email);
  const radek = (text, popis, onclick, aktivni) => `<button class="mini" onclick="${onclick}"
    style="display:block;width:100%;text-align:left;margin:2px 0;${aktivni ? 'font-weight:700' : ''}">
    ${esc(text)}${popis ? ` <span class="note" style="display:inline">${esc(popis)}</span>` : ''}</button>`;
  const seznam = ucty.length
    ? ucty.map(u => radek((u.jmeno || u.email), '· ' + (u.role || 'Obchodník'),
        `nahledZapni('${escJs(u.email)}')`, nahled && NAST.nahledUzivatel.email === u.email)).join('')
    : `<div class="note" style="padding:4px 2px">${ONLINE_STAV.uzivateleNacteno
        ? 'Žádný další účet – uživatele založíte v Nastavení → Uživatelé.'
        : 'Načítám účty…'}</div>`;
  return `<div class="nahled-menu noprint">
    <div class="note" style="font-weight:600;margin-bottom:4px">Prohlížet aplikaci jako:</div>
    ${radek('Já (' + (ja.jmeno || ja.email) + ')', '· skutečný pohled', 'nahledVypni()', !nahled)}
    ${seznam}
    <div class="note" style="margin-top:6px">V náhledu je aplikace jen ke čtení. Server dál ví,
      že jste administrátor — náhledem se práva nezískávají.</div>
  </div>`;
}

/* Jméno tak, jak patří pod nabídku: „Ing. Jiří Lauda". Titul je nepovinný,
 * takže se nikdy nelepí prázdná mezera navíc. */
function onlineJmenoSTitulem(u) {
  const x = u || ONLINE_STAV.ja || {};
  return [String(x.titul || '').trim(), String(x.jmeno || '').trim()].filter(Boolean).join(' ');
}

/* ---------- změna vlastního hesla (staré + nové, viz server 'mojeheslo') ---------- */

function otevriZmenaHesla() {
  ONLINE_STAV.hesloHlaska = '';
  renderZmenaHesla();
  const o = document.getElementById('heslo-overlay');
  if (o) o.style.display = 'flex';
  const el = document.getElementById('hesloStare');
  if (el) el.focus();
}

function zavriZmenaHesla() {
  const o = document.getElementById('heslo-overlay');
  if (o) o.style.display = 'none';
}

function renderZmenaHesla() {
  const el = document.getElementById('heslo-panel');
  if (!el) return;
  el.innerHTML = `<h2>Změna hesla
      <button class="mini" style="margin-left:auto" onclick="zavriZmenaHesla()">Zavřít</button></h2>
    <div class="body">
      ${ONLINE_STAV.hesloHlaska ? `<div class="seznam-varovani">${esc(ONLINE_STAV.hesloHlaska)}</div>` : ''}
      <div class="row"><label>Staré heslo</label>
        <input type="password" id="hesloStare" autocomplete="current-password"><span class="u"></span></div>
      <div class="row"><label>Nové heslo (min. 8 znaků)</label>
        <input type="password" id="hesloNove" autocomplete="new-password" minlength="8"
          placeholder="alespoň 8 znaků" title="Heslo musí mít alespoň 8 znaků."><span class="u"></span></div>
      <div class="row"><label>Nové heslo znovu</label>
        <input type="password" id="hesloNove2" autocomplete="new-password"
          placeholder="alespoň 8 znaků"
          onkeydown="if(event.key==='Enter')onlineZmenHeslo()"><span class="u"></span></div>
      <div class="note" style="margin-top:2px">Heslo musí mít <b>alespoň 8 znaků</b>.</div>
      <div class="btns" style="margin-top:12px">
        <button class="primary" onclick="onlineZmenHeslo()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Změnit heslo</button>
      </div>
      <div class="note">Staré heslo se vyžaduje schválně: relace je jen cookie a bez něj by heslo
        mohl změnit kdokoli u odemčeného počítače. Zapomenuté heslo řeší administrátor resetem.</div>
    </div>`;
}

function onlineZmenHeslo() {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const stare = g('hesloStare'), nove = g('hesloNove'), nove2 = g('hesloNove2');
  if (!nove || nove.length < 8) { ONLINE_STAV.hesloHlaska = 'Nové heslo musí mít aspoň 8 znaků.'; renderZmenaHesla(); return; }
  if (nove !== nove2) { ONLINE_STAV.hesloHlaska = 'Nová hesla se neshodují.'; renderZmenaHesla(); return; }
  ONLINE_STAV.pracuje = true; renderZmenaHesla();
  onlineApi('/api/uzivatele', { akce: 'mojeheslo', stare, nove })
    .then(() => {
      zavriZmenaHesla();
      onlineZprava('Heslo je změněné. Od teď platí to nové.');
    })
    .catch(e => { ONLINE_STAV.hesloHlaska = e.message; })
    .then(() => { ONLINE_STAV.pracuje = false; renderZmenaHesla(); render(); });
}

/* ======================================================================
 * MŮJ PROFIL — údaje pod cenovou nabídku (5. 8. 2026, #145)
 *
 * Zadání: „V cenové nabídce se musí zobrazovat jméno a kontaktní údaje
 * obchodníka = Obchodního technika, která nabídku tvořil. … doplnit i titul
 * před jménem a telefonní číslo … Zároveň tam přidej možnost uživateli nahrát
 * snímek s podpisem a rozítkem."
 *
 * Blok „Vypracoval: Ing. Jiří Lauda / Obchodní technik / Tel: … / Email: …"
 * byl v šabloně vepsaný natvrdo a pod ním zapečený obrázek podpisu s razítkem.
 * Ať nabídku dělal kdokoli, odešla pod jménem jednoho kolegy — a kdo ji
 * posílal za sebe, přepisoval to po každém vygenerování ručně ve Wordu.
 * Teď si každý svoje údaje jednou uloží a dokument si je bere sám.
 * ====================================================================== */

/* Strop na velikost obrázku. Musí sedět se serverem (PODPIS_MAX v sdilene.mjs)
 * — jinak by uživatel narazil až po odeslání, po zbytečném čekání. */
const PODPIS_MAX_ZNAKU = 900000;
/* Na jakou šířku se sken zmenšuje, když je moc velký. 1400 bodů na podpis
 * s razítkem bohatě stačí (ve Wordu to vyjde na několik centimetrů) a soubor
 * spadne z několika megabajtů na desítky kilobajtů. */
const PODPIS_SIRKA = 1400;

function otevriMujProfil() {
  const j = ONLINE_STAV.ja || {};
  ONLINE_STAV.profil = { jmeno: j.jmeno || '', titul: j.titul || '',
    funkce: j.funkce || '', telefon: j.telefon || '', podpis: j.podpis || '' };
  ONLINE_STAV.profilHlaska = ''; ONLINE_STAV.profilTyp = '';
  renderMujProfil();
  const o = document.getElementById('profil-overlay');
  if (o) o.style.display = 'flex';
}

function zavriMujProfil() {
  const o = document.getElementById('profil-overlay');
  if (o) o.style.display = 'none';
}

function renderMujProfil() {
  const el = document.getElementById('profil-panel');
  if (!el || !ONLINE_STAV.profil) return;
  const p = ONLINE_STAV.profil;
  const email = (ONLINE_STAV.ja && ONLINE_STAV.ja.email) || '';
  /* Náhled ukazuje přesně to, co půjde do dokumentu. Podpis se kreslí na bílé
   * ploše se slabým rámečkem: sken bývá průhledný nebo skoro bílý a na šedém
   * pozadí panelu by vypadal jinak než ve Wordu. */
  const nahled = p.podpis
    ? `<div style="border:1px solid #ccc;background:#fff;padding:6px;display:inline-block;max-width:100%">
         <img src="${esc(p.podpis)}" alt="podpis a razítko" style="max-width:320px;max-height:160px;display:block"></div>
       <div class="btns" style="margin-top:6px">
         <button class="mini" onclick="onlineOdeberPodpis()">Odebrat podpis</button></div>`
    : `<div class="note">Zatím nemáte nahraný žádný podpis. Nabídka se vygeneruje bez něj —
         nic se nedoplňuje ani nekreslí za vás.</div>`;

  el.innerHTML = `<h2>Můj profil
      <button class="mini" style="margin-left:auto" onclick="zavriMujProfil()">Zavřít</button></h2>
    <div class="body">
      ${ONLINE_STAV.profilHlaska ? `<div class="${zapisTridaHlasky(ONLINE_STAV.profilTyp)}">${esc(ONLINE_STAV.profilHlaska)}</div>` : ''}
      <div class="note">Tyhle údaje jdou do bloku <b>„Vypracoval"</b> v cenové nabídce — pod ni se
        podepisujete vy, ne firma. E-mail se bere z přihlášení a měnit ho tady nejde.</div>
      <div class="row"><label>Titul před jménem</label>
        <input type="text" id="profilTitul" value="${esc(p.titul)}" placeholder="Ing."
          oninput="ONLINE_STAV.profil.titul=this.value"><span class="u"></span></div>
      <div class="row"><label>Jméno a příjmení</label>
        <input type="text" id="profilJmeno" value="${esc(p.jmeno)}" placeholder="Jiří Lauda"
          oninput="ONLINE_STAV.profil.jmeno=this.value"><span class="u"></span></div>
      <div class="row"><label>Funkce</label>
        <input type="text" id="profilFunkce" value="${esc(p.funkce)}" placeholder="Obchodní technik"
          oninput="ONLINE_STAV.profil.funkce=this.value"><span class="u"></span></div>
      <div class="row"><label>Telefon</label>
        <input type="text" id="profilTelefon" value="${esc(p.telefon)}" placeholder="+420 602 590 945"
          oninput="ONLINE_STAV.profil.telefon=this.value"
          onkeydown="if(event.key==='Enter')onlineUlozProfil()"><span class="u"></span></div>
      <div class="row"><label>E-mail</label>
        <input type="text" value="${esc(email)}" disabled><span class="u"></span></div>
      <div class="note" style="margin-top:10px"><b>Podpis s razítkem</b> — sken nebo fotka
        v PNG či JPEG. Nejlépe na bílém papíře, ořízlé kolem podpisu; velký obrázek si aplikace
        sama zmenší.</div>
      ${nahled}
      <div class="btns" style="margin-top:8px">
        <input type="file" id="profilPodpisSoubor" accept="image/png,image/jpeg"
          onchange="onlineNahrajPodpis(this)" style="max-width:280px">
      </div>
      <div class="btns" style="margin-top:12px">
        <button class="primary" onclick="onlineUlozProfil()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Uložit profil</button>
      </div>
      <div class="note">Podpis se ukládá u vašeho účtu na serveru a použije se jen ve vašich
        nabídkách. Cizí podpis nahrát nejde — hlídá to server, aby nešlo poslat nabídku
        jménem kolegy.</div>
    </div>`;
}

function onlineUlozProfil() {
  const p = ONLINE_STAV.profil || {};
  ONLINE_STAV.pracuje = true; renderMujProfil();
  return onlineApi('/api/uzivatele', { akce: 'profil', jmeno: p.jmeno, titul: p.titul,
    funkce: p.funkce, telefon: p.telefon })
    .then(o => {
      Object.assign(ONLINE_STAV.ja, { jmeno: o.jmeno || '', titul: o.titul || '',
        funkce: o.funkce || '', telefon: o.telefon || '' });
      /* Jméno razítkuje zámky i protokol — po změně musí platit hned to nové,
       * jinak by se zbytek dne podepisovaly zápisy starým tvarem. */
      if (typeof NAST !== 'undefined') NAST.uzivatel = o.jmeno || ONLINE_STAV.ja.email;
      ONLINE_STAV.profilHlaska = 'Profil je uložený. Do dalších nabídek půjde '
        + (onlineJmenoSTitulem() || ONLINE_STAV.ja.email) + '.';
      ONLINE_STAV.profilTyp = '';
    })
    .catch(e => { ONLINE_STAV.profilHlaska = e.message; ONLINE_STAV.profilTyp = 'chyba'; })
    .then(() => { ONLINE_STAV.pracuje = false; renderMujProfil(); render(); });
}

/* Načtení souboru z disku. Prohlížeč umí obrázek přečíst jako datový zápis,
 * takže se nikam nenahrává „na půl cesty" — buď se uloží celý k účtu, nebo
 * se neuloží nic. */
function onlineNahrajPodpis(vstup) {
  const soubor = vstup && vstup.files && vstup.files[0];
  if (!soubor) return Promise.resolve(false);
  if (!/^image\/(png|jpeg)$/.test(soubor.type)) {
    ONLINE_STAV.profilHlaska = 'Podpis musí být obrázek PNG nebo JPEG. Formát „'
      + (soubor.type || 'neznámý') + '" použít nejde.';
    ONLINE_STAV.profilTyp = 'chyba'; renderMujProfil(); return Promise.resolve(false);
  }
  ONLINE_STAV.pracuje = true;
  ONLINE_STAV.profilHlaska = 'Zpracovávám obrázek…'; ONLINE_STAV.profilTyp = '';
  renderMujProfil();
  return new Promise((hotovo, chyba) => {
    const c = new FileReader();
    c.onload = () => hotovo(String(c.result || ''));
    c.onerror = () => chyba(new Error('Soubor se nepodařilo přečíst.'));
    c.readAsDataURL(soubor);
  })
    .then(podpisZmensi)
    .then(obrazek => onlineApi('/api/uzivatele', { akce: 'podpis', obrazek })
      .then(() => {
        ONLINE_STAV.profil.podpis = obrazek;
        ONLINE_STAV.ja.podpis = obrazek;
        ONLINE_STAV.profilHlaska = 'Podpis je uložený (' + Math.round(obrazek.length / 1024)
          + ' kB). Objeví se v každé vaší další nabídce.';
        ONLINE_STAV.profilTyp = '';
        return true;
      }))
    .catch(e => { ONLINE_STAV.profilHlaska = e.message; ONLINE_STAV.profilTyp = 'chyba'; return false; })
    .then(v => { ONLINE_STAV.pracuje = false; renderMujProfil(); return v; });
}

/* Fotka z mobilu má klidně 4 MB; do dokumentu i do databáze je to zbytečné
 * a server takový obrázek odmítne. Zmenšení dělá prohlížeč sám — uživatel
 * nemá důvod hledat grafický program kvůli tomu, aby mohl nahrát podpis.
 * Malý obrázek se NEPŘEKRESLUJE: překódováním by se jen ztratila kvalita. */
function podpisZmensi(dataUrl) {
  const s = String(dataUrl || '');
  if (s.length <= PODPIS_MAX_ZNAKU) return Promise.resolve(s);
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(s);
  return new Promise((hotovo, chyba) => {
    const obr = new Image();
    obr.onload = () => {
      const pomer = Math.min(1, PODPIS_SIRKA / (obr.naturalWidth || PODPIS_SIRKA));
      const platno = document.createElement('canvas');
      platno.width = Math.max(1, Math.round((obr.naturalWidth || PODPIS_SIRKA) * pomer));
      platno.height = Math.max(1, Math.round((obr.naturalHeight || PODPIS_SIRKA) * pomer));
      const k = platno.getContext('2d');
      /* Bílé pozadí: JPEG průhlednost neumí a bez podkladu by se z ní stala
       * černá plocha přes celý podpis. */
      k.fillStyle = '#fff'; k.fillRect(0, 0, platno.width, platno.height);
      k.drawImage(obr, 0, 0, platno.width, platno.height);
      let out = platno.toDataURL('image/png');
      if (out.length > PODPIS_MAX_ZNAKU) out = platno.toDataURL('image/jpeg', 0.85);
      if (out.length > PODPIS_MAX_ZNAKU)
        return chyba(new Error('Obrázek je i po zmenšení příliš velký. Ořízněte ho prosím '
          + 'jen na podpis s razítkem a zkuste to znovu.'));
      hotovo(out);
    };
    obr.onerror = () => chyba(new Error('Obrázek se nepodařilo načíst — je soubor v pořádku?'));
    obr.src = s;
  });
}

function onlineOdeberPodpis() {
  ONLINE_STAV.pracuje = true; renderMujProfil();
  return onlineApi('/api/uzivatele', { akce: 'podpis', obrazek: '' })
    .then(() => {
      ONLINE_STAV.profil.podpis = ''; ONLINE_STAV.ja.podpis = '';
      ONLINE_STAV.profilHlaska = 'Podpis je odebraný. Další nabídky se vygenerují bez něj.';
      ONLINE_STAV.profilTyp = '';
    })
    .catch(e => { ONLINE_STAV.profilHlaska = e.message; ONLINE_STAV.profilTyp = 'chyba'; })
    .then(() => { ONLINE_STAV.pracuje = false; renderMujProfil(); });
}

function renderOnlineKarta() {
  const hlaska = ONLINE_STAV.hlaska
    ? `<div class="${zapisTridaHlasky(ONLINE_STAV.hlaskaTyp)}">${esc(ONLINE_STAV.hlaska)}</div>` : '';

  let telo = '';
  if (!onlineMozne()) {
    telo = `<div class="note">Zakázky i ceník má aplikace na serveru; ukládá se tam po přihlášení
      e-mailem a heslem. Ze souboru (dvojklikem) běží aplikace jako dřív – se složkou, nebo ručním
      ukládáním souborů.</div>`;
  } else if (!ONLINE_STAV.bezi) {
    telo = `${hlaska}<div class="btns" style="margin-top:10px">
      <button onclick="onlineZpetKPrihlaseni()">Zkusit spojení znovu</button></div>`;
  } else if (!ONLINE_STAV.ja) {
    /* Přihlášení řeší celoplošná přihlašovací stránka – sem se nepřihlášený
     * dostane jen v nouzovém režimu (server neběžel). */
    telo = `${hlaska}
      <div class="btns" style="margin-top:10px">
        <button class="primary" onclick="onlineZpetKPrihlaseni()">Přihlásit se</button>
      </div>`;
  } else {
    const adminTlacitka = jeAdminOnline()
      ? `<button onclick="otevriNastaveni();nastPanel('uzivatele')">Uživatelé…</button>
         <button onclick="onlineZalohaTed()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}
           title="pořídí otisk celé databáze na serveru – stejný, jaký si server bere každou noc">Zálohovat teď</button>
         ${typeof ULO_STAV !== 'undefined' && ULO_STAV.pripraveno
    ? `<button onclick="onlineZaloha(true)" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Odlít zálohu do složky (Disk)</button>` : ''}
         <button onclick="onlineZaloha(false)" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Stáhnout zálohu</button>` : '';
    const zalohaRadek = jeAdminOnline()
      ? `<div class="note" id="online-zalohy">${esc(onlineOtiskPopis())}</div>` : '';
    telo = `${hlaska}${zalohaRadek}
      <div class="btns" style="margin-top:10px">
        <button class="primary" onclick="onlineUloz()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Uložit online</button>
        <button onclick="otevriOnline()">Zakázky online…</button>
        ${adminTlacitka}
        <button onclick="onlineOdhlas()">Odhlásit</button>
      </div>
      <div class="row" style="margin-top:10px"><label>Ukládat online samo po chvíli klidu</label>
        <input type="checkbox" ${ONLINE_STAV.auto ? 'checked' : ''} onchange="onlineAutoPrepni(this.checked)"><span class="u"></span></div>
      <div class="note">Zakázky i platný ceník žijí na serveru – ke stejným datům se dostanete
        z libovolného počítače po přihlášení. <b>Vytištěná (odeslaná) nabídka se nikdy nepřepíše</b> –
        hlídá to přímo server, stejným pravidlem jako složka. Záloha databáze se
        <b>odlévá na Disk Google</b>: po přihlášení administrátora se jednou denně uloží do připojené
        složky sama a tlačítky ji lze pořídit kdykoli; navíc si server každou noc ukládá vlastní otisk.
        ${typeof ULO_STAV !== 'undefined' && ULO_STAV.koren
    ? 'Dokud je připojená složka, platí ceník i zakázky ze složky jako dosud (přechodné období).'
    : 'Složku už není potřeba připojovat – slouží jen jako cíl zálohy.'}</div>`;
  }

  return card('Online databáze (schaftscalc.netlify.app)',
    `<div class="note" style="margin-top:0">${esc(onlineStavPopis())}</div>${telo}`);
}

/* ---------- karta na záložkách Ceník (jen administrátor) ---------- */

function renderOnlineCenikKarta() {
  if (!onlineMozne() || !ONLINE_STAV.bezi) return '';
  const stav = !ONLINE_STAV.ja
    ? 'Nepřihlášen – online ceník se načte po přihlášení (Nastavení → Databáze).'
    : (ONLINE_STAV.db
      ? 'Online ' + programSouhrn(ONLINE_STAV.db)
      + (ONLINE_STAV.cenikPouzit ? ' · právě platí v aplikaci' : ' · v aplikaci teď platí ceník ze složky')
      : 'Online databáze programu zatím není – založí se prvním zveřejněním.');
  const tlacitka = ONLINE_STAV.ja
    ? `<button class="primary" onclick="onlineZverejni()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Zveřejnit ceník této varianty online</button>
       <button onclick="onlineNactiProgram().then(function(){render()})">Načíst online znovu</button>` : '';
  return card('Online ceník programu',
    `<div class="note" style="margin-top:0">${esc(stav)}</div>
     <div class="btns" style="margin-top:10px">${tlacitka}</div>
     <div class="note">Zveřejnění online je totéž co zveřejnění do složky – verzuje se stejným
       mechanismem, starší verze zůstávají v historii a rozpracované nabídky všech přihlášených se
       přepočítají. Dokud je připojená složka <code>_DB</code>, má v aplikaci přednost; bez ní platí
       online verze.</div>`);
}

/* ---------- overlay: zakázky online ---------- */

function otevriOnline() {
  onlineNactiRejstrik().then(() => renderOnlinePanel());
  renderOnlinePanel();
  const o = document.getElementById('online-overlay');
  if (o) o.style.display = 'flex';
}

function zavriOnline() {
  const o = document.getElementById('online-overlay');
  if (o) o.style.display = 'none';
}

function onlineHledatSet(v) {
  ONLINE_STAV.hledat = v;
  renderOnlineZakTelo();
}

/* Hlavička seznamu zakázek. Jedna pro obě místa, kde se seznam kreslí
 * (okno „Zakázky online" a vyhledávání v Přehledu cenových nabídek) — jinak
 * by se sloupce mezi nimi rozešly.
 *
 * Obchodník stojí od 21. 8. 2026 večer na KONCI řádku (zadání J. V.):
 * uprostřed rozrážel čísla a data, podle kterých se zakázka hledá nejčastěji. */
function onlineHlavickaZakazek(vyber) {
  return `<tr>${vyber ? '<th style="width:28px"></th>' : ''}
      <th style="text-align:left">Číslo</th><th style="text-align:left">Akce</th>
      <th style="text-align:left">Zákazník</th>
      <th>Druh</th><th>Datum</th><th>Variant</th>
      <th>Odesláno</th><th>Uloženo</th>
      <th style="text-align:left" title="kdo zakázku založil">Obchodník</th>
      <th></th></tr>`;
}

/* Klik na ŘÁDEK otevře zakázku (22. 8. 2026, zadání J. V.: „při kliku na
 * vybranou nabídku potřebuji, aby se zobrazily její detaily a varianty
 * v následujících sekcích"). Otevření naplní souhrn řídící varianty
 * i seznam kalkulací pod hledáním — jsou to živé pohledy na otevřenou
 * zakázku. Kliky na zaškrtávátko, tlačítko nebo políčko se nehijackují
 * a neuložené změny hlídá onlineOtevri (ptá se, nic nezahazuje samo). */
function prehledRadekOtevri(ev, soubor) {
  const cil = ev && ev.target;
  if (cil && /^(INPUT|BUTTON|SELECT|A|LABEL)$/.test(cil.tagName)) return;
  onlineOtevri(soubor);
}

function onlineRadekZakazky(z, vyber) {
  const otevrena = z.soubor === ONLINE_STAV.soubor;
  const odeslane = z.odeslane ? `<span title="odeslané (vytištěné) nabídky">🔒 ${z.odeslane}</span>` : '';
  /* Obchodník = autor zakázky (21. 8. 2026, zadání J. V.). Jméno chodí
   * z rejstříku; server ho doplňuje z účtů, takže e-mail zůstane jen tam,
   * kde účet jméno vyplněné nemá — nic se nevymýšlí. */
  const kdo = (typeof uloObchodnik === 'function') ? uloObchodnik(z) : (z.autor || '—');
  const druh = (typeof uloDruhZakazky === 'function') ? uloDruhZakazky(z) : '';
  /* Zahraniční zakázka nese štítek (#181) — tuzemská ne, ta je výchozí. */
  const rada = z.rada === 'zahr'
    ? ' <span class="rada-stitek" title="počítáno zahraničním ceníkem">Zahraničí</span>' : '';
  const chk = vyber
    ? `<td><input type="checkbox" ${onlineVybrano(z.soubor) ? 'checked' : ''}
        onchange="onlineVyberPrepni('${escJs(z.soubor)}', this.checked)"
        title="vybrat ke smazání"></td>` : '';
  return `<tr class="${otevrena ? 'aktivni' : ''} radek-klik" onclick="prehledRadekOtevri(event, '${escJs(z.soubor)}')"
    title="kliknutím otevřete zakázku — souhrn a varianty se ukážou v sekcích níž">${chk}
    <td style="text-align:left">${esc(z.cislo || '(bez čísla)')}</td>
    <td style="text-align:left;white-space:normal">${esc(z.nazevAkce || '—')}</td>
    <td style="text-align:left;white-space:normal">${esc(z.objednatel || '—')}</td>
    <td><span class="pill mut">${esc(druh)}</span>${rada}</td>
    <td>${esc(z.datum || '')}</td>
    <td>${z.variant}</td>
    <td>${odeslane}</td>
    <td>${esc((z.upraveno || '').slice(0, 16).replace('T', ' '))}</td>
    <td style="text-align:left;white-space:normal">${esc(kdo)}</td>
    <td><button class="mini" onclick="onlineOtevri('${escJs(z.soubor)}')">Otevřít</button></td>
  </tr>`;
}

/* ============================================================
 * VYHLEDÁVÁNÍ NABÍDEK v záložce Přehled cenových nabídek
 * (21. 8. 2026 večer, zadání J. V.: „uprav hlavičku tak, aby primárně
 * sloužila k vyhledávání nabídek OCK nebo PROJ").
 *
 * Do té doby začínala záložka kartou „Zakázka – hlavička OCK" — týmiž poli,
 * která jsou v liště nad kalkulací. Kdo hledal starší nabídku, musel otevřít
 * okno „Zakázky online" o dvě karty níž. Teď je hledání první věcí na
 * stránce a okno zůstává, kde bylo (nic se nemaže).
 *
 * Tělo se překresluje SAMO O SOBĚ (renderPrehledHledaniTelo), ne globálním
 * render() — hledá se při psaní a kurzor by z políčka po prvním písmenu
 * vyskočil. Stejná úvaha jako u seznamu variant (seznam_ui.js).
 * ============================================================ */

function prehledHledatSet(v) { ONLINE_STAV.prehled.hledat = v; renderPrehledHledaniTelo(); }
function prehledDruhSet(v) { ONLINE_STAV.prehled.druh = v; renderPrehledHledaniTelo(); }

function prehledNabidky() {
  const p = ONLINE_STAV.prehled;
  const radky = (typeof uloHledej === 'function')
    ? uloHledej(ONLINE_STAV.rejstrik, p.hledat) : (ONLINE_STAV.rejstrik || []);
  if (p.druh === 'vse') return radky;
  return radky.filter(z => uloDruhZakazky(z) === p.druh);
}

/* ---------- hromadný výběr a mazání (21. 8. 2026, jen administrátor) ----------
 *
 * Zadání J. V.: „do přehledu cenových nabídek přidej možnost hromadného
 * vybírání a mazání pro administrátora."
 *
 * Výběr žije v paměti okna, ne v datech — je to volba, ne vlastnost zakázky.
 * Maže se PO JEDNÉ (server neumí a nemá umět dávku): když jedna zakázka
 * selže, ostatní se tím nezruší a v hlášce je vidět, která zůstala. */
/* ---------- našeptávání ve vyhledávání (22. 8. 2026, zadání J. V.) ----------
 *
 * PRVNÍ VERZE byla nativní <datalist> — jenže Chrome u něj nabídku
 * spolehlivě NEZUŽUJE při dalším psaní (hlášeno J. V. týž den: „teď bere
 * v úvahu jen první písmeno"). Proto vlastní malý našeptávač: filtruje
 * TOUTÉŽ logikou jako samotné hledání (uloSlova/uloNorm — bez diakritiky,
 * každé napsané slovo musí sedět), takže co našeptávač nabídne, to hledání
 * opravdu najde. Nabízí se nejvýš 10 hodnot; vybírá se myší (mousedown,
 * aby předběhl blur), Esc nebo klik jinam nabídku schová. */
function naseptavacHodnoty() {
  const videno = {};
  const hodnoty = [];
  (ONLINE_STAV.rejstrik || []).forEach(z => {
    [z.cislo, z.nazevAkce, z.objednatel,
      (typeof uloObchodnik === 'function' ? uloObchodnik(z) : z.autorJmeno)].forEach(h => {
      const t = String(h || '').trim();
      if (!t || t === '—' || videno[t.toLowerCase()]) return;
      videno[t.toLowerCase()] = true;
      hodnoty.push(t);
    });
  });
  return hodnoty;
}

function naseptavacFiltr(dotaz) {
  const slova = (typeof uloSlova === 'function') ? uloSlova(dotaz) : [];
  if (!slova.length) return [];
  return naseptavacHodnoty().filter(h => {
    const t = uloNorm(h);
    /* Hodnota, kterou už uživatel napsal celou (doslova, jen na velikosti
     * písmen nezáleží), se nenabízí — překážela by nad výsledky. Porovnává
     * se BEZ očisty diakritiky: kdo napsal „sachta", tomu se „Šachta"
     * nabídnout má. */
    return h.toLowerCase() !== String(dotaz).trim().toLowerCase()
      && slova.every(x => t.indexOf(x) >= 0);
  }).slice(0, 10);
}

/* Vykreslení nabídky pod políčkem. `cil` říká, kterému hledání vybraná
 * hodnota patří ('prehled' | 'online'). */
function naseptavacKresli(boxId, dotaz, cil) {
  const el = document.getElementById(boxId);
  if (!el) return;
  const n = naseptavacFiltr(dotaz);
  if (!n.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = n.map(h => `<div class="nasept-radek"
    onmousedown="naseptavacVyber('${cil}', '${escJs(h)}')">${esc(h)}</div>`).join('');
  el.style.display = '';
}

function naseptavacSchovej(boxId) {
  /* Odloženě — kliknutí na řádek nabídky (mousedown) musí stihnout doběhnout
   * dřív, než blur políčka nabídku schová. */
  setTimeout(() => {
    const el = document.getElementById(boxId);
    if (el) { el.style.display = 'none'; }
  }, 150);
}

function naseptavacVyber(cil, hodnota) {
  if (cil === 'prehled') {
    const inp = document.querySelector('#page-zakazka input.seznam-hledat');
    if (inp) inp.value = hodnota;
    prehledHledatSet(hodnota);
    naseptavacSchovej('naseptBoxPrehled');
  } else {
    const inp = document.getElementById('onlineZakHledat');
    if (inp) inp.value = hodnota;
    onlineHledatSet(hodnota);
    naseptavacSchovej('naseptBoxOnline');
  }
}

function onlineVybrano(soubor) { return (ONLINE_STAV.prehled.vybrane || []).indexOf(soubor) >= 0; }

function onlineVyberPrepni(soubor, zap) {
  const v = ONLINE_STAV.prehled.vybrane || (ONLINE_STAV.prehled.vybrane = []);
  const i = v.indexOf(soubor);
  if (zap && i < 0) v.push(soubor);
  if (!zap && i >= 0) v.splice(i, 1);
  renderPrehledHledaniTelo();
}

function onlineVyberVse(zap) {
  const videt = prehledNabidky().map(z => z.soubor);
  ONLINE_STAV.prehled.vybrane = zap ? videt : [];
  renderPrehledHledaniTelo();
}

function onlineVyberZrus() { ONLINE_STAV.prehled.vybrane = []; renderPrehledHledaniTelo(); }

function onlineSmazVybrane() {
  if (!jeAdminOnline()) { onlineZprava('Mazat zakázky smí jen administrátor.', 'varovani'); render(); return; }
  const vybrane = (ONLINE_STAV.prehled.vybrane || []).slice();
  if (!vybrane.length) return;
  const zaznamy = (ONLINE_STAV.rejstrik || []).filter(z => vybrane.indexOf(z.soubor) >= 0);
  const odeslanych = zaznamy.reduce((a, z) => a + (z.odeslane || 0), 0);
  const seznam = zaznamy.slice(0, 12).map(z => '• ' + (z.cislo || '(bez čísla)')
    + (z.nazevAkce ? ' — ' + z.nazevAkce : '')).join('\n')
    + (zaznamy.length > 12 ? '\n• … a další ' + (zaznamy.length - 12) : '');
  if (!confirm('Opravdu smazat ' + vybrane.length + ' '
    + (vybrane.length === 1 ? 'zakázku' : (vybrane.length < 5 ? 'zakázky' : 'zakázek')) + ' z databáze?\n\n'
    + seznam + '\n\nSmazané zakázky jsou pryč i s historií cen a variant. '
    + 'Vrátit je jde jen ze zálohy databáze.')) return;
  /* Druhé potvrzení JEN tam, kde v zakázce leží vytištěná nabídka. */
  let iOdeslane = false;
  if (odeslanych) {
    if (!confirm('Pozor: ve výběru je ' + odeslanych + ' ODESLANÁ (vytištěná) nabídka.\n\n'
      + 'Odeslaná nabídka je doklad o tom, co odešlo zákazníkovi. Opravdu smazat i ji?')) return;
    iOdeslane = true;
  }
  ONLINE_STAV.pracuje = true; render();
  const nepovedlo = [];
  let hotovo = 0;
  const dalsi = (i) => {
    if (i >= vybrane.length) return Promise.resolve();
    const s = vybrane[i];
    return onlineApi('/api/zakazky?soubor=' + encodeURIComponent(s)
      + (iOdeslane ? '&ismazatOdeslane=1' : ''), null, 'DELETE')
      .then(() => { hotovo++; })
      .catch(e => { nepovedlo.push(s + ' (' + e.message + ')'); })
      .then(() => dalsi(i + 1));
  };
  dalsi(0).then(() => {
    ONLINE_STAV.prehled.vybrane = [];
    /* Když jsme smazali právě otevřenou zakázku, aplikace ji v paměti drží
     * dál — to je v pořádku, jen se už nemá tvářit, že je uložená. */
    if (vybrane.indexOf(ONLINE_STAV.soubor) >= 0 && typeof zakOdpojUlozeni === 'function')
      zakOdpojUlozeni();
    return onlineNactiRejstrik();
  }).then(() => {
    onlineZprava(nepovedlo.length
      ? ('Smazáno ' + hotovo + ', nepovedlo se: ' + nepovedlo.join('; '))
      : ('Smazáno ' + hotovo + ' '
        + (hotovo === 1 ? 'zakázka' : (hotovo < 5 ? 'zakázky' : 'zakázek')) + '.'),
    nepovedlo.length ? 'varovani' : '');
  }).then(() => { ONLINE_STAV.pracuje = false; render(); });
}

function renderPrehledHledaniTelo() {
  const el = document.getElementById('prehledHledaniTelo');
  if (!el) return;
  const radky = prehledNabidky();
  const vyber = jeAdminOnline();
  const vybranych = (ONLINE_STAV.prehled.vybrane || []).length;
  const lista = vyber
    ? `<div class="prehled-vyber noprint">
        <label style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${radky.length && vybranych === radky.length ? 'checked' : ''}
            onchange="onlineVyberVse(this.checked)"> vybrat vše (zobrazené)</label>
        <span class="note">${vybranych ? 'vybráno ' + vybranych : 'nic není vybráno'}</span>
        <button class="mini" ${vybranych ? '' : 'disabled'} onclick="onlineSmazVybrane()"
          title="smazat vybrané zakázky z databáze">Smazat vybrané…</button>
        <button class="mini" ${vybranych ? '' : 'disabled'} onclick="onlineVyberZrus()">Zrušit výběr</button>
      </div>` : '';
  el.innerHTML = lista + (radky.length
    ? `<div class="prehled-seznam"><table class="vartbl archtbl">${onlineHlavickaZakazek(vyber)}
        ${radky.map(z => onlineRadekZakazky(z, vyber)).join('')}</table></div>`
    : `<div class="seznam-prazdno">${(ONLINE_STAV.rejstrik || []).length
      ? 'Tomuhle hledání neodpovídá žádná nabídka.'
      : 'V databázi zatím není žádná uložená zakázka.'}</div>`);
  const p = document.getElementById('prehledHledaniPocet');
  if (p) p.textContent = radky.length + ' z ' + (ONLINE_STAV.rejstrik || []).length;
}

function prehledHledaniKarta() {
  /* Ovládání se kreslí VŽDY, i bez přihlášení: jinak by záložka po odhlášení
   * (nebo při běhu ze souboru) začínala prázdnem a vypadala rozbitě.
   * Nepřihlášenému se jen nahoře řekne, proč je seznam prázdný. */
  const bezDb = (!onlineMozne() || !ONLINE_STAV.ja)
    ? `<div class="note" style="margin-top:0">Seznam uložených nabídek se načte po přihlášení
        k databázi (Nastavení → Databáze). Otevřená zakázka a její varianty jsou vidět níž.</div>`
    : '';
  const p = ONLINE_STAV.prehled;
  const volba = (id, popis) => `<option value="${id}" ${p.druh === id ? 'selected' : ''}>${esc(popis)}</option>`;
  return card('Vyhledání nabídek',
    bezDb + `<div class="seznam-ovladani noprint">
      <span class="nasept-wrap"><input type="search" class="seznam-hledat"
        placeholder="Hledat číslo, akci, zákazníka, obchodníka…"
        title="Hledá se v čísle nabídky, názvu akce, zákazníkovi, datu i jménu obchodníka. Při psaní se nabídka průběžně zužuje."
        value="${esc(p.hledat)}" autocomplete="off"
        oninput="prehledHledatSet(this.value); naseptavacKresli('naseptBoxPrehled', this.value, 'prehled')"
        onfocus="naseptavacKresli('naseptBoxPrehled', this.value, 'prehled')"
        onblur="naseptavacSchovej('naseptBoxPrehled')"
        onkeydown="if(event.key==='Escape')naseptavacSchovej('naseptBoxPrehled')">
      <span class="nasept-box" id="naseptBoxPrehled" style="display:none"></span></span>
      <select onchange="prehledDruhSet(this.value)" title="druh nabídky">
        ${volba('vse', 'OCK i PROJ')}${volba('OCK', 'jen OCK')}${volba('PROJ', 'jen PROJ')}</select>
      <button class="mini" onclick="prehledHledatSet('');prehledDruhSet('vse')"
        title="zrušit hledání i filtr">Zrušit zúžení</button>
      <span class="sp"></span>
      <span class="note" id="prehledHledaniPocet"></span>
    </div>
    <div id="prehledHledaniTelo"></div>
    <div class="note">Seznam ukazuje pět řádků a dál se roluje. Druh se pozná podle přepínače
      <b>„jen projekce"</b> v zakázce; u starších zakázek podle čísla nabídky (OVP = projekce).
      Kliknutím na <b>Otevřít</b> se zakázka načte do aplikace — rozpracovanou práci si předtím uložte.</div>`);
}

/* Okno „Zakázky online" (tlačítko v Nastavení → Databáze). Kreslí týž seznam
 * jako vyhledávání v Přehledu, jen bez hromadného výběru — mazání patří na
 * jedno místo, aby se omylem neklikalo ve dvou různých oknech. */
function onlinePanelZakazky() {
  const radky = uloHledej(ONLINE_STAV.rejstrik, ONLINE_STAV.hledat);
  /* Tělo seznamu má vlastní obal (#onlineZakTelo) a při psaní se překresluje
   * JEN ono (onlineHledatSet) — kdyby se stavěl celý panel, políčko by při
   * každém písmenu přišlo o kurzor a našeptávač by zmizel. Stejný vzor jako
   * seznam variant (seznam_ui.js). */
  return `<div class="seznam-ovladani">
      <span class="nasept-wrap"><input type="text" class="seznam-hledat" id="onlineZakHledat"
             placeholder="Hledat číslo, akci, zákazníka, obchodníka…"
             title="Při psaní se nabídka průběžně zužuje."
             value="${esc(ONLINE_STAV.hledat)}" autocomplete="off"
             oninput="onlineHledatSet(this.value); naseptavacKresli('naseptBoxOnline', this.value, 'online')"
             onfocus="naseptavacKresli('naseptBoxOnline', this.value, 'online')"
             onblur="naseptavacSchovej('naseptBoxOnline')"
             onkeydown="if(event.key==='Escape')naseptavacSchovej('naseptBoxOnline')">
      <span class="nasept-box" id="naseptBoxOnline" style="display:none"></span></span>
      <span class="note" id="onlineZakPocet"></span>
    </div>
    <div id="onlineZakTelo"></div>
    <div class="note">Seznam se čte z rejstříku na serveru. <b>Mazat zakázky</b> jde od 21. 8. 2026
      v záložce <b>Přehled cenových nabídek</b> — hromadně a jen administrátorovi; smazaná zakázka
      je pryč i s historií cen a vrátit ji lze jen ze zálohy databáze.</div>`;
}

function renderOnlineZakTelo() {
  const el = document.getElementById('onlineZakTelo');
  if (!el) return;
  const radky = uloHledej(ONLINE_STAV.rejstrik, ONLINE_STAV.hledat);
  el.innerHTML = radky.length
    ? `<div class="tab-scroll"><table class="vartbl archtbl">${onlineHlavickaZakazek(false)}
        ${radky.map(z => onlineRadekZakazky(z, false)).join('')}</table></div>`
    : `<div class="seznam-prazdno">${ONLINE_STAV.rejstrik.length
      ? 'Hledání „' + esc(ONLINE_STAV.hledat) + '" nic nenašlo.'
      : 'Online zatím není žádná zakázka. Uložte tu otevřenou tlačítkem „Uložit online".'}</div>`;
  const poc = document.getElementById('onlineZakPocet');
  if (poc) poc.textContent = radky.length + ' z ' + ONLINE_STAV.rejstrik.length;
}

function onlineRadekUzivatele(u) {
  /* Kdo je hlavní účet, rozhoduje server (#95, 9. 8. 2026) — posílá to
   * v seznamu jako `hlavni`. Prohlížeč adresu neluští; kdyby ji znal,
   * byla by ve zdrojácích podruhé a při změně na serveru by se rozešly. */
  const hlavni = !!u.hlavni;
  const roleSel = `<select class="mini" onchange="onlineUzRoleZmen('${escJs(u.email)}', this.value)" ${hlavni ? 'disabled' : ''}>
    ${['Obchodník', 'Vedoucí', 'Administrátor'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
  </select>`;
  const resetRadek = ONLINE_STAV.hesloPro === u.email
    ? `<tr><td colspan="7" style="text-align:left;padding:6px 10px">
        Nové heslo pro ${esc(u.email)} (min. 8 znaků):
        <input type="password" id="onlineUzNoveHeslo" style="width:180px" minlength="8"
          placeholder="alespoň 8 znaků" title="Heslo musí mít alespoň 8 znaků."
          onkeydown="if(event.key==='Enter')onlineUzHesloUloz('${escJs(u.email)}')">
        <button class="mini" onclick="onlineUzHesloUloz('${escJs(u.email)}')">Uložit heslo</button>
        <button class="mini" onclick="onlineUzHesloPanel('')">Zrušit</button></td></tr>` : '';
  /* Titul, funkce a telefon jsou v tabulce vidět proto, že přesně tyhle údaje
   * odcházejí zákazníkovi v bloku „Vypracoval" pod cenovou nabídkou (#145).
   * Administrátor tak na jednom místě pozná, komu chybí telefon, a nabídka
   * neodejde s poloprázdnou patičkou. Funkce je pod jménem drobným písmem,
   * aby tabulka nenarostla o další sloupec. */
  return `<tr>
    <td style="text-align:left">${esc(u.email)}${hlavni ? ' <b>·</b> hlavní' : ''}</td>
    <td style="text-align:left">${esc(u.titul || '—')}</td>
    <td style="text-align:left">${esc(u.jmeno || '—')}${u.funkce
      ? `<div class="note" style="margin:0">${esc(u.funkce)}</div>` : ''}</td>
    <td style="text-align:left">${esc(u.telefon || '—')}</td>
    <td>${roleSel}</td>
    <td><input type="checkbox" ${u.aktivni ? 'checked' : ''} ${hlavni ? 'disabled' : ''}
        onchange="onlineUzAktivni('${escJs(u.email)}', this.checked)"></td>
    <td><button class="mini" onclick="onlineUzHesloPanel('${escJs(u.email)}')">Nové heslo…</button>
      ${hlavni ? '' : (u.archiv
        ? `<button class="mini" onclick="onlineUzArchiv('${escJs(u.email)}', false)">Vrátit z archivu</button>`
        : `<button class="mini" onclick="onlineUzArchiv('${escJs(u.email)}', true)">Archivovat…</button>`)}
      ${/* Mazat nejde hlavní účet ani sám sebe — hlídá to server, ale tlačítko,
            které vždycky skončí odmítnutím, do tabulky nepatří. */ ''}
      ${(hlavni || (ONLINE_STAV.ja && ONLINE_STAV.ja.email === u.email)) ? ''
        : `<button class="mini" onclick="onlineUzSmaz('${escJs(u.email)}')">Smazat…</button>`}</td>
  </tr>${resetRadek}`;
}

/* HTML správy účtů. Vykresluje se v panelu Nastavení (vnitřní záložka
 * Uživatelé) – tam, kde uživatel správu hledá (zadání 4. 8. 2026). */
function onlineUzivateleHtml() {
  const f = ONLINE_STAV.uzForm;
  /* Hláška (úspěch i odmítnutí serverem) se ukazuje PŘÍMO TADY — dřív šla
   * jen do karty na jiné záložce a založení účtu vypadalo, že nic nedělá. */
  return `${ONLINE_STAV.hlaska ? `<div class="${zapisTridaHlasky(ONLINE_STAV.hlaskaTyp)}">${esc(ONLINE_STAV.hlaska)}</div>` : ''}
    <div class="tab-scroll"><table class="vartbl archtbl">
      <tr><th style="text-align:left">E-mail</th><th style="text-align:left">Titul</th>
          <th style="text-align:left">Jméno / funkce</th><th style="text-align:left">Telefon</th>
          <th>Role</th><th>Aktivní</th><th></th></tr>
      ${ONLINE_STAV.uzivatele.map(onlineRadekUzivatele).join('')}</table></div>
    <div class="note" style="margin-top:12px"><b>Založit nový účet</b> – heslo je počáteční
      (min. 8 znaků), předejte ho osobně (e-mailem se nic neposílá):</div>
    <div class="row"><label>E-mail</label><input type="email" id="onlineUzEmail" value="${esc(f.email)}"
      oninput="ONLINE_STAV.uzForm.email=this.value"><span class="u"></span></div>
    <div class="row"><label>Titul před jménem</label><input type="text" id="onlineUzTitul" value="${esc(f.titul || '')}"
      placeholder="např. Ing." maxlength="40"
      oninput="ONLINE_STAV.uzForm.titul=this.value"><span class="u"></span></div>
    <div class="row"><label>Jméno a příjmení</label><input type="text" id="onlineUzJmeno" value="${esc(f.jmeno)}"
      oninput="ONLINE_STAV.uzForm.jmeno=this.value"><span class="u"></span></div>
    <div class="row"><label>Funkce</label><input type="text" id="onlineUzFunkce" value="${esc(f.funkce || '')}"
      placeholder="Obchodní technik" maxlength="80"
      oninput="ONLINE_STAV.uzForm.funkce=this.value"><span class="u"></span></div>
    <div class="row"><label>Telefon</label><input type="text" id="onlineUzTelefon" value="${esc(f.telefon || '')}"
      placeholder="+420 602 000 000" maxlength="40"
      oninput="ONLINE_STAV.uzForm.telefon=this.value"><span class="u"></span></div>
    <div class="note" style="margin:2px 0 8px">Titul, funkce a telefon se tisknou v nabídce do bloku
      <b>„Vypracoval"</b>. Nejsou povinné a každý si je později opraví sám v okně
      <b>Můj profil</b> – tam si taky nahraje sken podpisu s razítkem.</div>
    <div class="row"><label>Role</label><select id="onlineUzRole" onchange="ONLINE_STAV.uzForm.role=this.value">
      ${['Obchodník', 'Vedoucí', 'Administrátor'].map(r => `<option ${r === f.role ? 'selected' : ''}>${r}</option>`).join('')}
    </select><span class="u"></span></div>
    <div class="row"><label>Počáteční heslo (min. 8 znaků)</label>
      <input type="password" id="onlineUzHeslo" value="${esc(f.heslo)}" minlength="8"
      placeholder="alespoň 8 znaků" title="Heslo musí mít alespoň 8 znaků."
      oninput="ONLINE_STAV.uzForm.heslo=this.value"
      onkeydown="if(event.key==='Enter')onlineUzZaloz()"><span class="u"></span></div>
    <div class="note" style="margin-top:2px">Heslo musí mít <b>alespoň 8 znaků</b>. Kratší heslo
      server odmítne a účet nevznikne.</div>
    <div class="btns" style="margin-top:8px"><button class="primary" onclick="onlineUzZaloz()"
      ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Založit účet</button></div>
    <div class="note"><b>Archivovat…</b> účet odsune z očí a je to vratné; <b>Smazat…</b> ho
      odstraní z databáze i s podpisem a vratné to není. Účet, který má na sobě zakázky,
      server smazat nedá – nejdřív nabídne převod na jiného kolegu, aby práce po odcházejícím
      nezůstala podepsaná adresou, která už neexistuje. Razítka pod odeslanými nabídkami
      a podpisy pod rozhodnutími o slevách zůstávají v obou případech beze změny.</div>
    <div class="note">Hlavnímu administrátorskému účtu nejde snížit role ani ho vypnout – hlídá to
      server, aby si správce omylem nezamkl dveře. Reset hesla dělá vždy administrátor tady;
      žádná obnova e-mailem není. Každý uživatel si navíc může změnit vlastní heslo sám
      (tlačítko „Změnit heslo" vpravo nahoře – vyžaduje znalost starého hesla).</div>`;
}

function renderOnlinePanel() {
  const el = document.getElementById('online-panel');
  if (!el) return;
  el.innerHTML = `<h2>Zakázky online
      <span class="note" style="font-weight:400">${esc(ONLINE_STAV.ja ? (ONLINE_STAV.ja.jmeno || ONLINE_STAV.ja.email) : '')}</span>
      <button class="mini" style="margin-left:auto" onclick="zavriOnline()">Zavřít</button></h2>
    <div class="body">
      ${ONLINE_STAV.hlaska ? `<div class="${zapisTridaHlasky(ONLINE_STAV.hlaskaTyp)}">${esc(ONLINE_STAV.hlaska)}</div>` : ''}
      ${onlinePanelZakazky()}
    </div>`;
  renderOnlineZakTelo();
}

/* Spuštění: sonda /api běží jen nad http(s); ze souboru se nevolá nic. */
onlineStart();
