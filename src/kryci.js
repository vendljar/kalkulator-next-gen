/* ============================================================
 * KRYCÍ LIST ZAKÁZKY – datový model (jeden zdroj pravdy)
 * Používá jej záložka Krycí list (kryci_ui.js) i generování do Wordu.
 * Každé pole má příslušnost k verzi: 'bo' (Backoffice) a/nebo 'techdata'
 * (Technické oddělení) – dle vzoru „..._BOvsTECH.xlsx". Word se generuje
 * VŽDY v obou verzích. Hodnota pole: ruční přepis > prefill > výchozí.
 * ============================================================ */

/* ---------- kdo nabídku vypracoval (#146) ----------
 * Přihlášený obchodní technik má přednost před firemními údaji; jeho profil
 * (titul, jméno, telefon) žije v modulu zpracovatel.js. Guard `typeof` je tu
 * kvůli Node testům a starším sestavením, kde modul nemusí být načtený –
 * tam se chová všechno jako dřív, tedy podle Nastavení → Firma. */
function kryciObchodnikJmeno(f) {
  return typeof zpracovatelJmenoProKryci === 'function'
    ? zpracovatelJmenoProKryci(f) : firmaHodnota(f, 'zpracoval');
}
function kryciObchodnikKontakt(f) {
  return typeof zpracovatelKontaktProKryci === 'function'
    ? zpracovatelKontaktProKryci(f)
    : [firmaHodnota(f, 'zpracoval'), firmaHodnota(f, 'zpracovalTelefon'),
       firmaHodnota(f, 'zpracovalEmail')].filter(Boolean).join(', ');
}

/* Nabídka sazeb smluvní pokuty (10. 8. 2026). První hodnota je předvyplněná.
 * Sdílí ji krycí list OCK i PROJ, aby se sazby nerozešly mezi dvěma seznamy. */
const KRYCI_POKUTY = ['0', '0,05 % / den', '0,1 % / den'];

