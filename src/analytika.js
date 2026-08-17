/* ============================================================
 * ANALYTIKA UŽÍVÁNÍ (#25 čas kalkulací, #26 heat mapa, #27 čísla provozu)
 * 17. 8. 2026, rozhodnutí J. V.
 *
 * ZÁSADY (neporušovat):
 *  1. Ukládají se VÝHRADNĚ AGREGÁTY — součty za všechny uživatele za den.
 *     Nikdy se neukládá, KDO co udělal; z dat nejde zpětně dohledat chování
 *     jednotlivce. Jediná výjimka je čas u zakázky (#25) — váže se
 *     k ZAKÁZCE, ne ke jménu, a vidí ho jen administrátor.
 *  2. Klíč prvku nesmí nést data zakázky: argumenty volání (identifikátory
 *     variant, jména zákazníků) se zahazují — viz analytikaKlic.
 *  3. Čas = jen aktivní práce. Mezera delší než ANALYTIKA_NECINNOST_MS
 *     (2 minuty, rozhodnutí 17. 8.) se nepočítá — otevřené okno není práce.
 *  4. Retence 24 měsíců (rozhodnutí 17. 8.); starší dny server maže.
 *  5. Analytika NEJDE do záloh (rozhodnutí 17. 8.) — statistika není
 *     obchodní dílo a zálohy mají zůstat malé.
 *  6. Vidí a ovládá jen Administrátor; vypínač je globální.
 *
 * Tenhle soubor je ČISTÁ LOGIKA (běží v prohlížeči, v Node testech i na
 * serveru přes jadro_moduly.cjs) — žádný DOM. Sběr událostí z rozhraní
 * dělá ui/analytika_ui.js, server netlify/functions/analytika.mjs.
 * ============================================================ */

/* GDPR text ČEKÁ NA PRÁVNÍKA (rozhodnutí 17. 8. 2026). Dokud je konstanta
 * prázdná, aplikace nikde nic nezobrazuje (žádná lišta, žádný odkaz).
 * Po odsouhlasení právníkem se sem vloží schválené znění — nic víc. */
const ANALYTIKA_GDPR_TEXT = '';

const ANALYTIKA_NECINNOST_MS = 2 * 60 * 1000;   // 2 minuty bez interakce = pauza
const ANALYTIKA_MAX_KLICU = 400;                // strop mapy na den (ochrana úložiště)
const ANALYTIKA_RETENCE_MESICU = 24;            // denní agregáty se drží 24 měsíců

/* ---------- klíč prvku ----------
 * „zalozka|TAG|popis". Popis je onclick/oninput prvku NEBO text tlačítka;
 * všechno v závorkách se nahrazuje „(…)“ — argumenty volání nesou
 * identifikátory variant a jména, a ta do analytiky NESMÍ. */
function analytikaKlic(zalozka, tag, popis) {
  let p = String(popis == null ? '' : popis)
    .replace(/\(([^)]|\n)*\)?/g, '(…)')       // zahodit argumenty volání
    .replace(/\s+/g, ' ').trim();
  if (!p) p = '?';
  if (p.length > 80) p = p.slice(0, 80);
  return String(zalozka) + '|' + String(tag) + '|' + p;
}

/* ---------- denní agregát ---------- */
function analytikaNovyDen() {
  return {
    kliky: {},          // klíč prvku → počet kliknutí
    zdrz: {},           // klíč prvku → sekundy soustředění (focus) na prvku
    zalozky: {},        // záložka → počet otevření
    pocty: { zakazky: 0, kalkulace: 0, tiskyWord: 0, tiskyNahled: 0, prihlaseni: 0, chyby: 0 },
  };
}

/* přičtení do mapy se stropem — přeteklé klíče se slévají do „…ostatní",
 * aby rozbitý klient nemohl denní záznam nafouknout do nekonečna */
function analytikaDoMapy(mapa, klic, kolik) {
  const k = (mapa[klic] === undefined && Object.keys(mapa).length >= ANALYTIKA_MAX_KLICU)
    ? '…ostatni' : klic;
  mapa[k] = (mapa[k] || 0) + kolik;
}

function analytikaPridej(den, u) {
  if (!u) return den;
  if (u.typ === 'klik' && u.klic) analytikaDoMapy(den.kliky, u.klic, u.n || 1);
  else if (u.typ === 'zdrz' && u.klic) analytikaDoMapy(den.zdrz, u.klic, +u.sek || 0);
  else if (u.typ === 'zalozka' && u.tab) den.zalozky[u.tab] = (den.zalozky[u.tab] || 0) + 1;
  else if (u.typ === 'pocet' && u.co && den.pocty[u.co] !== undefined) den.pocty[u.co]++;
  return den;                                    // neznámý typ se tiše ignoruje
}

/* slití dvou denních agregátů (server přičítá dávku klienta k uloženému dni);
 * snese chybějící části — starší záznamy nemusí znát novější počítadla */
