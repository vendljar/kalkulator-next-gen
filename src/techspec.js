/* ============================================================
 * TECHNICKÁ SPECIFIKACE – datový model záložky
 * Zdroj: Technická specifikacevzor.xlsx (list CHECKLIST SMLOUVA + číselníky _data)
 * Pole s prefill() se předvyplňují živě z kalkulace OCK; ruční hodnota
 * (override) má vždy přednost. ciselnik = položky rozbalovacích seznamů
 * z listů _data, vlastní text je vždy povolen.
 * ============================================================ */

const TS_C = { /* číselníky z listů _data (bez úvodní pomlčky) */
  umisteniSachty: ['v interiéru', 'v interiéru - v zrcadle schodiště', 'v interiéru - v ATRIU domu',
    'v exteriéru', 'v exteriéru, přisazena k fasádě', 'v exteriéru, přisazena k fasádě, umístěna na podchozí nosné OCK',
    'v exteriéru, přisazena k fasádě přes nástupní můstky',
    'v exteriéru, přisazena k fasádě přes nástupní můstky + podchozí nosná OCK'],
  umisteniStroje: ['v původní strojovně nad šachtou', 'v horní části OCK výtahové šachty (bezstrojovnový výtah)',
    'v prohlubni výtahové šachty (bezstrojovnový výtah)', 'v samostatné části vedle výtahové šachty',
    'hydraulický agregát v samostatné místnosti mimo šachtu'],
  ulozeniKonstrukce: ['na dně prohlubně výtahové šachty', 'na zpevněné hraně stěn prohlubně výtahové šachty',
    'na zpevněné hraně stěn spodní části výtahové šachty', 'na nosné základové desce',
    'na nosné základové desce v úrovni dvora', 'na nosné základové desce nad úrovní dvora'],
  pudorys: ['pravoúhlý tvar', 'pravoúhlý tvar, zkosené zadní rohy konstrukce', 'lichoběžník',
    'šestiúhelník', 'osmiúhelník', 'nepravidelný tvar (viz nákres)', 'kruhový tvar'],
  pruchoziKabina: ['neprůchozí kabina', 'průchozí kabina', 'diagonálně průchozí kabina', 'kabina se třemi vstupy'],
  usazeniCelni: ['přisazena k podestám (dle odchylky podest od svislice)',
    'přisazena k fasádě (dle odchylky podest od svislice)', 's nástupními můstky ve všech nadzemních nástupištích',
    'přisazena k podestám, v některých nástupištích přes můstky',
    'přisazena k fasádě, v nejvyšším nástupišti přes můstek', 'přisazena k fasádě (bez opláštění)',
    'dveřní vstup ze dvora (diagonálně průchozí kabina)'],
  usazeniBocni: ['mezera max. 5 cm', 'mezera 5-10 cm', 'vycentrováno do prostoru zrcadla schodiště',
    'dveřní vstup ze dvora (diagonálně průchozí kabina)', 'přisazena k fasádě (bez opláštění)',
    'přisazena k podestám (dle odchylky podest od svislice)'],
  usazeniZadni: ['dveřní vstup ze dvora (průchozí kabina)', 'nástupní můstky u protilehlých nástupišť',
    'průběžná, vedle schodiště/podest', 'průběžná, vedle podest, k jedné podestě nástupní můstek',
    'přisazena k fasádě (bez opláštění)'],
  typKonstrukce: ['montovaná, průběžná', 'svařovaná'],
  svisleNosne: ['4x rohový sloupek, ocelový uzavřený profil',
    '4x rohový sloupek + 2x sloupek v bočních stěnách, ocelové uzavřené profily',
    '4x rohový sloupek + 1x sloupek v zadní stěně, ocelové uzavřené profily',
    '6x sloupek ve vrcholech 6-ti úhelníkového půdorysu', '8x sloupek ve vrcholech 8-mi úhelníkového půdorysu'],
  vodorovneNosne: ['příčníky z ocelových uzavřených profilů'],
  profily: ['jekl 80x40', 'jekl 80x50', 'jekl 80x60', 'jekl 80x80', 'jekl 100x60', 'jekl 100x80', 'jekl 100x100'],
  roztec: ['cca 1000 mm', 'cca 1250 mm', '1250-1500 mm', 'max 1500 mm', 'rovnoměrné rozdělení dle podlaží', 'individuální řešení'],
  kotveniPoloha: ['prohlubeň, podesty ve všech nástupištích a hlava šachty',
    'prohlubeň, všechny podesty, hlava šachty a sloupky zadní stěny do schodnic'],
  kotveniTyp: ['kontaktní, přes chemické kotvy do zdiva', 'kontaktní, hmoždiny do ŽB konstrukcí',
    'kontaktní, přivařením k ocelovým nosníkům', 'kontaktní, přes antivibrační podložky'],
  portalyProstor: ['bez předsazených portálů', 'portál mezi sloupky šachty (nepředsazený na podestu)',
    'předsazený portál', 'stávající zděný portál'],
  portalyCleneni: ['řeší stavba', 'bez světlíků', 'světlík nade dveřmi', 'světlík nade dveřmi a na jedné straně š. dveří',
    'světlík nade dveřmi a na obou stranách š. dveří', 'světlík na jedné straně š. dveří',
    'světlík na obou stranách š. dveří', 'prosklení nade dveřmi a jedné straně vedle dveří',
    'prosklení nade dveřmi a obou stranách vedle dveří'],
  povrchovaUprava: ['lesklý ochranný lak v barvě RAL dle výběru objednatele',
    'matný ochranný lak v barvě RAL dle výběru objednatele', 'lesklý ochranný lak, odstín RAL 7016',
    'matný ochranný lak, odstín RAL 7016', 'ochranný vypalovaný lak, odstín RAL 7016'],
  haky: ['nejsou součástí konstrukce', '3 ks závěsných ok pro výškové práce', '6 ks závěsných ok pro výškové práce'],
  strecha: ['plochá pultová střecha se sklonem na dvůr, RAL 3011', 'plochá pultová střecha se sklonem na budovu, RAL 3011',
    'bez zastřešení (OCK končí pod stropem)', 'vodorovné zakrytí horního rámu plechem v barvě OCK',
    'plech v barvě shodné s nátěrem celé OCK',
    'plochá pultová střecha se sklonem na dvůr přetažená i přes nástupní můstek až k fasádě budovy, žlab není uvažován'],
  pozarni: ['materiály DP1, opláštění bez deklarované požární odolnosti',
    'materiály DP1, opláštění s deklarovanou požární odolností EW',
    'materiály DP1, opláštění s deklarovanou požární odolností EI', 'materiály DP1'],
  typOplasteni: ['plnostěnné', 'bez opláštění', 'řeší objednatel'],
  materialOplasteni: ['bez opláštění', 'sádrovláknité desky', 'cementotřískové desky', 'vrstvené bezpečnostní sklo VSG',
    'vrstvené bezpečnostní sklo VSG (v souladu i s ČSN 74 3305)', 'cementotřískové desky včetně zateplení',
    'izolační dvojsklo v kombinaci s vrstveným bezpečnostním sklem VSG',
    'vrstvené bezp. sklo ESG (kalené) s vrtanými otvory'],
  povrchOplasteni: ['čiré sklo', 'mléčné sklo', 'čiré sklo - hrany strojově broušeny',
    'mléčné sklo - hrany skel strojově broušeny', 'protisluneční sklo Cool Lite, Ug=1,1 W/m2.K',
    'standardní čirá skla, Ug=2,6 W/m2.K', 'reflexní vrstva pro omezení přehřívání interiéru šachty vlivem slunečního svitu',
    'minerální izolace, VPC omítka + fasádní barva', 'tmelené a broušené styky desek, bílý nátěr aplikovaný na stavbě'],
  oplasteniCela: ['bez opláštění', 'plech v celé ploše podesty', 'plechové lišty na bocích podest', 'dokončení provede stavba'],
  oplasteniPortalu: ['stejné jako šachta', 'bez opláštění, komplet dozdí stavba', 'cementotřískové desky',
    'sádrovláknité desky', 'vrstvené bezpečnostní sklo VSG vsazené do rámečků', 'vrstvené bezpečnostní sklo VSG',
    'izolační dvojskla vsazená do lakovaných rámečků', 'bez opláštění'],
  oplasteniNadsvetliku: ['izolační dvojskla vsazená do lakovaných rámečků', 'vrstvené bezpečnostní sklo VSG vsazené do rámečků'],
  umisteniOplasteni: ['vložené mezi ocelové profily konstrukce', 'kotvené na vnější stranu ocelové konstrukce',
    'předsazené před ocelovou konstrukci o cca 30 mm'],
  kotveniOplasteni: ['do L profilů mezi příčníky', 'na zasklívací terče', 'do rámečku z plechových lišt',
    'kotvy do otvorů vrtaných ve skle'],
  parametryKotvy: ['nerezové držáky do otvorů ve skle', 'obdélníkový terč 80x50, lakovaný RAL 7016, zapuštěné pozink šrouby',
    'obdélníkový terč 80x50, nerezový, zapuštěné pozink šrouby', 'kruhový terč průměr 70 mm, lakovaný, zapuštěný pozink šroub',
    'kruhový terč průměr 70 mm, nerezový, zapuštěný šroub', 'lakované lišty po obvodu skla', 'nerezové lišty po obvodu skla'],
  napojeniDveri: ['provede kompletně stavba po montáži šachetních dveří', 'bez dokrytí', 'řeší objednatel',
    'dokrytí lakovaným plechem', 'dokrytí nerezovým plechem'],
  anoNe: ['ano', 'ne'],
  dodavkaPozn: ['bezúplatně zajistí objednatel', 'bezúplatně zajistí majitel objektu', 'není řešeno',
    'není požadováno', 'není součástí nabídky', 'zajistí objednatel v rámci SP', 'zajistí objednatel',
    'lze doplnit - viz „Příplatky“', 'není součástí dodávky, zajistí objednatel',
    'není součást dodávky, lze doplnit viz příplatkové ceny', 'je součástí dodávky'],
  stavebniPrace: ['není součástí dodávky, zajistí objednatel', 'je součástí dodávky',
    'není součást dodávky, zajistí objednatel před montáží šachty', 'viz příplatky',
    'není součást dodávky, lze doplnit viz příplatkové ceny', 'je součástí dodávky pouze po dobu stavby šachty',
    'je součástí dodávky pro stavbu šachty i montáž výtahu', 'je součástí dodávky na celou dobu stavby',
    'je součástí dodávky pro dokončení opláštění v horním přejezdu',
    'je součástí dodávky pro provedení kompletního opláštění šachty', 'zůstane zachováno'],
};

