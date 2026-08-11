/* ============================================================
 * KALKULÁK – výpočetní jádro (přepis Excel šablony do JS)
 * Zdroj: Kalkulace montované OCK (VZOR v1.00 + aktualizace v22.7.1)
 * fixes=false  -> "kompatibilní režim": počítá 1:1 jako Excel (vč. chyb)
 * fixes=true   -> opravené logické chyby (viz README/dokumentace)
 * ============================================================ */

const CEIL = (x, m) => Math.ceil(x / m - 1e-9) * m;

// Konstanty spojů plechů (VZORCE řádky 44–52, sloupce O–T)
const SPOJE = {
  zadniRoh:      { int: { ks: 1, kg: 1.38,   m2: 0.059 },  ext: { ks: 4, kg: 3.732,  m2: 0.202 } },
  celni:         { int: { ks: 1, kg: 0.467,  m2: 0.0225 }, ext: { ks: 3, kg: 1.419,  m2: 0.07654 } },
  predsazene:    { int: { ks: 1, kg: 0.4777, m2: 0.027 },  ext: { ks: 1, kg: 0.4777, m2: 0.027 } },
  portPricniky:  { int: { ks: 1, kg: 0.38,   m2: 0.0167 }, ext: { ks: 2, kg: 0.125,  m2: 0.011968 } },
  sloupkyPortalu:{ int: { ks: 1, kg: 0.514,  m2: 0.0478 }, ext: { ks: 2, kg: 0.514,  m2: 0.0478 } },
  spodniRamRoh:  { int: { ks: 1, kg: 3.725,  m2: 0 },      ext: { ks: 3, kg: 12.025, m2: 0.49575 } },
  kotveni:       { int: { ks: 4, kg: 2.422,  m2: 0.172 },  ext: { ks: 4, kg: 3.12,   m2: 0.1704 } },
};

/* PRÁZDNÝ CENÍK – ve zdrojovém kódu nejsou žádné ceny, ani ukázkové.
 *
 * Skutečné nákupní ceny, sazby a marže jsou obchodní tajemství a ve
 * zdrojovém kódu nemají co dělat – ten se zálohuje na GitHub a jednou
 * poběží na serveru. Bydlí proto ve `_program.json` ve složce `_DB`, kde
 * má každá jejich změna datum, autora a zdůvodnění (viz program.js).
 * Aplikace si je odtud načte při spuštění a `progPouzij()` jimi obsah
 * tohoto objektu NA MÍSTĚ přepíše.
 *
 * Do 30. 7. 2026 tady ležel ukázkový ceník s kulatými čísly, aby se dala
 * aplikace předvést i bez připojené složky. Zadání z 30. 7. 2026 to ruší:
 *
 *   „Ukázkový ceník z aplikace prostě vymaž. S tím nabídka ven jít nesmí
 *    za žádnou cenu. Buď se z databáze natáhne ostrý ceník, anebo svítí
 *    všude nuly a není z čeho počítat."
 *
 * Důvod je obchodní, ne technický: dokud v sestavení leželo cokoli, co
 * se tvářilo jako ceník, existovala cesta, jak poslat zákazníkovi nabídku
 * spočítanou z vymyšlených čísel. Červený pruh na to upozorňoval, ale
 * upozornění se dá přehlédnout – nula se přehlédnout nedá.
 *
 * Zůstává jen STRUKTURA: seznam klíčů, které ceník musí obsahovat, aby
 * výpočet nespadl na `undefined` a aby bylo podle čeho poznat, co ještě
 * v načteném ceníku chybí. Všechny peněžní hodnoty jsou 0.
 *
 * Výjimky z nulování, ať nepřekvapí:
 *  - `dph` – zákonná sazba, ne naše cena. Nula by tiše vyrobila dokument
 *    se špatnou daní; nechat platnou sazbu je bezpečnější než nulu.
 *  - `lak.rezim` – přepínač způsobu lakování, ne částka.
 *  - `skloBokyNazev` / `skloCelniNazev` – názvy výrobku, prázdný řetězec.
 *
 * `ukazkove: true` zůstává jako značka „tohle nejsou ostré ceny" (jméno
 * klíče se nemění, aby na něj navázaná mašinérie fungovala beze změny),
 * `prazdny: true` k ní přidává „a navíc jsou samé nuly", aby hlášky mohly
 * říct pravdu: ceník není nahraný, není z čeho počítat. Obě zmizí samy –
 * konfigNahradVMiste() nahrazuje celý obsah objektu a skutečný ceník ze
 * složky tyhle klíče nemá. Zveřejnění ceníku (progZverejni) je ze zápisu
 * odstraňuje – uložit ceník do složky je vědomé prohlášení, že ceny jsou
 * skutečné.
 *
 * Testy si čísla berou ze `zkusebni_cenik.js`, který není v seznamu CORE
 * v `build.py`, takže do `dist/*.html` nevede žádná cesta. */
const DEFAULT_CENIK = {  // HODNOTY VYNULOVÁNY pro GitHub (pripravit_github.py) – reálný ceník je jen v lokální záloze
  ukazkove: true,
  prazdny: true,
  marze: 0, dph: 0,            // dph = zákonná sazba, ne naše cena
  profilasKgKc: 0,                // Kč/kg profily
  powertechExt: 0, powertechInt: 0, // Kč/kg plechy
  montazniNosnik: 0, lemovaniKgKc: 0,
  oplechPracKc: 0, nytKc: 0, spodniRamKc: 0, cilkoKc: 0,
  montazHodKc: 0, vetraciMrizkaKc: 0, transportKc: 0,
  zastreseniM2Kc: 0, oplechFasadaBmKc: 0,
  skloBokyKc: 0,  skloBokyNazev: '',
  skloCelniKc: 0, skloCelniNazev: '',
  praceOplasteniKc: 0, plastKotvyKc: 0, tmeleniKc: 0,
  striskaDvurKc: 0, cestovniKc: 0, cisteniKc: 0,
  /* leseniFix (11. 8. 2026) — JEDINÝ zdroj fixní části lešení. Do té doby
   * měla každá varianta lešení vlastní fixní klíč (vnitřní / vnější / hlava
   * šachty) a v předloze se tytéž řádky lišily: vnitřní 18 000 ve volitelných,
   * ale 15 000 v příplatcích, hlava šachty 0 a 5 000. Rozhodnutí uživatele:
   * jedna cena (18 000 Kč) a jedno místo, kde se mění. */
  prechodoveKgKc: 0, leseniVnitrniKc: 0, leseniFix: 0,
  leseniVnejsiKc: 0, hakyKc: 0, zabradliKc: 0, soklBmKc: 0,
  sken3dKc: 0, vystupZamereniKc: 0, engineeringKc: 0,
  projekceHodKc: 0, statikaKc: 0, statikaHod: 0, rezieKancelareKc: 0,
  stavbyvedouciHod: 0, stavbyvedouciKc: 0,
  atypPrirazka: 0,                // ATYP: přirážka k nákladu režie (viz zadání #22)
  zamecnikAtypKc: 0,              // ATYP: sazba za atypickou zámečnickou práci (#7) – viz Z.zamecnikAtypKc
  spojovaci: { riplockM10: 0, riplockM8: 0, nordlock: 0, nytM10: 0, nytM8: 0,
               nytM6: 0, tSrouby: 0, sroubM10: 0, sroubM8: 0, sroubM6: 0,
               zavitTyc: 0, chemKotva: 0 },
  lak: { rezim: 'tomas',          // rezim = přepínač, ne částka
         lakovnaProfilBm: 0, lakovnaListaBm: 0, lakovnaM2: 0,
         tomasProfilM2: 0, tomasListaBm: 0, tomasPlechKs: 0, tomasOplechM2: 0, tomasTercKs: 0 },
  priplatky: { vsgFolieM2: 0, sknM2: 0, zabranyPadKc: 0, medStrechaM2: 0,
               ventilatorKc: 0, zabranyDvereKc: 0, madlaBmKc: 0,
               leseniHlavaKc: 0, montazDveriKc: 0, prechMontKc: 0 },
};

