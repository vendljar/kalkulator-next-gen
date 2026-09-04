/* ================================================================
 * ULOŽENÍ ZAKÁZKY – jedna trojice tlačítek pro všechny kanály (4. 8. 2026)
 *
 * Zadání: „Každá nová zakázka by se měla automaticky ukládat do databáze.
 * Pro potřeby tohoto kroku budeme vždy zakázku ukládat po vyplnění hlavičky.
 * Systém musí uživatele informovat, že je třeba hlavičku vyplnit a zakázku
 * uložit. Následně už by se měla automaticky po každém kroku uložit do
 * databáze. Přesuň proto tlačítka ulož zakázku, načíst zakázku a nová
 * zakázka na začátek lišty."
 *
 * PROČ VZNIKL SAMOSTATNÝ MODUL. Do 4. 8. 2026 byla ta tři tlačítka dole
 * v kartě „Zakázka – hlavička OCK" a uměla JEN soubor: „Uložit zakázku
 * (JSON)" stáhlo soubor do Stažených. Uložení do databáze se jmenovalo
 * „Uložit online" a leželo o dvě karty níž. Uživatel tedy klikal na
 * tlačítko, které vypadalo jako uložení zakázky, a do databáze se přitom
 * nic nezapsalo — odtud „automatické ani vynucené online zálohování
 * nefunguje". Trojice se proto stěhuje nahoru do lišty „Zakázka a varianta"
 * (je vidět z Kalkulace OCK i PROJ) a míří tam, kde zakázka opravdu bydlí:
 *   přihlášen online → databáze na serveru,
 *   jinak připojená složka _DB → složka,
 *   jinak → soubor (jako dřív; nikdo o práci nepřijde).
 * Původní dvojice pro soubor v kartě hlavičky zůstává — nic se nemaže,
 * jen se přejmenovala na „…do souboru", aby bylo jasné, co dělá.
 *
 * ROZHODNUTÍ „SMÍ SE UKLÁDAT SAMO?" ZDE NEBYDLÍ. Bydlí v src/uloziste.js
 * (uloUlozeniStav), aby se dalo testovat bez prohlížeče a aby ho oba
 * kanály — server i složka — četly ze stejného místa. Tady se jen zjistí,
 * který kanál právě platí, a stav se vykreslí.
 * ================================================================ */

/* Který kanál právě platí. Pořadí je záměrné: server je cíl, složka je
 * přechodné období pro administrátora, soubor je záchrana pro každého. */
function zakKanal() {
  if (ONLINE_STAV.ja) return 'online';
  if (ULO_STAV.pripraveno) return 'slozka';
  return 'soubor';
}

function zakTextZakazky() {
  try { return JSON.stringify(ZAK); } catch (e) { return ''; }
}

/* Vstup pro uloUlozeniStav poskládaný z toho kanálu, který právě platí. */
function zakUlozeniStav() {
  const text = zakTextZakazky();
  const kanal = zakKanal();
  if (kanal === 'online')
    return uloUlozeniStav({
      zakazka: ZAK, dostupne: true, prihlasen: true,
      ulozeno: ONLINE_STAV.soubor, zmeneno: text !== ONLINE_STAV.posledni,
      kdy: ONLINE_STAV.kdyUlozeno,
    });
  if (kanal === 'slozka')
    return uloUlozeniStav({
      zakazka: ZAK, dostupne: true, prihlasen: true,
      ulozeno: ULO_STAV.soubor, zmeneno: text !== ULO_STAV.posledni,
      kdy: ULO_STAV.kdyUlozeno,
    });
  /* Bez databáze: rozlišíme „server tu vůbec není" (běžíme ze souboru)
   * od „server běží, jen nejsme přihlášení" — jsou to dvě různé rady. */
  return uloUlozeniStav({
    zakazka: ZAK, dostupne: !!ONLINE_STAV.bezi, prihlasen: false,
    ulozeno: '', zmeneno: true,
  });
}

/* Hláška pod trojicí. Vlastní pole ve stavu online části nemá co dělat —
 * je to informace o zakázce, ne o přihlášení; proto se drží tady. */
const ZAKULO_STAV = { hlaska: '', hlaskaTyp: '', uklada: false };

