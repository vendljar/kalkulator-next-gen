/* ============================================================
 * PROTOKOL O KALKULACI (#41) – kdo, kdy a co v zakázce změnil
 *
 * Otázka, kterou zakázka dnes neumí zodpovědět, zní: „proč je ta cena jiná,
 * než jsem si pamatoval?" Zakázka je jeden JSON, který se přepisuje na místě.
 * Jakmile se něco přepíše, předchozí stav nikde není a nikdo se nedozví, že
 * se vůbec něco stalo. U nabídky, která už odešla ven, je to vážná díra.
 *
 * Proč se protokol počítá z DAT, a ne z odchycených kliknutí
 * ------------------------------------------------------------
 * Nabízí se zapisovat událost tam, kde se hodnota mění – tedy do obsluh
 * tlačítek. Tuhle lekci ale aplikace už jednou dostala u kroků zpět
 * (ui/historie.js): cest, kterými se do ZAK dostane změna, je mnohem víc,
 * než kolik jich kdy někdo vyjmenuje – načtení ceníku z _program.json, import
 * zakázky, migrace při otevření, hromadná úprava katalogu, změna technické
 * specifikace. Kdyby se zapisovalo jen tam, kde si na to někdo vzpomene,
 * chyběly by v protokolu právě ty tiché cesty, kvůli kterým protokol vzniká.
 * Proto se před akcí pořídí otisk (protokolOtisk) a po ní se porovná
 * (protokolRozdil): co se v datech opravdu změnilo, to se zapíše – bez ohledu
 * na to, kdo změnu vyvolal.
 *
 * Proč se dávka zkracuje
 * ----------------------
 * Načtení nového ceníku změní čtyřicet čísel najednou. Čtyřicet řádků
 * v protokolu ale není informace, to je závěj – hledaná věta „snížili jsme
 * cenu za nýt" v ní zapadne. Jedna dávka proto vypíše nejvýš
 * PROTOKOL_DAVKA_MAX změn a zbytek shrne do jediného řádku „a dalších N změn".
 *
 * Proč jsou čísla z ceníku označená jako citlivá
 * ----------------------------------------------
 * Ceník jsou náklady firmy a ty běžný uživatel nevidí nikde jinde (marže,
 * KPI, sloupce nákladů). Kdyby je vypsal protokol, byla by to zadními vrátky
 * tatáž informace. Záznam se proto uloží celý – aby ho administrátor viděl –
 * ale protokolText() ho běžnému uživateli ukáže bez hodnot: ví, že se ceník
 * měnil a kdo to udělal, konkrétní částky ne.
 *
 * Proč se obsah interních poznámek neopisuje
 * ------------------------------------------
 * Poznámky (#37) mají vlastní kartu a vlastní pravidla. Kdyby se jejich text
 * kopíroval i sem, existoval by na dvou místech a mazání poznámky by přestalo
 * dávat smysl. Protokol proto o poznámkách hlásí jen počet – že přibyly, ne co
 * v nich stojí. Stejně tak se sem nikdy nedostane obsah přílohy ani úvodní
 * fotky: u data URL se porovnává jen to, jestli tam něco je.
 *
 * Protokol sám se nikdy nedostane do žádného dokumentu pro zákazníka; hlídá to
 * test_protokol.js průchodem zdrojáků všech generátorů.
 *
 * Popisky polí: kde je česká věta, použije se; kde není, použije se přímo klíč
 * z dat. Vědomě – klíč ceníku je přesně to, co administrátor vidí v ceníku na
 * obrazovce, takže „nytKc 7 → 8" je čitelné, a vymýšlet čtyřicet překladů,
 * které by se s UI dřív nebo později rozešly, by bylo horší než užitečné.
 * ============================================================ */

/* Zakázka se nosí v jednom souboru a posílá e-mailem – protokol nesmí růst
 * donekonečna. Ubývá se od nejstaršího: čerstvá historie je ta, kvůli které
 * se člověk ptá. */
