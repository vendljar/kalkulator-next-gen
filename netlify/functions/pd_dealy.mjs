/* Seznam obchodních případů z Pipedrive pro výběr v kalkulačce
 * (9. 8. 2026, #16 — čtecí část).
 *
 * GET /api/pd/dealy?hledat=<text>&stav=open|won|lost|vse&limit=<n>
 *   → { ok, nastaveno, dealy: [{ id, cislo, nazev, objednatel, stav, faze,
 *                                hodnotaCrm, mena, aktualizovano }], celkem }
 *
 * Vrací JEN to, co obchodník potřebuje vidět v nabídce k výběru. Vlastní
 * pole se sem záměrně netahají — seznam se otevírá často a každé pole navíc
 * je objem, který stejně nikdo nečte. Detail si vyzvedne `/api/pd/deal`.
 *
 * Proč se hledá až na serveru a ne přes `Search API` Pipedrive: hledání tam
 * stojí 40 tokenů denního rozpočtu (dvojnásobek seznamu) a má vlastní přísný
 * krátkodobý limit 10 požadavků za 2 vteřiny. Při 308 dealech je levnější
 * a rychlejší přinést otevřené případy jednou a filtrovat je tady. */
import { vyzadujRoli, json } from '../lib/sdilene.mjs';
import { pdNastaveno, pdVsechny, PdChyba } from '../lib/pipedrive.mjs';
import { pdCisloZNazvu, pdNazevAkce } from '../lib/pd_mapa.mjs';

/* Fáze „Zkontaktováno" až „Před podpisem" jsou ty, kde se ještě počítá.
 * Vyhrané případy se nabízejí taky (dopočet víceprací), ale až za nimi. */
const PORADI_STAVU = { open: 0, won: 1, lost: 2 };

export default async (req) => {
  const { chyba } = await vyzadujRoli(req);      // stačí být přihlášen
  if (chyba) return chyba;

  if (!pdNastaveno())
    return json({ ok: true, nastaveno: false, dealy: [], celkem: 0,
      chyba: 'Napojení na Pipedrive zatím není nastavené.' });

  const url = new URL(req.url);
  const hledat = String(url.searchParams.get('hledat') || '').trim().toLowerCase();
  const stav = String(url.searchParams.get('stav') || 'open');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);

  try {
    const surove = await pdVsechny('/api/v2/deals',
      stav && stav !== 'vse' ? { status: stav } : {});

    let dealy = surove.map((d) => ({
      id: d.id,
      cislo: pdCisloZNazvu(d.title),
      nazev: pdNazevAkce(d.title),
      celyNazev: d.title || '',
      stav: d.status || '',
      faze: d.stage_id || null,
      hodnotaCrm: typeof d.value === 'number' ? d.value : null,
      mena: d.currency || '',
      aktualizovano: d.update_time || '',
    }));

    if (hledat) {
      /* Hledá se v čísle i v názvu. Diakritika se srovnává, ať „Borivojova"
       * najde i „Bořivojova" — obchodník ji při rychlém hledání nepíše. */
      const bezDiakritiky = (t) => String(t || '').normalize('NFD')
        .replace(/[̀-ͯ]/g, '').toLowerCase();
      const h = bezDiakritiky(hledat);
      dealy = dealy.filter((d) => bezDiakritiky(d.celyNazev).includes(h));
    }

    const celkem = dealy.length;
    dealy.sort((a, b) => (PORADI_STAVU[a.stav] ?? 3) - (PORADI_STAVU[b.stav] ?? 3)
      || String(b.aktualizovano).localeCompare(String(a.aktualizovano)));

    return json({ ok: true, nastaveno: true, dealy: dealy.slice(0, limit), celkem });
  } catch (e) {
    /* Chyba spojení se NESMÍ tvářit jako prázdný seznam — obchodník by si
     * myslel, že v Pipedrivu nic není, a založil by zakázku znovu. */
    if (e instanceof PdChyba)
      return json({ ok: false, nastaveno: true, chyba: e.message }, e.stav >= 500 ? 502 : e.stav);
    throw e;
  }
};
export const config = { path: '/api/pd/dealy' };
