/* ============================================================
 * CENÍK – definice položek (jeden zdroj pravdy) + import/export Excel.
 * CENIK_DEF / CENIK_DEF_PROJ: kategorie → [cesta, popis, jednotka, pozn, typ?].
 * cesta je „C.klic" / „C.skupina.klic" (OCK) nebo „PC.…" (PROJ).
 * typ: undefined = číslo, 'text' = řetězec, 'selLak' = výběr (tomas/lakovna).
 * Používá záložka Ceník (cenik_ui.js) i Excel import/export.
 * ============================================================ */

const CENIK_DEF = [
  ['HRUBÁ OCK', [
    ['C.profilasKgKc', 'Profily – hlavní nosné prvky', 'Kč/kg', 'aktualizováno 3.5.2023'],
    ['C.montazniNosnik', 'Montážní nosník', 'Kč/ks', ''],
    ['C.lemovaniKgKc', 'Lemování šachty (ext)', 'Kč/kg', ''],
    ['C.powertechExt', 'Plechy – exteriérová šachta', 'Kč/kg', 'aktualizováno 26.1.2026'],
    ['C.powertechInt', 'Plechy – interiérová šachta', 'Kč/kg', 'aktualizováno 26.1.2026'],
    ['C.oplechPracKc', 'Oplechování – práce', 'Kč/hod', ''],
    ['C.spodniRamKc', 'Zámečník – spodní rám (int)', 'Kč', ''],
    ['C.cilkoKc', 'Zámečník – čílka (int)', 'Kč/ks', ''],
    ['C.nytKc', 'Zámečník – nýtování', 'Kč/nýt', ''],
    ['C.montazHodKc', 'Montáž na stavbě', 'Kč/hod', 'počítá se se 4 osobami'],
    ['C.vetraciMrizkaKc', 'Větrací mřížka (ext)', 'Kč/ks', ''],
    ['C.transportKc', 'Interní transport', 'Kč/cesta', ''],
    ['C.zastreseniM2Kc', 'Zastřešení šachty (ext)', 'Kč/m²', ''],
    ['C.oplechFasadaBmKc', 'Oplechování k fasádě (ext)', 'Kč/bm', ''],
  ]],
  /* ATYP (#7). Skupina se jmenuje stejně jako katalogová sekce `atyp` –
   * záložka Ceník podle názvu skupiny páruje trvalé vlastní položky
   * (viz CENIK_GRP_SEKCE v ui/cenik_ui.js), takže sem půjde přidávat
   * i konkrétní atypické prvky, ne jen tuhle jednu sazbu.
   * Do kalkulace a do nabídky přitom všechno spadá do HRUBÉ OCK –
   * zákazník má vidět jednu ocelovou konstrukci, ne účet za „něco navíc". */
  ['ATYP – PRVKY A PRÁCE NAVÍC', [
    ['C.zamecnikAtypKc', 'Zámečník – ostatní práce (atyp)', 'Kč/j.', 'v zakázce jde přebít dohodou pro jednu stavbu'],
  ]],
  ['OPLÁŠTĚNÍ', [
    ['C.skloBokyNazev', 'Sklo boky + zadní stěna – typ', '', '', 'text'],
    ['C.skloBokyKc', 'Sklo boky + zadní stěna', 'Kč/m²', ''],
    ['C.skloCelniNazev', 'Sklo čelní stěna – typ', '', '', 'text'],
    ['C.skloCelniKc', 'Sklo čelní stěna', 'Kč/m²', ''],
    ['C.praceOplasteniKc', 'Práce opláštění', 'Kč/m²', ''],
    ['C.plastKotvyKc', 'Plastové kotvy (zasklení na terče)', 'Kč', ''],
    ['C.tmeleniKc', 'Tmelení – materiál + práce (ext)', 'Kč/m²', ''],
    ['C.striskaDvurKc', 'Stříška nad vstupem na dvůr (průchozí ext)', 'Kč', ''],
    ['C.cestovniKc', 'Cestovní náklady', 'Kč', ''],
    ['C.cisteniKc', 'Čištění', 'Kč', ''],
  ]],
  ['VOLITELNÉ POLOŽKY', [
    ['C.prechodoveKgKc', 'Přechodové plechy – nerez', 'Kč/kg', ''],
    ['C.leseniVnitrniKc', 'Lešení vnitřní', 'Kč/m výšky', ''],
    ['C.leseniFix', 'Lešení – fixní část (společná pro všechna lešení)', 'Kč',
     'Jedno číslo pro vnitřní i vnější lešení, stejné ve volitelných položkách i v příplatcích.'],
    ['C.leseniVnejsiKc', 'Lešení vnější', 'Kč/m²', ''],
    ['C.hakyKc', 'Háky na mytí šachty (ext)', 'Kč/ks', ''],
    ['C.zabradliKc', 'Úpravy/napojení zábradlí (int)', 'Kč/nástupiště', ''],
    ['C.soklBmKc', 'Oplechování soklu prohlubně (ext)', 'Kč/bm', ''],
  ]],
  ['REŽIE', [
    ['C.sken3dKc', 'Zaměření 3D skenerem', 'Kč', ''],
    ['C.vystupZamereniKc', 'Výstup ze zaměření pro zákazníka', 'Kč', 'bez výstupu se účtuje 50 %'],
    ['C.engineeringKc', 'Engineering', 'Kč', ''],
    ['C.projekceHodKc', 'Dílenská dokumentace', 'Kč/hod', ''],
    ['C.statikaHod', 'Statické posouzení – hodin', 'hod', ''],
    ['C.statikaKc', 'Statické posouzení – sazba', 'Kč/hod', ''],
    ['C.rezieKancelareKc', 'Režie kanceláře', 'Kč', ''],
    ['C.stavbyvedouciHod', 'Stavbyvedoucí – hodin', 'hod', ''],
    ['C.stavbyvedouciKc', 'Stavbyvedoucí – sazba', 'Kč/hod', ''],
  ]],
  ['SPOJOVACÍ MATERIÁL', [
    ['C.spojovaci.riplockM10', 'Riplock M10', 'Kč/ks', ''],
    ['C.spojovaci.riplockM8', 'Riplock M8', 'Kč/ks', ''],
    ['C.spojovaci.nordlock', 'NordLock', 'Kč/ks', ''],
    ['C.spojovaci.nytM10', 'Nýtovací matice M10', 'Kč/ks', ''],
    ['C.spojovaci.nytM8', 'Nýtovací matice M8', 'Kč/ks', ''],
    ['C.spojovaci.nytM6', 'Nýtovací matice M6', 'Kč/ks', ''],
    ['C.spojovaci.tSrouby', 'T šrouby', 'Kč/ks', ''],
    ['C.spojovaci.sroubM10', 'Šrouby M10', 'Kč/ks', ''],
    ['C.spojovaci.sroubM8', 'Šrouby M8', 'Kč/ks', ''],
    ['C.spojovaci.sroubM6', 'Šrouby M6', 'Kč/ks', ''],
    ['C.spojovaci.zavitTyc', 'Závitové tyče M12', 'Kč/ks', ''],
    ['C.spojovaci.chemKotva', 'Chemické kotvy', 'Kč/ks', ''],
  ]],
  ['LAKOVÁNÍ', [
    ['C.lak.rezim', 'Počítat dle ceníku', '', 'ceny ověřit u lakovny nebo Tomáše', 'selLak'],
    ['C.lak.lakovnaProfilBm', 'Lakovna – profily', 'Kč/bm', ''],
    ['C.lak.lakovnaListaBm', 'Lakovna – lišty', 'Kč/bm', ''],
    ['C.lak.lakovnaM2', 'Lakovna – plechy/oplechování/terče', 'Kč/m²', ''],
    ['C.lak.tomasProfilM2', 'Tomáš – profily', 'Kč/m²', ''],
    ['C.lak.tomasListaBm', 'Tomáš – lišty', 'Kč/bm', ''],
    ['C.lak.tomasPlechKs', 'Tomáš – konstrukční plechy', 'Kč/ks', ''],
    ['C.lak.tomasOplechM2', 'Tomáš – oplechování', 'Kč/m²', ''],
    ['C.lak.tomasTercKs', 'Tomáš – terče', 'Kč/ks', ''],
  ]],
  ['PŘÍPLATKOVÉ POLOŽKY', [
    ['C.priplatky.vsgFolieM2', 'Sklo VSG s mléčnou fólií (příplatek)', 'Kč/m²', ''],
    ['C.priplatky.sknM2', 'Sklo SKN 176 Ug=1,1 (příplatek, ext)', 'Kč/m²', ''],
    ['C.priplatky.medStrechaM2', 'Střecha venkovní šachty v mědi (příplatek)', 'Kč/m²', ''],
    ['C.priplatky.ventilatorKc', 'Ventilátor (ext)', 'Kč/ks', ''],
    ['C.priplatky.zabranyDvereKc', 'Zábrany do dveřních vstupů', 'Kč/ks', ''],
    ['C.priplatky.madlaBmKc', 'Madla – tvrdé dřevo, čirý lak', 'Kč/bm', ''],
    ['C.priplatky.montazDveriKc', 'Montáž šachetních dveří', 'Kč/ks', ''],
    ['C.priplatky.prechMontKc', 'Přechodové plechy – montáž', 'Kč/ks', ''],
    ['C.priplatky.leseniHlavaKc', 'Lešení – dokončení hlavy šachty', 'Kč/m',
     'Nástavba už postaveného lešení – fixní část se u ní neúčtuje.'],
  ]],
  /* Kurz EUR (#155, 19. 8. 2026): jediná položka sekce Cizí měna. Kurz je
   * součást ceníku — verzuje se a zveřejňuje jako každá cena, takže u staré
   * nabídky jde doložit, jakým kurzem odešla. V dokumentu se kurz NIKDE
   * neukazuje (rozhodnutí J. V.), přepočítávají se jím jen částky. */
  ['CIZÍ MĚNA', [
    ['C.kurzEurKc', 'Kurz EUR', 'Kč/EUR',
     'přepočet cen pro nabídky v jiné než české mutaci; prázdné = cizojazyčný tisk se zastaví'],
  ]],
];

