/* ============================================================
 * ZAKÁZKA A VARIANTY – datový model + serializace
 * Zakázka (číslo CN) má N variant; každá varianta nese kompletní
 * stav: zadání OCK, ceník, techn. specifikaci i kalkulaci PROJ.
 * Právě jedna varianta je „řídící“ (aktuálně platná).
 *
 * Ukládání: zatím JSON soubor (StorageAdapter 'file'). Rozhraní je
 * připravené pro budoucí backendy (Google Sheets / server+SQLite /
 * Pipedrive) – stačí implementovat save/load/list se stejným tvarem dat.
 * ============================================================ */

const ZAKAZKA_SCHEMA = 2;

function novaVariantaData() {
  return {
    ock: { zadani: JSON.parse(JSON.stringify(DEFAULT_ZADANI)), fixes: false },   // výchozí režim: 1:1 jako Excel
    cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK)),
    proj: { zadani: JSON.parse(JSON.stringify(DEFAULT_ZADANI_PROJ)),
            cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)) },
    techspec: JSON.parse(JSON.stringify(DEFAULT_TECHSPEC)),
    kryci: { hodnoty: {} },   // krycí list objednávky/SoD – ruční pole (prefill z kalkulace/techspec)
    kryciProj: { hodnoty: {} },   // krycí list zakázky PROJ – ruční pole (prefill z Kalkulace PROJ)
    // #38: obchodní zaokrouhlení se nové variantě dosazuje ROVNOU, aby šlo
    // poznat zakázku uloženou před #38 (té pole chybí a zůstane vypnuté).
    // Od 4. 8. 2026 má každá část nabídky vlastní nastavení: zaokr = výtahová
    // šachta (OCK), zaokrProj = projekční práce. Obě začínají stejně, ale
    // obchodník je může vést zvlášť – přesně jako slevu a sazbu DPH.
    zaokr: (typeof zaokrDefault === 'function') ? zaokrDefault() : { krok: 100, smer: 'nahoru' },
    zaokrProj: (typeof zaokrDefault === 'function') ? zaokrDefault() : { krok: 100, smer: 'nahoru' },
  };
}

let _varCounter = 0;
function novaVarianta(nazev, data) {
  const ted = new Date().toISOString();
  return { id: 'v' + Date.now().toString(36) + (_varCounter++).toString(36),
           nazev: nazev || 'Varianta 1', zakaznik: '', pozn: '', ridici: false,
           vytvoreno: ted, upraveno: ted,
           data: data || novaVariantaData() };
}

/* Předloha čísla nabídky – obchodník k ní dopisuje pořadové číslo. Dokud v ní
 * žádné není, není to vyplněná hodnota (viz hlavickaVyplneno níže): v krycím
 * listu PROJ by se jinak místo skutečného čísla z hlavičky OCK ukazoval holý
 * útržek „2026 - OPR - CN - “ a na dokumentu to vypadá jako chybějící číslo. */
const ZAK_CISLO_PREDLOHA = '2026 - OPR - CN - ';

function novaZakazka() {
  const v = novaVarianta('Varianta 1');
  v.ridici = true;
  return {
    schema: ZAKAZKA_SCHEMA,
    cislo: ZAK_CISLO_PREDLOHA,
    nazevAkce: '', adresa: '', objednatel: '', kontakt: '',
    /* Zakázka jen projekce (2. 8. 2026): projekce se někdy prodává samostatně.
     * Příznak vypíná hlídání a porovnávání části OCK; data OCK zůstávají,
     * jen se nikam nepočítají. */
    jenProj: false,
    // IČO objednatele (zadání z 30. 7. 2026). V hlavičce stojí hned za kontaktní
    // osobou. Je to jediný údaj, kterým se objednatel dá jednoznačně určit –
    // název firmy se píše pokaždé jinak („Stavby s.r.o." / „STAVBY s. r. o.").
    // Odsud ho bere krycí list a odsud si ho vezme i dotažení z ARES (#10).
    ico: '',
    // KL-2: adresa stavby (`adresa`) a sídlo objednatele jsou dvě různé věci –
    // developer sídlí v Praze a staví v Ostravě. Krycí list potřebuje obě.
    // Prázdné = sídlo se neuvádí; nikdy se sem nedosazuje adresa stavby.
    adresaObjednatele: '',
    popisZameru: '',            // úvodní odstavec cenové nabídky PROJ (OVP-CN)
    // Úvodní fotka cenové nabídky OCK (data URL, aby se přenesla se zakázkou)
    uvodniFoto: '', uvodniFotoNazev: '', uvodniFotoPopis: '',
    datum: new Date().toISOString().slice(0, 10),
    // Hlavička nabídky PROJ je VĚDOMĚ oddělená od hlavičky OCK: projekční část
    // má vlastní číslo nabídky, jinou náplň i jiného objednatele. Nic se mezi
    // nimi nepropisuje automaticky – přenos je jen na výslovné vyžádání
    // (zakazkaKopirujHlavicku / tlačítka u karty „Zakázka – hlavička PROJ" v
    // Přehledu cenových nabídek; z lišty kalkulací zmizela 5. 8. 2026).
    projHlavicka: {
      cislo: ZAK_CISLO_PREDLOHA,
      nazevAkce: '', adresa: '', objednatel: '', kontakt: '',
      ico: '', adresaObjednatele: '',
      datum: new Date().toISOString().slice(0, 10),
    },
    varianty: [v],
    aktivni: v.id,
  };
}

