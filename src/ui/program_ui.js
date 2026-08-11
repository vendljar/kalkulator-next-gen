/* ========== DATABÁZE PROGRAMU – prohlížečová část ==========
 *
 * Model (verze, historie, obrana proti poškozenému souboru) je v
 * program.js a testuje se v Node. Tady je práce se složkou a obsluha:
 * načtení `_program.json`, jeho použití místo ceníku ze sestavení a
 * zveřejnění nové verze.
 *
 * JAK SE NAČTENÝ CENÍK POUŽIJE
 * Nepřepisují se odkazy, ale OBSAH objektů DEFAULT_CENIK, DEFAULT_CENIK_PROJ,
 * KATALOG a NAST.slevy. To je záměr: novaVariantaData() i cenikDnesniData()
 * se dívají právě do těchto objektů, takže výměnou obsahu se celý zbytek
 * aplikace – nové varianty, porovnání stáří ceníku (#35), přepočet – začne
 * řídit složkou, aniž by se v nich muselo cokoli měnit.
 *
 * CO SE PŘEPÍŠE A CO NE (zadání 31. 7. 2026)
 * Rozpracované varianty otevřené zakázky se novým platným ceníkem přepočítají
 * samy – ještě nikam neodešly a počítat v nich z neplatných cen je past, ne
 * doklad. Uzamčená (vytištěná = odeslaná) varianta se nepřepočítává nikdy a
 * zůstává ve stavu vytištění; nabídka musí jít i za rok vysvětlit cenami, za
 * které odešla. Variantu s potvrzením „ceny jsou dohodnuté" automatika
 * vynechá – to je vědomé rozhodnutí uživatele, ne opomenutí.
 *
 * KDO SMÍ PSÁT
 * Zveřejnit novou verzi smí jen správce. Záložky Ceník jsou beztak
 * viditelné jen jemu, ale kontrola je i tady – zápis do souboru, ze
 * kterého žijí ceny všech nabídek, si to zaslouží.
 * ========================================================= */

const PROG_STAV = {
  db: null,          // normalizovaná databáze ze složky (null = jedeme ze sestavení)
  razitko: '',       // razítko souboru, jak jsme ho načetli (proti souběžnému zápisu)
  chyba: '',         // soubor ve složce je, ale nedá se použít
  hlaska: '',
  hlaskaTyp: '',     // '' | 'varovani' | 'chyba'
  pracuje: false,
  detail: 0,         // číslo verze rozbalené v panelu
  /* #42 – zápis nové verze do složky selhal. `neulozeno` drží obsah, který
   * se nezapsal, aby šel stáhnout a do _DB nakopírovat ručně. */
  zapisSelhal: false,
  neulozeno: '',
};

/* Ceník ze sestavení. Uloží se dřív, než ho cokoli přepíše, aby bylo kam
 * se vrátit po odpojení složky – jinak by odpojení nechalo aplikaci s
 * cenami, ke kterým už nemá zdroj. */
const PROG_BUILD = {
  cenik: JSON.parse(JSON.stringify(typeof DEFAULT_CENIK !== 'undefined' ? DEFAULT_CENIK : {})),
  cenikProj: JSON.parse(JSON.stringify(typeof DEFAULT_CENIK_PROJ !== 'undefined' ? DEFAULT_CENIK_PROJ : {})),
  katalog: (typeof katalogPrazdny === 'function') ? katalogPrazdny() : null,
  slevy: JSON.parse(JSON.stringify((typeof NAST !== 'undefined' && NAST.slevy) || {})),
};

function progZprava(text, typ) {
  PROG_STAV.hlaska = text || '';
  PROG_STAV.hlaskaTyp = typ || '';
}

function progJede() { return !!(PROG_STAV.db && PROG_STAV.db.platny); }

/* Verze ceníku, která právě platí (#39). Razítko varianty si ji uloží, aby
 * u nabídky šlo i za rok říct, ze které verze počítala – ne jen co v ceníku
 * tehdy asi bylo. Bez načtené složky verze neexistuje a nic se nepředstírá:
 * ceník ze sestavení je prázdný a žádné číslo zveřejnění nemá. */
