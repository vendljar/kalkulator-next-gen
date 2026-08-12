/* ============================================================
 * KRYCÍ LIST ZAKÁZKY PROJ – datový model (jeden zdroj pravdy)
 * Obdoba kryci.js, ale navázaná na KALKULACI PROJ (projekční
 * a inženýrská činnost) místo na kalkulaci OCK.
 *
 * Používá jej záložka Krycí list zakázky PROJ (kryci_proj_ui.js)
 * i generování do Wordu. Každé pole má příslušnost k verzi:
 * 'bo' (Backoffice) a/nebo 'techdata' (Technické oddělení) – Word
 * se generuje VŽDY v obou verzích, stejně jako u krycího listu OCK.
 * Hodnota pole: ruční přepis > prefill > prázdno.
 *
 * Zásada shodná s cenovou nabídkou PROJ: ceny se nikdy nevymýšlejí.
 * Vše, co je v krycím listu vyčíslené, pochází z vypocetProj(PJ, PC).
 * Neoceněná činnost se vypíše jako „není součástí nabídky“, nikdy
 * s nulou ani s odhadem.
 * ============================================================ */

/* Číselník sazeb smluvní pokuty je definovaný v kryci.js — v sestavené
 * aplikaci jsou oba moduly v jednom scope. V Node testech, kde bývá načtený
 * jen tenhle modul, se použije stejná trojice jako záloha. Že se ty dva
 * seznamy nerozešly, hlídá test_standardy.js. */
const KRYCI_POKUTY_SAZBY = (typeof KRYCI_POKUTY !== 'undefined')
  ? KRYCI_POKUTY : ['0', '0,05 % / den', '0,1 % / den'];

/* Zálohy a limit pokut (12. 8. 2026) — také jeden zdroj v kryci.js, tady jen
 * záloha pro samostatný Node běh. U projekce nesou volby holé procento bez
 * milníku: projekce se fakturuje po stupních dokumentace, ne po podpisu
 * a montáži, takže by věta u zálohy mátla. */
const KRYCI_PROJ_ZALOHY = ['Bez zálohy', 'Záloha 30 %', 'Záloha 50 %', 'Záloha 70 %'];
const KRYCI_PROJ_LIMIT_POKUT = (typeof KRYCI_LIMIT_POKUT !== 'undefined')
  ? KRYCI_LIMIT_POKUT : ['Uplatněn limit 10 %', 'NEUPLATNĚN limit 10 %'];

/* devět činností v pořadí VZORu (klíče sekcí engine_proj.js) */
/* Kdo nabídku vypracoval (#146) – u projekce platí totéž co u OCK; funkce
 * z kryci.js se v sestavené aplikaci sdílejí, v Node testech (kde je načtený
 * jen tenhle modul) se použije firemní záloha. */
function kryciProjObchodnik(f) {
  return typeof kryciObchodnikJmeno === 'function'
    ? kryciObchodnikJmeno(f) : firmaHodnota(f, 'zpracoval');
}
function kryciProjObchodnikKontakt(f) {
  return typeof kryciObchodnikKontakt === 'function'
    ? kryciObchodnikKontakt(f)
    : [firmaHodnota(f, 'zpracoval'), firmaHodnota(f, 'zpracovalTelefon'),
       firmaHodnota(f, 'zpracovalEmail')].filter(Boolean).join(', ');
}

const KRYCI_PROJ_CINNOSTI = [
  ['zamereni', 'Zaměření a zpracování výstupů (ZA)'],
  ['studie', 'Studie proveditelnosti (ST)'],
  ['projednani', 'Projednání studie (památkáři, územní rozvoj)'],
  ['dpz', 'Dokumentace pro povolení záměru (DPZ)'],
  ['ic', 'Inženýrská činnost (IČ)'],
  ['dps', 'Dokumentace pro provedení stavby (DPS)'],
  ['ezc', 'Ekonomická zadávací část (EZC)'],
  ['kolaudace', 'Kolaudace'],
  ['geodet', 'Geodetické zaměření'],
];

const kryciProjKc = n => Math.round(n || 0).toLocaleString('cs-CZ') + ' Kč';

