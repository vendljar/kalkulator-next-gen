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

/* ---------- měna dokumentu (#155, 19. 8. 2026) ----------
 * Jazyk tisku CZ → koruny beze změny. Jiná mutace (EN/DE/FR) → všechny
 * částky v EURECH kurzem z ceníku: CELÁ EURA NAHORU (stejná filozofie jako
 * zaokrouhlování na tisíce Kč — nikdy dolů pod spočtenou cenu), v dokumentu
 * VŽDY jen eura a kurz se NIKDE neukazuje (rozhodnutí J. V. 19. 8. 2026;
 * kurz je vidět a fixuje se jen v kalkulaci/ceníku). Bez kurzu se
 * cizojazyčný dokument nevytvoří — vymyšlený kurz je vymyšlená cena. */
/* menaDokumentu — DOROVNANÝ převod (19. 8. 2026 večer, zadání J. V.:
 * „součet všech položek po zaokrouhlení musí sedět jak v cenové nabídce,
 * tak v kalkulaci"). Generátory proto převádějí ČÍSLA po položkách (`na`,
 * celá eura nahoru) a součty SČÍTAJÍ z převedených položek — stejný princip
 * jako #135 u korunového zaokrouhlování. DPH se počítá až z eurového
 * základu (nahoru); `fmt` už jen formátuje, nic nepřevádí. */
function menaDokumentu(lang, kurzEurKc) {
  if (!lang || lang === 'cz')
    return { eur: false, na: n => n, fmt: formatKc2 };
  const kurz = +kurzEurKc || 0;
  if (!(kurz > 0)) {
    const e = new Error('Cizojazyčná nabídka se tiskne v eurech, ale v ceníku chybí Kurz EUR '
      + '(sekce Cizí měna). Doplňte ho a zveřejněte ceník — kurz se nikdy neodhaduje.');
    e.kod = 'CHYBI_KURZ_EUR';
    throw e;
  }
  return {
    eur: true,
    na: n => Math.ceil((+n || 0) / kurz),
    fmt: n => '€ ' + Math.round(+n || 0).toLocaleString('cs-CZ'),
  };
}

function menaKc(lang, kurzEurKc) {
  if (!lang || lang === 'cz') return formatKc2;
  const kurz = +kurzEurKc || 0;
  if (!(kurz > 0)) {
    const e = new Error('Cizojazyčná nabídka se tiskne v eurech, ale v ceníku chybí Kurz EUR '
      + '(sekce Cizí měna). Doplňte ho a zveřejněte ceník — kurz se nikdy neodhaduje.');
    e.kod = 'CHYBI_KURZ_EUR';
    throw e;
  }
  return n => '€ ' + Math.ceil((+n || 0) / kurz).toLocaleString('cs-CZ');
}

if (typeof module !== 'undefined')
  module.exports = { formatKc2, formatKc0, formatCislo, formatPctTypo, formatKcTypo,
                     prepisPlati, menaKc, menaDokumentu };
