/* ============================================================
 * ZÁMEK VYTIŠTĚNÉ NABÍDKY (#34) + ČÍSLOVÁNÍ VARIANT (#17)
 *
 * Pravidlo z provozu: vytištěná cenová nabídka je vnímaná jako ODESLANÁ.
 * Odeslaná nabídka se už needituje – co zákazník dostal na papíře, musí
 * v systému zůstat doslova. Proto se varianta v okamžiku tisku uzamkne
 * a běžný uživatel do ní už nezasáhne; pokračuje se KLONEM, tedy novou
 * variantou uvnitř téže zakázky.
 *
 * Číslování variant je ploché: původní varianta nese holé číslo zakázky,
 * každý klon dostane příponu .1, .2, .3 … Klon varianty „…-0500.1" je
 * tedy „…-0500.2", nikdy „…-0500.1.1" – přípony se nevnořují, jen rostou.
 * Nejvyšší přidělené číslo si zakázka pamatuje (zak.priponaMax), takže
 * ani po smazání varianty se číslo nepoužije podruhé: číslo, které už
 * jednou odešlo na papíře, nesmí patřit jiné nabídce.
 *
 * Tenhle soubor je čistý model – žádné DOM, žádné globální UI stavy.
 * Blokování editace řeší ui/zamek_ui.js, který se ptá jen na
 * variantaEditovatelna().
 * ============================================================ */

/* Které dokumenty zámek ARMUJÍ. Zamykají jen dokumenty, které jdou
 * zákazníkovi – cenová nabídka OCK a PROJ, ať už do Wordu, nebo do tisku.
 * Interní podklady (krycí listy, technická specifikace, náhled podkladů,
 * porovnání variant) se tisknou i mnohokrát během přípravy a zamknout
 * kvůli nim rozpracovanou variantu by práci jen zablokovalo. */
const ZAMEK_DOKUMENTY = {
  nabidka:         { zamyka: true,  popis: 'Cenová nabídka OCK (Word)' },
  nabidkaTisk:     { zamyka: true,  popis: 'Cenová nabídka OCK (tisk)' },
  nabidkaProj:     { zamyka: true,  popis: 'Cenová nabídka PROJ (Word)' },
  nabidkaProjTisk: { zamyka: true,  popis: 'Cenová nabídka PROJ (tisk)' },
  podklady:        { zamyka: false, popis: 'Náhled podkladů' },
  kryci:           { zamyka: false, popis: 'Krycí list objednávky / SoD' },
  kryciProj:       { zamyka: false, popis: 'Krycí list zakázky PROJ' },
  techspec:        { zamyka: false, popis: 'Technická specifikace' },
  porovnani:       { zamyka: false, popis: 'Porovnání variant' },
};

function dokumentZamyka(typ) {
  const d = ZAMEK_DOKUMENTY[typ];
  return !!(d && d.zamyka);
}

function dokumentPopis(typ) {
  const d = ZAMEK_DOKUMENTY[typ];
  return d ? d.popis : String(typ || '');
}

/* ---------- číslování variant ---------------------------------------- */

function variantaPripona(v) {
  const p = v && v.pripona;
  return (typeof p === 'number' && isFinite(p) && p > 0) ? Math.floor(p) : 0;
}

function dalsiPriponaVarianty(zak) {
  let max = (zak && typeof zak.priponaMax === 'number' && isFinite(zak.priponaMax))
    ? Math.floor(zak.priponaMax) : 0;
  ((zak && zak.varianty) || []).forEach(v => {
    const p = variantaPripona(v);
    if (p > max) max = p;
  });
  return max + 1;
}

/* Číslo nabídky konkrétní varianty. Bez přípony vrací HOLÉ číslo zakázky –
 * díky tomu se u dosavadních zakázek na dokumentech nic nemění. */
function variantaCislo(zak, v) {
  const zaklad = String((zak && zak.cislo) || '');
  const p = variantaPripona(v);
  return p ? zaklad.replace(/\s+$/, '') + '.' + p : zaklad;
}

