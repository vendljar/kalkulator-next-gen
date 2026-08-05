/* ============================================================
 * HLÍDÁNÍ MARŽE (#36) – kolik na nabídce zbývá a kdy to říct nahlas
 *
 * Dnes se marže dá zjistit jen dopočtem z detailu mezivýpočtů, což nikdo
 * v běhu nedělá. Zároveň existuje jedna hranice, pod kterou firma prodávat
 * nechce – a ta už v aplikaci je: NAST.slevy.minMarze, pojistka u slev.
 * Tenhle modul z ní dělá hlídání celé nabídky, ne jen slevy.
 *
 * Proč jedno číslo a ne vlastní hranice: kdyby si #36 zavedlo svoje minimum,
 * aplikace by na dvou místech tvrdila dvě různé pravdy o tomtéž. Minimum se
 * nastavuje v Nastavení → Slevy a platí všude.
 *
 * Kde se marže může propadnout:
 *   – schválenou slevou (to hlídá i sleva.js, ale až ve chvíli zadání slevy),
 *   – nízkou přirážkou v ceníku varianty (dnes to nehlídá nic – sleva je
 *     nula, a přesto se vydělává málo),
 *   – u PROJ i přirážkou/slevou jednotlivé sekce; každá sekce má vlastní
 *     procento, takže celek může být v pořádku a jedna sekce přesto ztrátová.
 *     U OCK tahle možnost není: přirážka je pro všechny položky stejná, takže
 *     sekce OCK mají marži z principu shodnou a rozpad po sekcích by nic
 *     neřekl. Proto se OCK hlídá jako celek a PROJ po sekcích.
 *
 * Nic se neblokuje. Podkročení je informace pro člověka, ne zákaz – nabídka
 * pod minimem může být zcela záměrná (vstup k zákazníkovi, referenční akce).
 *
 * Čísla o nákladech a marži nepatří běžnému uživateli (stejné pravidlo jako
 * u KPI a sloupců nákladů). Varování ale vidět musí, jinak je k ničemu –
 * proto marzeText() umí dvě podoby: s čísly (admin) a bez nich.
 * ============================================================ */

/* Záložní minimum pro případ, že nastavení ještě není načtené.
 *
 * UKÁZKOVÁ hodnota – skutečná minimální marže je obchodní tajemství a přijde
 * ze složky _DB (_program.json → slevy.minMarze). Musí se ale shodovat
 * s výchozí NAST.slevy.minMarze v ui/common.js, jinak by aplikace tvrdila
 * dvě různá minima podle toho, který kus kódu se zeptá jako první. Přesně to
 * se jednou stalo (tady zůstalo staré číslo, v common.js se změnilo), takže
 * na tu shodu je test v test_marze.js. */
const MARZE_MIN_VYCHOZI = 0.10;

/* Jediný zdroj minima. Nesmysly (text, záporné číslo) se ignorují – lepší
 * hlídat výchozí hranicí než nehlídat vůbec. */
function marzeMin(nast) {
  const v = nast && nast.slevy ? nast.slevy.minMarze : null;
  return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : MARZE_MIN_VYCHOZI;
}

/* Marže jako podíl z ceny (ne přirážka z nákladu!). Bez ceny nemá smysl. */
function marzePodil(cena, naklad) {
  if (!(cena > 0)) return null;
  return (cena - naklad) / cena;
}

/* Kolik by se muselo přidat k ceně, aby se marže dostala na minimum. */
function marzeChybiKc(cena, naklad, min) {
  if (min >= 1) return null;
  const potreba = naklad / (1 - min);
  return potreba > cena ? potreba - cena : 0;
}

function marzeStav(kde, nazev, cena, naklad, min) {
  const marze = marzePodil(cena, naklad);
  const podMin = marze != null && marze < min - 1e-9;
  return { kde, nazev, cena, naklad, marze, min, podMin,
           chybiKc: podMin ? marzeChybiKc(cena, naklad, min) : 0,
           stupen: marzeStupen({ podMin, marze }) };
}

/* Jen odstín varování, ne míra zákazu: pod minimem se ještě vydělává,
 * záporná marže znamená, že se pracuje pod cenu. */
function marzeStupen(s) {
  if (!s || !s.podMin) return '';
  return (s.marze != null && s.marze < 0) ? 'ztrata' : 'pod';
}

/* ---------- OCK ---------- */
/* Základní cena po SCHVÁLENÉ slevě proti nákladu základní ceny. Příplatky se
 * sem nepočítají – do celkové ceny nabídky nevstupují a nabízejí se zvlášť
 * (stejně to má porovnání variant). */
/* zaokr (#38) je nepovinné: hlídá se marže z ceny, kterou zákazník opravdu
 * zaplatí, ne z ceny před obchodním zaokrouhlením. Bez něj se chová jako dřív. */
function marzeStavOck(vysl, sleva, nast, zaokr) {
  if (!vysl || !vysl.souhrn) return null;
  const cn = (typeof cenaNabidkyOck === 'function') ? cenaNabidkyOck(vysl, sleva, zaokr) : null;
  let cena;
  if (cn) { cena = cn.cena; }
  else {
    const podil = (typeof slevaPodil === 'function') ? slevaPodil(sleva || {}) : 0;
    cena = vysl.souhrn.zakladCena * (1 - Math.max(0, Math.min(1, +podil || 0)));
  }
  return marzeStav('OCK', 'Kalkulace OCK', cena, vysl.souhrn.zakladNaklad, marzeMin(nast));
}

/* ---------- PROJ ---------- */
/* Sekce bez položek (nulová cena i náklad) se přeskakují – prázdná sekce není
 * ztrátová, jen se nenabízí. */
