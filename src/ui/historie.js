/* ================= OCHRANA ROZPRACOVANÉ PRÁCE (#1) =================
 * Do teď platilo, že jediná pojistka proti ztrátě práce je „Uložit zakázku"
 * do JSON. Refresh stránky, zavření záložky nebo nešťastná úprava znamenaly,
 * že se celá rozdělaná kalkulace zahodila. Tenhle modul přidává tři na sobě
 * nezávislé vrstvy, aby se selhání jedné z nich dalo přežít:
 *
 *   1. HISTORIE ZMĚN v paměti  → tlačítka „Zpět" a „Znovu" (Ctrl+Z / Ctrl+Y).
 *   2. AUTOMATICKÁ ZÁLOHA v prohlížeči → po pádu nebo refreshi nabídne obnovu.
 *   3. VAROVÁNÍ PŘED ODCHODEM → prohlížeč se zeptá, když jsou neuložené změny.
 *
 * PROČ SE HISTORIE NEČTE ZE set(), ALE Z render():
 * Zakázku mění spousta cest – set(), slevaSet(), varNova(), editace ceníku,
 * katalog, technická specifikace. Kdyby se historie napojila jen na set(),
 * tiše by přeskočila všechno ostatní a „Zpět" by občas skočilo o dva kroky
 * vedle. Každá z těch cest ale končí voláním render(). Proto si tady držíme
 * otisk (JSON) posledního vykresleného stavu a na konci každého renderu ho
 * porovnáme s aktuálním. Liší-li se, uloží se PŘEDCHOZÍ otisk do zásobníku.
 * Je to jedno JSON.stringify na render – proti třinácti překresleným sekcím
 * zanedbatelné – a chytí to i cesty, které vzniknou až v budoucnu.
 *
 * PROČ SE ÚLOŽIŠTĚ PROHLÍŽEČE DETEKUJE A NEPOUŽÍVÁ NATVRDO:
 * Aplikace musí zůstat spustitelná i tam, kde je úložiště zakázané – hlavně
 * v sandboxu Google Apps Script, kde pouhý DOTAZ na localStorage vyhodí
 * SecurityError a shodil by celý skript. Přístup je proto v try/catch a když
 * úložiště není, modul mlčky vypne jen vrstvu 2; „Zpět" i varování při
 * odchodu fungují dál. Nic se tím nerozbije, jen se nenabídne obnova.
 * ============================================================================ */

const HIST_MAX = 40;                       // kolik kroků zpět si pamatujeme
const HIST_KLIC = 'kng_rozpracovano_v1';   // klíč zálohy v úložišti prohlížeče
/* Značka „tuhle zálohu už jsem odložil" – uloží se razítko (kdy) té zálohy,
 * o které uživatel řekl „Teď ne". Dokud se záloha nezmění, lišta mlčí.
 * Bez toho se pojistka měnila v rituál: stejná otázka při každém spuštění,
 * na kterou se stejně vždycky klikalo „Teď ne". */
const HIST_ODLOZENO_KLIC = 'kng_rozpracovano_odlozeno_v1';
const HIST_PRODLEVA = 1200;                // ms klidu, než se záloha zapíše

const HIST = {
  posledni: null,     // JSON stavu po posledním renderu
  zpet: [],           // zásobník starších stavů
  znovu: [],          // zásobník vrácených stavů (pro „Znovu")
  probihaKrok: false, // právě přehráváme Zpět/Znovu – nezaznamenávat
  ulozenoJako: null,  // JSON stavu při posledním exportu/importu (pro varování)
  autoTimer: null,
  autoStav: '',       // text pod tlačítky (kdy se naposledy zazálohovalo)
};

/* ---------- úložiště prohlížeče s detekcí dostupnosti ---------- */
const Uloziste = (() => {
  let s = null, duvod = '';
  const zkus = jm => {
    try {
      const u = window[jm];
      const k = '__kng_test__';
      u.setItem(k, '1'); u.removeItem(k);
      return u;
    } catch (e) { return null; }
  };
  s = zkus('localStorage') || zkus('sessionStorage');
  if (!s) duvod = 'prohlížeč úložiště nepovolil (sandbox nebo přísné soukromí)';
  return {
    kDispozici() { return !!s; },
    duvod() { return duvod; },
    cti(k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } },
    zapis(k, v) { try { if (s) { s.setItem(k, v); return true; } } catch (e) { /* plná kvóta */ } return false; },
    smaz(k) { try { if (s) s.removeItem(k); } catch (e) {} },
  };
})();

