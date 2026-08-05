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
  sondaHotova: false,// první dotaz na /api/zdravi už doběhl (ať tak, či tak)
  nouzove: false,    // uživatel vědomě pokračuje bez přihlášení (server neběží)
  ja: null,          // { email, jmeno, role } po přihlášení
  db: null,          // normalizovaná databáze programu ze serveru
  cenikPouzit: false,// online ceník je právě nasazený v aplikaci
  firma: null,       // { udaje, kdo, kdy } – firemní údaje ze serveru
  firmaPouzita: false,// online firemní údaje jsou právě nasazené v aplikaci
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
  auto: true,
  timer: null,
  hledat: '',
  uzivatele: [],
  uzivateleNacteno: false, // seznam účtů už byl (aspoň jednou) vyžádán
  /* Formulář „založit účet" žije ve stavu, ne jen v polích: panel se při
   * každé akci překresluje a hodnoty v DOM by se ztratily. Maže se až po
   * ÚSPĚŠNÉM založení — po chybě zůstává vyplněný (4. 8. 2026 večer). */
  uzForm: { email: '', jmeno: '', role: 'Obchodník', heslo: '' },
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
function onlineApi(cesta, telo) {
  const o = { credentials: 'same-origin' };
  if (telo !== undefined) {
    o.method = 'POST';
    o.headers = { 'Content-Type': 'application/json' };
    o.body = JSON.stringify(telo);
  }
  return fetch(cesta, o).then(r => r.json().catch(() => ({})).then(d => {
    if (r.status === 401 && ONLINE_STAV.ja) {
      ONLINE_STAV.ja = null; ONLINE_STAV.db = null; ONLINE_STAV.cenikPouzit = false;
      onlineZprava('Přihlášení vypršelo – přihlaste se prosím znovu.', 'varovani');
    }
    if (!r.ok || d.ok === false)
      throw new Error(d.chyba || ('server odpověděl ' + r.status));
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
    // Cookie relace mohla přežít obnovení stránky – zeptáme se, kdo jsme.
    return fetch('/api/ja', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(ja => (ja && ja.ok ? onlinePoPrihlaseni(ja) : null))
      .catch(() => null);
  }).catch(() => null)
    .then(() => { ONLINE_STAV.sondaHotova = true; if (typeof render === 'function') render(); });
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
  ONLINE_STAV.ja = { email: ja.email, jmeno: ja.jmeno || '', role: ja.role };
  ONLINE_STAV.uzivateleNacteno = false;   // seznam účtů se načte čerstvý
  if (typeof NAST !== 'undefined') {
    NAST.uzivatel = ja.jmeno || ja.email;
    NAST.jeAdmin = ja.role === 'Administrátor';
  }
  onlineZprava('Přihlášen: ' + (ja.jmeno || ja.email) + ' (' + ja.role + ').');
  return Promise.all([onlineNactiProgram(), onlineNactiFirmu(), onlineNactiRejstrik()])
    .then(() => { if (jeAdminOnline()) onlineZalohaAuto(); });
}

function onlineOdhlas() {
  return onlineApi('/api/odhlaseni', {}).catch(() => null).then(() => {
    const vladlOnline = ONLINE_STAV.cenikPouzit;
    const vladlaFirma = ONLINE_STAV.firmaPouzita;
    ONLINE_STAV.ja = null; ONLINE_STAV.db = null; ONLINE_STAV.cenikPouzit = false;
    ONLINE_STAV.firma = null; ONLINE_STAV.firmaPouzita = false;
    ONLINE_STAV.rejstrik = []; ONLINE_STAV.soubor = ''; ONLINE_STAV.razitko = ''; ONLINE_STAV.posledni = '';
    ONLINE_STAV.kdyUlozeno = null;
    ONLINE_STAV.uzivatele = []; ONLINE_STAV.uzivateleNacteno = false; ONLINE_STAV.formHeslo = '';
    ONLINE_STAV.otisky = []; ONLINE_STAV.otiskyNacteno = false;
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
function onlineZverejni() {
  if (!jeAdminOnline()) { onlineZprava('Zveřejnit ceník smí jen administrátor.', 'varovani'); render(); return Promise.resolve(false); }
  const ctx = progKontext('');
  if (ONLINE_STAV.db && programBezeZmeny(ONLINE_STAV.db, ctx)) {
    onlineZprava('Ceník této varianty se od online verze neliší – není co zveřejňovat.');
    render(); return Promise.resolve(false);
  }
  const rozdily = ONLINE_STAV.db ? programRozdily(ONLINE_STAV.db, ctx) : [];
  const shrnuti = ONLINE_STAV.db
    ? (rozdily.length ? rozdily.length + ' změněných položek ceníku' : 'ceník beze změny, mění se katalog nebo slevy')
    : 'založení online databáze programu';
  const pozn = prompt('Zveřejnit ceník aktivní varianty jako platný ONLINE pro celý program?\n\n'
    + shrnuti + '.\nOd této chvíle z něj budou vycházet nové nabídky všech přihlášených.\n'
    + 'Rozpracované nabídky se přepočítají samy, vytištěné (uzamčené) zůstanou beze změny.'
    + '\n\nČím se změna zdůvodňuje (nepovinné):', '');
  if (pozn === null) return Promise.resolve(false);

  ONLINE_STAV.pracuje = true; render();
  return onlineApi('/api/program', {
    cenik: ctx.cenik, cenikProj: ctx.cenikProj, katalog: ctx.katalog,
    slevy: ctx.slevy, poznamka: pozn, build: ctx.build,
  }).then(o => {
    onlineZprava('Zveřejněno online – platí verze ' + o.verze + '.');
    return onlineNactiProgram().then(() => true);
  }).catch(e => { onlineZprava('Zveřejnit online se nepodařilo: ' + e.message, 'chyba'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
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

/* Krátký popis stavu do Nastavení → Firma. */
function onlineFirmaPopis() {
  if (!ONLINE_STAV.ja) return 'Nepřihlášen – online firemní údaje se načtou po přihlášení.';
  if (!ONLINE_STAV.firma)
    return 'V online databázi firemní údaje zatím nejsou. Dokud je tam nezveřejníte, '
      + 'mají obchodníci v hlavičce nabídky ukázkovou firmu ze sestavení.';
  return 'Online zveřejněno ' + String(ONLINE_STAV.firma.kdy || '').slice(0, 16).replace('T', ' ')
    + ' (' + (ONLINE_STAV.firma.kdo || '?') + ') · ' + (ONLINE_STAV.firma.udaje.nazev || '')
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
  return `<div class="sec-title">Firemní údaje v online databázi</div>
    <div class="note" style="margin-top:0">${esc(onlineFirmaPopis())}</div>
    ${lze.ok ? '' : `<div class="note" style="color:var(--warn)">⚠ ${esc(lze.duvod)}</div>`}
    <div class="btns" style="margin-top:8px">
      <button class="primary" onclick="onlineZverejniFirmu()"
        ${ONLINE_STAV.pracuje || !lze.ok ? 'disabled' : ''}>Zveřejnit firemní údaje online</button>
      <button class="mini" onclick="onlineNactiFirmu().then(function(){render();nastRefresh()})">Načíst online znovu</button>
    </div>
    <div class="note">Obchodník ani vedoucí složku <code>_DB</code> nemapují – hlavičku nabídky
      mají odkud vzít jedině odsud. Dokud je připojená složka, má v aplikaci přednost ona;
      bez ní platí tahle online verze.</div>`;
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
  return onlineApi('/api/zakazky', { zakazka: ZAK }).then(o => {
    ONLINE_STAV.soubor = o.soubor; ONLINE_STAV.razitko = o.razitko || '';
    ONLINE_STAV.posledni = JSON.stringify(ZAK);
    ONLINE_STAV.kdyUlozeno = new Date();
    onlineZprava('Uloženo online jako ' + o.soubor + ' (' + new Date().toLocaleTimeString('cs-CZ') + ').');
    if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
    /* Zakázka je v databázi – nouzová záloha v prohlížeči už nemá co chránit.
     * Kdyby se nechala ležet, ptá se na ni aplikace při každém dalším spuštění
     * i za měsíc („V prohlížeči je rozpracovaná kalkulace…"). */
    if (typeof historieZalohaHotovo === 'function') historieZalohaHotovo();
    return onlineNactiRejstrik().then(() => true);
  }).catch(e => {
    /* Server odmítá i pokus přepsat odeslanou (uzamčenou) nabídku – jeho
     * zdůvodnění se ukáže doslova, je z téhož kódu jako hláška u složky. */
    onlineZprava('Neuloženo online: ' + e.message, 'varovani');
    return false;
  }).then(v => { ONLINE_STAV.pracuje = false; render(); return v; });
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
    .catch(e => { onlineZprava(e.message, 'varovani'); return false; })
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
  return onlineUzAkce({ akce: 'zaloz', email, jmeno: String(f.jmeno || '').trim(), role: f.role, heslo: f.heslo },
    'Účet ' + email + ' (' + f.role + ') je založený. Heslo předejte osobně – e-mailem se neposílá.',
    { poUspechu: () => {
      /* nový účet do tabulky hned z odpovědi; formulář se maže až teď */
      if (!ONLINE_STAV.uzivatele.some(u => u.email === email))
        ONLINE_STAV.uzivatele.push({ email, jmeno: String(f.jmeno || '').trim(), role: f.role, aktivni: true });
      ONLINE_STAV.uzForm = { email: '', jmeno: '', role: 'Obchodník', heslo: '' };
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

function renderOnlineLista() {
  const el = document.getElementById('onlineLista');
  if (!el) return;
  if (!onlineMozne()) { el.innerHTML = ''; return; }
  if (!ONLINE_STAV.ja) {
    el.innerHTML = ONLINE_STAV.nouzove
      ? `<button class="mini" onclick="onlineZpetKPrihlaseni()">Přihlásit se</button>` : '';
    return;
  }
  el.innerHTML = `<b>👤 ${esc(ONLINE_STAV.ja.jmeno || ONLINE_STAV.ja.email)}</b>
    <span>(${esc(ONLINE_STAV.ja.role)})</span>
    <button class="mini" onclick="otevriZmenaHesla()">Změnit heslo</button>
    <button class="mini" onclick="onlineOdhlas()">Odhlásit</button>`;
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
    ? 'Nepřihlášen – online ceník se načte po přihlášení (záložka Zakázka).'
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
  renderOnlinePanel();
}

function onlineRadekZakazky(z) {
  const otevrena = z.soubor === ONLINE_STAV.soubor;
  const odeslane = z.odeslane ? `<span title="odeslané (vytištěné) nabídky">🔒 ${z.odeslane}</span>` : '';
  return `<tr class="${otevrena ? 'aktivni' : ''}">
    <td style="text-align:left">${esc(z.cislo || '(bez čísla)')}</td>
    <td style="text-align:left;white-space:normal">${esc(z.nazevAkce || '—')}</td>
    <td style="text-align:left;white-space:normal">${esc(z.objednatel || '—')}</td>
    <td>${esc(z.datum || '')}</td>
    <td>${z.variant}</td>
    <td>${odeslane}</td>
    <td>${esc((z.upraveno || '').slice(0, 16).replace('T', ' '))}</td>
    <td><button class="mini" onclick="onlineOtevri('${escJs(z.soubor)}')">Otevřít</button></td>
  </tr>`;
}

function onlinePanelZakazky() {
  const radky = uloHledej(ONLINE_STAV.rejstrik, ONLINE_STAV.hledat);
  return `<div class="seznam-ovladani">
      <input type="text" class="seznam-hledat" placeholder="Hledat číslo, akci, objednatele…"
             value="${esc(ONLINE_STAV.hledat)}" oninput="onlineHledatSet(this.value)">
      <span class="note">${radky.length} z ${ONLINE_STAV.rejstrik.length}</span>
    </div>
    ${radky.length
    ? `<table class="vartbl archtbl">
        <tr><th style="text-align:left">Číslo</th><th style="text-align:left">Akce</th>
            <th style="text-align:left">Objednatel</th><th>Datum</th><th>Variant</th>
            <th>Odesláno</th><th>Uloženo</th><th></th></tr>
        ${radky.map(onlineRadekZakazky).join('')}</table>`
    : `<div class="seznam-prazdno">${ONLINE_STAV.rejstrik.length
      ? 'Hledání „' + esc(ONLINE_STAV.hledat) + '" nic nenašlo.'
      : 'Online zatím není žádná zakázka. Uložte tu otevřenou tlačítkem „Uložit online".'}</div>`}
    <div class="note">Seznam se čte z rejstříku na serveru. Mazání online zakázek zatím není –
      nic se nemaže bez výslovného rozhodnutí; případné úklidy uděláme společně.</div>`;
}

function onlineRadekUzivatele(u) {
  const hlavni = u.email === 'vendl.jaroslav@engineers-cz.cz';
  const roleSel = `<select class="mini" onchange="onlineUzRoleZmen('${escJs(u.email)}', this.value)" ${hlavni ? 'disabled' : ''}>
    ${['Obchodník', 'Vedoucí', 'Administrátor'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
  </select>`;
  const resetRadek = ONLINE_STAV.hesloPro === u.email
    ? `<tr><td colspan="5" style="text-align:left;padding:6px 10px">
        Nové heslo pro ${esc(u.email)} (min. 8 znaků):
        <input type="password" id="onlineUzNoveHeslo" style="width:180px" minlength="8"
          placeholder="alespoň 8 znaků" title="Heslo musí mít alespoň 8 znaků."
          onkeydown="if(event.key==='Enter')onlineUzHesloUloz('${escJs(u.email)}')">
        <button class="mini" onclick="onlineUzHesloUloz('${escJs(u.email)}')">Uložit heslo</button>
        <button class="mini" onclick="onlineUzHesloPanel('')">Zrušit</button></td></tr>` : '';
  return `<tr>
    <td style="text-align:left">${esc(u.email)}${hlavni ? ' <b>·</b> hlavní' : ''}</td>
    <td style="text-align:left">${esc(u.jmeno || '—')}</td>
    <td>${roleSel}</td>
    <td><input type="checkbox" ${u.aktivni ? 'checked' : ''} ${hlavni ? 'disabled' : ''}
        onchange="onlineUzAktivni('${escJs(u.email)}', this.checked)"></td>
    <td><button class="mini" onclick="onlineUzHesloPanel('${escJs(u.email)}')">Nové heslo…</button></td>
  </tr>${resetRadek}`;
}

/* HTML správy účtů. Vykresluje se v panelu Nastavení (vnitřní záložka
 * Uživatelé) – tam, kde uživatel správu hledá (zadání 4. 8. 2026). */
function onlineUzivateleHtml() {
  const f = ONLINE_STAV.uzForm;
  /* Hláška (úspěch i odmítnutí serverem) se ukazuje PŘÍMO TADY — dřív šla
   * jen do karty na jiné záložce a založení účtu vypadalo, že nic nedělá. */
  return `${ONLINE_STAV.hlaska ? `<div class="${zapisTridaHlasky(ONLINE_STAV.hlaskaTyp)}">${esc(ONLINE_STAV.hlaska)}</div>` : ''}
    <table class="vartbl archtbl">
      <tr><th style="text-align:left">E-mail</th><th style="text-align:left">Jméno</th>
          <th>Role</th><th>Aktivní</th><th></th></tr>
      ${ONLINE_STAV.uzivatele.map(onlineRadekUzivatele).join('')}</table>
    <div class="note" style="margin-top:12px"><b>Založit nový účet</b> – heslo je počáteční
      (min. 8 znaků), předejte ho osobně (e-mailem se nic neposílá):</div>
    <div class="row"><label>E-mail</label><input type="email" id="onlineUzEmail" value="${esc(f.email)}"
      oninput="ONLINE_STAV.uzForm.email=this.value"><span class="u"></span></div>
    <div class="row"><label>Jméno</label><input type="text" id="onlineUzJmeno" value="${esc(f.jmeno)}"
      oninput="ONLINE_STAV.uzForm.jmeno=this.value"><span class="u"></span></div>
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
}

/* Spuštění: sonda /api běží jen nad http(s); ze souboru se nevolá nic. */
onlineStart();