/* prefill jedné činnosti: „ANO – 47 250 Kč“ / „není součástí nabídky“ */
function kryciProjCinnost(c, key) {
  const s = c.sekce && c.sekce[key];
  if (!s) return '';
  return s.celkem > 0 ? 'ANO – ' + kryciProjKc(s.celkem) : 'není součástí nabídky';
}
/* ANO/NE bez částky – pro technickou verzi, kde se ceny neuvádějí */
function kryciProjAno(c, key) {
  const s = c.sekce && c.sekce[key];
  if (!s) return '';
  return s.celkem > 0 ? 'ANO' : 'NE';
}

/* pole pro jednotlivé činnosti se generují z jednoho seznamu, aby se
 * krycí list nemohl rozejít s kalkulací při změně sady sekcí */
const KRYCI_PROJ_ROZSAH = KRYCI_PROJ_CINNOSTI.map(([key, label]) => ({
  id: 'cin_' + key, label: label, verze: ['bo'],
  prefill: c => kryciProjCinnost(c, key), src: 'z Kalkulace PROJ',
}));
const KRYCI_PROJ_STUPNE = KRYCI_PROJ_CINNOSTI.map(([key, label]) => ({
  id: 'st_' + key, label: label, verze: ['techdata'],
  prefill: c => kryciProjAno(c, key), src: 'z Kalkulace PROJ',
}));

