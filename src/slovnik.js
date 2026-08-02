/* ============ POROVNÁNÍ SLOVNÍKU S TABULKOU VOCABULARY (#5) ============
 *
 * Slovník PREKLAD v preklad.js vznikl jednorázovým přepisem z tabulky
 * `EngineersCZ_Vocabulary_*.xlsx`. Od té doby žijí obě strany vlastním
 * životem: v tabulce se doplňují a opravují překlady (a chodí do ní rodilí
 * mluvčí, viz #32), v aplikaci přibývají hesla, která v tabulce nikdy nebyla.
 * Sesouhlasit to ručně přes 600 řádků je práce na půl dne a nikdo to nedělá.
 *
 * Tenhle modul je čistá logika porovnání – žádné DOM, žádné čtení souboru.
 * Dostane rozparsované řádky listu (z xlsxPrecti) a vrátí rozpad na čtyři
 * kategorie, které se liší mírou rizika:
 *
 *   doplnit   – v aplikaci je heslo bez překladu, tabulka ho má.
 *               Bezpečné: nic se nepřepisuje, jen se zaplní prázdné místo.
 *   rozdilne  – obě strany mají překlad a neshodují se.
 *               Tady musí rozhodnout člověk – tabulka nemusí mít pravdu,
 *               v aplikaci mohl někdo překlad vědomě upravit.
 *   nove      – heslo je jen v tabulce. Přidat se dá, ale slovník tím roste
 *               o věci, které aplikace nikdy nepoužije – proto zvlášť.
 *   jenVApp   – heslo je jen v aplikaci. Nic se s ním nedělá; je to podklad,
 *               co poslat překladatelům do tabulky.
 *
 * Klíčem porovnání je prekladNorm() – stejná normalizace, jakou používá tr(),
 * takže „UMÍSTĚNÍ ŠACHTY:" a „Umístění šachty" jsou totéž heslo. Bez toho by
 * porovnání hlásilo stovky falešných rozdílů kvůli velkým písmenům a dvojtečkám.
 * ====================================================================== */

const SLOVNIK_JAZYKY = ['en', 'de', 'fr'];

/* Hlavičku hledáme, ne předpokládáme: tabulka se v čase mění a sloupce se
 * v ní stěhují. Bereme první řádek do 20. pozice, kde se najde český sloupec
 * a aspoň jeden cizí jazyk. */
const SLOVNIK_HLAVICKY = {
  cz: /^(cz|cs|čes|cesk|czech|český|česky|čeština)/i,
  en: /^(en|eng|angl|english)/i,
  de: /^(de|ger|deu|něm|nem|german|deutsch)/i,
  fr: /^(fr|fra|fre|franc|fran|french|français)/i,
};

function slovnikNajdiHlavicku(rows) {
  const limit = Math.min((rows || []).length, 20);
  for (let ri = 0; ri < limit; ri++) {
    const radek = rows[ri] || [];
    const sl = {};
    radek.forEach((b, ci) => {
      const t = String(b == null ? '' : b).trim();
      if (!t) return;
      Object.keys(SLOVNIK_HLAVICKY).forEach(j => {
        if (sl[j] === undefined && SLOVNIK_HLAVICKY[j].test(t)) sl[j] = ci;
      });
    });
    if (sl.cz !== undefined && (sl.en !== undefined || sl.de !== undefined || sl.fr !== undefined))
      return { radek: ri, sloupce: sl };
  }
  return null;
}

/* Řádky listu → [{ cz, en, de, fr, radek }] (radek = číslo řádku v Excelu, od 1). */
function slovnikZListu(rows) {
  const h = slovnikNajdiHlavicku(rows);
  if (!h) return { chyba: 'V listu se nepodařilo najít hlavičku se sloupci CZ a aspoň jedním cizím jazykem.', polozky: [] };
  const bunka = (radek, ci) => ci === undefined ? '' : String(radek[ci] == null ? '' : radek[ci]).replace(/ /g, ' ').trim();
  const polozky = [];
  for (let ri = h.radek + 1; ri < rows.length; ri++) {
    const r = rows[ri] || [];
    const cz = bunka(r, h.sloupce.cz);
    if (!cz) continue;
    polozky.push({ cz, radek: ri + 1,
      en: bunka(r, h.sloupce.en), de: bunka(r, h.sloupce.de), fr: bunka(r, h.sloupce.fr) });
  }
  return { hlavicka: h, polozky, chyba: null };
}

/* Vybere z celého sešitu list, který vypadá jako slovník (nejvíc použitelných
 * řádků). Uživatel tak nemusí vědět, že se list jmenuje zrovna „Vocab". */