const DEFAULT_ZADANI = {
  prejezd: 2.7, zdvih: 17.325, prohluben: 1.05,
  sirka: 1.51, hloubka: 1.515, roztec: 1.25,
  rohoveSloupky: 4, nastupiste: 6,
  typSachty: 'exteriérová', typPortalu: 'zapuštěný', zaskleni: 'na terče',
  svetlikNadDvermi: true, svetlikyBoky: 0,
  cistyVstupMm: 800, sirkaRamuMm: 100, prechodovePlechy: true,
  pruchoziSachta: false, atyp: false, vystupZamereni: false,
  profily: {
    sloupek:       { dim: '80x80', tl: 4 },
    precnikBok:    { dim: '80x80', tl: 3 },
    sloupekPortal: { dim: '40x40', tl: 3 },
    precnikPortal: { dim: '80x40', tl: 3 },
    spojka:        { dim: '70x70', tl: 3 },
    lemovani:      { dim: '60x30', tl: 2 },
  },
  rezervaProfilyPct: 0, rezervaPlechyPct: 0,
  montazZakladHod: 24, montazAtypHod: 0, projekceZakladHod: 50, projekceAtypHod: 0,
  /* zamecnikAtypKc = přepis sazby atypické zámečnické práce JEN pro tuhle zakázku.
   * Výchozí je prázdno (null), ne nula: prázdno znamená „platí ceník", kdežto
   * nula je platná dohoda („tohle uděláme zdarma"). Kdyby tu stála nula, ceníková
   * sazba by se nikdy neuplatnila a cena by zase vznikala ručně mimo ceník (#7). */
  zamecnikAtypKs: 0, zamecnikAtypKc: null, oplechOstatniKg: 10, oplechOstatniHod: 5,
  engineeringKs: 0, rezervaZakladPct: 0, rezervaPriplatkyPct: 0,
  volitelne: { prechodove: null /* null = dle zadání */, leseniVnitrni: true, leseniVnejsi: false,
               prechMont: null /* null = řídí se materiálem (jen opravený režim) */,
               leseniHlava: false,
               haky: true, zabradli: true, sokl: false },
  priplatkyVyber: null, // null = všechny (jako Excel); jinak pole klíčů
  mnozstviPrepis: {},   // ruční přepis množství položek kalkulace { název: množství }
  volitelneVlastni: [], // (starší) vlastní ruční položky sekce Volitelné [{nazev, mnozstvi, cena}]
  vlastniPolozky: { hrubaOck: [], atyp: [], oplasteni: [], volitelne: [], rezie: [],
                    spojovaci: [], lakovani: [] },  // vlastní položky v sekcích (spojovaci/lakovani = položky ceníku)
  priplatkyVlastni: [], // vlastní příplatkové položky [{nazev, mnozstvi, cena}]
  katalogOdebrane: [],  // kid katalogových položek, které uživatel v této zakázce smazal
  nazvyPrepis: {},      // ruční přejmenování položek { původní název: nový název }
  cenyPrepis: {},       // ruční přepis jedn. ceny u položek bez ceníkové vazby { název: cena }
  poradi: {},           // ruční pořadí řádků v sekcích { sekce: [klíče] } (jen zobrazení)
  skryteProUzivatele: [], // klíče položek skryté běžnému uživateli
  volitelneVychozi: {}, // výchozí zaškrtnutí volitelných { klíč: bool }
  priplatkyVynechat: [], // klíče příplatků, které se nemají propsat do nabídky
};