/* ---------- hlavička OCK vs. hlavička PROJ: dvě nezávislé sady ----------
 * Obě sady mají stejná pole. OCK sedí přímo na zakázce (zak.cislo, …) kvůli
 * zpětné kompatibilitě uložených souborů, PROJ v zak.projHlavicka. */
/* ---------- úvodní fotka do dokumentu (11. 8. 2026) ----------
 *
 * Fotka se do zakázky nahrává už dřív a v online náhledu nabídky se ukazuje.
 * Do Wordu se ale nedostala — šablona měla na titulní straně natvrdo vloženou
 * fotografii jednoho konkrétního domu, takže KAŽDÁ nabídka odcházela s cizí
 * stavbou na první straně.
 *
 * Tohle je jediné místo, kde se skládá, co z fotky jde do dokumentu:
 * obrázek pod symbolem {{UVODNI_FOTO}} (vymění se za tvar v šabloně stejně
 * jako podpis) a k němu dva textové symboly, které si jde do šablony dopsat
 * kamkoli. Když fotka není nahraná, vrací se prázdno — a docxgen tvar ze
 * šablony odstraní. To je schválně: nabídka bez fotky je lepší než nabídka
 * s fotkou cizího objektu. */
function uvodniFotoObrazky(zak) {
  const f = (zak && zak.uvodniFoto) || '';
  return f ? { UVODNI_FOTO: f } : {};
}
function uvodniFotoSymboly(zak) {
  const z = zak || {};
  return {
    UVODNI_FOTO_NAZEV: String(z.uvodniFotoNazev || ''),
    UVODNI_FOTO_POPIS: String(z.uvodniFotoPopis || ''),
  };
}

const ZAK_HLAVICKA_POLE = ['cislo', 'nazevAkce', 'adresa', 'adresaObjednatele',
  'objednatel', 'kontakt', 'ico', 'datum'];

/* ---------- IČO objednatele ----------
 * Kontrolní číslice, ne délka. Osmimístné číslo s překlepem vypadá jako IČO
 * a projde přes každou kontrolu, která počítá jen znaky – teprve modulo 11
 * pozná, že takové IČO neexistuje. Používá to kontrola zadání (#33) a bude to
 * potřebovat i dotažení firmy z ARES (#10), aby se do rejstříku neposílal
 * dotaz, o kterém dopředu víme, že nemůže dopadnout.
 *
 * Lidé IČO píšou s mezerami („000 00 000"), tak jak ho vidí na faktuře –
 * mezery se proto zahazují, ne trestají. Nic jiného se ale netoleruje:
 * „CZ12345678" je DIČ, ne IČO, a tiché uříznutí prefixu by ze špatně
 * vyplněného pole udělalo správně vyplněné. */
function icoNormalizuj(v) {
  return String(v == null ? '' : v).replace(/\s+/g, '');
}

/* Napsal do pole vůbec někdo něco? (prázdné IČO není chyba – nabídka odchází
 * často dřív, než je objednatel potvrzený) */
function icoVyplneno(v) {
  return icoNormalizuj(v) !== '';
}

function icoPlatne(v) {
  const s = icoNormalizuj(v);
  if (!/^\d{8}$/.test(s)) return false;
  let soucet = 0;
  for (let i = 0; i < 7; i++) soucet += (+s[i]) * (8 - i);
  const zbytek = soucet % 11;
  const kontrolni = zbytek === 0 ? 1 : (zbytek === 1 ? 0 : 11 - zbytek);
  return kontrolni === +s[7];
}

/* Doplní hlavičku PROJ starší zakázce. Aby se při aktualizaci aplikace nic
 * neztratilo, převezme při prvním doplnění hodnoty z hlavičky OCK – od té
 * chvíle už žijí obě hlavičky vlastním životem. */
function zajistiProjHlavicku(zak) {
  if (!zak) return {};
  if (!zak.projHlavicka) zak.projHlavicka = {};
  ZAK_HLAVICKA_POLE.forEach(k => {
    if (zak.projHlavicka[k] == null) zak.projHlavicka[k] = zak[k] || '';
  });
  return zak.projHlavicka;
}

/* Čtení hlavičky PROJ (bez zápisu do dat – bezpečné i pro cizí/stará data). */
function projHlavicka(zak) {
  if (!zak) return {};
  if (zak.projHlavicka) return zak.projHlavicka;
  const h = {};
  ZAK_HLAVICKA_POLE.forEach(k => { h[k] = zak[k] || ''; });
  return h;
}

/* Hlavička PROJ pro VÝSTUPY (krycí list PROJ, nabídka PROJ): pole, které
 * v hlavičce PROJ zůstalo prázdné, se přečte z hlavičky OCK. Bez toho chybí
 * v krycím listu název akce a adresa stavby jen proto, že se hlavička ručně
 * nepřevzala – a obchodník to na dokumentu pozná až pozdě. Do dat se nic
 * nezapisuje: jakmile se pole v hlavičce PROJ vyplní, má přednost, a smazáním
 * se zase vrátí hodnota z OCK. */
