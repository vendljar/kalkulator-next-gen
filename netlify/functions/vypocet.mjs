/* /api/vypocet — spočítá poslanou zakázku službou K2 (sluzba.js) STEJNÝMI
 * jádry, jaká běží v prohlížeči. Vstup: { zakazka, program }; zakázka projde
 * importZakazka (stejné migrace jako v aplikaci), program nese ceníky a
 * slevové stropy pro kontext výpočtu.
 *
 * Moduly aplikace spolu mluví přes globální jména (v prohlížeči je skládá
 * build) — tady se jednou provždy globalizují v pořadí build.py. Require
 * jsou vypsané doslovně, aby je bundler Netlify (esbuild) uměl přibalit. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

Object.assign(globalThis, require('../../src/preklad.js'));
Object.assign(globalThis, require('../../src/format.js'));
Object.assign(globalThis, require('../../src/engine.js'));
Object.assign(globalThis, require('../../src/engine_proj.js'));
Object.assign(globalThis, require('../../src/techspec.js'));
Object.assign(globalThis, require('../../src/sleva.js'));
Object.assign(globalThis, require('../../src/zaokrouhleni.js'));
Object.assign(globalThis, require('../../src/marze.js'));
Object.assign(globalThis, require('../../src/kontroly.js'));
Object.assign(globalThis, require('../../src/zakazka.js'));
Object.assign(globalThis, require('../../src/sluzba.js'));
const JEKLY = require('../../src/jekly.json');

export default async (req) => {
  if (req.method !== 'POST')
    return Response.json({ ok: false, chyba: 'Použijte POST s tělem { zakazka, program }.' }, { status: 405 });
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