/* ---------- vrstva 1: historie kroků ---------- */

/* Volá se na konci render(). Zjistí, jestli se stav změnil, a případně
 * ho zařadí do historie a naplánuje zálohu. */
function historieTik() {
  let ted;
  try { ted = JSON.stringify(ZAK); } catch (e) { return; }   // cyklus v datech = radši nic
  if (HIST.posledni === null) {                              // první render po startu
    HIST.posledni = ted;
    if (HIST.ulozenoJako === null) HIST.ulozenoJako = ted;
    historieTlacitka();
    return;
  }
  if (ted === HIST.posledni) { historieTlacitka(); return; }
  if (!HIST.probihaKrok) {
    HIST.zpet.push(HIST.posledni);
    if (HIST.zpet.length > HIST_MAX) HIST.zpet.shift();
    HIST.znovu.length = 0;      // nová změna zahazuje větev „Znovu"
  }
  HIST.posledni = ted;
  historieZalohaNaplanuj();
  historieTlacitka();
}

/* Nasadí daný stav zpět do aplikace. Prochází importZakazka(), aby se i na
 * starší otisk aplikovaly migrace schématu – jinak by „Zpět" mohlo vrátit
 * zakázku do podoby, které dnešní kód už nerozumí. */
function historieObnov(json) {
  HIST.probihaKrok = true;
  try {
    ZAK = importZakazka(JSON.parse(json));
    syncVarianta();
    HIST.posledni = JSON.stringify(ZAK);   // po migracích se otisk může lišit
    render();
  } catch (e) {
    alert('Krok se nepodařilo obnovit: ' + e.message);
  } finally {
    HIST.probihaKrok = false;
  }
  historieZalohaNaplanuj();
  historieTlacitka();
}

function historieZpet() {
  if (!HIST.zpet.length) return;
  const cil = HIST.zpet.pop();
  HIST.znovu.push(HIST.posledni);
  historieObnov(cil);
}
function historieZnovu() {
  if (!HIST.znovu.length) return;
  const cil = HIST.znovu.pop();
  HIST.zpet.push(HIST.posledni);
  historieObnov(cil);
}

/* Stav tlačítek + popisek zálohy. Tooltip říká, kolik kroků je k dispozici,
 * ať uživatel ví, jak hluboko může couvat.
 * Tlačítka Zpět/Znovu existují ve VÍCE kopiích (vrchní lišta + klouzající
 * lišta v Kalkulaci OCK a PROJ), proto se hledají podle třídy, ne podle id –
 * všechny kopie tak drží stejný stav. Kopie v kalkulacích se při každém
 * render() vykreslí znovu jako disabled a správný stav dostanou právě tady
 * (historieTik na konci render() volá tuhle funkci vždy). */
function historieTlacitka() {
  document.querySelectorAll('.jsHistZpet').forEach(bz => {
    bz.disabled = !HIST.zpet.length;
    bz.title = HIST.zpet.length
      ? 'Vrátit poslední změnu (Ctrl+Z) · k dispozici ' + HIST.zpet.length + ' kroků zpět'
      : 'Zatím není co vracet';
  });
  document.querySelectorAll('.jsHistZnovu').forEach(bn => {
    bn.disabled = !HIST.znovu.length;
    bn.title = HIST.znovu.length ? 'Vrátit zpět vrácenou změnu (Ctrl+Y)' : 'Není co obnovit';
  });
  const st = document.getElementById('autoStav');
  if (st) st.textContent = HIST.autoStav;
}

/* ---------- vrstva 2: automatická záloha do prohlížeče ---------- */

function historieZalohaNaplanuj() {
  if (!Uloziste.kDispozici()) return;
  if (HIST.autoTimer) clearTimeout(HIST.autoTimer);
  HIST.autoTimer = setTimeout(historieZalohaZapis, HIST_PRODLEVA);
}