function progPlatnaVerzeInfo() {
  const p = PROG_STAV.db && PROG_STAV.db.platny;
  return p ? { verze: p.verze, platnoOd: p.platnoOd || '' } : { verze: null, platnoOd: '' };
}

/* ---------- použití verze v běžící aplikaci ---------- */

/* Rozpracované varianty otevřené zakázky srovnat s novým platným ceníkem.
 * Rozhodování, čeho se to týká, dělá `cenikPrepoctiRozpracovane` v
 * cenik_stari.js – tady se jen dodá, z čeho se počítá (dnešní ceník) a
 * čím se to orazítkuje (číslo zveřejněné verze + build). */
function progSrovnejNedotcene(verzeInfo) {
  if (typeof ZAK === 'undefined' || !ZAK || !Array.isArray(ZAK.varianty)) return 0;
  if (typeof cenikPrepoctiRozpracovane !== 'function'
    || typeof cenikDnesniData !== 'function') return 0;
  const r = cenikPrepoctiRozpracovane(ZAK, cenikDnesniData(), Object.assign(
    { build: (typeof buildVerze === 'function') ? buildVerze() : '' },
    verzeInfo || progPlatnaVerzeInfo()));
  /* Do počtu změn patří i samotné srovnání značky „tohle nejsou ostrá data".
   * Varianta spočítaná bez připojené složky má ceny i značku z prázdného
   * sestavení; když se pak složka připojí a ceny se shodou okolností nezmění
   * (třeba proto, že už je jednou načetla jiná cesta), nezměnilo by se nic –
   * a lišta by dál svítila „není z čeho počítat" nad hotovou nabídkou. */
  const n = r.prepocteno + r.orazitkovano + (r.znacky || 0);
  if (n && typeof syncVarianta === 'function') syncVarianta();
  return n;
}

/* Přepnutí aplikace na daný záznam. Katalog a slevy se berou, jen když je
 * verze opravdu nese – starší soubor je mít nemusí a nulovat kvůli tomu
 * katalog by byla tichá ztráta dat. */
function progPouzij(zaznam) {
  if (!zaznam) return;
  konfigNahradVMiste(DEFAULT_CENIK, zaznam.cenik || {});
  konfigNahradVMiste(DEFAULT_CENIK_PROJ, zaznam.cenikProj || {});
  /* Zveřejněný ceník je zmrazená kopie – ceník zveřejněný před 11. 8. 2026
   * nese tři fixní částky lešení místo jedné. Převedeme je hned po načtení,
   * jinak by fixní část lešení v celé aplikaci byla nula (viz engine.js). */
  if (typeof cenikMigraceLeseni === 'function') cenikMigraceLeseni(DEFAULT_CENIK);
  if (zaznam.katalog && typeof katalogImport === 'function') katalogImport(KATALOG, zaznam.katalog);
  if (zaznam.slevy && typeof NAST !== 'undefined' && NAST.slevy) {
    konfigNahradVMiste(NAST.slevy, zaznam.slevy);
    // starší platný ceník nese stropy pro čtyři role → převod (2. 8. 2026)
    if (typeof stropyMigruj === 'function' && NAST.slevy.stropy)
      NAST.slevy.stropy = stropyMigruj(NAST.slevy.stropy);
  }
  /* Verze se bere z použitého záznamu, ne z toho, co je zrovna platné –
   * kdyby se aplikace přepnula na starší verzi, razítko by jinak tvrdilo
   * číslo ceníku, ze kterého se nepočítá (#39). */
  progSrovnejNedotcene({ verze: zaznam.verze, platnoOd: zaznam.platnoOd || '' });
}

/* Návrat k ceníku ze sestavení – po odpojení složky. */
function progZpetNaBuild() {
  konfigNahradVMiste(DEFAULT_CENIK, PROG_BUILD.cenik);
  konfigNahradVMiste(DEFAULT_CENIK_PROJ, PROG_BUILD.cenikProj);
  if (PROG_BUILD.katalog && typeof katalogImport === 'function') katalogImport(KATALOG, PROG_BUILD.katalog);
  if (typeof NAST !== 'undefined' && NAST.slevy) konfigNahradVMiste(NAST.slevy, PROG_BUILD.slevy);
  /* Sestavení žádné číslo zveřejnění nemá – po odpojení složky se tedy
   * verze v razítku maže, ne zachovává. Tvrdit u prázdného ceníku verzi 3
   * by bylo horší než neříct nic. */
  progSrovnejNedotcene({ verze: null, platnoOd: '' });
}

