/* ================= RUČNÍ PŘEPISY A JEJICH SIROTCI (#4) =================
 *
 * Kalkulace umožňuje u každého řádku ručně přepsat množství, jednotkovou cenu
 * a název. Tyhle přepisy se ukládají do zadání jako mapy klíčované PŮVODNÍM
 * názvem položky:
 *
 *   Z.mnozstviPrepis = { 'STATICKÉ POSOUZENÍ': 12 }
 *   Z.cenyPrepis     = { 'PRÁCE ZÁMEČNÍKA - OSTATNÍ (ATYP)': 950 }
 *   Z.nazvyPrepis    = { 'REŽIE KANCELÁŘE': 'Režie kanceláře a vedení' }
 *
 * Dokud se položka jmenuje stejně, funguje to dobře. Jakmile ale někdo položku
 * v ceníku (nebo v katalogu trvalých položek) přejmenuje, klíč přestane sedět:
 * přepis zůstane v datech, ale už se nikdy na nic nenaváže. Navenek to vypadá,
 * že se ruční úprava „ztratila" – a v souboru zakázky se hromadí balast, který
 * cestuje do všech dalších variant a exportů.
 *
 * Tenhle modul umí takové sirotky najít a uklidit. Záměrně NIC nemaže sám od
 * sebe: úklid je vždy vědomé rozhodnutí uživatele, protože sirotek může být
 * i dočasný (položka se do výpočtu nedostane kvůli jinému nastavení šachty).
 *
 * Zdroj pravdy o „živých" názvech je r.nazvyPolozek z engine.js – rejstřík
 * všech názvů, které při výpočtu vznikly, včetně položek, které se do výsledku
 * nakonec nedostaly (nevybrané příplatky, varianty pro druhý typ šachty).
 */

const PREPIS_MAPY = [
  { klic: 'mnozstviPrepis', popis: 'ruční množství' },
  { klic: 'cenyPrepis', popis: 'ruční jednotková cena' },
  { klic: 'nazvyPrepis', popis: 'přejmenování položky' },
];

/* Najde přepisy, jejichž klíč neodpovídá žádné položce aktuálního výpočtu.
 * Vrací pole { mapa, popis, klic, hodnota } seřazené tak, jak se má zobrazit. */
function prepisySirotci(z, nazvyPolozek) {
  const zive = new Set(nazvyPolozek || []);
  const out = [];
  PREPIS_MAPY.forEach(({ klic, popis }) => {
    const mapa = z && z[klic];
    if (!mapa || typeof mapa !== 'object') return;
    Object.keys(mapa).forEach(k => {
      if (zive.has(k)) return;
      out.push({ mapa: klic, popis, klic: k, hodnota: mapa[k] });
    });
  });
  return out;
}

/* Smaže konkrétní sirotky. Přijímá výstup prepisySirotci() nebo jeho podmnožinu,
 * takže jde uklidit i jen vybrané řádky. Vrací počet skutečně smazaných. */
function prepisyUklid(z, sirotci) {
  let n = 0;
  (sirotci || []).forEach(s => {
    const mapa = z && z[s.mapa];
    if (mapa && Object.prototype.hasOwnProperty.call(mapa, s.klic)) { delete mapa[s.klic]; n++; }
  });
  return n;
}

/* Přenese přepisy ze starého názvu na nový – použije se, když víme, že položka
 * byla jen přejmenovaná (typicky při přejmenování v ceníku). Existující přepis
 * pod novým názvem má přednost, aby se nepřepsalo něco, co uživatel zadal už
 * po přejmenování. Vrací počet přenesených záznamů. */
function prepisyPrejmenuj(z, staryNazev, novyNazev) {
  if (!z || !staryNazev || !novyNazev || staryNazev === novyNazev) return 0;
  let n = 0;
  PREPIS_MAPY.forEach(({ klic }) => {
    const mapa = z[klic];
    if (!mapa || !Object.prototype.hasOwnProperty.call(mapa, staryNazev)) return;
    if (!Object.prototype.hasOwnProperty.call(mapa, novyNazev)) { mapa[novyNazev] = mapa[staryNazev]; n++; }
    delete mapa[staryNazev];
  });
  return n;
}

/* Krátký lidský popis hodnoty přepisu do výpisu v UI. */
function prepisHodnotaText(s) {
  if (s.mapa === 'nazvyPrepis') return '→ „' + String(s.hodnota) + '"';
  if (s.mapa === 'cenyPrepis') return Math.round(+s.hodnota * 100) / 100 + ' Kč';
  return String(+s.hodnota);
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { PREPIS_MAPY, prepisySirotci, prepisyUklid, prepisyPrejmenuj, prepisHodnotaText };
