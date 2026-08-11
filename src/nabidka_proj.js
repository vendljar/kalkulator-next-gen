/* ============================================================
 * NABÍDKA PROJ (OVP-CN) – cenová nabídka projekčních
 * a inženýrských činností podle VZORu ENGINEERS CZ
 * ------------------------------------------------------------
 * Předloha: „2026OVPCN01xx_Cenová nabídka_CN Engineers CZ … V Z O R.doc".
 * Struktura dokumentu (nadpisy, rozsahy činností, platební podmínky,
 * termíny) je přepsaná 1:1 z VZORu; CENY se dosazují z Kalkulace PROJ
 * (engine_proj.js), takže se nabídka nikdy nerozejde s kalkulací.
 *
 * Mapování sekcí VZOR → Kalkulace PROJ:
 *   ZAMĚŘENÍ (ZA)                → zamereni
 *   STUDIE PROVEDITELNOSTI část 1 → zamereni   (tatáž činnost jako ZA)
 *   STUDIE PROVEDITELNOSTI část 2 → studie
 *   STUDIE PROVEDITELNOSTI část 3 → projednani
 *   DPZ                          → dpz
 *   INŽENÝRSKÁ ČINNOST (IČ)      → ic
 *   DPS                          → dps
 *   EZC                          → ezc
 *   KOLAUDAČNÍ ŘÍZENÍ            → kolaudace
 *   GEODETICKÉ ZAMĚŘENÍ          → geodet
 *   AUTORSKÝ DOZOR (AD)          → paušál z NABIDKA_PROJ_SAZBY (není v kalkulaci)
 *
 * DŮLEŽITÉ: tento soubor NEMĚNÍ Kalkulaci PROJ ani její ceník. Je to jen
 * další „odběratel" jejího výsledku – stejně jako nabidka.js u OCK.
 *
 * Texty: obyčejný řetězec se překládá slovníkem (preklad.js), objekt
 * { cz: '…' } je souvislá právní/technická próza, která zůstává česky
 * (viz odstavec „Jazykové mutace" v roadmapě). Nic se nikdy nevymýšlí.
 * ============================================================ */

/* Paušály z VZORu, které nejsou položkou Kalkulace PROJ.
 * Drží se zvlášť, aby šly změnit bez zásahu do výpočetního jádra. */
const NABIDKA_PROJ_SAZBY = {
  variantaSpKc: 8500,        // každá další varianta řešení pro památkáře
  autorskyDozorKcMesic: 35000,
  autorskyDozorMaxHodin: 30,
  dphPct: 21,                // použije se, nemá-li varianta vlastní ceník
  splatnostDni: 14,
  platnostMesicu: 3,
};

/* Definice dokumentu – pořadí i znění podle VZORu.
 * typ: 'nadpis' | 'proza' | 'rozsah' | 'cena' | 'seznam' | 'pary' | 'pozn' */
