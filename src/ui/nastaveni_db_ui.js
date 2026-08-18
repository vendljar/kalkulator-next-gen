/* ========== NASTAVENÍ VE SLOŽCE – prohlížečová část ==========
 *
 * Model (co se ukládá, obrana proti poškozenému souboru, otisk) je
 * v nastaveni_db.js a testuje se v Node. Tady je jen práce se složkou:
 * načtení `_nastaveni.json` při připojení a jeho přepsání, kdykoli
 * obsluha něco v Nastavení změní.
 *
 * PROČ SE UKLÁDÁ SE ZPOŽDĚNÍM
 * Jeden zápis do složky na Disku trvá kolem třetiny vteřiny. Psaní do
 * políčka firemních údajů by při ukládání po každém znaku znamenalo
 * desítky zápisů a viditelné škubání. Změna proto jen nahodí odpočet
 * (NASTDB_PRODLEVA) a zapisuje se, až se na chvíli přestane sahat.
 * Kdo chce jistotu hned, má v kartě tlačítko.
 *
 * PROČ SE PO ODPOJENÍ NIC NEVRACÍ
 * U ceníku se po odpojení složky vrací ceny ze sestavení – z cen se
 * počítají peníze a počítat z čísel, ke kterým aplikace nevidí zdroj,
 * je nebezpečné. Nastavení nic nepočítá; přepnout obsluze uprostřed
 * práce firmu na dokumentech a schovat půlku záložek jen proto, že se
 * odpojila složka, by bylo obtěžování bez užitku. Nastavení tedy
 * zůstane v paměti a jen se přestane ukládat.
 *
 * POŠKOZENÝ SOUBOR SE NEPŘEPÍŠE
 * Stejně jako u databáze programu: co se nedá přečíst, může být jediná
 * kopie. Aplikace to řekne a čeká na výslovný pokyn.
 * ========================================================= */

const NASTDB_PRODLEVA = 3000;   // ms klidu, než se změna zapíše

const NASTDB_STAV = {
  razitko: '',        // razítko souboru, jak jsme ho načetli (proti souběžnému zápisu)
  otisk: '',          // otisk naposledy zapsaného/načteného obsahu – ať nezapisujeme zbytečně
  chyba: '',          // soubor ve složce je, ale nedá se použít
  kolize: false,      // někdo jiný mezitím soubor přepsal
  hlaska: '',
  hlaskaTyp: '',      // '' | 'varovani' | 'chyba'
  pracuje: false,
  nacteno: false,     // proběhlo načtení ze složky (nebo zjištění, že soubor není)
  naplanovano: null,  // handle odpočtu
  /* #42 – zápis do složky selhal. Drží se to zvlášť od `hlaska`, protože
   * hláška zmizí s příští zprávou, kdežto tohle musí svítit, dokud se to
   * nespraví: dokud se soubor nezapíše, změny nikde nejsou a se zavřením
   * okna se ztratí. `neulozeno` je poslední připravený obsah – dá se
   * stáhnout a do složky nakopírovat ručně. */
  zapisSelhal: false,
  neulozeno: '',
};

function nastdbZprava(text, typ) {
  NASTDB_STAV.hlaska = text || '';
  NASTDB_STAV.hlaskaTyp = typ || '';
}

function nastdbSlozkaJede() {
  return typeof ULO_STAV !== 'undefined' && !!ULO_STAV.koren && !!ULO_STAV.pripraveno;
}

/* Kontext pro konfigurace.js. Katalog a šablony se sem schválně
 * nedávají – do souboru nepatří a nastdbOcisti() by je stejně vyhodil;
 * tohle je jen druhá pojistka na straně vstupu. */
function nastdbKontext() {
  return {
    NAST: (typeof NAST !== 'undefined') ? NAST : null,
    TS_C: (typeof TS_C !== 'undefined') ? TS_C : null,
    TECHSPEC_DEF: (typeof TECHSPEC_DEF !== 'undefined') ? TECHSPEC_DEF : null,
    build: (typeof buildVerze === 'function') ? buildVerze() : '',
    datum: new Date().toISOString().slice(0, 10),
    kdo: (typeof zamekKdo === 'function') ? zamekKdo() : '',
  };
}

/* ---------- načtení ze složky ---------- */

