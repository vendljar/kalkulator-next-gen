/* Centrální šablony dokumentů online (#139, 13. 8. 2026).
 *
 * GET  /api/sablony                    → { rejstrik } bez dat souborů — přihlášení
 * GET  /api/sablony?typ=X[&verze=N]    → { typ, verze, nazev, data } — přihlášení
 *      (bez `verze` se vrací platná verze; s `verze` konkrétní z historie,
 *       aby šlo doložit, ze které šablony vznikla stará nabídka)
 * POST /api/sablony { akce:'zverejnit', typ, nazev, data, poznamka }
 *      → zveřejnit novou verzi — JEN Administrátor (stejné pravidlo jako
 *        „platný ceník může zveřejňovat jen administrátor")
 * POST /api/sablony { akce:'rezim', rezim:'prisny'|'mekky' }
 *      → přepnout režim šablon — JEN Administrátor
 *
 * Soubory se ukládají v base64 uvnitř JSONu (klíč data/<typ>/<verze>).
 * Otisk, verze i historii skládá jádro (src/sablony_online.js) — žádná
 * druhá pravda: tentýž kód běží v prohlížeči i tady. */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';

export default async (req) => {
  try { await jadro(); } catch (e) { return jadroChyba(e); }
  const g = globalThis;
  const s = await uloziste('sablony');

  if (req.method === 'GET') {
    const { chyba } = await vyzadujRoli(req);          // stačí být přihlášen
    if (chyba) return chyba;
    const rej = (await s.cti('rejstrik')) || g.sablonyNovyRejstrik();
    const url = new URL(req.url);
    const typ = url.searchParams.get('typ');
    if (!typ) return json({ ok: true, rejstrik: rej });

    if (!g.sablonaTypPlatny(typ))
      return json({ ok: false, chyba: 'Neznámý typ šablony: ' + typ }, 400);
    const platna = g.sablonaPlatna(rej, typ);
    /* `verze` dovoluje sáhnout do historie; bez ní se bere platná. Číslo se
     * ověřuje proti rejstříku — klíče v úložišti si nikdo „nehádá". */
    const chtena = url.searchParams.get('verze') ? +url.searchParams.get('verze') : (platna && platna.verze);
    const zname = [platna, ...(((rej.typy || {})[typ] || {}).historie || [])].filter(Boolean);
    const meta = zname.find(v => v.verze === chtena);
    if (!meta) return json({ ok: false, chyba: 'Šablona „' + typ + '" na serveru není.' }, 404);
    const soubor = await s.cti(g.sablonaKlicSouboru(typ, meta.verze));
    if (!soubor || !soubor.data)
      return json({ ok: false, chyba: 'Soubor šablony „' + typ + '" v úložišti chybí.' }, 404);
    return json({ ok: true, typ, verze: meta.verze, nazev: meta.nazev,
                  otisk: meta.otisk, data: soubor.data });
  }

  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;
  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }
  const rej = (await s.cti('rejstrik')) || g.sablonyNovyRejstrik();

  if (t.akce === 'rezim') {
    const novy = g.sablonyRezimNastav(rej, t.rezim, relace.email, new Date().toISOString());
    if (novy === rej || novy.rezim !== t.rezim)
      return json({ ok: false, chyba: 'Režim musí být „prisny" nebo „mekky".' }, 400);
    await s.zapis('rejstrik', novy);
    return json({ ok: true, rezim: novy.rezim });
  }

  if (t.akce === 'zverejnit' || !t.akce) {
    const data = String(t.data || '');
    if (!g.sablonaTypPlatny(t.typ))
      return json({ ok: false, chyba: 'Neznámý typ šablony.' }, 400);
    if (!g.sablonaJeDocxB64(data))
      return json({ ok: false, chyba: 'Soubor není .docx (Word) — zveřejnit jde jen šablona Wordu.' }, 400);
    if (data.length > g.SABLONA_MAX_B64)
      return json({ ok: false, chyba: 'Šablona je příliš velká (přes ~3,7 MB). Zmenšete v ní fotografie a zkuste to znovu.' }, 413);
    const otisk = g.sablonaOtisk(data);
    const platna = g.sablonaPlatna(rej, t.typ);
    if (platna && platna.otisk === otisk)
      return json({ ok: false, chyba: 'Tahle šablona už je zveřejněná jako platná verze ' + platna.verze + ' – není co zveřejňovat.' }, 400);
    const novy = g.sablonyZverejni(rej, {
      typ: t.typ, nazev: t.nazev, otisk,
      velikost: Math.round(data.length * 3 / 4),
      kdo: relace.email, poznamka: t.poznamka, kdy: new Date().toISOString(),
    });
    if (!novy) return json({ ok: false, chyba: 'Zveřejnění se nepovedlo – chybí název souboru.' }, 400);
    const verze = g.sablonaPlatna(novy, t.typ).verze;
    /* Napřed soubor, pak rejstřík. Kdyby zápis spadl mezi nimi, zůstane
     * v úložišti osiřelý soubor — to nevadí; opačné pořadí by nechalo
     * rejstřík ukazovat na soubor, který neexistuje. */
    await s.zapis(g.sablonaKlicSouboru(t.typ, verze), { nazev: String(t.nazev), data });
    await s.zapis('rejstrik', novy);
    return json({ ok: true, typ: t.typ, verze, otisk });
  }

  return json({ ok: false, chyba: 'Neznámá akce.' }, 400);
};
export const config = { path: '/api/sablony' };
