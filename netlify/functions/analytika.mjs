/* Analytika užívání (#25 + #26 + #27, 17. 8. 2026).
 *
 * GET  /api/analytika?akce=rezim          → { sber } — přihlášení (klient musí
 *      vědět, jestli má vůbec sbírat, dřív než cokoli pošle)
 * GET  /api/analytika?od=RRRR-MM-DD&do=…  → souhrn za období + řada po
 *      měsících + časy zakázek — JEN Administrátor (rozhodnutí 17. 8.)
 * POST /api/analytika { akce:'udalosti', den, casy } → přičíst dávku klienta
 *      — přihlášení; při vypnutém sběru se dávka tiše zahodí
 * POST /api/analytika { akce:'rezim', sber } → globální vypínač — JEN Administrátor
 *
 * Úložiště `analytika`: klíč `rezim`, denní agregáty `den/RRRR-MM-DD`,
 * časy `cas/<číslo zakázky>` = { ock, proj } v sekundách.
 *
 * ZÁSADY: ukládají se jen SOUČTY za všechny uživatele (žádné jméno, žádná
 * stopa jednotlivce — dávka klienta se přičte a zapomene); čas se váže
 * k zakázce, ne k účtu. Analytika NEJDE do záloh (viz zaloha.mjs — klíč
 * `analytika` tam schválně není). Retence: při každém zápisu se smažou dny
 * starší 24 měsíců. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  try { await jadro(); } catch (e) { return jadroChyba(e); }
  const g = globalThis;
  const s = await uloziste('analytika');
  const dnes = new Date().toISOString().slice(0, 10);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('akce') === 'rezim') {
      const { chyba } = await vyzadujRoli(req);              // stačí být přihlášen
      if (chyba) return chyba;
      const rez = (await s.cti('rezim')) || g.analytikaRezimNovy();
      return json({ ok: true, sber: rez.sber !== false });
    }

    /* souhrn — jen administrátor (rozhodnutí 17. 8.: analytiku vidí jen on) */
    const { chyba } = await vyzadujRoli(req, 'Administrátor');
    if (chyba) return chyba;
    const od = url.searchParams.get('od') || '0000-00-00';
    const doD = url.searchParams.get('do') || '9999-99-99';
    const klice = (await s.seznam('den/')).filter(k => {
      const den = k.slice(4);
      return den >= od && den <= doD;
    }).sort();
    const dvojice = [];
    for (const k of klice) {
      const den = await s.cti(k);
      if (den) dvojice.push([k, den]);
    }
    const souhrn = g.analytikaObdobi(dvojice);
    const rez = (await s.cti('rezim')) || g.analytikaRezimNovy();
    /* časy zakázek (#25): mapa číslo zakázky → { ock, proj } v sekundách */
    const casy = {};
    for (const k of await s.seznam('cas/')) {
      const c = await s.cti(k);
      if (c) casy[k.slice(4)] = { ock: +c.ock || 0, proj: +c.proj || 0 };
    }
    return json({ ok: true, od, do: doD, dnu: dvojice.length,
                  celkem: souhrn.celkem, poMesicich: souhrn.poMesicich,
                  casy, rezim: { sber: rez.sber !== false, kdo: rez.kdo || '', kdy: rez.kdy || '' } });
  }

  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);
  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

  if (t.akce === 'rezim') {
    const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
    if (chyba) return chyba;
    const novy = g.analytikaRezimNastav(null, t.sber, relace.email, new Date().toISOString());
    if (!novy) return json({ ok: false, chyba: 'Hodnota sběru musí být ano/ne.' }, 400);
    await s.zapis('rezim', novy);
    return json({ ok: true, sber: novy.sber });
  }

  if (t.akce === 'udalosti') {
    const { chyba, relace } = await vyzadujRoli(req);        // stačí být přihlášen
    if (chyba) return chyba;
    const rez = (await s.cti('rezim')) || g.analytikaRezimNovy();
    /* Vypnutý sběr: dávka se TIŠE zahodí (ok:true). Klient o vypnutí ví
     * z GET ?akce=rezim, ale mezi vypnutím a jeho příští kontrolou nesmí
     * uživateli vyskakovat chyba kvůli statistice. */
    if (rez.sber === false) return json({ ok: true, sber: false });

    if (t.den && typeof t.den === 'object') {
      const stary = await s.cti('den/' + dnes);
      /* Dávka se nejdřív očistí (B8, 22. 8. 2026): jen čtyři mapy, čísla
       * nezáporná a se stropem, klíče oříznuté. `poUzivateli` od klienta se
       * nikdy nepřičítá — do 22. 8. se slilo DŘÍV než serverová atribuce,
       * takže šlo poslat cizímu kolegovi stovky chyb nebo mínus zakázek. */
      const novy = g.analytikaSlij(stary, g.analytikaDavkaOcisti(t.den));
      /* Atribuci počítadel dělá SERVER z přihlášené relace (20. 8. 2026):
       * klient svůj e-mail neposílá, takže ho nemůže podvrhnout, a zbytek
       * analytiky (klíče prvků, záložky, zdržení) zůstává anonymní. */
      g.analytikaPrictiUzivateli(novy, relace && relace.email, (t.den || {}).pocty);
      await s.zapis('den/' + dnes, novy);
    }
    /* časy zakázek: { '2026-OPR-CN-0155': { ock: 120, proj: 30 }, … } */
    if (t.casy && typeof t.casy === 'object') {
      for (const [zak, c] of Object.entries(t.casy).slice(0, 50)) {
        /* Klíč musí vypadat jako číslo nabídky (B8): písmena, číslice,
         * pomlčky, mezery, tečky — a nanejvýš 60 znaků. Cizí tvar se zahodí,
         * ne „opraví" — jinak kdokoli přihlášený zakládá klíče do nekonečna. */
        const cislo = String(zak).trim();
        if (!/^[\w\-. ]{1,60}$/.test(cislo)) continue;
        const klic = 'cas/' + cislo;
        const ock = g.analytikaCislo(c && c.ock);
        const proj = g.analytikaCislo(c && c.proj);
        if (!ock && !proj) continue;
        const stary = (await s.cti(klic)) || { ock: 0, proj: 0 };
        await s.zapis(klic, { ock: (+stary.ock || 0) + ock, proj: (+stary.proj || 0) + proj });
      }
    }
    /* retence: dny starší 24 měsíců pryč (levné — seznam klíčů, ne data) */
    if (typeof s.smaz === 'function') {
      for (const k of g.analytikaRetence(await s.seznam('den/'), dnes)) await s.smaz(k);
    }
    return json({ ok: true, sber: true });
  }

  return json({ ok: false, chyba: 'Neznámá akce.' }, 400);
};
export const config = { path: '/api/analytika' };
