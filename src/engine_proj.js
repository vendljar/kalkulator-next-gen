/* ============================================================
 * KALKULÁTOR PROJ – výpočetní jádro projekčních prací
 * Zdroj: Kalkulator_projekce.xlsx (list STANDARDNÍ Kalkulace)
 * Sekce: hodiny×sazba + fixní položky + doprava (bez marže),
 * marže po sekcích, sleva/přirážka globální s možností přepisu
 * u jednotlivých sekcí (ve vzoru: Zaměření +30 %, Kolaudace +20 %).
 * ============================================================ */

/* PRÁZDNÉ SAZBY – ze stejného důvodu jako u DEFAULT_CENIK v engine.js
 * (tam je to rozepsané i s citací zadání z 30. 7. 2026). Skutečné hodinové
 * sazby a fixní ceny subdodávek leží ve `_program.json` ve složce `_DB`;
 * odtud je aplikace načte při spuštění a obsah tohoto objektu přepíše na
 * místě. Značky `ukazkove` a `prazdny` tím zmizí a červený pruh zhasne.
 * Zůstává jen struktura; `dph` je zákonná sazba, ne naše cena. */
const DEFAULT_CENIK_PROJ = {  // HODNOTY VYNULOVÁNY pro GitHub (pripravit_github.py) – reálné sazby jen v lokální záloze
  ukazkove: true,
  prazdny: true,
  dph: 0,                         // zákonná sazba DPH projekční části (nezávislá na ceníku OCK)
  marze: 0,                          // globální přirážka sekcí
  sazby: { projektant: 0, statik: 0, zamereni: 0 },
  dopravaKmKc: 0,                    // Kč/km
  dopravaPausalKc: 0,                // paušál mimo Prahu (po Praze 0)
  kurzEurKc: 0,                      // Kč/EUR — cizojazyčné dokumenty (#155); 0 = nenastaveno, tisk se zastaví
  fixy: {                            // fixní náklady po sekcích (Kč)
    pamatkari: 0,                    // PROJEDNÁNÍ STUDIE
    uzemniRozvoj: 0,
    pbr: 0,                          // DPZ
    studieOsvitu: 0,
    elektroDpz: 0,
    ic: 0,                           // IČ – inženýrská činnost
    elektroDps: 0,                   // DPS
    ezc: 0,                          // EZC
    kolaudace: 0,                    // KOLAUDACE (1 ks výtahu)
    geodet: 0,                       // GEODETICKÉ ZAMĚŘENÍ
  },
};