/* ---------- načtení ze složky ---------- */

function progNactiZeSlozky() {
  if (typeof uloCtiSoubor !== 'function' || typeof ULO_STAV === 'undefined' || !ULO_STAV.koren)
    return Promise.resolve(false);
  return uloCtiSoubor(PROG_SOUBOR).then(text => {
    if (text == null) {
      PROG_STAV.db = null; PROG_STAV.razitko = ''; PROG_STAV.chyba = '';
      progZpetNaBuild();
      progZprava('Ve složce zatím databáze programu není – platí ceník ze sestavení aplikace.');
      return false;
    }
    let db;
    try { db = programNormalizuj(text); }
    catch (e) {
      // Vadný soubor se nepoužije, ale ani nepřepíše: ceny v něm můžou být
      // jediná kopie a přepsat je automaticky by bylo horší než nenačíst je.
      PROG_STAV.db = null; PROG_STAV.razitko = '';
      PROG_STAV.chyba = (e && e.message) || 'neznámá chyba';
      // Ceny z nečitelného souboru se dál nepoužívají: platí, co nese samo
      // sestavení. Jinak by aplikace počítala z ceníku, který nikdo nedoloží.
      progZpetNaBuild();
      progZprava('Databázi programu ve složce se nepodařilo použít: ' + PROG_STAV.chyba
        + ' Platí ceník ze sestavení aplikace a soubor zůstal beze změny.', 'varovani');
      return false;
    }
    PROG_STAV.db = db;
    PROG_STAV.razitko = db.razitko || '';
    PROG_STAV.chyba = '';
    progPouzij(db.platny);
    progZprava('Databáze programu načtena ze složky – ' + programPopisVerze(db.platny) + '.');
    return true;
  }).catch(e => {
    PROG_STAV.chyba = (e && e.message) || '';
    progZprava('Databázi programu se nepodařilo přečíst: ' + PROG_STAV.chyba, 'varovani');
    return false;
  }).then(v => { if (typeof render === 'function') render(); return v; });
}

/* Odpojení složky. Nic nemaže – jen se aplikace vrátí k cenám, které nese
 * sama, aby nepočítala z ceníku, ke kterému už nevidí zdroj. */
function progOdpoj() {
  PROG_STAV.db = null; PROG_STAV.razitko = ''; PROG_STAV.chyba = '';
  progZpetNaBuild();
  progZprava('');
}

/* ---------- zveřejnění nové verze ---------- */

/* Podklad pro novou verzi: ceník aktivní varianty. Ceny se upravují tam,
 * kde je vidět, co dělají s výslednou cenou – tedy v ceníku varianty – a
 * teprve hotová sada se zveřejní jako platná pro celý program. */
function progKontext(poznamka) {
  const v = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : null;
  const d = (v && v.data) || {};
  /* #40 – značka ukázkových dat se do souboru nezapisuje. Zveřejnit ceník
   * do složky je vědomé prohlášení, že ceny jsou skutečné; kdyby značka
   * prošla dál, červený pruh by svítil i nad pravdivými čísly. Bere se
   * kopie, ne originál – ceník varianty musí zůstat, jak byl. */
  const bez = o => (typeof ukazkoveBez === 'function') ? ukazkoveBez(o) : o;
  return {
    cenik: bez(d.cenik || {}),
    cenikProj: bez((d.proj && d.proj.cenik) || {}),
    katalog: (typeof katalogExport === 'function') ? katalogExport(KATALOG) : null,
    slevy: bez((typeof NAST !== 'undefined' && NAST.slevy) || null),
    build: (typeof buildVerze === 'function') ? buildVerze() : '',
    kdo: (typeof zamekKdo === 'function') ? zamekKdo() : '',
    poznamka: poznamka || '',
  };
}