/* Pomocné formátování čísel pro prefill */
const tsNum = (n, d = 0) => (+n).toLocaleString('cs-CZ', { maximumFractionDigits: d });

/* Definice dokumentu: sekce → pole. prefill(r, Z, C) vrací text z kalkulace OCK
 * (r = výsledek vypocet(), Z = zadání, C = ceník); bez prefill je výchozí def. */
const TECHSPEC_DEF = [
  { sekce: 'ZÁKLADNÍ PARAMETRY ŠACHTY', pole: [
    { id: 'umisteni', label: 'UMÍSTĚNÍ ŠACHTY', ciselnik: TS_C.umisteniSachty,
      prefill: (r, Z) => Z.typSachty === 'exteriérová' ? 'v exteriéru' : 'v interiéru' },
    { id: 'umisteniStroje', label: 'UMÍSTĚNÍ VÝTAHOVÉHO STROJE', ciselnik: TS_C.umisteniStroje,
      def: 'v horní části OCK výtahové šachty (bezstrojovnový výtah)' },
    { id: 'ulozeni', label: 'ULOŽENÍ KONSTRUKCE', ciselnik: TS_C.ulozeniKonstrukce,
      def: 'na dně prohlubně výtahové šachty' },
    { id: 'vyskaCelkova', label: 'CELKOVÁ VÝŠKA KONSTRUKCE [m] *',
      prefill: r => tsNum(r.odvozene.vyskaSachty, 3) },
    { id: 'rozmerVnitrni', label: 'ROZMĚR ŠACHTY – VNITŘNÍ [mm] *',
      prefill: (r, Z) => `šířka ${tsNum(Z.sirka * 1000)} × hloubka ${tsNum(Z.hloubka * 1000)}` },
    { id: 'rozmerVnejsi', label: 'ROZMĚR ŠACHTY – VNĚJŠÍ [mm] *', def: ' -' },
    { id: 'zdvih', label: 'ZDVIH VÝTAHU [m] *', prefill: (r, Z) => tsNum(Z.zdvih, 3) },
    { id: 'dolniPrejezd', label: 'DOLNÍ PŘEJEZD [mm]', prefill: (r, Z) => tsNum(Z.prohluben * 1000) },
    { id: 'horniPrejezd', label: 'HORNÍ PŘEJEZD [mm]', prefill: (r, Z) => tsNum(Z.prejezd * 1000) },
    { id: 'stanice', label: 'POČET STANIC / NÁSTUPIŠŤ', prefill: (r, Z) => `${Z.nastupiste} / ${Z.nastupiste}` },
    { id: 'kabina', label: 'PRŮCHOZÍ KABINA', ciselnik: TS_C.pruchoziKabina,
      prefill: (r, Z) => Z.pruchoziSachta ? 'průchozí kabina' : 'neprůchozí kabina' },
    { id: 'pudorys', label: 'PŮDORYSNÉ ŘEŠENÍ ŠACHTY', ciselnik: TS_C.pudorys, def: 'pravoúhlý tvar' },
    { id: 'usazeniCelni', label: 'USAZENÍ OCK – ČELNÍ STĚNA', ciselnik: TS_C.usazeniCelni,
      prefill: (r, Z) => Z.typSachty === 'exteriérová'
        ? 'přisazena k fasádě (dle odchylky podest od svislice)'
        : 'přisazena k podestám (dle odchylky podest od svislice)' },
    { id: 'usazeniBocni', label: 'USAZENÍ OCK – BOČNÍ STĚNY', ciselnik: TS_C.usazeniBocni, def: ' -' },
    { id: 'usazeniLeva', label: 'USAZENÍ OCK – LEVÁ BOČNÍ STĚNA', ciselnik: TS_C.usazeniBocni, def: ' -' },
    { id: 'usazeniPrava', label: 'USAZENÍ OCK – PRAVÁ BOČNÍ STĚNA', ciselnik: TS_C.usazeniBocni, def: ' -' },
    { id: 'usazeniZadni', label: 'USAZENÍ OCK – ZADNÍ STĚNA', ciselnik: TS_C.usazeniZadni, def: ' -' },
  ], pozn: '* Uvažované rozměry nabízené šachty vychází ze zadání objednatele. Po přesném zaměření skutečného stavu zhotovitelem se mohou změnit!' },

  { sekce: 'KONSTRUKČNÍ ŘEŠENÍ ŠACHTY', pole: [
    { id: 'typKonstrukce', label: 'TYP KONSTRUKCE (ENG-M)', ciselnik: TS_C.typKonstrukce, def: 'montovaná, průběžná' },
    { id: 'svisleNosne', label: 'SVISLÉ NOSNÉ PRVKY', ciselnik: TS_C.svisleNosne,
      prefill: (r, Z) => Z.rohoveSloupky <= 4 ? '4x rohový sloupek, ocelový uzavřený profil'
        : `${Z.rohoveSloupky}x sloupek, ocelové uzavřené profily` },
    { id: 'profilSloupku', label: 'PROFIL SLOUPKŮ **', ciselnik: TS_C.profily,
      prefill: (r, Z) => `jekl ${Z.profily.sloupek.dim}` },
    { id: 'vodorovneNosne', label: 'VODOROVNÉ NOSNÉ PRVKY', ciselnik: TS_C.vodorovneNosne,
      def: 'příčníky z ocelových uzavřených profilů' },
    { id: 'roztecPricniku', label: 'SVISLÁ ROZTEČ PŘÍČNÍKŮ', ciselnik: TS_C.roztec,
      prefill: (r, Z) => `cca ${tsNum(Z.roztec * 1000)} mm` },
    { id: 'profilPricniku', label: 'PROFIL PŘÍČNÍKŮ **', ciselnik: TS_C.profily,
      prefill: (r, Z) => `jekl ${Z.profily.precnikBok.dim}` },
    { id: 'kotveniPoloha', label: 'KOTVENÍ KONSTRUKCE (POLOHA)', ciselnik: TS_C.kotveniPoloha,
      def: 'prohlubeň, podesty ve všech nástupištích a hlava šachty' },
    { id: 'kotveniTyp', label: 'KOTVENÍ KONSTRUKCE (TYP)', ciselnik: TS_C.kotveniTyp,
      def: 'kontaktní, přes chemické kotvy do zdiva' },
    { id: 'portalyProstor', label: 'ŘEŠENÍ PORTÁLŮ (PROSTOROVÉ)', ciselnik: TS_C.portalyProstor,
      prefill: (r, Z) => Z.typPortalu === 'zapuštěný' ? 'bez předsazených portálů' : 'předsazený portál' },
    { id: 'portalyCleneni', label: 'ŘEŠENÍ PORTÁLŮ (ČLENĚNÍ)', ciselnik: TS_C.portalyCleneni,
      prefill: (r, Z) => {
        if (Z.svetlikNadDvermi && Z.svetlikyBoky === 2) return 'světlík nade dveřmi a na obou stranách š. dveří';
        if (Z.svetlikNadDvermi && Z.svetlikyBoky === 1) return 'světlík nade dveřmi a na jedné straně š. dveří';
        if (Z.svetlikNadDvermi) return 'světlík nade dveřmi';
        if (Z.svetlikyBoky === 2) return 'světlík na obou stranách š. dveří';
        if (Z.svetlikyBoky === 1) return 'světlík na jedné straně š. dveří';
        return 'bez světlíků';
      } },
    { id: 'povrchovaUprava', label: 'POVRCHOVÁ ÚPRAVA KONSTRUKCE', ciselnik: TS_C.povrchovaUprava,
      def: 'matný ochranný lak, odstín RAL 7016' },
    { id: 'haky', label: 'HÁKY PRO ČIŠTĚNÍ ŠACHTY', ciselnik: TS_C.haky,
      prefill: (r, Z) => Z.typSachty === 'exteriérová' && Z.volitelne.haky
        ? '3 ks závěsných ok pro výškové práce' : 'nejsou součástí konstrukce' },
    { id: 'strecha', label: 'STŘECHA ŠACHTY', ciselnik: TS_C.strecha,
      prefill: (r, Z) => Z.typSachty === 'exteriérová'
        ? 'plochá pultová střecha se sklonem na dvůr, RAL 3011' : 'bez zastřešení (OCK končí pod stropem)' },
    { id: 'pozarni', label: 'POŽÁRNÍ KLASIFIKACE KONSTRUKCE', ciselnik: TS_C.pozarni,
      def: 'materiály DP1, opláštění bez deklarované požární odolnosti' },
  ], pozn: '** parametry profilů se mohou změnit po zpracování statického posouzení' },

  { sekce: 'OPLÁŠTĚNÍ ŠACHTY', pole: [
    { id: 'typOplasteni', label: 'TYP OPLÁŠTĚNÍ', ciselnik: TS_C.typOplasteni, def: 'plnostěnné' },
    { id: 'materialOplasteni', label: 'MATERIÁL OPLÁŠTĚNÍ', ciselnik: TS_C.materialOplasteni,
      def: 'izolační dvojsklo v kombinaci s vrstveným bezpečnostním sklem VSG' },
    { id: 'povrchOplasteni', label: 'POVRCHOVÁ ÚPRAVA OPLÁŠTĚNÍ', ciselnik: TS_C.povrchOplasteni,
      prefill: (r, Z, C) => `standardní ${C.skloBokyNazev || 'čirá skla'}` },
    { id: 'oplasteniCela', label: 'OPLÁŠTĚNÍ ČELA POD NÁSTUPIŠTĚM', ciselnik: TS_C.oplasteniCela,
      def: 'plech v celé ploše podesty' },
    { id: 'rozsahOplasteni', label: 'ROZSAH OPLÁŠTĚNÍ', def: 'kompletní opláštění šachty' },
    { id: 'oplasteniPortalu', label: 'OPLÁŠTĚNÍ PORTÁLŮ NÁSTUPIŠŤ', ciselnik: TS_C.oplasteniPortalu, def: ' -' },
    { id: 'oplasteniNadsvetliku', label: 'OPLÁŠTĚNÍ NADSVĚTLÍKŮ', ciselnik: TS_C.oplasteniNadsvetliku,
      prefill: (r, Z) => Z.svetlikNadDvermi || Z.svetlikyBoky
        ? 'izolační dvojskla vsazená do lakovaných rámečků' : ' -' },
    { id: 'umisteniOplasteni', label: 'VNĚJŠÍ OPLÁŠTĚNÍ ŠACHTY', ciselnik: TS_C.umisteniOplasteni,
      def: 'kotvené na vnější stranu ocelové konstrukce' },
    { id: 'kotveniOplasteni', label: 'ZPŮSOB KOTVENÍ OPLÁŠTĚNÍ', ciselnik: TS_C.kotveniOplasteni,
      prefill: (r, Z) => Z.zaskleni === 'na terče' ? 'na zasklívací terče' : 'do L profilů mezi příčníky' },
    { id: 'parametryKotvy', label: 'VZHLED KOTVENÍ ZASKLENÍ', ciselnik: TS_C.parametryKotvy,
      prefill: (r, Z) => Z.zaskleni === 'na terče'
        ? 'obdélníkový terč 80x50, lakovaný RAL 7016, zapuštěné pozink šrouby' : 'lakované lišty po obvodu skla' },
    { id: 'napojeniDveri', label: 'NAPOJENÍ ŠACHETNÍCH DVEŘÍ', ciselnik: TS_C.napojeniDveri,
      def: 'dokrytí lakovaným plechem' },
  ] },

  { sekce: 'DOPLŇKOVÉ KONSTRUKCE', pole: [
    { id: 'montazniNosnik', label: 'MONTÁŽNÍ NOSNÍK NEBO OKA', def: 'na horním nosném rámu OCK' },
    { id: 'pripravaKotveni', label: 'PŘÍPRAVA PRO KOTVENÍ VÝTAHU',
      def: 'ano, oválné otvory pro kotvení konzolí vodítek a šachetních dveří v příčnících OCK včetně dodávky T šroubů M12 s podložkou' },
    { id: 'prosklenaPricka', label: 'PROSKLENÁ PŘÍČKA VEDLE ŠACHTY', def: ' -' },
    { id: 'odvetrani', label: 'ODVĚTRÁNÍ ŠACHTY',
      prefill: (r, Z) => Z.typSachty === 'exteriérová'
        ? 'přirozené, větrací mřížka v horní i dolní části zadní stěny výtahové šachty' : 'přirozené, do prostoru schodiště' },
    { id: 'prosklenaStriska', label: 'PROSKLENÁ STŘÍŠKA',
      prefill: (r, Z) => Z.typSachty === 'exteriérová' && Z.pruchoziSachta ? 'nad výstupem na dvůr' : ' -' },
    { id: 'podchoziOck', label: 'PODCHOZÍ NOSNÁ OCK', def: ' -' },
    { id: 'zabradliPodesty', label: 'ZÁBRADLÍ NA PODESTÁCH',
      prefill: (r, Z) => Z.typSachty !== 'exteriérová' && Z.volitelne.zabradli
        ? 'úpravy a napojení stávajícího zábradlí na podestách' : ' -' },
    { id: 'prechodovePlechy', label: 'PŘECHODOVÉ PLECHY V NÁSTUPIŠTÍCH',
      prefill: (r, Z) => Z.prechodovePlechy
        ? 'nerezový plech dle zaměření ve všech nástupištích' : 'nejsou součástí dodávky, viz příplatkové ceny' },
  ] },

  { sekce: 'STAVEBNÍ A PŘÍPRAVNÉ PRÁCE', pole: [
    { id: 'demontazOhrazeni', label: 'DEMONTÁŽ PŮVODNÍHO OHRAZENÍ', ciselnik: TS_C.stavebniPrace, def: ' -' },
    { id: 'upravaOkopu', label: 'ÚPRAVA PŮVODNÍCH OKOPŮ', ciselnik: TS_C.stavebniPrace, def: ' -' },
    { id: 'upravaSchodnic', label: 'ÚPRAVA A OPRAVA SCHODNIC', ciselnik: TS_C.stavebniPrace,
      def: 'není součástí dodávky, zajistí objednatel' },
    { id: 'demontazVytahu', label: 'DEMONTÁŽ PŮVODNÍHO VÝTAHU', ciselnik: TS_C.stavebniPrace, def: ' -' },
    { id: 'demontazPortalu', label: 'DEMONTÁŽ PORTÁLŮ', ciselnik: TS_C.stavebniPrace, def: ' -' },
    { id: 'leseniUvnitr', label: 'LEŠENÍ – UVNITŘ ŠACHTY', ciselnik: TS_C.stavebniPrace,
      prefill: (r, Z) => Z.volitelne.leseniVnitrni
        ? 'je součástí dodávky pouze po dobu stavby šachty' : 'není součást dodávky, lze doplnit viz příplatkové ceny' },
    { id: 'leseniVne', label: 'LEŠENÍ – VNĚ ŠACHTY', ciselnik: TS_C.stavebniPrace,
      prefill: (r, Z) => Z.volitelne.leseniVnejsi
        ? 'je součástí dodávky pro provedení kompletního opláštění šachty' : 'není součást dodávky, lze doplnit viz příplatkové ceny' },
    { id: 'ohrazeniProtiPadu', label: 'OHRAZENÍ ŠACHTY PROTI PÁDU', ciselnik: TS_C.stavebniPrace,
      def: 'není součástí dodávky, zajistí objednatel' },
    { id: 'zabranyVstupy', label: 'ZÁBRANY DO DVEŘNÍCH VSTUPŮ', ciselnik: TS_C.stavebniPrace,
      def: 'není součástí dodávky, zajistí objednatel' },
    { id: 'zabradliSchodiste', label: 'ZÁBRADLÍ NA SCHODIŠTI', ciselnik: TS_C.stavebniPrace, def: ' -' },
  ] },

  { sekce: 'PROJEKČNÍ A PŘÍPRAVNÉ PRÁCE', pole: [
    { id: 'sken3d', label: 'ZAMĚŘENÍ PROSTORŮ 3D SKENEREM', ciselnik: TS_C.anoNe, def: 'ano' },
    { id: 'vystupZamereni', label: 'VÝSTUP ZE ZAMĚŘENÍ PRO OBJEDNATELE', ciselnik: TS_C.anoNe,
      prefill: (r, Z) => Z.vystupZamereni ? 'ano' : 'ne' },
    { id: 'dilenskaDok', label: 'ZPRACOVÁNÍ DÍLENSKÉ DOKUMENTACE', ciselnik: TS_C.anoNe, def: 'ano' },
    { id: 'statika', label: 'OVĚŘOVACÍ STATICKÝ VÝPOČET KONSTRUKCE', ciselnik: TS_C.anoNe, def: 'ano' },
  ] },

  { sekce: 'SOUČÁSTÍ DODÁVKY NENÍ', volne: true, pole: [
    { id: 'neni1', label: 'OSVĚTLENÍ NÁSTUPIŠŤ', ciselnik: TS_C.dodavkaPozn, def: 'není součástí nabídky' },
    { id: 'neni2', label: 'NUCENÉ VĚTRÁNÍ ŠACHTY VENTILÁTOREM', ciselnik: TS_C.dodavkaPozn, def: 'není požadováno' },
    { id: 'neni3', label: 'LEŠENÍ KOLEM OCK PRO PROVEDENÍ OPLÁŠTĚNÍ', ciselnik: TS_C.dodavkaPozn, def: 'zajistí objednatel v rámci SP' },
    { id: 'neni4', label: 'ODBĚRNÉ MÍSTO EL. ENERGIE PO DOBU REALIZACE', ciselnik: TS_C.dodavkaPozn, def: 'bezúplatně zajistí objednatel' },
    { id: 'neni5', label: 'ÚLOŽNÉ PROSTORY', ciselnik: TS_C.dodavkaPozn, def: 'bezúplatně zajistí majitel objektu' },
    { id: 'neni6', label: 'DOKONČENÍ PODLAH NÁSTUPIŠŤ A NAPOJENÍ K PRAHŮM Š. DVEŘÍ', ciselnik: TS_C.dodavkaPozn, def: 'zajistí objednatel' },
    { id: 'neni7', label: 'DOZDĚNÍ KOLEM ŠACHETNÍCH DVEŘÍ', ciselnik: TS_C.dodavkaPozn, def: 'zajistí objednatel' },
    { id: 'neni8', label: 'STAVEBNÍ PŘÍPRAVA', ciselnik: TS_C.dodavkaPozn, def: 'zajistí objednatel v rámci SP' },
    { id: 'neni9', label: 'NAPÁJENÍ VÝTAHU VČETNĚ REVIZNÍ ZPRÁVY', ciselnik: TS_C.dodavkaPozn, def: 'není součástí nabídky' },
    { id: 'neni10', label: 'PROHLUBEŇ PRO ZALOŽENÍ OCK VE SPRÁVNÉ POZICI A ROZMĚRU', ciselnik: TS_C.dodavkaPozn, def: 'zajistí objednatel v rámci SP' },
    { id: 'neni11', label: 'DOSTATEČNÉ PŘÍSTUPOVÉ A MANIPULAČNÍ PROSTORY', ciselnik: TS_C.dodavkaPozn, def: 'zajistí objednatel v rámci SP' },
  ] },
];

