/* ============================================================
 * ARCHIV HISTORICKÝCH KALKULACÍ + ALTERNATIVNÍ NABÍDKA (#17)
 *
 * K čemu to je: zákazník se ozve po půl roce („udělejte nám to samé jako
 * loni na Hejtmánské, jen o dvě stanice víc"). Dosud se to řešilo tak, že
 * se stará zakázka načetla přes „Načíst" – jenže tím se z obrazovky ztratila
 * ta rozdělaná. Archiv umí totéž bez ztráty rozpracované práce: soubory se
 * jen NAHLÉDNOU, vyhledá se v nich konkrétní kalkulace a ta se přinese do
 * právě otevřené zakázky jako další varianta (alternativní nabídka).
 *
 * ODKUD SE BERE HISTORIE: z uložených souborů zakázek (JSON), které si
 * uživatel vybere. Server ani sdílené úložiště zatím nemáme (#11, #29),
 * takže žádný seznam „všech nabídek firmy" vzniknout nemůže a archiv
 * nepředstírá, že ho zná – vždycky ukazuje jen to, co bylo v této relaci
 * nahlédnuto, a říká to nahlas.
 *
 * PROČ SE ARCHIV NEUKLÁDÁ DO PROHLÍŽEČE: nesl by kompletní kalkulace
 * včetně nákladů a marží z cizích zakázek, tedy interní data, která by se
 * pak tiše hromadila na sdíleném počítači. Nahlédnutí je proto jednorázové
 * a s koncem relace zmizí. Až bude úložiště (#11/#29), stane se zdrojem ono.
 *
 * ALTERNATIVA = NOVÁ VARIANTA UVNITŘ OTEVŘENÉ ZAKÁZKY. Nezakládá novou
 * zakázku ani nepřepisuje hlavičku (číslo, objednatel patří té zakázce,
 * do které alternativu přinášíme). Číslování je ploché jako u klonu (#34):
 * alternativa dostane další volnou příponu .1, .2, .3 …
 *
 * Tenhle soubor je čistý model bez DOM. Vykreslení řeší ui/archiv_ui.js.
 * ============================================================ */

/* Sloupce přehledu archivu. „hledat" určuje, co spadne do fulltextu;
 * „typ" řídí řazení (stejné porovnání jako seznam kalkulací, #18). */
const ARCHIV_SLOUPCE = [
  { id: 'cislo',      popis: 'Číslo nabídky', typ: 'text',  hledat: true },
  { id: 'nazevAkce',  popis: 'Název akce',    typ: 'text',  hledat: true },
  { id: 'objednatel', popis: 'Objednatel',    typ: 'text',  hledat: true },
  { id: 'varianta',   popis: 'Varianta',      typ: 'text',  hledat: true },
  { id: 'stav',       popis: 'Stav',          typ: 'stav',  hledat: true },
  { id: 'odeslanoZa', popis: 'Odesláno za',   typ: 'cislo' },
  { id: 'datum',      popis: 'Datum zakázky', typ: 'text' },
  { id: 'soubor',     popis: 'Soubor',        typ: 'text',  hledat: true },
];

function archivSloupec(id) {
  return ARCHIV_SLOUPCE.find(s => s.id === id) || null;
}

/* Klíč záznamu. Skládá se z čísla nabídky a identity varianty, takže
 * načtení téhož souboru podruhé (nebo jeho novější verze) záznam nahradí
 * místo aby ho zdvojilo. */
function archivKlic(cislo, id) {
  return String(cislo || '') + '|' + String(id || '');
}

/* Kolik peněz z té nabídky doopravdy odešlo. Bere se z otisku zámku (#34),
 * ne z přepočtu – přepočet by dal dnešní ceny, kdežto tady jde o částku,
 * kterou zákazník tenkrát dostal na papíře. U rozpracované varianty žádná
 * taková částka neexistuje, a proto je null, ne nula. */
function archivOdeslanoZa(v) {
  const z = (v && v.zamek) || null;
  const o = (z && z.otisk) || null;
  const c = o ? o.celkemBezDph : null;
  return (typeof c === 'number' && isFinite(c)) ? c : null;
}

