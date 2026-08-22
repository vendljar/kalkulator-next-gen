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
  let ULO, SCHV;
  try { ({ ULO, SCHV } = await jadro()); } catch (e) { return jadroChyba(e); }

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
  /* DELETE /api/zakazky?soubor=X — SMAZÁNÍ ZAKÁZKY (21. 8. 2026, zadání J. V.
   * „přidej možnost hromadného vybírání a mazání pro administrátora").
   *
   * Do té doby se online zakázky nemazaly vůbec — schválně, protože smazaná
   * kalkulace je pryč i s historií cen. Teď to jde, ale jen ADMINISTRÁTOROVI
   * a s dvěma pojistkami:
   *   1) hromadné mazání dělá klient po jedné zakázce, takže když jedna
   *      selže, ostatní se tím nezruší a je vidět která;
   *   2) zakázka s UZAMČENOU (odeslanou) nabídkou se smaže jen s výslovným
   *      `ismazatOdeslane=1` — vytištěná nabídka je doklad, ne pracovní
   *      soubor, a smazat ji musí být vědomé rozhodnutí, ne přehlédnutí.
   * Rejstřík se opravuje ve stejném kroku, aby v seznamu nezůstal sirotek. */
  if (req.method === 'DELETE') {
    if (relace.role !== 'Administrátor')
      return json({ ok: false, chyba: 'Mazat zakázky smí jen administrátor.' }, 403);
    const soubor = url.searchParams.get('soubor');
    if (!soubor) return json({ ok: false, chyba: 'Chybí jméno zakázky.' }, 400);
    const zak = await s.cti('z/' + soubor);
    if (zak) {
      const zamcenych = (zak.varianty || [])
        .filter(v => globalThis.variantaUzamcena && globalThis.variantaUzamcena(v)).length;
      if (zamcenych && url.searchParams.get('ismazatOdeslane') !== '1')
        return json({ ok: false, zamcenych,
          chyba: 'Zakázka obsahuje ' + zamcenych + ' odeslanou (uzamčenou) nabídku. '
            + 'Smazání je potřeba potvrdit zvlášť.' }, 409);
      await s.smaz('z/' + soubor);
    }
    const rej = (await s.cti('_rejstrik')) || { schema: 1, zakazky: [] };
    const zbytek = ULO.uloRejstrikOdeber(Array.isArray(rej.zakazky) ? rej.zakazky : [], soubor);
    await s.zapis('_rejstrik', { schema: 1, zakazky: ULO.uloRejstrikSerad(zbytek),
                                 kdo: relace.email, upraveno: new Date().toISOString() });
    return json({ ok: true, soubor, existovala: !!zak });
  }

  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET, POST nebo DELETE.' }, 405);

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

  /* Tvar identifikátorů (bezpečnostní audit 22. 8. 2026, nález B1). Id variant,
   * poznámek a příloh jdou v obrazovce do onclick; obrazovka je od 22. 8.
   * escapuje, ale server navíc nepustí dovnitř nic, co není písmeno, číslice,
   * tečka, podtržítko nebo pomlčka. Dvě vrstvy — kdyby jedna selhala. */
  const spatnaId = ULO.uloIdProblemy(zak);
  if (spatnaId.length)
    return json({ ok: false, chyba: 'Zakázka nese identifikátor v nepovoleném tvaru ('
      + spatnaId.map(x => x.kde).join(', ') + '). Povolená jsou písmena, číslice, tečka, '
      + 'podtržítko a pomlčka.' }, 400);

  /* vytištěná (odeslaná) nabídka se nikdy nepřepíše. Dvě vrstvy:
   * 1) TÁŽ kontrola jako u složky (uloKontrolaZamku) — zámek nesmí zmizet
   *    ani se změnit; žádná druhá pravda o zámcích.
   * 2) Serverová pojistka navíc: u zamčené varianty se nesmí změnit ANI DATA.
   *    V aplikaci to hlídá obrazovka, ale server mluví s kýmkoli — upravený
   *    klient by jinak mohl přepsat obsah odeslané nabídky a zámek si nechat. */
  const stara = await s.cti('z/' + jmeno);
  if (stara) {
    /* Odemčení odeslané nabídky smí jen administrátor (audit 22. 8. 2026, B3).
     * uloKontrolaZamku bere zmizení zámku jako řádné, když přibyl záznam
     * v odemceni[] — ale KDO ho přidal, do té doby nikdo na serveru neověřil.
     * Teď: přibylo-li odemčení, vyžaduje se role Administrátor a razítko
     * kdo/kdy se přepíše z relace, ne z toho, co poslal klient. */
    const odemcene = ULO.uloOdemceniPribylo(stara, zak);
    if (odemcene.length) {
      if (relace.role !== 'Administrátor')
        return json({ ok: false, chyba: 'Odemknout odeslanou (uzamčenou) nabídku smí jen '
          + 'administrátor. Pokračujte klonem varianty.' }, 403);
      for (const v of odemcene) {
        const posledni = v.odemceni[v.odemceni.length - 1];
        if (posledni && typeof posledni === 'object') {
          posledni.kdo = relace.jmeno ? relace.jmeno + ' <' + relace.email + '>' : relace.email;
          posledni.kdy = new Date().toISOString();
        }
      }
    }
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

  /* Rozhodnutí o slevě (bezpečnostní audit 22. 8. 2026, nález B2). Stav
   * „schváleno" / „zamítnuto" a jméno schvalovatele se do té doby přebíraly
   * z prohlížeče. Teď je hlídá SCHV.schvalovaniServerKontrola proti stropům
   * z programu (program/db.slevy) a roli z relace; razítka píše server. */
  const prog = await (await uloziste('program')).cti('db');
  const slevyNast = (prog && prog.platny && prog.platny.slevy) || {};
  const rozhodnuti = SCHV.schvalovaniServerKontrola(stara, zak, relace, slevyNast);
  if (!rozhodnuti.ok) return json({ ok: false, chyba: 'Neuloženo: ' + rozhodnuti.chyba }, 403);

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
  /* Jméno obchodníka do rejstříku (21. 8. 2026, zadání J. V.). Bere se
   * z RELACE, ne od klienta — jméno v seznamu je stejné razítko jako autor
   * a nesmí jít podvrhnout. Zapisuje se při každém uložení, aby se
   * v seznamu projevila i změna jména v profilu. */
  if (zak.autor === relace.email && relace.jmeno) zak.autorJmeno = relace.jmeno;

  const razitko = ULO.uloRazitkoNove();
  zak.uloRazitko = razitko;
  await s.zapis('z/' + jmeno, zak);
  const rejstrik = (await s.cti('_rejstrik')) || { schema: 1, zakazky: [] };
  /* Doplnění jmen obchodníků u STARŠÍCH záznamů (21. 8. 2026 večer).
   *
   * První verze uměla doplnit jen jméno právě přihlášeného, takže seznam
   * ukazoval u cizích zakázek e-mail, dokud si je jejich autor sám neuložil
   * (hlášeno J. V.: „obchodník měl být uveden jménem, ne e-mailem").
   * Teď se u chybějících jmen jednou přečtou účty a doplní se všechna.
   *
   * Je to bezpečně omezené: čte se JEN tehdy, když nějaké jméno chybí,
   * a po prvním takovém uložení už rejstřík jména má, takže se to
   * neopakuje. Účtů jsou jednotky. Nikdy se nic nevymýšlí — účet bez
   * vyplněného jména zůstane v seznamu e-mailem. */
  let stavajici = (Array.isArray(rejstrik.zakazky) ? rejstrik.zakazky : []).map(z => {
    if (z && !z.autorJmeno && relace.jmeno
        && String(z.autor || '').toLowerCase() === String(relace.email).toLowerCase())
      return { ...z, autorJmeno: relace.jmeno };
    return z;
  });
  if (stavajici.some(z => z && z.autor && !z.autorJmeno)) {
    try {
      const u = await uloziste('uzivatele');
      const mapa = {};
      for (const k of await u.seznam()) {
        const ucet = await u.cti(k);
        if (ucet && ucet.email && ucet.jmeno)
          mapa[String(ucet.email).toLowerCase()] = String(ucet.jmeno);
      }
      stavajici = stavajici.map(z => (z && !z.autorJmeno && mapa[String(z.autor || '').toLowerCase()])
        ? { ...z, autorJmeno: mapa[String(z.autor).toLowerCase()] } : z);
    } catch (e) { /* jména jsou pohodlí, ne podmínka uložení zakázky */ }
  }
  const novy = ULO.uloRejstrikSloucit(stavajici,
    ULO.uloRejstrikZaznam(zak, { soubor: jmeno, razitko }));
  await s.zapis('_rejstrik', { schema: 1, zakazky: ULO.uloRejstrikSerad(novy), kdo: relace.email,
                               upraveno: new Date().toISOString() });
  return json({ ok: true, soubor: jmeno, razitko });
};
export const config = { path: '/api/zakazky' };
