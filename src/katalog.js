/* ============================================================
 * KATALOG VLASTNÍCH POLOŽEK  (trvalá část ceníku)
 * ------------------------------------------------------------
 * Položky přidané v záložce CENÍK jsou „trvalé“ – žijí mimo zakázku
 * v objektu KATALOG a při každé nové zakázce/variantě se automaticky
 * propíšou do zadání, takže jsou součástí každé nové cenové nabídky.
 * (Položky přidané přímo v Kalkulaci OCK zůstávají lokální pro danou
 *  zakázku, dokud je uživatel tlačítkem „📌“ nepošle do ceníku.)
 *
 * Trvalé uložení mezi relacemi řeší SET-2 (konfigurace.json) – KATALOG
 * je jednou z jeho sekcí.
 * ============================================================ */

/* Sekce „atyp" (#7): práce a prvky navíc u atypických zakázek. Do kalkulace
 * padají do HRUBÉ OCK jako všechno ostatní – zákazník žádnou zvláštní sekci
 * nevidí. Vlastní sekci mají tady proto, aby jejich ceny žily v ceníku a daly
 * se udržovat; dřív se psaly ručně do zakázky a příště je nikdo nedohledal. */
const KATALOG_SEKCE = ['hrubaOck', 'atyp', 'oplasteni', 'volitelne', 'rezie', 'spojovaci', 'lakovani', 'priplatky'];
const KATALOG_SEKCE_NAZEV = {
  hrubaOck: 'HRUBÁ OCK', atyp: 'ATYP – PRVKY A PRÁCE NAVÍC',
  oplasteni: 'OPLÁŠTĚNÍ', volitelne: 'VOLITELNÉ POLOŽKY', rezie: 'REŽIE',
  spojovaci: 'SPOJOVACÍ MATERIÁL', lakovani: 'LAKOVÁNÍ', priplatky: 'PŘÍPLATKOVÉ POLOŽKY',
};

function katalogPrazdny() {
  const p = {};
  KATALOG_SEKCE.forEach(s => { p[s] = []; });
  return { verze: 1, seq: 0, polozky: p };
}

const KATALOG = katalogPrazdny();

/* stabilní id položky (kid) – roste v rámci katalogu, po importu se doseřídí */
function katalogNoveId(kat) {
  kat.seq = (+kat.seq || 0) + 1;
  return 'k' + kat.seq;
}
function katalogPreseq(kat) {   // po importu: seq = max(existující) aby nevznikaly kolize
  let max = 0;
  KATALOG_SEKCE.forEach(s => (kat.polozky[s] || []).forEach(p => {
    const n = parseInt(String(p.kid || '').replace(/^k/, ''), 10);
    if (isFinite(n) && n > max) max = n;
  }));
  kat.seq = Math.max(+kat.seq || 0, max);
  return kat.seq;
}

function katalogSekce(kat, sek) {
  if (!kat.polozky) kat.polozky = {};
  if (!Array.isArray(kat.polozky[sek])) kat.polozky[sek] = [];
  return kat.polozky[sek];
}