const PROTOKOL_MAX = 200;
const PROTOKOL_DAVKA_MAX = 12;

/* Pojistka pro případ, že se proti sobě octnou dvě úplně cizí zakázky (import
 * jiného souboru): rozdíl by jinak mohl mít tisíce řádků a zablokovat
 * překreslení obrazovky. */
const PROTOKOL_ROZDIL_MAX = 400;

/* Jak dlouho se doťukávání téhož políčka bere ještě jako jedna úprava.
 * Kdo přepisuje zdvih z 2000 na 2400, cestou vyrobí i 2200 a 2300 – a nikoho
 * z toho nezajímá nic než začátek a konec. Delší pauza (nebo jiné pole mezi
 * tím) už znamená rozhodnutí, na které se někdo mohl ptát, a to dostane
 * vlastní řádek. */
const PROTOKOL_SLOUCENI_MS = 10 * 60 * 1000;

let _protokolCitac = 0;
function protokolId() { return 'z' + Date.now().toString(36) + (_protokolCitac++).toString(36); }
function protokolTed() { return new Date().toISOString(); }

/* Vlastní identita zakázky. Zní zbytečně – zakázka má přece číslo –, jenže
 * číslo se za života zakázky mění a dvě čerstvé zakázky ho mají stejné
 * (předloha). Klíč potřebuje krok „Zpět": ten do ZAK dosadí starší otisk,
 * tedy JINÝ objekt, a protokol musí poznat, že jde pořád o tutéž zakázku
 * a že si má svoje záznamy ponechat (viz protokolDopln). */
function protokolZajisti(zak) {
  if (!zak) return zak === undefined ? undefined : null;
  if (!Array.isArray(zak.protokol)) zak.protokol = [];
  if (!zak.protokolKlic) zak.protokolKlic = protokolId();
  return zak;
}

/* ---------- zápis ---------- */

/* Bez popisu (`co`) není co zapsat – prázdný řádek v protokolu jen mate. */
function protokolZapis(zak, udalost) {
  if (!zak || !udalost || !udalost.co) return null;
  protokolZajisti(zak);
  const z = {
    id: protokolId(),
    kdy: udalost.kdy || protokolTed(),
    kdo: udalost.kdo || '',
    kde: udalost.kde || '',
    co: udalost.co,
  };
  if (udalost.pred !== undefined) z.pred = udalost.pred;
  if (udalost.po !== undefined) z.po = udalost.po;
  if (udalost.citlive) z.citlive = true;
  if (udalost.varianta) z.varianta = udalost.varianta;
  if (udalost.variantaNazev) z.variantaNazev = udalost.variantaNazev;
  const spojeny = _slucSPredchozim(zak, z);
  if (spojeny !== null) return spojeny;
  zak.protokol.push(z);
  if (zak.protokol.length > PROTOKOL_MAX)
    zak.protokol.splice(0, zak.protokol.length - PROTOKOL_MAX);
  return z;
}

/* Navazuje nový záznam na předchozí, jde-li o totéž pole, téhož člověka
 * a krátký časový odstup: z „2000 → 2200" a „2200 → 2400" vznikne jediné
 * „2000 → 2400". Slučuje se jen záznam s hodnotami (pred/po) – událostem
 * typu „vytištěno" nebo „a dalších N změn" by to ublížilo.
 * Vrací sloučený záznam, `null` když se nesloučilo. Vrátí-li se hodnota na
 * původní, záznam z protokolu zmizí: nic se nakonec nezměnilo a řádek
 * „2000 → 2000" by byl jen šum. */