const KRYCI_SEKCE = [
  { sekce: 'Základní údaje', pole: [
    /* KL-4: obchodníka aplikace zná – od 5. 8. 2026 je to přihlášený uživatel
     * (#146), takže krycí list ukazuje téhož člověka jako cenová nabídka.
     * Bez přihlášení (offline) platí dál Nastavení → Firma. Ruční přepis
     * zůstává (↺ vrátí automatiku). */
    { id: 'obchodnik', label: 'Jméno obchodníka', verze: ['bo', 'techdata'], prefill: c => kryciObchodnikJmeno(c.firma), src: 'přihlášený uživatel / Nastavení → Firma' },
    { id: 'nazevAkce', label: 'Název akce', verze: ['bo', 'techdata'], bind: 'ZAK.nazevAkce', prefill: c => c.zak.nazevAkce, src: 'hlavička kalkulace' },
    { id: 'cisloCN', label: 'Číslo nabídky (CN)', verze: ['bo', 'techdata'], bind: 'ZAK.cislo', prefill: c => c.zak.cislo, src: 'hlavička kalkulace' },
    { id: 'adresaStavby', label: 'Adresa stavby', verze: ['bo', 'techdata'], bind: 'ZAK.adresa', prefill: c => c.zak.adresa, src: 'hlavička kalkulace' },
    /* KL-2: jen část OCK po slevě. Projekce má vlastní krycí list PROJ. */
    { id: 'hodnotaBezDph', label: 'Hodnota zakázky bez DPH', verze: ['bo', 'techdata'], prefill: c => c.hodnota, src: 'z nabídky OCK (po slevě)' },
    { id: 'priplatkyNabidka', label: 'Příplatky v nabídce', verze: ['bo', 'techdata'], prefill: c => c.priplatky, src: 'z nabídky' },
  ] },
  /* SET-3 – firemní údaje se doplní automaticky z Nastavení → Firma;
   * ruční přepis v krycím listu je možný (např. jiná fakturační adresa). */
  { sekce: 'Dodavatel (naše firma)', pole: [
    { id: 'dodNazev', label: 'Zhotovitel', verze: ['bo', 'techdata'], prefill: c => firmaHodnota(c.firma, 'nazev'), src: 'Nastavení → Firma' },
    { id: 'dodIcoDic', label: 'IČO / DIČ zhotovitele', verze: ['bo'], prefill: c => firmaIcoDic(c.firma), src: 'Nastavení → Firma' },
    { id: 'dodSidlo', label: 'Sídlo zhotovitele', verze: ['bo'], prefill: c => firmaSidlo(c.firma), src: 'Nastavení → Firma' },
    { id: 'dodBanka', label: 'Bankovní spojení zhotovitele', verze: ['bo'], prefill: c => firmaBankaRadek(c.firma), src: 'Nastavení → Firma' },
    { id: 'dodKontakt', label: 'Kontakt na zhotovitele (telefon, e-mail)', verze: ['bo', 'techdata'], prefill: c => [firmaHodnota(c.firma, 'telefon'), firmaHodnota(c.firma, 'email')].filter(Boolean).join(', '), src: 'Nastavení → Firma' },
    { id: 'dodZpracoval', label: 'Nabídku vypracoval', verze: ['bo', 'techdata'], prefill: c => kryciObchodnikKontakt(c.firma), src: 'přihlášený uživatel / Nastavení → Firma' },
  ] },
  { sekce: 'Zákazník (smluvní partner)', pole: [
    { id: 'jmenoPrijmeni', label: 'Jméno a příjmení kontaktu', verze: ['bo'], prefill: c => c.zak.kontakt, src: 'z hlavičky zakázky' },
    { id: 'zakaznik', label: 'Zákazník (smluvní partner)', verze: ['bo', 'techdata'], prefill: c => c.zak.objednatel, src: 'z hlavičky zakázky' },
    { id: 'kontaktObjednatel', label: 'Kontaktní údaje na objednatele (email, telefon)', verze: ['bo'] },
    { id: 'ico', label: 'IČO', verze: ['bo'], prefill: c => c.zak.ico, src: 'z hlavičky zakázky' },
    /* KL-1: sídlo objednatele, NE adresa stavby. Developer sídlí jinde, než
     * staví; do smlouvy a na fakturu patří sídlo. Dokud není v hlavičce
     * vyplněné, zůstane pole prázdné – raději prázdné než špatné. */
    { id: 'adresaZakaznik', label: 'Adresa (sídlo) objednatele', verze: ['bo'], prefill: c => c.zak.adresaObjednatele, src: 'z hlavičky zakázky (sídlo)' },
    { id: 'fakturacniEmail', label: 'Kontakt na fakturační oddělení (email, telefon)', verze: ['bo'] },
    { id: 'kontaktStavba', label: 'Kontakt stavba (tel / email)', verze: ['bo', 'techdata'] },
    /* KL-6: ve formuláři je odkaz, ne popis – proto typ 'link' (otevře se ↗) */
    { id: 'scoring', label: 'Scoring Cribis / Pipedrive', verze: ['bo'], typ: 'link', ph: 'https://…' },
  ] },
  { sekce: 'Typ smlouvy a produktu', pole: [
    { id: 'typSmlouvy', label: 'Typ smlouvy', verze: ['bo'], typ: 'radio', o: ['Naše bez úprav', 'Naše s úpravami', 'Cizí'], prefill: () => 'Naše bez úprav', src: 'výchozí' },
    /* KL-3: formulář zná i třetí možnost „Projekce". Čistě projekční zakázka
     * (OCK nula, PROJ oceněné) se nesmí označit jako šachta. Zůstává textové
     * pole, ne přepínač – kombinovaná zakázka se do tří škatulek nevejde. */
    { id: 'typProduktu', label: 'Typ produktu / služby', verze: ['bo', 'techdata'], prefill: c => c.typProduktu, src: 'z kalkulace (OCK + PROJ)' },
  ] },
  { sekce: 'Platební podmínky', pole: [
    { id: 'splatnostDni', label: 'Splatnost faktur (dní)', verze: ['bo'], prefill: () => '14', src: 'výchozí' },
    /* #147: šablona nabídky měla platnost („2 měsíce") napsanou natvrdo, takže
     * ji nešlo u konkrétní zakázky změnit jinak než ručně ve Wordu. Pole nese
     * celé sousloví včetně jednotky, ne jen číslo — čeština skloňuje
     * („1 měsíc / 2 měsíce / 5 měsíců") a dopočítávat tvar by znamenalo hádat.
     * Krycí list PROJ má totéž pole už od začátku. */
    /* Firemní standardy (10. 8. 2026). Do té doby tu stála věta natvrdo v kódu
     * a obchodník ji v každé zakázce viděl jako pole k přepsání. Mění se ale
     * jednou za rok a pro celou firmu — proto se berou z Nastavení → Firma.
     * Náhradní hodnota zůstává pro starší konfigurace, kde to pole ještě není. */
    { id: 'platnostNabidky', label: 'Platnost nabídky', verze: ['bo'],
      prefill: c => firmaHodnota(c.firma, 'platnostNabidky') || '2 měsíce',
      src: 'Nastavení → Firma' },
    { id: 'zpusobFakturace', label: 'Způsob fakturace', verze: ['bo'],
      prefill: c => firmaHodnota(c.firma, 'zpusobFakturaceOck') || 'Náš standard / měsíční',
      src: 'Nastavení → Firma' },
    { id: 'zaloha1', label: 'Záloha / dílčí faktura č. 1', verze: ['bo'], prefill: () => '50 % – po podpisu smlouvy', src: 'výchozí' },
    { id: 'faktura2', label: 'Dílčí faktura č. 2', verze: ['bo'], prefill: () => '40 % – po zahájení montáže', src: 'výchozí' },
    { id: 'fakturaKonc', label: 'Konečná faktura', verze: ['bo'], prefill: () => '10 % – po předání', src: 'výchozí' },
    /* KL-5: ve formuláři jsou dva samostatné řádky, každý s vlastním procentem
     * („ANO do odstranění VaN | %" a „ANO po dobu záruky | %"). Původní id
     * `zadrzne` zůstává (nic se neodstraňuje), jen se zúžilo na první řádek;
     * starý volný text převede kryciMigraceZadrzne() níže. */
    { id: 'zadrzne', label: 'Zádržné – do odstranění vad a nedodělků', verze: ['bo'], typ: 'radio', o: ['Ano', 'Ne'], prefill: () => 'Ano', src: 'výchozí' },
    { id: 'zadrzneProc', label: 'Zádržné do odstranění VaN – %', verze: ['bo'], ph: 'např. 10' },
    { id: 'zadrzneZaruka', label: 'Zádržné – po dobu záruky', verze: ['bo'], typ: 'radio', o: ['Ano', 'Ne'], prefill: () => 'Ne', src: 'výchozí' },
    { id: 'zadrzneZarukaProc', label: 'Zádržné po dobu záruky – %', verze: ['bo'], ph: 'např. 5' },
    /* Smluvní pokuty: od 10. 8. 2026 výběr, ne volné pole (rozhodnutí J. V.).
     * Volné pole svádělo k překlepu, který se propsal do nabídky i do krycího
     * listu — a pokuta je jediný údaj v podmínkách, který se v případě sporu
     * čte doslova. Předvyplněná je nula, tedy BEZ pokuty: dřív tu stálo
     * 0,05 % / den a sjednávalo se to i tam, kde to nikdo nechtěl.
     * Poslední volba nechá zapsat vlastní znění, ať jde vyhovět zákazníkovi,
     * který si prosadí jinou sazbu. */
    { id: 'pokutaDodavka', label: 'Smluvní pokuta – prodlení dodávky', verze: ['bo', 'techdata'],
      typ: 'vyber', o: KRYCI_POKUTY, prefill: () => KRYCI_POKUTY[0], src: 'výchozí' },
    { id: 'pokutaSplatnost', label: 'Smluvní pokuta – prodlení splatnosti', verze: ['bo', 'techdata'],
      typ: 'vyber', o: KRYCI_POKUTY, prefill: () => KRYCI_POKUTY[0], src: 'výchozí' },
    { id: 'pokutaLimit', label: 'Limit smluvních pokut', verze: ['bo', 'techdata'], prefill: () => 'NEUPLATNĚN limit 10 %', src: 'výchozí' },
    { id: 'pokutyJine', label: 'Jiné', verze: ['bo'], typ: 'textarea' },
    { id: 'platceDph', label: 'Plátce DPH', verze: ['bo'], typ: 'radio', o: ['Ano', 'Ne'], prefill: () => 'Ano', src: 'výchozí' },
    /* KL-7 (hlášení 5. 8. 2026): „Sazba DPH nemůže být přepisovatelná, ale musí
     * být volitelná 12/21 % a navázaná na hlavičku kalkulace."
     * Do té doby to bylo obyčejné textové pole s předvyplněnou hodnotou —
     * dalo se do něj napsat cokoli a krycí list pak nesl jinou sazbu, než
     * jakou se v hlavičce počítalo „Celkem s DPH". Typ `dph` proto kreslí
     * výběr 12/21 % a `dphBind` říká, do které sazby v hlavičce zapisuje;
     * ruční přepis se u takového pole vůbec nečte (viz kryciHodnota). */
    { id: 'sazbaDph', label: 'Sazba DPH', verze: ['bo'], typ: 'dph', dphBind: 'C.dph',
      prefill: c => c.dph + ' %', src: 'z hlavičky kalkulace OCK' },
    { id: 'zarukaMesicu', label: 'Doba trvání záruky (měsíců)', verze: ['bo'], prefill: () => '60', src: 'výchozí' },
  ] },
  { sekce: 'Termíny', pole: [
    { id: 'terminPrevzeti', label: 'Převzetí staveniště k montáži šachty', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminMontaz', label: 'Ukončení montáže šachty a předání montáži výtahu', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminPredani', label: 'Konečné předání díla', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'terminJine', label: 'Jiné termíny', verze: ['bo', 'techdata'], typ: 'textarea' },
  ] },
  { sekce: 'Rozsah a odchylky', pole: [
    { id: 'odchylky', label: 'Jiné odchylky oproti smluvnímu standardu', verze: ['bo'], typ: 'textarea', ph: 'popis odchylek…' },
    /* KL-4: zaměření prostor je položka kalkulace (3D skener v režii OCK,
     * v technické specifikaci pole `sken3d`). Není důvod se na ně ptát znovu. */
    { id: 'zamereniStrojovna', label: 'Zaměření strojovna', verze: ['bo', 'techdata'], typ: 'radio', o: ['Ano', 'Ne'], prefill: c => c.sken3d, src: 'z technické specifikace (3D zaměření)' },
    { id: 'situacniFoto', label: 'Situační fotografie', verze: ['bo', 'techdata'], prefill: () => 'Ve složce', src: 'výchozí' },
    { id: 'cenaNezahrnuje', label: 'Cena nezahrnuje', verze: ['bo'], prefill: () => 'dle CN', src: 'výchozí' },
    { id: 'rozsah', label: 'Rozsah', verze: ['bo'],
      prefill: c => firmaHodnota(c.firma, 'rozsahDefinice') || 'je definován přílohou ke smlouvě (specifikace)',
      src: 'Nastavení → Firma' },
    { id: 'typProjektu', label: 'Typ projektu', verze: ['bo', 'techdata'], typ: 'radio', o: ['Nový projekt (novostavba)', 'Rekonstrukce objektu'], prefill: () => 'Nový projekt (novostavba)', src: 'výchozí' },
    /* KL-4: obojí je oceněná sekce kalkulace PROJ – prováděcí dokumentace je
     * DPS, DSP odpovídá dokumentaci pro povolení záměru (DPZ). Oceněná sekce
     * = ANO, neoceněná = NE. */
    { id: 'provadeciDok', label: 'Prováděcí dokumentace', verze: ['bo', 'techdata'], typ: 'radio', o: ['Ano', 'Ne'], prefill: c => c.projAno('dps'), src: 'z kalkulace PROJ (DPS)' },
    { id: 'dsp', label: 'DSP', verze: ['bo', 'techdata'], typ: 'radio', o: ['Ano', 'Ne'], prefill: c => c.projAno('dpz'), src: 'z kalkulace PROJ (DPZ)' },
  ] },
  { sekce: 'Technická specifika', pole: [
    { id: 'typSachty', label: 'Typ šachty', verze: ['techdata'], prefill: c => c.ext ? 'Exteriérová' : 'Interiérová', src: 'z kalkulace OCK' },
    { id: 'popisProjektu', label: 'Stručný popis projektu', verze: ['techdata'], typ: 'textarea', prefill: () => 'Viz info CN', src: 'výchozí' },
    { id: 'dodavatelStavby', label: 'Dodavatel stavby (kontakt email / telefon)', verze: ['techdata'] },
    { id: 'dodavatelVytahu', label: 'Dodavatel výtahu (kontakt email / telefon)', verze: ['techdata'] },
  ] },
  { sekce: 'Atypy OCK', pole: [
    { id: 'atypMustky', label: 'Můstky (rozměr, napojení stavba ↔ OCK)', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypOplasteni', label: 'Typ a způsob opláštění', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypHlava', label: 'Napojení hlavy OCK', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypStavbaVyska', label: 'Napojení na stavbu po výšce šachty', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypPodchozi', label: 'Podchozí OCK', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypProhluben', label: 'Atyp napojení u prohlubně', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypTvar', label: 'Netradiční tvar OCK (např. 5 stěn)', verze: ['techdata'], typ: 'textarea' },
    { id: 'atypJiny', label: 'Jiný atyp (domluva na schůzce na stavbě)', verze: ['techdata'], typ: 'textarea' },
  ] },
  /* KL-7: patička z předlohy („Dne" / „Podpis obchodníka" / „Informován").
   * V obou verzích – technické oddělení podepisuje převzetí stejně jako BO. */
  { sekce: 'Podpis', pole: [
    { id: 'podpisDne', label: 'Dne', verze: ['bo', 'techdata'], typ: 'date' },
    { id: 'podpisObchodnik', label: 'Podpis obchodníka', verze: ['bo', 'techdata'], prefill: c => kryciObchodnikJmeno(c.firma), src: 'přihlášený uživatel / Nastavení → Firma' },
    { id: 'podpisInformovan', label: 'Informován', verze: ['bo', 'techdata'], ph: 'kdo byl o zakázce informován…' },
  ] },
];

