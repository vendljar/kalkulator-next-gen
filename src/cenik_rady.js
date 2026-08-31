/* ============================================================
 * ŘADY CENÍKU OCK — tuzemsko a zahraničí (#181, 31. 8. 2026)
 *
 * Zadání J. V.: „potřebovali bychom vytvořit paralelní zahraniční ceník pro
 * kalkulaci OCK, tzn. mít možnost na něj při kalkulaci přepnout, protože
 * některé položky mají do zahraničí jinou cenu."
 *
 * ZAHRANIČNÍ CENÍK JE TABULKA ODCHYLEK, NE DRUHÁ TABULKA.
 * Nese jen cesty, které se liší; co v něm není, se bere z tuzemského ceníku.
 * Druhá plná tabulka o třech stech řádcích by znamenala udržovat každé číslo
 * dvakrát — a při každé změně české ceny by hrozilo, že se na zahraniční
 * zapomene. Odchylek je dnes čtrnáct, ne tři sta.
 *
 * JEDNA VERZE PRO OBĚ ŘADY. Odchylky bydlí uvnitř téhož záznamu databáze
 * programu jako tuzemský ceník, takže mají společné číslo verze i otisk.
 * Dvě samostatná čísla by se dřív nebo později rozešla a u roční staré
 * nabídky by nešlo doložit, z jaké DVOJICE se počítalo.
 *
 * POLOŽKY, KTERÉ V TUZEMSKU NEJSOU (cestovní náklady a logistika, překlady
 * CZ→DE) nesou značku `jenZahr`. V tuzemské kalkulaci se nezobrazují vůbec —
 * ne že by se ukazovaly s nulou (rozhodnutí J. V. 31. 8. 2026). Značku
 * i cenu zadává administrátor v ceníku.
 *
 * KURZ JE SPOLEČNÝ pro obě řady (rozhodnutí J. V.): ceny se zadávají
 * v korunách a na eura se převádějí kurzem z ceníku, přesně jako dosud.
 * ============================================================ */

const CENIK_RADY = [
  { id: 'cr', nazev: 'ČR', popis: 'tuzemský ceník' },
  { id: 'zahr', nazev: 'Zahraničí', popis: 'zahraniční ceník' },
];

/* Neznámá hodnota = tuzemsko. Zakázka se nikdy nesmí tiše přepnout jinam. */
function cenikRadaPlatna(rada) { return String(rada) === 'zahr' ? 'zahr' : 'cr'; }
function cenikRadaNazev(rada) {
  const r = CENIK_RADY.find(x => x.id === cenikRadaPlatna(rada));
  return r ? r.nazev : 'ČR';
}
function cenikRadaPopis(rada) {
  const r = CENIK_RADY.find(x => x.id === cenikRadaPlatna(rada));
  return r ? r.popis : 'tuzemský ceník';
}

function cenikZahrPrazdny() { return { ceny: {}, jenZahr: {} }; }

/* Zahraniční odchylky, které PRÁVĚ PLATÍ — protějšek DEFAULT_CENIK.
 * Obsah se vyměňuje na místě (konfigNahradVMiste) při načtení databáze
 * programu, aby na objekt mohly držet odkaz i jiné části aplikace. */
const CENIK_ZAHR = { ceny: {}, jenZahr: {} };

/* Očista přijatých odchylek: jen známé cesty ceníku, jen čísla a texty.
 * Databáze programu leží na serveru a chodí do ní i soubor od uživatele —
 * cizí klíč by se jinak dostal až do výpočtu. */
function cenikZahrOciste(vstup) {
  const v = (vstup && typeof vstup === 'object') ? vstup : {};
  const out = cenikZahrPrazdny();
  const zname = (typeof cenikSledovane === 'function')
    ? new Set(cenikSledovane().map(p => p.cesta)) : null;
  const dovoleno = c => !zname || zname.has(c);
  Object.entries(v.ceny || {}).forEach(([c, h]) => {
    if (!dovoleno(c)) return;
    if (typeof h === 'number' && isFinite(h)) out.ceny[c] = h;
    else if (typeof h === 'string' && h.trim()) out.ceny[c] = h.trim().slice(0, 200);
  });
  Object.entries(v.jenZahr || {}).forEach(([c, b]) => { if (dovoleno(c) && b) out.jenZahr[c] = true; });
  return out;
}