function katalogPridej(kat, sek, polozka) {
  const arr = katalogSekce(kat, sek);
  const it = {
    kid: (polozka && polozka.kid) || katalogNoveId(kat),
    nazev: (polozka && polozka.nazev) || 'Nová položka',
    mnozstvi: polozka && polozka.mnozstvi != null ? +polozka.mnozstvi : 1,
    cena: polozka && polozka.cena != null ? +polozka.cena : 0,
    jednotka: (polozka && polozka.jednotka) || '',
    pozn: (polozka && polozka.pozn) || '',
  };
  arr.push(it);
  return it;
}
function katalogNajdi(kat, sek, kid) {
  return katalogSekce(kat, sek).find(p => p.kid === kid) || null;
}
function katalogUprav(kat, sek, kid, klic, hodnota) {
  const it = katalogNajdi(kat, sek, kid);
  if (!it) return null;
  it[klic] = (klic === 'nazev' || klic === 'jednotka' || klic === 'pozn') ? String(hodnota) : +hodnota || 0;
  return it;
}
function katalogSmaz(kat, sek, kid) {
  const arr = katalogSekce(kat, sek);
  const i = arr.findIndex(p => p.kid === kid);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

/* kam v zadání patří položky dané sekce katalogu */
function katalogCil(z, sek) {
  if (sek === 'priplatky') {
    if (!Array.isArray(z.priplatkyVlastni)) z.priplatkyVlastni = [];
    return z.priplatkyVlastni;
  }
  if (!z.vlastniPolozky) z.vlastniPolozky = {};
  if (!Array.isArray(z.vlastniPolozky[sek])) z.vlastniPolozky[sek] = [];
  return z.vlastniPolozky[sek];
}

/* Doplní do zadání všechny katalogové položky, které v něm ještě nejsou.
 * Idempotentní (páruje přes kid). Respektuje z.katalogOdebrane – položky,
 * které uživatel v konkrétní zakázce ručně smazal, se nevrací zpět.
 * Vrací počet doplněných položek. */
function katalogAplikuj(kat, z) {
  if (!kat || !z) return 0;
  if (!Array.isArray(z.katalogOdebrane)) z.katalogOdebrane = [];
  let n = 0;
  KATALOG_SEKCE.forEach(sek => {
    const cil = katalogCil(z, sek);
    katalogSekce(kat, sek).forEach(k => {
      if (z.katalogOdebrane.indexOf(k.kid) >= 0) return;
      if (cil.some(p => p.kid === k.kid)) return;
      cil.push({ kid: k.kid, nazev: k.nazev, mnozstvi: +k.mnozstvi || 0, cena: +k.cena || 0 });
      n++;
    });
  });
  return n;
}

/* Úprava katalogové položky se hned promítne i do aktuálního zadání.
 * Při přejmenování navíc přestěhujeme ruční přepisy ze starého názvu na nový –
 * přepisy jsou klíčované názvem položky, takže bez toho by po přejmenování
 * zůstaly viset na klíči, který už nic nepotká (sirotek, viz prepisy.js, #4). */
function katalogUpravVc(kat, z, sek, kid, klic, hodnota) {
  const puvodniNazev = klic === 'nazev' ? (katalogNajdi(kat, sek, kid) || {}).nazev : null;
  const it = katalogUprav(kat, sek, kid, klic, hodnota);
  if (it && z) {
    const cil = katalogCil(z, sek).find(p => p.kid === kid);
    if (cil && (klic === 'nazev' || klic === 'cena' || klic === 'mnozstvi')) cil[klic] = it[klic];
    // typeof: katalog.js se v testech načítá i samostatně, bez prepisy.js
    if (klic === 'nazev' && puvodniNazev && puvodniNazev !== it.nazev && typeof prepisyPrejmenuj === 'function')
      prepisyPrejmenuj(z, puvodniNazev, it.nazev);
  }
  return it;
}
function katalogPridejVc(kat, z, sek, polozka) {
  const it = katalogPridej(kat, sek, polozka);
  if (z) katalogCil(z, sek).push({ kid: it.kid, nazev: it.nazev, mnozstvi: +it.mnozstvi || 0, cena: +it.cena || 0 });
  return it;
}
function katalogSmazVc(kat, z, sek, kid) {
  const ok = katalogSmaz(kat, sek, kid);
  if (ok && z) {
    const cil = katalogCil(z, sek);
    const i = cil.findIndex(p => p.kid === kid);
    if (i >= 0) cil.splice(i, 1);
  }
  return ok;
}

/* Lokální (v kalkulaci přidaná) položka → do katalogu natrvalo.
 * Položce v zadání přiřadí kid, takže se dál páruje s katalogem. */
function katalogUloz(kat, z, sek, index) {
  const cil = katalogCil(z, sek);
  const p = cil[index];
  if (!p) return null;
  if (p.kid && katalogNajdi(kat, sek, p.kid)) return katalogNajdi(kat, sek, p.kid);
  const it = katalogPridej(kat, sek, { nazev: p.nazev, mnozstvi: p.mnozstvi, cena: p.cena });
  p.kid = it.kid;
  const io = (z.katalogOdebrane || []).indexOf(it.kid);
  if (io >= 0) z.katalogOdebrane.splice(io, 1);
  return it;
}

/* Smazání položky v kalkulaci: pokud šlo o katalogovou, zapamatuj si to,
 * ať se v této zakázce nevrátí při dalším renderu. */
function katalogZapamatujOdebrani(z, polozka) {
  if (!z || !polozka || !polozka.kid) return;
  if (!Array.isArray(z.katalogOdebrane)) z.katalogOdebrane = [];
  if (z.katalogOdebrane.indexOf(polozka.kid) < 0) z.katalogOdebrane.push(polozka.kid);
}

/* Serializace pro konfigurace.json (SET-2) */
function katalogExport(kat) { return JSON.parse(JSON.stringify(kat)); }
function katalogImport(kat, data) {
  if (!data || typeof data !== 'object') return false;
  const nove = katalogPrazdny();
  KATALOG_SEKCE.forEach(s => {
    const arr = (data.polozky && data.polozky[s]) || [];
    if (!Array.isArray(arr)) return;
    nove.polozky[s] = arr.filter(p => p && p.nazev != null).map(p => ({
      kid: p.kid || '', nazev: String(p.nazev), mnozstvi: +p.mnozstvi || 0, cena: +p.cena || 0,
      jednotka: p.jednotka || '', pozn: p.pozn || '',
    }));
  });
  nove.seq = +data.seq || 0;
  katalogPreseq(nove);
  // doplnit chybějící kid (starší/ručně editované soubory)
  KATALOG_SEKCE.forEach(s => nove.polozky[s].forEach(p => { if (!p.kid) p.kid = katalogNoveId(nove); }));
  kat.verze = nove.verze; kat.seq = nove.seq; kat.polozky = nove.polozky;
  return true;
}
function katalogPocet(kat) {
  return KATALOG_SEKCE.reduce((a, s) => a + katalogSekce(kat, s).length, 0);
}

/* ============================================================
 * TRVALÉ POLOŽKY CENÍKU PROJ (19. 8. 2026)
 * ------------------------------------------------------------
 * PROJ nemá KATALOG jako OCK — jeho sekce a položky definuje
 * DEFAULT_ZADANI_PROJ ve zdrojáku a ceny nese ceník PROJ (PC).
 * „+ přidat položku trvale" proto zapisuje položku PŘÍMO DO CENÍKU
 * PROJ dané sekce (pc.vlastniPolozky[keySekce]), odkud se — stejně
 * jako katalogAplikuj u OCK — idempotentně doplní do zadání každé
 * zakázky, která z toho ceníku počítá. Ceník PROJ cestuje s variantou
 * a zveřejňuje se do platného ceníku programu, takže trvalá položka
 * přežije obnovení stránky a platí pro všechny budoucí zakázky.
 * Čistý model bez DOM — testuje se v test_katalog.js.
 * ============================================================ */

function projKatalogSekce(pc, sekKey) {
  if (!pc.vlastniPolozky || typeof pc.vlastniPolozky !== 'object') pc.vlastniPolozky = {};
  if (!Array.isArray(pc.vlastniPolozky[sekKey])) pc.vlastniPolozky[sekKey] = [];
  return pc.vlastniPolozky[sekKey];
}

/* kid s předponou pk, ať se nikdy nepotká s kid OCK katalogu (k…) */
function projKatalogNoveId(pc) {
  pc.vlastniSeq = (+pc.vlastniSeq || 0) + 1;
  return 'pk' + pc.vlastniSeq;
}

function projKatalogPridej(pc, sekKey, polozka) {
  const p = polozka || {};
  const it = { kid: p.kid || projKatalogNoveId(pc),
               nazev: p.nazev || 'Nová položka',
               typ: p.typ === 'hod' ? 'hod' : 'fix' };
  if (it.typ === 'hod') {
    it.sazba = p.sazba || 'projektant';
    it.hodiny = +p.hodiny || 0;
    it.rezerva = +p.rezerva || 0;
  } else it.cena = +p.cena || 0;
  projKatalogSekce(pc, sekKey).push(it);
  return it;
}

/* Doplní trvalé položky ceníku PROJ do zadání (pj.sekce). Idempotentní
 * (páruje přes kid), respektuje pj.katalogOdebrane — položky, které
 * uživatel v konkrétní zakázce ručně smazal, se nevrací. Vrací počet
 * doplněných položek. Doplněný řádek nese vlastni:true, takže se chová
 * jako každý jiný vlastní řádek (editace, smazání). */
function projKatalogAplikuj(pc, pj) {
  if (!pc || !pj || !Array.isArray(pj.sekce)) return 0;
  if (!Array.isArray(pj.katalogOdebrane)) pj.katalogOdebrane = [];
  const mapa = pc.vlastniPolozky || {};
  let n = 0;
  pj.sekce.forEach(s => {
    if (!Array.isArray(s.polozky)) s.polozky = [];
    (mapa[s.key] || []).forEach(k => {
      if (pj.katalogOdebrane.indexOf(k.kid) >= 0) return;
      if (s.polozky.some(p => p.kid === k.kid)) return;
      const p = { kid: k.kid, nazev: k.nazev, typ: k.typ === 'hod' ? 'hod' : 'fix', vlastni: true };
      if (p.typ === 'hod') { p.sazba = k.sazba || 'projektant'; p.hodiny = +k.hodiny || 0; p.rezerva = +k.rezerva || 0; }
      else p.cena = +k.cena || 0;
      s.polozky.push(p);
      n++;
    });
  });
  return n;
}

/* Úprava řádku s kid v kalkulaci se propíše zpět do ceníku PROJ, aby
 * trvalá položka nesla, co je na obrazovce — jinak by nové zakázky
 * dostávaly „Nová položka / 0", kterou už nikdo tak nevidí. */
function projKatalogPropis(pc, sekKey, polozka) {
  if (!pc || !polozka || !polozka.kid) return null;
  const it = projKatalogSekce(pc, sekKey).find(k => k.kid === polozka.kid);
  if (!it) return null;
  it.nazev = polozka.nazev;
  if (it.typ === 'hod') {
    it.sazba = polozka.sazba || it.sazba;
    it.hodiny = +polozka.hodiny || 0;
    it.rezerva = +polozka.rezerva || 0;
  } else it.cena = +polozka.cena || 0;
  return it;
}

function projKatalogZapamatujOdebrani(pj, polozka) {
  if (!pj || !polozka || !polozka.kid) return;
  if (!Array.isArray(pj.katalogOdebrane)) pj.katalogOdebrane = [];
  if (pj.katalogOdebrane.indexOf(polozka.kid) < 0) pj.katalogOdebrane.push(polozka.kid);
}

function projKatalogSmaz(pc, sekKey, kid) {
  const arr = projKatalogSekce(pc, sekKey);
  const i = arr.findIndex(k => k.kid === kid);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

if (typeof module !== 'undefined')
  module.exports = { KATALOG, KATALOG_SEKCE, KATALOG_SEKCE_NAZEV, katalogPrazdny, katalogNoveId, katalogPreseq,
    katalogSekce, katalogPridej, katalogNajdi, katalogUprav, katalogSmaz, katalogCil, katalogAplikuj,
    katalogUpravVc, katalogPridejVc, katalogSmazVc, katalogUloz, katalogZapamatujOdebrani,
    katalogExport, katalogImport, katalogPocet,
    projKatalogSekce, projKatalogNoveId, projKatalogPridej, projKatalogAplikuj,
    projKatalogPropis, projKatalogZapamatujOdebrani, projKatalogSmaz };