const KRYCI_PROJ_SEKCE = [
  { sekce: 'Základní údaje', pole: [
    /* KL-4: obchodník = kdo nabídku vypracoval (Nastavení → Firma). Aplikace
     * nemá přihlášeného uživatele, tohle je jediný spolehlivý zdroj. */
    { id: 'obchodnik', label: 'Jméno obchodníka', verze: ['bo', 'techdata'], prefill: c => kryciProjObchodnik(c.firma), src: 'přihlášený uživatel / Nastavení → Firma' },
    /* Pořadí i názvy prvních čtyř polí jsou schválně stejné jako v krycím listu
     * OCK – oba listy se čtou vedle sebe a rozdílné pořadí mate.
     * Prázdné pole hlavičky PROJ se čte z hlavičky OCK (projHlavickaEfektivni),
     * aby v listu nechyběl název akce ani adresa jen proto, že se hlavička
     * nepřevzala; popisek zdroje pak řekne, odkud hodnota přišla. */
    { id: 'nazevAkce', label: 'Název akce', verze: ['bo', 'techdata'], bind: 'ZAK.projHlavicka.nazevAkce', prefill: c => c.hl.nazevAkce, src: c => c.hlSrc('nazevAkce') },
    /* Číslo nabídky se ZATÍM přebírá z hlavičky OCK (zadání 29. 7. 2026), proto
     * se pole váže rovnou na ZAK.cislo – přepsáním se mění číslo celé zakázky,
     * ne zvláštní číslo projekční části. Kdyby PROJ někdy měl vlastní řadu,
     * vrátí se sem bind na ZAK.projHlavicka.cislo. */
    { id: 'cisloCN', label: 'Číslo nabídky (CN)', verze: ['bo', 'techdata'], bind: 'ZAK.cislo', prefill: c => c.hl.cislo, src: 'hlavička kalkulace OCK' },
    { id: 'adresaStavby', label: 'Adresa stavby', verze: ['bo', 'techdata'], bind: 'ZAK.projHlavicka.adresa', prefill: c => c.hl.adresa, src: c => c.hlSrc('adresa') },
    { id: 'hodnotaBezDph', label: 'Hodnota zakázky bez DPH', verze: ['bo', 'techdata'], prefill: c => c.hodnota, src: 'z Kalkulace PROJ' },
    /* Vlastní pole projekční části – v OCK verzi obdobu nemají. */
    { id: 'predmet', label: 'Předmět zakázky', verze: ['bo', 'techdata'], prefill: () => 'Projekční a inženýrská činnost (PROJ)', src: 'výchozí' },
    { id: 'ocenenoCinnosti', label: 'Oceněných činností', verze: ['bo', 'techdata'], prefill: c => c.ocenene, src: 'z Kalkulace PROJ' },
    { id: 'mimoNabidku', label: 'Činnosti mimo nabídku', verze: ['bo', 'techdata'], typ: 'textarea', prefill: c => c.neocenene, src: 'z Kalkulace PROJ' },
  ] },
  /* SET-3 – firemní údaje se doplní automaticky z Nastavení → Firma;
   * ruční přepis je možný (např. jiná fakturační adresa). */
  { sekce: 'Dodavatel (naše firma)', pole: [
    { id: 'dodNazev', label: 'Zhotovitel', verze: ['bo', 'techdata'], prefill: c => firmaHodnota(c.firma, 'nazev'), src: 'Nastavení → Firma' },
    { id: 'dodIcoDic', label: 'IČO / DIČ zhotovitele', verze: ['bo'], prefill: c => firmaIcoDic(c.firma), src: 'Nastavení → Firma' },
    { id: 'dodSidlo', label: 'Sídlo zhotovitele', verze: ['bo'], prefill: c => firmaSidlo(c.firma), src: 'Nastavení → Firma' },
    { id: 'dodBanka', label: 'Bankovní spojení zhotovitele', verze: ['bo'], prefill: c => firmaBankaRadek(c.firma), src: 'Nastavení → Firma' },
    { id: 'dodKontakt', label: 'Kontakt na zhotovitele (telefon, e-mail)', verze: ['bo', 'techdata'], prefill: c => [firmaHodnota(c.firma, 'telefon'), firmaHodnota(c.firma, 'email')].filter(Boolean).join(', '), src: 'Nastavení → Firma' },
    { id: 'dodZpracoval', label: 'Nabídku vypracoval', verze: ['bo', 'techdata'], prefill: c => kryciProjObchodnikKontakt(c.firma), src: 'přihlášený uživatel / Nastavení → Firma' },
    { id: 'hlavniProjektant', label: 'Hlavní projektant (jméno, autorizace)', verze: ['bo', 'techdata'] },
  ] },
  { sekce: 'Zákazník (smluvní partner)', pole: [
    { id: 'jmenoPrijmeni', label: 'Jméno a příjmení kontaktu', verze: ['bo'], prefill: c => c.hl.kontakt, src: 'z hlavičky Kalkulace PROJ' },
    { id: 'zakaznik', label: 'Zákazník (smluvní partner)', verze: ['bo', 'techdata'], prefill: c => c.hl.objednatel, src: 'z hlavičky Kalkulace PROJ' },
    { id: 'kontaktObjednatel', label: 'Kontaktní údaje na objednatele (email, telefon)', verze: ['bo'] },
    { id: 'ico', label: 'IČO', verze: ['bo'], prefill: c => c.hl.ico, src: 'z hlavičky Kalkulace PROJ' },
    /* KL-1: sídlo objednatele, ne adresa stavby – ty se běžně liší. */
    { id: 'adresaZakaznik', label: 'Adresa (sídlo) objednatele', verze: ['bo'], prefill: c => c.hl.adresaObjednatele, src: 'z hlavičky Kalkulace PROJ (sídlo)' },
    { id: 'fakturacniEmail', label: 'Kontakt na fakturační oddělení (email, telefon)', verze: ['bo'] },
    { id: 'kontaktStavba', label: 'Kontakt stavba (tel / email)', verze: ['bo', 'techdata'] },
    /* KL-6: ve formuláři je odkaz, ne popis */
    { id: 'scoring', label: 'Scoring Cribis / Pipedrive', verze: ['bo'], typ: 'link', ph: 'https://…' },
  ] },
  { sekce: 'Typ smlouvy', pole: [
    { id: 'typSmlouvy', label: 'Typ smlouvy', verze: ['bo'], typ: 'radio', o: ['Naše bez úprav', 'Naše s úpravami', 'Cizí'], prefill: () => 'Naše bez úprav', src: 'výchozí' },
    { id: 'typProjektu', label: 'Typ projektu', verze: ['bo', 'techdata'], typ: 'radio', o: ['Nový projekt (novostavba)', 'Rekonstrukce objektu'], prefill: () => 'Rekonstrukce objektu', src: 'výchozí' },
    { id: 'pamatkovaOchrana', label: 'Objekt v památkové ochraně', verze: ['bo', 'techdata'], typ: 'radio', o: ['Ano', 'Ne', 'Zjišťuje se'] },
    { id: 'autorskaPrava', label: 'Licence k projektové dokumentaci', verze: ['bo'], prefill: () => 'nevýhradní, pro účel stavby dle smlouvy', src: 'výchozí' },
  ] },
  { sekce: 'Rozsah projekčních prací (dle Kalkulace PROJ)', pole: KRYCI_PROJ_ROZSAH.concat([
    { id: 'rozsahJine', label: 'Jiné dohodnuté činnosti', verze: ['bo'], typ: 'textarea' },
    { id: 'cenaNezahrnuje', label: 'Cena nezahrnuje', verze: ['bo'], typ: 'textarea', prefill: () => 'správní poplatky, posudky nad rámec nabídky, činnosti neuvedené v nabídce', src: 'výchozí' },
  ]) },
  { sekce: 'Platební podmínky', pole: [
    { id: 'splatnostDni', label: 'Splatnost faktur (dní)', verze: ['bo'], prefill: c => String(c.sazby.splatnostDni), src: 'z cenové nabídky PROJ' },
    /* Firemní standardy (10. 8. 2026) — stejně jako u OCK. Platnost nabídky
     * měla dosud dva zdroje: krycí list ji bral z ceníku PROJ, ale v nabídce
     * OCK stála natvrdo jiná hodnota. Teď je zdroj jeden pro obojí a hodnota
     * z ceníku slouží už jen jako náhrada, kdyby firemní pole bylo prázdné. */
    { id: 'platnostNabidky', label: 'Platnost nabídky', verze: ['bo'],
      prefill: c => firmaHodnota(c.firma, 'platnostNabidky') || (c.sazby.platnostMesicu + ' měsíce'),
      src: 'Nastavení → Firma' },
    { id: 'zpusobFakturace', label: 'Způsob fakturace', verze: ['bo'],
      prefill: c => firmaHodnota(c.firma, 'zpusobFakturaceProj') || 'po dokončení jednotlivých stupňů dokumentace',
      src: 'Nastavení → Firma' },
    { id: 'faktZamereni', label: 'Fakturace – zaměření a studie', verze: ['bo'], prefill: () => '100 % po předání výstupů', src: 'výchozí' },
    { id: 'faktDpz', label: 'Fakturace – DPZ a inženýrská činnost', verze: ['bo'], prefill: () => '100 % po odevzdání dokumentace', src: 'výchozí' },
    { id: 'faktDps', label: 'Fakturace – DPS a EZC', verze: ['bo'], prefill: () => '100 % po odevzdání dokumentace', src: 'výchozí' },
    /* 12. 8. 2026: rolovací seznam místo trojice přepínačů, přibyla volba
     * 70 % a výchozí je 50 % (rozhodnutí J. V.). Přepínače se do řádku vešly,
     * dokud byly tři; se čtvrtou volbou a možností vlastního znění je
     * rozbalovátko čitelnější — a hlavně je stejné jako u výtahové šachty. */
    { id: 'zaloha', label: 'Záloha', verze: ['bo'],
      typ: 'vyber', o: KRYCI_PROJ_ZALOHY, prefill: () => KRYCI_PROJ_ZALOHY[2], src: 'výchozí' },
    /* Výběr sazby pokuty — tentýž číselník jako u OCK (KRYCI_POKUTY v kryci.js),
     * aby se dvě verze seznamu nerozešly. Předvyplněná je nula, tedy bez pokuty. */
    { id: 'pokutaTermin', label: 'Smluvní pokuta – prodlení s odevzdáním', verze: ['bo', 'techdata'],
      typ: 'vyber', o: KRYCI_POKUTY_SAZBY, prefill: () => KRYCI_POKUTY_SAZBY[0], src: 'výchozí' },
    { id: 'pokutaSplatnost', label: 'Smluvní pokuta – prodlení splatnosti', verze: ['bo', 'techdata'],
      /* Předvyplněných 0,05 % / den od 12. 8. 2026 — stejně jako u OCK. */
      typ: 'vyber', o: KRYCI_POKUTY_SAZBY, prefill: () => KRYCI_POKUTY_SAZBY[1], src: 'výchozí' },
    { id: 'pokutaLimit', label: 'Limit smluvních pokut', verze: ['bo', 'techdata'],
      typ: 'vyber', o: KRYCI_PROJ_LIMIT_POKUT, prefill: () => KRYCI_PROJ_LIMIT_POKUT[0], src: 'výchozí' },
    { id: 'pokutyJine', label: 'Jiné', verze: ['bo'], typ: 'textarea' },
    { id: 'platceDph', label: 'Plátce DPH', verze: ['bo'], typ: 'radio', o: ['Ano', 'Ne'], prefill: () => 'Ano', src: 'výchozí' },
    /* KL-7: viz kryci.js. Projekce má vlastní sazbu (PC.dph) — projekční práce
     * bývají v jiné sazbě než stavební část, takže výběr míří do hlavičky
     * Kalkulace PROJ, ne do sazby OCK. */
    { id: 'sazbaDph', label: 'Sazba DPH', verze: ['bo'], typ: 'dph', dphBind: 'PC.dph',
      prefill: c => c.dph + ' %', src: 'z hlavičky kalkulace PROJ' },
    { id: 'pojisteni', label: 'Pojištění odpovědnosti projektanta', verze: ['bo'], prefill: () => 'ANO – dle pojistné smlouvy zhotovitele', src: 'výchozí' },
  ] },
  { sekce: 'Termíny', pole: [
    { id: 'terminZahajeni', label: 'Zahájení prací (podpis smlouvy)', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminZamereni', label: 'Předání výstupů ze zaměření', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminStudie', label: 'Odevzdání studie proveditelnosti', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminDpz', label: 'Odevzdání DPZ', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminPovoleni', label: 'Předpoklad povolení záměru', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminDps', label: 'Odevzdání DPS', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminJine', label: 'Jiné termíny', verze: ['bo', 'techdata'], typ: 'textarea' },
  ] },
  { sekce: 'Stupně dokumentace (technická verze)', pole: KRYCI_PROJ_STUPNE },
  { sekce: 'Projekční specifika', pole: [
    { id: 'pocetVytahu', label: 'Počet výtahů / šachet', verze: ['techdata'], prefill: () => '1', src: 'výchozí' },
    { id: 'autorskyDozor', label: 'Autorský dozor (AD)', verze: ['techdata'], prefill: c => c.sazby.autorskyDozorKcMesic.toLocaleString('cs-CZ') + ' Kč / měsíc, max. ' + c.sazby.autorskyDozorMaxHodin + ' h', src: 'paušál z nabídky PROJ' },
    { id: 'variantaPamatkari', label: 'Každá další varianta pro památkáře', verze: ['techdata'], prefill: c => c.sazby.variantaSpKc.toLocaleString('cs-CZ') + ' Kč', src: 'paušál z nabídky PROJ' },
    { id: 'podkladyInvestor', label: 'Podklady od investora (původní PD, revize)', verze: ['techdata'], typ: 'textarea' },
    { id: 'dossSeznam', label: 'Dotčené orgány státní správy (DOSS)', verze: ['techdata'], typ: 'textarea' },
    { id: 'dodavatelStavby', label: 'Dodavatel stavby (kontakt email / telefon)', verze: ['techdata'] },
    { id: 'dodavatelVytahu', label: 'Dodavatel výtahu (kontakt email / telefon)', verze: ['techdata'] },
    { id: 'navaznostOck', label: 'Návaznost na kalkulaci OCK', verze: ['techdata'], typ: 'textarea', ph: 'zda a jak navazuje dodávka ocelové konstrukce šachty…' },
  ] },
  { sekce: 'Atypy a rizika PROJ', pole: [
    { id: 'atypPamatky', label: 'Požadavky památkové péče', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypStatika', label: 'Statická rizika (zásah do nosných konstrukcí)', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypDokumentace', label: 'Chybějící nebo nespolehlivá původní dokumentace', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypInstalace', label: 'Kolize s technickými instalacemi', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypOsvit', label: 'Studie osvitu / denní osvětlení', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypJiny', label: 'Jiný atyp nebo riziko', verze: ['techdata'], typ: 'textarea' },
  ] },
  /* KL-7: patička z předlohy („Dne" / „Podpis obchodníka" / „Informován") */
  { sekce: 'Podpis', pole: [
    { id: 'podpisDne', label: 'Dne', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'podpisObchodnik', label: 'Podpis obchodníka', verze: ['bo', 'techdata'], prefill: c => kryciProjObchodnik(c.firma), src: 'přihlášený uživatel / Nastavení → Firma' },
    { id: 'podpisInformovan', label: 'Informován', verze: ['bo', 'techdata'], ph: 'kdo byl o zakázce informován…' },
  ] },
];

/* kontext pro prefill: zakázka + hodnoty odvozené z KALKULACE PROJ.
 * Nic se tu nepočítá znovu – vše jde přes vypocetProj, aby se krycí
 * list nemohl rozejít s kalkulací ani s cenovou nabídkou PROJ. */
function kryciProjCtx(zak, varianta) {
  const d = varianta.data;
  const sekce = {};
  let hodnota = '—', ocenene = '—', neocenene = '—';
  try {
    const r = vypocetProj(d.proj.zadani, d.proj.cenik);
    r.sekce.forEach(s => { sekce[s.key] = { nazev: s.nazev, celkem: s.celkem }; });
    /* Stejná cena jako v nabídce PROJ, tj. po obchodním zaokrouhlení (#38);
     * ceny jednotlivých činností zůstávají nezaokrouhlené. */
    const cn = (typeof cenaNabidkyProj === 'function')
      ? cenaNabidkyProj(r, d.slevaProj, (typeof zaokrProjZ === 'function') ? zaokrProjZ(d) : d.zaokr) : null;
    hodnota = kryciProjKc(cn ? cn.cena : r.souhrn.celkem);
    const oc = r.sekce.filter(s => s.celkem > 0);
    const ne = r.sekce.filter(s => !(s.celkem > 0));
    ocenene = oc.length + ' z ' + r.sekce.length + ' činností';
    neocenene = ne.length ? ne.map(s => s.nazev).join(', ') : 'žádná – oceněny jsou všechny činnosti';
  } catch (e) {}
  const firma = (typeof firmaAktualni === 'function') ? firmaAktualni() : {};
  const sazby = (typeof NABIDKA_PROJ_SAZBY !== 'undefined') ? NABIDKA_PROJ_SAZBY
    : { splatnostDni: 14, platnostMesicu: 3, dphPct: 21, autorskyDozorKcMesic: 35000, autorskyDozorMaxHodin: 30, variantaSpKc: 8500 };
  // DPH: přednost má vlastní sazba projekční části, jinak dosud platná z ceníku OCK
  const dph = (d.proj && d.proj.cenik && d.proj.cenik.dph != null) ? Math.round(d.proj.cenik.dph * 100)
    : (d.cenik && d.cenik.dph != null) ? Math.round(d.cenik.dph * 100) : sazby.dphPct;
  /* hl = hlavička Kalkulace PROJ (vlastní, oddělená od hlavičky OCK); prázdné
   * pole se doplní z hlavičky OCK, ať krycí list není prázdný jen proto, že se
   * hlavička nepřevzala. hlSrc říká, odkud hodnota nakonec přišla. */
  const hlZaklad = (typeof projHlavickaEfektivni === 'function') ? projHlavickaEfektivni(zak)
    : (typeof projHlavicka === 'function') ? projHlavicka(zak) : (zak || {});
  /* Kopie, ne původní objekt: číslo nabídky se přepisuje jen pro dokument,
   * do uložených dat se tím nesmí nic zapsat. */
  const hl = Object.assign({}, hlZaklad);
  /* Číslo nabídky PROJ = číslo nabídky OCK (zadání 29. 7. 2026). Kdyby se
   * pravidlo změnilo, mění se projCisloNabidky v zakazka.js, ne tohle místo. */
  if (typeof projCisloNabidky === 'function') hl.cislo = projCisloNabidky(zak);
  const hlSrc = klic => (typeof projHlavickaZOck === 'function' && projHlavickaZOck(zak, klic))
    ? 'z hlavičky kalkulace OCK' : 'hlavička Kalkulace PROJ';
  return { zak, hl, hlSrc, sekce, hodnota, ocenene, neocenene, dph, firma, sazby };
}

/* KL-7: totéž jako kryciMigraceSazbaDph() v kryci.js, jen nad úložištěm PROJ —
 * ruční sazba DPH uložená starší verzí se z dat uklidí, aby se nevozila dál. */
function kryciProjMigraceSazbaDph(h) {
  if (h && h.sazbaDph !== undefined) delete h.sazbaDph;
  return h;
}

/* hodnota pole: ruční přepis (data.kryciProj.hodnoty) > prefill > '' */
function kryciProjHodnota(pole, kl, c) {
  /* `dphBind` je totéž provázání jako `bind`, jen mířené do sazby DPH
   * v hlavičce Kalkulace PROJ — ruční přepis se proto nečte ani tady. */
  if (!pole.bind && !pole.dphBind) {   // provázaná pole (bind) čtou přímo ze ZAK, ne z ručních přepisů
    const h = (kl && kl.hodnoty) || {};
    if (h[pole.id] !== undefined && h[pole.id] !== '') return h[pole.id];
  }
  if (pole.prefill) { try { const v = pole.prefill(c); if (v != null && v !== '') return v; } catch (e) {} }
  return '';
}

/* data pro Word danou verzi: {nadpis, sekce:[{sekce,radky:[[label,val]]}], nazevSouboru} */
function kryciProjData(zak, varianta, jekly, verze) {
  const c = kryciProjCtx(zak, varianta);
  const kl = varianta.data.kryciProj || { hodnoty: {} };
  const sekce = KRYCI_PROJ_SEKCE.map(s => {
    const radky = s.pole.filter(p => p.verze.includes(verze)).map(p => [p.label, kryciProjHodnota(p, kl, c)]);
    return radky.length ? { sekce: s.sekce, radky } : null;
  }).filter(Boolean);
  const verzeNazev = verze === 'techdata' ? 'Techdata' : 'Backoffice';
  const cislo = ((c.hl && c.hl.cislo) || 'CN').replace(/\s+/g, '');
  const nazevSouboru = ('KRYCI_LIST_PROJ_' + verzeNazev + '_' + cislo).replace(/[\\/:*?"<>|]+/g, '-');
  return { nadpis: 'Krycí list zakázky PROJ — ' + verzeNazev, sekce, nazevSouboru, verze, verzeNazev };
}

/* registrace obou verzí do jednotného registru dokumentů (generují se od nuly).
 * Typ začíná „kryciproj_“, aby se nemíchal s prefixem „kryci_“ krycího listu OCK. */
if (typeof dokumentRegistruj === 'function') {
  [['bo', 'Backoffice'], ['techdata', 'Techdata']].forEach(([verze, label]) => {
    dokumentRegistruj('kryciproj_' + verze, {
      nazev: 'Krycí list PROJ – ' + label,
      generate: (zak, varianta, jekly) => {
        const d = kryciProjData(zak, varianta, jekly, verze);
        return { blob: docxDokumentBlob(d.nadpis, d.sekce), nazevSouboru: d.nazevSouboru, data: d };
      },
    });
  });
}

/* Sekce krycího listu PROJ zobrazené i v souhrnu cenové nabídky PROJ.
 * Totéž jako u OCK (viz kryci.js), jen nad druhým úložištěm
 * (varianta.data.kryciProj.hodnoty) — proto se OCK a PROJ nikdy nepropíšou
 * jeden do druhého, aniž by to bylo nutné hlídat kódem. */
const KRYCI_PROJ_NABIDKA_SEKCE = ['Typ smlouvy', 'Platební podmínky'];

/* Symboly {{PODM_…}} do šablony nabídky PROJ (#147). Stavitel je společný
 * s OCK (kryci.js), jen čte druhé úložiště — nabídka OCK a nabídka PROJ jsou
 * dva samostatné dokumenty, každý se svou šablonou, takže stejná jména symbolů
 * si navzájem nepřekážejí. */
function kryciProjPodminkoveSymboly(zak, varianta, P) {
  if (typeof kryciSymbolyZeSekci !== 'function') return {};
  const c = kryciProjCtx(zak, varianta);
  const kl = (varianta && varianta.data && varianta.data.kryciProj) || { hodnoty: {} };
  return kryciSymbolyZeSekci(KRYCI_PROJ_SEKCE, KRYCI_PROJ_NABIDKA_SEKCE,
    p => kryciProjHodnota(p, kl, c), P);
}

if (typeof module !== 'undefined')
  module.exports = { KRYCI_PROJ_SEKCE, KRYCI_POKUTY_SAZBY, KRYCI_PROJ_NABIDKA_SEKCE, KRYCI_PROJ_CINNOSTI, kryciProjCtx,
    kryciProjHodnota, kryciProjData, kryciProjMigraceSazbaDph, kryciProjPodminkoveSymboly };