/* Vyplněná hodnota hlavičky? Prázdno ani nedopsaná předloha čísla nabídky se
 * za vyplněné nepovažují – právě kvůli nim by dokument vyšel s prázdným
 * (nebo useknutým) údajem, přestože ho aplikace zná z druhé hlavičky. */
function hlavickaVyplneno(v) {
  const s = (v == null) ? '' : String(v).trim();
  return s !== '' && s !== ZAK_CISLO_PREDLOHA.trim();
}

function projHlavickaEfektivni(zak) {
  const p = projHlavicka(zak), h = {};
  ZAK_HLAVICKA_POLE.forEach(k => {
    h[k] = hlavickaVyplneno(p[k]) ? p[k] : ((zak && zak[k]) || '');
  });
  return h;
}

/* Číslo nabídky pro projekční část.
 * ZATÍM platí, že krycí list PROJ i cenová nabídka PROJ nesou číslo nabídky
 * z hlavičky OCK (rozhodnutí z 29. 7. 2026) – jedna zakázka, jedno číslo.
 * Není to natvrdo: kdyby OCK číslo nemělo, použije se vlastní číslo hlavičky
 * PROJ, protože dokument bez čísla je horší než číslo z druhé hlavičky.
 * Až se řada PROJ osamostatní, mění se jen tahle funkce – volající místa
 * (kryci_proj.js, nabidka_proj.js) zůstávají. */
function projCisloNabidky(zak) {
  if (hlavickaVyplneno(zak && zak.cislo)) return zak.cislo;
  const p = projHlavicka(zak);
  return hlavickaVyplneno(p && p.cislo) ? p.cislo : ((zak && zak.cislo) || '');
}

/* Bere se hodnota pole z hlavičky OCK, protože v PROJ chybí? (jen pro popisek) */
function projHlavickaZOck(zak, klic) {
  const p = projHlavicka(zak);
  return !hlavickaVyplneno(p[klic]) && hlavickaVyplneno(zak && zak[klic]);
}

/* Ruční přenos celé hlavičky. smer: 'doProj' = z OCK do PROJ, 'doOck' = opačně.
 * Nikdy se nevolá samo od sebe – jen z tlačítka. */
function zakazkaKopirujHlavicku(zak, smer) {
  const p = zajistiProjHlavicku(zak);
  if (smer === 'doOck') ZAK_HLAVICKA_POLE.forEach(k => { zak[k] = p[k] || ''; });
  else ZAK_HLAVICKA_POLE.forEach(k => { p[k] = zak[k] || ''; });
  return zak;
}

/* Pole, která by kopie přepsala nenulovou odlišnou hodnotou (pro dotaz před přepisem). */
function zakazkaHlavickaKolize(zak, smer) {
  const p = projHlavicka(zak);
  return ZAK_HLAVICKA_POLE.filter(k => {
    const cil = smer === 'doOck' ? (zak[k] || '') : (p[k] || '');
    const zdroj = smer === 'doOck' ? (p[k] || '') : (zak[k] || '');
    return cil !== '' && cil !== zdroj;
  });
}

/* Shodují se obě hlavičky ve všech polích? (jen pro informativní štítek v UI) */
function zakazkaHlavickyShodne(zak) {
  const p = projHlavicka(zak);
  return ZAK_HLAVICKA_POLE.every(k => (p[k] || '') === (zak[k] || ''));
}

/* Právě jedna řídící varianta */
function nastavRidici(zak, id) {
  zak.varianty.forEach(v => { v.ridici = v.id === id; });
}
function ridiciVarianta(zak) {
  return zak.varianty.find(v => v.ridici) || zak.varianty[0];
}
function aktivniVarianta(zak) {
  return zak.varianty.find(v => v.id === zak.aktivni) || zak.varianty[0];
}

