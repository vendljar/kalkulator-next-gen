/* ============================================================
 * SEZNAM KALKULACÍ – ŘAZENÍ, FILTR, HLEDÁNÍ, STAV, KOPIE (#18)
 *
 * Seznamem kalkulací je přehled variant uvnitř zakázky: každá varianta je
 * jedna kalkulace s vlastním číslem nabídky (#34) a vlastním stavem. Dokud
 * zakázek přibývalo po jedné, stačila prostá tabulka; jakmile ale zakázka
 * nese odeslané nabídky, jejich klony a rozpracované alternativy, je potřeba
 * se v tom umět vyznat – proto řazení, filtr podle stavu a fulltext.
 *
 * Tenhle soubor je čistý model bez DOM: dostane zakázku a spočítané ceny,
 * vrátí připravené řádky. Vykreslení a stav ovládacích prvků řeší
 * ui/seznam_ui.js. Rozdělení má praktický důvod – řazení a hledání se dají
 * otestovat v Node, a to je přesně ta část, kde se dělají tiché chyby
 * (české řazení, prázdné ceny, varianta odfiltrovaná i přesto, že je zrovna
 * otevřená).
 *
 * Nastavení pohledu (co se hledá, jak se řadí) SE NEUKLÁDÁ do zakázky.
 * Je to vlastnost okna, ne dat; uložené v JSON by putovalo mezi lidmi a
 * působilo, že se zakázce ztrácejí varianty.
 * ============================================================ */

/* Stav kalkulace. Vychází ze zámku (#34): vytištěná nabídka je odeslaná,
 * odemčená je ta, kterou správce po odeslání znovu otevřel – to je výjimka
 * a má být vidět. Vše ostatní je rozpracované. */
const SEZNAM_STAVY = {
  odeslana:     { popis: 'odeslaná',     znak: '🔒', poradi: 1 },
  odemcena:     { popis: 'odemčená',     znak: '🔓', poradi: 2 },
  rozpracovana: { popis: 'rozpracovaná', znak: '',   poradi: 3 },
};

function seznamStav(v) {
  if (typeof variantaUzamcena === 'function' ? variantaUzamcena(v) : !!(v && v.zamek && v.zamek.zamceno))
    return 'odeslana';
  if (v && Array.isArray(v.odemceni) && v.odemceni.length) return 'odemcena';
  return 'rozpracovana';
}

function seznamStavPopis(stav) {
  const s = SEZNAM_STAVY[stav];
  return s ? s.popis : String(stav || '');
}

/* Filtry jsou daný výčet, ne volný dotaz – uživatel má klikat, ne psát.
 * „Aktivní" (otevřená varianta) mezi nimi schválně není: filtr, po kterém
 * zbude jeden řádek, je k ničemu. */
const SEZNAM_FILTRY = [
  { id: 'vse',          popis: 'Všechny',       test: () => true },
  { id: 'rozpracovane', popis: 'Rozpracované',  test: r => r.stav === 'rozpracovana' },
  { id: 'odeslane',     popis: 'Odeslané 🔒',   test: r => r.stav === 'odeslana' },
  { id: 'odemcene',     popis: 'Odemčené 🔓',   test: r => r.stav === 'odemcena' },
  { id: 'ridici',       popis: 'Jen řídící',    test: r => !!r.ridici },
];

function seznamFiltr(id) {
  return SEZNAM_FILTRY.find(f => f.id === id) || SEZNAM_FILTRY[0];
}

/* Sloupce seznamu. „klic" je zároveň identifikátor pro řazení; sloupce bez
 * něj (přepínače, tlačítka) se v tabulce vykreslují, ale neřadí se podle
 * nich – proto tu nejsou. */