function archivStav(v) {
  return (typeof seznamStav === 'function') ? seznamStav(v)
    : ((v && v.zamek && v.zamek.zamceno) ? 'odeslana' : 'rozpracovana');
}

function archivNorm(s) {
  return (typeof seznamNorm === 'function') ? seznamNorm(s)
    : String(s == null ? '' : s).normalize('NFD')
        .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().trim();
}

/* Jeden záznam archivu = jedna varianta jedné zakázky, tedy přesně jedna
 * kalkulace. Data varianty se kopírují (hluboce), aby pozdější práce
 * s archivem nesahala do objektu, ze kterého se soubor načetl. */
function archivZaznam(zak, v, i, opts) {
  opts = opts || {};
  const cislo = (typeof variantaCislo === 'function') ? variantaCislo(zak, v)
    : String((zak && zak.cislo) || '');
  const stav = archivStav(v);
  const z = {
    klic: archivKlic(cislo, v.id),
    id: v.id,
    cislo,
    zakazkaCislo: String((zak && zak.cislo) || ''),
    nazevAkce: (zak && zak.nazevAkce) || '',
    adresa: (zak && zak.adresa) || '',
    objednatel: (zak && zak.objednatel) || '',
    kontakt: (zak && zak.kontakt) || '',
    datum: (zak && zak.datum) || '',
    varianta: v.nazev || '',
    zakaznik: v.zakaznik || '',
    pozn: v.pozn || '',
    stav,
    stavPopis: (typeof seznamStavPopis === 'function') ? seznamStavPopis(stav) : stav,
    odeslanoKdy: (v.zamek && v.zamek.kdy) || '',
    odeslanoZa: archivOdeslanoZa(v),
    soubor: opts.soubor || '',
    nahlednuto: opts.kdy || new Date().toISOString(),
    poradi: i || 0,
    data: JSON.parse(JSON.stringify(v.data || {})),
  };
  z.hledatelne = archivNorm(ARCHIV_SLOUPCE.filter(s => s.hledat)
    .map(s => s.id === 'stav' ? z.stavPopis : z[s.id]).join(' ')
    + ' ' + z.adresa + ' ' + z.zakaznik + ' ' + z.pozn);
  return z;
}

/* Vstupem je UŽ NORMALIZOVANÁ zakázka (prošlá importZakazka), aby archiv
 * nemusel znát formáty souborů ani migrace. */
function archivZaznamyZeZakazky(zak, opts) {
  if (!zak || !Array.isArray(zak.varianty)) return [];
  return zak.varianty.map((v, i) => archivZaznam(zak, v, i, opts));
}

/* Sloučení do archivu. Novější nahlédnutí přepíše starší záznam téhož
 * klíče – kdo soubor načte znovu, chce vidět jeho aktuální obsah. */
function archivPridej(archiv, zaznamy) {
  const out = Array.isArray(archiv) ? archiv.slice(0) : [];
  let pridano = 0, nahrazeno = 0;
  (zaznamy || []).forEach(z => {
    const i = out.findIndex(x => x.klic === z.klic);
    if (i >= 0) { out[i] = z; nahrazeno++; }
    else { out.push(z); pridano++; }
  });
  return { archiv: out, pridano, nahrazeno, celkem: out.length };
}

/* Odebrání celého souboru z nahlédnutých. Nic se nemaže na disku – jen se
 * přestane ukazovat to, co uživatel otevřel omylem. */
function archivOdeberSoubor(archiv, soubor) {
  const out = (archiv || []).filter(z => z.soubor !== soubor);
  return { archiv: out, odebrano: (archiv || []).length - out.length };
}

function archivSoubory(archiv) {
  const m = new Map();
  (archiv || []).forEach(z => m.set(z.soubor, (m.get(z.soubor) || 0) + 1));
  return [...m.entries()].map(([soubor, pocet]) => ({ soubor, pocet }));
}

/* ---------- hledání a řazení ------------------------------------------ */