function _slucSPredchozim(zak, z) {
  const p = zak.protokol[zak.protokol.length - 1];
  if (!p || z.pred === undefined || p.pred === undefined) return null;
  if (p.co !== z.co || p.kde !== z.kde || p.kdo !== z.kdo || (p.varianta || '') !== (z.varianta || '')) return null;
  const odstup = new Date(z.kdy).getTime() - new Date(p.kdy).getTime();
  if (!(odstup >= 0 && odstup <= PROTOKOL_SLOUCENI_MS)) return null;
  if (!_stejne(p.po, z.pred)) return null;      // mezi tím se hodnota měnila jinudy
  if (_stejne(p.pred, z.po)) { zak.protokol.pop(); return p; }
  p.po = z.po;
  p.kdy = z.kdy;
  return p;
}

/* Vrátí do zakázky záznamy, které v ní chybí. Existuje kvůli kroku „Zpět":
 * ten dosadí starší otisk zakázky, a v něm je i starší (kratší) protokol.
 * Protokol se ale vracet nemá – co se jednou stalo, se odestát nedá, jinak by
 * šel celý zápis vygumovat klávesou Ctrl+Z. Řadí se podle času, aby se vrácené
 * záznamy zařadily zpátky mezi ostatní, ne na konec. */
function protokolDopln(zak, zaznamy) {
  protokolZajisti(zak);
  if (!zak || !Array.isArray(zaznamy) || !zaznamy.length) return zak ? zak.protokol : [];
  const mam = {};
  zak.protokol.forEach(z => { if (z && z.id) mam[z.id] = true; });
  const chybi = zaznamy.filter(z => z && z.id && !mam[z.id]);
  if (!chybi.length) return zak.protokol;
  zak.protokol = zak.protokol.concat(chybi).sort((a, b) => {
    const ka = String(a.kdy || ''), kb = String(b.kdy || '');
    return ka < kb ? -1 : (ka > kb ? 1 : (String(a.id) < String(b.id) ? -1 : 1));
  });
  if (zak.protokol.length > PROTOKOL_MAX)
    zak.protokol.splice(0, zak.protokol.length - PROTOKOL_MAX);
  return zak.protokol;
}

/* Otisk zakázky před akcí. Protokol sám se do otisku nedává – jinak by každý
 * zápis vypadal jako změna dat a vyvolal další zápis donekonečna. */
function protokolOtisk(zak) {
  if (!zak) return '';
  return JSON.stringify(zak, (k, v) => (k === 'protokol' ? undefined : v));
}

/* ---------- pomůcky pro porovnání ---------- */