const DEFAULT_TECHSPEC = {
  nazevAkce: 'přístavba/vestavba nové prosklené OCK výtahové šachty',
  hodnoty: {},     // { idPole: 'ruční hodnota' } – jen přepsaná pole; ostatní auto/výchozí
  extra: [],       // [{label, hodnota}] – vlastní doplněné řádky (sekce SOUČÁSTÍ DODÁVKY NENÍ apod.)
};

/* Výsledná hodnota pole: ruční přepis > prefill z kalkulace > výchozí text */
function tsHodnota(pole, ts, vysledekOck, Z, C) {
  if (ts.hodnoty[pole.id] != null) return { text: ts.hodnoty[pole.id], zdroj: 'ručně' };
  if (pole.prefill && vysledekOck) {
    try { return { text: pole.prefill(vysledekOck, Z, C), zdroj: 'z kalkulace' }; }
    catch (e) { /* spadne-li prefill, použij výchozí */ }
  }
  return { text: pole.def != null ? pole.def : ' -', zdroj: pole.prefill ? 'z kalkulace' : 'výchozí' };
}

/* ---------- Admin: editace dat (záložka „Technická specifikace OCK Data") ----------
 * TS_C = pojmenované číselníky (rolovací seznamy). Jedno pole odkazuje na pole
 * (array) číselníku PŘES REFERENCI, takže úprava seznamu na místě (in-place
 * splice/push) se hned promítne do všech pozic, které jej sdílejí, i do
 * záložky Technická specifikace. Výchozí hodnota se drží na poli (pole.def). */

