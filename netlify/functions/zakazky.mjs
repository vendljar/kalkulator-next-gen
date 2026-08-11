/* Zakázky online — jedna zakázka = jeden záznam, vedle rejstřík (stejný model
 * jako složka: uloziste.js dodává jména souborů i rejstřík — žádná druhá pravda).
 * GET  /api/zakazky            → { rejstrik }            — přihlášení
 * GET  /api/zakazky?soubor=X   → { zakazka }             — přihlášení
 * POST /api/zakazky { zakazka } → uloží + přestaví rejstřík — přihlášení
 *   Pojistka zámku: uzamčená (odeslaná) nabídka se nikdy nepřepíše —
 *   stejná kontrola jako ve složce (uloKontrolaZamku není v modelu, ale
 *   zámky hlídá porovnání razítek: server odmítne zápis, který by změnil
 *   variantu zamčenou v uložené verzi). */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  let ULO;
  try { ({ ULO } = await jadro()); } catch (e) { return jadroChyba(e); }

  const { chyba, relace } = await vyzadujRoli(req);
  if (chyba) return chyba;
  const s = await uloziste('zakazky');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const soubor = url.searchParams.get('soubor');
    if (!soubor) {
      const rejstrik = await s.cti('_rejstrik');
      return json({ ok: true, rejstrik: rejstrik || { schema: 1, zakazky: [] } });
    }
    const zak = await s.cti('z/' + soubor);
    return zak ? json({ ok: true, zakazka: zak })
               : json({ ok: false, chyba: 'Zakázka nenalezena: ' + soubor }, 404);
  }
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }
  /* importZakazka na nesmyslném vstupu vyhodí výjimku. Bez tohohle obalu by
   * z ní vznikl pád funkce (Netlify vrátí holou 502) — a to je špatná odpověď
   * hned dvakrát: uživatel se nedozví, co poslal špatně, a v odpovědi se může
   * objevit kus vnitřku serveru. Odmítnutí patří sem, srozumitelně. */
  let zak;
  try { zak = globalThis.importZakazka(t.zakazka || {}); }
  catch (e) { return json({ ok: false, chyba: 'Zakázku se nepodařilo přečíst: ' + e.message }, 400); }
  const jmeno = ULO.uloJmenoSouboru(zak);
  if (!jmeno) return json({ ok: false, chyba: 'Zakázka nemá vyplněné číslo nabídky.' }, 400);

  /* vytištěná (odeslaná) nabídka se nikdy nepřepíše. Dvě vrstvy:
   * 1) TÁŽ kontrola jako u složky (uloKontrolaZamku) — zámek nesmí zmizet
   *    ani se změnit; žádná druhá pravda o zámcích.
   * 2) Serverová pojistka navíc: u zamčené varianty se nesmí změnit ANI DATA.
   *    V aplikaci to hlídá obrazovka, ale server mluví s kýmkoli — upravený
   *    klient by jinak mohl přepsat obsah odeslané nabídky a zámek si nechat. */
  const stara = await s.cti('z/' + jmeno);
  if (stara) {
    const k = ULO.uloKontrolaZamku(stara, zak);
    if (!k.ok)
      return json({ ok: false, chyba: 'Neuloženo: '
        + k.problemy.map(ULO.uloProblemPopis).join('; ')
        + '. Pokračujte klonem varianty.' }, 409);
    for (const sv of (stara.varianty || [])) {
      if (!(globalThis.variantaUzamcena && globalThis.variantaUzamcena(sv))) continue;
      const nv = (zak.varianty || []).find(v => v && v.id === sv.id);
      if (nv && JSON.stringify(nv.data) !== JSON.stringify(sv.data))
        return json({ ok: false, chyba: 'Neuloženo: změnila by se data uzamčené (odeslané) '
          + 'nabídky. Pokračujte klonem varianty.' }, 409);
    }
  }

  /* Autor zakázky (11. 8. 2026). Doteď se nikde nepsalo, kdo zakázku založil —
   * rejstřík věděl jen, kdo do něj naposledy sáhl. Bez autora se ale nedá
   * převést práce po odcházejícím kolegovi na někoho jiného, což je přesně
   * to, kvůli čemu archivace účtů vznikla.
   *
   * Autor se zapisuje jen jednou, při prvním uložení. Kdyby se přepisoval
   * pokaždé, „autorem" by se stal ten, kdo si zakázku naposledy otevřel
   * a uložil — a razítko by ztratilo smysl. Kdo naposledy sáhl, je `upravil`. */
  if (!zak.autor) zak.autor = relace.email;
  zak.upravil = relace.email;

  const razitko = ULO.uloRazitkoNove();
  zak.uloRazitko = razitko;
  await s.zapis('z/' + jmeno, zak);
  const rejstrik = (await s.cti('_rejstrik')) || { schema: 1, zakazky: [] };
  const novy = ULO.uloRejstrikSloucit(Array.isArray(rejstrik.zakazky) ? rejstrik.zakazky : [],
    ULO.uloRejstrikZaznam(zak, { soubor: jmeno, razitko }));
  await s.zapis('_rejstrik', { schema: 1, zakazky: ULO.uloRejstrikSerad(novy), kdo: relace.email,
                               upraveno: new Date().toISOString() });
  return json({ ok: true, soubor: jmeno, razitko });
};
export const config = { path: '/api/zakazky' };