function archivHledej(zaznamy, dotaz) {
  const slova = archivNorm(dotaz).split(/\s+/).filter(Boolean);
  if (!slova.length) return (zaznamy || []).slice(0);
  return (zaznamy || []).filter(z => slova.every(s => z.hledatelne.includes(s)));
}

function archivPorovnej(a, b, sl, smer) {
  if (typeof seznamPorovnej === 'function') return seznamPorovnej(a, b, sl, smer);
  const av = a[sl.id], bv = b[sl.id];
  if (sl.typ === 'cislo') {
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * smer;
  }
  return String(av || '').localeCompare(String(bv || ''), 'cs') * smer;
}

/* Výchozí řazení je od nejnovější zakázky – historickou kalkulaci hledá
 * člověk skoro vždycky mezi posledními, ne mezi prvními. */
function archivSerad(zaznamy, klic, smer) {
  const sl = archivSloupec(klic || 'datum');
  const s = smer < 0 ? -1 : 1;
  const out = (zaznamy || []).slice(0);
  if (!sl) return out;
  return out.sort((a, b) => archivPorovnej(a, b, sl, s)
    || String(a.cislo).localeCompare(String(b.cislo), 'cs')
    || (a.poradi - b.poradi));
}

/* Jeden vstupní bod pro UI. Kromě řádků vrací i to, co se musí uživateli
 * říct: kolik toho je celkem, kolik je vidět a z jakých souborů. */
function archivZobraz(archiv, opts) {
  opts = opts || {};
  const vsechny = (archiv || []).slice(0);
  const nalezene = archivHledej(vsechny, opts.hledat);
  const klic = archivSloupec(opts.klic) ? opts.klic : 'datum';
  const smer = (opts.klic ? opts.smer : -1) < 0 ? -1 : 1;
  return {
    radky: archivSerad(nalezene, klic, smer),
    celkem: vsechny.length,
    zobrazeno: nalezene.length,
    skryto: vsechny.length - nalezene.length,
    hledat: String(opts.hledat || ''),
    klic, smer,
    zuzeno: archivNorm(opts.hledat).length > 0,
    soubory: archivSoubory(vsechny),
    prazdny: vsechny.length === 0,
  };
}

/* ---------- alternativní nabídka --------------------------------------- */

/* Název alternativy. Neopakuje předponu („Alternativa – Alternativa – …")
 * a nedovolí dva stejné názvy v jedné zakázce, protože pak by se v seznamu
 * kalkulací nedalo poznat, která je která. */
function alternativaNazev(zak, nazev) {
  const zaklad = String(nazev || 'Varianta')
    .replace(/^(Alternativa|Kopie)(\s*\(\d+\))?\s*[–-]\s*/i, '').trim() || 'Varianta';
  const obsazene = new Set(((zak && zak.varianty) || []).map(v => archivNorm(v.nazev)));
  let navrh = 'Alternativa – ' + zaklad;
  let i = 2;
  while (obsazene.has(archivNorm(navrh))) { navrh = 'Alternativa (' + i + ') – ' + zaklad; i++; }
  return navrh;
}

/* Který ceník má alternativa použít.
 *
 * 'aktualni' (výchozí): převezme se zadání z historie, ale ceny se počítají
 *   dnešním ceníkem otevřené zakázky. To chce obchodník v devíti případech
 *   z deseti – nabídka jde ven dnes a musí být za dnešní náklady.
 * 'historicky': převezme se i ceník z archivu, tedy kalkulace vyjde 1:1 jako
 *   tenkrát. Má smysl při reklamaci, doobjednávce nebo když se dokládá,
 *   jak stará cena vznikla.
 *
 * Mlčky se nepřebírá ani jedno – tohle je přesně to místo, kde tiché
 * rozhodnutí vede ke špatné ceně v nabídce. */
const ARCHIV_CENIKY = {
  aktualni:   { popis: 'dnešní ceník otevřené zakázky' },
  historicky: { popis: 'ceník z archivované kalkulace' },
};