/* Klon = nová varianta uvnitř téže zakázky. Přebírá kompletní data
 * (hluboká kopie), ale nikdy ne zámek ani příznak řídící varianty –
 * čerstvý klon je rozpracovaná nabídka, ne odeslaná. */
function klonujVariantu(zak, id, opts) {
  opts = opts || {};
  if (!zak || !Array.isArray(zak.varianty) || !zak.varianty.length) return null;
  const zdroj = zak.varianty.find(v => v.id === id) || aktivniVarianta(zak);
  if (!zdroj) return null;

  const p = dalsiPriponaVarianty(zak);
  const kopie = novaVarianta(opts.nazev || ('Varianta ' + (p + 1)),
                             JSON.parse(JSON.stringify(zdroj.data)));
  kopie.zakaznik = zdroj.zakaznik || '';
  kopie.pozn = zdroj.pozn || '';
  kopie.pripona = p;
  kopie.ridici = false;
  kopie.zamek = null;
  kopie.klonZ = zdroj.id;
  kopie.klonZCislo = variantaCislo(zak, zdroj);

  zak.varianty.push(kopie);
  zak.priponaMax = p;
  if (opts.aktivovat !== false) zak.aktivni = kopie.id;
  return kopie;
}

/* ---------- stav zámku ------------------------------------------------ */

function zamekInfo(v) {
  return (v && v.zamek && v.zamek.zamceno) ? v.zamek : null;
}

function variantaUzamcena(v) {
  return !!zamekInfo(v);
}

function variantaEditovatelna(v) {
  return !variantaUzamcena(v);
}

/* Uzamčení. První tisk je ten definitivní okamžik „odesláno" – uloží se
 * datum, typ dokumentu, číslo nabídky a otisk částek, které odešly.
 * Každý další tisk téže (už zamčené) varianty se jen připíše do seznamu
 * tisky[]; původní záznam se nepřepisuje, jinak by se ztratilo datum
 * skutečného odeslání. */
function zamkniVariantu(v, info) {
  if (!v) return null;
  info = info || {};
  const zaznam = {
    kdy: info.kdy || new Date().toISOString(),
    typ: info.typ || '',
    popis: info.popis || dokumentPopis(info.typ),
    kdo: info.kdo || '',
  };
  if (variantaUzamcena(v)) {
    if (!Array.isArray(v.zamek.tisky)) v.zamek.tisky = [];
    v.zamek.tisky.push(zaznam);
    return v.zamek;
  }
  v.zamek = {
    zamceno: true,
    kdy: zaznam.kdy, typ: zaznam.typ, popis: zaznam.popis, kdo: zaznam.kdo,
    cislo: info.cislo || '',
    otisk: info.otisk || null,
    tisky: [zaznam],
  };
  return v.zamek;
}

/* Odemknutí je výjimka, ne běžný krok: smí ho udělat jen správce a musí
 * uvést důvod. Původní zámek se neztrácí – uloží se do historie odemčení,
 * aby zůstalo dohledatelné, co a kdy bylo odesláno. */
function odemkniVariantu(v, opts) {
  opts = opts || {};
  if (!v) return { ok: false, duvod: 'varianta neexistuje' };
  if (!variantaUzamcena(v)) return { ok: false, duvod: 'varianta není zamčená' };
  if (!opts.jeAdmin) return { ok: false, duvod: 'odemknout smí jen správce' };
  const duvod = String(opts.duvod || '').trim();
  if (!duvod) return { ok: false, duvod: 'bez uvedení důvodu odemknout nelze' };

  if (!Array.isArray(v.odemceni)) v.odemceni = [];
  v.odemceni.push({
    kdy: opts.kdy || new Date().toISOString(),
    kdo: opts.kdo || '',
    duvod,
    zamek: v.zamek,
  });
  v.zamek = null;
  return { ok: true, duvod: '' };
}

/* ---------- otisk odeslaných částek ----------------------------------- */

/* Záměrně jen souhrnná čísla, ne hluboká kopie celé varianty: zakázka se
 * ukládá do JSON a plný snapshot u každého tisku by ji nafoukl. Tvar je
 * shodný s metrikami porovnání variant (POROVNANI_METRIKY), takže se otisk
 * dá zobrazit stejnými formátovači. */