/* KL-5: převod starého jednořádkového „Zádržné" na nové rozdělené řádky.
 * Volá se při importu zakázky (zakazka.js). Hodnota bývala volný text typu
 * „ANO do odstranění vad a nedodělků"; přepínač zná jen Ano/Ne, takže text,
 * který se nedá bezpečně přeložit, se přesune do procentního pole, aby se
 * ručně zadaný údaj neztratil. */
/* Nabízené sazby DPH na jednom místě — hlavička kalkulace i řádek v podmínkách
 * je berou odsud, aby se při další změně sazeb nerozešly. Kdyby v hlavičce
 * byla uložená jiná sazba (starší zakázka, dřívější právní stav), výběr ji
 * ukáže navíc, aby ji přepnutím tiše nezměnil na jinou. */
const KRYCI_DPH_SAZBY = [12, 21];

/* KL-7: řádek „Sazba DPH" byl do 5. 8. 2026 volný text, takže v zakázkách
 * můžou být uložené ruční hodnoty („21%", „19 %"). Od té doby se nečtou, ale
 * není důvod je vozit zakázkou dál — jen by mátly při pohledu do dat. */
function kryciMigraceSazbaDph(h) {
  if (h && h.sazbaDph !== undefined) delete h.sazbaDph;
  return h;
}