function slovnikVyberList(sheets) {
  let nej = null;
  (sheets || []).forEach(s => {
    const v = slovnikZListu(s.rows);
    if (v.chyba) return;
    if (!nej || v.polozky.length > nej.rozbor.polozky.length) nej = { list: s.nazev, rozbor: v };
  });
  return nej;
}

/* Porovná slovník aplikace s položkami z tabulky.
 * preklad = objekt PREKLAD (klíč = české heslo, hodnota = [EN, DE, FR]). */
function slovnikPorovnej(preklad, polozky, norm) {
  const nrm = norm || (s => String(s == null ? '' : s).trim().toLowerCase());
  const idx = {};                       // normalizovaný klíč → původní klíč v PREKLAD
  Object.keys(preklad || {}).forEach(k => { idx[nrm(k)] = k; });

  const doplnit = [], rozdilne = [], nove = [];
  const videnoVXlsx = {};
  let shodne = 0;

  (polozky || []).forEach(p => {
    const n = nrm(p.cz);
    if (!n) return;
    videnoVXlsx[n] = 1;
    const klic = idx[n];
    if (klic === undefined) {
      if (SLOVNIK_JAZYKY.some(j => p[j])) nove.push({ cz: p.cz, radek: p.radek, hodnoty: { en: p.en, de: p.de, fr: p.fr } });
      return;
    }
    SLOVNIK_JAZYKY.forEach((j, i) => {
      const vXlsx = p[j], vApp = (preklad[klic] || [])[i] || '';
      if (!vXlsx) return;                              // tabulka nic nenabízí
      if (!vApp) { doplnit.push({ klic, cz: p.cz, jazyk: j, tabulka: vXlsx, aplikace: '', radek: p.radek }); return; }
      if (vApp === vXlsx) { shodne++; return; }
      rozdilne.push({ klic, cz: p.cz, jazyk: j, tabulka: vXlsx, aplikace: vApp, radek: p.radek });
    });
  });

  const jenVApp = Object.keys(preklad || {})
    .filter(k => !videnoVXlsx[nrm(k)])
    .map(k => ({ klic: k, hodnoty: { en: (preklad[k] || [])[0] || '', de: (preklad[k] || [])[1] || '', fr: (preklad[k] || [])[2] || '' } }));

  return { doplnit, rozdilne, nove, jenVApp, shodne,
    souhrn: { vTabulce: (polozky || []).length, vAplikaci: Object.keys(preklad || {}).length,
      doplnit: doplnit.length, rozdilne: rozdilne.length, nove: nove.length, jenVApp: jenVApp.length, shodne } };
}

/* Zapíše vybrané změny do slovníku přes prekladNastav() – tedy včetně
 * přestavby rejstříku, aby se projevily hned. Vrací počet zapsaných hodnot.
 * Nic se nezapisuje bez explicitního seznamu: modul zásadně nic „nesrovnává
 * automaticky", protože překlad je odborná věc a tabulka nemusí mít pravdu. */
function slovnikAplikuj(zmeny, nastav) {
  let n = 0;
  (zmeny || []).forEach(z => {
    if (!z || !z.tabulka) return;
    if (nastav(z.klic != null ? z.klic : z.cz, z.jazyk, z.tabulka)) n++;
  });
  return n;
}

/* Nová hesla z tabulky → seznam změn pro slovnikAplikuj (po jazycích). */
function slovnikNoveJakoZmeny(nove) {
  const out = [];
  (nove || []).forEach(p => SLOVNIK_JAZYKY.forEach(j => {
    if (p.hodnoty[j]) out.push({ klic: p.cz, cz: p.cz, jazyk: j, tabulka: p.hodnoty[j], aplikace: '' });
  }));
  return out;
}

/* Podklad pro překladatele: hesla, která zná jen aplikace, jako CSV pro Excel. */
function slovnikCsvJenVApp(jenVApp) {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const hlav = ['CZ', 'EN', 'DE', 'FR'].map(q).join(';');
  const radky = (jenVApp || []).map(r => [r.klic, r.hodnoty.en, r.hodnoty.de, r.hodnoty.fr].map(q).join(';'));
  return '﻿' + [hlav].concat(radky).join('\r\n');
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { SLOVNIK_JAZYKY, slovnikNajdiHlavicku, slovnikZListu, slovnikVyberList,
    slovnikPorovnej, slovnikAplikuj, slovnikNoveJakoZmeny, slovnikCsvJenVApp };
