/* ============================================================
 * NASTAVENÍ ZOBRAZENÍ PODLE ROLÍ (zadání 5. 8. 2026)
 *
 * „Vytvořit v nastavení položku nastavení zobrazení, ve které bude podle rolí
 *  možné přiřazovat jednotlivá nastavení sloupců a funkcí v rozhraní napříč
 *  aplikací."
 *
 * Do dneška bylo v aplikaci jediné dělítko: `jeAdmin()`. Buď je někdo
 * administrátor a vidí všechno, nebo není a nevidí ceníky, náklady, marže,
 * Detail výpočtu, data specifikace a Nastavení. Role „Vedoucí" existovala jen
 * jako jméno v seznamu uživatelů a jako vyšší strop slevy — v rozhraní
 * neznamenala nic. Tenhle soubor to mění: každý skrytý prvek dostal jméno
 * (klíč) a u každého se dá zvlášť říct, jestli ho vidí Obchodník a jestli ho
 * vidí Vedoucí. Administrátor vidí vždycky všechno; kdyby si mohl něco
 * odebrat, neměl by se jak dostat zpátky k přepínači.
 *
 * PROČ SEZNAM V KÓDU A NE JEN V NASTAVENÍ
 * Kdyby prvky existovaly jen jako klíče v uložené konfiguraci, nikdo by po
 * čase nevěděl, co který klíč ovládá, a hlavně by se nedalo vypsat, co je
 * dnes skryté. Seznam je proto tady, s popisem a s tím, kde v aplikaci prvek
 * je — a souhrn „co je jen pro admina" (zadání téhož dne) se z něj generuje,
 * takže se dokument s aplikací nemůže rozejít.
 *
 * PROČ NĚKTERÉ PRVKY PŘIDĚLIT NEJDE (`pevne: true`)
 * Zobrazení je věc pohodlí, ne bezpečnosti. Skutečnou hranici drží server:
 * zveřejnit platný ceník, spravovat uživatele, měnit firemní údaje nebo
 * pořídit otisk databáze smí podle `netlify/functions/*` jen role
 * Administrátor a upravený prohlížeč s tím nic nesvede. Kdyby šlo takový
 * prvek „přidělit" v tomhle nastavení, aplikace by slibovala právo, které
 * server vzápětí odmítne — obchodník by viděl tlačítko a dostal by chybu 403.
 * Takové prvky jsou v seznamu vedené, aby byl přehled úplný, ale mají
 * `pevne: true` a v matici se nepřepínají.
 *
 * VÝCHOZÍ STAV = DNEŠEK, PŘESNĚ
 * `vychozi` u každého prvku popisuje, co která role vidí dnes, před zavedením
 * téhle matice. U drtivé většiny prvků to znamená „Obchodník ne, Vedoucí ne",
 * protože Vedoucí dnes v rozhraní žádnou výhodu nemá. Kdo tedy nastavení
 * neotevře, nepozná, že přibylo — a to je záměr. Návrh, co komu přidat, je
 * v poli `navrh` a slouží jako podklad k rozhodnutí, ne jako výchozí hodnota;
 * aplikace se podle `navrh` nikdy neřídí.
 * ============================================================ */

const ZOBRAZENI_ROLE_VZDY = 'Administrátor';   // vidí vše, nepřepíná se
const ZOBRAZENI_ROLE_PRIDELITELNE = ['Obchodník', 'Vedoucí'];

/* Skupiny jen kvůli přehlednosti matice i vygenerovaného souhrnu. */
const ZOBRAZENI_SKUPINY = [
  { klic: 'zalozky', nazev: 'Záložky aplikace' },
  { klic: 'cisla', nazev: 'Náklady, přirážka a marže' },
  { klic: 'nastaveni', nazev: 'Nastavení (ozubené kolo)' },
  { klic: 'data', nazev: 'Data, ceník a úložiště' },
  { klic: 'zakazky', nazev: 'Zakázky, zámek a slevy' },
];