function nastdbNactiZeSlozky() {
  if (typeof uloCtiSoubor !== 'function' || !nastdbSlozkaJede())
    return Promise.resolve(false);
  return uloCtiSoubor(NASTDB_SOUBOR).then(text => {
    if (text == null) {
      // Soubor tam prostě není. Nastavení z paměti zůstává a při první
      // změně se založí – zakládat ho naprázdno hned po připojení by
      // znamenalo psát do cizí složky dřív, než o to někdo požádal.
      NASTDB_STAV.razitko = ''; NASTDB_STAV.chyba = ''; NASTDB_STAV.kolize = false;
      NASTDB_STAV.otisk = ''; NASTDB_STAV.nacteno = true;
      nastdbZprava('Ve složce zatím nastavení není – uloží se při první změně.');
      return false;
    }
    let db;
    try { db = nastdbNormalizuj(text); }
    catch (e) {
      // Nepoužije se a nepřepíše se. Viz hlavička.
      NASTDB_STAV.razitko = ''; NASTDB_STAV.otisk = '';
      NASTDB_STAV.chyba = (e && e.message) || 'neznámá chyba';
      NASTDB_STAV.kolize = false; NASTDB_STAV.nacteno = true;
      nastdbZprava('Nastavení ze složky se nepodařilo použít: ' + NASTDB_STAV.chyba
        + ' Platí nastavení z této relace a soubor zůstal beze změny.', 'varovani');
      return false;
    }
    let v;
    try { v = nastdbPouzij(db, nastdbKontext()); }
    catch (e) {
      NASTDB_STAV.chyba = (e && e.message) || 'neznámá chyba';
      NASTDB_STAV.nacteno = true;
      nastdbZprava('Nastavení ze složky se nepodařilo použít: ' + NASTDB_STAV.chyba, 'varovani');
      return false;
    }
    NASTDB_STAV.razitko = db.razitko || '';
    NASTDB_STAV.otisk = nastdbOtisk(db);
    NASTDB_STAV.chyba = ''; NASTDB_STAV.kolize = false; NASTDB_STAV.nacteno = true;
    nastdbZprava('Nastavení načteno ze složky – ' + nastdbSouhrn(db) + '.'
      + ((v && v.varovani && v.varovani.length) ? ' Pozor: ' + v.varovani.join('; ') : ''));
    return true;
  }).catch(e => {
    NASTDB_STAV.chyba = (e && e.message) || '';
    NASTDB_STAV.nacteno = true;
    nastdbZprava('Nastavení ze složky se nepodařilo přečíst: ' + NASTDB_STAV.chyba, 'varovani');
    return false;
  }).then(r => { if (typeof render === 'function') render(); return r; });
}

/* Odpojení složky. Nastavení zůstává v paměti, jen se přestane ukládat. */
function nastdbOdpoj() {
  if (NASTDB_STAV.naplanovano) { clearTimeout(NASTDB_STAV.naplanovano); NASTDB_STAV.naplanovano = null; }
  NASTDB_STAV.razitko = ''; NASTDB_STAV.otisk = ''; NASTDB_STAV.chyba = '';
  NASTDB_STAV.kolize = false; NASTDB_STAV.nacteno = false;
  nastdbZprava('');
}

/* ---------- zápis do složky ---------- */

/* vynutit = zapsat i přes kolizi nebo přes nečitelný soubor (jen po
 * výslovném kliknutí obsluhy). */