function zakUlozeniZprava(text, typ) {
  ZAKULO_STAV.hlaska = text || '';
  ZAKULO_STAV.hlaskaTyp = typ || '';
}

/* ---------- trojice tlačítek na začátku lišty ---------- */

/* „Uložit zakázku" se zvýrazní, dokud zakázka v databázi není — to je ten
 * okamžik, kdy na ni uživatel má kliknout. Jakmile se zakázka ukládá sama,
 * zvýraznění zmizí, aby lišta nekřičela pořád. */
function zakTrojice() {
  const s = zakUlozeniStav();
  const ceka = (s.stav === 'vyplnit' || s.stav === 'ulozit' || s.stav === 'nedostupne');
  /* Barvy tlačítka (17. 8. 2026 večer): ČERVENĚ dokud zakázka uložená není
   * (jediná akce, na kterou se nesmí zapomenout), JEMNĚ ZELENĚ po uložení —
   * na první pohled je vidět, že je práce v bezpečí. */
  const ulozeno = (s.stav === 'ulozeno' || s.stav === 'ceka');
  const kanal = zakKanal();
  const kam = kanal === 'online' ? 'do databáze na serveru'
    : (kanal === 'slozka' ? 'do složky _DB' : 'do souboru');
  const pracuje = ONLINE_STAV.pracuje || ULO_STAV.pracuje || ZAKULO_STAV.uklada;
  /* mousedown řeší ztracený první klik (viz zakUlozMousedown), onclick
   * zůstává pro klávesnici. Během zápisu tlačítko říká, co dělá. */
  return `<button class="mini${ceka ? ' vyzva' : ''}${ulozeno ? ' ulozeno-ok' : ''}" ${pracuje ? 'disabled' : ''}
      title="uložit otevřenou zakázku ${kam}"
      onmousedown="zakUlozMousedown()" onclick="zakUlozUI()">${ZAKULO_STAV.uklada ? '⏳ Ukládám…' : '💾 Uložit zakázku'}</button>
    <button class="mini" title="otevřít jinou zakázku (${kam})" onclick="zakNactiUI()">📂 Načíst zakázku</button>
    <button class="mini" title="začít novou prázdnou zakázku" onclick="novaZakazkaUI()">✚ Nová zakázka</button>`;
}

/* ---------- jak dlouho svítí „uloženo" (21. 8. 2026 večer) ----------
 *
 * Zadání J. V.: „Informaci o uložení změny zobraz vždy jen jednou, když se
 * uloží zakázka, a po chvíli skryj, ať už pak nepřekáží. Pro identifikaci
 * uložení nám pak stačí zelené tlačítko Uložit."
 *
 * Do té doby visel zelený pruh pod tlačítky pořád: při každé změně se
 * přepnul na „Změny se za chvíli uloží samy…" a po zápisu na „Uloženo…".
 * Byl tedy vidět nepřetržitě a přestal nést informaci.
 *
 * Nové chování:
 *   – „změny se uloží samy" se NEUKAZUJE VŮBEC (to je normální stav práce),
 *   – „uloženo" svítí ZAKULO_OKNO milisekund po zápisu (3 vteřiny) a pak zmizí,
 *   – všechno ostatní (nepřihlášen, hlavička nevyplněná, duplicitní číslo,
 *     chyba zápisu) svítí dál pořád — to jsou stavy, které se musí řešit.
 * Stav uložení je i tak vidět: tlačítko „Uložit zakázku" je zeleně. */
const ZAKULO_OKNO = 3000;   // 3 vteřiny (upřesnění J. V. 21. 8. 2026 večer)
let _zakuloTimer = null;

/* Kolik milisekund uplynulo od posledního úspěšného zápisu. Bez zápisu
 * (nebo s nečitelným časem) vrací Infinity — tedy „nesvítit". */
function zakUlozenoPred(ted) {
  const kanal = zakKanal();
  const kdy = kanal === 'online' ? ONLINE_STAV.kdyUlozeno
    : (kanal === 'slozka' ? ULO_STAV.kdyUlozeno : null);
  if (!kdy) return Infinity;
  const t = (kdy instanceof Date) ? kdy.getTime() : new Date(kdy).getTime();
  if (!isFinite(t)) return Infinity;
  return Math.max(0, (ted == null ? Date.now() : ted) - t);
}