const NABIDKA_PROJ_DEF = [
  { typ: 'proza', nadpis: 'Popis záměru', klic: 'popisZameru', odstavce: [] },

  { typ: 'proza', nadpis: 'Naše NABÍDKA a doporučení', odstavce: [
    { cz: 'V rámci zamýšlené VÝSTAVBY VÝTAHU A VÝTAHOVÉ ŠACHTY, v počáteční fázi nabízíme ZAMĚŘENÍ a ZPRACOVÁNÍ VÝSTUPŮ ZE ZAMĚŘENÍ uvažovaného umístění výtahu. Z výsledku zaměření navrhneme varianty řešení. Vybranou variantu následně zpracujeme ve STUDII PROVEDITELNOSTI. Součástí nabídkové ceny je i projednání této studie s Odborem památkové péče HMP.' },
    { cz: 'Po vyjasnění technických detailů (především s památkáři) vypracujeme PROJEKTOVOU DOKUMENTACI PRO POVOLENÍ ZÁMĚRU (DPZ) obsahující projekt pro řízení o povolení záměru a INŽENÝRSKOU ČINNOST (vyřízení POVOLENÍ ZÁMĚRU).' },
    { cz: 'Po získání rozhodnutí stavebního úřadu o povolení záměru lze pokračovat PROVÁDĚCÍM PROJEKTEM a POLOŽKOVÝM ROZPOČTEM na samotnou realizaci stavby.' },
    { cz: 'Všechny nabízené činnosti jsou popsány na dalších stránkách naší nabídky.' },
  ] },

  { typ: 'nadpis', text: 'ROZSAH NABÍDKY' },

  /* ---------------- ZAMĚŘENÍ (ZA) ---------------- */
  { typ: 'rozsah', nadpis: 'ZAMĚŘENÍ A ZPRACOVÁNÍ VÝSTUPŮ (ZA)', radky: [
    ['Stavebně technický průzkum a zaměření', 'zajištění původní dokumentace stavby v potřebném rozsahu od investora nebo z archivu stavebního úřadu'],
    ['Stavebně technický průzkum a zaměření', 'detailní zaměření 3D skenerem dotčených částí objektu (ověření reálných rozměrů pro eliminaci chyby původní PD k objektu)'],
    ['Stavebně technický průzkum a zaměření', 'zpracování výstupu ze zaměření'],
    ['Stavebně technický průzkum a zaměření', 'vizuální prohlídka objektu stavebně technických návazností, které mají vliv na úpravu výtahové šachty v objektu'],
    ['Stavebně technický průzkum a zaměření', 'pořízení detailní fotodokumentace'],
  ] },
  { typ: 'cena', nadpis: 'CENA ZA ZAMĚŘENÍ A ZPRACOVÁNÍ VÝSTUPŮ', sekce: 'zamereni',
    popis: 'Cena ZAMĚŘENÍ zamýšleného prostoru pro umístění výtahu, stavebně technický průzkum a zpracování výstupů.' },

  /* ---------------- STUDIE PROVEDITELNOSTI (ST) ---------------- */
  { typ: 'rozsah', nadpis: 'STUDIE PROVEDITELNOSTI (ST)', uvod: [
    { cz: 'Studie proveditelnosti – podoba úprav domu, umístění výtahové šachty a technologie výtahu – se zpracovává jako prvotní dokumentace, do které se zapracují veškeré požadavky investora v kombinaci s realizovatelností záměru a legislativních požadavků. Tím se docílí podkladu, který poté slouží nejen pro projednání záměru na stavebním úřadě, ale je možné ho dále rozpracovat do dalších stupňů projektových dokumentací.' },
  ], radky: [
    ['Studie proveditelnosti – část 1', ''],
    ['Stavebně technický průzkum a zaměření', 'zajištění původní dokumentace stavby v potřebném rozsahu od investora nebo z archivu stavebního úřadu'],
    ['Stavebně technický průzkum a zaměření', 'detailní zaměření 3D skenerem dotčených částí objektu'],
    ['Stavebně technický průzkum a zaměření', 'zpracování výstupu ze zaměření'],
    ['Stavebně technický průzkum a zaměření', 'vizuální prohlídka objektu stavebně technických návazností'],
    ['Stavebně technický průzkum a zaměření', 'pořízení detailní fotodokumentace'],
    ['Studie proveditelnosti – část 2', ''],
    ['Návrh grafické studie', 'PŮVODNÍ STAV – grafický výstup ze zaměření, průmět reality z průzkumu s původní dokumentací stavby'],
    ['Návrh grafické studie', 'ROZSAH BOURÁNÍ – grafické naznačení možného rozsahu bourání s ohledem na statiku objektu'],
    ['Návrh grafické studie', 'NAVRHOVANÝ STAV – návrh na úpravy prostoru pro výtahovou šachtu, portálu dveří a dalších návazných nutných stavebních úprav'],
    ['Návrh grafické studie', 'TECHNICKÁ ZPRÁVA – obsahující popis řešení'],
    ['Studie proveditelnosti – část 3', ''],
    ['Projednání STUDIE PROVEDITELNOSTI', 'díky obsahu a zpracování je možné naši STUDII PROVEDITELNOSTI projednat v této fázi na odboru památkové péče HMP'],
    ['Projednání STUDIE PROVEDITELNOSTI', 'příprava podkladů pro jednání s odborem památkové péče HMP'],
    ['Projednání STUDIE PROVEDITELNOSTI', 'zajištění závazného stanoviska od odboru památkové péče HMP k předložené STUDII PROVEDITELNOSTI'],
  ] },
  { typ: 'cena', nadpis: 'CENA ZA STUDII PROVEDITELNOSTI – část 1', sekce: 'zamereni',
    popis: 'ZAMĚŘENÍ a zpracování výstupů' },
  { typ: 'cena', nadpis: 'CENA ZA STUDII PROVEDITELNOSTI – část 2', sekce: 'studie',
    popis: 'Vypracování STUDIE PROVEDITELNOSTI' },
  { typ: 'cena', nadpis: 'CENA ZA STUDII PROVEDITELNOSTI – část 3', sekce: 'projednani',
    popis: 'Projednání STUDIE PROVEDITELNOSTI na odboru památkové péče HMP' },
  { typ: 'cena', nadpis: 'STUDIE PROVEDITELNOSTI – variantní řešení', pausal: 'variantaSpKc',
    jednotka: '1 varianta', popis: 'Vypracování každé jedné další varianty řešení požadované Odborem památkové péče' },
  { typ: 'pozn', radky: [
    { cz: 'V případě, že se investor rozhodne pro zpracování STUDIE PROVEDITELNOSTI, navazující projekt pro POVOLENÍ ZÁMĚRU se zhotovuje rozšířením této studie do legislativně požadované úrovně. TATO SKUTEČNOST JE ZOHLEDNĚNA V CENĚ NAVAZUJÍCÍHO PROJEKTU.' },
    { cz: 'Zhotovitel předá objednateli dílo v počtu 2 paré tištěné dokumentace včetně elektronické podoby v PDF.' },
    { cz: 'Dokumentace bude zaslána v elektronické podobě objednateli na e-mailovou adresu. Objednatel má po předání díla 5 pracovních dní na případnou kontrolu a připomínky. V případě, že v této lhůtě nebudou zaslány žádné připomínky, je dohodnuto, že je dílo převzato bez výhrad.' },
  ] },

  /* ---------------- DPZ ---------------- */
  { typ: 'rozsah', nadpis: 'DOKUMENTACE PRO POVOLENÍ ZÁMĚRU (DPZ)', uvod: [
    { cz: 'Dokumentace pro povolení záměru (DPZ) navazuje na vzájemně odsouhlasenou STUDII PROVEDITELNOSTI. Ta rozpracovává dokumentaci dle platné vyhlášky do legislativou požadované úrovně s autorizacemi inženýrů dle příslušných oborů. Dokumentace pro povolení záměru obsahuje tyto části:' },
  ], radky: [
    ['Dokumentace pro povolení záměru – část 1', ''],
    ['Stavební část projektu', 'situace stavby – v rozsahu požadovaném pro řízení o povolení záměru'],
    ['Stavební část projektu', 'dokumentace stávajícího stavu – stav vycházející ze zaměření a původní dokumentace'],
    ['Stavební část projektu', 'bourací dokumentace – zakreslení rozsahu a postupu bouracích prací'],
    ['Stavební část projektu', 'dokumentace nového stavu – návrh umístění výtahu u objektu, návrh šachty a stavebních úprav'],
    ['Stavební část projektu', 'průvodní, souhrnná a technická zpráva'],
    ['Dokumentace pro povolení záměru – část 2', ''],
    ['Požárně bezpečnostní řešení', 'posouzení nové konstrukce z požárního hlediska a případné rozdělení objektu na nové požární úseky'],
    ['Požárně bezpečnostní řešení', 'stanovení požadavků na novou konstrukci, technologii a požární úseky dle stávajících norem'],
    ['Požárně bezpečnostní řešení', 'technická zpráva požárně bezpečnostního řešení'],
    ['Dokumentace pro povolení záměru – část 3', ''],
    ['Statický výpočet realizovatelnosti záměru', 'statické výpočty nových konstrukcí'],
    ['Statický výpočet realizovatelnosti záměru', 'posouzení reakcí výtahu na okolní konstrukce'],
    ['Statický výpočet realizovatelnosti záměru', 'statické posouzení souvisejících stavebních úprav'],
    ['Statický výpočet realizovatelnosti záměru', 'technická zpráva statika'],
    ['Dokumentace pro povolení záměru – část 4', ''],
    ['Elektro projekt', 'návrh nového rozvodu a hlavního jističe pro připojení výtahové technologie'],
    ['Elektro projekt', 'technická zpráva elektro v rozsahu pro stavební povolení'],
  ] },
  { typ: 'cena', nadpis: 'CENA ZA DOKUMENTACI PRO POVOLENÍ ZÁMĚRU (DPZ)', sekce: 'dpz',
    popis: 'Zpracování projektu pro DPZ, včetně PBŘ, STATIKY a ELEKTRO PROJEKTU',
    hvezdicka: 'Cena je platná v případě návaznosti na STUDII PROVEDITELNOSTI.' },

  /* ---------------- INŽENÝRSKÁ ČINNOST ---------------- */
  { typ: 'seznam', nadpis: 'INŽENÝRSKÁ ČINNOST (IČ)', radky: [
    'Kompletace podkladů pro vyjádření dotčených orgánů včetně plných mocí',
    'Podání a projednání na dotčených orgánech a zajištění stanovisek dotčených orgánů požadovaných STAVEBNÍM ÚŘADEM (Hasičský záchranný sbor, Hygienická stanice, Odbor životního prostředí, Národní památkový ústav, Odbor památkové péče a případné další)',
    'Zkompletování podkladů potřebných pro POVOLENÍ ZÁMĚRU, podání žádosti',
    'V průběhu celého řízení komunikujeme s dotčenými orgány i stavebním úřadem a obratem řešíme případné dotazy, aby se nezdržel průběh řízení',
    'Vyřízení POVOLENÍ ZÁMĚRU (dle platného stavebního zákona a požadavků stavebního úřadu)',
  ] },
  { typ: 'cena', nadpis: 'CENA ZA INŽENÝRSKOU ČINNOST (IČ)', sekce: 'ic', popis: 'Vyřízení POVOLENÍ ZÁMĚRU' },

  /* ---------------- DPS ---------------- */
  { typ: 'rozsah', nadpis: 'DOKUMENTACE PRO PROVEDENÍ STAVBY (DPS)', uvod: [
    { cz: 'Detailní prováděcí projekt, jehož zpracování doporučujeme, jasně určí rozsah, způsob provádění, detaily konstrukčních řešení a položky stavebních prací. Eliminuje vznik víceprací, nevhodný způsob provádění a zbytečné protažení realizace. Prováděcí projekt obsahuje tyto části:' },
  ], radky: [
    ['Dokumentace pro provedení stavby – část 1', ''],
    ['Stavební prováděcí část', 'detailní rozpracování stavební části projektu včetně potřebných konstrukčních detailů'],
    ['Stavební prováděcí část', 'popis a postup provádění stavebních prací'],
    ['Stavební prováděcí část', 'výpis nových prvků'],
    ['Stavební prováděcí část', 'realizační technická zpráva'],
    ['Dokumentace pro provedení stavby – část 2', ''],
    ['Statická prováděcí část', 'výkresy armování, detaily kotvících prvků atd.'],
    ['Statická prováděcí část', 'statická realizační zpráva'],
    ['Dokumentace pro provedení stavby – část 3', ''],
    ['Elektro prováděcí projekt', 'realizační projekt elektro pro návrh nového rozvodu a hlavního jističe pro připojení výtahové technologie'],
    ['Elektro prováděcí projekt', 'realizační technická zpráva elektro'],
  ] },
  { typ: 'cena', nadpis: 'CENA ZA DOKUMENTACI PRO PROVEDENÍ STAVBY (DPS)', sekce: 'dps',
    popis: 'Zpracování podle částí 1–3' },

  /* ---------------- EZC ---------------- */
  { typ: 'seznam', nadpis: 'EKONOMICKÁ ZADÁVACÍ ČÁST (EZC)', radky: [
    'ROZPOČET (oceněný výkaz výměr) jednotlivých profesí a všech stavebních prací',
    'VÝKAZ VÝMĚR (neoceněný výkaz výměr) pro nacenění prací od zhotovitele',
    'obsahuje kontrolu rozpočtu hlavním inženýrem projektu',
  ] },
  { typ: 'cena', nadpis: 'CENA ZA EKONOMICKOU ZADÁVACÍ ČÁST (EZC)', sekce: 'ezc',
    popis: 'Ekonomická zadávací část (rozpočet a výkaz výměr)' },

  /* ---------------- KOLAUDACE ---------------- */
  { typ: 'seznam', nadpis: 'ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ', radky: [
    'Zajištění termínu kolaudace se stavebním úřadem a s dotčenými orgány',
    'Kontrola kompletnosti dokladů ze strany zhotovitelů',
    'Vedení kolaudace bez nutnosti účasti stavebníka',
  ] },
  { typ: 'cena', nadpis: 'CENA ZA ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ', sekce: 'kolaudace', popis: 'KOLAUDAČNÍ ŘÍZENÍ',
    hvezdicka: 'Cena KOLAUDACE platí v případě uskutečnění KOLAUDACE do 2 let od nabytí právní moci povolení záměru.' },

  /* ---------------- GEODET ---------------- */
  { typ: 'seznam', nadpis: 'GEODETICKÉ ZAMĚŘENÍ', radky: [
    'Provedení zaměření geodetem',
    'Zpracování geometrického plánu',
  ] },
  { typ: 'cena', nadpis: 'CENA ZA GEODETICKÉ ZAMĚŘENÍ', sekce: 'geodet', popis: 'Geodetické zaměření a geometrický plán' },

  /* ---------------- ROZŠÍŘENÁ NABÍDKA ---------------- */
  { typ: 'nadpis', text: 'ROZŠÍŘENÁ NABÍDKA' },
  { typ: 'proza', nadpis: 'AUTORSKÝ DOZOR (AD)', odstavce: [
    { cz: 'V případě požadavku účasti projektanta na kontrolních dnech nebo v případě požadavku klienta v průběhu realizace. Autorský dozor doporučujeme v rámci stavby objednat.' },
  ] },
  { typ: 'cena', nadpis: 'MĚSÍČNÍ SAZBA ZA AUTORSKÝ DOZOR (AD)', pausal: 'autorskyDozorKcMesic', jednotka: 'měsíc',
    popis: 'Sazbu je možné určit i celkovou částkou za určité období, hradí se měsíčně. Obsahuje maximálně 30 hodin výkonu AD za měsíc.' },

  /* ---------------- podmínky ---------------- */
  { typ: 'seznam', nadpis: 'CENA NEZAHRNUJE', radky: [
    'Případné studie a průzkumy nad rámec nabídky',
    'Správní poplatky úřadům, správcům sítí a za KOLAUDACI',
    'Součástí ceny není řešení samostatných řízení vyplývajících z podmínek stanovisek DOSS, zejména pak Odboru památkové péče, a řešení námitek nebo odvolání účastníků řízení',
  ] },
  { typ: 'seznam', nadpis: 'POŽADOVÁNO OD INVESTORA', radky: [
    'Plná moc k přístupu do archivu stavebního úřadu',
    'Zajištění přístupu do objektu',
    'Součinnost investora, investorská schválení potřebných podkladů a návrhů',
  ] },
  { typ: 'pary', nadpis: 'DPH, SPLATNOST FAKTUR A PLATNOST NABÍDKY', klic: 'obchodni', radky: [] },

  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY ZAMĚŘENÍ', radky: [
    ['Platba po podpisu objednávky zaměření', '50 % z celkové ceny za zaměření'],
    ['Platba po ZHOTOVENÍ VÝSTUPŮ ze ZAMĚŘENÍ', '50 % z celkové ceny za zaměření'],
  ] },
  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY STUDIE PROVEDITELNOSTI (SP)', radky: [
    ['Platba po podpisu objednávky studie proveditelnosti', '50 % z celkové ceny za studii'],
    ['Platba po předání studie proveditelnosti', '40 % z celkové ceny za studii'],
    ['Platba po předání vyjádření odboru památkové péče HMP', '10 % z celkové ceny za studii'],
  ] },
  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY DPZ', radky: [
    ['Platba po podpisu objednávky', '50 % z nabídkové ceny za DPZ'],
    ['Platba po dokončení dokumentace pro povolení záměru v rozsahu pro podání na dotčené orgány', '30 % z nabídkové ceny za DPZ'],
    ['Platba po dokončení dokumentace pro povolení záměru v rozsahu pro podání na stavební úřad', '20 % z nabídkové ceny za DPZ'],
  ] },
  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY INŽENÝRSKÉ ČINNOSTI (IČ)', radky: [
    ['Platba po podpisu objednávky', '50 % z nabídkové ceny za IČ'],
    ['Platba po získání stanovisek dotčených orgánů a po podání dokumentace na stavební úřad a zahájení řízení', '30 % z nabídkové ceny za IČ'],
    ['Platba po vydání povolení záměru', '20 % z nabídkové ceny za IČ'],
  ] },
  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY DPS A EZC', radky: [
    ['Platba po podpisu objednávky dokumentace pro provedení stavby (DPS)', '50 % z nabídkové ceny za tuto činnost'],
    ['Platba po předání kompletní dokumentace pro provedení stavby (DPS)', '50 % z nabídkové ceny za tuto činnost'],
    ['Platba po podpisu objednávky ekonomické zadávací části (EZC)', '50 % z nabídkové ceny za tuto činnost'],
    ['Platba po předání ekonomické zadávací části (EZC)', '50 % z nabídkové ceny za tuto činnost'],
  ] },
  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY PRO ZAJIŠTĚNÍ KOLAUDAČNÍHO ŘÍZENÍ', radky: [
    ['Platba před zahájením kolaudačního řízení', '50 % z celkové ceny za tuto činnost'],
    ['Platba po vydání kolaudačního rozhodnutí', '50 % z celkové ceny za tuto činnost'],
  ] },
  { typ: 'pary', nadpis: 'PLATEBNÍ PODMÍNKY AUTORSKÉHO DOZORU', radky: [
    ['Platba po zajištění autorského dozoru a součtu hodin', '100 % z celkové ceny za tuto činnost, fakturováno měsíčně'],
  ] },

  { typ: 'pary', nadpis: 'TERMÍNY', radky: [
    ['Provedení detailního zaměření a stavebně technického průzkumu', 'ZAMĚŘENÍ na stavbě do 4 týdnů od objednání a předání plné moci; zpracování VÝSTUPŮ do 4–6 týdnů od zaměření'],
    ['Zpracování STUDIE PROVEDITELNOSTI (SP)', 'do 10–12 týdnů od zpracování výstupů ze zaměření'],
    ['Projednání s odborem památkové péče HMP', 'do cca 2–3 měsíců od podání žádosti – záleží na vytíženosti úředníků státní správy'],
    ['Zpracování dokumentace pro dotčené orgány (hrubopis DPZ)', 'do 10–12 týdnů od schválení studie investorem a objednání'],
    ['Zajištění stanovisek dotčených orgánů', 'cca do 4 týdnů od podání žádosti (v případě potřeby stanoviska hygieny a/nebo památkové péče cca do 2,5 měsíce)'],
    ['Dopracování dokumentace pro povolení záměru (čistopis DPZ)', 'proběhne v průběhu lhůty vyjádření dotčených orgánů'],
    ['Podání žádosti o povolení záměru', 'po obdržení souhlasných stanovisek dotčených orgánů (+ 14 dní v případě nutnosti zapracování podmínek dotčených orgánů do dokumentace)'],
    ['Inženýrská činnost (IČ) – vyřízení povolení záměru', 'cca 2 měsíce od podání žádosti + 1 měsíc na nabytí právní moci povolení záměru'],
    ['Zpracování dokumentace pro provedení stavby (DPS)', 'cca do 6 týdnů od schválení dokumentace a povolení záměru stavebním úřadem'],
    ['Ekonomická zadávací část (EZC)', 'do 2 týdnů od zpracování projektu pro provedení stavby'],
  ] },
  { typ: 'pozn', radky: [
    { cz: '*) Termíny pro vyjádření dotčených orgánů a stavebního úřadu nejsou závazné. Jedná se o termíny, které nemůže zhotovitel z velké části ovlivnit.' },
    { cz: 'Termíny zpracování mohou být upraveny dle volných kapacit zhotovitele v okamžiku objednání.' },
  ] },
];