/* DPH v otisku po částech (audit 1. 8. 2026, N3) – stejné klíče jako
 * v POROVNANI_METRIKY. Starší zámky nesou dphSazba/dphKc z doby jediné
 * sazby; zůstávají, jak byly pořízeny – otisk se zpětně nepřepisuje. */
const ZAMEK_OTISK_POLE = ['ockZaklad', 'slevaPct', 'slevaKc', 'ockPoSleve',
                          'projCelkem', 'celkemBezDph',
                          'dphOckSazba', 'dphOckKc', 'dphProjSazba', 'dphProjKc',
                          'celkemSDph', 'priplatky'];

function zamekOtisk(hodnoty) {
  const o = {};
  ZAMEK_OTISK_POLE.forEach(k => {
    const h = hodnoty ? hodnoty[k] : null;
    o[k] = (typeof h === 'number' && isFinite(h)) ? h : null;
  });
  return o;
}

function zamekOtiskZPorovnani(porovnani, id) {
  const sl = ((porovnani && porovnani.varianty) || []).find(x => x.id === id);
  return zamekOtisk(sl ? sl.hodnoty : null);
}

/* ---------- migrace --------------------------------------------------- */

/* Doplní nová pole do zakázek uložených před zavedením zámku.
 *
 * Přípony: první varianta zůstává na holém čísle zakázky, další dostanou
 * .1, .2 … v pořadí, v jakém jsou v zakázce. Dosud se všechny varianty
 * tiskly pod jedním číslem, což je přesně ta záměna, kterou má číslování
 * odstranit; žádná varianta zatím není zamčená, takže se tím nepřepisuje
 * číslo žádné prokazatelně odeslané nabídky.
 *
 * Funkce je idempotentní – opakované volání už nic nemění. */
function zajistiZamek(zak) {
  if (!zak || !Array.isArray(zak.varianty)) return zak;

  // Přípony: pokud je nemá žádná varianta (stará zakázka), rozdá se
  // 0, 1, 2 … v pořadí. Pokud některé už existují, doplní se jen ty
  // chybějící – vždy nad dosavadní maximum, aby se číslo neopakovalo.
  const zname = zak.varianty.filter(v => typeof v.pripona === 'number');
  let volne = 0;
  if (zname.length) {
    volne = Math.max(...zname.map(variantaPripona),
                     (typeof zak.priponaMax === 'number' && isFinite(zak.priponaMax))
                       ? Math.floor(zak.priponaMax) : 0) + 1;
  }
  zak.varianty.forEach(v => {
    if (typeof v.pripona !== 'number') { v.pripona = volne; volne++; }
  });

  let max = 0;
  zak.varianty.forEach(v => {
    v.pripona = variantaPripona(v);
    if (v.pripona > max) max = v.pripona;
    if (v.zamek && v.zamek.zamceno) {
      if (!Array.isArray(v.zamek.tisky) || !v.zamek.tisky.length)
        v.zamek.tisky = [{ kdy: v.zamek.kdy || '', typ: v.zamek.typ || '',
                           popis: v.zamek.popis || dokumentPopis(v.zamek.typ),
                           kdo: v.zamek.kdo || '' }];
    } else if (v.zamek != null) {
      v.zamek = null;   // rozbitý/nedokončený zápis zámku se nebere jako zámek
    } else {
      v.zamek = null;   // sjednocení undefined → null
    }
  });
  if (typeof zak.priponaMax !== 'number' || !isFinite(zak.priponaMax) || zak.priponaMax < max)
    zak.priponaMax = max;
  return zak;
}

if (typeof module !== 'undefined')
  module.exports = { ZAMEK_DOKUMENTY, dokumentZamyka, dokumentPopis,
                     variantaPripona, dalsiPriponaVarianty, variantaCislo,
                     klonujVariantu, zamekInfo, variantaUzamcena,
                     variantaEditovatelna, zamkniVariantu, odemkniVariantu,
                     ZAMEK_OTISK_POLE, zamekOtisk, zamekOtiskZPorovnani,
                     zajistiZamek };