function kryciMigraceZadrzne(h) {
  if (!h || h.zadrzne == null) return h;
  const p = String(h.zadrzne).trim();
  if (p === 'Ano' || p === 'Ne') return h;        // už převedeno
  if (/^\s*ano\b/i.test(p)) h.zadrzne = 'Ano';
  else if (/^\s*ne\b/i.test(p)) h.zadrzne = 'Ne';
  else if (p === '') { delete h.zadrzne; return h; }
  else { h.zadrzne = 'Ano'; }
  const proc = p.match(/(\d+(?:[.,]\d+)?)\s*%/);  // „ANO 10 %" → procento do vlastního pole
  if (proc && !h.zadrzneProc) h.zadrzneProc = proc[1];
  return h;
}

const kryciKc = n => Math.round(n || 0).toLocaleString('cs-CZ') + ' Kč';

/* KL-4: „Zaměření strojovna" se v aplikaci už jednou zadává – jako 3D zaměření
 * v technické specifikaci. Čte se přes tsHodnota(), aby platilo stejné pořadí
 * ruční > z kalkulace > výchozí jako v samotné technické specifikaci. */
function kryciSken3d(d, rOck) {
  try {
    if (typeof TECHSPEC_DEF === 'undefined' || typeof tsHodnota !== 'function') return '';
    let pole = null;
    TECHSPEC_DEF.forEach(s => (s.pole || []).forEach(p => { if (p.id === 'sken3d') pole = p; }));
    if (!pole) return '';
    const ts = d.techspec && d.techspec.hodnoty ? d.techspec : { hodnoty: {} };
    const t = String(tsHodnota(pole, ts, rOck, d.ock.zadani, d.cenik).text || '');
    return /^\s*ano/i.test(t) ? 'Ano' : (/^\s*ne/i.test(t) ? 'Ne' : '');
  } catch (e) { return ''; }
}