function nastdbUloz(vynutit) {
  if (NASTDB_STAV.naplanovano) { clearTimeout(NASTDB_STAV.naplanovano); NASTDB_STAV.naplanovano = null; }
  if (typeof uloZapisSoubor !== 'function' || !nastdbSlozkaJede()) return Promise.resolve(false);
  if (NASTDB_STAV.chyba && !vynutit) return Promise.resolve(false);
  if (NASTDB_STAV.kolize && !vynutit) return Promise.resolve(false);
  if (NASTDB_STAV.pracuje) { nastdbZmeneno(); return Promise.resolve(false); }

  let novy;
  try { novy = nastdbNovy(nastdbKontext()); }
  catch (e) { nastdbZprava('Nastavení se nepodařilo připravit k uložení: ' + (e && e.message), 'varovani'); return Promise.resolve(false); }
  const otisk = nastdbOtisk(novy);
  if (!vynutit && otisk === NASTDB_STAV.otisk) return Promise.resolve(false);   // není co zapisovat

  NASTDB_STAV.pracuje = true;
  // Souběžný zápis: mezi načtením a teď mohl soubor přepsat někdo jiný.
  // Razítko samo nestačí – když má jeho verze týž obsah, není o co se
  // přít a zbytečné hlášení by jen otravovalo.
  return uloCtiSoubor(NASTDB_SOUBOR).then(text => {
    if (!vynutit && text != null) {
      let naDisku = null;
      try { naDisku = nastdbNormalizuj(text); } catch (e) { naDisku = null; }
      if (naDisku && String(naDisku.razitko || '') !== NASTDB_STAV.razitko
          && nastdbOtisk(naDisku) !== NASTDB_STAV.otisk) {
        NASTDB_STAV.kolize = true;
        nastdbZprava('Nastavení ve složce mezitím změnil někdo jiný'
          + (naDisku.razitko ? ' (naposledy ' + String(naDisku.razitko).slice(0, 16).replace('T', ' ') + ')' : '')
          + '. Vaše změny se zatím neuložily – načtěte jeho verzi, nebo přepište svojí.', 'varovani');
        return false;
      }
      if (naDisku) NASTDB_STAV.razitko = String(naDisku.razitko || '');
    }
    return uloZapisSoubor(NASTDB_SOUBOR, JSON.stringify(novy, null, 1)).then(() => {
      NASTDB_STAV.razitko = novy.razitko || '';
      NASTDB_STAV.otisk = otisk;
      NASTDB_STAV.chyba = ''; NASTDB_STAV.kolize = false; NASTDB_STAV.nacteno = true;
      NASTDB_STAV.zapisSelhal = false; NASTDB_STAV.neulozeno = '';
      nastdbZprava('Nastavení uloženo do složky (' + nastdbSouhrn(novy) + ').');
      return true;
    });
  }).catch(e => {
    /* #42 – tohle je jediné místo, kde se změna nastavení může tiše ztratit.
     * Cesta ven je vždycky aspoň jedna: stáhnout soubor a nakopírovat ho do
     * _DB ručně, proto se obsah schová do NASTDB_STAV.neulozeno. */
    NASTDB_STAV.zapisSelhal = true;
    NASTDB_STAV.neulozeno = JSON.stringify(novy, null, 1);
    nastdbZprava('Nastavení se NEPODAŘILO uložit do složky: ' + ((e && e.message) || 'neznámá chyba')
      + ' Změny zatím nejsou nikde na disku a se zavřením okna se ztratí. '
      + 'Zkuste uložit znovu, nebo si soubor stáhněte a nakopírujte do složky _DB ručně.', 'chyba');
    return false;
  }).then(r => { NASTDB_STAV.pracuje = false; return r; });
}

/* Uložit bez čekání – tlačítko v kartě a testy. */
function nastdbUlozHned() {
  return nastdbUloz(false).then(r => { if (typeof render === 'function') render(); return r; });
}

/* Přepsat cizí verzi svojí – jen po kliknutí, s potvrzením. */
function nastdbPrepis() {
  if (!confirm('Přepsat nastavení ve složce tím, co je teď v aplikaci?\n\n'
    + 'Změny, které mezitím udělal někdo jiný, se ztratí.')) return Promise.resolve(false);
  return nastdbUloz(true).then(r => { if (typeof render === 'function') render(); return r; });
}

/* Zahodit svoje a vzít, co je ve složce. */
function nastdbZahod() {
  if (!confirm('Načíst nastavení ze složky a zahodit své neuložené změny?')) return Promise.resolve(false);
  NASTDB_STAV.kolize = false;
  return nastdbNactiZeSlozky();
}

/* #42 – záchranná cesta, když zápis do složky nejde. Stáhne přesně ten
 * obsah, který se nepodařilo zapsat, aby ho šlo do _DB nakopírovat ručně.
 * Není-li co (zatím se nic nezkoušelo), připraví se aktuální stav. */
function nastdbStahni() {
  let text = NASTDB_STAV.neulozeno;
  if (!text) {
    try { text = JSON.stringify(nastdbNovy(nastdbKontext()), null, 1); }
    catch (e) { nastdbZprava('Nastavení se nepodařilo připravit: ' + (e && e.message), 'chyba'); render(); return false; }
  }
  souborKeStazeni(NASTDB_SOUBOR, text);
  nastdbZprava('Soubor ' + NASTDB_SOUBOR + ' je ve Staženích. Nakopírujte ho do složky _DB '
    + '(přepsat stávající) a pak dejte „Načíst ze složky znovu".', 'varovani');
  render();
  return true;
}