const SEZNAM_SLOUPCE = [
  { id: 'nazev',    popis: 'Název varianty',   typ: 'text',  hledat: true },
  { id: 'cislo',    popis: 'Číslo nabídky',    typ: 'text',  hledat: true },
  { id: 'stav',     popis: 'Stav',             typ: 'stav',  hledat: true },
  { id: 'zakaznik', popis: 'Zákazník',         typ: 'text',  hledat: true },
  { id: 'pozn',     popis: 'Poznámka',         typ: 'text',  hledat: true },
  { id: 'ock',      popis: 'Cena OCK bez DPH', typ: 'cislo' },
  { id: 'proj',     popis: 'Cena PROJ',        typ: 'cislo' },
  { id: 'celkem',   popis: 'Celkem',           typ: 'cislo' },
  { id: 'upraveno', popis: 'Změna',            typ: 'text' },
];

function seznamSloupec(id) {
  return SEZNAM_SLOUPCE.find(s => s.id === id) || null;
}

/* ---------- normalizace pro hledání ---------------------------------- */

/* Bez diakritiky a bez velkých písmen: obchodník hledá „hejtmanska", ne
 * „Hejtmánská". Rozdělení na slova znamená, že „opr 500" najde i řádek,
 * kde je mezi tím ještě něco jiného. */
function seznamNorm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function seznamSlova(dotaz) {
  return seznamNorm(dotaz).split(/\s+/).filter(Boolean);
}

/* ---------- řádky ------------------------------------------------------ */

/* ceny: objekt { <id varianty>: { ock, proj } } nebo funkce (v) => {ock, proj}.
 * Chybějící nebo nespočitatelná cena je null, ne 0 – nula je legitimní
 * výsledek a v řazení i v součtech se chová jinak než „neznámo". */
function seznamCena(x) {
  return (typeof x === 'number' && isFinite(x)) ? x : null;
}

function seznamRadek(zak, v, i, ceny) {
  const c = (typeof ceny === 'function' ? ceny(v) : (ceny && ceny[v.id])) || {};
  const ock = seznamCena(c.ock);
  const proj = seznamCena(c.proj);
  const stav = seznamStav(v);
  const cislo = (typeof variantaCislo === 'function') ? variantaCislo(zak, v) : String((zak && zak.cislo) || '');
  const r = {
    id: v.id,
    varianta: v,
    poradi: i,
    nazev: v.nazev || '',
    cislo,
    stav,
    stavPopis: seznamStavPopis(stav),
    zakaznik: v.zakaznik || '',
    pozn: v.pozn || '',
    ock, proj,
    celkem: (ock == null && proj == null) ? null : (ock || 0) + (proj || 0),
    upraveno: v.upraveno || '',
    ridici: !!v.ridici,
    aktivni: !!(zak && zak.aktivni === v.id),
    zamceno: stav === 'odeslana',
  };
  r.hledatelne = seznamNorm(SEZNAM_SLOUPCE.filter(s => s.hledat)
    .map(s => s.id === 'stav' ? r.stavPopis : r[s.id]).join(' '));
  return r;
}

function seznamRadky(zak, ceny) {
  return ((zak && zak.varianty) || []).map((v, i) => seznamRadek(zak, v, i, ceny));
}

/* ---------- hledání, filtr, řazení ------------------------------------ */

/* Všechna slova dotazu musí sedět (AND). Uživatel zužuje přidáváním slov –
 * to je chování, na které je zvyklý z vyhledávačů. */
function seznamHledej(radky, dotaz) {
  const slova = seznamSlova(dotaz);
  if (!slova.length) return radky.slice(0);
  return radky.filter(r => slova.every(s => r.hledatelne.includes(s)));
}

function seznamPouzijFiltr(radky, filtrId) {
  const f = seznamFiltr(filtrId);
  return radky.filter(r => f.test(r));
}

/* Prázdná cena patří vždy na konec, ať se řadí vzestupně nebo sestupně –
 * jinak by při sestupném řazení podle ceny vyplavaly nahoru řádky, které
 * cenu nemají, a zakryly to podstatné. Shoda se rozhoduje původním pořadím,
 * aby seznam při překlikávání „neposkakoval". */