function progZverejni() {
  if (!jeAdmin()) { progZprava('Zveřejnit ceník smí jen správce.', 'varovani'); render(); return Promise.resolve(false); }
  /* Pozn.: tady zůstává `jeAdmin()`, ne `smiZobrazit()`. Zveřejnění ceníku
   * hlídá i server (netlify/functions/program.mjs) a matice zobrazení ho má
   * proto vedený jako `pevny` — schovat tlačítko lze, přidělit právo ne. */
  if (typeof ULO_STAV === 'undefined' || !ULO_STAV.koren || !ULO_STAV.pripraveno) {
    progZprava('Nejdřív je potřeba připojit složku – databáze programu leží v ní, vedle zakázek.', 'varovani');
    render(); return Promise.resolve(false);
  }
  if (PROG_STAV.chyba) {
    if (!confirm('Databáze programu ve složce se nedá přečíst:\n\n' + PROG_STAV.chyba
      + '\n\nZaložit ji znovu od této verze? Původní soubor se přepíše a historie starších cen se ztratí.')) return Promise.resolve(false);
  }
  const ctx = progKontext('');
  if (PROG_STAV.db && programBezeZmeny(PROG_STAV.db, ctx)) {
    progZprava('Ceník této varianty se od platné verze neliší – není co zveřejňovat.');
    render(); return Promise.resolve(false);
  }
  const rozdily = PROG_STAV.db ? programRozdily(PROG_STAV.db, ctx) : [];
  const shrnuti = PROG_STAV.db
    ? (rozdily.length ? rozdily.length + ' změněných položek ceníku' : 'ceník beze změny, mění se katalog nebo slevy')
    : 'založení databáze programu ve složce';
  const pozn = prompt('Zveřejnit ceník aktivní varianty jako platný pro celý program?\n\n'
    + shrnuti + '.\nOd této chvíle z něj budou vycházet nové nabídky.\n'
    + 'Rozpracované nabídky se přepočítají samy, vytištěné (uzamčené) zůstanou beze změny.'
    + '\n\nČím se změna zdůvodňuje (nepovinné):', '');
  if (pozn === null) return Promise.resolve(false);
  ctx.poznamka = pozn;

  PROG_STAV.pracuje = true; render();
  // #42 – obsah, který se chystáme zapsat, si držíme i mimo řetěz slibů:
  // když zápis selže, musí být co nabídnout ke stažení.
  let pripraveno = '';
  // Souběžný zápis: mezi načtením a zveřejněním mohl soubor změnit někdo jiný.
  return uloCtiSoubor(PROG_SOUBOR).then(text => {
    let naDisku = null;
    if (text) { try { naDisku = JSON.parse(text); } catch (e) { naDisku = null; } }
    if (naDisku && String(naDisku.razitko || '') !== PROG_STAV.razitko) {
      if (!confirm('Databázi programu ve složce mezitím změnil někdo jiný'
        + (naDisku.razitko ? ' (naposledy ' + String(naDisku.razitko).slice(0, 16).replace('T', ' ') + ')' : '')
        + '.\n\nOK = zveřejnit přesto (jeho verze zůstane v historii)\nZrušit = nechat soubor být a nejdřív si ho načíst')) return false;
      // Navázat na to, co je na disku, ne na to, co máme v paměti – jinak by
      // se cizí verze z historie ztratila.
      try { PROG_STAV.db = programNormalizuj(naDisku); } catch (e) { /* nečitelné, zakládá se znovu */ }
    }
    const nova = programNovaVerze(PROG_STAV.db, ctx);
    pripraveno = JSON.stringify(nova, null, 1);
    return uloZapisSoubor(PROG_SOUBOR, pripraveno).then(() => {
      PROG_STAV.db = programNormalizuj(nova);
      PROG_STAV.razitko = PROG_STAV.db.razitko || '';
      PROG_STAV.chyba = '';
      PROG_STAV.zapisSelhal = false; PROG_STAV.neulozeno = '';
      progPouzij(PROG_STAV.db.platny);
      progZprava('Zveřejněno – platí ' + programPopisVerze(PROG_STAV.db.platny)
        + '. Starší verze zůstávají v souboru ' + PROG_SOUBOR + '.');
      return true;
    });
  }).catch(e => {
    /* #42 – ceník se nezapsal. Na rozdíl od nastavení tu nejde jen o
     * pohodlí: nová verze ceníku je jediná kopie právě zveřejněných cen
     * i s jejich zdůvodněním. Držíme ji, aby šla stáhnout. */
    if (pripraveno) { PROG_STAV.zapisSelhal = true; PROG_STAV.neulozeno = pripraveno; }
    progZprava('Ceník se NEPODAŘILO zapsat do složky: ' + ((e && e.message) || 'neznámá chyba')
      + (pripraveno
        ? ' Nová verze zatím není na disku a se zavřením okna se ztratí. Zkuste zveřejnit znovu, '
          + 'nebo si soubor stáhněte a nakopírujte do složky _DB ručně.'
        : ' Soubor ve složce zůstal beze změny.'), 'chyba');
    return false;
  }).then(v => { PROG_STAV.pracuje = false; render(); return v; });
}