const CENIK_DEF_PROJ = [
  ['HODINOVÉ SAZBY (ZAMĚŘENÍ / STUDIE / DPZ / DPS)', [
    ['PC.sazby.projektant', 'Sazba – projektant', 'Kč/hod', 'dokumentace DOSS/SÚ/DPS, studie, výstup zaměření'],
    ['PC.sazby.statik', 'Sazba – statik', 'Kč/hod', 'statika v DPZ a DPS'],
    ['PC.sazby.zamereni', 'Sazba – zaměření', 'Kč/hod', '3D skener'],
  ]],
  ['PROJEDNÁNÍ STUDIE', [
    ['PC.fixy.pamatkari', 'Památkáři', 'Kč', 'fixní částka'],
    ['PC.fixy.uzemniRozvoj', 'Územní rozvoj', 'Kč', 'fixní částka'],
  ]],
  ['DPZ – DOKUMENTACE PRO POVOLENÍ ZÁMĚRU', [
    ['PC.fixy.pbr', 'PBŘ (požárně bezpečnostní řešení)', 'Kč', 'fixní částka'],
    ['PC.fixy.studieOsvitu', 'Studie osvitu (Praha 4 a 6)', 'Kč', 'fixní částka'],
    ['PC.fixy.elektroDpz', 'Elektro projekt (DPZ)', 'Kč', 'fixní částka'],
  ]],
  ['IČ – INŽENÝRSKÁ ČINNOST', [
    ['PC.fixy.ic', 'Inženýrská činnost', 'Kč', 'fixní částka'],
  ]],
  ['DPS – DOKUMENTACE PRO PROVEDENÍ STAVBY', [
    ['PC.fixy.elektroDps', 'Elektro projekt (DPS)', 'Kč', 'fixní částka'],
  ]],
  ['EZC – EKONOMICKÁ ZADÁVACÍ ČÁST', [
    ['PC.fixy.ezc', 'Ekonomická zadávací část', 'Kč', 'fixní částka za celý projekt'],
  ]],
  ['KOLAUDACE A GEODET', [
    ['PC.fixy.kolaudace', 'Kolaudace', 'Kč', 'pro 1 ks výtahu'],
    ['PC.fixy.geodet', 'Geodetické zaměření', 'Kč', 'fixní částka'],
  ]],
  ['DOPRAVA', [
    ['PC.dopravaKmKc', 'Doprava – sazba za km', 'Kč/km', 'po Praze 0 km'],
    /* Pevný paušál „mimo Prahu" (dopravaPausalKc) z editoru zmizel 17. 8. 2026:
     * příplatek se počítá vzorcem km / 60 × 1000 (engine_proj.js) a editovatelné
     * číslo bez účinku je přesně past, která se opravovala 2. 8. 2026.
     * Klíč v datech ceníku zůstává kvůli starým uloženým ceníkům. */
  ]],
  /* Kurz EUR — viz poznámka u sekce Cizí měna v ceníku OCK (#155). */
  ['CIZÍ MĚNA', [
    ['PC.kurzEurKc', 'Kurz EUR', 'Kč/EUR',
     'přepočet cen pro nabídky v jiné než české mutaci; prázdné = cizojazyčný tisk se zastaví'],
  ]],
];