function _jeObjekt(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function _prazdne(x) { return x === undefined || x === null || x === ''; }

function _stejne(a, b) {
  if (a === b) return true;
  /* undefined, null a prázdný řetězec jsou pro protokol totéž prázdno: starší
   * zakázka pole prostě nemá a doplnění migrací není změna, kterou by někdo
   * udělal. */
  if (_prazdne(a) && _prazdne(b)) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return false;
}

/* Do protokolu se nikdy neukládá surová hodnota, která by ho nafoukla nebo
 * z něj udělala druhé úložiště obsahu (fotka v data URL, dlouhý odstavec). */
function _bezpecna(v) {
  if (_jeObjekt(v)) return '(struktura)';
  if (Array.isArray(v)) return '(seznam ' + v.length + ')';
  if (typeof v === 'string') {
    if (/^data:/.test(v)) return '(soubor)';
    if (v.length > 120) return v.slice(0, 117) + '…';
  }
  return v;
}

const PROTOKOL_NAZVY = {
  cislo: 'Číslo nabídky', nazevAkce: 'Název akce', adresa: 'Adresa stavby',
  adresaObjednatele: 'Sídlo objednatele', objednatel: 'Objednatel',
  kontakt: 'Kontaktní osoba', ico: 'IČO objednatele', datum: 'Datum nabídky',
  popisZameru: 'Popis záměru', uvodniFotoNazev: 'Název úvodní fotky',
  uvodniFotoPopis: 'Popisek úvodní fotky',
  nazev: 'Název', pozn: 'Poznámka', fixes: 'Režim výpočtu',
  prejezd: 'Přejezd', zdvih: 'Zdvih', prohluben: 'Prohlubeň',
  sirka: 'Šířka', hloubka: 'Hloubka', roztec: 'Rozteč', nastupiste: 'Počet nástupišť',
  typSachty: 'Typ šachty', typPortalu: 'Typ portálu', zaskleni: 'Zasklení',
  atyp: 'Atyp', profily: 'Profily', rohoveSloupky: 'Rohové sloupky',
  marze: 'Přirážka', dph: 'Sazba DPH',
  krok: 'Krok zaokrouhlení', smer: 'Směr zaokrouhlení',
  procento: 'Procento slevy', schvaleno: 'Schválení slevy', duvod: 'Důvod slevy',
  zamceno: 'Uzamčeno', typ: 'Typ dokumentu',
};

/* Popisky, které platí jen na první úrovni dané sekce. „nazev" ve variantě je
 * název varianty, „nazev" v technické specifikaci je něco úplně jiného –
 * jeden globální překlad by tu lhal. */
const PROTOKOL_NAZVY_VARIANTA = {
  nazev: 'Název varianty', zakaznik: 'Zákazník varianty',
  pozn: 'Poznámka k variantě', ridici: 'Řídící varianta', cislo: 'Číslo varianty',
};

function protokolNazevPole(klic) { return PROTOKOL_NAZVY[klic] || klic; }

function _popisCesty(cesta, ctx) {
  if (!cesta.length) return 'Hodnota';
  return cesta.map((k, i) =>
    (i === 0 && ctx && ctx.nazvy && ctx.nazvy[k]) ? ctx.nazvy[k] : protokolNazevPole(k)
  ).join(' → ');
}

function _pridej(out, ctx, cesta, popisNavic, pred, po) {
  const zaklad = _popisCesty(cesta, ctx);
  const z = { kde: ctx.kde || '', co: popisNavic ? (zaklad + ' – ' + popisNavic) : zaklad,
              pred: _bezpecna(pred), po: _bezpecna(po),
              citlive: !!ctx.citlive, varianta: ctx.varianta || null };
  if (ctx.variantaNazev) z.variantaNazev = ctx.variantaNazev;
  out.push(z);
}

function _porovnej(pa, pb, cesta, ctx, out) {
  if (out.length >= PROTOKOL_ROZDIL_MAX) return;

  if (_jeObjekt(pa) || _jeObjekt(pb)) {
    /* Doplněná nebo odebraná struktura se porovnává proti prázdné – zajímá
     * nás, co v ní přibylo, ne že „tam něco je". */
    const a = _jeObjekt(pa) ? pa : (_prazdne(pa) ? {} : null);
    const b = _jeObjekt(pb) ? pb : (_prazdne(pb) ? {} : null);
    if (a && b) {
      const klice = Object.keys(a);
      Object.keys(b).forEach(k => { if (klice.indexOf(k) < 0) klice.push(k); });
      klice.forEach(k => _porovnej(a[k], b[k], cesta.concat(k), ctx, out));
      return;
    }
    _pridej(out, ctx, cesta, null, pa, pb);
    return;
  }

  if (Array.isArray(pa) || Array.isArray(pb)) {
    const a = Array.isArray(pa) ? pa : [], b = Array.isArray(pb) ? pb : [];
    /* Jiný počet položek je jedna srozumitelná událost; párovat řádky podle
     * obsahu by dalo dlouhý seznam posunutých indexů a žádnou informaci. */
    if (a.length !== b.length) {
      _pridej(out, ctx, cesta, 'počet položek', a.length, b.length);
      return;
    }
    for (let i = 0; i < a.length; i++)
      _porovnej(a[i], b[i], cesta.concat('řádek ' + (i + 1)), ctx, out);
    return;
  }

  if (_stejne(pa, pb)) return;
  _pridej(out, ctx, cesta, null, pa, pb);
}

/* ---------- rozdíl dvou stavů zakázky ---------- */

const PROTOKOL_HLAVICKA_POLE = ['cislo', 'nazevAkce', 'adresa', 'adresaObjednatele',
  'objednatel', 'kontakt', 'ico', 'datum', 'popisZameru', 'uvodniFotoNazev', 'uvodniFotoPopis'];

/* Sekce dat varianty. `citlive` = obsahuje náklady firmy, `root: true` u dítěte
 * znamená, že se popis počítá až od jeho obsahu (jinak by každý řádek začínal
 * „zadani → …" a opakoval to, co už stojí ve sloupci „kde"). */
const PROTOKOL_SEKCE = {
  ock: { kde: 'Zadání OCK', deti: { zadani: { kde: 'Zadání OCK', root: true } } },
  cenik: { kde: 'Ceník OCK', citlive: true },
  proj: { kde: 'Kalkulace PROJ',
          deti: { zadani: { kde: 'Zadání PROJ', root: true },
                  cenik: { kde: 'Ceník PROJ', citlive: true, root: true } } },
  techspec: { kde: 'Technická specifikace' },
  kryci: { kde: 'Krycí list OCK', deti: { hodnoty: { kde: 'Krycí list OCK', root: true } } },
  kryciProj: { kde: 'Krycí list PROJ', deti: { hodnoty: { kde: 'Krycí list PROJ', root: true } } },
  sleva: { kde: 'Sleva' },
  zaokr: { kde: 'Obchodní zaokrouhlení' },
  zamek: { kde: 'Zámek varianty' },
};
const PROTOKOL_SEKCE_JINE = { kde: 'Ostatní data varianty' };

/* Údržbové značky, které se mění samy od sebe – do protokolu nepatří.
 * `aktivni` je jen to, na kterou záložku se člověk zrovna dívá. */
const PROTOKOL_IGNOROVAT = ['protokol', 'vytvoreno', 'upraveno', 'schema', 'aktivni'];

function protokolRozdil(a, b) {
  const out = [];
  if (!a || !b) return out;

  /* 1) hlavička zakázky */
  PROTOKOL_HLAVICKA_POLE.forEach(k => {
    if (_stejne(a[k], b[k])) return;
    out.push({ kde: 'Hlavička zakázky', co: protokolNazevPole(k),
               pred: _bezpecna(a[k] === undefined ? '' : a[k]),
               po: _bezpecna(b[k] === undefined ? '' : b[k]),
               citlive: false, varianta: null });
  });
  /* Fotka se neporovnává obsahem – je to data URL o stovkách kilobajtů. */
  if (!!a.uvodniFoto !== !!b.uvodniFoto)
    out.push({ kde: 'Hlavička zakázky', co: 'Úvodní fotka nabídky',
               pred: a.uvodniFoto ? '(fotka)' : '', po: b.uvodniFoto ? '(fotka)' : '',
               citlive: false, varianta: null });

  /* 2) hlavička nabídky PROJ */
  _porovnej(a.projHlavicka, b.projHlavicka, [], { kde: 'Hlavička nabídky PROJ' }, out);

  /* 3) interní poznámky a přílohy – jen počty, nikdy obsah */
  [['poznamky', 'Počet poznámek'],
   ['prilohy', 'Počet příloh'],
   ['prilohySmazane', 'Počet odebraných příloh']].forEach(par => {
    const pa = Array.isArray(a[par[0]]) ? a[par[0]].length : 0;
    const pb = Array.isArray(b[par[0]]) ? b[par[0]].length : 0;
    if (pa !== pb)
      out.push({ kde: 'Interní poznámky a přílohy', co: par[1],
                 pred: pa, po: pb, citlive: false, varianta: null });
  });

  /* 4) varianty */
  const va = Array.isArray(a.varianty) ? a.varianty : [];
  const vb = Array.isArray(b.varianty) ? b.varianty : [];
  const mapaA = {}; va.forEach(v => { if (v && v.id) mapaA[v.id] = v; });
  const mapaB = {}; vb.forEach(v => { if (v && v.id) mapaB[v.id] = v; });

  va.forEach(v => {
    if (v && v.id && !mapaB[v.id])
      out.push({ kde: 'Varianty', co: 'Smazána varianta „' + (v.nazev || v.id) + '"',
                 pred: v.nazev || v.id, po: '', citlive: false, varianta: v.id });
  });
  vb.forEach(v => {
    if (v && v.id && !mapaA[v.id])
      out.push({ kde: 'Varianty', co: 'Přidána varianta „' + (v.nazev || v.id) + '"',
                 pred: '', po: v.nazev || v.id, citlive: false, varianta: v.id });
  });

  va.forEach(stara => {
    if (!stara || !stara.id) return;
    const nova = mapaB[stara.id];
    if (!nova) return;
    const ctxVar = { varianta: stara.id, variantaNazev: nova.nazev || stara.nazev || '' };

    /* vlastnosti varianty (název, zákazník, řídící, zámek) */
    const klice = Object.keys(stara);
    Object.keys(nova).forEach(k => { if (klice.indexOf(k) < 0) klice.push(k); });
    klice.forEach(k => {
      if (k === 'data' || k === 'id' || PROTOKOL_IGNOROVAT.indexOf(k) >= 0) return;
      const sekce = PROTOKOL_SEKCE[k];
      const ctx = sekce
        ? Object.assign({}, ctxVar, sekce)
        : Object.assign({}, ctxVar, { kde: 'Varianta', nazvy: PROTOKOL_NAZVY_VARIANTA });
      _porovnej(stara[k], nova[k], sekce ? [] : [k], ctx, out);
    });

    /* data varianty po sekcích, aby bylo hned vidět, čeho se změna týká */
    const da = stara.data || {}, db = nova.data || {};
    const dk = Object.keys(da);
    Object.keys(db).forEach(k => { if (dk.indexOf(k) < 0) dk.push(k); });
    dk.forEach(k => {
      const sekce = PROTOKOL_SEKCE[k] || PROTOKOL_SEKCE_JINE;
      if (sekce.deti) {
        const sa = _jeObjekt(da[k]) ? da[k] : {}, sb = _jeObjekt(db[k]) ? db[k] : {};
        const pk = Object.keys(sa);
        Object.keys(sb).forEach(x => { if (pk.indexOf(x) < 0) pk.push(x); });
        pk.forEach(x => {
          const d = sekce.deti[x] || { kde: sekce.kde, citlive: sekce.citlive };
          _porovnej(sa[x], sb[x], d.root ? [] : [x], Object.assign({}, ctxVar, d), out);
        });
        return;
      }
      _porovnej(da[k], db[k], PROTOKOL_SEKCE[k] ? [] : [k],
                Object.assign({}, ctxVar, sekce), out);
    });
  });

  return out;
}

/* ---------- zaznamenání dávky ---------- */

/* `pred` je rozparsovaný otisk (JSON.parse(protokolOtisk(zak))) pořízený před
 * akcí. Vrací zapsané záznamy. */
function protokolZaznamenej(zak, pred, opts) {
  const o = opts || {};
  if (!zak || !pred) return [];
  const rozdil = protokolRozdil(pred, zak);
  if (!rozdil.length) return [];
  const kdy = o.kdy || protokolTed();
  const kdo = o.kdo || '';

  const vypsat = rozdil.slice(0, PROTOKOL_DAVKA_MAX);
  const zapsane = vypsat.map(r => protokolZapis(zak, {
    kde: r.kde, co: r.co, kdo, kdy, pred: r.pred, po: r.po,
    citlive: r.citlive, varianta: r.varianta, variantaNazev: r.variantaNazev,
  })).filter(Boolean);

  if (rozdil.length > vypsat.length) {
    const zbytek = rozdil.slice(vypsat.length);
    /* Souhrnný řádek nese variantu jen tehdy, když se všechny nevypsané změny
     * týkají téže varianty – jinak by filtr podle varianty lhal. */
    const varianty = zbytek.map(r => r.varianta || null);
    const jedna = varianty.every(v => v === varianty[0]) ? varianty[0] : null;
    const souhrn = protokolZapis(zak, {
      kde: zbytek[0].kde, kdo, kdy, varianta: jedna,
      co: 'a dalších ' + zbytek.length + ' změn (podrobnosti se nevypisují)',
      citlive: zbytek.some(r => r.citlive),
    });
    if (souhrn) zapsane.push(souhrn);
  }
  return zapsane;
}

/* ---------- čtení ---------- */

function protokolSeznam(zak, opts) {
  const o = opts || {};
  if (!zak || !Array.isArray(zak.protokol)) return [];
  let l = zak.protokol.slice().reverse();          // od nejnovější
  /* Filtr podle varianty ukazuje i záznamy bez varianty (hlavička, tisk, ...):
   * ty se týkají zakázky jako celku, tedy i té varianty, na kterou se dívám. */
  if (o.varianta) l = l.filter(x => !x.varianta || x.varianta === o.varianta);
  if (o.kdo) l = l.filter(x => x.kdo === o.kdo);
  return l;
}

function protokolHodnota(v) {
  if (v === undefined || v === null || v === '') return '(prázdné)';
  if (v === true) return 'ano';
  if (v === false) return 'ne';
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  return String(v);
}

function protokolDatum(kdy) {
  const d = new Date(kdy);
  if (isNaN(d.getTime())) return String(kdy || '');
  return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
}

/* opts.cisla = smí se ukázat i citlivé hodnoty (administrátor). Bez nich
 * zůstane vidět, že se ceník měnil a kdo to udělal – jen ne o kolik. */
function protokolRadek(z, opts) {
  const o = opts || {};
  const kdo = z.kdo ? ', ' + z.kdo : '';
  const misto = z.kde ? z.kde + ': ' : '';
  let hodnoty = '';
  if (z.pred !== undefined || z.po !== undefined)
    hodnoty = (o.cisla || !z.citlive)
      ? ' ' + protokolHodnota(z.pred) + ' → ' + protokolHodnota(z.po)
      : ' (hodnoty skryté, vidí administrátor)';
  return protokolDatum(z.kdy) + kdo + ' – ' + misto + z.co + hodnoty;
}

function protokolText(zak, opts) {
  return protokolSeznam(zak).map(z => protokolRadek(z, opts)).join('\n');
}

function protokolShrnuti(zak) {
  const l = (zak && Array.isArray(zak.protokol)) ? zak.protokol : [];
  const uzivatele = [];
  l.forEach(z => { if (z.kdo && uzivatele.indexOf(z.kdo) < 0) uzivatele.push(z.kdo); });
  return {
    pocet: l.length,
    prvni: l.length ? l[0].kdy : '',
    posledni: l.length ? l[l.length - 1].kdy : '',
    uzivatele,
  };
}

if (typeof module !== 'undefined')
  module.exports = { PROTOKOL_MAX, PROTOKOL_DAVKA_MAX, PROTOKOL_ROZDIL_MAX,
                     PROTOKOL_SLOUCENI_MS,
                     protokolZajisti, protokolZapis, protokolDopln, protokolOtisk, protokolRozdil,
                     protokolZaznamenej, protokolSeznam, protokolText, protokolRadek,
                     protokolShrnuti, protokolHodnota, protokolDatum, protokolNazevPole,
                     PROTOKOL_SEKCE, PROTOKOL_HLAVICKA_POLE, PROTOKOL_NAZVY };
