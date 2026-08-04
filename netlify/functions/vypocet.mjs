/* /api/vypocet — spočítá poslanou zakázku službou K2 (sluzba.js) STEJNÝMI
 * jádry, jaká běží v prohlížeči. Vstup: { zakazka, program }; zakázka projde
 * importZakazka (stejné migrace jako v aplikaci), program nese ceníky a
 * slevové stropy pro kontext výpočtu.
 *
 * Moduly aplikace spolu mluví přes globální jména (v prohlížeči je skládá
 * build) — na serveru je do globálních jmen naskládá lib/jadro_moduly.cjs
 * v pořadí podle build.py. Dřív si je tahala každá funkce sama vzorem
 * `const require = createRequire(import.meta.url)`; to ale bundler Netlify
 * (esbuild) neumí vystopovat, zdrojáky se do balíčku nedostaly a funkce
 * padala hned při načtení chybou 502. Podrobný rozbor je v lib/jadro_moduly.cjs. */
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  if (req.method !== 'POST')
    return Response.json({ ok: false, chyba: 'Použijte POST s tělem { zakazka, program }.' }, { status: 405 });

  let JEKLY;
  try { ({ JEKLY } = await jadro()); } catch (e) { return jadroChyba(e); }

  try {
    const vstup = await req.json();
    const zak = globalThis.importZakazka(vstup.zakazka || {});
    const vysledek = globalThis.sluzbaVypocet(zak, vstup.program || {}, JEKLY);
    return Response.json({ ok: true, vysledek });
  } catch (e) {
    return Response.json({ ok: false, chyba: 'Vstup se nepodařilo zpracovat: ' + e.message }, { status: 400 });
  }
};

export const config = { path: '/api/vypocet' };