/* Import: umí schema 2 (zakázka) i původní formát v1 {zadani, cenik, fixes} */
function importZakazka(obj) {
  if (obj && obj.schema >= 2 && Array.isArray(obj.varianty) && obj.varianty.length) {
    if (!obj.varianty.some(v => v.ridici)) obj.varianty[0].ridici = true;
    obj.varianty.forEach(v => {
      const d = v.data || {};
      if (!d.proj) d.proj = { zadani: JSON.parse(JSON.stringify(DEFAULT_ZADANI_PROJ)),
                              cenik: JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ)) };
      if (!d.proj.cenik.fixy)   // migrace: fixní náklady sekcí přesunuty do ceníku PROJ
        d.proj.cenik.fixy = JSON.parse(JSON.stringify(DEFAULT_CENIK_PROJ.fixy));
      if (d.proj.cenik.dph == null)   // migrace: PROJ má vlastní sazbu DPH; převezme dosud platnou z ceníku OCK
        d.proj.cenik.dph = (d.cenik && d.cenik.dph != null) ? d.cenik.dph : DEFAULT_CENIK_PROJ.dph;
      /* Migrace 11. 8. 2026: tři fixní částky lešení se slučují do jedné
       * (C.leseniFix). Bez převzetí staré hodnoty by fixní část spadla na
       * nulu a cena zakázky by se po otevření tiše propadla. Guard kvůli
       * Node testům, které zakazka.js načítají bez engine.js. */
      if (typeof cenikMigraceLeseni === 'function') cenikMigraceLeseni(d.cenik);
      if (!d.techspec) d.techspec = JSON.parse(JSON.stringify(DEFAULT_TECHSPEC));
      if (!d.kryci) d.kryci = { hodnoty: {} };
      if (!d.kryci.hodnoty) d.kryci.hodnoty = {};
      // KL-5: „Zádržné" se rozdělilo na dva řádky s procenty (kryci.js).
      // Guard kvůli Node testům, které zakazka.js načítají samostatně.
      if (typeof kryciMigraceZadrzne === 'function') kryciMigraceZadrzne(d.kryci.hodnoty);
      // KL-7: sazba DPH už není přepisovatelné pole – ruční hodnota ze starší
      // verze by se stejně nečetla, tak ať v datech neleží a nemate.
      if (typeof kryciMigraceSazbaDph === 'function') kryciMigraceSazbaDph(d.kryci.hodnoty);
      if (!d.kryciProj) d.kryciProj = { hodnoty: {} };   // migrace: krycí list PROJ přibyl později
      if (!d.kryciProj.hodnoty) d.kryciProj.hodnoty = {};
      if (typeof kryciProjMigraceSazbaDph === 'function') kryciProjMigraceSazbaDph(d.kryciProj.hodnoty);
      /* Migrace 4. 8. 2026: obchodní zaokrouhlení se rozdělilo na část OCK
       * a část PROJ. Starší varianta má jen společné pole – zaokrZajisti()
       * ho do obou dosadí, takže se cena nezmění ani o korunu. Guard kvůli
       * Node testům, které zakazka.js načítají bez zaokrouhleni.js. */
      if (typeof zaokrZajisti === 'function') zaokrZajisti(d);
      /* Migrace rolí (zjednodušení 2. 8. 2026): role u slevy se převádí jen
       * u NEZAMČENÝCH variant — zamčená nabídka je doklad a zůstává, jak
       * odešla (jméno role v ní je historie, ne aktivní oprávnění). */
      const zamceno = (typeof variantaUzamcena === 'function') && variantaUzamcena(v);
      if (!zamceno && d.sleva && typeof roleMigruj === 'function') {
        if (d.sleva.role) d.sleva.role = roleMigruj(d.sleva.role);
        if (d.sleva.schvalitel) d.sleva.schvalitel = roleMigruj(d.sleva.schvalitel);
      }
      v.data = d;
    });
    if (!obj.varianty.some(v => v.id === obj.aktivni)) obj.aktivni = obj.varianty[0].id;
    if (obj.popisZameru == null) obj.popisZameru = '';   // migrace: pole přibylo s nabídkou PROJ
    // migrace: sídlo objednatele se oddělilo od adresy stavby (KL-2). Zůstává
    // PRÁZDNÉ – dosavadní hodnota v `adresa` je adresa stavby, ne sídlo, a
    // dosadit ji sem by jen zopakovalo chybu, kterou tato změna odstraňuje.
    if (obj.adresaObjednatele == null) obj.adresaObjednatele = '';
    if (obj.jenProj == null) obj.jenProj = false;   // migrace: příznak jen projekce (2. 8. 2026)
    // migrace: IČO objednatele přibylo 30. 7. 2026. Zůstává PRÁZDNÉ – v žádném
    // dosavadním poli není nic, z čeho by se dalo odvodit, a odhadnuté IČO je
    // horší než žádné (skončilo by ve smlouvě).
    if (obj.ico == null) obj.ico = '';
    // migrace: úvodní fotka nabídky OCK přibyla později
    if (obj.uvodniFoto == null) obj.uvodniFoto = '';
    if (obj.uvodniFotoNazev == null) obj.uvodniFotoNazev = '';
    if (obj.uvodniFotoPopis == null) obj.uvodniFotoPopis = '';
    // #37: interní zápisník a přílohy. Zakázka uložená dřív pole nemá a první
    // zápis by spadl na undefined.push. Guard kvůli Node testům, které
    // zakazka.js načítají bez poznamky.js.
    if (typeof poznamkyZajisti === 'function') poznamkyZajisti(obj);
    zajistiProjHlavicku(obj);   // migrace: hlavička PROJ se osamostatnila – převezme dosavadní údaje z OCK
    // #34: přípony čísel variant a prázdný zámek. Guard kvůli Node testům,
    // které zakazka.js načítají bez zamek.js.
    if (typeof zajistiZamek === 'function') zajistiZamek(obj);
    // #41: protokol o kalkulaci. Starší soubory ho nemají – založí se prázdný,
    // aby se do něj dalo zapisovat hned; zpětně se nic dopočítat nedá.
    if (typeof protokolZajisti === 'function') protokolZajisti(obj);
    return obj;
  }
  if (obj && obj.zadani && obj.cenik) {                 // starý formát v1
    const zak = novaZakazka();
    const v = zak.varianty[0];
    v.data.ock = { zadani: obj.zadani, fixes: obj.fixes !== false };
    v.data.cenik = obj.cenik;
    zak.cislo = obj.zadani.cisloNabidky || zak.cislo;
    zak.nazevAkce = obj.zadani.nazevAkce || '';
    return zak;
  }
  throw new Error('Neznámý formát souboru – očekávám zakázku (schema 2) nebo staré zadání.');
}