/* #42 – stažení verze, kterou se nepodařilo zapsat. */
function progStahni() {
  if (!PROG_STAV.neulozeno) {
    progZprava('Není co stahovat – žádná nezapsaná verze ceníku nečeká.', 'varovani');
    render(); return false;
  }
  souborKeStazeni(PROG_SOUBOR, PROG_STAV.neulozeno);
  progZprava('Soubor ' + PROG_SOUBOR + ' je ve Staženích. Nakopírujte ho do složky _DB '
    + '(přepsat stávající) a pak dejte „Načíst ze složky znovu".', 'varovani');
  render();
  return true;
}

/* Převzetí starší verze do aktivní varianty. Nezveřejňuje – jen nasype
 * historické ceny do ceníku varianty, aby šlo spočítat, jak by nabídka
 * vypadala tehdy. Zveřejnit se dá až samostatným krokem. */
function progPrevezmiVerzi(cislo) {
  const z = programVerze(PROG_STAV.db, cislo);
  if (!z) return;
  const v = (typeof aktivniVarianta === 'function') ? aktivniVarianta(ZAK) : null;
  if (!v || !v.data) return;
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) {
    progZprava('Varianta je uzamčená jako odeslaná – ceník v ní se už nemění.', 'varovani');
    renderProgram(); return;
  }
  if (!confirm('Přepsat ceník aktivní varianty cenami z ' + programPopisVerze(z) + '?\n\n'
    + 'Zveřejněná platná verze se tím nemění – jen si spočítáte, jak by nabídka vyšla tehdy.')) return;
  konfigNahradVMiste(v.data.cenik, z.cenik || {});
  if (v.data.proj) konfigNahradVMiste(v.data.proj.cenik, z.cenikProj || {});
  /* Razítko jde s ceníkem, ne s tím, co je zrovna zveřejněné (#39). Kdyby
   * tady zůstalo staré číslo, varianta by počítala z verze 1 a u nabídky se
   * doložila verze 4 – přesně ta záměna, kvůli které se verze do razítka
   * zaváděla. */
  if (typeof cenikOznacJakoDnesni === 'function')
    cenikOznacJakoDnesni(v.data, {
      build: (typeof buildVerze === 'function') ? buildVerze() : '',
      verze: z.verze, platnoOd: z.platnoOd || '',
    });
  /* Dřívější „ceny jsou dohodnuté" platilo pro ceník, který ve variantě byl
   * do teď. Po výměně celého ceníku by jen tiše dusilo upozornění na rozdíl,
   * který nikdo neodkýval. */
  if (typeof cenikZrusKvitanci === 'function') cenikZrusKvitanci(v);
  v.upraveno = new Date().toISOString();
  if (typeof syncVarianta === 'function') syncVarianta();
  progZprava('Do aktivní varianty se převzal ceník: ' + programPopisVerze(z) + '.');
  zavriProgram();
  render();
}

/* ---------- karta na záložce Ceník ---------- */

