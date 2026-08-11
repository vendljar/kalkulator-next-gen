/* ============================================================
 * KLIENT K API PIPEDRIVE (9. 8. 2026, #16 / CRM-12)
 *
 * Proč vlastní tenká vrstva a ne knihovna: potřebujeme z API pět věcí,
 * zato potřebujeme, aby se chyby daly obchodníkovi vysvětlit česky.
 * Knihovna by přinesla závislost, aktualizace a vlastní tvar chyb.
 *
 * TOKEN NIKDY NESMÍ DO PROHLÍŽEČE. Podle dokumentace Pipedrive dává API
 * token přístup ke VŠEM datům uživatele. Kalkulačka je jednosouborové HTML,
 * které si každý stáhne — cokoli v něm je veřejné. Proto veškerá volání
 * vedou přes serverové funkce a token žije jen v proměnné prostředí.
 * (Navíc Pipedrive nikde nedeklaruje podporu CORS, takže volání přímo
 * z prohlížeče by nejspíš ani neprošlo.)
 *
 * Verze API: dealy a definice polí přes v2. Endpointy v1 pro tyhle entity
 * jsou od 1. 8. 2026 oficiálně bez podpory a mohou zmizet bez varování.
 * Soubory (`/v1/files`) a poznámky (`/v1/notes`) v2 protějšek zatím nemají
 * a na seznamu zastaralých nejsou — ty tedy zůstávají na v1.
 *
 * Nastavení (proměnné prostředí v Netlify, uživatel si je zadává sám):
 *   PIPEDRIVE_TOKEN   — osobní API token (Nastavení → Osobní předvolby → API)
 *   PIPEDRIVE_DOMENA  — doména firmy, např. `mojefirma` nebo celé
 *                       `mojefirma.pipedrive.com`
 * ============================================================ */

export const PD_TOKEN_PROMENNA = 'PIPEDRIVE_TOKEN';
export const PD_DOMENA_PROMENNA = 'PIPEDRIVE_DOMENA';

/* Kolik dealů se natáhne najednou. Seznam stojí 20 tokenů denního
 * rozpočtu bez ohledu na velikost stránky, takže větší stránka je levnější
 * než víc malých. Strop Pipedrive je 500. */
export const PD_STRANKA = 200;

/* Kolikrát to zkusit znovu, když API odpoví 429 (vyčerpaný krátkodobý
 * limit). Čeká se 1, 2 a 4 vteřiny — dokumentace `Retry-After` u 429
 * neslibuje, takže se na ni nespoléháme a couváme po svém. */
const POKUSU = 3;

export function pdNastaveno() {
  return !!(process.env[PD_TOKEN_PROMENNA] && process.env[PD_DOMENA_PROMENNA]);
}

/* Doména se zadává různě — `mojefirma`, `mojefirma.pipedrive.com`
 * i `https://mojefirma.pipedrive.com/`. Ať se uživatel netrefuje. */
export function pdZaklad() {
  const d = String(process.env[PD_DOMENA_PROMENNA] || '').trim()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.pipedrive\.com$/, '');
  if (!d) throw new PdChyba('Není nastavená doména Pipedrive ('
    + PD_DOMENA_PROMENNA + ').', 500);
  return 'https://' + d + '.pipedrive.com';
}

/* Odkaz na deal do webového Pipedrivu — do krycího listu, kde je políčko
 * „Scoring Cribis / Pipedrive" typu odkaz. */
export function pdOdkazNaDeal(id) {
  return pdZaklad() + '/deal/' + Number(id);
}

export class PdChyba extends Error {
  constructor(zprava, stav = 502, podrobnost = '') {
    super(zprava);
    this.stav = stav;
    this.podrobnost = podrobnost;
  }
}

/* Stavové kódy Pipedrive mají pár nesamozřejmostí, které by jinak dopadly
 * na obchodníka jako „chyba 415". Překládají se proto na větu, ze které
 * je poznat, co s tím. */