/* Naplánuje zhasnutí pruhu. Odstraňuje se jen ten jeden prvek, ne celá
 * stránka: globální render() by uprostřed psaní přebral kurzor. */
function zakUlozeniZhasniPoChvili(zbyva) {
  if (typeof document === 'undefined') return;
  if (_zakuloTimer) clearTimeout(_zakuloTimer);
  _zakuloTimer = setTimeout(() => {
    _zakuloTimer = null;
    document.querySelectorAll('.zak-ulozeni-doba').forEach(e => { e.style.display = 'none'; });
  }, Math.max(200, zbyva));
}

/* Informační řádek pod lištou. Říká celou pravdu tam, kde je co řešit;
 * když je všechno v pořádku, mlčí (viz ZAKULO_OKNO výše).
 * Nic neblokuje (KONTROLY_UROVEN = 2). */
function zakUlozeniRadek() {
  const s = zakUlozeniStav();
  const radky = [];
  /* Průběh zápisu je vidět VŽDY — i kdyby trval vteřiny (studený start
   * serverové funkce), uživatel ví, že se pracuje a nemá klikat znovu. */
  if (ZAKULO_STAV.uklada)
    radky.push(`<div class="${zapisTridaHlasky('')} zak-ulozeni noprint">Ukládám do databáze…</div>`);
  if (s.stav === 'ulozeno') {
    /* Krátké potvrzení hned po zápisu — pak zhasne. */
    const pred = zakUlozenoPred();
    if (pred < ZAKULO_OKNO) {
      radky.push(`<div class="${zapisTridaHlasky('')} zak-ulozeni ulozeno-ok zak-ulozeni-doba noprint">${esc(s.text)}</div>`);
      zakUlozeniZhasniPoChvili(ZAKULO_OKNO - pred);
    }
  } else if (s.stav !== 'ceka') {
    /* Stavy, které se musí řešit, svítí pořád. */
    radky.push(`<div class="${zapisTridaHlasky('varovani')} zak-ulozeni noprint">${esc(s.text)}</div>`);
  }
  /* Duplicitní číslo nabídky (zadání 19. 8. 2026): štítek u pole v hlavičce
   * je snadné přehlédnout, a server pak uložení stejně odmítne. Proto se
   * kolize hlásí červeně i tady, přímo u tlačítek uložení. */
  const dup = (typeof zakazkaDuplicita === 'function' && typeof ONLINE_STAV !== 'undefined')
    ? zakazkaDuplicita(ZAK, ONLINE_STAV.rejstrik, ONLINE_STAV.soubor)
    : { cislo: '' };
  if (dup.cislo)
    radky.push(`<div class="${zapisTridaHlasky('chyba')} zak-ulozeni noprint">${esc(
      'Zakázku nelze uložit: stejné číslo nabídky už používá uložená zakázka '
      + dup.cislo + '. Zvolte vlastní číslo.')}</div>`);
  if (ZAKULO_STAV.hlaska)
    radky.push(`<div class="${zapisTridaHlasky(ZAKULO_STAV.hlaskaTyp)} zak-ulozeni noprint">${esc(ZAKULO_STAV.hlaska)}</div>`);
  return radky.join('');
}

/* ---------- co tlačítka dělají ---------- */

/* Uložení do databáze bez vyplněné hlavičky by založilo záznam „bez-cisla-…",
 * který se pak v seznamu nedá najít a při vyplnění čísla zůstane ležet jako
 * sirotek. Proto se v tomhle jediném případě do databáze nezapisuje —
 * ale ani se nic neblokuje: uživatel se rovnou octne v hlavičce a v kartě
 * pod ní má „Uložit do souboru (JSON)", takže o práci přijít nemůže. */