/* ============================================================
 * ZAK-2 – POROVNÁNÍ VARIANT VEDLE SEBE (jen čtení)
 * Nemění výpočet ani data; jen skládá již spočtené výsledky do
 * tabulky „metrika × varianta" a dopočítává rozdíl proti řídící
 * variantě. Vstup `vypocty` je pole {id, ock, proj} (výsledky
 * vypocet() a vypocetProj()); UI je dodá přes spocitejVariantu(),
 * testy si je nastaví ručně – proto tu není žádná závislost na
 * engine.js ani na UI a funkce je plně testovatelná v node.
 * ============================================================ */

/* Metriky tabulky. `admin: true` = obsahuje náklad nebo marži,
 * UI je smí zobrazit jen administrátorovi (viz jeAdmin()). */
const POROVNANI_METRIKY = [
  { klic: 'ockZaklad',   popis: 'Základní cena OCK bez DPH',   format: 'kc'  },
  { klic: 'slevaPct',    popis: 'Schválená sleva',             format: 'pct', bezRozdilu: true },
  { klic: 'slevaKc',     popis: 'Sleva v Kč',                  format: 'kc'  },
  { klic: 'ockPoSleve',  popis: 'Cena OCK po slevě',           format: 'kc'  },
  { klic: 'ockNaklad',   popis: 'Náklad OCK',                  format: 'kc',  admin: true },
  { klic: 'marzeKc',     popis: 'Marže OCK po slevě',          format: 'kc',  admin: true },
  { klic: 'marzePct',    popis: 'Marže OCK po slevě v %',      format: 'pct', admin: true, bezRozdilu: true },
  { klic: 'projCelkem',  popis: 'Kalkulace PROJ celkem',       format: 'kc'  },
  /* Řádek jen pro čtenáře: rozdíl už je v cenách výše započítaný, proto
   * „z toho". Když zaokrouhlení nikdo nepoužívá, porovnaniVariant() řádek
   * zahodí – prázdná nula je ve srovnávací tabulce jen šum. */
  { klic: 'zaokrKc',     popis: 'Z toho obchodní zaokrouhlení', format: 'kc', pozn: true },
  { klic: 'celkemBezDph', popis: 'Celkem bez DPH',             format: 'kc',  hlavni: true },
  /* DPH po částech (audit 1. 8. 2026, N3): hlavičky OCK a PROJ jsou dvě
   * nezávislé sady včetně sazby DPH, takže i tady se porovnává OCK s OCK
   * a PROJ s PROJ – každá část vlastním řádkem s vlastní sazbou. Jediná
   * společná sazba na součet dávala u rozdílných sazeb špatný celek s DPH
   * a špatné číslo se zapékalo i do otisku zámku. */
  { klic: 'dphOckSazba',  popis: 'Sazba DPH OCK',              format: 'pct', bezRozdilu: true },
  { klic: 'dphOckKc',     popis: 'DPH OCK v Kč',               format: 'kc'  },
  { klic: 'dphProjSazba', popis: 'Sazba DPH PROJ',             format: 'pct', bezRozdilu: true },
  { klic: 'dphProjKc',    popis: 'DPH PROJ v Kč',              format: 'kc'  },
  { klic: 'celkemSDph',  popis: 'Celkem s DPH',                format: 'kc',  hlavni: true },
  { klic: 'priplatky',   popis: 'Příplatky nad rámec základní ceny', format: 'kc', pozn: true },
];