function progStavPopis() {
  if (typeof ULO_STAV === 'undefined' || !ULO_STAV.koren)
    return 'Složka není připojená – platí ceník ze sestavení aplikace ('
      + ((typeof buildVerze === 'function' && buildVerze()) || 'aktuální build') + ').';
  if (PROG_STAV.chyba)
    return 'Soubor ' + PROG_SOUBOR + ' ve složce „' + ULO_STAV.jmeno + '" se nedá použít. Platí ceník ze sestavení.';
  if (!progJede())
    return 'Ve složce „' + ULO_STAV.jmeno + '" databáze programu zatím není – platí ceník ze sestavení aplikace.';
  return 'Složka „' + ULO_STAV.jmeno + '" · ' + programSouhrn(PROG_STAV.db);
}

function renderProgramKarta() {
  const jeSlozka = typeof ULO_STAV !== 'undefined' && !!ULO_STAV.koren && ULO_STAV.pripraveno;
  const tlacitka = !smiZobrazit('cenik.zverejnit') ? ''
    : `<button class="primary" onclick="progZverejni()" ${PROG_STAV.pracuje || !jeSlozka ? 'disabled' : ''}>Zveřejnit ceník této varianty jako platný</button>
       ${progJede() ? `<button onclick="otevriProgram()">Verze ceníku…</button>` : ''}
       ${jeSlozka ? `<button onclick="progNactiZeSlozky()">Načíst ze složky znovu</button>` : ''}
       ${PROG_STAV.zapisSelhal ? `<button onclick="progStahni()">Stáhnout ${esc(PROG_SOUBOR)}</button>` : ''}`;

  return card('Databáze programu (ceníky, ceny a náklady ve složce)',
    `<div class="note" style="margin-top:0">${esc(progStavPopis())}</div>
     ${PROG_STAV.hlaska ? `<div class="${zapisTridaHlasky(PROG_STAV.hlaskaTyp)}">${esc(PROG_STAV.hlaska)}</div>` : ''}
     <div class="btns" style="margin-top:10px">${tlacitka}</div>
     <div class="note">Ve složce vedle zakázek leží soubor <code>${esc(PROG_SOUBOR)}</code> s platným ceníkem OCK
       i PROJ, katalogem trvalých položek a slevovými stropy. Z něj vychází <b>každá nová nabídka</b>.
       Ceny se upravují v tabulce níž, tedy v ceníku otevřené varianty; teprve tlačítkem
       <b>Zveřejnit</b> se z nich stane platný ceník programu. <b>Rozpracované nabídky se tím přepočítají
       samy</b>, aby z neplatných cen nikdo neodeslal nabídku; <b>vytištěná (uzamčená) nabídka se nemění
       nikdy</b> a zůstává ve stavu, ve kterém odešla.
       Každé zveřejnění odloží dosavadní verzi do historie s datem, do kdy platila, takže i po roce
       jde doložit, za jaké ceny nabídka odešla.</div>`);
}

/* ---------- panel s historií verzí ---------- */

function otevriProgram() {
  PROG_STAV.detail = 0;
  renderProgram();
  const o = document.getElementById('program-overlay');
  if (o) o.style.display = 'flex';
}

function zavriProgram() {
  const o = document.getElementById('program-overlay');
  if (o) o.style.display = 'none';
}

function progDetailPrepni(cislo) {
  PROG_STAV.detail = (PROG_STAV.detail === cislo) ? 0 : cislo;
  renderProgram();
}

function progCastka(v) {
  return (typeof v === 'number') ? v.toLocaleString('cs-CZ') : String(v == null ? '—' : v);
}

/* Rozdíly proti následující (novější) verzi – tedy co se tehdy změnilo. */
function progRozdilyVerze(cislo) {
  if (!PROG_STAV.db || typeof cenikRozdily !== 'function') return [];
  const vse = [PROG_STAV.db.platny].concat(PROG_STAV.db.historie || []).filter(Boolean)
    .sort((a, b) => a.verze - b.verze);
  const i = vse.findIndex(z => +z.verze === +cislo);
  if (i <= 0) return [];
  return cenikRozdily(programData(vse[i - 1]), programData(vse[i]));
}