/* Jeden prvek = jedna věc, kterou jde v rozhraní vidět nebo nevidět.
 *   klic     – ustálené jméno, pod kterým se ukládá volba (nikdy nepřejmenovávat)
 *   skupina  – viz ZOBRAZENI_SKUPINY
 *   nazev    – jak se prvek jmenuje v matici
 *   kde      – kde ho uživatel v aplikaci najde (aby bylo co ukázat)
 *   popis    – co konkrétně se skryje/ukáže a co to znamená v praxi
 *   pevne    – true = drží server, přidělit nejde (viz hlavička)
 *   vychozi  – co která role vidí DNES; { 'Obchodník': bool, 'Vedoucí': bool }
 *   navrh    – doporučení k rozhodnutí; { 'Obchodník': bool, 'Vedoucí': bool }
 *   proc     – proč to doporučení; text do souhrnu pro rozhodnutí
 */
const ZOBRAZENI_PRVKY = [
  /* ---------- záložky ---------- */
  {
    klic: 'tab.cenik', skupina: 'zalozky', nazev: 'Záložka Ceník nákladů OCK',
    kde: 'horní lišta záložek',
    popis: 'Celá záložka s nákupními cenami materiálu, prací a režií pro ocelovou konstrukci.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Nákupní ceny jsou to nejcitlivější, co aplikace obsahuje. Vedoucí je potřebuje spíš '
        + 'číst než měnit — pokud je má vidět, doporučuji to řešit až samostatným právem „jen '
        + 'čtení", ne otevřením celé záložky, kde se ceník i edituje a zveřejňuje.',
  },
  {
    klic: 'tab.cenikproj', skupina: 'zalozky', nazev: 'Záložka Ceník nákladů PROJ',
    kde: 'horní lišta záložek',
    popis: 'Totéž pro projekční práce: hodinové sazby, stupně dokumentace, přirážka PROJ.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Stejný důvod jako u ceníku OCK. Navíc je tu pole s přirážkou PROJ, jehož změna '
        + 'okamžitě mění cenu všech nových nabídek.',
  },
  {
    klic: 'tab.detail', skupina: 'zalozky', nazev: 'Záložka Detail výpočtu',
    kde: 'horní lišta záložek',
    popis: 'Krok za krokem, jak vznikla cena: počty rámů, spojek, kotev, mezisoučty, '
         + 'vzorce a rezervy.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Detail neukazuje nákupní ceny, ale ukazuje, z čeho se cena poskládala. Vedoucímu '
        + 'to dá možnost zkontrolovat podezřele levnou nabídku dřív, než odejde k zákazníkovi. '
        + 'Obchodníkovi to k jeho práci nepomůže a svádí to k dohadování o vzorcích.',
  },
  {
    klic: 'tab.specdata', skupina: 'zalozky', nazev: 'Záložka Technická specifikace OCK Data',
    kde: 'horní lišta záložek',
    popis: 'Editace číselníků a výchozích textů, ze kterých se skládá technická specifikace.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Je to nastavení produktu, ne práce na zakázce. Změna se propíše do všech budoucích '
        + 'specifikací — patří k jednomu člověku, který za znění ručí.',
  },

  /* ---------- náklady a marže ---------- */
  {
    klic: 'sloupce.naklad', skupina: 'cisla', nazev: 'Sloupce Náklad a Přirážka v kalkulaci',
    kde: 'Kalkulace OCK i PROJ – tabulka cenové kalkulace',
    popis: 'U každé položky se ukáže nákupní cena a kolik je na ní přirážky.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Z těchto sloupců se dá nákupní ceník odvodit položku po položce. Vedoucí, který '
        + 'schvaluje slevy, ale bez nich nepozná, kde je v nabídce prostor. Obchodníkovi stačí '
        + 'vidět, že je nabídka pod minimální marží (viz varovná lišta níž).',
  },
  {
    klic: 'pole.prirazka', skupina: 'cisla', nazev: 'Pole Globální přirážka',
    kde: 'Kalkulace OCK i PROJ – karta souhrnu',
    popis: 'Procento, o které se zvedá nákup na prodejní cenu. Změna přepočítá celou nabídku.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Přirážka je cenová politika firmy. Kdo ji smí měnit, obchází tím slevové stropy — '
        + 'nižší přirážka vypadá jinak než sleva, ale na výsledku je k nerozeznání.',
  },
  {
    klic: 'kpi.marze', skupina: 'cisla', nazev: 'Ukazatele Náklad / Hrubý zisk / Marže v hlavičce',
    kde: 'horní souhrn nad kalkulací',
    popis: 'Čtyři velká čísla nad kalkulací. Dnes se zapínají zvlášť v Nastavení '
         + '(NAST.kpiViditelne) a admin je vidí vždy.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Souhrnné číslo marže neprozradí jednotlivé nákupní ceny, ale řekne, jestli je '
        + 'zakázka zdravá. To je přesně to, co potřebuje vedoucí při schvalování slevy.',
  },
  {
    klic: 'porovnani.naklad', skupina: 'cisla', nazev: 'Řádky s nákladem a marží v porovnání variant',
    kde: 'Přehled cenových nabídek – Porovnání variant vedle sebe',
    popis: 'V tabulce porovnání se objeví i řádky Náklad, Hrubý zisk a Marže pro každou variantu.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Doporučuji držet stejně jako sloupce v kalkulaci — jinak by tatáž informace byla '
        + 'na jedné obrazovce skrytá a o dvě dál vidět.',
  },
  {
    klic: 'kontroly.cisla', skupina: 'cisla', nazev: 'Částky v kontrolách před odesláním',
    kde: 'Přehled cenových nabídek – panel Kontroly',
    popis: 'Kontroly hlásí problémy vždy všem. Tohle právo rozhoduje jen o tom, jestli se '
         + 'v hlášce ukáže konkrétní částka („marže 6,2 % proti minimu 10 %").',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Varování musí vidět i obchodník — nabídku posílá on. Číslo za varováním už je '
        + 'informace o nákladech.',
  },
  {
    klic: 'protokol.cisla', skupina: 'cisla', nazev: 'Částky v protokolu změn',
    kde: 'Přehled cenových nabídek – protokol o zásazích do zakázky',
    popis: 'Protokol zaznamenává, kdo co změnil. S tímto právem jsou u záznamů vidět i částky '
         + 'před změnou a po ní.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Protokol je nástroj kontroly. Kdo kontroluje, potřebuje čísla; kdo je kontrolovaný, '
        + 'je nepotřebuje.',
  },
  {
    klic: 'marze.lista', skupina: 'cisla', nazev: 'Čísla ve varovné liště marže',
    kde: 'lišta pod hlavičkou, když je nabídka pod minimální marží',
    popis: 'Lišta se rozsvítí vždy. Právo rozhoduje, jestli je v ní vidět o kolik a z jakých '
         + 'nákladů — bez něj hlásí jen „nabídka je pod minimální marží".',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Totéž jako u kontrol: samotné varování je bezpečnostní pojistka pro všechny, '
        + 'čísla za ním jsou nákladová informace.',
  },

  /* ---------- nastavení ---------- */
  {
    klic: 'nastaveni.otevrit', skupina: 'nastaveni', nazev: 'Ozubené kolo – vstup do Nastavení',
    kde: 'pravý horní roh',
    popis: 'Bez tohoto práva se do Nastavení nedostane vůbec nikdo mimo administrátora — '
         + 'ostatní práva ve skupině pak nemají co ovlivňovat.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Má smysl jen tehdy, když má vedoucí uvnitř aspoň jednu záložku (např. Slevy). '
        + 'Jinak by otevřel prázdné okno.',
  },
  {
    klic: 'nastaveni.slevy', skupina: 'nastaveni', nazev: 'Nastavení → Slevy',
    kde: 'Nastavení, vnitřní záložka Slevy',
    popis: 'Slevová schémata, stropy jednotlivých rolí, pojistka minimální marže.',
    vychozi: { 'Obchodník': true, 'Vedoucí': true },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Dnešní stav je nedopatření: záložka se dovnitř kreslí i bez role admina, jen se '
        + 'k ní běžný uživatel nedostane, protože je zamčené celé ozubené kolo. Až se '
        + 'Nastavení vedoucímu otevře, je namístě stropy zpřístupnit jemu, ne obchodníkovi — '
        + 'ten by si mohl zvednout vlastní strop.',
  },
  {
    klic: 'nastaveni.uzivatele', skupina: 'nastaveni', nazev: 'Nastavení → Uživatelé',
    kde: 'Nastavení, vnitřní záložka Uživatelé',
    popis: 'Seznam účtů, role, zakládání a deaktivace, reset cizího hesla.',
    pevne: true,
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Server (netlify/functions/uzivatele.mjs) pouští k seznamu i ke změnám jen roli '
        + 'Administrátor a reset hesla je vědomě jen jeho. Zobrazit tu záložku někomu jinému '
        + 'by znamenalo ukázat tlačítka, která skončí chybou.',
  },
  {
    klic: 'nastaveni.firma', skupina: 'nastaveni', nazev: 'Nastavení → Firma',
    kde: 'Nastavení, vnitřní záložka Firma',
    popis: 'IČO, DIČ, sídlo, bankovní spojení, logo — propisuje se do všech dokumentů.',
    pevne: true,
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Zveřejnění firemních údajů online drží server (netlify/functions/firma.mjs) na roli '
        + 'Administrátor. Chybné IČO nebo účet v nabídce je problém, který se hledá dlouho.',
  },
  {
    klic: 'nastaveni.sablony', skupina: 'nastaveni', nazev: 'Nastavení → Šablony',
    kde: 'Nastavení, vnitřní záložka Šablony',
    popis: 'Nahrané .docx šablony nabídek, ze kterých generátor skládá dokumenty.',
    vychozi: { 'Obchodník': true, 'Vedoucí': true },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Šablona určuje, jak vypadá vše, co odejde ven. Vedoucímu dává smysl (zaskočí za '
        + 'administrátora), obchodníkovi ne.',
  },
  {
    klic: 'nastaveni.konfigurace', skupina: 'nastaveni', nazev: 'Nastavení → Konfigurace (export/import)',
    kde: 'Nastavení, vnitřní záložka Konfigurace',
    popis: 'Export a import celé konfigurace aplikace jedním souborem.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Export konfigurace je nejrychlejší cesta, jak dostat nastavení firmy ven ze dveří; '
        + 'import je nejrychlejší cesta, jak ho přepsat. Zůstává u administrátora.',
  },
  {
    klic: 'nastaveni.slovnik', skupina: 'nastaveni', nazev: 'Nastavení → Slovník',
    kde: 'Nastavení, vnitřní záložka Slovník',
    popis: 'Porovnání překladového slovníku aplikace s tabulkou Vocabulary a přenos změn.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Údržba překladů se dělá dávkově a proti externí tabulce; do běžné práce '
        + 'na zakázce nepatří.',
  },
  {
    klic: 'nastaveni.atyp', skupina: 'nastaveni', nazev: 'Sazba přirážky za ATYP',
    kde: 'Nastavení → Obecné, pole „Přirážka za ATYP"',
    popis: 'Procento, kterým se u nestandardní zakázky navyšuje celá sekce Režie. '
         + 'Ukládá se u konkrétní zakázky.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Na rozdíl od globální přirážky je tohle rozhodnutí o jedné zakázce — „tahle je '
        + 'nestandardní o tolik". Vedoucí to u složité šachty posoudí líp než ceník.',
  },
  {
    klic: 'nastaveni.zobrazeni', skupina: 'nastaveni', nazev: 'Nastavení → Zobrazení (tato matice)',
    kde: 'Nastavení, vnitřní záložka Zobrazení',
    popis: 'Sama tato tabulka práv — tedy rozhodnutí o tom, co která role v aplikaci vidí.',
    pevne: true,
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Kdo mění práva, může si přidat všechna ostatní. Zůstává u administrátora, '
        + 'jinak by celá matice nic neznamenala.',
  },

  /* ---------- data, ceník, úložiště ---------- */
  {
    klic: 'cenik.zverejnit', skupina: 'data', nazev: 'Zveřejnit platný ceník online',
    kde: 'Ceník nákladů OCK / PROJ – karta online databáze',
    popis: 'Nahrání ceníku jako platného pro celou firmu; od té chvíle podle něj počítají všichni.',
    pevne: true,
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Pravidlo dané zadáním („zveřejnit platný ceník smí jen administrátor") a hlídané '
        + 'serverem v netlify/functions/program.mjs. Přidělit nejde.',
  },
  {
    klic: 'cenik.import', skupina: 'data', nazev: 'Import a export ceníku (Excel)',
    kde: 'Ceník nákladů OCK / PROJ – tlačítka nad tabulkou',
    popis: 'Načtení ceníku z tabulky a vyvedení do tabulky.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Export ceníku do Excelu je hotový soubor s nákupními cenami mimo aplikaci. '
        + 'To je přesně ta věc, která nemá opustit okruh administrátora.',
  },
  {
    klic: 'uloziste.slozka', skupina: 'data', nazev: 'Karta úložiště a připojení složky _DB',
    kde: 'Přehled cenových nabídek – karta úložiště; lišta „Připojit složku _DB"',
    popis: 'Mapování místní složky s databází zakázek a ceníků.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Obchodníkovi teče ceník z online databáze; složku na disku správce nemá a mít nemá '
        + '(rozhodnuto 4. 8. 2026). U vedoucího by platilo totéž.',
  },
  {
    klic: 'uloziste.mazani', skupina: 'data', nazev: 'Mazání zakázek ze složky a přestavba rejstříku',
    kde: 'karta úložiště',
    popis: 'Odstranění uloženého souboru zakázky a znovuvytvoření rejstříku úložiště.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Nevratné zásahy do dat. Drží se pravidla „nic se nemaže bez dotazu" — a mazat '
        + 'smí jeden člověk.',
  },
  {
    klic: 'zaloha.vynucena', skupina: 'data', nazev: 'Vynucená záloha databáze',
    kde: 'karta online databáze',
    popis: 'Okamžitý otisk celé databáze (zakázky, ceníky, uživatelé bez hesel).',
    pevne: true,
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Server (netlify/functions/zaloha_vynuceno.mjs) vyžaduje roli Administrátor. '
        + 'Otisk obsahuje všechna data firmy pohromadě.',
  },

  /* ---------- zakázky, zámek, slevy ---------- */
  {
    klic: 'zamek.odemknout', skupina: 'zakazky', nazev: 'Odemknutí odeslané nabídky',
    kde: 'Přehled cenových nabídek – řádek varianty, tlačítko „Odemknout…"',
    popis: 'Vytištěná (odeslaná) nabídka se zamkne, aby zůstal doklad o tom, co zákazník '
         + 'dostal. Odemknutí ji zase zpřístupní k úpravě — s důvodem do protokolu.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Nastane to běžně (zákazník si vyžádá změnu) a čekat na administrátora zdržuje. '
        + 'Důvod se zapisuje do protokolu, takže je dohledatelné, kdo zámek sundal a proč.',
  },
  {
    klic: 'varianta.smazatUzamcenou', skupina: 'zakazky', nazev: 'Smazání uzamčené (odeslané) varianty',
    kde: 'Přehled cenových nabídek – tlačítko Smazat u varianty',
    popis: 'Smazání varianty, která už odešla zákazníkovi, i s dokladem o odeslání.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': false },
    proc: 'Tady jde o zahlazení stopy, ne o práci s nabídkou. Odemknout a přepsat stačí; '
        + 'mazat doklad by měl smět jediný člověk.',
  },
  {
    klic: 'sleva.schvalovani', skupina: 'zakazky', nazev: 'Schvalování slevy nad strop role',
    kde: 'karta Sleva; nová záložka Schvalování slev',
    popis: 'Odklepnutí slevy, která přesahuje strop role zadavatele.',
    vychozi: { 'Obchodník': false, 'Vedoucí': false },
    navrh: { 'Obchodník': false, 'Vedoucí': true },
    proc: 'Přesně tohle je smysl role Vedoucí a dnes to v rozhraní neumí nikdo jiný než '
        + 'administrátor. Meze zůstávají v jeho stropu — nad ten půjde žádost dál.',
  },
];

/* ---------- pravidla ---------- */

/* Výchozí matice = přesně dnešní chování. Bere se z `vychozi` u prvků, aby
 * existovalo jediné místo, kde je „dnešek" popsaný. */
function zobrazeniVychozi() {
  const m = {};
  ZOBRAZENI_PRVKY.forEach(p => {
    m[p.klic] = {};
    ZOBRAZENI_ROLE_PRIDELITELNE.forEach(r => { m[p.klic][r] = !!(p.vychozi || {})[r]; });
  });
  return m;
}

function zobrazeniPrvek(klic) {
  return ZOBRAZENI_PRVKY.find(p => p.klic === klic) || null;
}

/* Smí role vidět prvek?
 *   role  – 'Obchodník' | 'Vedoucí' | 'Administrátor' (cokoli jiného = nejmenší práva)
 *   klic  – klíč prvku
 *   mat   – uložená matice (může být neúplná i undefined)
 *
 * Neznámý klíč vrací true. Je to schválně: kdyby se někde v UI zeptalo na
 * prvek, který v seznamu (ještě) není, nemá se kvůli překlepu ztratit kus
 * rozhraní. Že seznam a volání v UI sedí, hlídá test_zobrazeni.js. */
function zobrazeniSmi(role, klic, mat) {
  const p = zobrazeniPrvek(klic);
  if (!p) return true;
  if (role === ZOBRAZENI_ROLE_VZDY) return true;
  if (p.pevne) return false;                       // drží server, nepřiděluje se
  if (ZOBRAZENI_ROLE_PRIDELITELNE.indexOf(role) < 0) return false;
  const r = mat && mat[klic];
  if (!r || r[role] === undefined) return !!(p.vychozi || {})[role];
  return !!r[role];
}

/* Uloženou matici je potřeba umět přijmout i starou/poškozenou: doplní chybějící
 * prvky výchozí hodnotou, zahodí neznámé klíče (přejmenovaný prvek by jinak
 * zůstal navěky) a u pevných prvků drží false. */
function zobrazeniOciste(mat) {
  const out = zobrazeniVychozi();
  if (!mat || typeof mat !== 'object') return out;
  ZOBRAZENI_PRVKY.forEach(p => {
    const r = mat[p.klic];
    if (!r || typeof r !== 'object') return;
    ZOBRAZENI_ROLE_PRIDELITELNE.forEach(role => {
      if (r[role] === undefined) return;
      out[p.klic][role] = p.pevne ? false : !!r[role];
    });
  });
  return out;
}

/* Liší se matice od dnešního stavu? Používá se v souhrnu Nastavení, aby bylo
 * na první pohled vidět, že někdo něco přenastavil. */
function zobrazeniZmeny(mat) {
  const v = zobrazeniVychozi(), m = zobrazeniOciste(mat), zm = [];
  ZOBRAZENI_PRVKY.forEach(p => ZOBRAZENI_ROLE_PRIDELITELNE.forEach(r => {
    if (v[p.klic][r] !== m[p.klic][r]) zm.push({ klic: p.klic, role: r, nyni: m[p.klic][r] });
  }));
  return zm;
}

if (typeof module !== 'undefined')
  module.exports = {
    ZOBRAZENI_PRVKY, ZOBRAZENI_SKUPINY, ZOBRAZENI_ROLE_VZDY, ZOBRAZENI_ROLE_PRIDELITELNE,
    zobrazeniVychozi, zobrazeniPrvek, zobrazeniSmi, zobrazeniOciste, zobrazeniZmeny,
  };