function analytikaSlij(a, b) {
  const v = analytikaNovyDen();
  [a || {}, b || {}].forEach(d => {
    Object.entries(d.kliky || {}).forEach(([k, n]) => analytikaDoMapy(v.kliky, k, n));
    Object.entries(d.zdrz || {}).forEach(([k, n]) => analytikaDoMapy(v.zdrz, k, n));
    Object.entries(d.zalozky || {}).forEach(([k, n]) => { v.zalozky[k] = (v.zalozky[k] || 0) + n; });
    Object.entries(d.pocty || {}).forEach(([k, n]) => {
      if (v.pocty[k] !== undefined) v.pocty[k] += n;
    });
  });
  return v;
}

/* ---------- počty odvozené z kliků ----------
 * Jedna pravda pro „co je založená zakázka / tisk": odvozuje se z klíče
 * kliknutí, žádné ruční háčky ve dvaceti funkcích rozhraní. */
function analytikaPocetZKliku(klic) {
  const p = String(klic || '');
  if (p.includes('novaZakazkaUI(…)')) return 'zakazky';
  if (p.includes('varNova(…)')) return 'kalkulace';
  if (p.includes('nabidkaWord(…)') || p.includes('nabidkaProjWord(…)') || p.includes('sodWord(…)'))
    return 'tiskyWord';
  if (p.includes('nabidkaOckDokument(…)') || p.includes('nabidkaProjNahled(…)')) return 'tiskyNahled';
  return null;
}

/* ---------- měření času (#25) ----------
 * Krokovací automat: každá interakce přinese čas „ted" (ms) a část, ve které
 * uživatel právě je ('ock' | 'proj' | null). Mezera od minulé interakce se
 * přičte části, kde běžela PŘEDCHOZÍ aktivita (tam se pracovalo) — ale jen
 * když je kratší než limit nečinnosti. Výstupy jsou v celých sekundách. */
function casNovy() { return { posledni: 0, cast: null, ock: 0, proj: 0 }; }

function casKrok(stav, ted, cast) {
  const s = stav || casNovy();
  if (s.posledni > 0) {
    const mezera = ted - s.posledni;
    if (mezera > 0 && mezera <= ANALYTIKA_NECINNOST_MS && s.cast)
      s[s.cast] += Math.round(mezera / 1000);
  }
  s.posledni = ted;
  s.cast = cast || null;
  return s;
}

/* Která záložka patří které kalkulaci. Ceníky, přehled nabídek, schvalování
 * a nastavení se neměří — nejsou to práce NAD zakázkou, a přehled nabídek
 * míchá OCK i PROJ, takže by číslo jen kalilo. */
function analytikaCastZTabu(tab) {
  if (['kalk', 'detail', 'spec', 'specdata', 'kryci'].includes(tab)) return 'ock';
  if (['proj', 'detailproj', 'kryciproj'].includes(tab)) return 'proj';
  return null;
}

/* ---------- retence ----------
 * Vrací klíče „den/RRRR-MM-DD" starší než 24 měsíců od `dnes`. Cizí prefixy
 * a vadná data se nechávají být — mazat se smí jen to, čemu rozumíme. */
function analytikaRetence(klice, dnesIso) {
  const [r, m, d] = String(dnesIso).split('-').map(Number);
  if (!r || !m) return [];
  let hranR = r, hranM = m - ANALYTIKA_RETENCE_MESICU;
  while (hranM <= 0) { hranM += 12; hranR--; }
  const hranice = hranR + '-' + String(hranM).padStart(2, '0') + '-' + String(d || 1).padStart(2, '0');
  return (klice || []).filter(k => {
    const mch = /^den\/(\d{4}-\d{2}-\d{2})$/.exec(String(k));
    return !!mch && mch[1] < hranice;
  });
}

/* ---------- součty za období ----------
 * Vstup: dvojice [klíč 'den/RRRR-MM-DD', denní agregát]. Výstup: celkový
 * součet + řada po měsících ('RRRR-MM') pro srovnání měsíc/měsíc a rok/rok. */
function analytikaObdobi(dvojice) {
  let celkem = analytikaNovyDen();
  const poMesicich = {};
  (dvojice || []).forEach(([klic, den]) => {
    const mch = /^den\/(\d{4}-\d{2})-\d{2}$/.exec(String(klic));
    if (!mch || !den) return;
    celkem = analytikaSlij(celkem, den);
    poMesicich[mch[1]] = analytikaSlij(poMesicich[mch[1]] || null, den);
  });
  return { celkem, poMesicich };
}

/* ---------- režim sběru (globální vypínač, jen administrátor) ---------- */
function analytikaRezimNovy() { return { sber: true, kdo: '', kdy: '' }; }

function analytikaRezimNastav(rezim, sber, kdo, kdy) {
  if (typeof sber !== 'boolean') return null;
  return { sber, kdo: String(kdo || ''), kdy: String(kdy || '') };
}

if (typeof module !== 'undefined')
  module.exports = { ANALYTIKA_GDPR_TEXT, ANALYTIKA_NECINNOST_MS, ANALYTIKA_MAX_KLICU,
    ANALYTIKA_RETENCE_MESICU, analytikaKlic, analytikaNovyDen, analytikaPridej,
    analytikaSlij, analytikaPocetZKliku, casNovy, casKrok, analytikaCastZTabu,
    analytikaRetence, analytikaObdobi, analytikaRezimNovy, analytikaRezimNastav };
