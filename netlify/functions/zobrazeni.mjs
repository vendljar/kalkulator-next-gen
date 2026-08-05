/* Matice zobrazení podle rolí online (5. 8. 2026, zadání #136).
 *
 * Proč to musí být na serveru a ne v `_DB/_nastaveni.json`: rozhodnutí „co
 * vidí obchodník a co vedoucí" je pravidlo pro celou firmu, ne nastavení
 * jednoho počítače. Složku `_DB` mapuje jen administrátor — kdyby matice
 * ležela tam, obchodník by se k ní nikdy nedostal a platila by mu výchozí,
 * tedy by přidělení práv nefungovalo. Je to přesně tentýž důvod, proč se
 * 4. 8. 2026 stěhovaly online firemní údaje; proto i stejný vzor.
 *
 * GET  /api/zobrazeni  → { ok, zobrazeni: { matice, kdo, kdy } | null } — každý přihlášený
 * POST /api/zobrazeni { matice } → uložit — JEN Administrátor
 *
 * Ukládá se do úložiště `program` pod klíč `zobrazeni`, aby to noční otisk
 * i ruční záloha braly s sebou jedním čtením.
 *
 * Co server vždycky udělá: přijatou matici prožene `zobrazeniOciste()` ze
 * src/zobrazeni.js — týmž kódem, jaký si očistu dělá prohlížeč. Neznámé klíče
 * (například po přejmenování prvku) tak vypadnou a prvky držené serverem
 * (`pevne`) se srazí na „nevidí", i kdyby je někdo poslal zaškrtnuté. Bez toho
 * by aplikace slibovala právo, na které vzápětí přijde od serveru 403.
 *
 * POZOR: tohle je vrstva pohodlí, ne hranice bezpečnosti. Skutečné hranice
 * (zveřejnit ceník, spravovat účty, pořídit otisk databáze) drží dál příslušné
 * funkce vlastní kontrolou role a maticí se ovlivnit nedají. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  let ZOB;
  try { ({ ZOB } = await jadro()); } catch (e) { return jadroChyba(e); }

  const s = await uloziste('program');

  if (req.method === 'GET') {
    const { chyba } = await vyzadujRoli(req);          // stačí být přihlášen
    if (chyba) return chyba;
    const z = await s.cti('zobrazeni');
    return json({ ok: true, zobrazeni: z || null });
  }
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;
  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

  const matice = ZOB.zobrazeniOciste(t && t.matice);
  const zaznam = { matice, kdo: relace.email, kdy: new Date().toISOString() };
  await s.zapis('zobrazeni', zaznam);
  return json({ ok: true, kdy: zaznam.kdy });
};
export const config = { path: '/api/zobrazeni' };
