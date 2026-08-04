/* Databáze programu online — TÝŽ model jako _program.json ve složce.
 * GET  /api/program            → { db } (platný ceník + historie) — přihlášení
 * POST /api/program { cenik, cenikProj, katalog, slevy, poznamka }
 *      → zveřejnit jako platný — JEN Administrátor (pravidlo: „Platný ceník
 *        může zveřejňovat jen administrátor"). Verzování, otisky i odkládání
 *        starých verzí dělá stejný kód jako v aplikaci (src/program.js +
 *        cenik_stari.js) — žádná druhá pravda. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  /* Jádro (src/*.js) se naskládá do globálních jmen — programNovy,
   * programNovaVerze a spol. se pak volají přes globalThis stejně jako
   * v prohlížeči. Kdyby se načíst nepovedlo, uživatel dostane české
   * vysvětlení místo holé chyby 502. */
  try { await jadro(); } catch (e) { return jadroChyba(e); }

  const s = await uloziste('program');

  if (req.method === 'GET') {
    const { chyba } = await vyzadujRoli(req);          // stačí být přihlášen
    if (chyba) return chyba;
    const db = await s.cti('db');
    return json({ ok: true, db: db || null });
  }
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;
  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

  const ctx = { cenik: t.cenik, cenikProj: t.cenikProj, katalog: t.katalog || null,
                slevy: t.slevy || null, kdo: relace.email, poznamka: String(t.poznamka || ''),
                build: String(t.build || '') };
  let db = await s.cti('db');
  if (!db) db = globalThis.programNovy(ctx);
  else {
    if (globalThis.programBezeZmeny(db, ctx))
      return json({ ok: false, chyba: 'Ceník se od platné verze neliší – není co zveřejňovat.' }, 400);
    db = globalThis.programNovaVerze(db, ctx);
  }
  await s.zapis('db', db);
  return json({ ok: true, verze: db.platny.verze, platnoOd: db.platny.platnoOd });
};
export const config = { path: '/api/program' };
