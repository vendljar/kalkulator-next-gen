/* Správa účtů. GET seznam a POST { akce } — kdo smí co:
 *   'zaloz'     { email, jmeno, titul, funkce, telefon, role, heslo }
 *                                              — nový účet         (jen Administrátor)
 *   'heslo'     { email, heslo }               — reset cizího hesla (jen Administrátor;
 *                rozhodnutí 3. 8. 2026: reset hesla dělá vždy administrátor)
 *   'role'      { email, role }                — změna role        (jen Administrátor)
 *   'aktivni'   { email, aktivni }             — zapnout/vypnout   (jen Administrátor)
 *   'mojeheslo' { stare, nove }                — VLASTNÍ heslo     (každý přihlášený)
 *   'profil'    { jmeno, titul, funkce, telefon [, email] }
 *                                              — údaje pod nabídku (svoje každý,
 *                                                cizí jen Administrátor)
 *   'podpis'    { obrazek [, email] }          — sken podpisu s razítkem (dtto)
 *
 * Proč 'mojeheslo' vyžaduje staré heslo: relace je cookie. Kdyby stačila
 * cookie sama, kdokoli u odemčeného počítače by tiše změnil heslo a účet
 * ukradl. Se starým heslem změnu provede jen ten, kdo ho zná. Administrátorský
 * reset staré heslo nechce z principu — je pro případ, že se zapomnělo.
 *
 * Proč 'profil' a 'podpis' zvládne každý sám (5. 8. 2026, #145): telefon
 * a podpis se propisují do cenové nabídky. Kdyby je směl měnit jen správce,
 * v praxi by se neměnily vůbec — nikdo mu kvůli novému číslu psát nebude
 * a z nabídek by odcházel starý kontakt. Cizí profil ale nikdo přepsat
 * nesmí: s cizím podpisem by šla poslat nabídka jménem kolegy. */
import { uloziste, otiskHesla, hesloSedi, vyzadujRoli, json, ROLE, ADMIN_EMAIL,
         PODPIS_ULOZISTE, podpisZkontroluj } from '../lib/sdilene.mjs';

/* Text z formuláře: ořízne okolní mezery a nepustí dál román. Telefon se
 * jinak NEUPRAVUJE — každý si ho píše po svém („+420 602 590 945",
 * „602590945", klidně i s linkou — a do nabídky patří tak, jak ho zadal. */
const text = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);

