/* ================= ARES – kdo se skrývá pod IČO (#10) =================
 * „Z ARES ukaž jaká firma se pod IČO skrývá a přidej volbu data přepsat po
 * potvrzení." (zadání z 30. 7. 2026)
 *
 * Tenhle soubor je záměrně BEZ sítě a bez DOM – jen čtení odpovědi a příprava
 * rozhodnutí. Stahování a panel žijí v `ui/ares_ui.js`. Důvod je praktický:
 * to, co se z odpovědi vyčte a co se z toho smí přepsat, se dá otestovat
 * v Node nad uloženou odpovědí, kdežto samotný `fetch` do rejstříku ne –
 * a právě mapování polí je to, co může tiše rozbít hlavičku nabídky.
 *
 * Nic se nepřepisuje samo. `aresRozdily()` vrátí seznam „takhle to je / takhle
 * to bude" a teprve na potvrzení sáhne UI po `aresPrepis()`. Údaj, který ARES
 * nezná, se do hlavičky nepropisuje ani jako prázdno – vygumovat ručně napsaný
 * kontakt jen proto, že rejstřík takové pole nevede, by byla škoda způsobená
 * pomocnou funkcí. */

const ARES_ZAKLAD = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';

/* Dotaz se sestaví jen pro IČO, které projde kontrolní číslicí – do rejstříku
 * nemá smysl posílat dotaz, o kterém dopředu víme, že skončí „nenalezeno". */
function aresUrl(ico) {
  if (typeof icoPlatne !== 'function' || !icoPlatne(ico)) return '';
  return ARES_ZAKLAD + icoNormalizuj(ico);
}

/* PSČ vede rejstřík jako číslo (17000). Na faktuře i v hlavičce se píše
 * s mezerou, tak ho tak i vracíme. */
function aresPsc(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, '');
  return /^\d{5}$/.test(s) ? s.slice(0, 3) + ' ' + s.slice(3) : s;
}

/* Adresa sídla. ARES posílá hotovou `textovaAdresa` – ta je pro dokument
 * nejlepší, protože ji skládá rejstřík sám a obsahuje i části obce. Když
 * chybí (starší nebo neúplné zápisy), složí se z dílů. */
function aresAdresa(sidlo) {
  const s = sidlo || {};
  if (s.textovaAdresa) return String(s.textovaAdresa).trim();
  const cd = s.cisloDomovni, co = s.cisloOrientacni;
  const cislo = [cd, co].filter(x => x != null && x !== '').join('/');
  const ulice = [s.nazevUlice || s.nazevObce || '', cislo].filter(Boolean).join(' ').trim();
  const obec = [aresPsc(s.psc), s.nazevObce || ''].filter(Boolean).join(' ').trim();
  return [ulice, obec].filter(Boolean).join(', ');
}

/* Odpověď rejstříku → to, co z ní potřebujeme. Vrací `null`, když v odpovědi
 * není ani název ani IČO – tedy když to zjevně není záznam o subjektu. */
function aresZpracuj(json) {
  const j = json || {};
  const nazev = String(j.obchodniJmeno || '').trim();
  const ico = String(j.ico || '').trim();
  if (!nazev && !ico) return null;
  const zanikla = !!j.datumZaniku;
  return {
    ico: ico,
    nazev: nazev,
    dic: String(j.dic || '').trim(),
    adresa: aresAdresa(j.sidlo),
    obec: String((j.sidlo || {}).nazevObce || '').trim(),
    zanikla: zanikla,
    datumZaniku: zanikla ? String(j.datumZaniku) : '',
    datumVzniku: String(j.datumVzniku || ''),
  };
}

/* Jednořádkové představení firmy pro panel: „ALZA.CZ a.s. · IČO 27074358 ·
 * Jankovcova 1522/53, …". Používá se i v protokolu, ať je v zápisu vidět,
 * co uživatel viděl na obrazovce v okamžiku potvrzení. */