/* Volá se ze všech setterů v Nastavení. Jen nahodí odpočet – vlastní
 * zápis přijde, až se na chvíli přestane sahat. */
function nastdbZmeneno() {
  if (!nastdbSlozkaJede()) return;
  if (NASTDB_STAV.chyba || NASTDB_STAV.kolize) return;   // čeká se na rozhodnutí obsluhy
  if (NASTDB_STAV.naplanovano) clearTimeout(NASTDB_STAV.naplanovano);
  NASTDB_STAV.naplanovano = setTimeout(() => {
    NASTDB_STAV.naplanovano = null;
    nastdbUloz(false).then(ok => { if (ok && typeof render === 'function') render(); });
  }, NASTDB_PRODLEVA);
}

/* ---------- karta v Nastavení ---------- */

function nastdbStavPopis() {
  if (!nastdbSlozkaJede())
    return 'Složka není připojená – nastavení platí jen pro tuto relaci a zavřením prohlížeče se ztratí. '
      + 'Připojit ji jde na záložce Zakázky.';
  if (NASTDB_STAV.chyba)
    return 'Soubor ' + NASTDB_SOUBOR + ' ve složce „' + ULO_STAV.jmeno + '" se nedá použít. '
      + 'Platí nastavení z této relace a soubor zůstal beze změny.';
  if (NASTDB_STAV.kolize)
    return 'Nastavení ve složce „' + ULO_STAV.jmeno + '" mezitím změnil někdo jiný. Vaše změny čekají.';
  if (!NASTDB_STAV.razitko)
    return 'Složka „' + ULO_STAV.jmeno + '" je připojená – nastavení se do ní uloží při první změně.';
  return 'Ukládá se do složky „' + ULO_STAV.jmeno + '", naposledy '
    + String(NASTDB_STAV.razitko).slice(0, 16).replace('T', ' ') + '.';
}

function nastdbBlok() {
  /* #150 (18. 8. 2026): složková databáze skončila — bez připojitelné složky
   * by karta jen mátla radou „Připojit ji jde na záložce Zakázky". */
  if (typeof ULO_SLOZKA_POVOLENA !== 'undefined' && !ULO_SLOZKA_POVOLENA) return '';
  const jede = nastdbSlozkaJede();
  const tlacitka = !jede ? '' : (NASTDB_STAV.kolize
    ? `<button class="primary" onclick="nastdbZahod()">Načíst verzi ze složky</button>
       <button onclick="nastdbPrepis()">Přepsat ji mojí</button>`
    : (NASTDB_STAV.chyba
      ? `<button onclick="nastdbNactiZeSlozky()">Zkusit načíst znovu</button>
         <button onclick="nastdbPrepis()">Založit soubor znovu</button>`
      : `<button onclick="nastdbUlozHned()" ${NASTDB_STAV.pracuje ? 'disabled' : ''}>Uložit teď</button>
         <button onclick="nastdbNactiZeSlozky()" ${NASTDB_STAV.pracuje ? 'disabled' : ''}>Načíst ze složky znovu</button>`))
    + (NASTDB_STAV.zapisSelhal
      ? `<button class="primary" onclick="nastdbStahni()">Stáhnout ${esc(NASTDB_SOUBOR)}</button>` : '');

  return `<div style="margin:0 0 14px;padding:10px;border:1px solid var(--line);border-radius:8px">
    <div style="font-weight:600;margin-bottom:4px">Nastavení ve složce</div>
    <div class="note" style="margin-top:0">${esc(nastdbStavPopis())}</div>
    ${NASTDB_STAV.hlaska ? `<div class="${zapisTridaHlasky(NASTDB_STAV.hlaskaTyp)}">${esc(NASTDB_STAV.hlaska)}</div>` : ''}
    ${tlacitka ? `<div class="btns" style="margin-top:8px">${tlacitka}</div>` : ''}
    <div class="note">Firemní údaje, uživatelé a role, viditelnost záložek, jazyk dokumentů, číselníky
      specifikace a slovník překladů se ukládají do souboru <code>${esc(NASTDB_SOUBOR)}</code> vedle zakázek.
      Ukládá se samo, chvíli po poslední změně. <b>Ceny, slevové stropy ani katalog tu nejsou</b> –
      ty jsou v <code>_program.json</code>, kde se verzují, aby šlo doložit, za co nabídka odešla.</div>
  </div>`;
}