export default async (req) => {
  const prihlaseni = await vyzadujRoli(req);            // nejdřív jen: kdo jsi?
  if (prihlaseni.chyba) return prihlaseni.chyba;
  const relace = prihlaseni.relace;
  const u = await uloziste('uzivatele');

  /* --- vlastní heslo: jediná akce dostupná bez role Administrátor --- */
  if (req.method === 'POST') {
    let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

    if (t.akce === 'mojeheslo') {
      const ucet = await u.cti(relace.email);
      if (!ucet) return json({ ok: false, chyba: 'Účet neexistuje.' }, 404);
      if (!hesloSedi(String(t.stare || ''), ucet.heslo))
        return json({ ok: false, chyba: 'Staré heslo nesouhlasí.' }, 401);
      if (!t.nove || String(t.nove).length < 8)
        return json({ ok: false, chyba: 'Nové heslo musí mít aspoň 8 znaků.' }, 400);
      ucet.heslo = otiskHesla(t.nove);
      await u.zapis(relace.email, ucet);
      return json({ ok: true, email: ucet.email });
    }

    /* --- vlastní profil a podpis: svůj každý, cizí jen administrátor ---
     *
     * Chybějící `email` v těle znamená „můj účet". Když ho někdo pošle,
     * musí na cizí účet mít právo — a rozhoduje se podle role z databáze
     * (vyzadujRoli), ne podle cookie. */
    if (t.akce === 'profil' || t.akce === 'podpis') {
      const cil = String(t.email || relace.email).trim().toLowerCase();
      if (cil !== relace.email && relace.role !== 'Administrátor')
        return json({ ok: false, chyba: 'Cizí profil smí měnit jen administrátor.' }, 403);
      const u2 = await uloziste('uzivatele');
      const ucet = await u2.cti(cil);
      if (!ucet) return json({ ok: false, chyba: 'Účet neexistuje.' }, 404);

      if (t.akce === 'profil') {
        /* Jmenovitě vypsaná políčka, žádné kopírování celého těla. Kdyby se
         * do účtu slil přijatý objekt, stačilo by k povýšení poslat vlastní
         * profil s polem `role` — a e-mail (klíč záznamu) by šlo přepsat
         * na cizí. Proto se přebírá jen to, co sem opravdu patří. */
        if ('jmeno' in t) ucet.jmeno = text(t.jmeno);
        if ('titul' in t) ucet.titul = text(t.titul, 40);
        if ('funkce' in t) ucet.funkce = text(t.funkce, 80);
        if ('telefon' in t) ucet.telefon = text(t.telefon, 40);
        await u2.zapis(cil, ucet);
        return json({ ok: true, email: ucet.email, jmeno: ucet.jmeno || '',
          titul: ucet.titul || '', funkce: ucet.funkce || '', telefon: ucet.telefon || '' });
      }

      const kontrola = podpisZkontroluj(t.obrazek);
      if (!kontrola.ok) return json({ ok: false, chyba: kontrola.chyba }, 400);
      const p = await uloziste(PODPIS_ULOZISTE);
      await p.zapis(cil, { obrazek: kontrola.obrazek, zmeneno: new Date().toISOString(),
        zmenil: relace.email });
      return json({ ok: true, email: cil, podpis: kontrola.obrazek ? 'uložen' : 'odebrán' });
    }

    /* --- všechno ostatní jen Administrátor --- */
    if (relace.role !== 'Administrátor')
      return json({ ok: false, chyba: 'K této akci je potřeba role: Administrátor.' }, 403);

    const email = String(t.email || '').trim().toLowerCase();
    if (!email) return json({ ok: false, chyba: 'Chybí e-mail.' }, 400);
    let ucet = await u.cti(email);

    if (t.akce === 'zaloz') {
      if (ucet) return json({ ok: false, chyba: 'Účet už existuje.' }, 400);
      if (!ROLE.includes(t.role)) return json({ ok: false, chyba: 'Neznámá role.' }, 400);
      if (!t.heslo || String(t.heslo).length < 8)
        return json({ ok: false, chyba: 'Heslo musí mít aspoň 8 znaků.' }, 400);
      ucet = { email, jmeno: text(t.jmeno), titul: text(t.titul, 40),
               funkce: text(t.funkce, 80), telefon: text(t.telefon, 40), role: t.role,
               heslo: otiskHesla(t.heslo), zalozen: new Date().toISOString(),
               zalozil: relace.email, aktivni: true };
    } else if (!ucet) {
      return json({ ok: false, chyba: 'Účet neexistuje.' }, 404);
    } else if (t.akce === 'heslo') {
      if (!t.heslo || String(t.heslo).length < 8)
        return json({ ok: false, chyba: 'Heslo musí mít aspoň 8 znaků.' }, 400);
      ucet.heslo = otiskHesla(t.heslo);
    } else if (t.akce === 'role') {
      if (!ROLE.includes(t.role)) return json({ ok: false, chyba: 'Neznámá role.' }, 400);
      if (email === ADMIN_EMAIL && t.role !== 'Administrátor')
        return json({ ok: false, chyba: 'Hlavnímu administrátorovi roli nesnižuj — zamkl by sis dveře.' }, 400);
      ucet.role = t.role;
    } else if (t.akce === 'aktivni') {
      if (email === ADMIN_EMAIL && t.aktivni === false)
        return json({ ok: false, chyba: 'Hlavní administrátorský účet nejde vypnout.' }, 400);
      ucet.aktivni = !!t.aktivni;
    } else {
      return json({ ok: false, chyba: 'Neznámá akce.' }, 400);
    }
    await u.zapis(email, ucet);
    return json({ ok: true, email: ucet.email, role: ucet.role, aktivni: ucet.aktivni !== false });
  }

  if (req.method !== 'GET') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  /* GET seznam — jen Administrátor (seznam kolegů s rolemi je interní údaj) */
  if (relace.role !== 'Administrátor')
    return json({ ok: false, chyba: 'K této akci je potřeba role: Administrátor.' }, 403);
  const klice = await u.seznam();
  const out = [];
  for (const k of klice) {
    const x = await u.cti(k);
    /* Políčka se vypisují jmenovitě: záznam nese i scrypt otisk hesla
     * a rozesílat ho do prohlížeče nemá důvod. Podpis tu schází schválně —
     * je to pár set kilobajtů na účet a seznam se načítá při každém otevření
     * správy účtů; kdo ho chce vidět, otevře profil konkrétního kolegy. */
    /* `hlavni` posílá server (#95, 9. 8. 2026). Do té doby si prohlížeč
     * porovnával e-mail s adresou napsanou v `online_ui.js` — takže adresa
     * hlavního administrátora byla ve zdrojácích dvakrát a při změně na
     * serveru by se aplikace začala chovat jinak než server. */
    if (x) out.push({ email: x.email, jmeno: x.jmeno, titul: x.titul || '',
      funkce: x.funkce || '', telefon: x.telefon || '',
      role: x.role, aktivni: x.aktivni !== false, hlavni: x.email === ADMIN_EMAIL });
  }
  return json({ ok: true, uzivatele: out });
};
export const config = { path: '/api/uzivatele' };
