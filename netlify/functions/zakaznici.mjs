/* Seznam zákazníků (#162, 20. 8. 2026) — jeden zákazník = jeden záznam.
 *
 * GET    /api/zakaznici              → { zakaznici: [...] }   — přihlášení
 * GET    /api/zakaznici?klic=X       → { zakaznik }           — přihlášení
 * POST   /api/zakaznici { zakaznik } → uloží                  — přihlášení
 * DELETE /api/zakaznici?klic=X       → smaže                  — JEN Administrátor
 *
 * Práva podle zadání J. V. z 20. 8. 2026: číst smí každý přihlášený,
 * zapisovat kdokoli přihlášený (kartu vyplňuje obchodník u zákazníka),
 * mazat jen administrátor — smazaná karta bere s sebou i všechno, co si
 * u toho zákazníka někdo jednou dohledal.
 *
 * Očistu vstupu dělá `zakaznikOciste` ze src/zakaznici.js — týž kód, jaký
 * si čistí prohlížeč. Server nikdy neuloží, co mu kdo pošle.
 */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  try { await jadro(); } catch (e) { return jadroChyba(e); }
  const g = globalThis;

  const { chyba, relace } = await vyzadujRoli(req);
  if (chyba) return chyba;
  const s = await uloziste('zakaznici');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const klic = url.searchParams.get('klic');
    if (klic) {
      const z = await s.cti('z/' + klic);
      return z ? json({ ok: true, zakaznik: z })
               : json({ ok: false, chyba: 'Zákazník nenalezen: ' + klic }, 404);
    }
    /* Seznam se skládá ze záznamů, ne z rejstříku: karet jsou desítky, ne
     * tisíce, a druhý soubor s rejstříkem by byl jen další místo, kde se to
     * může rozejít (poučení z rejstříku zakázek). */
    const klice = await s.seznam('z/');
    const zakaznici = [];
    for (const k of klice) {
      const z = await s.cti(k);
      if (z) zakaznici.push(z);
    }
    return json({ ok: true, zakaznici });
  }

  if (req.method === 'DELETE') {
    const { chyba: ch } = await vyzadujRoli(req, 'Administrátor');
    if (ch) return ch;
    const klic = url.searchParams.get('klic');
    if (!klic) return json({ ok: false, chyba: 'Chybí klíč zákazníka.' }, 400);
    if (typeof s.smaz === 'function') await s.smaz('z/' + klic);
    return json({ ok: true, smazano: klic });
  }

  if (req.method !== 'POST')
    return json({ ok: false, chyba: 'Použijte GET, POST nebo DELETE.' }, 405);

  let t; try { t = await req.json(); }
  catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

  const z = g.zakaznikOciste(t.zakaznik || {}, relace.email, new Date().toISOString());
  const klic = g.zakaznikKlic(z);
  if (!klic)
    return json({ ok: false, chyba: 'Zákazník musí mít vyplněné IČO nebo aspoň název.' }, 400);
  /* Zápis nesmí přepsat, kdo kartu založil — autor se drží z uloženého
   * záznamu, ne z toho, co přišlo od klienta. */
  const stary = await s.cti('z/' + klic);
  if (stary) { z.autor = stary.autor || z.autor; z.zalozen = stary.zalozen || z.zalozen; }
  await s.zapis('z/' + klic, z);
  return json({ ok: true, klic, zakaznik: z });
};

export const config = { path: '/api/zakaznici' };