function historieZalohaZapis() {
  if (!Uloziste.kDispozici()) return;
  HIST.autoTimer = null;
  const zaznam = {
    verze: 1,
    kdy: new Date().toISOString(),
    cislo: ZAK.cislo || '',
    nazevAkce: ZAK.nazevAkce || '',
    zakazka: HIST.posledni || JSON.stringify(ZAK),
  };
  /* Prázdná zakázka (bez čísla i názvu akce) nesmí tiše přepsat zálohu
   * s rozpracovanou prací – přesně to se dělo po obnovení stránky, kdy se
   * online přihlášení a načtení ceníku dotkly čerstvě založené zakázky
   * dřív, než uživatel v liště stihl kliknout „Obnovit rozpracovanou
   * kalkulaci". Pravidlo drží model (uloZalohaSmiPrepsat v uloziste.js). */
  if (typeof uloZalohaSmiPrepsat === 'function'
      && !uloZalohaSmiPrepsat(historieZalohaCti(), zaznam)) {
    HIST.autoStav = '⛁ záloha z dřívějška čeká na rozhodnutí v liště obnovy';
    historieTlacitka();
    return;
  }
  const ok = Uloziste.zapis(HIST_KLIC, JSON.stringify(zaznam));
  HIST.autoStav = ok
    ? '⛁ zálohováno ' + new Date().toLocaleTimeString('cs-CZ')
    : '⚠ zálohu se nepodařilo uložit (plné úložiště)';
  historieTlacitka();
}

function historieZalohaCti() {
  const txt = Uloziste.cti(HIST_KLIC);
  if (!txt) return null;
  try {
    const z = JSON.parse(txt);
    return z && z.zakazka ? z : null;
  } catch (e) { return null; }
}

/* Lišta „našel jsem rozpracovanou kalkulaci". Záměrně NIC neobnovuje sama:
 * kdyby se automaticky nahrála záloha, přepsala by práci někoho, kdo si
 * aplikaci otevřel jen tak. Rozhoduje uživatel.
 *
 * O TOM, JESTLI SE VŮBEC PTÁT, ROZHODUJE MODEL (uloZalohaRozhodni v uloziste.js),
 * ne tahle obrazovka. Důvod je praktický: pravidlo se tím dá otestovat bez
 * prohlížeče a platí stejně, ať se lišta zavolá odkudkoli. Mlčí se, když je
 * záloha prázdná, bez čísla i názvu akce, starší než týden (takové se rovnou
 * uklidí), shodná s právě otevřenou zakázkou nebo když ji uživatel odložil
 * a od té doby se nezměnila. */
function historieNabidniObnovu() {
  const z = historieZalohaCti();
  const el = document.getElementById('obnovaLista');

  let otevrena = '';
  try { otevrena = JSON.stringify(ZAK); } catch (e) { /* cyklus v datech – nevadí */ }
  const rozhodnuti = (typeof uloZalohaRozhodni === 'function')
    ? uloZalohaRozhodni(z, { ted: new Date().toISOString(), otevrena,
                             odlozeno: Uloziste.cti(HIST_ODLOZENO_KLIC) || '' })
    : { nabidnout: !!z, smazat: false };

  if (rozhodnuti.smazat) {
    Uloziste.smaz(HIST_KLIC);
    Uloziste.smaz(HIST_ODLOZENO_KLIC);
  }
  if (!rozhodnuti.nabidnout || !z || !el) return;

  const kdy = z.kdy ? new Date(z.kdy).toLocaleString('cs-CZ') : 'neznámo kdy';
  const co = [z.cislo, z.nazevAkce].filter(Boolean).join(' · ') || 'bez názvu';
  el.innerHTML = `<span>⛁ V prohlížeči je <b>rozpracovaná kalkulace</b> (${esc(co)}), naposledy uložená ${esc(kdy)}.
      Chcete ji obnovit?</span>
    <button class="primary" onclick="historieObnovZalohu()">Obnovit rozpracovanou kalkulaci</button>
    <button class="mini" onclick="historieZahodZalohu()">Zahodit zálohu</button>`;
  el.classList.add('zobraz');
}

/* „Teď ne" = zálohu si nechám, ale už se na ni neptej. Zapamatuje se razítko
 * odložené zálohy; jakmile vznikne novější (uživatel na něčem znovu dělá),
 * lišta se ozve zas – to už je nová informace, ne opakovaná otázka.
 * POZOR (zadání 19. 8. 2026): tlačítko „Teď ne" z lišty ZMIZELO – uživatel
 * má rozhodnout obnovit/zahodit, odkládání vedlo ke ztrátám práce. Funkce
 * zůstává pro model odložení (uloZalohaRozhodni s ctx.odlozeno) a testy. */