function cenikZahrPrazdna(z) {
  return !z || (!Object.keys(z.ceny || {}).length && !Object.keys(z.jenZahr || {}).length);
}

/* ---------- složení ceníku pro danou řadu ---------- */

/* Vrací KOPII tuzemského ceníku s vtisknutými odchylkami. Kopie schválně:
 * ceník varianty je od začátku samostatný, aby dohodnutá cena v jedné
 * nabídce neovlivnila ostatní. Do výsledku se přibalí `rada` a `jenZahr`,
 * takže výpočet i obrazovka poznají, s čím pracují, aniž by se jim to
 * muselo předávat zvlášť. */
function cenikSlozRadu(cr, zahr, rada) {
  const r = cenikRadaPlatna(rada);
  const zaklad = JSON.parse(JSON.stringify(cr || {}));
  const z = cenikZahrOciste(zahr);
  zaklad.rada = r;
  zaklad.jenZahr = Object.assign({}, z.jenZahr);
  if (r !== 'zahr') return zaklad;
  Object.entries(z.ceny).forEach(([cesta, hodnota]) => {
    if (typeof cenikNastavHodnotu === 'function') cenikNastavHodnotu({ cenik: zaklad }, cesta, hodnota);
  });
  return zaklad;
}

/* Rozdíly mezi řadami pro dialog při přepnutí: [{cesta, popis, cr, zahr}].
 * Uživatel má PŘED přepnutím vidět, čeho se to dotkne — bez toho by se
 * cena zakázky změnila a nikdo by nevěděl proč. */
function cenikRadaRozdily(cr, zahr) {
  const z = cenikZahrOciste(zahr);
  const popisy = {};
  if (typeof cenikSledovane === 'function')
    cenikSledovane().forEach(p => { popisy[p.cesta] = p.popis; });
  const data = { cenik: cr || {} };
  return Object.keys(z.ceny).map(cesta => ({
    cesta,
    popis: popisy[cesta] || cesta,
    cr: (typeof cenikHodnota === 'function') ? cenikHodnota(data, cesta) : undefined,
    zahr: z.ceny[cesta],
    jenZahr: !!z.jenZahr[cesta],
  })).filter(r => r.jenZahr || String(r.cr) !== String(r.zahr));
}

/* ---------- přepnutí řady u varianty ----------
 * Mění se JEN ceníkové ceny na cestách, které se mezi řadami liší. Ručních
 * přepisů v zakázce (data.prepisy) ani zakázkových hodnot (přirážka, DPH —
 * viz CENIK_ZAKAZKOVE) se přepnutí nedotkne.
 * Vrací { rada, zmen, rozdily }. */
function cenikRadaPrepni(data, crDnesni, zahr, rada) {
  const r = cenikRadaPlatna(rada);
  const out = { rada: r, zmen: 0, rozdily: [] };
  if (!data) return out;
  const rozdily = cenikRadaRozdily(crDnesni, zahr);
  rozdily.forEach(rd => {
    const nova = (r === 'zahr') ? rd.zahr : rd.cr;
    if (nova === undefined) return;
    const ted = (typeof cenikHodnota === 'function') ? cenikHodnota(data, rd.cesta) : undefined;
    if (String(ted) === String(nova)) return;
    if (typeof cenikNastavHodnotu === 'function') cenikNastavHodnotu(data, rd.cesta, nova);
    out.zmen++;
    out.rozdily.push(Object.assign({ stara: ted, nova }, rd));
  });
  data.cenikRada = r;
  if (data.cenik && typeof data.cenik === 'object') {
    data.cenik.rada = r;
    data.cenik.jenZahr = Object.assign({}, cenikZahrOciste(zahr).jenZahr);
  }
  return out;
}

/* Řada varianty. Starší zakázky pole nemají — jsou tuzemské. */
function cenikRadaVarianty(data) {
  if (!data) return 'cr';
  if (data.cenikRada) return cenikRadaPlatna(data.cenikRada);
  return cenikRadaPlatna(data.cenik && data.cenik.rada);
}

if (typeof module !== 'undefined')
  module.exports = { CENIK_RADY, CENIK_ZAHR, cenikRadaPlatna, cenikRadaNazev, cenikRadaPopis,
                     cenikZahrPrazdny, cenikZahrOciste, cenikZahrPrazdna,
                     cenikSlozRadu, cenikRadaRozdily, cenikRadaPrepni, cenikRadaVarianty };