function porovnaniVariant(zak, vypocty, opts) {
  opts = opts || {};
  const podil = opts.slevaPodil || (typeof slevaPodil === 'function' ? slevaPodil : () => 0);
  const mapa = {};
  (vypocty || []).forEach(x => { mapa[x.id] = x; });

  const rid = ridiciVarianta(zak);
  const bezOck = !!zak.jenProj;   // jen projekce: část OCK se neporovnává
  const varianty = zak.varianty.map(v => {
    const c = mapa[v.id] || {};
    const d = v.data || {};
    const h = {};
    let chyba = '';
    /* Obchodní zaokrouhlení (#38) se počítá stejnou funkcí jako v nabídce,
     * jinak by porovnání ukazovalo jiná čísla než dokumenty. Chybí-li modul
     * (starší test bez něj), cena zůstává nezaokrouhlená. */
    /* Od 4. 8. 2026 má každá část vlastní nastavení; u starších variant
     * zaokrProjZ() spadne na dosavadní společné pole, takže se porovnání
     * u archivních zakázek nezmění. */
    const zaokrOck = x => (typeof zaokrouhli === 'function') ? zaokrouhli(x, d.zaokr) : x;
    const zaokrProj = x => (typeof zaokrouhli === 'function')
      ? zaokrouhli(x, (typeof zaokrProjZ === 'function') ? zaokrProjZ(d) : d.zaokr) : x;
    let zaokrCelkem = null;

    /* Zakázka jen projekce (2. 8. 2026): část OCK se neporovnává a chybějící
     * výpočet OCK není chyba — šachtu nikdo neprodává. */
    if (bezOck) {
      // řádky OCK zůstanou prázdné (—)
    } else if (c.ock && c.ock.souhrn) {
      const s = c.ock.souhrn;
      const p = Math.max(0, Math.min(1, +podil(d.sleva || {}) || 0));
      h.ockZaklad = s.zakladCena;
      h.slevaPct = p;
      h.slevaKc = s.zakladCena * p;
      const ockPred = s.zakladCena - h.slevaKc;
      h.ockPoSleve = zaokrOck(ockPred);
      zaokrCelkem = (zaokrCelkem || 0) + (h.ockPoSleve - ockPred);
      h.ockNaklad = s.zakladNaklad;
      h.marzeKc = h.ockPoSleve - s.zakladNaklad;
      h.marzePct = h.ockPoSleve > 0 ? h.marzeKc / h.ockPoSleve : null;
      h.priplatky = s.priplatkyCena;
    } else {
      chyba = 'kalkulaci OCK se nepodařilo spočítat';
    }

    if (c.proj && c.proj.souhrn) {
      const projPred = c.proj.souhrn.celkem;
      h.projCelkem = zaokrProj(projPred);
      zaokrCelkem = (zaokrCelkem || 0) + (h.projCelkem - projPred);
    } else {
      h.projCelkem = null;
    }
    h.zaokrKc = zaokrCelkem == null ? null : Math.round(zaokrCelkem * 100) / 100;
    if (!c.proj || !c.proj.souhrn)
      chyba = chyba ? chyba + '; kalkulaci PROJ také ne' : 'kalkulaci PROJ se nepodařilo spočítat';

    // celkem = cena OCK po schválené slevě + PROJ (stejně jako v nabídce);
    // příplatky se do celku nezapočítávají, nabízejí se zvlášť
    const ockCast = h.ockPoSleve, projCast = h.projCelkem;
    h.celkemBezDph = (ockCast == null && projCast == null) ? null : (ockCast || 0) + (projCast || 0);
    /* DPH po částech (audit 1. 8. 2026, N3): OCK sazbou z ceníku OCK, PROJ
     * sazbou z ceníku PROJ (PC.dph). Starší zakázky bez vlastní sazby PROJ
     * migruje importZakazka; kdyby sem přesto přišla varianta bez ní, spadne
     * se na sazbu OCK – stejné chování, jaké platilo před rozdělením. */
    const sazbaOck = (d.cenik && typeof d.cenik.dph === 'number') ? d.cenik.dph : null;
    const sazbaProj = (d.proj && d.proj.cenik && typeof d.proj.cenik.dph === 'number')
      ? d.proj.cenik.dph : sazbaOck;
    h.dphOckSazba = bezOck ? null : sazbaOck;
    h.dphProjSazba = (projCast != null) ? sazbaProj : null;
    /* #14 krok 1: DPH jedinou funkcí (Node testy bez zaokrouhleni.js mají záložku) */
    const dphFn = (typeof cenaSDph === 'function') ? cenaSDph : (c, sz) => ({ dphKc: (+c || 0) * (sz || 0) });
    h.dphOckKc = (!bezOck && sazbaOck != null && ockCast != null) ? dphFn(ockCast, sazbaOck).dphKc : null;
    h.dphProjKc = (sazbaProj != null && projCast != null) ? dphFn(projCast, sazbaProj).dphKc : null;
    h.celkemSDph = (h.celkemBezDph != null && (h.dphOckKc != null || h.dphProjKc != null))
      ? h.celkemBezDph + (h.dphOckKc || 0) + (h.dphProjKc || 0) : null;

    return { id: v.id, nazev: v.nazev, zakaznik: v.zakaznik || '', pozn: v.pozn || '',
             ridici: v.id === rid.id, aktivni: v.id === zak.aktivni, chyba, hodnoty: h };
  });

  const ridSloupec = varianty.find(x => x.ridici) || varianty[0];

  /* Zaokrouhlení se v tabulce ukáže, jen když ho někdo použil. Zahazuje se tu,
   * a ne až v UI, aby to bylo testovatelné a aby to platilo i pro export. */
  const metriky = POROVNANI_METRIKY.filter(m => m.klic !== 'zaokrKc'
      || varianty.some(x => x.hodnoty.zaokrKc != null && Math.abs(x.hodnoty.zaokrKc) > 0.005)
    ).map(m => {
    const hodnoty = varianty.map(x => x.hodnoty[m.klic] ?? null);
    const zaklad = ridSloupec ? (ridSloupec.hodnoty[m.klic] ?? null) : null;
    const rozdily = varianty.map((x, i) => {
      if (m.bezRozdilu || x.ridici) return null;
      const h = hodnoty[i];
      return (h == null || zaklad == null) ? null : h - zaklad;
    });
    const rozdilyPct = rozdily.map((r, i) =>
      (r == null || !zaklad) ? null : r / Math.abs(zaklad));
    return { ...m, hodnoty, rozdily, rozdilyPct };
  });

  return { ridiciId: ridSloupec ? ridSloupec.id : null,
           ridiciNazev: ridSloupec ? ridSloupec.nazev : '',
           varianty, metriky };
}

/* ============================================================
 * ZAK-2b – detail konkrétních položek, které se mezi variantami liší.
 * Stejná pravidla jako porovnaniVariant(): čistá funkce, jen čte
 * už spočtené výsledky, nic nemění a na nic se neváže.
 * ============================================================ */

/* Skupiny položek, které se porovnávají. `zdroj` říká, odkud se v
 * výsledku vypocet() berou:
 *   sekce      → r.sekce[klic]
 *   katalog    → r.volitelneKatalog (nadmnožina r.sekce.volitelne,
 *                navíc s příznakem `zahrnuto`)
 *   priplatky  → r.priplatky (nabízejí se zvlášť, do celku nevstupují) */