/* mapa: reference číselníku (array) → klíč v TS_C */
const TS_C_KEY_OF = new Map();
Object.keys(TS_C).forEach(k => TS_C_KEY_OF.set(TS_C[k], k));
function tsCiselnikKlic(pole) { return pole.ciselnik ? TS_C_KEY_OF.get(pole.ciselnik) : null; }

/* mapa: klíč číselníku → seznam pozic, které jej používají [{id,label,sekce}] */
function tsCiselnikPouziti() {
  const m = {};
  Object.keys(TS_C).forEach(k => { m[k] = []; });
  TECHSPEC_DEF.forEach(s => s.pole.forEach(p => {
    const k = tsCiselnikKlic(p);
    if (k) m[k].push({ id: p.id, label: p.label, sekce: s.sekce });
  }));
  return m;
}

/* najdi definici pole podle id (napříč sekcemi) */
function tsPole(id) {
  for (const s of TECHSPEC_DEF) { const p = s.pole.find(x => x.id === id); if (p) return p; }
  return null;
}

/* snímky původního stavu (pro „vrátit vše na výchozí") */
const TS_C_ORIG = JSON.parse(JSON.stringify(TS_C));
const TS_DEF_ORIG = {};
TECHSPEC_DEF.forEach(s => s.pole.forEach(p => { TS_DEF_ORIG[p.id] = p.def; }));

