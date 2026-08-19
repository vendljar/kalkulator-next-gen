/* ============================================================
 * NABÍDKA (CN) – sestavení dat pro šablonu nabídky
 * Šablona: Sablona_NABIDKA_CN.docx (složka _CN); zástupné symboly {{...}}
 * se plní z řídící varianty zakázky: hlavička (Zakázka), technická
 * specifikace (záložka Technická specifikace) a ceny (Kalkulace OCK).
 * Dokument se generuje výhradně lokálně v prohlížeči (docxgen.js, Word)
 * nebo tiskovým náhledem; cesta přes Apps Script byla odstraněna 2. 8. 2026.
 * ============================================================ */

/* lang = 'cz' (výchozí) | 'en' | 'de' | 'fr' – jazyk HODNOT vkládaných do šablony.
 * Pevný text šablony překládá docxPrelozSablonu (docxgen.js); tady se překládají
 * jen dosazované hodnoty, aby výsledný dokument byl jazykově konzistentní.
 * Neznámý výraz zůstává česky (viz preklad.js) – nikdy se nic nevymýšlí. */
function nabidkaData(zak, varianta, jekly, lang) {
  const d = varianta.data;
  const Zv = d.ock.zadani, Cv = d.cenik, TSv = d.techspec;
  const r = vypocet(Zv, Cv, jekly, d.ock.fixes);

  const L = lang || 'cz';
  const P = t => (L !== 'cz' && typeof tr === 'function') ? tr(t, L) : t;

  /* #14 krok 3: formát bydlí ve format.js (záložka pro samostatný Node běh).
   * Měna (#155 + dorovnání 19. 8. večer): CZ = koruny; jiná mutace = eura
   * kurzem z ceníku varianty. Převádějí se ČÍSLA po položkách (celá eura
   * nahoru, mena.na) a součty se skládají z převedených čísel — rozpad
   * v dokumentu proto sedí na euro. Kurz se v dokumentu neukazuje; bez
   * kurzu se hodí srozumitelná chyba a dokument nevznikne. */
  const mena = (typeof menaDokumentu === 'function') ? menaDokumentu(L, Cv.kurzEurKc)
    : { eur: false, na: n => n,
        fmt: (typeof formatKc2 === 'function') ? formatKc2
          : n => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kč' };
  const kc = mena.fmt;
  const cislo = (typeof formatCislo === 'function') ? (n => formatCislo(n, 3))
    : n => (+n).toLocaleString('cs-CZ', { maximumFractionDigits: 3 });
  const datumCz = iso => {
    if (!iso) return '';
    const [y, m, dd] = iso.split('-');
    return dd && m && y ? `${dd}.${m}.${y}` : iso;
  };

  // hodnota pole technické specifikace (ruční přepis > prefill > výchozí)
  const pole = {};
  TECHSPEC_DEF.forEach(s => s.pole.forEach(p => { pole[p.id] = p; }));
  const ts = id => P(pole[id] ? tsHodnota(pole[id], TSv, r, Zv, Cv).text : ' -');

  // vnější rozměr: z ručního přepisu pole „ROZMĚR ŠACHTY – VNĚJŠÍ“, je-li ve tvaru „š × h“
  let sirkaVnejsi = ' -', hloubkaVnejsi = ' -';
  const mVnejsi = String(TSv.hodnoty.rozmerVnejsi || '').match(/(\d[\d\s]*)\D+(\d[\d\s]*)/);
  if (mVnejsi) { sirkaVnejsi = mVnejsi[1].trim(); hloubkaVnejsi = mVnejsi[2].trim(); }

  const prip = key => {
    const p = r.priplatky.find(x => x.key === key);
    return p ? kc(mena.na(p.sMarzi)) : P('v základní ceně');
  };

  /* Koncová cena: základní cena → schválená sleva (ZAK-10; neschválená ani
   * čekající se neuplatní) → obchodní zaokrouhlení (#38). Skládá to
   * zaokrouhleni.js, aby nabídka, krycí list i porovnání variant ukazovaly
   * stejné číslo. Od 12. 8. 2026 (#135) se do dokumentu vypisují rovnou
   * zaokrouhlené částky a řádek se zaokrouhlením v nabídce není — viz
   * `zakladZaokr` a `slevaKcVykaz` v zaokrouhleni.js. */
  const sleva = d.sleva || {};
  const cn = (typeof cenaNabidkyOck === 'function') ? cenaNabidkyOck(r, sleva, d.zaokr) : null;
  const slevaP = cn ? cn.slevaPct : ((typeof slevaPodil === 'function') ? slevaPodil(sleva) : 0);
  /* Do dokumentu jdou ZAOKROUHLENÉ částky (#135): cena před slevou i koncová
   * cena, a sleva jako jejich rozdíl. Rozpad tím sedí na korunu a v nabídce
   * nemusí být řádek „obchodní zaokrouhlení", který zákazníkovi nic neříká. */
  let cenaPredSlevou = cn ? cn.zakladZaokr : r.souhrn.zakladCena;
  let cenaBezDphNum = cn ? cn.cena : cenaPredSlevou * (1 - slevaP);
  let slevaKcNum = cn ? cn.slevaKcVykaz : cenaPredSlevou - cenaBezDphNum;
  /* DPH jedinou funkcí (#14 krok 1); v eurech se počítá až z PŘEVEDENÉHO
   * základu (nahoru), aby platilo bez DPH + DPH = s DPH na euro přesně. */
  let dphKcNum = (typeof cenaSDph === 'function'
    ? cenaSDph(cenaBezDphNum, Cv.dph) : { dphKc: cenaBezDphNum * Cv.dph }).dphKc;
  let cenaSDphNum = (typeof cenaSDph === 'function'
    ? cenaSDph(cenaBezDphNum, Cv.dph) : { sDph: cenaBezDphNum * (1 + Cv.dph) }).sDph;
  if (mena.eur) {
    cenaPredSlevou = mena.na(cenaPredSlevou);
    cenaBezDphNum = mena.na(cenaBezDphNum);
    slevaKcNum = cenaPredSlevou - cenaBezDphNum;   // rozdíl převedených částek — sedí na euro
    dphKcNum = Math.ceil(cenaBezDphNum * Cv.dph);
    cenaSDphNum = cenaBezDphNum + dphKcNum;
  }

  const placeholders = {
    OBJEDNATEL: zak.objednatel || '…',
    OBJEDNATEL_KONTAKT: zak.kontakt || '…',
    DATUM: datumCz(zak.datum),
    NAZEV_AKCE: zak.nazevAkce || TSv.nazevAkce || '…',
    /* Číslo varianty ≥ 2 se připojuje tečkou (…-555.2) — zadání 19. 8. 2026. */
    CISLO_NABIDKY: String((typeof cisloSVariantou === 'function'
      ? cisloSVariantou(zak, varianta) : zak.cislo) || '').replace(/\s+/g, ''),
    ADRESA: zak.adresa || '…',

    TS_UMISTENI: ts('umisteni'), TS_UMISTENI_STROJE: ts('umisteniStroje'),
    TS_ULOZENI: ts('ulozeni'), TS_VYSKA_CELKOVA: ts('vyskaCelkova'),
    TS_SIRKA_VNITRNI: String(Math.round(Zv.sirka * 1000)),
    TS_HLOUBKA_VNITRNI: String(Math.round(Zv.hloubka * 1000)),
    TS_SIRKA_VNEJSI: sirkaVnejsi, TS_HLOUBKA_VNEJSI: hloubkaVnejsi,
    TS_ZDVIH: cislo(Zv.zdvih), TS_DOLNI_PREJEZD: String(Math.round(Zv.prohluben * 1000)),
    TS_HORNI_PREJEZD: String(Math.round(Zv.prejezd * 1000)),
    TS_STANICE: ts('stanice'), TS_KABINA: ts('kabina'), TS_PUDORYS: ts('pudorys'),
    TS_USAZENI_CELNI: ts('usazeniCelni'), TS_USAZENI_BOCNI: ts('usazeniBocni'),
    TS_USAZENI_ZADNI: ts('usazeniZadni'),
    TS_TYP_KONSTRUKCE: ts('typKonstrukce'), TS_SVISLE_NOSNE: ts('svisleNosne'),
    TS_PROFIL_SLOUPKU: ts('profilSloupku'), TS_VODOROVNE_NOSNE: ts('vodorovneNosne'),
    TS_ROZTEC: ts('roztecPricniku'), TS_PROFIL_PRICNIKU: ts('profilPricniku'),
    TS_KOTVENI_POLOHA: ts('kotveniPoloha'), TS_KOTVENI_TYP: ts('kotveniTyp'),
    TS_PORTALY_PROSTOR: ts('portalyProstor'), TS_PORTALY_CLENENI: ts('portalyCleneni'),
    TS_POVRCH_UPRAVA: ts('povrchovaUprava'), TS_HAKY: ts('haky'),
    TS_STRECHA: ts('strecha'), TS_POZARNI: ts('pozarni'),
    TS_TYP_OPLASTENI: ts('typOplasteni'), TS_MATERIAL_OPLASTENI: ts('materialOplasteni'),
    TS_POVRCH_OPLASTENI: ts('povrchOplasteni'), TS_OPLASTENI_CELA: ts('oplasteniCela'),
    TS_ROZSAH_OPLASTENI: ts('rozsahOplasteni'), TS_OPLASTENI_NADSVETLIKU: ts('oplasteniNadsvetliku'),
    TS_UMISTENI_OPLASTENI: ts('umisteniOplasteni'), TS_KOTVENI_OPLASTENI: ts('kotveniOplasteni'),
    TS_PARAMETRY_KOTVY: ts('parametryKotvy'), TS_NAPOJENI_DVERI: ts('napojeniDveri'),
    TS_MONTAZNI_NOSNIK: ts('montazniNosnik'), TS_PRIPRAVA_KOTVENI: ts('pripravaKotveni'),
    TS_ODVETRANI: ts('odvetrani'), TS_PODCHOZI_OCK: ts('podchoziOck'),
    TS_PRECHODOVE_PLECHY: ts('prechodovePlechy'),
    TS_LESENI_UVNITR: ts('leseniUvnitr'), TS_LESENI_VNE: ts('leseniVne'),
    TS_ZABRANY_VSTUPY: ts('zabranyVstupy'),
    TS_SKEN3D: ts('sken3d'), TS_VYSTUP_ZAMERENI: ts('vystupZamereni'),
    TS_DILENSKA_DOK: ts('dilenskaDok'), TS_STATIKA: ts('statika'),
    TS_NENI_OSVETLENI: ts('neni1'), TS_NENI_VENTILATOR: ts('neni2'),
    TS_NENI_LESENI: ts('neni3'), TS_NENI_ODBERNE: ts('neni4'),
    TS_NENI_ULOZNE: ts('neni5'), TS_NENI_DOZDENI: ts('neni7'),
    TS_NENI_STAVEBNI: ts('neni8'),
    TS_NENI_SOKL: P(Zv.volitelne.sokl ? 'je součástí dodávky' : 'není součástí nabídky'),
    TS_NENI_NAPAJENI: ts('neni9'), TS_NENI_PROHLUBEN: ts('neni10'),
    TS_NENI_PRISTUP: ts('neni11'),

    CENA_BEZ_DPH: kc(cenaBezDphNum),
    DPH_SAZBA: String(Math.round(Cv.dph * 100)),
    DPH_NAZEV: P(Cv.dph <= 0.15 ? 'snížená' : 'základní'),
    DPH_KC: kc(dphKcNum),
    CENA_S_DPH: kc(cenaSDphNum),
    CENA_PRED_SLEVOU: kc(cenaPredSlevou),
    SLEVA_PROC: slevaP ? String(Math.round(slevaP * 10000) / 100) : '0',
    SLEVA_KC: kc(slevaKcNum),
    /* Symbol zůstává kvůli starším šablonám, ale je VŽDY prázdný (#135):
     * zaokrouhlují se položky, takže žádný dorovnávací řádek nevzniká.
     * Kdyby se klíč zrušil, zůstal by v takové šabloně viset text {{…}}. */
    ZAOKROUHLENI_KC: '',
    PRIP_LESENI_VNEJSI: prip('leseniVnejsi'),
    PRIP_SKN: prip('skn'),
  };

  // Firemní údaje zhotovitele (SET-3) – symboly {{FIRMA_…}} do šablony i náhledu.
  // Vlastní jména, adresy a čísla se nikdy nepřekládají, jen země (viz firma.js).
  if (typeof firmaPlaceholders === 'function')
    Object.assign(placeholders, firmaPlaceholders(
      typeof firmaAktualni === 'function' ? firmaAktualni() : null, P));

  /* Zpracovatel nabídky (#146) – symboly {{ZPRAC_…}} do bloku „Vypracoval“.
   * Nabídku podepisuje ten obchodní technik, který je právě přihlášený;
   * do 5. 8. 2026 byl v šabloně natvrdo jeden kolega. Bez přihlášení
   * (offline build na ploše) se použijí firemní údaje – viz zpracovatel.js. */
  if (typeof zpracovatelPlaceholders === 'function')
    Object.assign(placeholders, zpracovatelPlaceholders(
      typeof firmaAktualni === 'function' ? firmaAktualni() : null));

  /* Smluvní a platební podmínky (#147) – symboly {{PODM_…}}. Do 5. 8. 2026
   * byla procenta splátek a splatnost natvrdo v šabloně, takže se přepis
   * v podmínkách nabídky do odeslaného dokumentu nedostal. Teď jde do šablony
   * přesně to, co má obchodník v sekci pod „Celkem s DPH" (a tedy i v krycím
   * listu – je to jedno úložiště). */
  if (typeof kryciPodminkoveSymboly === 'function')
    Object.assign(placeholders, kryciPodminkoveSymboly(zak, varianta, jekly, P));

  // Příplatky do sekce „II. Rozšíření cenové nabídky" – včetně množství a ceny.
  // Zahrnou se položky nevyřazené v kalkulaci (sloupec „Nabídka" v tabulce příplatků).
  const vynech = Zv.priplatkyVynechat || [];
  const priplatkyList = r.priplatky.filter(p => !vynech.includes(p.key)).map(p => ({
    nazev: P(p.nazev),
    popis: P('množství') + ': ' + cislo(p.mnozstvi) + (p.pozn ? ' (' + P(p.pozn) + ')' : ''),
    cena: kc(mena.na(p.sMarzi)),
  }));

  const nazevSouboru = 'NABÍDKA_' + (placeholders.CISLO_NABIDKY || 'CN')
    + (varianta.zakaznik ? '_' + varianta.zakaznik : '')
    + (varianta.ridici ? '' : '_' + varianta.nazev)
    + (L !== 'cz' ? '_' + L.toUpperCase() : '');
  /* Úvodní fotka stavby (11. 8. 2026): obrázek do tvaru {{UVODNI_FOTO}}
   * a k němu název a popisek jako textové symboly, ať si je jde do šablony
   * dopsat pod obrázek. Do 11. 8. byla fotka jen v online náhledu a titulní
   * strana Wordu vozila fotografii cizí stavby ze šablony. */
  Object.assign(placeholders,
    typeof uvodniFotoSymboly === 'function' ? uvodniFotoSymboly(zak) : {});
  return { placeholders, priplatky: priplatkyList, jazyk: L,
           /* sken podpisu s razítkem (#146) + úvodní fotka stavby */
           obrazky: Object.assign({},
             typeof zpracovatelObrazky === 'function' ? zpracovatelObrazky() : {},
             typeof uvodniFotoObrazky === 'function' ? uvodniFotoObrazky(zak) : {}),
           nazevSouboru: nazevSouboru.replace(/[\\/:*?"<>|]+/g, '-') };
}

/* Struktura náhledu podkladů – stejné sekce jako v technické specifikaci/nabídce.
 * lang = 'cz' | 'en' | 'de' | 'fr' – překládají se NÁZVY SEKCÍ a POPISKY řádků;
 * hodnoty už přeložené přicházejí v ph (nabidkaData). Neznámý výraz zůstává česky. */
function nabidkaNahledSekce(ph, lang) {
  const L = lang || 'cz';
  const P = t => (L !== 'cz' && typeof tr === 'function') ? tr(t, L) : t;
  const sekce = [
    { sekce: 'HLAVIČKA NABÍDKY', radky: [
      ['Objednatel', ph.OBJEDNATEL], ['Kontaktní osoba', ph.OBJEDNATEL_KONTAKT], ['Datum', ph.DATUM],
      ['Název akce', ph.NAZEV_AKCE], ['Číslo nabídky', ph.CISLO_NABIDKY], ['Adresa stavby', ph.ADRESA]] },
    { sekce: 'ZÁKLADNÍ PARAMETRY ŠACHTY', radky: [
      ['UMÍSTĚNÍ ŠACHTY', ph.TS_UMISTENI], ['UMÍSTĚNÍ VÝTAHOVÉHO STROJE', ph.TS_UMISTENI_STROJE],
      ['ULOŽENÍ KONSTRUKCE', ph.TS_ULOZENI], ['CELKOVÁ VÝŠKA KONSTRUKCE [m] *', ph.TS_VYSKA_CELKOVA],
      ['ROZMĚR ŠACHTY – VNITŘNÍ [mm] *', P('šířka') + ' ' + ph.TS_SIRKA_VNITRNI + ' × ' + P('hloubka') + ' ' + ph.TS_HLOUBKA_VNITRNI],
      ['ROZMĚR ŠACHTY – VNĚJŠÍ [mm] *', P('šířka') + ' ' + ph.TS_SIRKA_VNEJSI + ' × ' + P('hloubka') + ' ' + ph.TS_HLOUBKA_VNEJSI],
      ['ZDVIH VÝTAHU [m] *', ph.TS_ZDVIH], ['DOLNÍ PŘEJEZD [mm]', ph.TS_DOLNI_PREJEZD],
      ['HORNÍ PŘEJEZD [mm]', ph.TS_HORNI_PREJEZD],
      ['POČET STANIC / NÁSTUPIŠŤ', ph.TS_STANICE + ' · ' + ph.TS_KABINA],
      ['PŮDORYSNÉ ŘEŠENÍ ŠACHTY', ph.TS_PUDORYS], ['USAZENÍ OCK – ČELNÍ STĚNA', ph.TS_USAZENI_CELNI],
      ['USAZENÍ OCK – BOČNÍ STĚNY', ph.TS_USAZENI_BOCNI], ['USAZENÍ OCK – ZADNÍ STĚNA', ph.TS_USAZENI_ZADNI]] },
    { sekce: 'KONSTRUKČNÍ ŘEŠENÍ ŠACHTY', radky: [
      ['TYP KONSTRUKCE (ENG-M)', ph.TS_TYP_KONSTRUKCE], ['SVISLÉ NOSNÉ PRVKY', ph.TS_SVISLE_NOSNE],
      ['PROFIL SLOUPKŮ **', ph.TS_PROFIL_SLOUPKU], ['VODOROVNÉ NOSNÉ PRVKY', ph.TS_VODOROVNE_NOSNE],
      ['SVISLÁ ROZTEČ PŘÍČNÍKŮ', ph.TS_ROZTEC], ['PROFIL PŘÍČNÍKŮ **', ph.TS_PROFIL_PRICNIKU],
      ['KOTVENÍ KONSTRUKCE (POLOHA)', ph.TS_KOTVENI_POLOHA], ['KOTVENÍ KONSTRUKCE (TYP)', ph.TS_KOTVENI_TYP],
      ['ŘEŠENÍ PORTÁLŮ (PROSTOROVÉ)', ph.TS_PORTALY_PROSTOR], ['ŘEŠENÍ PORTÁLŮ (ČLENĚNÍ)', ph.TS_PORTALY_CLENENI],
      ['POVRCHOVÁ ÚPRAVA KONSTRUKCE', ph.TS_POVRCH_UPRAVA], ['HÁKY PRO ČIŠTĚNÍ ŠACHTY', ph.TS_HAKY],
      ['STŘECHA ŠACHTY', ph.TS_STRECHA], ['POŽÁRNÍ KLASIFIKACE KONSTRUKCE', ph.TS_POZARNI]] },
    { sekce: 'OPLÁŠTĚNÍ ŠACHTY', radky: [
      ['TYP OPLÁŠTĚNÍ', ph.TS_TYP_OPLASTENI], ['MATERIÁL OPLÁŠTĚNÍ', ph.TS_MATERIAL_OPLASTENI],
      ['POVRCHOVÁ ÚPRAVA OPLÁŠTĚNÍ', ph.TS_POVRCH_OPLASTENI], ['OPLÁŠTĚNÍ ČELA POD NÁSTUPIŠTĚM', ph.TS_OPLASTENI_CELA],
      ['ROZSAH OPLÁŠTĚNÍ', ph.TS_ROZSAH_OPLASTENI], ['OPLÁŠTĚNÍ NADSVĚTLÍKŮ', ph.TS_OPLASTENI_NADSVETLIKU],
      ['VNĚJŠÍ OPLÁŠTĚNÍ ŠACHTY', ph.TS_UMISTENI_OPLASTENI], ['ZPŮSOB KOTVENÍ OPLÁŠTĚNÍ', ph.TS_KOTVENI_OPLASTENI],
      ['VZHLED KOTVENÍ ZASKLENÍ', ph.TS_PARAMETRY_KOTVY], ['NAPOJENÍ ŠACHETNÍCH DVEŘÍ', ph.TS_NAPOJENI_DVERI]] },
    { sekce: 'DOPLŇKOVÉ KONSTRUKCE', radky: [
      ['MONTÁŽNÍ NOSNÍK NEBO OKA', ph.TS_MONTAZNI_NOSNIK], ['PŘÍPRAVA PRO KOTVENÍ VÝTAHU', ph.TS_PRIPRAVA_KOTVENI],
      ['ODVĚTRÁNÍ ŠACHTY', ph.TS_ODVETRANI], ['PODCHOZÍ NOSNÁ OCK', ph.TS_PODCHOZI_OCK],
      ['PŘECHODOVÉ PLECHY V NÁSTUPIŠTÍCH', ph.TS_PRECHODOVE_PLECHY]] },
    { sekce: 'STAVEBNÍ A PŘÍPRAVNÉ PRÁCE', radky: [
      ['LEŠENÍ – UVNITŘ ŠACHTY', ph.TS_LESENI_UVNITR], ['LEŠENÍ – VNĚ ŠACHTY', ph.TS_LESENI_VNE],
      ['ZÁBRANY DO DVEŘNÍCH VSTUPŮ', ph.TS_ZABRANY_VSTUPY]] },
    { sekce: 'PROJEKČNÍ A PŘÍPRAVNÉ PRÁCE', radky: [
      ['ZAMĚŘENÍ PROSTORŮ 3D SKENEREM', ph.TS_SKEN3D], ['VÝSTUP ZE ZAMĚŘENÍ PRO OBJEDNATELE', ph.TS_VYSTUP_ZAMERENI],
      ['ZPRACOVÁNÍ DÍLENSKÉ DOKUMENTACE', ph.TS_DILENSKA_DOK], ['OVĚŘOVACÍ STATICKÝ VÝPOČET KONSTRUKCE', ph.TS_STATIKA]] },
    { sekce: 'SOUČÁSTÍ DODÁVKY NENÍ', radky: [
      ['OSVĚTLENÍ NÁSTUPIŠŤ', ph.TS_NENI_OSVETLENI], ['NUCENÉ VĚTRÁNÍ ŠACHTY VENTILÁTOREM', ph.TS_NENI_VENTILATOR],
      ['LEŠENÍ KOLEM OCK PRO PROVEDENÍ OPLÁŠTĚNÍ', ph.TS_NENI_LESENI],
      ['ODBĚRNÉ MÍSTO EL. ENERGIE PO DOBU REALIZACE', ph.TS_NENI_ODBERNE], ['ÚLOŽNÉ PROSTORY', ph.TS_NENI_ULOZNE],
      ['DOZDĚNÍ KOLEM ŠACHETNÍCH DVEŘÍ', ph.TS_NENI_DOZDENI], ['STAVEBNÍ PŘÍPRAVA', ph.TS_NENI_STAVEBNI],
      ['OPLECHOVÁNÍ SOKLU PROHLUBNĚ', ph.TS_NENI_SOKL], ['NAPÁJENÍ VÝTAHU VČET. REVIZNÍ ZPRÁVY', ph.TS_NENI_NAPAJENI],
      ['PROHLUBEŇ PRO ZALOŽENÍ OCK VE SPRÁVNÉ POZICI A ROZMĚRU', ph.TS_NENI_PROHLUBEN],
      ['DOSTATEČNÉ PŘÍSTUPOVÉ A MANIPULAČNÍ PROSTORY', ph.TS_NENI_PRISTUP]] },
    { sekce: 'B. OBCHODNÍ ČÁST – CENOVÁ NABÍDKA', radky: [
      ['Výtahová šachta (bez DPH)', ph.CENA_BEZ_DPH],
      /* skládaný popisek (číslo sazby uprostřed) se překládá po částech, proto je
       * označen jako HOTOVÝ – závěrečná mapa ho už nesmí překládat podruhé */
      [{ hotovo: P('DPH') + ' ' + ph.DPH_SAZBA + ' % (' + ph.DPH_NAZEV + ' ' + P('sazba') + ')' }, ph.DPH_KC],
      ['CELKEM za nabídku (včetně DPH)', ph.CENA_S_DPH]] },
  ];

  // Dodavatel (naše firma) – SET-3; sekce se vypustí, nejsou-li údaje vyplněné
  if (typeof firmaRadky === 'function') {
    const dodavatel = firmaRadky(typeof firmaAktualni === 'function' ? firmaAktualni() : null, null);
    if (dodavatel.length) sekce.push({ sekce: 'DODAVATEL', radky: dodavatel });
  }

  /* Popisek se přeloží právě jednou. Objekt { hotovo: … } znamená „už přeloženo“
   * (skládané popisky s číslem uprostřed) – ten se jen rozbalí. */
  const popisek = l => (l && typeof l === 'object' && l.hotovo !== undefined) ? l.hotovo : P(l);
  return sekce.map(s => ({ sekce: P(s.sekce), radky: s.radky.map(r => [popisek(r[0]), r[1]]) }));
}

/* registrace do jednotného registru dokumentů (dokumenty.js) */
if (typeof dokumentRegistruj === 'function')
  dokumentRegistruj('nabidka', {
    nazev: 'Cenová nabídka (CN)', sablona: 'Sablona_NABIDKA_CN.docx',
    builder: (zak, varianta, jekly, lang) => nabidkaData(zak, varianta, jekly, lang),
  });

if (typeof module !== 'undefined') module.exports = { nabidkaData, nabidkaNahledSekce };
