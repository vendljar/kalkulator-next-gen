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
  ja: null,          // { email, jmeno, role } po přihlášení
  db: null,          // normalizovaná databáze programu ze serveru
  cenikPouzit: false,// online ceník je právě nasazený v aplikaci
  rejstrik: [],      // rejstřík online zakázek
  soubor: '',        // pod jakým jménem je otevřená zakázka online
  razitko: '',
  posledni: '',      // co jsme naposledy zapsali (proti zbytečným zápisům)
  auto: true,
  timer: null,
  hledat: '',
  panel: 'zakazky',  // co ukazuje overlay: 'zakazky' | 'uzivatele'
  uzivatele: [],
  hesloPro: '',      // e-mail účtu, u kterého je rozbalený reset hesla
  formEmail: '',     // přihlašovací formulář přežívá překreslení
  formHeslo: '',
  hlaska: '',
  hlaskaTyp: '',     // '' | 'varovani' | 'chyba'
  pracuje: false,
};

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
  fetch('/api/zdravi').then(r => (r.ok ? r.json() : null)).then(z => {
    if (!z || !z.ok) return null;
    ONLINE_STAV.bezi = true;
    // Cookie relace mohla přežít obnovení stránky – zeptáme se, kdo jsme.
    return fetch('/api/ja', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(ja => (ja && ja.ok ? onlinePoPrihlaseni(ja) : null))
      .catch(() => null);
  }).catch(() => null)
    .then(() => { if (typeof render === 'function') render(); });
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
  if (typeof NAST !== 'undefined') {
    NAST.uzivatel = ja.jmeno || ja.email;
    NAST.jeAdmin = ja.role === 'Administrátor';
  }
  onlineZprava('Přihlášen: ' + (ja.jmeno || ja.email) + ' (' + ja.role + ').');
  return Promise.all([onlineNactiProgram(), onlineNactiRejstrik()])
    .then(() => { if (jeAdminOnline()) onlineZalohaAuto(); });
}

