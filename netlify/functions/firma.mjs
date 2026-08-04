/* Firemní údaje online (4. 8. 2026).
 *
 * Proč to vzniklo: online databáze programu do teď vozila jen ceníky, katalog
 * a slevy. Firemní údaje (název, IČO, sídlo, banka, logo, zpracovatel) žily
 * výhradně v `_DB/_nastaveni.json`, tedy ve složce na Disku — a tu mapuje
 * jen administrátor. Obchodník tak i po zveřejnění ceníku pracoval s ukázkovou
 * firmou ze sestavení: svítila mu červená lišta „Firemní údaje jsou ukázkové"
 * a nabídka by odešla s vymyšlenou adresou v hlavičce. Zadání „Přihlásil jsem
 * se jako nový uživatel (obchodník) a přesto to po mně chce připojit databázi."
 * je tímhle dotažené — běžný uživatel nepotřebuje složku k ničemu.
 *
 * GET  /api/firma  → { ok, firma: { udaje, kdo, kdy } | null } — každý přihlášený
 * POST /api/firma { udaje } → zveřejnit — JEN Administrátor
 *
 * Ukládá se do stejného úložiště jako program (klíč `firma`), aby to zálohy
 * a noční otisk braly s sebou jedním čtením.
 *
 * Co server odmítne: údaje se značkou `ukazkove` a údaje bez povinných polí.
 * Rozhoduje o tom firmaLzeZverejnit() ze src/firma.js — týž kód, jaký si
 * kontrolu dělá prohlížeč, aby se obě strany nemohly rozejít. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  let fm;
  try { ({ fm } = await jadro()); } catch (e) { return jadroChyba(e); }

  const s = await uloziste('program');

  if (req.method === 'GET') {
    const { chyba } = await vyzadujRoli(req);          // stačí být přihlášen
    if (chyba) return chyba;
    const f = await s.cti('firma');
    return json({ ok: true, firma: f || null });
  }
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;
  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

  /* POŘADÍ ROZHODUJE: nejdřív se posuzuje to, co přišlo, teprve pak se dělá
   * čistá kopie. Obráceně by kontrola nikdy nic nezachytila — kopie značku
   * `ukazkove` neopisuje, takže by ukázková firma prošla jako skutečná.
   * (Odhaleno testem „ukázkovou firmu server zveřejnit nenechá".) */
  const lze = fm.firmaLzeZverejnit(t.udaje || null);
  if (!lze.ok) return json({ ok: false, chyba: lze.duvod }, 400);
  const udaje = fm.firmaKZverejneni(t.udaje);

  const zaznam = { udaje, kdo: relace.email, kdy: new Date().toISOString() };
  await s.zapis('firma', zaznam);
  return json({ ok: true, kdy: zaznam.kdy });
};
export const config = { path: '/api/firma' };