function vypocet(zadani, cenik, jekly, fixes = true) {
  const z = zadani, c = cenik;
  const ext = z.typSachty === 'exteriérová';
  const D16 = ext ? 0 : 1;              // Excel konvence: 1=interiér, 0=exteriér
  const zapusteny = z.typPortalu === 'zapuštěný';
  const terce = z.zaskleni === 'na terče';
  const svetlik = z.svetlikNadDvermi ? 1 : 0;

  const jekl = (p) => {
    const j = jekly[p.dim];
    if (!j) throw new Error('Neznámá dimenze profilu: ' + p.dim);
    const kg = j.kg[String(p.tl)];
    if (kg == null) throw new Error(`Dimenze ${p.dim} nemá tloušťku ${p.tl} mm`);
    return { kg, m2: j.m2, A: j.A, B: j.B };
  };

  /* ---------- odvozené parametry ---------- */
  const H = z.prejezd + z.zdvih + z.prohluben;         // výška šachty
  const vyskaPodlazi = z.zdvih / (z.nastupiste - 1);
  const svetlaVyska = vyskaPodlazi - 0.2;
  const vyskaProsklene = z.zdvih + z.prejezd;
  const sirkaDveri = (z.cistyVstupMm + 2 * z.sirkaRamuMm + 2 * 20) / 1000;
  const leseniVez = H;
  const leseniU = (z.sirka + 0.5 + 2 * (z.hloubka + 0.25)) * (z.prejezd + z.zdvih);

  /* ---------- hodiny navíc (montáž) ---------- */
  const hn = {
    vyska: (H - 21) * 0.5,
    sirka: z.sirka <= 2 ? 0 : H * 0.2,
    hloubka: z.hloubka <= 2 ? 0 : H * 0.2,
    sloupky: z.rohoveSloupky > 4 ? 8 + 4 + Math.max((H - 21) * 0.5, 0) * 2 : 0,
    nastupiste: z.nastupiste - 6,
    exterier: D16 === 1 ? 0 : 8 + (H - 21) * 0.5 * 1.5,
    portaly: zapusteny ? 0 : z.nastupiste,
    svetlik: (svetlik - 1) * z.nastupiste * 0.2,
    svetlikyBoky: z.svetlikyBoky * 0.5 * z.nastupiste,
  };
  const hodinyNavic = Object.values(hn).reduce((a, b) => a + b, 0);

  /* ---------- parametry konstrukce ---------- */
  const ramy = Math.ceil(H / z.roztec + 2 - 1e-9) + Math.abs(1 - D16); // počet rámů
  const portPricniky = 3 * z.nastupiste;
  const sloupkyPortalu = z.nastupiste * z.svetlikyBoky;
  const kratkePricniky = sloupkyPortalu * 2;
  const spojky = Math.ceil(H / 4 - 1e-9) * z.rohoveSloupky + z.rohoveSloupky;
  const pocetCilek = (ramy * 6 + portPricniky * 2 + kratkePricniky) * D16;

  /* ---------- profily (délky, hmotnosti, plochy) ---------- */
  const jSl = jekl(z.profily.sloupek), jPb = jekl(z.profily.precnikBok),
        jSp = jekl(z.profily.sloupekPortal), jPp = jekl(z.profily.precnikPortal),
        jSpj = jekl(z.profily.spojka), jLem = jekl(z.profily.lemovani);

  const dSloupky = H * z.rohoveSloupky - 0.2 * z.rohoveSloupky;
  const dPricniky = (2 * z.hloubka + z.sirka) * ramy + z.sirka;
  const dSloupkyPortalu = 2.2 * z.nastupiste * z.svetlikyBoky + (zapusteny ? 0 : z.nastupiste * svetlaVyska * 2);
  const dPricnikyPortalu = portPricniky * z.sirka + sloupkyPortalu * (z.sirka - sirkaDveri) * 2;
  const dSpojky = spojky * 0.4;
  const dLemovani = ext ? 3 * H : 0;

  const profilyRows = [
    { nazev: 'Profil - sloupek',            m: dSloupky,          j: jSl },
    { nazev: 'Profil - příčníky bok/zadek', m: dPricniky,         j: jPb },
    { nazev: 'Profil - sloupek portálu',    m: dSloupkyPortalu,   j: jSp },
    { nazev: 'Profil - příčníky portálu',   m: dPricnikyPortalu,  j: jPp },
    { nazev: 'Profil - spojka sloupků',     m: dSpojky,           j: jSpj },
  ].map(r => ({ ...r, kg: r.m * r.j.kg, m2: r.m * r.j.m2 }));

  let profM = profilyRows.reduce((a, r) => a + r.m, 0);
  let profKg = profilyRows.reduce((a, r) => a + r.kg, 0);
  let profM2 = profilyRows.reduce((a, r) => a + r.m2, 0);
  const rezP = z.rezervaProfilyPct;
  profM *= 1 + rezP; profKg *= 1 + rezP; profM2 *= 1 + rezP;
  const lemKg = dLemovani * jLem.kg, lemM2 = dLemovani * jLem.m2;

  /* ---------- plechy (spoje) ---------- */
  const strana = ext ? 'ext' : 'int';
  const spojeRows = [
    { key: 'zadniRoh',       spoju: ramy * 2 },
    { key: 'celni',          spoju: (ramy - 1) * 2 - 2 },
    { key: 'predsazene',     spoju: zapusteny ? 0 : 8 * z.nastupiste },
    { key: 'portPricniky',   spoju: portPricniky * 2 + kratkePricniky },
    { key: 'sloupkyPortalu', spoju: sloupkyPortalu },
    { key: 'spodniRamRoh',   spoju: 4 },
    { key: 'kotveni',        spoju: z.nastupiste + 1 },
  ].map(r => {
    const s = SPOJE[r.key];
    // Oprava chyb šablony: D51/D52 měly obrácenou podmínku int/ext, G52 odkazoval na prázdné $D$3
    let ksNa1, kgNa1, m2Na1;
    if (fixes) {
      ksNa1 = s[strana].ks; kgNa1 = s[strana].kg; m2Na1 = s[strana].m2;
    } else {
      const inv = (r.key === 'spodniRamRoh' || r.key === 'kotveni');
      ksNa1 = inv ? (ext ? s.int.ks : s.ext.ks) : s[strana].ks;
      kgNa1 = s[strana].kg;
      m2Na1 = (r.key === 'kotveni') ? s.ext.m2 : s[strana].m2; // $D$3 bug -> vždy ext
    }
    return { key: r.key, spoju: r.spoju, ks: ksNa1 * r.spoju, kg: kgNa1 * r.spoju, m2: m2Na1 * r.spoju };
  });
  const cilkaKg = pocetCilek * 0.12;
  let plechyKs = spojeRows.reduce((a, r) => a + r.ks, 0) + pocetCilek;
  let plechyKg = spojeRows.reduce((a, r) => a + r.kg, 0) + cilkaKg;
  let plechyM2 = spojeRows.reduce((a, r) => a + r.m2, 0);
  const rezPl = z.rezervaPlechyPct;
  const plechyKgRez = plechyKg * (1 + rezPl);

  /* ---------- terče / lišty / oplechování ---------- */
  const tercuBok = z.hloubka > 1.7 ? 3 : 2, tercuCelo = z.sirka > 1.7 ? 3 : 2;
  const terceKs = terce ? ramy * (tercuBok * 2 + tercuCelo) + tercuCelo * (portPricniky - z.nastupiste) + kratkePricniky : 0;
  const terceKg = terceKs * 0.15, terceM2 = terceKs * 0.008;

  const listyKs = terce ? 0 : ramy * 12 + svetlik * z.nastupiste * 4 + kratkePricniky * 4;
  const listyBm = terce ? 0
    : (ramy - 1) * (z.hloubka * 6 + (z.sirka + z.hloubka * 2) * 2)
      + svetlik * z.nastupiste * (z.sirka + svetlaVyska - 2.2) * 2
      + kratkePricniky * (1.1 + (z.sirka - sirkaDveri)) * 2;
  const listaKgBm = 8500 * ((20 / 1000 + 10 / 1000) * 1 / 1000);
  const listyCelkBm = listyBm + listyBm * 0.1;           // + kotvící lišty
  const listyKg = listaKgBm * listyCelkBm;

  const oplDvereKs = 3 * z.nastupiste;
  const oplDvereBm = (2.3 * 2 + sirkaDveri) * z.nastupiste;
  const oplDvereKg = oplDvereBm * 0.8925, oplDvereM2 = oplDvereBm * 0.21;

  const podestKs0 = z.nastupiste - 1;
  const podKg1 = 8.5 * (z.sirka + 0.06) * (vyskaPodlazi - svetlaVyska + 0.06);
  const podM21 = (z.sirka + 0.06) * (vyskaPodlazi - svetlaVyska + 0.06) * 2;
  const podestKs = podestKs0 * D16, podestKg = podKg1 * podestKs0 * D16, podestM2 = podM21 * podestKs0 * D16;

  const prechodoveAno = z.volitelne.prechodove == null ? z.prechodovePlechy : z.volitelne.prechodove;
  /* Montáž přechodových plechů má vlastní přepínač v OBOU režimech; prázdno
   * znamená „řídí se materiálem", tedy beze změny ceny proti dosavadnímu stavu. */
  const prechMontAno = (z.volitelne.prechMont != null) ? z.volitelne.prechMont : prechodoveAno;
  const prechKs = z.prechodovePlechy ? z.nastupiste : 0;
  const prechKg1 = 8500 * (0.1 * sirkaDveri * 0.002);
  const prechKg = prechKg1 * prechKs;

  /* ---------- spojovací materiál ---------- */
  const riplockM10 = (D16 === 1 ? 16 : 48) * ramy + portPricniky * 2 + sloupkyPortalu * 2 + spojky * 6 + z.nastupiste * 8;
  const riplockM8 = spojky * 6 + sloupkyPortalu * 4;
  const nordlock = pocetCilek * 2;
  const sroubM6 = terceKs * 2;
  const sp = c.spojovaci;
  const spojovaciRows = [
    ['riplock M10', riplockM10, sp.riplockM10], ['riplock M8', riplockM8, sp.riplockM8],
    ['NordLock', nordlock, sp.nordlock], ['nýtovací matice M10', riplockM10 + nordlock, sp.nytM10],
    ['nýtovací matice M8', riplockM8, sp.nytM8], ['nýtovací matice M6', sroubM6, sp.nytM6],
    ['T šrouby', (ramy + 2) / 2 * 4 + z.nastupiste * 4, sp.tSrouby],
    ['Šrouby M10', riplockM10 + nordlock, sp.sroubM10], ['Šrouby M8', riplockM8, sp.sroubM8],
    ['Šrouby M6', sroubM6, sp.sroubM6],
    ['Závitové tyče M12', Math.ceil((z.nastupiste + 1) * 4 * 0.2 + 0.8 - 1e-9), sp.zavitTyc],
    ['Chem. kotvy', z.nastupiste + 2, sp.chemKotva],
  ].map(([nazev, ks, cena]) => ({ nazev, ks, cena, celkem: ks * cena }));
  // vlastní položky spojovacího materiálu z ceníku (katalog / zakázka)
  const vlSpoj = (z.vlastniPolozky && Array.isArray(z.vlastniPolozky.spojovaci)) ? z.vlastniPolozky.spojovaci : [];
  vlSpoj.forEach(vl => spojovaciRows.push({
    nazev: vl.nazev, ks: +vl.mnozstvi || 0, cena: +vl.cena || 0,
    celkem: (+vl.mnozstvi || 0) * (+vl.cena || 0), vlastni: true,
  }));
  const spojovaciKc = spojovaciRows.reduce((a, r) => a + r.celkem, 0);
  const nytovaniKs = (riplockM10 + nordlock) + riplockM8 + sroubM6;

  /* ---------- lakování ---------- */
  const lakProfM2 = profM2 + (fixes ? lemM2 : 0);
  const lakProfBm = profM + (fixes ? dLemovani : 0);
  const lakOplechM2 = oplDvereM2 + (fixes ? podestM2 : podM21 * podestKs0); // šablona podesty negatuje jen v ceně, ne v lakování
  const lakPlechKs = plechyKs, lakPlechM2 = plechyM2;
  const L = c.lak;
  const lakovna = L.lakovnaProfilBm * lakProfBm + L.lakovnaListaBm * listyCelkBm
    + L.lakovnaM2 * (lakPlechM2 + lakOplechM2 + terceM2);
  const tomas = L.tomasProfilM2 * lakProfM2 + L.tomasListaBm * listyCelkBm
    + L.tomasPlechKs * lakPlechKs + L.tomasOplechM2 * lakOplechM2 + L.tomasTercKs * terceKs;
  // vlastní položky lakování z ceníku (katalog / zakázka) – přičítají se k oběma režimům
  const vlLakRows = ((z.vlastniPolozky && Array.isArray(z.vlastniPolozky.lakovani)) ? z.vlastniPolozky.lakovani : [])
    .map(vl => ({ nazev: vl.nazev, ks: +vl.mnozstvi || 0, cena: +vl.cena || 0,
                  celkem: (+vl.mnozstvi || 0) * (+vl.cena || 0), vlastni: true }));
  const lakVlastniKc = vlLakRows.reduce((a, r) => a + r.celkem, 0);
  const lakovaniKc = (L.rezim === 'tomas' ? tomas : lakovna) + lakVlastniKc;

  /* ---------- zasklení ---------- */
  const Asl = jSl.A / 1000, Bsl = jSl.B / 1000, Bpr = jPb.B / 1000, Apr = jPb.A / 1000;
  const gTerc = { hl: z.hloubka + Bpr * 2 - 0.01, sir: z.sirka + Bpr * 2 + 0.02, vys: z.roztec - 0.016 };
  const gLis = { hl: z.hloubka - Asl / 2 - 0.008, sir: z.sirka - Bsl * 2 - 0.008, vys: z.roztec - Apr - 0.008 };
  const g = terce ? gTerc : gLis;
  const zadniKs = Math.ceil(vyskaProsklene / z.roztec - 1e-9);
  const zadniM2 = Math.max(zadniKs * g.sir * g.vys, vyskaProsklene * g.sir);
  const bocniKs = zadniKs * 2;
  const bocniHl = fixes ? g.hl : (svetlik ? gTerc.hl : gLis.hl);   // chyba šablony: D19 místo D18
  const bocniM2 = Math.max(bocniKs * g.hl * g.vys, 2 * vyskaProsklene * bocniHl);
  const svetlikKs = svetlik * z.nastupiste;
  const svetlikM2 = svetlikKs * g.sir * (svetlaVyska - 2.3);
  const svetlikBokKs = kratkePricniky;
  const svetlikBokM2 = svetlikBokKs * ((g.sir - sirkaDveri - 0.04) / Math.max(1, z.svetlikyBoky)) * 1.1;
  const skloBokyZadniM2 = bocniM2 + zadniM2;
  const skloCelniM2 = svetlikM2 + svetlikBokM2;
  const skloCelkemM2 = skloBokyZadniM2 + skloCelniM2;

  /* ---------- montáž + projekce ---------- */
  const montazHod1 = z.montazZakladHod + hodinyNavic + z.montazAtypHod;
  const montazHod = montazHod1 * 4;
  const projekceHod = z.projekceZakladHod + z.projekceAtypHod;

  /* ---------- položky kalkulace ---------- */
  const m = c.marze;
  /* Rejstřík všech názvů, které v tomhle běhu vznikly – včetně položek, které
   * se nakonec do výsledku nedostanou (nevybrané příplatky). Ruční přepisy
   * (mnozstviPrepis / cenyPrepis / nazvyPrepis) jsou klíčované právě názvem,
   * takže po přejmenování položky v ceníku zůstane přepis viset na klíči, který
   * už nic nepotká. Rejstřík umožňuje takové sirotky najít – viz prepisy.js (#4). */
  const nazvyPolozek = [];
  const zapisNazev = n => { if (n != null && nazvyPolozek.indexOf(n) === -1) nazvyPolozek.push(n); };
  const mkItem = (nazev, mnozstvi, cena, opts = {}) => {
    zapisNazev(nazev);
    // klíčem pro přepisy je PŮVODNÍ název položky
    // ruční přepis množství (Z.mnozstviPrepis[název]) má přednost před vypočteným
    /* #14 krok 2: „prázdno není nula" — stejná sémantika jako v projekci.
     * Formulář prázdný přepis maže, takže '' sem doteče jen z importu;
     * dřív by z něj bylo množství 0, teď platí spočtené. */
    const prepis = z.mnozstviPrepis ? z.mnozstviPrepis[nazev] : null;
    const prepisJe = (typeof prepisPlati === 'function') ? prepisPlati(prepis) : prepis != null;
    const mn = prepisJe ? +prepis : mnozstvi;
    // jedn. cena: rows s ceníkovou vazbou (opts.cenaPath) berou cenu odtud (obousměrně s ceníkem),
    // ostatní mohou mít ruční přepis Z.cenyPrepis[název]; jinak vypočtená/ceníková cena
    const cenaPrepisSurova = (!opts.cenaPath && z.cenyPrepis) ? z.cenyPrepis[nazev] : null;
    const cenaPrepis = ((typeof prepisPlati === 'function') ? prepisPlati(cenaPrepisSurova)
                        : cenaPrepisSurova != null) ? +cenaPrepisSurova : null;
    const cenaEff = cenaPrepis != null ? cenaPrepis : cena;
    let naklad;
    if (opts.fix != null) naklad = mn * cenaEff + opts.fix;                    // lešení: m×cena + fixní část
    else if (opts.naklad != null && cenaPrepis == null)
      naklad = prepis != null && mnozstvi ? opts.naklad * (mn / mnozstvi) : opts.naklad;
    else naklad = mn * cenaEff;
    const novyNazev = z.nazvyPrepis ? z.nazvyPrepis[nazev] : null;
    return { nazev: novyNazev || nazev, origNazev: nazev, nazevPrepsan: !!novyNazev,
             mnozstvi: mn, mnozstviAuto: mnozstvi, prepsano: prepis != null,
             cena: cenaEff, cenaAuto: cena, cenaPrepsana: cenaPrepis != null, cenaPath: opts.cenaPath || null,
             fix: opts.fix != null ? opts.fix : null,
             /* Řádky volitelných položek se NEZAOKROUHLUJÍ. Zaokrouhlení nahoru
              * na tisíce patří jen příplatkům (mkPrip). V jednom konkrétním
              * excelovém souboru (zakázka CN-0327) mělo zaokrouhlení i jedno
              * volitelné — montáž přechodových plechů. Rozhodnutí uživatele
              * z 11. 8. 2026: byla to úprava toho jednoho souboru, ne pravidlo
              * původní šablony, a nenapodobuje se ani v kompatibilním režimu.
              * Kdyby se totéž objevilo i u dalších zakázek, je to naopak signál,
              * že se změnila předloha — a pak se to sem vrátí vědomě. */
             naklad, marze: naklad * m, sMarzi: naklad * (1 + m),
             pozn: opts.pozn || '', vlastni: !!opts.vlastni };
  };
  // vlastní ruční položky dané sekce (z.vlastniPolozky[sek]); starší soubory: volitelneVlastni → volitelne
  const vlastniProSekci = (sek) => {
    let zdroj = (z.vlastniPolozky && Array.isArray(z.vlastniPolozky[sek])) ? z.vlastniPolozky[sek] : [];
    if (sek === 'volitelne' && !zdroj.length && Array.isArray(z.volitelneVlastni)) zdroj = z.volitelneVlastni;
    return zdroj.map((vl, i) => ({
      ...mkItem(vl.nazev, +vl.mnozstvi || 0, +vl.cena || 0,
        { vlastni: true, pozn: vl.kid ? 'trvalá položka z ceníku' : 'ruční položka' }),
      sekce: sek, idx: i, kid: vl.kid || null,
    }));
  };

  /* ATYP položky (#7, zadání z 30. 7. 2026).
   *
   * U atypické zakázky se dělají věci, které v předloze nejsou – netradiční tvar
   * šachty, napojení na stavbu, zámečnina navíc. Do 30. 7. 2026 se jejich cena
   * psala rovnou do zakázky, takže vznikla mimo ceník i mimo výpočet: příště ji
   * nikdo nedohledal a nikdo ji neaktualizoval. Nově cena patří do ceníku
   * (katalogová sekce „atyp"), číslo v zakázce je jen dohoda pro jednu stavbu.
   *
   * Prázdno znamená „platí ceník"; NULA je platný přepis („uděláme zdarma"),
   * proto se tu testuje prázdnota, ne pravdivost – stejně jako u PROJ (#8).
   * (Vlastní název, ať se to netluče s `_prepisPlati` v engine_proj.js –
   *  v sestaveném souboru žijí obě funkce v jednom globálním prostoru.) */
  const _prepisZadan = v => !(v === undefined || v === null || v === '');
  const atypZamecnikPrepsana = _prepisZadan(z.zamecnikAtypKc);
  const atypZamecnikSazba = atypZamecnikPrepsana ? (+z.zamecnikAtypKc || 0) : (+c.zamecnikAtypKc || 0);
  /* `atyp` říká „tohle je práce navíc", `bezCeny` říká „a nikdo jí zatím nedal
   * cenu". Bez druhého příznaku by se neoceněná položka tiše sečetla jako nula
   * a nabídka by ji rozdala zdarma; takhle na ni upozorní kontrola před nabídkou.
   * Množství 0 chyba není – to je jen položka, kterou tahle stavba nepotřebuje. */
  const oznacAtyp = r => r && ({ ...r, atyp: true,
    bezCeny: (+r.mnozstvi || 0) > 0 && !((+r.cena || 0) > 0) });

  const plechKey = ext ? 'C.powertechExt' : 'C.powertechInt';
  const hrubaOck = [
    mkItem('PROFILY - HLAVNÍ NOSNÉ PRVKY', profKg, c.profilasKgKc, { cenaPath: 'C.profilasKgKc' }),
    mkItem('PROFILY - MONTÁŽNÍ NOSNÍK', 1, c.montazniNosnik, { cenaPath: 'C.montazniNosnik' }),
    ext ? mkItem('PROFILY - LEMOVÁNÍ ŠACHTY (EXT)', lemKg, c.lemovaniKgKc, { cenaPath: 'C.lemovaniKgKc' }) : null,
    mkItem('PLECHY - HLAVNÍ KONSTRUKČNÍ PLECHY', plechyKgRez, ext ? c.powertechExt : c.powertechInt, { cenaPath: plechKey }),
    mkItem('PLECHY - ZASKLENÍ (TERČE/LIŠTY)', terceKg + listyKg, ext ? c.powertechExt : c.powertechInt, { cenaPath: plechKey }),
    mkItem('PLECHY - OPLECH. DVEŘÍ A PODEST (MATERIÁL)', oplDvereKg + podestKg, ext ? c.powertechExt : c.powertechInt, { cenaPath: plechKey }),
    mkItem('PLECHY - OPLECH. DVEŘÍ A PODEST (PRÁCE)', z.nastupiste * 3, c.oplechPracKc, { cenaPath: 'C.oplechPracKc' }),
    mkItem('PLECHY - OPLECHOVÁNÍ OSTATNÍ (MATERIÁL)', z.oplechOstatniKg, ext ? c.powertechExt : c.powertechInt, { cenaPath: plechKey }),
    mkItem('PLECHY - OPLECHOVÁNÍ OSTATNÍ (PRÁCE)', z.oplechOstatniHod, c.oplechPracKc, { cenaPath: 'C.oplechPracKc' }),
    mkItem('SPOJOVACÍ MATERIÁL', 1, spojovaciKc, { naklad: spojovaciKc }),
    !ext ? mkItem('PRÁCE ZÁMEČNÍKA - SPODNÍ RÁM (INT)', 1, c.spodniRamKc, { cenaPath: 'C.spodniRamKc' }) : null,
    mkItem('PRÁCE ZÁMEČNÍKA - NÝTOVÁNÍ', nytovaniKs, c.nytKc, { cenaPath: 'C.nytKc' }),
    !ext ? mkItem('PRÁCE ZÁMEČNÍKA - ČÍLKA (INT)', pocetCilek, c.cilkoKc, { cenaPath: 'C.cilkoKc' }) : null,
    z.zamecnikAtypKs ? oznacAtyp(mkItem('PRÁCE ZÁMEČNÍKA - OSTATNÍ (ATYP)', z.zamecnikAtypKs, atypZamecnikSazba, { cenaPath: 'Z.zamecnikAtypKc' })) : null,
    mkItem('LAKOVÁNÍ (ŠACHTA, PLECHY, ZASKLENÍ, OPLECHOVÁNÍ)', 1, lakovaniKc, { naklad: lakovaniKc }),
    mkItem('MONTÁŽ NA STAVBĚ', montazHod, c.montazHodKc, { cenaPath: 'C.montazHodKc' }),
    ext ? mkItem('VĚTRACÍ MŘÍŽKA (EXT)', 2, c.vetraciMrizkaKc, { cenaPath: 'C.vetraciMrizkaKc' }) : null,
    mkItem('INTERNÍ TRANSPORT', 2, c.transportKc, { cenaPath: 'C.transportKc' }),
    ext ? mkItem('ZASTŘEŠENÍ ŠACHTY (EXT)', (z.sirka + 0.2) * (z.hloubka + 0.1), c.zastreseniM2Kc, { cenaPath: 'C.zastreseniM2Kc' }) : null,
    ext ? mkItem('OPLECHOVÁNÍ K FASÁDĚ (EXT)', (H - z.prohluben) * 2, c.oplechFasadaBmKc, { cenaPath: 'C.oplechFasadaBmKc' }) : null,
    ...vlastniProSekci('hrubaOck'),
    /* ATYP položky se v nabídce nevydělují do vlastní sekce – zákazník má vidět
     * jednu ocelovou konstrukci, ne účet za „něco navíc". Uvnitř kalkulace je
     * ale poznáme podle příznaku `atyp` a umíme je hlídat. */
    ...vlastniProSekci('atyp').map(oznacAtyp),
  ].filter(Boolean);

  const oplasteni = [
    mkItem(`MATERIÁL boční + zadní stěna (${c.skloBokyNazev})`, skloBokyZadniM2, c.skloBokyKc, { cenaPath: 'C.skloBokyKc' }),
    mkItem(`MATERIÁL čelní stěna (${c.skloCelniNazev})`, skloCelniM2, c.skloCelniKc, { cenaPath: 'C.skloCelniKc' }),
    mkItem('PRÁCE OPLÁŠTĚNÍ', skloCelkemM2, c.praceOplasteniKc, { cenaPath: 'C.praceOplasteniKc' }),
    mkItem('PLASTOVÉ KOTVY', terce ? 1 : 0, c.plastKotvyKc, { cenaPath: 'C.plastKotvyKc' }),
    ext ? mkItem('TMELENÍ (MAT. + PRÁCE) (EXT)', skloCelkemM2, c.tmeleniKc, { cenaPath: 'C.tmeleniKc' }) : null,
    ext && z.pruchoziSachta ? mkItem('STŘÍŠKA NAD VSTUPEM NA DVŮR (PRŮCHOZÍ EXT)', 1, c.striskaDvurKc, { cenaPath: 'C.striskaDvurKc' }) : null,
    mkItem('CESTOVNÍ NÁKLADY', 1, c.cestovniKc, { cenaPath: 'C.cestovniKc' }),
    mkItem('ČIŠTĚNÍ', 1, c.cisteniKc, { cenaPath: 'C.cisteniKc' }),
    ...vlastniProSekci('oplasteni'),
  ].filter(Boolean);

  /* Příplatkové sazby. Deklarované až tady nahoře proto, že od 11. 8. 2026
   * je potřebují i dvě volitelné položky (montáž přechodových plechů a lešení
   * pro dokončení hlavy) — sazba je pro obě varianty táž a nemá být dvakrát. */
  const pp = c.priplatky;

  // ---------- VOLITELNÉ: katalog všech dostupných položek + příznak „zahrnuto“ (checkbox v tabulce) ----------
  const v = z.volitelne;
  const volKatalogDef = [
    { key: 'prechodove', mk: () => mkItem('PŘECHODOVÉ PLECHY - NEREZ', prechKg, c.prechodoveKgKc, { cenaPath: 'C.prechodoveKgKc' }), zahrnuto: prechodoveAno, dostupne: true },
    { key: 'leseniVnitrni', mk: () => mkItem('LEŠENÍ - vnitřní', leseniVez, c.leseniVnitrniKc, { cenaPath: 'C.leseniVnitrniKc', fix: c.leseniFix, pozn: `+ fix ${c.leseniFix} Kč` }), zahrnuto: v.leseniVnitrni, dostupne: true },
    { key: 'leseniVnejsi', mk: () => mkItem('LEŠENÍ - vnější', leseniU, c.leseniVnejsiKc, { cenaPath: 'C.leseniVnejsiKc', fix: c.leseniFix, pozn: `+ fix ${c.leseniFix} Kč` }), zahrnuto: v.leseniVnejsi, dostupne: true },
    /* Montáž přechodových plechů (11. 8. 2026). Předloha ji má ve volitelných
     * hned pod materiálem — u nás byla jen jako příplatek, takže když se plechy
     * daly do základní ceny, jejich montáž se neúčtovala vůbec. Množství je
     * počet nástupišť, sazba je táž jako u příplatkové varianty (jeden zdroj).
     *
     * Vlastní přepínač (11. 8. 2026): v excelovém souboru zakázky CN-0327 čte
     * montáž zapnutí z přepínače MATERIÁLU — vzorec `=H64*G64*F63` sahá na
     * buňku o řádek výš, protože jeho vlastní F64 zůstala prázdná. U nás má
     * montáž vlastní přepínač `volitelne.prechMont`. Prázdno znamená „řídí se
     * materiálem", takže se nic nezmění, dokud to obchodník nepřepne — a kdo
     * potřebuje montáž bez materiálu (nebo naopak), má to konečně jak zadat. */
    { key: 'prechMont', mk: () => mkItem('PŘECHODOVÉ PLECHY - NEREZ (MONTÁŽ)', prechKs, pp.prechMontKc,
      { cenaPath: 'C.priplatky.prechMontKc' }),
      zahrnuto: prechMontAno, dostupne: true },
    /* Lešení pro dokončení hlavy šachty (11. 8. 2026). Fixní část NEMÁ, a to
     * ani ve volitelných, ani v příplatcích: je to nástavba už postaveného
     * lešení, ne samostatná stavba. Předloha tu měla dvě různá čísla (0 a
     * 5 000) — obojí padlo spolu se zavedením jediného klíče leseniFix. */
    { key: 'leseniHlava', mk: () => mkItem('LEŠENÍ - dokončení hlavy šachty', z.prejezd, pp.leseniHlavaKc,
      { cenaPath: 'C.priplatky.leseniHlavaKc' }), zahrnuto: v.leseniHlava, dostupne: true },
    { key: 'haky', mk: () => mkItem('HÁKY NA MYTÍ ŠACHTY (EXT)', 3, c.hakyKc, { cenaPath: 'C.hakyKc' }), zahrnuto: v.haky, dostupne: ext },
    { key: 'zabradli', mk: () => mkItem('ÚPRAVY/NAPOJENÍ ZÁBRADLÍ (INT)', z.nastupiste, c.zabradliKc, { cenaPath: 'C.zabradliKc' }), zahrnuto: v.zabradli, dostupne: !ext },
    { key: 'sokl', mk: () => mkItem('OPLECHOVÁNÍ SOKLU PROHLUBNĚ (EXT)', z.sirka + 2 * z.hloubka, c.soklBmKc, { cenaPath: 'C.soklBmKc' }), zahrnuto: v.sokl, dostupne: ext },
  ];
  // mk() voláme i u nedostupných variant (interiér vs. exteriér) – položka se do
  // výsledku nedostane, ale její název se zapíše do rejstříku. Jinak by ruční
  // přepis u exteriérové položky vypadal na interiérové šachtě jako sirotek (#4).
  const volitelneKatalog = volKatalogDef.map(d => ({ d, it: d.mk() }))
    .filter(x => x.d.dostupne)
    .map(x => ({ ...x.it, key: x.d.key, zahrnuto: !!x.d.zahrnuto }))
    .concat(vlastniProSekci('volitelne').map(r => ({ ...r, key: 'vlastni:' + r.idx, zahrnuto: true })));
  const volitelne = volitelneKatalog.filter(r => r.zahrnuto);

  const rezie = [
    mkItem('ZAMĚŘENÍ 3D SKENEREM', 1, c.sken3dKc, { cenaPath: 'C.sken3dKc' }),
    mkItem('VÝSTUP ZE ZAMĚŘENÍ PRO ZÁKAZNÍKA', z.vystupZamereni ? 1 : 0.5, c.vystupZamereniKc, { cenaPath: 'C.vystupZamereniKc' }),
    z.engineeringKs ? mkItem('ENGINEERING', z.engineeringKs, c.engineeringKc, { cenaPath: 'C.engineeringKc' }) : null,
    mkItem('DÍLENSKÁ DOKUMENTACE', projekceHod, c.projekceHodKc, { cenaPath: 'C.projekceHodKc' }),
    mkItem('STATICKÉ POSOUZENÍ', c.statikaHod, c.statikaKc, { cenaPath: 'C.statikaKc' }),
    mkItem('REŽIE KANCELÁŘE', 1, c.rezieKancelareKc, { cenaPath: 'C.rezieKancelareKc' }),
    mkItem('PRÁCE STAVBYVEDOUCÍHO', c.stavbyvedouciHod, c.stavbyvedouciKc, { cenaPath: 'C.stavbyvedouciKc' }),
    ...vlastniProSekci('rezie'),
  ].filter(Boolean);

  /* ---------- ATYP → přirážka k projekčním a koordinačním pracím (#22) ----------
   * Zaškrtnutí „ATYP (nestandardní zakázka)" dosud nemělo na výpočet žádný vliv –
   * byl to mrtvý příznak. Nestandardní šachta přitom stojí víc hlavně v kanceláři:
   * dílenská dokumentace, statika, engineering a koordinace stavbyvedoucího.
   * Přirážka se proto počítá z NÁKLADU sekce Režie a přidává se jako samostatný
   * řádek, ne jako tiché navýšení jednotlivých položek. Důvody:
   *   – v kalkulaci i v detailu je hned vidět, kolik ATYP stojí a z čeho se počítá,
   *   – dá se ručně přepsat jako každá jiná položka (mnozstviPrepis/cenyPrepis),
   *   – nezkresluje ceníkové jednotkové ceny, které se propisují do dokumentů.
   * Marže se na řádek nasazuje stejně jako všude jinde (naklad × (1+m)).
   * Sazba je součástí ceníku (C.atypPrirazka), takže cestuje se zakázkou a jde
   * změnit v Nastavení; výchozí hodnota je 30 %. */
  const atypSazba = z.atyp ? (c.atypPrirazka != null ? +c.atypPrirazka : 0.30) : 0;
  if (atypSazba > 0) {
    const atypZaklad = rezie.reduce((a, r) => a + r.naklad, 0);
    const atypKc = atypZaklad * atypSazba;
    rezie.push(mkItem('PŘIRÁŽKA ZA ATYP - PROJEKČNÍ A KOORDINAČNÍ PRÁCE', 1, atypKc,
      { naklad: atypKc,
        pozn: `${Math.round(atypSazba * 1000) / 10} % z nákladu režie (${Math.round(atypZaklad).toLocaleString('cs-CZ')} Kč)` }));
  }

  const sekce = { hrubaOck, oplasteni, volitelne, rezie };
  const sum = rows => ({
    naklad: rows.reduce((a, r) => a + r.naklad, 0),
    marze: rows.reduce((a, r) => a + r.marze, 0),
    sMarzi: rows.reduce((a, r) => a + r.sMarzi, 0),
  });
  const s1 = sum(hrubaOck), s2 = sum(oplasteni), s3 = sum(volitelne), s4 = sum(rezie);
  const nakladBezRezervy = s1.naklad + s2.naklad + s3.naklad + s4.naklad;
  const sMarziBezRezervy = s1.sMarzi + s2.sMarzi + s3.sMarzi + s4.sMarzi;

  // REZERVA — oprava: počítá se z NÁKLADŮ a marže se přidá jen jednou.
  // (šablona: základ = cena vč. marže a k tomu ještě jednou marže)
  let rezerva;
  if (fixes) {
    const naklad = nakladBezRezervy * z.rezervaZakladPct;
    rezerva = { naklad, marze: naklad * m, sMarzi: naklad * (1 + m) };
  } else {
    const naklad = sMarziBezRezervy * z.rezervaZakladPct;
    rezerva = { naklad, marze: naklad * m, sMarzi: naklad * (1 + m) };
  }

  const zakladNaklad = nakladBezRezervy + rezerva.naklad;
  const zakladCena = sMarziBezRezervy + rezerva.sMarzi;
  const zakladCenaZaokr = CEIL(zakladCena, 1000);

  /* ---------- příplatkové položky (ceník variant) ---------- */
  const mkPrip = (key, nazev, mnozstvi, cena, opts = {}) => {
    zapisNazev(nazev);
    const cenaPrepis = (opts.cenaPath == null && z.cenyPrepis && z.cenyPrepis[nazev] != null) ? +z.cenyPrepis[nazev] : null;
    const cenaEff = cenaPrepis != null ? cenaPrepis : cena;
    const naklad = (opts.naklad != null && cenaPrepis == null) ? opts.naklad : mnozstvi * cenaEff;
    const novyNazev = z.nazvyPrepis ? z.nazvyPrepis[nazev] : null;
    return { key, nazev: novyNazev || nazev, origNazev: nazev, nazevPrepsan: !!novyNazev,
             mnozstvi, cena: cenaEff, cenaAuto: cena, cenaPrepsana: cenaPrepis != null, cenaPath: opts.cenaPath || null,
             naklad, sMarzi: CEIL(naklad * (1 + m), 1000), pozn: opts.pozn || '', vlastni: !!opts.vlastni };
  };
  let priplatky = [
    mkPrip('vsgFolie', 'Sklo VSG s mléčnou fólií', skloCelkemM2, pp.vsgFolieM2, { cenaPath: 'C.priplatky.vsgFolieM2' }),
    ext ? mkPrip('skn', 'Sklo SKN 176 (Ug=1,1) (EXT)', skloBokyZadniM2, pp.sknM2, { cenaPath: 'C.priplatky.sknM2' }) : null,
    prechodoveAno ? null : mkPrip('prechMat', 'PŘECHODOVÉ PLECHY - NEREZ (MATERIÁL)', prechKg1 * z.nastupiste, c.prechodoveKgKc, { cenaPath: 'C.prechodoveKgKc' }),
    /* Příplatková varianta jen tehdy, když montáž není už ve volitelných —
     * jinak by se táž práce naúčtovala dvakrát. */
    prechMontAno ? null : mkPrip('prechMont', 'PŘECHODOVÉ PLECHY - NEREZ (MONTÁŽ)', z.nastupiste, pp.prechMontKc, { cenaPath: 'C.priplatky.prechMontKc' }),
    mkPrip('madlaBoky', 'MADLA NA BOČNÍCH STĚNÁCH (dřevo, lak)', (z.nastupiste - 1) * ((z.hloubka + 0.16) * 1.2) * 2, pp.madlaBmKc, { cenaPath: 'C.priplatky.madlaBmKc' }),
    mkPrip('madlaZadni', 'MADLA NA ZADNÍ STĚNĚ (dřevo, lak)', (z.nastupiste - 1) * ((z.sirka + 0.16) * 1.2), pp.madlaBmKc, { cenaPath: 'C.priplatky.madlaBmKc' }),
    ext ? mkPrip('medStrecha', 'PŘÍPLATEK ZA STŘECHU V MĚDI (EXT)', (z.sirka + 0.2) * (z.hloubka + 0.1), pp.medStrechaM2, { cenaPath: 'C.priplatky.medStrechaM2' }) : null,
    ext ? mkPrip('ventilator', 'VENTILÁTOR (EXT)', 1, pp.ventilatorKc, { cenaPath: 'C.priplatky.ventilatorKc' }) : null,
    mkPrip('zabranyDvere', 'ZÁBRANY DO DVEŘNÍCH VSTUPŮ', z.nastupiste, pp.zabranyDvereKc, { cenaPath: 'C.priplatky.zabranyDvereKc' }),
    mkPrip('montazDveri', 'MONTÁŽ ŠACHETNÍCH DVEŘÍ', z.nastupiste, pp.montazDveriKc, { cenaPath: 'C.priplatky.montazDveriKc' }),
    /* Fixní část lešení je v příplatcích táž jako ve volitelných — jeden klíč
     * c.leseniFix. Dokud měla každá větev vlastní číslo, znamenalo přesunutí
     * lešení ze základní ceny do příplatků tichou změnu ceny o tisíce korun. */
    v.leseniVnitrni ? null : mkPrip('leseniVnitrni', 'LEŠENÍ - vnitřní', leseniVez, c.leseniVnitrniKc,
      { cenaPath: 'C.leseniVnitrniKc', naklad: leseniVez * c.leseniVnitrniKc + c.leseniFix }),
    v.leseniHlava ? null : mkPrip('leseniHlava', 'LEŠENÍ - dokončení hlavy šachty', z.prejezd, pp.leseniHlavaKc,
      { cenaPath: 'C.priplatky.leseniHlavaKc' }),
    v.leseniVnejsi ? null : mkPrip('leseniVnejsi', 'LEŠENÍ - vnější', leseniU, c.leseniVnejsiKc,
      { cenaPath: 'C.leseniVnejsiKc', naklad: leseniU * c.leseniVnejsiKc + c.leseniFix }),
    ...(Array.isArray(z.priplatkyVlastni) ? z.priplatkyVlastni : []).map((vl, i) =>
      ({ ...mkPrip('vlastni:' + i, vl.nazev, +vl.mnozstvi || 0, +vl.cena || 0,
        { vlastni: true, pozn: vl.kid ? 'trvalá položka z ceníku' : 'ruční položka' }), kid: vl.kid || null })),
  ].filter(Boolean);
  if (z.priplatkyVyber) priplatky = priplatky.filter(p => z.priplatkyVyber.includes(p.key));
  const priplatkyNaklad = priplatky.reduce((a, r) => a + r.naklad, 0);
  const priplatkyCena = priplatky.reduce((a, r) => a + r.sMarzi, 0);
  const priplatkyRez = z.rezervaPriplatkyPct
    ? (fixes ? priplatkyNaklad : priplatkyCena) * z.rezervaPriplatkyPct * (1 + m) : 0;
  const priplatkyCenaCelkem = CEIL(priplatkyCena + priplatkyRez, 1000);

  /* ---------- DPH ---------- */
  const dph = c.dph;
  const souhrn = {
    zakladNaklad, zakladMarze: zakladCena - zakladNaklad,
    zakladCena: zakladCenaZaokr, zakladDph: zakladCenaZaokr * dph,
    zakladSDph: zakladCenaZaokr * (1 + dph),
    priplatkyCena: priplatkyCenaCelkem, priplatkyDph: priplatkyCenaCelkem * dph,
    priplatkySDph: priplatkyCenaCelkem * (1 + dph),
  };

  return {
    odvozene: { vyskaSachty: H, vyskaPodlazi, svetlaVyska, vyskaProsklene, sirkaDveri, leseniVez, leseniU },
    parametry: { ramy, portPricniky, sloupkyPortalu, kratkePricniky, spojky, pocetCilek },
    profily: { rows: profilyRows, celkemM: profM, celkemKg: profKg, celkemM2: profM2, lemovani: { m: dLemovani, kg: lemKg, m2: lemM2 } },
    plechy: { spojeRows, ks: plechyKs, kg: plechyKg, m2: plechyM2 },
    zaskleni: { rozmer: g, zadni: { ks: zadniKs, m2: zadniM2 }, bocni: { ks: bocniKs, m2: bocniM2 },
                svetliky: { ks: svetlikKs, m2: svetlikM2 }, svetlikyBoky: { ks: svetlikBokKs, m2: svetlikBokM2 },
                bokyZadniM2: skloBokyZadniM2, celniM2: skloCelniM2, celkemM2: skloCelkemM2 },
    dily: { terceKs, terceKg, listyKs, listyBm: listyCelkBm, listyKg, oplDvereKs, oplDvereKg, oplDvereM2,
            podestKs, podestKg, podestM2, prechKs, prechKg },
    spojovaci: { rows: spojovaciRows, celkem: spojovaciKc, nytovaniKs },
    lakovani: { lakovna, tomas, pouzito: lakovaniKc, rezim: L.rezim, vlastniRows: vlLakRows, vlastniKc: lakVlastniKc },
    montaz: { hodinyNavic: hn, hodinyNavicCelkem: hodinyNavic, hod1osoba: montazHod1, hodCelkem: montazHod, dni: montazHod1 / 8 },
    nazvyPolozek,
    sekce, volitelneKatalog, souctySekci: { hrubaOck: s1, oplasteni: s2, volitelne: s3, rezie: s4 }, rezerva,
    priplatky, souhrn,
  };
}