/* Ceníkové klíče, u kterých je prázdno platná hodnota („nenastaveno").
 * Dnes je množina prázdná: každá položka ceníku musí mít číslo, protože nula
 * v ceníku znamená položku zdarma a to se nemá stát omylem při importu
 * z tabulky. Mechanismus tu zůstává, aby se u prvního takového klíče nemusel
 * vymýšlet znovu. */
const CENIK_SMI_BYT_PRAZDNY = new Set([
  /* Kurz EUR (#155): prázdno = „nenastaveno" a je to platný stav — blokuje
   * jen cizojazyčný tisk. Nula od importu by naopak vypadala jako kurz. */
  'C.kurzEurKc', 'PC.kurzEurKc',
]);

/* přístup do konkrétního ceníkového objektu podle cesty „C.a.b" / „PC.a.b" */
function cenikGet(obj, cesta) {
  const ks = cesta.split('.').slice(1);   // zahodit prefix C/PC
  return ks.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function cenikSet(obj, cesta, val) {
  const ks = cesta.split('.').slice(1), last = ks.pop();
  const cil = ks.reduce((o, k) => (o[k] = o[k] || {}), obj);
  cil[last] = val;
}
function cenikTyp(def, cesta) {
  for (const [, items] of def) for (const it of items) if (it[0] === cesta) return it[4] || 'num';
  return 'num';
}

/* ---- Excel: sestavení řádků listu z definice + hodnot ceníku ---- */
const CENIK_HLAVICKA = ['Kategorie', 'Klíč', 'Popis', 'Jednotka', 'Hodnota', 'Poznámka'];
function cenikSheetRows(def, obj, extra) {
  const rows = [CENIK_HLAVICKA.slice()];
  (extra || []).forEach(e => rows.push(['', e.klic, e.popis, e.jed || '', e.hodnota, e.pozn || '']));
  def.forEach(([grp, items]) => items.forEach(([cesta, popis, jed, pozn]) =>
    rows.push([grp, cesta, popis, jed || '', cenikGet(obj, cesta), pozn || ''])));
  return rows;
}
/* ceníky OCK (C) + PROJ (PC) → sheets pro xlsxZapis */
function cenikToSheets(C, PC) {
  return [
    { nazev: 'Ceník OCK', rows: cenikSheetRows(CENIK_DEF, C, [
      { klic: 'C.marze', popis: 'GLOBÁLNÍ PŘIRÁŽKA OCK (podíl, 0.30 = 30 %)', hodnota: C.marze },
      { klic: 'C.dph', popis: 'Sazba DPH (podíl, 0.12 = 12 %)', hodnota: C.dph }]) },
    { nazev: 'Ceník PROJ', rows: cenikSheetRows(CENIK_DEF_PROJ, PC, [
      { klic: 'PC.marze', popis: 'GLOBÁLNÍ PŘIRÁŽKA PROJ (podíl)', hodnota: PC.marze }]) },
  ];
}

/* ---- Excel import: z listů spočítej změny proti aktuálnímu ceníku ----
 * Vrací { zmeny:[{cesta,popis,stara,nova}], chyby:[str], nezname:[cesta] }.
 * NEaplikuje – aplikace až po potvrzení přes cenikAplikuj(). */
function cenikDiffZeSheets(sheets, C, PC) {
  const cil = { 'C': { obj: C, def: CENIK_DEF }, 'PC': { obj: PC, def: CENIK_DEF_PROJ } };
  const znameKlice = new Set(['C.marze', 'C.dph', 'PC.marze']);
  [CENIK_DEF, CENIK_DEF_PROJ].forEach(def => def.forEach(([, items]) => items.forEach(it => znameKlice.add(it[0]))));
  const zmeny = [], chyby = [], nezname = [];
  (sheets || []).forEach(sh => {
    const rows = sh.rows || [];
    // najdi sloupce podle hlavičky (Klíč, Hodnota) – jinak předpokládej B a E
    let head = rows[0] || [];
    let ci = head.findIndex(x => /kl[ií]č/i.test(String(x)));
    let vi = head.findIndex(x => /hodnota/i.test(String(x)));
    if (ci < 0) ci = 1; if (vi < 0) vi = 4;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || []; const klic = String(r[ci] == null ? '' : r[ci]).trim();
      if (!klic) continue;
      if (!znameKlice.has(klic)) { nezname.push(klic); continue; }
      const prefix = klic.split('.')[0];
      const t = cil[prefix]; if (!t) { nezname.push(klic); continue; }
      let nova = r[vi];
      const typ = klic === 'C.marze' || klic === 'C.dph' || klic === 'PC.marze'
        ? 'num' : cenikTyp(t.def, klic);
      if (typ === 'num') {
        /* Prázdná buňka u klíče, který smí být nenastavený, není chyba —
         * je to platná hodnota „nenastaveno" (#132: výchozí přirážka sekce).
         * U ostatních čísel prázdno chyba je: tichá nula v ceníku znamená
         * položku zdarma. „Prázdno není nula" platí oběma směry. */
        const prazdno = nova == null || String(nova).trim() === '';
        if (prazdno && CENIK_SMI_BYT_PRAZDNY.has(klic)) { nova = null; }
        else {
          if (typeof nova === 'string') nova = parseFloat(nova.replace(/\s/g, '').replace(',', '.'));
          if (typeof nova !== 'number' || !isFinite(nova)) { chyby.push('Neplatné číslo u ' + klic + ': „' + r[vi] + '"'); continue; }
        }
      } else { nova = String(nova == null ? '' : nova).trim(); }
      const stara = klic === 'C.marze' ? C.marze : klic === 'C.dph' ? C.dph : klic === 'PC.marze' ? PC.marze : cenikGet(t.obj, klic);
      /* Nenastaveno se dá zapsat třemi způsoby (chybí klíč, null, prázdná
       * buňka) a všechny znamenají totéž. Bez tohohle srovnání by import
       * hlásil změnu tam, kde se nic nezměnilo, a administrátor by odklikával
       * prázdné rozdíly. */
      const prazdneObe = CENIK_SMI_BYT_PRAZDNY.has(klic)
        && (stara == null || stara === '') && (nova == null || nova === '');
      if (!prazdneObe && String(stara) !== String(nova))
        zmeny.push({ cesta: klic, popis: String(r[2] == null ? '' : r[2]), stara, nova });
    }
  });
  return { zmeny, chyby, nezname };
}
/* Aplikuje spočítané změny do ceníků (in-place). */
function cenikAplikuj(zmeny, C, PC) {
  (zmeny || []).forEach(z => {
    if (z.cesta === 'C.marze') C.marze = z.nova;
    else if (z.cesta === 'C.dph') C.dph = z.nova;
    else if (z.cesta === 'PC.marze') PC.marze = z.nova;
    else if (z.cesta.split('.')[0] === 'PC') cenikSet(PC, z.cesta, z.nova);
    else cenikSet(C, z.cesta, z.nova);
  });
  return zmeny.length;
}

if (typeof module !== 'undefined')
  module.exports = { CENIK_DEF, CENIK_DEF_PROJ, cenikGet, cenikSet, cenikTyp,
    cenikSheetRows, cenikToSheets, cenikDiffZeSheets, cenikAplikuj, CENIK_HLAVICKA };