/* Které sekce Kalkulace PROJ se v nabídce oceňují (pro rekapitulaci).
 * Pořadí = pořadí v dokumentu; 'zamereni' je jen jednou, i když ve VZORu
 * figuruje dvakrát (samostatně jako ZA a jako část 1 studie). */
const NABIDKA_PROJ_SEKCE = ['zamereni', 'studie', 'projednani', 'dpz', 'ic', 'dps', 'ezc', 'kolaudace', 'geodet'];

/* Sestaví data nabídky PROJ z varianty zakázky.
 * lang = 'cz' | 'en' | 'de' | 'fr' – překládají se nadpisy a krátké popisky;
 * souvislá próza ({ cz: … }) zůstává česky (nic se nevymýšlí).
 * Vrací { placeholders, bloky, rekapitulace, souhrn, jazyk, nazevSouboru }. */
function nabidkaProjData(zak, varianta, lang) {
  const L = lang || 'cz';
  const P = t => (L !== 'cz' && typeof tr === 'function') ? tr(t, L) : t;
  const d = (varianta && varianta.data) || {};
  const pj = d.proj || {};
  const r = vypocetProj(pj.zadani || DEFAULT_ZADANI_PROJ, pj.cenik || DEFAULT_CENIK_PROJ);

  /* #14 krok 3: formát bydlí ve format.js (záložka pro samostatný Node běh) */
  const kc = (typeof formatKc2 === 'function') ? formatKc2
    : n => (+n || 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kč';
  const datumCz = iso => {
    if (!iso) return '';
    const [y, m, dd] = String(iso).split('-');
    return dd && m && y ? `${dd}.${m}.${y}` : String(iso);
  };

  /* ceny sekcí podle klíče; sekce, která v kalkulaci není nebo vyšla nula,
   * se v nabídce označí jako neuvedená – nikdy se nedosazuje smyšlená částka */
  const ceny = {};
  r.sekce.forEach(s => { ceny[s.key] = s.celkem; });
  const cenaSekce = key => (ceny[key] == null ? null : ceny[key]);

  /* DPH: přednost má vlastní sazba projekční části (ceník PROJ). Starší zakázky
   * ji nemají – tam se použije dosud platná sazba z ceníku OCK, ať se čísla
   * po aktualizaci nezmění. */
  const dphPct = (pj.cenik && pj.cenik.dph != null) ? Math.round(pj.cenik.dph * 100)
    : (d.cenik && d.cenik.dph != null) ? Math.round(d.cenik.dph * 100) : NABIDKA_PROJ_SAZBY.dphPct;
  /* Obchodní zaokrouhlení (#38) se uplatní až na celek. Zaokrouhluje se
   * součet sekcí uvedených v TÉTO nabídce (ne r.souhrn.celkem), aby dokument
   * dával součet sám v sobě; rozdíl se v rekapitulaci ukáže vlastním řádkem. */
  const celkemPred = NABIDKA_PROJ_SEKCE.reduce((a, k) => a + (cenaSekce(k) || 0), 0);
  /* Nastavení si PROJ drží vlastní (4. 8. 2026) – u starších variant se
   * zaokrProjZ spadne na dosavadní společné pole, takže se cena nemění. */
  const zaokrP = (typeof zaokrProjZ === 'function') ? zaokrProjZ(d) : d.zaokr;
  const celkemBezDph = (typeof zaokrouhli === 'function') ? zaokrouhli(celkemPred, zaokrP) : celkemPred;
  const zaokrKcNum = Math.round((celkemBezDph - celkemPred) * 100) / 100;
  /* #14 krok 1: DPH jedinou funkcí (záložka pro Node test bez zaokrouhleni.js) */
  const dphKc = (typeof cenaSDph === 'function')
    ? cenaSDph(celkemBezDph, dphPct / 100).dphKc : celkemBezDph * dphPct / 100;

  /* --- rozbalení definice do bloků připravených k vykreslení --- */
  const proza = o => (o && typeof o === 'object' && o.cz !== undefined) ? o.cz : P(o);
  const bloky = NABIDKA_PROJ_DEF.map(b => {
    if (b.typ === 'nadpis') return { typ: 'nadpis', text: P(b.text) };
    if (b.typ === 'pozn') return { typ: 'pozn', radky: b.radky.map(proza) };
    if (b.typ === 'proza') {
      const odst = b.odstavce.map(proza);
      if (b.klic === 'popisZameru') {
        const vlastni = (zak && zak.popisZameru || '').trim();
        odst.length = 0;
        odst.push(vlastni || P('Popis záměru zatím není vyplněn – doplňte jej v kartě Zakázka.'));
      }
      return { typ: 'proza', nadpis: P(b.nadpis), odstavce: odst, prazdny: b.klic === 'popisZameru' && !(zak && zak.popisZameru || '').trim() };
    }
    if (b.typ === 'seznam') return { typ: 'seznam', nadpis: P(b.nadpis), radky: b.radky.map(P) };
    if (b.typ === 'rozsah') return { typ: 'rozsah', nadpis: P(b.nadpis),
      uvod: (b.uvod || []).map(proza),
      radky: b.radky.map(x => [P(x[0]), x[1] ? P(x[1]) : '']) };
    if (b.typ === 'pary') {
      if (b.klic === 'obchodni') return { typ: 'pary', nadpis: P(b.nadpis), radky: [
        [P('Současně platná sazba DPH'), dphPct + ' %'],
        [P('Splatnost faktur'), NABIDKA_PROJ_SAZBY.splatnostDni + ' ' + P('dní')],
        [P('Platnost nabídky'), NABIDKA_PROJ_SAZBY.platnostMesicu + ' ' + P('měsíce')],
      ] };
      return { typ: 'pary', nadpis: P(b.nadpis), radky: b.radky.map(x => [P(x[0]), P(x[1])]) };
    }
    /* typ === 'cena' */
    const pausal = b.pausal ? NABIDKA_PROJ_SAZBY[b.pausal] : null;
    const hodnota = pausal != null ? pausal : cenaSekce(b.sekce);
    const neuvedena = pausal == null && !hodnota;
    return { typ: 'cena', nadpis: P(b.nadpis), popis: P(b.popis), sekce: b.sekce || null,
      castka: neuvedena ? P('není součástí této nabídky') : kc(hodnota)
        + (b.jednotka ? ' / ' + P(b.jednotka) : ''),
      neuvedena: neuvedena,
      hvezdicka: b.hvezdicka ? P(b.hvezdicka) : '' };
  });

  const rekapitulace = NABIDKA_PROJ_SEKCE
    .filter(k => cenaSekce(k))
    .map(k => {
      const s = r.sekce.find(x => x.key === k);
      return [P(s ? s.nazev : k), kc(cenaSekce(k))];
    });

  /* hlavička nabídky PROJ je vlastní – nikoli hlavička OCK (viz zakazka.js).
   * Co v ní zůstalo prázdné, se dopíše z hlavičky OCK: nabídka bez názvu akce
   * a adresy je stejná vada jako v krycím listu PROJ. */
  const hZaklad = (typeof projHlavickaEfektivni === 'function') ? projHlavickaEfektivni(zak)
    : (typeof projHlavicka === 'function') ? projHlavicka(zak) : (zak || {});
  /* Číslo nabídky se bere z hlavičky OCK stejně jako v krycím listu PROJ
   * (zadání 29. 7. 2026) – kdyby to bylo jen v krycím listu, nesl by každý
   * ze dvou dokumentů jiné číslo. Kopie objektu, ať se do dat nic nezapíše. */
  const h = Object.assign({}, hZaklad);
  if (typeof projCisloNabidky === 'function') h.cislo = projCisloNabidky(zak);
  const placeholders = {
    OBJEDNATEL: h.objednatel || '…',
    OBJEDNATEL_KONTAKT: h.kontakt || '…',
    DATUM: datumCz(h.datum),
    NAZEV_AKCE: h.nazevAkce || '…',
    CISLO_NABIDKY: String(h.cislo || '').replace(/\s+/g, ''),
    ADRESA: h.adresa || '…',
    PROJ_CELKEM_BEZ_DPH: kc(celkemBezDph),
    PROJ_DPH_SAZBA: String(dphPct),
    PROJ_DPH_KC: kc(dphKc),
    PROJ_CELKEM_S_DPH: kc(celkemBezDph + dphKc),
    /* Prázdné, dokud zaokrouhlení nic nezměnilo (viz nabidka.js). */
    PROJ_ZAOKROUHLENI_KC: zaokrKcNum ? ((zaokrKcNum < 0 ? '− ' : '+ ') + kc(Math.abs(zaokrKcNum))) : '',
  };
  if (typeof firmaPlaceholders === 'function')
    Object.assign(placeholders, firmaPlaceholders(
      typeof firmaAktualni === 'function' ? firmaAktualni() : null, P));

  /* Zpracovatel nabídky (#146) – u projekce platí totéž co u OCK. */
  if (typeof zpracovatelPlaceholders === 'function')
    Object.assign(placeholders, zpracovatelPlaceholders(
      typeof firmaAktualni === 'function' ? firmaAktualni() : null));

  /* Smluvní a platební podmínky PROJ (#147) – tytéž symboly {{PODM_…}} jako
   * u OCK, jen ze druhého krycího listu. */
  if (typeof kryciProjPodminkoveSymboly === 'function')
    Object.assign(placeholders, kryciProjPodminkoveSymboly(zak, varianta, P));

  /* Název a popisek úvodní fotky jako textové symboly — obrázek jde zvlášť
   * (viz `obrazky` níž), tohle je popisek pod něj. */
  if (typeof uvodniFotoSymboly === 'function')
    Object.assign(placeholders, uvodniFotoSymboly(zak));

  const nazevSouboru = ('NABÍDKA_PROJ_' + (placeholders.CISLO_NABIDKY || 'OVP-CN')
    + (varianta && varianta.zakaznik ? '_' + varianta.zakaznik : '')
    + (L !== 'cz' ? '_' + L.toUpperCase() : '')).replace(/[\\/:*?"<>|]+/g, '-');

  return { placeholders, bloky, rekapitulace, jazyk: L, nazevSouboru,
    /* Úvodní fotka je vlastnost zakázky, ne kalkulace — projekční nabídka
     * ji dostane stejně jako nabídka OCK. Když ji šablona PROJ nemá kam dát,
     * nic se nestane: obrázek se vymění jen tam, kde je pro něj tvar. */
    obrazky: Object.assign({},
      typeof zpracovatelObrazky === 'function' ? zpracovatelObrazky() : {},
      typeof uvodniFotoObrazky === 'function' ? uvodniFotoObrazky(zak) : {}),
    souhrn: { bezDph: celkemBezDph, bezDphPred: celkemPred, zaokrKc: zaokrKcNum,
              dphPct: dphPct, dphKc: dphKc, sDph: celkemBezDph + dphKc } };
}

/* registrace do jednotného registru dokumentů (dokumenty.js) */
if (typeof dokumentRegistruj === 'function')
  dokumentRegistruj('nabidkaProj', {
    nazev: 'Cenová nabídka PROJ (OVP-CN)', sablona: 'Sablona_NABIDKA_PROJ.docx',
    builder: (zak, varianta, jekly, lang) => nabidkaProjData(zak, varianta, lang),
  });

if (typeof module !== 'undefined')
  module.exports = { nabidkaProjData, NABIDKA_PROJ_DEF, NABIDKA_PROJ_SAZBY, NABIDKA_PROJ_SEKCE };