function historieOdlozZalohu() {
  const z = historieZalohaCti();
  if (z) Uloziste.zapis(HIST_ODLOZENO_KLIC, String(z.kdy || ''));
  historieSkryjListu();
}
function historieSkryjListu() {
  const el = document.getElementById('obnovaLista');
  if (el) el.classList.remove('zobraz');
}
function historieObnovZalohu() {
  const z = historieZalohaCti();
  if (!z) { historieSkryjListu(); return; }
  historieSkryjListu();
  HIST.zpet.length = 0; HIST.znovu.length = 0;   // obnova je nový výchozí bod
  historieObnov(z.zakazka);
  /* Záloha v prohlížeči mohla vzniknout dřív, než se připojila složka _DB –
   * pak v ní leží ceny i značka z prázdného sestavení. Srovnat ji s ceníkem,
   * který platí teď, je totéž, co se děje při otevření zakázky ze složky:
   * rozpracovaná nabídka se přepočte, vytištěná zůstane, jak byla.
   * (Do historieObnov() to nepatří – tudy chodí i krok zpět a ten musí vrátit
   * přesně ten stav, který uživatel opustil, ne ho přepočítat.) */
  if (typeof uloSrovnejSPlatnymCenikem === 'function') {
    const prep = uloSrovnejSPlatnymCenikem();
    if (prep && (prep.prepocteno || prep.znacky)) {
      if (typeof render === 'function') render();
      if (prep.prepocteno && typeof nabidkaStavTextBezpecne === 'function'
          && typeof uloPrepocetVeta === 'function')
        nabidkaStavTextBezpecne(uloPrepocetVeta(prep));
    }
  }
}
function historieZahodZalohu() {
  if (!confirm('Opravdu zahodit zálohu rozpracované kalkulace uloženou v prohlížeči?')) return;
  Uloziste.smaz(HIST_KLIC);
  Uloziste.smaz(HIST_ODLOZENO_KLIC);
  HIST.autoStav = '';
  historieSkryjListu();
  historieTlacitka();
}

/* Zakázka je bezpečně v databázi (nebo v souboru) – nouzová záloha v prohlížeči
 * tím ztratila smysl a uklidí se. Právě ona byla důvodem, proč se aplikace
 * ptala na „rozpracovanou kalkulaci" i po zakázkách dávno hotových: zápis do
 * úložiště nikdo nikdy nemazal. Ochrana práce se tím neztrácí – při první
 * další změně se záloha zapíše znovu (do 1,2 s). */
function historieZalohaHotovo() {
  Uloziste.smaz(HIST_KLIC);
  Uloziste.smaz(HIST_ODLOZENO_KLIC);
  if (HIST.autoTimer) { clearTimeout(HIST.autoTimer); HIST.autoTimer = null; }
  HIST.autoStav = '';
  historieSkryjListu();
  historieTlacitka();
}

/* ---------- vrstva 3: varování před odchodem ---------- */

/* Neuložené = od posledního exportu/importu do JSON se stav změnil.
 * Záloha v prohlížeči se za „uloženo" nepovažuje: je to pojistka, ne archiv. */
function historieNeulozeno() {
  if (HIST.ulozenoJako === null) return false;
  try { return JSON.stringify(ZAK) !== HIST.ulozenoJako; } catch (e) { return false; }
}
/* Volá se po „Uložit zakázku" a po načtení souboru – tehdy je stav na disku. */
function historieOznacUlozeno() {
  try { HIST.ulozenoJako = JSON.stringify(ZAK); } catch (e) {}
}

/* ---------- start ---------- */
function historieStart() {
  window.addEventListener('beforeunload', ev => {
    if (!historieNeulozeno()) return;
    ev.preventDefault();
    ev.returnValue = '';   // starší prohlížeče vyžadují i tohle
    return '';
  });

  // Ctrl+Z / Ctrl+Y (a Ctrl+Shift+Z). Uvnitř textového pole má přednost
  // nativní undo prohlížeče – jinak by se místo písmena vrátila celá změna.
  document.addEventListener('keydown', ev => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const a = document.activeElement;
    const vPoli = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    if (vPoli) return;
    const k = (ev.key || '').toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); historieZpet(); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); historieZnovu(); }
  });

  if (!Uloziste.kDispozici()) {
    HIST.autoStav = '';   // bez úložiště se o zálohách radši mlčí, než aby to strašilo
  } else {
    historieNabidniObnovu();
    // Poslední šance zapsat zálohu, když se stránka zavírá dřív, než doběhne timer.
    window.addEventListener('pagehide', () => { if (HIST.autoTimer) historieZalohaZapis(); });
  }
}
historieStart();
