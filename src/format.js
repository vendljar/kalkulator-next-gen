/* ============================================================
 * FORMÁTY ČÍSEL A ČÁSTEK (#14, krok 3 — 3. 8. 2026)
 *
 * Jedno místo pro pravidla, jak se v aplikaci píší peníze a procenta:
 * locale cs-CZ (mezery v tisících, desetinná čárka), „Kč" s mezerou,
 * a typografické minus (−, ne spojovník) tam, kde záporné číslo nese
 * obchodní význam — u záporné marže se „mínus sto procent" musí číst
 * jako mínus na první pohled.
 *
 * Proč jedno místo: částky dřív formátovaly tři nezávislé kusy kódu
 * (obrazovky v ui/common.js, hlídání marže v marze.js, dokumenty
 * v nabidka*.js). Stačilo, aby se jeden z nich lišil v zaokrouhlení
 * nebo ve znaku minus, a tatáž suma vypadala na obrazovce jinak než
 * v dokumentu pro zákazníka — čtenář pak řeší „rozdíl", který
 * neexistuje. Výstupy se konsolidací NEZMĚNILY ani o znak; hlídají to
 * charakterizační testy v test_format.js.
 *
 * Moduly, které musí běžet i samostatně v Node (marze.js, nabidka.js),
 * si drží jednořádkovou záložku přes `typeof` — pravidlo ale bydlí TADY
 * a záložka je jen jeho zrcadlo pro izolovaný test.
 * ============================================================ */

/* Částka na 2 desetinná místa + „Kč" — obrazovky (fmt) i dokumenty (kc). */
function formatKc2(n) {
  return (+n || 0).toLocaleString('cs-CZ',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kč';
}

/* Zaokrouhlená částka + „Kč" — souhrny a KPI (fmt0). */
function formatKc0(n) {
  return Math.round(+n || 0).toLocaleString('cs-CZ') + ' Kč';
}

/* Číslo bez jednotky, volitelný počet desetinných míst (num, cislo). */
function formatCislo(n, des) {
  return (+n || 0).toLocaleString('cs-CZ',
    { maximumFractionDigits: des == null ? 2 : des });
}

/* Procento z PODÍLU s typografickým minus — hlídání marže (marzePct).
 * Zaokrouhluje na desetinu procenta; null = „—" (marže bez ceny neexistuje). */
function formatPctTypo(x) {
  if (x == null) return '—';
  const v = Math.round(x * 1000) / 10;
  return (v < 0 ? '−' : '') + Math.abs(v).toString().replace('.', ',') + ' %';
}

/* Celé koruny s typografickým minus — hlídání marže (marzeKc). */
function formatKcTypo(x) {
  const v = Math.round(x || 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('cs-CZ') + ' Kč';
}

/* ---------- „prázdno není nula" (#14, krok 2) --------------------------
 * Sdílená sémantika ručního přepisu hodnoty pro jednu zakázku: prázdno
 * (undefined / null / '') znamená „přepis není, platí ceník", zatímco NULA
 * je platný přepis — „tuhle činnost děláme zdarma" je legitimní ústupek
 * a nesmí se tvářit jako nevyplněno. Pravidlo vzniklo v projekci (#8);
 * odsud ho čtou obě kalkulace, aby se obchodník zvyklý z jedné nespletl
 * ve druhé. Formuláře prázdný přepis mažou, takže '' sem doteče jen
 * z importu nebo ručně upraveného souboru — a právě tam by se bez tohohle
 * pravidla z prázdna stala cena 0 Kč. */
function prepisPlati(v) {
  return !(v === undefined || v === null || v === '');
}

if (typeof module !== 'undefined')
  module.exports = { formatKc2, formatKc0, formatCislo, formatPctTypo, formatKcTypo,
                     prepisPlati };