// Definice sekcí a položek (hodnoty hodin/fixů = výchozí z předlohy, vše editovatelné)
const DEFAULT_ZADANI_PROJ = {
  /* `slevaPct` tu do 12. 8. 2026 bývalo — globální sleva projekce zamíchaná
   * přímo do procenta každé sekce. Je pryč (#134): sleva projekce má vlastní
   * kartu se schvalováním jako sleva OCK a odečítá se až od hotové ceny.
   * Migrace v zakazka.js hodnotu ze starých zakázek převezme, aby se cena
   * nezměnila ani o korunu. */
  sekce: [
    /* Výchozí rozsah (oprava nedorozumění 18. 8. 2026): NÁKLADY ZŮSTÁVAJÍ —
     * zaměření si nese své hodiny (5 + 10) pořád, jen je ve výchozím stavu
     * VYŘAZENÉ (odškrtnuté): nová zakázka počítá s celou studií, která
     * zaměření obsahuje jako část 1, a separátní zaměření by se v nabídce
     * duplikovalo. Jedno kliknutí na sekční zaškrtávátko ho vrátí i s hodinami. */
    { key: 'zamereni', nazev: 'ZAMĚŘENÍ', doprava: { km: 0, pausal: 0 }, prirazkaPct: null,
      polozky: [
        { nazev: 'Zaměření', typ: 'hod', sazba: 'zamereni', hodiny: 5, rezerva: 0, vyrazeno: true },
        { nazev: 'Výstup', typ: 'hod', sazba: 'projektant', hodiny: 10, rezerva: 0, vyrazeno: true },
      ] },
    { key: 'studie', nazev: 'ST – STUDIE', prirazkaPct: null,
      polozky: [
        { nazev: 'Studie', typ: 'hod', sazba: 'projektant', hodiny: 24, rezerva: 0 },
        { nazev: 'Konzultace', typ: 'hod', sazba: 'projektant', hodiny: 4, rezerva: 0 },
      ] },
    { key: 'projednani', nazev: 'PROJEDNÁNÍ STUDIE', prirazkaPct: null,
      polozky: [
        { nazev: 'Památkáři', typ: 'fix', fixKey: 'pamatkari' },
        { nazev: 'Územní rozvoj', typ: 'fix', fixKey: 'uzemniRozvoj' },
      ] },
    { key: 'dpz', nazev: 'DPZ – DOKUMENTACE PRO POVOLENÍ ZÁMĚRU', doprava: { km: 0, pausal: 0 }, prirazkaPct: null,
      polozky: [
        { nazev: 'Projektová dokumentace pro DOSS', typ: 'hod', sazba: 'projektant', hodiny: 52, rezerva: 0 },
        { nazev: 'Projektová dokumentace pro SÚ', typ: 'hod', sazba: 'projektant', hodiny: 6, rezerva: 0 },
        { nazev: 'Statika', typ: 'hod', sazba: 'statik', hodiny: 6, rezerva: 0 },
        { nazev: 'PBŘ', typ: 'fix', fixKey: 'pbr' },
        { nazev: 'Studie osvitu (Praha 4 a 6)', typ: 'fix', fixKey: 'studieOsvitu' },
        { nazev: 'Elektro projekt', typ: 'fix', fixKey: 'elektroDpz' },
      ] },
    { key: 'ic', nazev: 'IČ – INŽENÝRSKÁ ČINNOST', prirazkaPct: null,
      polozky: [{ nazev: 'Inženýrská činnost', typ: 'fix', fixKey: 'ic' }] },
    { key: 'dps', nazev: 'DPS – DOKUMENTACE PRO PROVEDENÍ STAVBY', prirazkaPct: null,
      polozky: [
        { nazev: 'Projekt pro DPS – stavební část', typ: 'hod', sazba: 'projektant', hodiny: 48, rezerva: 0 },
        { nazev: 'Statika', typ: 'hod', sazba: 'statik', hodiny: 6, rezerva: 0 },
        { nazev: 'Elektro projekt', typ: 'fix', fixKey: 'elektroDps' },
      ] },
    { key: 'ezc', nazev: 'EZC – EKONOMICKÁ ZADÁVACÍ ČÁST (celý projekt)', prirazkaPct: null,
      polozky: [{ nazev: 'Ekonomická zadávací část', typ: 'fix', fixKey: 'ezc' }] },
    { key: 'kolaudace', nazev: 'KOLAUDACE (pro 1 ks výtahu)', doprava: { km: 0, pausal: 0 }, prirazkaPct: null,
      polozky: [{ nazev: 'Kolaudace', typ: 'fix', fixKey: 'kolaudace' }] },
    { key: 'geodet', nazev: 'GEODETICKÉ ZAMĚŘENÍ', prirazkaPct: null,
      polozky: [{ nazev: 'Geodetické zaměření', typ: 'fix', fixKey: 'geodet' }] },
  ],
};

/* Ruční přepis položky PROJ (#8, zadání z 30. 7. 2026).
 *
 * `cenaPrepis` a `sazbaPrepis` jsou hodnoty sjednané pro JEDNU zakázku.
 * Do ceníku nesahají — ten je společný všem zakázkám a přepsat ho kvůli
 * jedné stavbě znamená tiše posunout cenu i všem ostatním.
 *
 * Prázdno (undefined / null / '') znamená „přepis není" a hodnota se vezme
 * z ceníku. NULA je naopak platný přepis: „tuhle činnost děláme zdarma" je
 * legitimní ústupek a nesmí se tvářit jako nevyplněno. Proto se tu netestuje
 * pravdivost, ale prázdnota. */