/* kontext pro prefill: zakázka + odvozené hodnoty z NABÍDKY (KL-1).
 * KL-2: hodnota zakázky = ocelová konstrukce po schválené slevě, tedy JEN
 * část OCK. Tenhle krycí list je podkladem pro objednávku / SoD na dodávku
 * konstrukce; projekční část má vlastní krycí list PROJ s vlastní hodnotou,
 * takže sčítat obě části by znamenalo mít stejné peníze ve dvou smlouvách.
 * Příplatky se do hodnoty nezapočítávají – nabízejí se zvlášť. */
function kryciCtx(zak, varianta, jekly) {
  /* #122: výpočet je schválně obalený v try/catch, aby rozbitá kalkulace
   * neshodila celý krycí list — jenže zadání a ceník se dřív četly MIMO ten
   * blok. Varianta bez ceníku (poškozený import, ručně sestavená zakázka)
   * proto neshodila jeden řádek, ale celou stránku, a obchodník neviděl ani
   * ta pole, která se z kalkulace vůbec neberou.
   *
   * Náhrady jsou prázdné objekty, ne vymyšlená čísla: chybějící ceník znamená
   * „nevíme", a to se v krycím listu projeví pomlčkou u hodnoty, ne nulou. */
  const d = (varianta && varianta.data) || {};
  const Zv = (d.ock && d.ock.zadani) || {};
  const Cv = d.cenik || {};
  let priplatky = '—', ockKc = null, projKc = null, rOck = null;
  const projSekce = {};
  try {
    rOck = vypocet(Zv, Cv, jekly, d.ock.fixes);
    /* Hodnota krycího listu musí být přesně to, co je v nabídce – tedy včetně
     * obchodního zaokrouhlení (#38). Skládá ji zaokrouhleni.js. */
    const cn = (typeof cenaNabidkyOck === 'function') ? cenaNabidkyOck(rOck, d.sleva || {}, d.zaokr) : null;
    const podil = (typeof slevaPodil === 'function') ? slevaPodil(d.sleva || {}) : 0;
    ockKc = cn ? cn.cena : rOck.souhrn.zakladCena * (1 - podil);
    const vynech = Zv.priplatkyVynechat || [];
    const zahrn = (rOck.priplatky || []).filter(pp => !vynech.includes(pp.key));
    priplatky = zahrn.length ? (zahrn.length + ' – ' + zahrn.map(pp => pp.nazev).join(', ')) : 'bez příplatků';
  } catch (e) {}
  try {
    const rp = vypocetProj(d.proj.zadani, d.proj.cenik);
    rp.sekce.forEach(s => { projSekce[s.key] = s.celkem; });
    projKc = rp.souhrn.celkem;
  } catch (e) {}

  const hodnota = (ockKc != null) ? kryciKc(ockKc) : '—';
  // KL-3: čistě projekční zakázka není šachta
  const sachta = (Zv.typSachty === 'exteriérová') ? 'Exteriérová šachta' : 'Interiérová šachta';
  const typProduktu = (ockKc > 0)
    ? (projKc > 0 ? sachta + ' + projekce' : sachta)
    : (projKc > 0 ? 'Projekce' : sachta);

  const firma = (typeof firmaAktualni === 'function') ? firmaAktualni() : {};
  return {
    zak, ext: Zv.typSachty === 'exteriérová', dph: Math.round((Cv.dph || 0) * 100),
    hodnota, priplatky, firma, typProduktu,
    sken3d: kryciSken3d(d, rOck),
    projAno: key => (projSekce[key] > 0 ? 'Ano' : 'Ne'),
  };
}
/* hodnota pole: ruční přepis (data.kryci.hodnoty) > prefill > '' */
function kryciHodnota(pole, kl, c) {
  /* `dphBind` je totéž provázání jako `bind`, jen mířené do sazby DPH
   * v hlavičce kalkulace — ruční přepis se proto nečte ani tady. */
  if (!pole.bind && !pole.dphBind) {   // provázaná pole (bind) čtou přímo ze ZAK, ne z ručních přepisů
    const h = (kl && kl.hodnoty) || {};
    if (h[pole.id] !== undefined && h[pole.id] !== '') return h[pole.id];
  }
  if (pole.prefill) { try { const v = pole.prefill(c); if (v != null && v !== '') return v; } catch (e) {} }
  return '';
}
/* data pro Word danou verzi: {nadpis, sekce:[{sekce,radky:[[label,val]]}], nazevSouboru} */
function kryciData(zak, varianta, jekly, verze) {
  const c = kryciCtx(zak, varianta, jekly);
  const kl = varianta.data.kryci || { hodnoty: {} };
  const sekce = KRYCI_SEKCE.map(s => {
    const radky = s.pole.filter(p => p.verze.includes(verze)).map(p => [p.label, kryciHodnota(p, kl, c)]);
    return radky.length ? { sekce: s.sekce, radky } : null;
  }).filter(Boolean);
  const verzeNazev = verze === 'techdata' ? 'Techdata' : 'Backoffice';
  const cislo = (zak.cislo || 'CN').replace(/\s+/g, '');
  const nazevSouboru = ('KRYCI_LIST_' + verzeNazev + '_' + cislo).replace(/[\\/:*?"<>|]+/g, '-');
  return { nadpis: 'Krycí list objednávky / SoD — ' + verzeNazev, sekce, nazevSouboru, verze, verzeNazev };
}

/* registrace obou verzí do jednotného registru dokumentů (generují se od nuly) */
if (typeof dokumentRegistruj === 'function') {
  [['bo', 'Backoffice'], ['techdata', 'Techdata']].forEach(([verze, label]) => {
    dokumentRegistruj('kryci_' + verze, {
      nazev: 'Krycí list – ' + label,
      generate: (zak, varianta, jekly) => {
        const d = kryciData(zak, varianta, jekly, verze);
        return { blob: docxDokumentBlob(d.nadpis, d.sekce), nazevSouboru: d.nazevSouboru, data: d };
      },
    });
  });
}

/* Které sekce krycího listu se zobrazují i v souhrnu cenové nabídky (pod
 * „Celkem s DPH"). Zadání 5. 8. 2026: obchodník má smluvní a platební podmínky
 * vidět a upravovat rovnou u nabídky, ne až v krycím listu. Není to kopie —
 * souhrn nabídky vykresluje TYTÉŽ řádky odsud a zapisuje do TÉHOŽ úložiště
 * (varianta.data.kryci.hodnoty), takže se změna projeví na obou místech.
 * Názvy musí přesně odpovídat `sekce` v KRYCI_SEKCE výše; test_nabidka_podminky.js
 * to hlídá, aby přejmenování sekce nabídku tiše nevyprázdnilo. */
const KRYCI_NABIDKA_SEKCE = ['Typ smlouvy a produktu', 'Platební podmínky'];

/* ---------- symboly {{PODM_…}} do šablony nabídky (5. 8. 2026, #147) --------
 *
 * Zadání: „Navaž v šabloně % platebních podmínek a splatností na informaci
 * z kalkulace sekce smluvní a platební podmínky."
 *
 * Do teď byla procenta splátek (50 % / 40 % / zbytek) i splatnost (14 dní)
 * natvrdo vepsaná v .docx šabloně. Obchodník je mohl v souhrnu nabídky nebo
 * v krycím listu přepsat, jenže dokument o tom nevěděl — ze stejné zakázky pak
 * odešla nabídka s jinými podmínkami, než jaké nesl krycí list pro backoffice.
 *
 * Symboly se nevypisují ručně, ale odvozují se z KRYCI_NABIDKA_SEKCE, tedy
 * z týchž sekcí, které obchodník vidí pod „Celkem s DPH". Přidané pole tak
 * dostane symbol samo od sebe a nemůže zůstat bez vazby na šablonu.
 *
 * Ke každému poli vznikají tři podoby, protože v šabloně jsou tři různá místa:
 *   {{PODM_ZALOHA1}}        celý text pole tak, jak ho obchodník vidí
 *                           („50 % – po podpisu smlouvy")
 *   {{PODM_ZALOHA1_PROC}}   samotné procento („50 %") do věty, která už slovo
 *                           „ve výši" obsahuje
 *   {{PODM_ZALOHA1_CISLO}}  holé číslo („50") tam, kde za ním v šabloně stojí
 *                           jednotka („… {{PODM_SPLATNOST_DNI_CISLO}} dní …")
 */
const PODM_PREFIX = 'PODM_';

/* `splatnostDni` → `SPLATNOST_DNI`, `fakturaKonc` → `FAKTURA_KONC`.
 * Číslice se od písmen neoddělují, aby `zaloha1` zůstalo `ZALOHA1`. */
function kryciSymbolId(id) {
  return String(id == null ? '' : id).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/* První číslo v textu. Desetinná čárka zůstává česky — do dokumentu jde tak,
 * jak ji obchodník napsal, nic se nepřevádí na tečku. */
function kryciCisloZTextu(t) {
  const m = String(t == null ? '' : t).match(/-?\d+(?:[.,]\d+)?/);
  return m ? m[0] : '';
}

/* Procento se pozná POUZE podle znaku %. „14" ve splatnosti jsou dny; kdyby
 * z toho tahle funkce udělala „14 %", odešla by nabídka s platební podmínkou,
 * kterou nikdo nezadal. Totéž pravidlo jako u cen: co v datech není, se
 * nedopočítává — symbol zůstane prázdný a člověk to ve Wordu doplní. */
function kryciProcentoZTextu(t) {
  const m = String(t == null ? '' : t).match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  return m ? m[1] + ' %' : '';
}

/* Společný stavitel symbolů pro OCK i PROJ. `hodnota(pole)` si každá strana
 * dodá vlastní (kryciHodnota / kryciProjHodnota nad svým úložištěm), aby se
 * podmínky obou částí zakázky nikde nepotkaly. */
function kryciSymbolyZeSekci(sekce, nazvy, hodnota, P) {
  const prelozit = (typeof P === 'function') ? P : (x => x);
  const pole = (sekce || [])
    .filter(s => (nazvy || []).indexOf(s.sekce) >= 0)
    .reduce((a, s) => a.concat(s.pole), []);
  const texty = pole.map(p => {
    let h = '';
    try { h = hodnota(p); } catch (e) { h = ''; }
    return String(h == null ? '' : h);
  });
  const out = {};
  /* Napřed skutečná pole. Teprve pak odvozené tvary, a jen pokud si tím
   * nepřepíšou pole se stejným jménem: krycí list má vedle přepínače
   * „Zádržné po dobu záruky" ještě samostatné pole `zadrzneZarukaProc`,
   * jehož symbol se jmenuje stejně jako odvozený _PROC symbol přepínače.
   * Vyhrát musí zadané číslo, ne prázdno odvozené ze slova „Ano". */
  pole.forEach((p, i) => { out[PODM_PREFIX + kryciSymbolId(p.id)] = prelozit(texty[i]); });
  pole.forEach((p, i) => {
    const zaklad = PODM_PREFIX + kryciSymbolId(p.id);
    if (!((zaklad + '_CISLO') in out)) out[zaklad + '_CISLO'] = kryciCisloZTextu(texty[i]);
    if (!((zaklad + '_PROC') in out)) out[zaklad + '_PROC'] = kryciProcentoZTextu(texty[i]);
  });
  return out;
}

function kryciPodminkoveSymboly(zak, varianta, jekly, P) {
  const c = kryciCtx(zak, varianta, jekly);
  const kl = (varianta && varianta.data && varianta.data.kryci) || { hodnoty: {} };
  return kryciSymbolyZeSekci(KRYCI_SEKCE, KRYCI_NABIDKA_SEKCE, p => kryciHodnota(p, kl, c), P);
}

if (typeof module !== 'undefined')
  module.exports = { KRYCI_SEKCE, KRYCI_NABIDKA_SEKCE, KRYCI_DPH_SAZBY, KRYCI_POKUTY, kryciCtx, kryciHodnota,
    kryciData, kryciMigraceZadrzne, kryciMigraceSazbaDph,
    PODM_PREFIX, kryciSymbolId, kryciCisloZTextu, kryciProcentoZTextu,
    kryciSymbolyZeSekci, kryciPodminkoveSymboly };