/* Zaokrouhluje se jen celek – ceny sekcí jdou do nabídky nezaokrouhlené,
 * takže by jejich „opravená" marže neodpovídala tomu, co je v dokumentu. */
/* Doprava patří do NÁKLADU (oprava po auditu 1. 8. 2026, nález N2): cena
 * sekce ji obsahuje (cenaSDopravou), firma ji platí, a marže počítaná bez ní
 * dělala z dopravy čistý zisk – hlídání pak mlčelo i na nabídce, kde cena
 * dopravu neuhradí. KPI hlavičky PROJ počítá náklad + doprava odjakživa;
 * teď obě místa tvrdí totéž číslo (hlídá test_marze.js, sada 6). */
function marzeStavProj(vysl, nast, zaokr) {
  if (!vysl || !vysl.souhrn) return null;
  const min = marzeMin(nast);
  const sekce = (vysl.sekce || [])
    .filter(s => (s.celkem > 0 || s.naklad > 0 || s.dopravaKc > 0))
    .map(s => marzeStav('PROJ', s.nazev, s.celkem, s.naklad + (s.dopravaKc || 0), min));
  const cn = (typeof cenaNabidkyProj === 'function') ? cenaNabidkyProj(vysl, zaokr) : null;
  const celek = marzeStav('PROJ', 'Kalkulace PROJ', cn ? cn.cena : vysl.souhrn.celkem,
                          vysl.souhrn.naklad + (vysl.souhrn.doprava || 0), min);
  const pod = sekce.filter(s => s.podMin);
  return { celek, sekce, pod };
}

/* ---------- celá nabídka ---------- */
/* Vrací seznam míst pod minimem (od nejhoršího) a marži nabídky jako celku.
 * Chybí-li výpočet, mlčí – nedopočítává se z ničeho. */
/* zaokrProj je nepovinný: od 4. 8. 2026 má každá část nabídky vlastní
 * obchodní zaokrouhlení. Když se nepředá (starší volání, starší data),
 * platí pro obě části totéž nastavení jako dřív. */
function marzePrehled(ock, proj, sleva, nast, zaokr, zaokrProj) {
  const min = marzeMin(nast);
  const o = marzeStavOck(ock, sleva, nast, zaokr);
  const p = marzeStavProj(proj, nast, zaokrProj === undefined ? zaokr : zaokrProj);
  const pod = [];
  if (o && o.podMin) pod.push(o);
  if (p) p.pod.forEach(s => pod.push(s));
  pod.sort((a, b) => (a.marze == null ? 1 : a.marze) - (b.marze == null ? 1 : b.marze));

  let celek = null;
  if (o || p) {
    const cena = (o ? o.cena : 0) + (p ? p.celek.cena : 0);
    const naklad = (o ? o.naklad : 0) + (p ? p.celek.naklad : 0);
    celek = marzeStav('celek', 'Nabídka celkem', cena, naklad, min);
  }
  /* Celek pod minimem je taky důvod se ozvat, i když každá část zvlášť projde
   * (typicky: OCK těsně nad hranicí a ztrátová sekce PROJ vedle). */
  const varovat = pod.length > 0 || !!(celek && celek.podMin);
  return { varovat, min, pod, celek, ock: o, proj: p };
}

/* ---------- text ---------- */
/* Typografické minus (−), ne spojovník: u záporné marže je to jediné místo,
 * kde se „mínus sto procent" opravdu čte jako mínus. */
/* #14 krok 3: pravidlo (typografické minus, cs-CZ) bydlí ve format.js;
 * záložka je jeho zrcadlo jen pro samostatný běh modulu v Node. */
function marzePct(x) {
  if (typeof formatPctTypo === 'function') return formatPctTypo(x);
  if (x == null) return '—';
  const v = Math.round(x * 1000) / 10;
  return (v < 0 ? '−' : '') + Math.abs(v).toString().replace('.', ',') + ' %';
}
function marzeKc(x) {
  if (typeof formatKcTypo === 'function') return formatKcTypo(x);
  const v = Math.round(x || 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('cs-CZ') + ' Kč';
}

/* opts.cisla = smí se ukázat marže a částky (administrátor). Bez nich se řekne
 * jen to, že je něco pod minimem – běžný obchodník to vědět má, konkrétní
 * náklady firmy ne. */
function marzeText(prehled, opts) {
  if (!prehled || !prehled.varovat) return '';
  const o = opts || {};
  /* „co" dovoluje stejnou větu použít nad celou nabídkou i nad jednou
   * kalkulací – na záložce OCK nemá smysl mluvit o nabídce jako celku. */
  const co = o.co || 'této nabídky';
  if (!o.cisla)
    return `Marže ${co} je pod firemním minimem. Podrobná čísla vidí administrátor;`
         + ' cenu je vhodné probrat s nadřízeným.';
  const c = prehled.celek;
  const jenCelek = prehled.pod.length === 1 && prehled.pod[0] === c;
  const kde = (prehled.pod.length && !jenCelek)
    ? ' Pod minimem: ' + prehled.pod.map(s => `${s.nazev} (${marzePct(s.marze)})`).join(', ') + '.'
    : '';
  const chybi = (c && c.chybiKc > 0)
    ? ` Na minimum chybí ${marzeKc(c.chybiKc)}.` : '';
  return `Marže ${co} je ${marzePct(c ? c.marze : null)} při firemním minimu `
       + `${marzePct(prehled.min)}.${kde}${chybi}`;
}

if (typeof module !== 'undefined')
  module.exports = { MARZE_MIN_VYCHOZI, marzeMin, marzePodil, marzeChybiKc, marzeStav,
                     marzeStupen, marzeStavOck, marzeStavProj, marzePrehled,
                     marzeText, marzePct, marzeKc };