function archivCenikPopis(rezim) {
  const c = ARCHIV_CENIKY[rezim];
  return c ? c.popis : ARCHIV_CENIKY.aktualni.popis;
}

/* Přenese ceníky (OCK i PROJ) ze vzorové varianty do dat alternativy.
 * Zadání se nedotýká – právě to je ta historická kalkulace. */
function archivNahradCenik(data, vzor) {
  if (!data || !vzor) return data;
  if (vzor.cenik) data.cenik = JSON.parse(JSON.stringify(vzor.cenik));
  if (vzor.proj && vzor.proj.cenik) {
    if (!data.proj) data.proj = {};
    data.proj.cenik = JSON.parse(JSON.stringify(vzor.proj.cenik));
  }
  return data;
}

/* Založí alternativní nabídku z archivního záznamu jako další variantu
 * otevřené zakázky. Vrací novou variantu, nebo null, když nebylo z čeho. */
function vytvorAlternativu(zak, zaznam, opts) {
  opts = opts || {};
  if (!zak || !Array.isArray(zak.varianty) || !zaznam || !zaznam.data) return null;

  const rezim = ARCHIV_CENIKY[opts.cenik] ? opts.cenik : 'aktualni';
  const data = JSON.parse(JSON.stringify(zaznam.data));
  if (rezim === 'aktualni') {
    const vzor = opts.vzorCeniku
      || ((typeof aktivniVarianta === 'function' ? aktivniVarianta(zak) : zak.varianty[0]) || {}).data;
    archivNahradCenik(data, vzor);
  }

  const p = (typeof dalsiPriponaVarianty === 'function') ? dalsiPriponaVarianty(zak) : 1;
  const v = (typeof novaVarianta === 'function')
    ? novaVarianta(opts.nazev || alternativaNazev(zak, zaznam.varianta), data)
    : { id: 'v' + p, nazev: opts.nazev || alternativaNazev(zak, zaznam.varianta), data };
  v.zakaznik = zaznam.zakaznik || '';
  v.pozn = zaznam.pozn || '';
  v.pripona = p;
  v.ridici = false;
  v.zamek = null;
  /* Odkud alternativa přišla se musí dát dohledat i za rok: číslo původní
   * nabídky je jediné, co spojí dnešní variantu s papírem, který tenkrát
   * odešel zákazníkovi. */
  v.puvod = {
    cislo: zaznam.cislo,
    zakazka: zaznam.zakazkaCislo,
    nazevAkce: zaznam.nazevAkce,
    objednatel: zaznam.objednatel,
    varianta: zaznam.varianta,
    soubor: zaznam.soubor,
    cenik: rezim,
    kdy: opts.kdy || new Date().toISOString(),
  };

  zak.varianty.push(v);
  zak.priponaMax = p;
  if (opts.aktivovat !== false) zak.aktivni = v.id;
  return v;
}

/* Věta pro obrazovku i pro seznam kalkulací. Prázdný řetězec u varianty,
 * která z archivu nevznikla – volající pak nic nevypisuje. */
function puvodPopis(v) {
  const p = v && v.puvod;
  if (!p || !p.cislo) return '';
  const casti = ['převzato z nabídky ' + p.cislo];
  if (p.varianta) casti.push('varianta „' + p.varianta + '"');
  if (p.nazevAkce) casti.push(p.nazevAkce);
  if (p.soubor) casti.push('soubor ' + p.soubor);
  casti.push(p.cenik === 'historicky' ? 'počítáno historickým ceníkem' : 'přepočteno dnešním ceníkem');
  return casti.join(' · ');
}

if (typeof module !== 'undefined')
  module.exports = { ARCHIV_SLOUPCE, ARCHIV_CENIKY, archivSloupec, archivKlic,
                     archivOdeslanoZa, archivStav, archivNorm, archivZaznam,
                     archivZaznamyZeZakazky, archivPridej, archivOdeberSoubor,
                     archivSoubory, archivHledej, archivPorovnej, archivSerad,
                     archivZobraz, alternativaNazev, archivCenikPopis,
                     archivNahradCenik, vytvorAlternativu, puvodPopis };