const POROVNANI_SKUPINY = [
  { klic: 'hrubaOck',  popis: 'Hrubá stavba OCK',            zdroj: 'sekce' },
  { klic: 'oplasteni', popis: 'Opláštění',                   zdroj: 'sekce' },
  { klic: 'volitelne', popis: 'Volitelné položky',           zdroj: 'katalog' },
  { klic: 'rezie',     popis: 'Režie a přípravné práce',     zdroj: 'sekce' },
  { klic: 'priplatky', popis: 'Příplatky nad rámec základní ceny', zdroj: 'priplatky', mimoCelek: true },
];

/* Sledované vlastnosti položky. `tol` = tolerance porovnání,
 * `admin: true` = náklad, UI to smí ukázat jen administrátorovi. */
const POROVNANI_ATRIBUTY = [
  { klic: 'nazev',    popis: 'Název',            typ: 'text' },
  { klic: 'mnozstvi', popis: 'množství',         typ: 'cislo', tol: 1e-6 },
  { klic: 'cena',     popis: 'Jednotková cena',  typ: 'kc',    tol: 0.005 },
  { klic: 'sMarzi',   popis: 'Cena položky',     typ: 'kc',    tol: 0.005 },
  { klic: 'naklad',   popis: 'Náklad položky',   typ: 'kc',    tol: 0.005, admin: true },
];

/* Stabilní identita položky napříč variantami. Katalogové a příplatkové
 * položky mají vlastní klíč; ruční položky (`vlastni:idx`) se párují
 * podle názvu, protože jejich index se posunem seznamu mění. */
function polozkaKlic(p) {
  const k = p.key;
  if (k && !/^vlastni:/.test(k)) return k;
  return 'n:' + (p.origNazev || p.nazev || '');
}

/* Je položka ve variantě fakticky nabízena?
 *  – volitelné katalogové: rozhoduje zaškrtnutí `zahrnuto`
 *  – příplatky: nulové množství = nenabízí se
 *  – ostatní sekce: položka v seznamu = je v dodávce                     */
function polozkaPritomna(p, zdroj) {
  if (p == null) return false;
  if (zdroj === 'katalog') return p.zahrnuto !== false;
  if (zdroj === 'priplatky') return Math.abs(+p.mnozstvi || 0) > 1e-9;
  return true;
}

function polozkyZdroje(ock, sk) {
  if (!ock) return [];
  if (sk.zdroj === 'katalog') return Array.isArray(ock.volitelneKatalog) ? ock.volitelneKatalog : [];
  if (sk.zdroj === 'priplatky') return Array.isArray(ock.priplatky) ? ock.priplatky : [];
  const s = ock.sekce || {};
  return Array.isArray(s[sk.klic]) ? s[sk.klic] : [];
}

/* porovnaniPolozek(zak, vypocty) → které konkrétní položky se v každé
 * variantě liší proti řídící variantě: přidané, odebrané a změněné.
 * `vypocty` = [{ id, ock, proj }] – tytéž vstupy jako porovnaniVariant(). */