function aresPopis(s) {
  if (!s) return '';
  return [s.nazev, s.ico ? 'IČO ' + s.ico : '', s.adresa].filter(Boolean).join(' · ');
}

/* Které údaje hlavičky umí ARES naplnit. Kontakt, číslo nabídky ani datum tu
 * schválně nejsou – rejstřík o nich nic neví. */
const ARES_POLE = [
  { klic: 'objednatel', label: 'Objednatel', z: s => s.nazev },
  { klic: 'adresaObjednatele', label: 'Sídlo objednatele', z: s => s.adresa },
  { klic: 'ico', label: 'IČO objednatele', z: s => s.ico },
  /* DIČ objednatele (19. 8. 2026): ARES ho vrací a smlouvy o dílo ho
   * potřebují ({{OBJEDNATEL_DIC}}). Prázdné DIČ (neplátce) se díky
   * aresRozdily přeskočí a nic nepřepíše. */
  { klic: 'dic', label: 'DIČ objednatele', z: s => s.dic },
];

/* Co by se změnilo. Prázdné údaje z rejstříku se přeskakují (viz hlavička
 * souboru), stejně jako pole, které už tutéž hodnotu má – seznam k potvrzení
 * má ukázat změny, ne opakovat, co je stejné.
 *
 * `nove: ''` se nikdy nevrací: kdyby ARES název neznal, znamenalo by potvrzení
 * vymazání objednatele z hlavičky. */
function aresRozdily(hlavicka, subjekt) {
  const h = hlavicka || {};
  if (!subjekt) return [];
  return ARES_POLE.map(p => {
    const nove = String(p.z(subjekt) || '').trim();
    const ted = String(h[p.klic] == null ? '' : h[p.klic]).trim();
    return { klic: p.klic, label: p.label, ted: ted, nove: nove };
  }).filter(r => r.nove !== '' && r.nove !== r.ted);
}

/* Zápis do hlavičky. Mění se jen to, co vrátily `aresRozdily` – funkce tedy
 * nemá vlastní názor na to, co je „bezpečné" přepsat, a UI ukazuje přesně
 * tentýž seznam, který se pak provede. Vrací počet změněných polí. */
function aresPrepis(hlavicka, subjekt) {
  const zmeny = aresRozdily(hlavicka, subjekt);
  zmeny.forEach(z => { hlavicka[z.klic] = z.nove; });
  return zmeny.length;
}

/* ---------- hlášky ----------
 * Rejstřík je cizí server a aplikace běží často z lokálního souboru, takže
 * „nepovedlo se" je normální stav, ne výjimka. Text proto vždycky říká i to,
 * co může uživatel udělat – ručně vyplnit hlavičku funguje pořád. */
function aresHlaska(stav, ico) {
  const i = ico ? ' (' + icoNormalizuj(ico) + ')' : '';
  if (stav === 'neplatne')
    return 'Zadané IČO neodpovídá kontrolní číslici – rejstřík by ho nenašel. Opravte překlep a zkuste to znovu.';
  if (stav === 'prazdne')
    return 'Nejdřív vyplňte IČO objednatele – podle něj se firma v rejstříku hledá.';
  if (stav === 'nenalezeno')
    return 'Rejstřík ARES pod tímto IČO' + i + ' žádný subjekt nevede. Zkontrolujte číslo; hlavičku můžete vyplnit i ručně.';
  if (stav === 'sit')
    return 'Na rejstřík ARES se teď nedá dosáhnout – aplikace běží bez připojení, nebo prohlížeč dotaz na cizí server zablokoval. '
      + 'Hlavička se tím nemění; údaje jde vyplnit ručně a zkusit to později.';
  return 'Dotaz do rejstříku ARES se nepovedl. Hlavička zůstává beze změny.';
}

if (typeof module !== 'undefined') module.exports = {
  ARES_ZAKLAD, ARES_POLE, aresUrl, aresPsc, aresAdresa, aresZpracuj,
  aresPopis, aresRozdily, aresPrepis, aresHlaska,
};