/* ============================================================
 * TS-1: KONTROLA VYPLNĚNÍ – POUZE UPOZORNĚNÍ, NIC NEBLOKUJE
 * ------------------------------------------------------------
 * Specifikace se tiskne jako příloha smlouvy, takže prázdné povinné
 * položky je potřeba vidět dřív než zákazník. Kontrola proto jen
 * spočítá a vyjmenuje, co chybí – tisk, export ani uložení nikdy
 * nezastaví. Záměrně tu není žádné „nelze pokračovat“.
 * ============================================================ */

/* hlavička dokumentu (data leží v zakázce ZAK, ne v TS) */
const TS_HLAVICKA = [
  { id: 'cislo', label: 'ČÍSLO NABÍDKY', zdroj: 'zakazka' },
  { id: 'objednatel', label: 'OBJEDNATEL', zdroj: 'zakazka' },
  { id: 'datum', label: 'DATUM', zdroj: 'zakazka' },
  { id: 'nazevAkce', label: 'NÁZEV AKCE', zdroj: 'techspec' },
  { id: 'adresa', label: 'ADRESA STAVBY', zdroj: 'zakazka' },
];

/* Povinné položky dokumentu. Pomlčka „ -“ je legitimní odpověď u polí,
 * která se běžně neuplatní (usazení bočních stěn, doplňkové konstrukce),
 * proto v seznamu nejsou – hlídáme jen to, bez čeho specifikace nedává smysl. */