function seznamPorovnej(a, b, sl, smer) {
  const av = a[sl.id], bv = b[sl.id];
  if (sl.typ === 'cislo') {
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * smer;
  }
  if (sl.typ === 'stav') {
    const ap = (SEZNAM_STAVY[av] || {}).poradi || 9;
    const bp = (SEZNAM_STAVY[bv] || {}).poradi || 9;
    return (ap - bp) * smer;
  }
  const as = String(av || ''), bs = String(bv || '');
  if (!as && !bs) return 0;
  if (!as) return 1;
  if (!bs) return -1;
  return as.localeCompare(bs, 'cs') * smer;
}

function seznamSerad(radky, klic, smer) {
  const sl = seznamSloupec(klic);
  const out = radky.slice(0);
  if (!sl) return out.sort((a, b) => a.poradi - b.poradi);
  const s = smer < 0 ? -1 : 1;
  return out.sort((a, b) => seznamPorovnej(a, b, sl, s) || (a.poradi - b.poradi));
}

function seznamPocty(radky) {
  const p = { vse: radky.length, rozpracovane: 0, odeslane: 0, odemcene: 0, ridici: 0 };
  radky.forEach(r => {
    if (r.stav === 'rozpracovana') p.rozpracovane++;
    else if (r.stav === 'odeslana') p.odeslane++;
    else if (r.stav === 'odemcena') p.odemcene++;
    if (r.ridici) p.ridici++;
  });
  return p;
}

/* Jeden vstupní bod pro UI. Kromě vlastních řádků vrací i to, co se musí
 * uživateli říct: kolik řádků je schovaných a jestli mu pohled neschoval
 * zrovna tu variantu, ve které pracuje (to je nejčastější zdroj zmatku –
 * vypadá to, že se kalkulace ztratila). */
function seznamZobraz(zak, ceny, opts) {
  opts = opts || {};
  const vsechny = seznamRadky(zak, ceny);
  let radky = seznamPouzijFiltr(vsechny, opts.filtr);
  radky = seznamHledej(radky, opts.hledat);
  radky = seznamSerad(radky, opts.klic, opts.smer);
  const aktivni = vsechny.find(r => r.aktivni) || null;
  return {
    radky,
    vsechny,
    celkem: vsechny.length,
    zobrazeno: radky.length,
    skryto: vsechny.length - radky.length,
    pocty: seznamPocty(vsechny),
    filtr: seznamFiltr(opts.filtr).id,
    hledat: String(opts.hledat || ''),
    klic: seznamSloupec(opts.klic) ? opts.klic : '',
    smer: opts.smer < 0 ? -1 : 1,
    zuzeno: !!(opts.hledat && seznamSlova(opts.hledat).length) || seznamFiltr(opts.filtr).id !== 'vse',
    aktivniSkryta: !!(aktivni && !radky.some(r => r.id === aktivni.id)),
    aktivniNazev: aktivni ? aktivni.nazev : '',
  };
}

/* ---------- kopie ------------------------------------------------------ */

/* Název kopie. Nechceme „Kopie – Kopie – Varianta 1", takže se předchozí
 * předpona odřízne, a nechceme dva stejné názvy v jednom seznamu, takže
 * druhá kopie téhož dostane pořadové číslo. */
function seznamKopieNazev(zak, nazev) {
  const zaklad = String(nazev || 'Varianta').replace(/^Kopie(\s*\(\d+\))?\s*[–-]\s*/i, '').trim() || 'Varianta';
  const obsazene = new Set(((zak && zak.varianty) || []).map(v => seznamNorm(v.nazev)));
  let navrh = 'Kopie – ' + zaklad;
  let i = 2;
  while (obsazene.has(seznamNorm(navrh))) { navrh = 'Kopie (' + i + ') – ' + zaklad; i++; }
  return navrh;
}

if (typeof module !== 'undefined')
  module.exports = { SEZNAM_STAVY, SEZNAM_FILTRY, SEZNAM_SLOUPCE,
                     seznamStav, seznamStavPopis, seznamFiltr, seznamSloupec,
                     seznamNorm, seznamSlova, seznamRadek, seznamRadky,
                     seznamHledej, seznamPouzijFiltr, seznamSerad, seznamPorovnej,
                     seznamPocty, seznamZobraz, seznamKopieNazev };