/* ---------- ZTRACENÝ PRVNÍ KLIK a viditelný průběh (22. 8. 2026) ----------
 *
 * Hlášeno J. V.: „na tlačítko musím kliknout dvakrát a nevidím, co se děje."
 *
 * DVOJÍ KLIK: klasická past překreslované aplikace. Když má uživatel kurzor
 * v políčku a klikne na Uložit, pořadí událostí je mousedown → blur pole →
 * onchange → set() → render(). render() postaví NOVÉ tlačítko, takže click
 * původního tlačítka už nikdy nedoběhne — první klik jen potvrdil políčko.
 * Řešení: uložení se plánuje už na MOUSEDOWN (ten přijde před blur), ale
 * odloženě přes setTimeout(0) — spustí se až PO onchange a render(), tedy
 * s čerstvými daty. onclick zůstává kvůli klávesnici (Enter/mezerník);
 * proti dvojímu spuštění drží zámek `uklada` + krátká známka času.
 *
 * PRŮBĚH: po dobu zápisu je tlačítko „Ukládám…" a pod lištou svítí řádek
 * „Ukládám do databáze…" — je vidět, že se něco děje, a druhé kliknutí
 * se tiše ignoruje. */
let _zakUlozPosledni = 0;

function zakUlozMousedown() {
  setTimeout(() => { zakUlozUI(); }, 0);
}

function zakUlozUI() {
  /* Zápis už běží → druhé kliknutí nic nespustí. */
  if (ZAKULO_STAV.uklada) return Promise.resolve(false);
  /* Jeden stisk může doručit až dvě volání (odložené z mousedown + click);
   * cokoli do 400 ms od posledního skutečného spuštění se zahodí. */
  const ted = Date.now();
  if (ted - _zakUlozPosledni < 400) return Promise.resolve(false);
  _zakUlozPosledni = ted;
  const s = zakUlozeniStav();
  if (s.stav === 'vyplnit') {
    zakUlozeniZprava('Vyplňte v hlavičce: ' + s.chybi.join(', ')
      + ' – pak zakázku uložte. Než ji vyplníte, uložte si práci do souboru '
      + 'tlačítkem „Uložit do souboru (JSON)" na konci Přehledu cenových nabídek.', 'varovani');
    prepniTab('zakazka');
    render();
    return Promise.resolve(false);
  }
  zakUlozeniZprava('');
  const kanal = zakKanal();
  if (kanal === 'online' || kanal === 'slozka') {
    ZAKULO_STAV.uklada = true;
    render();   // tlačítko hned ukáže „Ukládám…"
    const beh = kanal === 'online' ? onlineUloz() : uloUlozDoSlozky();
    return beh.then(v => { ZAKULO_STAV.uklada = false; render(); return v; },
      e => { ZAKULO_STAV.uklada = false; render(); throw e; });
  }
  ulozZakazku();
  render();
  return Promise.resolve(true);
}

function zakNactiUI() {
  zakUlozeniZprava('');
  const kanal = zakKanal();
  if (kanal === 'online') return otevriOnline();
  if (kanal === 'slozka') return otevriUloziste();
  const el = document.getElementById('fileIn');
  if (el) el.click();
}

/* Nová zakázka MUSÍ zapomenout, pod jakým jménem byla otevřená ta předchozí.
 * Kdyby to jméno zůstalo, prázdná zakázka by prošla branou automatického
 * ukládání (brána se ptá „už jsi někde uložená?") a hned by se sama zapsala
 * do databáze jako záznam bez čísla. Po zapomenutí je nová zakázka ve stavu
 * „vyplnit" a čeká na hlavičku – přesně jak je zadáno. */
function zakOdpojUlozeni() {
  /* Nová zakázka se zakládá proto, aby se do ní psalo — zámek čtení, který
   * zůstal po předchozí otevřené nabídce, se tu shodí (4. 9. 2026). */
  if (typeof zamekCteniVypni === 'function') zamekCteniVypni();
  ONLINE_STAV.soubor = ''; ONLINE_STAV.razitko = ''; ONLINE_STAV.posledni = ''; ONLINE_STAV.kdyUlozeno = null;
  /* Nová zakázka = od téhle chvíle se po refreshi vracet není kam (31. 8. 2026). */
  if (typeof onlinePoslednizapamatuj === 'function') onlinePoslednizapamatuj('');
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  ULO_STAV.soubor = ''; ULO_STAV.razitko = ''; ULO_STAV.posledni = ''; ULO_STAV.kdyUlozeno = null;
  if (ULO_STAV.timer) { clearTimeout(ULO_STAV.timer); ULO_STAV.timer = null; }
  zakUlozeniZprava('');
}