function popisStavu(stav, telo) {
  const z = (telo && (telo.error || telo.error_info)) || '';
  if (stav === 401) return 'Pipedrive odmítl přístupový token. Zkontrolujte proměnnou '
    + PD_TOKEN_PROMENNA + ' v Netlify — token se mohl přegenerovat.';
  if (stav === 402) return 'Účet Pipedrive není aktivní (nezaplacené předplatné nebo '
    + 'vypršelá zkušební verze).';
  if (stav === 403) return 'Pipedrive přístup odmítl. U zakázky to bývá tím, že je '
    + 'archivovaná — archivovaný obchodní případ nejde měnit.';
  if (stav === 404) return 'Pipedrive takový záznam nezná. Mohl být smazaný.';
  if (stav === 415) return 'Pipedrive hlásí, že tahle funkce není v účtu zapnutá.';
  if (stav === 429) return 'Pipedrive nás chvíli nepustí dál — vyčerpali jsme limit '
    + 'požadavků. Zkuste to za chvíli znovu.';
  if (stav >= 500) return 'Pipedrive momentálně neodpovídá. Zkuste to za chvíli znovu.';
  return 'Pipedrive odmítl požadavek.' + (z ? ' ' + z : '');
}

function spanek(ms) { return new Promise((h) => setTimeout(h, ms)); }

/* Jediné místo, kde se sahá na síť. `cesta` je bez domény, včetně /api/…
 * Vrací rozbalené `data`; stránkovací kurzor jde v `_kurzor`. */
export async function pdZavolej(cesta, volby = {}) {
  const token = process.env[PD_TOKEN_PROMENNA];
  if (!token) throw new PdChyba('Není nastavený přístupový token Pipedrive ('
    + PD_TOKEN_PROMENNA + ').', 500);

  const url = new URL(pdZaklad() + cesta);
  for (const [k, v] of Object.entries(volby.dotaz || {}))
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));

  const hlavicky = { 'x-api-token': token, Accept: 'application/json' };
  const init = { method: volby.metoda || 'GET', headers: hlavicky };
  if (volby.telo !== undefined) {
    hlavicky['Content-Type'] = 'application/json';
    init.body = JSON.stringify(volby.telo);
  }

  let posledni = null;
  for (let pokus = 0; pokus < POKUSU; pokus++) {
    let odpoved;
    try {
      odpoved = await fetch(url.toString(), init);
    } catch (e) {
      /* Síť selhala úplně. Tohle se NESMÍ spolknout do prázdného seznamu —
       * obchodník by si myslel, že v Pipedrivu nic není. */
      throw new PdChyba('Spojení s Pipedrive se nepodařilo navázat.', 502, String(e && e.message));
    }
    let telo = null;
    try { telo = await odpoved.json(); } catch (e) { telo = null; }

    if (odpoved.ok && telo && telo.success !== false) {
      const vysledek = telo.data === undefined ? telo : telo.data;
      if (vysledek && typeof vysledek === 'object' && telo.additional_data)
        Object.defineProperty(vysledek, '_kurzor',
          { value: telo.additional_data.next_cursor || null, enumerable: false });
      return vysledek;
    }

    posledni = new PdChyba(popisStavu(odpoved.status, telo), odpoved.status,
      (telo && telo.error) || '');
    /* Opakovat má smysl jen u přetížení a serverových chyb. U špatného
     * tokenu by opakování jen třikrát potvrdilo totéž. */
    if (odpoved.status !== 429 && odpoved.status < 500) throw posledni;
    if (pokus < POKUSU - 1) await spanek(1000 * Math.pow(2, pokus));
  }
  throw posledni;
}

/* Projde všechny stránky a vrátí je slité dohromady. `strop` je pojistka
 * proti tomu, aby se při chybě v kurzoru točilo donekonečna a snědlo to
 * denní rozpočet tokenů. */
export async function pdVsechny(cesta, dotaz = {}, strop = 10) {
  const vse = [];
  let kurzor = null;
  for (let i = 0; i < strop; i++) {
    const davka = await pdZavolej(cesta, { dotaz: { ...dotaz, limit: PD_STRANKA, cursor: kurzor } });
    if (!Array.isArray(davka)) break;
    vse.push(...davka);
    kurzor = davka._kurzor;
    if (!kurzor) break;
  }
  return vse;
}
