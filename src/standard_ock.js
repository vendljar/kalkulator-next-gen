/* ============================================================
 * STANDARD OCK (#163, 21. 8. 2026, zadání J. V.)
 *
 * K ČEMU TO JE
 * Firma má napsaný standard ocelové konstrukce („Specifikace OCK – STANDARD"):
 * jaké profily, do jaké výšky, šířky a hloubky a s jakým opláštěním se šachta
 * ještě považuje za standardní. Do 21. 8. 2026 to hlídala jen hlava
 * obchodníka — kalkulace nabídla cokoli a nikde se neozvalo, že tahle šachta
 * je ve skutečnosti atyp.
 *
 * ZÁSADY (neporušovat)
 *  1. NIC NEBLOKUJE A NIC NEPŘEPOČÍTÁVÁ. Vyhodnocení je jen informace:
 *     štítek a seznam nálezů. Cena se nesmí změnit proto, že někdo přepsal
 *     hloubku o pět milimetrů — zapnutí přirážky ATYP zůstává na člověku.
 *  2. LIMITY NEJSOU V KÓDU. Standard se mění a měnit ho musí jít bez nové
 *     dávky. Tabulka žije v Nastavení → Standard OCK a zveřejňuje se na
 *     server jako ceník; `STANDARD_VYCHOZI` je jen výchozí znění.
 *  3. TŘETÍ STAV JE POVINNÝ. Když chybí údaj, bez kterého se rozhodnout
 *     nedá (typicky rozměry můstku), NENÍ to atyp — je to „nelze posoudit".
 *     Falešný atyp by lidi naučil štítek ignorovat.
 *  4. ROZMĚRY JSOU VNITŘNÍ, VÝŠKA JE CELKOVÁ VÝŠKA KONSTRUKCE
 *     (zdvih + horní přejezd + prohlubeň) — rozhodnutí J. V. 21. 8. 2026.
 *  5. ROZHODUJÍCÍ PROFIL JE SLOUPEK (rozhodnutí J. V.) — příčníky se
 *     nehlídají, sloupek určuje typ konstrukce.
 *  6. ČISTÁ LOGIKA. Žádný DOM, žádné fetch. Obrazovku dělá ui/standard_ui.js,
 *     štítek `standardPill()` v ui/common.js.
 * ============================================================ */

/* Výchozí znění standardu k 21. 8. 2026. Rozměry v milimetrech, výška
 * v metrech — tak, jak je psaný firemní dokument. */
const STANDARD_VYCHOZI = {
  schema: 1,
  /* Kontrola je ve VÝCHOZÍM STAVU VYPNUTÁ (pokyn J. V.): standard se teprve
   * zabíhá a než bude tabulka odladěná, nemá nikomu svítit červený štítek. */
  zapnuto: false,
  exterier: {
    profily: ['80x80', '100x100'],
    vyskaMaxM: 30,
    sirkaMaxMm: 2000,
    hloubkaMaxMm: 2000,
    zaskleni: 'souvislé jednotypové zasklení po celém povrchu',
  },
  /* Interiér má limity PODLE PROFILU — každý profil svou výšku a hloubku. */
  interier: {
    profily: [
      { profil: '80x40', vyskaMaxM: 25, sirkaMaxMm: 1800, hloubkaMaxMm: 1800 },
      { profil: '80x50', vyskaMaxM: 30, sirkaMaxMm: 1800, hloubkaMaxMm: 2500 },
    ],
    zaskleni: 'zasklívací terče na profily, sklo do rámečku',
  },
  mustek: {
    hloubkaMaxMm: 1000,
    sirkaJakoOck: true,      // šířka max na šířku OCK
    sirkaMaxMm: 2000,        // a zároveň nikdy víc než tohle
  },
  /* Jedno konstrukční řešení: standard připouští jen změnu hloubkového
   * rozměru můstku, ne jiné řešení. V aplikaci se to projeví jako podmínka
   * u hloubky — jiný než hloubkový rozdíl aplikace neumí poznat. */
  jedenTypZaskleni: true,
  kdo: '', kdy: '', verze: 1,
};