function _prepisPlati(v) {
  /* #14 krok 2: pravidlo bydlí ve format.js; záložka pro samostatný Node běh */
  if (typeof prepisPlati === 'function') return prepisPlati(v);
  return !(v === undefined || v === null || v === '');
}

/* ---- přesun položky v rámci sekce (přetahování v kalkulaci PROJ) ----
 * V PROJ drží pořadí samo pole `polozky`: vypocetProj mapuje položky 1:1,
 * takže index v zadání a index ve výpočtu jsou tentýž řádek. (V OCK to takhle
 * nejde – tam se sekce skládá z ceníku a pořadí se vede zvlášť v Z.poradi.)
 * Sémantika je stejná jako u presunRadek v OCK: tažený řádek se vloží PŘED
 * ten, na který se pustí. Funkce nesahá na vstupní pole a vrací nové – díky
 * tomu jde otestovat bez prohlížeče a bez zbytku aplikace. */
function presunPolozku(polozky, from, to) {
  const out = Array.isArray(polozky) ? polozky.slice() : [];
  const cele = n => typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  if (!cele(from) || !cele(to)) return out;
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [x] = out.splice(from, 1);
  out.splice(to > from ? to - 1 : to, 0, x);
  return out;
}

function vypocetProj(zadani, cenik) {
  const c = cenik;
  /* SLEVA TU UŽ NENÍ (#134, 12. 8. 2026). Do 12. 8. 2026 se do každé sekce
   * přimíchávala „globální sleva projekce" ze zadání, takže sleva byla
   * zabudovaná uvnitř ceny a nešla z ní zpátky vyčíst. Nově se sleva
   * projekce — stejně jako u OCK — odečítá až od hotové ceny
   * (cenaNabidkyProj) a v nabídce i v krycím listu je vidět jako vlastní
   * řádek. Výpočet tedy zná jen náklady a přirážky. */

  const sekce = zadani.sekce.map(s => {
    const polozky = s.polozky.map(p => {
      /* Vyřazená položka zůstane v seznamu i s hodinami a cenou, jen se
       * nepočítá. Tím se liší od smazání: vrátí se jedním kliknutím a je
       * pořád vidět, co u téhle stavby nakonec neděláme a za kolik.
       * Vyřazení má přednost před přepisem — jinak by se položka s přepsanou
       * cenou dál počítala a nikdo by nechápal proč. */
      const vyrazeno = !!p.vyrazeno;

      if (p.typ === 'hod') {
        const hodiny = (+p.hodiny || 0) + (+p.rezerva || 0);
        const zCeniku = c.sazby[p.sazba] != null ? c.sazby[p.sazba] : (+p.sazbaKc || 0);
        const prepsana = _prepisPlati(p.sazbaPrepis);
        const sazba = prepsana ? (+p.sazbaPrepis || 0) : zCeniku;
        return { ...p, vyrazeno, hodinyCelkem: hodiny, sazbaKc: sazba,
                 sazbaZCeniku: zCeniku, sazbaPrepsana: prepsana,
                 naklad: vyrazeno ? 0 : hodiny * sazba };
      }
      // fixní položka: cena primárně z ceníku (fixy[fixKey]); vlastní položky mají cenu přímo
      const zCeniku = p.fixKey && c.fixy && c.fixy[p.fixKey] != null ? +c.fixy[p.fixKey] : (+p.cena || 0);
      const prepsana = _prepisPlati(p.cenaPrepis);
      const fix = prepsana ? (+p.cenaPrepis || 0) : zCeniku;
      return { ...p, vyrazeno, hodinyCelkem: 0, sazbaKc: null,
               cenaZCeniku: zCeniku, cenaPrepsana: prepsana,
               cenaEfekt: fix, naklad: vyrazeno ? 0 : fix };
    });
    const naklad = polozky.reduce((a, p) => a + p.naklad, 0);
    /* JEDNO PROCENTO SEKCE (#141, 13. 8. 2026 — oprava nálezu N1).
     *
     * Do 13. 8. 2026 tu byla procenta DVĚ: globální přirážka z ceníku
     * (naklad × c.marze) a k tomu ještě „vlastní % sekce", které se násobilo
     * NAD cenou s marží. Prázdné pole sekce přitom od 11. 8. znamenalo „vezmi
     * globální" — takže se globální přirážka započítala DVAKRÁT a nabídka
     * vyšla o desítky procent dráž.
     *
     * Rozhodnutí J. V. z 13. 8. 2026: „Přirážka má být globální přirážkou,
     * kterou máme ve výchozí hodnotě pro všechny položky, a následně je
     * upravitelná pro každou jednotlivou sekci." Procento je tedy JEDNO:
     * výchozí hodnota je globální přirážka z ceníku PROJ a sekce ji může
     * vlastním číslem PŘEPSAT (ne přidat navíc).
     *
     * „Prázdno není nula" platí dál: prázdné pole = globální přirážka,
     * vyplněná nula = „u téhle sekce nepřirážíme nic". */
    const pct = (s.prirazkaPct != null ? s.prirazkaPct / 100 : (+c.marze || 0));
    const marze = naklad * pct;
    const cena = naklad + marze;                      // nabídková cena sekce (bez dopravy)
    // Doprava: bez marže, přičítá se k ceně sekce (vzor: O12 = O8 + O11).
    // Příplatek „mimo Prahu" se od 17. 8. 2026 (rozhodnutí J. V.) POČÍTÁ ZE
    // VZDÁLENOSTI: km / 60 × 1000 Kč — tedy hodina cesty při 60 km/h à 1 000 Kč.
    // Pevný paušál z ceníku (dopravaPausalKc) do výpočtu nevstupuje: dvě
    // nezávislá čísla pro jednu jízdu by se nevyhnutelně rozcházela a delší
    // cesta má stát víc než kratší. Ruční Kč pole (s.doprava.pausal) zůstává
    // jako příplatek navíc — nesou ho staré zakázky a jejich cena se změnit nesmí.
    const km = s.doprava ? (+s.doprava.km || 0) : 0;
    const dopravaKc = s.doprava
      ? km * c.dopravaKmKc
        + (s.doprava.mimoPrahu ? km / 60 * 1000 : 0)
        + (+s.doprava.pausal || 0)
      : 0;
    const cenaSDopravou = cena + dopravaKc;
    /* Sleva se sem NEPLETE — odečítá se až od hotové ceny projekce
     * (cenaNabidkyProj). Přirážka říká, kolik si účtujeme; sleva kolik
     * z toho zákazníkovi odpustíme, a to je jiná otázka i jiný řádek
     * v nabídce. A doprava přirážku nenese — přeprodává se tak, jak stojí. */
    const celkem = cenaSDopravou;                     // celková cena sekce
    return { key: s.key, nazev: s.nazev, polozky, naklad, marze, cena, dopravaKc,
             cenaSDopravou, prirazkaPct: s.prirazkaPct == null ? null : s.prirazkaPct,
             pouzitePct: pct * 100, celkem };
  });

  const sum = f => sekce.reduce((a, s) => a + s[f], 0);
  return {
    sekce,
    souhrn: {
      naklad: sum('naklad'),
      marze: sum('marze'),             // přirážka v Kč (jedno procento, viz výše)
      doprava: sum('dopravaKc'),
      cena: sum('cenaSDopravou'),
      celkem: sum('celkem'),           // celková nabídková cena
    },
  };
}

if (typeof module !== 'undefined')
  module.exports = { vypocetProj, presunPolozku, DEFAULT_ZADANI_PROJ, DEFAULT_CENIK_PROJ };
