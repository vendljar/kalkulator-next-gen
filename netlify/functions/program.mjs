/* Databáze programu online — TÝŽ model jako _program.json ve složce.
 * GET  /api/program            → { db } (platný ceník + historie) — přihlášení
 * POST /api/program { cenik, cenikProj, katalog, slevy, poznamka }
 *      → zveřejnit jako platný — JEN Administrátor (pravidlo: „Platný ceník
 *        může zveřejňovat jen administrátor"). Verzování, otisky i odkládání
 *        starých verzí dělá stejný kód jako v aplikaci (src/program.js +
 *        cenik_stari.js) — žádná druhá pravda. */
import { createRequire } from 'node:module';
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
const require = createRequire(import.meta.url);

Object.assign(globalThis, require('../../src/format.js'));
Object.assign(globalThis, require('../../src/engine.js'));
Object.assign(globalThis, require('../../src/engine_proj.js'));
Object.assign(globalThis, require('../../src/cenik.js'));
Object.assign(globalThis, require('../../src/ukazkove.js'));
Object.assign(globalThis, require('../../src/cenik_stari.js'));
Object.assign(globalThis, require('../../src/konfigurace.js'));
Object.assign(globalThis, require('../../src/program.js'));

export default async (req) => {
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