/* MIGRACE 11. 8. 2026 — tři fixní částky lešení se slučují do jedné.
 *
 * Do této verze měl ceník `leseniVnitrniFix`, `leseniVnejsiFix` a
 * `priplatky.leseniHlavaFix`. Uložené zakázky i zveřejněný ceník je pořád
 * nesou; kdyby se jen přestaly číst, spadla by fixní část lešení na nulu a
 * cena by se tiše propadla o desítky tisíc. Proto se hodnota převezme —
 * a to z VNITŘNÍHO lešení, protože to je ta cena, kterou uživatel označil
 * za platnou (18 000 Kč). Staré klíče se zahazují, aby v datech nezůstal
 * druhý zdroj, ke kterému by se dalo omylem vrátit.
 *
 * Funkce je bez návratové hodnoty a mění ceník na místě; volá se z migrace
 * zakázky (zakazka.js) i při načtení ceníku programu (program_ui.js). */
function cenikMigraceLeseni(cenik) {
  if (!cenik || typeof cenik !== 'object') return;
  if (cenik.leseniFix == null) {
    const stary = [cenik.leseniVnitrniFix, cenik.leseniVnejsiFix].find(x => x != null);
    if (stary != null) cenik.leseniFix = +stary || 0;
  }
  delete cenik.leseniVnitrniFix;
  delete cenik.leseniVnejsiFix;
  if (cenik.priplatky && typeof cenik.priplatky === 'object') delete cenik.priplatky.leseniHlavaFix;
}

if (typeof module !== 'undefined') module.exports = { vypocet, DEFAULT_ZADANI, DEFAULT_CENIK, CEIL, cenikMigraceLeseni };