/* „Prázdno není nula" (pravidlo #8 projektu) platí i tady: nevyplněný rozměr
 * musí vrátit null, aby se z něj stalo „nelze posoudit", ne nula, která by
 * prošla jako splněný limit. `+''` je v JavaScriptu 0 — proto ta první
 * podmínka. (Nález při první zkoušce sady, 21. 8. 2026.) */
function _cislo(v) {
  const s = String(v == null ? '' : v).trim().replace(',', '.');
  if (s === '') return null;
  const n = +s;
  return Number.isFinite(n) ? n : null;
}

/* Očista uloženého standardu — server ani starší konfigurace nesmí protlačit
 * nesmysl. Chybějící části se doplní z výchozího znění. */
function standardOciste(vstup) {
  const v = (vstup && typeof vstup === 'object') ? vstup : {};
  const d = JSON.parse(JSON.stringify(STANDARD_VYCHOZI));
  const s = JSON.parse(JSON.stringify(STANDARD_VYCHOZI));
  s.zapnuto = v.zapnuto === true;
  if (v.exterier && typeof v.exterier === 'object') {
    const e = v.exterier;
    if (Array.isArray(e.profily)) s.exterier.profily = e.profily.map(x => String(x).trim()).filter(Boolean);
    ['vyskaMaxM', 'sirkaMaxMm', 'hloubkaMaxMm'].forEach(k => {
      const n = _cislo(e[k]); if (n !== null && n > 0) s.exterier[k] = n;
    });
    if (typeof e.zaskleni === 'string') s.exterier.zaskleni = e.zaskleni.slice(0, 200);
  }
  if (v.interier && typeof v.interier === 'object') {
    const i = v.interier;
    if (Array.isArray(i.profily)) {
      const rady = i.profily.map(r => ({
        profil: String((r || {}).profil || '').trim(),
        vyskaMaxM: _cislo((r || {}).vyskaMaxM),
        sirkaMaxMm: _cislo((r || {}).sirkaMaxMm),
        hloubkaMaxMm: _cislo((r || {}).hloubkaMaxMm),
      })).filter(r => r.profil);
      if (rady.length) s.interier.profily = rady;
    }
    if (typeof i.zaskleni === 'string') s.interier.zaskleni = i.zaskleni.slice(0, 200);
  }
  if (v.mustek && typeof v.mustek === 'object') {
    const n = _cislo(v.mustek.hloubkaMaxMm); if (n !== null && n > 0) s.mustek.hloubkaMaxMm = n;
    const m = _cislo(v.mustek.sirkaMaxMm); if (m !== null && m > 0) s.mustek.sirkaMaxMm = m;
    s.mustek.sirkaJakoOck = v.mustek.sirkaJakoOck !== false;
  }
  if (typeof v.jedenTypZaskleni === 'boolean') s.jedenTypZaskleni = v.jedenTypZaskleni;
  s.kdo = String(v.kdo || '').slice(0, 120);
  s.kdy = String(v.kdy || '').slice(0, 40);
  s.verze = Math.max(1, Math.round(_cislo(v.verze) || 1));
  void d;
  return s;
}

/* Nález = jedno porušené (nebo neposouditelné) pravidlo. */
function _nalez(co, limit, zadano, stav) {
  return { co, limit, zadano, stav: stav || 'mimo' };
}

/* Dimenze profilu z zadání se píše „80x80"; normalizace srovná zápis
 * („80 × 80", „80X80") na jeden tvar, aby porovnání nezáviselo na tom,
 * jak to kdo napsal do Nastavení. */
function standardNormProfil(s) {
  /* Znak „×" se nahrazuje písmenem x, ne prázdnem — jinak by z „80 × 80"
   * vzniklo „8080" a s „80x80" by se to nepotkalo (nález ze sady 21. 8.). */
  return String(s == null ? '' : s).toLowerCase()
    .replace(/×/g, 'x').replace(/\s+/g, '')
    .replace(/[^0-9x]/g, '');
}