const TS_POVINNE = [
  'umisteni', 'umisteniStroje', 'ulozeni', 'vyskaCelkova', 'rozmerVnitrni', 'zdvih',
  'stanice', 'kabina', 'pudorys', 'usazeniCelni',
  'typKonstrukce', 'svisleNosne', 'profilSloupku', 'vodorovneNosne', 'roztecPricniku',
  'profilPricniku', 'kotveniPoloha', 'kotveniTyp', 'povrchovaUprava', 'strecha', 'pozarni',
  'typOplasteni', 'materialOplasteni', 'povrchOplasteni', 'umisteniOplasteni', 'kotveniOplasteni',
];

/* prázdné = nic, samá mezera nebo jen pomlčka (tak vypadá „nevyplněno“ v číselnících) */
function tsPrazdna(t) {
  const s = String(t == null ? '' : t).trim();
  return !s || s === '-' || s === '–';
}

/* tsKontrola(ts, r, Z, C, zak) → { ok, pocet, chybi[], hlavicka[], pole[] }
 * chybi = [{ id, label, sekce, druh }]; druh: 'hlavicka' | 'pole'.
 * Všechny argumenty kromě ts jsou volitelné (bez zakázky se hlavička přeskočí). */
function tsKontrola(ts, r, Z, C, zak) {
  const t = ts || { hodnoty: {}, extra: [] };
  const h = t.hodnoty || {};
  const chybi = [];

  if (zak) TS_HLAVICKA.forEach(p => {
    const val = p.zdroj === 'techspec' ? t[p.id] : zak[p.id];
    if (tsPrazdna(val)) chybi.push({ id: p.id, label: p.label, sekce: 'HLAVIČKA DOKUMENTU', druh: 'hlavicka' });
  });

  TECHSPEC_DEF.forEach(s => s.pole.forEach(p => {
    if (TS_POVINNE.indexOf(p.id) < 0) return;
    let text;
    try { text = tsHodnota(p, { hodnoty: h, extra: t.extra || [] }, r, Z, C).text; }
    catch (e) { text = h[p.id]; }
    if (tsPrazdna(text)) chybi.push({ id: p.id, label: p.label, sekce: s.sekce, druh: 'pole' });
  }));

  return {
    ok: chybi.length === 0,
    pocet: chybi.length,
    chybi: chybi,
    hlavicka: chybi.filter(x => x.druh === 'hlavicka'),
    pole: chybi.filter(x => x.druh === 'pole'),
  };
}

if (typeof module !== 'undefined')
  module.exports = { TECHSPEC_DEF, TS_C, DEFAULT_TECHSPEC, tsHodnota,
    TS_C_KEY_OF, tsCiselnikKlic, tsCiselnikPouziti, tsPole, TS_C_ORIG, TS_DEF_ORIG,
    TS_HLAVICKA, TS_POVINNE, tsPrazdna, tsKontrola };