function porovnaniPolozek(zak, vypocty, opts) {
  opts = opts || {};
  const mapa = {};
  (vypocty || []).forEach(x => { mapa[x.id] = x; });

  const rid = ridiciVarianta(zak);
  const ridOck = (mapa[rid.id] || {}).ock || null;

  const sloupce = zak.varianty.map(v => ({
    id: v.id, nazev: v.nazev, ridici: v.id === rid.id, aktivni: v.id === zak.aktivni,
    chyba: (mapa[v.id] && mapa[v.id].ock) ? '' : 'kalkulaci OCK se nepodařilo spočítat',
  }));

  /* index položek jedné varianty v jedné skupině: klíč → položka */
  const index = (ock, sk) => {
    const m = new Map();
    polozkyZdroje(ock, sk).forEach(p => { if (!m.has(polozkaKlic(p))) m.set(polozkaKlic(p), p); });
    return m;
  };

  const hodn = (p, a) => {
    if (p == null) return null;
    if (a.typ === 'text') return p.origNazev != null ? (p.nazev != null ? p.nazev : p.origNazev) : (p.nazev || '');
    const x = p[a.klic];
    return typeof x === 'number' ? x : (x == null ? null : +x || 0);
  };
  const shodne = (a, x, y) => {
    if (a.typ === 'text') return String(x == null ? '' : x) === String(y == null ? '' : y);
    if (x == null && y == null) return true;
    return Math.abs((+x || 0) - (+y || 0)) < a.tol;
  };

  const skupiny = POROVNANI_SKUPINY.map(sk => {
    const idxRid = index(ridOck, sk);

    const varianty = sloupce.map(sl => {
      const ock = (mapa[sl.id] || {}).ock || null;
      const idxVar = index(ock, sk);
      const pocty = { pridano: 0, odebrano: 0, zmeneno: 0, shodne: 0 };
      const polozky = [];
      let rozdilKc = 0;

      if (sl.ridici || !ock || !ridOck)
        return { id: sl.id, nazev: sl.nazev, ridici: sl.ridici, chyba: sl.chyba,
                 pocty, rozdilKc: 0, polozky: [] };

      const klice = [];
      const videno = new Set();
      idxRid.forEach((_, k) => { if (!videno.has(k)) { videno.add(k); klice.push(k); } });
      idxVar.forEach((_, k) => { if (!videno.has(k)) { videno.add(k); klice.push(k); } });

      klice.forEach(k => {
        const pr = idxRid.get(k) || null, pv = idxVar.get(k) || null;
        const jeR = polozkaPritomna(pr, sk.zdroj), jeV = polozkaPritomna(pv, sk.zdroj);
        if (!jeR && !jeV) return;

        const zdrojNazev = (jeV ? pv : pr) || pv || pr;
        const zaznam = {
          klic: k,
          vlastni: !!zdrojNazev.vlastni,
          mimoCelek: !!sk.mimoCelek,
          zmeny: [],
        };
        POROVNANI_ATRIBUTY.forEach(a => {
          zaznam[a.klic] = jeV ? hodn(pv, a) : null;
          zaznam[a.klic + 'Ridici'] = jeR ? hodn(pr, a) : null;
        });
        /* popis = co se ukáže v řádku; u odebrané položky název z řídící varianty */
        zaznam.popis = zaznam.nazev || zaznam.nazevRidici ||
                       zdrojNazev.origNazev || zdrojNazev.nazev || '';

        const cenaV = jeV ? (+zaznam.sMarzi || 0) : 0;
        const cenaR = jeR ? (+zaznam.sMarziRidici || 0) : 0;
        zaznam.rozdilKc = cenaV - cenaR;

        if (jeV && !jeR) zaznam.stav = 'pridano';
        else if (!jeV && jeR) zaznam.stav = 'odebrano';
        else {
          POROVNANI_ATRIBUTY.forEach(a => {
            if (!shodne(a, zaznam[a.klic], zaznam[a.klic + 'Ridici'])) zaznam.zmeny.push(a.klic);
          });
          zaznam.stav = zaznam.zmeny.length ? 'zmeneno' : 'shodne';
        }

        pocty[zaznam.stav]++;
        if (zaznam.stav !== 'shodne') { polozky.push(zaznam); rozdilKc += zaznam.rozdilKc; }
      });

      const poradi = { pridano: 0, odebrano: 1, zmeneno: 2 };
      polozky.sort((a, b) => (poradi[a.stav] - poradi[b.stav]) ||
                             (Math.abs(b.rozdilKc) - Math.abs(a.rozdilKc)) ||
                             String(a.popis).localeCompare(String(b.popis), 'cs'));

      return { id: sl.id, nazev: sl.nazev, ridici: sl.ridici, chyba: sl.chyba,
               pocty, rozdilKc, polozky };
    });

    return { klic: sk.klic, popis: sk.popis, zdroj: sk.zdroj,
             mimoCelek: !!sk.mimoCelek, varianty };
  });

  /* souhrn za variantu napříč všemi skupinami */
  const souhrn = sloupce.map((sl, i) => {
    const p = { pridano: 0, odebrano: 0, zmeneno: 0, shodne: 0 };
    let rozdilKc = 0, rozdilMimoCelek = 0;
    skupiny.forEach(g => {
      const v = g.varianty[i];
      Object.keys(p).forEach(k => { p[k] += v.pocty[k]; });
      if (g.mimoCelek) rozdilMimoCelek += v.rozdilKc; else rozdilKc += v.rozdilKc;
    });
    return { id: sl.id, nazev: sl.nazev, ridici: sl.ridici, chyba: sl.chyba,
             pocty: p, rozdilKc, rozdilMimoCelek,
             bezeZmen: !sl.ridici && !sl.chyba &&
                       (p.pridano + p.odebrano + p.zmeneno) === 0 };
  });

  return { ridiciId: rid.id, ridiciNazev: rid.nazev, sloupce, skupiny, souhrn };
}

/* StorageAdapter – jednotné rozhraní pro ukládání zakázek.
 * Dnes: 'file' (export/import JSON přes prohlížeč).
 * Budoucí implementace se stejným rozhraním:
 *   sheets: google.script.run → zápis do Google Sheets (číselná řada, historie)
 *   server: fetch() na malý backend + SQLite
 *   pipedrive: propis nabídky do CRM (deal + produkty)                       */
const StorageAdapter = {
  typ: 'file',
  exportuj(zak) { return JSON.stringify(zak, null, 2); },
  importuj(text) { return importZakazka(JSON.parse(text)); },
  nazevSouboru(zak) {
    return `zakazka_${(zak.cislo || 'nova').replace(/[^\w-]+/g, '_')}.json`;
  },
};

if (typeof module !== 'undefined')
  module.exports = { uvodniFotoObrazky, uvodniFotoSymboly, ZAKAZKA_SCHEMA, novaZakazka, novaVarianta, novaVariantaData,
                     nastavRidici, ridiciVarianta, aktivniVarianta, importZakazka, StorageAdapter,
                     ZAK_HLAVICKA_POLE, zajistiProjHlavicku, projHlavicka,
                     projHlavickaEfektivni, projHlavickaZOck, projCisloNabidky,
                     ZAK_CISLO_PREDLOHA, hlavickaVyplneno,
                     icoNormalizuj, icoVyplneno, icoPlatne,
                     zakazkaKopirujHlavicku, zakazkaHlavickaKolize, zakazkaHlavickyShodne,
                     porovnaniVariant, POROVNANI_METRIKY,
                     porovnaniPolozek, POROVNANI_SKUPINY, POROVNANI_ATRIBUTY, polozkaKlic };