/* ---------- vlastní vyhodnocení ----------
 * Vstup:
 *   z      – zadání OCK (Z): typSachty, sirka, hloubka (v metrech!), profily,
 *            zaskleni, mustek/mustekHloubkaMm/mustekSirkaMm
 *   vyskaM – celková výška konstrukce v metrech (r.odvozene.vyskaSachty)
 *   std    – tabulka standardu (po očistě)
 *   pripl  – volitelně: seznam názvů zvolených skel z příplatků (kontrola
 *            jednotypovosti); prázdné pole = nekontroluje se
 * Výstup: { stav: 'standard'|'atyp'|'nelze'|'vypnuto', nalezy: [], kontrol: n }
 */
function standardVyhodnot(z, vyskaM, std, pripl) {
  const s = standardOciste(std);
  if (!s.zapnuto) return { stav: 'vypnuto', nalezy: [], kontrol: 0, std: s };

  const zad = z || {};
  const nalezy = [];
  let kontrol = 0;
  const ext = String(zad.typSachty || '').indexOf('ext') === 0;

  /* --- profil sloupku --- */
  const profil = standardNormProfil(((zad.profily || {}).sloupek || {}).dim);
  let limity = null;
  kontrol++;
  if (!profil) {
    nalezy.push(_nalez('Profil sloupku', '—', 'neuvedeno', 'nelze'));
  } else if (ext) {
    const povolene = s.exterier.profily.map(standardNormProfil);
    if (povolene.indexOf(profil) < 0)
      nalezy.push(_nalez('Profil sloupku (exteriér)', s.exterier.profily.join(' nebo '), profil));
    limity = { vyskaMaxM: s.exterier.vyskaMaxM, sirkaMaxMm: s.exterier.sirkaMaxMm,
               hloubkaMaxMm: s.exterier.hloubkaMaxMm };
  } else {
    const rada = s.interier.profily.find(r => standardNormProfil(r.profil) === profil);
    if (!rada) {
      nalezy.push(_nalez('Profil sloupku (interiér)',
        s.interier.profily.map(r => r.profil).join(' nebo '), profil));
      /* Neznámý profil = neznámé limity. Rozměry se pak neposuzují proti
       * cizí tabulce; samotný profil je nález a to stačí. */
    } else {
      limity = { vyskaMaxM: rada.vyskaMaxM, sirkaMaxMm: rada.sirkaMaxMm,
                 hloubkaMaxMm: rada.hloubkaMaxMm };
    }
  }

  /* --- výška, šířka, hloubka (jen když známe limity) --- */
  if (limity) {
    kontrol += 3;
    const v = _cislo(vyskaM);
    if (v === null) nalezy.push(_nalez('Výška konstrukce', 'max ' + limity.vyskaMaxM + ' m', 'nelze spočítat', 'nelze'));
    else if (limity.vyskaMaxM && v > limity.vyskaMaxM)
      nalezy.push(_nalez('Výška konstrukce', 'max ' + limity.vyskaMaxM + ' m',
        (Math.round(v * 100) / 100) + ' m'));

    /* Šířka a hloubka jsou v zadání v METRECH, standard je v milimetrech. */
    const sirkaMm = _cislo(zad.sirka) === null ? null : Math.round(_cislo(zad.sirka) * 1000);
    const hloubkaMm = _cislo(zad.hloubka) === null ? null : Math.round(_cislo(zad.hloubka) * 1000);
    if (sirkaMm === null) nalezy.push(_nalez('Vnitřní šířka', 'max ' + limity.sirkaMaxMm + ' mm', 'neuvedeno', 'nelze'));
    else if (limity.sirkaMaxMm && sirkaMm > limity.sirkaMaxMm)
      nalezy.push(_nalez('Vnitřní šířka', 'max ' + limity.sirkaMaxMm + ' mm', sirkaMm + ' mm'));
    if (hloubkaMm === null) nalezy.push(_nalez('Vnitřní hloubka', 'max ' + limity.hloubkaMaxMm + ' mm', 'neuvedeno', 'nelze'));
    else if (limity.hloubkaMaxMm && hloubkaMm > limity.hloubkaMaxMm)
      nalezy.push(_nalez('Vnitřní hloubka', 'max ' + limity.hloubkaMaxMm + ' mm', hloubkaMm + ' mm'));
  }

  /* --- opláštění --- */
  kontrol++;
  const zaskleniZad = String(zad.zaskleni || '').toLowerCase();
  if (!ext) {
    /* Interiér: standardem jsou terče na profily. */
    if (zaskleniZad && zaskleniZad.indexOf('terč') < 0)
      nalezy.push(_nalez('Opláštění (interiér)', s.interier.zaskleni, zad.zaskleni));
  }
  /* Jednotypovost: víc druhů skla v příplatcích není standard (rozhodnutí
   * J. V. 21. 8. 2026 — „standard je jeden typ zasklení bez míchání skel"). */
  if (s.jedenTypZaskleni && Array.isArray(pripl)) {
    kontrol++;
    const druhy = pripl.map(x => String(x || '').trim()).filter(Boolean);
    /* POZOR na stav: hlásí se jako „nelze posoudit", NE jako atyp.
     * Příplatkové sklo je v nabídce dvakrát i tehdy, když jsou to dvě
     * VARIANTY pro zákazníka („chcete VSG, nebo SKN?") — a to standard
     * neporušuje. Rozdíl mezi „dvě varianty na výběr" a „dvě skla na jedné
     * šachtě" aplikace z dat nepozná, takže se ptá člověka místo toho, aby
     * hádala. Falešný atyp by lidi naučil štítek ignorovat (zásada 3). */
    if (druhy.length > 1)
      nalezy.push(_nalez('Jeden typ zasklení', 'jeden druh skla po celém povrchu',
        druhy.length + ' druhy v nabídce (' + druhy.join(', ')
        + ') — varianty pro zákazníka, nebo se míchají na jedné šachtě?', 'nelze'));
  }

  /* --- můstek --- */
  if (zad.mustek) {
    kontrol += 2;
    const h = _cislo(zad.mustekHloubkaMm);
    const sir = _cislo(zad.mustekSirkaMm);
    if (h === null) nalezy.push(_nalez('Hloubka můstku', 'max ' + s.mustek.hloubkaMaxMm + ' mm', 'nevyplněno', 'nelze'));
    else if (h > s.mustek.hloubkaMaxMm)
      nalezy.push(_nalez('Hloubka můstku', 'max ' + s.mustek.hloubkaMaxMm + ' mm', h + ' mm'));

    const sirkaOckMm = _cislo(zad.sirka) === null ? null : Math.round(_cislo(zad.sirka) * 1000);
    const strop = s.mustek.sirkaJakoOck && sirkaOckMm !== null
      ? Math.min(sirkaOckMm, s.mustek.sirkaMaxMm) : s.mustek.sirkaMaxMm;
    if (sir === null) nalezy.push(_nalez('Šířka můstku', 'max ' + strop + ' mm', 'nevyplněno', 'nelze'));
    else if (sir > strop)
      nalezy.push(_nalez('Šířka můstku',
        'max ' + strop + ' mm' + (s.mustek.sirkaJakoOck ? ' (na šířku OCK)' : ''), sir + ' mm'));
  }

  const nelze = nalezy.some(n => n.stav === 'nelze');
  const mimo = nalezy.some(n => n.stav === 'mimo');
  /* Pořadí je schválně tohle: skutečné porušení váží víc než chybějící údaj.
   * Kdyby „nelze posoudit" přebíjelo „mimo standard", stačilo by nevyplnit
   * hloubku můstku a atyp by se schoval. */
  return { stav: mimo ? 'atyp' : (nelze ? 'nelze' : 'standard'), nalezy, kontrol, std: s };
}

/* Krátký popis stavu do štítku. */
function standardPopis(vysledek) {
  const v = vysledek || {};
  if (v.stav === 'vypnuto') return '';
  if (v.stav === 'standard') return 'STANDARD OCK';
  if (v.stav === 'atyp') {
    const n = (v.nalezy || []).filter(x => x.stav === 'mimo').length;
    return 'ATYP OCK · ' + n + (n === 1 ? ' nález' : (n < 5 ? ' nálezy' : ' nálezů'));
  }
  return 'NELZE POSOUDIT';
}

if (typeof module !== 'undefined')
  module.exports = { STANDARD_VYCHOZI, standardOciste, standardVyhodnot,
    standardNormProfil, standardPopis };