function onlineOdhlas() {
  return onlineApi('/api/odhlaseni', {}).catch(() => null).then(() => {
    const vladlOnline = ONLINE_STAV.cenikPouzit;
    ONLINE_STAV.ja = null; ONLINE_STAV.db = null; ONLINE_STAV.cenikPouzit = false;
    ONLINE_STAV.rejstrik = []; ONLINE_STAV.soubor = ''; ONLINE_STAV.razitko = ''; ONLINE_STAV.posledni = '';
    if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
    /* Když v aplikaci vládl online ceník, po odhlášení k němu už není zdroj –
     * návrat k ceníku ze sestavení, stejná úvaha jako při odpojení složky. */
    if (vladlOnline && typeof progJede === 'function' && !progJede()
      && typeof progZpetNaBuild === 'function') progZpetNaBuild();
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
    onlineZprava('Uloženo online jako ' + o.soubor + ' (' + new Date().toLocaleTimeString('cs-CZ') + ').');
    if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
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

/* Samočinné odlití: jednou denně, po přihlášení administrátora, jen když je
 * připojená složka a dnešní záloha v ní ještě neleží. Chyba se nehlásí
 * nahlas – ruční tlačítka zůstávají a noční otisk v Blobs běží nezávisle. */
function onlineZalohaAuto() {
  if (typeof ULO_STAV === 'undefined' || !ULO_STAV.pripraveno) return Promise.resolve(false);
  const jmeno = onlineZalohaJmeno();
  return uloCtiSoubor(jmeno).then(t => {
    if (t != null) return false;
    return onlineApi('/api/zaloha')
      .then(o => uloZapisSoubor(jmeno, JSON.stringify(o.zaloha, null, 1)))
      .then(() => {
        onlineZprava('Dnešní záloha online databáze se sama odlila do složky „'
          + ULO_STAV.jmeno + '" (' + jmeno + ').');
        render();
        return true;
      });
  }).catch(() => false);
}

/* ---------- správa účtů (jen administrátor) ---------- */

function onlineUzivateleNacti() {
  return onlineApi('/api/uzivatele')
    .then(o => { ONLINE_STAV.uzivatele = o.uzivatele || []; return true; })
    .catch(e => { onlineZprava('Seznam účtů se nepodařilo načíst: ' + e.message, 'varovani'); return false; });
}

function onlineUzAkce(telo, hotovo) {
  ONLINE_STAV.pracuje = true; renderOnlinePanel();
  return onlineApi('/api/uzivatele', telo)
    .then(() => { onlineZprava(hotovo); return onlineUzivateleNacti(); })
    .catch(e => { onlineZprava(e.message, 'varovani'); return false; })
    .then(v => { ONLINE_STAV.pracuje = false; renderOnlinePanel(); return v; });
}

function onlineUzZaloz() {
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const email = g('onlineUzEmail').trim(), jmeno = g('onlineUzJmeno').trim();
  const role = g('onlineUzRole'), heslo = g('onlineUzHeslo');
  if (!email || !heslo) { onlineZprava('Vyplňte e-mail i počáteční heslo (min. 8 znaků).', 'varovani'); renderOnlinePanel(); return; }
  onlineUzAkce({ akce: 'zaloz', email, jmeno, role, heslo },
    'Účet ' + email + ' (' + role + ') je založený. Heslo předejte osobně – e-mailem se neposílá.');
}

function onlineUzHesloPanel(email) {
  ONLINE_STAV.hesloPro = (ONLINE_STAV.hesloPro === email) ? '' : email;
  renderOnlinePanel();
}

function onlineUzHesloUloz(email) {
  const el = document.getElementById('onlineUzNoveHeslo');
  const heslo = el ? el.value : '';
  if (!heslo || heslo.length < 8) { onlineZprava('Nové heslo musí mít aspoň 8 znaků.', 'varovani'); renderOnlinePanel(); return; }
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
  const slozkaVladne = (typeof progJede === 'function') && progJede();
  if (ONLINE_STAV.ja && ONLINE_STAV.db && !slozkaVladne) {
    if (!ONLINE_STAV.cenikPouzit) {
      ONLINE_STAV.cenikPouzit = true;
      setTimeout(() => {
        progPouzij(ONLINE_STAV.db.platny);
        onlineZprava('Platí online ceník – ' + programPopisVerze(ONLINE_STAV.db.platny) + '.');
        render();
      }, 0);
      return; // nasazení si samo překreslí; autosave počká na další tik
    }
  } else if (ONLINE_STAV.cenikPouzit) {
    /* složka se (znovu) připojila, nebo jsme odhlášení – online ceník už
     * nevládne a příště se smí nasadit znovu */
    ONLINE_STAV.cenikPouzit = false;
  }

  if (!ONLINE_STAV.auto || !ONLINE_STAV.ja || !ONLINE_STAV.soubor || ONLINE_STAV.pracuje) return;
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
    + ONLINE_STAV.rejstrik.length + ' '
    + (ONLINE_STAV.rejstrik.length === 1 ? 'zakázka' : (ONLINE_STAV.rejstrik.length < 5 ? 'zakázky' : 'zakázek'))
    + ' online · otevřeno: ' + (ONLINE_STAV.soubor || 'zatím neuloženo online');
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
      <button onclick="onlineStart()">Zkusit spojení znovu</button></div>`;
  } else if (!ONLINE_STAV.ja) {
    telo = `${hlaska}
      <div class="row"><label>E-mail</label>
        <input type="email" id="onlineEmail" value="${esc(ONLINE_STAV.formEmail)}" autocomplete="username"
          oninput="ONLINE_STAV.formEmail=this.value"
          onkeydown="if(event.key==='Enter')onlinePrihlas()"><span class="u"></span></div>
      <div class="row"><label>Heslo</label>
        <input type="password" id="onlineHeslo" value="${esc(ONLINE_STAV.formHeslo)}" autocomplete="current-password"
          oninput="ONLINE_STAV.formHeslo=this.value"
          onkeydown="if(event.key==='Enter')onlinePrihlas()"><span class="u"></span></div>
      <div class="btns" style="margin-top:10px">
        <button class="primary" onclick="onlinePrihlas()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Přihlásit</button>
      </div>
      <div class="note">Účty zakládá a hesla nastavuje administrátor – žádná samoobslužná registrace
        ani obnova hesla e-mailem. Zapomenuté heslo řeší administrátor nastavením nového.</div>`;
  } else {
    const adminTlacitka = jeAdminOnline()
      ? `<button onclick="otevriOnline('uzivatele')">Uživatelé…</button>
         ${typeof ULO_STAV !== 'undefined' && ULO_STAV.pripraveno
    ? `<button onclick="onlineZaloha(true)" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Odlít zálohu do složky (Disk)</button>` : ''}
         <button onclick="onlineZaloha(false)" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Stáhnout zálohu</button>` : '';
    telo = `${hlaska}
      <div class="btns" style="margin-top:10px">
        <button class="primary" onclick="onlineUloz()" ${ONLINE_STAV.pracuje ? 'disabled' : ''}>Uložit online</button>
        <button onclick="otevriOnline('zakazky')">Zakázky online…</button>
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

/* ---------- overlay: zakázky online / uživatelé ---------- */

function otevriOnline(panel) {
  ONLINE_STAV.panel = panel || 'zakazky';
  const nacti = ONLINE_STAV.panel === 'uzivatele' ? onlineUzivateleNacti() : onlineNactiRejstrik();
  nacti.then(() => renderOnlinePanel());
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
        <input type="password" id="onlineUzNoveHeslo" style="width:180px"
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

function onlinePanelUzivatele() {
  return `<table class="vartbl archtbl">
      <tr><th style="text-align:left">E-mail</th><th style="text-align:left">Jméno</th>
          <th>Role</th><th>Aktivní</th><th></th></tr>
      ${ONLINE_STAV.uzivatele.map(onlineRadekUzivatele).join('')}</table>
    <div class="note" style="margin-top:12px"><b>Založit nový účet</b> – heslo je počáteční,
      předejte ho osobně (e-mailem se nic neposílá):</div>
    <div class="row"><label>E-mail</label><input type="email" id="onlineUzEmail"><span class="u"></span></div>
    <div class="row"><label>Jméno</label><input type="text" id="onlineUzJmeno"><span class="u"></span></div>
    <div class="row"><label>Role</label><select id="onlineUzRole">
      <option>Obchodník</option><option>Vedoucí</option><option>Administrátor</option></select><span class="u"></span></div>
    <div class="row"><label>Počáteční heslo</label><input type="password" id="onlineUzHeslo"><span class="u"></span></div>
    <div class="btns" style="margin-top:8px"><button class="primary" onclick="onlineUzZaloz()">Založit účet</button></div>
    <div class="note">Hlavnímu administrátorskému účtu nejde snížit role ani ho vypnout – hlídá to
      server, aby si správce omylem nezamkl dveře. Reset hesla dělá vždy administrátor tady;
      žádná obnova e-mailem není.</div>`;
}

function renderOnlinePanel() {
  const el = document.getElementById('online-panel');
  if (!el) return;
  const zakazkyAkt = ONLINE_STAV.panel !== 'uzivatele';
  el.innerHTML = `<h2>${zakazkyAkt ? 'Zakázky online' : 'Uživatelé online databáze'}
      <span class="note" style="font-weight:400">${esc(ONLINE_STAV.ja ? (ONLINE_STAV.ja.jmeno || ONLINE_STAV.ja.email) : '')}</span>
      ${jeAdminOnline() ? `<button class="mini" style="margin-left:auto" onclick="otevriOnline('${zakazkyAkt ? 'uzivatele' : 'zakazky'}')">
        ${zakazkyAkt ? 'Uživatelé…' : 'Zakázky…'}</button>` : '<span style="margin-left:auto"></span>'}
      <button class="mini" onclick="zavriOnline()">Zavřít</button></h2>
    <div class="body">
      ${ONLINE_STAV.hlaska ? `<div class="${zapisTridaHlasky(ONLINE_STAV.hlaskaTyp)}">${esc(ONLINE_STAV.hlaska)}</div>` : ''}
      ${zakazkyAkt ? onlinePanelZakazky() : onlinePanelUzivatele()}
    </div>`;
}

/* Spuštění: sonda /api běží jen nad http(s); ze souboru se nevolá nic. */
onlineStart();