function progRadekHtml(z, platna) {
  const rozbaleno = PROG_STAV.detail === +z.verze;
  const rozdily = rozbaleno ? progRozdilyVerze(z.verze) : [];
  const tabulka = !rozbaleno ? '' : `<tr><td colspan="6" style="padding:0">
    <div style="padding:8px 10px">
      ${z.poznamka ? `<div class="note" style="margin-top:0">Zdůvodnění: ${esc(z.poznamka)}</div>` : ''}
      ${z.otiskNesedi ? `<div class="seznam-varovani">Pozor: otisk zapsaný v souboru (${esc(z.otiskNesedi)}) neodpovídá datům.
        Do souboru zřejmě někdo sáhl ručně mimo aplikaci.</div>` : ''}
      ${rozdily.length ? `<table class="sd-tbl"><thead><tr><th>Položka</th><th style="text-align:right">Předtím</th>
          <th style="text-align:right">Od této verze</th><th style="text-align:right">Změna</th></tr></thead><tbody>
        ${rozdily.map(r => `<tr><td style="text-align:left">${esc(r.popis || r.cesta)}</td>
          <td style="text-align:right;color:#6b7686">${esc(progCastka(r.stara))}</td>
          <td style="text-align:right;font-weight:600">${esc(progCastka(r.nova))}</td>
          <td style="text-align:right">${r.zmena == null ? '' : esc((r.zmena > 0 ? '+' : '') + Math.round(r.zmena * 1000) / 10 + ' %')}</td></tr>`).join('')}
        </tbody></table>`
        : `<div class="note">Proti předchozí verzi se nezměnila žádná sledovaná cena – šlo o změnu katalogu, slev nebo o první verzi.</div>`}
      ${smiZobrazit('cenik.zverejnit') ? `<div class="btns" style="margin-top:8px">
        <button class="mini" onclick="progPrevezmiVerzi(${+z.verze})">Převzít tento ceník do aktivní varianty</button></div>` : ''}
    </div></td></tr>`;

  return `<tr class="${platna ? 'aktivni' : ''}">
      <td>${z.verze}</td>
      <td style="text-align:left">${esc(typeof cenikDatumCz === 'function' ? cenikDatumCz(z.platnoOd) : z.platnoOd)}</td>
      <td style="text-align:left">${z.platnoDo ? esc(typeof cenikDatumCz === 'function' ? cenikDatumCz(z.platnoDo) : z.platnoDo) : '<b>platí</b>'}</td>
      <td style="text-align:left;white-space:normal">${esc(z.poznamka || '—')}</td>
      <td style="text-align:left">${esc(z.kdo || '')}${z.build ? ' · ' + esc(z.build) : ''}</td>
      <td><button class="mini" onclick="progDetailPrepni(${+z.verze})">${PROG_STAV.detail === +z.verze ? 'Skrýt' : 'Rozdíly'}</button></td>
    </tr>${tabulka}`;
}

function renderProgram() {
  const el = document.getElementById('program-panel');
  if (!el) return;
  const db = PROG_STAV.db;
  const radky = db ? [progRadekHtml(db.platny, true)]
    .concat((db.historie || []).map(z => progRadekHtml(z, false))).join('') : '';
  el.innerHTML = `<h2>Verze ceníku programu
      <span class="note" style="font-weight:400">${esc((typeof ULO_STAV !== 'undefined' && ULO_STAV.jmeno) || '')}</span>
      <button class="mini" style="margin-left:auto" onclick="zavriProgram()">Zavřít</button></h2>
    <div class="body">
      ${PROG_STAV.hlaska ? `<div class="${zapisTridaHlasky(PROG_STAV.hlaskaTyp)}">${esc(PROG_STAV.hlaska)}</div>` : ''}
      ${db ? `<table class="vartbl archtbl">
        <tr><th>Verze</th><th style="text-align:left">Platí od</th><th style="text-align:left">Do</th>
            <th style="text-align:left">Zdůvodnění</th><th style="text-align:left">Zapsal</th><th></th></tr>
        ${radky}</table>`
      : `<div class="seznam-prazdno">Databáze programu ve složce zatím není. Založí se prvním zveřejněním ceníku.</div>`}
      <div class="note">Historie není jen záznam – je to doklad. Nabídka odeslaná v březnu musí jít
        i za rok vysvětlit cenami, které tehdy platily, a proto se starší verze nepřepisují, ale odkládají.
        Tlačítkem <b>Rozdíly</b> se ukáže, co přesně se v dané verzi změnilo proti té předchozí.</div>
    </div>`;
}
